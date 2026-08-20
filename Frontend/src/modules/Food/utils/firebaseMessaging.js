import { toast } from "sonner";
import { userAPI, restaurantAPI, deliveryAPI, adminAPI } from "@food/api";
import { sellerApi } from "../../seller/services/sellerApi";
import { initializeApp, getApp, getApps } from "firebase/app";
import fallbackNotificationSound from "@food/assets/audio/alert.mp3";

const pushNotificationSoundPath = "/zomato_sms.mp3";

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAYOU6SqSltWXs0qPcTZr-4BiU8EhmT1Z8",
  authDomain: "superfast-9fb35.firebaseapp.com",
  projectId: "superfast-9fb35",
  storageBucket: "superfast-9fb35.firebasestorage.app",
  messagingSenderId: "983730882946",
  appId: "1:983730882946:web:de18e0398ac793c52a279b",
  measurementId: "G-50D5FK55YN",
  vapidKey: "BKgheoJbnS9r_ln95WM6GYz674cXnMQFK8g7g7QVu9866ouMXrEY5XkOje8DlAg2MbGT3tm5eBi7vsnZ7GI0nDM",
};

const tokenCachePrefix = "fcm_web_registered_token_";
const pushSoundEnabledStorageKey = "push_sound_enabled";
const pendingNativeTokenKey = "pending_native_fcm_token";
let publicEnvPromise = null;
let foregroundListenerAttached = false;
let registrationInFlight = null;
let serviceWorkerMessageListenerAttached = false;
let nativeTokenListenersAttached = false;
let nativeRetryTimeouts = [];
const MESSAGING_APP_NAME = "web-push-app";
const recentForegroundNotifications = new Map();
let pushSoundAudio = null;
let pushSoundUnlocked = false;
let pushSoundContext = null;
const PUSH_DEBUG_PREFIX = "[push-debug]";
const notificationDedupWindowMs = 8000;
const pushDebugLog = (prefix, message, data = {}) => {
  console.log(`${prefix} ${message}`, data);
};
const pushDebugWarn = (prefix, message, data = {}) => {
  console.warn(`${prefix} ${message}`, data);
};

function getCurrentAppPath(pathname = "") {
  const fromArg = String(pathname || "");
  if (
    fromArg.includes("restaurant") ||
    fromArg.includes("delivery") ||
    fromArg.includes("seller") ||
    fromArg.includes("admin") ||
    fromArg.includes("food") ||
    fromArg.includes("user")
  ) {
    return fromArg;
  }
  if (typeof window === "undefined") return fromArg;
  const hash = String(window.location.hash || "").replace(/^#/, "").split("?")[0];
  if (
    hash.includes("restaurant") ||
    hash.includes("delivery") ||
    hash.includes("seller") ||
    hash.includes("admin") ||
    hash.includes("food") ||
    hash.includes("user")
  ) {
    return hash;
  }
  return String(window.location.pathname || fromArg || "");
}

function normalizeModuleFromPath(pathname = window.location.pathname) {
  const path = getCurrentAppPath(pathname);
  if (path.includes("restaurant") && !path.includes("restaurants")) return "restaurant";
  if (path.includes("seller")) return "seller";
  if (path.includes("delivery")) return "delivery";
  if (path.includes("admin")) return "admin";
  return "user";
}

function getModuleAccessToken(moduleName) {
  return (
    localStorage.getItem(`${moduleName}_accessToken`) ||
    localStorage.getItem(`auth_${moduleName}`) ||
    ""
  );
}

function resolvePushModule(pathname) {
  const fromPath = normalizeModuleFromPath(pathname);
  if (getModuleAccessToken(fromPath)) return fromPath;
  for (const moduleName of ["restaurant", "delivery", "admin", "seller", "user"]) {
    if (getModuleAccessToken(moduleName) || localStorage.getItem(`${moduleName}_authenticated`) === "true") {
      return moduleName;
    }
  }
  return fromPath;
}

function readAnyAccessToken(moduleName) {
  return (
    getModuleAccessToken(moduleName) ||
    localStorage.getItem("auth_customer") ||
    localStorage.getItem("auth_seller") ||
    localStorage.getItem("auth_restaurant") ||
    localStorage.getItem("auth_delivery") ||
    localStorage.getItem("auth_admin") ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("token") ||
    ""
  );
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getPushSoundSources(moduleName = normalizeModuleFromPath()) {
  // Delivery and restaurant should always use the alert tone for FCM pushes.
  if (moduleName === "delivery" || moduleName === "restaurant" || moduleName === "seller") {
    return [fallbackNotificationSound];
  }
  return [pushNotificationSoundPath, fallbackNotificationSound];
}

function isSupportedBrowser() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function isFlutterWebView() {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function") ||
      (window.MobileApp && typeof window.MobileApp.getFcmToken === "function"),
  );
}

function isNativeAppShell() {
  if (typeof window === "undefined") return false;
  if (isFlutterWebView()) return true;
  const protocol = String(window.location?.protocol || "").toLowerCase();
  const userAgent = String(window.navigator?.userAgent || "").toLowerCase();
  return (
    Boolean(window.ReactNativeWebView) ||
    protocol === "file:" ||
    userAgent.includes(" wv") ||
    userAgent.includes("; wv")
  );
}

function extractFcmTokenCandidate(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/^['"]|['"]$/g, "");
    if (!trimmed || trimmed.startsWith("eyJ") || trimmed === "[object Object]") return "";
    return trimmed;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = extractFcmTokenCandidate(item);
      if (nested) return nested;
    }
    return "";
  }
  if (typeof value === "object") {
    return extractFcmTokenCandidate(
      value.token || value.fcmToken || value.data || value.result || value.value,
    );
  }
  return "";
}

