import mongoose from 'mongoose';
import { FoodAdmin } from '../admin/admin.model.js';
import { FoodNotification } from './models/notification.model.js';
import { notifyAdminsSafely } from './firebase.service.js';
import { getIO, rooms } from '../../config/socket.js';
import { logger } from '../../utils/logger.js';

const toStringMap = (obj = {}) =>
    Object.fromEntries(
        Object.entries(obj)
            .filter(([, v]) => v !== undefined && v !== null)
            .map(([k, v]) => [k, String(v)])
    );

/**
 * Saves an admin inbox notification for every active admin, emits `admin_notification`
 * to each admin socket room, and sends a push. Never throws: callers fire and forget.
 *
 * @param {object} event
 * @param {string} event.type      socket payload type, e.g. 'new_order'
 * @param {string} event.title
 * @param {string} event.message
 * @param {string} [event.link]    admin panel path to open
 * @param {string} [event.entityId] id of the order / restaurant / partner
 * @param {object} [event.metadata] extra fields sent to the socket payload and stored
 * @param {string} [event.pushType] FCM data.type (defaults to `type`)
 */
export async function notifyAdminEvent({ type, title, message, link = '', entityId = '', metadata = {}, pushType } = {}) {
    try {
        if (!type || !title || !message) return;

        const admins = await FoodAdmin.find({ isActive: true }).select('_id').lean();
        if (!admins.length) return;

        const now = new Date();
        const docs = admins.map((admin) => ({
            ownerType: 'ADMIN',
            ownerId: admin._id,
            title,
            message,
            link,
            category: type,
            source: 'SYSTEM',
            // Unique per row: the collection has a unique index on { broadcastId, ownerType, ownerId }.
            broadcastId: new mongoose.Types.ObjectId(),
            metadata: { ...metadata, entityId: String(entityId || '') },
            isRead: false,
            createdAt: now,
            updatedAt: now,
        }));

        let saved = [];
        try {
            saved = await FoodNotification.insertMany(docs, { ordered: false });
        } catch (err) {
            logger.error(`Admin inbox save failed (${type}): ${err.message}`);
        }
        const savedByAdmin = new Map(saved.map((doc) => [String(doc.ownerId), String(doc._id)]));

        const io = getIO();
        if (io) {
            for (const admin of admins) {
                io.to(rooms.admin(admin._id)).emit('admin_notification', {
                    ...metadata,
                    type,
                    id: String(entityId || ''),
                    notificationId: savedByAdmin.get(String(admin._id)) || null,
                    title,
                    message,
                    link,
                    timestamp: now.toISOString(),
                });
            }
        }

        void notifyAdminsSafely({
            title,
            body: message,
            data: toStringMap({
                type: pushType || type,
                id: entityId,
                link,
                click_action: link,
            }),
        });
    } catch (err) {
        logger.error(`notifyAdminEvent failed (${type}): ${err.message}`);
    }
}
