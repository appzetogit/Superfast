import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodUser } from '../../../../core/users/user.model.js';
import { FoodUserWallet } from '../models/userWallet.model.js';
import { createRazorpayOrder, getRazorpayKeyId, isRazorpayConfigured, verifyCapturedRazorpayPayment } from '../../orders/helpers/razorpay.helper.js';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const syncUserWalletBalance = async (userId, balance) => {
    const numericBalance = Math.max(0, Number(balance) || 0);
    await FoodUser.updateOne(
        { _id: userId },
        { $set: { walletBalance: numericBalance } }
    );
};

const ensureWallet = async (userId) => {
    const id = String(userId || '');
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('User not found');
    }
    const oid = new mongoose.Types.ObjectId(id);
    const existing = await FoodUserWallet.findOne({ userId: oid });
    if (existing) return existing;
    const created = await FoodUserWallet.create({ userId: oid, balance: 0, transactions: [] });
    await syncUserWalletBalance(oid, created.balance);
    return created;
};

export const creditReferralReward = async (userId, amountInr, metadata = {}) => {
    const amount = round2(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        return { wallet: await getUserWallet(userId) };
    }
    const wallet = await ensureWallet(userId);
    const updated = await FoodUserWallet.findOneAndUpdate(
        { userId: wallet.userId },
        {
            $inc: { balance: amount, referralEarnings: amount },
            $push: {
                transactions: {
                    $each: [{
                        type: 'addition',
                        amount,
                        status: 'Completed',
                        description: 'Referral reward',
                        metadata: { source: 'referral_reward', ...(metadata || {}) }
                    }],
                    $position: 0
                }
            }
        },
        { new: true }
    );
    await syncUserWalletBalance(userId, updated.balance);
    return { wallet: await getUserWallet(userId) };
};

export const getUserWallet = async (userId) => {
    const id = String(userId || '');
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('User not found');
    }
    const oid = new mongoose.Types.ObjectId(id);
    const wallet = await FoodUserWallet.findOne({ userId: oid });
    if (!wallet) {
        return { balance: 0, referralEarnings: 0, transactions: [] };
    }
    // Return newest first (UI expects recent transactions on top)
    const tx = Array.isArray(wallet.transactions) ? [...wallet.transactions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) : [];
    return {
        balance: Number(wallet.balance) || 0,
        referralEarnings: Number(wallet.referralEarnings) || 0,
        transactions: tx.map((t) => ({
            id: String(t._id),
            _id: t._id,
            type: t.type,
            amount: Number(t.amount) || 0,
            status: t.status || 'Completed',
            description: t.description || '',
            date: t.createdAt,
            createdAt: t.createdAt,
            metadata: t.metadata || {}
        }))
    };
};

export const createWalletTopupOrder = async (userId, amountInr) => {
    if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
        throw new ValidationError('User not found');
    }
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new ValidationError('Amount must be greater than 0');
    }
    if (amount > 50000) {
        throw new ValidationError('Maximum amount is 50,000');
    }

    // Fail closed: never hand out a dummy order that could later be "verified".
    if (!isRazorpayConfigured()) {
        throw new ValidationError('Online payments are currently unavailable');
    }

    const amountPaise = Math.round(amount * 100);
    const receipt = `wallet_topup_${String(userId).slice(-8)}_${Date.now()}`;

    try {
        const order = await createRazorpayOrder(amountPaise, 'INR', receipt);

        return {
            razorpay: {
                key: getRazorpayKeyId(),
                orderId: String(order.id),
                amount: Number(order.amount) || amountPaise,
                currency: order.currency || 'INR'
            }
        };
    } catch (error) {
        console.error('Razorpay Wallet Topup Error:', error);
        throw new Error(error.description || error.message || 'Failed to create payment order');
    }
};

export const verifyWalletTopupPayment = async (userId, payload) => {
    const orderId = String(payload?.razorpayOrderId || '').trim();
    const paymentId = String(payload?.razorpayPaymentId || '').trim();
    const signature = String(payload?.razorpaySignature || '').trim();

    if (!orderId) throw new ValidationError('razorpayOrderId is required');
    if (!paymentId) throw new ValidationError('razorpayPaymentId is required');
    if (!signature) throw new ValidationError('razorpaySignature is required');

    const wallet = await ensureWallet(userId);
    const alreadyCredited = wallet.transactions.some(
        (t) => String(t.razorpayPaymentId || '') === paymentId || String(t.razorpayOrderId || '') === orderId
    );
    if (alreadyCredited) {
        return { wallet: await getUserWallet(userId) };
    }

    // A gateway payment can only ever credit one wallet.
    const usedElsewhere = await FoodUserWallet.exists({ 'transactions.razorpayPaymentId': paymentId });
    if (usedElsewhere) {
        throw new ValidationError('This payment has already been used');
    }

    // Credit the amount Razorpay reports as captured, never the client-sent amount.
    const amount = round2(await verifyCapturedRazorpayPayment({ orderId, paymentId, signature }));

    // Atomic + idempotent: only applies if this payment/order was not credited in the meantime.
    const updated = await FoodUserWallet.findOneAndUpdate(
        {
            userId: wallet.userId,
            'transactions.razorpayPaymentId': { $ne: paymentId },
            'transactions.razorpayOrderId': { $ne: orderId }
        },
        {
            $inc: { balance: amount },
            $push: {
                transactions: {
                    $each: [{
                        type: 'addition',
                        amount,
                        status: 'Completed',
                        description: 'Wallet top-up',
                        metadata: { source: 'wallet_topup', mode: 'razorpay' },
                        razorpayOrderId: orderId,
                        razorpayPaymentId: paymentId,
                        razorpaySignature: signature
                    }],
                    $position: 0
                }
            }
        },
        { new: true }
    );

    if (updated) await syncUserWalletBalance(userId, updated.balance);

    return { wallet: await getUserWallet(userId) };
};

export const deductWalletBalance = async (userId, amountInr, description = 'Order payment', metadata = {}) => {
    const amount = round2(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new ValidationError('Invalid deduction amount');
    }

    const wallet = await ensureWallet(userId);

    // Atomic: balance check and debit are one operation, so parallel orders cannot overspend.
    const updated = await FoodUserWallet.findOneAndUpdate(
        { userId: wallet.userId, balance: { $gte: amount } },
        {
            $inc: { balance: -amount },
            $push: {
                transactions: {
                    $each: [{
                        type: 'deduction',
                        amount,
                        status: 'Completed',
                        description,
                        metadata: { source: 'order_payment', ...(metadata || {}) }
                    }],
                    $position: 0
                }
            }
        },
        { new: true }
    );
    if (!updated) {
        throw new ValidationError('Insufficient wallet balance');
    }
    await syncUserWalletBalance(userId, updated.balance);

    return { wallet: await getUserWallet(userId) };
};

export const refundWalletBalance = async (userId, amountInr, description = 'Order refund', metadata = {}) => {
    const amount = round2(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        return { wallet: await getUserWallet(userId) };
    }

    const wallet = await ensureWallet(userId);
    const updated = await FoodUserWallet.findOneAndUpdate(
        { userId: wallet.userId },
        {
            $inc: { balance: amount },
            $push: {
                transactions: {
                    $each: [{
                        type: 'refund',
                        amount,
                        status: 'Completed',
                        description,
                        metadata: { source: 'order_refund', ...(metadata || {}) }
                    }],
                    $position: 0
                }
            }
        },
        { new: true }
    );
    await syncUserWalletBalance(userId, updated.balance);

    return { wallet: await getUserWallet(userId) };
};
