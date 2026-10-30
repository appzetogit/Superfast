import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodCategory } from '../../admin/models/category.model.js';
import { FoodItem } from '../../admin/models/food.model.js';
import { FoodRestaurant } from '../models/restaurant.model.js';
import { getDeveloperModeFilter } from '../../../common/utils/developerMode.js';
import {
    backfillLegacyCategoryWorkflow,
    GLOBAL_CATEGORY_FILTER,
    normalizeCategoryFoodTypeScope,
    serializeCategoryForResponse,
    toObjectId
} from '../../shared/categoryWorkflow.js';

const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const APPROVED_CATEGORY_FILTER = [
    { approvalStatus: 'approved' },
    { approvalStatus: { $exists: false }, isApproved: { $ne: false } }
];

const getRestaurantContext = async (restaurantId) => {
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(String(restaurantId))) {
        throw new ValidationError('Invalid restaurant id');
    }

    const restaurant = await FoodRestaurant.findById(restaurantId)
        .select('zoneId pureVegRestaurant')
        .lean();
    if (!restaurant?._id) {
        throw new ValidationError('Restaurant not found');
    }

    return {
        restaurantId: toObjectId(restaurantId),
        zoneId: restaurant.zoneId ? String(restaurant.zoneId) : '',
        pureVegRestaurant: restaurant.pureVegRestaurant === true
    };
};

const applyZoneVisibilityFilter = (filterAndList, zoneIdRaw) => {
    if (zoneIdRaw && mongoose.Types.ObjectId.isValid(zoneIdRaw)) {
        filterAndList.push({
            $or: [
                { zoneId: new mongoose.Types.ObjectId(zoneIdRaw) },
                { zoneId: { $exists: false } },
                { zoneId: null }
            ]
        });
        return;
    }

    filterAndList.push({
        $or: [{ zoneId: { $exists: false } }, { zoneId: null }]
    });
};

export async function listRestaurantCategories(restaurantId, query = {}) {
    const context = await getRestaurantContext(restaurantId);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 1000, 1), 1000);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;

    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const includeInactive = query.includeInactive === 'true' || query.includeInactive === '1';
    const withCounts = query.withCounts === 'true' || query.withCounts === '1';
    const compact = query.compact === 'true' || query.compact === '1';
    const zoneIdRaw = typeof query.zoneId === 'string' ? query.zoneId.trim() : context.zoneId;

    const filter = {};
    if (!includeInactive) filter.isActive = true;

    // Restaurants see exactly the admin-created categories (global/zone, approved, active) and
    // nothing else. Items that were filed under old restaurant-owned categories were moved to the
    // matching admin category.
    const visibilityFilter = {
        $and: [
            { $or: GLOBAL_CATEGORY_FILTER },
            { $or: APPROVED_CATEGORY_FILTER }
        ]
    };

    filter.$and = [visibilityFilter];
    if (search) {
        const term = escapeRegex(search.slice(0, 80));
        filter.$and.push({ name: { $regex: term, $options: 'i' } });
    }
    applyZoneVisibilityFilter(filter.$and, zoneIdRaw);

    if (compact && context.pureVegRestaurant) {
        filter.$and.push({ foodTypeScope: { $in: ['Veg', 'Both', null, ''] } });
    }

    const queryBuilder = FoodCategory.find(filter)
        .sort({ name: 1 })
        .collation({ locale: 'en', strength: 2 })
        .skip(skip)
        .limit(limit)
        .select(
            compact
                ? 'name image type foodTypeScope approvalStatus rejectionReason zoneId restaurantId createdByRestaurantId isActive sortOrder requestedAt approvedAt rejectedAt globalizedAt'
                : 'name image type foodTypeScope approvalStatus rejectionReason zoneId restaurantId createdByRestaurantId isActive sortOrder requestedAt approvedAt rejectedAt globalizedAt createdAt updatedAt'
        );

    const [list, total] = await Promise.all([
        queryBuilder.lean(),
        FoodCategory.countDocuments(filter)
    ]);

    const statsById = await backfillLegacyCategoryWorkflow(list);
    const restaurantIds = !compact
        ? Array.from(
            new Set(
                list
                    .flatMap((category) => [category?.restaurantId, category?.createdByRestaurantId])
                    .map((value) => (value ? String(value) : ''))
                    .filter(Boolean)
            )
        )
        : [];
    const restaurants = restaurantIds.length
        ? await FoodRestaurant.find({ _id: { $in: restaurantIds } })
            .select('restaurantName ownerName ownerPhone')
            .lean()
        : [];
    const restaurantMap = new Map(restaurants.map((restaurant) => [String(restaurant._id), restaurant]));

    const hydratedList = !compact
        ? list.map((category) => ({
            ...category,
            restaurantId: category?.restaurantId ? restaurantMap.get(String(category.restaurantId)) || category.restaurantId : category.restaurantId,
            createdByRestaurantId: category?.createdByRestaurantId ? restaurantMap.get(String(category.createdByRestaurantId)) || category.createdByRestaurantId : category.createdByRestaurantId
        }))
        : list;

    const categories = hydratedList.map((category) =>
        serializeCategoryForResponse(category, {
            currentRestaurantId: restaurantId,
            includeCounts: withCounts || !compact,
            statsById
        })
    );

    return { categories, total, page, limit };
}

let publicCategoriesCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function invalidatePublicCategoriesCache() {
    publicCategoriesCache.clear();
}

