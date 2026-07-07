// Order Service - Backend Logic
import mongoose from 'mongoose';
import { FoodOrder, FoodSettings } from '../models/order.model.js';
import { FoodItem } from '../../admin/models/food.model.js';
import { FoodAddon } from '../../restaurant/models/foodAddon.model.js';
// import { paymentSnapshotFromOrder } from './foodOrderPayment.service.js';
import { logger } from '../../../../utils/logger.js';
import { FoodUser } from '../../../../core/users/user.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';

import { FoodDeliveryPartner } from '../../delivery/models/deliveryPartner.model.js';
import { FoodZone } from '../../admin/models/zone.model.js';
import { FoodFeeSettings } from '../../admin/models/feeSettings.model.js';
import { ValidationError, ForbiddenError, NotFoundError } from '../../../../core/auth/errors.js';
import { buildPaginationOptions, buildPaginatedResult } from '../../../../utils/helpers.js';
import { FoodOffer } from '../../admin/models/offer.model.js';
import { FoodOfferUsage } from '../../admin/models/offerUsage.model.js';
import { FoodDeliveryCommissionRule } from '../../admin/models/deliveryCommissionRule.model.js';
import { FoodRestaurantCommission } from '../../admin/models/restaurantCommission.model.js';
import {
  sendNotificationToOwner,
  sendNotificationToOwners,
} from "../../../../core/notifications/firebase.service.js";
import { FoodTransaction } from '../models/foodTransaction.model.js';
import { FoodSupportTicket } from '../../user/models/supportTicket.model.js';
import { Seller } from '../../../quick-commerce/seller/models/seller.model.js';
import { SellerOrder } from '../../../quick-commerce/seller/models/sellerOrder.model.js';
import {
  createRazorpayOrder,
  createPaymentLink,
  verifyPaymentSignature,
  getRazorpayKeyId,
  isRazorpayConfigured,
  fetchRazorpayPaymentLink,
  initiateRazorpayRefund
} from '../helpers/razorpay.helper.js';
import { getIO, rooms } from '../../../../config/socket.js';
import { addOrderJob } from '../../../../queues/producers/order.producer.js';
import { fetchPolyline } from '../utils/googleMaps.js';
import { getFirebaseDB } from '../../../../config/firebase.js';
import * as foodTransactionService from './foodTransaction.service.js';
import { isStatusAdvance } from './order.helpers.js';

const ORDER_ID_PREFIX = "FOD-";
const ORDER_ID_LENGTH = 6;
const USER_CANCEL_FULL_REFUND_WINDOW_MS = 30 * 1000;
const USER_CANCEL_EDIT_WINDOW_MS = 60 * 1000;

/**
 * Fire-and-forget BullMQ enqueue for order lifecycle events.
 * Never blocks API response; failures are logged only.
 */
function enqueueOrderEvent(action, payload = {}) {
  try {
    void addOrderJob({ action, ...payload }).catch((err) => {
      logger.warn(`BullMQ enqueue order event failed: ${action} - ${err?.message || err}`);
    });
  } catch (err) {
    logger.warn(`BullMQ enqueue order event failed (sync): ${action} - ${err?.message || err}`);
  }
}

function generateFourDigitDeliveryOtp() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/** Remove secret fields before returning order JSON to delivery partner / restaurant. */
function sanitizeOrderForExternal(orderDoc) {
  const o = orderDoc?.toObject ? orderDoc.toObject() : { ...(orderDoc || {}) };
  delete o.deliveryOtp;
  const dv = o.deliveryVerification;
  if (dv && dv.dropOtp != null) {
    const d = dv.dropOtp;
    o.deliveryVerification = {
      ...dv,
      dropOtp: {
        required: Boolean(d.required),
        verified: Boolean(d.verified),
      },
    };
  }
  return o;
}

function emitDeliveryDropOtpToUser(order, plainOtp) {
  try {
    const io = getIO();
    if (!io || !plainOtp || !order?.userId) return;
    io.to(rooms.user(order.userId)).emit("delivery_drop_otp", {
      orderMongoId: order._id?.toString?.(),
      orderId: order.orderId,
      otp: plainOtp,
      message:
        "Share this OTP with your delivery partner to hand over the order.",
    });
  } catch (e) {
    logger.warn(`emitDeliveryDropOtpToUser failed: ${e?.message || e}`);
  }
}

async function notifyOwnersSafely(targets, payload) {
  try {
    await sendNotificationToOwners(targets, payload);
  } catch (error) {
    logger.warn(`FCM notification failed: ${error?.message || error}`);
  }
}

async function notifyOwnerSafely(target, payload) {
  try {
    await sendNotificationToOwner({ ...target, payload });
  } catch (error) {
    logger.warn(`FCM notification failed: ${error?.message || error}`);
  }
}

function buildOrderIdentityFilter(orderIdOrMongoId) {
  const raw = String(orderIdOrMongoId || "").trim();
  if (!raw) return null;
  if (mongoose.isValidObjectId(raw))
    return { _id: new mongoose.Types.ObjectId(raw) };
  return { orderId: raw };
}

function generateOrderId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < ORDER_ID_LENGTH; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return ORDER_ID_PREFIX + s;
}

async function ensureUniqueOrderId() {
  let orderId;
  let exists = true;
  let attempts = 0;
  while (exists && attempts < 10) {
    orderId = generateOrderId();
    const found = await FoodOrder.exists({ orderId });
    exists = !!found;
    attempts++;
  }
  if (exists) throw new ValidationError("Could not generate unique order id");
  return orderId;
}

function normalizeDeliveryAddress(address) {
  if (!address || typeof address !== "object") return undefined;

  const street =
    String(address.street || "").trim() ||
    String(address.address || "").trim() ||
    String(address.formattedAddress || "").trim();
  const city =
    String(address.city || "").trim() ||
    String(address.area || "").trim();
  const state =
    String(address.state || "").trim() ||
    city;

  return {
    label: address.label || "Home",
    street,
    additionalDetails:
      String(address.additionalDetails || "").trim() ||
      String(address.area || "").trim(),
    city,
    state,
    zipCode: String(address.zipCode || address.postalCode || "").trim(),
    phone: String(address.phone || "").trim(),
    location: address.location?.coordinates
      ? { type: "Point", coordinates: address.location.coordinates }
      : undefined,
  };
}

function toGeoPoint(lat, lng) {
  if (lat == null || lng == null) return undefined;
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  return { type: "Point", coordinates: [b, a] };
}

function getItemType(item, fallbackOrderType = "food") {
  if (item?.type === "quick" || item?.orderType === "quick") return "quick";
  if (item?.type === "food" || item?.orderType === "food") return "food";
  return fallbackOrderType === "quick" ? "quick" : "food";
}

function buildSourceIdForItem(item, itemType) {
  if (item?.sourceId) return String(item.sourceId);
  if (itemType === "quick") {
    return String(
      item?.quickStoreId ||
      item?.storeId ||
      item?.sellerId ||
      item?.restaurantId ||
      "quick-commerce",
    );
  }
  return String(item?.restaurantId || item?.sourceRestaurantId || "");
}

function normalizeOrderItems(items = [], fallbackOrderType = "food") {
  return (Array.isArray(items) ? items : []).map((item) => {
    const itemType = getItemType(item, fallbackOrderType);
    const sourceId = buildSourceIdForItem(item, itemType);
    return {
      ...item,
      type: itemType,
      sourceId,
      sourceName:
        item?.sourceName ||
        (itemType === "quick"
          ? item?.quickStoreName || item?.storeName || item?.sellerName || ""
          : item?.restaurant || item?.restaurantName || ""),
    };
  });
}

async function syncItemsWithDatabase(items = []) {
  const foodItemIds = items
    .filter((item) => item.type === "food")
    .map((item) => item.itemId || item.id)
    .filter((id) => mongoose.Types.ObjectId.isValid(id));

  if (foodItemIds.length === 0) return items;

  const dbItems = await FoodItem.find({
    _id: { $in: foodItemIds },
    approvalStatus: 'approved'
  }).lean();

  const dbItemsMap = new Map(dbItems.map(item => [String(item._id), item]));

  const missingIds = foodItemIds.filter(id => !dbItemsMap.has(String(id)));
  
  if (missingIds.length > 0) {
    const dbAddons = await FoodAddon.find({
      _id: { $in: missingIds },
      approvalStatus: 'approved',
      isDeleted: { $ne: true }
    }).lean();
    
    for (const addon of dbAddons) {
      if (addon.published) {
        dbItemsMap.set(String(addon._id), {
          _id: addon._id,
          name: addon.published.name,
          image: addon.published.image,
          foodType: addon.published.isVeg !== false ? 'Veg' : 'Non-Veg',
          isAvailable: addon.isAvailable,
          price: addon.published.price,
          variants: []
        });
      }
    }
  }

  for (const item of items) {
    if (item.type !== "food") continue;
    const itemIdStr = String(item.itemId || item.id);
    const dbItem = dbItemsMap.get(itemIdStr);

    if (dbItem) {
      item.name = dbItem.name;
      item.image = dbItem.image || item.image || '';
      item.isVeg = dbItem.foodType === 'Veg';
      item.isAvailable = dbItem.isAvailable !== false;

      if (item.variantId && mongoose.Types.ObjectId.isValid(item.variantId)) {
        const variantIdStr = String(item.variantId);
        const dbVariant = dbItem.variants?.find(v => String(v._id) === variantIdStr);
        if (dbVariant) {
          item.variantName = dbVariant.name;
          item.variantPrice = dbVariant.price;
          item.price = dbVariant.price;
        } else {
          item.variantPrice = dbItem.price;
          item.price = dbItem.price;
        }
      } else {
        item.price = dbItem.price;
        if (item.variantPrice) {
          item.variantPrice = dbItem.price;
        }
      }
    } else {
      item.isAvailable = false;
    }
  }
  return items;
}

function getPointLatLng(locationLike) {
  const coords = locationLike?.coordinates;
  if (!Array.isArray(coords) || coords.length !== 2) return null;
  const [lng, lat] = coords;
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
  return { lat: Number(lat), lng: Number(lng) };
}

function angleBetweenPickupVectors(userPoint, firstPoint, secondPoint) {
  if (!userPoint || !firstPoint || !secondPoint) return null;
  const v1x = Number(firstPoint.lng) - Number(userPoint.lng);
  const v1y = Number(firstPoint.lat) - Number(userPoint.lat);
  const v2x = Number(secondPoint.lng) - Number(userPoint.lng);
  const v2y = Number(secondPoint.lat) - Number(userPoint.lat);
  const mag1 = Math.hypot(v1x, v1y);
  const mag2 = Math.hypot(v2x, v2y);
  if (mag1 === 0 || mag2 === 0) return 0;
  const cosine = Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y) / (mag1 * mag2)));
  return Math.acos(cosine) * (180 / Math.PI);
}

async function fetchPickupSourcesByType(items = []) {
  const foodSourceIds = [...new Set(items.filter((item) => item.type === "food").map((item) => item.sourceId).filter(Boolean))];
  const quickSourceIds = [...new Set(items.filter((item) => item.type === "quick").map((item) => item.sourceId).filter(Boolean))];

  const [restaurants, sellers] = await Promise.all([
    foodSourceIds.length
      ? FoodRestaurant.find({ _id: { $in: foodSourceIds.filter((id) => mongoose.isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id)) } })
        .select("restaurantName location addressLine1 area city state zoneId status isAcceptingOrders")
        .lean()
      : [],
    quickSourceIds.length
      ? Seller.find({ _id: { $in: quickSourceIds.filter((id) => mongoose.isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id)) } })
        .select("shopName name location shopInfo approvalStatus approved isActive")
        .lean()
      : [],
  ]);

  const sourceMap = new Map();
  for (const restaurant of restaurants) {
    sourceMap.set(String(restaurant._id), {
      type: "food",
      sourceId: String(restaurant._id),
      sourceName: restaurant.restaurantName || restaurant.name || "Restaurant",
      status: restaurant.status,
      isAcceptingOrders: restaurant.isAcceptingOrders,
      location: restaurant.location,
      zoneId: restaurant.zoneId || null,
      address:
        restaurant.location?.address ||
        restaurant.location?.formattedAddress ||
        restaurant.addressLine1 ||
        [restaurant.area, restaurant.city, restaurant.state].filter(Boolean).join(", "),
    });
  }
  for (const seller of sellers) {
    sourceMap.set(String(seller._id), {
      type: "quick",
      sourceId: String(seller._id),
      sourceName: seller.shopName || seller.name || "Quick Commerce",
      status:
        seller.approvalStatus ||
        (seller.approved && seller.isActive ? "approved" : "inactive"),
      location: seller.location,
      zoneId: seller.shopInfo?.zoneId || null,
      address:
        seller.location?.formattedAddress ||
        seller.location?.address ||
        "",
    });
  }
  return sourceMap;
}

function buildPickupPointsFromItems(items = [], sourceMap = new Map()) {
  const grouped = new Map();
  for (const item of items) {
    const key = `${item.type}:${item.sourceId}`;
    if (!grouped.has(key)) {
      const source = sourceMap.get(String(item.sourceId)) || {};
      grouped.set(key, {
        pickupType: item.type,
        sourceId: String(item.sourceId),
        sourceName: item.sourceName || source.sourceName || "",
        address: source.address || "",
        location: source.location?.coordinates
          ? { type: "Point", coordinates: source.location.coordinates }
          : undefined,
        itemIds: [],
      });
    }
    grouped.get(key).itemIds.push(String(item.itemId || item.id || item.name));
  }
  return [...grouped.values()];
}

async function evaluateCombinedPickupEligibility(pickupPoints = [], deliveryAddress) {
  const foodPickup = pickupPoints.find((point) => point.pickupType === "food");
  const quickPickup = pickupPoints.find((point) => point.pickupType === "quick");
  const foodPoint = getPointLatLng(foodPickup?.location);
  const quickPoint = getPointLatLng(quickPickup?.location);
  const userPoint = getPointLatLng(deliveryAddress?.location);
  if (!foodPoint || !quickPoint || !userPoint) {
    return {
      eligible: false,
      pickupDistanceKm: null,
      sameDirection: false,
      reason: "Pickup or delivery coordinates are unavailable",
    };
  }

  // Fetch dynamic settings
  const feeDoc = await FoodFeeSettings.findOne({ isActive: true }).sort({ createdAt: -1 }).lean();
  const distLimit = feeDoc?.mixedOrderDistanceLimit ?? 2;
  const angleLimit = feeDoc?.mixedOrderAngleLimit ?? 35;

  const pickupDistanceKm = haversineKm(foodPoint.lat, foodPoint.lng, quickPoint.lat, quickPoint.lng);
  const angle = angleBetweenPickupVectors(userPoint, foodPoint, quickPoint);

  // If pickups are very close to each other (e.g. < 200m), they are definitely in the same direction for practical purposes
  const isVeryClose = pickupDistanceKm <= 0.2;
  const sameDirection = isVeryClose || (angle == null ? false : angle <= angleLimit);

  const eligible = pickupDistanceKm <= distLimit && sameDirection;
  return {
    eligible,
    distanceLimitKm: Number(distLimit),
    angleLimitDeg: Number(angleLimit),
    pickupDistanceKm: Number.isFinite(pickupDistanceKm) ? Number(pickupDistanceKm.toFixed(2)) : null,
    sameDirection,
    reason: eligible
      ? "Pickups are close and aligned for a shared rider"
      : pickupDistanceKm > distLimit
        ? `Pickups are more than ${distLimit} km apart`
        : `Pickups are not in the same direction (exceeds ${angleLimit}° deviation)`,
  };
}

async function listNearbyPartnersForPoint(point, { maxKm = 15, limit = 5 } = {}) {
  const latLng = getPointLatLng(point?.location);
  if (!latLng) {
    const fallbackPartners = await FoodDeliveryPartner.find({
      status: "approved",
      availabilityStatus: "online",
    })
      .select("_id")
      .limit(Math.max(1, limit))
      .lean();

    return fallbackPartners.map((partner) => ({
      partnerId: partner._id,
      distanceKm: null,
    }));
  }

  const partners = await FoodDeliveryPartner.find({
    status: "approved",
    availabilityStatus: "online",
    lastLat: { $exists: true, $ne: null },
    lastLng: { $exists: true, $ne: null },
  })
    .select("_id lastLat lastLng")
    .lean();

  const nearbyPartners = partners
    .map((partner) => ({
      partnerId: partner._id,
      distanceKm: haversineKm(latLng.lat, latLng.lng, partner.lastLat, partner.lastLng),
    }))
    .filter((partner) => Number.isFinite(partner.distanceKm) && partner.distanceKm <= maxKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, Math.max(1, limit));

  if (nearbyPartners.length > 0) {
    return nearbyPartners;
  }

  const fallbackPartners = await FoodDeliveryPartner.find({
    status: "approved",
    availabilityStatus: "online",
  })
    .select("_id")
    .limit(Math.max(1, limit))
    .lean();

  return fallbackPartners.map((partner) => ({
    partnerId: partner._id,
    distanceKm: null,
  }));
}

function pushStatusHistory(order, { byRole, byId, from, to, note = "" }) {
  order.statusHistory.push({
    at: new Date(),
    byRole,
    byId: byId || undefined,
    from,
    to,
    note,
  });
}

function normalizeOrderForClient(orderDoc) {
  const order = orderDoc?.toObject ? orderDoc.toObject() : orderDoc || {};
  return {
    ...order,
    status: order?.orderStatus || order?.status || "",
    deliveredAt:
      order?.deliveryState?.deliveredAt || order?.deliveredAt || null,
    deliveryPartnerId:
      order?.dispatch?.deliveryPartnerId || order?.deliveryPartnerId || null,
    rating: order?.ratings?.restaurant?.rating ?? order?.rating ?? null,
    deliveryState: {
      ...(order?.deliveryState || {}),
      currentLocation: order?.lastRiderLocation?.coordinates?.length >= 2 ? {
        lat: order.lastRiderLocation.coordinates[1],
        lng: order.lastRiderLocation.coordinates[0]
      } : (order?.deliveryState?.currentLocation || null)
    }
  };
}

function toIdString(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value?._id?.toString?.() || value?.toString?.() || "";
}

function isSplitDispatchOrder(order) {
  return (
    order?.orderType === "mixed" &&
    ["split", "express_split"].includes(String(order?.dispatchPlan?.strategy || ""))
  );
}

function isExpressSplitDispatchOrder(order) {
  return (
    order?.orderType === "mixed" &&
    String(order?.dispatchPlan?.strategy || "") === "express_split"
  );
}

function getAssignedDispatchLeg(order, deliveryPartnerId) {
  const partnerId = toIdString(deliveryPartnerId);
  if (!partnerId) return null;
  return (
    (order?.dispatchPlan?.legs || []).find(
      (leg) => toIdString(leg?.deliveryPartnerId) === partnerId,
    ) || null
  );
}

function isOrderAssignedToDeliveryPartner(order, deliveryPartnerId) {
  const partnerId = toIdString(deliveryPartnerId);
  if (!partnerId) return false;

  const wholeOrderPartnerId = toIdString(order?.dispatch?.deliveryPartnerId);
  if (wholeOrderPartnerId === partnerId) return true;

  return Boolean(getAssignedDispatchLeg(order, deliveryPartnerId));
}

function filterOrderItemsForLeg(order, leg) {
  const items = Array.isArray(order?.items) ? order.items : [];
  if (!leg?.legId) return items;
  const targetLegId = String(leg.legId);
  return items.filter(
    (item) => `${item?.type || item?.orderType}:${item?.sourceId}` === targetLegId,
  );
}

function getEligibleDispatchLegs(order, deliveryPartnerId) {
  const partnerId = toIdString(deliveryPartnerId);
  if (!partnerId) return [];
  const existingAssignedLeg = getAssignedDispatchLeg(order, deliveryPartnerId);
  if (isExpressSplitDispatchOrder(order) && existingAssignedLeg) {
    return [];
  }
  return (order?.dispatchPlan?.legs || [])
    .filter((leg) => !toIdString(leg?.deliveryPartnerId))
    .filter((leg) =>
      (leg?.partnerCandidates || []).some(
        (candidate) => toIdString(candidate?.partnerId) === partnerId,
      ),
    )
    .map((leg) => {
      const candidate = (leg?.partnerCandidates || []).find(
        (entry) => toIdString(entry?.partnerId) === partnerId,
      );
      return {
        ...leg,
        candidateDistanceKm: Number.isFinite(candidate?.distanceKm)
          ? candidate.distanceKm
          : null,
      };
    });
}

function sortDispatchLegsByCandidateDistance(legs = []) {
  return [...legs].sort((a, b) => {
    const aDistance = Number.isFinite(a?.candidateDistanceKm)
      ? a.candidateDistanceKm
      : Number.POSITIVE_INFINITY;
    const bDistance = Number.isFinite(b?.candidateDistanceKm)
      ? b.candidateDistanceKm
      : Number.POSITIVE_INFINITY;
    return aDistance - bDistance;
  });
}

async function claimSplitDispatchLegAtomically(order, deliveryPartnerId, requestedLegId = "") {
  const partnerId = new mongoose.Types.ObjectId(deliveryPartnerId);
  const partnerIdString = partnerId.toString();
  const orderLegs = Array.isArray(order?.dispatchPlan?.legs) ? order.dispatchPlan.legs : [];
  const existingLeg = getAssignedDispatchLeg(order, deliveryPartnerId);
  const trimmedRequestedLegId = String(requestedLegId || "").trim();
  const requestedLeg = trimmedRequestedLegId
    ? orderLegs.find((leg) => String(leg?.legId || "") === trimmedRequestedLegId)
    : null;

  if (
    isExpressSplitDispatchOrder(order) &&
    existingLeg &&
    trimmedRequestedLegId &&
    existingLeg.legId !== trimmedRequestedLegId
  ) {
    throw new ValidationError(
      "Express mixed delivery assigns separate riders per pickup leg",
    );
  }

  if (requestedLeg && !existingLeg) {
    const legOwnerId = toIdString(requestedLeg?.deliveryPartnerId);
    if (legOwnerId && legOwnerId !== partnerIdString) {
      throw new ForbiddenError("This dispatch leg is already claimed by another rider");
    }

    const eligibleForRequestedLeg = (requestedLeg?.partnerCandidates || []).some(
      (candidate) => toIdString(candidate?.partnerId) === partnerIdString,
    );

    if (!legOwnerId && !eligibleForRequestedLeg) {
      throw new ForbiddenError("This dispatch leg is not available for this rider");
    }
  }

  if (existingLeg) {
    const updatedOrder = await FoodOrder.findById(order._id);
    return {
      updatedOrder,
      claimedLegId: existingLeg.legId,
    };
  }

  const eligibleLegs = sortDispatchLegsByCandidateDistance(
    getEligibleDispatchLegs(order, deliveryPartnerId),
  );
  const candidateLegIds = trimmedRequestedLegId
    ? [trimmedRequestedLegId]
    : eligibleLegs.map((leg) => String(leg?.legId || "")).filter(Boolean);

  if (!candidateLegIds.length) {
    throw new ValidationError("No dispatch leg is currently available for this rider");
  }

  for (const legId of candidateLegIds) {
    const claimQuery = {
      _id: order._id,
      orderStatus: {
        $in: ["confirmed", "preparing", "ready_for_pickup", "picked_up"],
      },
      dispatchPlan: {
        $exists: true,
      },
      "dispatchPlan.legs": {
        $elemMatch: {
          legId,
          deliveryPartnerId: null,
          partnerCandidates: {
            $elemMatch: {
              partnerId,
            },
          },
        },
      },
    };

    if (isExpressSplitDispatchOrder(order)) {
      claimQuery["dispatchPlan.legs.deliveryPartnerId"] = { $ne: partnerId };
    }

    const claimUpdate = {
      $set: {
        "dispatchPlan.legs.$[target].deliveryPartnerId": partnerId,
        "dispatchPlan.legs.$[target].assignedAt": new Date(),
        "dispatch.assignedAt": order?.dispatch?.assignedAt || new Date(),
      },
    };

    const claimOptions = {
      arrayFilters: [
        {
          "target.legId": legId,
          "target.deliveryPartnerId": null,
        },
      ],
    };

    if (isExpressSplitDispatchOrder(order)) {
      claimUpdate.$pull = {
        "dispatchPlan.legs.$[other].partnerCandidates": {
          partnerId,
        },
      };
      claimOptions.arrayFilters.push({
        "other.legId": { $ne: legId },
      });
    }

    const claimResult = await FoodOrder.updateOne(claimQuery, claimUpdate, claimOptions);
    if (claimResult?.modifiedCount > 0) {
      const updatedOrder = await FoodOrder.findById(order._id);
      return {
        updatedOrder,
        claimedLegId: legId,
      };
    }
  }

  throw new ValidationError("No dispatch leg is currently available for this rider");
}

