import express from 'express';
import mongoose from 'mongoose';
import { authMiddleware } from '../core/auth/auth.middleware.js';
import { FoodCategory } from '../modules/food/admin/models/category.model.js';
import { FoodUser } from '../core/users/user.model.js';
import { FoodRestaurant } from '../modules/food/restaurant/models/restaurant.model.js';
import { FoodItem } from '../modules/food/admin/models/food.model.js';
import { buildZoneRestaurantFilter } from '../modules/food/restaurant/services/restaurant.service.js';
import { sendResponse, sendError } from '../utils/response.js';

const router = express.Router();

// GET /api/preferences/categories
router.get('/categories', async (req, res, next) => {
    try {
        const categories = await FoodCategory.find({
            isActive: true,
            $or: [
                { restaurantId: { $exists: false } },
                { restaurantId: null }
            ]
        })
        .sort({ displayOrder: 1, sortOrder: 1 })
        .select('_id name slug imageUrl image')
        .lean();

        // Standardize output to return imageUrl
        const result = categories.map(cat => ({
            _id: cat._id,
            name: cat.name,
            slug: cat.slug,
            imageUrl: cat.imageUrl || cat.image || ''
        }));

        return sendResponse(res, 200, 'Categories retrieved', result);
    } catch (err) {
        next(err);
    }
});

// POST /api/preferences/save
router.post('/save', authMiddleware, async (req, res, next) => {
    try {
        const { categoryIds } = req.body;

        if (!Array.isArray(categoryIds)) {
            return sendError(res, 400, 'categoryIds must be an array');
        }

        // Check categories validity only if user selected any categories
        if (categoryIds.length > 0) {
            // Validate all categoryIds are valid MongoDB ObjectIds
            const validObjectIds = categoryIds.every(id => mongoose.Types.ObjectId.isValid(id));
            if (!validObjectIds) {
                return sendError(res, 400, 'Invalid category ID format');
            }

            // Check if all categories exist in FoodCategory collection
            const dbCategoriesCount = await FoodCategory.countDocuments({
                _id: { $in: categoryIds },
                $or: [
                    { restaurantId: { $exists: false } },
                    { restaurantId: null }
                ]
            });

            if (dbCategoriesCount !== categoryIds.length) {
                return sendError(res, 400, 'One or more selected categories do not exist');
            }
        }

        // Update User
        await FoodUser.findByIdAndUpdate(req.user.userId, {
            $set: {
                preferences: categoryIds.map(id => new mongoose.Types.ObjectId(id)),
                hasSetPreferences: true
            }
        });

        return sendResponse(res, 200, 'Preferences saved');
    } catch (err) {
        next(err);
    }
});

// GET /api/preferences/recommendations
router.get('/recommendations', authMiddleware, async (req, res, next) => {
    try {
        const user = await FoodUser.findById(req.user.userId)
            .populate({
                path: 'preferences',
                match: {
                    $or: [
                        { restaurantId: { $exists: false } },
                        { restaurantId: null }
                    ]
                },
                select: '_id name slug imageUrl image'
            })
            .lean();

        if (!user) {
            return sendError(res, 404, 'User not found');
        }

        const preferences = user.preferences || [];
        const hasSet = user.hasSetPreferences === true && preferences.length > 0;

        // Standardize populated preferences
        const favouriteCategories = preferences.map(cat => ({
            _id: cat._id,
            name: cat.name,
            slug: cat.slug,
            imageUrl: cat.imageUrl || cat.image || ''
        }));

        let recommendedRestaurants = [];

        const activeZoneId = req.query.zoneId || req.query.zone_id || '';
        let zoneFilter = null;
        if (activeZoneId) {
            zoneFilter = await buildZoneRestaurantFilter(activeZoneId);
        }

        if (hasSet) {
            const categoryNames = preferences.map(p => p.name);

            // Normalize category names to generate regexes that match similar names
            // e.g. "South Indian" -> matches "South Indian", "South India", "south india"
            const regexes = categoryNames.map(name => {
                const clean = name.trim().toLowerCase();
                let base = clean;
                if (clean.endsWith('ian') && clean.length > 5) {
                    base = clean.slice(0, -3);
                } else if (clean.endsWith('an') && clean.length > 4) {
                    base = clean.slice(0, -2);
                } else if (clean.endsWith('n') && clean.length > 3) {
                    base = clean.slice(0, -1);
                } else if (clean.endsWith('i') && clean.length > 3) {
                    base = clean.slice(0, -1);
                }
                return new RegExp(base, 'i');
            });

            // Find all matching categories (global and restaurant-specific)
            const matchedCategories = await FoodCategory.find({
                name: { $in: regexes }
            }).select('_id name').lean();

            const matchedCategoryIds = matchedCategories.map(c => c._id);
            const matchedCategoryNames = matchedCategories.map(c => c.name);

            // 1. Find restaurants selling dishes in those categories
            const foodItems = await FoodItem.find({
                categoryId: { $in: matchedCategoryIds },
                isAvailable: true,
                approvalStatus: 'approved'
            }).select('restaurantId').lean();

            const restaurantIdsFromFoods = foodItems.map(item => item.restaurantId);

            // 2. Find approved restaurants that sell those cuisines or matching products
            const queryFilter = {
                status: 'approved',
                $or: [
                    { _id: { $in: restaurantIdsFromFoods } },
                    { cuisines: { $in: matchedCategoryNames.map(n => new RegExp('^' + escapeRegex(n) + '$', 'i')) } }
                ]
            };
            if (zoneFilter) {
                queryFilter.$and = [zoneFilter];
            }
            recommendedRestaurants = await FoodRestaurant.find(queryFilter)
            .sort({ rating: -1, totalRatings: -1 })
            .limit(20)
            .lean();
        }

        // STRICT ZONE FALLBACK: If user has no recommendations matching in their active zone,
        // strictly return the top recommended restaurants belonging to the active zone.
        if (recommendedRestaurants.length === 0 && zoneFilter) {
            recommendedRestaurants = await FoodRestaurant.find({
                status: 'approved',
                $and: [zoneFilter]
            })
            .sort({ rating: -1, totalRatings: -1 })
            .limit(12)
            .lean();
        }

        // Helper to escape regex special characters
        function escapeRegex(string) {
            return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        }

        return sendResponse(res, 200, 'Recommendations retrieved', {
            favouriteCategories,
            recommendedRestaurants
        });
    } catch (err) {
        next(err);
    }
});

export default router;
