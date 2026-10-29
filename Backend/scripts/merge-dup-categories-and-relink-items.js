/**
 * 1. Food: merges the two global "South Indian" categories (items are moved, none deleted;
 *    the duplicate is only deactivated).
 * 2. Quick: deactivates the empty duplicate "grocery" category (no products, no children).
 * 3. Food: food items whose category record is missing or empty are re-linked, by their saved
 *    categoryName, to the matching active global category. Items with no match are left alone.
 *
 * A JSON backup of every food item that changes (id + previous categoryId/categoryName) is written first.
 *
 * Usage:
 *   node scripts/merge-dup-categories-and-relink-items.js <backup-dir>           (dry run)
 *   node scripts/merge-dup-categories-and-relink-items.js <backup-dir> --apply
 */
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { EJSON } from "bson";
import { connectDB, disconnectDB } from "../src/config/db.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const backupDir = args.find((a) => !a.startsWith("--"));
if (!backupDir) {
  console.error("Usage: node scripts/merge-dup-categories-and-relink-items.js <backup-dir> [--apply]");
  process.exit(1);
}

const KEEP_SOUTH_INDIAN = "348a1f67a4536910e0895f00"; // older, scope Both
const DUP_SOUTH_INDIAN = "6a437418c9e5e4596a54ede5";
const EMPTY_QUICK_GROCERY = "6a88478d52663077b501018e";
const oid = (v) => new mongoose.Types.ObjectId(v);
const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

const run = async () => {
  await connectDB();
  try {
    const db = mongoose.connection.db;
    const fc = db.collection("food_categories");
    const fi = db.collection("food_items");
    const qc = db.collection("quick_categories");
    const qp = db.collection("quick_products");

    // ---- 1. South Indian
    const keep = await fc.findOne({ _id: oid(KEEP_SOUTH_INDIAN) });
    const dup = await fc.findOne({ _id: oid(DUP_SOUTH_INDIAN) });
    if (!keep || !dup || norm(keep.name) !== "south indian" || norm(dup.name) !== "south indian") {
      throw new Error("Safety check failed: south indian categories not as expected");
    }
    const southItems = await fi.find({ categoryId: dup._id }).project({ categoryId: 1, categoryName: 1 }).toArray();
    console.log(`South Indian: move ${southItems.length} item(s) from ${dup._id} into ${keep._id}, deactivate ${dup._id}`);

    // ---- 2. Quick grocery
    const g = await qc.findOne({ _id: oid(EMPTY_QUICK_GROCERY) });
    const gProducts = await qp.countDocuments({
      $or: [{ categoryId: g?._id }, { subcategoryId: g?._id }, { headerId: g?._id }],
    });
    const gKids = await qc.countDocuments({ parentId: g?._id });
    const gOk = g && norm(g.name) === "grocery" && gProducts === 0 && gKids === 0;
    console.log(`Quick grocery ${EMPTY_QUICK_GROCERY}: products=${gProducts} children=${gKids} -> ${gOk ? "deactivate" : "SKIP (not empty)"}`);

    // ---- 3. Re-link stranded food items
    const allCats = await fc.find({}).project({ name: 1, isActive: 1, restaurantId: 1, zoneId: 1 }).toArray();
    const existing = new Set(allCats.map((c) => String(c._id)));
    const globalActive = allCats.filter((c) => c.isActive !== false && !c.restaurantId);
    const byName = new Map();
    for (const c of globalActive) {
      const k = norm(c.name);
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k).push(c);
    }
    const southKeepName = norm(keep.name);
    const stranded = await fi
      .find({
        $or: [{ categoryId: null }, { categoryId: { $exists: false } }, { categoryId: { $nin: [...existing].map(oid) } }],
      })
      .project({ categoryId: 1, categoryName: 1, restaurantId: 1 })
      .toArray();

    const plan = [];
    const unmatched = {};
    for (const it of stranded) {
      const matches = byName.get(norm(it.categoryName)) || [];
      // only link when the match is unambiguous (and never to the duplicate we are deactivating)
      const usable = matches.filter((m) => String(m._id) !== String(dup._id));
      if (usable.length === 1) plan.push({ it, target: usable[0] });
      else unmatched[it.categoryName || "(blank)"] = (unmatched[it.categoryName || "(blank)"] || 0) + 1;
    }
    const summary = {};
    plan.forEach(({ it, target }) => {
      const k = `${it.categoryName} -> ${target.name}`;
      summary[k] = (summary[k] || 0) + 1;
    });
    console.log(`\nStranded food items: ${stranded.length} | will re-link: ${plan.length}`);
    console.log("Re-link summary:", JSON.stringify(summary));
    console.log("Left alone (no single matching category):", JSON.stringify(unmatched));
    void southKeepName;

    if (!apply) {
      console.log("\nDRY RUN - nothing was written. Re-run with --apply.");
      return;
    }

    fs.mkdirSync(backupDir, { recursive: true });
    const backupFile = path.join(backupDir, `category-merge-backup-${Date.now()}.json`);
    fs.writeFileSync(
      backupFile,
      EJSON.stringify(
        {
          southIndianItems: southItems,
          relinked: plan.map(({ it }) => ({ _id: it._id, categoryId: it.categoryId ?? null, categoryName: it.categoryName ?? "" })),
          southIndianDup: dup,
          quickGrocery: g,
        },
        null,
        2,
        { relaxed: false },
      ),
    );
    console.log(`Backup written: ${backupFile}`);

    await fc.updateOne({ _id: keep._id }, { $set: { name: "South Indian", foodTypeScope: "Both", isActive: true } });
    const m = await fi.updateMany({ categoryId: dup._id }, { $set: { categoryId: keep._id, categoryName: "South Indian" } });
    await fc.updateOne({ _id: dup._id }, { $set: { isActive: false } });
    console.log(`South Indian: moved ${m.modifiedCount} item(s), deactivated duplicate`);

    if (gOk) {
      await qc.updateOne({ _id: g._id }, { $set: { isActive: false, status: "inactive" } });
      console.log("Quick grocery duplicate deactivated");
    }

    let relinked = 0;
    for (const { it, target } of plan) {
      const r = await fi.updateOne({ _id: it._id }, { $set: { categoryId: target._id, categoryName: target.name } });
      relinked += r.modifiedCount;
    }
    console.log(`Re-linked ${relinked} food item(s)`);
  } finally {
    await disconnectDB();
  }
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