async function callFlutterHandler(handlerName, payload) {
  if (!window.flutter_inappwebview || typeof window.flutter_inappwebview.callHandler !== "function") {
    return null;
  }
  try {
    if (payload !== undefined) {
      return await window.flutter_inappwebview.callHandler(handlerName, payload);
    }
    return await window.flutter_inappwebview.callHandler(handlerName);
  } catch {
    if (payload !== undefined) {
      try {
        return await window.flutter_inappwebview.callHandler(handlerName);
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function requestNativeNotificationPermission() {
  for (const handlerName of [
    "requestNotificationPermission",
    "requestPushPermission",
    "askNotificationPermission",
  ]) {
    const result = await callFlutterHandler(handlerName, { module: "push" });
    if (result !== null) return result;
  }
  return null;
}

export async function getNativeFcmToken(moduleName = normalizeModuleFromPath()) {
  if (typeof window === "undefined") return "";

  await requestNativeNotificationPermission();

  const handlerNames = ["getFcmToken", "getFCMToken", "getPushToken", "getFirebaseToken"];
  for (const handlerName of handlerNames) {
    const raw = await callFlutterHandler(handlerName, { module: moduleName });
    const token = extractFcmTokenCandidate(raw);
    if (token.length >= 20) return token;
  }

  try {
    if (window.MobileApp && typeof window.MobileApp.getFcmToken === "function") {
      const token = extractFcmTokenCandidate(await window.MobileApp.getFcmToken());
      if (token.length >= 20) return token;
    }
  } catch {
    // Ignore native bridge failures.
  }

  return "";
}

function isSecureContextForPush() {
  if (typeof window === "undefined") return false;
  if (window.isSecureContext) return true;
  const h = window.location.hostname;
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h.startsWith("192.168.") ||
    h.startsWith("10.") ||
    h.startsWith("172.") ||
    h.endsWith(".local")
  );
}

function sanitize(value) {
  return String(value || "").trim().replace(/^['"]|['"]$/g, "");
}

function getNotificationKey(payload = {}) {
  return (
    payload?.data?.notificationId ||
    payload?.data?.messageId ||
    payload?.messageId ||
    [
      payload?.notification?.title || "",
      payload?.notification?.body || "",
      payload?.data?.orderId || "",
      payload?.data?.targetUrl || "",
    ].join("::")
  );
}

function wasRecentlyHandled(notificationKey) {
  if (!notificationKey) return false;
  const now = Date.now();

  for (const [key, timestamp] of recentForegroundNotifications.entries()) {
    if (now - timestamp > notificationDedupWindowMs) {
      recentForegroundNotifications.delete(key);
    }
  }

  if (recentForegroundNotifications.has(notificationKey)) {
    pushDebugLog(PUSH_DEBUG_PREFIX, "Duplicate notification skipped", { notificationKey });
    return true;
  }

  recentForegroundNotifications.set(notificationKey, now);
  return false;
}

function ensurePushSoundAudio() {
  if (typeof window === "undefined") return null;
  if (!pushSoundAudio) {
    const [primarySource] = getPushSoundSources();
    const audioUrl = primarySource.startsWith("/")
      ? new URL(primarySource, window.location.origin).toString()
      : primarySource;
    pushDebugLog(PUSH_DEBUG_PREFIX, "Creating primary push audio", { audioUrl });
    pushSoundAudio = new Audio(audioUrl);
    pushSoundAudio.preload = "auto";
    pushSoundAudio.volume = 1;
    pushSoundAudio.load();
  }
  return pushSoundAudio;
}

function createPushPlaybackAudio() {
  const moduleName = normalizeModuleFromPath();
  const audioSources = getPushSoundSources(moduleName).map((source) =>
    typeof window === "undefined" || !source.startsWith("/")
      ? source
      : new URL(source, window.location.origin).toString(),
  );
  pushDebugLog(PUSH_DEBUG_PREFIX, "Preparing push playback sources", { audioSources });
  return audioSources.map((source) => {
    const playbackAudio = new Audio(source);
    playbackAudio.preload = "auto";
    playbackAudio.volume = 1;
    playbackAudio.load();
    return playbackAudio;
  });
}

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!pushSoundContext) {
    pushSoundContext = new AudioContextClass();
  }

  return pushSoundContext;
}

async function playSynthNotificationBeep() {
  const ctx = getAudioContext();
  if (!ctx) return false;
  pushDebugLog(PUSH_DEBUG_PREFIX, "Playing synth notification beep");

  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  const now = ctx.currentTime;
  const pulses = [
    { start: 0, duration: 0.11, frequency: 880 },
    { start: 0.16, duration: 0.11, frequency: 988 },
    { start: 0.34, duration: 0.18, frequency: 1046 },
  ];

  pulses.forEach(({ start, duration, frequency }) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, now + start);
    gain.gain.setValueAtTime(0.0001, now + start);
    gain.gain.exponentialRampToValueAtTime(0.18, now + start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(now + start);
    oscillator.stop(now + start + duration);
  });

  return true;
}

export function isPushSoundEnabled() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(pushSoundEnabledStorageKey) === "true";
}

async function triggerWebViewNativeNotification(payload = {}) {
  if (typeof window === "undefined") return false;

  const bridgePayload = {
    title: payload?.notification?.title || payload?.data?.title || "New notification",
    body: payload?.notification?.body || payload?.data?.body || "",
    notificationId: payload?.data?.notificationId || payload?.messageId || "",
    targetUrl: payload?.data?.targetUrl || payload?.data?.link || "",
    imageUrl: payload?.notification?.image || payload?.data?.image || payload?.data?.imageUrl || "",
  };

  try {
    if (
      window.flutter_inappwebview &&
      typeof window.flutter_inappwebview.callHandler === "function"
    ) {
      const handlerNames = [
        "showLocalNotification",
        "onPushNotification",
        "playNotificationSound",
        "triggerNotificationFeedback",
      ];

      for (const handlerName of handlerNames) {
        try {
          pushDebugLog(PUSH_DEBUG_PREFIX, "Trying native notification handler", { handlerName, bridgePayload });
          await window.flutter_inappwebview.callHandler(handlerName, bridgePayload);
          pushDebugLog(PUSH_DEBUG_PREFIX, "Native notification handler succeeded", { handlerName });
          return true;
        } catch {
          // Try the next available handler name.
        }
      }
    }
  } catch {
    // Ignore bridge failures.
  }

  return false;
}

async function playPushSound(payload = {}) {
  try {
    pushDebugLog(PUSH_DEBUG_PREFIX, "playPushSound called", {
      notificationKey: getNotificationKey(payload),
      pushSoundUnlocked,
      notificationPermission: typeof Notification !== "undefined" ? Notification.permission : "unsupported",
      payload,
    });
    const usedNativeBridge = await triggerWebViewNativeNotification(payload);

    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      pushDebugLog(PUSH_DEBUG_PREFIX, "Triggering vibration");
      navigator.vibrate([200, 100, 200, 100, 300]);
    }

    if (usedNativeBridge) {
      pushDebugLog(PUSH_DEBUG_PREFIX, "Push sound handled by native bridge");
      return;
    }

    if (!pushSoundUnlocked) {
      pushDebugWarn(PUSH_DEBUG_PREFIX, "Push sound blocked because sound is not enabled/unlocked");
      return;
    }

    const players = createPushPlaybackAudio();
    for (const audio of players) {
      try {
        audio.currentTime = 0;
        await audio.play();
        pushDebugLog(PUSH_DEBUG_PREFIX, "Audio playback succeeded", { source: audio.src });
        return;
      } catch (error) {
        pushDebugWarn(PUSH_DEBUG_PREFIX, "Audio playback failed", {
          source: audio.src,
          error: error?.message || error,
        });
        // Try next fallback sound source.
      }
    }

    await playSynthNotificationBeep();
  } catch (error) {
    pushDebugWarn(PUSH_DEBUG_PREFIX, "playPushSound failed", { error: error?.message || error });
  }
}

