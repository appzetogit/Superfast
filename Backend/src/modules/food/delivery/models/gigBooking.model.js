import mongoose from 'mongoose';

const gigBookingSchema = new mongoose.Schema(
  {
    gigId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Gig',
      required: true,
      index: true,
    },
    deliveryPartnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeliveryPartner',
      required: true,
      index: true,
    },
    zoneName: {
      type: String,
      required: true,
      default: 'General Zone',
    },
    status: {
      type: String,
      enum: ['booked', 'checked_in', 'completed', 'cancelled', 'missed'],
      default: 'booked',
    },
    checkInTime: {
      type: Date,
      default: null,
    },
    checkOutTime: {
      type: Date,
      default: null,
    },
    earnings: {
      type: Number,
      default: 0,
    },
    reminderSent: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

gigBookingSchema.index({ deliveryPartnerId: 1, gigId: 1 }, { unique: true });
gigBookingSchema.index({ zoneName: 1, status: 1 });

export const GigBooking =
  mongoose.models.GigBooking || mongoose.model('GigBooking', gigBookingSchema);
