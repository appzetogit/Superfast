import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { FoodUser } from '../users/user.model.js';
import { FoodRestaurant } from '../../modules/food/restaurant/models/restaurant.model.js';
import { FoodDeliveryPartner } from '../../modules/food/delivery/models/deliveryPartner.model.js';
import { Seller } from '../../modules/quick-commerce/seller/models/seller.model.js';
import { FoodUserWallet } from '../../modules/food/user/models/userWallet.model.js';
import { FoodOrder } from '../../modules/food/orders/models/order.model.js';
import { FoodRestaurantWithdrawal } from '../../modules/food/restaurant/models/foodRestaurantWithdrawal.model.js';
import { FoodDeliveryWithdrawal } from '../../modules/food/delivery/models/foodDeliveryWithdrawal.model.js';
import { FoodRefreshToken } from '../refreshTokens/refreshToken.model.js';
import { createOrUpdateOtp, verifyOtp } from '../otp/otp.service.js';
import { getRestaurantFinance } from '../../modules/food/restaurant/services/restaurantFinance.service.js';
import { deleteRestaurantAccount } from '../../modules/food/restaurant/services/restaurant.service.js';
import { getDeliveryPartnerWalletEnhanced } from '../../modules/food/delivery/services/deliveryFinance.service.js';
import { ValidationError } from './errors.js';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

/**
 * Public, no-login account deletion (required by Google Play "account deletion link").
 *
 * Flow: the owner of a phone number asks for an OTP, proves ownership with it, and the account is
 * deleted. Personal data is erased / anonymised; order and payment records stay (anonymised) because
 * tax and accounting law requires them.
 *
 * Safety: money is never silently lost. A restaurant or rider with an unpaid balance, pending
 * withdrawal, cash in hand or a running order must settle first. A customer with wallet balance has to
 * explicitly accept that it is forfeited.
 */

export const DELETION_ROLES = ['user', 'restaurant', 'delivery', 'seller'];

const ACTIVE_ORDER_EXCLUDE = [
    'delivered', 'cancelled_by_user', 'cancelled_by_restaurant', 'cancelled_by_admin',
    'refunded', 'rejected', 'failed'
];

const logSchema = new mongoose.Schema(
    {
        role: String,
        accountId: mongoose.Schema.Types.ObjectId,
        phoneLast4: String,
        via: String,
        at: { type: Date, default: Date.now }
    },
    { collection: 'account_deletion_log' }
);
const AccountDeletionLog = mongoose.models.AccountDeletionLog || mongoose.model('AccountDeletionLog', logSchema);

const last10 = (phone) => String(phone || '').replace(/\D/g, '').slice(-10);

function assertRole(role) {
    if (!DELETION_ROLES.includes(role)) throw new ValidationError('Unknown account type');
}

function phoneRegex(l10) {
    return new RegExp(`${l10}$`);
}

/* ---------------------------- account lookup ---------------------------- */

async function findAccount(role, phone) {
    const l10 = last10(phone);
    if (l10.length !== 10) return null;
    const rx = phoneRegex(l10);
    switch (role) {
        case 'user':
            return FoodUser.findOne({ phone: rx, isDeleted: { $ne: true }, isActive: { $ne: false } });
        case 'restaurant':
            return FoodRestaurant.findOne({ $or: [{ ownerPhone: rx }, { primaryContactNumber: rx }] });
        case 'delivery':
            return FoodDeliveryPartner.findOne({ phone: rx });
        case 'seller':
            return Seller.findOne({ $or: [{ phoneLast10: l10 }, { phoneDigits: rx }, { phone: rx }], isActive: { $ne: false } });
        default:
            return null;
    }
}

/* ---------------------------- blockers ---------------------------- */

