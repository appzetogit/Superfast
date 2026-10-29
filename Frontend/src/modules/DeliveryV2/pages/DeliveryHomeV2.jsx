import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import apiClient from '../../../services/api/axios';
import { useDeliveryStore } from '@/modules/DeliveryV2/store/useDeliveryStore';
import { useProximityCheck } from '@/modules/DeliveryV2/hooks/useProximityCheck';
import { useOrderManager } from '@/modules/DeliveryV2/hooks/useOrderManager';
import { useDeliveryNotifications } from '@food/hooks/useDeliveryNotifications';
import { deliveryAPI, gigAPI } from '@food/api';
import { requireLocation } from '../utils/requireLocation';
import { findRunningBooking } from '../utils/gigWindow';
import { toast } from 'sonner';
import { registerWebPushForCurrentModule } from '@food/utils/firebaseMessaging';

// Components
import LiveMap from '@/modules/DeliveryV2/components/map/LiveMap';
import TargetProgressCardV2 from '@/modules/DeliveryV2/components/TargetProgressCardV2';
import { NewOrderModal } from '@/modules/DeliveryV2/components/modals/NewOrderModal';
import { PickupActionModal } from '@/modules/DeliveryV2/components/modals/PickupActionModal';
import { DeliveryVerificationModal } from '@/modules/DeliveryV2/components/modals/DeliveryVerificationModal';
import { OrderSummaryModal } from '@/modules/DeliveryV2/components/modals/OrderSummaryModal';
import { BookGigModal } from '@/modules/DeliveryV2/components/modals/BookGigModal';
import ActiveOrderDetailsBar from '@/modules/DeliveryV2/components/ActiveOrderDetailsBar';
import ActionSlider from '@/modules/DeliveryV2/components/ui/ActionSlider';

// Sub Pages
import PocketV2 from '@/modules/DeliveryV2/pages/PocketV2';
import HistoryV2 from '@/modules/DeliveryV2/pages/HistoryV2';
import ProfileV2 from '@/modules/DeliveryV2/pages/ProfileV2';
import DeliveryOrdersTabV2 from '@/modules/DeliveryV2/components/DeliveryOrdersTabV2';

// Icons
import {
  Bell, HelpCircle, AlertTriangle,
  Wallet, History, User as UserIcon, LayoutGrid,
  Plus, Minus, Navigation2, Target, Play, CheckCircle2, Clock, ChevronDown,
  Contact, Package, Calendar, X, Loader2, Phone
} from 'lucide-react';

import { getHaversineDistance, calculateETA, calculateHeading } from '@/modules/DeliveryV2/utils/geo';
import { calculateDistance } from '@/modules/DeliveryV2/hooks/proximity.utils';
import { normalizeLocationPoint } from '@/modules/DeliveryV2/utils/orderRouting';
import { getTripStatusForOrder } from '@/modules/DeliveryV2/utils/activeTrips';

// No GPS fix for this long while online = treat GPS as off.
const GPS_STALE_MS = 60 * 1000;
// Server push for "GPS off" is requested at most this often (server throttles too).
const GPS_REPORT_REPEAT_MS = 5 * 60 * 1000;

/** Phone of the customer who placed the order (dialable), or '' when unknown. */
const getCustomerPhone = (order) =>
  String(
    order?.customerPhone || order?.userPhone || order?.user?.phone || order?.userId?.phone || order?.deliveryAddress?.phone || ''
  ).replace(/[^\d+]/g, '');

const callCustomer = async (order) => {
  let phone = getCustomerPhone(order);
  if (!phone) {
    const orderId = order?.orderId || order?._id || order?.orderMongoId;
    if (orderId) {
      try {
        const res = await deliveryAPI.getOrderDetails(String(orderId));
        const full = res?.data?.data?.order || res?.data?.order || res?.data?.data;
        phone = getCustomerPhone(full);
      } catch {
        // fall through to the error toast below
      }
    }
  }
  if (!phone) {
    toast.error('Customer phone number is not available');
    return;
  }
  window.location.href = `tel:${phone}`;
};
import { getPrimaryPickupLocation, normalizePickupPoints } from '@/modules/DeliveryV2/utils/orderRouting';
import { applyActiveTripsResponse } from '@/modules/DeliveryV2/utils/activeTrips';
import { useCompanyName } from "@food/hooks/useCompanyName";
import { useNavigate } from 'react-router-dom';
import useNotificationInbox from "@food/hooks/useNotificationInbox";

