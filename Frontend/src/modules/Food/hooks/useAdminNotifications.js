import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { adminAPI, supportAPI, gigAPI, notificationAPI } from "@food/api";
import { API_BASE_URL } from "@food/api/config";
import io from "socket.io-client";

const STORAGE_KEY = "admin_notifications_dismissed_v1";
const UPDATE_EVENT = "adminNotificationsUpdated";

const safeParse = (value, fallback) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const getDismissedIds = () => {
  if (typeof localStorage === "undefined") return [];
  const parsed = safeParse(localStorage.getItem(STORAGE_KEY) || "[]", []);
  return Array.isArray(parsed) ? parsed : [];
};

const saveDismissedIds = (ids) => {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(ids) ? ids : []));
};

export const dispatchAdminNotificationsUpdated = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(UPDATE_EVENT));
};

const toDateValue = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
};

const toDateLabel = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const uniqueById = (items = []) => {
  const map = new Map();
  for (const item of items) {
    if (!item?.id) continue;
    map.set(item.id, item);
  }
  return [...map.values()];
};

const joinMeta = (...parts) => parts.filter(Boolean).join(" • ");

const mapPendingRestaurants = (rows = []) =>
  (Array.isArray(rows) ? rows : []).map((item) => ({
    id: `approval-restaurant-${String(item?._id || item?.id || "")}`,
    title: "Restaurant Approval Pending",
    message: `${item?.restaurantName || "Restaurant"} submitted a restaurant approval request. Owner: ${item?.ownerName || "N/A"}. Contact: ${item?.ownerPhone || "N/A"}.`,
    type: "approval",
    category: "restaurant_approval",
    path: "/admin/food/restaurants/joining-request",
    createdAt: item?.createdAt || item?.updatedAt,
    timeLabel: toDateLabel(item?.createdAt || item?.updatedAt),
    metaLabel: joinMeta(item?.restaurantName, item?.ownerName, item?.ownerPhone),
  }));

const mapDeliveryJoinRequests = (response) => {
  const payload = response?.data?.data;
  const rows =
    payload?.partners ||
    payload?.data ||
    payload?.items ||
    response?.data?.partners ||
    [];

  return (Array.isArray(rows) ? rows : []).map((item) => ({
    id: `approval-delivery-${String(item?._id || item?.id || "")}`,
    title: "Delivery Partner Application",
    message: `${item?.name || "Delivery partner"} submitted a joining request. Phone: ${item?.phone || "N/A"}. Email: ${item?.email || "N/A"}.`,
    type: "approval",
    category: "delivery_approval",
    path: "/admin/food/delivery-partners/join-request",
    createdAt: item?.createdAt || item?.updatedAt,
    timeLabel: toDateLabel(item?.createdAt || item?.updatedAt),
    metaLabel: joinMeta(item?.name, item?.phone, item?.email),
  }));
};

const mapSellerJoinRequests = (response) => {
  const payload = response?.data?.result || response?.data?.data || {};
  const rows = Array.isArray(payload?.items) ? payload.items : (Array.isArray(payload) ? payload : []);

  return rows.map((item) => ({
    id: `approval-seller-${String(item?._id || item?.id || "")}`,
    title: "Seller Application",
    message: `${item?.shopName || item?.name || "Seller"} submitted a seller application. Owner: ${item?.ownerName || item?.name || "N/A"}. Contact: ${item?.phone || "N/A"}.`,
    type: "approval",
    category: "seller_approval",
    path: "/admin/quick-commerce/sellers/pending",
    createdAt: item?.createdAt || item?.applicationDate || item?.updatedAt,
    timeLabel: toDateLabel(item?.createdAt || item?.applicationDate || item?.updatedAt),
    metaLabel: joinMeta(item?.shopName || item?.name, item?.ownerName || item?.name, item?.phone),
  }));
};

