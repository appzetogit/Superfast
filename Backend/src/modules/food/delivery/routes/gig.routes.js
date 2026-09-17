import express from 'express';
import { authMiddleware } from '../../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../../core/roles/role.middleware.js';
import {
  listZoneGigsController,
  bookGigController,
  checkInGigController,
  checkOutGigController,
  getMyGigsController,
  getZoneDriversListController,
  createHandoverRequestController,
} from '../controllers/gig.controller.js';

const router = express.Router();

// ----- Delivery Partner Gig Routes -----
router.get('/zone-gigs', authMiddleware, requireRoles('DELIVERY_PARTNER'), listZoneGigsController);
router.post('/book', authMiddleware, requireRoles('DELIVERY_PARTNER'), bookGigController);
router.post('/check-in', authMiddleware, requireRoles('DELIVERY_PARTNER'), checkInGigController);
router.post('/check-out', authMiddleware, requireRoles('DELIVERY_PARTNER'), checkOutGigController);
router.get('/my-gigs', authMiddleware, requireRoles('DELIVERY_PARTNER'), getMyGigsController);
router.get('/zone-drivers', authMiddleware, requireRoles('DELIVERY_PARTNER'), getZoneDriversListController);
router.post('/handover', authMiddleware, requireRoles('DELIVERY_PARTNER'), createHandoverRequestController);

// Public / Admin fallback route for zone drivers list
router.get('/public/zone-drivers', getZoneDriversListController);

export default router;
