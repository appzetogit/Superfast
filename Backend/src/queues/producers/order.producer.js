import { getOrderQueue } from '../index.js';
import { logger } from '../../utils/logger.js';

// Pending in-memory fallback timers, one per (action, order).
const pendingInMemJobs = new Map();

/**
 * Add an order processing job to the queue. No-op if BullMQ is disabled.
 * @param {object} data - Job data (e.g. { orderId, action })
 * @param {object} [options] - BullMQ job options override
 * @returns {Promise<import('bullmq').Job | null>}
 */
export const addOrderJob = async (data, options = {}) => {
    const queue = getOrderQueue();
    if (!queue) {
        // Fallback: execute in-memory timer if BullMQ/Redis is not enabled or unavailable
        const delay = options.delay || 0;
        // Keep at most ONE pending timer per (action, order). Without this, every dispatch
        // watchdog tick / retry spawns another self-rescheduling chain for the same stuck order,
        // chains multiply and saturate the DB + event loop (API goes from ms to 8s+ per request).
        const orderKey = data?.orderMongoId || data?.orderId;
        const dedupeKey = orderKey && data?.action ? `${data.action}:${orderKey}` : null;
        if (dedupeKey) {
            const existing = pendingInMemJobs.get(dedupeKey);
            if (existing) clearTimeout(existing);
        }
        const timer = setTimeout(async () => {
            if (dedupeKey && pendingInMemJobs.get(dedupeKey) === timer) pendingInMemJobs.delete(dedupeKey);
            try {
                const { processOrderJob } = await import('../processors/order.processor.js');
                await processOrderJob({ id: `inmem_${Date.now()}`, data });
            } catch (err) {
                logger.error(`[InMemQueue:order] processOrderJob failed: ${err.message}`);
            }
        }, delay);
        if (dedupeKey) pendingInMemJobs.set(dedupeKey, timer);
        return null;
    }
    try {
        const job = await queue.add('process-order', data, options);
        logger.info(`Order job added: ${job.id}`);
        return job;
    } catch (err) {
        logger.error(`Failed to add order job: ${err.message}`);
        throw err;
    }
};
