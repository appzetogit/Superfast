import crypto from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { FoodUser } from '../users/user.model.js';
import { FoodRestaurant } from '../../modules/food/restaurant/models/restaurant.model.js';
import { Seller } from '../../modules/quick-commerce/seller/models/seller.model.js';
import { FoodDeliveryPartner } from '../../modules/food/delivery/models/deliveryPartner.model.js';
import { FoodAdmin } from '../admin/admin.model.js';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

const FIREBASE_MESSAGING_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SEND_URL = (projectId) =>
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;
const OWNER_MODELS = {
    USER: FoodUser,
    RESTAURANT: FoodRestaurant,
    SELLER: Seller,
    DELIVERY_PARTNER: FoodDeliveryPartner,
    DELIVERY: FoodDeliveryPartner,
    ADMIN: FoodAdmin
};
const OWNER_TOKEN_FIELDS = {
    web: 'fcmTokens',
    mobile: 'fcmTokenMobile'
};
const OWNER_APP_PREFIXES = {
    USER: '👤',
    RESTAURANT: '',
    SELLER: '🏪',
    DELIVERY_PARTNER: '🛵',
    DELIVERY: '🛵',
    ADMIN: '🛡️'
};

let cachedAccessToken = null;
let cachedAccessTokenExpiryMs = 0;
let cachedServiceAccount = null;

const sanitizeString = (value) => String(value ?? '').trim();

const toBase64Url = (input) =>
    Buffer.from(JSON.stringify(input))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');

const normalizePrivateKey = (key) => String(key || '').replace(/\\n/g, '\n').trim();

