import mongoose from 'mongoose';
import { FoodOrder } from '../../orders/models/order.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { getRestaurantSalesReport } from '../../restaurant/services/restaurantFinance.service.js';

function resolveRange(query = {}) {
    const now = new Date();
    const sod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const period = String(query.period || 'month').toLowerCase();
    if (period === 'today') return { $gte: sod(now), $lte: now };
    if (period === 'week' || period === 'month') {
        const s = sod(now);
        s.setDate(s.getDate() - (period === 'week' ? 6 : 29));
        return { $gte: s, $lte: now };
    }
    if (period === 'custom' && query.startDate && query.endDate) {
        const s = new Date(query.startDate);
        const e = new Date(query.endDate);
        if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime())) {
            s.setHours(0, 0, 0, 0);
            e.setHours(23, 59, 59, 999);
            return { $gte: s, $lte: e };
        }
    }
    return null;
}

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Per-restaurant delivered orders, sales, admin commission and restaurant earning. */
export async function getAdminRestaurantSales(query = {}) {
    // All restaurants (optionally filtered by zone / search), including those with zero orders.
    const rFilter = {};
    const zoneId = String(query.zoneId || query.zone || '').trim();
    if (zoneId) {
        if (!mongoose.Types.ObjectId.isValid(zoneId)) return { totals: { totalOrders: 0, totalSales: 0, totalCommission: 0, totalEarning: 0 }, restaurants: [] };
        rFilter.zoneId = new mongoose.Types.ObjectId(zoneId);
    }
    const searchRaw = String(query.search || '').trim();
    if (searchRaw) {
        const escaped = searchRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        rFilter.restaurantName = { $regex: escaped, $options: 'i' };
    }
    const restaurants = await FoodRestaurant.find(rFilter)
        .select('restaurantName profileImage city area')
        .lean();
    const ids = restaurants.map((r) => r._id);
    const match = { orderStatus: 'delivered', restaurantId: { $in: ids } };
    const range = resolveRange(query);
    if (range) match.createdAt = range;

    const rows = await FoodOrder.aggregate([
        { $match: match },
        {
            $lookup: {
                from: 'food_transactions',
                localField: '_id',
                foreignField: 'orderId',
                as: 'tx'
            }
        },
        { $addFields: { tx: { $arrayElemAt: ['$tx', 0] } } },
        {
            $addFields: {
                _sale: { $ifNull: ['$pricing.subtotal', 0] },
                _commission: { $ifNull: ['$tx.amounts.restaurantCommission', { $ifNull: ['$pricing.restaurantCommission', 0] }] }
            }
        },
        {
            $addFields: {
                _earning: {
                    $ifNull: ['$tx.amounts.restaurantShare', { $max: [0, { $subtract: ['$_sale', '$_commission'] }] }]
                }
            }
        },
        {
            $group: {
                _id: '$restaurantId',
                totalOrders: { $sum: 1 },
                totalSales: { $sum: '$_sale' },
                totalCommission: { $sum: '$_commission' },
                totalEarning: { $sum: '$_earning' }
            }
        }
    ]);

    const rowMap = new Map(rows.map((r) => [String(r._id), r]));

    const list = restaurants.map((info) => {
        const r = rowMap.get(String(info._id)) || {};
        return {
            restaurantId: info._id,
            restaurantName: info.restaurantName || 'Unknown',
            profileImage: info.profileImage || '',
            location: [info.area, info.city].filter(Boolean).join(', '),
            totalOrders: r.totalOrders || 0,
            totalSales: round(r.totalSales),
            totalCommission: round(r.totalCommission),
            totalEarning: round(r.totalEarning)
        };
    });
    list.sort((a, b) => b.totalSales - a.totalSales);

    const totals = list.reduce(
        (a, r) => ({
            totalOrders: a.totalOrders + r.totalOrders,
            totalSales: a.totalSales + r.totalSales,
            totalCommission: a.totalCommission + r.totalCommission,
            totalEarning: a.totalEarning + r.totalEarning
        }),
        { totalOrders: 0, totalSales: 0, totalCommission: 0, totalEarning: 0 }
    );
    totals.totalSales = round(totals.totalSales);
    totals.totalCommission = round(totals.totalCommission);
    totals.totalEarning = round(totals.totalEarning);

    return { totals, restaurants: list };
}

export async function getAdminRestaurantSalesDetail(restaurantId, query = {}) {
    if (!mongoose.Types.ObjectId.isValid(restaurantId)) return null;
    const restaurant = await FoodRestaurant.findById(restaurantId).select('restaurantName').lean();
    const report = await getRestaurantSalesReport(restaurantId, query);
    return { restaurantName: restaurant?.restaurantName || '', ...report };
}