const mapFoodApprovals = (response) => {
  const payload = response?.data?.data;
  const rows =
    payload?.requests ||
    payload?.items ||
    payload?.data ||
    response?.data?.requests ||
    [];

  return (Array.isArray(rows) ? rows : []).map((item) => ({
    id: `approval-food-${String(item?._id || item?.id || "")}`,
    title: "Food Approval Pending",
    message: `${item?.itemName || "Food item"} from ${item?.restaurantName || "Restaurant"} is waiting for review. Category: ${item?.category || item?.type || "N/A"}.`,
    type: "approval",
    category: "food_approval",
    path: "/admin/food/food-approval",
    createdAt: item?.requestedAt || item?.createdAt || item?.updatedAt,
    timeLabel: toDateLabel(item?.requestedAt || item?.createdAt || item?.updatedAt),
    metaLabel: joinMeta(item?.restaurantName, item?.itemName, item?.category || item?.type),
  }));
};

const mapUserRestaurantSupport = (response) => {
  const payload = response?.data?.data;
  const rows =
    payload?.tickets ||
    payload?.items ||
    payload?.data ||
    response?.data?.tickets ||
    [];

  return (Array.isArray(rows) ? rows : [])
    .filter((item) => !["resolved", "closed"].includes(String(item?.status || "").toLowerCase()))
    .map((item) => {
      const isRestaurantTicket = item?.source === "restaurant";
      const title = isRestaurantTicket ? "Restaurant Support Ticket" : "User Support Ticket";
      const message = isRestaurantTicket
        ? `${item?.restaurantName || "Restaurant"} raised a support ticket. Subject: ${item?.subject || item?.issueType || "N/A"}. Status: ${item?.status || "open"}.`
        : `${item?.user?.name || "User"} raised a support ticket${item?.restaurantName ? ` for ${item.restaurantName}` : ""}. Issue: ${item?.issueType || item?.type || "N/A"}. Status: ${item?.status || "open"}.`;

      const metaLabel = isRestaurantTicket
        ? joinMeta(item?.restaurantName, item?.subject || item?.issueType, item?.status)
        : joinMeta(item?.user?.name, item?.user?.phone, item?.issueType || item?.type, item?.status);

      return {
        id: `support-main-${String(item?._id || item?.id || "")}`,
        title,
        message,
        type: "support",
        category: "support",
        path: "/admin/food/support-tickets",
        createdAt: item?.createdAt || item?.updatedAt,
        timeLabel: toDateLabel(item?.createdAt || item?.updatedAt),
        metaLabel,
      };
    });
};

const mapDeliverySupport = (response) => {
  const payload = response?.data?.data;
  const rows =
    payload?.tickets ||
    payload?.items ||
    payload?.data ||
    response?.data?.tickets ||
    [];

  return (Array.isArray(rows) ? rows : [])
    .filter((item) => !["resolved", "closed"].includes(String(item?.status || "").toLowerCase()))
    .map((item) => ({
      id: `support-delivery-${String(item?._id || item?.id || "")}`,
      title: "Delivery Support Ticket",
      message: `${item?.deliveryPartner?.name || "Delivery partner"} raised a support ticket. Subject: ${item?.subject || "N/A"}. Priority: ${item?.priority || "medium"}. Status: ${item?.status || "open"}.`,
      type: "support",
      category: "delivery_support",
      path: "/admin/food/delivery-support-tickets",
      createdAt: item?.createdAt || item?.updatedAt,
      timeLabel: toDateLabel(item?.createdAt || item?.updatedAt),
      metaLabel: joinMeta(item?.deliveryPartner?.name, item?.deliveryPartner?.phone, item?.priority, item?.status),
    }));
};

const mapExpiredFssai = (response) => {
  const payload = response?.data?.data;
  const rows = payload?.items || payload?.data || response?.data?.items || [];

  return (Array.isArray(rows) ? rows : []).map((item) => ({
    id: String(item?.id || `fssai-expired-${item?.restaurantId || ""}`),
    title: item?.title || "FSSAI License Expired",
    message:
      item?.message ||
      `${item?.restaurantName || "Restaurant"} FSSAI license has expired.`,
    type: "compliance",
    category: "fssai_expired",
    path: "/admin/food/restaurants",
    createdAt: item?.createdAt || item?.fssaiExpiry,
    timeLabel: toDateLabel(item?.createdAt || item?.fssaiExpiry),
    metaLabel: joinMeta(item?.restaurantName, item?.ownerName, item?.ownerPhone, item?.fssaiNumber),
  }));
};

