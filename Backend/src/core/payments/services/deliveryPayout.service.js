import mongoose from 'mongoose';
import { FoodDeliveryWallet } from '../../../modules/food/delivery/models/deliveryWallet.model.js';
import { FoodDeliveryPartner } from '../../../modules/food/delivery/models/deliveryPartner.model.js';
import { DeliveryPayoutRecord } from '../models/deliveryPayoutRecord.model.js';
import { paymentProvider } from '../providers/paymentProvider.interface.js';
import { logger } from '../../../utils/logger.js';

export async function creditDeliveryPartnerWallet({ deliveryPartnerId, amount, orderId = null, description = '' }) {
    if (!deliveryPartnerId || amount <= 0) return null;

    const oid = new mongoose.Types.ObjectId(String(deliveryPartnerId));
    let wallet = await FoodDeliveryWallet.findOne({ deliveryPartnerId: oid });
    if (!wallet) {
        wallet = await FoodDeliveryWallet.create({ deliveryPartnerId: oid, balance: 0, totalEarnings: 0 });
    }

    wallet.balance = Math.round((wallet.balance + amount) * 100) / 100;
    wallet.totalEarnings = Math.round((wallet.totalEarnings + amount) * 100) / 100;
    await wallet.save();

    logger.info(`[DeliveryPayout] Credited wallet for partner ${deliveryPartnerId} +${amount}. New balance=${wallet.balance}`);

    return {
        availableBalance: Math.max(0, wallet.balance - wallet.lockedAmount),
        balance: wallet.balance
    };
}

export async function getDeliveryPartnerWalletDetails(deliveryPartnerId) {
    const oid = new mongoose.Types.ObjectId(String(deliveryPartnerId));
    let wallet = await FoodDeliveryWallet.findOne({ deliveryPartnerId: oid }).lean();
    if (!wallet) {
        wallet = { balance: 0, lockedAmount: 0, cashInHand: 0, totalEarnings: 0, totalSettled: 0 };
    }

    const availableBalance = Math.max(0, Number(wallet.balance || 0) - Number(wallet.lockedAmount || 0));

    return {
        deliveryPartnerId: String(deliveryPartnerId),
        balance: Number(wallet.balance || 0),
        availableBalance,
        pendingBalance: Number(wallet.lockedAmount || 0),
        processingBalance: Number(wallet.lockedAmount || 0),
        paidBalance: Number(wallet.totalSettled || 0),
        cashInHand: Number(wallet.cashInHand || 0),
        totalEarnings: Number(wallet.totalEarnings || 0)
    };
}

export async function processScheduledDeliveryPayouts({ scheduleType = 'DAILY', minimumPayoutAmount = 100 } = {}) {
    logger.info(`[DeliveryPayout] Starting ${scheduleType} scheduled auto payout execution (minPayout=${minimumPayoutAmount})...`);

    const wallets = await FoodDeliveryWallet.find({
        $expr: { $gte: [{ $subtract: ['$balance', '$lockedAmount'] }, minimumPayoutAmount] }
    }).lean();

    logger.info(`[DeliveryPayout] Found ${wallets.length} delivery partners eligible for ${scheduleType} payout.`);

    const results = [];
    for (const w of wallets) {
        try {
            const avail = Math.max(0, Number(w.balance || 0) - Number(w.lockedAmount || 0));
            if (avail >= minimumPayoutAmount) {
                const payout = await executeDeliveryPartnerPayout({
                    deliveryPartnerId: w.deliveryPartnerId,
                    amount: avail,
                    scheduleType
                });
                results.push(payout);
            }
        } catch (err) {
            logger.error(`[DeliveryPayout] Failed payout for partner ${w.deliveryPartnerId}: ${err.message}`);
        }
    }

    return results;
}

