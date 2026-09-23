import { getOrderQueue } from '../index.js';
import { logger } from '../../utils/logger.js';

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
        setTimeout(async () => {
            try {
                const { processOrderJob } = await import('../processors/order.processor.js');
                await processOrderJob({ id: `inmem_${Date.now()}`, data });
            } catch (err) {
                logger.error(`[InMemQueue:order] processOrderJob failed: ${err.message}`);
            }
        }, delay);
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
