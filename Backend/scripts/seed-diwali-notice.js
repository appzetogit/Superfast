import dns from 'node:dns'; dns.setServers(['8.8.8.8','1.1.1.1']);
import 'dotenv/config';
import mongoose from 'mongoose';
import { GlobalSettings } from '../src/modules/common/models/settings.model.js';

const notice = {
  title: 'Happy Diwali! 🪔✨',
  message:
    'Restaurants are closed for Diwali right now. We will be back very soon!\nWishing you and your family a very Happy Diwali 🎆🪔',
  theme: 'diwali',
};

await mongoose.connect(process.env.MONGODB_URI);
const before = await GlobalSettings.findOne().lean();
console.log('modules before:', before?.modules);
const res = await GlobalSettings.findOneAndUpdate(
  {},
  { $set: { 'moduleNotices.food': notice, 'moduleNotices.quickCommerce': notice } },
  { new: true }
).lean();
console.log('modules now:', res.modules);
console.log('notices:', JSON.stringify(res.moduleNotices, null, 2));
await mongoose.disconnect();
