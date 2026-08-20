import { useMemo } from 'react';
import { useDeliveryStore } from '@/modules/DeliveryV2/store/useDeliveryStore';
import { calculateDistance } from '@/modules/DeliveryV2/hooks/proximity.utils';
import { normalizeLocationPoint, getPrimaryPickupLocation } from '@/modules/DeliveryV2/utils/orderRouting';

/**
 * useProximityCheck - Professional hook for dynamic range monitoring.
 * Ensures rider can only advance based on Admin-defined ranges.
 * 
 * @returns {Object} { distanceToTarget, isWithinRange, actionLimit }
 */
export const useProximityCheck = () => {
  const riderLocation = useDeliveryStore((state) => state.riderLocation);
  const activeOrder = useDeliveryStore((state) => state.activeOrder);
  const tripStatus = useDeliveryStore((state) => state.tripStatus);
  const settings = useDeliveryStore((state) => state.settings);

  // Normalize rider location
  const normalizedRiderLoc = useMemo(() => {
    return normalizeLocationPoint(riderLocation);
  }, [riderLocation]);

  // Determine current target based on trip state
  const targetLocation = useMemo(() => {
    if (!activeOrder) return null;
    
    // If heading to pickup or arrived at pickup, target is restaurant
    if (['PICKING_UP', 'REACHED_PICKUP'].includes(tripStatus)) {
      return getPrimaryPickupLocation(activeOrder) || 
             normalizeLocationPoint(activeOrder.restaurantLocation || activeOrder.restaurant_location || activeOrder.pickupLocation || activeOrder.restaurantId);
    }
    
    // If heading to drop or arrived at drop, target is customer
    if (['PICKED_UP', 'REACHED_DROP'].includes(tripStatus)) {
      return normalizeLocationPoint(activeOrder.customerLocation || activeOrder.customer_location || activeOrder.dropLocation || activeOrder.deliveryAddress || activeOrder.address);
    }
    
    return null;
  }, [activeOrder, tripStatus]);

  // Determine current range limit from admin settings
  const actionLimit = useMemo(() => {
    if (tripStatus === 'PICKING_UP') return settings?.pickupRangeLimit || 5000;
    if (tripStatus === 'PICKED_UP') return settings?.deliveryRangeLimit || 5000;
    return 5000;
  }, [tripStatus, settings]);

  // Calculate real-time distance
  const distanceToTarget = useMemo(() => {
    if (!normalizedRiderLoc || !targetLocation) return Infinity;
    
    return calculateDistance(
      normalizedRiderLoc.lat,
      normalizedRiderLoc.lng,
      targetLocation.lat,
      targetLocation.lng
    );
  }, [normalizedRiderLoc, targetLocation]);

  // Dev mode or fallback when location is missing/delayed
  const isDevMode = import.meta.env.VITE_APP_MODE === 'developer' || 
                    import.meta.env.VITE_ENABLE_RANGE_BYPASS === 'true' ||
                    import.meta.env.DEV;

  // Allow action if within range OR if location is temporarily unavailable so rider is never locked out
  const isWithinRange = isDevMode || distanceToTarget === Infinity || (typeof distanceToTarget === 'number' && distanceToTarget <= actionLimit);

  return {
    distanceToTarget,
    isWithinRange,
    actionLimit,
  };
};