function setupPushSoundUnlock() {
  if (typeof window === "undefined" || pushSoundUnlocked) return;

  const unlock = async () => {
    let audio = null;
    try {
      audio = ensurePushSoundAudio();
      if (!audio) return;
      pushDebugLog(PUSH_DEBUG_PREFIX, "Attempting passive push sound unlock");
      audio.muted = true;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      pushSoundUnlocked = true;
      localStorage.setItem(pushSoundEnabledStorageKey, "true");
      pushDebugLog(PUSH_DEBUG_PREFIX, "Passive push sound unlock succeeded");
      window.dispatchEvent(new CustomEvent("push-sound-enabled"));
    } catch (error) {
      pushDebugWarn(PUSH_DEBUG_PREFIX, "Passive push sound unlock failed", {
        error: error?.message || error,
      });
    } finally {
      if (audio) {
        audio.muted = false;
      }
    }

    if (pushSoundUnlocked) {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    }
  };

  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock, { passive: true });
  window.addEventListener("touchstart", unlock, { passive: true });
}

export async function enablePushNotificationSound() {
  if (typeof window === "undefined") return false;

  let audio = null;
  try {
    audio = ensurePushSoundAudio();
    if (!audio) return false;
    pushDebugLog(PUSH_DEBUG_PREFIX, "Manual push sound enable started");
    audio.muted = true;
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    pushSoundUnlocked = true;
    localStorage.setItem(pushSoundEnabledStorageKey, "true");
    window.dispatchEvent(new CustomEvent("push-sound-enabled"));

    const players = createPushPlaybackAudio();
    for (const previewAudio of players) {
      try {
        previewAudio.currentTime = 0;
        await previewAudio.play();
        pushDebugLog(PUSH_DEBUG_PREFIX, "Manual sound preview succeeded", { source: previewAudio.src });
        return true;
      } catch (error) {
        pushDebugWarn(PUSH_DEBUG_PREFIX, "Manual sound preview failed", {
          source: previewAudio.src,
          error: error?.message || error,
        });
        // Try next preview source.
      }
    }

    await playSynthNotificationBeep();
    return true;
  } catch (error) {
    pushDebugWarn(PUSH_DEBUG_PREFIX, "Manual push sound enable failed, trying synth beep", {
      error: error?.message || error,
    });
    try {
      await playSynthNotificationBeep();
      pushSoundUnlocked = true;
      localStorage.setItem(pushSoundEnabledStorageKey, "true");
      window.dispatchEvent(new CustomEvent("push-sound-enabled"));
    }
    catch (beepError) {
      pushDebugWarn(PUSH_DEBUG_PREFIX, "Synth beep fallback failed", {
        error: beepError?.message || beepError,
      });
      return false;
    }
    return true;
  } finally {
    if (audio) {
      audio.muted = false;
    }
  }
}

