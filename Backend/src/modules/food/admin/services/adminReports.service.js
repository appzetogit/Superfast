import mongoose from 'mongoose';
import { FoodOrder } from '../../orders/models/order.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodRestaurantWithdrawal } from '../../restaurant/models/foodRestaurantWithdrawal.model.js';
import { FoodDeliveryWithdrawal } from '../../delivery/models/foodDeliveryWithdrawal.model.js';
import { FoodDeliveryPartner } from '../../delivery/models/deliveryPartner.model.js';
import {
    REPORT_TIMEZONE,
    buildOrderScopeFilter,
    cleanFilterValue,
    resolveCategoryItemIds,
    resolveDateRange,
    resolveRestaurantScope
} from './adminFilters.service.js';

const ROW_LIMIT = 5000;
const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value) && String(value).length === 24;

// ---------------------------------------------------------------------------
// Disbursement (withdrawal payouts) – restaurants and deliverymen
// ---------------------------------------------------------------------------

const DISBURSEMENT_STATUS = {
    pending: 'pending',
    completed: 'approved',
    approved: 'approved',
    canceled: 'rejected',
    cancelled: 'rejected',
    rejected: 'rejected'
};
const DISBURSEMENT_LABEL = { pending: 'Pending', approved: 'Completed', rejected: 'Canceled' };

export async function getDisbursementReport(query = {}) {
    const isDeliveryman = String(query.party || '').toLowerCase() === 'deliveryman';
    const Withdrawal = isDeliveryman ? FoodDeliveryWithdrawal : FoodRestaurantWithdrawal;
    const ownerField = isDeliveryman ? 'deliveryPartnerId' : 'restaurantId';
    const emptyStat = { count: 0, amount: 0 };
    const emptyResult = { rows: [], total: 0, stats: { pending: emptyStat, completed: emptyStat, canceled: emptyStat } };

    const match = {};
    const dateRange = resolveDateRange(query);
    if (dateRange) match.createdAt = dateRange;

    if (isDeliveryman) {
        const partnerId = cleanFilterValue(query.deliveryPartnerId);
        if (partnerId) {
            if (!isObjectId(partnerId)) return emptyResult;
            match.deliveryPartnerId = new mongoose.Types.ObjectId(partnerId);
        }
    } else {
        const scope = await resolveRestaurantScope(query);
        if (scope.empty) return emptyResult;
        const ids = scope.restaurantIds || scope.zoneRestaurantIds;
        if (ids) match.restaurantId = { $in: ids };
    }

    const paymentMethod = cleanFilterValue(query.paymentMethod);
    if (paymentMethod) {
        match.paymentMethod = { $regex: `^${escapeRegex(paymentMethod.replace(/\s+/g, '_'))}$|^${escapeRegex(paymentMethod)}$`, $options: 'i' };
    }

    const search = cleanFilterValue(query.search);
    if (search) {
        const regex = { $regex: escapeRegex(search), $options: 'i' };
        const owners = isDeliveryman
            ? await FoodDeliveryPartner.find({ name: regex }).select('_id').lean()
            : await FoodRestaurant.find({ restaurantName: regex }).select('_id').lean();
        match.$or = [
            { transactionId: regex },
            { payoutId: regex },
            { [ownerField]: { $in: owners.map((o) => o._id) } }
        ];
    }

    // Stats follow every filter except status, so the cards always add up to the full picture.
    const statsMatch = { ...match };
    const status = DISBURSEMENT_STATUS[cleanFilterValue(query.status).toLowerCase()];
    if (status) match.status = status;

    const [docs, total, statRows] = await Promise.all([
        Withdrawal.find(match)
            .populate(ownerField, isDeliveryman ? 'name phone' : 'restaurantName ownerPhone zoneId')
            .sort({ createdAt: -1 })
            .limit(ROW_LIMIT)
            .lean(),
        Withdrawal.countDocuments(match),
        Withdrawal.aggregate([
            { $match: statsMatch },
            { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } }
        ])
    ]);

    const statFor = (key) => {
        const row = statRows.find((r) => r._id === key);
        return { count: row?.count || 0, amount: roundMoney(row?.amount) };
    };

    const rows = docs.map((doc, index) => {
        const owner = doc[ownerField] || {};
        return {
            sl: index + 1,
            _id: doc._id,
            id: doc.transactionId || doc.payoutId || String(doc._id).slice(-8).toUpperCase(),
            name: (isDeliveryman ? owner.name : owner.restaurantName) || 'Deleted account',
            phone: (isDeliveryman ? owner.phone : owner.ownerPhone) || '',
            createdAt: doc.createdAt,
            disburseAmount: roundMoney(doc.amount),
            paymentMethod: doc.paymentMethod || 'bank_transfer',
            status: DISBURSEMENT_LABEL[doc.status] || doc.status,
            payoutStatus: doc.payoutStatus || '',
            note: doc.rejectionReason || doc.adminNote || ''
        };
    });

    return {
        rows,
        total,
        stats: { pending: statFor('pending'), completed: statFor('approved'), canceled: statFor('rejected') }
    };
}

