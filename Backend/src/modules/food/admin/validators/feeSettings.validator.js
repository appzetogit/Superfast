import { z } from 'zod';
import { ValidationError } from '../../../../core/auth/errors.js';

const rangeSchema = z.object({
    min: z.number().min(0),
    max: z.number().min(0),
    fee: z.number().min(0),
    zoneId: z.string().nullable().optional()
});

const zoneDeliveryFeeSchema = z.object({
    zoneId: z.string(),
    deliveryFee: z.number().min(0).nullable().optional(),
    perKmDeliveryFee: z.number().min(0).nullable().optional()
});

const feeSettingsUpsertSchema = z.object({
    deliveryFee: z.number().min(0).nullable().optional(),
    perKmDeliveryFee: z.number().min(0).nullable().optional(),
    deliveryFeeRanges: z.array(rangeSchema).optional(),
    zoneDeliveryFees: z.array(zoneDeliveryFeeSchema).optional(),
    freeDeliveryThreshold: z.number().min(0).nullable().optional(),
    platformFee: z.number().min(0).nullable().optional(),
    gstRate: z.number().min(0).max(100).nullable().optional(),
    mixedOrderDistanceLimit: z.number().min(0).nullable().optional(),
    mixedOrderAngleLimit: z.number().min(0).nullable().optional(),
    isIncentiveEnabled: z.boolean().optional(),
    incentiveThreshold: z.number().min(0).nullable().optional(),
    incentivePercentage: z.number().min(0).nullable().optional(),
    enableRangeFee: z.boolean().optional(),
    enablePerKmFee: z.boolean().optional(),
    enableZoneFees: z.boolean().optional(),
    enableDefaultFee: z.boolean().optional(),
    enableDistanceBasedFee: z.boolean().optional(),
    baseDistanceKm: z.number().min(0).nullable().optional(),
    baseDistanceFee: z.number().min(0).nullable().optional(),
    extraFeePerKm: z.number().min(0).nullable().optional(),
    isActive: z.boolean().optional()
});

