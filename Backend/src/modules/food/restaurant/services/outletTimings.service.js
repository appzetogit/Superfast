import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodRestaurantOutletTimings } from '../models/outletTimings.model.js';
import { FoodRestaurant } from '../models/restaurant.model.js';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const normalizeDay = (value) => {
    const v = String(value || '').trim();
    if (!v) return null;
    const exact = DAY_NAMES.find((d) => d.toLowerCase() === v.toLowerCase());
    if (exact) return exact;
    const abbr = v.slice(0, 3).toLowerCase();
    const match = DAY_NAMES.find((d) => d.toLowerCase().startsWith(abbr));
    return match || null;
};

const normalizeTime = (value, fallback) => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return fallback;

    // AM/PM format (e.g., "10:00 AM", "09:00:00 PM")
    const ampm = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]m)$/);
    if (ampm) {
        let h = Number(ampm[1]);
        const min = Number(ampm[2]);
        const period = ampm[3];
        if (!Number.isFinite(h) || !Number.isFinite(min) || min < 0 || min > 59) return fallback;
        if (period === 'pm' && h < 12) h += 12;
        if (period === 'am' && h === 12) h = 0;
        if (h < 0 || h > 23) return fallback;
        return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }

    // HH:mm or HH:mm:ss format
    const m = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (m) {
        const h = Number(m[1]);
        const min = Number(m[2]);
        if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return fallback;
        return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }

    return fallback;
};

const defaultTimings = () =>
    DAY_NAMES.map((day) => ({
        day,
        isOpen: true,
        openingTime: '09:00',
        closingTime: '22:00'
    }));

export const toClientShape = (doc) => {
    const timings = Array.isArray(doc?.timings) ? doc.timings : [];
    const map = {};
    for (const day of DAY_NAMES) {
        const found = timings.find((t) => normalizeDay(t?.day) === day);
        const isOpen = found ? found.isOpen !== false : true;
        map[day] = {
            isOpen,
            openingTime: normalizeTime(found?.openingTime, '09:00'),
            closingTime: normalizeTime(found?.closingTime, '22:00')
        };
    }
    return map;
};

export async function getOutletTimingsForRestaurant(restaurantId) {
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(String(restaurantId))) {
        throw new ValidationError('Invalid restaurant id');
    }
    const targetObjId = new mongoose.Types.ObjectId(String(restaurantId));
    const doc = await FoodRestaurantOutletTimings.findOne({ restaurantId: targetObjId }).select('timings updatedAt').lean();
    if (!doc) return { outletTimings: toClientShape({ timings: defaultTimings() }) };
    return { outletTimings: toClientShape(doc) };
}

export async function upsertOutletTimingsForRestaurant(restaurantId, outletTimings) {
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(String(restaurantId))) {
        throw new ValidationError('Invalid restaurant id');
    }
    if (!outletTimings || typeof outletTimings !== 'object' || Array.isArray(outletTimings)) {
        throw new ValidationError('outletTimings must be an object keyed by day name');
    }

    const targetObjId = new mongoose.Types.ObjectId(String(restaurantId));

    const timings = DAY_NAMES.map((day) => {
        const src = outletTimings[day] && typeof outletTimings[day] === 'object' ? outletTimings[day] : {};
        const isOpen = src.isOpen !== false;
        return {
            day,
            isOpen,
            openingTime: normalizeTime(src.openingTime, '09:00'),
            closingTime: normalizeTime(src.closingTime, '22:00')
        };
    });

    const doc = await FoodRestaurantOutletTimings.findOneAndUpdate(
        { restaurantId: targetObjId },
        { $set: { timings } },
        { upsert: true, new: true, setDefaultsOnInsert: true, projection: 'timings updatedAt' }
    ).lean();

    // Synchronize to the main FoodRestaurant document
    const openDay = timings.find((t) => t.isOpen) || timings[0];
    const generalOpeningTime = openDay ? openDay.openingTime : '09:00';
    const generalClosingTime = openDay ? openDay.closingTime : '22:00';
    const openDaysList = timings.filter((t) => t.isOpen).map((t) => t.day);

    await FoodRestaurant.updateOne(
        { _id: targetObjId },
        {
            $set: {
                openingTime: generalOpeningTime,
                closingTime: generalClosingTime,
                openDays: openDaysList
            }
        }
    ).catch((err) => {
        // Log error but do not block the response
        console.error(`Failed to sync outlet timings to FoodRestaurant: ${err.message}`);
    });

    return { outletTimings: toClientShape(doc) };
}

