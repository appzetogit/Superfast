
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const coll = mongoose.connection.collection('quick_products');
  const p1 = await coll.findOne({ sellerId: { $exists: true } });
  console.log('p1:', p1);
  const p2 = await coll.findOne({ sellerId: { $exists: false } });
  console.log('p2 exists:', !!p2);
  process.exit(0);
}).catch(console.error);