async function findBlockers(role, account, { acceptWalletForfeit } = {}) {
    const id = account._id;
    const blockers = [];

    if (role === 'user') {
        const active = await FoodOrder.countDocuments({ userId: id, orderStatus: { $nin: ACTIVE_ORDER_EXCLUDE } });
        if (active > 0) blockers.push('You have an order in progress. Please wait until it is delivered or cancelled.');
        const wallet = await FoodUserWallet.findOne({ userId: id }).select('balance').lean();
        if (Number(wallet?.balance) > 0 && !acceptWalletForfeit) {
            return { blockers, walletBalance: Number(wallet.balance), needsWalletConsent: true };
        }
        return { blockers, walletBalance: Number(wallet?.balance) || 0 };
    }

    if (role === 'restaurant') {
        const active = await FoodOrder.countDocuments({ restaurantId: id, orderStatus: { $nin: ACTIVE_ORDER_EXCLUDE } });
        if (active > 0) blockers.push('You have orders in progress. Please complete them first.');
        const pending = await FoodRestaurantWithdrawal.countDocuments({ restaurantId: id, status: 'pending' });
        if (pending > 0) blockers.push('You have a pending withdrawal. Please wait until it is processed.');
        const finance = await getRestaurantFinance(String(id)).catch(() => null);
        const balance = Number(finance?.currentCycle?.estimatedPayout) || 0;
        if (balance > 0) blockers.push(`You still have ₹${balance.toFixed(2)} to withdraw. Please withdraw it from the app first, then delete the account.`);
    }

    if (role === 'delivery') {
        const active = await FoodOrder.countDocuments({ 'dispatch.deliveryPartnerId': id, orderStatus: { $nin: ACTIVE_ORDER_EXCLUDE } });
        if (active > 0) blockers.push('You have a delivery in progress. Please complete it first.');
        const pending = await FoodDeliveryWithdrawal.countDocuments({ deliveryPartnerId: id, status: 'pending' });
        if (pending > 0) blockers.push('You have a pending withdrawal. Please wait until it is processed.');
        const wallet = await getDeliveryPartnerWalletEnhanced(String(id)).catch(() => null);
        if (wallet?.cashInHand > 0) blockers.push(`You are holding ₹${wallet.cashInHand.toFixed(2)} of collected cash. Please deposit it first.`);
        if (wallet?.pocketBalance > 0) blockers.push(`You still have ₹${wallet.pocketBalance.toFixed(2)} to withdraw. Please withdraw it from the app first.`);
    }

    return { blockers };
}

/* ---------------------------- erase / anonymise ---------------------------- */

async function eraseAccount(role, account, via = 'web') {
    const id = account._id;
    const tag = `deleted_${id}`;
    const now = new Date();

    if (role === 'user') {
        await FoodUserWallet.updateOne(
            { userId: id },
            {
                $set: { balance: 0 },
                $push: {
                    transactions: {
                        $each: [{ type: 'deduction', amount: 0, status: 'Completed', description: 'Account deleted - remaining balance forfeited' }],
                        $position: 0
                    }
                }
            }
        );
        await FoodUser.updateOne(
            { _id: id },
            {
                $set: {
                    name: 'Deleted User', phone: tag, email: '', profileImage: '', profileImagePublicId: '',
                    fcmTokens: [], fcmTokenMobile: [], addresses: [], dateOfBirth: null, anniversary: null,
                    aadhaarNumber: '', aadhaarFront: '', aadhaarBack: '', panNumber: '', panCardImage: '',
                    walletBalance: 0, isActive: false, isDeleted: true, isVerified: false,
                    'deletionRequest.status': 'approved', 'deletionRequest.reviewedAt': now
                }
            }
        );
    } else if (role === 'restaurant') {
        // removes the profile, menu, outlet timings and the restaurant's private categories
        await deleteRestaurantAccount(id);
    } else if (role === 'delivery') {
        await FoodDeliveryPartner.updateOne(
            { _id: id },
            {
                $set: {
                    name: 'Deleted Partner', phone: tag, email: '', address: '', city: '', state: '',
                    vehicleNumber: '', panNumber: '', aadharNumber: '', drivingLicenseNumber: '',
                    profilePhoto: '', aadharPhoto: '', panPhoto: '', drivingLicensePhoto: '',
                    bankAccountHolderName: '', bankAccountNumber: '', bankIfscCode: '', bankName: '',
                    upiId: '', upiQrCode: '', payoutAccount: null, fcmTokens: [], fcmTokenMobile: [],
                    status: 'rejected', rejectionReason: 'Account deleted by owner', availabilityStatus: 'offline'
                }
            }
        );
    } else if (role === 'seller') {
        await Seller.updateOne(
            { _id: id },
            {
                $set: {
                    name: 'Deleted Seller', shopName: 'Deleted Shop', email: '', phone: tag, phoneDigits: tag, phoneLast10: tag,
                    isActive: false, approved: false, approvalStatus: 'rejected', approvalNotes: 'Account deleted by owner',
                    alternatePhone: '', supportEmail: ''
                }
            }
        );
    }

    // sign the person out everywhere
    await FoodRefreshToken.deleteMany({ userId: id }).catch(() => {});

    await AccountDeletionLog.create({
        role,
        accountId: id,
        phoneLast4: last10(account.phone || account.ownerPhone || '').slice(-4),
        via
    }).catch(() => {});
}

