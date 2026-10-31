/**
 * Fills a missing/broken category image from the category's own food items.
 *
 *  - Only categories whose image is empty or a placeholder (e.g. "def.png") are touched.
 *  - The image comes from the newest approved item in that category that has one;
 *    a parent category with no items of its own falls back to its subcategories' items.
 *  - Categories that already have a real image are never changed.
 *  - Backup JSON is written before --apply (undo with --restore <file>).
 *
 * Usage (from Backend/):
 *   node scripts/fill-category-images.js            (dry run)
 *   node scripts/fill-category-images.js --apply
 *   node scripts/fill-category-images.js --restore <backup.json>
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB, disconnectDB } from "../src/config/db.js";
import { FoodCategory } from "../src/modules/food/admin/models/category.model.js";
import { FoodItem } from "../src/modules/food/admin/models/food.model.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const restoreIdx = args.indexOf("--restore");
const restoreFile = restoreIdx >= 0 ? args[restoreIdx + 1] : undefined;

const isRealImage = (v) => {
  const s = String(v || "").trim();
  if (!s) return false;
  // Real images are URLs or paths (uploads/...). A bare filename like "2025-11-04-abc.png" is a leftover
  // from an old import and does not exist on the server.
  return s.includes("/");
};

const run = async () => {
  await connectDB();
  try {
    if (restoreFile) {
      const rows = JSON.parse(fs.readFileSync(restoreFile, "utf8"));
      for (const r of rows) await FoodCategory.updateOne({ _id: r._id }, { $set: { image: r.oldImage } });
      console.log(`Restored ${rows.length} categories`);
      return;
    }

    const categories = await FoodCategory.find({}).lean();
    const childrenOf = new Map();
    for (const c of categories) {
      if (c.parentId) {
        const k = String(c.parentId);
        childrenOf.set(k, [...(childrenOf.get(k) || []), String(c._id)]);
      }
    }

    const imageFromItems = async (ids) => {
      const item = await FoodItem.findOne({
        categoryId: { $in: ids },
        approvalStatus: "approved",
        image: { $exists: true, $ne: "" },
      })
        .sort({ createdAt: -1 })
        .select("image")
        .lean();
      return item && isRealImage(item.image) ? item.image : "";
    };

    const changes = [];
    const missing = [];
    for (const c of categories) {
      if (c.isActive === false || isRealImage(c.image)) continue;
      const id = String(c._id);
      let image = await imageFromItems([id]);
      if (!image) image = await imageFromItems(childrenOf.get(id) || []);
      if (!image) {
        // Items of this dish may sit under another category (after merges): match by item name.
        const esc = String(c.name || "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const item = esc
          ? await FoodItem.findOne({ name: new RegExp(esc, "i"), approvalStatus: "approved", image: { $regex: "/" } })
              .sort({ createdAt: -1 }).select("image").lean()
          : null;
        if (item && isRealImage(item.image)) image = item.image;
      }
      if (image) changes.push({ _id: id, name: c.name, oldImage: c.image || "", newImage: image });
      else missing.push(c.name);
    }

    console.log(`Will set image on ${changes.length} categories:`);
    changes.forEach((c) => console.log(`  ${c.name}  <-  ${c.newImage}`));
    console.log(`No item image available for ${missing.length}: ${missing.join(", ") || "-"}`);

    if (!apply) return console.log("\nDry run only. Re-run with --apply to save.");

    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "category-merge-backups");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `fill-category-images-backup-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(changes, null, 2));
    for (const c of changes) await FoodCategory.updateOne({ _id: c._id }, { $set: { image: c.newImage } });
    console.log(`\nUpdated ${changes.length} categories. Backup: ${file}`);
  } finally {
    await disconnectDB();
  }
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