export async function executeDeliveryPartnerPayout({ deliveryPartnerId, amount, scheduleType = 'MANUAL' }) {
    const oid = new mongoose.Types.ObjectId(String(deliveryPartnerId));
    const wallet = await FoodDeliveryWallet.findOne({ deliveryPartnerId: oid });
    if (!wallet) throw new Error('Delivery wallet not found');

    const availableBalance = Math.max(0, wallet.balance - wallet.lockedAmount);
    if (amount <= 0 || availableBalance < amount) {
        throw new Error(`Insufficient available balance for payout. Requested: ₹${amount}, Available: ₹${availableBalance}`);
    }

    const partner = await FoodDeliveryPartner.findById(oid).lean();
    const bankDetails = partner?.bankDetails || partner?.bankInfo || {};
    const accountNumber = bankDetails.accountNumber || bankDetails.bankAccountNumber || '';
    const ifscCode = bankDetails.ifscCode || bankDetails.bankIfscCode || '';

    const todayStr = new Date().toISOString().split('T')[0];
    const idempotencyKey = `payout_rider_${deliveryPartnerId}_${todayStr}_${Math.floor(amount)}`;

    // Check duplicate
    const existingPayout = await DeliveryPayoutRecord.findOne({ idempotencyKey }).lean();
    if (existingPayout && existingPayout.status === 'PAID') {
        logger.info(`[DeliveryPayout] Payout ${idempotencyKey} already completed.`);
        return existingPayout;
    }

    // 1. Move amount to processing / lock in wallet
    wallet.lockedAmount = Math.round((wallet.lockedAmount + amount) * 100) / 100;
    await wallet.save();

    const payoutRecord = await DeliveryPayoutRecord.create({
        deliveryPartnerId: oid,
        amount,
        currency: 'INR',
        scheduleType,
        status: 'PROCESSING',
        idempotencyKey,
        periodStart: new Date(Date.now() - 24 * 3600 * 1000),
        periodEnd: new Date()
    });

    // 2. Execute Payout via Payment Gateway Provider
    const gatewayRes = await paymentProvider.createPayout({
        deliveryPartnerId: String(deliveryPartnerId),
        accountNumber,
        ifscCode,
        amountPaise: amount * 100,
        notes: { payoutRecordId: String(payoutRecord._id), deliveryPartnerId: String(deliveryPartnerId) },
        idempotencyKey
    });

    if (gatewayRes.success) {
        payoutRecord.status = 'PAID';
        payoutRecord.gatewayPayoutId = gatewayRes.payoutId || `pout_${Date.now()}`;
        await payoutRecord.save();

        // Atomic Wallet Settlement Update
        wallet.lockedAmount = Math.max(0, Math.round((wallet.lockedAmount - amount) * 100) / 100);
        wallet.balance = Math.max(0, Math.round((wallet.balance - amount) * 100) / 100);
        wallet.totalSettled = Math.round(((wallet.totalSettled || 0) + amount) * 100) / 100;
        await wallet.save();

        logger.info(`[DeliveryPayout] Payout ${payoutRecord._id} for partner ${deliveryPartnerId} SUCCESSFUL! Amount=₹${amount}`);
    } else {
        // Payout Failed -> Unlock amount back to available balance
        payoutRecord.status = 'FAILED';
        payoutRecord.failureReason = gatewayRes.error || 'Gateway payout failed';
        await payoutRecord.save();

        wallet.lockedAmount = Math.max(0, Math.round((wallet.lockedAmount - amount) * 100) / 100);
        await wallet.save();

        logger.error(`[DeliveryPayout] Payout ${payoutRecord._id} FAILED for partner ${deliveryPartnerId}. Unlocked balance.`);
    }

    return payoutRecord.toObject();
}

export async function processDeliveryPartnerPayoutEvent({ payoutId, status, reason = '', raw = null }) {
    const record = await DeliveryPayoutRecord.findOne({
        $or: [{ gatewayPayoutId: payoutId }, { _id: mongoose.Types.ObjectId.isValid(payoutId) ? payoutId : null }]
    });

    if (!record) {
        logger.warn(`[DeliveryPayoutEvent] Payout record not found for id=${payoutId}`);
        return;
    }

    if (record.status === status) return;

    if (status === 'FAILED' && record.status !== 'FAILED') {
        record.status = 'FAILED';
        record.failureReason = reason;
        await record.save();

        // Unlock balance if failed asynchronously via webhook
        const wallet = await FoodDeliveryWallet.findOne({ deliveryPartnerId: record.deliveryPartnerId });
        if (wallet && wallet.lockedAmount >= record.amount) {
            wallet.lockedAmount = Math.max(0, Math.round((wallet.lockedAmount - record.amount) * 100) / 100);
            await wallet.save();
        }
    } else if (status === 'PAID') {
        record.status = 'PAID';
        await record.save();
    }
}
