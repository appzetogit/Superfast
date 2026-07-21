import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { config } from '../src/config/env.js';

dotenv.config();

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
const isDryRun = process.argv.includes('--dry-run');

// Determine target base URL from command line arg (--url https://api.mydomain.com/images) or config
const urlArgIndex = process.argv.indexOf('--url');
const targetBaseUrl = (urlArgIndex !== -1 && process.argv[urlArgIndex + 1])
    ? process.argv[urlArgIndex + 1].replace(/\/$/, '')
    : config.vpsImageUrl;

const shouldReplaceLocalhost = (value) =>
    typeof value === 'string' &&
    (value.includes('http://localhost:5000') || value.includes('http://127.0.0.1:5000'));

const replaceUrl = (url) => {
    return url
        .replace(/^http:\/\/localhost:5000\/uploads/, targetBaseUrl)
        .replace(/^http:\/\/localhost:5000\/images/, targetBaseUrl)
        .replace(/^http:\/\/127\.0\.0\.1:5000\/uploads/, targetBaseUrl)
        .replace(/^http:\/\/127\.0\.0\.1:5000\/images/, targetBaseUrl);
};

const processDocument = async (doc, collectionName, db) => {
    let updatesCount = 0;
    const updates = {};

    const traverseAndProcess = async (val, currentPath = '') => {
        if (typeof val === 'string') {
            if (shouldReplaceLocalhost(val)) {
                const newUrl = replaceUrl(val);
                if (newUrl !== val) {
                    updates[currentPath] = newUrl;
                    updatesCount++;
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
    if (!uri) {
        console.error('Error: Missing MONGO_URI in environment variables.');
        process.exit(1);
    }

    console.log(`=== Starting Localhost URL Migration ===`);
    console.log(`Target Base URL: ${targetBaseUrl}`);
    console.log(`Mode: ${isDryRun ? 'DRY-RUN (No changes saved)' : 'LIVE (Updating MongoDB)'}\n`);

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
                console.log(`[${isDryRun ? 'DRY-RUN' : 'UPDATED'}] Collection: ${colName} | ID: ${doc._id}`);
                Object.entries(updates).forEach(([k, v]) => console.log(`  - ${k}: -> ${v}`));
            }
        }
    }

    console.log(`\n======================================================`);
    console.log(`${isDryRun ? 'Dry run complete!' : 'Migration complete!'}`);
    console.log(`Total Documents Updated: ${totalDocsChanged}`);
    console.log(`Total URL Fields Updated: ${totalFieldsChanged}`);
    console.log(`======================================================\n`);
};

run().catch(console.error).finally(() => mongoose.disconnect());
