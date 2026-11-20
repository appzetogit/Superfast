import mongoose from 'mongoose';
import { FoodOrder } from '../../orders/models/order.model.js';
import { FoodTransaction } from '../../orders/models/foodTransaction.model.js';
import { FoodRestaurant } from '../models/restaurant.model.js';
import { FoodRestaurantWithdrawal } from '../models/foodRestaurantWithdrawal.model.js';

function toTwoDigitYearString(dateObj) {
    const y = String(dateObj.getFullYear());
    return y.slice(-2);
}

function monthShort(monthIndex) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[monthIndex] || 'Jan';
}

function getFixedCurrentCycleWindow(now = new Date()) {
    const startDay = 15;
    
    let year = now.getFullYear();
    let month = now.getMonth();

    // If before start day, settlement belongs to previous month cycle.
    if (now.getDate() < startDay) {
        month = month - 1;
        if (month < 0) {
            month = 11;
            year -= 1;
        }
    }

    const start = new Date(year, month, startDay, 0, 0, 0, 0);
    // End should be either fixed 21 or now, let's make it more inclusive for "Current Cycle"
    // Users want to see their active earnings, so we extend it to 'now'
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    return {
        start,
        end,
        startMeta: { day: String(startDay), month: monthShort(month), year: toTwoDigitYearString(new Date(year, month, startDay)) },
        endMeta: { day: String(now.getDate()), month: monthShort(now.getMonth()), year: toTwoDigitYearString(now) }
    };
}

function parseISODateParam(v) {
    if (!v) return null;
    const s = String(v).trim();
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
}

function parseISODateParamEnd(v) {
    if (!v) return null;
    const s = String(v).trim();
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(23, 59, 59, 999);
    return d;
}