const mapDiningApprovalRequests = (response) => {
  const payload = response?.data?.data;
  const rows = payload?.restaurants || payload?.items || response?.data?.restaurants || [];

  return (Array.isArray(rows) ? rows : [])
    .filter((item) => item?.pendingDiningRequest?.requestedAt)
    .map((item) => {
      const categories = Array.isArray(item?.pendingDiningRequest?.categories)
        ? item.pendingDiningRequest.categories.map((category) => category?.name).filter(Boolean)
        : [];

      return {
        id: `approval-dining-${String(item?._id || item?.id || "")}-${String(item?.pendingDiningRequest?.requestedAt || item?.updatedAt || "")}`,
        title: "Dining Approval Pending",
        message: `${item?.restaurantName || item?.name || "Restaurant"} requested dining changes. Guests: ${Number(item?.pendingDiningRequest?.maxGuests ?? 0)}, Dining: ${item?.pendingDiningRequest?.isEnabled ? "On" : "Off"}.`,
        type: "approval",
        category: "dining_approval",
        path: "/admin/food/dining-list",
        createdAt: item?.pendingDiningRequest?.requestedAt || item?.updatedAt,
        timeLabel: toDateLabel(item?.pendingDiningRequest?.requestedAt || item?.updatedAt),
        metaLabel: joinMeta(item?.restaurantName || item?.name, categories.join(", "), item?.ownerPhone),
      };
    });
};

const mapHandoverRequests = (response) => {
  const payload = response?.data?.data;
  const rows = payload?.requests || payload?.items || response?.data?.requests || [];

  return (Array.isArray(rows) ? rows : []).map((item) => ({
    id: `handover-${String(item?._id || item?.id || "")}`,
    title: "🚨 Emergency Handover Request",
    message: `Delivery Partner ${item?.deliveryPartnerId?.name || "Partner"} (${item?.deliveryPartnerId?.phone || ""}) requested emergency handover: "${item?.reason || "Emergency"}".`,
    type: "approval",
    category: "handover_approval",
    path: "/admin/food/delivery-partners/gigs",
    createdAt: item?.createdAt || item?.updatedAt,
    timeLabel: toDateLabel(item?.createdAt || item?.updatedAt),
    metaLabel: joinMeta(item?.deliveryPartnerId?.name, item?.deliveryPartnerId?.phone, item?.reason),
  }));
};

const INBOX_PREFIX = "inbox-";
const ADMIN_CONTEXT = { contextModule: "admin" };

// Inbox events that duplicate an item already shown from a pending-approval list.
const PENDING_ID_BY_CATEGORY = {
  restaurant_application: (entityId) => `approval-restaurant-${entityId}`,
  delivery_partner_application: (entityId) => `approval-delivery-${entityId}`,
};

const mapInbox = (response) => {
  const rows = response?.data?.data?.items || [];
  return (Array.isArray(rows) ? rows : []).map((item) => {
    const meta = item?.metadata || {};
    return {
      id: `${INBOX_PREFIX}${String(item?._id || "")}`,
      inboxId: String(item?._id || ""),
      entityId: String(meta?.entityId || ""),
      title: item?.title || "Notification",
      message: item?.message || "",
      type: "event",
      category: item?.category || "event",
      path: item?.link || "",
      read: Boolean(item?.isRead),
      createdAt: item?.createdAt,
      timeLabel: toDateLabel(item?.createdAt),
      metaLabel: joinMeta(meta?.orderId && `#${meta.orderId}`, meta?.restaurantName || meta?.name, meta?.phone),
    };
  });
};

const resolveSocketOrigin = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    return new URL(raw).origin;
  } catch {
    return raw
      .replace(/\/api\/v\d+\/?$/i, "")
      .replace(/\/api\/?$/i, "")
      .replace(/\/+$/, "");
  }
};

// The navbar and the notifications page both mount this hook. Shared state below keeps that to one
// socket (one toast/sound per event) and one set of API calls per refresh.
const POLL_MS = 60 * 1000;
const CACHE_MS = 20 * 1000;
const adminShared = {
  socket: null,
  refCount: 0,
  audio: null,
  inflight: null,
  lastItems: null,
  lastAt: 0,
};

const playAdminSound = () => {
  if (typeof window === "undefined") return;
  if (!adminShared.audio) {
    adminShared.audio = new window.Audio("/universfield-new-notification-036-485897.mp3");
    adminShared.audio.preload = "auto";
    adminShared.audio.volume = 1;
  }
  adminShared.audio.currentTime = 0;
  adminShared.audio.play().catch(() => {});
};

