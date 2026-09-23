import mongoose from 'mongoose';
import { returnStatuses } from '../../../constants/returnStatuses.js';

const returnHistorySchema = new mongoose.Schema({
  status: { type: String, required: true },
  updatedBy: { type: String, required: true }, // e.g., 'User', 'Admin', 'Seller', 'Delivery Partner'
  updatedById: { type: mongoose.Schema.Types.ObjectId, default: null },
  remarks: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const quickReturnRequestSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodOrder', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodUser', required: true, index: true },
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true, index: true },
  deliveryPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodDeliveryPartner', default: null, index: true },
  
  // Product Details
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'quick_product', required: true },
  variantId: { type: mongoose.Schema.Types.ObjectId, default: null }, // if applicable
  quantity: { type: Number, required: true, min: 1 },
  reason: { type: String, required: true },
  description: { type: String, default: '' },
  userImages: { type: [String], default: [] },
  
  // Financial specifics for the returned items
  productValue: { type: Number, default: 0 },
  sellerEarningDeduction: { type: Number, default: 0 },
  adminEarningDeduction: { type: Number, default: 0 },
  returnPickupEarning: { type: Number, default: 0 }, // For the return delivery partner
  
  // Refund Details
  refundMethod: { type: String, enum: ['Wallet', 'UPI', 'Bank'], required: true },
  upiId: { type: String, default: '' },
  bankDetails: {
    accountHolderName: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    ifscCode: { type: String, default: '' },
    bankName: { type: String, default: '' }
  },
  refundAmount: { type: Number, default: 0 },
  
  // Refund Audit
  transactionReferenceNumber: { type: String, default: '' },
  refundNotes: { type: String, default: '' },
  refundDate: { type: Date, default: null },
  
  // Security
  pickupOtp: { type: String, default: '' },
  pickupImage: { type: String, default: '' },
  sellerVerificationImages: { type: [String], default: [] },
  
  // Status Tracking
  status: { 
    type: String, 
    enum: Object.values(returnStatuses), 
    default: returnStatuses.RETURN_REQUESTED,
    index: true
  },
  statusHistory: { type: [returnHistorySchema], default: [] },
  
  // Auto-hide broadcast assignment array (stores delivery partner IDs who rejected/missed it)
  rejectedByDeliveryPartners: { type: [mongoose.Schema.Types.ObjectId], default: [] }
  
}, { timestamps: true });

export const QuickReturnRequest = mongoose.model('quick_return_request', quickReturnRequestSchema, 'quick_return_requests');
