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

// 1. Synchronously registered Background Message handler
messaging.onBackgroundMessage(async (payload) => {
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
  const targetUrl = String(rawLink || "/").startsWith("/") ? String(rawLink || "/") : "/";
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
