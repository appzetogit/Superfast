import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { toRelativeUrl } from '../src/utils/urlHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
const isDryRun = process.argv.includes('--dry-run');

/**
 * Checks if a string value is an absolute URL pointing to our domain/localhost/vps
 * or starts with a leading slash for our storage directories (/uploads, /images)
 * that should be converted to a clean relative path.
 */
const shouldConvertToRelative = (val) => {
    if (typeof val !== 'string') return false;
    const trimmed = val.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined' || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
        return false;
    }

    // Check absolute domain/localhost prefixes
    if (/^https?:\/\/(localhost|127\.0\.0\.1|superfastfood\.in)(?::\d+)?(\/.*)?$/i.test(trimmed)) {
        return true;
    }

    // Check if external domain URL contains our known storage dirs `/uploads/` or `/images/` right after domain
    if (/^https?:\/\/[^\/]+\/(uploads|images)\//i.test(trimmed)) {
        return true;
    }

    // Check if it starts with leading slash /uploads or /images
    if (/^\/(uploads|images)\//i.test(trimmed)) {
        return true;
    }

    return false;
};

const processDocument = async (doc, collectionName, db) => {
    let updatesCount = 0;
    const updates = {};

    const traverseAndProcess = async (val, currentPath = '') => {
        if (typeof val === 'string') {
            if (shouldConvertToRelative(val)) {
                const relativePath = toRelativeUrl(val);
                if (relativePath !== val && relativePath !== '') {
                    updates[currentPath] = relativePath;
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
        console.error('Error: Missing MONGO_URI or MONGODB_URI in environment variables.');
        process.exit(1);
    }

    console.log(`=== Starting Migration: Converting Absolute/Leading-Slash URLs to Relative Paths ===`);
    console.log(`MongoDB URI: ${uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`); // hide password if any
    console.log(`Mode: ${isDryRun ? 'DRY-RUN (No changes saved to database)' : 'LIVE (Updating MongoDB)'}\n`);

    await mongoose.connect(uri);
    const db = mongoose.connection.db;

    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    const targetCollections = collections.map(c => c.name).filter(n => !n.startsWith('system.'));

    let totalDocsChanged = 0;
    let totalFieldsChanged = 0;
    let collectionsProcessed = 0;

    for (const colName of targetCollections) {
        collectionsProcessed++;
        let colDocsChanged = 0;
        let colFieldsChanged = 0;

        const cursor = db.collection(colName).find({});
        while (await cursor.hasNext()) {
            const doc = await cursor.next();
            const { updatesCount, updates } = await processDocument(doc, colName, db);

            if (updatesCount > 0) {
                totalDocsChanged++;
                colDocsChanged++;
                totalFieldsChanged += updatesCount;
                colFieldsChanged += updatesCount;
                console.log(`[${isDryRun ? 'DRY-RUN' : 'UPDATED'}] Collection: ${colName} | Document ID: ${doc._id}`);
                Object.entries(updates).forEach(([k, v]) => console.log(`  - ${k}: "${doc[k] || '...'}" -> "${v}"`));
            }
        }

        if (colDocsChanged > 0) {
            console.log(`---> Summary for [${colName}]: Updated ${colDocsChanged} documents (${colFieldsChanged} fields)\n`);
        }
    }

    console.log(`======================================================================`);
    console.log(`${isDryRun ? 'Dry run complete!' : 'Migration complete!'}`);
    console.log(`Total Collections Scanned: ${collectionsProcessed}`);
    console.log(`Total Documents Updated:   ${totalDocsChanged}`);
    console.log(`Total URL Fields Updated:  ${totalFieldsChanged}`);
    console.log(`======================================================================\n`);
};

run().catch(err => {
    console.error('Migration failed with error:', err);
    process.exit(1);
}).finally(() => {
    mongoose.disconnect();
});
