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

const DEFAULT_SERVICE_ACCOUNT_B64 = "ewogICJ0eXBlIjogInNlcnZpY2VfYWNjb3VudCIsCiAgInByb2plY3RfaWQiOiAic3VwZXJmYXN0LTFjMGQyIiwKICAicHJpdmF0ZV9rZXlfaWQiOiAiMGJkYWFlZGQxMjNmNDUzNzY2YzE1MGY5ZTA5NDllMjczMzM4Mjk4NyIsCiAgInByaXZhdGVfa2V5IjogIi0tLS0tQkVHSU4gUFJJVkFURSBLRVktLS0tLVxuTUlJRXZnSUJBREFOQmdrcWhraUc5dzBCQVFFRkFBU0NCS2d3Z2dTa0FnRUFBb0lCQVFDZWtVcXQ2SVVZemFpdFxuUE90OENsbDdsM0JpbHRqS0pDdjg1Tytmd1lweWhjOXV2Z1BvSXJWUnRGbk9xTTAvaHI5K0pkK2tRZnIvU0tVcVxuN244SXp0VmJWVjBKTHI4ZWI5cnFrYmRmbS9ibTAwbXoxaVU3NUdTMGM3dFJ2L2E4RHdLSXNkVE1YU3NGZURJOVxuTFJTZVlaZnN2QWo3Ym5qUVBCWjBNbGNyWDJrWkpyaS91NVByLzhhMlBlQlE3TzVzak5TeElWZEdmaU5IcFF4SFxuTXNGd01UMnlWdkFib2Y3cW44OEg4RjNtQnM0VFo2NjlaT2p2UDlwSER0RnJqUCtpdzdza2ZuN2xxK0tMUHZwRlxuUi9QVEtKSEp4YjJabVA5YXFnTmtZNEdmejhwWWw1UnQ2OHhRVFZ3bkRsTGJwVDUvWnRscVd2NEk2STRoZFhRd1xuYzRENUV3SFRBZ01CQUFFQ2dnRUFCZkNkWW94ZVNBS1VPZ0VaTlNsU0ZzNGllSjc3K2Y2RzQwOVVKcURpWmMzYlxuYW1PVjArRlE5NEdSQjZ2TkhIOFl0MG9GNmFwTEU3c043T0RJUTNVMEN0clV4RjVLN0lIMkttbFEvRFRrZDlzY1xuWEs4OTc5TnJibE1UaGtseG5iUFdQWGFqNlEvb1o2a01BTHlxbEJCRjE2bG5rTHVmclBWRFJoRUlzT2cvRUtFU1xubkNmL0VIVjV1LzkzcFFlNUR5L0dseE9lbFhaaVZHSDQ5N1FYZHNNOWpZQ3I3RlNyMnpscEZPbUJucTJIbm0zZFxuRno5THovTlVoY3AxZHZTWnZXdnNacHkwTTJscFRnR0hNeHQwYnREYjJZUnpMZ3dFQldVUXVjYnQ0aTF1eVpZR1xuUnBuWUlFSGtEYm4xM1dUZVI2eTRqV1dDSmJIVSsrY3NNc09NQk9wSWtRS0JnUURManc3OVhBaFg2b256R1h3elxuc2RTTmxoWTRtazg3SHR5eERkQ2RSOGhJUStlR3BBSld2akE4MlhGOVFpY3pZYUozWm41ams0S2dYbHlJVDcvR1xuWThVQ0RLM3lUSllCM3RZUG9UdWttb2lqcDM0aTNMajN0c0tHSitrb0hQc3k5eDN1M1RReks3a0J6Y1M3V2thNVxubytvd3U0a1ZhY084S3lzTERUSW5PODNPU3dLQmdRREhhd0dOQnBQVC85SCs1RXNUZW9DZCs5ZS9KWFh3OFdGTFxuVGJZUkZ5KisvK0RTS1QvcFFOaW1lMlFGMlFvRG1mSGxreUhaSzl4MXdGZlp6VVkzZUpkTWZCNUJURVlWU2pMR1xuZnFZUHl1VVp5V2VMZGllcE9nM1p2eEdXTUdzcnc5UDNDM0JOSFVkQ2dsOEMzNm5YU0tvMFRDcm5qc1pHUWpBZlxuVVBTRllobkZtUUtCZ1FEQ0kyYUFiTTNvUzEvVjRuQjZQUmdqRVFtUVlscytYMmpMMUFrcWQ5T2tXRjd3SW11NFxubnhzU2JhKzNidWhFTU5IcVhtNGNPZ3RUTjZ1NHRaYUpkNDNsTG9LWG5FTlU5Vm5pL2pzTCtmWm5YczhHSU15b1xuTkQzQ0JUNXhhM0tJWVBiRFlXVHZpTHVoNU1YRWlZejZjRUppeC9rdDJ2azY5VkRQOFgzcnZUWERrUUtCZ0RaUFxudlc5a1FEUzM4c0NCK3JTR1k2c2pZUUlOT003elhyVThwLzZGbHpqWWhhbVhWSEc1bUlmWENVblNiN2pGWDYxUFxuNGlNY29BRnQ3ajlDZWdJM2xMVmZCSHB5UkpBZDBqQmZZK2pmTUlCU2F5SC9meFBHM09qVjhmcyttcUdqeHdIOFxubW94V0VnZGFMSGhDNUNYZkE0UVV6b2FjU3dIdG10K2NrOHdVQ01MWkFvR0JBSk1OUUc5TEdhcVFkSzhEbklJSFxuSWpMUnBONUlkZlF2VzZDcm5YVlNETXNkWThHWFhrQmlPcTI1RCtPRjFyVUoranZMQm5Yd3UxdGEwTVNYRGdrelxuRkhQWXlOaElBOWZYNFVLODdSYVdtQ3NCL3IraFEveGlLL25EMnhsRDcwdVRUOEVFM0p2WkRKSE84WHNwZDdTVFxueGhUSlZzSXlodTdDd0d5UnhwSlpkU1ptXG4tLS0tLUVORCBQUklWQVRFIEtFWS0tLS0tXG4iLAogICJjbGllbnRfZW1haWwiOiAiZmlyZWJhc2UtYWRtaW5zZGstZmJzdmNAc3VwZXJmYXN0LTFjMGQyLmlhbS5nc2VydmljZWFjY291bnQuY29tIiwKICAiY2xpZW50X2lkIjogIjEwMjgzMjg2NjI5OTIxNDczODEzNCIsCiAgImF1dGhfdXJpIjogImh0dHBzOi8vYWNjb3VudHMuZ29vZ2xlLmNvbS9vL29hdXRoMi9hdXRoIiwKICAidG9rZW5fdXJpIjogImh0dHBzOi8vb2F1dGgyLmdvb2dsZWFwaXMuY29tL3Rva2VuIiwKICAiYXV0aF9wcm92aWRlcl94NTA5X2NlcnRfdXJsIjogImh0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL29hdXRoMi92MS9jZXJ0cyIsCiAgImNsaWVudF94NTA5X2NlcnRfdXJsIjogImh0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL3JvYm90L3YxL21ldGFkYXRhL3g1MDkvZmlyZWJhc2UtYWRtaW5zZGstZmJzdmMlNDBzdXBlcmZhc3QtMWMwZDIuaWFtLmdzZXJ2aWNlYWNjb3VudC5jb20iLAogICJ1bml2ZXJzZV9kb21haW4iOiAiZ29vZ2xlYXBpcy5jb20iCn0=";

