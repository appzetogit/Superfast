import { optimizeCloudinaryUrl } from './cloudinaryUtils.js';
import foodPlaceholder from '@/assets/food-placeholder.jpg';

/**
 * Resolves an image path to an absolute URL suitable for the current environment.
 * Handles relative paths, absolute URLs, and environment-based hostname adjustments.
 *
 * @param {string} path - The relative path or absolute URL of the image.
 * @returns {string} - The fully resolved and optimized image URL.
 */
const DEFAULT_IMAGE_PLACEHOLDER = foodPlaceholder;

export const getImageUrl = (path) => {
  if (!path) return DEFAULT_IMAGE_PLACEHOLDER;
  if (typeof path === 'object') {
    path = path.url || path.secure_url || path.imageUrl || path.image || path.src || '';
  }
  if (typeof path !== 'string' || !path.trim()) return DEFAULT_IMAGE_PLACEHOLDER;
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
    
    if (!pathPart.startsWith('/uploads/') && !pathPart.startsWith('/images/') && !pathPart.startsWith('/api/')) {
      pathPart = `/images${pathPart}`;
    }
    
    resolvedUrl = `${backendOrigin}${pathPart}`;
  }

  return optimizeCloudinaryUrl(resolvedUrl);
};

export const resolveImageUrl = getImageUrl;

export const getFallbackImage = (type = 'food') => {
  return DEFAULT_IMAGE_PLACEHOLDER;
};

export const handleImageError = (e, fallbackType = 'food') => {
  if (!e || !e.currentTarget) return;
  const target = e.currentTarget;
  if (target.dataset.hasFallback === 'true') {
    target.onerror = null;
    return;
  }
  target.dataset.hasFallback = 'true';
  target.onerror = null;
  target.src = DEFAULT_IMAGE_PLACEHOLDER;
};

