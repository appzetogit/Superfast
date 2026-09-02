import mongoose from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns';
import { connectDB, disconnectDB } from '../src/config/db.js';

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {}

const backupDir = path.join(process.cwd(), 'db_backup', `backup_${Date.now()}`);

async function backupDatabase() {
  console.log('🔄 Connecting to MongoDB...');
  await connectDB();
  console.log('✅ Connected to MongoDB.');

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  console.log(`📦 Found ${collections.length} collections. Exporting to ${backupDir}...`);

  for (const col of collections) {
    const colName = col.name;
    const documents = await db.collection(colName).find({}).toArray();
    const filePath = path.join(backupDir, `${colName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(documents, null, 2), 'utf-8');
    console.log(`  ✓ Exported ${documents.length} docs from [${colName}] -> ${path.basename(filePath)}`);
  }

  console.log('\n🎉 Backup Completed Successfully!');
  console.log(`📁 Backup Folder Path: ${backupDir}`);

  await disconnectDB();
  process.exit(0);
}

backupDatabase().catch(async (err) => {
  console.error('❌ Backup Failed:', err);
  try {
    await disconnectDB();
  } catch {}
  process.exit(1);
});