/** Minimal bottom-sheet popup (Restored from legacy FeedNavbar) */
function BottomPopup({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[600] flex items-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="relative w-full bg-white rounded-t-3xl shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
            <AlertTriangle className="w-4 h-4" />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

/**
 * DeliveryHomeV2 - Premium 1:1 Match with Original App UI.
 * Featuring logical tab switching for Feed, Pocket, History, and Profile.
 */
export default function DeliveryHomeV2({ tab = 'feed' }) {
  const navigate = useNavigate();
  const { riderLocation, settings: deliverySettings, isOnline, toggleOnline, activeOrder, activeOrders, maxSlots, tripStatus, setRiderLocation, setActiveOrder, updateTripStatus, clearActiveOrder } = useDeliveryStore();
  const { isWithinRange, distanceToTarget } = useProximityCheck();
  const { acceptOrder, rejectOrder, reachPickup, pickUpOrder, reachDrop, completeDelivery, resetTrip } = useOrderManager();
  // Multi-order: the drop slider checks the focused order only. When the rider is standing at the
  // drop of another picked-up order, focus that order so its slider unlocks.
  useEffect(() => {
    if (tripStatus !== 'PICKED_UP' || isWithinRange || !Array.isArray(activeOrders) || activeOrders.length < 2) return;
    const rider = normalizeLocationPoint(riderLocation);
    if (!rider) return;
    const limit = deliverySettings?.deliveryRangeLimit || 5000;
    const currentId = String(activeOrder?.orderId || activeOrder?._id || activeOrder?.id || '');
    let best = null;
    let bestDist = Infinity;
    for (const o of activeOrders) {
      if (String(o?.orderId || o?._id || o?.id || '') === currentId) continue;
      if (getTripStatusForOrder(o) !== 'PICKED_UP') continue;
      const drop = normalizeLocationPoint(o.customerLocation || o.deliveryAddress);
      if (!drop) continue;
      const d = calculateDistance(rider.lat, rider.lng, drop.lat, drop.lng);
      if (d <= limit && d < bestDist) {
        best = o;
        bestDist = d;
      }
    }
    if (best) setActiveOrder(best);
  }, [tripStatus, isWithinRange, activeOrders, activeOrder, riderLocation, deliverySettings, setActiveOrder]);

  const { newOrder, clearNewOrder, stopAlertLoop, ringForOrder, orderStatusUpdate, clearOrderStatusUpdate, isConnected: isSocketConnected, emitLocation } = useDeliveryNotifications();
  const companyName = useCompanyName();
  const { unreadCount: notificationUnreadCount } = useNotificationInbox("delivery", { limit: 20 });

  const [incomingOrder, setIncomingOrder] = useState(null);
  // Offer that arrived while the rider is on a trip: silent banner, tap opens that order.
  const [tripOfferBanner, setTripOfferBanner] = useState(null);
  const [availableOrdersList, setAvailableOrdersList] = useState([]);
  const [currentTab, setCurrentTab] = useState(tab);
  const [codLimitReached, setCodLimitReached] = useState(false);
  const rejectedOrderIdsRef = useRef(new Set());

  // Another rider accepted the order: remove it from this rider's New Orders list at once.
  useEffect(() => {
    const onClaimed = (e) => {
      const d = e?.detail || {};
      const ids = [d.orderId, d.orderMongoId, d._id].filter(Boolean).map(String);
      if (!ids.length) return;
      ids.forEach((id) => rejectedOrderIdsRef.current.add(id));
      const matches = (item) =>
        [item?._id, item?.orderId, item?.id, item?.orderMongoId].filter(Boolean).map(String).some((v) => ids.includes(v));
      setAvailableOrdersList((prev) => prev.filter((item) => !matches(item)));
      setIncomingOrder((cur) => (cur && matches(cur) ? null : cur));
    };
    window.addEventListener('deliveryOrderClaimed', onClaimed);
    return () => window.removeEventListener('deliveryOrderClaimed', onClaimed);
  }, []);
  const timedOutOrdersMapRef = useRef(new Map());

  // Track URL changes (Prop changes) to update sub-page content
  useEffect(() => {
    setCurrentTab(tab);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo(0, 0);
    }
  }, [tab]);

  const [showVerification, setShowVerification] = useState(false);
  const [showEmergencyPopup, setShowEmergencyPopup] = useState(false);
  const [showBookGigModal, setShowBookGigModal] = useState(false);
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [handoverReason, setHandoverReason] = useState('Vehicle Breakdown / Flat Tyre');
  const [submittingHandover, setSubmittingHandover] = useState(false);
  const [profileImage, setProfileImage] = useState(null);
  const [emergencyNumbers, setEmergencyNumbers] = useState({
    medicalEmergency: "",
    accidentHelpline: "",
    contactPolice: "",
    insurance: "",
  });

  const [isModalMinimized, setIsModalMinimized] = useState(false);
  const [eta, setEta] = useState(null);
  const [activeReturn, setActiveReturn] = useState(null);

  const handleHandoverSubmit = async () => {
    if (!activeOrder) return;
    setSubmittingHandover(true);
    try {
      const res = await gigAPI.createHandoverRequest({
        orderId: activeOrder._id || activeOrder.orderId,
        reason: handoverReason,
      });
      if (res?.data?.success) {
        toast.success('🚨 Handover submitted! Order reassigned to other drivers.');
        setShowHandoverModal(false);
        useDeliveryStore.getState().setOnline(false);
        resetTrip();
        deliveryAPI.updateOnlineStatus(false).catch(() => {});
      } else {
        toast.error(res?.data?.message || 'Failed to submit handover request');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Handover submission failed');
    } finally {
      setSubmittingHandover(false);
    }
  };

  useEffect(() => {
    if (!isOnline) return;
    const fetchActiveReturn = async () => {
      try {
        const response = await apiClient.get('/quick-commerce/delivery/returns/active', { contextModule: 'delivery' });
        const data = response.data || {};
        if (data.success && data.activePickups && data.activePickups.length > 0) {
          const ret = data.activePickups[0];
          setActiveReturn(ret);

          if (!sessionStorage.getItem("hasAutoRedirectedReturn")) {
            sessionStorage.setItem("hasAutoRedirectedReturn", "true");
            navigate(`/food/delivery/quick-commerce/returns/${ret._id}/active`);
          }
        } else {
          setActiveReturn(null);
        }
      } catch (e) {
        console.error("Failed to fetch active return", e);
      }
    };
    // Poll active return every 10s if we are on the feed tab
    fetchActiveReturn();
    const interval = setInterval(() => {
      if (!document.hidden && currentTab === 'feed') {
        fetchActiveReturn();
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [isOnline, navigate, currentTab]);

  const scrollContainerRef = useRef(null);
  const lastLocationSentAt = useRef(0);
  const lastCoordRef = useRef(null);
  const lastGpsFixAtRef = useRef(0);
  const gpsOffShownRef = useRef(false);
  const gpsReportedAtRef = useRef(0);
  const rollingSpeedRef = useRef([]);
  const lastAutoArrivalRef = useRef({ PICKING_UP: false, PICKED_UP: false });

  const [zoom, setZoom] = useState(14);
  const [activePolyline, setActivePolyline] = useState(null);
  const mapRef = useRef(null);

  // The app cannot switch GPS on itself: keep a banner up until the rider does it
  const alertGpsOff = useCallback((denied = false) => {
    if (document.hidden) return; // Do not alert when app is backgrounded or screen locked
    gpsOffShownRef.current = true;
    toast.error(
      denied
        ? 'Location permission blocked hai. App/browser settings me Location allow karein.'
        : 'GPS signal weak hai. Kripya phone ki Location (GPS) check karein.',
      {
        id: 'gps-off',
        duration: 8000,
        action: {
          label: 'Check karein',
          onClick: () => {
            requireLocation().then((loc) => {
              if (!loc.ok) return;
              lastGpsFixAtRef.current = Date.now();
              gpsOffShownRef.current = false;
              toast.dismiss('gps-off');
            });
          },
        },
      }
    );
  }, []);

  const clearGpsOff = useCallback(() => {
    lastGpsFixAtRef.current = Date.now();
    if (!gpsOffShownRef.current) return;
    gpsOffShownRef.current = false;
    toast.dismiss('gps-off');
  }, []);

  const handleGeolocationError = useCallback((error) => {
    if (document.hidden) return; // Ignore errors while phone is locked or tab is hidden

    if (error && error.code === error.PERMISSION_DENIED) {
      alertGpsOff(true);
      return;
    }

    if (error && error.code === error.TIMEOUT) {
      console.warn('GPS signal weak or timeout, retrying...');
      return;
    }

    console.warn('GPS error:', error);
  }, [alertGpsOff]);

  // Going online starts a fresh grace period before a missing fix counts as "GPS off".
  useEffect(() => {
    if (isOnline) lastGpsFixAtRef.current = Date.now();
    else toast.dismiss('gps-off');
  }, [isOnline]);

  const handlePolylineReceived = useCallback((poly) => {
    const normalizedPolyline =
      typeof poly === 'string' ? poly : (poly?.points || null);

    if (!normalizedPolyline) return;

    setActivePolyline((prevPolyline) =>
      prevPolyline === normalizedPolyline ? prevPolyline : normalizedPolyline,
    );
  }, []);

  const isLoggingOut = useRef(false);
  const handleLogout = useCallback(() => {
    if (isLoggingOut.current) return;
    isLoggingOut.current = true;

    // 1. Clear tokens and state
    localStorage.removeItem('delivery_accessToken');
    localStorage.removeItem('delivery_refreshToken');
    localStorage.removeItem('delivery_authenticated');
    localStorage.removeItem('delivery_user');

    // 2. Alert user and redirect
    toast.error("Session Expired", { description: "Please log in again." });
    navigate("/food/delivery/login", { replace: true });

    // Optional: Full refresh after delay ONLY if we're not already on login
    setTimeout(() => {
      if (!window.location.pathname.includes('/login')) {
        window.location.reload();
      }
    }, 1500);
  }, [navigate]);

  useEffect(() => {
    const onAuthFailure = (e) => {
      if (e.detail?.module === 'delivery') {
        handleLogout();
      }
    };
    window.addEventListener('authRefreshFailed', onAuthFailure);
    return () => window.removeEventListener('authRefreshFailed', onAuthFailure);
  }, [handleLogout]);

  // Fetch Emergency numbers and Profile (Restored logic)
  useEffect(() => {
    (async () => {
      try {
        const [emergencyRes, profileRes] = await Promise.all([
          deliveryAPI.getEmergencyHelp(),
          deliveryAPI.getProfile()
        ]);
        if (emergencyRes?.data?.success && emergencyRes.data.data) {
          setEmergencyNumbers(emergencyRes.data.data);
        }
        if (profileRes?.data?.success && profileRes.data.data?.profile) {
          const profile = profileRes.data.data.profile;
          setProfileImage(profile.profileImage?.url || profile.documents?.photo || null);
        }
      } catch (err) { console.warn('Navbar Data Fetch Error:', err); }
    })();
  }, []);

  const emergencyOptions = [
    { title: "Medical Emergency", subtitle: "Call an ambulance", icon: <AlertTriangle className="text-red-600" />, phone: emergencyNumbers.medicalEmergency },
    { title: "Accident Helpline", subtitle: "Report an accident", icon: <AlertTriangle className="text-[var(--primary-theme)]" />, phone: emergencyNumbers.accidentHelpline },
    { title: "Contact Police", subtitle: "Nearest police support", icon: <AlertTriangle className="text-blue-600" />, phone: emergencyNumbers.contactPolice },
    { title: "Insurance", subtitle: "Policy & claim help", icon: <AlertTriangle className="text-green-600" />, phone: emergencyNumbers.insurance },
  ];

  // Auto-restore modal when status or content changes
  useEffect(() => {
    setIsModalMinimized(false);
  }, [tripStatus, showVerification, incomingOrder]);

  // 1. Initial Sync (Force sync with server to avoid 'stuck' persistent state)
  useEffect(() => {
    const syncWithServer = async () => {
      try {
        const response = await deliveryAPI.getCurrentDelivery();
        // All accepted trips (multi-order), not just the latest one.
        applyActiveTripsResponse(response);
      } catch (err) {
        console.error('Order Sync Failed:', err);
        clearActiveOrder();
      }
    };
    syncWithServer();
  }, []); // Only on mount to stabilize state

  // 1.5 Professional Unified ETA Calculation Hook
  useEffect(() => {
    // If we have distance, calculate ETA. Fallback to 8m/s (28km/h) avg if GPS speed is unknown.
    if (distanceToTarget != null && distanceToTarget !== Infinity) {
      const avgSpeed = rollingSpeedRef.current.length > 0
        ? rollingSpeedRef.current.reduce((a, b) => a + b, 0) / rollingSpeedRef.current.length
        : 8;

      setEta(calculateETA(distanceToTarget, avgSpeed));
    } else {
      setEta(null);
    }
  }, [distanceToTarget]);

  // 2. Online/Offline Status Sync & FCM Push Registration
  const onlineSyncMountedRef = useRef(false);
  useEffect(() => {
    const isFirstRun = !onlineSyncMountedRef.current;
    onlineSyncMountedRef.current = true;

    if (isOnline) {
      gigAPI.getMyGigs().then((res) => {
        const bookings = res?.data?.data?.bookings || [];
        const activeBooking = findRunningBooking(bookings);
        if (!activeBooking) {
          useDeliveryStore.getState().setOnline(false);
          deliveryAPI.updateOnlineStatus(false).catch(() => {});
          toast.error('Gig end ho gayi hai ya book nahi hai. Online jaane ke liye gig book karein.');
        } else {
          registerWebPushForCurrentModule('/food/delivery').catch(console.error);
        }
      }).catch(() => {
        deliveryAPI.updateOnlineStatus(isOnline).catch(() => { });
      });
    } else if (!isFirstRun) {
      // Only push "offline" when the rider actually toggled. On a fresh mount/reload
      // the local flag can be empty (webview storage reset) and must not overwrite
      // the server's online status.
      deliveryAPI.updateOnlineStatus(false).catch(() => { });
    }
  }, [isOnline]);

  // The persisted local flag is lost when the app/WebView storage is cleared, so the toggle showed
  // "offline" while the server still had the rider online. Trust the server on open and on return.
  useEffect(() => {
    let cancelled = false;
    const syncFromServer = () => {
      deliveryAPI.getProfile().then((res) => {
        if (cancelled) return;
        const profile = res?.data?.data?.profile;
        if (profile?.availabilityStatus === 'online' && !useDeliveryStore.getState().isOnline) {
          useDeliveryStore.getState().setOnline(true);
        }
      }).catch(() => { });
    };
    syncFromServer();
    const onVisible = () => { if (!document.hidden) syncFromServer(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // When the app returns to the foreground, re-assert online so a status dropped
  // while backgrounded does not stop order notifications.
  useEffect(() => {
    if (!isOnline) return;
    const onVisible = () => {
      if (document.hidden) return;
      // Only resend the last position if it is still fresh; a stale one would mask GPS being off.
      const loc = Date.now() - lastGpsFixAtRef.current < GPS_STALE_MS ? lastCoordRef.current : null;
      const req = loc
        ? deliveryAPI.updateLocation(loc.lat, loc.lng, true)
        : deliveryAPI.updateOnlineStatus(true);
      req.catch(() => { });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [isOnline]);

  // 3. Location logic (Smart Frequency Tracking)
  useEffect(() => {
    if (!isOnline) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition((pos) => {
      clearGpsOff();

      const { latitude: lat, longitude: lng, heading, speed } = pos.coords;
      const now = Date.now();

      const currentRiderPos = { lat, lng, heading: heading || 0 };
      setRiderLocation(currentRiderPos);

      // Calculate Rolling Average Speed for Smart ETA
      if (speed && speed > 0) {
        rollingSpeedRef.current = [...rollingSpeedRef.current.slice(-4), speed]; // keep last 5 points
      }

      const avgSpeed = rollingSpeedRef.current.length > 0
        ? rollingSpeedRef.current.reduce((a, b) => a + b, 0) / rollingSpeedRef.current.length
        : speed || 0;

      // ETA update is now handled by a separate globally-synchronized effect

      // Phase 11: Geo-fencing Auto-arrival (within 100m)
      if (distanceToTarget && distanceToTarget <= 100 && !lastAutoArrivalRef.current[tripStatus]) {
        if (tripStatus === 'PICKING_UP') {
          lastAutoArrivalRef.current[tripStatus] = true;
          reachPickup().catch(() => { lastAutoArrivalRef.current[tripStatus] = false; });
          // toast.success('Auto-arrived at Restaurant');
        } else if (tripStatus === 'PICKED_UP') {
          lastAutoArrivalRef.current[tripStatus] = true;
          reachDrop().catch(() => { lastAutoArrivalRef.current[tripStatus] = false; });
          // toast.success('Auto-arrived at Customer');
        }
      }

      // Reset auto-arrival flag if we move away or status resets (usually handled by component mount, but for safety)
      if (distanceToTarget > 200) {
        lastAutoArrivalRef.current[tripStatus] = false;
      }

      // Check threshold for Sync (distance-based or 7s time-based)
      const distMoved = lastCoordRef.current
        ? getHaversineDistance(lat, lng, lastCoordRef.current.lat, lastCoordRef.current.lng)
        : 1000; // assume huge distance if first update

      if (distMoved >= 25 || (now - lastLocationSentAt.current >= 7000)) {
        lastLocationSentAt.current = now;
        lastCoordRef.current = { lat, lng };

        const payload = {
          lat,
          lng,
          heading: heading || 0,
          speed: speed || 0,
          accuracy: pos.coords.accuracy,
          orderId: activeOrder?.orderId || activeOrder?._id,
          status: 'on_the_way',
          polyline: activePolyline,
          eta,
        };

        // A. HTTP Backup
        deliveryAPI.updateLocation(lat, lng, true, {
          heading: heading || 0,
          speed: speed || 0,
          accuracy: pos.coords.accuracy,
          heartbeat: true
        }).catch(() => { });

        // B. SOCKET LIVE (SILKY SMOOTH)
        if (payload.orderId) emitLocation(payload);
      }
    }, handleGeolocationError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 5000
    });

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isOnline, setRiderLocation, activeOrder, activePolyline, emitLocation, eta, tripStatus, distanceToTarget, reachPickup, reachDrop, handleGeolocationError, clearGpsOff]);

  // 3.5. Background Ping / Heartbeat
  // If watchPosition stops firing (e.g. app in background or device stationary),
  // this ensures we ping the backend periodically. This keeps the token fresh (via 401 interceptor)
  // and keeps the Delivery Partner "online" in the backend.
  useEffect(() => {
    if (!isOnline) return;

    const pingInterval = setInterval(() => {
      const now = Date.now();
      // If no natural GPS update happened in the last 15 seconds, force a ping
      if (now - lastLocationSentAt.current < 15000) return;
      lastLocationSentAt.current = now;

      // Always maintain current position with the server if we have coordinates
      if (lastCoordRef.current) {
        deliveryAPI.updateLocation(
          lastCoordRef.current.lat,
          lastCoordRef.current.lng,
          true,
          { heading: 0, speed: 0, accuracy: null, heartbeat: true }
        ).catch(() => { });
        return;
      }

      // No recent fix yet. Read once if app is visible
      if (!document.hidden && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            clearGpsOff();
            lastCoordRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            deliveryAPI.updateLocation(
              pos.coords.latitude,
              pos.coords.longitude,
              true,
              { heading: pos.coords.heading || 0, speed: pos.coords.speed || 0, accuracy: pos.coords.accuracy, heartbeat: true }
            ).catch(() => { });
          },
          () => {
            deliveryAPI.updateLocation(null, null, true, { heartbeat: true }).catch(() => { });
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
        );
      } else {
        deliveryAPI.updateLocation(null, null, true, { heartbeat: true }).catch(() => { });
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(pingInterval);
  }, [isOnline, alertGpsOff, clearGpsOff]);

  useEffect(() => {
    if (!newOrder) return;
    const rawId = newOrder?.orderId || newOrder?._id || newOrder?.orderMongoId || newOrder?.id;
    if (!rawId) return;

    const orderStatus = String(
      newOrder?.orderStatus || newOrder?.status || newOrder?.order?.orderStatus || ''
    ).trim().toLowerCase();

    const isReassignment = Boolean(newOrder?.isReassignment || newOrder?.reassignmentStatus === 'pending');

    // Guard: offers are shown once the restaurant has accepted the order (confirmed onwards).
    // Admin reassignments are exempt: the order is already in progress (any status).
    if (!isReassignment && !newOrder?.fromClick && !['confirmed', 'preparing', 'ready_for_pickup', 'ready'].includes(orderStatus) && newOrder?.type !== 'RETURN_PICKUP') {
      return;
    }

    const hasPopulatedName = Boolean(
      newOrder?.restaurantName || newOrder?.storeName || newOrder?.sellerName ||
      (typeof newOrder?.restaurantId === 'object' && (newOrder?.restaurantId?.restaurantName || newOrder?.restaurantId?.name)) ||
      (typeof newOrder?.seller === 'object' && (newOrder?.seller?.shopName || newOrder?.seller?.name))
    );

    const processOrder = (ord) => {
      const forceShow = Boolean(newOrder?.fromClick);
      const socketOrd = { ...ord, _receivedAt: Date.now(), ...(forceShow ? { _forceShow: true } : {}) };
      // 1. Add order to availableOrdersList (Order List / Feed)
      setAvailableOrdersList((prev) => {
        const id = String(socketOrd._id || socketOrd.orderId || socketOrd.id);
        const exists = prev.some((item) => String(item._id || item.orderId || item.id) === id);
        if (!exists) return [socketOrd, ...prev];
        return prev;
      });

      // 2. Only show full-screen ringing popup modal if rider currently has NO active trip!
      // A COMPLETED trip only lingers for the summary screen; it must not block new offers.
      const hasActiveTrip =
        tripStatus !== 'COMPLETED' && Boolean(activeOrder || (activeOrders && activeOrders.length > 0));
      if (!hasActiveTrip || forceShow) {
        setIncomingOrder(socketOrd);
        setTripOfferBanner(null);
      } else {
        setTripOfferBanner(socketOrd);
      }
    };

    if (hasPopulatedName && getCustomerPhone(newOrder)) {
      processOrder(newOrder);
    } else {
      deliveryAPI.getOrderDetails(rawId)
        .then((res) => {
          const fullData = res?.data?.data?.order || res?.data?.order || res?.data?.data;
          if (fullData && (fullData._id || fullData.orderId)) {
            processOrder({ ...newOrder, ...fullData });
          } else {
            processOrder(newOrder);
          }
        })
        .catch(() => {
          processOrder(newOrder);
        });
    }
  }, [newOrder, activeOrder, activeOrders, tripStatus]);

  useEffect(() => {
    if (activeOrder && tripStatus !== 'COMPLETED' && incomingOrder && !incomingOrder._forceShow) {
      setIncomingOrder(null);
    }
  }, [activeOrder, tripStatus, incomingOrder]);

  // Banner auto-hides after 23s (same as the ring limit) or once the order is gone.
  useEffect(() => {
    if (!tripOfferBanner) return undefined;
    const t = setTimeout(() => setTripOfferBanner(null), 23000);
    return () => clearTimeout(t);
  }, [tripOfferBanner]);

  // Ride just finished and another offer is waiting: ring for it (max 23s) and queue its popup.
  const availableOrdersRef = useRef([]);
  availableOrdersRef.current = availableOrdersList;
  useEffect(() => {
    if (tripStatus !== 'COMPLETED') return;
    const idOf = (o) => String(o?.orderId || o?._id || o?.id || '');
    const next = availableOrdersRef.current.find((o) => {
      const id = idOf(o);
      return id && !rejectedOrderIdsRef.current.has(id) && !timedOutOrdersMapRef.current.has(id);
    });
    if (!next) return;
    setTripOfferBanner(null);
    setIncomingOrder({ ...next, _forceShow: true });
    ringForOrder(next);
  }, [tripStatus]);

  // Keeps the active trips in sync even while one is running, so orders the rider takes on
  // top (multi-order) or the admin assigns show up. activeOrder is deliberately not a dependency:
  // each sync replaces it, which would restart this effect in a loop.
  useEffect(() => {
    if (!isOnline) return;

    let cancelled = false;

    const hydrateAvailableOrder = async () => {
      try {
        const currentResponse = await deliveryAPI.getCurrentDelivery();
        // Loads every accepted trip (multi-order). Empty list: leave the store alone so a
        // just-completed trip keeps its summary screen.
        if (!cancelled) applyActiveTripsResponse(currentResponse, { clearWhenEmpty: false });
      } catch (error) {
        console.warn('[DeliveryHomeV2] Available order fallback sync failed:', error?.message || error);
      }
    };

    void hydrateAvailableOrder();
    const poller = window.setInterval(() => {
      if (!document.hidden) {
        void hydrateAvailableOrder();
      }
    }, isSocketConnected ? 12000 : 5000);

    const onVisibilityChange = () => {
      if (!document.hidden) {
        void hydrateAvailableOrder();
      }
    };
    const onFcmOrderUpdate = (evt) => {
      console.log('[DeliveryHomeV2] FCM push notification received, rehydrating order state:', evt?.detail);
      void hydrateAvailableOrder();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('fcm-order-update', onFcmOrderUpdate);

    return () => {
      cancelled = true;
      window.clearInterval(poller);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('fcm-order-update', onFcmOrderUpdate);
    };
  }, [currentTab, isOnline, isSocketConnected]);

  // Poll COD cash limit status — lightweight wallet check
  useEffect(() => {
    let cancelled = false;
    const checkCodLimit = async () => {
      try {
        const walletRes = await deliveryAPI.getWallet();
        let wallet = {};
        if (walletRes?.data?.success && walletRes?.data?.data?.wallet) wallet = walletRes.data.data.wallet;
        else if (walletRes?.data?.wallet) wallet = walletRes.data.wallet;
        else if (walletRes?.data?.data) wallet = walletRes.data.data;
        else if (walletRes?.data) wallet = walletRes.data;
        const cashInHand = Number(wallet.cashInHand ?? wallet.cash_in_hand ?? 0);
        const totalCashLimit = Number(wallet.totalCashLimit ?? 0);
        const availableCashLimit = Number(wallet.availableCashLimit ?? 0);
        if (!cancelled) {
          setCodLimitReached(totalCashLimit > 0 && (availableCashLimit <= 0 || cashInHand >= totalCashLimit));
        }
      } catch (e) {
        // silently ignore
      }
    };
    if (isOnline) {
      checkCodLimit();
      const interval = setInterval(checkCodLimit, 60000);
      return () => { cancelled = true; clearInterval(interval); };
    }
  }, [isOnline]);

  // Poll available orders for NEW ORDERS tab. New offers arrive instantly over the socket, so this is a
  // slow fallback. Active orders are read from a ref so their updates do not restart the timer.
  const activeTripsRef = useRef({ activeOrders, activeOrder });
  activeTripsRef.current = { activeOrders, activeOrder };
  useEffect(() => {
    if (!isOnline) return;
    const fetchAvailableOrders = async () => {
      if (document.hidden) return;
      const { activeOrders, activeOrder } = activeTripsRef.current;
      try {
        const response = await deliveryAPI.getOrders({ limit: 20, page: 1 });
        const payload = response?.data?.data || response?.data || {};
        const docs = Array.isArray(payload.docs) ? payload.docs : (Array.isArray(payload) ? payload : []);
        setAvailableOrdersList((prev) => {
          const apiMap = new Map();
          docs.forEach((d) => {
            const id = String(d._id || d.orderId || d.id || '');
            if (id) apiMap.set(id, d);
          });

          const activeIds = new Set(
            (activeOrders || []).concat(activeOrder ? [activeOrder] : []).map((a) => String(a._id || a.orderId || a.id || ''))
          );
          const now = Date.now();

          // Merge: Only keep pending socket orders in prev state if received within the last 20 seconds and not completed/accepted
          const merged = [...docs];
          (prev || []).forEach((prevOrd) => {
            const pid = String(prevOrd._id || prevOrd.orderId || prevOrd.id || '');
            const ordStatus = String(
              prevOrd.orderStatus || prevOrd.status || prevOrd.deliveryStatus || prevOrd.dispatch?.status || ''
            ).toLowerCase();
            const isFinished = [
              'delivered',
              'completed',
              'cancelled',
              'cancelled_by_user',
              'cancelled_by_restaurant',
              'cancelled_by_admin',
              'accepted',
            ].includes(ordStatus);

            const isReassignment = Boolean(prevOrd.isReassignment || prevOrd.reassignmentStatus === 'pending');
            if (
              pid &&
              !apiMap.has(pid) &&
              !rejectedOrderIdsRef.current.has(pid) &&
              !activeIds.has(pid) &&
              (!isFinished || isReassignment) &&
              prevOrd._receivedAt &&
              now - prevOrd._receivedAt < 20000
            ) {
              merged.unshift(prevOrd);
            }
          });
          return merged;
        });
      } catch (err) {
        // quiet error
      }
    };
    fetchAvailableOrders();
    const interval = setInterval(fetchAvailableOrders, 20000);
    const onVisible = () => {
      if (!document.hidden) fetchAvailableOrders();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isOnline]);

  useEffect(() => {
    if (orderStatusUpdate) {
      if (orderStatusUpdate.status === 'cancelled') {
        toast.error('Order cancelled');
        resetTrip();
      }
      clearOrderStatusUpdate();
    }
  }, [orderStatusUpdate, resetTrip, clearOrderStatusUpdate]);


  // Always asks the device for a fresh GPS fix so the button works even before the
  // background watcher has produced a position (or while offline).
  const handleCenterMap = async () => {
    const panTo = (lat, lng) => {
      if (!mapRef.current) return;
      mapRef.current.panTo({ lat, lng });
      mapRef.current.setZoom(16);
    };

    const loc = await requireLocation();
    if (loc.ok) {
      const prev = useDeliveryStore.getState().riderLocation;
      setRiderLocation({ lat: loc.lat, lng: loc.lng, heading: prev?.heading || 0 });
      lastGpsFixAtRef.current = Date.now();
      clearGpsOff();
      panTo(loc.lat, loc.lng);
      return;
    }

    // GPS fix failed (toast already shown): fall back to the last known position if any
    const last = useDeliveryStore.getState().riderLocation;
    const lat = parseFloat(last?.lat ?? last?.latitude);
    const lng = parseFloat(last?.lng ?? last?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) panTo(lat, lng);
  };

  const handleMapClick = (lat, lng) => {
    if (activeOrder || incomingOrder || showVerification) {
      setIsModalMinimized(true);
    }
  };

  return (
    <div className="relative h-screen w-full bg-white text-gray-900 overflow-hidden flex flex-col">
      {/* ─── 1. TOP HEADER (Premium Dark Gray) ─── */}
      {currentTab === 'feed' && (
        <div className="absolute top-0 inset-x-0 bg-[#121212]/95 backdrop-blur-2xl shadow-2xl z-[200] safe-top pb-2 border-b border-white/10">
          <div className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <div
                onClick={() => navigate('/food/delivery/profile')}
                className="w-10 h-10 rounded-full border border-white/20 p-0.5 shadow-xl overflow-hidden bg-white/5 cursor-pointer active:scale-95 transition-all"
              >
                <img src={profileImage || "https://i.ibb.co/3m2Yh7r/SUPERFAST-Brand-Image.png"} alt="Profile" className="w-full h-full object-cover rounded-full" />
              </div>
              <button
                onClick={async () => {
                  const nextState = !isOnline;
                  if (nextState) {
                    const loc = await requireLocation();
                    if (!loc.ok) return;
                    try {
                      // Check if rider has a booked gig shift
                      const res = await gigAPI.getMyGigs();
                      const bookings = res?.data?.data?.bookings || [];
                      const activeBooking = findRunningBooking(bookings);

                      if (!activeBooking) {
                        toast.error('Online jaane ke liye pehle gig book karein (aapki gig abhi chalu nahi hai).');
                        setShowBookGigModal(true);
                        return;
                      }

                      if (activeBooking.status === 'booked') {
                        await gigAPI.checkInGig({ bookingId: activeBooking._id });
                      }

                      toggleOnline();
                      deliveryAPI.updateLocation(loc.lat, loc.lng, true).catch(() => { });
                      toast.success('Online! Checked-in to your Gig shift.');
                    } catch (err) {
                      toast.error(err?.response?.data?.message || 'Please book a gig shift first to go online.');
                      setShowBookGigModal(true);
                    }
                  } else {
                    toggleOnline();
                    deliveryAPI.updateOnlineStatus(false).catch(() => { });
                  }
                }}
                className={`relative w-[92px] h-8 rounded-full p-1 transition-all duration-500 flex items-center ${isOnline ? 'bg-green-500 shadow-lg shadow-green-500/20' : 'bg-gray-400'}`}
              >
                <div className={`flex items-center justify-between w-full px-2 text-[8.5px] font-black uppercase tracking-widest text-white`}>
                  <span>{isOnline ? 'Online' : ''}</span>
                  <span>{!isOnline ? 'Offline' : ''}</span>
                </div>
                <motion.div animate={{ x: isOnline ? 59 : 0 }} className="absolute left-1 w-6 h-6 bg-white rounded-full shadow-sm" />
              </button>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => setShowBookGigModal(true)} className="px-2.5 py-1.5 rounded-full bg-gradient-to-r from-[#00A669] to-[#008f5a] flex items-center gap-1 text-white text-[10px] font-black uppercase tracking-wider active:scale-95 transition-all shadow-lg border border-white/20">
                <Calendar className="w-3 h-3 text-emerald-200" />
                <span>Gigs</span>
              </button>
              <button onClick={() => setShowEmergencyPopup(true)} className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 border border-red-500/20 active:scale-95 transition-all shadow-lg"><AlertTriangle className="w-3.5 h-3.5" /></button>
              <button onClick={() => navigate('/food/delivery/help/id-card')} className="w-9 h-9 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20 active:scale-95 transition-all shadow-lg"><Contact className="w-4 h-4" /></button>
              <button onClick={() => navigate('/food/delivery/notifications')} className="relative w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white border border-white/10 active:scale-95 transition-all shadow-lg"><Bell className="w-4 h-4" />{notificationUnreadCount > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-orange-400 border border-[#1f1f1f]" />}</button>
            </div>
          </div>

          {/* Bonus target pill gets its own row; sharing the top row with Gigs/alerts overlapped on narrow phones */}
          <div className="px-4 pb-1 flex">
            <TargetProgressCardV2 activeOrder={activeOrder} />
          </div>

          {/* ─── LIVE STATUS / PROGRESS BADGE (MATCHED PRO SCREENSHOT 3) ─── */}
          <AnimatePresence>
            {currentTab === 'feed' && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="px-4 mt-1"
              >
                {activeOrder ? (
                  <div className="grid grid-cols-2 gap-3 w-full">
                    {/* LEFT: DISTANCE (Vibrant Orange Card) */}
                    <div className="bg-[#ff8100] rounded-2xl p-3.5 shadow-xl shadow-[var(--primary-theme)]/20 border border-orange-400/50 flex items-center justify-between overflow-hidden relative">
                      <div className="flex flex-col z-10">
                        <span className="text-[9px] text-white/70 font-black uppercase tracking-[0.15em] mb-1">Distance</span>
                        <div className="flex items-end gap-1">
                          <span className="text-2xl font-black text-white leading-none tracking-tighter">
                            {distanceToTarget && distanceToTarget !== Infinity ? (distanceToTarget / 1000).toFixed(1) : '--'}
                          </span>
                          <span className="text-[11px] text-white/80 font-bold mb-0.5">KM</span>
                        </div>
                      </div>
                      <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center z-10 shadow-lg">
                        <Navigation2 className="w-4 h-4 text-[#ff8100] rotate-45" />
                      </div>
                    </div>

                    {/* RIGHT: TIME (Emerald PRO Content) */}
                    <div className="bg-[#10B981] rounded-2xl p-3.5 shadow-xl shadow-green-500/20 border border-green-400/50 flex items-center justify-between relative overflow-hidden group">
                      <div className="flex flex-col z-10">
                        <span className="text-[9px] text-white/70 font-black uppercase tracking-[0.15em] mb-1">Arrival</span>
                        <div className="flex items-end gap-1">
                          <span className="text-2xl font-black text-white leading-none tracking-tighter">
                            {eta ? String(eta) : '--'}
                          </span>
                          <span className="text-[11px] text-white/80 font-bold mb-0.5">MIN</span>
                        </div>
                      </div>
                      <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center z-10 shadow-lg">
                        <Clock className="w-4 h-4 text-[#10B981]" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-[#1c1c1e] rounded-2xl p-3 px-4 flex items-center justify-between border border-white/10 shadow-lg backdrop-blur-md">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center border border-white/10">
                        <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-emerald-500'}`} />
                      </div>
                      <div>
                        <h3 className="text-white font-black text-[11px] uppercase tracking-widest leading-none mb-1">{isOnline ? 'SYSTEM ONLINE' : 'SYSTEM OFFLINE'}</h3>
                        <p className="text-gray-400 text-[9.5px] font-bold uppercase tracking-tight">{isOnline ? 'WAITING FOR ORDER REQUESTS' : 'BOOK A SHIFT TO START WORKING'}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => setShowBookGigModal(true)}
                      className="px-3.5 py-2 bg-[#00C897] hover:bg-[#00B588] text-white text-[10px] font-black uppercase tracking-wider rounded-xl shadow-md active:scale-95 transition-all flex items-center gap-1 shrink-0"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>BOOK GIG</span>
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          {/* ─── COD LIMIT WARNING BANNER (inside header) ─── */}
          {codLimitReached && (
            <div
              onClick={() => navigate('/food/delivery/pocket')}
              className="mx-3 mt-1 mb-1 rounded-xl overflow-hidden cursor-pointer active:opacity-90 transition-all border border-orange-400/30"
              style={{ background: 'linear-gradient(135deg, #ea580c 0%, #dc2626 100%)' }}
            >
              <div className="px-3 py-2.5 flex items-center gap-3">
                <div className="relative shrink-0">
                  <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center border border-white/30">
                    <AlertTriangle className="w-4 h-4 text-white" />
                  </div>
                  <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-yellow-300 rounded-full border-2 border-red-600 animate-pulse" />
                </div>
                <div className="flex-1">
                  <p className="text-[12px] font-black text-white uppercase tracking-wide leading-tight">COD Limit Reached!</p>
                  <p className="text-[10.5px] font-semibold text-white/85 leading-snug">Deposit cash to receive COD orders again</p>
                </div>
                <div className="shrink-0 bg-white text-red-600 px-3 py-1.5 rounded-lg font-black text-[11px] uppercase tracking-wide shadow">
                  Deposit
                </div>
              </div>
            </div>
          )}
        </div>
      )}


      {/* ─── 2. MAIN CONTENT ─── */}
      <div
        ref={scrollContainerRef}
        className={`flex-1 relative overflow-y-auto ${currentTab === 'feed' ? (codLimitReached ? 'pt-[178px]' : 'pt-[120px]') : 'pt-0'} no-scrollbar`}
      >
        {currentTab === 'feed' ? (
          <div className={`absolute inset-0 ${codLimitReached ? 'top-[-178px]' : 'top-[-120px]'}`}>
            <LiveMap
              onMapLoad={(m) => mapRef.current = m}
              onMapClick={handleMapClick}
              onPolylineReceived={handlePolylineReceived}
              zoom={zoom}
            />

            <div className="absolute right-4 bottom-28 md:bottom-32 flex flex-col gap-4 z-[120]">
              <div className="flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
                <button onClick={() => setZoom(z => Math.min(22, z + 1))} className="p-3 hover:bg-gray-50 border-b border-gray-100 text-gray-900 active:scale-90 transition-all" aria-label="Zoom in"><Plus className="w-5 h-5 stroke-[2.75]" /></button>
                <button onClick={() => setZoom(z => Math.max(8, z - 1))} className="p-3 hover:bg-gray-50 text-gray-900 active:scale-90 transition-all" aria-label="Zoom out"><Minus className="w-5 h-5 stroke-[2.75]" /></button>
              </div>
              <button
                onClick={() => {
                  if (!activeOrder) {
                    toast.error('No active order to navigate to');
                    return;
                  }
                  let target = null;
                  if (tripStatus === 'PICKING_UP' || tripStatus === 'REACHED_PICKUP') {
                    target = activeOrder.restaurantLocation;
                  } else if (tripStatus === 'PICKED_UP' || tripStatus === 'REACHED_DROP') {
                    target = activeOrder.customerLocation || activeOrder.deliveryAddress?.location;
                  }
                  if (target && (target.lat || target.latitude)) {
                    const lat = target.lat || target.latitude;
                    const lng = target.lng || target.longitude;
                    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
                  } else {
                    toast.error('Target location not available');
                  }
                }}
                className="w-14 h-14 bg-white rounded-full shadow-2xl flex items-center justify-center text-blue-600 border border-gray-100 active:scale-90 transition-all"
              >
                <div className="w-8 h-8 rounded-full border-2 border-blue-600 flex items-center justify-center"><Navigation2 className="w-4 h-4" /></div>
              </button>
              <button
                onClick={handleCenterMap}
                className="w-14 h-14 bg-white rounded-full shadow-2xl flex items-center justify-center text-gray-900 border border-gray-100 group active:scale-90 transition-all"
              >
                <Target className="w-7 h-7" />
              </button>
            </div>
          </div>
        ) : currentTab === 'orders' ? (
          <DeliveryOrdersTabV2
            activeOrders={activeOrders}
            activeOrder={activeOrder}
            maxSlots={maxSlots || 2}
            incomingOrder={incomingOrder}
            availableOrders={availableOrdersList}
            onAccept={(o) => {
              const targetId = String(o?.orderId || o?._id || o?.id || '');
              if (targetId) {
                setAvailableOrdersList((prev) => prev.filter((item) => String(item.orderId || item._id || item.id) !== targetId));
              }
              acceptOrder(o);
              setIncomingOrder(null);
              clearNewOrder(o);
            }}
            onReject={(o) => {
              const targetId = String(o?.orderId || o?._id || o?.id || '');
              if (targetId) rejectedOrderIdsRef.current.add(targetId);
              rejectOrder(o);
              if (incomingOrder && String(incomingOrder?.orderId || incomingOrder?._id) === targetId) {
                setIncomingOrder(null);
                clearNewOrder();
              }
              setAvailableOrdersList((prev) => prev.filter((item) => String(item.orderId || item._id || item.id) !== targetId));
            }}
            onSelectActiveOrder={(o) => {
              setActiveOrder(o);
              navigate('/food/delivery/feed');
            }}
          />
        ) : currentTab === 'pocket' ? (
          <PocketV2 />
        ) : currentTab === 'history' ? (
          <HistoryV2 />
        ) : (
          <ProfileV2 />
        )}

        {/* OVERLAYS (Persistent if active) */}
      </div>

      {/* OVERLAYS (Persistent if active) - Outside flex container to avoid clipping and z-index issues */}
      {isOnline && tripOfferBanner && !incomingOrder && (
        <button
          type="button"
          onClick={() => {
            const o = tripOfferBanner;
            setTripOfferBanner(null);
            setIsModalMinimized(false);
            setIncomingOrder({ ...o, _forceShow: true });
          }}
          className="fixed inset-x-3 top-3 z-[500] flex items-center justify-between gap-3 rounded-2xl bg-orange-500 px-4 py-3 text-left text-white shadow-2xl active:scale-[0.98]"
        >
          <span className="min-w-0">
            <span className="block text-[11px] font-bold uppercase tracking-wider opacity-80">New order available</span>
            <span className="block truncate text-sm font-black">
              #{tripOfferBanner.displayOrderId || tripOfferBanner.orderId || tripOfferBanner._id} · tap to view
            </span>
          </span>
          <span className="text-lg font-black">›</span>
        </button>
      )}

      {isOnline && (currentTab === 'feed' || activeOrder || incomingOrder) && (
        <AnimatePresence>
          {!isModalMinimized && (
            <motion.div
              key="modal-container"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`fixed inset-x-0 top-0 ${activeOrder && tripStatus !== 'COMPLETED' ? 'bottom-[148px]' : 'bottom-[92px]'} z-[300] pointer-events-none flex items-end`}
            >
              <div className="w-full pointer-events-auto relative">
                {incomingOrder && currentTab !== 'orders' && tripStatus !== 'COMPLETED' && (
                  <NewOrderModal
                    order={incomingOrder}
                    onAccept={(o) => { 
                      if (stopAlertLoop) stopAlertLoop();
                      clearNewOrder(o || incomingOrder); 
                      setIncomingOrder(null); 
                      acceptOrder(o); 
                    }}
                    onReject={(o) => {
                      if (stopAlertLoop) stopAlertLoop();
                      clearNewOrder();
                      const target = o || incomingOrder;
                      const targetId = String(target?.orderId || target?._id || target?.id || '');
                      if (targetId) rejectedOrderIdsRef.current.add(targetId);
                      rejectOrder(target);
                      setIncomingOrder(null);
                    }}
                    onTimeout={(o) => {
                      if (stopAlertLoop) stopAlertLoop();
                      clearNewOrder();
                      const target = o || incomingOrder;
                      const targetId = String(target?.orderId || target?._id || target?.id || '');
                      if (targetId) timedOutOrdersMapRef.current.set(targetId, Date.now());
                      rejectOrder(target);
                      setIncomingOrder(null);
                    }}
                    onCardClick={(o) => {
                      if (stopAlertLoop) stopAlertLoop();
                      clearNewOrder();
                      setIncomingOrder(null);
                      setCurrentTab('feed');
                      setIsModalMinimized(false);
                      navigate('/food/delivery/feed');
                    }}
                    onMinimize={() => setIsModalMinimized(true)}
                  />
                )}
                {(tripStatus === 'PICKING_UP' || tripStatus === 'REACHED_PICKUP') && (
                  <PickupActionModal
                    order={activeOrder}
                    status={tripStatus}
                    isWithinRange={isWithinRange}
                    distanceToTarget={distanceToTarget}
                    eta={eta}
                    onReachedPickup={reachPickup}
                    onPickedUp={(billImageUrl) => pickUpOrder(billImageUrl)}
                    onMinimize={() => setIsModalMinimized(true)}
                  />
                )}
                {(tripStatus === 'PICKED_UP' || tripStatus === 'REACHED_DROP') && (
                  <div className="absolute bottom-4 inset-x-0 z-[120] px-4">
                    {tripStatus === 'PICKED_UP' ? (
                      <div className="bg-white rounded-[3rem] p-8 shadow-[0_-20px_80px_rgba(0,0,0,0.4)] border border-gray-100 flex flex-col items-center">
                        {/* Header with Handover button & Minimize handle */}
                        <div className="w-full flex items-center justify-between pb-4 pt-0 -mt-2">
                          <button
                            onClick={() => setShowHandoverModal(true)}
                            className="px-2.5 py-1.5 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 active:scale-95 transition-all shadow-xs"
                            title="Request Order Handover"
                          >
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                            <span>HANDOVER</span>
                          </button>
                          <button onClick={() => setIsModalMinimized(true)} className="p-1 hover:bg-gray-100 active:scale-95 transition-all rounded-full flex flex-col items-center">
                            <ChevronDown className="w-6 h-6 text-gray-400 stroke-[3]" />
                          </button>
                        </div>
                        <div className="flex flex-col justify-center w-full items-center mb-8 px-2 text-center">
                          <div className="w-16 h-16 rounded-2xl overflow-hidden border border-gray-100 shadow-sm shrink-0 mb-3">
                            <img
                              src={activeOrder?.user?.logo || activeOrder?.user?.profileImage || 'https://cdn-icons-png.flaticon.com/512/1275/1275302.png'}
                              className="w-full h-full object-cover"
                              alt="User"
                            />
                          </div>
                          <div className="flex-1 min-w-0 w-full flex flex-col items-center">
                            <h3 className="text-gray-950 text-2xl font-bold uppercase truncate max-w-[280px]">Handover Drop</h3>
                            <p className={`text-[10px] font-bold uppercase tracking-[0.2em] mt-1.5 ${isWithinRange ? 'text-green-600' : 'text-[var(--primary-theme)]'}`}>
                              {isWithinRange ? 'Ready - Swipe to Arrive √' : `${(distanceToTarget / 1000).toFixed(1)} km • ${eta || '--'} min Arrival`}
                            </p>
                          </div>
                        </div>

                        {/* Customer Instructions Panel */}
                        {activeOrder?.note && (
                          <div className="w-full bg-orange-50 border border-orange-100 rounded-3xl p-5 mb-8 flex gap-4 items-start shadow-sm mx-2 text-left">
                            <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-[var(--primary-theme)] shadow-sm shrink-0 border border-orange-50">
                              <Package className="w-5 h-5" />
                            </div>
                            <div className="flex-1">
                              <p className="text-[10px] font-black text-[var(--primary-theme)] uppercase tracking-[0.2em] mb-1.5 opacity-80">Drop Message</p>
                              <p className="text-sm font-bold text-gray-950 leading-relaxed capitalize">"{activeOrder.note}"</p>
                            </div>
                          </div>
                        )}

                        <div className="w-full mb-8 px-2 text-left flex flex-col">
                          {(() => {
                            const deliveryAddress = activeOrder?.deliveryAddress || {};
                            const addrParts = [deliveryAddress.street, deliveryAddress.additionalDetails, deliveryAddress.city, deliveryAddress.state, deliveryAddress.zipCode].map(v => String(v || '').trim()).filter(Boolean);
                            const cAddr = activeOrder?.customerAddress || activeOrder?.customer_address || (addrParts.length ? addrParts.join(', ') : 'Address not available');
                            const cName = activeOrder?.userName || activeOrder?.user?.name || activeOrder?.customerName || 'Customer';
                            return (
                              <div className="flex items-center gap-3 bg-gray-50 rounded-2xl p-4 border border-gray-100 shadow-sm">
                                <div className="flex flex-col min-w-0 flex-1">
                                  <span className="text-gray-900 font-bold text-lg truncate">{cName}</span>
                                  <span className="text-gray-500 text-sm font-medium leading-relaxed mt-1 line-clamp-2" title={cAddr}>{cAddr}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => callCustomer(activeOrder)}
                                  aria-label="Call customer"
                                  className="w-11 h-11 shrink-0 rounded-full bg-green-50 text-green-600 border border-green-100 flex items-center justify-center active:scale-95 transition-all"
                                >
                                  <Phone className="w-5 h-5" />
                                </button>
                              </div>
                            );
                          })()}
                        </div>

                        <ActionSlider label="Slide to Arrive" successLabel="Arrived ✓" disabled={!isWithinRange} onConfirm={reachDrop} color="bg-blue-600" />
                      </div>
                    ) : (
                      <div className="w-full flex flex-col gap-3">
                        <button
                          type="button"
                          onClick={() => callCustomer(activeOrder)}
                          className="w-full bg-white text-green-600 border border-green-200 rounded-2xl py-3 font-bold text-xs tracking-[0.15em] active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                          <Phone className="w-4 h-4" /> CALL CUSTOMER
                        </button>
                        <button
                          onClick={() => setShowVerification(true)}
                          className="w-full bg-green-500 hover:bg-green-600 text-white shadow-xl shadow-green-500/30 rounded-2xl py-5 font-bold text-sm tracking-[0.2em] transform transition-all active:scale-95 flex items-center justify-center gap-3"
                        >
                          <CheckCircle2 className="w-6 h-6" /> VERIFY & COMPLETE
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {showVerification && tripStatus !== 'COMPLETED' && (
                  <DeliveryVerificationModal
                    order={activeOrder}
                    onComplete={async (...args) => {
                      const res = await completeDelivery(...args);
                      setShowVerification(false);
                      return res;
                    }}
                    onClose={() => setShowVerification(false)}
                  />
                )}
                {tripStatus === 'COMPLETED' && <OrderSummaryModal order={activeOrder} onDone={resetTrip} />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {isOnline && activeOrder && tripStatus !== 'COMPLETED' && (
        <ActiveOrderDetailsBar
          orders={activeOrders && activeOrders.length > 0 ? activeOrders : [activeOrder]}
          onCall={callCustomer}
        />
      )}

      {/* ─── MODALS RESTORED FROM OLD UI ─── */}
      <BottomPopup isOpen={showEmergencyPopup} title="Emergency Help" onClose={() => setShowEmergencyPopup(false)}>
        <div className="grid gap-4 py-2">
          {emergencyOptions.map((opt, i) => (
            <button
              key={i}
              onClick={() => {
                const num = opt.phone?.replace(/\D/g, '');
                if (num) window.location.href = `tel:${num}`;
                else toast.error('Number not configured');
              }}
              className="flex items-center gap-5 p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 active:scale-95 transition-all text-left"
            >
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm text-xl">{opt.icon}</div>
              <div>
                <h4 className="font-bold text-gray-900">{opt.title}</h4>
                <p className="text-xs text-gray-500 font-medium">{opt.subtitle}</p>
              </div>
            </button>
          ))}
        </div>
      </BottomPopup>

      {/* Floating Minimize/Restore Toggle - Only visible when ONLINE */}
      {isOnline && isModalMinimized && (activeOrder || incomingOrder || showVerification) && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className={`fixed ${activeOrder && tripStatus !== 'COMPLETED' ? 'bottom-[164px]' : 'bottom-[100px]'} inset-x-0 z-[300] px-6`}
        >
          <button
            onClick={() => setIsModalMinimized(false)}
            className="w-full bg-gray-900/90 text-white rounded-2xl py-4 flex items-center justify-between px-6 shadow-2xl backdrop-blur-md border border-white/10"
          >
            <div className="flex flex-col items-start gap-0.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Order Action Pending</span>
              <span className="text-xs font-bold uppercase tracking-wider">Tap to open delivery panel</span>
            </div>
            <div className="bg-[var(--primary-theme)] p-2 rounded-xl text-white">
              <Plus className="w-5 h-5" />
            </div>
          </button>
        </motion.div>
      )}

      {/* Emergency Handover Modal Popup */}
      <AnimatePresence>
        {showHandoverModal && (
          <div className="fixed inset-0 z-[700] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 pointer-events-auto">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-white dark:bg-[#1c1c1e] rounded-3xl p-5 shadow-2xl space-y-4 border border-rose-100 dark:border-rose-950"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
                <div className="flex items-center gap-2 text-rose-600 font-black text-sm">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                  <span>EMERGENCY HANDOVER</span>
                </div>
                <button
                  onClick={() => setShowHandoverModal(false)}
                  className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 hover:text-gray-900 dark:hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-rose-50 dark:bg-rose-950/40 p-3.5 rounded-2xl border border-rose-200 dark:border-rose-900 text-xs font-semibold text-rose-800 dark:text-rose-300 leading-relaxed">
                Facing an emergency or breakdown? Requesting a handover will set your duty Offline and immediately reassign this order to available nearby drivers.
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Select Reason</label>
                <select
                  value={handoverReason}
                  onChange={(e) => setHandoverReason(e.target.value)}
                  className="w-full text-xs font-bold p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:border-rose-500"
                >
                  <option value="Vehicle Breakdown / Flat Tyre">Vehicle Breakdown / Flat Tyre</option>
                  <option value="Accident / Health Emergency">Accident / Health Emergency</option>
                  <option value="Personal Emergency">Personal Emergency</option>
                  <option value="Severe Weather / Flooding">Severe Weather / Flooding</option>
                </select>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowHandoverModal(false)}
                  className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-black text-xs py-3 rounded-2xl active:scale-95 transition-all"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleHandoverSubmit}
                  disabled={submittingHandover}
                  className="flex-[1.5] bg-rose-600 hover:bg-rose-700 text-white font-black text-xs py-3 rounded-2xl shadow-lg shadow-rose-600/30 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                >
                  {submittingHandover ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                  <span>{submittingHandover ? 'SENDING...' : 'REQUEST HANDOVER'}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Return Tracker - Above navbar */}
      {isOnline && activeReturn && !activeOrder && !incomingOrder && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="fixed bottom-[100px] inset-x-0 z-[300] px-6"
        >
          <button
            onClick={() => navigate(`/food/delivery/quick-commerce/returns/${activeReturn._id}/active`)}
            className="w-full bg-blue-600/95 text-white rounded-2xl py-4 flex items-center justify-between px-6 shadow-2xl backdrop-blur-md border border-white/10"
          >
            <div className="flex flex-col items-start gap-0.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-blue-200">Active Return Pending</span>
              <span className="text-xs font-bold uppercase tracking-wider">Tap to open return flow</span>
            </div>
            <div className="bg-white/20 p-2 rounded-xl text-white">
              <Package className="w-5 h-5" />
            </div>
          </button>
        </motion.div>
      )}

      {/* Driver App Gig Booking Bottom Sheet Modal */}
      <BookGigModal isOpen={showBookGigModal} onClose={() => setShowBookGigModal(false)} />

      {/* ─── 3. BOTTOM NAV (Fixed 5-Item Bar matching screenshots) ─── */}
      <div className="bg-white border-t border-gray-100 px-4 py-3 pb-6 flex justify-between items-center z-[200] shadow-[0_-5px_20px_rgba(0,0,0,0.05)]">
        <button onClick={() => navigate('/food/delivery/feed')} className={`flex flex-col items-center gap-1 transition-all ${currentTab === 'feed' ? 'text-[#f94e10] scale-105 font-bold' : 'text-gray-400 opacity-70'}`}>
          <LayoutGrid className="w-6 h-6" /><span className="text-[10px] font-medium font-sans">Feed</span>
        </button>
        <button onClick={() => navigate('/food/delivery/orders')} className={`flex flex-col items-center gap-1 transition-all relative ${currentTab === 'orders' ? 'text-[#f94e15] scale-105 font-bold' : 'text-gray-400 opacity-70'}`}>
          <div className="relative">
            <Package className="w-6 h-6 text-[#f94e10]" />
            {(activeOrders.length > 0 || incomingOrder || availableOrdersList.length > 0) && (
              <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-white shadow-sm">
                {activeOrders.length || (incomingOrder ? 1 : availableOrdersList.length)}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium font-sans">Orders</span>
        </button>
        <button onClick={() => navigate('/food/delivery/pocket')} className={`flex flex-col items-center gap-1 transition-all ${currentTab === 'pocket' ? 'text-[#f94e10] scale-105 font-bold' : 'text-gray-400 opacity-70'}`}>
          <Wallet className="w-6 h-6" /><span className="text-[10px] font-medium font-sans">Pocket</span>
        </button>
        <button onClick={() => navigate('/food/delivery/history')} className={`flex flex-col items-center gap-1 transition-all ${currentTab === 'history' ? 'text-[#f94e10] scale-105 font-bold' : 'text-gray-400 opacity-70'}`}>
          <History className="w-6 h-6" /><span className="text-[10px] font-medium font-sans">Trip History</span>
        </button>
        <button onClick={() => navigate('/food/delivery/profile')} className={`flex flex-col items-center gap-1 transition-all ${currentTab === 'profile' ? 'text-[#f94e10] scale-105 font-bold' : 'text-gray-400 opacity-70'}`}>
          <UserIcon className="w-6 h-6" /><span className="text-[10px] font-medium font-sans">Profile</span>
        </button>
      </div>
    </div>
  );
}
