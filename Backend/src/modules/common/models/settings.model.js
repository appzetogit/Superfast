import mongoose from 'mongoose';

const globalSettingsSchema = new mongoose.Schema(
    {
        companyName: { type: String, required: true, default: 'SUPERFAST' },
        email: { type: String, required: true, default: 'admin@SUPERFAST.com' },
        phone: {
            countryCode: { type: String, default: '+91' },
            number: { type: String, default: '' }
        },
        address: { type: String, default: '' },
        state: { type: String, default: '' },
        pincode: { type: String, default: '' },
        region: { type: String, default: 'India' },
        logo: {
            url: { type: String, default: '' },
            publicId: { type: String, default: '' }
        },
        favicon: {
            url: { type: String, default: '' },
            publicId: { type: String, default: '' }
        },
        themeColor: { type: String, default: '#0a0a0a' },
        moduleThemes: {
            food: {
                themeColor: { type: String, default: '#cc2532' },
                secondaryThemeColor: { type: String, default: '#b3202c' },
                logo: {
                    url: { type: String, default: '' },
                    publicId: { type: String, default: '' }
                }
            },
            quickCommerce: {
                themeColor: { type: String, default: '#00BFA5' },
                secondaryThemeColor: { type: String, default: '#008b74' },
                logo: {
                    url: { type: String, default: '' },
                    publicId: { type: String, default: '' }
                }
            }
        },
        portals: {
            delivery: {
                logo: {
                    url: { type: String, default: '' },
                    publicId: { type: String, default: '' }
                }
            },
            restaurant: {
                logo: {
                    url: { type: String, default: '' },
                    publicId: { type: String, default: '' }
                }
            },
            seller: {
                logo: {
                    url: { type: String, default: '' },
                    publicId: { type: String, default: '' }
                }
            },
            user: {
                logo: {
                    url: { type: String, default: '' },
                    publicId: { type: String, default: '' }
                }
            }
        },
        modules: {
            food: { type: Boolean, default: true },

            quickCommerce: { type: Boolean, default: true },
        },
        codEnabled: { type: Boolean, default: true },
        onlinePaymentEnabled: { type: Boolean, default: true },
        showLocationPopup: { type: Boolean, default: true },
        bannedNumbers: { type: [String], default: [] },
        dynamicModuleThemes: { type: Boolean, default: true },
        developerMode: {
            enabled: { type: Boolean, default: false },
            demoRestaurantIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant' }],
            demoStoreIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Seller' }],
            demoPhoneNumbers: { type: [String], default: ['9999999999', '8888888888'] },
            demoOtp: { type: String, default: '123456' },
            bypassLocationRestriction: { type: Boolean, default: true },
            allowTestPayment: { type: Boolean, default: true },
            hideLiveRestaurantsInReview: { type: Boolean, default: true },
            showAllMenuItemsInDevMode: { type: Boolean, default: true },
            demoMenuItemIds: [{ type: String }],
            demoLandingCategoryIds: [{ type: String }]
        }
    },
    { timestamps: true }
);

// We keep the collection name the same if we want to preserve data, 
// or rename it if we want a fresh start. 
// Given the user wants to "move" them, keeping data is likely preferred.
export const GlobalSettings = mongoose.model('GlobalSettings', globalSettingsSchema, 'common_global_settings');
