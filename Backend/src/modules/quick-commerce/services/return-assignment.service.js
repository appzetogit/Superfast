import { getIO, rooms } from '../../../config/socket.js';
import { FoodDeliveryPartner } from '../../food/delivery/models/deliveryPartner.model.js';
import { QuickReturnRequest } from '../models/ReturnRequest.model.js';
import { returnStatuses } from '../../../constants/returnStatuses.js';
import { QuickOrder } from '../models/order.model.js';
import { Seller } from '../seller/models/seller.model.js';
import { haversineKm } from '../../food/orders/services/order.helpers.js';
import { notifyOwnersSafely } from '../../../core/notifications/firebase.service.js';

/**
 * Builds the payload for a return pickup broadcast.
 */
const buildReturnBroadcastPayload = async (returnRequest) => {
  const order = await QuickOrder.findById(returnRequest.orderId).populate('userId', 'name phone').lean();
  
  let sellerName = 'Seller';
  let sellerAddress = '';
  if (returnRequest.sellerId) {
    const seller = await Seller.findById(returnRequest.sellerId).lean();
    if (seller) {
      sellerName = seller.shopName || seller.name || 'Seller';
      sellerAddress = seller.location?.address || seller.location?.formattedAddress || '';
    }
  }

  let distanceKm = 0;
  if (order && order.deliveryAddress?.location?.coordinates && returnRequest.sellerId) {
    const custCoords = order.deliveryAddress.location.coordinates;
    const seller = await Seller.findById(returnRequest.sellerId).lean();
    if (seller && seller.location?.coordinates) {
      const sellCoords = seller.location.coordinates;
      if (Array.isArray(custCoords) && custCoords.length === 2 && Array.isArray(sellCoords) && sellCoords.length === 2) {
        distanceKm = haversineKm(
          sellCoords[1], sellCoords[0],
          custCoords[1], custCoords[0]
        );
      }
    }
  }

  return {
    type: 'RETURN_PICKUP',
    returnId: returnRequest._id,
    orderId: returnRequest.orderId,
    productName: 'Returned Product', // We can populate product name if needed
    quantity: returnRequest.quantity,
    customerName: order?.userId?.name || 'Customer',
    customerAddress: order?.deliveryAddress?.street || order?.deliveryAddress?.address || '',
    sellerName,
    sellerAddress,
    pickupDistance: distanceKm,
    expectedEarning: returnRequest.returnPickupEarning || 0
  };
};

/**
 * Broadcasts a return pickup request to available delivery partners.
 * Reuses existing socket infrastructure but completely isolated conceptually.
 */
export const broadcastReturnPickup = async (returnId) => {
  const returnReq = await QuickReturnRequest.findById(returnId);
  if (!returnReq || returnReq.status !== returnStatuses.RETURN_APPROVED) {
    throw new Error('Return request not found or not in APPROVED state for broadcast');
  }

  // Find eligible online delivery partners.
  // In a real isolated system, we might just query the same collection but for our specific purpose.
  // We ignore those who already rejected it.
  const rejectedIds = returnReq.rejectedByDeliveryPartners || [];
  
  const availablePartners = await FoodDeliveryPartner.find({
    status: 'approved',
    availabilityStatus: 'online',
    _id: { $nin: rejectedIds }
  }).lean();

  if (availablePartners.length === 0) {
    console.warn('No delivery partners available for return pickup broadcast');
    return returnReq;
  }

  const payload = await buildReturnBroadcastPayload(returnReq);

  // Socket broadcast
  const io = getIO();
  if (io) {
    availablePartners.forEach(partner => {
      io.to(rooms.delivery(partner._id)).emit('new_return_pickup_available', payload);
    });
  } else {
    console.warn('Socket IO not initialized. Skipping socket broadcast.');
  }

  // FCM broadcast
  const targets = availablePartners.map(partner => ({
    ownerType: 'DELIVERY_PARTNER',
    ownerId: partner._id.toString()
  }));

  try {
    await notifyOwnersSafely(targets, {
      title: 'New Return Pickup Available!',
      body: `Earn ₹${returnReq.returnPickupEarning || 0} for return pickup from ${payload.customerName}.`,
      data: {
        type: 'new_return_pickup',
        returnId: returnReq._id.toString()
      }
    });
  } catch (err) {
    console.error('Failed to send FCM notifications for return pickup:', err);
  }

  return returnReq;
};

/**
 * Handles a delivery partner accepting a return pickup.
 * Implements auto-hide logic for others.
 */
export const acceptReturnPickup = async (returnId, deliveryPartnerId) => {
  const returnReq = await QuickReturnRequest.findById(returnId);
  
  if (!returnReq) throw new Error('Return request not found');
  
  // Concurrency check
  if (returnReq.status !== returnStatuses.RETURN_APPROVED) {
    throw new Error('This return request is no longer available');
  }

  if (returnReq.deliveryPartnerId) {
    throw new Error('Return pickup already accepted by another partner');
  }

  // Assign and update status
  returnReq.deliveryPartnerId = deliveryPartnerId;
  returnReq.status = returnStatuses.RETURN_PICKUP_ASSIGNED;
  returnReq.statusHistory.push({
    status: returnStatuses.RETURN_PICKUP_ASSIGNED,
    updatedBy: 'Delivery Partner',
    updatedById: deliveryPartnerId,
    remarks: 'Return pickup accepted',
    timestamp: new Date()
  });

  await returnReq.save();

  // Auto-hide broadcast to others
  const io = getIO();
  if (io) {
    // We can emit a 'return_pickup_assigned' to let other clients drop it from their list
    // Or we could broadcast to all delivery rooms except the one who accepted
    io.emit('remove_return_pickup', { returnId: returnReq._id });
  }

  return returnReq;
};

/**
 * Handles a delivery partner explicitly rejecting a return pickup.
 */
export const rejectReturnPickup = async (returnId, deliveryPartnerId) => {
  const returnReq = await QuickReturnRequest.findById(returnId);
  if (!returnReq) throw new Error('Return request not found');

  if (!returnReq.rejectedByDeliveryPartners.includes(deliveryPartnerId)) {
    returnReq.rejectedByDeliveryPartners.push(deliveryPartnerId);
    await returnReq.save();
  }

  return returnReq;
};
