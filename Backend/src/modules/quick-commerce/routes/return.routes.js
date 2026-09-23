import express from 'express';
import requireAuth from '../../../middleware/auth.js';
import requireRoles from '../../../middleware/role.js';
import * as returnController from '../controllers/return.controller.js';

const router = express.Router();

// ---- User Routes ----
router.post('/user/returns', requireAuth, requireRoles('USER'), returnController.createReturnRequest);
router.get('/user/returns/order/:orderId', requireAuth, requireRoles('USER'), returnController.getUserReturns);
router.get('/user/returns', requireAuth, requireRoles('USER'), returnController.getUserReturns);
router.get('/user/returns/:id', requireAuth, requireRoles('USER'), returnController.getUserReturnDetails);

// ---- Admin Routes ----
router.get('/admin/returns/settings', requireAuth, requireRoles('ADMIN', 'SUB_ADMIN'), returnController.getAdminSettings);
router.put('/admin/returns/settings', requireAuth, requireRoles('ADMIN', 'SUB_ADMIN'), returnController.updateAdminSettings);
router.get('/admin/returns', requireAuth, requireRoles('ADMIN', 'SUB_ADMIN'), returnController.getAdminReturns);
router.put('/admin/returns/:id/approve', requireAuth, requireRoles('ADMIN', 'SUB_ADMIN'), returnController.approveReturn);
router.put('/admin/returns/:id/reject', requireAuth, requireRoles('ADMIN', 'SUB_ADMIN'), returnController.rejectReturn);
router.post('/admin/returns/:id/broadcast', requireAuth, requireRoles('ADMIN', 'SUB_ADMIN'), returnController.broadcastReturn);
router.put('/admin/returns/:id/refund', requireAuth, requireRoles('ADMIN', 'SUB_ADMIN'), returnController.completeRefund);

// ---- Delivery Partner Routes ----
router.get('/delivery/returns/active', requireAuth, requireRoles('DELIVERY_PARTNER'), returnController.getDeliveryReturnPickups);
router.get('/delivery/returns/history', requireAuth, requireRoles('DELIVERY_PARTNER'), returnController.getDeliveryReturnHistory);
router.put('/delivery/returns/:id/accept', requireAuth, requireRoles('DELIVERY_PARTNER'), returnController.acceptDeliveryPickup);
router.post('/delivery/returns/:id/confirm-pickup', requireAuth, requireRoles('DELIVERY_PARTNER'), returnController.confirmPickup);
router.put('/delivery/returns/:id/status', requireAuth, requireRoles('DELIVERY_PARTNER'), returnController.updateDeliveryReturnStatus);
router.put('/delivery/returns/:id/reject-broadcast', requireAuth, requireRoles('DELIVERY_PARTNER'), returnController.rejectDeliveryBroadcast);

// ---- Seller Routes ----
router.get('/seller/returns', requireAuth, requireRoles('SELLER'), returnController.getSellerReturns);
router.post('/seller/returns/:id/received', requireAuth, requireRoles('SELLER'), returnController.receiveSellerProduct);
router.post('/seller/returns/:id/raise-issue', requireAuth, requireRoles('SELLER'), returnController.raiseSellerIssue);

export default router;
