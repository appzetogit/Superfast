import { sendResponse } from '../../../utils/response.js';
import {
    getPayoutAccount,
    startPayoutAccountVerification,
    confirmPayoutAccount,
    resetPayoutAccount
} from '../services/autoPayout.service.js';

/** Builds the 4 payout-account handlers for a role ('restaurant' | 'delivery'). */
export function payoutAccountControllers(kind) {
    const wrap = (fn, message) => async (req, res, next) => {
        try {
            const data = await fn(kind, req.user?.userId, req.body || {});
            return sendResponse(res, 200, message, data);
        } catch (error) {
            next(error);
        }
    };
    return {
        get: wrap(getPayoutAccount, 'Payout account fetched'),
        save: wrap(startPayoutAccountVerification, 'Verification started'),
        confirm: wrap(confirmPayoutAccount, 'Payout account confirmed'),
        reset: wrap(resetPayoutAccount, 'Payout account cleared')
    };
}
