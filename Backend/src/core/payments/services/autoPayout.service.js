import { FoodRestaurantWithdrawal } from '../../../modules/food/restaurant/models/foodRestaurantWithdrawal.model.js';
import { FoodRestaurant } from '../../../modules/food/restaurant/models/restaurant.model.js';
import { FoodDeliveryWithdrawal } from '../../../modules/food/delivery/models/foodDeliveryWithdrawal.model.js';
import { FoodDeliveryPartner } from '../../../modules/food/delivery/models/deliveryPartner.model.js';
import { FoodDeliveryWallet } from '../../../modules/food/delivery/models/deliveryWallet.model.js';
import { Transaction } from '../models/transaction.model.js';
import { debitWallet } from '../wallet.service.js';
import { ValidationError } from '../../auth/errors.js';
import { config } from '../../../config/env.js';
import { logger } from '../../../utils/logger.js';

/**
 * Automatic payouts of restaurant / delivery-partner withdrawals through Razorpay X.
 *
 * Needs in .env:  RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAYX_ACCOUNT_NUMBER
 * Optional:       AUTO_PAYOUT_ENABLED=false  (turn automation off, requests stay manual)
 *
 * Safety against paying the wrong person:
 *  1. The user enters bank/UPI details. We create a Razorpay fund account and run a
 *     Fund Account Validation (penny drop) which returns the REAL registered account-holder name.
 *  2. That name must match the name the user typed, and the user must explicitly confirm it
 *     ("Yes, this is my account"). Only then is the account marked verified + confirmed.
 *  3. Withdrawals are paid ONLY to that verified fund account. Changing the details starts again at step 1.
 *
 * Money-safety rules for the payout itself:
 *  - a withdrawal is claimed atomically (pending -> approved) before any money moves
 *  - the Razorpay payout carries the withdrawal id as idempotency key (no double pay on retry)
 *  - a definitive failure releases the money again (restaurant: rejected, delivery: wallet re-credited)
 *  - an uncertain failure (timeout / 5xx) keeps the withdrawal approved, flagged `unknown`, never auto-released
 *  - payout.* webhooks keep the final state in sync
 */

const API_BASE = 'https://api.razorpay.com/v1';
const KEY_ID = config.razorpayKeyId || process.env.RAZORPAY_KEY_ID || '';
const KEY_SECRET = config.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET || '';
const rzxAccountNumber = () => String(process.env.RAZORPAYX_ACCOUNT_NUMBER || '').trim();

export function isAutoPayoutEnabled() {
    if (String(process.env.AUTO_PAYOUT_ENABLED ?? 'true').toLowerCase() === 'false') return false;
    return Boolean(KEY_ID && KEY_SECRET && rzxAccountNumber());
}

/* ------------------------- Razorpay X HTTP ------------------------- */

class RazorpayApiError extends Error {
    constructor(message, { status, definitive }) {
        super(message);
        this.status = status;
        this.definitive = definitive; // true => Razorpay clearly rejected it, no money moved
    }
}

async function rzxCall(method, path, body, headers = {}) {
    let res;
    try {
        res = await fetch(`${API_BASE}${path}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Basic ${Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64')}`,
                ...headers
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(20000)
        });
    } catch (err) {
        throw new RazorpayApiError(`Network error: ${err.message}`, { status: 0, definitive: false });
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg = json?.error?.description || `Razorpay error ${res.status}`;
        throw new RazorpayApiError(msg, { status: res.status, definitive: res.status >= 400 && res.status < 500 });
    }
    return json;
}
const rzx = (path, body, headers) => rzxCall('POST', path, body, headers);
const rzxGet = (path) => rzxCall('GET', path);

/* ------------------------- kinds ------------------------- */

const KINDS = {
    restaurant: {
        Withdrawal: FoodRestaurantWithdrawal,
        Profile: FoodRestaurant,
        ownerField: 'restaurantId',
        contactType: 'vendor',
        profileNames: (p) => [p.ownerName, p.restaurantName, p.accountHolderName],
        phone: (p) => p.ownerPhone || p.phone,
        displayName: (p) => p.ownerName || p.restaurantName,
        // also keep the visible profile fields in sync with the verified account
        syncProfile: (d) =>
            d.kind === 'bank'
                ? { accountNumber: d.account, ifscCode: d.ifsc, accountHolderName: d.name, upiId: '' }
                : { upiId: d.vpa }
    },
    delivery: {
        Withdrawal: FoodDeliveryWithdrawal,
        Profile: FoodDeliveryPartner,
        ownerField: 'deliveryPartnerId',
        contactType: 'employee',
        profileNames: (p) => [p.name, p.bankAccountHolderName],
        phone: (p) => p.phone,
        displayName: (p) => p.name,
        syncProfile: (d) =>
            d.kind === 'bank'
                ? { bankAccountNumber: d.account, bankIfscCode: d.ifsc, bankAccountHolderName: d.name, upiId: '' }
                : { upiId: d.vpa }
    }
};

