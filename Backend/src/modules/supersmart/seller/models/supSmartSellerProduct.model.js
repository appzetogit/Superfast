import mongoose from "mongoose";

const supSmartSellerVariantSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    price: { type: Number, min: 0, default: 0 },
    salePrice: { type: Number, min: 0, default: 0 },
    stock: { type: Number, min: 0, default: 0 },
    sku: { type: String, trim: true, default: "" },
  },
  { _id: true },
);

const supSmartSellerProductSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SupSmartSeller",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    sku: {
      type: String,
      trim: true,
      default: "",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    price: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    salePrice: {
      type: Number,
      min: 0,
      default: 0,
    },
    mrp: {
      type: Number,
      min: 0,
      default: 0,
    },
    stock: {
      type: Number,
      min: 0,
      default: 0,
    },
    lowStockAlert: {
      type: Number,
      min: 0,
      default: 5,
    },
    brand: {
      type: String,
      trim: true,
      default: "",
    },
    weight: {
      type: String,
      trim: true,
      default: "",
    },
    unit: {
      type: String,
      trim: true,
      default: "",
    },
    tags: {
      type: [String],
      default: [],
    },
    mainImage: {
      type: String,
      default: "",
    },
    image: {
      type: String,
      default: "",
    },
    galleryImages: {
      type: [String],
      default: [],
    },
    headerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SupSmartCategory",
      default: null,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SupSmartCategory",
      required: true,
    },
    subcategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SupSmartCategory",
      default: null,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    variants: {
      type: [supSmartSellerVariantSchema],
      default: [],
    },
  },
  {
    collection: "supersmart_products",
    timestamps: true,
  },
);

supSmartSellerProductSchema.index({ sellerId: 1, createdAt: -1 });
supSmartSellerProductSchema.index({ sellerId: 1, slug: 1 }, { unique: true });
supSmartSellerProductSchema.index({ sellerId: 1, sku: 1 }, { sparse: true });
supSmartSellerProductSchema.index({ sellerId: 1, stock: 1, status: 1 });
supSmartSellerProductSchema.index({ sellerId: 1, categoryId: 1, subcategoryId: 1 });

export const SupSmartSellerProduct = mongoose.model(
  "SupSmartSellerProduct",
  supSmartSellerProductSchema,
  "supersmart_products",
);
