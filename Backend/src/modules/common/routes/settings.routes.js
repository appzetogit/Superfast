import express from 'express';
import * as settingsController from '../controllers/settings.controller.js';
import { upload } from '../../../middleware/upload.js';
import { authMiddleware } from '../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../core/roles/role.middleware.js';

const router = express.Router();

// Public endpoint for app logo/theme
router.get('/public', settingsController.getGlobalSettings);

// Protected admin endpoints
router.get('/', authMiddleware, requireRoles('ADMIN', 'SUB_ADMIN'), settingsController.getGlobalSettings);
router.patch('/', authMiddleware, requireRoles('ADMIN'), upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'favicon', maxCount: 1 },
    { name: 'foodLogo', maxCount: 1 },
    { name: 'qcLogo', maxCount: 1 },
    { name: 'deliveryLogo', maxCount: 1 },
    { name: 'restaurantLogo', maxCount: 1 },
    { name: 'userLogo', maxCount: 1 },
    { name: 'sellerLogo', maxCount: 1 }
]), settingsController.updateGlobalSettings);

export default router;