async function getFirebasePublicEnv() {
  if (publicEnvPromise) return publicEnvPromise;

  publicEnvPromise = (async () => {
    let jsonConfig = {};
    try {
      if (typeof window !== "undefined") {
        const res = await fetch("/firebase-web-config.json", { cache: "no-store" }).catch(() => null);
        if (res && res.ok) {
          jsonConfig = await res.json().catch(() => ({}));
        }
      }
    } catch (_) {}

    return {
      apiKey: sanitize(import.meta.env.VITE_FIREBASE_API_KEY) || sanitize(jsonConfig.VITE_FIREBASE_API_KEY) || DEFAULT_FIREBASE_CONFIG.apiKey,
      authDomain: sanitize(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN) || sanitize(jsonConfig.VITE_FIREBASE_AUTH_DOMAIN) || DEFAULT_FIREBASE_CONFIG.authDomain,
      projectId: sanitize(import.meta.env.VITE_FIREBASE_PROJECT_ID) || sanitize(jsonConfig.VITE_FIREBASE_PROJECT_ID) || DEFAULT_FIREBASE_CONFIG.projectId,
      appId: sanitize(import.meta.env.VITE_FIREBASE_APP_ID) || sanitize(jsonConfig.VITE_FIREBASE_APP_ID) || DEFAULT_FIREBASE_CONFIG.appId,
      messagingSenderId:
        sanitize(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID) || sanitize(jsonConfig.VITE_FIREBASE_MESSAGING_SENDER_ID) || DEFAULT_FIREBASE_CONFIG.messagingSenderId,
      storageBucket: sanitize(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET) || sanitize(jsonConfig.VITE_FIREBASE_STORAGE_BUCKET) || DEFAULT_FIREBASE_CONFIG.storageBucket,
      measurementId: sanitize(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID) || sanitize(jsonConfig.VITE_FIREBASE_MEASUREMENT_ID) || DEFAULT_FIREBASE_CONFIG.measurementId,
      vapidKey: sanitize(import.meta.env.VITE_FIREBASE_VAPID_KEY) || sanitize(jsonConfig.VITE_FIREBASE_VAPID_KEY) || DEFAULT_FIREBASE_CONFIG.vapidKey,
    };
  })();

  return publicEnvPromise;
}

