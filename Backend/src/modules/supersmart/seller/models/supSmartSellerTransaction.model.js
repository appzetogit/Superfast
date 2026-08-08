import mongoose from "mongoose";

const supSmartSellerTransactionSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SupSmartSeller",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["Order Payment", "Withdrawal", "Adjustment"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["Pending", "Processing", "Settled", "Rejected"],
      default: "Pending",
    },
    reference: {
      type: String,
      trim: true,
      default: "",
    },
    orderId: {
      type: String,
      trim: true,
      default: "",
    },
    customer: {
      type: String,
      trim: true,
      default: "",
    },
    paymentMethod: {
      type: String,
      enum: ["bank_transfer", "upi", ""],
      default: "",
    },
    bankDetails: {
      bankName: { type: String, trim: true, default: "" },
      accountHolderName: { type: String, trim: true, default: "" },
      accountNumberLast4: { type: String, trim: true, default: "" },
      ifscCode: { type: String, trim: true, uppercase: true, default: "" },
      upiId: { type: String, trim: true, default: "" },
    },
    adminNote: {
      type: String,
      trim: true,
      default: "",
    },
    processedAt: {
      type: Date,
      default: null,
    },
    reason: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    collection: "supersmart_seller_transactions",
    timestamps: true,
  },
);

supSmartSellerTransactionSchema.index({ sellerId: 1, createdAt: -1 });

export const SupSmartSellerTransaction = mongoose.model(
  "SupSmartSellerTransaction",
  supSmartSellerTransactionSchema,
  "supersmart_seller_transactions",
);