// ---------------------------------------------------------------------------
// Expense report – money the platform pays out per order
// ---------------------------------------------------------------------------

const EXPENSE_TYPES = {
    coupon_discount: 'Coupon Discount',
    rider_payout: 'Rider Payout',
    refund: 'Refund'
};

export async function getExpenseReport(query = {}) {
    const emptyResult = { rows: [], total: 0, totals: { all: 0, byType: {} }, truncated: false };

    const scope = await buildOrderScopeFilter(query);
    if (scope.empty) return emptyResult;

    const and = [...(scope.filter.$and || [])];
    const customerId = cleanFilterValue(query.userId ?? query.customer);
    if (customerId) {
        if (!isObjectId(customerId)) return emptyResult;
        and.push({ userId: new mongoose.Types.ObjectId(customerId) });
    }

    const typeKey = cleanFilterValue(query.type).toLowerCase().replace(/\s+/g, '_');
    const wanted = new Set(EXPENSE_TYPES[typeKey] ? [typeKey] : Object.keys(EXPENSE_TYPES));
    const notCancelled = { orderStatus: { $not: /^cancelled/ } };

    const conditions = [];
    if (wanted.has('coupon_discount')) {
        conditions.push({ ...notCancelled, 'pricing.discount': { $gt: 0 }, 'pricing.discountBearer': { $ne: 'restaurant' } });
    }
    if (wanted.has('rider_payout')) {
        conditions.push({ orderStatus: 'delivered', riderEarning: { $gt: 0 } });
    }
    if (wanted.has('refund')) {
        conditions.push({ 'payment.status': 'refunded' });
    }
    and.push({ $or: conditions });

    const search = cleanFilterValue(query.search);
    if (search) {
        and.push({ orderId: { $regex: escapeRegex(search), $options: 'i' } });
    }

    const orders = await FoodOrder.find({ $and: and })
        .select('orderId createdAt userId restaurantId orderStatus pricing riderEarning payment')
        .populate('userId', 'name')
        .populate('restaurantId', 'restaurantName')
        .sort({ createdAt: -1 })
        .limit(ROW_LIMIT)
        .lean();

    const rows = [];
    for (const order of orders) {
        const base = {
            orderId: order.orderId,
            createdAt: order.createdAt,
            customerName: order.userId?.name || 'Guest',
            restaurant: order.restaurantId?.restaurantName || 'N/A'
        };
        const discount = Number(order.pricing?.discount || 0);
        if (wanted.has('coupon_discount') && discount > 0 && !/^cancelled/.test(order.orderStatus || '') && order.pricing?.discountBearer !== 'restaurant') {
            rows.push({ ...base, expenseType: EXPENSE_TYPES.coupon_discount, expenseAmount: roundMoney(discount) });
        }
        if (wanted.has('rider_payout') && order.orderStatus === 'delivered' && Number(order.riderEarning) > 0) {
            rows.push({ ...base, expenseType: EXPENSE_TYPES.rider_payout, expenseAmount: roundMoney(order.riderEarning) });
        }
        if (wanted.has('refund') && order.payment?.status === 'refunded') {
            const refunded = Number(order.payment?.refund?.amount) || Number(order.pricing?.total) || 0;
            rows.push({ ...base, expenseType: EXPENSE_TYPES.refund, expenseAmount: roundMoney(refunded) });
        }
    }

    const byType = {};
    let all = 0;
    for (const row of rows) {
        byType[row.expenseType] = roundMoney((byType[row.expenseType] || 0) + row.expenseAmount);
        all += row.expenseAmount;
    }

    return {
        rows: rows.map((row, index) => ({ sl: index + 1, ...row })),
        total: rows.length,
        totals: { all: roundMoney(all), byType },
        truncated: orders.length >= ROW_LIMIT
    };
}

export const EXPENSE_TYPE_LABELS = Object.values(EXPENSE_TYPES);

// ---------------------------------------------------------------------------
// Food report – per-dish sales
// ---------------------------------------------------------------------------

