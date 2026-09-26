import mongoose from 'mongoose';
import { FoodOrder } from '../models/order.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodFeeSettings } from '../../admin/models/feeSettings.model.js';
import { FoodOffer } from '../../admin/models/offer.model.js';
import { FoodOfferUsage } from '../../admin/models/offerUsage.model.js';
import { ValidationError } from '../../../../core/auth/errors.js';

export function computeDeliveryFee({ feeSettings, subtotal, restaurantZoneId, distanceKm = 0 }) {
  if (!feeSettings) return 0;
  const freeThreshold = Number(feeSettings.freeDeliveryThreshold || 0);

  // 0) Free delivery threshold check
  if (Number.isFinite(freeThreshold) && freeThreshold > 0 && subtotal >= freeThreshold) {
    return 0;
  }

  const enableRangeFee = feeSettings.enableRangeFee !== false;
  const enableZoneFees = feeSettings.enableZoneFees !== false;
  const enablePerKmFee = feeSettings.enablePerKmFee !== false;
  const enableDefaultFee = feeSettings.enableDefaultFee !== false;
  const enableDistanceBasedFee = feeSettings.enableDistanceBasedFee === true;

  const restZoneIdStr = restaurantZoneId ? String(restaurantZoneId._id || restaurantZoneId) : null;
  const allRanges = Array.isArray(feeSettings.deliveryFeeRanges) ? feeSettings.deliveryFeeRanges : [];
  const zoneDeliveryFees = Array.isArray(feeSettings.zoneDeliveryFees) ? feeSettings.zoneDeliveryFees : [];

  // ── TEMP DEBUG ──────────────────────────────────────────────────────────────
  console.log('[FEE DEBUG] restaurantZoneId raw:', restaurantZoneId);
  console.log('[FEE DEBUG] restZoneIdStr:', restZoneIdStr);
  console.log('[FEE DEBUG] enableZoneFees:', enableZoneFees);
  console.log('[FEE DEBUG] enablePerKmFee:', enablePerKmFee);
  console.log('[FEE DEBUG] enableRangeFee:', enableRangeFee);
  console.log('[FEE DEBUG] distanceKm:', distanceKm);
  console.log('[FEE DEBUG] zoneDeliveryFees count:', zoneDeliveryFees.length);
  console.log('[FEE DEBUG] zoneDeliveryFees:', JSON.stringify(zoneDeliveryFees));
  // ────────────────────────────────────────────────────────────────────────────


  // Priority 1: Zone-Specific Order Value Range Fee
  if (enableRangeFee && enableZoneFees && restZoneIdStr) {
    const zoneSpecificRanges = allRanges.filter(
      (r) => r.zoneId && String(r.zoneId._id || r.zoneId) === restZoneIdStr
    );
    if (zoneSpecificRanges.length > 0) {
      zoneSpecificRanges.sort((a, b) => Number(a.min) - Number(b.min));
      for (let i = 0; i < zoneSpecificRanges.length; i += 1) {
        const r = zoneSpecificRanges[i] || {};
        const min = Number(r.min);
        const max = Number(r.max);
        const fee = Number(r.fee);
        if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(fee)) continue;
        const isLast = i === zoneSpecificRanges.length - 1;
        const inRange = isLast ? (subtotal >= min && subtotal <= max) : (subtotal >= min && subtotal < max);
        if (inRange) {
          return fee;
        }
      }
    }
  }

  // Priority 2: Zone-Specific Fee Override (Default Fee / Per KM Fee)
  if (enableZoneFees) {
    const zoneSetting = restZoneIdStr
      ? zoneDeliveryFees.find(
          (z) => z.zoneId && String(z.zoneId._id || z.zoneId) === restZoneIdStr
        )
      : null;

    if (zoneSetting) {
      const zonePerKm =
        zoneSetting.perKmDeliveryFee !== undefined &&
        zoneSetting.perKmDeliveryFee !== null &&
        zoneSetting.perKmDeliveryFee !== ""
          ? Number(zoneSetting.perKmDeliveryFee)
          : null;
      const zoneDefault =
        zoneSetting.deliveryFee !== undefined &&
        zoneSetting.deliveryFee !== null &&
        zoneSetting.deliveryFee !== ""
          ? Number(zoneSetting.deliveryFee)
          : null;

      let zoneFeeToUse = null;

      if (enablePerKmFee && zonePerKm !== null && Number.isFinite(zonePerKm)) {
        // Base (minimum) fee = zoneDefault (1st km flat charge)
        // Additional km beyond 1st km → each km × perKmRate
        // Formula: fee = baseDefault + max(0, (distance - 1)) × perKmRate
        // If no distance available → just use base default fee
        const base = zoneDefault !== null && Number.isFinite(zoneDefault) ? zoneDefault : 0;
        if (distanceKm > 0) {
          const additionalKm = Math.max(0, distanceKm - 1);
          const additionalFee = Math.round(additionalKm * zonePerKm);
          zoneFeeToUse = base + additionalFee;
        } else {
          // No distance info — use base fee as minimum
          zoneFeeToUse = base > 0 ? base : zonePerKm;
        }
      } else if (zoneDefault !== null && Number.isFinite(zoneDefault)) {
        zoneFeeToUse = zoneDefault;
      }

      if (zoneFeeToUse !== null && Number.isFinite(zoneFeeToUse)) {
        return zoneFeeToUse;
      }
    }

    // When Zone-Wise Delivery Fee is enabled, if a zone does not have a fee configured in admin, return 0.
    return 0;
  }

  // Priority 3: Global Range-Based Fee (where zoneId is null/undefined)
  if (enableRangeFee) {
    const globalRanges = allRanges.filter(
      (r) => !r.zoneId || String(r.zoneId).trim() === "" || String(r.zoneId) === "null"
    );
    if (globalRanges.length > 0) {
      globalRanges.sort((a, b) => Number(a.min) - Number(b.min));
      for (let i = 0; i < globalRanges.length; i += 1) {
        const r = globalRanges[i] || {};
        const min = Number(r.min);
        const max = Number(r.max);
        const fee = Number(r.fee);
        if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(fee)) continue;
        const isLast = i === globalRanges.length - 1;
        const inRange = isLast ? (subtotal >= min && subtotal <= max) : (subtotal >= min && subtotal < max);
        if (inRange) {
          return fee;
        }
      }
    }
  }

  // Priority 4: Distance-Based Fee (Advance Setting)
  if (enableDistanceBasedFee) {
    const baseDistFee = Number(feeSettings.baseDistanceFee || 0);
    const baseDistKm = Number(feeSettings.baseDistanceKm || 1);
    const extraFeePerKm = Number(feeSettings.extraFeePerKm || 0);
    if (distanceKm > baseDistKm && extraFeePerKm > 0) {
      // Use Math.round for fair distance calculation (not aggressive Math.ceil)
      const extraFee = Math.round((distanceKm - baseDistKm) * extraFeePerKm);
      return baseDistFee + extraFee;
    }
    return baseDistFee;
  }

  // Priority 5: Global 1 KM / Per KM Fee
  // Formula: fee = baseDefaultFee + max(0, (distance - 1)) × perKmRate
  // The "Default Fee" acts as the 1st-km minimum flat charge.
  // For every additional km beyond 1 km, perKmRate is added.
  if (
    enablePerKmFee &&
    feeSettings.perKmDeliveryFee !== undefined &&
    feeSettings.perKmDeliveryFee !== null &&
    feeSettings.perKmDeliveryFee !== ""
  ) {
    const globalPerKm = Number(feeSettings.perKmDeliveryFee);
    if (Number.isFinite(globalPerKm)) {
      const baseFee = Number(feeSettings.deliveryFee);
      const base = Number.isFinite(baseFee) && baseFee > 0 ? baseFee : 0;
      if (distanceKm > 0) {
        const additionalKm = Math.max(0, distanceKm - 1);
        const additionalFee = Math.round(additionalKm * globalPerKm);
        return base + additionalFee;
      }
      // No distance → charge base fee or perKm rate as minimum
      return base > 0 ? base : globalPerKm;
    }
  }

  // Priority 6: Global Default Fee
  if (
    enableDefaultFee &&
    feeSettings.deliveryFee !== undefined &&
    feeSettings.deliveryFee !== null &&
    feeSettings.deliveryFee !== ""
  ) {
    const defFee = Number(feeSettings.deliveryFee);
    if (Number.isFinite(defFee)) return defFee;
  }

  return 0;
}

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

  const deliveryFee = computeDeliveryFee({
    feeSettings,
    subtotal,
    restaurantZoneId: restaurant.zoneId,
    distanceKm: Number(dto.distanceKm || 0),
  });

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
