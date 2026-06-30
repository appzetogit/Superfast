import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { FoodCategory } from '../src/modules/food/admin/models/category.model.js';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const CATEGORIES = [
  { name: 'Pizza', slug: 'pizza', image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600' },
  { name: 'Biryani', slug: 'biryani', image: 'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=600' },
  { name: 'Burgers', slug: 'burgers', image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600' },
  { name: 'South Indian', slug: 'south-indian', image: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=600' },
  { name: 'North Indian', slug: 'north-indian', image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600' },
  { name: 'Chinese', slug: 'chinese', image: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=600' },
  { name: 'Italian', slug: 'italian', image: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=600' },
  { name: 'Sweets', slug: 'sweets', image: 'https://images.unsplash.com/photo-1587314168485-3236d6710814?w=600' },
  { name: 'Momos', slug: 'momos', image: 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=600' },
  { name: 'Chaat', slug: 'chaat', image: 'https://images.unsplash.com/photo-1601050690597-df056fb4ce78?w=600' },
  { name: 'Cake', slug: 'cake', image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=600' },
  { name: 'Desserts', slug: 'desserts', image: 'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=600' },
  { name: 'Sandwich', slug: 'sandwich', image: 'https://images.unsplash.com/photo-1509722747041-616f39b57569?w=600' },
  { name: 'Mediterranean', slug: 'mediterranean', image: 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=600' },
  { name: 'Rolls', slug: 'rolls', image: 'https://images.unsplash.com/photo-1626700051175-6518c4793f06?w=600' },
  { name: 'Pasta', slug: 'pasta', image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600' },
  { name: 'Salad', slug: 'salad', image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600' },
  { name: 'Kebabs', slug: 'kebabs', image: 'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=600' }
];

async function run() {
  await connectDB();

  try {
    for (let i = 0; i < CATEGORIES.length; i++) {
      const cat = CATEGORIES[i];
      const existing = await FoodCategory.findOne({ slug: cat.slug });
      if (existing) {
        console.log(`[SKIP] Category with slug "${cat.slug}" already exists: ${existing.name}`);
        continue;
      }

      console.log(`[UPLOAD] Uploading image to Cloudinary for category: ${cat.name}...`);
      
      let uploadResult;
      try {
        uploadResult = await cloudinary.uploader.upload(cat.image, {
          folder: 'food-app/categories',
          resource_type: 'image',
          format: 'webp',
          quality: 'auto'
        });
      } catch (uploadError) {
        console.warn(`[WARN] Failed to upload primary image for "${cat.name}", trying fallback image. Error: ${uploadError.message}`);
        const fallbackUrl = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600';
        uploadResult = await cloudinary.uploader.upload(fallbackUrl, {
          folder: 'food-app/categories',
          resource_type: 'image',
          format: 'webp',
          quality: 'auto'
        });
      }

      const secureUrl = uploadResult.secure_url;
      console.log(`[UPLOADED] Cloudinary URL: ${secureUrl}`);

      const newCat = new FoodCategory({
        name: cat.name,
        slug: cat.slug,
        imageUrl: secureUrl,
        image: secureUrl, // legacy compatibility
        displayOrder: i + 1,
        sortOrder: i + 1, // legacy compatibility
        isActive: true,
        restaurantId: undefined, // mark as global/admin category
        isApproved: true,
        approvalStatus: 'approved'
      });

      await newCat.save();
      console.log(`[SAVED] Created category: ${cat.name}`);
    }
  } catch (error) {
    console.error('Error seeding categories:', error);
  } finally {
    await disconnectDB();
  }
}

run();
