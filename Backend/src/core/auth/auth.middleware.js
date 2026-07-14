import { verifyAccessToken } from './token.util.js';
import { sendError } from '../../utils/response.js';
import { FoodUser } from '../users/user.model.js';
import { FoodRestaurant } from '../../modules/food/restaurant/models/restaurant.model.js';
import { FoodDeliveryPartner } from '../../modules/food/delivery/models/deliveryPartner.model.js';
import { Seller } from '../../modules/quick-commerce/seller/models/seller.model.js';
import { FoodAdmin } from '../admin/admin.model.js';

export const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'ADMIN' && req.user?.role !== 'SUB_ADMIN') {
        return sendError(res, 403, 'Admin access required');
    }
    next();
};

export const requireSuperAdmin = (req, res, next) => {
    if (req.user?.role !== 'ADMIN') {
        return sendError(res, 403, 'Super Admin access required');
    }
    next();
};

/**
 * Allows Platform Superadmin and Module Superadmins to manage admins.
 * Attaches the full admin document to req.adminDoc for downstream use.
 * Subadmins are always rejected regardless of their permission flags.
 */
export const requireAdminManager = async (req, res, next) => {
    try {
        const admin = await FoodAdmin.findById(req.user.userId)
            .select('adminLevel permissions role food_zone_ids quick_commerce_zone_ids servicesAccess')
            .lean();
        if (!admin) return sendError(res, 401, 'Admin not found');

        // Derive effective level for backward compatibility
        const level = admin.adminLevel || (admin.role === 'ADMIN' ? 'PLATFORM_SUPERADMIN' : 'SUB_ADMIN');
        admin._effectiveLevel = level;
        req.adminDoc = admin;

        const allowed = ['PLATFORM_SUPERADMIN', 'FOOD_SUPERADMIN', 'QUICK_COMMERCE_SUPERADMIN'];
        if (!allowed.includes(level)) {
            return sendError(res, 403, 'You do not have permission to manage admins');
        }

        next();
    } catch (error) {
        next(error);
    }
};


export const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (!token) {
        return sendError(res, 401, 'Authentication token missing');
    }

    try {
        const decoded = verifyAccessToken(token);
        req.user = {
            userId: decoded.userId,
            role: decoded.role
        };
        if (decoded.role === 'USER') {
            FoodUser.findById(decoded.userId).select('isActive').lean().then((doc) => {
                if (!doc || doc.isActive === false) return sendError(res, 401, 'User account is deactivated');
                next();
            }).catch(() => sendError(res, 401, 'Authentication failed'));
            return;
        } else if (decoded.role === 'RESTAURANT') {
            FoodRestaurant.findById(decoded.userId).select('status').lean().then((doc) => {
                if (!doc) return sendError(res, 401, 'Restaurant account not found');
                next();
            }).catch(() => sendError(res, 401, 'Authentication failed'));
            return;
        } else if (decoded.role === 'DELIVERY_PARTNER') {
            FoodDeliveryPartner.findById(decoded.userId).select('status').lean().then((doc) => {
                if (!doc || doc.status === 'rejected') return sendError(res, 401, 'Delivery Partner account is rejected');
                next();
            }).catch(() => sendError(res, 401, 'Authentication failed'));
            return;
        } else if (decoded.role === 'SELLER') {
            Seller.findById(decoded.userId).select('isActive').lean().then((doc) => {
                if (!doc || doc.isActive === false) return sendError(res, 401, 'Seller account is deactivated');
                next();
            }).catch(() => sendError(res, 401, 'Authentication failed'));
            return;
        } else if (decoded.role === 'SUB_ADMIN') {
            FoodAdmin.findById(decoded.userId).select('isActive').lean().then((doc) => {
                if (!doc || doc.isActive === false) return sendError(res, 401, 'Sub-Admin account is deactivated');
                next();
            }).catch(() => sendError(res, 401, 'Authentication failed'));
            return;
        }
        
        return next();
    } catch (error) {
        return sendError(res, 401, 'Invalid or expired token');
    }
};