export async function getRestaurantFinance(restaurantId, query = {}) {
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) return null;
    const rid = new mongoose.Types.ObjectId(restaurantId);

    // Fetch restaurant profile for header display.
    const restaurant = await FoodRestaurant.findById(rid)
        .select('restaurantName addressLine1 addressLine2 area city state pincode location')
        .lean();

    const address =
        restaurant?.location?.formattedAddress ||
        (restaurant?.addressLine1
            ? [restaurant.addressLine1, restaurant.addressLine2, restaurant.area].filter(Boolean).join(', ')
            : restaurant?.addressLine1 || '');

    const nowWindow = getFixedCurrentCycleWindow(new Date());

    // Current cycle: sum ledger payouts in the fixed window.
    const currentTransactions = await FoodTransaction.find({
        restaurantId: rid,
        status: { $in: ['captured', 'authorized'] },
        createdAt: { $gte: nowWindow.start, $lte: nowWindow.end }
    })
        .populate('orderId', 'orderId createdAt items pricing deliveryState orderStatus')
        .sort({ createdAt: -1 })
        .lean();

    const currentCycleOrders = currentTransactions.map((tx) => {
        const order = tx.orderId || {};
        const items = Array.isArray(order.items) ? order.items : [];
        const foodNames = items.map((it) => it?.name).filter(Boolean).join(', ');
        const orderTotalExclTax = Math.max(
            0,
            Number(order?.pricing?.total ?? 0) - Number(order?.pricing?.tax ?? 0) || 0
        );
        return {
            orderId: order?.orderId || tx.orderReadableId,
            createdAt: tx.createdAt,
            items,
            foodNames,
            orderTotal: orderTotalExclTax,
            totalAmount: tx.amounts?.totalCustomerPaid || 0,
            payout: tx.amounts?.restaurantShare || 0,
            commission: tx.amounts?.restaurantCommission || 0,
            paymentMethod: tx.paymentMethod || order?.payment?.method,
            orderStatus: order?.orderStatus || order?.deliveryState?.currentPhase || order?.deliveryState?.status,
            status: tx.status
        };
    });

    const currentCycleEstimatedPayout = currentCycleOrders.reduce(
        (sum, o) => sum + (Number(o.payout) || 0),
        0
    );

    // Calculate global estimated payout (all unsettled transactions)
    const allUnsettledTransactions = await FoodTransaction.find({
        restaurantId: rid,
        status: { $in: ['captured', 'authorized'] },
        'settlement.isRestaurantSettled': { $ne: true }
    }).select('amounts.restaurantShare').lean();

    const globalEstimatedPayout = allUnsettledTransactions.reduce(
        (sum, tx) => sum + (Number(tx.amounts?.restaurantShare) || 0),
        0
    );

    // Deduct pending, approved, and processed withdrawals from available balance.
    const allWithdrawalsAgg = await FoodRestaurantWithdrawal.aggregate([
        {
            $match: {
                restaurantId: rid,
                $expr: {
                    $in: [{ $toLower: { $trim: { input: '$status' } } }, ['pending', 'approved', 'processed']]
                }
            }
        },
        { $group: { _id: { $toLower: { $trim: { input: '$status' } } }, total: { $sum: '$amount' } } }
    ]);

    let totalPendingWithdrawals = 0;
    let totalProcessedWithdrawals = 0;

    for (const agg of allWithdrawalsAgg) {
        if (agg._id === 'pending') {
            totalPendingWithdrawals += agg.total;
        } else if (agg._id === 'approved' || agg._id === 'processed') {
            totalProcessedWithdrawals += agg.total;
        }
    }

    const totalDeductions = totalPendingWithdrawals + totalProcessedWithdrawals;
    const availableBalanceRaw = Math.round((globalEstimatedPayout - totalDeductions) * 100) / 100;
    const availableBalance = Math.max(0, availableBalanceRaw);

    const currentCycle = {
        start: { ...nowWindow.startMeta },
        end: { ...nowWindow.endMeta },
        totalEarnings: currentCycleEstimatedPayout, // We still show current cycle earnings label
        totalWithdrawn: totalDeductions,
        estimatedPayout: availableBalance, // This is what UI shows as "Estimated Payout" (Available Balance)
        availableBalanceRaw, // unclamped; negative means withdrawals exceed earnings (used by race guard)
        totalOrders: currentCycleOrders.length,
        payoutDate: null,
        orders: currentCycleOrders
    };

    // Invoice Summary (derived from current cycle or broader if needed)
    const invoiceSummary = {
        count: currentCycleOrders.length,
        subtotal: currentCycleOrders.reduce((sum, o) => sum + (Number(o.orderTotal) || 0), 0),
        taxes: currentCycleOrders.reduce((sum, o) => sum + Math.max(0, (Number(o.totalAmount) || 0) - (Number(o.orderTotal) || 0)), 0),
        gross: currentCycleOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0)
    };

    // Past cycles: build from provided startDate/endDate query.
    const startDate = parseISODateParam(query.startDate);
    const endDate = parseISODateParamEnd(query.endDate);

    let pastCyclesResult = { orders: [], totalOrders: 0 };
    if (startDate && endDate) {
        const pastTransactions = await FoodTransaction.find({
            restaurantId: rid,
            status: { $in: ['captured', 'authorized'] },
            createdAt: { $gte: startDate, $lte: endDate }
        })
            .populate('orderId', 'orderId createdAt items pricing deliveryState orderStatus')
            .sort({ createdAt: -1 })
            .lean();

        const pastCycleOrders = pastTransactions.map((tx) => {
            const order = tx.orderId || {};
            const items = Array.isArray(order.items) ? order.items : [];
            const foodNames = items.map((it) => it?.name).filter(Boolean).join(', ');
            const orderTotalExclTax = Math.max(
                0,
                Number(order?.pricing?.total ?? 0) - Number(order?.pricing?.tax ?? 0) || 0
            );

            return {
                orderId: order?.orderId || tx.orderReadableId,
                createdAt: tx.createdAt,
                items,
                foodNames,
                orderTotal: orderTotalExclTax,
                totalAmount: tx.amounts?.totalCustomerPaid || 0,
                payout: tx.amounts?.restaurantShare || 0,
                commission: tx.amounts?.restaurantCommission || 0,
                paymentMethod: tx.paymentMethod || order?.payment?.method,
                orderStatus: order?.orderStatus || order?.deliveryState?.currentPhase || order?.deliveryState?.status,
                status: tx.status
            };
        });

        pastCyclesResult = {
            orders: pastCycleOrders,
            totalOrders: pastCycleOrders.length
        };
    }

    return {
        restaurant: {
            name: restaurant?.restaurantName || '',
            restaurantId: restaurant?._id ? `REST${restaurant._id.toString().slice(-6).padStart(6, '0')}` : 'N/A',
            address
        },
        currentCycle,
        invoiceSummary,
        pastCycles: pastCyclesResult
    };
}