const showAdminToast = (title, description, link, label = "Review") => {
  import("sonner").then(({ toast }) => {
    toast.success(title, {
      description,
      duration: 8000,
      action: link ? { label, onClick: () => { window.location.href = link; } } : undefined,
    });
  }).catch(() => {});
};

const handleAdminSocketEvent = (payload) => {
  if (payload?.type === "new_order") {
    // The admin orders page rings its own alert loop for new orders.
    if (!window.location.pathname.includes("/admin/food/orders")) playAdminSound();
    showAdminToast(payload?.title || "🛒 New order received", payload?.message || "", payload?.link, "View");
  } else if (payload?.type === "delivery_partner_application") {
    const name = payload?.name || "Someone";
    const vehicleType = payload?.vehicleType ? ` (${payload.vehicleType})` : "";
    playAdminSound();
    showAdminToast("🛵 New delivery application", `${name}${vehicleType} has applied. Tap to review.`, "/admin/food/delivery-partners/join-request");
  } else if (payload?.type === "restaurant_application") {
    const name = payload?.name || "A restaurant";
    const city = payload?.city ? ` in ${payload.city}` : "";
    playAdminSound();
    showAdminToast("🏪 New restaurant application", `${name}${city} has applied. Tap to review.`, "/admin/food/restaurants/joining-request");
  } else if (payload?.type === "restaurant_withdrawal_request" || payload?.type === "delivery_withdrawal_request") {
    playAdminSound();
    showAdminToast(payload?.title || "💸 Withdrawal request", payload?.message || "", payload?.link);
  }
  adminShared.lastAt = 0;
  dispatchAdminNotificationsUpdated();
};

const acquireAdminSocket = () => {
  adminShared.refCount += 1;
  if (adminShared.socket) return;
  const token = localStorage.getItem("admin_accessToken") || localStorage.getItem("accessToken");
  const socketOrigin = resolveSocketOrigin(API_BASE_URL);
  if (!token || !socketOrigin) return;
  adminShared.socket = io(socketOrigin, {
    path: "/socket.io/",
    transports: ["websocket", "polling"],
    auth: { token },
  });
  adminShared.socket.on("admin_notification", handleAdminSocketEvent);
};

const releaseAdminSocket = () => {
  adminShared.refCount = Math.max(0, adminShared.refCount - 1);
  if (adminShared.refCount === 0 && adminShared.socket) {
    adminShared.socket.disconnect();
    adminShared.socket = null;
  }
};