function reorderPickupPointsForLeg(order, legId) {
  const pickupPoints = Array.isArray(order?.pickupPoints) ? [...order.pickupPoints] : [];
  if (!legId || pickupPoints.length <= 1) return pickupPoints;
  const selectedIndex = pickupPoints.findIndex(
    (point) => `${point?.pickupType}:${point?.sourceId}` === legId,
  );
  if (selectedIndex <= 0) return pickupPoints;
  const [selectedPoint] = pickupPoints.splice(selectedIndex, 1);
  return [selectedPoint, ...pickupPoints];
}

export async function populateQuickOrderSellers(orders) {
  const isArray = Array.isArray(orders);
  const list = isArray ? orders : [orders];

  const quickOrders = list.filter(o => o && (o.orderType === 'quick' || o.orderType === 'mixed'));
  if (quickOrders.length === 0) return orders;

  const sellerIds = new Set();
  for (const o of quickOrders) {
    if (o.pickupPoints && o.pickupPoints.length > 0) {
      continue;
    }
    if (o.items) {
      for (const item of o.items) {
        if (item.type === 'quick' && item.sourceId) {
          sellerIds.add(item.sourceId.toString());
        }
      }
    }
    if (o.dispatchPlan?.legs) {
      for (const leg of o.dispatchPlan.legs) {
        if (leg.pickupType === 'quick' && leg.sourceId) {
          sellerIds.add(leg.sourceId.toString());
        }
      }
    }
  }

  if (sellerIds.size > 0) {
    const sellers = await Seller.find({ _id: { $in: Array.from(sellerIds) } }).lean();
    const sellerMap = new Map(sellers.map(s => [s._id.toString(), s]));

    for (const o of quickOrders) {
      if (!o.pickupPoints || o.pickupPoints.length === 0) {
        const points = [];
        if (o.items) {
          const grouped = new Map();
          for (const item of o.items) {
            if (item.type === 'quick' && item.sourceId) {
              const sId = item.sourceId.toString();
              if (!grouped.has(sId)) {
                const s = sellerMap.get(sId);
                if (s) {
                  grouped.set(sId, {
                    pickupType: 'quick',
                    sourceId: sId,
                    sourceName: s.shopName || s.name || 'Seller Store',
                    address: s.location?.address || s.location?.formattedAddress || '',
                    location: s.location?.coordinates
                      ? { type: 'Point', coordinates: s.location.coordinates }
                      : (Number.isFinite(s.location?.latitude) && Number.isFinite(s.location?.longitude)
                        ? { type: 'Point', coordinates: [s.location.longitude, s.location.latitude] }
                        : undefined),
                    phone: s.phone || '',
                    itemIds: [],
                  });
                }
              }
              if (grouped.has(sId)) {
                grouped.get(sId).itemIds.push(item.itemId || item.id || item.name);
              }
            }
          }
          points.push(...grouped.values());
        }
        o.pickupPoints = points;
      }
    }
  }

  for (const o of list) {
    if (o && (o.orderType === 'quick' || o.orderType === 'mixed')) {
      if (o.pickupPoints && o.pickupPoints.length > 0) {
        const primary = o.pickupPoints[0];
        if (!o.restaurantLocation) {
          o.restaurantLocation = primary.location;
        }
        if (!o.restaurantName) {
          o.restaurantName = primary.sourceName;
        }
        if (!o.restaurantAddress) {
          o.restaurantAddress = primary.address;
        }
        if (!o.restaurantPhone) {
          o.restaurantPhone = primary.phone || '';
        }
        if (primary.location?.coordinates?.length === 2) {
          o.restaurantLat = primary.location.coordinates[1];
          o.restaurantLng = primary.location.coordinates[0];
          o.latitude = primary.location.coordinates[1];
          o.longitude = primary.location.coordinates[0];
        }
      }
    }
  }

  return orders;
}

function buildDeliveryOrderView(orderDoc, deliveryPartnerId, options = {}) {
  const order = normalizeOrderForClient(orderDoc);
  const assignedLeg =
    options.assignedDispatchLeg ||
    getAssignedDispatchLeg(orderDoc, deliveryPartnerId);
  const offeredLeg =
    options.dispatchLeg ||
    assignedLeg ||
    getEligibleDispatchLegs(orderDoc, deliveryPartnerId)[0] ||
    null;

  const activeLeg = assignedLeg || offeredLeg;
  order.orderMongoId =
    orderDoc?._id?.toString?.() || order?._id?.toString?.() || toIdString(order?._id);
  order.orderId = order?.orderId || order?.order_id || order.orderMongoId;

  if (activeLeg) {
    const legDeliveryFee = Number(activeLeg?.deliveryFee || 0);
    const legRiderEarning = Number(activeLeg?.riderEarning || 0);
    order.dispatchOfferType = isSplitDispatchOrder(orderDoc) ? "split_leg" : "single";
    if (isSplitDispatchOrder(orderDoc)) {
      order.deliveryFee = legDeliveryFee;
      order.riderEarning = legRiderEarning;
      order.earnings = legRiderEarning || legDeliveryFee || 0;
    }
    order.dispatchLeg = {
      legId: activeLeg.legId,
      pickupType: activeLeg.pickupType,
      sourceId: activeLeg.sourceId,
      sourceName: activeLeg.sourceName || "",
      deliveryFee: legDeliveryFee,
      riderEarning: legRiderEarning,
      candidateDistanceKm: Number.isFinite(activeLeg?.candidateDistanceKm)
        ? activeLeg.candidateDistanceKm
        : null,
      assignedAt: activeLeg.assignedAt || null,
      deliveryPartnerId: activeLeg.deliveryPartnerId || null,
    };
    if (isSplitDispatchOrder(orderDoc)) {
      order.items = filterOrderItemsForLeg(orderDoc, activeLeg);
      order.pickupPoints = reorderPickupPointsForLeg(orderDoc, activeLeg.legId).filter(
        (point) => `${point?.pickupType}:${point?.sourceId}` === activeLeg.legId,
      );
    } else {
      order.pickupPoints = reorderPickupPointsForLeg(orderDoc, activeLeg.legId);
    }
  }

  if (assignedLeg) {
    order.assignedDispatchLeg = {
      legId: assignedLeg.legId,
      pickupType: assignedLeg.pickupType,
      sourceId: assignedLeg.sourceId,
      sourceName: assignedLeg.sourceName || "",
      assignedAt: assignedLeg.assignedAt || null,
      deliveryPartnerId: assignedLeg.deliveryPartnerId || null,
    };
    order.deliveryPartnerId = assignedLeg.deliveryPartnerId || order.deliveryPartnerId || null;
  }

  return order;
}

async function applyAggregateRating(model, entityId, newRating) {
  if (!entityId) return;
  const doc = await model.findById(entityId).select("rating totalRatings");
  if (!doc) return;

  const totalRatings = Number(doc.totalRatings || 0);
  const currentAverage = Number(doc.rating || 0);
  const nextTotal = totalRatings + 1;
  const nextAverage = Number(
    ((currentAverage * totalRatings + Number(newRating)) / nextTotal).toFixed(
      1,
    ),
  );

  doc.totalRatings = nextTotal;
  doc.rating = nextAverage;
  await doc.save();
}

// 🗑️ Moved to foodTransaction.service.js to centralize finance logic.

// 🗑️ Moved to foodTransaction.service.js to centralize finance logic.




/** Append-only food_order_payments row; never blocks main flow on failure */
// 🗑️ Deprecated in favor of FoodTransaction system.

function buildDeliverySocketPayload(orderDoc, restaurantDoc = null) {
  const order = orderDoc?.toObject ? orderDoc.toObject() : orderDoc || {};
  const restaurant = restaurantDoc || order?.restaurantId || null;
  const restaurantLocation = restaurant?.location || {};
  const pickupPoints = Array.isArray(order?.pickupPoints) ? order.pickupPoints : [];

  return {
    orderMongoId:
      orderDoc?._id?.toString?.() || order?._id?.toString?.() || order?._id,
    orderId: order?.orderId,
    orderType: order?.orderType || "food",
    status: orderDoc?.orderStatus || order?.orderStatus,
    items: order?.items || [],
    pickupPoints,
    pricing: order?.pricing,
    total: order?.pricing?.total,
    payment: order?.payment,
    paymentMethod: order?.payment?.method,
    restaurantId:
      order?.restaurantId?._id?.toString?.() ||
      order?.restaurantId?.toString?.() ||
      order?.restaurantId,
    restaurantName: restaurant?.restaurantName || order?.restaurantName,
    restaurantAddress:
      restaurantLocation?.address ||
      restaurantLocation?.formattedAddress ||
      restaurant?.addressLine1 ||
      "",
    restaurantPhone: restaurant?.phone || "",
    restaurantLocation: {
      latitude:
        restaurantLocation?.latitude ||
        (Array.isArray(restaurantLocation?.coordinates)
          ? restaurantLocation.coordinates[1]
          : undefined),
      longitude:
        restaurantLocation?.longitude ||
        (Array.isArray(restaurantLocation?.coordinates)
          ? restaurantLocation.coordinates[0]
          : undefined),
      address:
        restaurantLocation?.address ||
        restaurantLocation?.formattedAddress ||
        restaurant?.addressLine1 ||
        "",
      area: restaurantLocation?.area || restaurant?.area || "",
      city: restaurantLocation?.city || restaurant?.city || "",
      state: restaurantLocation?.state || restaurant?.state || "",
    },
    deliveryAddress: order?.deliveryAddress,
    customerAddress: order?.deliveryAddress?.formattedAddress || order?.deliveryAddress?.addressLine1 || "",
    customerName: order?.userId?.name || order?.customerName || "",
    customerPhone: order?.userId?.phone || order?.deliveryAddress?.phone || "",
    userName: order?.userId?.name || order?.customerName || "",
    userPhone: order?.userId?.phone || order?.deliveryAddress?.phone || "",
    riderEarning: order?.riderEarning || 0,
    earnings: order?.riderEarning || order?.pricing?.deliveryFee || 0,
    deliveryFee: order?.pricing?.deliveryFee || 0,
    deliveryFleet: order?.deliveryFleet,
    dispatch: order?.dispatch,
    createdAt: order?.createdAt,
    updatedAt: order?.updatedAt,
  };
}

function buildSplitLegSocketPayload(orderDoc, leg, restaurantDoc = null) {
  const basePayload = buildDeliverySocketPayload(orderDoc, restaurantDoc);
  const legId = String(leg?.legId || "");
  const legDeliveryFee = Number(leg?.deliveryFee || 0);
  const legRiderEarning = Number(leg?.riderEarning || 0);

  return {
    ...basePayload,
    dispatchOfferType: "split_leg",
    deliveryFee: legDeliveryFee,
    riderEarning: legRiderEarning,
    earnings: legRiderEarning || legDeliveryFee || 0,
    dispatchLeg: {
      legId,
      pickupType: leg?.pickupType || "",
      sourceId: leg?.sourceId || "",
      sourceName: leg?.sourceName || "",
      deliveryFee: legDeliveryFee,
      riderEarning: legRiderEarning,
      candidateDistanceKm: null,
      assignedAt: leg?.assignedAt || null,
      deliveryPartnerId: leg?.deliveryPartnerId || null,
    },
    items: filterOrderItemsForLeg(orderDoc, leg),
    pickupPoints: reorderPickupPointsForLeg(orderDoc, legId).filter(
      (point) => `${point?.pickupType}:${point?.sourceId}` === legId,
    ),
  };
}

function emitOrderClaimedToOtherPartners(order, {
  acceptedBy,
  legId = "",
  candidatePartnerIds = [],
} = {}) {
  try {
    const io = getIO();
    if (!io) return;

    const acceptedById = toIdString(acceptedBy);
    const payload = {
      orderId: String(order?.orderId || ""),
      orderMongoId: order?._id?.toString?.() || "",
      legId: String(legId || "").trim(),
      claimedBy: acceptedById,
    };

    const partnerIds = [...new Set(
      (Array.isArray(candidatePartnerIds) ? candidatePartnerIds : [])
        .map((value) => toIdString(value))
        .filter(Boolean)
        .filter((value) => value !== acceptedById),
    )];

    for (const partnerId of partnerIds) {
      io.to(rooms.delivery(partnerId)).emit("order_claimed", payload);
      io.to(rooms.delivery(partnerId)).emit("order_reassigned_elsewhere", payload);
    }
  } catch (error) {
    logger.warn(`emitOrderClaimedToOtherPartners failed: ${error?.message || error}`);
  }
}

function canExposeOrderToRestaurant(orderLike) {
  if (orderLike?.orderStatus === "scheduled") return false;
  const method = String(orderLike?.payment?.method || "").toLowerCase();
  const status = String(orderLike?.payment?.status || "").toLowerCase();

  // Cash and Wallet are considered confirmed immediately
  if (["cash", "wallet"].includes(method)) return true;
  // Online payments must be successful
  return ["paid", "authorized", "captured", "settled"].includes(status);
}

async function notifyRestaurantNewOrder(orderDoc) {
  try {
    if (!orderDoc || !canExposeOrderToRestaurant(orderDoc)) return;
    if (orderDoc.orderStatus === "scheduled") return;

    const io = getIO();
    if (io) {
      const payload = {
        ...orderDoc.toObject(),
        orderMongoId: orderDoc._id?.toString?.() || undefined,
      };
      io.to(rooms.restaurant(orderDoc.restaurantId)).emit("new_order", payload);
      io.to(rooms.restaurant(orderDoc.restaurantId)).emit(
        "play_notification_sound",
        {
          orderId: payload.orderId,
          orderMongoId: payload.orderMongoId,
        },
      );
    }

    await notifyOwnersSafely(
      [{ ownerType: "RESTAURANT", ownerId: orderDoc.restaurantId }],
      {
        title: "New order received",
        body: `Order ${orderDoc.orderId} is waiting for review.`,
        data: {
          type: "new_order",
          orderId: orderDoc.orderId,
          orderMongoId: orderDoc._id?.toString?.() || "",
          link: `/restaurant/orders/${orderDoc._id?.toString?.() || ""}`,
        },
      },
    );
  } catch {
    // Do not block order/payment flow if notification fails.
  }
}

function buildSellerOrderAddress(deliveryAddress) {
  if (!deliveryAddress) return { address: "", city: "" };
  const coords = deliveryAddress?.location?.coordinates;
  return {
    address: deliveryAddress.street || "",
    city: deliveryAddress.city || "",
    ...(Array.isArray(coords) && coords.length === 2
      ? {
        location: {
          lat: Number(coords[1]),
          lng: Number(coords[0]),
        },
      }
      : {}),
  };
}

function buildSellerOrdersFromParent(orderDoc, { customerName = "", customerPhone = "" } = {}) {
  const order = orderDoc?.toObject ? orderDoc.toObject() : orderDoc || {};
  const quickItems = Array.isArray(order.items)
    ? order.items.filter((item) => item?.type === "quick")
    : [];
  if (!quickItems.length) return [];

  const quickSubtotal = quickItems.reduce(
    (sum, item) => sum + Number(item?.price || 0) * Number(item?.quantity || 0),
    0,
  );
  const totalDeliveryFee = Number(order?.pricing?.deliveryFee || 0);
  const sellerBuckets = new Map();

  for (const item of quickItems) {
    const sellerId = String(item?.sourceId || "").trim();
    if (!sellerId || !mongoose.isValidObjectId(sellerId)) continue;
    if (!sellerBuckets.has(sellerId)) sellerBuckets.set(sellerId, []);
    sellerBuckets.get(sellerId).push(item);
  }

  return Array.from(sellerBuckets.entries()).map(([sellerId, sellerItems]) => {
    const sellerSubtotal = sellerItems.reduce(
      (sum, item) => sum + Number(item?.price || 0) * Number(item?.quantity || 0),
      0,
    );
    const allocatedDeliveryFee =
      quickSubtotal > 0
        ? Number(((totalDeliveryFee * sellerSubtotal) / quickSubtotal).toFixed(2))
        : 0;

    return {
      orderType: order.orderType === "mixed" ? "mixed" : "quick",
      parentOrderId: orderDoc?._id || order?._id || null,
      sellerId: new mongoose.Types.ObjectId(sellerId),
      orderId: order.orderId,
      customer: {
        name:
          String(customerName || order?.userId?.name || "").trim() || "Customer",
        phone:
          String(customerPhone || order?.deliveryAddress?.phone || "").trim() || "",
      },
      items: sellerItems.map((item) => ({
        productId: mongoose.isValidObjectId(String(item?.itemId || ""))
          ? new mongoose.Types.ObjectId(String(item.itemId))
          : null,
        name: item?.name || "Item",
        price: Number(item?.price || 0),
        quantity: Math.max(1, Number(item?.quantity || 1)),
        image: item?.image || "",
      })),
      pricing: {
        subtotal: sellerSubtotal,
        total: sellerSubtotal + allocatedDeliveryFee,
      },
      status: "pending",
      workflowStatus: "SELLER_PENDING",
      sellerPendingExpiresAt: new Date(Date.now() + 2 * 60 * 1000),
      address: buildSellerOrderAddress(order.deliveryAddress),
      payment: {
        method: ["cash", "cod"].includes(String(order?.payment?.method || "").toLowerCase())
          ? "cash"
          : "online",
      },
    };
  });
}

async function upsertSellerOrdersForParent(orderDoc, options = {}) {
  const sellerOrders = buildSellerOrdersFromParent(orderDoc, options);
  if (!sellerOrders.length) return [];

  return Promise.all(
    sellerOrders.map((sellerOrder) =>
      SellerOrder.findOneAndUpdate(
        {
          sellerId: sellerOrder.sellerId,
          orderId: sellerOrder.orderId,
        },
        { $set: sellerOrder },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      ).lean(),
    ),
  );
}

async function notifySellerNewOrders(orderDoc, sellerOrders = []) {
  try {
    if (!orderDoc || !canExposeOrderToRestaurant(orderDoc) || !sellerOrders.length) return;
    if (orderDoc.orderStatus === "scheduled") return;

    const io = getIO();
    for (const sellerOrder of sellerOrders) {
      if (!sellerOrder?.sellerId) continue;
      const payload = {
        orderId: sellerOrder.orderId,
        sellerOrderId: sellerOrder._id?.toString?.() || "",
        orderType: sellerOrder.orderType || "quick",
        status: sellerOrder.status,
        workflowStatus: sellerOrder.workflowStatus,
        items: sellerOrder.items || [],
        pricing: sellerOrder.pricing || {},
        createdAt: sellerOrder.createdAt || new Date(),
      };

      if (io) {
        io.to(rooms.seller(sellerOrder.sellerId)).emit("new_order", payload);
        io.to(rooms.seller(sellerOrder.sellerId)).emit("order:new", payload);
        io.to(rooms.seller(sellerOrder.sellerId)).emit("play_notification_sound", {
          orderId: sellerOrder.orderId,
          sellerOrderId: sellerOrder._id?.toString?.() || "",
        });
      }

      await notifyOwnerSafely(
        { ownerType: "SELLER", ownerId: sellerOrder.sellerId },
        {
          title:
            sellerOrder.orderType === "mixed"
              ? "New mixed order received"
              : "New quick order received",
          body:
            sellerOrder.orderType === "mixed"
              ? `Order ${sellerOrder.orderId} includes a mixed-order seller leg waiting for action.`
              : `Order ${sellerOrder.orderId} is waiting for seller action.`,
          data: {
            type: "new_seller_order",
            orderId: sellerOrder.orderId,
            sellerOrderId: sellerOrder._id?.toString?.() || "",
            orderType: sellerOrder.orderType || "quick",
            link: `/seller/orders`,
          },
        },
      );
    }
  } catch (error) {
    logger.warn(`Seller order notify failed: ${error?.message || error}`);
  }
}

/**
 * Synchronize cancellation of all seller-specific order legs associated with a parent order.
 * Triggers status updates and real-time socket notifications to sellers.
 */
async function cancelSellerOrdersForParent(orderDoc, reason = "Parent order cancelled") {
  try {
    const parentId = orderDoc._id;
    // Find active seller order legs (not yet delivered or already cancelled)
    const activeSellerOrders = await SellerOrder.find({
      parentOrderId: parentId,
      status: { $nin: ["cancelled", "delivered"] }
    });

    if (!activeSellerOrders.length) return;

    logger.info(`MixedOrder: Cancelling ${activeSellerOrders.length} seller legs for Order ${orderDoc.orderId}`);

    // Update all matching legs to 'cancelled' status
    await SellerOrder.updateMany(
      {
        parentOrderId: parentId,
        status: { $nin: ["cancelled", "delivered"] }
      },
      {
        $set: {
          status: "cancelled",
          workflowStatus: "CANCELLED"
        }
      }
    );

    // Notify each seller via Socket.io and Push Notifications
    await notifySellerOrderCancelled(orderDoc, activeSellerOrders, reason);
  } catch (error) {
    logger.error(`cancelSellerOrdersForParent failed for Order ${orderDoc?.orderId}: ${error.message}`);
  }
}

/**
 * Emit real-time socket events and send push notifications to sellers when their leg of a mixed order is cancelled.
 */
async function notifySellerOrderCancelled(orderDoc, sellerOrders, reason) {
  try {
    const io = getIO();
    for (const sellerOrder of sellerOrders) {
      const sellerId = sellerOrder.sellerId?.toString?.() || sellerOrder.sellerId;

      if (io && sellerId) {
        const payload = {
          orderId: sellerOrder.orderId,
          sellerOrderId: sellerOrder._id?.toString?.() || "",
          reason,
          status: "cancelled"
        };

        console.log(`[MIXED-SYNC] Emitting cancellation for SellerOrder ${sellerOrder.orderId} to seller room: ${rooms.seller(sellerId)}`);
        // Emit specific cancellation events to seller room
        io.to(rooms.seller(sellerId)).emit("order_cancelled", payload);
        io.to(rooms.seller(sellerId)).emit("order:cancelled", payload);

        // Also emit 'order_status_update' so generic UI listeners (like DashboardLayout) can update status tags
        io.to(rooms.seller(sellerId)).emit("order_status_update", {
          ...payload,
          orderStatus: "cancelled",
          sellerStatus: "cancelled",
          message: `Order #${sellerOrder.orderId} was cancelled.`
        });
      }

      if (sellerId) {
        await notifyOwnerSafely(
          { ownerType: "SELLER", ownerId: sellerId },
          {
            title: "Order Cancelled ❌",
            body: `The order has been cancelled by the ${reason.includes('user') ? 'user' : 'restaurant'}.`,
            data: {
              type: "seller_order_cancelled",
              orderId: sellerOrder.orderId,
              sellerOrderId: sellerOrder._id?.toString?.() || "",
              link: `/seller/orders`,
            },
          }
        );
      }
    }
  } catch (error) {
    logger.warn(`notifySellerOrderCancelled failed: ${error.message}`);
  }
}


