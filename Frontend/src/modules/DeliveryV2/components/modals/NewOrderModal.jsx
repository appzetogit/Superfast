import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, MapPin, FastForward, Clock, Phone, ChefHat, ChevronDown } from 'lucide-react';
import { ActionSlider } from '@/modules/DeliveryV2/components/ui/ActionSlider';
import { useDeliveryStore } from '@/modules/DeliveryV2/store/useDeliveryStore';
import { getHaversineDistance, calculateETA } from '@/modules/DeliveryV2/utils/geo';
import { isMixedOrder, normalizePickupPoints } from '@/modules/DeliveryV2/utils/orderRouting';

/**
 * NewOrderModal - Ported to Original 1:1 Theme with Slider Accept.
 * Matches the Zomato/Swiggy style Green Header + White Card.
 */
export const NewOrderModal = ({ order, onAccept, onReject, onMinimize }) => {
  const { riderLocation } = useDeliveryStore();
  const [timeLeft, setTimeLeft] = useState(30);
  const pickupPoints = normalizePickupPoints(order);
  const primaryPickup = pickupPoints[0] || null;
  const mixedOrder = isMixedOrder(order);

  useEffect(() => {
    if (timeLeft <= 0) {
      onReject();
      return;
    }
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, onReject]);

  const isReturnPickup = order?.type === 'RETURN_PICKUP';

  const { distanceKm, etaMins } = useMemo(() => {
    if (!order) return { distanceKm: null, etaMins: null };

    if (order.type === 'RETURN_PICKUP') {
      return {
        distanceKm: Number(order.pickupDistance || 0).toFixed(1),
        etaMins: 15
      };
    }

    // Get pickup (restaurant/store) location
    const rest = primaryPickup?.location || order.restaurantLocation || order.restaurantId?.location || {};
    const resLat = parseFloat(order.restaurant_lat || order.restaurantLat || rest.latitude || rest.lat);
    const resLng = parseFloat(order.restaurant_lng || order.restaurantLng || rest.longitude || rest.lng);

    // Get customer (delivery) location
    const deliveryAddress = order?.deliveryAddress || {};
    const geoCoords =
      Array.isArray(deliveryAddress?.location?.coordinates) &&
      deliveryAddress.location.coordinates.length >= 2
        ? {
            lng: deliveryAddress.location.coordinates[0],
            lat: deliveryAddress.location.coordinates[1],
          }
        : null;
    const customerLoc = order.customerLocation || order.deliveryLocation || geoCoords || null;
    const custLat = parseFloat(customerLoc?.lat);
    const custLng = parseFloat(customerLoc?.lng);

    // Calculate Restaurant to Customer distance
    if (!isNaN(resLat) && !isNaN(resLng) && !isNaN(custLat) && !isNaN(custLng)) {
      const distM = getHaversineDistance(
        resLat, resLng,
        custLat, custLng
      );
      const km = distM / 1000;
      // Assume 25km/h avg for estimate (roughly 416m/min)
      const mins = Math.ceil(distM / 416) + (order.prepTime || 5);
      
      return { 
        distanceKm: km.toFixed(1), 
        etaMins: mins 
      };
    }

    // Fallback to order provided total distance if locations are missing
    const rawDist = order.deliveryDistanceKm || order.distanceKm;
    const rawEta = order.estimatedTime || order.duration || order.eta;
    
    if (rawDist != null) {
      return { 
        distanceKm: Number(rawDist).toFixed(1), 
        etaMins: rawEta && rawEta > 0 ? Math.ceil(rawEta) : Math.ceil((rawDist * 1000) / 416) + 5
      };
    }

    return { distanceKm: '??', etaMins: order.prepTime || 15 };
  }, [order, primaryPickup]);

  if (!order) return null;

  const earnings = isReturnPickup
    ? (order.expectedEarning || 0)
    : (order.earnings || order.riderEarning || (order.orderAmount ? order.orderAmount * 0.1 : 0));
  const isQuickOrder = String(order?.orderType || order?.serviceType || order?.type || '').trim().toLowerCase() === 'quick';
  const restaurantName =
    order?.dispatchLeg?.sourceName ||
    (isQuickOrder
      ? order?.storeName || order?.sellerName || order?.seller?.shopName || order?.seller?.name || 'Seller store'
      : order?.restaurantName || order?.restaurant_name || order?.restaurantId?.restaurantName || order?.restaurantId?.name || 'Restaurant');
  const restaurantAddress =
    (isQuickOrder
      ? order?.storeAddress || order?.sellerAddress || order?.seller?.location?.address || order?.seller?.location?.formattedAddress
      : order?.restaurantAddress || order?.restaurant_address || order?.restaurantId?.location?.address) ||
    'Address not available';
  const deliveryAddress = order?.deliveryAddress || {};

  const geoCoords =
    Array.isArray(deliveryAddress?.location?.coordinates) &&
    deliveryAddress.location.coordinates.length >= 2
      ? {
          lng: deliveryAddress.location.coordinates[0],
          lat: deliveryAddress.location.coordinates[1],
        }
      : null;

  const customerLocation = order.customerLocation || order.deliveryLocation || geoCoords || null;

  const addressPartsFromSchema = [
    deliveryAddress.street,
    deliveryAddress.additionalDetails,
    deliveryAddress.city,
    deliveryAddress.state,
    deliveryAddress.zipCode,
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean);

  const customerAddress =
    order.customerAddress ||
    order.customer_address ||
    (addressPartsFromSchema.length ? addressPartsFromSchema.join(', ') : '') ||
    (customerLocation?.lat != null && customerLocation?.lng != null
      ? `Lat ${Number(customerLocation.lat).toFixed(5)}, Lng ${Number(customerLocation.lng).toFixed(5)}`
      : 'Location not available');

  const mapsLink =
    customerLocation?.lat != null && customerLocation?.lng != null
      ? `https://www.google.com/maps?q=${encodeURIComponent(
          `${customerLocation.lat},${customerLocation.lng}`,
        )}`
      : null;

  const restaurantPhone = isQuickOrder
    ? order?.storePhone || order?.sellerPhone || order?.seller?.phone || ''
    : order?.restaurantPhone || order?.restaurant_phone || order?.restaurantId?.phone || '';

  const customerPhone = order?.customerPhone || order?.customer_phone || order?.deliveryAddress?.phone || order?.user?.phone || '';

  const pickupStops = isReturnPickup
    ? [
        {
          id: 'return:pickup',
          pickupType: 'return',
          sourceName: order.customerName || 'Customer',
          address: order.customerAddress || 'Customer Address',
          phone: customerPhone
        }
      ]
    : (pickupPoints.length
      ? pickupPoints.map(p => ({ ...p, phone: p.phone || restaurantPhone }))
      : [
          {
            id: order?.dispatchLeg?.legId || 'food:primary',
            pickupType: order?.dispatchLeg?.pickupType === 'quick' || isQuickOrder ? 'quick' : 'food',
            sourceName: order?.dispatchLeg?.sourceName || restaurantName,
            address: order?.dispatchLeg?.address || restaurantAddress,
            phone: order?.dispatchLeg?.phone || restaurantPhone
          },
        ]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-x-0 bottom-0 h-full z-150 bg-black/60 flex items-end justify-center p-0"
    >
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        className="w-full max-w-lg bg-white rounded-t-[3rem] overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.5)] flex flex-col pt-2"
      >
        {/* Handle / Minimize */}
        <div className="w-full flex justify-center pb-1 pt-1 bg-white relative z-10 rounded-t-[2rem] -mb-[2px]">
          <button onClick={onMinimize} className="p-1 hover:bg-gray-100 active:scale-95 transition-all rounded-full flex flex-col items-center">
             <ChevronDown className="w-5 h-5 text-gray-400 stroke-[3px]" />
          </button>
        </div>

        {/* Header Ribbon (Old Green Style) */}
        <div className="bg-green-500 p-5 flex justify-between items-center text-white border-b border-green-600/20">
          <div>
            <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest mb-0.5">Incoming Request</p>
            {mixedOrder && (
              <div className="mb-2 inline-flex items-center rounded-full border border-white/30 bg-white/15 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white">
                Mixed Order
              </div>
            )}
            <h2 className="text-3xl font-extrabold tracking-tight">₹{Number(earnings || 0).toFixed(2)}</h2>
          </div>
          <div className="bg-white/20 border border-white/30 rounded-2xl px-4 py-2 text-white font-bold text-xl shadow-inner tabular-nums">
            {timeLeft}s
          </div>
        </div>

        {/* Info Body */}
        <div className="p-5 pb-8 space-y-6">
          <div className="flex gap-4">
            <div className="flex flex-col items-center gap-1 mt-1.5 py-0.5">
              <div className={`w-4 h-4 rounded-full ${isReturnPickup ? 'bg-blue-500 border-blue-50 shadow-blue-500/20' : 'bg-green-500 border-green-50 shadow-green-500/20'} border-[3px] shadow-lg`} />
              <div className={`w-0.5 ${pickupStops.length > 1 ? 'h-24' : 'h-14'} bg-dashed border-l-2 border-gray-100`} />
              <div className={`w-4 h-4 rounded-full ${isReturnPickup ? 'bg-green-500 border-green-50 shadow-green-500/20' : 'bg-blue-500 border-blue-50 shadow-blue-500/20'} border-[3px] shadow-lg`} />
            </div>
            <div className="flex-1 space-y-6">
              <div className="space-y-4">
                {pickupStops.map((pickup, index) => {
                  const isReturn = pickup.pickupType === 'return';
                  const isQuickStore = pickup.pickupType === 'quick';
                  const pickupLabel = isReturn ? 'Customer Pickup' : (isQuickStore ? 'Store Pickup' : 'Restaurant Pickup');
                  const pickupAccent = isReturn ? 'text-blue-600' : (isQuickStore ? 'text-orange-600' : 'text-green-600');
                  const pickupAddress = pickup.address || 'Address not available';
                  return (
                    <div key={pickup.id || `${pickup.pickupType}-${index}`}>
                      <div className={`flex items-center gap-2 mb-1.5 font-bold text-[9px] uppercase tracking-widest ${pickupAccent}`}>
                        <ChefHat className="w-3.5 h-3.5" />
                        <span>{pickupStops.length > 1 ? `${pickupLabel} ${index + 1}` : pickupLabel}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-gray-950 font-bold text-lg leading-tight">{pickup.sourceName || (isQuickStore ? 'Seller store' : 'Restaurant')}</p>
                        <a 
                          href={pickup.phone ? `tel:${pickup.phone}` : '#'} 
                          className="ml-2 w-8 h-8 rounded-full bg-green-50 flex items-center justify-center text-green-600 border border-green-100 flex-shrink-0" 
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!pickup.phone) e.preventDefault();
                          }}
                        >
                          <Phone className="w-4 h-4" />
                        </a>
                      </div>
                      <p className="text-gray-500 text-xs font-medium leading-relaxed line-clamp-1 mt-0.5">{pickupAddress}</p>
                    </div>
                  );
                })}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1.5 font-bold text-[9px] uppercase tracking-widest text-blue-600">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{isReturnPickup ? 'Seller Drop' : 'Customer Drop'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-gray-950 font-bold text-lg leading-tight">
                    {isReturnPickup ? (order.sellerName || 'Seller Store') : 'Customer Location'}
                  </p>
                  <a 
                    href={customerPhone ? `tel:${customerPhone}` : '#'} 
                    className="ml-2 w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100 flex-shrink-0" 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!customerPhone) e.preventDefault();
                    }}
                  >
                    <Phone className="w-4 h-4" />
                  </a>
                </div>
                <p className="text-gray-500 text-xs font-medium line-clamp-1 mt-0.5 leading-relaxed">{isReturnPickup ? (order.sellerAddress || 'Seller Address') : customerAddress}</p>
                {!isReturnPickup && mapsLink && (
                  <a
                    href={mapsLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex mt-1 text-[9px] font-bold uppercase tracking-widest text-blue-600 hover:text-blue-700"
                  >
                    Open in Google Maps
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
             <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center gap-3">
               <Clock className="w-4 h-4 text-orange-500" />
               <div className="flex flex-col">
                  <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Time</span>
                  <span className="text-xs font-bold text-gray-900">{etaMins} MINS</span>
               </div>
             </div>
             <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center gap-3">
               <MapPin className="w-4 h-4 text-gray-400" />
               <div className="flex flex-col">
                  <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Distance</span>
                  <span className="text-xs font-bold text-gray-900">{distanceKm} KM</span>
               </div>
             </div>
          </div>

          {/* Action Area */}
          <div className="space-y-4">
            <ActionSlider 
              label="Slide to Accept" 
              onConfirm={() => onAccept(order)} 
              color="bg-green-600"
              successLabel="Order Accepted ✓"
            />

            <button 
              onClick={onReject}
              className="w-full text-gray-400 font-bold text-[9px] uppercase tracking-widest hover:text-red-500 transition-colors py-1 active:scale-95"
            >
              Pass this task
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