export async function listPublicCategories(query = {}) {
    const devFilter = await getDeveloperModeFilter();
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 1000, 1), 1000);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;

    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const zoneIdRaw = typeof query.zoneId === 'string' ? query.zoneId.trim() : '';

    const cacheKey = JSON.stringify({
        limit,
        page,
        skip,
        search,
        zoneIdRaw,
        devMode: devFilter.isDevMode,
        devCatIds: devFilter.demoLandingCategoryIds
    });
    const now = Date.now();
    const cached = publicCategoriesCache.get(cacheKey);
    if (cached && now - cached.lastFetched < CACHE_TTL_MS) {
        return cached.data;
    }

    const filter = {
        isActive: true,
        $and: [{ $or: GLOBAL_CATEGORY_FILTER }, { $or: APPROVED_CATEGORY_FILTER }]
    };

    // Customers only see categories that actually have items to show: approved items of approved
    // restaurants in their zone (restaurants without a zone count for every zone).
    const itemFilter = { approvalStatus: 'approved', categoryId: { $ne: null } };
    if (zoneIdRaw && mongoose.Types.ObjectId.isValid(zoneIdRaw)) {
        const zoneRestaurantIds = await FoodRestaurant.distinct('_id', {
            status: 'approved',
            $or: [
                { zoneId: new mongoose.Types.ObjectId(zoneIdRaw) },
                { zoneId: { $exists: false } },
                { zoneId: null }
            ]
        });
        itemFilter.restaurantId = { $in: zoneRestaurantIds };
    }
    const itemCountRows = await FoodItem.aggregate([
        { $match: itemFilter },
        { $group: { _id: '$categoryId', count: { $sum: 1 } } }
    ]);
    const approvedCategoryIds = itemCountRows.map((row) => row._id);

    let visibleCategoryIds = approvedCategoryIds;
    if (devFilter.isDevMode && Array.isArray(devFilter.demoLandingCategoryIds) && devFilter.demoLandingCategoryIds.length > 0) {
        const demoIds = new Set(
            devFilter.demoLandingCategoryIds
                .filter(id => mongoose.Types.ObjectId.isValid(id))
                .map(id => String(id))
        );
        if (demoIds.size > 0) {
            visibleCategoryIds = approvedCategoryIds.filter(id => demoIds.has(String(id)));
        }
    }

    // A category with only one or two items in the zone reads like a dish, not a category, so it
    // stays off the browse list. When that would leave a thin list (new/small zones) show them all.
    if (!search) {
        const MIN_ITEMS_PER_CATEGORY = 3;
        const MIN_CATEGORIES_AFTER_FILTER = 8;
        const itemCountById = new Map(itemCountRows.map((row) => [String(row._id), row.count]));
        const wellStocked = visibleCategoryIds.filter((id) => (itemCountById.get(String(id)) || 0) >= MIN_ITEMS_PER_CATEGORY);
        if (wellStocked.length >= MIN_CATEGORIES_AFTER_FILTER) visibleCategoryIds = wellStocked;
    }

    if (!visibleCategoryIds.length) {
        const result = { categories: [], total: 0, page, limit };
        publicCategoriesCache.set(cacheKey, { data: result, lastFetched: now });
        return result;
    }
    filter._id = { $in: visibleCategoryIds };

    if (search) {
        const term = escapeRegex(search.slice(0, 80));
        filter.$and.push({ name: { $regex: term, $options: 'i' } });
    }
    applyZoneVisibilityFilter(filter.$and, zoneIdRaw);

    const [list, total] = await Promise.all([
        FoodCategory.find(filter)
            .sort({ name: 1 })
            .collation({ locale: 'en', strength: 2 })
            .skip(skip)
            .limit(limit)
            .select('name image type foodTypeScope zoneId sortOrder createdAt updatedAt')
            .lean(),
        FoodCategory.countDocuments(filter)
    ]);

    await backfillLegacyCategoryWorkflow(list);

    // `list` is already A-Z (case-insensitive collation), the same order admin and restaurants see.
    const categories = list.map((category) => serializeCategoryForResponse(category));

    const result = { categories, total, page, limit };
    publicCategoriesCache.set(cacheKey, { data: result, lastFetched: now });
    return result;
}

const ADMIN_ONLY_CATEGORY_MESSAGE =
    'Categories are managed by admin. Please choose one of the available categories.';

export async function createRestaurantCategory(restaurantId) {
    await getRestaurantContext(restaurantId);
    throw new ValidationError(ADMIN_ONLY_CATEGORY_MESSAGE);
}

export async function updateRestaurantCategory(restaurantId) {
    await getRestaurantContext(restaurantId);
    throw new ValidationError(ADMIN_ONLY_CATEGORY_MESSAGE);
}

export async function deleteRestaurantCategory(restaurantId, id) {
    const context = await getRestaurantContext(restaurantId);
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('Invalid category id');
    }

    const category = await FoodCategory.findOne({ _id: id, restaurantId: context.restaurantId }).select('_id').lean();
    if (!category?._id) return null;

    const inUse = await FoodItem.countDocuments({ categoryId: id, restaurantId: context.restaurantId });
    if (inUse > 0) {
        throw new ValidationError('Cannot delete category while it has items');
    }

    const deleted = await FoodCategory.findOneAndDelete({ _id: id, restaurantId: context.restaurantId }).lean();
    return deleted ? { id } : null;
}