function getMessagingFirebaseApp(config) {
  const appConfig = {
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    appId: config.appId,
    messagingSenderId: config.messagingSenderId,
    ...(config.storageBucket ? { storageBucket: config.storageBucket } : {}),
    ...(config.measurementId ? { measurementId: config.measurementId } : {}),
  };

  if (!appConfig.apiKey || !appConfig.projectId || !appConfig.appId || !appConfig.messagingSenderId) {
    return null;
  }

  const existing = getApps().find((a) => a.name === MESSAGING_APP_NAME);
  if (existing) return existing;

  try {
    return getApp(MESSAGING_APP_NAME);
  } catch {
    return initializeApp(appConfig, MESSAGING_APP_NAME);
  }
}

function getSavedToken(moduleName) {
  return localStorage.getItem(`${tokenCachePrefix}${moduleName}`) || "";
}

function setSavedToken(moduleName, token) {
  localStorage.setItem(`${tokenCachePrefix}${moduleName}`, token);
}

async function saveTokenByModule(moduleName, token, platform = "web") {
  pushDebugLog(PUSH_DEBUG_PREFIX, "saveTokenByModule starting", { moduleName, platform, tokenPreview: `${token?.slice(0, 10)}...` });
  if (moduleName === "restaurant") {
    await restaurantAPI.saveFcmToken(token, platform);
    return;
  }
  if (moduleName === "seller") {
    await sellerApi.saveFcmToken(token, platform);
    return;
  }
  if (moduleName === "delivery") {
    await deliveryAPI.saveFcmToken(token, platform);
    return;
  }
  if (moduleName === "user") {
    await userAPI.saveFcmToken(token, { platform });
    return;
  }
  if (moduleName === "admin") {
    await adminAPI.saveFcmToken(token, platform);
  }
}

async function persistNativeFcmToken(moduleName, token) {
  const normalizedToken = extractFcmTokenCandidate(token);
  if (!normalizedToken) return false;

  if (!readAnyAccessToken(moduleName)) {
    localStorage.setItem(
      pendingNativeTokenKey,
      JSON.stringify({ token: normalizedToken, at: Date.now() }),
    );
    pushDebugLog(PUSH_DEBUG_PREFIX, "Cached native FCM token until login", { moduleName });
    return false;
  }

  if (getSavedToken(moduleName) !== normalizedToken) {
    await saveTokenByModule(moduleName, normalizedToken, "mobile");
    setSavedToken(moduleName, normalizedToken);
  }

  localStorage.removeItem(pendingNativeTokenKey);
  pushDebugLog(PUSH_DEBUG_PREFIX, "Registered native WebView FCM token", {
    moduleName,
    tokenPreview: `${normalizedToken.slice(0, 12)}...`,
  });
  return true;
}

async function savePendingNativeToken(moduleName) {
  try {
    const raw = localStorage.getItem(pendingNativeTokenKey);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return persistNativeFcmToken(moduleName, parsed?.token);
  } catch {
    return false;
  }
}

async function registerNativeWebViewFcmToken(moduleName) {
  const pendingSaved = await savePendingNativeToken(moduleName).catch(() => false);
  if (pendingSaved) return true;

  const normalizedToken = await getNativeFcmToken(moduleName);
  if (!normalizedToken) {
    pushDebugWarn(PUSH_DEBUG_PREFIX, "Native FCM token not available yet", {
      moduleName,
      flutterReady: isFlutterWebView(),
    });
    return false;
  }

  return persistNativeFcmToken(moduleName, normalizedToken);
}