const DEFAULT_SERVICE_ACCOUNT_B64 = "ew0KICAidHlwZSI6ICJzZXJ2aWNlX2FjY291bnQiLA0KICAicHJvamVjdF9pZCI6ICJzdXBlcmZhc3QtOWZiMzUiLA0KICAicHJpdmF0ZV9rZXlfaWQiOiAiYjBlYWVjNDk4MTdiYzJjNGYzYmRmZTYyNWQyYTNhNWU3NjVmZmIwYiIsDQogICJwcml2YXRlX2tleSI6ICItLS0tLUJFR0lOIFBSSVZBVEUgS0VZLS0tLS1cbk1JSUV2UUlCQURBTkJna3Foa2lHOXcwQkFRRUZBQVNDQktjd2dnU2pBZ0VBQW9JQkFRQ2JjaEtDclFpYll6aW9cbjNMR2puQnlrdDFra3Z4Z1ZDZWRVNUtqYmtrSDRST1k5YkQwRDhqV2Qvb0ZzVnJsejlIVk50K3BRdXp2VlNpWXlcbk5hRml0OUhnTDFUamFHWFB6dUo5eEsrRGUwS1JMUkVZTXpmcmJtRURadE5qenNGSExPNUs3R0Fua0lrcU1hVEpcblVaYU5SazZpS1lsSDVNN2dmZ3o1Q1JSMGhLYy84VnZPUWg1TSt1a251WExtZmNxZVVsOWQ4SkdQT3pQTHQ1Q3lcbmVFUTRQSlJxamFOa1N6Rm1xZEp1WU9kMVVwTDUzNWFLSzR6ME9CZlVuY01DQ1k2dzVGbTM3OGhZalA2dUYrV2lcbkZrN0lobjlXT3htTis0Zjh0TmovREpZQS93ZzdIT0lXa0FsRGtsR2paSHY0MzcxdEhacVdlbUlGZ2hpZUs4aUdcbjRNL2tCTXdYQWdNQkFBRUNnZ0VBTXdtN1JpaW1JTTd0TlpSd3h2Vmsramd4RHIybm5KREo0YmZLTVgzT0owUUlcbkRMYlRPYzUzQ0U4ZUU0Sk9GZUozK1hLZmZxNWJNT2JOcjhLb0lJK1dXM051L2RPelNnMzFrN0hXcHViN3Jrc0xcbng5UlpVZlhGNktZRVZrcjJidll6cjJuNUVFU0dwTkh6OXgzUXZzWU0zM1dmMjNrbTY5SzNVN1ZGZ0JSbURib2dcbmg1UnlWdHBFWUFsUGswRW5CUHVIbkd6VWtmaCtOM2JmYmdsLzdaRnY0RVkydWV6azI3Z253SjVPTFlQMnlEeDdcbmIzTHQva0tDenZHNWlkUHM1dHJPREdkazhVZys2ZTFEZllKT1kwNE1OdWxhRFhSbXJSQjVvYXNlR1dwMnUyaGNcbkVZUm1vUWZoS0dhVmhneldDWng5SEdmWThsSnlwTlJBN2ZnYmlLb1FrUUtCZ1FET0ZnZzNKMjgrdzdxeFpRWnNcbjlUZjgreC8yM0ppSDBMN0pRREhUZWs5cVhjVGQrQnE3cDZCK2loTEcvU2RGZWlaWFo3RDNSN255NkJ3eHF6NzZcbkc1bnhuMTc2MmtDU3h1cDh1T0NwWEluaVcvaUFzME4vV1dBM29NTWJkdzVXY0kvdEJLY0dxeGdqaFIwMkZvWW9cbkVWSy8wdjFPcGtTdktKRnkwczhyVzFZZy9RS0JnUURCR0MwSUE3b2U2QWd1MVNRbnBZRHQ5bHM5Z3NYaWZqVHJcbmRiREFwMElkbGRZNkNSZDNoZ09OVWtmUDIzdlhqSzBqclZ3NjZNSE5QOU9VZkRPeG1rUmdRTnNHS2FZbGZwT2lcbnl1d1RoWDBoWjF4bTh0MUxMQ2dJTkZSSXJ4bU1EaThlcit1NGppc2NQdUVhTU5lWWVHTDJFWXVmSE1ROXdpTTVcbmg1TGtVUWhub3dLQmdRQ3hveGdNd25ZSFdkc1FrWTRLV1F5YmlUS3lMTTlsTWk5aGRXMzlaWTRTbHlUY1Y4RmpcblEwZjZDclhJdytrWDRBUXdqdlpoRDNoZXdtZWJBSXJXTnZobzV3Q05wWmJIYmFJdFE0YVROV3E4ckozMUFaQUtcbnMxVldYY0lQYUgzNVVDa2ZHa1dHWCsvOG5mN2g0bVJkSVNGOHF6Y2dsZnphSmxQSTc2RVhOREYzV1FLQmdEMktcblRmZks4RXVmV2RSTE85Mmk0c2QwaDdtLzd2OXpoN3d2WXlqVFpiLzJIRE9jNkN6QXVtc1UrU3dtNEg1ZktHTkJcbmdpNklOaFFMTG95WlZRUmFqVVk4QlZJZWZnUmZKZ0J4T2ZJeXppR1NScUhNNzNoZzExVmVFQ3FtRzdkR1lnQWVcbnd6cXJuTlBBdW85VlY3RVJWVURsY0tGQ1VzejREYS90RUI4U01HS1BBb0dBZnVzcVBzcE1mN2Jrd244L0ZVV0dcbnpiTDVUS2llNFZpRDZ4NUxWdXl0MkNCZnFsdlovbkdsUzhVUUk1blo1V3pwMFVzYTcyU1M4Mnk3WXZpMVZaa3pcbkltYWgzVDdkSzJobVNOZjZqNmZYSEpjZ0VxVXozMnFpYnBYYkJ0SGh1d1Vhc25mdEJUWHo0QjVqSW5rcmNvV1dcbjlSaTJ6UTZvc1FyQWhjTzdaVVZiQVlJPVxuLS0tLS1FTkQgUFJJVkFURSBLRVktLS0tLVxuIiwNCiAgImNsaWVudF9lbWFpbCI6ICJmaXJlYmFzZS1hZG1pbnNkay1mYnN2Y0BzdXBlcmZhc3QtOWZiMzUuaWFtLmdzZXJ2aWNlYWNjb3VudC5jb20iLA0KICAiY2xpZW50X2lkIjogIjEwODA2MzkyNDUwMjA2MTk3OTgzNCIsDQogICJhdXRoX3VyaSI6ICJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20vby9vYXV0aDIvYXV0aCIsDQogICJ0b2tlbl91cmkiOiAiaHR0pHM6Ly9vYXV0aDIuZ29vZ2xlYXBpcy5jb20vdG9rZW4iLA0KICAiYXV0aF9wcm92aWRlcl94NTA5X2NlcnRfdXJsIjogImh0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL29hdXRoMi92MS9jZXJ0cyIsDQogICJjbGllbnRfeDUwOV9jZXJ0X3VybCI6ICJodHRwczovL3d3dy5nb29nbGVhcGlzLmNvbS9yb2JvdC92MS9tZXRhZGF0YS94NTA5L2ZpcmViYXNlLWFkbWluc2RrLWZic3ZjJTQwc3VwZXJmYXN0LTlmYjM1LmlhbS5nc2VydmljZWFjY291bnQuY29tIiwNCiAgInVuaXZlcnNlX2RvbWFpbiI6ICJnb29nbGVhcGlzLmNvbSINCn0=";

