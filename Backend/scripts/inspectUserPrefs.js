import mongoose from 'mongoose';
import { FoodUser } from '../src/core/users/user.model.js';
import { FoodCategory } from '../src/modules/food/admin/models/category.model.js';
import { connectDB, disconnectDB } from '../src/config/db.js';

(async () => {
    await connectDB();
    try {
        const categories = await FoodCategory.find({
            isActive: true,
            $or: [
                { restaurantId: { $exists: false } },
                { restaurantId: null }
            ]
        }).lean();
        console.log('Global active categories:', JSON.stringify(categories.map(c => ({ name: c.name, isActive: c.isActive, restaurantId: c.restaurantId, imageUrl: c.imageUrl })), null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await disconnectDB();
    }
})();
