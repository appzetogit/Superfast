import { getPublicGourmetRestaurants } from '../services/gourmet.service.js';
import { getLandingSettings } from '../services/landingSettings.service.js';
import { FoodHeroBanner } from '../models/heroBanner.model.js';
import { FoodUnder250Banner } from '../models/under250Banner.model.js';
import { FoodDiningBanner } from '../models/diningBanner.model.js';
import { FoodExploreIcon } from '../models/exploreIcon.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { buildZoneRestaurantFilter } from '../../restaurant/services/restaurant.service.js';
import { sendResponse } from '../../../../utils/response.js';
import { transformImageFields, toFullUrl } from '../../../../utils/urlHelper.js';

/** Public hero banners for user home: active only, sorted, with linkedRestaurants populated for click-through */
export const getPublicHeroBannersController = async (req, res, next) => {
    try {
        const requestedZoneId =
            typeof req.query?.zoneId === 'string' ? req.query.zoneId.trim() : '';
        const query = { isActive: true };

        if (requestedZoneId) {
            query.$or = [
                { zoneId: requestedZoneId },
                { zoneId: '' },
                { zoneId: null },
                { zoneId: { $exists: false } }
            ];
        }

        const docs = await FoodHeroBanner.find(query)
            .sort({ sortOrder: 1, createdAt: -1 })
            .populate({
                path: 'linkedRestaurantIds',
                select: '_id restaurantName slug area city rating cuisines profileImage pureVegRestaurant',
                model: 'FoodRestaurant'
            })
            .lean();
        const banners = (docs || []).map((b) => {
            const { linkedRestaurantIds, ...rest } = b;
            return {
                ...rest,
                linkedRestaurants: Array.isArray(linkedRestaurantIds) ? linkedRestaurantIds : [],
                imageUrl: b.imageUrl
            };
        });
        return sendResponse(res, 200, 'Hero banners fetched', { banners: transformImageFields(banners) });
    } catch (error) {
        next(error);
    }
};

export const getPublicUnder250BannersController = async (req, res, next) => {
    try {
        const docs = await FoodUnder250Banner.find({ isActive: true }).sort({ sortOrder: 1, createdAt: -1 }).lean();
        return sendResponse(res, 200, 'Under 250 banners fetched', { banners: transformImageFields(docs) });
    } catch (error) {
        next(error);
    }
};

export const getPublicDiningBannersController = async (req, res, next) => {
    try {
        const docs = await FoodDiningBanner.find({ isActive: true }).sort({ sortOrder: 1, createdAt: -1 }).lean();
        return sendResponse(res, 200, 'Dining banners fetched', { banners: transformImageFields(docs) });
    } catch (error) {
        next(error);
    }
};

export const getPublicExploreIconsController = async (req, res, next) => {
    try {
        const docs = await FoodExploreIcon.find({ isActive: true }).sort({ sortOrder: 1, createdAt: -1 }).lean();
        const items = docs.map(({ targetPath, sortOrder, iconUrl, ...rest }) => {
            const fullIconUrl = toFullUrl(iconUrl);
            return { ...rest, iconUrl: fullIconUrl, imageUrl: fullIconUrl, link: targetPath, order: sortOrder };
        });
        return sendResponse(res, 200, 'Explore icons fetched', { items });
    } catch (error) {
        next(error);
    }
};


export const getPublicGourmetController = async (req, res, next) => {
    try {
        const docs = await getPublicGourmetRestaurants();
        const restaurants = (docs || []).map((d) => ({
            ...(d.restaurant || {}),
            _id: d.restaurant?._id || d.restaurantId,
            priority: d.priority
        })).filter((r) => r && r._id);
        return sendResponse(res, 200, 'Gourmet restaurants fetched', { restaurants: transformImageFields(restaurants) });
    } catch (error) {
        next(error);
    }
};

const landingSettingsCacheMap = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const invalidateLandingSettingsCache = () => {
    landingSettingsCacheMap.clear();
};

export const getPublicLandingSettingsController = async (req, res, next) => {
    try {
        const activeZoneId = req.query.zoneId || req.query.zone_id || '';
        const cacheKey = activeZoneId ? String(activeZoneId) : 'global';
        const now = Date.now();
        const cached = landingSettingsCacheMap.get(cacheKey);
        if (cached && now - cached.lastFetched < CACHE_TTL) {
            return sendResponse(res, 200, 'Landing settings fetched', transformImageFields(cached.data));
        }

        const settings = await getLandingSettings();
        const ids = settings?.recommendedRestaurantIds || [];
        let recommendedRestaurants = [];

        // Build strict zone filter if zoneId was passed
        let zoneFilter = null;
        if (activeZoneId) {
            zoneFilter = await buildZoneRestaurantFilter(activeZoneId);
        }

        if (Array.isArray(ids) && ids.length > 0) {
            const queryFilter = {
                _id: { $in: ids },
                status: 'approved'
            };
            if (zoneFilter) {
                queryFilter.$and = [zoneFilter];
            }
            recommendedRestaurants = await FoodRestaurant.find(queryFilter)
                .select('restaurantName area city profileImage coverImages menuImages slug rating cuisines pureVegRestaurant')
                .lean();
        }

        // STRICT ZONE FALLBACK: If no configured recommendations exist in the requested active zone,
        // strictly show recommended/top restaurants belonging ONLY to the active zone.
        if (recommendedRestaurants.length === 0 && zoneFilter) {
            recommendedRestaurants = await FoodRestaurant.find({
                status: 'approved',
                $and: [zoneFilter]
            })
                .select('restaurantName area city profileImage coverImages menuImages slug rating cuisines pureVegRestaurant')
                .sort({ rating: -1, totalRatings: -1 })
                .limit(12)
                .lean();
        }

        const payload = {
            ...settings,
            headerVideoPublicId: undefined,
            recommendedRestaurantIds: undefined,
            recommendedRestaurants
        };

        landingSettingsCacheMap.set(cacheKey, {
            data: payload,
            lastFetched: now
        });

        return sendResponse(res, 200, 'Landing settings fetched', transformImageFields(payload));
    } catch (error) {
        next(error);
    }
};

