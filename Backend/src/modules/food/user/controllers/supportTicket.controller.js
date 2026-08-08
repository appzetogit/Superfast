import mongoose from 'mongoose';
import { FoodSupportTicket } from '../models/supportTicket.model.js';
import { sendResponse, sendError } from '../../../../utils/response.js';
import { sendNotificationToOwners } from '../../../../core/notifications/firebase.service.js';
import { createInboxNotifications } from '../../../../core/notifications/notification.service.js';
import { logger } from '../../../../utils/logger.js';

export async function createSupportTicketController(req, res, next) {
    try {
        const userId = req.user?.userId;
        const body = req.body || {};
        const type = String(body.type || '').trim();
        const issueType = String(body.issueType || '').trim();
        const description = String(body.description || '').trim();
        if (!['order', 'restaurant', 'other'].includes(type)) {
            return sendError(res, 400, 'Invalid ticket type');
        }
        if (!issueType) return sendError(res, 400, 'issueType required');
        const doc = {
            userId: new mongoose.Types.ObjectId(userId),
            type,
            issueType,
            description
        };
        if (type === 'order') {
            if (!body.orderId || !mongoose.Types.ObjectId.isValid(body.orderId)) {
                return sendError(res, 400, 'orderId required');
            }
            const orderMongoId = new mongoose.Types.ObjectId(body.orderId);
            doc.orderId = orderMongoId;
            // Also try to link restaurantId automatically if possible
            const { FoodOrder } = await import('../../orders/models/order.model.js');
            const order = await FoodOrder.findById(orderMongoId).select('restaurantId').lean();
            if (order?.restaurantId) {
                doc.restaurantId = order.restaurantId;
            }
        }
        if (type === 'restaurant') {
            if (!body.restaurantId || !mongoose.Types.ObjectId.isValid(body.restaurantId)) {
                return sendError(res, 400, 'restaurantId required');
            }
            doc.restaurantId = new mongoose.Types.ObjectId(body.restaurantId);
        }
        const created = await FoodSupportTicket.create(doc);

        // Notify the restaurant if this complaint is linked to one
        if (doc.restaurantId) {
            const notifTitle = `New Complaint: ${issueType}`;
            const notifBody = description
                ? `A customer filed a complaint: "${description.slice(0, 120)}${description.length > 120 ? '…' : ''}"`
                : `A customer filed a complaint about your restaurant (${issueType}).`;
            const link = `/restaurant/feedback?tab=complaints`;

            try {
                await sendNotificationToOwners(
                    [{ ownerType: 'RESTAURANT', ownerId: doc.restaurantId }],
                    {
                        title: notifTitle,
                        body: notifBody,
                        data: {
                            type: 'new_complaint',
                            ticketId: String(created._id),
                            issueType,
                            link,
                        },
                    }
                );
            } catch (pushErr) {
                logger.warn(`Failed to push complaint notification to restaurant: ${pushErr?.message || pushErr}`);
            }

            try {
                await createInboxNotifications({
                    notifications: [{
                        ownerType: 'RESTAURANT',
                        ownerId: String(doc.restaurantId),
                        title: notifTitle,
                        message: notifBody,
                        link,
                        category: 'complaint',
                        metadata: {
                            type: 'new_complaint',
                            ticketId: String(created._id),
                            issueType,
                        },
                    }],
                });
            } catch (inboxErr) {
                logger.warn(`Failed to create restaurant inbox notification for complaint: ${inboxErr?.message || inboxErr}`);
            }
        }

        return sendResponse(res, 201, 'Ticket created', { ticket: created.toObject() });
    } catch (e) {
        next(e);
    }
}

export async function listMySupportTicketsController(req, res, next) {
    try {
        const userId = req.user?.userId;
        const limit = Math.min(Math.max(parseInt(req.query?.limit, 10) || 20, 1), 50);
        const page = Math.max(parseInt(req.query?.page, 10) || 1, 1);
        const skip = (page - 1) * limit;
        const [tickets, total] = await Promise.all([
            FoodSupportTicket.find({ userId: new mongoose.Types.ObjectId(userId) })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            FoodSupportTicket.countDocuments({ userId: new mongoose.Types.ObjectId(userId) })
        ]);
        return sendResponse(res, 200, 'Tickets fetched', { tickets, total, page, limit });
    } catch (e) {
        next(e);
    }
}