function clearNativeTokenRetries() {
  nativeRetryTimeouts.forEach((id) => clearTimeout(id));
  nativeRetryTimeouts = [];
}

function scheduleNativeTokenRetries(moduleName) {
  clearNativeTokenRetries();
  [0, 800, 2000, 5000, 10000, 20000].forEach((delay) => {
    nativeRetryTimeouts.push(
      setTimeout(() => {
        registerNativeWebViewFcmToken(moduleName).catch(() => {});
      }, delay),
    );
  });
}

function attachNativeTokenListeners() {
  if (nativeTokenListenersAttached || typeof window === "undefined") return;
  nativeTokenListenersAttached = true;

  const retry = () => {
    const moduleName = resolvePushModule();
    registerNativeWebViewFcmToken(moduleName).catch(() => {});
  };

  window.addEventListener("flutterInAppWebViewPlatformReady", retry);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") retry();
  });
  window.addEventListener("focus", retry);

  const receiveToken = (token, module) => {
    persistNativeFcmToken(module || resolvePushModule(), token).catch(() => {});
  };
  window.SuperfastReceiveFcmToken = receiveToken;
  window.onNativeFcmToken = receiveToken;

  window.addEventListener("message", (event) => {
    const data = event?.data;
    if (!data || typeof data !== "object") return;
    const type = String(data.type || data.event || "").toLowerCase();
    if (type !== "fcm_token" && type !== "native-fcm-token" && type !== "fcm-token") return;
    const token = extractFcmTokenCandidate(data.token || data.fcmToken || data.payload);
    persistNativeFcmToken(resolvePushModule(), token).catch(() => {});
  });
}

function showForegroundNotification(payload = {}) {
  if (!isRecord(payload)) {
    pushDebugWarn(PUSH_DEBUG_PREFIX, "Ignoring malformed foreground notification payload", { payload });
    return;
  }
  const notificationKey = getNotificationKey(payload);
  pushDebugLog(PUSH_DEBUG_PREFIX, "showForegroundNotification received", { notificationKey, payload });
  if (wasRecentlyHandled(notificationKey)) {
    return;
  }

  const title =
    payload?.notification?.title ||
    payload?.data?.title ||
    "New notification";
  const body =
    payload?.notification?.body ||
    payload?.data?.body ||
    "";
  const image =
    payload?.notification?.image ||
    payload?.notification?.imageUrl ||
    payload?.data?.image ||
    payload?.data?.imageUrl ||
    undefined;

  const isNewOrder =
    title.toLowerCase().includes("order") ||
    body.toLowerCase().includes("order") ||
    payload?.data?.orderId ||
    payload?.data?.type === 'RETURN_PICKUP';

  if (isNewOrder && payload?.data) {
    if (typeof window !== 'undefined') {
      window.__fcmPendingDeliveryPopup = payload.data;
    }
    window.dispatchEvent(new CustomEvent('fcm-delivery-popup', { detail: payload.data }));
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('fcm-order-update', {
      detail: {
        ...(payload?.data || {}),
        title,
        body,
        notificationKey,
        rawPayload: payload
      }
    }));
  }

  playPushSound(payload);

  // Force system notification even when the tab is in focus
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      pushDebugLog(PUSH_DEBUG_PREFIX, "Showing browser notification from page", {
        title,
        body,
        image,
        notificationKey,
      });
      
      const iconUrl = image || "/favicon.ico";

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
          .then((registration) => {
            if (registration && typeof registration.showNotification === 'function') {
              registration.showNotification(title, {
                body,
                icon: iconUrl,
                image: image || undefined,
                tag: notificationKey || undefined,
                data: payload?.data || {},
                requireInteraction: true,
                vibrate: [200, 100, 200, 100, 300]
              });
            }
          })
          .catch((err) => {
            pushDebugWarn(PUSH_DEBUG_PREFIX, "SW showNotification failed", { error: err?.message || err });
          });
      } else {
        try {
          new Notification(title, {
            body,
            icon: iconUrl,
            image: image || undefined,
            tag: notificationKey || undefined,
          });
        } catch (_) {
          // Chrome Android throws on new Notification(); silently catch
        }
      }
    } catch (error) {
      pushDebugWarn(PUSH_DEBUG_PREFIX, "Browser notification creation failed", {
        error: error?.message || error,
      });
    }
  }

  // Still show in-app toast for immediate context if we are in focus
  if (typeof document !== "undefined" && document.visibilityState === "visible") {
    if (body) {
      toast.success(`${title}: ${body}`);
    } else {
      toast.success(title);
    }
  }
}

