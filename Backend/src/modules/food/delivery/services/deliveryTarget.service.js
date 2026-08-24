import mongoose from 'mongoose';
import { DeliveryTargetRule } from '../../admin/models/deliveryTargetRule.model.js';
import { FoodOrder } from '../../orders/models/order.model.js';
import { DeliveryBonusTransaction } from '../../admin/models/deliveryBonusTransaction.model.js';
import { addDeliveryPartnerBonus } from '../../admin/services/admin.service.js';
import { notifyOwnerSafely } from '../../../../core/notifications/firebase.service.js';
import { logger } from '../../../../utils/logger.js';

const DEFAULT_TARGET_RULE = {
  title: 'Daily Target Bonus',
  period: 'daily',
  isActive: true,
  description: 'Complete orders today to earn extra bonus rewards!',
  tiers: [
    { ordersCount: 5, bonusAmount: 50, title: 'Tier 1' },
    { ordersCount: 10, bonusAmount: 120, title: 'Tier 2' },
    { ordersCount: 15, bonusAmount: 200, title: 'Tier 3' },
  ],
};

export async function getActiveTargetRule() {
  try {
    const rule = await DeliveryTargetRule.findOne({ isActive: true, period: 'daily' }).lean();
    if (rule && rule.tiers && rule.tiers.length > 0) {
      return rule;
    }
  } catch (err) {
    logger.warn(`getActiveTargetRule DB fetch failed: ${err.message}`);
  }
  return DEFAULT_TARGET_RULE;
}

export async function getDriverTargetProgress(driverId) {
  if (!driverId) {
    return {
      completedOrdersCount: 0,
      activeRule: DEFAULT_TARGET_RULE,
      currentTier: null,
      nextTier: DEFAULT_TARGET_RULE.tiers[0],
      ordersNeededForNext: DEFAULT_TARGET_RULE.tiers[0].ordersCount,
      totalEarnedToday: 0,
      tiersProgress: [],
    };
  }

  const driverObjectId = new mongoose.Types.ObjectId(driverId);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  // 1. Count orders completed by driver today
  const completedOrdersCount = await FoodOrder.countDocuments({
    $or: [
      { "dispatch.deliveryPartnerId": driverObjectId },
      { "dispatchPlan.legs.deliveryPartnerId": driverObjectId },
    ],
    orderStatus: 'delivered',
    updatedAt: { $gte: startOfDay, $lte: endOfDay },
  });

  // 2. Fetch today's claimed target bonus transactions for driver
  const todayBonusTxns = await DeliveryBonusTransaction.find({
    deliveryPartnerId: driverObjectId,
    reference: { $regex: /^Target Bonus:/i },
    createdAt: { $gte: startOfDay, $lte: endOfDay },
  }).lean();

  const claimedTierSet = new Set(
    todayBonusTxns.map((t) => {
      const match = (t.reference || '').match(/(\d+)\s*Orders/i);
      return match ? parseInt(match[1], 10) : null;
    }).filter(Boolean)
  );

  const activeRule = await getActiveTargetRule();
  const sortedTiers = [...(activeRule.tiers || [])].sort((a, b) => a.ordersCount - b.ordersCount);

  let currentTier = null;
  let nextTier = null;
  let totalEarnedToday = 0;

  const tiersProgress = sortedTiers.map((tier) => {
    const isAchieved = completedOrdersCount >= tier.ordersCount;
    const isClaimed = claimedTierSet.has(tier.ordersCount);

    if (isClaimed || isAchieved) {
      currentTier = tier;
      if (isClaimed) {
        totalEarnedToday += Number(tier.bonusAmount || 0);
      }
    }

    return {
      ordersCount: tier.ordersCount,
      bonusAmount: tier.bonusAmount,
      title: tier.title || `${tier.ordersCount} Orders`,
      isAchieved,
      isClaimed,
    };
  });

  nextTier = sortedTiers.find((t) => completedOrdersCount < t.ordersCount) || null;
  const ordersNeededForNext = nextTier ? Math.max(0, nextTier.ordersCount - completedOrdersCount) : 0;

  return {
    completedOrdersCount,
    activeRuleTitle: activeRule.title || 'Daily Target Bonus',
    activeRuleDescription: activeRule.description || '',
    currentTier,
    nextTier,
    ordersNeededForNext,
    totalEarnedToday,
    tiersProgress,
  };
}

export async function checkAndCreditTargetBonus(driverId, orderId = null) {
  if (!driverId) return { credited: false };

  try {
    const driverObjectId = new mongoose.Types.ObjectId(driverId);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // 1. Get driver's completed orders today
    const completedOrdersCount = await FoodOrder.countDocuments({
      $or: [
        { "dispatch.deliveryPartnerId": driverObjectId },
        { "dispatchPlan.legs.deliveryPartnerId": driverObjectId },
      ],
      orderStatus: 'delivered',
      updatedAt: { $gte: startOfDay, $lte: endOfDay },
    });

    // 2. Fetch today's claimed target bonus transactions
    const todayBonusTxns = await DeliveryBonusTransaction.find({
      deliveryPartnerId: driverObjectId,
      reference: { $regex: /^Target Bonus:/i },
      createdAt: { $gte: startOfDay, $lte: endOfDay },
    }).lean();

    const claimedTierSet = new Set(
      todayBonusTxns.map((t) => {
        const match = (t.reference || '').match(/(\d+)\s*Orders/i);
        return match ? parseInt(match[1], 10) : null;
      }).filter(Boolean)
    );

    const activeRule = await getActiveTargetRule();
    const sortedTiers = [...(activeRule.tiers || [])].sort((a, b) => a.ordersCount - b.ordersCount);

    let newlyCreditedCount = 0;

    for (const tier of sortedTiers) {
      if (completedOrdersCount >= tier.ordersCount && !claimedTierSet.has(tier.ordersCount)) {
        // Milestone reached and not credited today! Credit bonus now.
        const reference = `Target Bonus: ${tier.ordersCount} Orders Achieved`;

        await addDeliveryPartnerBonus(
          {
            deliveryPartnerId: String(driverId),
            amount: tier.bonusAmount,
            reference,
            metadata: {
              targetOrders: tier.ordersCount,
              completedCount: completedOrdersCount,
              orderId: orderId ? String(orderId) : null,
            },
          },
          { name: 'System Target Engine', role: 'SYSTEM' }
        );

        newlyCreditedCount++;
        claimedTierSet.add(tier.ordersCount);

        // Send Push Notification to Driver
        try {
          await notifyOwnerSafely(
            { ownerType: 'DELIVERY_PARTNER', ownerId: String(driverId) },
            {
              title: 'Target Milestone Unlocked! 🎉',
              body: `Awesome job! You completed ${tier.ordersCount} orders today and earned ₹${tier.bonusAmount} Target Bonus!`,
              data: {
                type: 'target_milestone_achieved',
                bonusAmount: String(tier.bonusAmount),
                ordersCount: String(tier.ordersCount),
              },
            }
          );
        } catch (pushErr) {
          logger.warn(`Target push notification failed for driver ${driverId}: ${pushErr.message}`);
        }
      }
    }

    return { credited: newlyCreditedCount > 0, newlyCreditedCount, completedOrdersCount };
  } catch (err) {
    logger.error(`checkAndCreditTargetBonus failed for driver ${driverId}: ${err.message}`);
    return { credited: false, error: err.message };
  }
}
