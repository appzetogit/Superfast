import { FoodOrder } from "../models/order.model.js";
import { notifyOwnersSafely } from "../../../../core/notifications/firebase.service.js";
import { logger } from "../../../../utils/logger.js";

/**
 * Keeps an order alert "ringing" while the phone is locked / the app is closed.
 *
 * A single FCM notification only plays the channel sound once (about 1 second), which is easy to
 * miss. Until the order is accepted / rejected / expired we re-send the same push (same `ringTag`,
 * so it replaces the previous one instead of stacking) every few seconds. Each repeat re-alerts
 * the phone, so it rings continuously until the person acts.
 */

const RING_INTERVAL_MS = 6000;
const NEW_ORDER_STATUSES = ["placed", "created", "pending", "placed_pending"];

const activeRings = new Map();

const stopRing = (key) => {
  const entry = activeRings.get(key);
  if (!entry) return;
  clearTimeout(entry.timer);
  activeRings.delete(key);
};

const schedule = (key, tick) => {
  const entry = activeRings.get(key);
  if (!entry) return;
  entry.timer = setTimeout(tick, RING_INTERVAL_MS);
  entry.timer.unref?.();
};

/**
 * @param {object} opts
 * @param {string} opts.key              unique ring id (e.g. `restaurant:<orderId>`)
 * @param {string} opts.orderId          mongo id of the order
 * @param {Array<{ownerType:string, ownerId:any}>} opts.targets
 * @param {object} opts.payload          same payload given to notifyOwnersSafely
 * @param {number} opts.maxMs            stop ringing after this long (offer expiry)
 * @param {(order:object)=>Array|boolean} opts.stillPending  returns false (or the targets that
 *        should still ring) while the order is still waiting for a response
 */
const startRing = ({ key, orderId, targets, payload, maxMs, stillPending }) => {
  if (!key || !orderId || !targets?.length) return;
  stopRing(key);

  const startedAt = Date.now();
  activeRings.set(key, { timer: null });

  const tick = async () => {
    if (!activeRings.has(key)) return;
    if (Date.now() - startedAt >= maxMs) return stopRing(key);

    try {
      const order = await FoodOrder.findById(orderId)
        .select("orderStatus dispatch")
        .lean();
      const pending = order ? stillPending(order, targets) : false;
      if (!pending || (Array.isArray(pending) && pending.length === 0)) return stopRing(key);

      await notifyOwnersSafely(Array.isArray(pending) ? pending : targets, {
        ...payload,
        data: { ...(payload.data || {}), ringTag: key, isRepeat: "true" },
      });
    } catch (err) {
      logger.warn(`[OrderRing] repeat push failed for ${key}: ${err?.message || err}`);
    }
    schedule(key, tick);
  };

  schedule(key, tick);
};

/** Restaurant: ring until the order leaves the "waiting for acceptance" state (2 min offer). */
export const startRestaurantOrderRing = (orderDoc, payload) => {
  const orderId = orderDoc?._id?.toString?.();
  if (!orderId || !orderDoc.restaurantId) return;
  startRing({
    key: `restaurant:${orderId}`,
    orderId,
    targets: [{ ownerType: "RESTAURANT", ownerId: orderDoc.restaurantId }],
    payload,
    maxMs: 120000,
    stillPending: (order) =>
      NEW_ORDER_STATUSES.includes(String(order.orderStatus || "").toLowerCase()),
  });
};

/** Delivery partners: ring each offered rider until the offer is taken, rejected or times out. */
export const startDeliveryOrderRing = (orderDoc, partnerIds, payload, maxMs = 30000) => {
  const orderId = orderDoc?._id?.toString?.();
  if (!orderId || !partnerIds?.length) return;
  const targets = partnerIds.map((id) => ({ ownerType: "DELIVERY_PARTNER", ownerId: id }));
  startRing({
    key: `delivery:${orderId}`,
    orderId,
    targets,
    payload,
    maxMs,
    stillPending: (order, current) => {
      const status = String(order.orderStatus || "").toLowerCase();
      if (status.startsWith("cancelled") || ["delivered", "picked_up"].includes(status)) return false;
      if (String(order.dispatch?.status || "") !== "unassigned") return false;
      const done = new Set(
        (order.dispatch?.offeredTo || [])
          .filter((o) => o.action === "rejected" || o.action === "timeout")
          .map((o) => String(o.partnerId)),
      );
      return current.filter((t) => !done.has(String(t.ownerId)));
    },
  });
};

export const stopOrderRings = (orderId) => {
  const id = String(orderId || "");
  stopRing(`restaurant:${id}`);
  stopRing(`delivery:${id}`);
};