function attachServiceWorkerMessageListener() {
  if (serviceWorkerMessageListenerAttached || typeof window === "undefined") {
    return;
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      const data = isRecord(event?.data) ? event.data : null;
      if (!data || data.type !== "push-notification-received") return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        pushDebugLog(PUSH_DEBUG_PREFIX, "Skipping page notification render for SW relay because tab is hidden");
        return;
      }
      if (!isRecord(data.payload)) {
        pushDebugWarn(PUSH_DEBUG_PREFIX, "Ignoring malformed SW push relay payload", { payload: data.payload });
        return;
      }
      pushDebugLog(PUSH_DEBUG_PREFIX, "Received service worker message in page", { payload: data.payload });
      scheduleForegroundNotification(data.payload);
    });
  }

  window.addEventListener("native-push-notification", (event) => {
    const payload = isRecord(event?.detail) ? event.detail : null;
    if (!payload) {
      pushDebugWarn(PUSH_DEBUG_PREFIX, "Ignoring malformed native push event", { payload: event?.detail });
      return;
    }
    pushDebugLog(PUSH_DEBUG_PREFIX, "Received native push event", { payload });
    scheduleForegroundNotification(payload);
  });

  window.addEventListener("message", (event) => {
    const data = isRecord(event?.data) ? event.data : null;
    if (!data) return;
    if (data.type !== "native-push-notification") return;
    if (!isRecord(data.payload)) {
      pushDebugWarn(PUSH_DEBUG_PREFIX, "Ignoring malformed native postMessage payload", { payload: data.payload });
      return;
    }
    pushDebugLog(PUSH_DEBUG_PREFIX, "Received native postMessage push event", { payload: data.payload });
    scheduleForegroundNotification(data.payload);
  });

  serviceWorkerMessageListenerAttached = true;
}

function scheduleForegroundNotification(payload) {
  // Keep message handlers fast to avoid Chrome [Violation] warnings.
  // Defer heavier work (toast, audio) to idle time / next tick.
  const run = () => showForegroundNotification(payload);
  try {
    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 1000 });
      return;
    }
  } catch {
    // ignore
  }
  setTimeout(run, 0);
}

export function initPushNotificationClient() {
  if (typeof window === "undefined") return;
  const moduleName = resolvePushModule();
  pushDebugLog(PUSH_DEBUG_PREFIX, "Initializing push notification client", {
    path: getCurrentAppPath(),
    moduleName,
    soundEnabled: isPushSoundEnabled(),
    nativeShell: isNativeAppShell(),
  });

  if (isPushSoundEnabled()) {
    pushSoundUnlocked = true;
  }

  setupPushSoundUnlock();
  attachServiceWorkerMessageListener();
  attachNativeTokenListeners();
}

async function attachForegroundListener(firebaseAppInstance) {
  if (foregroundListenerAttached) return;

  const { getMessaging, onMessage, isSupported } = await import("firebase/messaging");
  const supported = await isSupported().catch(() => false);
  if (!supported) return;

  const messaging = getMessaging(firebaseAppInstance);
  setupPushSoundUnlock();
  attachServiceWorkerMessageListener();

  onMessage(messaging, (payload) => {
    pushDebugLog(PUSH_DEBUG_PREFIX, "Received Firebase foreground message", { payload });
    scheduleForegroundNotification(payload);
  });

  foregroundListenerAttached = true;
}

async function safeGetFcmToken(messaging, options) {
  const { getToken } = await import("firebase/messaging");
  try {
    return await getToken(messaging, options);
  } catch (error) {
    const errStr = String(error?.message || error || "");
    if (errStr.includes("installations") || errStr.includes("500") || errStr.includes("request-failed")) {
      console.warn("FCM Installations error detected. Clearing stale IndexedDB installation cache and retrying...");
      try {
        if (typeof indexedDB !== "undefined") {
          indexedDB.deleteDatabase("firebase-installations-database");
          indexedDB.deleteDatabase("firebase-messaging-database");
        }
      } catch (_) {}
      try {
        return await getToken(messaging, options);
      } catch (retryErr) {
        console.warn("FCM getToken retry failed:", retryErr?.message || retryErr);
        return null;
      }
    }
    console.warn("FCM getToken failed gracefully:", error?.message || error);
    return null;
  }
}

