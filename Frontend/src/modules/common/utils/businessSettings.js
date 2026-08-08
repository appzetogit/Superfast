/**
 * Business Settings Utility
 * Handles loading and updating business settings (favicon, title, logo)
 */

import apiClient from "@/services/api/axios";
import { API_ENDPOINTS } from "@/services/api/config";
import { searchAPI } from "@/services/api";

const SETTINGS_KEY = 'global_business_settings';

// Initialize from localStorage immediately so it's available for components on mount
let cachedSettings = (() => {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    return null;
  }
})();

/**
 * Update theme color in document root
 */
export const updateThemeColor = (color) => {
  if (!color || typeof document === 'undefined') return;
  const path = window.location.pathname.toLowerCase();
  
  // Do not mutate global :root for user dashboard/auth pages, let them handle scoping
  if (path.startsWith('/food/user') || path.startsWith('/quick') || path.startsWith('/user')) {
    return;
  }
  
  document.documentElement.style.setProperty('--primary-theme', color);
  document.documentElement.style.setProperty('--sidebar-theme', color);
};

const extractUrl = (val) => {
  if (!val) return null;
  if (typeof val === 'string' && val.trim() && val !== '[object Object]') return val.trim();
  if (typeof val === 'object' && val.url && typeof val.url === 'string' && val.url.trim()) return val.url.trim();
  return null;
};

export const getDynamicFaviconUrl = (settings) => {
  if (typeof window === 'undefined' || !settings) return '/favicon.png';
  
  const path = window.location.pathname.toLowerCase();
  let candidates = [];
  
  if (path.includes('/delivery')) {
    candidates = [settings.portals?.delivery?.logo, settings.favicon, settings.logo];
  } else if (path.includes('/restaurant')) {
    candidates = [settings.portals?.restaurant?.logo, settings.favicon, settings.logo];
  } else if (path.includes('/admin')) {
    candidates = [settings.favicon, settings.logo];
  } else if (path.includes('/seller')) {
    candidates = [settings.portals?.seller?.logo, settings.favicon, settings.logo];
  } else if (path.includes('/food')) {
    candidates = [settings.moduleThemes?.food?.logo, settings.favicon, settings.logo];
  } else if (path.includes('/qc') || path.includes('/quick-commerce')) {
    candidates = [settings.moduleThemes?.quickCommerce?.logo, settings.favicon, settings.logo];
  } else {
    candidates = [settings.portals?.user?.logo, settings.favicon, settings.logo];
  }

  for (const c of candidates) {
    const url = extractUrl(c);
    if (url) return url;
  }
  return '/favicon.png';
};

export const getDynamicLogoUrl = (settings, portalOverride = null) => {
  if (!settings) return null;
  
  const portal = String(portalOverride || '').toLowerCase();
  const path = typeof window !== 'undefined' ? window.location.pathname.toLowerCase() : '';
  let candidates = [];
  
  if (portal === 'delivery' || path.includes('/delivery')) {
    candidates = [settings.portals?.delivery?.logo, settings.logo];
  } else if (portal === 'restaurant' || path.includes('/restaurant')) {
    candidates = [settings.portals?.restaurant?.logo, settings.logo];
  } else if (portal === 'seller' || portal === 'vendor' || path.includes('/seller')) {
    candidates = [settings.portals?.seller?.logo, settings.logo];
  } else if (portal === 'admin' || path.includes('/admin')) {
    candidates = [settings.logo];
  } else if (portal === 'food' || path.includes('/food')) {
    candidates = [settings.moduleThemes?.food?.logo, settings.logo];
  } else if (portal === 'qc' || path.includes('/qc') || path.includes('/quick-commerce')) {
    candidates = [settings.moduleThemes?.quickCommerce?.logo, settings.logo];
  } else {
    candidates = [settings.portals?.user?.logo, settings.logo];
  }

  for (const c of candidates) {
    const url = extractUrl(c);
    if (url) return url;
  }
  return null;
};

// Apply cached settings immediately on module load if they exist
if (cachedSettings) {
  setTimeout(() => {
    updateFavicon(getDynamicFaviconUrl(cachedSettings));
    updateTitle(cachedSettings.companyName);
    updateThemeColor(cachedSettings.themeColor);
  }, 0);
}