async function listNearbyOnlineDeliveryPartners(
  restaurantId,
  { maxKm = 15, limit = 25 } = {},
) {
  const restaurant = await FoodRestaurant.findById(restaurantId)
    .select("location")
    .lean();
  if (!restaurant?.location?.coordinates?.length) {
    // Fallback: if restaurant location is missing, notify any online approved partners.
    const partners = await FoodDeliveryPartner.find({
      status: "approved",
      availabilityStatus: "online",
    })
      .select("_id")
      .limit(Math.max(1, limit))
      .lean();
    return {
      restaurant: null,
      partners: partners.map((p) => ({ partnerId: p._id, distanceKm: null })),
    };
  }

  const [rLng, rLat] = restaurant.location.coordinates;
  const partners = await FoodDeliveryPartner.find({
    status: "approved",
    availabilityStatus: "online",
    lastLat: { $exists: true, $ne: null },
    lastLng: { $exists: true, $ne: null },
  })
    .select("_id lastLat lastLng")
    .lean();

  console.log(
    `[DEBUG] listNearby: Restaurant [${rLat}, ${rLng}] found ${partners.length} online approved partners with GPS`,
  );

  const scored = [];
  for (const p of partners) {
    const d = haversineKm(rLat, rLng, p.lastLat, p.lastLng);
    if (Number.isFinite(d) && d <= maxKm)
      scored.push({ partnerId: p._id, distanceKm: d });
  }

  scored.sort((a, b) => a.distanceKm - b.distanceKm);
  const picked = scored.slice(0, Math.max(1, limit));

  // Fallback: if no one has GPS yet, still notify online partners (common right after login).
  if (picked.length === 0) {
    const anyOnline = await FoodDeliveryPartner.find({
      status: "approved",
      availabilityStatus: "online",
    })
      .select("_id")
      .limit(Math.max(1, limit))
      .lean();
    return {
      restaurant,
      partners: anyOnline.map((p) => ({ partnerId: p._id, distanceKm: null })),
    };
  }

  return { restaurant, partners: picked };
}

async function refreshSplitDispatchLegCandidates(order) {
  if (!isSplitDispatchOrder(order)) return false;

  const assignedPartnerIds = new Set(
    (order.dispatchPlan?.legs || [])
      .map((leg) => toIdString(leg?.deliveryPartnerId))
      .filter(Boolean),
  );

  let changed = false;
  for (const leg of order.dispatchPlan?.legs || []) {
    if (toIdString(leg?.deliveryPartnerId)) continue;

    const pickupPoint = (order.pickupPoints || []).find(
      (point) => `${point?.pickupType}:${point?.sourceId}` === leg.legId,
    );
    if (!pickupPoint) continue;

    const candidates = await listNearbyPartnersForPoint(pickupPoint);
    const nextCandidates = candidates.filter((candidate) => {
      const candidateId = toIdString(candidate?.partnerId);
      if (!candidateId) return false;
      if (
        isExpressSplitDispatchOrder(order) &&
        assignedPartnerIds.has(candidateId)
      ) {
        return false;
      }
      return true;
    });

    const previousSerialized = JSON.stringify(
      (leg.partnerCandidates || []).map((candidate) => ({
        partnerId: toIdString(candidate?.partnerId),
        distanceKm: candidate?.distanceKm == null
          ? null
          : Number(candidate.distanceKm),
      })),
    );
    const nextSerialized = JSON.stringify(
      nextCandidates.map((candidate) => ({
        partnerId: toIdString(candidate?.partnerId),
        distanceKm: candidate?.distanceKm == null
          ? null
          : Number(candidate.distanceKm),
      })),
    );

    if (previousSerialized !== nextSerialized) {
      leg.partnerCandidates = nextCandidates;
      changed = true;
    }
  }

  return changed;
}

async function notifySplitDispatchOffers(order, { restaurantDoc = null } = {}) {
  if (!order || !isSplitDispatchOrder(order)) return;

  const refreshed = await refreshSplitDispatchLegCandidates(order);
  if (refreshed) {
    await order.save();
  }

  const io = getIO();
  const restaurant =
    restaurantDoc ||
    (order.restaurantId
      ? await FoodRestaurant.findById(order.restaurantId)
        .select("restaurantName location addressLine1 area city state")
        .lean()
      : null);

  const pushTargets = [];
  const targetedPartnerIds = new Set();
  const maxCandidatesPerLeg = isExpressSplitDispatchOrder(order) ? 3 : 5;
  const openLegs = (order.dispatchPlan?.legs || []).filter(
    (leg) => !toIdString(leg?.deliveryPartnerId),
  );
  const distinctOpenCandidateIds = new Set(
    openLegs.flatMap((leg) =>
      (Array.isArray(leg?.partnerCandidates) ? leg.partnerCandidates : [])
        .map((candidate) => toIdString(candidate?.partnerId))
        .filter(Boolean),
    ),
  );
  const canEnforceDistinctExpressTargets =
    isExpressSplitDispatchOrder(order) &&
    distinctOpenCandidateIds.size >= openLegs.length;

  for (const leg of order.dispatchPlan?.legs || []) {
    if (toIdString(leg?.deliveryPartnerId)) continue;

    const legPayload = buildSplitLegSocketPayload(order, leg, restaurant);
    const candidatePool = Array.isArray(leg.partnerCandidates)
      ? [...leg.partnerCandidates]
      : [];
    const uniqueCandidates = candidatePool.filter(
      (candidate) => !targetedPartnerIds.has(toIdString(candidate?.partnerId)),
    );
    const duplicateCandidates = candidatePool.filter((candidate) =>
      targetedPartnerIds.has(toIdString(candidate?.partnerId)),
    );
    const candidatesToNotify = isExpressSplitDispatchOrder(order)
      ? (
        canEnforceDistinctExpressTargets
          ? uniqueCandidates
          : [...uniqueCandidates, ...duplicateCandidates]
      ).slice(0, maxCandidatesPerLeg)
      : candidatePool.slice(0, maxCandidatesPerLeg);

    for (const candidate of candidatesToNotify) {
      const partnerId = toIdString(candidate?.partnerId);
      if (!partnerId) continue;
      targetedPartnerIds.add(partnerId);

      if (io) {
        io.to(rooms.delivery(partnerId)).emit("new_order_available", {
          ...legPayload,
          pickupDistanceKm: candidate?.distanceKm ?? null,
          dispatchLeg: {
            ...legPayload.dispatchLeg,
            candidateDistanceKm: candidate?.distanceKm ?? null,
          },
        });
        io.to(rooms.delivery(partnerId)).emit("play_notification_sound", {
          orderId: legPayload.orderId,
          orderMongoId: legPayload.orderMongoId,
          legId: leg.legId,
        });
      }

      pushTargets.push({
        ownerType: "DELIVERY_PARTNER",
        ownerId: partnerId,
      });
    }
  }

  if (pushTargets.length) {
    await notifyOwnersSafely(pushTargets, {
      title: "New mixed pickup available",
      body: `Order ${order.orderId} has a nearby pickup leg available for delivery.`,
      data: {
        type: "new_order_available",
        orderId: order.orderId,
        orderMongoId: order._id?.toString?.() || "",
        link: "/delivery",
      },
    });
  }
}

export async function notifySplitDispatchOffersForOrder(orderId) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) {
    throw new ValidationError("Order id required");
  }

  const order = await FoodOrder.findOne(identity);
  if (!order) {
    throw new NotFoundError("Order not found");
  }

  if (!isSplitDispatchOrder(order)) {
    throw new ValidationError("Order is not configured for split dispatch");
  }

  const activeStatuses = ["confirmed", "preparing", "ready_for_pickup", "ready"];
  if (!activeStatuses.includes(String(order.orderStatus || "").toLowerCase())) {
    throw new ValidationError(`Cannot notify riders for order in status: ${order.orderStatus}`);
  }

  await notifySplitDispatchOffers(order);
  return { success: true };
}

/** Triggered by BullMQ 15 minutes before scheduledAt. */
export async function processScheduledOrderNotification(orderMongoId) {
  const order = await FoodOrder.findById(orderMongoId);
  if (!order) return { success: false, reason: "Order not found" };

  // If order was cancelled or already confirmed, skip
  if (order.orderStatus !== "scheduled") {
    return { success: false, reason: `Order is in ${order.orderStatus} status` };
  }

  // Update status to 'placed' (which is the state for orders waiting restaurant action)
  order.orderStatus = "placed";
  pushStatusHistory(order, {
    byRole: "SYSTEM",
    from: "scheduled",
    to: "placed",
    note: "Scheduled order activated for restaurant review (15m window reached)",
  });
  await order.save();

  // Now trigger the actual notifications
  await notifyRestaurantNewOrder(order);

  const sellerOrders = order.orderType === "quick" || order.orderType === "mixed"
    ? await upsertSellerOrdersForParent(order)
    : [];
  if (sellerOrders.length > 0) {
    await notifySellerNewOrders(order, sellerOrders);
  }

  return { success: true };
}

// ----- Settings -----
export async function getDispatchSettings() {
  let doc = await FoodSettings.findOne({ key: "dispatch" }).lean();
  if (!doc) {
    await FoodSettings.create({ key: "dispatch", dispatchMode: "manual" });
    doc = await FoodSettings.findOne({ key: "dispatch" }).lean();
  }
  return { dispatchMode: doc?.dispatchMode || "manual" };
}

export async function updateDispatchSettings(dispatchMode, adminId) {
  await FoodSettings.findOneAndUpdate(
    { key: "dispatch" },
    {
      $set: {
        dispatchMode,
        updatedBy: { role: "ADMIN", adminId, at: new Date() },
      },
    },
    { upsert: true, new: true },
  );
  return getDispatchSettings();
}

// ----- Calculate (validation + return pricing from payload) -----
export async function calculateOrder(userId, dto) {
  const items = normalizeOrderItems(dto.items, dto.orderType);
  await syncItemsWithDatabase(items);


  const hasFoodItems = items.some((item) => item.type === "food");
  const hasQuickItems = items.some((item) => item.type === "quick");
  const orderType =
    hasFoodItems && hasQuickItems
      ? "mixed"
      : hasQuickItems
        ? "quick"
        : "food";
  const subtotal = items.reduce(
    (sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1),
    0,
  );

  // Fee settings (admin-configured). Use safe fallbacks for dev if not configured.
  const feeDoc = await FoodFeeSettings.findOne({ isActive: true })
    .sort({ createdAt: -1 })
    .lean();

  const defaultFeeSettings = {
    deliveryFee: 25,
    deliveryFeeRanges: [],
    freeDeliveryThreshold: 149,
    platformFee: 5,
    gstRate: 5,
    mixedOrderDistanceLimit: 2,
    mixedOrderAngleLimit: 35
  };

  const feeSettings = {
    ...defaultFeeSettings,
    ...(feeDoc || {})
  };

  // Ensure individual fields are numbers and not NaN/undefined even if feeDoc exists
  feeSettings.platformFee = Number(feeSettings.platformFee ?? defaultFeeSettings.platformFee);
  feeSettings.gstRate = Number(feeSettings.gstRate ?? defaultFeeSettings.gstRate);
  feeSettings.deliveryFee = Number(feeSettings.deliveryFee ?? defaultFeeSettings.deliveryFee);
  feeSettings.freeDeliveryThreshold = Number(feeSettings.freeDeliveryThreshold ?? defaultFeeSettings.freeDeliveryThreshold);
  feeSettings.mixedOrderDistanceLimit = Number(feeSettings.mixedOrderDistanceLimit ?? defaultFeeSettings.mixedOrderDistanceLimit);
  feeSettings.mixedOrderAngleLimit = Number(feeSettings.mixedOrderAngleLimit ?? defaultFeeSettings.mixedOrderAngleLimit);

  const sourceMap = await fetchPickupSourcesByType(items);
  const pickupPoints = buildPickupPointsFromItems(items, sourceMap);
  const eligibility =
    orderType === "mixed"
      ? await evaluateCombinedPickupEligibility(pickupPoints, dto.address)
      : {
        eligible: false,
        pickupDistanceKm: null,
        sameDirection: false,
        reason: "",
      };

  if (orderType === "quick") {
    const packagingFee = 0;
    const platformFee = feeSettings.platformFee;
    const deliveryFee = feeSettings.deliveryFee;
    const gstRate = feeSettings.gstRate;
    const tax =
      Number.isFinite(gstRate) && gstRate > 0
        ? Math.round(subtotal * (gstRate / 100))
        : 0;
    const discount = 0;
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
        total,
        currency: "INR",
        couponCode: null,
        appliedCoupon: null,
      },
    };
  }

  const foodSourceIds = [
    ...new Set(
      items
        .filter((item) => item.type === "food")
        .map((item) => item.sourceId)
        .filter(Boolean),
    ),
  ];
  const primaryRestaurantId = dto.restaurantId || foodSourceIds[0];
  const primaryRestaurant = sourceMap.get(String(primaryRestaurantId));
  if (!primaryRestaurant) throw new ValidationError("Restaurant not found");
  if (primaryRestaurant.status !== "approved")
    throw new ValidationError("Restaurant not available");
  if (primaryRestaurant.isAcceptingOrders === false)
    throw new ValidationError("Restaurant is currently offline and not accepting orders");

  const inactiveQuickSource = [...sourceMap.values()].find(
    (source) =>
      source.type === "quick" &&
      !["approved", "active"].includes(String(source.status || "").toLowerCase()),
  );
  if (inactiveQuickSource) {
    throw new ValidationError(
      `${inactiveQuickSource.sourceName || "Quick store"} is not available`,
    );
  }

  const packagingFee = 0;
  const platformFee = feeSettings.platformFee;

  // Delivery fee by subtotal range (fallback to flat fee; free above threshold).
  const freeThreshold = feeSettings.freeDeliveryThreshold;
  let deliveryFee = 0;
  if (
    Number.isFinite(freeThreshold) &&
    freeThreshold > 0 &&
    subtotal >= freeThreshold
  ) {
    deliveryFee = 0;
  } else {
    const ranges = Array.isArray(feeSettings.deliveryFeeRanges)
      ? [...feeSettings.deliveryFeeRanges]
      : [];
    if (ranges.length > 0) {
      ranges.sort((a, b) => Number(a.min) - Number(b.min));
      let matched = null;
      for (let i = 0; i < ranges.length; i += 1) {
        const r = ranges[i] || {};
        const min = Number(r.min);
        const max = Number(r.max);
        const fee = Number(r.fee);
        if (
          !Number.isFinite(min) ||
          !Number.isFinite(max) ||
          !Number.isFinite(fee)
        )
          continue;
        const isLast = i === ranges.length - 1;
        const inRange = isLast
          ? subtotal >= min && subtotal <= max
          : subtotal >= min && subtotal < max;
        if (inRange) {
          matched = fee;
          break;
        }
      }
      deliveryFee = Number.isFinite(matched)
        ? matched
        : feeSettings.deliveryFee;
    } else {
      deliveryFee = feeSettings.deliveryFee;
    }
  }

  const gstRate = feeSettings.gstRate;
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
    if (!offer) {
      discount = 0;
    } else {
      const statusOk = offer.status === "active";
      const startOk = !offer.startDate || now >= new Date(offer.startDate);
      const endOk = !offer.endDate || now < new Date(offer.endDate);
      const scopeOk =
        offer.restaurantScope !== "selected" ||
        String(offer.restaurantId || "") === String(primaryRestaurantId || "");
      const minOk = subtotal >= (Number(offer.minOrderValue) || 0);
      let usageOk = true;
      if (
        Number(offer.usageLimit) > 0 &&
        Number(offer.usedCount || 0) >= Number(offer.usageLimit)
      )
        usageOk = false;
      let perUserOk = true;
      if (userId && Number(offer.perUserLimit) > 0) {
        const usage = await FoodOfferUsage.findOne({
          offerId: offer._id,
          userId,
        }).lean();
        if (usage && Number(usage.count) >= Number(offer.perUserLimit))
          perUserOk = false;
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
        appliedCoupon = { code: codeRaw, discount };
      }
    }
  }
  const quickDeliveryFee = orderType === "mixed"
    ? Number(feeSettings.deliveryFee || 25)
    : 0;
  const normalDeliveryFee =
    orderType === "mixed" ? Math.max(deliveryFee, quickDeliveryFee) : deliveryFee;
  const expressDeliveryFee =
    orderType === "mixed" ? deliveryFee + quickDeliveryFee : deliveryFee;
  const selectedDeliveryFee =
    orderType === "mixed" ? normalDeliveryFee : deliveryFee;
  const total = Math.max(
    0,
    subtotal + packagingFee + selectedDeliveryFee + platformFee + tax - discount,
  );
  const deliveryOptions =
    orderType === "mixed" && eligibility.eligible
      ? [
        {
          code: "normal",
          label: "Normal delivery",
          deliveryFee: normalDeliveryFee,
          total: Math.max(
            0,
            subtotal +
            packagingFee +
            normalDeliveryFee +
            platformFee +
            tax -
            discount,
          ),
          riderCount: 1,
        },
        {
          code: "express",
          label: "Express delivery",
          deliveryFee: expressDeliveryFee,
          total: Math.max(
            0,
            subtotal +
            packagingFee +
            expressDeliveryFee +
            platformFee +
            tax -
            discount,
          ),
          riderCount: 2,
        },
      ]
      : [];
  return {
    items,
    pricing: {
      subtotal,
      tax,
      packagingFee,
      deliveryFee: selectedDeliveryFee,
      platformFee,
      discount,
      total,
      currency: "INR",
      couponCode: appliedCoupon?.code || codeRaw || null,
      appliedCoupon,
      deliveryOptions,
      pickupDistanceKm: eligibility.pickupDistanceKm,
      combinedPickupEligible: eligibility.eligible,
      mixedOrderDistanceLimit: eligibility.distanceLimitKm,
      mixedOrderAngleLimit: eligibility.angleLimitDeg,
      sameDirection: eligibility.sameDirection,
      eligibilityReason: eligibility.reason,
      pickupPoints,
    },
  };
}