const cfgOf = (kind) => {
    const cfg = KINDS[kind];
    if (!cfg) throw new Error(`Unknown withdrawal kind: ${kind}`);
    return cfg;
};

/* ------------------------- delivery wallet accounting ------------------------- */

/** Debit the rider wallet for an approved withdrawal (+ lifetime "settled" counter). */
export async function debitDeliveryForWithdrawal(withdrawal, extraMeta = {}) {
    const amount = Number(withdrawal.amount || 0);
    if (amount <= 0) return;
    const partnerId = withdrawal.deliveryPartnerId?._id || withdrawal.deliveryPartnerId;
    await debitWallet({
        entityType: 'deliveryBoy',
        entityId: partnerId,
        amount,
        description: `Withdrawal Approved - ${withdrawal._id}`,
        category: 'settlement_payout',
        metadata: { withdrawalId: withdrawal._id, ...extraMeta },
        allowNegative: true
    });
    await FoodDeliveryWallet.updateOne({ deliveryPartnerId: partnerId }, { $inc: { totalSettled: amount } });
}

/** Give the money back to the rider wallet (payout failed / reversed). Not counted as earnings. */
export async function reverseDeliveryWithdrawal(withdrawal, reason) {
    const amount = Number(withdrawal.amount || 0);
    if (amount <= 0) return;
    const partnerId = withdrawal.deliveryPartnerId?._id || withdrawal.deliveryPartnerId;
    const wallet = await FoodDeliveryWallet.findOneAndUpdate(
        { deliveryPartnerId: partnerId },
        { $inc: { balance: amount, totalSettled: -amount } },
        { new: true }
    );
    await Transaction.create({
        entityType: 'deliveryBoy',
        entityId: partnerId,
        type: 'credit',
        amount,
        balanceAfter: wallet?.balance ?? 0,
        currency: 'INR',
        status: 'completed',
        description: `Withdrawal reversed - ${reason || 'payout failed'}`,
        category: 'adjustment',
        module: 'food',
        metadata: { withdrawalId: withdrawal._id }
    });
}

/* ------------------------- payout account: verify + confirm ------------------------- */

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/;

