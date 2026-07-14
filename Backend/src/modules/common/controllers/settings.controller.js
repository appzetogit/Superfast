import { GlobalSettings } from '../models/settings.model.js';
import { sendResponse } from '../../../utils/response.js';
import { uploadImageBufferDetailed } from '../../../services/cloudinary.service.js';
import { FoodUser } from '../../../core/users/user.model.js';
import { FoodRestaurant } from '../../food/restaurant/models/restaurant.model.js';
import { FoodDeliveryPartner } from '../../food/delivery/models/deliveryPartner.model.js';
import { Seller } from '../../quick-commerce/seller/models/seller.model.js';
import { FoodRefreshToken } from '../../../core/refreshTokens/refreshToken.model.js';

export async function getGlobalSettings(req, res, next) {
    try {
        let settings = await GlobalSettings.findOne().lean();
        if (!settings) {
            // Create default settings if none exist
            settings = await GlobalSettings.create({
                companyName: 'SUPERFAST',
                email: 'admin@SUPERFAST.com'
            });
        }
        return sendResponse(res, 200, 'Global settings fetched successfully', settings);
    } catch (error) {
        next(error);
    }
}

export async function updateGlobalSettings(req, res, next) {
    try {
        let data = {};
        if (req.body.data) {
            try {
                data = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data;
            } catch (e) {
                console.error("Error parsing settings data:", e);
                data = req.body;
            }
        } else {
            data = req.body;
        }
        
        const { companyName, email, phoneCountryCode, phoneNumber, address, state, pincode, region, logoUrl, faviconUrl, themeColor, modules, codEnabled, onlinePaymentEnabled, showLocationPopup, bannedNumbers, dynamicModuleThemes } = data;
        
        console.log("Updating global settings with data:", data);

        // Validation
        if (companyName !== undefined && (!companyName || companyName.trim().length < 2 || companyName.trim().length > 50)) {
            return res.status(400).json({ success: false, message: 'Company name must be between 2 and 50 characters' });
        }
        
        if (email && (email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))) {
            return res.status(400).json({ success: false, message: 'Invalid email address' });
        }
        
        if (phoneNumber && !/^\d{7,15}$/.test(phoneNumber.trim())) {
            return res.status(400).json({ success: false, message: 'Invalid phone number (7-15 digits required)' });
        }

        let settings = await GlobalSettings.findOne();
        if (!settings) {
            settings = new GlobalSettings();
        }

        if (companyName) settings.companyName = companyName;
        if (email) settings.email = email;
        if (phoneCountryCode || phoneNumber) {
            settings.phone = {
                countryCode: phoneCountryCode || settings.phone?.countryCode || '+91',
                number: phoneNumber || settings.phone?.number || ''
            };
        }
        if (address !== undefined) settings.address = address;
        if (state !== undefined) settings.state = state;
        if (pincode !== undefined) settings.pincode = pincode;
        if (region) settings.region = region;
        if (logoUrl !== undefined) {
            settings.logo = {
                url: String(logoUrl || '').trim(),
                publicId: settings.logo?.publicId || ''
            };
        }
        if (faviconUrl !== undefined) {
            settings.favicon = {
                url: String(faviconUrl || '').trim(),
                publicId: settings.favicon?.publicId || ''
            };
        }
        if (themeColor !== undefined) {
            settings.themeColor = themeColor;
        }
        if (modules !== undefined) {
            settings.modules = {
                food: modules.food !== undefined ? modules.food : settings.modules?.food,
                quickCommerce: modules.quickCommerce !== undefined ? modules.quickCommerce : settings.modules?.quickCommerce,
            };
        }
        if (data.moduleThemes !== undefined) {
            if (!settings.moduleThemes) settings.moduleThemes = {};
            if (data.moduleThemes.food) {
                if (!settings.moduleThemes.food) settings.moduleThemes.food = {};
                if (data.moduleThemes.food.themeColor) {
                    settings.moduleThemes.food.themeColor = data.moduleThemes.food.themeColor;
                }
                if (data.moduleThemes.food.secondaryThemeColor) {
                    settings.moduleThemes.food.secondaryThemeColor = data.moduleThemes.food.secondaryThemeColor;
                }
            }
            if (data.moduleThemes.quickCommerce) {
                if (!settings.moduleThemes.quickCommerce) settings.moduleThemes.quickCommerce = {};
                if (data.moduleThemes.quickCommerce.themeColor) {
                    settings.moduleThemes.quickCommerce.themeColor = data.moduleThemes.quickCommerce.themeColor;
                }
                if (data.moduleThemes.quickCommerce.secondaryThemeColor) {
                    settings.moduleThemes.quickCommerce.secondaryThemeColor = data.moduleThemes.quickCommerce.secondaryThemeColor;
                }
            }
        }
        if (codEnabled !== undefined) {
            settings.codEnabled = codEnabled;
        }
        if (onlinePaymentEnabled !== undefined) {
            settings.onlinePaymentEnabled = onlinePaymentEnabled;
        }
        if (showLocationPopup !== undefined) {
            settings.showLocationPopup = showLocationPopup;
        }
        if (bannedNumbers !== undefined && Array.isArray(bannedNumbers)) {
            settings.bannedNumbers = bannedNumbers;
        }

        // Handle file uploads explicitly via $set
        const updateQuery = { $set: {} };
        
        if (req.files) {
            if (req.files.logo) {
                const logoResult = await uploadImageBufferDetailed(req.files.logo[0].buffer, 'business/logos');
                updateQuery.$set['logo.url'] = logoResult.secure_url;
                updateQuery.$set['logo.publicId'] = logoResult.public_id;
            }
            if (req.files.favicon) {
                const faviconResult = await uploadImageBufferDetailed(req.files.favicon[0].buffer, 'business/favicons');
                updateQuery.$set['favicon.url'] = faviconResult.secure_url;
                updateQuery.$set['favicon.publicId'] = faviconResult.public_id;
            }
            if (req.files.foodLogo) {
                const foodLogoResult = await uploadImageBufferDetailed(req.files.foodLogo[0].buffer, 'business/logos');
                updateQuery.$set['moduleThemes.food.logo.url'] = foodLogoResult.secure_url;
                updateQuery.$set['moduleThemes.food.logo.publicId'] = foodLogoResult.public_id;
            }
            if (req.files.qcLogo) {
                const qcLogoResult = await uploadImageBufferDetailed(req.files.qcLogo[0].buffer, 'business/logos');
                updateQuery.$set['moduleThemes.quickCommerce.logo.url'] = qcLogoResult.secure_url;
                updateQuery.$set['moduleThemes.quickCommerce.logo.publicId'] = qcLogoResult.public_id;
            }
            if (req.files.deliveryLogo) {
                const result = await uploadImageBufferDetailed(req.files.deliveryLogo[0].buffer, 'business/logos');
                updateQuery.$set['portals.delivery.logo.url'] = result.secure_url;
                updateQuery.$set['portals.delivery.logo.publicId'] = result.public_id;
            }
            if (req.files.restaurantLogo) {
                const result = await uploadImageBufferDetailed(req.files.restaurantLogo[0].buffer, 'business/logos');
                updateQuery.$set['portals.restaurant.logo.url'] = result.secure_url;
                updateQuery.$set['portals.restaurant.logo.publicId'] = result.public_id;
            }
            if (req.files.userLogo) {
                const result = await uploadImageBufferDetailed(req.files.userLogo[0].buffer, 'business/logos');
                updateQuery.$set['portals.user.logo.url'] = result.secure_url;
                updateQuery.$set['portals.user.logo.publicId'] = result.public_id;
            }
            if (req.files.sellerLogo) {
                const result = await uploadImageBufferDetailed(req.files.sellerLogo[0].buffer, 'business/logos');
                updateQuery.$set['portals.seller.logo.url'] = result.secure_url;
                updateQuery.$set['portals.seller.logo.publicId'] = result.public_id;
            }
        }
        
        // Update regular fields in $set
        if (companyName !== undefined) updateQuery.$set.companyName = companyName;
        if (email !== undefined) updateQuery.$set.email = email;
        if (phoneNumber !== undefined) updateQuery.$set['phone.number'] = phoneNumber;
        if (phoneCountryCode !== undefined) updateQuery.$set['phone.countryCode'] = phoneCountryCode;
        if (address !== undefined) updateQuery.$set.address = address;
        if (state !== undefined) updateQuery.$set.state = state;
        if (pincode !== undefined) updateQuery.$set.pincode = pincode;
        if (region !== undefined) updateQuery.$set.region = region;
        if (themeColor !== undefined) updateQuery.$set.themeColor = themeColor;
        if (codEnabled !== undefined) updateQuery.$set.codEnabled = codEnabled;
        if (onlinePaymentEnabled !== undefined) updateQuery.$set.onlinePaymentEnabled = onlinePaymentEnabled;
        if (showLocationPopup !== undefined) updateQuery.$set.showLocationPopup = showLocationPopup;
        if (bannedNumbers !== undefined && Array.isArray(bannedNumbers)) updateQuery.$set.bannedNumbers = bannedNumbers;
        if (dynamicModuleThemes !== undefined) updateQuery.$set.dynamicModuleThemes = dynamicModuleThemes;
        updateQuery.$set.updatedBy = req.user ? req.user.userId : null;

        if (data.moduleThemes !== undefined) {
            if (data.moduleThemes.food?.themeColor !== undefined) {
                updateQuery.$set['moduleThemes.food.themeColor'] = data.moduleThemes.food.themeColor;
            }
            if (data.moduleThemes.food?.secondaryThemeColor !== undefined) {
                updateQuery.$set['moduleThemes.food.secondaryThemeColor'] = data.moduleThemes.food.secondaryThemeColor;
            }
            if (data.moduleThemes.quickCommerce?.themeColor !== undefined) {
                updateQuery.$set['moduleThemes.quickCommerce.themeColor'] = data.moduleThemes.quickCommerce.themeColor;
            }
            if (data.moduleThemes.quickCommerce?.secondaryThemeColor !== undefined) {
                updateQuery.$set['moduleThemes.quickCommerce.secondaryThemeColor'] = data.moduleThemes.quickCommerce.secondaryThemeColor;
            }
        }

        // Execute reliable update with upsert to ensure document creation
        settings = await GlobalSettings.findOneAndUpdate(
            { _id: settings._id },
            updateQuery,
            { new: true, upsert: true, lean: true }
        );

        // Auto-logout for newly banned numbers
        if (bannedNumbers && Array.isArray(bannedNumbers) && bannedNumbers.length > 0) {

            try {
                const users = await FoodUser.find({ phone: { $in: bannedNumbers } }).select('_id');
                const restaurants = await FoodRestaurant.find({ ownerPhone: { $in: bannedNumbers } }).select('_id');
                const dps = await FoodDeliveryPartner.find({ phone: { $in: bannedNumbers } }).select('_id');
                const sellers = await Seller.find({ phone: { $in: bannedNumbers } }).select('_id');

                const idsToLogout = [
                    ...users.map(u => u._id),
                    ...restaurants.map(r => r._id),
                    ...dps.map(d => d._id),
                    ...sellers.map(s => s._id)
                ];

                if (idsToLogout.length > 0) {
                    await FoodRefreshToken.deleteMany({ userId: { $in: idsToLogout } });
                    // Deactivate them so auth middleware catches it
                    if (users.length > 0) {
                        await FoodUser.updateMany({ _id: { $in: users.map(u => u._id) } }, { isActive: false });
                    }
                    if (restaurants.length > 0) {
                        await FoodRestaurant.updateMany({ _id: { $in: restaurants.map(r => r._id) } }, { status: 'rejected' });
                    }
                    if (dps.length > 0) {
                        await FoodDeliveryPartner.updateMany({ _id: { $in: dps.map(d => d._id) } }, { status: 'rejected' });
                    }
                    if (sellers.length > 0) {
                        await Seller.updateMany({ _id: { $in: sellers.map(s => s._id) } }, { isActive: false });
                    }
                }
            } catch (err) {
                console.error("Error auto-logging out banned numbers:", err);
            }
        }

        return sendResponse(res, 200, 'Global settings updated successfully', settings);
    } catch (error) {
        next(error);
    }
}
