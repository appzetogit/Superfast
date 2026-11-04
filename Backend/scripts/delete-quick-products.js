// Deletes ONLY quick-commerce products (quick_products). Categories, sellers, orders are untouched.
// Usage:
//   node scripts/delete-quick-products.js            -> dry run (count only)
//   node scripts/delete-quick-products.js --confirm  -> backup to category-merge-backups/ then delete
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';

const confirm = process.argv.includes('--confirm');

await connectDB();
const col = mongoose.connection.collection('quick_products');
const count = await col.countDocuments({});
console.log(`quick_products total: ${count} (db: ${mongoose.connection.name})`);

if (!confirm) {
    console.log('Dry run only. Re-run with --confirm to backup + delete.');
} else if (count > 0) {
    const docs = await col.find({}).toArray();
    const dir = path.resolve(process.cwd(), '..', '..', 'category-merge-backups');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `delete-quick-products-backup-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(docs));
    console.log(`Backup written: ${file}`);
    const res = await col.deleteMany({});
    console.log(`Deleted: ${res.deletedCount}`);
}
await mongoose.disconnect();
