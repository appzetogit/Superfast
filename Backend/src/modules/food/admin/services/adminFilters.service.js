import mongoose from 'mongoose';
import { FoodZone } from '../models/zone.model.js';
import { FoodCategory } from '../models/category.model.js';
import { FoodItem } from '../models/food.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';

/**
 * Shared filter helpers for admin lists/reports (zone, restaurant, category, date range).
 * Every report resolves its filters here so they behave the same on every page.
 */

export const REPORT_TIMEZONE = 'Asia/Kolkata';
const IST_OFFSET = '+05:30';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const PLACEHOLDERS = new Set(['', 'all', 'all zones', 'all restaurants', 'all categories', 'all time', 'undefined', 'null']);

export const cleanFilterValue = (value) => {
    const text = String(value ?? '').trim();
    return PLACEHOLDERS.has(text.toLowerCase()) ? '' : text;
};

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value) && String(value).length === 24;
const toObjectId = (value) => new mongoose.Types.ObjectId(String(value));
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const pad = (n) => String(n).padStart(2, '0');
const toDateOnly = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Current calendar date in IST, as a UTC-based Date at that day's midnight. */
const istToday = () => {
    const shifted = new Date(Date.now() + IST_OFFSET_MS);
    return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
};

const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

/** Date-only strings are whole IST days; full ISO timestamps are used as given. */
const parseBoundary = (value, endOfDay) => {
    const text = String(value ?? '').trim();
    if (!text) return null;
    const parsed = DATE_ONLY.test(text)
        ? new Date(`${text}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}${IST_OFFSET}`)
        : new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const presetRange = (preset) => {
    const today = istToday();
    switch (String(preset || '').trim().toLowerCase()) {
        case 'today':
            return { from: toDateOnly(today), to: toDateOnly(today) };
        case 'yesterday': {
            const y = addDays(today, -1);
            return { from: toDateOnly(y), to: toDateOnly(y) };
        }
        case 'this week': {
            const sinceMonday = (today.getUTCDay() + 6) % 7;
            return { from: toDateOnly(addDays(today, -sinceMonday)), to: toDateOnly(today) };
        }
        case 'last 7 days':
            return { from: toDateOnly(addDays(today, -6)), to: toDateOnly(today) };
        case 'last 30 days':
            return { from: toDateOnly(addDays(today, -29)), to: toDateOnly(today) };
        case 'this month':
            return { from: toDateOnly(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))), to: toDateOnly(today) };
        case 'this year':
            return { from: toDateOnly(new Date(Date.UTC(today.getUTCFullYear(), 0, 1))), to: toDateOnly(today) };
        default:
            return null;
    }
};

/**
 * Accepts fromDate/toDate or startDate/endDate (either bound optional) and an optional
 * `time` preset. Returns a Mongo range ({$gte,$lte}) or null when no date filter applies.
 */
export function resolveDateRange(query = {}) {
    let fromRaw = query.fromDate ?? query.startDate;
    let toRaw = query.toDate ?? query.endDate;

    if (!cleanFilterValue(fromRaw) && !cleanFilterValue(toRaw)) {
        const preset = presetRange(query.time);
        if (!preset) return null;
        fromRaw = preset.from;
        toRaw = preset.to;
    }

    const from = parseBoundary(cleanFilterValue(fromRaw), false);
    const to = parseBoundary(cleanFilterValue(toRaw), true);
    if (!from && !to) return null;

    const range = {};
    if (from) range.$gte = from;
    if (to) range.$lte = to;
    return range;
}

async function resolveZoneId(zoneRaw) {
    const zone = cleanFilterValue(zoneRaw);
    if (!zone) return { id: null, notFound: false };
    if (isObjectId(zone)) return { id: toObjectId(zone), notFound: false };

    const matched = await FoodZone.findOne({ $or: [{ name: zone }, { zoneName: zone }] }).select('_id').lean();
    return matched ? { id: matched._id, notFound: false } : { id: null, notFound: true };
}

