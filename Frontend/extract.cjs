const fs = require('fs');

const code = fs.readFileSync('c:/Users/Abcom/Desktop/AppzetoProjects/OyeChotuu/Frontend/src/modules/Food/pages/restaurant/OrdersMain.jsx', 'utf8');

const finalCode = `import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Printer, Volume2, VolumeX, ChevronDown, ChevronUp, Minus, Plus, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import notificationSound from '@food/assets/audio/alert.mp3';
import { restaurantAPI } from '@food/api';
import { useRestaurantNotifications } from '@food/hooks/useRestaurantNotifications';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const debugLog = (...args) => {};
const debugWarn = (...args) => {};
const debugError = (...args) => {};

const getRestaurantVisibleItems = (items = []) => {
  const normalizedItems = Array.isArray(items) ? items : [];
  const foodItems = normalizedItems.filter((item) => {
    const itemType = String(item?.type || item?.orderType || 'food').toLowerCase();
    return itemType !== 'quick';
  });
  return foodItems.length ? foodItems : normalizedItems;
};

export default function GlobalNewOrderPopup() {
` +
code.substring(
  code.indexOf('  // New order popup states'),
  code.indexOf('  const [restaurantStatus, setRestaurantStatus] = useState({')
) +
`
  // Timer persistence helpers
  const getInitialCountdown = (orderId) => {
    if (!orderId) return 240;
    const storageKey = \`order_timer_\${orderId}\`;
    const startTime = localStorage.getItem(storageKey);
    
    if (startTime) {
      const elapsed = Math.floor((Date.now() - parseInt(startTime)) / 1000);
      const remaining = 240 - elapsed;
      return remaining > 0 ? remaining : 0;
    } else {
      localStorage.setItem(storageKey, Date.now().toString());
      return 240;
    }
  };

  const clearOrderTimer = (orderId) => {
    if (orderId) {
      localStorage.removeItem(\`order_timer_\${orderId}\`);
    }
  };

  const markOrderAsShown = (orderLike) => {
    const keys = [
      orderLike?.orderMongoId,
      orderLike?.orderId,
      orderLike?._id,
      orderLike?.id,
    ]
      .map((v) => (v == null ? '' : String(v).trim()))
      .filter(Boolean);

    for (const k of keys) shownOrdersRef.current.add(k);
  };

  const hasOrderBeenShown = (orderLike) => {
    const keys = [
      orderLike?.orderMongoId,
      orderLike?.orderId,
      orderLike?._id,
      orderLike?.id,
    ]
      .map((v) => (v == null ? '' : String(v).trim()))
      .filter(Boolean);

    return keys.some((k) => shownOrdersRef.current.has(k));
  };

  const getPopupOrderTotal = (orderLike) => {
    if (!orderLike) return 0;

    const rawItems = Array.isArray(orderLike.items) ? orderLike.items : [];
    const visibleItems = getRestaurantVisibleItems(rawItems);
    const hasFilteredMixedItems = visibleItems.length > 0 && visibleItems.length !== rawItems.length;

    if (hasFilteredMixedItems) {
      const visibleItemsTotal = visibleItems.reduce((sum, item) => {
        const price = Number(item?.price || 0);
        const qty = Number(item?.quantity || 0);
        return sum + (Number.isFinite(price) ? price : 0) * (Number.isFinite(qty) ? qty : 0);
      }, 0);

      return Number.isFinite(visibleItemsTotal) ? visibleItemsTotal : 0;
    }

    const directTotal = Number(orderLike.total);
    if (Number.isFinite(directTotal) && directTotal > 0) return directTotal;

    const pricingTotal = Number(orderLike.pricing?.total);
    if (Number.isFinite(pricingTotal) && pricingTotal > 0) return pricingTotal;

    const amountDue = Number(orderLike.payment?.amountDue);
    if (Number.isFinite(amountDue) && amountDue > 0) return amountDue;

    const itemsTotal = visibleItems.reduce((sum, item) => {
      const price = Number(item?.price || 0);
      const qty = Number(item?.quantity || 0);
      return sum + (Number.isFinite(price) ? price : 0) * (Number.isFinite(qty) ? qty : 0);
    }, 0);

    return Number.isFinite(itemsTotal) ? itemsTotal : 0;
  };

  // Restaurant notifications hook for real-time orders
  const { newOrder, clearNewOrder, isConnected } = useRestaurantNotifications();

  const rejectReasons = [
    'Restaurant is too busy',
    'Item not available',
    'Outside delivery area',
    'Kitchen closing soon',
    'Technical issue',
    'Other reason',
  ];

  const requestOrdersRefresh = () => {
    // Dispatch a global event so any active order lists can refresh
    window.dispatchEvent(new Event('ordersRefresh'));
  };

` +
code.substring(
  code.indexOf('  // Show new order popup when real order notification arrives from Socket.IO'),
  code.indexOf('  // Handle cancel order (for preparing orders)')
) +
code.substring(
  code.indexOf('  // Toggle mute'),
  code.indexOf('  // Handle swipe gestures with smooth animations')
) +
`
  const currentPopupOrder = popupOrder || newOrder;
  const popupVisibleItems = getRestaurantVisibleItems(currentPopupOrder?.items);
  const popupPrimaryItem = popupVisibleItems[0] || null;

  return (
    <>
      <audio
        ref={audioRef}
        src={notificationSound}
        preload="auto"
        playsInline
      />
` +
code.substring(
  code.indexOf('      {/* New Order Popup */}'),
  code.indexOf('      {/* Cancel Order Popup */}')
) +
`
    </>
  );
}
`;

fs.writeFileSync('c:/Users/Abcom/Desktop/AppzetoProjects/OyeChotuu/Frontend/src/modules/Food/components/restaurant/GlobalNewOrderPopup.jsx', finalCode);
console.log('Successfully wrote GlobalNewOrderPopup.jsx');
