import { useDeliveryStore } from '@/modules/DeliveryV2/store/useDeliveryStore';
import { getPrimaryPickupLocation, normalizePickupPoints } from '@/modules/DeliveryV2/utils/orderRouting';

const FINISHED_STATUSES = [
  'delivered', 'completed', 'cancelled', 'cancelled_by_user',
  'cancelled_by_restaurant', 'cancelled_by_admin', 'handed_over',
  'handover_requested', 'handover_pending', 'handover_completed', 'transferred', 'reassigned',
];

const getLoc = (ref, keysLat, keysLng) => {
  if (!ref) return null;
  if (ref.location) {
    if (Array.isArray(ref.location.coordinates) && ref.location.coordinates.length >= 2) {
      return { lat: ref.location.coordinates[1], lng: ref.location.coordinates[0] };
    }
    return {
      lat: ref.location.latitude || ref.location.lat,
      lng: ref.location.longitude || ref.location.lng,
    };
  }
  for (const k of keysLat) {
    if (ref[k] != null) return { lat: ref[k], lng: ref[keysLng[keysLat.indexOf(k)]] };
  }
  return null;
};

const getBackendStatus = (order) =>
  String(order?.deliveryStatus || order?.orderState?.status || order?.orderStatus || order?.status || '').toLowerCase();

export const isTripFinished = (order) => {
  const backendStatus = getBackendStatus(order);
  const dispatchStatus = String(order?.dispatch?.status || '').toLowerCase();
  const handoverStatus = String(order?.handoverStatus || order?.handover?.status || order?.handoverRequest?.status || '').toLowerCase();
  return FINISHED_STATUSES.some((st) => backendStatus === st || dispatchStatus === st || handoverStatus === st);
};

/** Trip step of the focused order, from its backend status (null = leave as is). */
export const getTripStatusForOrder = (order) => {
  if (!order) return null;
  const backendStatus = getBackendStatus(order);
  const currentPhase = order.deliveryState?.currentPhase;
  if (['delivered', 'completed'].includes(backendStatus)) return 'COMPLETED';
  if (currentPhase === 'at_drop' || backendStatus === 'reached_drop') return 'REACHED_DROP';
  if (['picked_up', 'delivering'].includes(backendStatus)) return 'PICKED_UP';
  if (currentPhase === 'at_pickup' || backendStatus === 'reached_pickup') return 'REACHED_PICKUP';
  if (['created', 'confirmed', 'preparing', 'ready_for_pickup'].includes(backendStatus)) return 'PICKING_UP';
  if (order.dispatch?.status === 'accepted') return 'PICKING_UP';
  return null;
};

const normalizeTrip = (order) => ({
  ...order,
  pickupPoints: normalizePickupPoints(order),
  restaurantLocation:
    getPrimaryPickupLocation(order) ||
    getLoc(order.restaurantId, ['latitude', 'lat'], ['longitude', 'lng']) ||
    getLoc(order, ['restaurant_lat', 'restaurantLat', 'latitude'], ['restaurant_lng', 'restaurantLng', 'longitude']) ||
    order.restaurantLocation,
  customerLocation:
    getLoc(order.deliveryAddress, ['latitude', 'lat'], ['longitude', 'lng']) ||
    getLoc(order, ['customer_lat', 'customerLat', 'latitude'], ['customer_lng', 'customerLng', 'longitude']) ||
    order.customerLocation,
});

/**
 * Apply a GET /food/delivery/orders/current response to the store: every unfinished trip goes
 * into activeOrders (multi-order), the focused one is kept if still active, and the trip step
 * follows the focused order. Returns the number of active trips.
 */
export const applyActiveTripsResponse = (response, { clearWhenEmpty = true } = {}) => {
  const payload = response?.data?.data || {};
  const store = useDeliveryStore.getState();

  // A background poll must not swap the focused trip while its delivery summary is on screen;
  // resetTrip moves on to the next trip when the rider taps Done.
  if (!clearWhenEmpty && store.tripStatus === 'COMPLETED') return store.activeOrders.length;

  if (payload.maxSlots) store.setMaxSlots(payload.maxSlots);

  // Older backends only send activeOrder.
  const rawList = Array.isArray(payload.activeOrders)
    ? payload.activeOrders
    : [payload.activeOrder].filter(Boolean);
  const trips = rawList
    .filter((o) => o && (o._id || o.orderId))
    .filter((o) => !isTripFinished(o))
    .map(normalizeTrip);

  if (trips.length === 0) {
    // Background polls pass clearWhenEmpty=false so a just-completed trip's summary screen stays up.
    if (clearWhenEmpty) store.clearActiveOrder();
    return 0;
  }

  store.setActiveOrders(trips);
  const nextStatus = getTripStatusForOrder(useDeliveryStore.getState().activeOrder);
  if (nextStatus) store.updateTripStatus(nextStatus);
  return trips.length;
};
