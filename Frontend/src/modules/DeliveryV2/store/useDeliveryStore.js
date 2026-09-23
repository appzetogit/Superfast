import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * @typedef {Object} Location
 * @property {number} lat
 * @property {number} lng
 */

/**
 * @typedef {Object} ActiveOrder
 * @property {string} orderId
 * @property {string} status
 * @property {Location} restaurantLocation
 * @property {Location} customerLocation
 * @property {number} orderAmount
 */

/**
 * useDeliveryStore - Professional Zustand store for Delivery V2
 * Handles Trip Lifecycle, Rider Status, and Admin Settings.
 */
export const useDeliveryStore = create(
  persist(
    (set, get) => ({
      // --- Rider Status ---
      isOnline: false,
      riderLocation: null, // { lat, lng }
      
      // --- Multi-Slot Trip State ---
      maxSlots: 2, // Default 2 active slots
      activeOrders: [], // Array of accepted active orders
      activeOrder: null, // Currently focused active order for map/actions
      tripStatus: 'IDLE', // 'IDLE' | 'PICKING_UP' | 'REACHED_PICKUP' | 'PICKED_UP' | 'DELIVERING' | 'REACHED_DROP' | 'COMPLETED'
      
      // --- Admin / Business Settings ---
      settings: {
        pickupRangeLimit: 500, // meters, fallback default
        deliveryRangeLimit: 500, // meters, fallback default
      },

      // --- Actions ---
      toggleOnline: () => set((state) => ({ isOnline: !state.isOnline })),
      
      setOnline: (online) => set({ isOnline: online }),
      
      setRiderLocation: (location) => set({ riderLocation: location }),
      
      setSettings: (newSettings) => set((state) => ({
        settings: { ...state.settings, ...newSettings }
      })),

      setActiveOrder: (order) => set((state) => {
        if (!order) {
          return { activeOrder: null, tripStatus: 'IDLE' };
        }
        const orderId = String(order.orderId || order._id || order.id || '');
        const exists = state.activeOrders.some(
          (o) => String(o.orderId || o._id || o.id || '') === orderId
        );
        const updatedList = exists
          ? state.activeOrders.map((o) => (String(o.orderId || o._id || o.id || '') === orderId ? { ...o, ...order } : o))
          : [...state.activeOrders, order];

        return {
          activeOrder: order,
          activeOrders: updatedList,
          tripStatus: state.tripStatus === 'IDLE' ? 'PICKING_UP' : state.tripStatus
        };
      }),

      addActiveOrder: (order) => set((state) => {
        if (!order) return state;
        const orderId = String(order.orderId || order._id || order.id || '');
        const filtered = state.activeOrders.filter(
          (o) => String(o.orderId || o._id || o.id || '') !== orderId
        );
        const newList = [...filtered, order];
        return {
          activeOrders: newList,
          activeOrder: order,
          tripStatus: 'PICKING_UP'
        };
      }),

      removeActiveOrder: (orderId) => set((state) => {
        const idStr = String(orderId || '');
        const newList = state.activeOrders.filter(
          (o) => String(o.orderId || o._id || o.id || '') !== idStr
        );
        const nextActive = newList.length > 0 ? newList[newList.length - 1] : null;
        return {
          activeOrders: newList,
          activeOrder: nextActive,
          tripStatus: nextActive ? state.tripStatus : 'IDLE'
        };
      }),

      setActiveOrders: (ordersList) => set((state) => {
        const list = Array.isArray(ordersList) ? ordersList : [];
        const currentId = String(state.activeOrder?.orderId || state.activeOrder?._id || state.activeOrder?.id || '');
        const stillActive = list.find((o) => String(o.orderId || o._id || o.id || '') === currentId);
        const nextActive = stillActive || (list.length > 0 ? list[0] : null);

        return {
          activeOrders: list,
          activeOrder: nextActive,
          tripStatus: nextActive ? (state.tripStatus === 'IDLE' ? 'PICKING_UP' : state.tripStatus) : 'IDLE'
        };
      }),

      updateTripStatus: (status) => set({ tripStatus: status }),

      clearActiveOrder: () => set({ 
        activeOrder: null, 
        activeOrders: [],
        tripStatus: 'IDLE' 
      }),

      // --- Selectors / Computed Helper ---
      getUsedSlotsCount: () => {
        const { activeOrders, activeOrder } = get();
        if (activeOrders.length > 0) return activeOrders.length;
        return activeOrder ? 1 : 0;
      },

      isSlotsFull: () => {
        const { activeOrders, activeOrder, maxSlots } = get();
        const count = activeOrders.length > 0 ? activeOrders.length : (activeOrder ? 1 : 0);
        return count >= maxSlots;
      },

      canAdvanceToPickup: () => {
        const { activeOrder, tripStatus } = get();
        return activeOrder && tripStatus === 'PICKING_UP';
      },

      canAdvanceToDeliver: () => {
        const { activeOrder, tripStatus } = get();
        return activeOrder && tripStatus === 'PICKED_UP';
      }
    }),
    {
      name: 'delivery-v2-online-pref',
      // ONLY persist the 'isOnline' state, ignoring orders/location to prevent dummy order bugs
      partialize: (state) => ({ isOnline: state.isOnline }),
    }
  )
);
