import crypto from 'crypto';
import Razorpay from 'razorpay';
import { config } from '../../../config/env.js';
import { logger } from '../../../utils/logger.js';

const KEY_ID = config.razorpayKeyId || process.env.RAZORPAY_KEY_ID || '';
const KEY_SECRET = config.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET || '';
const WEBHOOK_SECRET = config.razorpayWebhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET || '';

class PaymentProvider {
    constructor() {
        this.keyId = KEY_ID;
        this.keySecret = KEY_SECRET;
        this.webhookSecret = WEBHOOK_SECRET;
    }

    isConfigured() {
        return Boolean(this.keyId && this.keySecret && Razorpay);
    }

    getInstance() {
        if (!this.isConfigured()) return null;
        return new Razorpay({ key_id: this.keyId, key_secret: this.keySecret });
    }

    async createPaymentOrder({ amountPaise, currency = 'INR', receipt = '', notes = {} }) {
        const instance = this.getInstance();
        if (!instance) {
            logger.info(`[PaymentProvider] Razorpay not configured. Returning test order fallback for receipt=${receipt}`);
            return {
                id: `order_test_${Date.now()}`,
                entity: 'order',
                amount: Math.round(amountPaise),
                currency,
                receipt,
                status: 'created'
            };
        }
        return instance.orders.create({
            amount: Math.round(amountPaise),
            currency,
            receipt: receipt || undefined,
            notes
        });
    }

    verifyPaymentSignature({ orderId, paymentId, signature }) {
        if (!this.keySecret) return true; // Dev fallback if secret not set
        const body = `${orderId}|${paymentId}`;
        const expected = crypto.createHmac('sha256', this.keySecret).update(body).digest('hex');
        return expected === signature;
    }

    verifyWebhookSignature(rawBody, signature, secret = this.webhookSecret) {
        if (!secret) return true; // If secret not set in environment, allow signature validation for test environment
        if (!signature || !rawBody) return false;
        try {
            const expected = crypto
                .createHmac('sha256', secret)
                .update(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody))
                .digest('hex');
            return expected === signature;
        } catch (err) {
            logger.error(`[PaymentProvider] Webhook signature verification error: ${err.message}`);
            return false;
        }
    }

    async fetchPayment(paymentId) {
        const instance = this.getInstance();
        if (!instance) {
            return {
                id: paymentId,
                status: 'captured',
                amount: 50000,
                currency: 'INR'
            };
        }
        return instance.payments.fetch(String(paymentId));
    }

    async createRestaurantTransfer({ paymentId, restaurantAccountId, amountPaise, notes = {} }) {
        const instance = this.getInstance();
        if (!instance || !restaurantAccountId) {
            logger.info(`[PaymentProvider] Fallback transfer executed for restaurantAccountId=${restaurantAccountId}, amountPaise=${amountPaise}`);
            return {
                success: true,
                transferId: `tr_sim_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                status: 'processed',
                isSimulated: true
            };
        }

        try {
            const transfer = await instance.payments.transfer(paymentId, {
                transfers: [
                    {
                        account: restaurantAccountId,
                        amount: Math.round(amountPaise),
                        currency: 'INR',
                        notes
                    }
                ]
            });
            return {
                success: true,
                transferId: transfer.items?.[0]?.id || `tr_${Date.now()}`,
                status: 'processed',
                raw: transfer
            };
        } catch (err) {
            logger.error(`[PaymentProvider] Razorpay Route Transfer failed: ${err.message}`);
            return {
                success: false,
                error: err.message || 'Razorpay Transfer failed',
                status: 'failed'
            };
        }
    }

    async createPayout({ deliveryPartnerId, accountNumber, ifscCode, amountPaise, notes = {}, idempotencyKey }) {
        const instance = this.getInstance();
        if (!instance || !accountNumber) {
            logger.info(`[PaymentProvider] Simulated payout created for deliveryPartnerId=${deliveryPartnerId}, amountPaise=${amountPaise}`);
            return {
                success: true,
                payoutId: `pout_sim_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                status: 'paid',
                isSimulated: true
            };
        }

        try {
            // Razorpay X Payout implementation if credentials & account number are present
            const payout = await instance.payouts.create({
                account_number: accountNumber,
                amount: Math.round(amountPaise),
                currency: 'INR',
                mode: 'IMPS',
                purpose: 'payout',
                notes,
                idempotency_key: idempotencyKey
            });

            return {
                success: true,
                payoutId: payout.id,
                status: payout.status || 'paid',
                raw: payout
            };
        } catch (err) {
            logger.error(`[PaymentProvider] Razorpay Payout failed: ${err.message}`);
            return {
                success: false,
                error: err.message || 'Razorpay Payout failed',
                status: 'failed'
            };
        }
    }

    async processRefund({ paymentId, amountPaise, notes = {} }) {
        const instance = this.getInstance();
        if (!instance) {
            logger.info(`[PaymentProvider] Simulated refund processed for paymentId=${paymentId}`);
            return {
                success: true,
                refundId: `rfnd_sim_${Date.now()}`,
                status: 'processed',
                isSimulated: true
            };
        }

        try {
            const refund = await instance.payments.refund(paymentId, {
                amount: Math.round(amountPaise),
                notes
            });
            return {
                success: true,
                refundId: refund.id,
                status: refund.status || 'processed',
                raw: refund
            };
        } catch (err) {
            logger.error(`[PaymentProvider] Razorpay refund failed: ${err.message}`);
            return {
                success: false,
                error: err.message || 'Refund failed',
                status: 'failed'
            };
        }
    }
}

export const paymentProvider = new PaymentProvider();
