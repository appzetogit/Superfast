import { QuickReturnRequest } from '../models/ReturnRequest.model.js';
import { QuickOrder } from '../models/order.model.js';
import { returnStatuses } from '../../../constants/returnStatuses.js';
import { calculateReturnDeductions } from './return-finance.service.js';

/**
 * Validates if the order is eligible for a return.
 */
export const validateReturnEligibility = async (orderId, productId, returnQuantity, returnWindowDays) => {
  const order = await QuickOrder.findById(orderId);
  if (!order) throw new Error('Order not found');

  if (!['delivered', 'completed'].includes(order.orderStatus.toLowerCase())) {
    throw new Error('Returns are only allowed for delivered orders');
  }

  // 1. Return Window Validation (starts from Delivered DateTime)
  const deliveredPhase = order.deliveryState?.phases?.find(p => p.phase === 'delivered');
  const deliveredDate = deliveredPhase?.timestamp || order.updatedAt; // fallback
  
  const windowMs = returnWindowDays * 24 * 60 * 60 * 1000;
  const now = new Date();
  if (now.getTime() - new Date(deliveredDate).getTime() > windowMs) {
    throw new Error('Return window has expired for this order');
  }

  // 2. Quantity Validation
  const orderItem = order.items?.find(item => 
    item.product?.toString() === productId.toString() || 
    item.productId?.toString() === productId.toString() ||
    item.itemId?.toString() === productId.toString()
  );
  if (!orderItem) throw new Error('Product not found in this order');
  
  if (returnQuantity > orderItem.quantity) {
    throw new Error(`Cannot return more than the delivered quantity (${orderItem.quantity})`);
  }

  // 3. Duplicate Request Prevention
  const existingActiveReturn = await QuickReturnRequest.findOne({
    orderId,
    productId,
    status: { 
      $nin: [returnStatuses.RETURN_REJECTED, returnStatuses.REFUND_COMPLETED] 
    }
  });

  if (existingActiveReturn) {
    throw new Error('An active return request already exists for this product');
  }

  return { order, orderItem };
};

import { SellerOrder } from '../seller/models/sellerOrder.model.js';

/**
 * Creates a new return request.
 */
export const createReturnRequest = async (userId, data, returnWindowDays) => {
  const { orderId, productId, quantity, reason, description, userImages, refundMethod, bankDetails, upiId } = data;
  
  const { order, orderItem } = await validateReturnEligibility(orderId, productId, quantity, returnWindowDays);

  const sellerId = orderItem.sourceId || order.restaurantId;
  const sellerOrder = await SellerOrder.findOne({ parentOrderId: order._id, sellerId });

  const deductions = calculateReturnDeductions(order, sellerOrder, orderItem, quantity);

  // Generate OTP immediately
  const pickupOtp = Math.floor(1000 + Math.random() * 9000).toString();

  const newReturn = new QuickReturnRequest({
    orderId,
    userId,
    sellerId: orderItem.sourceId || order.restaurantId,
    productId,
    quantity,
    reason,
    description,
    userImages,
    refundMethod,
    bankDetails: refundMethod === 'Bank' ? bankDetails : undefined,
    upiId: refundMethod === 'UPI' ? upiId : undefined,
    refundAmount: deductions.productValue,
    
    productValue: deductions.productValue,
    sellerEarningDeduction: deductions.sellerDeduction,
    adminEarningDeduction: deductions.adminDeduction,
    
    pickupOtp,
    status: returnStatuses.RETURN_REQUESTED,
    statusHistory: [{
      status: returnStatuses.RETURN_REQUESTED,
      updatedBy: 'User',
      updatedById: userId,
      remarks: 'Return request submitted',
      timestamp: new Date()
    }]
  });

  await newReturn.save();
  return newReturn;
};

/**
 * Updates the status of a return request and adds to history.
 */
export const updateReturnStatus = async (returnId, newStatus, updatedBy, updatedById, remarks = '') => {
  const returnReq = await QuickReturnRequest.findById(returnId);
  if (!returnReq) throw new Error('Return request not found');

  returnReq.status = newStatus;
  returnReq.statusHistory.push({
    status: newStatus,
    updatedBy,
    updatedById,
    remarks,
    timestamp: new Date()
  });

  await returnReq.save();
  return returnReq;
};
