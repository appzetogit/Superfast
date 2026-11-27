/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBM6_j3q46mziCe31PzLhxYvgxUVXAZ-yg",
  authDomain: "superfast-1c0d2.firebaseapp.com",
  projectId: "superfast-1c0d2",
  storageBucket: "superfast-1c0d2.firebasestorage.app",
  messagingSenderId: "429602583301",
  appId: "1:429602583301:web:ad419bdcd2ef139311fd6c",
};

if (!firebase.apps.length) {
  firebase.initializeApp(DEFAULT_FIREBASE_CONFIG);
}

const messaging = firebase.messaging();

const getNotificationKey = (payload) =>
  payload?.data?.ringTag ||
  payload?.data?.notificationId ||
  payload?.data?.messageId ||
  payload?.messageId ||
  [
    payload?.notification?.title || payload?.data?.title || "",
    payload?.notification?.body || payload?.data?.body || "",
    payload?.data?.orderId || "",
    payload?.data?.targetUrl || payload?.data?.link || "",
  ].join("::");

async function notifyOpenClients(payload) {
  const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
  windowClients.forEach((client) => {
    client.postMessage({
      type: "push-notification-received",
      payload,
    });
  });
}

function getTargetPathFromPayload(payload = {}) {
  const rawTarget =
    payload?.data?.targetUrl ||
    payload?.data?.link ||
    payload?.data?.click_action ||
    payload?.fcmOptions?.link ||
    "/";

  try {
    const url = new URL(rawTarget, self.location.origin);
    return url.pathname || "/";
  } catch {
    return "/";
  }
}

// Orders already accepted/rejected/completed: close their notifications and never re-show
// late repeat pushes for them (in-memory; resets when the worker restarts).
const handledOrderIds = new Set();

const OFFER_PUSH_TYPES = ["new_order", "new_order_available", "reassignment_request", "return_pickup"];

const getPayloadOrderIds = (d = {}) =>
  [d.orderMongoId, d.order_mongo_id, d.orderId, d.order_id, d.returnId, d._id, d.id]
    .map((v) => (v == null ? "" : String(v).trim()))
    .filter(Boolean);

const isDeliveryOfferNotification = (notification) => {
  const d = notification?.data || {};
  const tag = String(notification?.tag || "");
  const type = String(d.type || "").toLowerCase();
  const role = String(d.role || d.ownerType || d.targetRole || "").toLowerCase();
  const link = String(d.link || d.click_action || d.targetUrl || "");
  if (tag.startsWith("delivery-order-") || tag.startsWith("delivery-return-") || tag.startsWith("delivery:")) {
    return true;
  }
  if (OFFER_PUSH_TYPES.includes(type) && (role === "delivery" || role === "delivery_partner" || link.includes("/delivery"))) {
    return true;
  }
  return false;
};

const isHandledOrderPayload = (payload) => {
  const d = payload?.data || {};
  const type = String(d.type || "").toLowerCase();
  if (type && !OFFER_PUSH_TYPES.includes(type) && String(d.isRepeat) !== "true") return false;
  return getPayloadOrderIds(d).some((id) => handledOrderIds.has(id));
};

self.addEventListener("message", (event) => {
  const msgType = event?.data?.type;
  if (msgType === "order-handled") {
    const ids = (event.data.ids || []).map((v) => String(v || "").trim()).filter(Boolean);
    ids.forEach((id) => handledOrderIds.add(id));
    event.waitUntil(
      self.registration.getNotifications().then((list) => {
        list.forEach((n) => {
          const nIds = getPayloadOrderIds(n?.data || {});
          const tag = String(n?.tag || "");
          if (nIds.some((id) => ids.includes(id)) || ids.some((id) => tag === `delivery-order-${id}` || tag === `delivery-return-${id}` || tag === `delivery:${id}`)) {
            n.close();
          }
        });
      })
    );
    return;
  }

  if (msgType === "close-stale-delivery-notifications") {
    const keepSet = new Set((event.data.keepIds || []).map((v) => String(v || "").trim()).filter(Boolean));
    event.waitUntil(
      self.registration.getNotifications().then((list) => {
        list.forEach((n) => {
          if (!isDeliveryOfferNotification(n)) return;
          const nIds = getPayloadOrderIds(n?.data || {});
          const tag = String(n?.tag || "");
          const matchesKeep =
            nIds.some((id) => keepSet.has(id)) ||
            [...keepSet].some((id) => tag === `delivery-order-${id}` || tag === `delivery-return-${id}` || tag === `delivery:${id}`);
          if (!matchesKeep) {
            nIds.forEach((id) => handledOrderIds.add(id));
            n.close();
          }
        });
      })
    );
  }
});