// ----- Create order -----
export async function createOrder(userId, dto) {
  const items = normalizeOrderItems(dto.items, dto.orderType);
  await syncItemsWithDatabase(items);


  const hasFoodItems = items.some((item) => item.type === "food");
  const hasQuickItems = items.some((item) => item.type === "quick");
  const orderType =
    hasFoodItems && hasQuickItems
      ? "mixed"
      : hasQuickItems
        ? "quick"
        : "food";
  const sourceMap = await fetchPickupSourcesByType(items);
  const foodSourceIds = [
    ...new Set(
      items
        .filter((item) => item.type === "food")
        .map((item) => item.sourceId)
        .filter(Boolean),
    ),
  ];
  const primaryRestaurantId = dto.restaurantId || foodSourceIds[0] || null;
  const primaryRestaurant = primaryRestaurantId
    ? sourceMap.get(String(primaryRestaurantId))
    : null;
  if (hasFoodItems) {
    if (!primaryRestaurant) throw new ValidationError("Restaurant not found");
    if (primaryRestaurant.status !== "approved")
      throw new ValidationError("Restaurant not accepting orders");
    if (primaryRestaurant.isAcceptingOrders === false)
      throw new ValidationError("Restaurant is currently offline and not accepting orders");
  }
  const inactiveQuickSource = [...sourceMap.values()].find(
    (source) =>
      source.type === "quick" &&
      !["approved", "active"].includes(String(source.status || "").toLowerCase()),
  );
  if (inactiveQuickSource) {
    throw new ValidationError(
      `${inactiveQuickSource.sourceName || "Quick store"} is not accepting orders`,
    );
  }

  const orderId = await ensureUniqueOrderId();
  const settings =
    orderType === "food" || orderType === "mixed"
      ? await getDispatchSettings()
      : null;
  const dispatchMode = settings?.dispatchMode || "manual";

  const deliveryAddress = normalizeDeliveryAddress(dto.address);

  const paymentMethod =
    dto.paymentMethod === "card" ? "razorpay" : dto.paymentMethod;
  const isCash = paymentMethod === "cash";

  if (isCash) {
    const user = await FoodUser.findById(userId).select('isCodBlocked').lean();
    if (user?.isCodBlocked) {
      throw new ValidationError("Cash on Delivery (COD) is blocked for this account. Please use online payment.");
    }
  }

  const isWallet = paymentMethod === "wallet";
  const pickupPoints = buildPickupPointsFromItems(items, sourceMap);
  const combinedPickup = await evaluateCombinedPickupEligibility(
    pickupPoints,
    deliveryAddress,
  );
  const requestedDeliveryFleet =
    dto.deliveryFleet ||
    (orderType === "mixed" ? "normal" : orderType === "quick" ? "quick" : "standard");
  if (orderType === "mixed" && requestedDeliveryFleet === "express" && !combinedPickup.eligible) {
    throw new ValidationError(combinedPickup.reason || "Express delivery is not available for this mixed order");
  }
  const dispatchStrategy =
    orderType !== "mixed"
      ? "single"
      : requestedDeliveryFleet === "express"
        ? "express_split"
        : combinedPickup.eligible
          ? "single"
          : "split";

  // Ensure pricing is present and consistent.
  const computedSubtotal = items.reduce((sum, item) => {
    const price = Number(item?.price);
    const qty = Number(item?.quantity);
    if (!Number.isFinite(price) || !Number.isFinite(qty)) return sum;
    return sum + Math.max(0, price) * Math.max(0, qty);
  }, 0);
  const normalizedPricing = {
    subtotal: Number(dto.pricing?.subtotal ?? computedSubtotal),
    tax: Number(dto.pricing?.tax ?? 0),
    packagingFee: Number(dto.pricing?.packagingFee ?? 0),
    deliveryFee: Number(dto.pricing?.deliveryFee ?? 0),
    platformFee: Number(dto.pricing?.platformFee ?? 0),
    discount: Number(dto.pricing?.discount ?? 0),
    total: Number(dto.pricing?.total ?? 0),
    currency: String(dto.pricing?.currency || "INR"),
  };
  const computedTotal = Math.max(
    0,
    (Number.isFinite(normalizedPricing.subtotal)
      ? normalizedPricing.subtotal
      : 0) +
    (Number.isFinite(normalizedPricing.tax) ? normalizedPricing.tax : 0) +
    (Number.isFinite(normalizedPricing.packagingFee)
      ? normalizedPricing.packagingFee
      : 0) +
    (Number.isFinite(normalizedPricing.deliveryFee)
      ? normalizedPricing.deliveryFee
      : 0) +
    (Number.isFinite(normalizedPricing.platformFee)
      ? normalizedPricing.platformFee
      : 0) -
    (Number.isFinite(normalizedPricing.discount)
      ? normalizedPricing.discount
      : 0),
  );
  if (
    !Number.isFinite(normalizedPricing.total) ||
    normalizedPricing.total <= 0
  ) {
    normalizedPricing.total = computedTotal;
  }

  const payment = {
    method: paymentMethod,
    status: isCash ? "cod_pending" : isWallet ? "paid" : "created",
    amountDue: normalizedPricing.total ?? 0,
    razorpay: {},
    qr: {},
  };

  let distanceKm = null;
  if (
    (orderType === "food" || orderType === "mixed") &&
    primaryRestaurant?.location?.coordinates?.length === 2 &&
    dto.address?.location?.coordinates?.length === 2
  ) {
    const [rLng, rLat] = primaryRestaurant.location.coordinates;
    const [dLng, dLat] = dto.address.location.coordinates;
    const d = haversineKm(rLat, rLng, dLat, dLng);
    distanceKm = Number.isFinite(d) ? d : null;
  } else {
    console.warn(
      `Food order ${orderId}: distance not available, rider earning set to 0`,
    );
  }

  const baseRiderEarning =
    orderType === "food" || orderType === "quick" || orderType === "mixed"
      ? await foodTransactionService.getRiderEarning(distanceKm)
      : 0;

  const activeFeeSettings = await FoodFeeSettings.findOne({ isActive: true })
    .sort({ createdAt: -1 })
    .lean();

  let incentiveAmount = 0;
  if (
    activeFeeSettings &&
    activeFeeSettings.isIncentiveEnabled &&
    normalizedPricing.subtotal >= (activeFeeSettings.incentiveThreshold || 0)
  ) {
    incentiveAmount = Number(
      (
        normalizedPricing.subtotal *
        ((activeFeeSettings.incentivePercentage || 0) / 100)
      ).toFixed(2)
    );
  }

  const riderEarning = baseRiderEarning + incentiveAmount;
  const quickDeliveryFeeBase =
    orderType === "mixed" && dispatchStrategy === "express_split"
      ? Number(activeFeeSettings?.deliveryFee || 25)
      : 0;
  const quickLegDeliveryFee =
    orderType === "mixed" && dispatchStrategy === "express_split"
      ? quickDeliveryFeeBase
      : 0;
  const foodLegDeliveryFee =
    orderType === "mixed" && dispatchStrategy === "express_split"
      ? Math.max(0, Number(normalizedPricing.deliveryFee || 0) - quickLegDeliveryFee)
      : 0;

  // Calculate restaurant commission from subtotal
  const { commissionAmount: restaurantCommission } =
    hasFoodItems
      ? await foodTransactionService.getRestaurantCommissionSnapshot({
        pricing: normalizedPricing,
        restaurantId: primaryRestaurantId,
      })
      : { commissionAmount: 0 };

  normalizedPricing.restaurantCommission = restaurantCommission || 0;

  const platformProfit = Math.max(
    0,
    (Number.isFinite(normalizedPricing.deliveryFee) ? normalizedPricing.deliveryFee : 0) +
    (Number.isFinite(normalizedPricing.platformFee) ? normalizedPricing.platformFee : 0) +
    restaurantCommission -
    riderEarning,
  );

  const dispatchPlan = {
    strategy: dispatchStrategy,
    combinedPickupEligible: combinedPickup.eligible,
    pickupDistanceKm: combinedPickup.pickupDistanceKm,
    sameDirection: combinedPickup.sameDirection,
    reason: combinedPickup.reason,
    legs: pickupPoints.map((point) => ({
      legId: `${point.pickupType}:${point.sourceId}`,
      pickupType: point.pickupType,
      sourceId: point.sourceId,
      sourceName: point.sourceName || "",
      deliveryFee:
        dispatchStrategy === "express_split"
          ? point.pickupType === "quick"
            ? quickLegDeliveryFee
            : foodLegDeliveryFee
          : 0,
      riderEarning:
        dispatchStrategy === "express_split"
          ? point.pickupType === "quick"
            ? quickLegDeliveryFee
            : foodLegDeliveryFee
          : 0,
      assignedAt: null,
      deliveryPartnerId: null,
      partnerCandidates: [],
    })),
  };

  if (dispatchStrategy === "express_split" || dispatchStrategy === "split") {
    const legCandidates = await Promise.all(
      pickupPoints.map(async (point) => ({
        legId: `${point.pickupType}:${point.sourceId}`,
        partnerCandidates: await listNearbyPartnersForPoint(point),
      })),
    );
    for (const leg of dispatchPlan.legs) {
      const found = legCandidates.find((candidate) => candidate.legId === leg.legId);
      if (found) leg.partnerCandidates = found.partnerCandidates;
    }
  }

  const order = new FoodOrder({
    orderType,
    orderId,

    userId: new mongoose.Types.ObjectId(userId),
    restaurantId:
      hasFoodItems && primaryRestaurantId ? new mongoose.Types.ObjectId(primaryRestaurantId) : null,
    zoneId:
      hasFoodItems
        ? dto.zoneId
          ? new mongoose.Types.ObjectId(dto.zoneId)
          : primaryRestaurant?.zoneId || undefined
        : undefined,
    items,
    pickupPoints,
    ...(deliveryAddress ? { deliveryAddress } : {}),
    pricing: normalizedPricing,
    payment,
    orderStatus: dto.scheduledAt ? "scheduled" : "created",
    ...(orderType === "food" || orderType === "mixed"
      ? { dispatch: { modeAtCreation: dispatchMode, status: "unassigned" } }
      : {}),
    dispatchPlan,
    statusHistory: [
      {
        at: new Date(),
        byRole: "SYSTEM",
        from: "",
        to: "created",
        note: "Order placed",
      },
    ],
    note: dto.note || "",
    sendCutlery: dto.sendCutlery !== false,
    deliveryFleet:
      orderType === "mixed"
        ? requestedDeliveryFleet
        : orderType === "food"
          ? dto.deliveryFleet || "standard"
          : "quick",
    scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
    riderEarning,
    riderEarningBreakdown: {
      baseEarning: baseRiderEarning,
      incentive: incentiveAmount
    },
    platformProfit,
  });

  let razorpayPayload = null;

  if (paymentMethod === "razorpay" && isRazorpayConfigured()) {
    const amountPaise = Math.round((normalizedPricing.total ?? 0) * 100);
    if (amountPaise < 100)
      throw new ValidationError("Amount too low for online payment");
    try {
      const rzOrder = await createRazorpayOrder(amountPaise, "INR", orderId);
      order.payment.razorpay = {
        orderId: rzOrder.id,
        paymentId: "",
        signature: "",
      };
      order.payment.status = "created";
      razorpayPayload = {
        key: getRazorpayKeyId(),
        orderId: rzOrder.id,
        amount: rzOrder.amount,
        currency: rzOrder.currency || "INR",
      };
    } catch (err) {
      throw new ValidationError(err?.message || "Payment gateway error");
    }
  }

  await order.save();



  await foodTransactionService.createInitialTransaction(order);
  const sellerOrders = hasQuickItems
    ? await upsertSellerOrdersForParent(order, {
      customerName: dto.customerName,
      customerPhone: dto.customerPhone || dto.address?.phone,
    })
    : [];

  if (paymentMethod === "razorpay" && order.payment?.razorpay?.orderId) {
    // Audit can still happen here or via FinanceService events
  }

  // Realtime + push notifications.
  try {
    // Notify customer. For online payments, order is created but awaits payment confirmation.
    const isAwaitingOnlinePayment =
      String(order.payment?.method || "").toLowerCase() === "razorpay" &&
      String(order.payment?.status || "").toLowerCase() !== "paid";
    await notifyOwnersSafely([{ ownerType: "USER", ownerId: userId }], {
      title: isAwaitingOnlinePayment
        ? "Complete Payment to Confirm Order"
        : orderType === "mixed"
          ? "Mixed Order Confirmed!"
          : orderType === "quick"
            ? "Quick Order Confirmed!"
            : "Order Confirmed!",
      body: isAwaitingOnlinePayment
        ? orderType === "mixed"
          ? `Order #${orderId} is created. Complete payment to confirm your mixed delivery.`
          : orderType === "quick"
            ? `Order #${orderId} is created. Please complete payment to confirm your quick order.`
            : `Order #${orderId} is created. Please complete payment to send it to ${primaryRestaurant?.sourceName || "the restaurant"}.`
        : orderType === "mixed"
          ? `Your mixed order #${orderId} has been placed successfully.`
          : orderType === "quick"
            ? `Your quick order #${orderId} has been placed successfully.`
            : `Your order #${orderId} from ${primaryRestaurant?.sourceName || "the restaurant"} has been placed successfully.`,
      image: "https://i.ibb.co/3m2Yh7r/SUPERFAST-Brand-Image.png",
      data: {
        type: isAwaitingOnlinePayment
          ? "order_created_pending_payment"
          : "order_created",
        orderId: String(orderId),
        orderMongoId: order._id?.toString?.() || "",
        link: `/food/user/orders/${order._id?.toString?.() || ""}`,
      },
    });

    // Restaurant gets new-order request only when payment flow is eligible.
    if (hasFoodItems) {
      await notifyRestaurantNewOrder(order);
    }
    if (hasQuickItems) {
      await notifySellerNewOrders(order, sellerOrders);
    }

    // Schedule delayed notification if it's a scheduled order
    if (order.orderStatus === "scheduled" && order.scheduledAt) {
      const now = Date.now();
      const scheduledTime = new Date(order.scheduledAt).getTime();
      const notificationTime = scheduledTime - 15 * 60 * 1000;
      const delay = Math.max(0, notificationTime - now);

      enqueueOrderEvent("NOTIFY_SCHEDULED_ORDER", {
        orderId: order.orderId,
        orderMongoId: order._id.toString(),
      }, { delay });

      logger.info(`Scheduled notification for order ${order.orderId} with delay of ${delay}ms`);
    }
  } catch {
    // Don't block order placement on socket failures.
  }
  const couponCode = dto.pricing?.couponCode
    ? String(dto.pricing.couponCode).trim().toUpperCase()
    : "";
  if ((orderType === "food" || orderType === "mixed") && couponCode) {
    const offer = await FoodOffer.findOne({ couponCode }).lean();
    if (offer) {
      await FoodOffer.updateOne({ _id: offer._id }, { $inc: { usedCount: 1 } });
      if (userId) {
        await FoodOfferUsage.updateOne(
          { offerId: offer._id, userId: new mongoose.Types.ObjectId(userId) },
          { $inc: { count: 1 }, $set: { lastUsedAt: new Date() } },
          { upsert: true },
        );
      }
    }
  }

  if (
    (orderType === "food" || (orderType === "mixed" && dispatchStrategy === "single")) &&
    dispatchMode === "auto" &&
    (isCash ||
      order.payment.status === "paid" ||
      order.payment.status === "cod_pending")
  ) {
    try {
      await tryAutoAssign(order._id);
    } catch {
      // leave unassigned
    }
  }

  const saved = order.toObject();
  return { order: saved, razorpay: razorpayPayload };
}

// ----- Verify payment -----
export async function verifyPayment(userId, dto) {
  const identity = buildOrderIdentityFilter(dto.orderId);
  if (!identity) throw new ValidationError("Order id required");

  const order = await FoodOrder.findOne({
    ...identity,
    userId: new mongoose.Types.ObjectId(userId),
  });
  if (!order) throw new NotFoundError("Order not found");
  if (order.payment.status === "paid")
    return { order: order.toObject(), payment: order.payment };

  const valid = verifyPaymentSignature(
    dto.razorpayOrderId,
    dto.razorpayPaymentId,
    dto.razorpaySignature,
  );
  if (!valid) throw new ValidationError("Payment verification failed");

  order.payment.status = "paid";
  order.payment.razorpay.paymentId = dto.razorpayPaymentId;
  order.payment.razorpay.signature = dto.razorpaySignature;
  pushStatusHistory(order, {
    byRole: "USER",
    byId: userId,
    from: order.orderStatus,
    to: order.orderStatus === "scheduled" ? "scheduled" : "created",
    note: "Payment verified",
  });
  await order.save();

  await foodTransactionService.updateTransactionStatus(order._id, 'captured', {
    status: 'captured',
    razorpayPaymentId: dto.razorpayPaymentId,
    razorpaySignature: dto.razorpaySignature,
    recordedByRole: "USER",
    recordedById: new mongoose.Types.ObjectId(userId)
  });

  // After online payment is verified, now notify restaurant about the new order.
  if (order.orderType === "food" || order.orderType === "mixed") {
    await notifyRestaurantNewOrder(order);
  }
  if (order.orderType === "quick" || order.orderType === "mixed") {
    const sellerOrders = await upsertSellerOrdersForParent(order);
    await notifySellerNewOrders(order, sellerOrders);
  }

  // Schedule delayed notification if it's a scheduled order and payment is now verified
  if (order.orderStatus === "scheduled" && order.scheduledAt) {
    const now = Date.now();
    const scheduledTime = new Date(order.scheduledAt).getTime();
    const notificationTime = scheduledTime - 15 * 60 * 1000;
    const delay = Math.max(0, notificationTime - now);

    enqueueOrderEvent("NOTIFY_SCHEDULED_ORDER", {
      orderId: order.orderId,
      orderMongoId: order._id.toString(),
    }, { delay });

    logger.info(`Scheduled notification for verified order ${order.orderId} with delay of ${delay}ms`);
  }

  // Notify Customer about payment success
  await notifyOwnersSafely([{ ownerType: "USER", ownerId: userId }], {
    title: "Payment Successful! ✅",
    body: `We have received your payment of ₹${order.payment.amountDue} for Order #${order.orderId}.`,
    image: "https://i.ibb.co/3m2Yh7r/SUPERFAST-Brand-Image.png",
    data: {
      type: "payment_success",
      orderId: String(order.orderId),
      orderMongoId: String(order._id),
    },
  });

  const settings =
    order.orderType === "food" ||
      (order.orderType === "mixed" && order.dispatchPlan?.strategy === "single")
      ? await getDispatchSettings()
      : null;
  if (settings?.dispatchMode === "auto") {
    try {
      await tryAutoAssign(order._id);
    } catch { }
  }

  return { order: order.toObject(), payment: order.payment };
}

// ----- Auto-assign -----
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Start or continue a smart cascading dispatch.
 * @param {string} orderId - Mongo ID of the order.
 * @param {object} options - Options (retry count, etc)
 */
export async function tryAutoAssign(orderId, options = {}) {
  const order = await FoodOrder.findById(orderId).populate(['restaurantId', 'userId']);
  if (!order) return null;

  // Guard: only dispatch if unassigned OR if we are doing a timeout-reassign.
  const isUnassigned = order.dispatch?.status === 'unassigned';
  const isAssignedButUnaccepted = order.dispatch?.status === 'assigned' && !order.dispatch?.acceptedAt;

  if (!isUnassigned && !isAssignedButUnaccepted) {
    return order;
  }

  // Find ineligible partners (who already rejected it or were already offered if we want fresh ones)
  const offeredIds = (order.dispatch?.offeredTo || []).map(o => o.partnerId.toString());

  // Find nearby online partners
  const { partners } = await listNearbyOnlineDeliveryPartners(order.restaurantId, { maxKm: 15, limit: 10 });

  // Filter out already offered/rejected partners
  const eligible = partners.filter(p => !offeredIds.includes(p.partnerId.toString()));

  if (eligible.length === 0) {
    // No more specific partners to offer to? 
    // If it's still unassigned, we leave it in the marketplace pool (broadcast was already sent)
    // or we could expand the search radius.
    logger.info(`SmartDispatch: No more eligible partners for order ${order.orderId}. Leaving in marketplace.`);
    return order;
  }

  // Pick the best (first in sorted list)
  const best = eligible[0];

  // Assign to this partner
  order.dispatch.status = 'assigned';
  order.dispatch.deliveryPartnerId = best.partnerId;
  order.dispatch.assignedAt = new Date();

  // Record in history
  order.dispatch.offeredTo.push({
    partnerId: best.partnerId,
    at: new Date(),
    action: 'offered'
  });

  await order.save();

  // 🚀 Notify the specific partner instantly
  try {
    const io = getIO();
    if (io) {
      const restaurant = order.restaurantId;
      const payload = buildDeliverySocketPayload(order, restaurant);
      io.to(rooms.delivery(best.partnerId)).emit('new_order', payload);
      io.to(rooms.delivery(best.partnerId)).emit('play_notification_sound', {
        orderId: payload.orderId,
        orderMongoId: payload.orderMongoId
      });
    }
    await notifyOwnerSafely(
      { ownerType: 'DELIVERY_PARTNER', ownerId: best.partnerId },
      {
        title: 'New order assigned! 🛵',
        body: `You have 30 seconds to accept Order #${order.orderId}.`,
        data: {
          type: 'new_order',
          orderId: order.orderId,
          orderMongoId: order._id.toString(),
          link: '/delivery'
        }
      }
    );
  } catch (err) {
    logger.error(`SmartDispatch: Failed to notify partner ${best.partnerId}: ${err.message}`);
  }

  // ⏱️ Schedule a timeout check in 30 seconds
  await addOrderJob({
    action: 'DISPATCH_TIMEOUT_CHECK',
    orderMongoId: order._id.toString(),
    orderId: order.orderId,
    partnerId: best.partnerId.toString()
  }, { delay: 30000 }); // 30 seconds

  return order;
}

/**
 * Triggered by worker after 30 seconds of zero response.
 */
export async function processDispatchTimeout(orderId, partnerId) {
  const order = await FoodOrder.findById(orderId);
  if (!order) return;

  // Check if the order is still assigned to this specific partner and not accepted
  const stillAssigned = order.dispatch?.status === 'assigned' &&
    String(order.dispatch?.deliveryPartnerId) === String(partnerId) &&
    !order.dispatch?.acceptedAt;

  if (stillAssigned) {
    logger.info(`SmartDispatch: Timeout for order ${order.orderId} (Partner: ${partnerId}). Moving to next.`);

    // Mark as timeout in history
    const offer = order.dispatch.offeredTo.find(o => String(o.partnerId) === String(partnerId) && o.action === 'offered');
    if (offer) offer.action = 'timeout';

    // Unassign and trigger next step
    order.dispatch.status = 'unassigned';
    order.dispatch.deliveryPartnerId = null;
    await order.save();

    // 🔄 Recursively try next partner
    await tryAutoAssign(orderId);
  }
}

// ----- User: list, get, cancel -----
export async function listOrdersUser(userId, query) {
  const { page, limit, skip } = buildPaginationOptions(query);
  const filter = { userId: new mongoose.Types.ObjectId(userId) };
  const [docs, total] = await Promise.all([
    FoodOrder.find(filter)
      .populate(
        "restaurantId",
        "restaurantName profileImage area city location rating totalRatings",
      )
      .populate("dispatch.deliveryPartnerId", "name phone rating totalRatings")
      .populate("dispatchPlan.legs.deliveryPartnerId", "name phone rating totalRatings")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    FoodOrder.countDocuments(filter),
  ]);
  return buildPaginatedResult({
    docs: docs.map((doc) => normalizeOrderForClient(doc)),
    total,
    page,
    limit,
  });
}

export async function getOrderById(
  orderId,
  { userId, restaurantId, deliveryPartnerId, admin } = {},
) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");
  const order = await FoodOrder.findOne(identity)
    .populate(
      "restaurantId",
      "restaurantName profileImage area city location rating totalRatings",
    )
    .populate("dispatch.deliveryPartnerId", "name phone rating totalRatings")
    .populate("dispatchPlan.legs.deliveryPartnerId", "name phone rating totalRatings")
    .populate("userId", "name phone email")
    .select("+deliveryOtp")
    .lean();
  if (!order) throw new NotFoundError("Order not found");
  await populateQuickOrderSellers(order);

  if (admin) return normalizeOrderForClient(order);

  const orderUserId = order.userId?._id?.toString() || order.userId?.toString();
  const orderRestaurantId = order.restaurantId?._id?.toString() || order.restaurantId?.toString();
  const orderPartnerId = order.dispatch?.deliveryPartnerId?._id?.toString() || order.dispatch?.deliveryPartnerId?.toString();
  const assignedLegPartnerId = deliveryPartnerId
    ? toIdString(getAssignedDispatchLeg(order, deliveryPartnerId)?.deliveryPartnerId)
    : "";

  if (userId && orderUserId !== userId.toString())
    throw new ForbiddenError("Not your order");
  if (restaurantId && orderRestaurantId !== restaurantId.toString())
    throw new ForbiddenError("Not your restaurant order");
  if (
    deliveryPartnerId &&
    orderPartnerId !== deliveryPartnerId.toString() &&
    assignedLegPartnerId !== deliveryPartnerId.toString()
  )
    throw new ForbiddenError("Not assigned to you");

  if (deliveryPartnerId || restaurantId) {
    if (deliveryPartnerId) {
      return buildDeliveryOrderView(order, deliveryPartnerId, {
        assignedDispatchLeg: getAssignedDispatchLeg(order, deliveryPartnerId),
      });
    }
    return sanitizeOrderForExternal(order);
  }

  if (userId) {
    const drop = order.deliveryVerification?.dropOtp || {};
    const secret = String(order.deliveryOtp || "").trim();
    const out = normalizeOrderForClient(order);
    delete out.deliveryOtp;
    out.deliveryVerification = {
      ...(order.deliveryVerification || {}),
      dropOtp: {
        required: Boolean(drop.required),
        verified: Boolean(drop.verified),
      },
    };
    if (drop.required && !drop.verified && secret) {
      out.handoverOtp = secret;
    }
    return out;
  }

  return sanitizeOrderForExternal(order);
}

