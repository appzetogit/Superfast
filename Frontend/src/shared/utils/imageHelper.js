import { optimizeCloudinaryUrl } from './cloudinaryUtils';

/**
 * Resolves an image path to an absolute URL suitable for the current environment.
 * Handles relative paths, absolute URLs, and environment-based hostname adjustments.
 *
 * @param {string} path - The relative path or absolute URL of the image.
 * @returns {string} - The fully resolved and optimized image URL.
 */
export const getImageUrl = (path) => {
  if (!path || typeof path !== 'string') return '';
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
      const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
      
      // Rewrite localhost or 127.0.0.1 to backendOrigin if running on a real domain
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
      
      // Ensure https in production
      if (
        typeof window !== 'undefined' && 
        window.location.protocol === 'https:' && 
        parsed.protocol === 'http:' && 
        !/^(localhost|127\.0\.0\.1)$/i.test(parsed.hostname)
      ) {
        parsed.protocol = 'https:';
      }
      
      resolvedUrl = parsed.toString();
    } catch {
      resolvedUrl = trimmed;
    }
  } else {
    // It's a relative path. Normalize slashes.
    const normalized = trimmed.replace(/\\/g, '/');
    let pathPart = normalized.startsWith('/') ? normalized : `/${normalized}`;
    
    // Auto-prepend /uploads if not already prefixed
    if (!pathPart.startsWith('/uploads/') && !pathPart.startsWith('/images/') && !pathPart.startsWith('/api/')) {
      pathPart = `/uploads${pathPart}`;
    }
    
    resolvedUrl = `${backendOrigin}${pathPart}`;
  }

  // Fallback / optimization if Cloudinary
  return optimizeCloudinaryUrl(resolvedUrl);
};
