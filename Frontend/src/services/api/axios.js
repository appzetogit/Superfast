/**
 * Central API client for backend (auth and future APIs).
 * - baseURL from VITE_API_BASE_URL (e.g. http://localhost:5000/api/v1)
 * - When baseURL ends with /api/v1, request paths must NOT include /v1 (use /food/..., /auth/...)
 * - Attaches Bearer token (user or admin based on request URL)
 * - On 401: attempts refresh, retries once; on refresh failure logs out
 */

import axios from "axios";
import { sanitizeApiError } from "./friendlyError";

const resolveBaseURL = () => {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const isLocalHost = host === "localhost" || host === "127.0.0.1";
    const envVal = typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL
      ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/$/, "")
      : "";

    if (!isLocalHost && (!envVal || envVal.includes("localhost") || envVal.includes("127.0.0.1"))) {
      return "/api/v1";
    }

    if (envVal) return envVal;
    return isLocalHost ? "http://localhost:5000/api/v1" : "/api/v1";
  }

  return typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL
    ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/$/, "")
    : "/api/v1";
};

const baseURL = resolveBaseURL();

const apiClient = axios.create({
  baseURL: baseURL || undefined,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

function getModuleFromUrl(url = "") {
  const normalized = (typeof url === "string" ? url : (url?.url || "")).toLowerCase();

  // 1. Admin detection (Priority)
  if (
    normalized.includes("/admin/") ||
    normalized.includes("/food/admin/") ||
    normalized.includes("/food/auth/admin") ||
    normalized.includes("/auth/admin") ||
    normalized.includes("admin/login")
  ) return "admin";

  // 2. Special case: /food/restaurants (plural) is a public endpoint
  // BUT only if it's not a restaurant owner's specific route
  if (normalized.includes("/food/restaurants") && !normalized.includes("/food/restaurant/")) {
    return "user";
  }

  // 3. Restaurant detection
  if (
    normalized.includes("/restaurant/") ||
    normalized.includes("/food/restaurant") ||
    normalized.includes("/auth/restaurant")
  ) {
    return "restaurant";
  }

  // 4. Delivery detection
  if (
    normalized.includes("/delivery/") ||
    normalized.includes("/food/delivery") ||
    normalized.includes("/auth/delivery")
  ) return "delivery";

  return "user";
}

function getModuleFromConfig(config) {
  if (config?.contextModule) return config.contextModule;
  return getModuleFromUrl(config?.url);
}

function getAccessToken(config) {
  const module = getModuleFromConfig(config);
  const key = `${module}_accessToken`;
  try {
    // 1. Try module-specific token first
    const moduleToken = localStorage.getItem(key);
    if (moduleToken) return moduleToken;

    // 2. Fallback for admin module (checks adminToken, auth_admin, or generic accessToken)
    if (module === "admin") {
      const adminToken = localStorage.getItem("adminToken") || localStorage.getItem("auth_admin") || localStorage.getItem("accessToken");
      if (adminToken) return adminToken;
    }

    // 3. Fallback to auth_customer for user module (Quick Commerce token compatibility)
    if (module === "user") {
      const customerToken = localStorage.getItem("auth_customer");
      if (customerToken) return customerToken;
    }

    // 4. Fallback to generic token for non-admin modules
    if (module !== "admin") {
      return localStorage.getItem("accessToken") || null;
    }
    return null;
  } catch {
    return null;
  }
}

function getRefreshToken(module) {
  try {
    // 1. Try module-specific refresh token
    const moduleRefreshToken = localStorage.getItem(`${module}_refreshToken`);
    if (moduleRefreshToken) return moduleRefreshToken;

    // 2. Fallback to generic refresh token only for non-admin modules
    if (module !== "admin") {
      return localStorage.getItem("refreshToken") || null;
    }
    return null;
  } catch {
    return null;
  }
}

function clearModuleAuth(module) {
  try {
    localStorage.removeItem(`${module}_accessToken`);
    localStorage.removeItem(`${module}_refreshToken`);
    localStorage.removeItem(`${module}_authenticated`);
    localStorage.removeItem(`${module}_user`);
    if (module === "admin") {
      localStorage.removeItem("auth_admin");
      localStorage.removeItem("adminToken");
      localStorage.removeItem("adminInfo");
    } else if (module === "user") {
      localStorage.removeItem("auth_customer");
      localStorage.removeItem("accessToken");
      localStorage.removeItem("token");
    } else if (module === "restaurant") {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("token");
    }
  } catch (_) { }
}

let isRefreshing = false;
let refreshSubscribers = [];

function subscribeToRefresh(cb) {
  refreshSubscribers.push(cb);
}

function onRefreshed(newToken, module) {
  refreshSubscribers.forEach((cb) => cb(newToken, module));
  refreshSubscribers = [];
}

function onRefreshFailed(module) {
  clearModuleAuth(module);
  // Fail any queued requests that were waiting for this refresh
  refreshSubscribers.forEach((cb) => cb(null, module));
  refreshSubscribers = [];

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("authRefreshFailed", { detail: { module } }));
  }
}