export async function cancelOrder(orderId, userId, reason, refundTo) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");

  const order = await FoodOrder.findOne({
    ...identity,
    userId: new mongoose.Types.ObjectId(userId),
  });
  if (!order) throw new NotFoundError("Order not found");

  const orderStatus = String(order.orderStatus || "").trim().toLowerCase();
  const alwaysCancelableStatuses = ["created", "placed"];
  const cancelWindowStatuses = ["confirmed", "preparing", "ready_for_pickup", "picked_up"];
  const dispatchStatus = String(order.dispatch?.status || "").trim().toLowerCase();
  const hasAcceptedDeliveryPartner =
    dispatchStatus === "accepted" ||
    Boolean(order.dispatch?.acceptedAt) ||
    Boolean(order.dispatch?.deliveryPartnerId);
  const canCancelBeforeDispatchStarts =
    ["confirmed", "preparing", "ready_for_pickup"].includes(orderStatus) &&
    !hasAcceptedDeliveryPartner;

  if (!alwaysCancelableStatuses.includes(orderStatus)) {
    const cancelWindowStartEntry = [...(order.statusHistory || [])]
      .reverse()
      .find((entry) => cancelWindowStatuses.includes(String(entry?.to || "").trim().toLowerCase()));
    const cancelWindowStartAt = cancelWindowStartEntry?.at || order.updatedAt || order.createdAt || null;
    const cancelWindowStartMs = cancelWindowStartAt ? new Date(cancelWindowStartAt).getTime() : NaN;
    const isWithinCancelWindow =
      cancelWindowStatuses.includes(orderStatus) &&
      Number.isFinite(cancelWindowStartMs) &&
      Date.now() - cancelWindowStartMs <= USER_CANCEL_EDIT_WINDOW_MS;

    if (!isWithinCancelWindow && !canCancelBeforeDispatchStarts) {
      throw new ValidationError("Order cannot be cancelled");
    }
  }

  const from = order.orderStatus;
  order.orderStatus = "cancelled_by_user";
  pushStatusHistory(order, {
    byRole: "USER",
    byId: userId,
    from,
    to: "cancelled_by_user",
    note: reason || "",
  });

  const paymentMethod = String(order.payment?.method || "").trim().toLowerCase();
  const isOnlinePaid =
    ["razorpay", "razorpay_qr"].includes(paymentMethod) &&
    (order.payment.status === "paid" || order.payment.status === "refunded");
  const requestedRefundMethod =
    refundTo === "wallet" || refundTo === "gateway" ? refundTo : "gateway";

  if (isOnlinePaid) {
    order.payment.refund = {
      ...(order.payment.refund || {}),
      status: "pending",
      amount: Number(order.pricing?.total || 0),
      refundId: "",
      requestedMethod: requestedRefundMethod,
      processedMethod: undefined,
      requestedAt: new Date(),
      requestedByUser: true,
      reason: reason || "",
      processedAt: null,
    };
  } else if (!["paid", "refunded"].includes(order.payment.status)) {
    // For COD or unpaid online orders, mark payment as cancelled
    order.payment.status = "cancelled";
  }

  // User-cancelled online refunds are handled from admin so the 30-second policy can be enforced.
  if (
    false &&
    order.payment.status === "paid" &&
    order.payment.method === "razorpay" &&
    order.payment.razorpay?.paymentId &&
    (!order.payment.refund || order.payment.refund.status !== "processed")
  ) {
    try {
      const refundResult = await initiateRazorpayRefund(
        order.payment.razorpay.paymentId,
        order.pricing.total
      );

      if (refundResult.success) {
        order.payment.status = "refunded";
        order.payment.refund = {
          status: "processed",
          amount: order.pricing.total,
          refundId: refundResult.refundId,
          processedAt: new Date()
        };
      } else {
        // Log failure but let order cancellation proceed
        order.payment.refund = {
          status: "failed",
          amount: order.pricing.total
        };
      }
    } catch (err) {
      console.error(`Refund processing error for Order ${orderId}:`, err);
      order.payment.refund = { status: "failed", amount: order.pricing.total };
    }
  }

  await order.save();

  // Sync mixed order seller legs if applicable
  if (order.orderType === 'mixed' || order.orderType === 'quick') {
    await cancelSellerOrdersForParent(order, "Cancelled by user");
  }

  enqueueOrderEvent("order_cancelled_by_user", {
    orderMongoId: order._id?.toString?.(),
    orderId: order.orderId,
    userId,
    reason: reason || "",
    refundTo: isOnlinePaid ? requestedRefundMethod : undefined,
  });

  // Sync transaction status
  try {
    await foodTransactionService.updateTransactionStatus(order._id, 'cancelled_by_user', {
      status:
        order.payment.status === "refunded"
          ? 'refunded'
          : isOnlinePaid
            ? 'captured'
            : 'failed',
      note: `Order cancelled by user: ${reason || "No reason"}`,
      recordedByRole: 'USER',
      recordedById: userId
    });
  } catch (err) {
    logger.warn(`cancelOrder transaction sync failed: ${err?.message || err}`);
  }

  // Notify User and Restaurant about the cancellation
  const refundPolicyDetail =
    isOnlinePaid
      ? ` Refund review will follow the cancellation policy: full refund within ${USER_CANCEL_FULL_REFUND_WINDOW_MS / 1000} seconds, otherwise admin may process a partial refund. Requested destination: ${requestedRefundMethod === "wallet" ? "wallet" : "original payment method"}.`
      : "";

  await notifyOwnersSafely(
    [
      { ownerType: "USER", ownerId: userId },
      { ownerType: "RESTAURANT", ownerId: order.restaurantId },
    ],
    {
      title: "Order Cancelled ❌",
      body: `Order #${order.orderId} has been cancelled successfully.${refundPolicyDetail}`,
      image: "https://i.ibb.co/3m2Yh7r/SUPERFAST-Brand-Image.png",
      data: {
        type: "order_cancelled",
        orderId: String(order.orderId),
        orderMongoId: String(order._id),
      },
    },
  );

  // Real-time: status update via socket
  try {
    const io = getIO();
    if (io) {
      const payload = {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        message: `Order #${order.orderId} has been cancelled successfully.${refundPolicyDetail}`
      };
      io.to(rooms.user(userId)).emit("order_status_update", payload);
      io.to(rooms.restaurant(order.restaurantId)).emit("order_status_update", payload);
    }
  } catch (err) {
    logger.warn(`cancelOrder socket emit failed: ${err?.message || err}`);
  }

  return order.toObject();
}

export async function submitOrderRatings(orderId, userId, dto) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");

  const order = await FoodOrder.findOne({
    ...identity,
    userId: new mongoose.Types.ObjectId(userId),
  });
  if (!order) throw new NotFoundError("Order not found");
  if (String(order.orderStatus) !== "delivered") {
    throw new ValidationError("You can rate only delivered orders");
  }

  const hasDeliveryPartner = !!order.dispatch?.deliveryPartnerId;
  if (hasDeliveryPartner && !dto.deliveryPartnerRating) {
    throw new ValidationError("Delivery partner rating is required");
  }

  const restaurantAlreadyRated = Number.isFinite(
    Number(order?.ratings?.restaurant?.rating),
  );
  const deliveryAlreadyRated = Number.isFinite(
    Number(order?.ratings?.deliveryPartner?.rating),
  );
  if (restaurantAlreadyRated || (hasDeliveryPartner && deliveryAlreadyRated)) {
    throw new ValidationError("Ratings already submitted for this order");
  }

  const now = new Date();
  order.ratings = order.ratings || {};
  order.ratings.restaurant = {
    rating: dto.restaurantRating,
    comment: dto.restaurantComment || "",
    ratedAt: now,
  };

  if (hasDeliveryPartner) {
    order.ratings.deliveryPartner = {
      rating: dto.deliveryPartnerRating,
      comment: dto.deliveryPartnerComment || "",
      ratedAt: now,
    };
  }

  await Promise.all([
    applyAggregateRating(
      FoodRestaurant,
      order.restaurantId,
      dto.restaurantRating,
    ),
    hasDeliveryPartner
      ? applyAggregateRating(
        FoodDeliveryPartner,
        order.dispatch.deliveryPartnerId,
        dto.deliveryPartnerRating,
      )
      : Promise.resolve(),
  ]);

  await order.save();
  enqueueOrderEvent('order_ratings_submitted', {
    orderMongoId: order._id?.toString?.(),
    orderId: order.orderId,
    userId,
    restaurantRating: dto.restaurantRating,
    deliveryPartnerRating: hasDeliveryPartner ? dto.deliveryPartnerRating : null
  });
}

// ----- Restaurant -----
export async function listOrdersRestaurant(restaurantId, query) {
  const { page, limit, skip } = buildPaginationOptions(query);
  const filter = {
    restaurantId: new mongoose.Types.ObjectId(restaurantId),
    $or: [
      { "payment.method": { $in: ["cash", "wallet"] } },
      { "payment.status": { $in: ["paid", "authorized", "captured", "settled", "refunded"] } },
    ],
  };
  const [docs, total] = await Promise.all([
    FoodOrder.find(filter)
      .populate("userId", "name phone email profileImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    FoodOrder.countDocuments(filter),
  ]);
  return buildPaginatedResult({ docs, total, page, limit });
}

export async function updateOrderStatusRestaurant(
  orderId,
  restaurantId,
  orderStatus,
) {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new ValidationError("Invalid order id");
  }
  if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
    throw new ValidationError("Invalid restaurant id");
  }
  let order = await FoodOrder.findOne({
    _id: new mongoose.Types.ObjectId(orderId),
    restaurantId: new mongoose.Types.ObjectId(restaurantId),
  });
  if (!order) throw new NotFoundError("Order not found");
  const from = order.orderStatus;

  if (!isStatusAdvance(from, orderStatus)) {
    throw new ValidationError(`Current order status '${from}' is further ahead than '${orderStatus}'. Order cannot be moved backwards or updated after cancellation.`);
  }

  order.orderStatus = orderStatus;
  pushStatusHistory(order, {
    byRole: "RESTAURANT",
    byId: restaurantId,
    from,
    to: orderStatus,
  });
  await order.save();

  // Real-time: status update to restaurant room.
  try {
    const io = getIO();
    if (io) {
      console.log(
        `[DEBUG] Emitting status update to restaurant ${restaurantId} and user ${order.userId}: ${orderStatus}`,
      );
      const payload = {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        title: `Order ${order.orderId} updated`,
        message: `Status changed to ${String(orderStatus).replace(/_/g, " ")}`,
      };
      io.to(rooms.restaurant(restaurantId)).emit(
        "order_status_update",
        payload,
      );
      io.to(rooms.user(order.userId)).emit("order_status_update", payload);
    }

    let title = `Order ${order.orderId} updated`;
    let body = `Status changed to ${String(orderStatus).replace(/_/g, " ")}`;

    // Custom messages for customer based on status
    if (orderStatus === "confirmed") {
      title = "Order Accepted! 🧑‍🍳";
      body =
        "The restaurant has accepted your order and is starting to prepare it.";
    } else if (orderStatus === "preparing") {
      title = "Food is being prepared! 🍳";
      body = "Your food is currently being prepared by the restaurant.";
    } else if (orderStatus === "ready_for_pickup" || orderStatus === "ready") {
      title = "Food is ready! 🛍️";
      body = "Your order is ready and waiting to be picked up.";
    } else if (String(orderStatus).includes("cancel")) {
      const isOnlinePaid =
        order.payment?.method === "razorpay" &&
        (order.payment?.status === "paid" ||
          order.payment?.status === "refunded");
      const refundDetail = isOnlinePaid ? ` Your refund of ₹${order.pricing.total} is being processed and will be credited to your original payment method within 5-7 working days.` : "";

      title = "Order Cancelled ❌";
      body = `Unfortunately, your order has been cancelled by the restaurant.${refundDetail}`;

      // Update payment status for cancellation
      if (!isOnlinePaid) {
        order.payment.status = "cancelled";
      }

      // Sync mixed order seller legs
      if (order.orderType === 'mixed' || order.orderType === 'quick') {
        console.log(`[MIXED-SYNC] Order ${order.orderId} (type: ${order.orderType}) cancelled by restaurant. Propagating to seller legs...`);
        await cancelSellerOrdersForParent(order, "Cancelled by restaurant");
      }
    }

    await notifyOwnersSafely(
      [{ ownerType: "USER", ownerId: order.userId }],
      {
        title: title,
        body: body,
        image: "https://i.ibb.co/3m2Yh7r/SUPERFAST-Brand-Image.png",
        data: {
          type: "order_status_update",
          orderId: order.orderId,
          orderMongoId: order._id?.toString?.() || "",
          orderStatus: String(orderStatus || ""),
          link: `/food/user/orders/${order._id?.toString?.() || ""}`,
        },
      },
    );

    await notifyOwnersSafely(
      [{ ownerType: "RESTAURANT", ownerId: restaurantId }],
      {
        title: title,
        body: body,
        image: "https://i.ibb.co/3m2Yh7r/SUPERFAST-Brand-Image.png",
        data: {
          type: "order_status_update",
          orderId: order.orderId,
          orderMongoId: order._id?.toString?.() || "",
          orderStatus: String(orderStatus || ""),
          link: `/restaurant/orders/${order._id?.toString?.() || ""}`,
        },
      },
    );

    const assignedRiderId = order.dispatch?.deliveryPartnerId;
    if (assignedRiderId) {
      let riderTitle = `Order updated`;
      let riderBody = `The order status is now ${String(orderStatus).replace(/_/g, " ")}.`;

      if (String(orderStatus).includes("cancel")) {
        riderTitle = "Order Cancelled ❌";
        riderBody = `The order has been cancelled. Please stop your current task.`;

        // Sync transaction status
        try {
          const isOnlinePaid =
            order.payment?.method === "razorpay" &&
            (order.payment?.status === "paid" ||
              order.payment?.status === "refunded");
          await foodTransactionService.updateTransactionStatus(order._id, 'cancelled_by_restaurant', {
            status: isOnlinePaid ? 'refunded' : 'failed',
            note: `Order cancelled by restaurant/admin`,
            recordedByRole: 'RESTAURANT',
            recordedById: restaurantId
          });
        } catch (err) {
          logger.warn(`updateOrderStatusRestaurant transaction sync failed: ${err?.message || err}`);
        }
      }

      await notifyOwnersSafely(
        [{ ownerType: "DELIVERY_PARTNER", ownerId: assignedRiderId }],
        {
          title: riderTitle,
          body: riderBody,
          image: "https://i.ibb.co/3m2Yh7r/SUPERFAST-Brand-Image.png",
          data: {
            type: "order_status_update",
            orderId: order.orderId,
            orderMongoId: order._id?.toString?.() || "",
            orderStatus: String(orderStatus || ""),
            link: `/delivery/orders/${order._id?.toString?.() || ""}`,
          },
        },
      );
    }
  } catch (err) {
    console.error("[DEBUG] Error emitting status update to restaurant:", err);
  }

  // Real-time: delivery request / ready notifications.
  try {
    const io = getIO();
    if (io) {
      // On accept (confirmed or preparing) -> request delivery partners.
      const isInitialDispatchTrigger = ((String(orderStatus) === "preparing" || String(orderStatus) === "confirmed") && (String(from) !== "preparing" && String(from) !== "confirmed"));
      if (isInitialDispatchTrigger) {
        console.log(
          `[DEBUG] Order ${order.orderId} status changed to '${orderStatus}'. Triggering delivery dispatch.`,
        );
        // If auto dispatch, try assign now.
        if (
          order.dispatch?.status === "unassigned" &&
          order.dispatch?.modeAtCreation === "auto"
        ) {
          try {
            console.log(`[DEBUG] Auto-assigning order ${order.orderId}`);
            await tryAutoAssign(order._id);
            // Refresh order state from DB after auto-assignment
            order = await FoodOrder.findById(order._id);
          } catch (err) {
            console.error(
              `[DEBUG] Auto-assign failed for order ${order.orderId}:`,
              err,
            );
          }
        }

        const restaurant = await FoodRestaurant.findById(order.restaurantId)
          .select("restaurantName location addressLine1 area city state")
          .lean();
        const payload = buildDeliverySocketPayload(order, restaurant);

        // If assigned or accepted, notify assigned partner only.
        const assignedId =
          order.dispatch?.deliveryPartnerId?.toString?.() ||
          order.dispatch?.deliveryPartnerId;
        if (order.dispatch?.status === "accepted") {
          console.log(
            `[DEBUG] Order ${order.orderId} is already accepted. Skipping dispatch notifications.`,
          );
        } else if (assignedId && order.dispatch?.status === "assigned") {
          console.log(
            `[DEBUG] Order ${order.orderId} status is 'assigned'. Notifying ${assignedId} only.`,
          );
          io.to(rooms.delivery(assignedId)).emit("new_order", payload);
          io.to(rooms.delivery(assignedId)).emit("play_notification_sound", {
            orderId: payload.orderId,
            orderMongoId: payload.orderMongoId,
          });
          await notifyOwnerSafely(
            { ownerType: "DELIVERY_PARTNER", ownerId: assignedId },
            {
              title: "New delivery task",
              body: `Order ${payload.orderId} is assigned to you.`,
              data: {
                type: "new_order",
                orderId: payload.orderId,
                orderMongoId: payload.orderMongoId,
                link: "/delivery",
              },
            },
          );
        } else {
          if (isSplitDispatchOrder(order)) {
            await notifySplitDispatchOffers(order, { restaurantDoc: restaurant });
          } else {
            // Broadcast to nearby online partners so someone can accept/claim.
            console.log(
              `[DEBUG] Searching for nearby partners for order ${order.orderId}`,
            );
            const { partners } = await listNearbyOnlineDeliveryPartners(
              order.restaurantId,
              { maxKm: 15, limit: 25 },
            );
            console.log(
              `[DEBUG] Found ${partners.length} partners: ${JSON.stringify(partners)}`,
            );
            for (const p of partners) {
              const targetRoom = rooms.delivery(p.partnerId);
              console.log(
                `[DEBUG] Emitting new_order_available and new_order to room: ${targetRoom}`,
              );
              io.to(targetRoom).emit("new_order", {
                ...payload,
                pickupDistanceKm: p.distanceKm,
              });
              io.to(targetRoom).emit("new_order_available", {
                ...payload,
                pickupDistanceKm: p.distanceKm,
              });
            }
            await notifyOwnersSafely(
              partners.slice(0, 5).map((p) => ({
                ownerType: "DELIVERY_PARTNER",
                ownerId: p.partnerId,
              })),
              {
                title: "New delivery order available",
                body: `Order ${payload.orderId} is available near ${restaurant?.restaurantName || "your area"}.`,
                data: {
                  type: "new_order_available",
                  orderId: payload.orderId,
                  orderMongoId: payload.orderMongoId,
                  link: "/delivery",
                },
              },
            );
            // Also trigger a generic sound event for the first few partners.
            for (const p of partners.slice(0, 5)) {
              io.to(rooms.delivery(p.partnerId)).emit("play_notification_sound", {
                orderId: payload.orderId,
                orderMongoId: payload.orderMongoId,
              });
            }
          }
        }
      }

      // When ready for pickup -> ping assigned delivery partner.
      if (String(orderStatus) === 'ready_for_pickup' && String(from) !== 'ready_for_pickup') {
        console.log(`[DEBUG] Order ${order.orderId} changed to 'ready_for_pickup'.`);
        const assignedId = order.dispatch?.deliveryPartnerId?.toString?.() || order.dispatch?.deliveryPartnerId;
        if (assignedId) {
          console.log(`[DEBUG] Notifying assigned partner ${assignedId} that order is ready.`);
          const restaurant = await FoodRestaurant.findById(order.restaurantId).select('restaurantName location addressLine1 area city state').lean();
          const payload = buildDeliverySocketPayload(order, restaurant);
          io.to(rooms.delivery(assignedId)).emit('order_ready', payload);
        } else {
          console.log(`[DEBUG] Order ${order.orderId} is ready but no partner assigned.`);
        }
      }
    }
  } catch (err) {
    console.error('[DEBUG] Error in delivery notification logic:', err);
  }

  enqueueOrderEvent('restaurant_order_status_updated', {
    orderMongoId: order._id?.toString?.(),
    orderId: order.orderId,
    restaurantId,
    from,
    to: orderStatus
  });

  // ✅ NEW: Automated Razorpay Refund on Restaurant Cancel
  // Triggers if the restaurant sets status to a cancelled state (e.g., cancelled_by_restaurant)
  if (
    String(orderStatus).includes("cancel") &&
    order.payment?.status === "paid" &&
    order.payment?.method === "razorpay" &&
    order.payment?.razorpay?.paymentId &&
    (!order.payment?.refund || order.payment?.refund?.status !== "processed")
  ) {
    try {
      const refundResult = await initiateRazorpayRefund(
        order.payment.razorpay.paymentId,
        order.pricing?.total || 0
      );

      if (refundResult.success) {
        order.payment = order.payment || {};
        order.payment.status = "refunded";
        order.payment.refund = {
          status: "processed",
          amount: order.pricing?.total || 0,
          refundId: refundResult.refundId,
          processedAt: new Date()
        };
      } else {
        // Record failure so admin knows a manual refund might be needed
        order.payment = order.payment || {};
        order.payment.refund = {
          status: "failed",
          amount: order.pricing?.total || 0
        };
      }
    } catch (err) {
      console.error(`Automated refund failed for Order ${orderId} (Restaurant Cancel):`, err);
      order.payment = order.payment || {};
      order.payment.refund = {
        status: "failed",
        amount: order.pricing?.total || 0,
      };
    }
    // Re-save order with updated payment status
    await order.save();
  }

  return order.toObject();
}

/**
 * Manually re-trigger delivery partner search for a restaurant order.
 * Only allowed if status is preparing/ready and no partner has accepted yet.
 */
export async function resendDeliveryNotificationRestaurant(orderId, restaurantId) {
  const order = await FoodOrder.findOne({
    _id: new mongoose.Types.ObjectId(orderId),
    restaurantId: new mongoose.Types.ObjectId(restaurantId)
  });

  if (!order) throw new NotFoundError('Order not found');

  // Only allow if order is still active and not already terminal
  const activeStatuses = ['confirmed', 'preparing', 'ready_for_pickup', 'ready'];
  if (!activeStatuses.includes(order.orderStatus)) {
    throw new ValidationError(`Cannot resend notification for order in status: ${order.orderStatus}`);
  }

  // Guard: don't disrupt an active assignment that was already accepted
  if (order.dispatch?.status === 'accepted') {
    throw new ValidationError('A delivery partner has already accepted this order.');
  }

  // Reset dispatch state to unassigned to allow tryAutoAssign to start fresh
  order.dispatch.status = 'unassigned';
  order.dispatch.deliveryPartnerId = null;
  // Clear previously offered partners to give everyone a fresh chance when resending manually.
  order.dispatch.offeredTo = [];

  await order.save();

  if (isSplitDispatchOrder(order)) {
    await notifySplitDispatchOffers(order);
  } else {
    // Trigger smart dispatch logic immediately
    const { tryAutoAssign } = await import('./order-dispatch.service.js');
    const dispatchRes = await tryAutoAssign(order._id, { attempt: 3 });
    return {
      success: true,
      notifiedCount: dispatchRes?.notifiedCount || 0
    };
  }

  return { success: true };
}

export async function getCurrentTripDelivery(deliveryPartnerId) {
  if (!deliveryPartnerId) throw new ValidationError("Delivery partner ID required");
  const partnerId = new mongoose.Types.ObjectId(deliveryPartnerId);

  // Find the active order assigned to or accepted by this rider.
  const order = await FoodOrder.findOne({
    $or: [
      { "dispatch.deliveryPartnerId": partnerId },
      { "dispatchPlan.legs": { $elemMatch: { deliveryPartnerId: partnerId } } },
    ],
    orderStatus: {
      $in: ["confirmed", "preparing", "ready_for_pickup", "picked_up", "reached_pickup", "reached_drop"]
    }
  })
    .populate({ path: "restaurantId", select: "restaurantName name phone location addressLine1 area city state profileImage" })
    .populate({ path: "userId", select: "name phone" })
    .sort({ updatedAt: -1 })
    .lean();

  if (!order) return null;
  await populateQuickOrderSellers(order);
  return buildDeliveryOrderView(order, deliveryPartnerId, {
    assignedDispatchLeg: getAssignedDispatchLeg(order, deliveryPartnerId),
  });
}

