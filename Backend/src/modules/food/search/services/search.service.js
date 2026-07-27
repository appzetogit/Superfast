import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodItem } from '../../admin/models/food.model.js';
import { FoodCategory } from '../../admin/models/category.model.js';
import { FoodZone } from '../../admin/models/zone.model.js';
import mongoose from 'mongoose';

const zoneToPolygon = (zoneDoc) => {
    const coords = Array.isArray(zoneDoc?.coordinates) ? zoneDoc.coordinates : [];
    if (coords.length < 3) return null;

    const ring = coords
        .map((coord) => [Number(coord.longitude), Number(coord.latitude)])
        .filter((pair) => pair.every((value) => Number.isFinite(value)));

    if (ring.length < 3) return null;

    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
        ring.push(first);
    }

    return { type: 'Polygon', coordinates: [ring] };
};

const buildZoneRestaurantConstraint = async (zoneIdRaw) => {
    const trimmedZoneId = String(zoneIdRaw || '').trim();
    if (!trimmedZoneId || !mongoose.Types.ObjectId.isValid(trimmedZoneId)) {
        return null;
    }

    const zoneClauses = [
        { zoneId: new mongoose.Types.ObjectId(trimmedZoneId) },
        { zoneId: { $exists: false } },
        { zoneId: null }
    ];
    const zoneDoc = await FoodZone.findOne({ _id: trimmedZoneId, isActive: true }).lean();
    const polygon = zoneToPolygon(zoneDoc);
    if (polygon) {
        zoneClauses.push({ location: { $geoWithin: { $geometry: polygon } } });
    }

    return { $or: zoneClauses };
};

/**
 * Unified Search Service
 * Searches for restaurants by name and also searches for food items, 
 * returning matched restaurants with potential dish highlights.
 */