function resolvePeriodRange(query = {}) {
    const now = new Date();
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const period = String(query.period || 'month').toLowerCase();
    if (period === 'today') return { start: startOfDay(now), end: now };
    if (period === 'week') {
        const s = startOfDay(now);
        s.setDate(s.getDate() - 6);
        return { start: s, end: now };
    }
    if (period === 'month') {
        const s = startOfDay(now);
        s.setDate(s.getDate() - 29);
        return { start: s, end: now };
    }
    if (period === 'custom') {
        const s = parseISODateParam(query.startDate);
        const e = parseISODateParamEnd(query.endDate);
        if (s && e) return { start: s, end: e };
    }
    return { start: null, end: null }; // all time
}

/**
 * Sales report for the restaurant panel: orders delivered, gross sales,
 * admin commission and the restaurant's net earning, plus a paginated order list.
 */
export async function getRestaurantSalesReport(restaurantId, query = {}) {
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) return null;
    const rid = new mongoose.Types.ObjectId(restaurantId);
    const { start, end } = resolvePeriodRange(query);
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));

    const match = { restaurantId: rid, orderStatus: 'delivered' };
    if (start && end) match.createdAt = { $gte: start, $lte: end };

    const [docs, total] = await Promise.all([
        FoodOrder.find(match)
            .select('orderId createdAt items pricing payment orderStatus userId')
            .populate('userId', 'name phone')
            .sort({ createdAt: -1 })
            .lean(),
        FoodOrder.countDocuments(match)
    ]);

    const txs = await FoodTransaction.find({ orderId: { $in: docs.map((d) => d._id) } })
        .select('orderId amounts')
        .lean();
    const txByOrder = new Map(txs.map((t) => [String(t.orderId), t]));

    const rows = docs.map((o) => {
        const tx = txByOrder.get(String(o._id));
        const subtotal = Number(o.pricing?.subtotal) || 0;
        const commission = Number(tx?.amounts?.restaurantCommission ?? o.pricing?.restaurantCommission) || 0;
        const earning = tx?.amounts?.restaurantShare != null
            ? Number(tx.amounts.restaurantShare) || 0
            : Math.max(0, subtotal - commission);
        return {
            _id: o._id,
            orderId: o.orderId,
            createdAt: o.createdAt,
            customerName: o.userId?.name || '',
            itemsSummary: (o.items || []).map((i) => `${i?.quantity || 1}x ${i?.name}`).filter(Boolean).join(', '),
            itemCount: (o.items || []).reduce((s, i) => s + (Number(i?.quantity) || 1), 0),
            paymentMethod: o.payment?.method || '',
            sale: subtotal,
            commission,
            earning
        };
    });

    const summary = rows.reduce(
        (a, r) => ({
            totalSales: a.totalSales + r.sale,
            totalCommission: a.totalCommission + r.commission,
            totalEarning: a.totalEarning + r.earning
        }),
        { totalSales: 0, totalCommission: 0, totalEarning: 0 }
    );
    const round = (n) => Math.round(n * 100) / 100;

    // Cancelled orders count for context.
    const cancelledMatch = { restaurantId: rid, orderStatus: { $in: ['cancelled_by_user', 'cancelled_by_restaurant', 'cancelled_by_admin'] } };
    if (start && end) cancelledMatch.createdAt = match.createdAt;
    const cancelledOrders = await FoodOrder.countDocuments(cancelledMatch);

    return {
        summary: {
            totalOrders: total,
            cancelledOrders,
            totalSales: round(summary.totalSales),
            totalCommission: round(summary.totalCommission),
            totalEarning: round(summary.totalEarning)
        },
        orders: rows.slice((page - 1) * limit, page * limit),
        pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
    };
}