const getServiceAccountFromEnv = () => {
    if (cachedServiceAccount) return cachedServiceAccount;

    let rawJson = sanitizeString(config.firebaseServiceAccount || process.env.FIREBASE_SERVICE_ACCOUNT);
    if (rawJson.startsWith("'") && rawJson.endsWith("'")) {
        rawJson = rawJson.slice(1, -1).trim();
    } else if (rawJson.startsWith('"') && rawJson.endsWith('"')) {
        rawJson = rawJson.slice(1, -1).trim();
    }

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
        title,
        body,
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

    const isTest = payload.data?.type === 'test' || payload.type === 'test' || String(payload.data?.isTest) === 'true' || title.toLowerCase().includes('test');

    message.android = {
        priority: 'HIGH',
        ttl: '86400s',
        notification: {
            title,
            body,
            channel_id: 'high_importance_channel',
            ...(isTest
                ? { default_sound: false, default_vibrate_timings: false }
                : {
                    sound: 'default',
                    default_sound: true,
                    default_vibrate_timings: true,
                    default_light_settings: true,
                    notification_priority: 'PRIORITY_MAX',
                }),
            visibility: 'PUBLIC',
            ticker: title,
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
                ...(isTest ? {} : { sound: soundFile || 'default' }),
                badge: 1,
                'content-available': 1,
                'mutable-content': 1
            },
            ...data
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
            requireInteraction: true,
            ...(isTest ? {} : { sound: soundFile || 'default' }),
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
    if (status === 404 || status === 401 || errorStatus === 'NOT_FOUND' || message.includes('UNREGISTERED') || message.includes('MISMATCH') || message.includes('SENDER')) {
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
