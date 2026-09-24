import mongoose from 'mongoose';

const deliveryFeeRangeSchema = new mongoose.Schema(
    {
        min: { type: Number, required: true, min: 0 },
        max: { type: Number, required: true, min: 0 },
        fee: { type: Number, required: true, min: 0 },
        zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodZone', default: null }
    },
    { _id: false }
);

const zoneDeliveryFeeSchema = new mongoose.Schema(
    {
        zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodZone', required: true },
        deliveryFee: { type: Number, min: 0 },
        perKmDeliveryFee: { type: Number, min: 0 }
    },
    { _id: false }
);

const feeSettingsSchema = new mongoose.Schema(
    {
        // No defaults here; admin must explicitly configure values.
        deliveryFee: { type: Number, min: 0 },
        perKmDeliveryFee: { type: Number, min: 0 },
        deliveryFeeRanges: { type: [deliveryFeeRangeSchema], default: [] },
        zoneDeliveryFees: { type: [zoneDeliveryFeeSchema], default: [] },
        freeDeliveryThreshold: { type: Number, min: 0 },
        platformFee: { type: Number, min: 0 },
        gstRate: { type: Number, min: 0, max: 100 },
        mixedOrderDistanceLimit: { type: Number, min: 0, default: 2 },
        mixedOrderAngleLimit: { type: Number, min: 0, default: 35 },
        isIncentiveEnabled: { type: Boolean, default: false },
        incentiveThreshold: { type: Number, min: 0 },
        incentivePercentage: { type: Number, min: 0 },
        // Feature Toggles (Enable/Disable individual fee calculation modes)
        enableRangeFee: { type: Boolean, default: true },
        enablePerKmFee: { type: Boolean, default: true },
        enableZoneFees: { type: Boolean, default: true },
        enableDefaultFee: { type: Boolean, default: true },
        // Advance Settings (Distance-based fee)
        enableDistanceBasedFee: { type: Boolean, default: false },
        baseDistanceKm: { type: Number, min: 0, default: 1 },
        baseDistanceFee: { type: Number, min: 0, default: 0 },
        extraFeePerKm: { type: Number, min: 0, default: 0 },
        isActive: { type: Boolean, default: true, index: true }
    },
    { collection: 'food_fee_settings', timestamps: true }
);

feeSettingsSchema.index({ isActive: 1, createdAt: -1 });

export const FoodFeeSettings = mongoose.model('FoodFeeSettings', feeSettingsSchema, 'food_fee_settings');