export const useAdminNotifications = (options = {}) => {
  const [items, setItems] = useState(() => adminShared.lastItems || []);
  const [loading, setLoading] = useState(Boolean(options?.autoload !== false) && !adminShared.lastItems);

  const fetchAggregated = useCallback(async () => {
      const dismissed = new Set(getDismissedIds());

      const [
        restaurantsRes,
        deliveryJoinRes,
        foodApprovalRes,
        supportRes,
        deliverySupportRes,
        fssaiExpiredRes,
        diningApprovalRes,
        handoversRes,
        inboxRes,
      ] = await Promise.all([
        adminAPI.getPendingRestaurants(),
        adminAPI.getDeliveryPartnerJoinRequests({ page: 1, limit: 50 }),
        adminAPI.getPendingFoodApprovals({ page: 1, limit: 50 }),
        supportAPI.getSupportTicketsAdmin({ page: 1, limit: 50, source: "all" }),
        adminAPI.getDeliverySupportTickets({ page: 1, limit: 50 }),
        adminAPI.getExpiredFssaiNotifications(),
        adminAPI.getDiningRestaurants(),
        gigAPI.adminGetHandovers().catch(() => ({ data: { success: false } })),
        notificationAPI.getInbox({ page: 1, limit: 50 }, ADMIN_CONTEXT).catch(() => null),
      ]);

      const restaurantRows =
        restaurantsRes?.data?.data ||
        restaurantsRes?.data?.restaurants ||
        [];

      const pending = [
        ...mapPendingRestaurants(restaurantRows),
        ...mapDeliveryJoinRequests(deliveryJoinRes),
        ...mapFoodApprovals(foodApprovalRes),
        ...mapUserRestaurantSupport(supportRes),
        ...mapDeliverySupport(deliverySupportRes),
        ...mapExpiredFssai(fssaiExpiredRes),
        ...mapDiningApprovalRequests(diningApprovalRes),
        ...mapHandoverRequests(handoversRes),
      ];
      const pendingIds = new Set(pending.map((item) => item.id));
      const inbox = mapInbox(inboxRes).filter((item) => {
        const toPendingId = PENDING_ID_BY_CATEGORY[item.category];
        return !(toPendingId && item.entityId && pendingIds.has(toPendingId(item.entityId)));
      });

      return uniqueById([...inbox, ...pending])
        .filter((item) => !dismissed.has(item.id))
        .sort((a, b) => toDateValue(b.createdAt) - toDateValue(a.createdAt));
  }, []);

  // `force` skips the short cache (used after events and user actions); concurrent calls share one request.
  const loadNotifications = useCallback(async ({ force = true } = {}) => {
    if (!force && adminShared.lastItems && Date.now() - adminShared.lastAt < CACHE_MS) {
      setItems(adminShared.lastItems);
      setLoading(false);
      return;
    }
    try {
      if (!adminShared.lastItems) setLoading(true);
      if (!adminShared.inflight) {
        adminShared.inflight = fetchAggregated()
          .then((result) => {
            adminShared.lastItems = result;
            adminShared.lastAt = Date.now();
            return result;
          })
          .finally(() => { adminShared.inflight = null; });
      }
      setItems(await adminShared.inflight);
    } catch {
      setItems(adminShared.lastItems || []);
    } finally {
      setLoading(false);
    }
  }, [fetchAggregated]);

  useEffect(() => {
    if (options?.autoload === false) return;
    loadNotifications({ force: false });
  }, [loadNotifications, options?.autoload]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handler = () => {
      loadNotifications();
    };
    window.addEventListener(UPDATE_EVENT, handler);
    return () => window.removeEventListener(UPDATE_EVENT, handler);
  }, [loadNotifications]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      loadNotifications({ force: false });
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadNotifications]);

  useEffect(() => {
    acquireAdminSocket();
    return () => releaseAdminSocket();
  }, []);

  const dismissOne = useCallback(async (id) => {
    if (!id) return;
    adminShared.lastAt = 0;
    setItems((prev) => prev.filter((item) => item.id !== id));
    if (String(id).startsWith(INBOX_PREFIX)) {
      try {
        await notificationAPI.dismiss(String(id).slice(INBOX_PREFIX.length), ADMIN_CONTEXT);
      } catch {
        // The next refresh restores it if the server did not record the dismissal.
      }
    } else {
      saveDismissedIds([...new Set([...getDismissedIds(), id])]);
    }
    dispatchAdminNotificationsUpdated();
  }, []);

  const markRead = useCallback(async (id) => {
    if (!String(id || "").startsWith(INBOX_PREFIX)) return;
    adminShared.lastAt = 0;
    if (adminShared.lastItems) {
      adminShared.lastItems = adminShared.lastItems.map((item) => (item.id === id ? { ...item, read: true } : item));
    }
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
    try {
      await notificationAPI.markAsRead(String(id).slice(INBOX_PREFIX.length), ADMIN_CONTEXT);
    } catch {
      // Non-critical: unread state is corrected on the next refresh.
    }
  }, []);

  const clearAll = useCallback(async () => {
    const localIds = items
      .map((item) => item.id)
      .filter((id) => id && !String(id).startsWith(INBOX_PREFIX));
    saveDismissedIds([...new Set([...getDismissedIds(), ...localIds])]);
    adminShared.lastAt = 0;
    adminShared.lastItems = [];
    setItems([]);
    try {
      await notificationAPI.dismissAll(ADMIN_CONTEXT);
    } catch {
      // Non-critical: cleared items come back on refresh if the server call failed.
    }
    dispatchAdminNotificationsUpdated();
  }, [items]);

  const unreadCount = useMemo(() => items.filter((item) => !item.read).length, [items]);

  return useMemo(
    () => ({
      items,
      loading,
      unreadCount,
      refresh: loadNotifications,
      dismissOne,
      markRead,
      clearAll,
    }),
    [clearAll, dismissOne, items, loadNotifications, loading, markRead, unreadCount]
  );
}

export default useAdminNotifications;
