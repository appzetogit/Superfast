import mongoose from 'mongoose';
import { FoodRestaurantOutletTimings } from '../models/outletTimings.model.js';
import { FoodRestaurant } from '../models/restaurant.model.js';
import { invalidateCache } from '../../../../middleware/cache.js';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const normalizeDay = (value) => {
    if (!value || typeof value !== 'string') return null;
    const trimmed = value.trim().toLowerCase();
    const match = DAY_NAMES.find((d) => d.toLowerCase() === trimmed);
    if (match) return match;
    const matchAbbr = DAY_NAMES.find((d) => d.toLowerCase().startsWith(trimmed.slice(0, 3)));
    return matchAbbr || null;
};

function parseTimeToMinutes(timeValue) {
    if (!timeValue || typeof timeValue !== 'string') return null;
    const raw = timeValue.trim().toLowerCase();
    if (!raw) return null;

    const meridiemMatch = raw.match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/);
    if (meridiemMatch) {
        let hour = Number(meridiemMatch[1]);
        const minute = Number(meridiemMatch[2]);
        const period = meridiemMatch[3];
        if (Number.isNaN(hour) || Number.isNaN(minute) || minute < 0 || minute > 59) return null;
        if (period === 'pm' && hour < 12) hour += 12;
        if (period === 'am' && hour === 12) hour = 0;
        if (hour < 0 || hour > 23) return null;
        return hour * 60 + minute;
    }

    const twentyFourMatch = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (twentyFourMatch) {
        const hour = Number(twentyFourMatch[1]);
        const minute = Number(twentyFourMatch[2]);
        if (Number.isNaN(hour) || Number.isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            return null;
        }
        return hour * 60 + minute;
    }

    return null;
}

const getTimingForDay = (timingDoc, targetDay) => {
    if (!timingDoc) return null;
    let timings = timingDoc.timings;
    if (timings && typeof timings === 'object' && !Array.isArray(timings) && timings.timings) {
        timings = timings.timings;
    }
    if (Array.isArray(timings)) {
        return timings.find((t) => normalizeDay(t?.day) === targetDay) || null;
    }
    if (timings && typeof timings === 'object' && !Array.isArray(timings)) {
        return timings[targetDay] || Object.entries(timings).find(([k]) => normalizeDay(k) === targetDay)?.[1] || null;
    }
    return null;
};

export const syncAllRestaurantTimings = async () => {
    try {
        const dateStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
        const istDate = new Date(dateStr);
        
        const currentDayIndex = istDate.getDay();
        const currentDay = DAY_NAMES[currentDayIndex];
        const prevDayIndex = (currentDayIndex - 1 + 7) % 7;
        const prevDay = DAY_NAMES[prevDayIndex];

        const currentTotalMinutes = istDate.getHours() * 60 + istDate.getMinutes();

        // 1. Fetch all timings and approved restaurants
        const allTimings = await FoodRestaurantOutletTimings.find({}).lean();
        
        // Fetch all active/approved restaurants
        const restaurants = await FoodRestaurant.find(
            { status: 'approved' },
            { isAcceptingOrders: 1, manualOffline: 1, restaurantName: 1, openingTime: 1, closingTime: 1 }
        ).lean();

        if (!restaurants.length) return;

        const timingsMap = new Map((allTimings || []).map(t => [t.restaurantId.toString(), t]));
        const bulkOps = [];

        for (const restaurant of restaurants) {
            const restIdStr = restaurant._id.toString();
            const timingDoc = timingsMap.get(restIdStr);

            const todayTiming = getTimingForDay(timingDoc, currentDay);
            const yesterdayTiming = getTimingForDay(timingDoc, prevDay);

            let isOpenNow = false;

            // Check today's shift
            const openOpt = todayTiming?.openingTime || restaurant.openingTime;
            const closeClt = todayTiming?.closingTime || restaurant.closingTime;
            const isDayOpen = todayTiming ? todayTiming.isOpen !== false : true;

            if (isDayOpen && openOpt && closeClt) {
                const openMins = parseTimeToMinutes(openOpt);
                const closeMins = parseTimeToMinutes(closeClt);

                if (openMins !== null && closeMins !== null) {
                    if (closeMins > openMins) {
                        // Normal day shift (e.g. 10:00 AM to 9:00 PM / 10:00 to 21:00)
                        if (currentTotalMinutes >= openMins && currentTotalMinutes <= closeMins) {
                            isOpenNow = true;
                        }
                    } else if (closeMins < openMins) {
                        // Overnight shift starting today (e.g. 18:00 to 02:00)
                        if (currentTotalMinutes >= openMins) {
                            isOpenNow = true;
                        }
                    } else {
                        // 24 hours open if openingTime === closingTime
                        isOpenNow = true;
                    }
                } else {
                    isOpenNow = true;
                }
            } else if (isDayOpen && !openOpt && !closeClt) {
                // Default to open if no specific time window is set
                isOpenNow = true;
            }

            // Check yesterday's overnight shift (if not already open)
            if (!isOpenNow && yesterdayTiming && yesterdayTiming.isOpen !== false) {
                const openMins = parseTimeToMinutes(yesterdayTiming.openingTime);
                const closeMins = parseTimeToMinutes(yesterdayTiming.closingTime);

                if (openMins !== null && closeMins !== null && closeMins < openMins) {
                    // Overnight shift started yesterday and extending into today
                    if (currentTotalMinutes <= closeMins) {
                        isOpenNow = true;
                    }
                }
            }

            // Calculate final target state
            const currentIsAccepting = Boolean(restaurant.isAcceptingOrders);
            const currentManualOffline = Boolean(restaurant.manualOffline);

            let targetIsAccepting = currentIsAccepting;
            let targetManualOffline = currentManualOffline;

            if (!isOpenNow) {
                targetIsAccepting = false;
            } else {
                if (currentManualOffline) {
                    targetIsAccepting = false;
                } else {
                    targetIsAccepting = true;
                }
            }

            // Add to bulk ops if there's a change
            if (targetIsAccepting !== currentIsAccepting) {
                bulkOps.push({
                    updateOne: {
                        filter: { _id: restaurant._id },
                        update: { $set: { isAcceptingOrders: targetIsAccepting, manualOffline: targetManualOffline } }
                    }
                });
            }
        }

        if (bulkOps.length > 0) {
            await FoodRestaurant.bulkWrite(bulkOps, { ordered: false });
            console.log(`[TimingsSync] Synced ${bulkOps.length} restaurants status with their schedule.`);

            // Invalidate caches so the API reflects the updated isAcceptingOrders immediately
            try {
                await invalidateCache('restaurants:*');
                await invalidateCache('restaurant_detail:*');
                for (const op of bulkOps) {
                    if (op.updateOne && op.updateOne.filter && op.updateOne.filter._id) {
                        await invalidateCache(`restaurant_detail:${op.updateOne.filter._id.toString()}`);
                    }
                }
            } catch (cacheErr) {
                console.error('[TimingsSync] Cache invalidation error:', cacheErr.message);
            }
        }

    } catch (error) {
        console.error('[TimingsSync] Error syncing restaurant timings:', error);
    }
};