const getServiceAccountFromEnv = () => {
    if (cachedServiceAccount) return cachedServiceAccount;

    const rawJson = sanitizeString(config.firebaseServiceAccount || process.env.FIREBASE_SERVICE_ACCOUNT);
    if (rawJson) {
        try {
            cachedServiceAccount = JSON.parse(rawJson);
            return cachedServiceAccount;
        } catch (_) {}
    }

    const candidatePaths = [
        config.firebaseServiceAccountPath || process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
        'config/firebase-service-account.json',
        './config/firebase-service-account.json',
        '../config/firebase-service-account.json',
        'src/config/firebase-service-account.json'
    ].filter(Boolean);

    for (const pathValue of candidatePaths) {
        const filePath = resolve(process.cwd(), pathValue);
        if (existsSync(filePath)) {
            try {
                cachedServiceAccount = JSON.parse(readFileSync(filePath, 'utf8'));
                return cachedServiceAccount;
            } catch (_) {}
        }
    }

    try {
        const decoded = Buffer.from(DEFAULT_SERVICE_ACCOUNT_B64, 'base64').toString('utf8');
        cachedServiceAccount = JSON.parse(decoded);
        return cachedServiceAccount;
    } catch (_) {}

    throw new Error('Firebase service account is not configured. Set FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_PATH.');
};

const getFirebaseProjectId = () => {
    const account = getServiceAccountFromEnv();
    const projectId =
        sanitizeString(config.firebaseProjectId) ||
        sanitizeString(account.project_id) ||
        sanitizeString(process.env.FIREBASE_PROJECT_ID);
    if (!projectId) {
        throw new Error('Firebase project ID is not configured.');
    }
    return projectId;
};

const getFirebaseAccessToken = async () => {
    const now = Date.now();
    if (cachedAccessToken && cachedAccessTokenExpiryMs - now > 60_000) {
        return cachedAccessToken;
    }

    const account = getServiceAccountFromEnv();
    const privateKey = normalizePrivateKey(account.private_key);
    if (!account.client_email || !privateKey) {
        throw new Error('Firebase service account is missing client_email or private_key.');
    }

    const iat = Math.floor(now / 1000);
    const exp = iat + 3600;
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
        iss: account.client_email,
        scope: FIREBASE_MESSAGING_SCOPE,
        aud: OAUTH_TOKEN_URL,
        iat,
        exp
    };

    const jwtUnsigned = `${toBase64Url(header)}.${toBase64Url(payload)}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(jwtUnsigned);
    signer.end();
    const signature = signer.sign(privateKey, 'base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    const assertion = `${jwtUnsigned}.${signature}`;

    const body = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion
    });

    const response = await fetch(OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Firebase OAuth token exchange failed (${response.status}): ${text}`);
    }

    const json = await response.json();
    cachedAccessToken = json.access_token;
    cachedAccessTokenExpiryMs = now + ((Number(json.expires_in) || 3600) * 1000);
    return cachedAccessToken;
};

const normalizeDataMap = (data = {}) => {
    const result = {};
    for (const [key, value] of Object.entries(data || {})) {
        if (value === undefined || value === null) continue;
        result[String(key)] = String(value);
    }
    return result;
};

const getSoundForRole = (role, customSound) => {
    const r = String(role || '').toUpperCase();
    if (r === 'ADMIN') {
        return 'universfield-new-notification-036-485897.mp3';
    }
    return 'zomato_sms.mp3';
};

