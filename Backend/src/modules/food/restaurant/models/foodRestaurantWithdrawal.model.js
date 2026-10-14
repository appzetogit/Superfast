import mongoose from 'mongoose';

const foodRestaurantWithdrawalSchema = new mongoose.Schema({
    restaurantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FoodRestaurant',
        required: true,
        index: true
    },
    amount: {
        type: Number,
        required: true,
        min: [1, 'Minimum withdrawal amount is ₹1']
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
        index: true
    },
    paymentMethod: {
        type: String,
        default: 'bank_transfer'
    },
    bankDetails: {
        accountNumber: String,
        ifscCode: String,
        bankName: String,
        accountHolderName: String
    },
    adminNote: String,
    rejectionReason: String,
    transactionId: String, // Final bank transaction reference from admin
    processedAt: Date,
    // Razorpay X automatic payout tracking
    payoutId: { type: String, index: true, sparse: true },
    payoutStatus: String,
    payoutError: String
}, { 
    collection: 'food_restaurant_withdrawals', 
    timestamps: true 
});

foodRestaurantWithdrawalSchema.index({ createdAt: -1 });

export const FoodRestaurantWithdrawal = mongoose.model('FoodRestaurantWithdrawal', foodRestaurantWithdrawalSchema, 'food_restaurant_withdrawals');
