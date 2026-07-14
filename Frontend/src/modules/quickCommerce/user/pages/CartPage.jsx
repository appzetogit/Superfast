import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Lottie from "lottie-react";
import {
  ArrowLeft,
  Banknote,
  Check,
  ChevronRight,
  CreditCard,
  Minus,
  Plus,
  ShoppingBag,
  Timer,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@core/context/SettingsContext";
import { useToast } from "@shared/components/ui/Toast";
import { useCart } from "../context/CartContext";
import { customerApi } from "../services/customerApi";
import emptyBoxAnimation from "../assets/lottie/Empty box.json";
import {
  getQuickCategoriesPath,
  getQuickCheckoutPath,
} from "../utils/routes";
import { resolveQuickImageUrl } from "../utils/image";

const DEFAULT_QUICK_BILLING_SETTINGS = {
  deliveryFee: 25,
  deliveryFeeRanges: [],
  freeDeliveryThreshold: 0,
  platformFee: 0,
  gstRate: 0,
};

const calculateQuickCartPricing = ({
  subtotal = 0,
  cartItems = [],
  feeSettings = DEFAULT_QUICK_BILLING_SETTINGS,
  categoryFeeMap = {},
}) => {
  const safeSubtotal = Number(subtotal || 0);
  const freeThreshold = Number(feeSettings?.freeDeliveryThreshold || 0);
  const ranges = Array.isArray(feeSettings?.deliveryFeeRanges)
    ? [...feeSettings.deliveryFeeRanges].sort((a, b) => Number(a.min) - Number(b.min))
    : [];

  let deliveryFee = 0;
  if (safeSubtotal <= 0) {
    deliveryFee = 0;
  } else if (Number.isFinite(freeThreshold) && freeThreshold > 0 && safeSubtotal >= freeThreshold) {
    deliveryFee = 0;
  } else if (ranges.length) {
    let matchedFee = null;
    for (let i = 0; i < ranges.length; i += 1) {
      const range = ranges[i] || {};
      const min = Number(range.min);
      const max = Number(range.max);
      const fee = Number(range.fee);
      if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(fee)) continue;
      const isLast = i === ranges.length - 1;
      const inRange = isLast
        ? safeSubtotal >= min && safeSubtotal <= max
        : safeSubtotal >= min && safeSubtotal < max;
      if (inRange) {
        matchedFee = fee;
        break;
      }
    }
    deliveryFee = Number.isFinite(matchedFee)
      ? matchedFee
      : Number(feeSettings?.deliveryFee || 0);
  } else {
    deliveryFee = Number(feeSettings?.deliveryFee || 0);
  }

  const handlingFee = cartItems.reduce((maxFee, item) => {
    const candidateIds = [item?.headerId, item?.categoryId, item?.subcategoryId];
    const itemFee = candidateIds.reduce((currentMax, rawId) => {
      const normalizedId =
        rawId && typeof rawId === "object" && rawId._id
          ? String(rawId._id)
          : String(rawId || "").trim();
      return Math.max(currentMax, Number(categoryFeeMap[normalizedId] || 0));
    }, 0);
    return Math.max(maxFee, itemFee);
  }, 0);
  const platformFee = Number(feeSettings?.platformFee || 0);
  const gstRate = Number(feeSettings?.gstRate || 0);
  const gstAmount =
    Number.isFinite(gstRate) && gstRate > 0
      ? Math.round(safeSubtotal * (gstRate / 100))
      : 0;

  return {
    deliveryFee,
    handlingFee,
    platformFee,
    gstAmount,
    grandTotal: Math.max(
      0,
      safeSubtotal + deliveryFee + handlingFee + platformFee + gstAmount,
    ),
  };
};

