import mongoose from 'mongoose';

const deliveryPayoutRecordSchema = new mongoose.Schema(
    {
        deliveryPartnerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodDeliveryPartner',
            required: true,
            index: true
        },
        amount: {
            type: Number,
            required: true,
            min: 0
        },
        currency: {
            type: String,
            default: 'INR',
            trim: true
        },
        scheduleType: {
            type: String,
            enum: ['DAILY', 'WEEKLY', 'MANUAL'],
            default: 'DAILY'
        },
        status: {
            type: String,
            enum: ['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REVERSED'],
            default: 'PENDING',
            index: true
        },
        gatewayPayoutId: {
            type: String,
            default: '',
            trim: true
        },
        idempotencyKey: {
            type: String,
            required: true,
            unique: true,
            index: true
        },
        periodStart: {
            type: Date,
            default: null
        },
        periodEnd: {
            type: Date,
            default: null
        },
        failureReason: {
            type: String,
            default: ''
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: undefined
        }
    },
    { collection: 'delivery_payout_records', timestamps: true }
);

deliveryPayoutRecordSchema.index({ deliveryPartnerId: 1, status: 1, createdAt: -1 });

export const DeliveryPayoutRecord = mongoose.model('DeliveryPayoutRecord', deliveryPayoutRecordSchema);
