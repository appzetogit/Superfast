import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGODB_URL || process.env.DATABASE_URL;

if (!mongoUri) {
  console.error("Missing MONGO_URI in environment variables.");
  process.exit(1);
}

async function run() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB successfully.");

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    const commonUsersCollection = db.collection('common_users');
    const ordersCollection = db.collection('food_orders');
    const restaurantsCollection = db.collection('food_restaurants');

    const targetPhone = "7354126134";
    const phoneRegex = new RegExp(targetPhone);

    // 1. Find user by phone
    const users = await usersCollection.find({ phone: phoneRegex }).toArray();
    const commonUsers = await commonUsersCollection.find({ phone: phoneRegex }).toArray();
    
    const allMatchingUsers = [...users, ...commonUsers];
    const userIds = allMatchingUsers.map(u => u._id);
    
    console.log(`Found ${allMatchingUsers.length} user record(s) for phone ${targetPhone}. IDs:`, userIds);

    // 2. Find restaurant for "Apna sweets"
    const restaurants = await restaurantsCollection.find({
      $or: [
        { name: { $regex: /apna sweets/i } },
        { restaurantName: { $regex: /apna sweets/i } },
        { name: { $regex: /apna/i } },
        { restaurantName: { $regex: /apna/i } }
      ]
    }).toArray();

    const restaurantIds = restaurants.map(r => r._id);
    console.log(`Found ${restaurants.length} restaurant(s) matching 'Apna sweets':`, restaurants.map(r => r.name || r.restaurantName));

    // 3. Query all food orders for this user & phone
    const query = {
      $or: [
        { userId: { $in: userIds } },
        { "deliveryAddress.phone": phoneRegex }
      ]
    };

    const userOrders = await ordersCollection.find(query).sort({ createdAt: -1 }).toArray();
    console.log(`Total orders found for phone ${targetPhone}: ${userOrders.length}`);

    // Filter "Apna sweets" orders
    const apnaSweetsOrders = userOrders.filter(order => {
      const isRestMatch = restaurantIds.some(rId => String(rId) === String(order.restaurantId));
      const isItemMatch = order.items && order.items.some(item => item.sourceName && /apna/i.test(item.sourceName));
      return isRestMatch || isItemMatch;
    });

    console.log(`Found ${apnaSweetsOrders.length} 'Apna sweets' order(s) for phone ${targetPhone}:`);
    apnaSweetsOrders.forEach((o, index) => {
      console.log(`[${index + 1}] Order ID: ${o.orderId || o._id}, Status: ${o.orderStatus}, Placed: ${o.createdAt}`);
    });

    if (apnaSweetsOrders.length <= 1) {
      console.log("No extra 'Apna sweets' orders to remove (1 or 0 orders found).");
      process.exit(0);
    }

    // Keep 1 order (the latest one index 0), remove the rest
    const keepOrder = apnaSweetsOrders[0];
    const deleteOrders = apnaSweetsOrders.slice(1);
    const deleteOrderIds = deleteOrders.map(o => o._id);

    console.log(`\nKeeping 1 Order: ${keepOrder.orderId || keepOrder._id} (Placed on: ${keepOrder.createdAt})`);
    console.log(`Deleting ${deleteOrders.length} order(s):`, deleteOrders.map(o => o.orderId || o._id));

    const result = await ordersCollection.deleteMany({ _id: { $in: deleteOrderIds } });
    console.log(`\nSuccessfully deleted ${result.deletedCount} order(s) from database.`);

  } catch (err) {
    console.error("Error executing cleanup script:", err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