const normName = (s) =>
    String(s || '')
        .toLowerCase()
        .replace(/[^a-z\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 1 && !['mr', 'mrs', 'ms', 'shri', 'smt', 'sri', 'late'].includes(t));

/** true when the two names clearly refer to the same person (order/initials/typo tolerant). */
export function namesMatch(a, b) {
    const ta = normName(a);
    const tb = normName(b);
    if (!ta.length || !tb.length) return false;
    const sa = new Set(ta);
    const sb = new Set(tb);
    const common = [...sa].filter((t) => sb.has(t)).length;
    const smaller = Math.min(sa.size, sb.size);
    if (common >= Math.max(1, Math.ceil(smaller * 0.5))) return true;
    const ja = ta.join('');
    const jb = tb.join('');
    return ja.includes(jb) || jb.includes(ja);
}

const maskVpa = (v) => {
    const [u, h] = String(v || '').split('@');
    return u ? `${u.slice(0, 2)}***@${h || ''}` : '';
};

function publicView(pa) {
    if (!pa) return { status: 'none', confirmed: false };
    return {
        status: pa.status, // pending | verified | name_mismatch | failed
        confirmed: Boolean(pa.confirmed),
        kind: pa.kind, // bank | upi
        enteredName: pa.enteredName || '',
        registeredName: pa.registeredName || '',
        maskedAccount: pa.kind === 'bank' ? (pa.last4 ? `XXXXXX${pa.last4}` : '') : maskVpa(pa.vpa),
        ifsc: pa.ifsc || '',
        failureReason: pa.failureReason || '',
        updatedAt: pa.updatedAt
    };
}

async function loadProfile(kind, ownerId) {
    const { Profile } = cfgOf(kind);
    const doc = await Profile.findById(ownerId).select('+payoutAccount').lean();
    if (!doc) throw new ValidationError('Account not found');
    return doc;
}

function parseDetails(input = {}) {
    const upi = String(input.upiId || '').trim();
    if (upi) {
        if (!UPI_RE.test(upi)) throw new ValidationError('Enter a valid UPI ID (example: name@bank)');
        return { kind: 'upi', vpa: upi.toLowerCase(), name: String(input.accountHolderName || '').trim() };
    }
    const name = String(input.accountHolderName || '').trim().replace(/\s+/g, ' ');
    const account = String(input.accountNumber || '').replace(/\s/g, '');
    const ifsc = String(input.ifsc || input.ifscCode || '').trim().toUpperCase();
    if (name.length < 2 || name.length > 60) throw new ValidationError('Enter the account holder name as on the bank account');
    if (!/^\d{9,18}$/.test(account)) throw new ValidationError('Account number must be 9 to 18 digits');
    if (!IFSC_RE.test(ifsc)) throw new ValidationError('Enter a valid IFSC code (example: SBIN0001234)');
    return { kind: 'bank', account, ifsc, name };
}

export async function getPayoutAccount(kind, ownerId) {
    const profile = await loadProfile(kind, ownerId);
    let pa = profile.payoutAccount || null;
    if (pa?.status === 'pending' && pa.validationId && isAutoPayoutEnabled()) {
        // webhook may be slow / not configured: poll Razorpay directly
        try {
            const v = await rzxGet(`/fund_accounts/validations/${pa.validationId}`);
            pa = (await applyValidationResult(kind, ownerId, v)) || pa;
        } catch (err) {
            logger.warn(`[PayoutAccount] validation poll failed: ${err.message}`);
        }
    }
    return { autoPayoutEnabled: isAutoPayoutEnabled(), ...publicView(pa) };
}

/** Step 1: save details + start penny-drop verification. */
export async function startPayoutAccountVerification(kind, ownerId, input) {
    if (!isAutoPayoutEnabled()) throw new ValidationError('Automatic payouts are not enabled yet');
    const cfg = cfgOf(kind);
    const profile = await loadProfile(kind, ownerId);
    const d = parseDetails(input);

    const holderName = d.name || cfg.displayName(profile) || 'Partner';
    try {
        const contact = await rzx('/contacts', {
            name: holderName.slice(0, 50),
            contact: String(cfg.phone(profile) || '').replace(/\D/g, '').slice(-10) || undefined,
            type: cfg.contactType,
            reference_id: `${kind}_${ownerId}`.slice(0, 40)
        });
        const fund = await rzx('/fund_accounts', {
            contact_id: contact.id,
            account_type: d.kind === 'bank' ? 'bank_account' : 'vpa',
            ...(d.kind === 'bank'
                ? { bank_account: { name: holderName, ifsc: d.ifsc, account_number: d.account } }
                : { vpa: { address: d.vpa } })
        });
        const validation = await rzx('/fund_accounts/validations', {
            account_number: rzxAccountNumber(),
            fund_account: { id: fund.id },
            amount: 100, // ₹1 penny drop
            currency: 'INR',
            notes: { owner: `${kind}_${ownerId}` }
        });

        const payoutAccount = {
            kind: d.kind,
            enteredName: holderName,
            last4: d.kind === 'bank' ? d.account.slice(-4) : undefined,
            ifsc: d.kind === 'bank' ? d.ifsc : undefined,
            vpa: d.kind === 'upi' ? d.vpa : undefined,
            fundAccountId: fund.id,
            validationId: validation.id,
            status: 'pending',
            confirmed: false,
            registeredName: null,
            failureReason: null,
            updatedAt: new Date()
        };
        await cfg.Profile.updateOne({ _id: ownerId }, { $set: { payoutAccount, ...cfg.syncProfile({ ...d, name: holderName }) } });

        // result is often instant for UPI / fast for bank
        const applied = await applyValidationResult(kind, ownerId, validation);
        return { autoPayoutEnabled: true, ...publicView(applied || payoutAccount) };
    } catch (err) {
        if (err instanceof RazorpayApiError) {
            throw new ValidationError(
                err.definitive ? `Could not verify these details: ${err.message}` : 'Verification service is busy, please try again in a minute'
            );
        }
        throw err;
    }
}

/** Interprets a Razorpay fund-account-validation object and stores the outcome. */
async function applyValidationResult(kind, ownerId, v) {
    const cfg = cfgOf(kind);
    const profile = await cfg.Profile.findById(ownerId).select('+payoutAccount').lean();
    const pa = profile?.payoutAccount;
    if (!pa || pa.validationId !== v?.id) return null;
    if (v.status === 'created' || v.status === 'pending') return pa; // still running

    const next = { ...pa, updatedAt: new Date() };
    if (v.status === 'completed' && String(v.results?.account_status || '').toLowerCase() === 'active') {
        const registered = String(v.results?.registered_name || '').trim();
        next.registeredName = registered || null;
        if (!registered) {
            next.status = 'failed';
            next.failureReason = 'The bank did not return the account holder name. Please try a different account or UPI ID.';
        } else if (!namesMatch(pa.enteredName, registered)) {
            next.status = 'name_mismatch';
            next.failureReason = `The account belongs to "${registered}", which does not match "${pa.enteredName}". Check the details and try again.`;
        } else {
            next.status = 'verified';
            next.failureReason = null;
        }
    } else {
        next.status = 'failed';
        next.failureReason = v.results?.message || v.results?.account_status
            ? `Account could not be verified (${v.results?.message || v.results?.account_status})`
            : 'Account could not be verified. Please check the details.';
    }
    next.confirmed = false;
    await cfg.Profile.updateOne({ _id: ownerId, 'payoutAccount.validationId': v.id }, { $set: { payoutAccount: next } });
    return next;
}

/** Step 2: the user has seen the registered name and says "yes, that is me". */
export async function confirmPayoutAccount(kind, ownerId) {
    const cfg = cfgOf(kind);
    const res = await cfg.Profile.findOneAndUpdate(
        { _id: ownerId, 'payoutAccount.status': 'verified' },
        { $set: { 'payoutAccount.confirmed': true, 'payoutAccount.confirmedAt': new Date() } },
        { new: true }
    ).select('+payoutAccount').lean();
    if (!res) throw new ValidationError('Account is not verified yet');
    return { autoPayoutEnabled: isAutoPayoutEnabled(), ...publicView(res.payoutAccount) };
}

/** Anyone who wants to reject the shown name (or re-enter details) clears the pending account. */
export async function resetPayoutAccount(kind, ownerId) {
    const cfg = cfgOf(kind);
    await cfg.Profile.updateOne({ _id: ownerId }, { $unset: { payoutAccount: '' } });
    return { autoPayoutEnabled: isAutoPayoutEnabled(), ...publicView(null) };
}

/** `{ ok:true }` when withdrawals may proceed (manual mode, or verified+confirmed account). */
export async function checkPayoutReady(kind, ownerId) {
    if (!isAutoPayoutEnabled()) return { ok: true, manual: true };
    const profile = await loadProfile(kind, ownerId);
    const pa = profile.payoutAccount;
    if (pa?.status === 'verified' && pa.confirmed && pa.fundAccountId) return { ok: true };
    return { ok: false, status: pa?.status || 'none' };
}

export async function handleValidationWebhook(entity) {
    if (!entity?.id) return false;
    for (const kind of Object.keys(KINDS)) {
        const doc = await KINDS[kind].Profile.findOne({ 'payoutAccount.validationId': entity.id }).select('_id').lean();
        if (doc) {
            await applyValidationResult(kind, doc._id, entity);
            return true;
        }
    }
    return false;
}

/* ------------------------- main entry ------------------------- */

async function releaseFailed(kind, w, reason) {
    const { Withdrawal } = cfgOf(kind);
    if (kind === 'delivery') {
        await reverseDeliveryWithdrawal(w, reason);
    }
    await Withdrawal.updateOne(
        { _id: w._id },
        {
            $set: {
                status: 'rejected',
                rejectionReason: `Auto payout failed: ${reason}`,
                payoutStatus: 'failed',
                payoutError: reason,
                processedAt: new Date()
            }
        }
    );
}

/**
 * Pays a pending withdrawal automatically, only to the verified + confirmed payout account.
 * @returns {{paid:boolean, skipped?:string, status?:string, error?:string}}
 */
export async function autoPayWithdrawal(kind, withdrawalId) {
    if (!isAutoPayoutEnabled()) return { paid: false, skipped: 'auto_payout_disabled' };
    const cfg = cfgOf(kind);

    const pending = await cfg.Withdrawal.findOne({ _id: withdrawalId, status: 'pending' }).lean();
    if (!pending) return { paid: false, skipped: 'not_pending' };

    const ownerId = pending[cfg.ownerField];
    const profile = await cfg.Profile.findById(ownerId).select('+payoutAccount').lean();
    const pa = profile?.payoutAccount;
    if (!(pa?.status === 'verified' && pa.confirmed && pa.fundAccountId)) {
        return { paid: false, skipped: 'needs_verified_payout_account' }; // stays pending for admin
    }

    // 1) atomic claim: only one caller ever gets to pay this withdrawal
    const claimed = await cfg.Withdrawal.findOneAndUpdate(
        { _id: withdrawalId, status: 'pending' },
        { $set: { status: 'approved', processedAt: new Date(), adminNote: 'Auto payout (Razorpay X)', payoutStatus: 'initiating' } },
        { new: true }
    ).lean();
    if (!claimed) return { paid: false, skipped: 'not_pending' };

    // 2) take the money out of the rider wallet (restaurant balance is ledger based: approved already counts)
    if (kind === 'delivery') {
        try {
            await debitDeliveryForWithdrawal(claimed, { auto: true });
        } catch (err) {
            await cfg.Withdrawal.updateOne(
                { _id: withdrawalId },
                { $set: { status: 'pending', payoutStatus: null }, $unset: { processedAt: '', adminNote: '' } }
            );
            logger.error(`[AutoPayout] wallet debit failed for ${withdrawalId}: ${err.message}`);
            return { paid: false, error: err.message };
        }
    }

    // 3) the actual bank / UPI transfer, to the account the user verified and confirmed
    try {
        const payout = await rzx(
            '/payouts',
            {
                account_number: rzxAccountNumber(),
                fund_account_id: pa.fundAccountId,
                amount: Math.round(Number(claimed.amount) * 100),
                currency: 'INR',
                mode: pa.kind === 'bank' ? 'IMPS' : 'UPI',
                purpose: 'payout',
                queue_if_low_balance: true,
                reference_id: String(claimed._id),
                narration: 'Superfast payout'
            },
            { 'X-Payout-Idempotency': String(claimed._id) }
        );

        await cfg.Withdrawal.updateOne(
            { _id: claimed._id },
            { $set: { payoutId: payout.id, payoutStatus: payout.status || 'queued', transactionId: payout.utr || payout.id } }
        );
        logger.info(`[AutoPayout] ${kind} withdrawal ${claimed._id} -> payout ${payout.id} (${payout.status})`);
        return { paid: true, status: payout.status };
    } catch (err) {
        if (err instanceof RazorpayApiError && err.definitive) {
            await releaseFailed(kind, claimed, err.message);
            logger.error(`[AutoPayout] ${kind} withdrawal ${claimed._id} rejected by Razorpay: ${err.message}`);
            return { paid: false, error: err.message };
        }
        // Uncertain: the transfer may or may not have happened. Never release automatically.
        await cfg.Withdrawal.updateOne(
            { _id: claimed._id },
            { $set: { payoutStatus: 'unknown', payoutError: err.message } }
        );
        logger.error(`[AutoPayout] ${kind} withdrawal ${claimed._id} UNCERTAIN, needs manual check: ${err.message}`);
        return { paid: false, error: err.message, status: 'unknown' };
    }
}

/* ------------------------- webhook ------------------------- */

/** Handles payout.processed / payout.failed / payout.reversed / payout.rejected / payout.cancelled */
export async function handlePayoutWebhook(event, payoutEntity) {
    const payoutId = payoutEntity?.id;
    if (!payoutId) return false;

    for (const kind of Object.keys(KINDS)) {
        const { Withdrawal } = KINDS[kind];

        if (event === 'payout.processed') {
            const done = await Withdrawal.findOneAndUpdate(
                { payoutId },
                { $set: { payoutStatus: 'processed', transactionId: payoutEntity.utr || payoutId } },
                { new: true }
            );
            if (done) return true;
            continue;
        }

        if (['payout.failed', 'payout.reversed', 'payout.rejected', 'payout.cancelled'].includes(event)) {
            const reason = payoutEntity.failure_reason || payoutEntity.status_details?.description || event;
            // flip once: a repeated webhook finds nothing and does nothing
            const w = await Withdrawal.findOneAndUpdate(
                { payoutId, payoutStatus: { $nin: ['failed', 'reversed'] } },
                { $set: { payoutStatus: event === 'payout.reversed' ? 'reversed' : 'failed' } },
                { new: true }
            ).lean();
            if (w) {
                await releaseFailed(kind, w, reason);
                return true;
            }
            if (await Withdrawal.exists({ payoutId })) return true;
            continue;
        }

        if (['payout.queued', 'payout.pending', 'payout.initiated'].includes(event)) {
            const upd = await Withdrawal.updateOne(
                { payoutId, payoutStatus: { $nin: ['processed', 'failed', 'reversed'] } },
                { $set: { payoutStatus: event.replace('payout.', '') } }
            );
            if (upd.matchedCount) return true;
        }
    }
    return false;
}
