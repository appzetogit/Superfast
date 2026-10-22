import { sendResponse, sendError } from '../../../../utils/response.js';
import { FoodRestaurantWithdrawal } from '../models/foodRestaurantWithdrawal.model.js';
import { FoodRestaurant } from '../models/restaurant.model.js';
import { getRestaurantFinance } from '../services/restaurantFinance.service.js';
import { autoPayWithdrawal, checkPayoutReady } from '../../../../core/payments/services/autoPayout.service.js';
import { logger } from '../../../../utils/logger.js';
import { notifyAdminEvent } from '../../../../core/notifications/adminAlert.service.js';

export const createWithdrawalRequestController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const { bankDetails } = req.body;
        const amount = Math.round(Number(req.body?.amount) * 100) / 100;

        if (!restaurantId) return sendError(res, 401, 'Restaurant authentication required');
        if (!Number.isFinite(amount) || amount < 1) return sendError(res, 400, 'Invalid withdrawal amount');

        // Auto payout is on: money may only go to a bank/UPI account that was verified AND confirmed by the owner.
        const ready = await checkPayoutReady('restaurant', restaurantId);
        if (!ready.ok) {
            return res.status(400).json({
                success: false,
                code: 'PAYOUT_ACCOUNT_REQUIRED',
                message: 'Please add and verify your bank / UPI details before withdrawing.'
            });
        }

        // Check if restaurant has enough balance
        const finance = await getRestaurantFinance(restaurantId);
        const availableBalance = finance?.currentCycle?.estimatedPayout || 0;

        if (amount > availableBalance) {
            return sendError(res, 400, `Insufficient balance. Available: ₹${availableBalance}`);
        }

        // Create the withdrawal request
        const withdrawal = new FoodRestaurantWithdrawal({
            restaurantId,
            amount,
            bankDetails,
            status: 'pending'
        });

        await withdrawal.save();

        // Race guard: parallel requests can all pass the check above. Re-check with this request
        // counted; if withdrawals now exceed earnings, this request loses and is rolled back.
        const after = await getRestaurantFinance(restaurantId);
        if ((after?.currentCycle?.availableBalanceRaw ?? 0) < 0) {
            await FoodRestaurantWithdrawal.deleteOne({ _id: withdrawal._id, status: 'pending' });
            return sendError(res, 400, 'Insufficient balance for this withdrawal');
        }

        // Automatic payout (Razorpay X). If it can't run (disabled / no bank details) the request stays pending for admin.
        let message = 'Withdrawal request submitted successfully';
        let paid = false;
        try {
            const payout = await autoPayWithdrawal('restaurant', withdrawal._id);
            paid = Boolean(payout.paid);
            if (paid) message = 'Withdrawal approved - payout initiated to your bank/UPI';
        } catch (err) {
            logger.error(`Auto payout error (restaurant withdrawal ${withdrawal._id}): ${err.message}`);
        }
        const latest = await FoodRestaurantWithdrawal.findById(withdrawal._id).lean();

        try {
            const restaurant = await FoodRestaurant.findById(restaurantId).select('restaurantName ownerPhone').lean();
            const name = restaurant?.restaurantName || 'Restaurant';
            void notifyAdminEvent({
                type: 'restaurant_withdrawal_request',
                title: paid ? '💸 Restaurant Payout Sent' : '💸 Restaurant Withdrawal Request',
                message: paid
                    ? `${name} withdrew ₹${amount} of earnings. Auto payout initiated.`
                    : `${name} requested a withdrawal of ₹${amount} from earnings. Pending admin review.`,
                link: '/admin/food/restaurant-withdraws',
                entityId: String(withdrawal._id),
                metadata: { restaurantName: name, phone: restaurant?.ownerPhone || '', amount, status: latest?.status || '' },
            });
        } catch (err) {
            logger.error(`Admin notify failed (restaurant withdrawal ${withdrawal._id}): ${err.message}`);
        }

        return sendResponse(res, 201, message, latest || withdrawal);
    } catch (error) {
        next(error);
    }
};

export const listMyWithdrawalsController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        if (!restaurantId) return sendError(res, 401, 'Restaurant authentication required');

        const withdrawals = await FoodRestaurantWithdrawal.find({ restaurantId })
            .sort({ createdAt: -1 })
            .lean();

        return sendResponse(res, 200, 'Withdrawals fetched successfully', withdrawals);
    } catch (error) {
        next(error);
    }
};
