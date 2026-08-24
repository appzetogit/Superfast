import mongoose from 'mongoose';

const tierSchema = new mongoose.Schema(
  {
    ordersCount: { type: Number, required: true, min: 1 },
    bonusAmount: { type: Number, required: true, min: 0 },
    title: { type: String, default: '' },
  },
  { _id: false }
);

const deliveryTargetRuleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, default: 'Daily Target Bonus' },
    period: { type: String, enum: ['daily', 'weekly'], default: 'daily' },
    tiers: {
      type: [tierSchema],
      default: [
        { ordersCount: 5, bonusAmount: 50, title: 'Tier 1' },
        { ordersCount: 10, bonusAmount: 120, title: 'Tier 2' },
        { ordersCount: 15, bonusAmount: 200, title: 'Tier 3' },
      ],
    },
    isActive: { type: Boolean, default: true },
    description: { type: String, default: 'Complete orders today to earn extra bonus rewards!' },
  },
  { timestamps: true, collection: 'food_delivery_target_rules' }
);

deliveryTargetRuleSchema.index({ period: 1, isActive: 1 });

export const DeliveryTargetRule = mongoose.model(
  'DeliveryTargetRule',
  deliveryTargetRuleSchema,
  'food_delivery_target_rules'
);