// ----- Delivery: available, accept, reject, status -----
export async function listOrdersAvailableDelivery(deliveryPartnerId, query) {
  const { page, limit, skip } = buildPaginationOptions(query);
  const partnerObjectId = new mongoose.Types.ObjectId(deliveryPartnerId);
  const filter = {
    $or: [
      {
        "dispatch.status": "unassigned",
        orderStatus: { $in: ["confirmed", "preparing", "ready_for_pickup"] },
      },
      {
        "dispatch.deliveryPartnerId": partnerObjectId,
        orderStatus: {
          $nin: [
            "delivered",
            "cancelled_by_user",
            "cancelled_by_restaurant",
            "cancelled_by_admin",
          ],
        },
      },
      {
        "dispatchPlan.legs": {
          $elemMatch: {
            deliveryPartnerId: partnerObjectId,
          },
        },
        orderStatus: {
          $nin: [
            "delivered",
            "cancelled_by_user",
            "cancelled_by_restaurant",
            "cancelled_by_admin",
          ],
        },
      },
      {
        "dispatchPlan.legs": {
          $elemMatch: {
            deliveryPartnerId: null,
            partnerCandidates: {
              $elemMatch: {
                partnerId: partnerObjectId,
              },
            },
          },
        },
        orderStatus: {
          $nin: [
            "delivered",
            "cancelled_by_user",
            "cancelled_by_restaurant",
            "cancelled_by_admin",
          ],
        },
      },
      {
        reassignmentStatus: "pending",
        pendingDriverId: partnerObjectId,
        orderStatus: {
          $nin: [
            "delivered",
            "cancelled_by_user",
            "cancelled_by_restaurant",
            "cancelled_by_admin",
          ],
        },
      },
    ],
  };

  const orders = await FoodOrder.find(filter)
    .sort({ createdAt: -1 })
    .populate("userId", "name phone email")
    .populate("restaurantId", "restaurantName name address phone ownerPhone location profileImage")
    .lean();

  await populateQuickOrderSellers(orders);

  const docs = [];
  for (const order of orders) {
    const assignedLeg = getAssignedDispatchLeg(order, deliveryPartnerId);
    const assignedWholeOrder =
      toIdString(order?.dispatch?.deliveryPartnerId) === toIdString(deliveryPartnerId);
    const eligibleLegs = isSplitDispatchOrder(order)
      ? getEligibleDispatchLegs(order, deliveryPartnerId)
      : [];
    const isMarketplaceOrder = isSplitDispatchOrder(order)
      ? eligibleLegs.length > 0
      : order?.dispatch?.status === "unassigned" &&
      ["confirmed", "preparing", "ready_for_pickup"].includes(order?.orderStatus);

    if (assignedLeg) {
      docs.push(
        buildDeliveryOrderView(order, deliveryPartnerId, {
          assignedDispatchLeg: assignedLeg,
          dispatchLeg: assignedLeg,
        }),
      );
      continue;
    }

    if (isSplitDispatchOrder(order)) {
      if (!isMarketplaceOrder) continue;
      for (const leg of eligibleLegs) {
        docs.push(
          buildDeliveryOrderView(order, deliveryPartnerId, {
            dispatchLeg: leg,
          }),
        );
      }
      continue;
    }

    const isReassignedToMe = order.reassignmentStatus === "pending" &&
      toIdString(order.pendingDriverId) === toIdString(deliveryPartnerId);

    if (isMarketplaceOrder || assignedWholeOrder || isReassignedToMe) {
      const view = buildDeliveryOrderView(order, deliveryPartnerId);
      if (isReassignedToMe) {
        view.isReassignment = true;
      }
      docs.push(view);
    }
  }

  return buildPaginatedResult({
    docs: docs.slice(skip, skip + limit),
    total: docs.length,
    page,
    limit,
  });
}
export async function acceptOrderDelivery(orderId, deliveryPartnerId, body = {}) {
  const partnerId = new mongoose.Types.ObjectId(deliveryPartnerId);
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");

  let order = await FoodOrder.findOne({
    ...identity,
    orderStatus: {
      $nin: [
        "delivered",
        "cancelled_by_user",
        "cancelled_by_restaurant",
        "cancelled_by_admin",
      ],
    },
    $or: [
      { "dispatch.status": "unassigned" },
      { "dispatch.deliveryPartnerId": partnerId },
      { "dispatchPlan.legs": { $elemMatch: { deliveryPartnerId: partnerId } } },
      {
        "dispatchPlan.legs": {
          $elemMatch: {
            deliveryPartnerId: null,
            partnerCandidates: {
              $elemMatch: {
                partnerId,
              },
            },
          },
        },
      },
    ],
  });
  if (!order) {
    const existing = await FoodOrder.findOne(identity).select("orderStatus dispatch").lean();
    if (existing && existing.dispatch?.status === "accepted" && String(existing.dispatch?.deliveryPartnerId || "") !== String(deliveryPartnerId)) {
      throw new ForbiddenError("Order already accepted by another driver");
    }
    throw new NotFoundError("Order not found");
  }

  if (
    !["confirmed", "preparing", "ready_for_pickup", "picked_up"].includes(
      order.orderStatus,
    )
  ) {
    throw new ValidationError("Order not ready for delivery assignment");
  }

  if (isSplitDispatchOrder(order)) {
    const requestedLegId = String(body?.legId || "").trim();
    const { updatedOrder, claimedLegId } = await claimSplitDispatchLegAtomically(
      order,
      deliveryPartnerId,
      requestedLegId,
    );

    if (!updatedOrder) {
      throw new NotFoundError("Order not found");
    }

    const targetLeg = (updatedOrder.dispatchPlan?.legs || []).find(
      (leg) =>
        String(leg?.legId || "") === String(claimedLegId || "") &&
        toIdString(leg?.deliveryPartnerId) === toIdString(deliveryPartnerId),
    );

    if (!targetLeg) {
      throw new ValidationError("No dispatch leg is currently available for this rider");
    }

    const assignedLegCount = (updatedOrder.dispatchPlan?.legs || []).filter((leg) =>
      toIdString(leg.deliveryPartnerId),
    ).length;

    const nextDispatchStatus =
      assignedLegCount >= (updatedOrder.dispatchPlan?.legs || []).length
        ? "accepted"
        : "assigned";
    const previousDispatchStatus = updatedOrder.dispatch?.status || "unassigned";

    updatedOrder.dispatch.status = nextDispatchStatus;
    updatedOrder.dispatch.assignedAt = updatedOrder.dispatch.assignedAt || new Date();
    if (nextDispatchStatus === "accepted") {
      updatedOrder.dispatch.acceptedAt = updatedOrder.dispatch.acceptedAt || new Date();
    }

    if (previousDispatchStatus !== nextDispatchStatus) {
      pushStatusHistory(updatedOrder, {
        byRole: "DELIVERY_PARTNER",
        byId: deliveryPartnerId,
        from: previousDispatchStatus,
        to: nextDispatchStatus,
        note: `Accepted split dispatch leg ${targetLeg.legId}`,
      });
    }

    emitOrderClaimedToOtherPartners(updatedOrder, {
      acceptedBy: deliveryPartnerId,
      legId: targetLeg.legId,
      candidatePartnerIds: (targetLeg.partnerCandidates || []).map(
        (candidate) => candidate?.partnerId,
      ),
    });

    await updatedOrder.save();
    return getOrderById(updatedOrder._id, { deliveryPartnerId });
  }

  const wasUnassigned =
    order.dispatch?.status === "unassigned" ||
    !order.dispatch?.deliveryPartnerId;
  if (
    !wasUnassigned &&
    order.dispatch.deliveryPartnerId?.toString() !==
    deliveryPartnerId.toString()
  ) {
    throw new ForbiddenError("Not your order");
  }

  const from = order.dispatch?.status || "unassigned";

  // Use findOneAndUpdate to atomically claim the order and set it to accepted
  const atomicallyUpdatedOrder = await FoodOrder.findOneAndUpdate(
    {
      _id: order._id,
      $or: [
        { "dispatch.status": "unassigned" },
        { "dispatch.deliveryPartnerId": partnerId },
        { "dispatch.deliveryPartnerId": null }
      ]
    },
    {
      $set: {
        "dispatch.deliveryPartnerId": partnerId,
        "dispatch.status": "accepted",
        "dispatch.acceptedAt": new Date(),
        "dispatch.assignedAt": order.dispatch?.assignedAt || new Date()
      },
      $push: {
        statusHistory: {
          byRole: "DELIVERY_PARTNER",
          byId: partnerId,
          from,
          to: "accepted",
          at: new Date()
        }
      }
    },
    { new: true }
  );

  if (!atomicallyUpdatedOrder) {
    throw new ForbiddenError("Order already accepted by another driver");
  }

  order = atomicallyUpdatedOrder;
  await order.populate('restaurantId');

  try {
    const rest = order.restaurantId;
    const userLoc = order.deliveryAddress?.location?.coordinates;
    const restLoc = rest?.location?.coordinates;

    if (restLoc?.[0] && userLoc?.[0]) {
      const polyline = await fetchPolyline(
        { lat: restLoc[1], lng: restLoc[0] },
        { lat: userLoc[1], lng: userLoc[0] }
      );

      const db = getFirebaseDB();
      if (db) {
        const orderRef = db.ref(`active_orders/${order.orderId}`);
        await orderRef.set({
          polyline,
          lat: restLoc[1],
          lng: restLoc[0],
          boy_lat: restLoc[1],
          boy_lng: restLoc[0],
          restaurant_lat: restLoc[1],
          restaurant_lng: restLoc[0],
          customer_lat: userLoc[1],
          customer_lng: userLoc[0],
          status: 'accepted',
          last_updated: Date.now()
        }).catch(e => logger.error(`Firebase orderRef set error: ${e.message}`));
      }
    }
  } catch (err) {
    logger.error(`Error initializing Firebase order tracking: ${err.message}`);
  }

  await foodTransactionService.updateTransactionRider(order._id, deliveryPartnerId);

  try {
    const io = getIO();
    if (io) {
      io.to(rooms.delivery(deliveryPartnerId)).emit("order_status_update", {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        dispatchStatus: order.dispatch?.status,
      });
      io.to(rooms.restaurant(order.restaurantId)).emit("order_status_update", {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        dispatchStatus: order.dispatch?.status,
      });
      io.to(rooms.user(order.userId)).emit("order_status_update", {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        dispatchStatus: order.dispatch?.status,
      });
    }
  } catch (e) {
    logger.warn(`Socket emit on acceptOrderDelivery failed: ${e?.message || e}`);
  }

  enqueueOrderEvent("delivery_assigned", {
    orderMongoId: order._id?.toString?.(),
    orderId: order.orderId,
    deliveryPartnerId,
    dispatchStatus: order.dispatch?.status,
  });

  return getOrderById(order._id, { deliveryPartnerId });
}
export async function rejectOrderDelivery(orderId, deliveryPartnerId) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError('Order id required');
  const order = await FoodOrder.findOne(identity);
  if (!order) throw new NotFoundError('Order not found');

  if (isSplitDispatchOrder(order)) {
    const assignedLeg = getAssignedDispatchLeg(order, deliveryPartnerId);
    if (!assignedLeg) throw new ForbiddenError('No split dispatch leg assigned to you');

    assignedLeg.deliveryPartnerId = null;
    assignedLeg.assignedAt = null;
    assignedLeg.partnerCandidates = (assignedLeg.partnerCandidates || []).filter(
      (candidate) => toIdString(candidate?.partnerId) !== toIdString(deliveryPartnerId),
    );

    const assignedLegCount = (order.dispatchPlan?.legs || []).filter((leg) =>
      toIdString(leg.deliveryPartnerId),
    ).length;

    order.dispatch.status = assignedLegCount > 0 ? 'assigned' : 'unassigned';
    if (!assignedLegCount) {
      order.dispatch.assignedAt = undefined;
      order.dispatch.acceptedAt = undefined;
    }

    pushStatusHistory(order, {
      byRole: 'DELIVERY_PARTNER',
      byId: deliveryPartnerId,
      from: 'assigned',
      to: order.dispatch.status,
      note: `Rejected split dispatch leg ${assignedLeg.legId}`,
    });
    await order.save();
    return getOrderById(order._id, { deliveryPartnerId });
  }

  if (order.dispatch.deliveryPartnerId?.toString() !== deliveryPartnerId.toString()) throw new ForbiddenError('Not your order');

  const offer = order.dispatch.offeredTo.find(o => String(o.partnerId) === String(deliveryPartnerId) && o.action === 'offered');
  if (offer) offer.action = 'rejected';

  order.dispatch.status = 'unassigned';
  order.dispatch.deliveryPartnerId = undefined;
  order.dispatch.assignedAt = undefined;
  order.dispatch.acceptedAt = undefined;
  pushStatusHistory(order, { byRole: 'DELIVERY_PARTNER', byId: deliveryPartnerId, from: 'assigned', to: 'unassigned', note: 'Rejected' });
  await order.save();

  enqueueOrderEvent('delivery_rejected', {
    orderMongoId: order._id?.toString?.(),
    orderId: order.orderId,
    deliveryPartnerId
  });

  void tryAutoAssign(order._id).catch(err => logger.error(`SmartDispatch: Auto-assign after reject failed: ${err.message}`));

  return order.toObject();
}
export async function confirmReachedPickupDelivery(orderId, deliveryPartnerId) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");

  const order = await FoodOrder.findOne(identity);
  if (!order) throw new NotFoundError("Order not found");
  if (!isOrderAssignedToDeliveryPartner(order, deliveryPartnerId)) {
    throw new ForbiddenError("Not your order");
  }
  if (order.orderStatus === "delivered")
    throw new ValidationError("Order already delivered");

  // Idempotent: if already at/after pickup, keep success.
  const currentPhase = order.deliveryState?.currentPhase || "";
  const currentStatus = order.deliveryState?.status || "";
  if (currentPhase === "at_pickup" || currentStatus === "reached_pickup") {
    return order.toObject();
  }

  const from = currentStatus || currentPhase || order.orderStatus;
  order.deliveryState = {
    ...(order.deliveryState?.toObject?.() || order.deliveryState || {}),
    currentPhase: "at_pickup",
    status: "reached_pickup",
    reachedPickupAt: order.deliveryState?.reachedPickupAt || new Date(),
  };
  pushStatusHistory(order, {
    byRole: "DELIVERY_PARTNER",
    byId: deliveryPartnerId,
    from,
    to: "reached_pickup",
    note: "Reached pickup location",
  });
  await order.save();

  // Notify
  emitOrderUpdate(order, deliveryPartnerId);

  // Notify Restaurant about rider arrival
  try {
    const restaurant = await FoodRestaurant.findById(order.restaurantId).select("restaurantName").lean();
    const partner = await FoodDeliveryPartner.findById(deliveryPartnerId).select("name").lean();

    const { notifyOwnersSafely } = await import("../../../../core/notifications/firebase.service.js");
    await notifyOwnersSafely(
      [{ ownerType: "RESTAURANT", ownerId: order.restaurantId }],
      {
        title: "Rider Arrived! 🛵",
        body: `${partner?.name || "The delivery partner"} has arrived at your restaurant to pick up the order.`,
        image: "https://i.ibb.co/3m2Yh7r/SUPERFAST-Brand-Image.png",
        data: {
          type: "rider_arrived",
          orderId: String(order.orderId),
          orderMongoId: String(order._id),
          partnerName: partner?.name || ""
        }
      }
    );
  } catch (err) {
    console.error("[DEBUG] Error notifying restaurant about rider arrival:", err);
  }

  enqueueOrderEvent('reached_pickup', {
    orderMongoId: order._id?.toString?.(),
    orderId: order.orderId,
    deliveryPartnerId,
    orderStatus: order.orderStatus,
    deliveryPhase: order.deliveryState?.currentPhase,
    deliveryStatus: order.deliveryState?.status
  });
  return order.toObject();
}

/**
 * Slide to confirm pickup (Bill uploaded)
 */
export async function confirmPickupDelivery(
  orderId,
  deliveryPartnerId,
  billImageUrl,
) {
  const identity = buildOrderIdentityFilter(orderId);
  const order = await FoodOrder.findOne(identity);
  if (!order) throw new NotFoundError("Order not found");
  if (!isOrderAssignedToDeliveryPartner(order, deliveryPartnerId)) {
    throw new ForbiddenError("Not your order");
  }

  const from = order.orderStatus;
  order.orderStatus = "picked_up";
  order.deliveryState = {
    ...(order.deliveryState?.toObject?.() || order.deliveryState || {}),
    currentPhase: "en_route_to_delivery",
    status: "picked_up",
    pickedUpAt: new Date(),
    billImageUrl,
  };
  pushStatusHistory(order, {
    byRole: "DELIVERY_PARTNER",
    byId: deliveryPartnerId,
    from,
    to: "picked_up",
    note: "Order picked up",
  });
  await order.save();

  emitOrderUpdate(order, deliveryPartnerId);
  enqueueOrderEvent('picked_up', {
    orderMongoId: order._id?.toString?.(),
    orderId: order.orderId,
    deliveryPartnerId,
    billImageUrl: billImageUrl || null
  });
  return order.toObject();
}

export async function confirmReachedDropDelivery(orderId, deliveryPartnerId) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");

  const order = await FoodOrder.findOne(identity).select("+deliveryOtp");
  if (!order) throw new NotFoundError("Order not found");
  if (!isOrderAssignedToDeliveryPartner(order, deliveryPartnerId)) {
    throw new ForbiddenError("Not your order");
  }

  if (order.deliveryVerification?.dropOtp?.verified) {
    emitOrderUpdate(order, deliveryPartnerId);
    return sanitizeOrderForExternal(order);
  }

  const alreadyAtDrop =
    order.deliveryState?.currentPhase === "at_drop" ||
    order.deliveryState?.status === "reached_drop";
  const fromPhase =
    order.deliveryState?.status ||
    order.deliveryState?.currentPhase ||
    order.orderStatus ||
    "";

  const existingOtp = String(order.deliveryOtp || "").trim();
  if (!alreadyAtDrop || !existingOtp) {
    order.deliveryOtp = generateFourDigitDeliveryOtp();
    order.deliveryVerification = {
      ...(order.deliveryVerification?.toObject?.() ||
        order.deliveryVerification ||
        {}),
      dropOtp: { required: true, verified: false },
    };
  }

  order.deliveryState = {
    ...(order.deliveryState?.toObject?.() || order.deliveryState || {}),
    currentPhase: "at_drop",
    status: "reached_drop",
    reachedDropAt: order.deliveryState?.reachedDropAt || new Date(),
  };

  if (!alreadyAtDrop) {
    pushStatusHistory(order, {
      byRole: "DELIVERY_PARTNER",
      byId: deliveryPartnerId,
      from: fromPhase,
      to: "reached_drop",
      note: "Reached drop location",
    });
  }

  await order.save();

  const plainOtp = String(order.deliveryOtp || '').trim();
  emitDeliveryDropOtpToUser(order, plainOtp);
  emitOrderUpdate(order, deliveryPartnerId);
  enqueueOrderEvent('reached_drop', {
    orderMongoId: order._id?.toString?.(),
    orderId: order.orderId,
    deliveryPartnerId,
    dropOtpRequired: order.deliveryVerification?.dropOtp?.required ?? true,
    dropOtpVerified: order.deliveryVerification?.dropOtp?.verified ?? false
  });
  return sanitizeOrderForExternal(order);
}

export async function verifyDropOtpDelivery(orderId, deliveryPartnerId, otp) {
  const identity = buildOrderIdentityFilter(orderId);
  const order = await FoodOrder.findOne(identity).select("+deliveryOtp");
  if (!order) throw new NotFoundError("Order not found");
  if (!isOrderAssignedToDeliveryPartner(order, deliveryPartnerId)) {
    throw new ForbiddenError("Not your order");
  }

  const otpStr = String(otp || "").trim();
  if (!otpStr) throw new ValidationError("OTP is required");

  if (!order.deliveryVerification?.dropOtp?.required) {
    throw new ValidationError(
      "OTP verification is not active for this order. Confirm reached drop first.",
    );
  }
  if (order.deliveryVerification?.dropOtp?.verified) {
    return { order: sanitizeOrderForExternal(order) };
  }

  const expected = String(order.deliveryOtp || "").trim();
  if (!expected || expected !== otpStr) {
    throw new ValidationError(
      "Invalid OTP. Ask the customer for the code shown in their app.",
    );
  }

  // Use direct path assignment for robustness in Mongoose change detection
  if (!order.deliveryVerification) order.deliveryVerification = { dropOtp: {} };
  order.deliveryVerification.dropOtp.verified = true;
  order.markModified('deliveryVerification.dropOtp.verified');

  order.deliveryOtp = "";
  await order.save();

  emitOrderUpdate(order, deliveryPartnerId);
  enqueueOrderEvent('drop_otp_verified', {
    orderMongoId: order._id?.toString?.(),
    orderId: order.orderId,
    deliveryPartnerId
  });
  return { order: sanitizeOrderForExternal(order) };
}

export async function completeDelivery(orderId, deliveryPartnerId, body = {}) {
  const identity = buildOrderIdentityFilter(orderId);
  const order = await FoodOrder.findOne(identity);
  if (!order) throw new NotFoundError("Order not found");
  if (!isOrderAssignedToDeliveryPartner(order, deliveryPartnerId)) {
    throw new ForbiddenError("Not your order");
  }

  const { otp, ratings, paymentMode } = body;

  // Dynamically update payment method based on delivery partner selection
  if (paymentMode === 'cash') {
    order.payment.method = 'cash';
  } else if (paymentMode === 'qr') {
    order.payment.method = 'razorpay_qr';
  }

  if (
    order.deliveryVerification?.dropOtp?.required &&
    !order.deliveryVerification?.dropOtp?.verified &&
    !otp // Only throw if OTP is not provided here as fallback
  ) {
    throw new ValidationError(
      "Customer handover OTP is required. Verify the OTP from the customer before completing delivery.",
    );
  }

  const from = order.orderStatus;
  const prevPayStatus = order.payment.status;
  const payMethod = order.payment.method;

  // Security gate: only complete QR delivery after Razorpay payment-link is actually paid.
  // This enables frontend auto-complete after QR success.
  if (payMethod === "razorpay_qr") {
    // syncRazorpayQrPayment is a helper presumed present in this service context
    if (typeof syncRazorpayQrPayment === 'function') await syncRazorpayQrPayment(order);
    if (order.payment.status !== "paid") {
      throw new ValidationError("QR payment not verified yet");
    }
  }

  order.orderStatus = "delivered";
  order.payment.status = "paid";
  order.deliveryState = {
    ...(order.deliveryState?.toObject?.() || order.deliveryState || {}),
    currentPhase: "delivered",
    status: "delivered",
    deliveredAt: new Date(),
  };

  if (ratings) {
    order.ratings = {
      ...(order.ratings?.toObject?.() || order.ratings || {}),
      ...ratings
    };
  }

  pushStatusHistory(order, {
    byRole: "DELIVERY_PARTNER",
    byId: deliveryPartnerId,
    from,
    to: "delivered",
    note: "Delivery completed successfully",
  });

  await order.save();
  emitOrderUpdate(order, deliveryPartnerId);
  const ledgerKind =
    payMethod === "cash" && prevPayStatus === "cod_pending"
      ? "cod_marked_paid_on_delivery"
      : "payment_snapshot_sync";

  await foodTransactionService.updateTransactionStatus(order._id, ledgerKind, {
    status: 'captured',
    recordedByRole: "DELIVERY_PARTNER",
    recordedById: deliveryPartnerId,
    note: `Delivery completed. Prev status: ${prevPayStatus}`
  });

  emitOrderUpdate(order, deliveryPartnerId);
  enqueueOrderEvent('delivery_completed', {
    orderMongoId: order._id?.toString?.(),
    orderId: order.orderId,
    deliveryPartnerId,
    payMethod,
    prevPayStatus,
    paymentStatus: order.payment?.status
  });
  return sanitizeOrderForExternal(order);
}