/**
 * Resolves zone + restaurant filters.
 * Returns { zoneId, restaurantIds, zoneRestaurantIds, empty }: `empty` means the filters can
 * never match anything (unknown zone/restaurant), so callers should return an empty result.
 */
export async function resolveRestaurantScope(query = {}) {
    const { id: zoneId, notFound } = await resolveZoneId(query.zoneId ?? query.zone);
    if (notFound) return { zoneId: null, restaurantIds: null, zoneRestaurantIds: null, empty: true };

    let zoneRestaurantIds = null;
    if (zoneId) {
        const inZone = await FoodRestaurant.find({ zoneId }).select('_id').lean();
        zoneRestaurantIds = inZone.map((r) => r._id);
    }

    let restaurantIds = null;
    const restaurantId = cleanFilterValue(query.restaurantId);
    const restaurantName = cleanFilterValue(query.restaurant);
    if (restaurantId && isObjectId(restaurantId)) {
        restaurantIds = [toObjectId(restaurantId)];
    } else if (restaurantName) {
        if (isObjectId(restaurantName)) {
            restaurantIds = [toObjectId(restaurantName)];
        } else {
            const byName = await FoodRestaurant.find({
                restaurantName: { $regex: `^${escapeRegex(restaurantName)}$`, $options: 'i' }
            }).select('_id').lean();
            restaurantIds = byName.map((r) => r._id);
        }
    }

    if (restaurantIds && zoneRestaurantIds) {
        const inZone = new Set(zoneRestaurantIds.map(String));
        restaurantIds = restaurantIds.filter((id) => inZone.has(String(id)));
    }

    return { zoneId, restaurantIds, zoneRestaurantIds, empty: Boolean(restaurantIds && restaurantIds.length === 0) };
}

/**
 * Resolves a category (id or name) to the ids of every category sharing its name, then to
 * the food item ids in those categories. Restaurant-owned categories often duplicate a
 * global one by name, so matching by name keeps the filter complete.
 */
export async function resolveCategoryItemIds(categoryRaw) {
    const category = cleanFilterValue(categoryRaw);
    if (!category) return { itemIds: null, categoryIds: null, empty: false };

    let name = category;
    if (isObjectId(category)) {
        const doc = await FoodCategory.findById(category).select('name').lean();
        if (!doc) return { itemIds: [], categoryIds: [], empty: true };
        name = doc.name;
    }

    const sameName = await FoodCategory.find({ name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } })
        .select('_id')
        .lean();
    const categoryIds = sameName.map((c) => c._id);
    const items = await FoodItem.find({
        $or: [
            { categoryId: { $in: categoryIds } },
            { categoryName: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } }
        ]
    }).select('_id').lean();
    const itemIds = items.map((i) => String(i._id));
    return { itemIds, categoryIds, empty: itemIds.length === 0 };
}

/**
 * Builds a FoodOrder filter from zone / restaurant / category / date query params.
 * Returns { filter, empty }. `filter` is safe to spread into a find()/aggregate $match.
 */
export async function buildOrderScopeFilter(query = {}) {
    const and = [];

    const range = resolveDateRange(query);
    if (range) and.push({ createdAt: range });

    const scope = await resolveRestaurantScope(query);
    if (scope.empty) return { filter: {}, empty: true };

    if (scope.restaurantIds) {
        and.push({ restaurantId: { $in: scope.restaurantIds } });
    }
    if (scope.zoneId) {
        // An order's own zoneId wins; only orders without one fall back to the restaurant's zone.
        and.push({
            $or: [
                { zoneId: scope.zoneId },
                { zoneId: null, restaurantId: { $in: scope.zoneRestaurantIds || [] } }
            ]
        });
    }

    const category = await resolveCategoryItemIds(query.categoryId ?? query.category);
    if (category.empty) return { filter: {}, empty: true };
    if (category.itemIds) {
        and.push({ 'items.itemId': { $in: category.itemIds } });
    }

    return { filter: and.length ? { $and: and } : {}, empty: false };
}
