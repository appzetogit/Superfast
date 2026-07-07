import mongoose from 'mongoose';
import { FoodRestaurantOutletTimings } from '../models/outletTimings.model.js';
import { FoodRestaurant } from '../models/restaurant.model.js';
import { invalidateCache } from '../../../../middleware/cache.js';

function timeToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const parts = timeStr.split(':');
    if (parts.length < 2) return 0;
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

export const syncAllRestaurantTimings = async () => {
    try {
        const dateStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
        const istDate = new Date(dateStr);
        
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const currentDayIndex = istDate.getDay();
        const currentDay = days[currentDayIndex];
        const prevDayIndex = (currentDayIndex - 1 + 7) % 7;
        const prevDay = days[prevDayIndex];

        const currentTotalMinutes = istDate.getHours() * 60 + istDate.getMinutes();

        // 1. Fetch all timings and restaurants
        const allTimings = await FoodRestaurantOutletTimings.find({}).lean();
        if (!allTimings.length) return;

        // Extract restaurant IDs that have timings
        const restaurantIds = allTimings.map(t => t.restaurantId);
        
        // Fetch current DB states to only update if necessary
        const restaurants = await FoodRestaurant.find(
            { _id: { $in: restaurantIds } },
            { isAcceptingOrders: 1, manualOffline: 1, restaurantName: 1 }
        ).lean();
        
        const restaurantMap = new Map(restaurants.map(r => [r._id.toString(), r]));
        const bulkOps = [];

        for (const timingDoc of allTimings) {
            const restIdStr = timingDoc.restaurantId.toString();
            const restaurant = restaurantMap.get(restIdStr);
            if (!restaurant) continue;

            const timings = Array.isArray(timingDoc.timings) ? timingDoc.timings : [];
            const todayTiming = timings.find(t => t.day === currentDay);
            const yesterdayTiming = timings.find(t => t.day === prevDay);

            let isOpenNow = false;

            // Check today's shift
            if (todayTiming && todayTiming.isOpen) {
                const openMins = timeToMinutes(todayTiming.openingTime);
                const closeMins = timeToMinutes(todayTiming.closingTime);
                
                if (closeMins >= openMins) {
                    // Normal day (e.g. 09:00 - 23:00)
                    if (currentTotalMinutes >= openMins && currentTotalMinutes <= closeMins) {
                        isOpenNow = true;
                    }
                } else {
                    // Overnight shift starting today (e.g. 18:00 - 02:00)
                    if (currentTotalMinutes >= openMins) {
                        isOpenNow = true;
                    }
                }
            }

            // Check yesterday's overnight shift (if not already open)
            if (!isOpenNow && yesterdayTiming && yesterdayTiming.isOpen) {
                const openMins = timeToMinutes(yesterdayTiming.openingTime);
                const closeMins = timeToMinutes(yesterdayTiming.closingTime);
                
                if (closeMins < openMins) {
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
                targetManualOffline = false;
            } else {
                if (currentManualOffline) {
                    targetIsAccepting = false;
                } else {
                    targetIsAccepting = true;
                }
            }
            
            // Add to bulk ops if there's a change
            if (targetIsAccepting !== currentIsAccepting || targetManualOffline !== currentManualOffline) {
                bulkOps.push({
                    updateOne: {
                        filter: { _id: timingDoc.restaurantId },
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
