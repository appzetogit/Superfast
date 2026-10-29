/**
 * Deletes every Indore-zone restaurant (and its food items) EXCEPT "Apna sweets", and every quick
 * product of sellers in the Indore quick zone. Users, delivery partners, sellers, orders and quick
 * categories are NOT touched.
 *
 * Everything that will be deleted is first saved to a JSON backup file.
 *
 * Usage:
 *   node scripts/cleanup-indore-zone.js <backup-dir>           (dry run, writes nothing)
 *   node scripts/cleanup-indore-zone.js <backup-dir> --apply   (backup, then delete)
 */
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { EJSON } from "bson";
import { connectDB, disconnectDB } from "../src/config/db.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const backupDir = args.find((a) => !a.startsWith("--"));
const KEEP_RESTAURANT_ID = "6a6848268979d0df57c8922d"; // Apna sweets
const FOOD_ZONE_ID = "6a369527ab735b9a83e84145"; // Indore (food)
const QUICK_ZONE_ID = "6a369965ab735b9a83e844b2"; // Indore (quick)

if (!backupDir) {
  console.error("Usage: node scripts/cleanup-indore-zone.js <backup-dir> [--apply]");
  process.exit(1);
}
const oid = (v) => new mongoose.Types.ObjectId(v);

const run = async () => {
  await connectDB();
  try {
    const db = mongoose.connection.db;

    const keep = await db.collection("food_restaurants").findOne({ _id: oid(KEEP_RESTAURANT_ID) });
    if (!keep || !/apna\s*sweets/i.test(keep.restaurantName || "")) {
      throw new Error("Safety check failed: keep-restaurant is not 'Apna sweets'");
    }

    const restaurants = await db
      .collection("food_restaurants")
      .find({ zoneId: oid(FOOD_ZONE_ID), _id: { $ne: oid(KEEP_RESTAURANT_ID) } })
      .toArray();
    const restaurantIds = restaurants.map((r) => r._id);
    const foodItems = await db.collection("food_items").find({ restaurantId: { $in: restaurantIds } }).toArray();

    const sellers = await db
      .collection("quick_sellers")
      .find({ "shopInfo.zoneId": oid(QUICK_ZONE_ID) })
      .project({ shopName: 1 })
      .toArray();
    const quickProducts = await db
      .collection("quick_products")
      .find({ sellerId: { $in: sellers.map((s) => s._id) } })
      .toArray();

    console.log(`Keeping: ${keep.restaurantName} (${keep._id})`);
    console.log(`Restaurants to delete: ${restaurants.length}`);
    restaurants.forEach((r) => console.log(`  ${r._id} ${JSON.stringify(r.restaurantName)}`));
    console.log(`Food items to delete: ${foodItems.length}`);
    console.log(`Quick products to delete: ${quickProducts.length} (sellers kept: ${sellers.length})`);
    quickProducts.forEach((p) => console.log(`  ${p._id} ${JSON.stringify(p.name)}`));

    if (!apply) {
      console.log("\nDRY RUN - nothing was written or deleted. Re-run with --apply.");
      return;
    }

    fs.mkdirSync(backupDir, { recursive: true });
    const backupFile = path.join(backupDir, `indore-cleanup-backup-${Date.now()}.json`);
    fs.writeFileSync(
      backupFile,
      EJSON.stringify({ restaurants, foodItems, quickProducts }, null, 2, { relaxed: false }),
    );
    console.log(`Backup written: ${backupFile}`);

    const r1 = await db.collection("food_items").deleteMany({ restaurantId: { $in: restaurantIds } });
    const r2 = await db.collection("food_restaurants").deleteMany({ _id: { $in: restaurantIds } });
    const r3 = await db.collection("quick_products").deleteMany({ _id: { $in: quickProducts.map((p) => p._id) } });
    console.log(`Deleted: ${r1.deletedCount} food items, ${r2.deletedCount} restaurants, ${r3.deletedCount} quick products`);
  } finally {
    await disconnectDB();
  }
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