function emitOrderUpdate(order, deliveryPartnerId) {
  try {
    const io = getIO();
    if (io) {
      const dv =
        order.deliveryVerification?.toObject?.() || order.deliveryVerification;
      const payload = {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        deliveryState: order.deliveryState,
        deliveryVerification: dv,
      };
      io.to(rooms.delivery(deliveryPartnerId)).emit(
        "order_status_update",
        payload,
      );
      io.to(rooms.restaurant(order.restaurantId)).emit(
        "order_status_update",
        payload,
      );
      io.to(rooms.user(order.userId)).emit("order_status_update", payload);
    }
    if (order.orderStatus === "delivered") {
      let riderTitle = `Order deliverd! 🏁`;
      let riderBody = `The order has been marked as delivered.`;

      // Special message for COD payment collection
      if (order.payment?.method === "cash") {
        riderTitle = "Payment Collected! 💵";
        riderBody = `You have collected ₹${order.pricing?.total || 0} cash for the order.`;
      }

      void notifyOwnerSafely(
        { ownerType: "USER", ownerId: order.userId },
        {
          title: `Order #${order.orderId} delivered! ✅`,
          body: order.orderType === 'quick' ? `Hope you enjoyed your shopping!` : `Hope you enjoyed your meal!`,
          data: {
            type: "order_status_update",
            orderId: order.orderId,
            orderMongoId: order._id?.toString?.() || "",
            orderStatus: "delivered",
            link: `/food/user/orders/${order._id?.toString?.() || ""}`,
          },
        }
      );

      void notifyOwnerSafely(
        { ownerType: "RESTAURANT", ownerId: order.restaurantId },
        {
          title: `Order Delivered! ✅`,
          body: `The order has been successfully delivered to the customer.`,
          data: {
            type: "order_status_update",
            orderId: order.orderId,
            orderMongoId: order._id?.toString?.() || "",
            orderStatus: "delivered",
            link: `/restaurant/orders/${order._id?.toString?.() || ""}`,
          },
        }
      );

      void notifyOwnerSafely(
        { ownerType: "DELIVERY_PARTNER", ownerId: deliveryPartnerId },
        {
          title: riderTitle,
          body: riderBody,
          data: {
            type: "order_completed",
            orderId: order.orderId,
            orderMongoId: order._id?.toString?.() || "",
            paymentMethod: order.payment?.method,
            amountCollected: String(order.pricing?.total || 0),
            link: `/delivery/orders/${order._id?.toString?.() || ""}`,
          },
        }
      );
    } else if (order.orderStatus === "picked_up") {
      void notifyOwnerSafely(
        { ownerType: "USER", ownerId: order.userId },
        {
          title: `Order Picked Up! 🛵`,
          body: `Your order has been picked up and is on the way.`,
          data: {
            type: "order_status_update",
            orderId: order.orderId,
            orderMongoId: order._id?.toString?.() || "",
            orderStatus: "picked_up",
            link: `/food/user/orders/${order._id?.toString?.() || ""}`,
          },
        }
      );

      void notifyOwnerSafely(
        { ownerType: "RESTAURANT", ownerId: order.restaurantId },
        {
          title: `Order Picked Up! 🛵`,
          body: `The delivery partner has picked up the order.`,
          data: {
            type: "order_status_update",
            orderId: order.orderId,
            orderMongoId: order._id?.toString?.() || "",
            orderStatus: "picked_up",
            link: `/restaurant/orders/${order._id?.toString?.() || ""}`,
          },
        }
      );
    }
  } catch (e) {
    console.error("Error emitting order update:", e);
  }
}

export async function updateOrderStatusDelivery(orderId, deliveryPartnerId, orderStatus) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError('Order id required');
  const order = await FoodOrder.findOne(identity);
  if (!order) throw new NotFoundError('Order not found');
  if (order.dispatch.deliveryPartnerId?.toString() !== deliveryPartnerId.toString()) throw new ForbiddenError('Not your order');
  const from = order.orderStatus;
  order.orderStatus = orderStatus;
  pushStatusHistory(order, { byRole: 'DELIVERY_PARTNER', byId: deliveryPartnerId, from, to: orderStatus });
  await order.save();
  emitOrderUpdate(order, deliveryPartnerId);
  enqueueOrderEvent('delivery_status_updated', {
    orderMongoId: order._id?.toString?.(),
    orderId: order.orderId,
    deliveryPartnerId,
    from,
    to: orderStatus
  });
  return order.toObject();
}

// ----- COD QR collection -----
export async function createCollectQr(
  orderId,
  deliveryPartnerId,
  customerInfo = {},
) {
  const query = mongoose.Types.ObjectId.isValid(orderId) ? { _id: orderId } : { orderId };
  const order = await FoodOrder.findOne(query)
    .populate("userId", "name email phone")
    .lean();
  if (!order) throw new NotFoundError("Order not found");
  if (
    order.dispatch.deliveryPartnerId?.toString() !==
    deliveryPartnerId.toString()
  )
    throw new ForbiddenError("Not your order");
  if (order.payment.method !== "cash" && order.payment.status === "paid")
    throw new ValidationError("Order already paid");
  const amountDue = order.payment.amountDue ?? order.pricing?.total ?? 0;
  if (amountDue < 1) throw new ValidationError("No amount due");

  if (!isRazorpayConfigured())
    throw new ValidationError("QR payment not configured");

  const amountPaise = Math.round(amountDue * 100);
  const user = order.userId || {};
  const link = await createPaymentLink({
    amountPaise,
    currency: "INR",
    description: `Order ${order.orderId} - COD collect`,
    orderId: order.orderId,
    customerName: customerInfo.name || user.name || "Customer",
    customerEmail: customerInfo.email || user.email || "customer@example.com",
    customerPhone: customerInfo.phone || user.phone,
  });

  await FoodOrder.findByIdAndUpdate(order._id, {
    $set: {
      "payment.method": "razorpay_qr",
      "payment.status": "pending_qr",
      "payment.qr": {
        paymentLinkId: link.id,
        shortUrl: link.short_url,
        imageUrl: link.short_url,
        status: link.status || "created",
        expiresAt: link.expire_by ? new Date(link.expire_by * 1000) : null,
      },
    },
  });

  const updated = await FoodOrder.findById(order._id).select('orderId restaurantId userId riderEarning payment pricing').lean();
  if (updated) {
    await foodTransactionService.updateTransactionStatus(order._id, 'cod_collect_qr_created', {
      recordedByRole: 'DELIVERY_PARTNER',
      recordedById: deliveryPartnerId,
      note: 'COD collection QR created'
    });
  }

  enqueueOrderEvent('collect_qr_created', {
    orderMongoId: String(orderId),
    orderId: updated?.orderId || null,
    deliveryPartnerId,
    paymentLinkId: link.id,
    shortUrl: link.short_url,
    amountDue
  });

  // IMPORTANT: return QR payload so frontend can render "Generate QR" / "Show QR".
  const shortUrl =
    link?.short_url ?? link?.shortUrl ?? link?.short_url_path ?? null;
  const imageUrl =
    link?.short_url ??
    link?.image_url ??
    link?.imageUrl ??
    link?.image ??
    null;

  return {
    shortUrl,
    imageUrl,
    amount: amountDue,
    expiresAt:
      link?.expire_by
        ? new Date(link.expire_by * 1000)
        : link?.expiresAt
          ? new Date(link.expiresAt)
          : null,
  };
}

/**
 * Razorpay QR auto-verify:
 * - Fetch payment-link status from Razorpay
 * - Update `order.payment.status` to `paid` when Razorpay marks it paid
 * - Update `order.payment.qr.status` for UI/debugging
 *
 * IMPORTANT: Callers should `await` this before completing delivery.
 */
async function syncRazorpayQrPayment(orderDoc) {
  if (!orderDoc?.payment) return orderDoc?.payment;
  if (orderDoc.payment.method !== "razorpay_qr") return orderDoc.payment;
  if (orderDoc.payment.status === "paid") return orderDoc.payment;

  const paymentLinkId = orderDoc.payment?.qr?.paymentLinkId;
  if (!paymentLinkId) return orderDoc.payment;
  if (!isRazorpayConfigured()) return orderDoc.payment;

  let link;
  try {
    link = await fetchRazorpayPaymentLink(paymentLinkId);
  } catch (err) {
    logger.warn(
      `Razorpay payment-link fetch failed for ${paymentLinkId}: ${err?.message || err
      }`
    );
    return orderDoc.payment;
  }

  const linkStatus = String(link?.status || "").toLowerCase();
  if (!linkStatus) return orderDoc.payment;

  // Update QR snapshot status.
  orderDoc.payment.qr = {
    ...(orderDoc.payment.qr?.toObject?.() || orderDoc.payment.qr || {}),
    status: linkStatus,
  };

  // Mark paid only when Razorpay says it's paid/settled.
  if (["paid", "captured", "authorized"].includes(linkStatus)) {
    orderDoc.payment.status = "paid";
    await orderDoc.save();
  } else if (["expired", "cancelled", "canceled", "failed"].includes(linkStatus)) {
    orderDoc.payment.status = "failed";
    await orderDoc.save();
  }

  return orderDoc.payment;
}

export async function getPaymentStatus(orderId, deliveryPartnerId) {
  // Support both short orderId strings and MongoDB _ids.
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");

  const order = await FoodOrder.findOne(identity).select(
    "payment dispatch riderEarning platformProfit pricing"
  );
  if (!order) throw new NotFoundError("Order not found");
  if (
    order.dispatch?.deliveryPartnerId?.toString() !==
    deliveryPartnerId.toString()
  )
    throw new ForbiddenError("Not your order");

  // Auto-sync Razorpay QR payment status before returning.
  // syncRazorpayQrPayment calls Razorpay, updates order.payment.status, and saves.
  if (order.payment?.method === "razorpay_qr") {
    await syncRazorpayQrPayment(order);
  }

  const transaction = await FoodTransaction.findOne({ orderId: order._id }).lean();
  const latestHistory = (transaction?.history || []).sort((a, b) => (b.at || 0) - (a.at || 0))[0] || null;

  return {
    payment: {
      ...(order.payment?.toObject?.() || order.payment || {}),
      // Expose the effective status in a flat field for easy frontend reading
      status: order.payment?.status,
    },
    latestPaymentSnapshot: latestHistory,
    riderEarning: order.riderEarning ?? 0,
    platformProfit: order.platformProfit ?? 0,
    pricingTotal: order.pricing?.total ?? 0,
    transactionStatus: transaction?.status ?? null,
  };
}

// ----- Admin -----
export async function listOrdersAdmin(query) {
  const { page, limit, skip } = buildPaginationOptions(query);
  const filter = {
    orderType: { $in: ["food", "mixed"] },
    $or: [
      { "payment.method": { $in: ["cash", "cod", "wallet"] } },
      { "payment.status": { $in: ["paid", "authorized", "captured", "settled", "refunded"] } },
    ],
  };

  // Extract raw query params
  const rawStatus = typeof query.status === "string" ? query.status.trim().toLowerCase() : "";
  const cancelledBy = typeof query.cancelledBy === "string" ? query.cancelledBy.trim().toLowerCase() : "";
  const restaurantIdRaw = typeof query.restaurantId === "string" ? query.restaurantId.trim() : "";
  const zoneIdRaw = typeof query.zoneId === "string" ? query.zoneId.trim() : "";
  const userIdRaw = typeof query.userId === "string" ? query.userId.trim() : "";
  const deliveryPartnerIdRaw = typeof query.deliveryPartnerId === "string" ? query.deliveryPartnerId.trim() : "";
  const startDateRaw = typeof query.startDate === "string" ? query.startDate.trim() : "";
  const endDateRaw = typeof query.endDate === "string" ? query.endDate.trim() : "";
  const search = typeof query.search === "string" ? query.search.trim() : "";

  if (rawStatus && rawStatus !== "all") {
    switch (rawStatus) {
      case "pending":
        filter.orderStatus = { $in: ["created", "confirmed"] };
        break;
      case "processing":
        filter.orderStatus = { $in: ["preparing", "ready_for_pickup"] };
        break;
      case "food-on-the-way":
        filter.orderStatus = "picked_up";
        break;
      case "delivered":
        filter.orderStatus = "delivered";
        break;
      case "canceled":
      case "cancelled":
        filter.orderStatus = {
          $in: ["cancelled_by_user", "cancelled_by_restaurant", "cancelled_by_admin"],
        };
        break;
      case "restaurant-cancelled":
        filter.orderStatus = "cancelled_by_restaurant";
        break;
      case "payment-failed":
        filter["payment.status"] = "failed";
        break;
      case "refunded":
        filter["payment.status"] = "refunded";
        break;
      case "offline-payments":
        filter["payment.method"] = "cash";
        break;
      case "scheduled":
        filter.scheduledAt = { $ne: null };
        break;
    }
  }

  if (cancelledBy) {
    if (cancelledBy === "restaurant") {
      filter.orderStatus = "cancelled_by_restaurant";
    } else if (cancelledBy === "user" || cancelledBy === "customer") {
      filter.orderStatus = "cancelled_by_user";
    }
  }

  // ID based filters
  if (restaurantIdRaw && mongoose.Types.ObjectId.isValid(restaurantIdRaw)) {
    filter.restaurantId = new mongoose.Types.ObjectId(restaurantIdRaw);
  }
  if (zoneIdRaw && mongoose.Types.ObjectId.isValid(zoneIdRaw)) {
    filter.zoneId = new mongoose.Types.ObjectId(zoneIdRaw);
  }
  if (userIdRaw && mongoose.Types.ObjectId.isValid(userIdRaw)) {
    filter.userId = new mongoose.Types.ObjectId(userIdRaw);
  }
  if (deliveryPartnerIdRaw && mongoose.Types.ObjectId.isValid(deliveryPartnerIdRaw)) {
    filter.$and = [
      {
        $or: [
          { "dispatch.deliveryPartnerId": new mongoose.Types.ObjectId(deliveryPartnerIdRaw) },
          { "dispatchPlan.legs.deliveryPartnerId": new mongoose.Types.ObjectId(deliveryPartnerIdRaw) }
        ]
      }
    ];
  }

  // Date filters
  if (startDateRaw || endDateRaw) {
    const createdAt = {};
    const start = startDateRaw ? new Date(startDateRaw) : null;
    const end = endDateRaw ? new Date(endDateRaw) : null;
    if (start && !Number.isNaN(start.getTime())) {
      createdAt.$gte = start;
    }
    if (end && !Number.isNaN(end.getTime())) {
      // Set to end of day
      end.setHours(23, 59, 59, 999);
      createdAt.$lte = end;
    }
    if (Object.keys(createdAt).length > 0) {
      filter.createdAt = createdAt;
    }
  }

  // Search logic
  if (search) {
    // Search by Order ID (exact or partial regex)
    const searchConditions = [
      { orderId: { $regex: search, $options: "i" } }
    ];

    // If search looks like a name, we need to find matching users and restaurants first
    const [matchingUsers, matchingRestaurants] = await Promise.all([
      FoodUser.find({ name: { $regex: search, $options: "i" } }).select('_id').lean(),
      FoodRestaurant.find({ restaurantName: { $regex: search, $options: "i" } }).select('_id').lean()
    ]);

    if (matchingUsers.length > 0) {
      searchConditions.push({ userId: { $in: matchingUsers.map(u => u._id) } });
    }
    if (matchingRestaurants.length > 0) {
      searchConditions.push({ restaurantId: { $in: matchingRestaurants.map(r => r._id) } });
    }

    // Combine base filter with search conditions
    // We use $and to ensure both the visibility/status filters AND the search conditions are met
    const originalFilter = { ...filter };
    delete filter.$or; // We'll reconstruct it

    const searchOr = { $or: searchConditions };
    if (originalFilter.$and) {
      filter.$and = [
        ...originalFilter.$and,
        { $or: originalFilter.$or },
        searchOr
      ];
    } else {
      filter.$and = [
        { $or: originalFilter.$or },
        searchOr
      ];
    }

    // Copy other specific filters into $and if needed, but since they are already in `filter` object, 
    // we should be careful. Actually, it's better to just keep them as they are and let Mongo handle it.
  }

  const [docs, total] = await Promise.all([
    FoodOrder.find(filter)
      .populate("userId", "name phone email")
      .populate("restaurantId", "restaurantName area city ownerPhone")
      .populate("dispatch.deliveryPartnerId", "name phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    FoodOrder.countDocuments(filter),
  ]);

  const paginated = buildPaginatedResult({ docs, total, page, limit });
  return { ...paginated, orders: paginated.data };
}

export async function assignDeliveryPartnerAdmin(
  orderId,
  deliveryPartnerId,
  adminId,
) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");
  const order = await FoodOrder.findOne(identity);
  if (!order) throw new NotFoundError("Order not found");
  if (order.dispatch.status === "accepted")
    throw new ValidationError("Order already accepted by partner");

  const partner = await FoodDeliveryPartner.findById(deliveryPartnerId)
    .select("status availabilityStatus")
    .lean();
  if (!partner || partner.status !== "approved")
    throw new ValidationError("Delivery partner not available");
  if (partner.availabilityStatus !== "online")
    throw new ValidationError("Delivery partner is offline");

  const activeCount = await FoodOrder.countDocuments({
    $or: [
      { "dispatch.deliveryPartnerId": partner._id },
      { "dispatchPlan.legs.deliveryPartnerId": partner._id }
    ],
    orderStatus: {
      $nin: ["delivered", "cancelled_by_user", "cancelled_by_restaurant", "cancelled_by_admin"]
    }
  });
  if (activeCount >= 1) {
    throw new ValidationError("Delivery partner is busy with another order");
  }

  order.dispatch.status = 'assigned';
  order.dispatch.deliveryPartnerId = new mongoose.Types.ObjectId(deliveryPartnerId);
  order.dispatch.assignedAt = new Date();
  pushStatusHistory(order, { byRole: 'ADMIN', byId: adminId, from: order.dispatch.status, to: 'assigned' });
  await order.save();
  enqueueOrderEvent('delivery_partner_assigned', {
    orderMongoId: order._id?.toString?.(),
    orderId: order.orderId,
    deliveryPartnerId,
    adminId
  });
  return order.toObject();
}

export async function deleteOrderAdmin(orderId, adminId) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");

  const order = await FoodOrder.findOne(identity).lean();
  if (!order) throw new NotFoundError("Order not found");

  // Keep support tickets but detach deleted order reference.
  await Promise.all([
    FoodSupportTicket.updateMany(
      { orderId: order._id },
      { $set: { orderId: null } },
    ),
    FoodTransaction.deleteOne({
      $or: [{ orderId: order._id }, { orderReadableId: String(order.orderId) }],
    }),
    FoodOrder.deleteOne({ _id: order._id }),
  ]);

  // Remove realtime tracking node if present.
  try {
    const db = getFirebaseDB();
    if (db && order?.orderId) {
      await db.ref(`active_orders/${order.orderId}`).remove();
    }
  } catch (err) {
    logger.warn(`Delete order firebase cleanup failed: ${err?.message || err}`);
  }

  // Notify connected apps so stale UI entries can disappear without refresh.
  try {
    const io = getIO();
    if (io) {
      const payload = {
        orderMongoId: String(order._id),
        orderId: String(order.orderId || ""),
        deletedBy: "ADMIN",
        adminId: adminId ? String(adminId) : null,
      };

      if (order.userId) io.to(rooms.user(order.userId)).emit("order_deleted", payload);
      if (order.restaurantId) io.to(rooms.restaurant(order.restaurantId)).emit("order_deleted", payload);
      if (order.dispatch?.deliveryPartnerId) {
        io.to(rooms.delivery(order.dispatch.deliveryPartnerId)).emit("order_deleted", payload);
      }
    }
  } catch (err) {
    logger.warn(`Delete order socket emit failed: ${err?.message || err}`);
  }

  enqueueOrderEvent("order_deleted_by_admin", {
    orderMongoId: String(order._id),
    orderId: String(order.orderId || ""),
    adminId: adminId ? String(adminId) : null,
  });

  return {
    deleted: true,
    orderId: String(order.orderId || ""),
    orderMongoId: String(order._id),
  };
}

/**
 * 🕵️ Watchdog: Recovers orders that are in intermediate states for too long.
 * Runs once at server startup (triggered in server.js).
 */
export async function recoverStuckOrders() {
  try {
    const STUCK_THRESHOLD_HOURS = 2; // Orders older than this in a transient state are considered stuck
    const thresholdDate = new Date(Date.now() - STUCK_THRESHOLD_HOURS * 60 * 60 * 1000);

    const transientStates = [
      'placed',
      'created',
      'confirmed',
      'preparing',
      'ready_for_pickup',
      'picked_up'
    ];

    // Find orders that haven't been updated recently and are in a transient state
    const stuckOrders = await FoodOrder.find({
      orderStatus: { $in: transientStates },
      updatedAt: { $lt: thresholdDate }
    });

    if (stuckOrders.length === 0) {
      // logger.info('Watchdog: No stuck orders found to recover.');
      return;
    }

    logger.info(`Watchdog: Found ${stuckOrders.length} stuck orders. Mark as cancelled...`);

    const results = await Promise.all(stuckOrders.map(async (order) => {
      try {
        const oldStatus = order.orderStatus;
        order.orderStatus = 'cancelled_by_admin';

        pushStatusHistory(order, {
          byRole: 'SYSTEM',
          from: oldStatus,
          to: 'cancelled_by_admin',
          note: 'Watchdog auto-recovery: Order was stuck in transient state for more than 2 hours.'
        });

        await order.save({ validateBeforeSave: false });

        // Sync mixed order seller legs
        if (order.orderType === 'mixed' || order.orderType === 'quick') {
          await cancelSellerOrdersForParent(order, "Cancelled by system watchdog");
        }

        // Enqueue event for housekeeping/finance
        enqueueOrderEvent('order_cancelled_by_watchdog', {
          orderMongoId: order._id.toString(),
          orderId: order.orderId,
          fromStatus: oldStatus
        });

        return true;
      } catch (err) {
        logger.error(`Watchdog: Failed to recover order ${order.orderId}: ${err.message}`);
        return false;
      }
    }));

    const recoveredCount = results.filter(Boolean).length;
    logger.info(`Watchdog: Successfully recovered ${recoveredCount}/${stuckOrders.length} stuck orders.`);
  } catch (err) {
    logger.error(`Watchdog Error during recovery: ${err.message}`);
  }
}

/**
 * 🆕 Resync State Helper:
 * - When a client reconnects, they call this to get their active order state.
 * - For Delivery Partners: returns the current trip details.
 * - For Users: returns the most recent active order being prepared or delivered.
 */
