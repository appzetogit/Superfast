import mongoose from 'mongoose';

const handoverRequestSchema = new mongoose.Schema(
  {
    deliveryPartnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodDeliveryPartner',
      required: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodOrder',
      required: false,
      index: true,
    },
    reason: {
      type: String,
      required: true,
      default: 'Emergency / Vehicle Breakdown',
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    adminNotes: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

export const HandoverRequest =
  mongoose.models.HandoverRequest || mongoose.model('HandoverRequest', handoverRequestSchema);
