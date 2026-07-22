import { AsyncLocalStorage } from 'async_hooks';
import { config } from '../config/env.js';

export const requestContext = new AsyncLocalStorage();

const NON_IMAGE_KEYS = new Set([
    'targetPath', 'ctaLink', 'link', 'videoLink', 'websiteUrl',
    'redirectUrl', 'paymentUrl', 'callbackUrl', 'cancelUrl',
    'returnUrl', 'successUrl', 'failureUrl', 'actionUrl', 'apiUrl', 'baseUrl'
]);

const KNOWN_IMAGE_KEYS = new Set([
    'iconUrl', 'imageUrl', 'image', 'mainImage', 'galleryImages',
    'banner', 'bannerUrl', 'logo', 'thumbnail', 'photo', 'avatar',
    'shopLicenseImage', 'upiQrImage', 'headerVideoUrl', 'profileImage',
    'coverImages', 'menuImages', 'licenseImage', 'panImage',
    'fssaiImage', 'gstImage', 'itemImage', 'icon', 'url', 'secure_url',
    'documentUrl', 'photoUrl', 'favicon', 'footerLogo'
]);

const isImageKey = (key) => {
    if (!key || typeof key !== 'string' || NON_IMAGE_KEYS.has(key)) return false;
    if (KNOWN_IMAGE_KEYS.has(key)) return true;
    if (
        key.endsWith('Image') ||
        key.endsWith('Images') ||
        key.endsWith('Url') ||
        key.endsWith('Photo') ||
        key.endsWith('Banner') ||
        key.endsWith('Logo') ||
        key.endsWith('Avatar')
    ) {
        return !NON_IMAGE_KEYS.has(key);
    }
    return false;
};

/**
 * Converts an absolute URL (e.g. `http://localhost:5000/uploads/...` or `https://superfastfood.in/uploads/...`
 * or `/uploads/...`) into a clean relative path (`uploads/...`).
 *
 * @param {string} filePath - Absolute URL or relative path.
 * @returns {string} - Relative path suitable for storing in MongoDB.
 */
export const toRelativeUrl = (filePath) => {
    if (!filePath || typeof filePath !== 'string') {
        return filePath || '';
    }
    let trimmed = filePath.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined' || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
        return trimmed;
    }

    // Strip internal absolute prefixes: http://localhost:5000/, https://superfastfood.in/, http://127.0.0.1:5000/, etc.
    if (/^https?:\/\/(localhost|127\.0\.0\.1|superfastfood\.in)(?::\d+)?(\/.*)?$/i.test(trimmed)) {
        const match = trimmed.match(/^https?:\/\/(?:localhost|127\.0\.0\.1|superfastfood\.in)(?::\d+)?(\/.*)?$/i);
        const pathPart = match && match[1] ? match[1] : '';
        trimmed = pathPart;
    } else if (config.baseUrl && trimmed.startsWith(config.baseUrl)) {
        trimmed = trimmed.slice(config.baseUrl.length);
    }

    // Also check if an external domain URL contains our known storage directories `/uploads/` or `/images/` right after domain
    if (/^https?:\/\/[^\/]+\/(uploads|images)\//i.test(trimmed)) {
        const match = trimmed.match(/^https?:\/\/[^\/]+\/((?:uploads|images)\/.*)$/i);
        if (match && match[1]) {
            return match[1];
        }
    }

    // Strip leading slashes so `/uploads/...` -> `uploads/...` and `/images/...` -> `images/...`
    if (trimmed.startsWith('/')) {
        trimmed = trimmed.replace(/^\/+/, '');
    }

    return trimmed;
};

/**
 * Resolves an image path or absolute URL dynamically based on current environment.
 * Ensures Cloudinary/external URLs remain untouched while relative paths prepend dynamic BASE_URL.
 *
 * @param {string} imagePath - Relative path or absolute URL.
 * @returns {string} - Full URL using environment BASE_URL or untouched Cloudinary URL.
 */
/**
 * Resolves an image path or absolute URL dynamically based on current environment.
 * Ensures Cloudinary/external URLs remain untouched while relative paths prepend dynamic BASE_URL.
 *
 * @param {string} imagePath - Relative path or absolute URL.
 * @param {object|null} req - Optional Express req object to dynamically derive server host.
 * @returns {string} - Full URL using environment BASE_URL or untouched Cloudinary URL.
 */