export async function resyncState(userId, role) {
  if (!userId || !role) return { activeOrder: null, pendingOffers: [] };

  let activeOrder = null;
  let pendingOffers = [];

  try {
    const roleUpper = String(role).toUpperCase();

    if (roleUpper === 'DELIVERY_PARTNER') {
      activeOrder = await getCurrentTripDelivery(userId);

      const cutoff = new Date(Date.now() - 60000);
      const missedOrders = await FoodOrder.find({
        "dispatch.status": "unassigned",
        orderStatus: { $in: ["confirmed", "preparing", "ready_for_pickup"] },
        "dispatch.offeredTo": {
          $elemMatch: {
            partnerId: new mongoose.Types.ObjectId(userId),
            action: "offered",
            offeredAt: { $gte: cutoff }
          }
        }
      }).lean();

      if (missedOrders.length > 0) {
        pendingOffers = missedOrders.map(normalizeOrderForClient);
      }
    } else if (roleUpper === 'SELLER') {
      const cutoff = new Date(Date.now() - 60000);
      const missedSellerOrders = await SellerOrder.find({
        sellerId: new mongoose.Types.ObjectId(userId),
        status: { $in: ["placed", "pending"] },
        createdAt: { $gte: cutoff }
      }).lean();

      if (missedSellerOrders.length > 0) {
        pendingOffers = missedSellerOrders.map(sellerOrder => ({
          orderId: sellerOrder.orderId,
          sellerOrderId: sellerOrder._id?.toString?.() || "",
          orderType: sellerOrder.orderType || "quick",
          status: sellerOrder.status,
          workflowStatus: sellerOrder.workflowStatus,
          items: sellerOrder.items || [],
          pricing: sellerOrder.pricing || {},
          createdAt: sellerOrder.createdAt || new Date(),
        }));
      }
    } else if (roleUpper === 'USER') {
      const order = await FoodOrder.findOne({
        userId: new mongoose.Types.ObjectId(userId),
        orderStatus: {
          $in: ["placed", "created", "confirmed", "preparing", "ready_for_pickup", "picked_up", "reached_pickup", "reached_drop"]
        }
      })
        .populate({ path: "restaurantId", select: "restaurantName name phone location addressLine1 area city state profileImage" })
        .sort({ createdAt: -1 })
        .lean();

      if (order) {
        activeOrder = normalizeOrderForClient(order);
        if (order.deliveryVerification?.dropOtp?.required && !order.deliveryVerification?.dropOtp?.verified) {
          activeOrder.handoverOtp = order.deliveryOtp;
        }
      }
    }
  } catch (err) {
    logger.error(`resyncState failed for ${role}:${userId} — ${err.message}`);
  }

  return { activeOrder, pendingOffers };
}

export async function updateOrderInstructions(orderId, userId, instructions) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError('Order id required');

  const order = await FoodOrder.findOne({ ...identity, userId });
  if (!order) {
    throw new NotFoundError('Order not found');
  }

  order.note = String(instructions || '').trim();
  await order.save();

  if (typeof emitOrderUpdate === 'function') {
    emitOrderUpdate(order, order.dispatch?.deliveryPartnerId);
  }

  return sanitizeOrderForExternal(order);
}

function getDistanceKm(coord1, coord2) {
  if (!coord1 || !coord2 || coord1.length < 2 || coord2.length < 2) return 0;
  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    constCosGeo(lat1 * Math.PI / 180) * constCosGeo(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function constCosGeo(rad) {
  return Math.cos(rad);
}

export async function getAvailableDriversForOrder(orderId) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");

  const order = await FoodOrder.findOne(identity).populate('restaurantId').lean();
  if (!order) throw new NotFoundError("Order not found");

  const pickupCoords = order.pickupPoints?.[0]?.location?.coordinates ||
    order.restaurantId?.location?.coordinates;
  if (!pickupCoords || pickupCoords.length < 2) {
    throw new ValidationError("Order does not have pickup location coordinates");
  }

  const pipeline = [
    {
      $geoNear: {
        near: { type: "Point", coordinates: pickupCoords },
        distanceField: "distanceMeters",
        spherical: true,
        query: {
          status: "approved",
          availabilityStatus: "online"
        }
      }
    }
  ];

  if (order.dispatch?.deliveryPartnerId) {
    pipeline[0].$geoNear.query._id = { $ne: order.dispatch.deliveryPartnerId };
  }

  const rawDrivers = await FoodDeliveryPartner.aggregate(pipeline);

  const availableDrivers = [];
  for (const driver of rawDrivers) {
    const activeCount = await FoodOrder.countDocuments({
      $or: [
        { "dispatch.deliveryPartnerId": driver._id },
        { "dispatchPlan.legs.deliveryPartnerId": driver._id }
      ],
      orderStatus: {
        $nin: ["delivered", "cancelled_by_user", "cancelled_by_restaurant", "cancelled_by_admin"]
      }
    });
    if (activeCount === 0) {
      availableDrivers.push({
        _id: driver._id,
        name: driver.name,
        phone: driver.phone,
        rating: driver.rating || 0,
        totalRatings: driver.totalRatings || 0,
        distanceKm: Math.round((driver.distanceMeters / 1000) * 10) / 10
      });
    }
  }

  return availableDrivers;
}

export async function reassignDeliveryPartnerAdmin(orderId, { newDriverId, reason, adminId }) {
  const newDriverObjectId = new mongoose.Types.ObjectId(newDriverId);
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");

  const partner = await FoodDeliveryPartner.findById(newDriverObjectId).lean();
  if (!partner || partner.status !== 'approved') {
    throw new ValidationError("Proposed driver is not approved");
  }
  if (partner.availabilityStatus !== 'online') {
    throw new ValidationError("Proposed driver is offline");
  }

  const activeCount = await FoodOrder.countDocuments({
    $or: [
      { "dispatch.deliveryPartnerId": partner._id },
      { "dispatchPlan.legs.deliveryPartnerId": partner._id }
    ],
    orderStatus: {
      $nin: ["delivered", "cancelled_by_user", "cancelled_by_restaurant", "cancelled_by_admin"]
    }
  });
  if (activeCount >= 1) {
    throw new ValidationError("Proposed driver is busy with another order");
  }

  const { config } = await import('../../../../config/env.js');
  const { getRedisClient } = await import('../../../../config/redis.js');
  const redis = getRedisClient();
  if (redis && config.redisEnabled) {
    const lockKey = `reassignment_lock_order_${orderId}`;
    const acquired = await redis.set(lockKey, '1', { NX: true, PX: 70000 });
    if (!acquired) {
      throw new ValidationError("Reassignment lock active (reassignment already in progress)");
    }
  }

  const order = await FoodOrder.findOneAndUpdate(
    {
      ...identity,
      orderStatus: { $nin: ['delivered', 'cancelled_by_user', 'cancelled_by_restaurant', 'cancelled_by_admin'] },
      reassignmentStatus: { $ne: 'pending' },
      'dispatch.deliveryPartnerId': { $ne: newDriverObjectId, $exists: true }
    },
    {
      $set: {
        reassignmentStatus: 'pending',
        pendingDriverId: newDriverObjectId
      }
    },
    { new: true }
  ).populate('restaurantId');

  if (!order) {
    throw new ValidationError("Order is not in reassignable state or driver is already assigned");
  }

  const fromDriverId = order.dispatch.deliveryPartnerId;

  const newEntry = {
    fromDriverId,
    toDriverId: newDriverObjectId,
    reassignedByAdminId: adminId ? new mongoose.Types.ObjectId(adminId) : null,
    statusAtReassignment: order.orderStatus,
    reason: reason || '',
    driverAPayout: 0,
    driverAPayoutRule: 'none',
    reassignmentStatus: 'pending',
    createdAt: new Date(),
    resolvedAt: null
  };

  order.reassignmentHistory.push(newEntry);
  await order.save();

  await addOrderJob({
    action: 'REASSIGNMENT_TIMEOUT',
    orderMongoId: String(order._id),
    pendingDriverId: String(newDriverId)
  }, {
    delay: 60000,
    jobId: `reassign:timeout:${order._id}`
  });

  const io = getIO();
  if (io) {
    const pickupAddress = order.pickupPoints?.[0]?.address || order.restaurantId?.addressLine1 || '';
    const dropAddress = order.deliveryAddress?.street || '';
    const amount = order.pricing?.deliveryFee || 0;
    io.to(rooms.delivery(newDriverId)).emit('new_reassignment_request', {
      order_id: String(order.orderId || order._id),
      orderMongoId: String(order._id),
      pickup: pickupAddress,
      dropoff: dropAddress,
      amount,
      timeout_seconds: 60,
      timeoutSeconds: 60
    });
  }

  return sanitizeOrderForExternal(order);
}

export async function acceptReassignmentDelivery(orderId, driverBId) {
  const driverBObjectId = new mongoose.Types.ObjectId(driverBId);
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");

  const order = await FoodOrder.findOne(identity).populate('restaurantId');
  if (!order) throw new NotFoundError("Order not found");
  if (order.reassignmentStatus !== 'pending') {
    throw new ValidationError("No pending reassignment for this order");
  }
  if (String(order.pendingDriverId) !== String(driverBId)) {
    throw new ForbiddenError("This reassignment is not offered to you");
  }

  const oldDriverId = order.dispatch.deliveryPartnerId;
  const lastEntry = order.reassignmentHistory[order.reassignmentHistory.length - 1];

  const isPickedUp = ['picked_up', 'reached_drop'].includes(order.orderStatus) ||
    ['en_route_to_delivery', 'at_drop'].includes(order.deliveryState?.currentPhase);
  let payoutAmount = 0;

  order.dispatch.deliveryPartnerId = driverBObjectId;
  order.reassignmentStatus = 'accepted';
  order.pendingDriverId = null;

  if (lastEntry) {
    lastEntry.reassignmentStatus = 'accepted';
    lastEntry.driverAPayout = payoutAmount;
    lastEntry.resolvedAt = new Date();
  }

  pushStatusHistory(order, {
    byRole: 'SYSTEM',
    from: 'pending_reassignment',
    to: 'reassigned_accepted',
    note: `Reassigned from ${oldDriverId} to ${driverBId}. Driver A payout: ₹${payoutAmount}`
  });

  await order.save();

  const { getOrderQueue } = await import('../../../../queues/index.js');
  const queue = getOrderQueue();
  if (queue) {
    const job = await queue.getJob(`reassign:timeout:${order._id}`);
    if (job) {
      await job.remove().catch(() => { });
    }
  }

  const io = getIO();
  if (io) {
    io.to(rooms.delivery(oldDriverId)).emit('order_reassigned_away', {
      order_id: String(order.orderId || order._id),
      orderMongoId: String(order._id),
      message: `Order #${order.orderId || order._id} has been reassigned by admin.`,
      earnings_credited: payoutAmount
    });

    const fullOrder = await getOrderById(order._id, { deliveryPartnerId: driverBId });
    io.to(rooms.delivery(driverBId)).emit('order_now_active', {
      order: fullOrder
    });

    io.to(rooms.admin(lastEntry?.reassignedByAdminId || 'all')).emit('reassignment_complete', {
      order_id: String(order.orderId || order._id),
      orderMongoId: String(order._id),
      new_driver_id: String(driverBId),
      newDriverId: String(driverBId),
      payout_credited: payoutAmount
    });
  }

  try {
    const { notifyOwnerSafely } = await import('../../../../core/notifications/firebase.service.js');
    await notifyOwnerSafely({
      ownerType: 'DELIVERY_PARTNER',
      ownerId: String(oldDriverId)
    }, {
      title: 'Order Reassigned',
      body: `Order #${order.orderId} reassigned. Check trip history for details.`,
      data: { type: 'order_reassigned', orderId: String(order._id) }
    });

    await notifyOwnerSafely({
      ownerType: 'DELIVERY_PARTNER',
      ownerId: String(driverBId)
    }, {
      title: 'New Order Active',
      body: `Order #${order.orderId} is now active. Start navigation.`,
      data: { type: 'order_active', orderId: String(order._id) }
    });
  } catch (pushErr) {
    logger.warn(`Push notifications failed: ${pushErr.message}`);
  }

  return {
    success: true,
    order: sanitizeOrderForExternal(order),
    driver_b_details: { id: driverBId },
    driver_a_payout: payoutAmount
  };
}

export async function rejectReassignmentDelivery(orderId, driverBId) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");

  const order = await FoodOrder.findOne(identity);
  if (!order) throw new NotFoundError("Order not found");
  if (order.reassignmentStatus !== 'pending') {
    throw new ValidationError("No pending reassignment for this order");
  }
  if (String(order.pendingDriverId) !== String(driverBId)) {
    throw new ForbiddenError("This reassignment is not offered to you");
  }

  const oldDriverId = order.dispatch.deliveryPartnerId;
  order.reassignmentStatus = 'rejected';
  order.pendingDriverId = null;

  const lastEntry = order.reassignmentHistory[order.reassignmentHistory.length - 1];
  if (lastEntry) {
    lastEntry.reassignmentStatus = 'rejected';
    lastEntry.resolvedAt = new Date();
  }

  await order.save();

  const { getOrderQueue } = await import('../../../../queues/index.js');
  const queue = getOrderQueue();
  if (queue) {
    const job = await queue.getJob(`reassign:timeout:${order._id}`);
    if (job) {
      await job.remove().catch(() => { });
    }
  }

  const io = getIO();
  if (io) {
    io.to(rooms.admin(lastEntry?.reassignedByAdminId || 'all')).emit('driver_rejected_reassignment', {
      order_id: String(order.orderId || order._id),
      orderMongoId: String(order._id),
      rejected_by: String(driverBId),
      rejectedBy: String(driverBId),
      order_still_with: String(oldDriverId),
      orderStillWith: String(oldDriverId)
    });
  }
}

export async function getReassignmentHistory(orderId) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");

  const order = await FoodOrder.findOne(identity)
    .populate({ path: 'reassignmentHistory.fromDriverId', select: 'name phone' })
    .populate({ path: 'reassignmentHistory.toDriverId', select: 'name phone' })
    .lean();
  if (!order) throw new NotFoundError("Order not found");

  return order.reassignmentHistory || [];
}

export async function processReassignmentTimeout(orderMongoId, pendingDriverId) {
  const order = await FoodOrder.findById(orderMongoId);
  if (!order || order.reassignmentStatus !== 'pending') return;

  const oldDriverId = order.dispatch.deliveryPartnerId;
  order.reassignmentStatus = 'timed_out';
  order.pendingDriverId = null;

  const lastEntry = order.reassignmentHistory[order.reassignmentHistory.length - 1];
  if (lastEntry) {
    lastEntry.reassignmentStatus = 'timed_out';
    lastEntry.resolvedAt = new Date();
  }

  await order.save();

  const io = getIO();
  if (io) {
    io.to(rooms.admin(lastEntry?.reassignedByAdminId || 'all')).emit('reassignment_timed_out', {
      order_id: String(order.orderId || order._id),
      orderMongoId: String(order._id),
      pending_driver_id: String(pendingDriverId),
      order_still_with: String(oldDriverId)
    });

    io.to(rooms.delivery(pendingDriverId)).emit('reassignment_request_expired', {
      order_id: String(order.orderId || order._id),
      orderMongoId: String(order._id)
    });
  }

  try {
    const { notifyAdminsSafely } = await import('../../../../core/notifications/firebase.service.js');
    await notifyAdminsSafely({
      title: 'Reassignment Timed Out',
      body: `Driver did not respond. Order #${order.orderId} is still with the original driver.`,
      data: { type: 'reassignment_timeout', orderId: String(order._id) }
    });
  } catch (err) {
    logger.warn(`FCM push failed for reassignment timeout: ${err.message}`);
  }
}

/**
 * Admin status update service that triggers appropriate workflows for user, driver, restaurant, and admin.
 */
export async function updateOrderStatusAdmin(orderId, adminId, orderStatus) {
  const VALID_STATUSES = [
    'placed', 'preparing', 'ready_for_pickup', 'picked_up', 'delivered', 'cancelled_by_admin'
  ];

  if (!VALID_STATUSES.includes(orderStatus)) {
    throw new ValidationError(`Invalid status '${orderStatus}'. Allowed: ${VALID_STATUSES.join(', ')}`);
  }

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new ValidationError('Invalid order id');
  }

  let order = await FoodOrder.findById(orderId);
  if (!order) {
    order = await FoodOrder.findOne({ orderId });
  }
  if (!order) throw new NotFoundError('Order not found');

  const from = order.orderStatus;
  order.orderStatus = orderStatus;

  pushStatusHistory(order, {
    byRole: 'ADMIN',
    byId: adminId,
    from,
    to: orderStatus,
    note: `Admin updated status from ${from} to ${orderStatus}`
  });

  // Handle specific status changes and timestamps
  if (orderStatus === 'delivered') {
    order.deliveredAt = new Date();
  }

  if (orderStatus === 'cancelled_by_admin') {
    order.cancelledAt = new Date();
    order.cancelledBy = 'admin';

    // If online paid, refund. If cash, fail/cancel.
    const isOnlinePaid = order.payment?.method === "razorpay" && 
      (order.payment?.status === "paid" || order.payment?.status === "refunded");
    if (!isOnlinePaid) {
      order.payment.status = "cancelled";
    }
  }

  await order.save();

  // 1. Transaction Sync
  if (orderStatus === 'cancelled_by_admin') {
    try {
      const isOnlinePaid = order.payment?.method === "razorpay" && 
        (order.payment?.status === "paid" || order.payment?.status === "refunded");
      await foodTransactionService.updateTransactionStatus(order._id, 'cancelled_by_admin', {
        status: isOnlinePaid ? 'refunded' : 'failed',
        note: `Order cancelled by admin`,
        recordedByRole: 'ADMIN',
        recordedById: adminId
      });
    } catch (err) {
      logger.warn(`updateOrderStatusAdmin transaction cancellation sync failed: ${err.message}`);
    }
  } else if (orderStatus === 'delivered') {
    try {
      const ledgerKind = (order.payment?.method === 'cash' || order.payment?.method === 'cod')
        ? 'cod_collected_by_delivery_partner'
        : 'delivered';
      await foodTransactionService.updateTransactionStatus(order._id, ledgerKind, {
        status: 'success',
        note: `Order delivered by admin status update`,
        recordedByRole: 'ADMIN',
        recordedById: adminId
      });
    } catch (err) {
      logger.warn(`updateOrderStatusAdmin transaction delivery sync failed: ${err.message}`);
    }
  }

  // 2. Real-time WebSocket notifications
  const io = getIO();
  if (io) {
    try {
      const payload = {
        orderMongoId: order._id.toString(),
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        title: `Order ${order.orderId} updated by admin`,
        message: `Status changed to ${String(orderStatus).replace(/_/g, ' ')}`
      };

      if (order.restaurantId) {
        io.to(rooms.restaurant(order.restaurantId)).emit('order_status_update', payload);
      }
      if (order.userId) {
        io.to(rooms.user(order.userId)).emit('order_status_update', payload);
      }
      if (order.dispatch?.deliveryPartnerId) {
        io.to(rooms.delivery(order.dispatch.deliveryPartnerId)).emit('order_status_update', payload);
      }
    } catch (err) {
      logger.warn(`updateOrderStatusAdmin socket emit failed: ${err.message}`);
    }
  }

  // 3. User & Restaurant Firebase Cloud Messaging (FCM) Push Notifications
  try {
    let title = `Order ${order.orderId} updated`;
    let body = `Status changed to ${String(orderStatus).replace(/_/g, " ")}`;

    if (orderStatus === "preparing") {
      title = "Food is being prepared! 🍳";
      body = "Your food is currently being prepared by the restaurant.";
    } else if (orderStatus === "ready_for_pickup") {
      title = "Food is ready! 🛍️";
      body = "Your order is ready and waiting to be picked up.";
    } else if (orderStatus === "picked_up") {
      title = "Food on the way! 🛵";
      body = "Your order has been picked up by the delivery partner and is on the way.";
    } else if (orderStatus === "delivered") {
      title = "Order Delivered! 🎉";
      body = "Your order has been delivered successfully. Enjoy your food!";
    } else if (orderStatus === "cancelled_by_admin") {
      const isOnlinePaid = order.payment?.method === "razorpay" && 
        (order.payment?.status === "paid" || order.payment?.status === "refunded");
      const refundDetail = isOnlinePaid ? ` Your refund of ₹${order.pricing?.total || 0} is being processed.` : "";
      title = "Order Cancelled ❌";
      body = `Unfortunately, your order has been cancelled by the admin.${refundDetail}`;
    }

    await notifyOwnersSafely(
      [{ ownerType: "USER", ownerId: order.userId }],
      {
        title,
        body,
        image: "https://i.ibb.co/3m2Yh7r/SUPERFAST-Brand-Image.png",
        data: {
          type: "order_status_update",
          orderId: order.orderId,
          orderMongoId: order._id.toString(),
          orderStatus,
          link: `/food/user/orders/${order._id.toString()}`
        }
      }
    );

    if (order.restaurantId) {
      await notifyOwnersSafely(
        [{ ownerType: "RESTAURANT", ownerId: order.restaurantId }],
        {
          title: `Admin status update`,
          body: `Order #${order.orderId} status set to ${orderStatus}`,
          image: "https://i.ibb.co/3m2Yh7r/SUPERFAST-Brand-Image.png",
          data: {
            type: "order_status_update",
            orderId: order.orderId,
            orderMongoId: order._id.toString(),
            orderStatus,
            link: `/restaurant/orders/${order._id.toString()}`
          }
        }
      );
    }
  } catch (err) {
    logger.warn(`updateOrderStatusAdmin push notification failed: ${err.message}`);
  }

  // 4. Driver Dispatch & Notifications
  if (orderStatus === "preparing" && from !== "preparing") {
    // Trigger dispatch
    if (order.dispatch?.status === "unassigned" && order.dispatch?.modeAtCreation === "auto") {
      try {
        await tryAutoAssign(order._id);
        order = await FoodOrder.findById(order._id);
      } catch (err) {
        logger.error(`updateOrderStatusAdmin auto-assign failed: ${err.message}`);
      }
    }

    try {
      const restaurant = await FoodRestaurant.findById(order.restaurantId)
        .select("restaurantName location addressLine1 area city state")
        .lean();
      const payload = buildDeliverySocketPayload(order, restaurant);

      if (order.dispatch?.deliveryPartnerId) {
        io?.to(rooms.delivery(order.dispatch.deliveryPartnerId)).emit("new_order", payload);
        io?.to(rooms.delivery(order.dispatch.deliveryPartnerId)).emit("play_notification_sound", { orderId: order.orderId });
      } else {
        // Send to near/active drivers if auto mode did not assign yet
        const { getAvailableDriversForOrder } = await import('./order.service.js');
        const drivers = await getAvailableDriversForOrder(order._id);
        for (const d of drivers) {
          io?.to(rooms.delivery(d.partnerId)).emit("play_notification_sound", { orderId: order.orderId });
        }
      }
    } catch (err) {
      logger.warn(`updateOrderStatusAdmin dispatch alert failed: ${err.message}`);
    }
  }

  if (orderStatus === "ready_for_pickup" && order.dispatch?.deliveryPartnerId) {
    // Notify driver order is ready
    try {
      const restaurant = await FoodRestaurant.findById(order.restaurantId)
        .select("restaurantName location addressLine1 area city state")
        .lean();
      const payload = buildDeliverySocketPayload(order, restaurant);
      io?.to(rooms.delivery(order.dispatch.deliveryPartnerId)).emit('order_ready', payload);

      await notifyOwnersSafely(
        [{ ownerType: "DELIVERY_PARTNER", ownerId: order.dispatch.deliveryPartnerId }],
        {
          title: "Order Ready for Pickup 🛍️",
          body: `Order #${order.orderId} is ready and waiting at the restaurant.`,
          image: "https://i.ibb.co/3m2Yh7r/SUPERFAST-Brand-Image.png",
          data: {
            type: "order_status_update",
            orderId: order.orderId,
            orderMongoId: order._id.toString(),
            orderStatus,
            link: `/delivery/orders/${order._id.toString()}`
          }
        }
      );
    } catch (err) {
      logger.warn(`updateOrderStatusAdmin driver ready notification failed: ${err.message}`);
    }
  }

  return order;
}

