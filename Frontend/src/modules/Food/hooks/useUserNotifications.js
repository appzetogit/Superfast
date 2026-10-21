import { useEffect, useState } from 'react';
import io from 'socket.io-client';
import { toast } from 'sonner';
import { API_BASE_URL } from '@food/api/config';
import { userAPI } from '@food/api';
import { dispatchNotificationInboxRefresh } from '@food/hooks/useNotificationInbox';

const debugLog = (...args) => {
  if (import.meta.env.DEV) {
    console.log('📬 [UserSocket]', ...args);
  }
};

const resolveBackendOrigin = () => {
  try {
    return new URL(API_BASE_URL).origin;
  } catch {
    return String(API_BASE_URL || '')
      .replace(/\/api\/v\d+\/?$/i, '')
      .replace(/\/api\/?$/i, '')
      .replace(/\/+$/, '');
  }
};

// One socket per tab, shared by every mounted useUserNotifications() (layout + tracking page).
// Event side effects (toasts, window events) are attached once here, so they never fire twice.
const shared = {
  socket: null,
  token: null,
  refCount: 0,
  connected: false,
  listeners: new Set(),
  profilePromise: null,
};

const setSharedConnected = (value) => {
  shared.connected = value;
  if (typeof window !== 'undefined') window.orderSocketConnected = value;
  shared.listeners.forEach((fn) => fn(value));
};

const attachHandlers = (socket) => {
  socket.on('connect', () => {
    debugLog('✅ User Socket connected');
    setSharedConnected(true);
    // Backend auto-joins 'user:userId' room based on role/token in config/socket.js
  });

  socket.on('order_status_update', (data) => {
    debugLog('🔔 Order status update received:', data);

    const title = data.title || `Order #${data.orderId || 'Update'}`;
    const message = data.message || `Your order status is now ${String(data.orderStatus || '').replace(/_/g, ' ')}`;

    const isImportant = String(data.orderStatus).includes('cancel') || ['ready_for_pickup', 'ready', 'confirmed'].includes(data.orderStatus);
    if (isImportant) {
      toast.success(title, {
        id: `order-status-${data.orderId}`,
        description: message,
        duration: 5000
      });
      // Refresh notification inbox so bell count updates live
      dispatchNotificationInboxRefresh();
    }

    // Dispatch custom event for OrderTrackingCard and other listeners
    window.dispatchEvent(new CustomEvent('orderStatusNotification', {
      detail: {
        orderMongoId: data.orderMongoId,
        orderId: data.orderId,
        status: data.orderStatus,
        orderStatus: data.orderStatus, // Ensure compatibility with different UI checks
        title,
        message,
        deliveryState: data.deliveryState,
        deliveryVerification: data.deliveryVerification,
        timestamp: new Date().toISOString()
      }
    }));
  });

  /** Customer receives handover OTP when partner confirms "reached drop" (only when DELIVERY_OTP_REQUIRED=true). */
  socket.on('delivery_drop_otp', (payload) => {
    debugLog('🔐 Delivery handover OTP:', payload?.orderId);
    const otp = payload?.otp != null ? String(payload.otp) : '';
    const orderId = payload?.orderId != null ? String(payload.orderId) : '';
    const message = payload?.message != null ? String(payload.message) : '';
    window.dispatchEvent(
      new CustomEvent('deliveryDropOtp', {
        detail: {
          orderMongoId: payload?.orderMongoId,
          orderId,
          otp,
          message
        }
      })
    );
    const title = orderId ? `Order ${orderId}` : 'Delivery OTP';
    const parts = [message, otp ? `OTP: ${otp}` : ''].filter(Boolean);
    toast.success(title, {
      id: `order-otp-${orderId}`,
      description: parts.join(' — ') || 'Handover OTP from your delivery partner.',
      duration: 20000
    });
  });

  socket.on('connect_error', () => setSharedConnected(false));
  socket.on('disconnect', (reason) => {
    debugLog('🔌 Socket disconnected:', reason);
    setSharedConnected(false);
  });
};

const acquireSocket = (token) => {
  shared.refCount += 1;
  if (shared.socket && shared.token === token) return;
  if (shared.socket) shared.socket.disconnect();

  const socketUrl = resolveBackendOrigin();
  debugLog('🔌 Connecting to User Socket.IO:', socketUrl);
  shared.token = token;
  shared.socket = io(socketUrl, {
    path: '/socket.io/',
    transports: ['polling', 'websocket'],
    reconnection: true,
    auth: { token }
  });
  attachHandlers(shared.socket);
};

const releaseSocket = () => {
  shared.refCount = Math.max(0, shared.refCount - 1);
  if (shared.refCount === 0 && shared.socket) {
    shared.socket.disconnect();
    shared.socket = null;
    shared.token = null;
    setSharedConnected(false);
  }
};

const fetchUserIdOnce = () => {
  if (!shared.profilePromise) {
    shared.profilePromise = userAPI.getProfile()
      .then((response) => {
        const user = response?.data?.success ? response.data.data?.user : null;
        return user ? (user._id?.toString() || user.userId || user.id || null) : null;
      })
      .catch(() => null)
      .finally(() => {
        // Allow a fresh lookup later (e.g. after login) once this one settles.
        setTimeout(() => { shared.profilePromise = null; }, 5000);
      });
  }
  return shared.profilePromise;
};

/**
 * Hook for user to receive real-time order notifications.
 * Dispatches 'orderStatusNotification' custom event for OrderTrackingCard.
 */
export const useUserNotifications = () => {
  const [isConnected, setIsConnected] = useState(shared.connected);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    let active = true;
    fetchUserIdOnce().then((id) => {
      if (active && id) setUserId(id);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    shared.listeners.add(setIsConnected);
    setIsConnected(shared.connected);
    return () => { shared.listeners.delete(setIsConnected); };
  }, []);

  useEffect(() => {
    if (!API_BASE_URL || !String(API_BASE_URL).trim()) {
      setIsConnected(false);
      return undefined;
    }
    if (!userId) return undefined;

    const token = localStorage.getItem('user_accessToken') || localStorage.getItem('accessToken');
    if (!token) return undefined;

    acquireSocket(token);
    return () => releaseSocket();
  }, [userId]);

  return { isConnected };
};
