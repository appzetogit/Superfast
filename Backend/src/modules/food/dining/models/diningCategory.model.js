import mongoose from 'mongoose';

const diningCategorySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },
        slug: {
            type: String,
            required: true,
            trim: true,
            unique: true
        },
        image: {
            type: String,
            trim: true,
            default: ''
        },
        isActive: {
            type: Boolean,
            default: true
        },
        sortOrder: {
            type: Number,
            default: 0
        },
        restaurantIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'FoodRestaurant'
            }
        ]
    },
    {
        collection: 'food_dining_categories',
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

diningCategorySchema.virtual('imageUrl')
    .get(function () {
        return this.image || '';
    })
    .set(function (val) {
        this.image = val;
    });

diningCategorySchema.index({ isActive: 1, sortOrder: 1, createdAt: -1 });

export const FoodDiningCategory = mongoose.model('FoodDiningCategory', diningCategorySchema, 'food_dining_categories');