const CartPage = () => {
  const navigate = useNavigate();
  const { cart, removeFromCart, updateQuantity, cartTotal, clearCart, loading } = useCart();
  const { showToast } = useToast();
  const { settings } = useSettings();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [quickBillingSettings, setQuickBillingSettings] = useState(
    DEFAULT_QUICK_BILLING_SETTINGS,
  );
  const [categoryFeeMap, setCategoryFeeMap] = useState({});

  useEffect(() => {
    let mounted = true;

    const loadBillingSettings = async () => {
      try {
        const [billingResponse, categoriesResponse] = await Promise.all([
          customerApi.getBillingSettings(),
          customerApi.getCategories({ tree: true }),
        ]);
        const feeSettings =
          billingResponse?.data?.data?.feeSettings ||
          billingResponse?.data?.result ||
          null;
        if (!mounted || !feeSettings) return;
        setQuickBillingSettings((prev) => ({
          ...prev,
          ...feeSettings,
          deliveryFeeRanges: Array.isArray(feeSettings.deliveryFeeRanges)
            ? feeSettings.deliveryFeeRanges
            : prev.deliveryFeeRanges,
        }));

        const results =
          categoriesResponse?.data?.results ||
          categoriesResponse?.data?.result ||
          [];
        const nextFeeMap = {};
        const visit = (items = []) => {
          items.forEach((item) => {
            const id = String(item?._id || item?.id || "").trim();
            if (id) nextFeeMap[id] = Number(item?.handlingFees || 0);
            if (Array.isArray(item?.children) && item.children.length > 0) {
              visit(item.children);
            }
          });
        };
        if (Array.isArray(results)) {
          visit(results);
        }
        if (mounted) {
          setCategoryFeeMap(nextFeeMap);
        }
      } catch (error) {
        console.error("Failed to load quick cart billing settings:", error);
      }
    };

    void loadBillingSettings();
    return () => {
      mounted = false;
    };
  }, []);

  const handleClearAll = async () => {
    setShowClearConfirm(false);
    await clearCart();
    showToast("Cart cleared", "info");
  };

  const categoriesPath = getQuickCategoriesPath();
  const checkoutPath = getQuickCheckoutPath();
  const itemCount = cart.reduce((count, item) => count + Number(item.quantity || 0), 0);
  const { deliveryFee, handlingFee, platformFee, gstAmount, grandTotal } =
    calculateQuickCartPricing({
      subtotal: cartTotal,
      cartItems: cart,
      feeSettings: quickBillingSettings,
      categoryFeeMap,
    });
  const paymentMethods = [
    ...(settings?.onlineEnabled === false
      ? []
      : [
          {
            id: "online",
            label: "Pay Online",
            icon: CreditCard,
            sublabel: "UPI / Cards / NetBanking",
          },
        ]),
    ...(settings?.codEnabled === false
      ? []
      : [
          {
            id: "cash",
            label: "Cash on Delivery",
            icon: Banknote,
            sublabel: "Pay after delivery",
          },
        ]),
  ];
  const [selectedPayment, setSelectedPayment] = useState("cash");

  const handleRemove = (item) => {
    removeFromCart(item.id || item._id);
    showToast(`${item.name} removed from cart`, "info");
  };

  const handleBack = () => {
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
      return;
    }
    navigate(categoriesPath);
  };

  useEffect(() => {
    if (!paymentMethods.length) return;
    const exists = paymentMethods.some((method) => method.id === selectedPayment);
    if (!exists) {
      setSelectedPayment(paymentMethods[0].id);
    }
  }, [paymentMethods, selectedPayment]);

  const selectedPaymentMethod =
    paymentMethods.find((method) => method.id === selectedPayment) || null;

  if (loading && cart.length === 0) {
    return (
      <div className="min-h-screen bg-[#f7f7f7] dark:bg-neutral-950 px-4 py-6">
        <div className="mx-auto flex max-w-md flex-col items-center justify-center rounded-[28px] bg-white dark:bg-neutral-900 px-6 py-16 text-center shadow-sm">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 dark:border-neutral-700 border-t-[#0c831f] dark:border-t-[#0ea5e9]" />
          <h2 className="mt-5 text-xl font-bold text-slate-900 dark:text-white">Loading your cart</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Pulling in your saved items...</p>
        </div>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="min-h-screen bg-[#f7f7f7] dark:bg-neutral-950 px-4 py-6">
        <div className="mx-auto max-w-md">
          <div className="mb-5 flex items-center gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white dark:bg-neutral-900 text-slate-700 dark:text-slate-300 shadow-sm hover:bg-slate-50 dark:hover:bg-neutral-800"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Your Cart</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Add items to get started</p>
            </div>
          </div>

          <div className="rounded-[28px] bg-white dark:bg-neutral-900 px-6 py-10 text-center shadow-sm border border-transparent dark:border-neutral-800">
            <div className="mx-auto mb-6 flex h-44 w-44 items-center justify-center">
              <Lottie animationData={emptyBoxAnimation} loop className="h-40 w-40" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Your cart is empty</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
              Pick a few essentials and they&apos;ll show up here.
            </p>
            <Link to={categoriesPath} className="mt-6 inline-flex w-full">
              <Button className="h-12 w-full rounded-2xl bg-[#0c831f] text-white hover:bg-[#0b721b] dark:bg-emerald-600 dark:hover:bg-emerald-700">
                Start Shopping
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5] dark:bg-neutral-950 pb-[calc(9rem+env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-3xl px-4 py-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white dark:bg-neutral-900 text-slate-700 dark:text-slate-300 shadow-sm hover:bg-slate-50 dark:hover:bg-neutral-800"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Your Cart</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">{itemCount} item{itemCount === 1 ? "" : "s"}</p>
            </div>
          </div>

          <button
            onClick={() => setShowClearConfirm(true)}
            className="text-sm font-semibold text-rose-500 transition-colors hover:text-rose-600"
          >
            Clear all
          </button>
        </div>

        {/* Clear cart confirmation */}
        {showClearConfirm && (
          <div className="fixed inset-0 z-[600] flex items-end sm:items-center justify-center px-4 pb-6 sm:pb-0">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowClearConfirm(false)}
            />
            <div className="relative z-10 w-full max-w-sm rounded-[28px] bg-white dark:bg-neutral-900 p-6 shadow-2xl border border-transparent dark:border-neutral-800">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 dark:bg-rose-900/20 mx-auto">
                <Trash2 size={22} className="text-rose-500 dark:text-rose-400" />
              </div>
              <h3 className="text-center text-lg font-bold text-slate-900 dark:text-white">Clear your cart?</h3>
              <p className="mt-2 text-center text-sm text-slate-500 dark:text-slate-400">
                All {itemCount} item{itemCount === 1 ? "" : "s"} will be removed. This can't be undone.
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 rounded-2xl border-2 border-slate-200 py-3 text-sm font-bold text-slate-700 transition-colors hover:border-slate-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearAll}
                  className="flex-1 rounded-2xl bg-rose-500 py-3 text-sm font-bold text-white transition-colors hover:bg-rose-600"
                >
                  Clear all
                </button>
              </div>
            </div>
          </div>
        )}

        <section className="mb-4 rounded-[24px] bg-[#e9f7ec] dark:bg-emerald-900/20 p-4 shadow-sm border border-transparent dark:border-emerald-800/30">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.24em] text-[#0c831f] dark:text-emerald-400">
                Delivery in 10 minutes
              </p>
              <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                Shipment from your nearby store
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Fast doorstep delivery with live seller-side processing.
              </p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white dark:bg-neutral-800 text-[#0c831f] dark:text-emerald-400 shadow-sm border border-transparent dark:border-neutral-700">
              <Timer size={20} />
            </div>
          </div>
        </section>

        <div className="space-y-3">
          {cart.map((item) => (
            <article
              key={item.id || item._id}
              className="rounded-[24px] bg-white dark:bg-neutral-900 p-4 shadow-sm border border-transparent dark:border-neutral-800"
            >
              <div className="flex gap-4">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-50 dark:bg-neutral-800">
                  <img
                    src={resolveQuickImageUrl(item.mainImage || item.image) || item.mainImage || item.image}
                    alt={item.name}
                    className="h-full w-full object-contain p-2 dark:mix-blend-normal"
                    onError={(e) => {
                      e.currentTarget.src = "";
                    }}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="line-clamp-2 text-base font-semibold text-slate-900 dark:text-white">
                        {item.name}
                      </h2>
                      <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                        {item.weight || item.unit || "1 unit"}
                      </p>
                    </div>

                    <button
                      onClick={() => handleRemove(item)}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-slate-400 transition-colors hover:bg-rose-50 dark:hover:bg-rose-900/30 hover:text-rose-500 dark:hover:text-rose-400"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-slate-900 dark:text-white">
                        {"\u20B9"}
                        {Number(item.price || 0) * Number(item.quantity || 0)}
                      </p>
                      {item.quantity > 1 && (
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {"\u20B9"}
                          {item.price} each
                        </p>
                      )}
                    </div>

                    <div className="inline-flex items-center gap-3 rounded-full bg-slate-100 dark:bg-neutral-800 px-2 py-1">
                      <button
                        onClick={() => updateQuantity(item.id || item._id, -1)}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white dark:bg-neutral-700 text-slate-700 dark:text-slate-300 shadow-sm"
                      >
                        <Minus size={14} strokeWidth={3} />
                      </button>
                      <span className="min-w-[18px] text-center text-sm font-bold text-slate-900 dark:text-white">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => {
                          const stock = Number(item.stock ?? Infinity);
                          if (item.quantity >= stock) {
                            showToast(`Only ${stock} in stock`, "error");
                            return;
                          }
                          updateQuantity(item.id || item._id, 1);
                        }}
                        disabled={item.quantity >= Number(item.stock ?? Infinity)}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white dark:bg-neutral-700 text-slate-700 dark:text-slate-300 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Plus size={14} strokeWidth={3} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        <section className="mt-4 rounded-[24px] bg-white dark:bg-neutral-900 p-5 shadow-sm border border-transparent dark:border-neutral-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                Bill details
              </p>
              <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                Price breakdown
              </h2>
            </div>
            <span className="rounded-full bg-[#f0fdf4] dark:bg-emerald-900/20 px-3 py-1 text-xs font-bold text-[#0c831f] dark:text-emerald-400 border border-transparent dark:border-emerald-800/30">
              {itemCount} item{itemCount === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mt-5 space-y-3 text-sm text-slate-600 dark:text-slate-400">
            <div className="flex items-center justify-between">
              <span>Items total</span>
              <span className="font-semibold text-slate-900 dark:text-white">{"\u20B9"}{cartTotal}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Delivery fee</span>
              <span className="font-semibold text-slate-900 dark:text-white">{"\u20B9"}{deliveryFee}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Handling charge</span>
              <span className="font-semibold text-slate-900 dark:text-white">{"\u20B9"}{handlingFee}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Platform fee</span>
              <span className="font-semibold text-slate-900 dark:text-white">{"\u20B9"}{platformFee}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>GST</span>
              <span className="font-semibold text-slate-900 dark:text-white">{"\u20B9"}{gstAmount}</span>
            </div>
            <div className="border-t border-dashed border-slate-200 dark:border-slate-700 pt-3">
              <div className="flex items-center justify-between text-base font-bold text-slate-900 dark:text-white">
                <span>To pay</span>
                <span>{"\u20B9"}{grandTotal}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-[24px] bg-white dark:bg-neutral-900 p-5 shadow-sm border border-transparent dark:border-neutral-800">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                Payment
              </p>
              <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                Choose how you want to pay
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                We&apos;ll carry this choice into checkout so you don&apos;t have to pick it again.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {paymentMethods.length ? (
              paymentMethods.map((method) => {
                const Icon = method.icon;
                const isSelected = selectedPayment === method.id;
                return (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => setSelectedPayment(method.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition-all ${
                      isSelected
                        ? "border-[#0c831f] dark:border-emerald-600 bg-green-50 dark:bg-emerald-900/10"
                        : "border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-slate-300 dark:hover:border-neutral-700"
                    }`}
                  >
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full ${
                        isSelected ? "bg-green-100 dark:bg-emerald-900/30" : "bg-slate-100 dark:bg-neutral-800"
                      }`}
                    >
                      <Icon
                        size={18}
                        className={isSelected ? "text-[#0c831f] dark:text-emerald-400" : "text-slate-600 dark:text-slate-400"}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-bold ${isSelected ? "text-[#0c831f] dark:text-emerald-400" : "text-slate-800 dark:text-white"}`}>
                        {method.label}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{method.sublabel}</p>
                    </div>
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                        isSelected ? "border-[#0c831f] dark:border-emerald-500 bg-[#0c831f] dark:bg-emerald-500" : "border-slate-300 dark:border-neutral-700"
                      }`}
                    >
                      {isSelected ? <Check size={12} className="text-white" /> : null}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                Payment options are currently unavailable. You can still review the order on checkout.
              </div>
            )}
          </div>
        </section>

        <Link
          to={checkoutPath}
          state={{ selectedPayment }}
          className="block mt-4"
        >
          <section className="rounded-[24px] bg-white dark:bg-neutral-900 p-5 shadow-sm transition-all hover:shadow-md active:scale-[0.99] border border-transparent dark:border-neutral-800">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                  Checkout
                </p>
                <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                  Address, payment and seller confirmation
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Review delivery details on the next screen and place the order to push it into the matched seller dashboard.
                </p>
              </div>
              <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0c831f]/10 dark:bg-emerald-900/20 text-[#0c831f] dark:text-emerald-400">
                <ChevronRight size={18} />
              </div>
            </div>
          </section>
        </Link>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-[520] border-t border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              To pay
            </p>
            <p className="truncate text-2xl font-bold text-slate-900 dark:text-white">
              {"\u20B9"}
              {grandTotal}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {selectedPaymentMethod ? selectedPaymentMethod.label : "Includes delivery charges"}
            </p>
          </div>

          <Link
            to={checkoutPath}
            state={{ selectedPayment }}
            className="block w-full flex-1 sm:min-w-[220px]"
          >
            <Button className="h-12 w-full rounded-2xl bg-[#0c831f] dark:bg-emerald-600 px-4 text-sm text-white whitespace-normal sm:whitespace-nowrap hover:bg-[#0b721b] dark:hover:bg-emerald-700">
              <ShoppingBag size={18} className="mr-2" />
              Proceed to Checkout
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default CartPage;
