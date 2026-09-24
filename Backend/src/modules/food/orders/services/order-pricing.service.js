import mongoose from 'mongoose';
import { FoodOrder } from '../models/order.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodFeeSettings } from '../../admin/models/feeSettings.model.js';
import { FoodOffer } from '../../admin/models/offer.model.js';
import { FoodOfferUsage } from '../../admin/models/offerUsage.model.js';
import { ValidationError } from '../../../../core/auth/errors.js';

export async function calculateOrderPricing(userId, dto) {
  const restaurant = await FoodRestaurant.findById(dto.restaurantId)
    .select("status zoneId")
    .lean();
  if (!restaurant) throw new ValidationError("Restaurant not found");
  if (restaurant.status !== "approved")
    throw new ValidationError("Restaurant not available");

  const items = Array.isArray(dto.items) ? dto.items : [];
  const subtotal = items.reduce(
    (sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1),
    0,
  );

  const feeDoc = await FoodFeeSettings.findOne({ isActive: true })
    .sort({ createdAt: -1 })
    .lean();
  const feeSettings = feeDoc || {
    deliveryFee: 25,
    deliveryFeeRanges: [],
    freeDeliveryThreshold: 149,
    platformFee: 5,
    gstRate: 5,
  };

  const packagingFee = 0;
  const platformFee = Number(feeSettings.platformFee || 0);

  const freeThreshold = Number(feeSettings.freeDeliveryThreshold || 0);
  let deliveryFee = 0;

  const enableRangeFee = feeSettings.enableRangeFee !== false;
  const enableZoneFees = feeSettings.enableZoneFees !== false;
  const enablePerKmFee = feeSettings.enablePerKmFee !== false;
  const enableDefaultFee = feeSettings.enableDefaultFee !== false;
  const enableDistanceBasedFee = feeSettings.enableDistanceBasedFee === true;

  if (
    Number.isFinite(freeThreshold) &&
    freeThreshold > 0 &&
    subtotal >= freeThreshold
  ) {
    deliveryFee = 0;
  } else {
    const restZoneIdStr = restaurant.zoneId ? String(restaurant.zoneId) : null;

    // 1) Try Range-Based Fee if Range Fee feature is enabled
    let rangeMatchedFee = null;
    if (enableRangeFee) {
      const allRanges = Array.isArray(feeSettings.deliveryFeeRanges) ? [...feeSettings.deliveryFeeRanges] : [];
      const zoneSpecificRanges = (enableZoneFees && restZoneIdStr)
        ? allRanges.filter(r => r.zoneId && String(r.zoneId) === restZoneIdStr)
        : [];
      const globalRanges = allRanges.filter(r => !r.zoneId);

      const activeRanges = zoneSpecificRanges.length > 0 ? zoneSpecificRanges : globalRanges;

      if (activeRanges.length > 0) {
        activeRanges.sort((a, b) => Number(a.min) - Number(b.min));
        for (let i = 0; i < activeRanges.length; i += 1) {
          const r = activeRanges[i] || {};
          const min = Number(r.min);
          const max = Number(r.max);
          const fee = Number(r.fee);
          if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(fee)) continue;
          const isLast = i === activeRanges.length - 1;
          const inRange = isLast ? (subtotal >= min && subtotal <= max) : (subtotal >= min && subtotal < max);
          if (inRange) {
            rangeMatchedFee = fee;
            break;
          }
        }
      }
    }

    if (rangeMatchedFee !== null) {
      deliveryFee = rangeMatchedFee;
    } else if (enableDistanceBasedFee) {
      // 2) Distance-based calculation (if enabled)
      const baseDistFee = Number(feeSettings.baseDistanceFee || 0);
      deliveryFee = baseDistFee;
    } else {
      // 3) Zone Override / Per KM / Default Fallback
      const zoneSpecificSetting = (enableZoneFees && restZoneIdStr && Array.isArray(feeSettings.zoneDeliveryFees))
        ? feeSettings.zoneDeliveryFees.find(z => z.zoneId && String(z.zoneId) === restZoneIdStr)
        : null;

      if (enablePerKmFee && zoneSpecificSetting?.perKmDeliveryFee !== undefined && zoneSpecificSetting?.perKmDeliveryFee !== '') {
        deliveryFee = Number(zoneSpecificSetting.perKmDeliveryFee);
      } else if (enablePerKmFee && feeSettings.perKmDeliveryFee !== undefined && feeSettings.perKmDeliveryFee !== '') {
        deliveryFee = Number(feeSettings.perKmDeliveryFee);
      } else if (enableZoneFees && zoneSpecificSetting?.deliveryFee !== undefined && zoneSpecificSetting?.deliveryFee !== '') {
        deliveryFee = Number(zoneSpecificSetting.deliveryFee);
      } else if (enableDefaultFee) {
        deliveryFee = Number(feeSettings.deliveryFee || 0);
      } else {
        deliveryFee = 0;
      }
    }
  }

  const gstRate = Number(feeSettings.gstRate || 0);
  const tax =
    Number.isFinite(gstRate) && gstRate > 0
      ? Math.round(subtotal * (gstRate / 100))
      : 0;

  let discount = 0;
  let appliedCoupon = null;
  const codeRaw = dto.couponCode
    ? String(dto.couponCode).trim().toUpperCase()
    : "";

  if (codeRaw) {
    const now = new Date();
    const offer = await FoodOffer.findOne({ couponCode: codeRaw }).lean();
    if (offer) {
      const statusOk = offer.status === "active";
      const startOk = !offer.startDate || now >= new Date(offer.startDate);
      const endOk = !offer.endDate || now < new Date(offer.endDate);
      const scopeOk =
        offer.restaurantScope !== "selected" ||
        String(offer.restaurantId || "") === String(dto.restaurantId || "");
      const minOk = subtotal >= (Number(offer.minOrderValue) || 0);
      let usageOk = true;
      if (
        Number(offer.usageLimit) > 0 &&
        Number(offer.usedCount || 0) >= Number(offer.usageLimit)
      ) {
        usageOk = false;
      }

      let perUserOk = true;
      if (userId && Number(offer.perUserLimit) > 0) {
        const usage = await FoodOfferUsage.findOne({
          offerId: offer._id,
          userId: new mongoose.Types.ObjectId(userId),
        }).lean();
        if (usage && Number(usage.count) >= Number(offer.perUserLimit)) {
          perUserOk = false;
        }
      }

      let firstOrderOk = true;
      if (userId && offer.customerScope === "first-time") {
        const c = await FoodOrder.countDocuments({
          userId: new mongoose.Types.ObjectId(userId),
        });
        firstOrderOk = c === 0;
      }
      if (userId && offer.isFirstOrderOnly === true) {
        const c2 = await FoodOrder.countDocuments({
          userId: new mongoose.Types.ObjectId(userId),
        });
        if (c2 > 0) firstOrderOk = false;
      }

      const allowed =
        statusOk &&
        startOk &&
        endOk &&
        scopeOk &&
        minOk &&
        usageOk &&
        perUserOk &&
        firstOrderOk;

      if (allowed) {
        if (offer.discountType === "percentage") {
          const raw = subtotal * (Number(offer.discountValue) / 100);
          const capped = Number(offer.maxDiscount)
            ? Math.min(raw, Number(offer.maxDiscount))
            : raw;
          discount = Math.max(0, Math.min(subtotal, Math.floor(capped)));
        } else {
          discount = Math.max(
            0,
            Math.min(subtotal, Math.floor(Number(offer.discountValue) || 0)),
          );
        }
        const discountBearer = offer.restaurantId ? 'restaurant' : 'admin';
        appliedCoupon = { code: codeRaw, discount, discountBearer };
      } else if (codeRaw) {
        if (!perUserOk) throw new ValidationError("You have already used this coupon maximum allowed times.");
        if (!usageOk) throw new ValidationError("This coupon usage limit has been reached.");
        if (!firstOrderOk) throw new ValidationError("This coupon is only valid for first-time users.");
        if (!minOk) throw new ValidationError(`Minimum order value of ₹${offer.minOrderValue} required for this coupon.`);
        if (!statusOk || !startOk || !endOk) throw new ValidationError("This coupon code has expired or is inactive.");
      }
    }
  }

  const total = Math.max(
    0,
    subtotal + packagingFee + deliveryFee + platformFee + tax - discount,
  );

  return {
    pricing: {
      subtotal,
      tax,
      packagingFee,
      deliveryFee,
      platformFee,
      discount,
      discountBearer: appliedCoupon?.discountBearer || 'admin',
      total,
      currency: "INR",
      couponCode: appliedCoupon?.code || codeRaw || null,
      appliedCoupon,
    },
  };
}
