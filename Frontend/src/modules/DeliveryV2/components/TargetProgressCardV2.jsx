import React, { useState, useEffect, useCallback } from 'react';
import { Trophy, CheckCircle2, Zap, Award, Sparkles, ChevronRight, X, Flame } from 'lucide-react';
import { deliveryAPI } from '@food/api';

export default function TargetProgressCardV2({ activeOrder = null }) {
  const [loading, setLoading] = useState(true);
  const [targetData, setTargetData] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  const fetchTargetProgress = useCallback(async () => {
    try {
      const res = await deliveryAPI.getTodayTargetProgress();
      if (res?.data?.data?.targetProgress || res?.data?.targetProgress) {
        setTargetData(res.data.data?.targetProgress || res.data.targetProgress);
      }
    } catch (err) {
      console.warn('Failed to fetch target progress:', err?.message || err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTargetProgress();
  }, [fetchTargetProgress, activeOrder?.orderStatus]);

  if (isDismissed) {
    return null;
  }

  if (loading && !targetData) {
    return null;
  }

  if (!targetData || !targetData.tiersProgress || targetData.tiersProgress.length === 0) {
    return null;
  }

  const {
    completedOrdersCount = 0,
    activeRuleTitle = 'Daily Target Bonus',
    currentTier = null,
    nextTier = null,
    ordersNeededForNext = 0,
    totalEarnedToday = 0,
    tiersProgress = [],
  } = targetData;

  const maxOrdersTarget = tiersProgress[tiersProgress.length - 1]?.ordersCount || 15;
  const progressPercent = Math.min(100, Math.round((completedOrdersCount / maxOrdersTarget) * 100));

  return (
    <>
      {/* ─── DYNAMIC LIGHT HEADER PILL BADGE ─── */}
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="bg-white hover:bg-gray-50 text-gray-900 rounded-full px-3 py-1.5 shadow-md border border-emerald-300/80 flex items-center space-x-2 active:scale-95 transition-all shrink-0 cursor-pointer"
      >
        <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
          <Trophy className="w-3.5 h-3.5" />
        </div>
        <div className="flex flex-col items-start text-left leading-tight">
          <span className="text-[11px] font-black text-gray-900">Bonus Target</span>
          <span className="text-[9.5px] font-bold text-gray-500">
            {completedOrdersCount} / {nextTier ? nextTier.ordersCount : maxOrdersTarget} Orders
          </span>
        </div>
        {nextTier && (
          <span className="bg-emerald-500 text-white font-black text-[10.5px] px-2 py-0.5 rounded-full shadow-xs">
            ₹{nextTier.bonusAmount}
          </span>
        )}
        <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
      </button>

      {/* ─── LIGHT TARGET DETAILS MODAL ON CLICK (HIGHEST Z-INDEX & BACKDROP CLICK TO CLOSE) ─── */}
      {isModalOpen && (
        <div
          onClick={() => setIsModalOpen(false)}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white text-gray-900 rounded-3xl p-5 shadow-2xl border border-gray-200 w-full max-w-sm relative animate-in zoom-in-95 my-auto"
          >
            {/* Modal Top Header with Prominent Close (X) Button */}
            <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-gray-100">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-600 shrink-0 shadow-xs">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-black text-sm text-gray-900 tracking-tight">{activeRuleTitle}</h4>
                  <p className="text-[11px] font-semibold text-gray-500 flex items-center gap-1 mt-0.5">
                    <Flame className="w-3.5 h-3.5 text-amber-500" />
                    <span>{completedOrdersCount} orders completed today</span>
                  </p>
                </div>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 active:scale-90 flex items-center justify-center text-gray-600 hover:text-gray-900 transition-all shadow-xs cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Overall Progress Bar */}
            <div className="mb-4">
              <div className="flex justify-between items-center text-xs font-bold text-gray-600 mb-1.5">
                <span>Today's Target Progress</span>
                <span className="text-emerald-600 font-black">{progressPercent}%</span>
              </div>
              <div className="w-full bg-gray-100 h-3.5 rounded-full overflow-hidden p-0.5 border border-gray-200 shadow-inner">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500 shadow-sm"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
            </div>

            {/* Motivational Banner */}
            <div className="mb-4">
              {nextTier ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-start space-x-2.5 text-emerald-900">
                  <Zap className="w-4.5 h-4.5 text-amber-500 shrink-0 mt-0.5 animate-bounce" />
                  <span className="text-xs font-semibold leading-relaxed">
                    Complete <strong className="font-black text-gray-900">{ordersNeededForNext} more</strong> {ordersNeededForNext === 1 ? 'order' : 'orders'} today to unlock <strong className="text-emerald-700 font-black">₹{nextTier.bonusAmount} Bonus</strong>!
                  </span>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-center space-x-2 text-amber-900">
                  <Award className="w-5 h-5 text-amber-600 shrink-0" />
                  <span className="text-xs font-bold">All daily bonus targets achieved! Incredible work today! 🎉</span>
                </div>
              )}
            </div>

            {/* Milestone Cards Grid */}
            <div className="grid grid-cols-3 gap-2.5">
              {tiersProgress.map((tier, idx) => {
                const isDone = tier.isAchieved || tier.isClaimed;
                const isCurrentTarget = nextTier && nextTier.ordersCount === tier.ordersCount;

                return (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-2xl text-center border transition-all ${
                      isDone
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                        : isCurrentTarget
                        ? 'bg-amber-50 border-amber-400 text-amber-900 ring-2 ring-amber-300/60 shadow-sm'
                        : 'bg-gray-50 border-gray-200 text-gray-500'
                    }`}
                  >
                    <div className="flex items-center justify-center space-x-1 mb-0.5">
                      <span className="text-xs font-black">{tier.ordersCount} Orders</span>
                      {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                    </div>
                    <div className={`text-xs font-black ${isDone ? 'text-emerald-700' : isCurrentTarget ? 'text-amber-700' : 'text-gray-700'}`}>
                      ₹{tier.bonusAmount}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