let inFlightSettingsPromise = null;
let hasFetchedFromServer = false;

/**
 * Load business settings from backend (public endpoint - no auth required)
 */
export const loadBusinessSettings = async (force = false) => {
  try {
    const endpoint = API_ENDPOINTS.ADMIN.BUSINESS_SETTINGS_PUBLIC;
    if (!endpoint || (typeof endpoint === "string" && !endpoint.trim())) {
      return cachedSettings;
    }

    if (!force && hasFetchedFromServer) {
      return cachedSettings;
    }

    if (inFlightSettingsPromise) {
      return await inFlightSettingsPromise;
    }

    inFlightSettingsPromise = (async () => {
      // Use the generic searchAPI or a dedicated public getter if available
      const response = await apiClient.get(endpoint, { noCache: true });
      const settings = response?.data?.data || response?.data;

      if (settings) {
        setCachedSettings(settings);
      }
      // Mark as fetched even if settings are empty to prevent infinite retries
      hasFetchedFromServer = true;
      return cachedSettings;
    })();

    return await inFlightSettingsPromise;
  } catch (error) {
    hasFetchedFromServer = true; // Prevent retries on error as well
    return cachedSettings;
  } finally {
    inFlightSettingsPromise = null;
  }
};

/**
 * Update favicon in document
 */
export const updateFavicon = (url) => {
  if (typeof document === 'undefined') return;
  const rawUrl = (url && typeof url === 'string' && url.trim() && url !== '[object Object]') ? url.trim() : '/favicon.png';
  const targetUrl = rawUrl.startsWith('/') ? `${rawUrl.split('?')[0]}?v=3` : rawUrl;
  
  const rels = ['icon', 'shortcut icon', 'apple-touch-icon'];
  rels.forEach((rel) => {
    let link = document.querySelector(`link[rel="${rel}"]`);
    if (!link) {
      link = document.createElement('link');
      link.rel = rel;
      document.head.appendChild(link);
    }
    link.id = 'dynamic-favicon';
    link.type = 'image/png';
    link.href = targetUrl;
  });
};

/**
 * Update page title
 */
export const updateTitle = (companyName) => {
  if (companyName && typeof document !== 'undefined') {
    document.title = companyName;
  }
};

/**
 * Set cached settings manually (useful after update)
 */
export const setCachedSettings = (settings) => {
  if (settings) {
    cachedSettings = settings;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {}
    
    updateFavicon(getDynamicFaviconUrl(settings));
    updateTitle(settings.companyName);
    updateThemeColor(settings.themeColor);
    
    // Dispatch event so all components listening can update immediately
    window.dispatchEvent(new CustomEvent('businessSettingsUpdated', { detail: settings }));
  }
};

/**
 * Clear cached settings (call after updating settings)
 */
export const clearCache = () => {
  cachedSettings = null;
  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch (e) {}
};

/**
 * Get cached settings
 */
export const getCachedSettings = () => {
  // Always re-read from localStorage to pick up cross-tab updates immediately
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      cachedSettings = JSON.parse(saved);
    }
  } catch (e) {}
  return cachedSettings;
};

/**
 * Get company name from business settings with fallback
 */
export const getCompanyName = () => {
  const settings = getCachedSettings();
  return settings?.companyName || "SUPERFAST";
};

/**
 * Get company name asynchronously (loads if not cached)
 */
export const getCompanyNameAsync = async () => {
  try {
    const settings = await loadBusinessSettings();
    return settings?.companyName || "SUPERFAST";
  } catch (error) {
    return "SUPERFAST";
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === SETTINGS_KEY && e.newValue) {
      try {
        const parsedSettings = JSON.parse(e.newValue);
        cachedSettings = parsedSettings;
        updateFavicon(getDynamicFaviconUrl(parsedSettings));
        updateTitle(parsedSettings.companyName);
        updateThemeColor(parsedSettings.themeColor);
        window.dispatchEvent(new CustomEvent('businessSettingsUpdated', { detail: parsedSettings }));
      } catch (err) {
        console.error('Failed to sync settings from storage', err);
      }
    }
  });
}
