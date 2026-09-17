import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

const run = async () => {
  if (!uri) throw new Error('Missing MONGO_URI');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const collection = db.collection('food_landing_settings');
  const docs = await collection.find({}).toArray();
  console.log(`Found ${docs.length} landing settings docs`);

  for (const doc of docs) {
    let updateObj = {};
    if (typeof doc.headerVideoUrl === 'string' && doc.headerVideoUrl.includes('cloudinary.com')) {
      const parts = doc.headerVideoUrl.split('/upload/');
      if (parts.length === 2) {
        const relativePath = parts[1].split('/').filter(seg => !seg.match(/^[a-z]_[^/]+$/) && !seg.match(/^v\d+$/)).join('/');
        const newUrl = `http://localhost:5000/uploads/${relativePath}`;
        updateObj.headerVideoUrl = newUrl;
        console.log(`Updating headerVideoUrl from ${doc.headerVideoUrl} to ${newUrl}`);
      }
    }
    if (Object.keys(updateObj).length > 0) {
      await collection.updateOne({ _id: doc._id }, { $set: updateObj });
    }
  }

  console.log('Landing settings fix completed');
  await mongoose.disconnect();
};

run().catch(console.error);
