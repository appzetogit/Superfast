import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { processAndSaveImage } from '../src/services/storage.service.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OLD_UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
const isDryRun = process.argv.includes('--dry-run');

const shouldRewriteCloudinaryImageUrl = (value) =>
  typeof value === 'string' &&
  value.includes('/res.cloudinary.com/') &&
  value.includes('/image/upload/');

// Map a Cloudinary URL to the path of the downloaded file in our old 'uploads' dir
const getOldLocalFilePath = (cloudinaryUrl) => {
  const uploadIndex = cloudinaryUrl.indexOf('/upload/');
  if (uploadIndex === -1) return null;
  
  let relativePath = cloudinaryUrl.substring(uploadIndex + '/upload/'.length);
  const segments = relativePath.split('/');
  const filteredSegments = segments.filter(seg => !seg.match(/^[a-z]_[^/]+$/) && !seg.match(/^v\d+$/));
  
  return path.join(OLD_UPLOADS_DIR, ...filteredSegments);
};

// Determine the category folder based on the path
const determineCategoryFolder = (filePath) => {
    if (filePath.includes('menu') || filePath.includes('item') || filePath.includes('addon')) return 'menu';
    if (filePath.includes('restaurant') || filePath.includes('fssai') || filePath.includes('gst')) return 'restaurants';
    if (filePath.includes('user') || filePath.includes('profile')) return 'users';
    if (filePath.includes('banner')) return 'banners';
    if (filePath.includes('logo')) return 'logos';
    return 'misc';
};

const processDocument = async (doc, collectionName, db) => {
    let updatesCount = 0;
    const updates = {};

    const traverseAndProcess = async (val, currentPath = '') => {
        if (typeof val === 'string') {
            if (shouldRewriteCloudinaryImageUrl(val)) {
                const oldFilePath = getOldLocalFilePath(val);
                if (oldFilePath && fs.existsSync(oldFilePath)) {
                    if (isDryRun) {
                        updates[currentPath] = `[DRY RUN] Will process and move to VPS storage`;
                        updatesCount++;
                    } else {
                        try {
                            const buffer = fs.readFileSync(oldFilePath);
                            const category = determineCategoryFolder(oldFilePath);
                            const newUrl = await processAndSaveImage(buffer, category);
                            updates[currentPath] = newUrl;
                            updatesCount++;
                        } catch (err) {
                            console.error(`Failed to process ${oldFilePath}:`, err.message);
                        }
                    }
                } else {
                    console.warn(`File not found locally: ${oldFilePath}`);
                }
            }
        } else if (Array.isArray(val)) {
            for (let i = 0; i < val.length; i++) {
                await traverseAndProcess(val[i], currentPath ? `${currentPath}.${i}` : String(i));
            }
        } else if (val && typeof val === 'object' && !(val instanceof Date) && !(val instanceof mongoose.Types.ObjectId)) {
            for (const [k, v] of Object.entries(val)) {
                if (k !== '_id') {
                    await traverseAndProcess(v, currentPath ? `${currentPath}.${k}` : k);
                }
            }
        }
    };

    await traverseAndProcess(doc);

    if (updatesCount > 0 && !isDryRun) {
        await db.collection(collectionName).updateOne({ _id: doc._id }, { $set: updates });
    }

    return { updatesCount, updates };
};

const run = async () => {
    if (!uri) throw new Error('Missing MONGO_URI');
    await mongoose.connect(uri);
    const db = mongoose.connection.db;

    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    const targetCollections = collections.map(c => c.name).filter(n => !n.startsWith('system.'));

    let totalDocsChanged = 0;
    let totalFieldsChanged = 0;

    for (const colName of targetCollections) {
        const cursor = db.collection(colName).find({});
        while (await cursor.hasNext()) {
            const doc = await cursor.next();
            const { updatesCount, updates } = await processDocument(doc, colName, db);
            
            if (updatesCount > 0) {
                totalDocsChanged++;
                totalFieldsChanged += updatesCount;
                console.log(`[${isDryRun ? 'DRY-RUN' : 'UPDATED'}] ${colName} ${doc._id}`);
                Object.entries(updates).forEach(([k, v]) => console.log(`  - ${k} -> ${v}`));
            }
        }
    }

    console.log(`\n${isDryRun ? 'Dry run complete' : 'Migration complete'}: changedDocs=${totalDocsChanged}, changedFields=${totalFieldsChanged}`);
};

run().catch(console.error).finally(() => mongoose.disconnect());