export async function getFoodReport(query = {}) {
    const emptyResult = { rows: [], total: 0, yearly: { averageYearlySales: 0, chartData: [] }, timezone: REPORT_TIMEZONE };

    const scope = await buildOrderScopeFilter(query);
    if (scope.empty) return emptyResult;

    const category = await resolveCategoryItemIds(query.categoryId ?? query.category);
    const foodType = cleanFilterValue(query.foodType ?? query.type).toLowerCase();
    const search = cleanFilterValue(query.search);

    const itemMatch = { 'items.type': 'food' };
    if (category.itemIds) itemMatch['items.itemId'] = { $in: category.itemIds };

    const pipeline = [
        { $match: { ...scope.filter, orderStatus: 'delivered' } },
        { $unwind: '$items' },
        { $match: itemMatch },
        {
            $addFields: {
                lineTotal: { $multiply: [{ $ifNull: ['$items.price', 0] }, { $ifNull: ['$items.quantity', 0] }] },
                itemObjectId: { $convert: { input: '$items.itemId', to: 'objectId', onError: null, onNull: null } }
            }
        },
        {
            $addFields: {
                discountShare: {
                    $cond: [
                        { $gt: [{ $ifNull: ['$pricing.subtotal', 0] }, 0] },
                        { $multiply: [{ $ifNull: ['$pricing.discount', 0] }, { $divide: ['$lineTotal', '$pricing.subtotal'] }] },
                        0
                    ]
                }
            }
        },
        {
            $group: {
                _id: '$items.itemId',
                name: { $first: '$items.name' },
                restaurantId: { $first: '$restaurantId' },
                itemObjectId: { $first: '$itemObjectId' },
                orderIds: { $addToSet: '$_id' },
                units: { $sum: { $ifNull: ['$items.quantity', 0] } },
                totalAmountSold: { $sum: '$lineTotal' },
                totalDiscountGiven: { $sum: '$discountShare' }
            }
        },
        { $lookup: { from: 'food_items', localField: 'itemObjectId', foreignField: '_id', as: 'food' } },
        { $unwind: { path: '$food', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'food_restaurants', localField: 'restaurantId', foreignField: '_id', as: 'restaurant' } },
        { $unwind: { path: '$restaurant', preserveNullAndEmptyArrays: true } }
    ];

    const after = {};
    if (foodType === 'veg') after['food.foodType'] = 'Veg';
    if (foodType === 'non-veg' || foodType === 'nonveg') after['food.foodType'] = 'Non-Veg';
    if (search) {
        const regex = { $regex: escapeRegex(search), $options: 'i' };
        after.$or = [{ name: regex }, { 'restaurant.restaurantName': regex }];
    }
    if (Object.keys(after).length) pipeline.push({ $match: after });

    pipeline.push(
        {
            $project: {
                _id: 0,
                itemId: '$_id',
                name: 1,
                restaurant: { $ifNull: ['$restaurant.restaurantName', 'N/A'] },
                category: { $ifNull: ['$food.categoryName', ''] },
                foodType: { $ifNull: ['$food.foodType', ''] },
                price: { $ifNull: ['$food.price', 0] },
                orderCount: { $size: '$orderIds' },
                units: 1,
                totalAmountSold: 1,
                totalDiscountGiven: 1
            }
        },
        { $sort: { totalAmountSold: -1 } },
        { $limit: 1000 }
    );

    // Monthly sales trend ignores the date filter so the chart always shows the last 12 months.
    const trendScope = await buildOrderScopeFilter({ ...query, fromDate: undefined, toDate: undefined, startDate: undefined, endDate: undefined, time: undefined });
    const since = new Date();
    since.setMonth(since.getMonth() - 11, 1);
    since.setHours(0, 0, 0, 0);

    const [foodRows, monthRows] = await Promise.all([
        FoodOrder.aggregate(pipeline),
        trendScope.empty
            ? []
            : FoodOrder.aggregate([
                { $match: { ...trendScope.filter, orderStatus: 'delivered', createdAt: { $gte: since } } },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: REPORT_TIMEZONE } },
                        amount: { $sum: { $ifNull: ['$pricing.total', 0] } }
                    }
                },
                { $sort: { _id: 1 } }
            ])
    ]);

    const rows = foodRows.map((row, index) => ({
        sl: index + 1,
        ...row,
        totalAmountSold: roundMoney(row.totalAmountSold),
        totalDiscountGiven: roundMoney(row.totalDiscountGiven),
        price: roundMoney(row.price),
        averageSaleValue: roundMoney(row.orderCount ? row.totalAmountSold / row.orderCount : 0)
    }));

    const chartData = monthRows.map((row) => {
        const [year, month] = row._id.split('-').map(Number);
        return {
            month: row._id,
            label: new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
            amount: roundMoney(row.amount)
        };
    });
    const averageYearlySales = chartData.length
        ? roundMoney(chartData.reduce((sum, d) => sum + d.amount, 0) / chartData.length)
        : 0;

    return { rows, total: rows.length, yearly: { averageYearlySales, chartData }, timezone: REPORT_TIMEZONE };
}