// 1. Synchronously registered Background Message handler
messaging.onBackgroundMessage(async (payload) => {
  if (isHandledOrderPayload(payload)) return;
  const title = payload?.notification?.title || payload?.data?.title || "New Notification";
  const body = payload?.notification?.body || payload?.data?.body || "";
  const image =
    payload?.notification?.image ||
    payload?.data?.image ||
    payload?.data?.imageUrl ||
    undefined;
  const notificationKey = getNotificationKey(payload);
  const clickAction = getTargetPathFromPayload(payload);
  const isTest = payload?.data?.type === 'test' || String(payload?.data?.isTest) === 'true' || title.toLowerCase().includes('test');
  const sound = isTest ? undefined : (payload?.data?.sound || (String(payload?.data?.role).toLowerCase() === 'admin' ? '/universfield-new-notification-036-485897.mp3' : '/zomato_sms.mp3'));
  const iconUrl = image || "/favicon.png";

  await self.registration.showNotification(title, {
    body,
    icon: iconUrl,
    badge: iconUrl,
    image: image || undefined,
    tag: notificationKey,
    renotify: true,
    silent: isTest,
    requireInteraction: true,
    vibrate: isTest ? undefined : [300, 100, 300, 100, 300, 100, 500],
    data: {
      ...(payload?.data || {}),
      click_action: clickAction,
      sound: sound
    },
  });

  await notifyOpenClients(payload);
});

// 2. Synchronously registered Push Event handler
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { notification: { title: "New Notification", body: event.data.text() } };
  }

  if (isHandledOrderPayload(payload)) return;

  event.waitUntil(
    (async () => {
      const title = payload?.notification?.title || payload?.data?.title || "New Notification";
      const body = payload?.notification?.body || payload?.data?.body || "";
      const image = payload?.notification?.image || payload?.data?.image || payload?.data?.imageUrl;
      const isTest = payload?.data?.type === 'test' || String(payload?.data?.isTest) === 'true' || title.toLowerCase().includes('test');
      const sound = isTest ? undefined : (payload?.data?.sound || (String(payload?.data?.role).toLowerCase() === 'admin' ? '/universfield-new-notification-036-485897.mp3' : '/zomato_sms.mp3'));
      const notificationKey = getNotificationKey(payload);
      const clickAction = getTargetPathFromPayload(payload);
      const iconUrl = image || "/favicon.png";

      await self.registration.showNotification(title, {
        body,
        icon: iconUrl,
        badge: iconUrl,
        image: image || undefined,
        tag: notificationKey,
        renotify: true,
        silent: isTest,
        requireInteraction: true,
        vibrate: isTest ? undefined : [300, 100, 300, 100, 300, 100, 500],
        data: {
          ...(payload?.data || {}),
          click_action: clickAction,
          sound: sound
        }
      });
      await notifyOpenClients(payload);
    })()
  );
});

// 3. Synchronously registered Notification Click handler
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawLink =
    event?.notification?.data?.link ||
    event?.notification?.data?.click_action ||
    event?.notification?.data?.targetUrl ||
    "/";
  let targetUrl = String(rawLink || "/").startsWith("/") ? String(rawLink || "/") : "/";

  // Carry the order info into the URL so the app can open straight onto the order
  // (e.g. rider offer popup) even when it was closed / killed when the notification was tapped.
  try {
    const data = event?.notification?.data || {};
    const url = new URL(targetUrl, self.location.origin);
    ["type", "orderId", "orderMongoId", "orderStatus", "isReassignment"].forEach((key) => {
      if (data[key]) url.searchParams.set(`fcm_${key}`, String(data[key]));
    });
    targetUrl = `${url.pathname}${url.search}${url.hash}`;
  } catch {
    // keep plain targetUrl
  }

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      const client = windowClients.find((c) => c.url.includes(self.location.origin));
      if (client) {
        client.focus();
        return client.navigate(targetUrl);
      }
      return clients.openWindow(targetUrl);
    })
  );
});