const buildMessagePayload = (payload = {}, token) => {
    const role = String(payload.role || payload.data?.role || '').toUpperCase();
    const soundFile = getSoundForRole(role, payload.sound);

    const title = sanitizeString(payload.title || payload.notification?.title || 'New notification');
    const body = sanitizeString(payload.body || payload.notification?.body || '');
    const notification = { title, body };

    const clickAction = sanitizeString(
        payload.data?.click_action || payload.data?.link || payload.link || '/'
    );

    const data = normalizeDataMap({
        ...(payload.data || {}),
        orderId: payload.data?.orderId || payload.orderId || '',
        role: role.toLowerCase() || 'user',
        sound: soundFile,
        click_action: clickAction,
        link: clickAction,
        android_channel_id: 'high_importance_channel'
    });

    const image = sanitizeString(
        payload.icon || payload.notification?.image || payload.notification?.icon || data.image || data.imageUrl
    );

    const message = { token };

    if (!payload.dataOnly) {
        message.notification = notification;
        if (image) {
            message.notification.image = image;
        }
    }

    if (Object.keys(data).length > 0) {
        message.data = data;
    }

    const defaultBrandIcon = 'https://i.ibb.co/3m2Yh7r/SUPERFAST-Brand-Image.png';
    const finalIcon = image || payload.icon || defaultBrandIcon;

    const isUserRole = role === 'USER';

    message.android = {
        priority: 'HIGH',
        notification: {
            title,
            body,
            channel_id: isUserRole ? 'default' : 'high_importance_channel',
            ...(isUserRole
                ? { default_sound: false, default_vibrate_timings: false }
                : {
                    sound: 'default',
                    default_sound: true,
                    default_vibrate_timings: true,
                    default_light_settings: true,
                    notification_priority: 'PRIORITY_MAX',
                }),
            visibility: 'PUBLIC',
            click_action: 'FLUTTER_NOTIFICATION_CLICK'
        }
    };

    message.apns = {
        headers: {
            'apns-priority': '10',
            'apns-push-type': 'alert'
        },
        payload: {
            aps: {
                alert: { title, body },
                ...(isUserRole ? {} : { sound: soundFile || 'default' }),
                contentAvailable: true
            }
        }
    };

    message.webpush = {
        headers: {
            Urgency: 'high'
        },
        notification: {
            title,
            body,
            icon: finalIcon,
            badge: defaultBrandIcon,
            ...(isUserRole ? {} : { sound: soundFile, requireInteraction: true }),
            data: data
        },
        fcm_options: {
            link: clickAction
        }
    };

    return message;
};

const parseFirebaseError = async (response) => {
    try {
        return await response.json();
    } catch {
        try {
            const text = await response.text();
            return { error: { message: text } };
        } catch {
            return { error: { message: 'Unknown Firebase error' } };
        }
    }
};

const shouldRemoveTokenFromError = (errorJson, response) => {
    const status = response?.status;
    const message = String(errorJson?.error?.message || '').toUpperCase();
    const errorStatus = String(errorJson?.error?.status || '').toUpperCase();
    if (status === 404 || errorStatus === 'NOT_FOUND' || message.includes('UNREGISTERED')) {
        return true;
    }
    // INVALID_ARGUMENT often means a bad payload, not a dead token. Only drop the
    // token when FCM explicitly says the registration token itself is invalid.
    return (
        message.includes('REGISTRATION-TOKEN-NOT-VALID') ||
        message.includes('NOT A VALID FCM REGISTRATION TOKEN') ||
        (message.includes('INVALID_ARGUMENT') && message.includes('TOKEN') && message.includes('REGISTRATION'))
    );
};

const getOwnerModel = (ownerType) => OWNER_MODELS[String(ownerType || '').toUpperCase()] || null;

const getTokenFieldForPlatform = (platform) => OWNER_TOKEN_FIELDS[platform === 'mobile' ? 'mobile' : 'web'];

const normalizeTokenList = (tokens = []) => {
    const normalized = [...new Set((Array.isArray(tokens) ? tokens : [tokens]).map(sanitizeString).filter((t) => Boolean(t) && !t.startsWith('eyJ')))];
    return normalized.slice(-10);
};

const readTokensFromDoc = (doc, platform) => {
    if (!doc) return [];
    if (platform) {
        return normalizeTokenList(doc[getTokenFieldForPlatform(platform)] || []);
    }
    return normalizeTokenList([
        ...(Array.isArray(doc.fcmTokens) ? doc.fcmTokens : []),
        ...(Array.isArray(doc.fcmTokenMobile) ? doc.fcmTokenMobile : [])
    ]);
};

export const listOwnerTokens = async ({ ownerType, ownerId, platform }) => {
    if (!ownerType || !ownerId) return [];
    const model = getOwnerModel(ownerType);
    if (!model) return [];
    const doc = await model.findById(ownerId).select('fcmTokens fcmTokenMobile').lean();
    return readTokensFromDoc(doc, platform);
};

