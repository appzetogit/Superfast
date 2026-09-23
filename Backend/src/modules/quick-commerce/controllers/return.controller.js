import { QuickReturnRequest } from '../models/ReturnRequest.model.js';
import { QuickReturnSettings } from '../models/ReturnSettings.model.js';
import { returnStatuses } from '../../../constants/returnStatuses.js';
import * as returnService from '../services/return.service.js';
import * as returnAssignmentService from '../services/return-assignment.service.js';
import * as returnFinanceService from '../services/return-finance.service.js';
import { refundWalletBalance } from '../../food/user/services/userWallet.service.js';
import { getRiderEarning as getQuickRiderEarning } from '../admin/services/billing.service.js';
import { haversineKm } from '../../food/orders/services/order.helpers.js';
import mongoose from 'mongoose';

// ---- User Controllers ----

export const createReturnRequest = async (req, res) => {
  try {
    const userId = req.user.userId;
    const settings = await QuickReturnSettings.findOne() || { returnWindowDays: 3 };
    
    const returnReq = await returnService.createReturnRequest(userId, req.body, settings.returnWindowDays);
    res.status(201).json({ success: true, returnRequest: returnReq });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getUserReturns = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { orderId } = req.params;
    const filter = { userId };
    if (orderId) filter.orderId = orderId;

    const returns = await QuickReturnRequest.find(filter)
      .populate('productId', 'name image price')
      .populate('sellerId', 'name shopName phone location')
      .sort({ createdAt: -1 });
    
    res.json({ success: true, returns });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getUserReturnDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const returnReq = await QuickReturnRequest.findOne({ _id: id, userId: req.user.userId })
      .populate('productId', 'name image price')
      .populate('sellerId', 'name shopName phone location')
      .populate('deliveryPartnerId', 'name phone');
    
    if (!returnReq) return res.status(404).json({ success: false, message: 'Return request not found' });
    
    // Hide OTP unless status is approved
    const responseData = returnReq.toObject();
    if (responseData.status === returnStatuses.RETURN_REQUESTED || responseData.status === returnStatuses.RETURN_REJECTED) {
      delete responseData.pickupOtp;
    }

    res.json({ success: true, returnRequest: responseData });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ---- Admin Controllers ----

export const getAdminSettings = async (req, res) => {
  try {
    let settings = await QuickReturnSettings.findOne();
    if (!settings) {
      settings = await QuickReturnSettings.create({ returnWindowDays: 3 });
    }
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateAdminSettings = async (req, res) => {
  try {
    const { returnWindowDays } = req.body;
    let settings = await QuickReturnSettings.findOne();
    if (settings) {
      settings.returnWindowDays = returnWindowDays;
      await settings.save();
    } else {
      settings = await QuickReturnSettings.create({ returnWindowDays });
    }
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAdminReturns = async (req, res) => {
  try {
    const returns = await QuickReturnRequest.find()
      .populate('orderId')
      .populate('productId', 'name image price')
      .populate('userId', 'name email phone')
      .populate('sellerId', 'name shopName phone location')
      .populate('deliveryPartnerId', 'name phone')
      .sort({ createdAt: -1 });
    res.json({ success: true, returns });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const approveReturn = async (req, res) => {
  try {
    const { id } = req.params;
    const { refundAmount } = req.body;
    
    const returnReq = await QuickReturnRequest.findById(id);
    if (!returnReq) throw new Error('Return request not found');

    let remark = 'Return approved by Admin';
    if (refundAmount !== undefined && refundAmount !== null) {
      const parsedAmount = Number(refundAmount);
      if (!isNaN(parsedAmount)) {
        // Cap the ratio at 1.0 so we never deduct more than the seller originally earned
        if (returnReq.productValue > 0) {
          const ratio = Math.min(parsedAmount / returnReq.productValue, 1);
          // If this is the first time modifying, scale the original deductions.
          // Note: Since we don't keep track of 'original' vs 'current' easily without adding DB fields,
          // we use productValue as the stable denominator.
          // Wait, if we scale it here, it permanently modifies the deduction.
          // Let's just update the refundAmount here, and let completeRefund handle the final scale!
        }
        returnReq.refundAmount = parsedAmount;
        remark += ` (Approved Refund Amount: ₹${parsedAmount})`;
      }
    }

    // Calculate return pickup earning based on actual distance and commission rules
    try {
      const order = await mongoose.model('FoodOrder').findById(returnReq.orderId);
      const seller = await mongoose.model('Seller').findById(returnReq.sellerId);
      let distanceKm = 1.0; // fallback default
      if (order && seller) {
        const custCoords = order.deliveryAddress?.location?.coordinates;
        const sellCoords = seller.location?.coordinates;
        if (Array.isArray(custCoords) && custCoords.length === 2 && Array.isArray(sellCoords) && sellCoords.length === 2) {
          distanceKm = haversineKm(
            sellCoords[1], sellCoords[0],
            custCoords[1], custCoords[0]
          );
        }
      }
      const earning = await getQuickRiderEarning(Math.max(0.1, distanceKm));
      returnReq.returnPickupEarning = earning || 20; // fallback to 20 if 0 or invalid
    } catch (err) {
      console.error('Failed to calculate return pickup earning:', err);
      returnReq.returnPickupEarning = 20; // safe fallback
    }

    returnReq.status = returnStatuses.RETURN_APPROVED;
    returnReq.statusHistory.push({
      status: returnStatuses.RETURN_APPROVED,
      updatedBy: 'Admin',
      updatedById: req.user.userId,
      remarks: remark,
      timestamp: new Date()
    });

    await returnReq.save();
    
    const populated = await QuickReturnRequest.findById(id)
      .populate('orderId')
      .populate('productId', 'name image price')
      .populate('userId', 'name email phone')
      .populate('sellerId', 'name shopName phone location')
      .populate('deliveryPartnerId', 'name phone');

    res.json({ success: true, returnRequest: populated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const rejectReturn = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    await returnService.updateReturnStatus(id, returnStatuses.RETURN_REJECTED, 'Admin', req.user.userId, reason);
    
    const populated = await QuickReturnRequest.findById(id)
      .populate('orderId')
      .populate('productId', 'name image price')
      .populate('userId', 'name email phone')
      .populate('sellerId', 'name shopName phone location')
      .populate('deliveryPartnerId', 'name phone');

    res.json({ success: true, returnRequest: populated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const broadcastReturn = async (req, res) => {
  try {
    const { id } = req.params;
    await returnAssignmentService.broadcastReturnPickup(id);
    
    const populated = await QuickReturnRequest.findById(id)
      .populate('orderId')
      .populate('productId', 'name image price')
      .populate('userId', 'name email phone')
      .populate('sellerId', 'name shopName phone location')
      .populate('deliveryPartnerId', 'name phone');

    res.json({ success: true, message: 'Broadcast successful', returnRequest: populated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const completeRefund = async (req, res) => {
  try {
    const { id } = req.params;
    const { refundAmount, refundMethod, transactionReferenceNumber, refundNotes } = req.body;

    const returnReq = await QuickReturnRequest.findById(id);
    if (!returnReq) throw new Error('Return request not found');

    if (returnReq.status !== returnStatuses.RETURN_RECEIVED_BY_SELLER) {
      throw new Error('Return must be received by seller before refund completion');
    }

    if (!refundAmount || !refundMethod || !transactionReferenceNumber) {
      throw new Error('Refund amount, method, and transaction reference are required');
    }

    const parsedAmount = Number(refundAmount);
    if (!isNaN(parsedAmount)) {
      if (returnReq.productValue > 0) {
        // Calculate the ratio based on the UNMODIFIED productValue, capped at 1.0
        // so we never deduct more than what the seller actually earned, even if the admin refunds extra (e.g. delivery fee).
        const ratio = Math.min(parsedAmount / returnReq.productValue, 1);
        
        // Since we stopped mutating sellerEarningDeduction in approveReturn,
        // it still holds the exact original calculated earning deduction.
        // We now scale it for the final transaction.
        returnReq.sellerEarningDeduction = returnReq.sellerEarningDeduction * ratio;
        returnReq.adminEarningDeduction = returnReq.adminEarningDeduction * ratio;
      }
      returnReq.refundAmount = parsedAmount;
    }

    returnReq.refundMethod = refundMethod;
    returnReq.transactionReferenceNumber = transactionReferenceNumber;
    returnReq.refundNotes = refundNotes;
    returnReq.refundDate = new Date();
    
    // Status update
    returnReq.status = returnStatuses.REFUND_COMPLETED;
    returnReq.statusHistory.push({
      status: returnStatuses.REFUND_COMPLETED,
      updatedBy: 'Admin',
      updatedById: req.user.userId,
      remarks: refundNotes,
      timestamp: new Date()
    });

    if (refundMethod === 'Wallet') {
      const orderIdStr = String(returnReq.orderId || '');
      const orderIdSuffix = orderIdStr ? ` (Order #${orderIdStr.slice(-6).toUpperCase()})` : '';
      await refundWalletBalance(
        returnReq.userId,
        refundAmount,
        `Quick Commerce Return Refund${orderIdSuffix}`,
        { returnRequestId: returnReq._id, orderId: returnReq.orderId, reference: transactionReferenceNumber }
      );
    }

    // Process seller deductions now that refund is finalized
    await returnFinanceService.processReturnDeductions(returnReq);

    await returnReq.save();

    const populated = await QuickReturnRequest.findById(id)
      .populate('orderId')
      .populate('productId', 'name image price')
      .populate('userId', 'name email phone')
      .populate('sellerId', 'name shopName phone location')
      .populate('deliveryPartnerId', 'name phone');

    res.json({ success: true, returnRequest: populated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// ---- Delivery Partner Controllers ----

export const getDeliveryReturnPickups = async (req, res) => {
  try {
    const deliveryPartnerId = req.user.userId;
    // For list: Active assignments or available broadcasts
    // Usually broadcasts are real-time, but we can return active ones here
    const activePickups = await QuickReturnRequest.find({
      deliveryPartnerId,
      status: { $in: [returnStatuses.RETURN_PICKUP_ASSIGNED, returnStatuses.PICKED_UP] }
    })
      .populate('orderId')
      .populate('productId', 'name image')
      .populate('userId', 'name phone address')
      .populate('sellerId', 'name shopName phone location');

    res.json({ success: true, activePickups });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getDeliveryReturnHistory = async (req, res) => {
  try {
    const deliveryPartnerId = req.user.userId;
    const history = await QuickReturnRequest.find({
      deliveryPartnerId,
      status: { $in: [returnStatuses.PICKED_UP, returnStatuses.RETURN_RECEIVED_BY_SELLER, returnStatuses.REFUND_COMPLETED] }
    })
      .populate('productId', 'name')
      .populate('sellerId', 'name shopName phone location')
      .sort({ updatedAt: -1 });

    res.json({ success: true, history });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const acceptDeliveryPickup = async (req, res) => {
  try {
    const { id } = req.params;
    const deliveryPartnerId = req.user.userId;
    const returnReq = await returnAssignmentService.acceptReturnPickup(id, deliveryPartnerId);
    res.json({ success: true, returnRequest: returnReq });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const confirmPickup = async (req, res) => {
  try {
    const { id } = req.params;
    const { otp, pickupImage } = req.body;
    const deliveryPartnerId = req.user.userId;

    const returnReq = await QuickReturnRequest.findOne({ _id: id, deliveryPartnerId });
    if (!returnReq) throw new Error('Return request not found or not assigned to you');

    // Idempotency check: if already PICKED_UP, return success
    if (returnReq.status === returnStatuses.PICKED_UP) {
      const populated = await QuickReturnRequest.findById(id)
        .populate('orderId')
        .populate('productId', 'name image')
        .populate('userId', 'name phone address')
        .populate('sellerId', 'name shopName phone location');
      return res.json({ success: true, returnRequest: populated });
    }

    if (returnReq.status !== returnStatuses.RETURN_PICKUP_ASSIGNED) {
      throw new Error('Invalid status for confirmation');
    }

    if (returnReq.pickupOtp !== otp) {
      throw new Error('Invalid OTP');
    }

    if (!pickupImage) {
      throw new Error('Pickup image is required');
    }

    returnReq.pickupImage = pickupImage;
    returnReq.status = returnStatuses.PICKED_UP;
    returnReq.statusHistory.push({
      status: returnStatuses.PICKED_UP,
      updatedBy: 'Delivery Partner',
      updatedById: deliveryPartnerId,
      remarks: 'Product picked up from user',
      timestamp: new Date()
    });

    await returnReq.save();

    const populated = await QuickReturnRequest.findById(id)
      .populate('orderId')
      .populate('productId', 'name image')
      .populate('userId', 'name phone address')
      .populate('sellerId', 'name shopName phone location');

    res.json({ success: true, returnRequest: populated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const rejectDeliveryBroadcast = async (req, res) => {
  try {
    const { id } = req.params;
    const deliveryPartnerId = req.user.userId;
    const returnReq = await returnAssignmentService.rejectReturnPickup(id, deliveryPartnerId);
    res.json({ success: true, returnRequest: returnReq });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const updateDeliveryReturnStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const deliveryPartnerId = req.user.userId;

    const returnReq = await QuickReturnRequest.findOne({ _id: id, deliveryPartnerId });
    if (!returnReq) throw new Error('Return request not found or not assigned to you');

    const currentStatus = returnReq.status;

    // Idempotency check: if already in the requested status, return success
    if (currentStatus === status) {
      const populated = await QuickReturnRequest.findById(id)
        .populate('orderId')
        .populate('productId', 'name image')
        .populate('userId', 'name phone address')
        .populate('sellerId', 'name shopName phone location');
      return res.json({ success: true, returnRequest: populated });
    }

    if (status === returnStatuses.PICKED_UP) {
      if (currentStatus !== returnStatuses.RETURN_PICKUP_ASSIGNED) {
        throw new Error('Can only mark as Picked Up when current status is Assigned');
      }
    } else if (status === returnStatuses.RETURN_RECEIVED_BY_SELLER) {
      if (currentStatus !== returnStatuses.PICKED_UP) {
        throw new Error('Can only mark as Received by Seller when current status is Picked Up');
      }
    } else {
      throw new Error('Invalid status update path. Only sequential line-by-line updates (Assigned -> Picked Up -> Received by Seller) are allowed.');
    }

    returnReq.status = status;
    returnReq.statusHistory.push({
      status,
      updatedBy: 'Delivery Partner (Manual)',
      updatedById: deliveryPartnerId,
      remarks: `Status updated manually to ${status}`,
      timestamp: new Date()
    });

    await returnReq.save();

    // If marked as received by seller, credit delivery partner
    if (status === returnStatuses.RETURN_RECEIVED_BY_SELLER) {
      await returnFinanceService.creditReturnDeliveryPartner(returnReq);
    }

    const populated = await QuickReturnRequest.findById(id)
      .populate('orderId')
      .populate('productId', 'name image')
      .populate('userId', 'name phone address')
      .populate('sellerId', 'name shopName phone location');

    res.json({ success: true, returnRequest: populated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// ---- Seller Controllers ----

export const getSellerReturns = async (req, res) => {
  try {
    const sellerId = req.user.userId;
    const returns = await QuickReturnRequest.find({ sellerId })
      .populate('productId', 'name image price')
      .populate('userId', 'name')
      .populate('deliveryPartnerId', 'name phone')
      .sort({ updatedAt: -1 });
    res.json({ success: true, returns });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const receiveSellerProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const sellerId = req.user.userId;
    
    const returnReq = await QuickReturnRequest.findOne({ _id: id, sellerId });
    if (!returnReq) throw new Error('Return request not found');

    if (returnReq.status !== returnStatuses.PICKED_UP) {
      throw new Error('Product must be picked up before receiving');
    }

    returnReq.status = returnStatuses.RETURN_RECEIVED_BY_SELLER;
    returnReq.statusHistory.push({
      status: returnStatuses.RETURN_RECEIVED_BY_SELLER,
      updatedBy: 'Seller',
      updatedById: sellerId,
      remarks: 'Product received by seller',
      timestamp: new Date()
    });

    await returnReq.save();

    // Credit delivery partner
    await returnFinanceService.creditReturnDeliveryPartner(returnReq);

    res.json({ success: true, returnRequest: returnReq });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const raiseSellerIssue = async (req, res) => {
  try {
    const { id } = req.params;
    const { remark, images } = req.body;
    const sellerId = req.user.userId;

    const returnReq = await QuickReturnRequest.findOne({ _id: id, sellerId });
    if (!returnReq) throw new Error('Return request not found');

    returnReq.statusHistory.push({
      status: returnReq.status, // Does not change
      updatedBy: 'Seller',
      updatedById: sellerId,
      remarks: `ISSUE RAISED: ${remark}`,
      timestamp: new Date()
    });
    
    if (images && images.length) {
      returnReq.sellerVerificationImages.push(...images);
    }

    await returnReq.save();
    
    // In a real system, you'd send an email/notification to Admin here.
    
    res.json({ success: true, returnRequest: returnReq });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
