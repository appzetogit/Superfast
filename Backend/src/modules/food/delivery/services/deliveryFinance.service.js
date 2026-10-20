import mongoose from "mongoose";
import { FoodOrder } from "../../orders/models/order.model.js";
import { FoodDeliveryWithdrawal } from "../models/foodDeliveryWithdrawal.model.js";
import { FoodDeliveryCashDeposit } from "../models/foodDeliveryCashDeposit.model.js";
import { FoodDeliveryPartner } from "../models/deliveryPartner.model.js";
import { DeliveryBonusTransaction } from "../../admin/models/deliveryBonusTransaction.model.js";
import { getDeliveryCashLimitSettings } from "../../admin/services/admin.service.js";
import { ValidationError } from "../../../../core/auth/errors.js";
import {
  createRazorpayOrder,
  getRazorpayKeyId,
  isRazorpayConfigured,
  verifyCapturedRazorpayPayment,
} from "../../orders/helpers/razorpay.helper.js";
import { Transaction } from "../../../../core/payments/models/transaction.model.js";
import { getTransactionsByEntity } from "../../../../core/payments/transaction.service.js";
import { FoodDeliveryWallet } from "../models/deliveryWallet.model.js";
import { QuickReturnRequest } from "../../../quick-commerce/models/ReturnRequest.model.js";

/**
 * Enhanced wallet fetch for delivery partners.
 * Integrates:
 * 1. Historical orders (earnings)
 * 2. Admin bonuses
 * 3. Withdrawals (pending/payout)
 * 4. Cash collected vs limit
 */
