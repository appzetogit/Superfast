import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package, Lock, Volume2, VolumeX, ChevronUp, ChevronDown,
  Phone, Navigation2, Clock, MapPin, ChevronRight, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { getHaversineDistance } from '@/modules/DeliveryV2/utils/geo';
import { normalizePickupPoints } from '@/modules/DeliveryV2/utils/orderRouting';

/**
 * DeliveryOrdersTabV2 - Multi-Order / Multi-Slot UI Component
 * 1:1 Match with Zomato/Swiggy Delivery Partner Orders View (Photo 1 & Photo 2).
 */
export default function DeliveryOrdersTabV2({
  activeOrders = [],
  activeOrder = null,
  maxSlots = 2,
  incomingOrder = null,
  availableOrders = [],
  onAccept,
  onReject,
  onSelectActiveOrder
}) {
  const [subTab, setSubTab] = useState('new'); // 'new' | 'accepted'
  const [isMuted, setIsMuted] = useState(false);
  const [isCardExpanded, setIsCardExpanded] = useState(true);

  // Helper to check if order is completed / handed over / cancelled / reassigned
  const isFinishedOrHandedOver = (ord) => {
    if (!ord) return true;
    const status = String(
      ord.deliveryStatus || ord.orderState?.status || ord.orderStatus || ord.status || ''
    ).toLowerCase();
    const dispatchStatus = String(ord.dispatch?.status || '').toLowerCase();
    const handoverStatus = String(ord.handoverStatus || ord.handover?.status || ord.handoverRequest?.status || '').toLowerCase();

    const finishedList = [
      'delivered', 'completed', 'cancelled', 'cancelled_by_user', 
      'cancelled_by_restaurant', 'cancelled_by_admin', 'handed_over', 
      'handover_requested', 'handover_pending', 'handover_completed', 'transferred', 'reassigned'
    ];

    return finishedList.includes(status) || 
           finishedList.includes(dispatchStatus) || 
           finishedList.includes(handoverStatus);
  };

  const validActiveOrders = (activeOrders || []).filter((ord) => !isFinishedOrHandedOver(ord));
  const validActiveOrder = (activeOrder && !isFinishedOrHandedOver(activeOrder)) ? activeOrder : null;

  const usedSlots = validActiveOrders.length > 0 ? validActiveOrders.length : (validActiveOrder ? 1 : 0);
  const isSlotsFull = usedSlots >= maxSlots;

  // Combine available orders (incoming socket order + API list)
  const displayNewOrders = [];
  const activeIds = new Set(
    validActiveOrders.concat(validActiveOrder ? [validActiveOrder] : []).map((a) => String(a.orderId || a._id || a.id || ''))
  );

  if (incomingOrder) {
    const incId = String(incomingOrder.orderId || incomingOrder._id || incomingOrder.id || '');
    const incStatus = String(
      incomingOrder.orderStatus || incomingOrder.status || incomingOrder.deliveryStatus || incomingOrder.dispatch?.status || ''
    ).toLowerCase();
    const incFinished = ['delivered', 'completed', 'cancelled', 'cancelled_by_user', 'cancelled_by_restaurant', 'cancelled_by_admin', 'accepted', 'handover_requested', 'handed_over', 'reassigned'].includes(incStatus);
    if (!activeIds.has(incId) && !incFinished) {
      displayNewOrders.push(incomingOrder);
    }
  }

  (availableOrders || []).forEach((ord) => {
    const ordId = String(ord.orderId || ord._id || ord.id || '');
    const ordStatus = String(
      ord.orderStatus || ord.status || ord.deliveryStatus || ord.dispatch?.status || ''
    ).toLowerCase();
    const isFinished = ['delivered', 'completed', 'cancelled', 'cancelled_by_user', 'cancelled_by_restaurant', 'cancelled_by_admin', 'accepted', 'handover_requested', 'handed_over', 'reassigned'].includes(ordStatus);
    const alreadyInList = displayNewOrders.some(
      (d) => String(d.orderId || d._id || d.id || '') === ordId
    );
    const alreadyAccepted = activeIds.has(ordId);
    if (!alreadyInList && !alreadyAccepted && !isFinished) {
      displayNewOrders.push(ord);
    }
  });

  const getOrderStatusLabel = (ord) => {
    const status = String(
      ord?.deliveryStatus || ord?.orderState?.status || ord?.orderStatus || ord?.status || ''
    ).toLowerCase();

    if (['delivered', 'completed'].includes(status)) return 'Delivered';
    if (['reached_drop', 'at_drop'].includes(status)) return 'Arrived at Drop';
    if (['picked_up', 'delivering'].includes(status)) return 'Delivering';
    if (['reached_pickup', 'at_pickup'].includes(status)) return 'Arrived at Pickup';
    return 'Picking Up';
  };

  return (
    <div className="w-full flex flex-col bg-[#f4f5f7] dark:bg-[#121212] min-h-screen">
      {/* ─── 1. TOP HEADER (Vibrant Orange Banner matching screenshots) ─── */}
      <div className="bg-gradient-to-b from-[#f94e10] to-[#e03d00] text-white pt-5 pb-4 px-4 shadow-lg sticky top-0 z-[150]">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-black tracking-tight uppercase">ORDERS</h1>
        </div>
        <p className="text-xs font-bold text-white/85 tracking-wide mb-3">
          {usedSlots}/{maxSlots} active slots used
        </p>

        {/* Segmented Pill Tabs */}
        <div className="bg-[#b33100]/60 p-1 rounded-2xl flex items-center justify-between border border-white/20">
          <button
            type="button"
            onClick={() => setSubTab('new')}
            className={`flex-1 py-2.5 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
              subTab === 'new'
                ? 'bg-white text-gray-900 shadow-md'
                : 'text-white/90 hover:text-white'
            }`}
          >
            <span>NEW ORDERS</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                subTab === 'new' ? 'bg-[#f94e10] text-white' : 'bg-white/20 text-white'
              }`}
            >
              {displayNewOrders.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('accepted')}
            className={`flex-1 py-2.5 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
              subTab === 'accepted'
                ? 'bg-white text-gray-900 shadow-md'
                : 'text-white/90 hover:text-white'
            }`}
          >
            <span>ACCEPTED</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                subTab === 'accepted' ? 'bg-[#f94e10] text-white' : 'bg-white/20 text-white'
              }`}
            >
              {validActiveOrders.length || (validActiveOrder ? 1 : 0)}
            </span>
          </button>
        </div>
      </div>

      {/* ─── 2. TAB CONTENT AREA ─── */}
      <div className="p-4 flex-1 space-y-4">
        {subTab === 'new' ? (
          /* --- NEW ORDERS TAB --- */
          <div className="space-y-4">
            {displayNewOrders.length === 0 ? (
              <div className="bg-white dark:bg-[#1c1c1e] rounded-3xl p-8 text-center border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col items-center justify-center my-6">
                <div className="w-16 h-16 rounded-full bg-orange-50 dark:bg-orange-950/40 text-[#f94e10] flex items-center justify-center mb-3">
                  <Package className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">No New Orders</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Stay online! New order offers in your delivery area will appear here instantly.
                </p>
              </div>
            ) : (
              displayNewOrders.map((order, idx) => {
                const orderId = order.displayOrderId || order.orderId || order._id || 'FOD-1001';
                const restaurantName =
                  order.restaurantName ||
                  order.storeName ||
                  order.restaurantId?.restaurantName ||
                  order.restaurantId?.name ||
                  'Partner Merchant';

                const restaurantAddr =
                  order.restaurantAddress ||
                  order.restaurantId?.addressLine1 ||
                  order.restaurantId?.address ||
                  'Merchant Address';

                const customerName =
                  order.customerName ||
                  order.userName ||
                  order.userId?.name ||
                  order.deliveryAddress?.name ||
                  'Customer';

                const customerPhone =
                  order.customerPhone ||
                  order.userId?.phone ||
                  order.deliveryAddress?.phone ||
                  '';

                const customerAddr =
                  order.customerAddress ||
                  order.deliveryAddress?.street ||
                  'Customer Drop Location';

                const orderTotal = Number(
                  order.total || order.pricing?.total || order.expectedEarning || 40
                );

                const pickupPoints = normalizePickupPoints(order);
                const primaryPickup = pickupPoints[0] || null;
                const rest = primaryPickup?.location || order.restaurantLocation || order.restaurantId?.location || {};
                const resLat = parseFloat(order.restaurant_lat || order.restaurantLat || rest.latitude || rest.lat || (Array.isArray(rest.coordinates) ? rest.coordinates[1] : NaN));
                const resLng = parseFloat(order.restaurant_lng || order.restaurantLng || rest.longitude || rest.lng || (Array.isArray(rest.coordinates) ? rest.coordinates[0] : NaN));

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
                const cusLat = parseFloat(customerLoc?.lat);
                const cusLng = parseFloat(customerLoc?.lng);

                let distanceKm = '2.5';
                let etaMins = order.prepTime || 15;

                if (!isNaN(resLat) && !isNaN(resLng) && !isNaN(cusLat) && !isNaN(cusLng)) {
                  const restToCustM = getHaversineDistance(resLat, resLng, cusLat, cusLng);
                  const km = restToCustM / 1000;
                  const mins = Math.ceil(restToCustM / 416) + (order.prepTime || 5);
                  distanceKm = km > 0 ? km.toFixed(1) : '2.5';
                  etaMins = mins > 0 ? mins : 15;
                } else {
                  const rawDist = Number(order.distanceKm || order.deliveryDistanceKm || order.distance || order.deliveryDistance || order.totalDistance || 0);
                  const rawEta = order.estimatedTime || order.duration || order.eta || order.deliveryTime;
                  if (rawDist > 0) {
                    distanceKm = rawDist.toFixed(1);
                    etaMins = rawEta && rawEta > 0 ? Math.ceil(rawEta) : Math.ceil((rawDist * 1000) / 416) + 5;
                  }
                }

                return (
                  <motion.div
                    key={order._id || order.orderId || idx}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white dark:bg-[#1c1c1e] rounded-3xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col"
                  >
                    {/* Header Bar */}
                    <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 bg-[#f94e10] rounded-2xl flex items-center justify-center text-white shrink-0 shadow-md">
                          <Package className="w-6 h-6 stroke-[2.5]" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
                            NEW ORDER #{orderId}
                          </span>
                          <h2 className="text-base font-extrabold text-gray-900 dark:text-white truncate">
                            {restaurantName}
                          </h2>
                          <span className="text-xs font-bold text-gray-600 dark:text-gray-300">
                            ₹{orderTotal.toFixed(2)} · <span className="text-gray-500 font-bold">{distanceKm} KM ({etaMins} MINS)</span>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 text-gray-400">
                        <button
                          type="button"
                          onClick={() => setIsMuted(!isMuted)}
                          className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsCardExpanded(!isCardExpanded)}
                          className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                          {isCardExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Expandable Route Body */}
                    {isCardExpanded && (
                      <div className="p-4 space-y-4">
                        {/* Timeline Route Container */}
                        <div className="relative pl-6 space-y-5">
                          {/* Dotted Vertical Connector Line */}
                          <div className="absolute left-[9px] top-3 bottom-3 w-0.5 border-l-2 border-dashed border-gray-300 dark:border-gray-700" />

                          {/* 1. Pickup Node */}
                          <div className="relative flex items-start justify-between gap-3">
                            <div className="absolute -left-[23px] top-1 w-4 h-4 rounded-full bg-orange-100 dark:bg-orange-950 border-2 border-[#f94e10] flex items-center justify-center">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#f94e10]" />
                            </div>

                            <div className="flex-1 min-w-0">
                              <span className="text-[10px] font-black uppercase text-[#f94e10] tracking-wider flex items-center gap-1">
                                RESTAURANT / STORE PICKUP
                              </span>
                              <h4 className="text-sm font-bold text-gray-900 dark:text-white mt-0.5 truncate">
                                {restaurantName}
                              </h4>
                              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">
                                {restaurantAddr}
                              </p>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {order.restaurantPhone && (
                                <a
                                  href={`tel:${order.restaurantPhone}`}
                                  className="w-8 h-8 rounded-full border border-orange-200 dark:border-orange-900/50 bg-orange-50 dark:bg-orange-950/40 text-[#f94e10] flex items-center justify-center"
                                >
                                  <Phone className="w-4 h-4" />
                                </a>
                              )}
                              {resLat && resLng && (
                                <a
                                  href={`https://www.google.com/maps/dir/?api=1&destination=${resLat},${resLng}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center"
                                >
                                  <Navigation2 className="w-4 h-4 rotate-45" />
                                </a>
                              )}
                            </div>
                          </div>

                          {/* 2. Drop Node */}
                          <div className="relative flex items-start justify-between gap-3">
                            <div className="absolute -left-[23px] top-1 w-4 h-4 rounded-full bg-orange-500 border-2 border-white flex items-center justify-center">
                              <div className="w-1.5 h-1.5 rounded-full bg-white" />
                            </div>

                            <div className="flex-1 min-w-0">
                              <span className="text-[10px] font-black uppercase text-[#f94e10] tracking-wider flex items-center gap-1">
                                CUSTOMER DROP
                              </span>
                              <h4 className="text-sm font-bold text-gray-900 dark:text-white mt-0.5 truncate">
                                {customerName}
                              </h4>
                              {customerPhone && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                                  {customerPhone}
                                </p>
                              )}
                              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">
                                {customerAddr}
                              </p>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {customerPhone && (
                                <a
                                  href={`tel:${customerPhone}`}
                                  className="w-8 h-8 rounded-full border border-orange-200 dark:border-orange-900/50 bg-orange-50 dark:bg-orange-950/40 text-[#f94e10] flex items-center justify-center"
                                >
                                  <Phone className="w-4 h-4" />
                                </a>
                              )}
                              {cusLat && cusLng && (
                                <a
                                  href={`https://www.google.com/maps/dir/?api=1&destination=${cusLat},${cusLng}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center"
                                >
                                  <Navigation2 className="w-4 h-4 rotate-45" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Stats Row */}
                        <div className="grid grid-cols-2 gap-3 pt-2">
                          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-3 border border-gray-100 dark:border-gray-700/50 flex items-center gap-3">
                            <Clock className="w-5 h-5 text-gray-400" />
                            <div>
                              <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">TIME</span>
                              <span className="text-xs font-bold text-gray-800 dark:text-gray-200">{etaMins} MINS</span>
                            </div>
                          </div>
                          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-3 border border-gray-100 dark:border-gray-700/50 flex items-center gap-3">
                            <MapPin className="w-5 h-5 text-gray-400" />
                            <div>
                              <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">DISTANCE</span>
                              <span className="text-xs font-bold text-gray-800 dark:text-gray-200">{distanceKm} KM</span>
                            </div>
                          </div>
                        </div>

                        {/* Slot Full Banner vs Accept Button */}
                        {isSlotsFull ? (
                          <div className="bg-[#fffbeb] dark:bg-amber-950/30 border border-[#fde68a] dark:border-amber-800/50 rounded-2xl p-3.5 flex items-center gap-3">
                            <Lock className="w-5 h-5 text-[#d97706] shrink-0" />
                            <p className="text-xs font-bold text-[#92400e] dark:text-amber-200 leading-snug">
                              All {maxSlots} slots in use — complete an active order to accept more
                            </p>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onAccept && onAccept(order)}
                            className="w-full bg-[#0e8345] hover:bg-[#0c723c] active:scale-[0.98] text-white py-3.5 rounded-2xl font-black text-sm uppercase tracking-wider shadow-md flex items-center justify-center gap-2 transition-all"
                          >
                            <span>ACCEPT TASK</span>
                          </button>
                        )}

                        {/* PASS THIS TASK (Reject Link) */}
                        <div className="text-center pt-1">
                          <button
                            type="button"
                            onClick={() => onReject && onReject(order)}
                            className="text-xs font-extrabold text-gray-400 hover:text-red-500 uppercase tracking-widest transition-colors"
                          >
                            PASS THIS TASK
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                );
              })
            )}
          </div>
        ) : (
          /* --- ACCEPTED ORDERS TAB --- */
          <div className="space-y-3">
            {validActiveOrders.length === 0 && !validActiveOrder ? (
              <div className="bg-white dark:bg-[#1c1c1e] rounded-3xl p-8 text-center border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col items-center justify-center my-6">
                <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center mb-3">
                  <Package className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">No Accepted Orders</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  You currently have no active accepted delivery tasks. Switch to "NEW ORDERS" to accept available orders.
                </p>
              </div>
            ) : (
              (validActiveOrders.length > 0 ? validActiveOrders : (validActiveOrder ? [validActiveOrder] : [])).map((ord, idx) => {
                const ordId = ord.displayOrderId || ord.orderId || ord._id || 'FOD-1001';
                const merchantName =
                  ord.restaurantName ||
                  ord.storeName ||
                  ord.restaurantId?.restaurantName ||
                  ord.restaurantId?.name ||
                  'Partner Merchant';
                const statusLabel = getOrderStatusLabel(ord);
                const isSelected =
                  String(activeOrder?.orderId || activeOrder?._id || activeOrder?.id || '') ===
                  String(ord.orderId || ord._id || ord.id || '');

                return (
                  <motion.div
                    key={ord._id || ord.orderId || idx}
                    onClick={() => onSelectActiveOrder && onSelectActiveOrder(ord)}
                    className={`bg-[#eef4ff] dark:bg-[#182232] rounded-2xl p-4 border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'border-blue-500 shadow-md ring-2 ring-blue-400/30'
                        : 'border-blue-100 dark:border-blue-900/50 hover:bg-blue-100/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 bg-[#1b4b9b] rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm">
                        <Package className="w-5 h-5 stroke-[2.5]" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] font-black uppercase text-gray-500 dark:text-gray-400 tracking-wider">
                          ORDER #{ordId}
                        </span>
                        <h4 className="text-sm font-extrabold text-gray-900 dark:text-white truncate">
                          {merchantName}
                        </h4>
                        <span className="text-xs font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                          {statusLabel}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <ChevronRight className="w-5 h-5 text-blue-500" />
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
