/**
 * One-time seed: set all existing role=ADMIN admins to PLATFORM_SUPERADMIN.
 *
 * Run from Backend root:  node --experimental-modules src/scripts/seedPlatformAdmin.js
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/superfast';

async function main() {
    console.log('Connecting to MongoDB...', MONGO_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const result = await mongoose.connection.collection('common_admins').updateMany(
        { role: 'ADMIN', $or: [{ adminLevel: { $exists: false } }, { adminLevel: null }, { adminLevel: '' }] },
        { $set: { adminLevel: 'PLATFORM_SUPERADMIN', permissions: ['*'] } }
    );

    console.log(`Updated ${result.modifiedCount} admin(s) to PLATFORM_SUPERADMIN`);
    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