export const upsertFirebaseDeviceToken = async ({ ownerType, ownerId, token, platform = 'web' }) => {
    const normalizedToken = sanitizeString(token);
    console.log(`[FCM-DEBUG] upsertFirebaseDeviceToken: ownerType=${ownerType}, ownerId=${ownerId}, platform=${platform}, tokenPreview=${normalizedToken?.slice(0, 10)}...`);

    if (!ownerType || !ownerId || !normalizedToken) {
        console.error('[FCM-DEBUG] upsert - Missing required fields');
        throw new Error('ownerType, ownerId, and token are required.');
    }

    if (normalizedToken.startsWith('eyJ')) {
        console.warn(`[FCM-DEBUG] upsert - Ignored invalid JWT token passed as FCM device token`);
        return { success: false, message: 'Invalid FCM token format' };
    }

    const normalizedPlatform = platform === 'mobile' ? 'mobile' : 'web';
    const model = getOwnerModel(ownerType);
    if (!model) {
        console.error(`[FCM-DEBUG] upsert - Unsupported owner type: ${ownerType}`);
        throw new Error(`Unsupported owner type: ${ownerType}`);
    }

    const doc = await model.findById(ownerId);
    if (!doc) {
        console.error(`[FCM-DEBUG] upsert - Owner profile not found for id ${ownerId}`);
        throw new Error('Owner profile not found.');
    }

    const field = getTokenFieldForPlatform(normalizedPlatform);
    const existingTokens = Array.isArray(doc[field]) ? doc[field] : [];
    console.log(`[FCM-DEBUG] upsert - Current tokens in DB count: ${existingTokens.length}`);

    const tokens = normalizeTokenList([...existingTokens, normalizedToken]);
    doc[field] = tokens;
    doc.markModified(field);

    await doc.save();
    await model.updateOne({ _id: ownerId }, { $set: { [field]: tokens } });
    console.log(`[FCM-DEBUG] upsert - Token list updated in DB. New count: ${tokens.length}`);
    return { success: true };
};

export const removeFirebaseDeviceToken = async ({ ownerType, ownerId, token, platform }) => {
    const normalizedToken = sanitizeString(token);
    if (!ownerType || !ownerId || !normalizedToken) {
        throw new Error('ownerType, ownerId, and token are required.');
    }
    const model = getOwnerModel(ownerType);
    if (!model) {
        throw new Error(`Unsupported owner type: ${ownerType}`);
    }
    const doc = await model.findById(ownerId);
    if (!doc) {
        return { success: false };
    }

    if (platform) {
        const field = getTokenFieldForPlatform(platform);
        doc[field] = normalizeTokenList((Array.isArray(doc[field]) ? doc[field] : []).filter((t) => t !== normalizedToken));
    } else {
        doc.fcmTokens = normalizeTokenList((Array.isArray(doc.fcmTokens) ? doc.fcmTokens : []).filter((t) => t !== normalizedToken));
        doc.fcmTokenMobile = normalizeTokenList(
            (Array.isArray(doc.fcmTokenMobile) ? doc.fcmTokenMobile : []).filter((t) => t !== normalizedToken)
        );
    }

    await doc.save();
    return { success: true };
};

export const sendPushNotification = async (tokens, payload = {}) => {
    const projectId = getFirebaseProjectId();
    const accessToken = await getFirebaseAccessToken();
    const uniqueTokens = normalizeTokenList(tokens);

    if (uniqueTokens.length === 0) {
        return { successCount: 0, failureCount: 0, results: [] };
    }

    const results = await Promise.all(
        uniqueTokens.map(async (token) => {
            const message = buildMessagePayload(payload, token);
            try {
                const response = await fetch(FCM_SEND_URL(projectId), {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ message })
                });

                if (!response.ok) {
                    const errorJson = await parseFirebaseError(response);
                    return {
                        token,
                        ok: false,
                        remove: shouldRemoveTokenFromError(errorJson, response),
                        error: errorJson?.error?.message || `FCM send failed (${response.status})`
                    };
                }

                return {
                    token,
                    ok: true,
                    response: await response.json()
                };
            } catch (error) {
                return {
                    token,
                    ok: false,
                    remove: false,
                    error: error?.message || String(error)
                };
            }
        })
    );

    const successCount = results.filter((result) => result.ok).length;
    const failureCount = results.length - successCount;
    return { successCount, failureCount, results };
};