export async function registerWebPushForCurrentModule(pathname = window.location.pathname) {
  const moduleName = resolvePushModule(pathname);
  initPushNotificationClient();

  const accessToken = readAnyAccessToken(moduleName);
  if (!accessToken) {
    if (isNativeAppShell()) {
      scheduleNativeTokenRetries(moduleName);
    }
    return;
  }

  // Flutter / Android WebView cannot show lock-screen alerts via web push.
  // Keep retrying the native token after data-clear / first login.
  if (isNativeAppShell() || isFlutterWebView()) {
    const registered = await registerNativeWebViewFcmToken(moduleName).catch((error) => {
      pushDebugWarn(PUSH_DEBUG_PREFIX, "Native WebView FCM registration failed", {
        moduleName,
        error: error?.message || error,
      });
      return false;
    });
    if (!registered) {
      console.warn(
        "FCM: waiting for Flutter native token. Lock-screen alerts need getFcmToken + high_importance_channel.",
      );
      scheduleNativeTokenRetries(moduleName);
    }
    return;
  }

  const supportsBrowserPush = isSupportedBrowser() && isSecureContextForPush();

  if (supportsBrowserPush) {
    if (registrationInFlight) return registrationInFlight;

    registrationInFlight = (async () => {
      const firebasePublicEnv = await getFirebasePublicEnv();
      if (!firebasePublicEnv?.vapidKey) {
        console.warn("FCM web registration skipped: FIREBASE_VAPID_KEY is missing in env setup.");
        return { success: false, reason: "missing_vapid_key" };
      }

      const app = getMessagingFirebaseApp(firebasePublicEnv);
      if (!app) {
        console.warn("FCM web registration skipped: Firebase public web config is incomplete.");
        return { success: false, reason: "incomplete_firebase_config" };
      }

      if (typeof Notification !== "undefined" && Notification.permission === "denied") {
        console.warn("FCM web registration skipped: Notification permission is blocked/denied.");
        return { success: false, reason: "permission_denied", permission: "denied" };
      }

      const permission =
        typeof Notification !== "undefined" && Notification.permission === "default"
          ? await Notification.requestPermission()
          : typeof Notification !== "undefined" ? Notification.permission : "granted";

      if (permission !== "granted") {
        console.warn("FCM web registration skipped: Notification permission not granted.", permission);
        return { success: false, reason: "permission_not_granted", permission };
      }

      const { getMessaging, isSupported } = await import("firebase/messaging");
      const supported = await isSupported().catch(() => false);
      if (!supported) return { success: false, reason: "messaging_unsupported" };

      const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
      pushDebugLog(PUSH_DEBUG_PREFIX, "Service worker registered for push", {
        scope: registration.scope,
        moduleName,
      });
      const messaging = getMessaging(app);

      const token = await safeGetFcmToken(messaging, {
        vapidKey: firebasePublicEnv.vapidKey,
        serviceWorkerRegistration: registration,
      });

      if (!token) return { success: false, reason: "failed_to_get_token" };
      pushDebugLog(PUSH_DEBUG_PREFIX, "FCM token resolved", {
        moduleName,
        tokenPreview: `${token.slice(0, 12)}...`,
      });

      try {
        pushDebugLog(PUSH_DEBUG_PREFIX, "Synchronizing FCM token with backend database", { moduleName, tokenPreview: `${token?.slice(0, 10)}...` });
        await saveTokenByModule(moduleName, token);
        pushDebugLog(PUSH_DEBUG_PREFIX, "FCM token synchronized with backend successfully");
      } catch (e) {
        pushDebugWarn(PUSH_DEBUG_PREFIX, "Failed to synchronize FCM token to backend", { error: e?.message || e, stack: e?.stack });
        return { success: false, reason: "backend_save_failed", token, error: e?.message };
      }

      await attachForegroundListener(app);
      return { success: true, token, permission: "granted" };
    })()
      .catch((e) => {
        console.error("FCM web registration failed:", e);
        return { success: false, reason: "exception", error: e?.message || String(e) };
      })
      .finally(() => {
        registrationInFlight = null;
      });

    return registrationInFlight;
  }

  return { success: false, reason: "unsupported_browser_or_insecure_context" };
}
