import mongoose from 'mongoose';

const foodLandingCategorySchema = new mongoose.Schema(
    {
        label: {
            type: String,
            required: true
        },
        imageUrl: {
            type: String,
            required: true
        },
        publicId: {
            type: String,
            required: true
        },
        sortOrder: {
            type: Number,
            default: 0,
            index: true
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true
        }
    },
    {
        collection: 'food_landing_categories',
        timestamps: true
    }
);

foodLandingCategorySchema.index({ isActive: 1, sortOrder: 1 });

export const FoodLandingCategory = mongoose.model('FoodLandingCategory', foodLandingCategorySchema, 'food_landing_categories');