export const searchUnified = async (query = {}, options = {}) => {
    const { 
        q, 
        lat, 
        lng, 
        radiusKm = 20, 
        categoryId, 
        minRating, 
        maxDeliveryTime, 
        isVeg,
        page = 1,
        limit = 20,
        zoneId
    } = query;

    const skip = (page - 1) * limit;
    const term = String(q || '').trim();
    const regex = term ? new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;

    // 1. Initial Filter (approved status or active)
    const restaurantFilter = { status: { $ne: 'rejected' } };
    
    console.log(`[Search-Service] Querying with term: "${term}", categoryId: "${categoryId}", zoneId: "${zoneId}"`);

    const zoneConstraint = await buildZoneRestaurantConstraint(zoneId);
    if (zoneConstraint) {
        restaurantFilter.$and = [...(restaurantFilter.$and || []), zoneConstraint];
    }

    if (isVeg === 'true') {
        restaurantFilter.pureVegRestaurant = true;
    }

    if (minRating) {
        restaurantFilter.rating = { $gte: parseFloat(minRating) };
    }

    if (maxDeliveryTime) {
        restaurantFilter.estimatedDeliveryTimeMinutes = { $lte: parseInt(maxDeliveryTime) };
    }
    
    console.log(`[Search-Service] Final Restaurant Filter:`, JSON.stringify(restaurantFilter));

    let restaurantIds = new Set();
    let restaurantDetailsMap = new Map();

    // 2. Handle Category Filtering (Restaurants don't have categoryId, FoodItems do)
    if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
        const catFoodItems = await FoodItem.find({ 
            categoryId: new mongoose.Types.ObjectId(categoryId),
            approvalStatus: { $ne: 'rejected' }
        }).select('restaurantId').lean();
        
        const catRestaurantIds = [...new Set(catFoodItems.map(f => f.restaurantId.toString()))];
        if (catRestaurantIds.length > 0) {
            restaurantFilter._id = { $in: catRestaurantIds.map(id => new mongoose.Types.ObjectId(id)) };
        } else {
            // Fallback: check embedded sections for category match if no FoodItem found
            const catDoc = await FoodCategory.findById(categoryId).lean();
            if (catDoc?.name) {
                const catRegex = new RegExp(catDoc.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
                const embeddedRs = await FoodRestaurant.find({
                    ...restaurantFilter,
                    $or: [
                        { 'menu.sections.name': { $regex: catRegex } },
                        { 'menuSections.name': { $regex: catRegex } }
                    ]
                }).lean();
                if (embeddedRs.length === 0) {
                    return {
                        success: true,
                        data: { restaurants: [], total: 0, page: parseInt(page), limit: parseInt(limit) }
                    };
                }
                restaurantFilter._id = { $in: embeddedRs.map(r => r._id) };
            } else {
                return {
                    success: true,
                    data: { restaurants: [], total: 0, page: parseInt(page), limit: parseInt(limit) }
                };
            }
        }
    }

    // 3. Multi-Entity Search Matching (Categories, Dishes, Restaurants)
    let matchedCategories = [];
    let matchedDishes = [];
    const seenDishKeys = new Set();

    if (regex) {
        // A. Search Categories
        try {
            matchedCategories = await FoodCategory.find({
                name: { $regex: regex },
                isActive: { $ne: false }
            }).limit(10).lean();
        } catch (catErr) {
            console.warn('[Search-Service] Category search error:', catErr);
        }

        // B. Search Food Items Collection
        const foodFilters = { approvalStatus: { $ne: 'rejected' } };
        if (isVeg === 'true') foodFilters.foodType = 'Veg';
        
        const matchedFoods = await FoodItem.find({
            ...foodFilters,
            $or: [
                { name: { $regex: regex } },
                { categoryName: { $regex: regex } },
                { description: { $regex: regex } }
            ]
        }).limit(30).lean();

        const foodRestaurantIds = matchedFoods
            .map(f => f.restaurantId ? f.restaurantId.toString() : null)
            .filter(Boolean);

        const validOids = foodRestaurantIds
            .filter(id => mongoose.Types.ObjectId.isValid(id))
            .map(id => new mongoose.Types.ObjectId(id));

        const foodRestaurants = await FoodRestaurant.find({
            status: { $ne: 'rejected' },
            _id: { $in: validOids }
        }).lean();

        const restMap = new Map(foodRestaurants.map(r => [r._id.toString(), r]));

        matchedFoods.forEach(f => {
            const rest = restMap.get(f.restaurantId ? f.restaurantId.toString() : '');
            const restName = rest?.restaurantName || 'Restaurant';
            const restSlug = rest?.slug || restName.toLowerCase().replace(/\s+/g, '-');
            
            const key = `${f.name.toLowerCase()}-${rest?._id || f._id}`;
            if (!seenDishKeys.has(key)) {
                seenDishKeys.add(key);
                matchedDishes.push({
                    _id: f._id,
                    name: f.name,
                    price: f.price || 0,
                    image: f.image || rest?.profileImage || rest?.image || '',
                    description: f.description || '',
                    isVeg: f.foodType === 'Veg',
                    restaurantId: rest?._id || f.restaurantId,
                    restaurantName: restName,
                    restaurantSlug: restSlug,
                    rating: rest?.rating || 4.0,
                    estimatedDeliveryTime: rest?.estimatedDeliveryTime || '30 mins'
                });
            }

            if (rest) {
                restaurantIds.add(rest._id.toString());
                restaurantDetailsMap.set(rest._id.toString(), {
                    ...rest,
                    matchType: 'food',
                    matchedDish: f.name,
                    matchedDishImage: f.image || rest.profileImage,
                    matchedDishId: f._id
                });
            }
        });

        // C. Search in Embedded Restaurant Menu Sections
        const embeddedMatchedRestaurants = await FoodRestaurant.find({
            ...restaurantFilter,
            $or: [
                { 'menu.sections.items.name': { $regex: regex } },
                { 'menuSections.items.name': { $regex: regex } },
                { 'menu.sections.items.description': { $regex: regex } },
                { 'menuSections.items.description': { $regex: regex } }
            ]
        }).limit(20).lean();

        embeddedMatchedRestaurants.forEach(r => {
            const sections = r.menu?.sections || r.menuSections || [];
            sections.forEach(sec => {
                (sec.items || []).forEach(it => {
                    if (it.name && regex.test(it.name)) {
                        const key = `${it.name.toLowerCase()}-${r._id}`;
                        if (!seenDishKeys.has(key)) {
                            seenDishKeys.add(key);
                            matchedDishes.push({
                                _id: it._id || it.id || new mongoose.Types.ObjectId(),
                                name: it.name,
                                price: it.price || 0,
                                image: it.image || r.profileImage || r.image || '',
                                description: it.description || '',
                                isVeg: it.isVeg === true || it.vegType === 'veg' || it.foodType === 'Veg',
                                restaurantId: r._id,
                                restaurantName: r.restaurantName,
                                restaurantSlug: r.slug || r.restaurantName.toLowerCase().replace(/\s+/g, '-'),
                                rating: r.rating || 4.0,
                                estimatedDeliveryTime: r.estimatedDeliveryTime || '30 mins'
                            });
                        }
                    }
                });
            });

            restaurantIds.add(r._id.toString());
            if (!restaurantDetailsMap.has(r._id.toString())) {
                restaurantDetailsMap.set(r._id.toString(), {
                    ...r,
                    matchType: 'food',
                    matchedDish: term
                });
            }
        });

        // D. Search Restaurants directly by Name / Cuisine / Area / City
        const matchedRestaurants = await FoodRestaurant.find({
            ...restaurantFilter,
            $or: [
                { restaurantName: { $regex: regex } },
                { cuisines: { $regex: regex } },
                { area: { $regex: regex } },
                { city: { $regex: regex } }
            ]
        }).limit(limit * 2).lean();

        matchedRestaurants.forEach(r => {
            restaurantIds.add(r._id.toString());
            restaurantDetailsMap.set(r._id.toString(), {
                ...r,
                matchType: 'restaurant'
            });
        });

        // E. Global Fallback Search (If zero items matched, search without restrictive filters)
        if (restaurantDetailsMap.size === 0 && matchedDishes.length === 0) {
            const fallbackFoods = await FoodItem.find({
                $or: [
                    { name: { $regex: regex } },
                    { categoryName: { $regex: regex } },
                    { description: { $regex: regex } }
                ]
            }).limit(20).lean();

            const fallbackFoodRestIds = fallbackFoods.map(f => f.restaurantId ? f.restaurantId.toString() : null).filter(Boolean);
            const fallbackOids = fallbackFoodRestIds.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));

            const fallbackRestaurants = await FoodRestaurant.find({
                $or: [
                    { restaurantName: { $regex: regex } },
                    { cuisines: { $regex: regex } },
                    ...(fallbackOids.length > 0 ? [{ _id: { $in: fallbackOids } }] : [])
                ]
            }).limit(limit * 2).lean();

            fallbackRestaurants.forEach(r => {
                const matchedFood = fallbackFoods.find(f => f.restaurantId && f.restaurantId.toString() === r._id.toString());
                if (matchedFood && !seenDishKeys.has(`${matchedFood.name.toLowerCase()}-${r._id}`)) {
                    matchedDishes.push({
                        _id: matchedFood._id,
                        name: matchedFood.name,
                        price: matchedFood.price || 0,
                        image: matchedFood.image || r.profileImage || r.image || '',
                        description: matchedFood.description || '',
                        isVeg: matchedFood.foodType === 'Veg',
                        restaurantId: r._id,
                        restaurantName: r.restaurantName,
                        restaurantSlug: r.slug || r.restaurantName.toLowerCase().replace(/\s+/g, '-'),
                        rating: r.rating || 4.0,
                        estimatedDeliveryTime: r.estimatedDeliveryTime || '30 mins'
                    });
                }
                restaurantDetailsMap.set(r._id.toString(), {
                    ...r,
                    matchType: matchedFood ? 'food' : 'restaurant',
                    matchedDish: matchedFood?.name || term
                });
            });
        }
    } else {
        // No search text -> List all restaurants matching filters
        const allMatching = await FoodRestaurant.find(restaurantFilter)
            .sort({ rating: -1, createdAt: -1 })
            .limit(limit * 2)
            .lean();
            
        allMatching.forEach(r => {
            restaurantIds.add(r._id.toString());
            restaurantDetailsMap.set(r._id.toString(), r);
        });
    }

    // 4. Final Result Formatting
    let results = Array.from(restaurantDetailsMap.values());

    // Simple distance sorting if lat/lng are provided
    if (lat && lng && results.length > 0) {
        results.forEach(res => {
            if (res.location && res.location.latitude && res.location.longitude) {
                const dLat = (res.location.latitude - lat) * Math.PI / 180;
                const dLon = (res.location.longitude - lng) * Math.PI / 180;
                const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                          Math.cos(lat * Math.PI / 180) * Math.cos(res.location.latitude * Math.PI / 180) *
                          Math.sin(dLon/2) * Math.sin(dLon/2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                res.distanceScore = 6371 * c; // Km
            } else {
                res.distanceScore = 999;
            }
        });
        results.sort((a, b) => (a.distanceScore || 999) - (b.distanceScore || 999));
    }

    const finalResult = {
        success: true,
        data: {
            categories: matchedCategories,
            dishes: matchedDishes,
            restaurants: results.slice(skip, skip + limit),
            total: results.length + matchedDishes.length + matchedCategories.length,
            page: parseInt(page),
            limit: parseInt(limit),
            zoneFiltered: !!(zoneId && mongoose.Types.ObjectId.isValid(zoneId))
        }
    };

    return finalResult;
};

/**
 * Fetch Admin-only categories
 */
export const getAdminCategories = async (query = {}) => {
    const filter = { 
        isActive: true, 
        isApproved: true,
        $or: [
            { restaurantId: { $exists: false } },
            { restaurantId: null },
            { restaurantId: { $eq: undefined } }
        ]
    };

    if (query.zoneId && mongoose.Types.ObjectId.isValid(query.zoneId)) {
        filter.$or = [
            { zoneId: new mongoose.Types.ObjectId(query.zoneId) },
            { zoneId: { $exists: false } },
            { zoneId: null }
        ];
    }

    const categories = await FoodCategory.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
    return categories;
};
