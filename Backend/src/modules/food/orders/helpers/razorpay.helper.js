import crypto from 'crypto';

import Razorpay from 'razorpay';

import { config } from '../../../../config/env.js';
import { ValidationError } from '../../../../core/auth/errors.js';

const KEY_ID = config.razorpayKeyId || process.env.RAZORPAY_KEY_ID || '';
const KEY_SECRET = config.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET || '';

export function isRazorpayConfigured() {
    return Boolean(KEY_ID && KEY_SECRET && Razorpay);
}

export function getRazorpayKeyId() {
    return KEY_ID;
}

export function getRazorpayInstance() {
    if (!isRazorpayConfigured()) return null;
    return new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });
}

export function createRazorpayOrder(amountPaise, currency = 'INR', receipt = '') {
    const instance = getRazorpayInstance();
    if (!instance) return Promise.reject(new Error('Razorpay not configured'));
    return instance.orders.create({
        amount: Math.round(amountPaise),
        currency,
        receipt: receipt || undefined
    });
}

export function createPaymentLink({ amountPaise, currency = 'INR', description, orderId, customerName, customerEmail, customerPhone }) {
    const instance = getRazorpayInstance();
    if (!instance) return Promise.reject(new Error('Razorpay not configured'));
    // Live Razorpay risk checks can decline payments carrying placeholder contact details,
    // so only send customer fields that are real.
    const contact = customerPhone ? String(customerPhone).replace(/\D/g, '').slice(-10) : '';
    const email = String(customerEmail || '').trim();
    const customer = { name: customerName || 'Customer' };
    if (/^[6-9]\d{9}$/.test(contact)) customer.contact = contact;
    if (email && !/@example\.com$/i.test(email)) customer.email = email;
    return instance.paymentLink.create({
        amount: Math.round(amountPaise),
        currency,
        description: description || `Order ${orderId}`,
        customer,
    });
}

export function verifyPaymentSignature(orderId, paymentId, signature) {
    if (!KEY_SECRET || !signature) return false;
    const body = `${orderId}|${paymentId}`;
    const expected = crypto.createHmac('sha256', KEY_SECRET).update(body).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(String(signature));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Fully verifies a client-reported Razorpay payment and returns the amount (INR) that
 * Razorpay itself says was captured. Throws ValidationError if anything does not match.
 * Callers must credit THIS amount, never the amount sent by the client.
 */
export async function verifyCapturedRazorpayPayment({ orderId, paymentId, signature }) {
    if (!isRazorpayConfigured()) {
        throw new ValidationError('Online payments are currently unavailable');
    }
    if (!verifyPaymentSignature(orderId, paymentId, signature)) {
        throw new ValidationError('Payment verification failed');
    }
    let payment;
    try {
        payment = await fetchRazorpayPayment(paymentId);
    } catch (err) {
        throw new ValidationError('Unable to confirm payment with the gateway');
    }
    if (String(payment?.order_id || '') !== String(orderId)) {
        throw new ValidationError('Payment does not belong to this order');
    }
    if (String(payment?.status || '').toLowerCase() !== 'captured') {
        throw new ValidationError('Payment is not captured');
    }
    const amountInr = Number(payment.amount) / 100;
    if (!Number.isFinite(amountInr) || amountInr <= 0) {
        throw new ValidationError('Invalid payment amount');
    }
    return amountInr;
}

/**
 * Fetch Razorpay payment (server-side) for additional validation (amount/status/order match).
 * @param {string} paymentId
 */
export async function fetchRazorpayPayment(paymentId) {
    const instance = getRazorpayInstance();
    if (!instance) throw new Error('Razorpay not configured');
    if (!paymentId) throw new Error('paymentId is required');
    return instance.payments.fetch(String(paymentId));
}

/**
 * Fetch Razorpay payment-link to check status (used for Razorpay QR auto verification).
 * @param {string} paymentLinkId
 */
export async function fetchRazorpayPaymentLink(paymentLinkId) {
    const instance = getRazorpayInstance();
    if (!instance) throw new Error('Razorpay not configured');
    if (!paymentLinkId) throw new Error('paymentLinkId is required');
    return instance.paymentLink.fetch(String(paymentLinkId));
}

/**
 * Creates a single-use UPI QR with a fixed amount. Unlike a payment link, the returned
 * `image_url` is a real scannable UPI QR that opens the customer's UPI app directly.
 */
export function createRazorpayUpiQr({ amountPaise, orderId, description }) {
    const instance = getRazorpayInstance();
    if (!instance) return Promise.reject(new Error('Razorpay not configured'));
    return instance.qrCode.create({
        type: 'upi_qr',
        name: `Order ${orderId}`,
        usage: 'single_use',
        fixed_amount: true,
        payment_amount: Math.round(amountPaise),
        description: description || `Order ${orderId}`,
        close_by: Math.floor(Date.now() / 1000) + 30 * 60,
        notes: { orderId: String(orderId) },
    });
}

/**
 * Current state of whatever QR was issued for a COD collection (UPI QR or payment link),
 * normalised to the status words the sync code already understands:
 * 'paid' | 'expired' | 'created'.
 */
export async function fetchRazorpayQrStatus(qr = {}) {
    const instance = getRazorpayInstance();
    if (!instance) throw new Error('Razorpay not configured');
    if (qr?.qrId) {
        const code = await instance.qrCode.fetch(String(qr.qrId));
        const received = Number(code?.payments_amount_received || 0);
        if (Number(code?.payments_count_received || 0) > 0 && received >= Number(code?.payment_amount || 0)) {
            return 'paid';
        }
        return String(code?.status || '').toLowerCase() === 'closed' ? 'expired' : 'created';
    }
    if (qr?.paymentLinkId) {
        const link = await instance.paymentLink.fetch(String(qr.paymentLinkId));
        return String(link?.status || '').toLowerCase();
    }
    return '';
}

/**
 * ✅ NEW: Initiate a refund for a successful payment.
 * NON-BREAKING Extension for automated cancellation refunds.
 * @param {string} paymentId - Original Razorpay payment_id (captured)
 * @param {number} amount - Amount to refund (in major unit, e.g., INR 123.45)
 */
export async function initiateRazorpayRefund(paymentId, amount) {
    if (!isRazorpayConfigured()) {
        return { success: false, error: 'Razorpay is not configured on this server', status: 'failed' };
    }
    const instance = getRazorpayInstance();
    try {
        const refund = await instance.payments.refund(paymentId, {
            amount: Math.round(Number(amount) * 100), // convert to paise
            notes: {
                reason: 'Order cancelled by system flow',
                at: new Date().toISOString()
            }
        });
        return {
            success: true,
            refundId: refund.id,
            status: refund.status || 'processed',
            raw: refund
        };
    } catch (err) {
        // Log locally but pass the error to the service to handle status update
        console.error(`Razorpay Refund API Failure [PaymentId: ${paymentId}]:`, err?.message || err);
        return {
            success: false,
            error: err?.message || 'Razorpay refund API error',
            status: 'failed'
        };
    }
}
