import { optimizeCloudinaryUrl } from './cloudinaryUtils.js';

/**
 * Resolves an image path to an absolute URL suitable for the current environment.
 * Handles relative paths, absolute URLs, and environment-based hostname adjustments.
 *
 * @param {string} path - The relative path or absolute URL of the image.
 * @returns {string} - The fully resolved and optimized image URL.
 */
export const getImageUrl = (path) => {
  if (!path) return '';
  if (typeof path === 'object') {
    path = path.url || path.secure_url || path.imageUrl || path.image || path.src || '';
  }
  if (typeof path !== 'string') return '';
  const trimmed = path.trim();
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }

  // Derive backend origin from VITE_API_BASE_URL or current host
  const viteApiUrl = import.meta.env?.VITE_API_BASE_URL;
  const backendOrigin = viteApiUrl
    ? String(viteApiUrl).replace(/\/api\/v1\/?$/, '').replace(/\/$/, '')
    : (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000');

  let resolvedUrl = trimmed;

  // Check if it's already an absolute URL
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('//')) {
    try {
      const parsed = new URL(trimmed);
      const pathname = parsed.pathname || '';

      // If the absolute URL points to our storage directories (/uploads/ or /images/) or is a localhost/superfast domain,
      // always dynamically point to the active backendOrigin so images load reliably across environments.
      if (
        pathname.startsWith('/uploads/') ||
        pathname.startsWith('/images/') ||
        /^(localhost|127\.0\.0\.1|superfastfood\.in)$/i.test(parsed.hostname)
      ) {
        resolvedUrl = `${backendOrigin}${pathname}`;
      } else {
        const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
        if (
          currentHost &&
          currentHost !== 'localhost' &&
          currentHost !== '127.0.0.1' &&
          /^(localhost|127\.0\.0\.1)$/i.test(parsed.hostname)
        ) {
          const originUrl = new URL(backendOrigin);
          parsed.protocol = originUrl.protocol;
          parsed.hostname = originUrl.hostname;
          parsed.port = originUrl.port || '';
        }
        if (
          typeof window !== 'undefined' && 
          window.location.protocol === 'https:' && 
          parsed.protocol === 'http:' && 
          !/^(localhost|127\.0\.0\.1)$/i.test(parsed.hostname)
        ) {
          parsed.protocol = 'https:';
        }
        resolvedUrl = parsed.toString();
      }
    } catch {
      resolvedUrl = trimmed;
    }
  } else {
    // It's a relative path. Normalize slashes.
    const normalized = trimmed.replace(/\\/g, '/');
    let pathPart = normalized.startsWith('/') ? normalized : `/${normalized}`;
    
    // Auto-prepend /images if not already prefixed (/uploads/ remains valid via our dual static middleware)
    if (!pathPart.startsWith('/uploads/') && !pathPart.startsWith('/images/') && !pathPart.startsWith('/api/')) {
      pathPart = `/images${pathPart}`;
    }
    
    resolvedUrl = `${backendOrigin}${pathPart}`;
  }

  // Fallback / optimization if Cloudinary
  return optimizeCloudinaryUrl(resolvedUrl);
};

export const resolveImageUrl = getImageUrl;

/**
 * Dynamically resolves the fallback image URL according to the active environment.
 * Uses VITE_BACKEND_URL, VITE_BASE_URL, or derives from VITE_API_BASE_URL / window.location.origin.
 *
 * @returns {string} - The dynamic fallback image URL.
 */
export const getFallbackImage = (type = 'food') => {
  const baseUrl =
    import.meta.env?.VITE_BACKEND_URL ||
    import.meta.env?.VITE_BASE_URL ||
    (import.meta.env?.VITE_API_BASE_URL
      ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/api\/v1\/?$/, '').replace(/\/$/, '')
      : typeof window !== 'undefined'
      ? window.location.origin
      : 'http://localhost:5000');
  return `${baseUrl}/uploads/placeholder-food.png`;
};

/**
 * Universal error handler for React <img /> components.
 * Prevents infinite request loops when fallback images fail or when React re-triggers synthetic onError.
 *
 * @param {Event} e - React or DOM error event
 * @param {string} [fallbackType='food'] - Fallback category ('food', 'restaurant', 'category', etc.)
 */
export const handleImageError = (e, fallbackType = 'food') => {
  if (!e || !e.currentTarget) return;
  const target = e.currentTarget;
  // If we already attempted fallback on this element, stop immediately to prevent infinite API calls
  if (target.dataset.hasFallback === 'true') {
    target.onerror = null;
    return;
  }
  target.dataset.hasFallback = 'true';
  target.onerror = null;
  const fallbackUrl = getFallbackImage(fallbackType);
  if (target.src !== fallbackUrl) {
    target.src = fallbackUrl;
  }
};