export const getDeliveryPartnerWalletEnhanced = async (deliveryPartnerId) => {
  if (
    !deliveryPartnerId ||
    !mongoose.Types.ObjectId.isValid(deliveryPartnerId)
  ) {
    throw new ValidationError("Invalid delivery partner ID");
  }

  const partnerId = new mongoose.Types.ObjectId(deliveryPartnerId);
  const partner = await FoodDeliveryPartner.findById(partnerId).lean();
  if (!partner) throw new ValidationError("Delivery partner not found");

  const [
    cashLimitSettings,
    walletDoc,
    totalBonusAgg,
    cashCollectedAgg,
    totalDepositedCashAgg,
    pendingWithdrawalsAgg,
    transactionsResult,
    totalDeliveries,
    totalEarningsAgg,
    totalReturnDeliveriesCount,
    totalReturnEarningsAgg,
  ] = await Promise.all([
    getDeliveryCashLimitSettings(),
    FoodDeliveryWallet.findOne({ deliveryPartnerId: partnerId }).lean(),
    DeliveryBonusTransaction.aggregate([
      { $match: { deliveryPartnerId: partnerId } },
      { $group: { _id: null, total: { $sum: { $ifNull: ["$amount", 0] } } } },
    ]),
    FoodOrder.aggregate([
      {
        $match: {
          "dispatch.deliveryPartnerId": partnerId,
          orderStatus: "delivered",
          "payment.method": { $in: ["cash", "cod", "cash_on_delivery"] },
        },
      },
      {
        $group: {
          _id: null,
          cashCollected: {
            $sum: {
              $let: {
                vars: {
                  amountDue: { $ifNull: ["$payment.amountDue", 0] },
                  payableAmount: { $ifNull: ["$payableAmount", 0] },
                  totalAmount: { $ifNull: ["$totalAmount", 0] },
                  amount: { $ifNull: ["$amount", 0] },
                  total: { $ifNull: ["$total", 0] },
                  pricingTotal: { $ifNull: ["$pricing.total", 0] },
                  platformFee: { $ifNull: ["$pricing.platformFee", 0] },
                  platformFeeIncluded: { $ifNull: ["$pricing.platformFeeIncluded", false] },
                },
                in: {
                  $cond: [
                    { $gt: ["$$amountDue", 0] },
                    "$$amountDue",
                    {
                      $let: {
                        vars: {
                          explicitAmount: {
                            $max: [0, "$$payableAmount", "$$totalAmount", "$$amount", "$$total"],
                          },
                        },
                        in: {
                          $cond: [
                            { $gt: ["$$explicitAmount", 0] },
                            "$$explicitAmount",
                            {
                              $max: [
                                0,
                                {
                                  $cond: [
                                    "$$platformFeeIncluded",
                                    "$$pricingTotal",
                                    {
                                      $add: [
                                        "$$pricingTotal",
                                        {
                                          $cond: [
                                            { $gt: ["$$platformFee", 0] },
                                            "$$platformFee",
                                            0,
                                          ],
                                        },
                                      ],
                                    },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    ]),
    FoodDeliveryCashDeposit.aggregate([
      { $match: { deliveryPartnerId: partnerId, status: "Completed" } },
      {
        $group: {
          _id: null,
          depositedCash: { $sum: { $ifNull: ["$amount", 0] } },
        },
      },
    ]),
    FoodDeliveryWithdrawal.aggregate([
      { $match: { deliveryPartnerId: partnerId, status: "pending" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    getTransactionsByEntity("deliveryBoy", partnerId, { page: 1, limit: 50 }),
    FoodOrder.countDocuments({
      "dispatch.deliveryPartnerId": partnerId,
      orderStatus: "delivered",
    }),
    FoodOrder.aggregate([
      {
        $match: {
          "dispatch.deliveryPartnerId": partnerId,
          orderStatus: "delivered",
        },
      },
      { $group: { _id: null, total: { $sum: { $ifNull: ["$riderEarning", 0] } } } },
    ]),
    QuickReturnRequest.countDocuments({
      deliveryPartnerId: partnerId,
      status: { $in: ["RETURN_RECEIVED_BY_SELLER", "REFUND_COMPLETED"] }
    }),
    QuickReturnRequest.aggregate([
      {
        $match: {
          deliveryPartnerId: partnerId,
          status: { $in: ["RETURN_RECEIVED_BY_SELLER", "REFUND_COMPLETED"] }
        }
      },
      { $group: { _id: null, total: { $sum: { $ifNull: ["$returnPickupEarning", 0] } } } }
    ])
  ]);

  const wallet = walletDoc || {
    balance: 0,
    totalEarnings: 0,
    totalBonus: 0,
    totalSettled: 0,
  };

  // Real-time earnings from orders (handles lag in wallet document updates)
  const aggregatedEarnings = (Number(totalEarningsAgg?.[0]?.total) || 0) + (Number(totalReturnEarningsAgg?.[0]?.total) || 0);
  const effectiveTotalEarnings = Math.max(Number(wallet.totalEarnings || 0), aggregatedEarnings);
  const missingEarningsBalance = Math.max(0, aggregatedEarnings - Number(wallet.totalEarnings || 0));

  const recordedBonus = Number(wallet.totalBonus || 0);
  const aggregatedBonus = Number(totalBonusAgg?.[0]?.total) || 0;
  const effectiveBonus = Math.max(recordedBonus, aggregatedBonus);
  const missingBonusBalance = Math.max(0, effectiveBonus - recordedBonus);

  const grossCashCollected = Number(cashCollectedAgg?.[0]?.cashCollected) || 0;
  const totalDepositedCash =
    Number(totalDepositedCashAgg?.[0]?.depositedCash) || 0;
  const cashInHand = Math.max(0, grossCashCollected - totalDepositedCash);

  const pendingWithdrawals = Number(pendingWithdrawalsAgg?.[0]?.total) || 0;
  const totalCashLimit = Number(cashLimitSettings.deliveryCashLimit) || 0;
  const deliveryWithdrawalLimit =
    Number(cashLimitSettings.deliveryWithdrawalLimit) || 100;

  const effectiveWalletBalance =
    Number(wallet.balance || 0) + missingBonusBalance + missingEarningsBalance;
  const pocketBalanceRaw = effectiveWalletBalance - pendingWithdrawals;
  const pocketBalance = Math.max(0, pocketBalanceRaw);

  const transactions = transactionsResult.transactions.map((t) => ({
    id: t._id,
    type:
      t.category === "settlement_payout"
        ? "withdrawal"
        : t.type === "credit"
          ? "payment"
          : "adjustment",
    amount: t.amount,
    status:
      t.status === "completed"
        ? "Completed"
        : t.status === "pending"
          ? "Pending"
          : "Failed",
    date: t.createdAt,
    description: t.description || "Wallet transaction",
    orderId: t.orderId,
    module: t.module,
  }));

  return {
    totalBalance: effectiveTotalEarnings + effectiveBonus,
    pocketBalance,
    pocketBalanceRaw,
    cashInHand,
    totalWithdrawn: wallet.totalSettled || 0,
    pendingWithdrawals,
    totalEarned: effectiveTotalEarnings,
    totalBonus: effectiveBonus,
    totalCashLimit,
    availableCashLimit: Math.max(0, totalCashLimit - cashInHand),
    deliveryWithdrawalLimit,
    totalDeliveries: (Number(totalDeliveries) || 0) + (Number(totalReturnDeliveriesCount) || 0),
    transactions,
  };
};

/**
 * Checks if a delivery partner is eligible to receive a COD order.
 * A driver cannot receive COD orders if:
 * 1. Their total cash limit is 0, OR
 * 2. Their cash in hand (collected cash) meets or exceeds their cash limit (availableCashLimit <= 0).
 */
export const isPartnerEligibleForCodOrder = async (deliveryPartnerId) => {
  try {
    const wallet = await getDeliveryPartnerWalletEnhanced(deliveryPartnerId);
    if (!wallet) return false;
    // No cash limit configured by admin => no cap. (Online payment is disabled, so every
    // order is COD; treating "unset" as "blocked" would leave all orders without a rider.)
    if (wallet.totalCashLimit <= 0) return true;
    if (wallet.availableCashLimit <= 0) return false;
    return true;
  } catch (err) {
    return false; // Safely exclude from COD if check fails
  }
};

/**
 * Submits a new withdrawal request for a delivery partner.
 */
export const requestDeliveryWithdrawal = async (deliveryPartnerId, payload) => {
  const { bankDetails, paymentMethod = "bank_transfer" } = payload;
  const amount = Math.round(Number(payload?.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount < 1) throw new ValidationError("Invalid amount");

  const wallet = await getDeliveryPartnerWalletEnhanced(deliveryPartnerId);
  if (amount < wallet.deliveryWithdrawalLimit) {
    throw new ValidationError(
      `Minimum withdrawal amount is ₹${wallet.deliveryWithdrawalLimit}`,
    );
  }
  if (amount > wallet.pocketBalance) {
    throw new ValidationError("Insufficient balance for this withdrawal");
  }

  const partner = await FoodDeliveryPartner.findById(deliveryPartnerId).lean();
  if (!partner) throw new ValidationError("Delivery partner not found");

  const withdrawal = await FoodDeliveryWithdrawal.create({
    deliveryPartnerId,
    amount,
    paymentMethod,
    bankDetails: bankDetails || {
      accountNumber: partner.bankAccountNumber,
      ifscCode: partner.bankIfscCode,
      bankName: partner.bankName,
      accountHolderName: partner.bankAccountHolderName,
    },
    upiId: partner.upiId,
    upiQrCode: partner.upiQrCode,
    status: "pending",
  });

  // Race guard: two parallel requests can both pass the check above. Re-check with the new
  // request included; if the balance went negative, this request loses and is rolled back.
  const after = await getDeliveryPartnerWalletEnhanced(deliveryPartnerId);
  if (after.pocketBalanceRaw < 0) {
    await FoodDeliveryWithdrawal.deleteOne({ _id: withdrawal._id, status: "pending" });
    throw new ValidationError("Insufficient balance for this withdrawal");
  }

  return withdrawal;
};

/**
 * Creates a Razorpay order for cash deposit.
 */
export const createDeliveryCashDepositOrder = async (
  deliveryPartnerId,
  amountInr,
) => {
  const amount = Number(amountInr);
  if (!Number.isFinite(amount) || amount < 1) {
    throw new ValidationError("Amount must be at least ₹1");
  }

  const wallet = await getDeliveryPartnerWalletEnhanced(deliveryPartnerId);
  if (amount > wallet.cashInHand) {
    throw new ValidationError("Deposit amount cannot exceed cash in hand");
  }

  const amountPaise = Math.round(amount * 100);
  const receipt = `cash_deposit_${String(deliveryPartnerId).slice(-8)}_${Date.now()}`;

  // Fail closed: a dummy order would let the client "verify" a deposit that was never paid.
  if (!isRazorpayConfigured()) {
    throw new ValidationError("Online payments are currently unavailable");
  }

  const order = await createRazorpayOrder(amountPaise, "INR", receipt);
  return {
    razorpay: {
      key: getRazorpayKeyId(),
      orderId: String(order.id),
      amount: Number(order.amount) || amountPaise,
      currency: order.currency || "INR",
    },
  };
};

/**
 * Verifies a cash deposit payment.
 */
export const verifyDeliveryCashDepositPayment = async (
  deliveryPartnerId,
  payload = {},
) => {
  const orderId = String(payload?.razorpayOrderId || "").trim();
  const paymentId = String(payload?.razorpayPaymentId || "").trim();
  const signature = String(payload?.razorpaySignature || "").trim();

  if (!orderId) throw new ValidationError("razorpayOrderId is required");
  if (!paymentId) throw new ValidationError("razorpayPaymentId is required");
  if (!signature) throw new ValidationError("razorpaySignature is required");

  const existing = await FoodDeliveryCashDeposit.findOne({
    deliveryPartnerId,
    $or: [{ razorpayPaymentId: paymentId }, { razorpayOrderId: orderId }],
  }).lean();

  if (existing?.status === "Completed") {
    return {
      deposit: existing,
      wallet: await getDeliveryPartnerWalletEnhanced(deliveryPartnerId),
    };
  }

  // A gateway payment can only ever be used for one deposit (by anyone).
  const usedByOther = await FoodDeliveryCashDeposit.exists({
    _id: { $ne: existing?._id },
    $or: [{ razorpayPaymentId: paymentId }, { razorpayOrderId: orderId }],
  });
  if (usedByOther) {
    throw new ValidationError("This payment has already been used");
  }

  // Use the amount Razorpay says it captured, never the client-sent amount.
  const amount = await verifyCapturedRazorpayPayment({
    orderId,
    paymentId,
    signature,
  });

  const wallet = await getDeliveryPartnerWalletEnhanced(deliveryPartnerId);
  if (amount > wallet.cashInHand) {
    throw new ValidationError("Deposit amount cannot exceed cash in hand");
  }

  const deposit = existing
    ? await FoodDeliveryCashDeposit.findByIdAndUpdate(
        existing._id,
        {
          $set: {
            amount,
            paymentMethod: "razorpay",
            status: "Completed",
            razorpayOrderId: orderId,
            razorpayPaymentId: paymentId,
          },
        },
        { new: true },
      )
    : await FoodDeliveryCashDeposit.create({
        deliveryPartnerId,
        amount,
        paymentMethod: "razorpay",
        status: "Completed",
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
      });

  return {
    deposit,
    wallet: await getDeliveryPartnerWalletEnhanced(deliveryPartnerId),
  };
};