/* ---------------------------- public API ---------------------------- */

/** Step 1: send an OTP. Always answers the same way so numbers cannot be probed. */
export async function requestAccountDeletionOtp({ role, phone }) {
    assertRole(role);
    const l10 = last10(phone);
    if (l10.length !== 10) throw new ValidationError('Enter a valid 10-digit mobile number');

    // Never fall back to the fixed test OTP for something as destructive as deletion.
    if (config.nodeEnv === 'production' && config.useDefaultOtp) {
        throw new ValidationError('SMS verification is not available right now. Please email support to delete your account.');
    }

    const account = await findAccount(role, l10);
    let otp;
    if (account) {
        otp = await createOrUpdateOtp(l10, { forceRandom: true });
    }
    const expose = config.nodeEnv !== 'production' && otp;
    return { sent: true, ...(expose ? { otp } : {}) };
}

/** Proof that the OTP was already verified, so the user is not asked again after seeing a warning. */
const signProof = (role, l10, accountId) =>
    jwt.sign({ purpose: 'account_deletion', role, phone: l10, accountId: String(accountId) }, config.jwtAccessSecret, { expiresIn: '10m' });

function verifyProof(token, role, l10, accountId) {
    try {
        const p = jwt.verify(String(token), config.jwtAccessSecret);
        return p.purpose === 'account_deletion' && p.role === role && p.phone === l10 && p.accountId === String(accountId);
    } catch {
        return false;
    }
}

/** Step 2: verify the OTP (or the proof from a previous step) and delete. */
export async function confirmAccountDeletion({ role, phone, otp, token, acceptWalletForfeit }) {
    assertRole(role);
    const l10 = last10(phone);
    if (l10.length !== 10) throw new ValidationError('Enter a valid 10-digit mobile number');
    if (!otp && !token) throw new ValidationError('Enter the OTP');
    if (config.nodeEnv === 'production' && config.useDefaultOtp) {
        throw new ValidationError('SMS verification is not available right now. Please email support to delete your account.');
    }

    const account = await findAccount(role, l10);
    if (!account) throw new ValidationError('Invalid OTP or no account found for this number');

    if (!(token && verifyProof(token, role, l10, account._id))) {
        const verified = otp ? await verifyOtp(l10, String(otp).trim()) : { valid: false, reason: 'Invalid OTP' };
        if (!verified.valid) {
            throw new ValidationError(verified.reason === 'OTP expired' ? 'OTP expired. Please request a new one.' : 'Invalid OTP or no account found for this number');
        }
    }
    const proof = signProof(role, l10, account._id);

    const check = await findBlockers(role, account, { acceptWalletForfeit: Boolean(acceptWalletForfeit) });
    if (check.needsWalletConsent) {
        return {
            deleted: false,
            needsWalletConsent: true,
            walletBalance: check.walletBalance,
            token: proof,
            message: `Your wallet has ₹${check.walletBalance.toFixed(2)}. Deleting the account forfeits it. Accept to continue.`
        };
    }
    if (check.blockers.length) {
        return { deleted: false, blockers: check.blockers, token: proof, message: check.blockers.join(' ') };
    }

    await eraseAccount(role, account);
    logger.info(`[AccountDeletion] ${role} account ${account._id} deleted via web`);
    return { deleted: true, message: 'Your account and personal data have been deleted.' };
}

/** In-app deletion (user already logged in and typed DELETE). Same erase + same safety checks. */
export async function deleteAccountForOwner(roleEnum, accountId) {
    const role = { USER: 'user', RESTAURANT: 'restaurant', DELIVERY_PARTNER: 'delivery', SELLER: 'seller' }[roleEnum];
    if (!role) throw new ValidationError('Unknown account type');
    const Model = { user: FoodUser, restaurant: FoodRestaurant, delivery: FoodDeliveryPartner, seller: Seller }[role];
    const account = await Model.findById(accountId);
    if (!account) throw new ValidationError('Account not found');

    const check = await findBlockers(role, account, { acceptWalletForfeit: true });
    if (check.blockers.length) throw new ValidationError(check.blockers.join(' '));

    await eraseAccount(role, account, 'app');
    return { success: true, message: 'Account deleted successfully' };
}
