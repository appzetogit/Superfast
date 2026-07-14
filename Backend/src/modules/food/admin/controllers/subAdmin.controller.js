import { FoodAdmin } from '../../../../core/admin/admin.model.js';
import { sendResponse, sendError } from '../../../../utils/response.js';

// ── helpers ──────────────────────────────────────────────────────────────

/** Check if `subset` is fully contained in `superset` */
const isSubsetOf = (subset = [], superset = []) => {
    if (!Array.isArray(subset) || !Array.isArray(superset)) return false;
    if (superset.includes('*')) return true; // wildcard covers everything
    return subset.every(item => superset.includes(item));
};

/** Map module string from frontend to servicesAccess enum value */
const moduleToService = (mod) => {
    if (mod === 'quick_commerce') return 'quickCommerce';
    return 'food';
};

/** Derive the caller's effective adminLevel (backward compatible) */
const effectiveLevel = (adminDoc) => {
    return adminDoc._effectiveLevel || adminDoc.adminLevel || (adminDoc.role === 'ADMIN' ? 'PLATFORM_SUPERADMIN' : 'SUB_ADMIN');
};

// ── createSubAdmin ───────────────────────────────────────────────────────

export const createSubAdmin = async (req, res, next) => {
    try {
        const caller = req.adminDoc; // attached by requireAdminManager
        const callerLevel = effectiveLevel(caller);
        const {
            name, email, password,
            adminLevel: requestedLevel,
            permissions, food_zone_ids, quick_commerce_zone_ids,
            isActive
        } = req.body;

        // ─── validation ───
        if (!email || !password) {
            return sendError(res, 400, 'Email and password are required');
        }

        const existing = await FoodAdmin.findOne({ email: email.toLowerCase() });
        if (existing) {
            return sendError(res, 400, 'Admin with this email already exists');
        }

        // ─── level gate ───
        // SUB_ADMIN can NEVER create anyone (enforced by middleware, but double-check)
        if (callerLevel === 'SUB_ADMIN') {
            return sendError(res, 403, 'Subadmins cannot create other admins');
        }

        // Determine what the caller is trying to create
        const targetLevel = requestedLevel || 'SUB_ADMIN';

        // Only platform admin can create module superadmins
        if (['FOOD_SUPERADMIN', 'QUICK_COMMERCE_SUPERADMIN'].includes(targetLevel)) {
            if (callerLevel !== 'PLATFORM_SUPERADMIN') {
                return sendError(res, 403, 'Only the Platform Superadmin can create module superadmins');
            }
            // Check one-per-module uniqueness
            const existingSuperadmin = await FoodAdmin.findOne({ adminLevel: targetLevel }).lean();
            if (existingSuperadmin) {
                const label = targetLevel === 'FOOD_SUPERADMIN' ? 'Food' : 'Quick Commerce';
                return sendError(res, 400, `A ${label} Superadmin already exists (${existingSuperadmin.email}). Only one is allowed per module.`);
            }
        }

        // Module superadmin creating a subadmin
        if (['FOOD_SUPERADMIN', 'QUICK_COMMERCE_SUPERADMIN'].includes(callerLevel)) {
            if (targetLevel !== 'SUB_ADMIN') {
                return sendError(res, 403, 'Module superadmins can only create subadmins');
            }
            // Must have subadmins.write
            const callerPerms = caller.permissions || [];
            if (!callerPerms.includes('subadmins.write') && !callerPerms.includes('*')) {
                return sendError(res, 403, 'You do not have permission to create subadmins (requires subadmins.write)');
            }
            // Validate permissions subset
            if (permissions && !isSubsetOf(permissions, callerPerms)) {
                return sendError(res, 400, 'You cannot grant permissions that you do not have yourself');
            }
            // Validate zone subset
            const callerFoodZones = (caller.food_zone_ids || []).map(String);
            const callerQcZones = (caller.quick_commerce_zone_ids || []).map(String);
            if (food_zone_ids && !isSubsetOf(food_zone_ids.map(String), callerFoodZones)) {
                return sendError(res, 400, 'You cannot assign food zones that you do not have access to');
            }
            if (quick_commerce_zone_ids && !isSubsetOf(quick_commerce_zone_ids.map(String), callerQcZones)) {
                return sendError(res, 400, 'You cannot assign quick commerce zones that you do not have access to');
            }
        }

        // ─── determine servicesAccess from the module zones ───
        let servicesAccess = ['food']; // default
        if (targetLevel === 'QUICK_COMMERCE_SUPERADMIN') {
            servicesAccess = ['quickCommerce'];
        } else if (targetLevel === 'FOOD_SUPERADMIN') {
            servicesAccess = ['food'];
        } else if (['FOOD_SUPERADMIN', 'QUICK_COMMERCE_SUPERADMIN'].includes(callerLevel)) {
            // Subadmin inherits module from parent
            servicesAccess = caller.servicesAccess || ['food'];
        } else {
            // Platform admin creating subadmin — infer from zones
            if (quick_commerce_zone_ids?.length && !food_zone_ids?.length) {
                servicesAccess = ['quickCommerce'];
            } else if (food_zone_ids?.length && !quick_commerce_zone_ids?.length) {
                servicesAccess = ['food'];
            }
        }

        // ─── create ───
        const subAdmin = new FoodAdmin({
            name,
            email,
            password,
            servicesAccess,
            isActive: isActive !== undefined ? isActive : true,
            role: targetLevel === 'PLATFORM_SUPERADMIN' ? 'ADMIN' : 'SUB_ADMIN',
            adminLevel: targetLevel,
            permissions: permissions || [],
            food_zone_ids: food_zone_ids || [],
            quick_commerce_zone_ids: quick_commerce_zone_ids || [],
            parentAdminId: caller._id
        });

        await subAdmin.save();

        const responseData = subAdmin.toObject();
        delete responseData.password;

        return sendResponse(res, 201, 'Admin created successfully', responseData);
    } catch (error) {
        // Handle MongoDB duplicate key error for the unique superadmin index
        if (error.code === 11000 && error.keyPattern?.adminLevel) {
            return sendError(res, 400, 'A superadmin for this module already exists. Only one is allowed per module.');
        }
        next(error);
    }
};

