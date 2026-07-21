import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { processAndSaveImage } from '../src/services/storage.service.js';
import { toRelativeUrl } from '../src/utils/urlHelper.js';
import { connectDB, disconnectDB } from '../src/config/db.js';

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

const CATEGORY_IMAGES = {
    'Pizza': 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop&q=80',
    'Biryani': 'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=600&auto=format&fit=crop&q=80',
    'Burgers': 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
    'Burger': 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
    'South Indian': 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=600&auto=format&fit=crop&q=80',
    'North Indian': 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&auto=format&fit=crop&q=80',
    'Chinese': 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=600&auto=format&fit=crop&q=80',
    'Italian': 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=600&auto=format&fit=crop&q=80',
    'Sweets': 'https://images.unsplash.com/photo-1587314168485-3236d6710814?w=600&auto=format&fit=crop&q=80',
    'Momos': 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=600&auto=format&fit=crop&q=80',
    'Chaat': 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=600&auto=format&fit=crop&q=80',
    'Cake': 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=600&auto=format&fit=crop&q=80',
    'Cakes': 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=600&auto=format&fit=crop&q=80',
    'Desserts': 'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=600&auto=format&fit=crop&q=80',
    'Sandwich': 'https://images.unsplash.com/photo-1509722747041-616f39b57569?w=600&auto=format&fit=crop&q=80',
    'Sandwiches': 'https://images.unsplash.com/photo-1509722747041-616f39b57569?w=600&auto=format&fit=crop&q=80',
    'Mediterranean': 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=600&auto=format&fit=crop&q=80',
    'Rolls': 'https://images.unsplash.com/photo-1562967914-608f82629710?w=600&auto=format&fit=crop&q=80',
    'Pasta': 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&auto=format&fit=crop&q=80',
    'Salad': 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&auto=format&fit=crop&q=80',
    'Salads': 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&auto=format&fit=crop&q=80',
    'Kebabs': 'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=600&auto=format&fit=crop&q=80',
    'Kebab': 'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=600&auto=format&fit=crop&q=80',
    'Noodles': 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=600&auto=format&fit=crop&q=80',
    'Beverages': 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=600&auto=format&fit=crop&q=80',
    'Drinks': 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=600&auto=format&fit=crop&q=80',
    'Starters': 'https://images.unsplash.com/photo-1541544741938-0af808871cc0?w=600&auto=format&fit=crop&q=80',
    'Thali': 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=600&auto=format&fit=crop&q=80',
    'Default': 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80'
};

const getImageUrlForCategory = (name) => {
    if (!name) return CATEGORY_IMAGES.Default;
    const trimmed = name.trim();
    if (CATEGORY_IMAGES[trimmed]) return CATEGORY_IMAGES[trimmed];
    
    // Case-insensitive check
    for (const [key, url] of Object.entries(CATEGORY_IMAGES)) {
        if (key.toLowerCase() === trimmed.toLowerCase()) return url;
    }
    
    // Partial check
    for (const [key, url] of Object.entries(CATEGORY_IMAGES)) {
        if (trimmed.toLowerCase().includes(key.toLowerCase())) return url;
    }
    
    return CATEGORY_IMAGES.Default;
};

const run = async () => {
    await connectDB();
    console.log('Connected to MongoDB via resilient DNS resolver');

    const { FoodCategory } = await import('../src/modules/food/admin/models/category.model.js');

    // Find all global categories (where restaurantId is null/undefined/missing)
    const categories = await FoodCategory.find({
        $or: [
            { restaurantId: null },
            { restaurantId: { $exists: false } }
        ]
    });

    console.log(`\nFound ${categories.length} global categories in database.`);

    for (const cat of categories) {
        console.log(`\n----------------------------------------`);
        console.log(`Processing Category: "${cat.name}" (ID: ${cat._id})`);
        console.log(`Current image: "${cat.image}" | imageUrl: "${cat.imageUrl}"`);

        const sourceUrl = getImageUrlForCategory(cat.name);
        console.log(`Downloading premium Unsplash image: ${sourceUrl}`);

        try {
            const response = await fetch(sourceUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} fetching image`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // Save to local uploads storage folder: /uploads/superfast/categories/YYYY/MM/xxx.webp
            const savedPath = await processAndSaveImage(buffer, 'superfast/categories');
            const relativePath = toRelativeUrl(savedPath);

            cat.image = relativePath;
            cat.imageUrl = relativePath;
            await cat.save();

            console.log(`✅ Successfully updated "${cat.name}" -> relative path: ${relativePath}`);
        } catch (err) {
            console.error(`❌ Failed to update category "${cat.name}":`, err.message);
        }
    }

    console.log(`\n----------------------------------------`);
    console.log(`All global categories have been checked and seeded with local relative image paths.`);
};

run()
    .catch(console.error)
    .finally(() => disconnectDB());
