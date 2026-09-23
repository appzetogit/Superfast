import { GlobalSettings } from '../models/settings.model.js';
import { FoodRestaurant } from '../../food/restaurant/models/restaurant.model.js';
import { Seller } from '../../quick-commerce/seller/models/seller.model.js';
import mongoose from 'mongoose';

/**
 * Returns developer mode filter state and valid demo restaurant/store ObjectIds.
 * When Developer Mode is enabled (`enabled === true`):
 * - Returns `isDevMode: true`
 * - Returns `demoIds: ObjectId[]` (either manually configured demo IDs or fallback restaurant IDs)
 * - Returns `demoStoreIds: ObjectId[]` (either manually configured demo store IDs or fallback store IDs)
 * - Returns `bypassLocation: boolean`
 */
export async function getDeveloperModeFilter() {
    try {
        const settings = await GlobalSettings.findOne().lean();
        const devMode = settings?.developerMode;
        if (!devMode?.enabled) {
            return { isDevMode: false, demoIds: null, demoStoreIds: null, bypassLocation: false, showAllMenuItems: false };
        }

        const hideLive = devMode.hideLiveRestaurantsInReview !== false;

        let validDemoIds = null;
        if (hideLive) {
            if (Array.isArray(devMode.demoRestaurantIds) && devMode.demoRestaurantIds.length > 0) {
                validDemoIds = devMode.demoRestaurantIds
                    .map(id => String(id).trim())
                    .filter(id => mongoose.Types.ObjectId.isValid(id))
                    .map(id => new mongoose.Types.ObjectId(id));
            } else {
                const fallback = await FoodRestaurant.find().select('_id').limit(10).lean();
                if (fallback.length > 0) {
                    validDemoIds = fallback.map(r => r._id);
                }
            }
        }

        let validDemoStoreIds = null;
        if (hideLive) {
            if (Array.isArray(devMode.demoStoreIds) && devMode.demoStoreIds.length > 0) {
                validDemoStoreIds = devMode.demoStoreIds
                    .map(id => String(id).trim())
                    .filter(id => mongoose.Types.ObjectId.isValid(id))
                    .map(id => new mongoose.Types.ObjectId(id));
            } else {
                const fallbackStore = await Seller.find().select('_id').limit(10).lean();
                if (fallbackStore.length > 0) {
                    validDemoStoreIds = fallbackStore.map(s => s._id);
                }
            }
        }

        const demoMenuItemIds = Array.isArray(devMode.demoMenuItemIds) ? devMode.demoMenuItemIds.map(String) : [];
        const demoLandingCategoryIds = Array.isArray(devMode.demoLandingCategoryIds) ? devMode.demoLandingCategoryIds.map(String) : [];

        return {
            isDevMode: true,
            demoIds: validDemoIds,
            demoStoreIds: validDemoStoreIds,
            bypassLocation: devMode.bypassLocationRestriction ?? true,
            showAllMenuItems: devMode.showAllMenuItemsInDevMode ?? true,
            demoMenuItemIds,
            demoLandingCategoryIds
        };
    } catch (error) {
        console.error('Error in getDeveloperModeFilter:', error);
        return { isDevMode: false, demoIds: null, demoStoreIds: null, bypassLocation: false, showAllMenuItems: false };
    }
}
