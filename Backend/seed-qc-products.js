import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

// Assuming the product model is located here based on previous grep results
import { QuickProduct } from './src/modules/quick-commerce/models/product.model.js';

const categoryId = "6a2bf8e22f671c6cfc3b78ac";

const dummyProducts = [
  {
    name: "Thums Up Soft Drink",
    slug: "thums-up-soft-drink",
    image: "https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/1210a.jpg",
    mainImage: "",
    galleryImages: [],
    categoryId: new mongoose.Types.ObjectId(categoryId),
    subcategoryId: null,
    headerId: null,
    description: "Thums Up is a brand of cola in India.",
    price: 40,
    mrp: 45,
    unit: "750 ml",
    weight: "",
    brand: "Thums Up",
    sku: "TU-750",
    stock: 100,
    lowStockAlert: 5,
    salePrice: 40,
    status: "active",
    approvalStatus: "approved",
    approvedAt: new Date(),
    isFeatured: true,
    tags: ["cold drink", "soft drink", "beverages"],
    deliveryTime: "10 mins",
    badge: "Chilled",
    rating: 4.5,
    isActive: true,
    variants: []
  },
  {
    name: "Sprite Soft Drink",
    slug: "sprite-soft-drink",
    image: "https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/1210a.jpg",
    mainImage: "",
    galleryImages: [],
    categoryId: new mongoose.Types.ObjectId(categoryId),
    subcategoryId: null,
    headerId: null,
    description: "Sprite is a clear, lemon and lime-flavored soft drink.",
    price: 40,
    mrp: 45,
    unit: "750 ml",
    weight: "",
    brand: "Sprite",
    sku: "SP-750",
    stock: 150,
    lowStockAlert: 5,
    salePrice: 40,
    status: "active",
    approvalStatus: "approved",
    approvedAt: new Date(),
    isFeatured: false,
    tags: ["cold drink", "soft drink", "beverages"],
    deliveryTime: "10 mins",
    badge: "Chilled",
    rating: 4.3,
    isActive: true,
    variants: []
  },
  {
    name: "Fanta Soft Drink",
    slug: "fanta-soft-drink",
    image: "https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/1210a.jpg",
    mainImage: "",
    galleryImages: [],
    categoryId: new mongoose.Types.ObjectId(categoryId),
    subcategoryId: null,
    headerId: null,
    description: "Fanta is a brand of fruit-flavored carbonated soft drinks.",
    price: 40,
    mrp: 45,
    unit: "750 ml",
    weight: "",
    brand: "Fanta",
    sku: "FA-750",
    stock: 120,
    lowStockAlert: 5,
    salePrice: 40,
    status: "active",
    approvalStatus: "approved",
    approvedAt: new Date(),
    isFeatured: false,
    tags: ["cold drink", "soft drink", "beverages"],
    deliveryTime: "10 mins",
    badge: "Chilled",
    rating: 4.1,
    isActive: true,
    variants: []
  }
];

async function runSeed() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/superfast';
    console.log(`Connecting to MongoDB at: ${mongoUri}`);
    await mongoose.connect(mongoUri);
    console.log("Connected successfully!");

    // Insert dummy products
    console.log("Inserting dummy products...");
    const inserted = await QuickProduct.insertMany(dummyProducts);
    console.log(`Successfully inserted ${inserted.length} products.`);

    // Update missing images for existing products
    const defaultPlaceholder = "https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/1210a.jpg";
    
    console.log("Checking for products with missing images...");
    const updateResult = await QuickProduct.updateMany(
      {
        $or: [
          { image: { $in: [null, ""] } },
          { image: { $exists: false } }
        ]
      },
      {
        $set: { image: defaultPlaceholder }
      }
    );
    
    console.log(`Updated ${updateResult.modifiedCount} existing products with a placeholder image.`);
    
  } catch (error) {
    console.error("Error during seeding process:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

runSeed();