export const validateFeeSettingsUpsertDto = (body) => {
    const extractZoneIdStr = (z) => {
        if (!z) return null;
        if (typeof z === 'object' && z !== null && z._id) return String(z._id);
        const str = String(z).trim();
        return str && str !== 'null' && str !== 'undefined' ? str : null;
    };

    const normalized = {
        deliveryFee:
            body?.deliveryFee === null
                ? null
                : body?.deliveryFee !== undefined && body?.deliveryFee !== ""
                    ? Number(body.deliveryFee)
                    : undefined,
        perKmDeliveryFee:
            body?.perKmDeliveryFee === null
                ? null
                : body?.perKmDeliveryFee !== undefined && body?.perKmDeliveryFee !== ""
                    ? Number(body.perKmDeliveryFee)
                    : undefined,
        deliveryFeeRanges: Array.isArray(body?.deliveryFeeRanges)
            ? body.deliveryFeeRanges.map((r) => ({
                min: Number(r?.min),
                max: Number(r?.max),
                fee: Number(r?.fee),
                zoneId: extractZoneIdStr(r?.zoneId)
            }))
            : undefined,
        zoneDeliveryFees: Array.isArray(body?.zoneDeliveryFees)
            ? body.zoneDeliveryFees
                .map((z) => {
                    const zid = extractZoneIdStr(z?.zoneId);
                    if (!zid) return null;
                    return {
                        zoneId: zid,
                        deliveryFee: z?.deliveryFee === null || z?.deliveryFee === '' ? null : z?.deliveryFee !== undefined ? Number(z.deliveryFee) : undefined,
                        perKmDeliveryFee: z?.perKmDeliveryFee === null || z?.perKmDeliveryFee === '' ? null : z?.perKmDeliveryFee !== undefined ? Number(z.perKmDeliveryFee) : undefined
                    };
                })
                .filter(Boolean)
            : undefined,
        freeDeliveryThreshold:
            body?.freeDeliveryThreshold === null
                ? null
                : body?.freeDeliveryThreshold !== undefined && body?.freeDeliveryThreshold !== ""
                    ? Number(body.freeDeliveryThreshold)
                    : undefined,
        platformFee:
            body?.platformFee === null ? null : body?.platformFee !== undefined && body?.platformFee !== "" ? Number(body.platformFee) : undefined,
        gstRate:
            body?.gstRate === null ? null : body?.gstRate !== undefined && body?.gstRate !== "" ? Number(body.gstRate) : undefined,
        mixedOrderDistanceLimit:
            body?.mixedOrderDistanceLimit === null ? null : body?.mixedOrderDistanceLimit !== undefined && body?.mixedOrderDistanceLimit !== "" ? Number(body.mixedOrderDistanceLimit) : undefined,
        mixedOrderAngleLimit:
            body?.mixedOrderAngleLimit === null ? null : body?.mixedOrderAngleLimit !== undefined && body?.mixedOrderAngleLimit !== "" ? Number(body.mixedOrderAngleLimit) : undefined,
        isIncentiveEnabled:
            body?.isIncentiveEnabled !== undefined ? Boolean(body.isIncentiveEnabled) : undefined,
        incentiveThreshold:
            body?.incentiveThreshold === null
                ? null
                : body?.incentiveThreshold !== undefined && body?.incentiveThreshold !== ""
                    ? Number(body.incentiveThreshold)
                    : undefined,
        incentivePercentage:
            body?.incentivePercentage === null
                ? null
                : body?.incentivePercentage !== undefined && body?.incentivePercentage !== ""
                    ? Number(body.incentivePercentage)
                    : undefined,
        enableRangeFee: body?.enableRangeFee !== undefined ? Boolean(body.enableRangeFee) : undefined,
        enablePerKmFee: body?.enablePerKmFee !== undefined ? Boolean(body.enablePerKmFee) : undefined,
        enableZoneFees: body?.enableZoneFees !== undefined ? Boolean(body.enableZoneFees) : undefined,
        enableDefaultFee: body?.enableDefaultFee !== undefined ? Boolean(body.enableDefaultFee) : undefined,
        enableDistanceBasedFee: body?.enableDistanceBasedFee !== undefined ? Boolean(body.enableDistanceBasedFee) : undefined,
        baseDistanceKm:
            body?.baseDistanceKm === null ? null : body?.baseDistanceKm !== undefined && body?.baseDistanceKm !== "" ? Number(body.baseDistanceKm) : undefined,
        baseDistanceFee:
            body?.baseDistanceFee === null ? null : body?.baseDistanceFee !== undefined && body?.baseDistanceFee !== "" ? Number(body.baseDistanceFee) : undefined,
        extraFeePerKm:
            body?.extraFeePerKm === null ? null : body?.extraFeePerKm !== undefined && body?.extraFeePerKm !== "" ? Number(body.extraFeePerKm) : undefined,
        isActive: body?.isActive !== undefined ? Boolean(body.isActive) : undefined
    };

    const result = feeSettingsUpsertSchema.safeParse(normalized);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }

    // Validate ranges per zone: min < max, non-overlapping after sorting per zone scope
    const ranges = Array.isArray(result.data.deliveryFeeRanges) ? result.data.deliveryFeeRanges : undefined;
    if (ranges) {
        for (const r of ranges) {
            if (r.min >= r.max) {
                throw new ValidationError('Each range must have min less than max');
            }
        }
        const rangesByZone = {};
        for (const r of ranges) {
            const key = r.zoneId || 'global';
            if (!rangesByZone[key]) rangesByZone[key] = [];
            rangesByZone[key].push(r);
        }

        for (const key of Object.keys(rangesByZone)) {
            const sorted = rangesByZone[key].sort((a, b) => a.min - b.min);
            for (let i = 1; i < sorted.length; i++) {
                const prev = sorted[i - 1];
                const cur = sorted[i];
                if (cur.min < prev.max) {
                    throw new ValidationError(`Delivery fee ranges must not overlap for zone: ${key}`);
                }
            }
        }
    }

    return result.data;
};
