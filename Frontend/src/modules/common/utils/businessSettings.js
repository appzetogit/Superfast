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

export const getDynamicFaviconUrl = (settings) => {
  if (typeof window === 'undefined' || !settings) return settings?.favicon?.url;
  
  const path = window.location.pathname.toLowerCase();
  
  if (path.includes('/delivery')) {
    return settings.portals?.delivery?.logo?.url || settings.favicon?.url || settings.logo?.url;
  }
  if (path.includes('/restaurant')) {
    return settings.portals?.restaurant?.logo?.url || settings.favicon?.url || settings.logo?.url;
  }
  if (path.includes('/admin')) {
    return settings.favicon?.url || settings.logo?.url;
  }
  if (path.includes('/seller')) {
    return settings.portals?.seller?.logo?.url || settings.favicon?.url || settings.logo?.url;
  }
  if (path.includes('/food')) {
    return settings.moduleThemes?.food?.logo?.url || settings.favicon?.url || settings.logo?.url;
  }
  if (path.includes('/qc') || path.includes('/quick-commerce')) {
    return settings.moduleThemes?.quickCommerce?.logo?.url || settings.favicon?.url || settings.logo?.url;
  }
  
  return settings.portals?.user?.logo?.url || settings.favicon?.url || settings.logo?.url;
};

export const getDynamicLogoUrl = (settings) => {
  if (typeof window === 'undefined' || !settings) return settings?.logo?.url;
  
  const path = window.location.pathname.toLowerCase();
  
  if (path.includes('/delivery')) {
    return settings.portals?.delivery?.logo?.url || settings.logo?.url;
  }
  if (path.includes('/restaurant')) {
    return settings.portals?.restaurant?.logo?.url || settings.logo?.url;
  }
  if (path.includes('/admin')) {
    return settings.logo?.url;
  }
  if (path.includes('/seller')) {
    return settings.portals?.seller?.logo?.url || settings.logo?.url;
  }
  if (path.includes('/food')) {
    return settings.moduleThemes?.food?.logo?.url || settings.logo?.url;
  }
  if (path.includes('/qc') || path.includes('/quick-commerce')) {
    return settings.moduleThemes?.quickCommerce?.logo?.url || settings.logo?.url;
  }
  
  return settings.portals?.user?.logo?.url || settings.logo?.url;
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
  if (!url || typeof document === 'undefined') return;
  const existingFavicons = document.querySelectorAll("link[rel*='icon']");
  existingFavicons.forEach(el => el.remove());
  const link = document.createElement("link");
  link.rel = "icon";
  link.type = "image/png";
  link.href = url;
  link.crossOrigin = "anonymous";
  document.head.appendChild(link);
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
