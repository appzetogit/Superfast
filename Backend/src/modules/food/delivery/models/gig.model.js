import mongoose from 'mongoose';

const gigSchema = new mongoose.Schema(
  {
    zoneId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeliveryZone',
      required: false,
      index: true,
    },
    zoneName: {
      type: String,
      required: true,
      default: 'General Zone',
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    shiftType: {
      type: String,
      enum: ['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT'],
      default: 'MORNING',
    },
    startTime: {
      type: String, // e.g. "08:00"
      required: true,
    },
    endTime: {
      type: String, // e.g. "12:00"
      required: true,
    },
    date: {
      type: String, // YYYY-MM-DD
      required: true,
      index: true,
    },
    maxDrivers: {
      type: Number,
      default: 15,
    },
    bookedCount: {
      type: Number,
      default: 0,
    },
    basePay: {
      type: Number,
      default: 300,
    },
    incentiveBonus: {
      type: Number,
      default: 50,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

gigSchema.index({ zoneName: 1, date: 1, shiftType: 1 });

export const Gig = mongoose.models.Gig || mongoose.model('Gig', gigSchema);
