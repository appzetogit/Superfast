import React, { useEffect, useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, MapPin, FastForward, Clock, Phone, ChefHat, ChevronDown, Package } from 'lucide-react';
import { ActionSlider } from '@/modules/DeliveryV2/components/ui/ActionSlider';
import { deliveryAPI } from '@food/api';
import { useDeliveryStore } from '@/modules/DeliveryV2/store/useDeliveryStore';
import { getHaversineDistance, calculateETA } from '@/modules/DeliveryV2/utils/geo';
import { isMixedOrder, normalizePickupPoints } from '@/modules/DeliveryV2/utils/orderRouting';

/**
 * NewOrderModal - Ported to Original 1:1 Theme with Slider Accept.
 * Matches the Zomato/Swiggy style Green Header + White Card.
 */
export const NewOrderModal = ({ order: initialOrder, onAccept, onReject, onTimeout, onMinimize }) => {
  const { riderLocation } = useDeliveryStore();
  const [fetchedDetails, setFetchedDetails] = useState(null);

  const rawOrderId = initialOrder?._id || initialOrder?.orderId || initialOrder?.orderMongoId || initialOrder?.id || 'temp';

  useEffect(() => {
    if (!rawOrderId || rawOrderId === 'temp') return;

    const hasPopulatedName = Boolean(
      initialOrder?.restaurantName || initialOrder?.storeName || initialOrder?.sellerName ||
      (typeof initialOrder?.restaurantId === 'object' && (initialOrder?.restaurantId?.restaurantName || initialOrder?.restaurantId?.name)) ||
      (typeof initialOrder?.seller === 'object' && (initialOrder?.seller?.shopName || initialOrder?.seller?.name))
    );

    if (!hasPopulatedName) {
      deliveryAPI.getOrderDetails(rawOrderId)
        .then((res) => {
          const details = res?.data?.data?.order || res?.data?.order || res?.data?.data;
          if (details && (details._id || details.orderId)) {
            setFetchedDetails(details);
          }
        })
        .catch(() => { });
    }
  }, [rawOrderId]);

  const order = useMemo(() => {
    if (!fetchedDetails) return initialOrder;
    return {
      ...initialOrder,
      ...fetchedDetails,
      dispatchLeg: initialOrder?.dispatchLeg || fetchedDetails?.dispatchLeg,
    };
  }, [initialOrder, fetchedDetails]);

  const pickupPoints = normalizePickupPoints(order);
  const primaryPickup = pickupPoints[0] || null;
  const mixedOrder = isMixedOrder(order);

  // Real-time timestamp-based countdown timer (30s duration)
  const orderId = order?._id || order?.orderId || order?.orderMongoId || 'temp';
  const expiresAtRef = useRef(null);

  if (!expiresAtRef.current || expiresAtRef.current.orderId !== orderId) {
    const parsedTime = order?.offeredAt ? new Date(order.offeredAt).getTime() : Date.now();
    const offeredTime = Number.isFinite(parsedTime) ? parsedTime : Date.now();
    const elapsed = Date.now() - offeredTime;
    const remainingMs = elapsed >= 0 && elapsed < 30000 ? (30000 - elapsed) : 30000;
    expiresAtRef.current = {
      orderId,
      endTime: Date.now() + remainingMs
    };
  }

  const [timeLeft, setTimeLeft] = useState(() => {
    const remaining = Math.ceil((expiresAtRef.current.endTime - Date.now()) / 1000);
    return Math.max(0, Math.min(30, remaining));
  });

  useEffect(() => {
    const updateTimer = () => {
      const remainingSeconds = Math.ceil((expiresAtRef.current.endTime - Date.now()) / 1000);
      if (remainingSeconds <= 0) {
        setTimeLeft(0);
        if (onTimeout) {
          onTimeout(order);
        } else if (onReject) {
          onReject(order, { isTimeout: true });
        }
      } else {
        setTimeLeft(Math.min(30, remainingSeconds));
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 500);

    // Pause timer while page is hidden (e.g. tel: call, navigation app)
    // so that a phone call doesn't eat into the countdown window.
    let hiddenAt = null;
    const handleVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
      } else {
        if (hiddenAt !== null) {
          // Extend expiry by however long the page was hidden
          const hiddenMs = Date.now() - hiddenAt;
          expiresAtRef.current = {
            ...expiresAtRef.current,
            endTime: expiresAtRef.current.endTime + hiddenMs,
          };
          hiddenAt = null;
        }
        updateTimer();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [orderId, onReject]);

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
    const resLat = parseFloat(order.restaurant_lat || order.restaurantLat || rest.latitude || rest.lat || (Array.isArray(rest.coordinates) ? rest.coordinates[1] : NaN));
    const resLng = parseFloat(order.restaurant_lng || order.restaurantLng || rest.longitude || rest.lng || (Array.isArray(rest.coordinates) ? rest.coordinates[0] : NaN));

    // Get customer (delivery) location
    const deliveryAddress = order?.deliveryAddress || {};
    const geoCoords =
      Array.isArray(deliveryAddress?.location?.coordinates) &&
        deliveryAddress.location.coordinates.length >= 2
        ? {
          lng: deliveryAddress.location.coordinates[0],
          lat: deliveryAddress.location.coordinates[1],
        }
        : (deliveryAddress.latitude && deliveryAddress.longitude
          ? { lat: deliveryAddress.latitude, lng: deliveryAddress.longitude }
          : null);
    const customerLoc = order.customerLocation || order.deliveryLocation || geoCoords || null;
    const custLat = parseFloat(customerLoc?.lat);
    const custLng = parseFloat(customerLoc?.lng);

    // Calculate Restaurant to Customer distance (plus Rider to Restaurant if available)
    if (!isNaN(resLat) && !isNaN(resLng) && !isNaN(custLat) && !isNaN(custLng)) {
      const restToCustM = getHaversineDistance(
        resLat, resLng,
        custLat, custLng
      );

      let riderToRestM = 0;
      if (riderLocation?.lat && riderLocation?.lng) {
        riderToRestM = getHaversineDistance(
          parseFloat(riderLocation.lat), parseFloat(riderLocation.lng),
          resLat, resLng
        );
      }

      const totalDistM = restToCustM + riderToRestM;
      const km = totalDistM / 1000;
      // Assume 25km/h avg for estimate (roughly 416m/min)
      const mins = Math.ceil(totalDistM / 416) + (order.prepTime || 5);

      return {
        distanceKm: km.toFixed(1),
        etaMins: mins
      };
    }

    // Fallback to order provided total distance if locations are missing
    const rawDist = Number(order.distanceKm || order.deliveryDistanceKm || order.distance || order.deliveryDistance || order.totalDistance || 0);
    const rawEta = order.estimatedTime || order.duration || order.eta || order.deliveryTime;

    if (rawDist > 0) {
      return {
        distanceKm: Number(rawDist).toFixed(1),
        etaMins: rawEta && rawEta > 0 ? Math.ceil(rawEta) : Math.ceil((rawDist * 1000) / 416) + 5
      };
    }

    return { distanceKm: '2.5', etaMins: order.prepTime || 15 };
  }, [order, primaryPickup, riderLocation]);

  if (!order) return null;

  // Calculate actual earnings using backend riderEarning directly
  const delFee = Number(order?.pricing?.deliveryFee || order?.deliveryFee || order?.delivery_fee || 0);
  const backendEarning = Number(
    order.riderEarning ??
    order.deliveryEarning ??
    order.earningAmount ??
    order.earnings ??
    0
  );

  const earnings = backendEarning > 0 ? backendEarning : (delFee > 0 ? delFee : 30);
  const isQuickOrder = String(order?.orderType || order?.serviceType || order?.type || '').trim().toLowerCase() === 'quick';
  const restaurantName =
    order?.dispatchLeg?.sourceName ||
    (isQuickOrder
      ? order?.storeName || order?.sellerName || order?.seller?.shopName || order?.seller?.name || 'Seller store'
      : order?.restaurantName || order?.restaurant_name || order?.restaurantId?.restaurantName || order?.restaurantId?.name || order?.restaurant?.restaurantName || order?.restaurant?.name || 'Restaurant');
  const restaurantAddress =
    (isQuickOrder
      ? order?.storeAddress || order?.sellerAddress || order?.seller?.location?.address || order?.seller?.location?.formattedAddress || order?.seller?.address
      : order?.restaurantAddress || order?.restaurant_address || order?.restaurantId?.location?.address || order?.restaurantId?.location?.formattedAddress || order?.restaurantId?.address || order?.restaurant?.location?.formattedAddress || order?.restaurant?.address) ||
    'Main Market Area';
  const deliveryAddress = order?.deliveryAddress || {};

  const geoCoords =
    Array.isArray(deliveryAddress?.location?.coordinates) &&
      deliveryAddress.location.coordinates.length >= 2
      ? {
        lng: deliveryAddress.location.coordinates[0],
        lat: deliveryAddress.location.coordinates[1],
      }
      : (deliveryAddress.latitude && deliveryAddress.longitude
        ? { lat: deliveryAddress.latitude, lng: deliveryAddress.longitude }
        : null);

  const customerLocation = order.customerLocation || order.deliveryLocation || geoCoords || null;

  const addressPartsFromSchema = [
    deliveryAddress.formattedAddress,
    deliveryAddress.address,
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
    order.address ||
    (addressPartsFromSchema.length ? addressPartsFromSchema.join(', ') : '') ||
    (customerLocation?.lat != null && customerLocation?.lng != null
      ? `Lat ${Number(customerLocation.lat).toFixed(5)}, Lng ${Number(customerLocation.lng).toFixed(5)}`
      : 'Customer Delivery Location');

  const mapsLink =
    customerLocation?.lat != null && customerLocation?.lng != null
      ? `https://www.google.com/maps?q=${encodeURIComponent(
        `${customerLocation.lat},${customerLocation.lng}`,
      )}`
      : null;

  const restaurantPhone = isQuickOrder
    ? order?.storePhone || order?.sellerPhone || order?.seller?.phone || order?.seller?.ownerPhone || order?.seller?.primaryContactNumber || order?.seller?.contactNumber || order?.seller?.mobile || ''
    : order?.restaurantPhone || order?.restaurant_phone || order?.restaurantId?.phone || order?.restaurantId?.ownerPhone || order?.restaurantId?.primaryContactNumber || order?.restaurantId?.contactNumber || order?.restaurantId?.mobile || order?.restaurant?.phone || order?.restaurant?.ownerPhone || order?.restaurant?.primaryContactNumber || order?.restaurant?.contactNumber || order?.phone || '';

  const customerPhone = order?.customerPhone || order?.customer_phone || order?.deliveryAddress?.phone || order?.user?.phone || order?.customer?.phone || order?.customer?.mobile || '';

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
      className="fixed inset-0 z-150 bg-black/60 flex items-end justify-center p-0"
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        className="w-full max-w-lg bg-white rounded-t-[2.5rem] overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.5)] flex flex-col max-h-[90dvh] max-h-[90vh]"
      >
        {/* Handle / Minimize */}
        <div className="w-full flex justify-center pb-1 pt-2 bg-white relative z-10 rounded-t-[2.5rem] shrink-0">
          <button onClick={onMinimize} className="p-1 hover:bg-gray-100 active:scale-95 transition-all rounded-full flex flex-col items-center">
            <ChevronDown className="w-5 h-5 text-gray-400 stroke-[3px]" />
          </button>
        </div>

        {/* Top Header Banner (Clean & Elegant) */}
        <div className="bg-slate-900 px-6 py-3.5 flex justify-between items-center text-white border-b border-slate-800 shrink-0">
          <div>
            <p className="text-slate-400 text-[10px] font-extrabold uppercase tracking-widest mb-0.5">Trip Earnings</p>
            {mixedOrder && (
              <div className="mb-1 inline-flex items-center rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-200">
                Mixed Order
              </div>
            )}
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-emerald-400">₹{Number(earnings || 0).toFixed(2)}</h2>
          </div>
          <div className="bg-slate-800 border border-slate-700/80 rounded-2xl px-4 py-1.5 text-amber-400 font-extrabold text-lg sm:text-xl shadow-inner tabular-nums">
            {timeLeft}s
          </div>
        </div>

        {/* Info Body */}
        <div className="p-5 pb-8 space-y-6 overflow-y-auto max-h-full flex-1">
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
                  const pickupAccent = isReturn ? 'text-blue-600' : (isQuickStore ? 'text-[var(--primary-theme)]' : 'text-green-600');
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

          {/* Zomato Style Order Items / Products Summary - Positioned prominently above Time & Distance */}
          {(() => {
            const rawItems = (Array.isArray(order?.items) && order.items.length > 0)
              ? order.items
              : ((Array.isArray(order?.products) && order.products.length > 0)
                ? order.products
                : ((Array.isArray(order?.foodItems) && order.foodItems.length > 0)
                  ? order.foodItems
                  : ((Array.isArray(order?.cartItems) && order.cartItems.length > 0)
                    ? order.cartItems
                    : ((Array.isArray(order?.orderItems) && order.orderItems.length > 0)
                      ? order.orderItems
                      : ((Array.isArray(order?.cart) && order.cart.length > 0)
                        ? order.cart
                        : (Array.isArray(order?.dispatchLeg?.items) ? order.dispatchLeg.items : []))))));
            const itemCount = rawItems.length || order?.itemCount || order?.totalItems || order?.totalQuantity || 0;
            const note = order?.note || order?.instructions || order?.deliveryInstructions || order?.userNote || '';

            return (
              <div className="space-y-3">
                {rawItems && rawItems.length > 0 ? (
                  <div className="p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200/80 space-y-2.5 shadow-xs">
                    <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                      <div className="flex items-center gap-2 text-slate-900 font-extrabold text-[11px] uppercase tracking-wider">
                        <Package className="w-4 h-4 text-emerald-600" />
                        <span>Order Summary ({rawItems.length} Items)</span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                        {itemCount} {itemCount === 1 ? 'Item' : 'Items'} Total
                      </span>
                    </div>

                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {rawItems.map((item, idx) => {
                        const itemName = item.name || item.itemName || item.title || item.productName || 'Item';
                        const qty = item.quantity || item.qty || item.count || 1;
                        const isVeg = item.isVeg !== undefined ? item.isVeg : true;
                        const itemPrice = Number(item.price || item.unitPrice || item.itemPrice || item.pricePerItem || item.item_price || 0);
                        const itemTotal = itemPrice > 0 ? itemPrice * qty : 0;

                        return (
                          <div key={idx} className="flex justify-between items-center text-xs font-bold text-slate-800 bg-white p-2.5 rounded-xl border border-slate-100 shadow-2xs">
                            <div className="flex items-center gap-2.5 flex-1 min-w-0 mr-2">
                              {/* Veg / Non-Veg Icon */}
                              <div className={`w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center shrink-0 ${isVeg ? 'border-emerald-600 bg-emerald-50' : 'border-rose-600 bg-rose-50'}`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${isVeg ? 'bg-emerald-600' : 'bg-rose-600'}`} />
                              </div>
                              <span className="truncate text-slate-900 leading-snug">{itemName}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {itemPrice > 0 ? (
                                <span className="text-[11px] font-bold text-slate-500">₹{itemPrice} × {qty} = <span className="font-extrabold text-slate-900">₹{itemTotal}</span></span>
                              ) : (
                                <span className="font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 rounded-md text-[11px]">
                                  x{qty}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Customer Bill Breakdown Card (Same as User Bill) */}
                    {(() => {
                      const p = order?.pricing || {};
                      const subtotal = Number(p.subtotal ?? p.itemsTotal ?? order?.subtotal ?? order?.itemsTotal ?? 0);
                      const deliveryFee = Number(p.deliveryFee ?? order?.deliveryFee ?? 0);
                      const platformFee = Number(p.platformFee ?? order?.platformFee ?? 0);
                      const tax = Number(p.tax ?? p.gst ?? order?.tax ?? 0);
                      const discount = Number(p.discount ?? order?.discount ?? 0);
                      const customerPaidTotal = Number(p.totalPrice ?? p.finalTotal ?? order?.totalPrice ?? order?.totalAmount ?? (subtotal + deliveryFee + platformFee + tax - discount));
                      const payMethod = String(order?.paymentMethod || order?.paymentMode || order?.payment?.method || 'online').toLowerCase();
                      const isCOD = payMethod === 'cash' || payMethod === 'cod';

                      return (
                        <div className="mt-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2 text-xs font-semibold text-slate-700">
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-slate-500">Item Subtotal</span>
                            <span className="font-bold text-slate-900">₹{subtotal.toFixed(2)}</span>
                          </div>
                          {deliveryFee > 0 && (
                            <div className="flex justify-between items-center text-[11px]">
                              <span className="text-slate-500">Delivery Fee</span>
                              <span className="font-bold text-slate-900">₹{deliveryFee.toFixed(2)}</span>
                            </div>
                          )}
                          {platformFee > 0 && (
                            <div className="flex justify-between items-center text-[11px]">
                              <span className="text-slate-500">Platform Fee</span>
                              <span className="font-bold text-slate-900">₹{platformFee.toFixed(2)}</span>
                            </div>
                          )}
                          {tax > 0 && (
                            <div className="flex justify-between items-center text-[11px]">
                              <span className="text-slate-500">Taxes & Charges</span>
                              <span className="font-bold text-slate-900">₹{tax.toFixed(2)}</span>
                            </div>
                          )}
                          {discount > 0 && (
                            <div className="flex justify-between items-center text-[11px] text-emerald-600">
                              <span>Discounts & Offers</span>
                              <span className="font-bold">-₹{discount.toFixed(2)}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center pt-2 border-t border-slate-200 text-sm font-black text-slate-900">
                            <span>Customer Total Bill</span>
                            <span className="text-emerald-700">₹{customerPaidTotal.toFixed(2)}</span>
                          </div>
                          <div className="flex items-center justify-between mt-1 pt-1">
                            <span className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full ${isCOD ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'}`}>
                              {isCOD ? '💵 Cash On Delivery' : '✅ Online Paid'}
                            </span>
                            {isCOD ? (
                              <span className="text-xs font-black text-amber-700">Collect ₹{customerPaidTotal.toFixed(2)}</span>
                            ) : (
                              <span className="text-xs font-bold text-emerald-700">Do Not Collect Cash</span>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : itemCount > 0 ? (
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center gap-2.5 text-xs font-bold text-slate-800">
                    <Package className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{itemCount} Items in Order</span>
                  </div>
                ) : null}

                {/* Customer Instructions / Cooking Note */}
                {note ? (
                  <div className="bg-amber-50/90 border border-amber-200/80 rounded-2xl p-3 flex gap-3 items-start shadow-2xs">
                    <ChefHat className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] font-extrabold text-amber-800 uppercase tracking-wider mb-0.5">Customer Instructions</p>
                      <p className="text-xs font-bold text-slate-900 leading-relaxed italic">"{note}"</p>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })()}

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center gap-3">
              <Clock className="w-4 h-4 text-[var(--primary-theme)]" />
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