// ── getSubAdmins ─────────────────────────────────────────────────────────

export const getSubAdmins = async (req, res, next) => {
    try {
        const caller = req.adminDoc;
        const callerLevel = effectiveLevel(caller);

        let query = {};

        if (callerLevel === 'PLATFORM_SUPERADMIN') {
            // Platform admin sees everyone except themselves
            query = { _id: { $ne: caller._id }, adminLevel: { $ne: 'PLATFORM_SUPERADMIN' } };
        } else {
            // Module superadmin sees only their children
            query = { parentAdminId: caller._id };
        }

        const subAdmins = await FoodAdmin.find(query)
            .select('-password')
            .sort({ createdAt: -1 })
            .lean();

        return sendResponse(res, 200, 'Admins retrieved successfully', subAdmins);
    } catch (error) {
        next(error);
    }
};

// ── updateSubAdmin ───────────────────────────────────────────────────────

export const updateSubAdmin = async (req, res, next) => {
    try {
        const caller = req.adminDoc;
        const callerLevel = effectiveLevel(caller);
        const { id } = req.params;
        const {
            name, email, password,
            permissions, food_zone_ids, quick_commerce_zone_ids,
            isActive
        } = req.body;

        // SUB_ADMIN can never update admins (belt + suspenders with middleware)
        if (callerLevel === 'SUB_ADMIN') {
            return sendError(res, 403, 'Subadmins cannot manage other admins');
        }

        const target = await FoodAdmin.findById(id);
        if (!target) return sendError(res, 404, 'Admin not found');

        // Cannot edit yourself through this endpoint
        if (String(target._id) === String(caller._id)) {
            return sendError(res, 400, 'Cannot edit your own account through this endpoint');
        }

        // Module superadmin can only edit their own children
        if (['FOOD_SUPERADMIN', 'QUICK_COMMERCE_SUPERADMIN'].includes(callerLevel)) {
            if (String(target.parentAdminId) !== String(caller._id)) {
                return sendError(res, 403, 'You can only manage admins you created');
            }
            // Validate permission subset
            const callerPerms = caller.permissions || [];
            if (permissions && !isSubsetOf(permissions, callerPerms)) {
                return sendError(res, 400, 'You cannot grant permissions that you do not have yourself');
            }
            // Validate zone subset
            const callerFoodZones = (caller.food_zone_ids || []).map(String);
            const callerQcZones = (caller.quick_commerce_zone_ids || []).map(String);
            if (food_zone_ids && !isSubsetOf(food_zone_ids.map(String), callerFoodZones)) {
                return sendError(res, 400, 'You cannot assign food zones you do not have');
            }
            if (quick_commerce_zone_ids && !isSubsetOf(quick_commerce_zone_ids.map(String), callerQcZones)) {
                return sendError(res, 400, 'You cannot assign quick commerce zones you do not have');
            }
        }

        // Apply updates
        if (email && email.toLowerCase() !== target.email) {
            const dup = await FoodAdmin.findOne({ email: email.toLowerCase() });
            if (dup) return sendError(res, 400, 'Email is already in use');
            target.email = email;
        }
        if (name !== undefined) target.name = name;
        if (isActive !== undefined) target.isActive = isActive;
        if (password) target.password = password;
        if (permissions !== undefined) target.permissions = permissions;
        if (food_zone_ids !== undefined) target.food_zone_ids = food_zone_ids;
        if (quick_commerce_zone_ids !== undefined) target.quick_commerce_zone_ids = quick_commerce_zone_ids;

        await target.save();

        const responseData = target.toObject();
        delete responseData.password;

        return sendResponse(res, 200, 'Admin updated successfully', responseData);
    } catch (error) {
        next(error);
    }
};

// ── deleteSubAdmin ───────────────────────────────────────────────────────

export const deleteSubAdmin = async (req, res, next) => {
    try {
        const caller = req.adminDoc;
        const callerLevel = effectiveLevel(caller);
        const { id } = req.params;

        if (callerLevel === 'SUB_ADMIN') {
            return sendError(res, 403, 'Subadmins cannot delete admins');
        }

        if (String(id) === String(caller._id)) {
            return sendError(res, 400, 'Cannot delete your own account');
        }

        const target = await FoodAdmin.findById(id);
        if (!target) return sendError(res, 404, 'Admin not found');

        // Module superadmin can only delete their own children
        if (['FOOD_SUPERADMIN', 'QUICK_COMMERCE_SUPERADMIN'].includes(callerLevel)) {
            if (String(target.parentAdminId) !== String(caller._id)) {
                return sendError(res, 403, 'You can only delete admins you created');
            }
        }

        // If deleting a module superadmin, also delete their children
        if (['FOOD_SUPERADMIN', 'QUICK_COMMERCE_SUPERADMIN'].includes(target.adminLevel)) {
            await FoodAdmin.deleteMany({ parentAdminId: target._id });
        }

        await FoodAdmin.findByIdAndDelete(id);

        return sendResponse(res, 200, 'Admin deleted successfully');
    } catch (error) {
        next(error);
    }
};