export const sendNotificationToOwner = async ({ ownerType, ownerId, payload, platform } = {}) => {
    // 💡 Clone the payload to avoid side-effects (e.g. adding multiple prefixes to the same object during broadcasting)
    const enrichedPayload = { ...payload, role: ownerType };

    // 🏷️ Add Highlighter Prefix to the Title
    if (enrichedPayload && !enrichedPayload.skipHighlighter) {
        const typeKey = String(ownerType || '').toUpperCase();
        const prefix = OWNER_APP_PREFIXES[typeKey] || '';

        if (prefix) {
            // Get original title from any potential field
            let originalTitle = enrichedPayload.title || enrichedPayload.notification?.title || 'New notification';

            // Safety: Ensure we don't ADD the prefix if it's already there (defensive check)
            if (!originalTitle.includes(prefix)) {
                enrichedPayload.title = `${prefix} ${originalTitle}`.trim();
            } else {
                enrichedPayload.title = originalTitle;
            }
        }
    }

    const tokens = await listOwnerTokens({ ownerType, ownerId, platform });
    if (!tokens.length) {
        return { successCount: 0, failureCount: 0, results: [] };
    }
    try {
        console.log(`[FCM] Sending to ${ownerType}:${ownerId}. Title: "${enrichedPayload.title || 'Data Only'}"`);
        const response = await sendPushNotification(tokens, enrichedPayload);
        const invalidTokens = (response.results || [])

            .filter((item) => !item.ok && item.remove)
            .map((item) => item.token)
            .filter(Boolean);
        if (invalidTokens.length > 0) {
            const model = getOwnerModel(ownerType);
            const doc = model ? await model.findById(ownerId) : null;
            if (doc) {
                const fieldNames = platform
                    ? [getTokenFieldForPlatform(platform)]
                    : [OWNER_TOKEN_FIELDS.web, OWNER_TOKEN_FIELDS.mobile];
                for (const field of fieldNames) {
                    doc[field] = normalizeTokenList((Array.isArray(doc[field]) ? doc[field] : []).filter((t) => !invalidTokens.includes(t)));
                }
                await doc.save();
            }
        }
        logger.info(
            `FCM push sent to ${ownerType}:${ownerId} (${platform || 'all'}). Success=${response.successCount}, Failure=${response.failureCount}`
        );
        return response;
    } catch (error) {
        logger.warn(`FCM push failed for ${ownerType}:${ownerId}: ${error.message}`);
        return { successCount: 0, failureCount: tokens.length, error: error.message };
    }
};

export const sendNotificationToOwners = async (targets = [], payload = {}) => {
    // 🔍 Tip #6: Deduplicate targets by ownerType:ownerId before sending
    // This prevents duplicate notifications if the same person is listed twice (e.g. as USER and partner)
    const uniqueTargets = Array.isArray(targets)
        ? [...new Map(targets.filter(t => t?.ownerType && t?.ownerId).map(t => [`${t.ownerType}:${t.ownerId}`, t])).values()]
        : [];

    const results = [];
    for (const target of uniqueTargets) {
        results.push(
            await sendNotificationToOwner({
                ownerType: target.ownerType,
                ownerId: target.ownerId,
                platform: target.platform,
                payload
            })
        );
    }
    return results;
};

export const notifyAdminsSafely = async (payload = {}) => {
    try {
        const admins = await FoodAdmin.find({ isActive: true }).select('_id').lean();
        if (!admins.length) return [];

        const targets = admins.map(a => ({
            ownerType: 'ADMIN',
            ownerId: String(a._id)
        }));

        return await sendNotificationToOwners(targets, payload);
    } catch (e) {
        logger.error(`Error notifying admins: ${e.message}`);
        return [];
    }
};

export const sendTestNotification = async ({ ownerType, ownerId, platform }) => {
    return sendNotificationToOwner({
        ownerType,
        ownerId,
        platform,
        payload: {
            title: 'Test Notification',
            body: 'This is a test notification from Firebase push',
            data: {
                type: 'test',
                link: '/'
            }
        }
    });
};
export const notifyOwnerSafely = async (target = {}, payload = {}) => {
    try {
        return await sendNotificationToOwner({ ...target, payload });
    } catch (error) {
        logger.warn(`FCM individual push failed: ${error.message}`);
        return null;
    }
};

export const notifyOwnersSafely = async (targets = [], payload = {}) => {
    try {
        return await sendNotificationToOwners(targets, payload);
    } catch (error) {
        logger.warn(`FCM broadcast push failed: ${error.message}`);
        return [];
    }
};
