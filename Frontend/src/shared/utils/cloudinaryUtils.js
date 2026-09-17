/**
 * Utility for Cloudinary image transformations.
 * Ensures images are served in WebP with optimized quality whenever possible.
 */

/**
 * Optimizes a Cloudinary URL by injecting transformations.
 * @param {string} url - The original Cloudinary URL.
 * @param {Object} options - Transformation options.
 * @param {string} options.format - File format (default: 'webp').
 * @param {string} options.quality - Quality (default: 'auto').
 * @param {number} options.width - Optional width.
 * @param {number} options.height - Optional height.
 * @param {string} options.crop - Optional crop mode (default: 'fill' if width/height provided).
 * @returns {string} - The optimized URL.
 */
export const convertCloudinaryToVpsUrl = (url) => {
  if (!url || typeof url !== "string") return url || "";
  if (!url.includes("res.cloudinary.com")) return url;

  const uploadIndex = url.indexOf("/upload/");
  if (uploadIndex === -1) return url;

  const relativePath = url.substring(uploadIndex + "/upload/".length);
  const segments = relativePath.split("/");
  const filteredSegments = segments.filter(
    (seg) => !seg.match(/^[a-z]_[^/]+$/) && !seg.match(/^v\d+$/)
  );

  const viteApiUrl = import.meta.env?.VITE_API_BASE_URL;
  let backendOrigin = (viteApiUrl && String(viteApiUrl).startsWith("http"))
    ? String(viteApiUrl).replace(/\/api\/v1\/?$/, "").replace(/\/$/, "")
    : "";

  if (!backendOrigin && typeof window !== "undefined") {
    const { protocol, hostname, port } = window.location;
    if (port === "5173" || port === "3000" || hostname === "localhost" || hostname === "127.0.0.1") {
      backendOrigin = `${protocol}//${hostname}:5000`;
    } else {
      backendOrigin = window.location.origin;
    }
  }
  if (!backendOrigin) backendOrigin = "http://localhost:5000";

  return `${backendOrigin}/uploads/${filteredSegments.join("/")}`;
};

export const optimizeCloudinaryUrl = (url, options = {}) => {
  if (!url || typeof url !== "string") return url || "";
  if (url.includes("res.cloudinary.com")) {
    return convertCloudinaryToVpsUrl(url);
  }
  return url;
};

export const ensureWebp = (url) => optimizeCloudinaryUrl(url, { format: "auto" });

export const getCloudinarySrcSet = (url, widths = [300, 600, 900, 1200]) => {
  if (!url) return null;
  return null;
};

export const optimizeCloudinaryVideoUrl = (url, options = {}) => {
  if (!url || typeof url !== "string") return url || "";
  if (url.includes("res.cloudinary.com")) {
    return convertCloudinaryToVpsUrl(url);
  }
  return url;
};