apiClient.interceptors.request.use(
  (config) => {
    config.contextModule = getModuleFromConfig(config);

    // If sending FormData, let the browser set proper multipart boundary.
    if (config.data instanceof FormData) {
      if (config.headers) {
        if (typeof config.headers.delete === "function") {
          config.headers.delete("Content-Type");
          config.headers.delete("content-type");
        }
        delete config.headers["Content-Type"];
        delete config.headers["content-type"];
      }
    }

    const token = getAccessToken(config);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Attach context module as header for backend scoping (e.g. notifications)
    if (config.contextModule) {
      config.headers['x-context-module'] = config.contextModule;
    }

    return config;
  },
  (err) => Promise.reject(err)
);

// Tell the UI (ApiStatusBanner in App.jsx) when the server is unreachable / failing,
// so every screen gets a friendly message instead of a silent blank state.
// The banner means "the server is down", so it is shown only when the server really cannot be
// reached: a slow request (timeout) or one failing endpoint (a plain 500) must not trigger it, and
// even repeated connection failures are confirmed with a /health ping before anything is shown.
let consecutiveApiFailures = 0
let healthCheckInFlight = false

export const checkServerHealth = async () => {
  try {
    const res = await axios.get(`${baseURL || '/api/v1'}/health`, { timeout: 8000, validateStatus: () => true })
    return res.status === 200
  } catch {
    return false
  }
}

const emitApiStatus = (ok) => {
  if (typeof window === 'undefined') return
  if (ok) {
    if (consecutiveApiFailures > 0) {
      consecutiveApiFailures = 0
      window.dispatchEvent(new CustomEvent('app:api-ok'))
    }
    return
  }
  consecutiveApiFailures += 1
  if (consecutiveApiFailures < 3 || healthCheckInFlight) return
  healthCheckInFlight = true
  checkServerHealth()
    .then((up) => {
      if (up) {
        consecutiveApiFailures = 0
        window.dispatchEvent(new CustomEvent('app:api-ok'))
      } else {
        window.dispatchEvent(new CustomEvent('app:api-error'))
      }
    })
    .finally(() => { healthCheckInFlight = false })
}

// Failures that say "the server is unreachable" (not "this request was slow / this endpoint broke").
const isServerUnreachable = (err) => {
  const status = err?.response?.status
  if (!err?.response) return err?.code !== 'ECONNABORTED' && err?.code !== 'ETIMEDOUT'
  return [502, 503, 504].includes(status)
}

apiClient.interceptors.response.use(
  (response) => {
    emitApiStatus(true)
    return response
  },
  async (err) => {
    const original = err?.config;
    const status = err?.response?.status
    if (axios.isCancel?.(err) || err?.code === 'ERR_CANCELED') {
      // aborted on purpose (navigation / replaced request): says nothing about the server
    } else if (isServerUnreachable(err)) emitApiStatus(false)
    else emitApiStatus(true) // any answer (4xx, a plain 500) or a slow timeout: the server is not "down"
    // Server restarting / overloaded (502-504 or no response): retry reads quietly with backoff
    // instead of surfacing an error. Writes are never retried automatically (could double-submit).
    const isTransient = !err?.response ? err?.code !== 'ERR_CANCELED' : [502, 503, 504].includes(status)
    if (isTransient && original && String(original.method || 'get').toLowerCase() === 'get' && (original._transientRetries || 0) < 2) {
      original._transientRetries = (original._transientRetries || 0) + 1
      await new Promise((r) => setTimeout(r, 700 * original._transientRetries + Math.random() * 500))
      return apiClient(original)
    }
    if (err?.response?.status === 429) {
      return Promise.reject(err);
    }
    if (err?.response?.status !== 401 || !original || original._retry) {
      return Promise.reject(err);
    }
    const module = original.contextModule || getModuleFromUrl(original.url);
    const refreshToken = getRefreshToken(module);
    if (!refreshToken) {
      clearModuleAuth(module);
      return Promise.reject(err);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        subscribeToRefresh((newToken) => {
          if (newToken) {
            original.headers.Authorization = `Bearer ${newToken}`;
            resolve(apiClient(original));
          } else {
            reject(err);
          }
        });
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      // Use relative URL so this works both with an explicit baseURL and with a dev proxy.
      // Use plain axios to avoid interceptor recursion.
      const refreshUrl = baseURL ? `${baseURL}/food/auth/refresh-token` : "/api/v1/food/auth/refresh-token";
      const { data } = await axios.post(refreshUrl, { refreshToken }, { timeout: 10000 });
      const newAccessToken = data?.data?.accessToken || data?.accessToken;
      if (newAccessToken) {
        try {
          localStorage.setItem(`${module}_accessToken`, newAccessToken);

          // Also sync legacy and global keys for consistency across the app
          if (module === "admin") {
            localStorage.setItem("adminToken", newAccessToken);
          }
          localStorage.setItem("accessToken", newAccessToken);

          // Dispatch a custom event specifically for the module that refreshed
          window.dispatchEvent(new CustomEvent("authRefreshed", {
            detail: { module, token: newAccessToken }
          }));
        } catch (_) { }
        onRefreshed(newAccessToken, module);
        original.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(original);
      }
    } catch (refreshErr) {
      const status = refreshErr?.response?.status;
      if (status === 401 || status === 403) {
        onRefreshFailed(module);
      }
      return Promise.reject(err);
    } finally {
      isRefreshing = false;
    }

    onRefreshFailed(module);
    return Promise.reject(err);
  }
);

// Runs last: whatever rejection leaves this client is already safe to show to a user.
apiClient.interceptors.response.use(
  (response) => response,
  (err) => Promise.reject(sanitizeApiError(err))
);

export default apiClient;
