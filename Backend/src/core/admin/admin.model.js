import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from '../../config/env.js';

const adminSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },
        password: {
            type: String,
            required: true
        },
        name: { type: String, trim: true, default: '' },
        phone: { type: String, trim: true, default: '' },
        profileImage: { type: String, trim: true, default: '' },
        fcmTokens: {
            type: [String],
            default: []
        },
        fcmTokenMobile: {
            type: [String],
            default: []
        },

        role: {
            type: String,
            enum: ['ADMIN', 'SUB_ADMIN'],
            default: 'ADMIN'
        },
        isActive: {
            type: Boolean,
            default: true
        },
        servicesAccess: {
            type: [String],
            enum: ['food', 'quickCommerce'],
            default: ['food']
        },
        adminLevel: {
            type: String,
            enum: ['PLATFORM_SUPERADMIN', 'FOOD_SUPERADMIN', 'QUICK_COMMERCE_SUPERADMIN', 'SUB_ADMIN'],
            default: 'SUB_ADMIN'
        },
        permissions: {
            type: [String],
            default: []
        },
        food_zone_ids: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodZone'
        }],
        quick_commerce_zone_ids: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'QuickCommerceZone'
        }],
        parentAdminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodAdmin',
            default: null
        }
    },
    {
        collection: 'common_admins',
        timestamps: true
    }
);

adminSchema.index({ servicesAccess: 1 });
adminSchema.index({ parentAdminId: 1 });
// Enforce max ONE Food Superadmin and ONE QC Superadmin at the DB level
adminSchema.index(
    { adminLevel: 1 },
    { unique: true, partialFilterExpression: { adminLevel: { $in: ['FOOD_SUPERADMIN', 'QUICK_COMMERCE_SUPERADMIN'] } } }
);

adminSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        return next();
    }

    const salt = await bcrypt.genSalt(config.bcryptSaltRounds);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

adminSchema.methods.comparePassword = function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

export const FoodAdmin = mongoose.model('FoodAdmin', adminSchema, 'common_admins');