export const getImageUrl = (imagePath, req = null) => {
    if (!imagePath || typeof imagePath !== 'string') return '';
    const trimmed = imagePath.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return '';

    if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
        return trimmed;
    }

    const activeReq = req || requestContext.getStore();
    let baseUrl = '';
    if (activeReq && typeof activeReq.get === 'function') {
        const host = activeReq.headers['x-forwarded-host'] || activeReq.get('host');
        if (host) {
            const proto = activeReq.headers['x-forwarded-proto'] || activeReq.protocol || 'http';
            baseUrl = `${proto}://${host}`;
        }
    }
    if (!baseUrl) {
        baseUrl = (process.env.BASE_URL || process.env.APP_URL || config.baseUrl || config.appUrl || 'http://localhost:5000').replace(/\/+$/, '');
    } else {
        baseUrl = baseUrl.replace(/\/+$/, '');
    }

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('//')) {
        if (/^https?:\/\/(localhost|127\.0\.0\.1|superfastfood\.in)(?::\d+)?(\/.*)?$/i.test(trimmed)) {
            const match = trimmed.match(/^https?:\/\/(?:localhost|127\.0\.0\.1|superfastfood\.in)(?::\d+)?(\/.*)?$/i);
            const pathPart = match && match[1] ? match[1] : '';
            if (!pathPart || pathPart === '/') return baseUrl;
            return `${baseUrl}${pathPart.startsWith('/') ? '' : '/'}${pathPart}`;
        }
        return trimmed; // Cloudinary or external link untouched
    }

    let normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    if (!normalizedPath.startsWith('/uploads/') && !normalizedPath.startsWith('/images/') && !normalizedPath.startsWith('/api/')) {
        normalizedPath = `/uploads${normalizedPath}`;
    }
    return `${baseUrl}${normalizedPath}`;
};

/**
 * Resolves a relative file path or absolute local/vps URL into a full URL
 * appropriate for the current environment based on `config.appUrl` (APP_URL).
 *
 * @param {string} filePath - Relative path or absolute URL.
 * @param {object|null} req - Optional Express req object.
 * @returns {string} - Full URL using the environment's APP_URL.
 */
export const buildFileUrl = (filePath, req = null) => {
    return getImageUrl(filePath, req);
};

/**
 * Converts a relative file path (or legacy absolute localhost/domain URL) into a full URL
 * appropriate for the current environment using `buildFileUrl`.
 *
 * @param {string} filePath - Relative path or absolute URL.
 * @param {object|null} req - Optional Express req object.
 * @returns {string} - Full URL or unchanged value if external/base64.
 */
export const toFullUrl = (filePath, req = null) => {
    return buildFileUrl(filePath, req);
};


/**
 * Recursively traverses an object, array, or document and transforms any known image/URL fields
 * using `toFullUrl`.
 *
 * @param {any} data - Input object, array, or Mongoose document.
 * @param {object|null} req - Optional Express req object.
 * @returns {any} - Transformed data copy with full image URLs.
 */
export const transformImageFields = (data, req = null) => {
    if (!data || typeof data !== 'object') {
        return data;
    }

    // Preserve special types: Date, RegExp, Buffer, Mongoose/BSON ObjectId, Decimal128, etc.
    if (
        data instanceof Date ||
        data instanceof RegExp ||
        Buffer.isBuffer(data) ||
        (data.constructor && (data.constructor.name === 'ObjectId' || data.constructor.name === 'Decimal128')) ||
        data._bsontype === 'ObjectID' ||
        data._bsontype === 'ObjectId' ||
        data._bsontype === 'Decimal128' ||
        typeof data.toHexString === 'function'
    ) {
        return data;
    }

    let target = data;
    if (typeof data.toObject === 'function') {
        target = data.toObject();
    }

    if (Array.isArray(target)) {
        return target.map((item) => (typeof item === 'string' ? toFullUrl(item, req) : transformImageFields(item, req)));
    }

    const transformed = {};
    for (const [key, value] of Object.entries(target)) {
        if (value === null || value === undefined) {
            transformed[key] = value;
            continue;
        }

        if (
            typeof value === 'object' &&
            (value instanceof Date ||
                value instanceof RegExp ||
                Buffer.isBuffer(value) ||
                (value.constructor && (value.constructor.name === 'ObjectId' || value.constructor.name === 'Decimal128')) ||
                value._bsontype === 'ObjectID' ||
                value._bsontype === 'ObjectId' ||
                value._bsontype === 'Decimal128' ||
                typeof value.toHexString === 'function')
        ) {
            transformed[key] = value;
            continue;
        }

        if (isImageKey(key)) {
            if (typeof value === 'string') {
                transformed[key] = toFullUrl(value, req);
            } else if (Array.isArray(value)) {
                transformed[key] = value.map((item) =>
                    typeof item === 'string' ? toFullUrl(item, req) : transformImageFields(item, req)
                );
            } else if (typeof value === 'object') {
                transformed[key] = transformImageFields(value, req);
            } else {
                transformed[key] = value;
            }
        } else if (typeof value === 'object') {
            transformed[key] = transformImageFields(value, req);
        } else {
            transformed[key] = value;
        }
    }

    return transformed;
};


export default {
    requestContext,
    getImageUrl,
    toRelativeUrl,
    toFullUrl,
    buildFileUrl,
    transformImageFields
};

