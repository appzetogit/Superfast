import mongoose from "mongoose";
import { config } from "../src/config/env.js";
import { FoodAdmin } from "../src/core/admin/admin.model.js";

mongoose.connect(config.mongoUri).then(async () => {
    const admins = await FoodAdmin.find({}, "email role fcmTokens fcmTokenMobile isActive");
    console.log(JSON.stringify(admins, null, 2));
    process.exit(0);
});
