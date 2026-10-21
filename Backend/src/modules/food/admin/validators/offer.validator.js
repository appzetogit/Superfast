import { z } from 'zod';
import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';

const createOfferSchema = z.object({
    couponCode: z.string().min(1, 'Coupon code is required'),
    discountType: z.enum(['percentage', 'flat-price']).default('percentage'),
    discountValue: z.number().positive('Discount value must be greater than 0'),
    customerScope: z.enum(['all', 'first-time']).default('all'),
    restaurantScope: z.enum(['all', 'selected']).default('all'),
    restaurantId: z.string().optional(),
    endDate: z.string().optional().or(z.literal('')).or(z.undefined()),
    startDate: z.string().optional().or(z.literal('')).or(z.undefined()),
    minOrderValue: z.number().min(0).optional(),
    maxDiscount: z.number().min(0).optional(),
    usageLimit: z.number().min(0).optional(),
    perUserLimit: z.number().min(0).optional(),
    isFirstOrderOnly: z.boolean().optional()
});

export const validateCreateOfferDto = (body) => {
    const normalized = {
        ...body,
        couponCode: typeof body?.couponCode === 'string' ? body.couponCode.trim() : body?.couponCode,
        discountType: body?.discountType,
        discountValue: Number(body?.discountValue),
        customerScope: body?.customerScope,
        restaurantScope: body?.restaurantScope,
        restaurantId: body?.restaurantId ? String(body.restaurantId) : undefined,
        endDate: body?.endDate ? String(body.endDate) : undefined,
        startDate: body?.startDate ? String(body.startDate) : undefined,
        minOrderValue: body?.minOrderValue !== undefined ? Number(body.minOrderValue) : undefined,
        maxDiscount: body?.maxDiscount !== undefined ? Number(body.maxDiscount) : undefined,
        usageLimit: body?.usageLimit !== undefined ? Number(body.usageLimit) : undefined,
        perUserLimit: body?.perUserLimit !== undefined ? Number(body.perUserLimit) : undefined,
        isFirstOrderOnly: body?.isFirstOrderOnly !== undefined ? Boolean(body.isFirstOrderOnly) : undefined
    };

    const result = createOfferSchema.safeParse(normalized);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }

    if (result.data.restaurantScope === 'selected') {
        if (!result.data.restaurantId || !mongoose.Types.ObjectId.isValid(result.data.restaurantId)) {
            throw new ValidationError('Valid restaurantId is required for selected restaurant scope');
        }
    }

    const endDate = result.data.endDate ? new Date(`${result.data.endDate}T00:00:00.000Z`) : undefined;
    if (endDate && Number.isNaN(endDate.getTime())) {
        throw new ValidationError('Invalid endDate');
    }
    const startDate = result.data.startDate ? new Date(`${result.data.startDate}T00:00:00.000Z`) : undefined;
    if (startDate && Number.isNaN(startDate.getTime())) {
        throw new ValidationError('Invalid startDate');
    }
    if (endDate && startDate && endDate.getTime() <= startDate.getTime()) {
        throw new ValidationError('endDate must be after startDate');
    }
    if (endDate && endDate.getTime() <= Date.now()) {
        throw new ValidationError('endDate must be a future date');
    }
    // Business rule: percentage coupon must have maxDiscount; flat ignores it
    let maxDiscount = result.data.maxDiscount;
    if (result.data.discountType === 'percentage') {
        if (maxDiscount === undefined || maxDiscount === null || Number.isNaN(Number(maxDiscount))) {
            throw new ValidationError('maxDiscount is required for percentage coupons');
        }
        maxDiscount = Math.max(0, Number(maxDiscount) || 0);
    } else {
        maxDiscount = undefined; // ignore for flat-price
    }

    return {
        couponCode: result.data.couponCode.trim().toUpperCase(),
        discountType: result.data.discountType,
        discountValue: result.data.discountValue,
        customerScope: result.data.customerScope,
        restaurantScope: result.data.restaurantScope,
        restaurantId: result.data.restaurantScope === 'selected' ? result.data.restaurantId : undefined,
        endDate,
        startDate,
        minOrderValue: result.data.minOrderValue,
        maxDiscount,
        usageLimit: result.data.usageLimit,
        perUserLimit: result.data.perUserLimit,
        isFirstOrderOnly: result.data.isFirstOrderOnly
    };
};

const updateOfferSchema = z.object({
    discountValue: z.number().positive('Discount value must be greater than 0').optional(),
    customerScope: z.enum(['all', 'first-time']).optional(),
    minOrderValue: z.number().min(0).nullable().optional(),
    maxDiscount: z.number().min(0).nullable().optional(),
    usageLimit: z.number().min(0).nullable().optional(),
    perUserLimit: z.number().min(0).nullable().optional(),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    status: z.enum(['active', 'paused', 'inactive']).optional(),
    isFirstOrderOnly: z.boolean().optional(),
    expireNow: z.boolean().optional()
});

const toOptionalNumber = (v) => {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    return Number(v);
};

const toOptionalDate = (v, field) => {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    const d = new Date(`${String(v).slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) throw new ValidationError(`Invalid ${field}`);
    return d;
};

export const validateUpdateOfferDto = (body) => {
    const src = body || {};
    const normalized = {
        discountValue: src.discountValue !== undefined && src.discountValue !== '' ? Number(src.discountValue) : undefined,
        customerScope: src.customerScope || undefined,
        minOrderValue: toOptionalNumber(src.minOrderValue),
        maxDiscount: toOptionalNumber(src.maxDiscount),
        usageLimit: toOptionalNumber(src.usageLimit),
        perUserLimit: toOptionalNumber(src.perUserLimit),
        startDate: src.startDate === undefined ? undefined : (src.startDate ? String(src.startDate) : null),
        endDate: src.endDate === undefined ? undefined : (src.endDate ? String(src.endDate) : null),
        status: src.status || undefined,
        isFirstOrderOnly: src.isFirstOrderOnly !== undefined ? Boolean(src.isFirstOrderOnly) : undefined,
        expireNow: src.expireNow !== undefined ? Boolean(src.expireNow) : undefined
    };

    const result = updateOfferSchema.safeParse(normalized);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }

    const data = { ...result.data };
    data.startDate = toOptionalDate(data.startDate, 'startDate');
    data.endDate = toOptionalDate(data.endDate, 'endDate');
    if (data.startDate && data.endDate && data.endDate.getTime() <= data.startDate.getTime()) {
        throw new ValidationError('endDate must be after startDate');
    }
    return data;
};

const cartVisibilitySchema = z.object({
    itemId: z.string().min(1, 'itemId is required'),
    showInCart: z.boolean()
});

export const validateUpdateOfferCartVisibilityDto = (body) => {
    const result = cartVisibilitySchema.safeParse(body || {});
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }
    return result.data;
};
