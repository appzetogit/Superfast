/**
 * Merges duplicate global "Pizza" categories (pizza / PIZZA / Pizza ...) into ONE admin category
 * and moves a restaurant's pizza foods into it.
 *
 *  - The oldest global category named "pizza" (any case) is kept, renamed to "Pizza", scope "Both".
 *  - Foods of the other same-named global categories (all restaurants) are moved into it.
 *  - Those duplicate categories are NOT deleted: they are only deactivated (isActive=false),
 *    so nothing referencing them breaks and it is reversible.
 *  - The given restaurant's foods with "pizza" in the name are also moved into it.
 *
 * Usage:
 *   node scripts/consolidate-restaurant-pizza-category.js "Niroj Pizzeria"           (dry run, writes nothing)
 *   node scripts/consolidate-restaurant-pizza-category.js "Niroj Pizzeria" --apply   (writes)
 */
import { connectDB, disconnectDB } from "../src/config/db.js";
import { FoodRestaurant } from "../src/modules/food/restaurant/models/restaurant.model.js";
import { FoodCategory } from "../src/modules/food/admin/models/category.model.js";
import { FoodItem } from "../src/modules/food/admin/models/food.model.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const restaurantName = args.filter((a) => !a.startsWith("--")).join(" ").trim();
const CATEGORY_NAME = "Pizza";

if (!restaurantName) {
  console.error('Usage: node scripts/consolidate-restaurant-pizza-category.js "<restaurant name>" [--apply]');
  process.exit(1);
}

const escapeRegex = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const run = async () => {
  await connectDB();
  try {
    const restaurants = await FoodRestaurant.find({
      restaurantName: new RegExp(escapeRegex(restaurantName), "i"),
    }).select("restaurantName").lean();
    if (restaurants.length !== 1) {
      console.error(`Expected exactly 1 restaurant matching "${restaurantName}", found ${restaurants.length}`);
      restaurants.forEach((r) => console.error(`  ${r._id}  ${r.restaurantName}`));
      process.exitCode = 1;
      return;
    }
    const restaurant = restaurants[0];
    console.log(`Restaurant: ${restaurant.restaurantName} (${restaurant._id})`);

    const pizzaCats = await FoodCategory.find({
      name: new RegExp(`^\\s*${escapeRegex(CATEGORY_NAME)}\\s*$`, "i"),
      restaurantId: { $exists: false },
    }).sort({ createdAt: 1 }).lean();
    if (!pizzaCats.length) {
      console.error("No global pizza category found - nothing to merge into.");
      process.exitCode = 1;
      return;
    }
    const [keep, ...dupes] = pizzaCats;
    console.log(`KEEP  ${keep._id} "${keep.name}" scope=${keep.foodTypeScope} -> renamed "${CATEGORY_NAME}", scope Both`);

    let totalToMove = 0;
    for (const d of dupes) {
      const n = await FoodItem.countDocuments({ categoryId: d._id });
      totalToMove += n;
      console.log(`MERGE ${d._id} "${d.name}" scope=${d.foodTypeScope} items=${n} -> move items to kept, deactivate category`);
    }

    const otherIds = [keep._id, ...dupes.map((d) => d._id)];
    const restaurantExtra = await FoodItem.find({
      restaurantId: restaurant._id,
      name: /pizza/i,
      categoryId: { $nin: otherIds },
    }).select("name categoryName").lean();
    console.log(`Restaurant foods with "pizza" in name outside these categories: ${restaurantExtra.length}`);
    restaurantExtra.forEach((i) => console.log(`  ${i._id} "${i.name}" (was: "${i.categoryName || ""}")`));
    console.log(`Total foods that change category: ${totalToMove + restaurantExtra.length}`);

    if (!apply) {
      console.log("\nDRY RUN - nothing was written. Re-run with --apply to make these changes.");
      return;
    }

    await FoodCategory.updateOne(
      { _id: keep._id },
      { $set: { name: CATEGORY_NAME, foodTypeScope: "Both", isActive: true, approvalStatus: "approved", isApproved: true } },
    );
    for (const d of dupes) {
      const res = await FoodItem.updateMany(
        { categoryId: d._id },
        { $set: { categoryId: keep._id, categoryName: CATEGORY_NAME } },
      );
      await FoodCategory.updateOne({ _id: d._id }, { $set: { isActive: false } });
      console.log(`Moved ${res.modifiedCount} item(s) from ${d._id}, deactivated it`);
    }
    if (restaurantExtra.length) {
      const res = await FoodItem.updateMany(
        { _id: { $in: restaurantExtra.map((i) => i._id) } },
        { $set: { categoryId: keep._id, categoryName: CATEGORY_NAME } },
      );
      console.log(`Moved ${res.modifiedCount} restaurant item(s)`);
    }
    console.log("Done.");
  } finally {
    await disconnectDB();
  }
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
