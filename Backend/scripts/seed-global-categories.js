import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { processAndSaveImage } from '../src/services/storage.service.js';

dotenv.config();

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

const run = async () => {
    if (!uri) throw new Error('Missing MONGO_URI');
    await mongoose.connect(uri);
    
    // We need to import the schema to use it
    const { FoodCategory } = await import('../src/modules/food/admin/models/category.model.js');
    
    // Find all global categories
    const categories = await FoodCategory.find({ restaurantId: { $in: [null, undefined] } });
    console.log(`Found ${categories.length} global categories.`);
    
    for (const category of categories) {
        console.log(`Seeding image for category: ${category.name}`);
        try {
            // Generate a nice placeholder image with the category name
            const text = encodeURIComponent(category.name || 'Category');
            const placeholderUrl = `https://placehold.co/600x400/FF5722/FFFFFF.png?text=${text}`;
            
            const response = await fetch(placeholderUrl);
            if (!response.ok) throw new Error(`Failed to fetch placeholder for ${category.name}`);
            
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            
            // Save using VPS storage service
            const newUrl = await processAndSaveImage(buffer, 'category');
            
            // Update the category
            category.image = newUrl;
            await category.save();
            
            console.log(`✅ Success for ${category.name}: ${newUrl}`);
        } catch (err) {
            console.error(`❌ Failed to seed ${category.name}:`, err.message);
        }
    }
    
    console.log('\nSeeding complete!');
};

run().catch(console.error).finally(() => mongoose.disconnect());
