import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronUp, ChevronDown, Package, MapPin, Store, Phone } from 'lucide-react';

const rupee = (n) => {
  const v = Number(n || 0);
  return `₹${Number.isInteger(v) ? v : v.toFixed(2)}`;
};

const itemsOf = (order) => {
  const list = order?.items || order?.products || order?.foodItems || order?.cartItems;
  return Array.isArray(list) ? list : [];
};

const addressOf = (order) => {
  const a = order?.deliveryAddress || {};
  const parts = [a.street, a.additionalDetails, a.city, a.state, a.zipCode]
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  return order?.customerAddress || order?.customer_address || (parts.length ? parts.join(', ') : '');
};

const isCod = (order) => {
  const m = String(order?.paymentMethod || order?.payment?.method || '').toLowerCase();
  return m === 'cash' || m === 'cod';
};

const totalOf = (order) =>
  Number(order?.pricing?.total ?? order?.total ?? order?.payment?.amountDue ?? 0) || 0;

const shortId = (order) => order.orderId || order.order_id || String(order._id || '').slice(-6);

/**
 * Always-visible strip at the bottom of the rider's screen while a trip is running, so the rider
 * can see what the order contains and how much to collect until the order is completed.
 * Tap to expand the full details.
 */
export default function ActiveOrderDetailsBar({ orders = [], onCall }) {
  const [open, setOpen] = useState(false);
  const list = orders.filter(Boolean);
  if (!list.length) return null;

  const itemCount = list.reduce(
    (n, o) => n + itemsOf(o).reduce((s, i) => s + (Number(i.quantity) || 1), 0),
    0,
  );
  const collect = list.reduce((n, o) => n + (isCod(o) ? totalOf(o) : 0), 0);
  const label = list.length > 1 ? `${list.length} orders` : `#${shortId(list[0])}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-[92px] inset-x-0 z-[310] h-14 px-4 flex items-center justify-between bg-gray-900 text-white border-t border-white/10"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Package className="w-5 h-5 text-[var(--primary-theme)] shrink-0" />
          <span className="text-xs font-bold truncate">
            {label} · {itemCount} item{itemCount === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {collect > 0 ? (
            <span className="text-xs font-black text-amber-300">Collect {rupee(collect)}</span>
          ) : (
            <span className="text-xs font-bold text-green-400">Paid online</span>
          )}
          <ChevronUp className="w-5 h-5" />
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="order-details-sheet"
            className="fixed inset-0 z-[320] bg-black/50 flex items-end"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              className="w-full max-h-[75vh] overflow-y-auto rounded-t-3xl bg-white p-5 pb-8"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-black text-gray-900">Order details</h3>
                <button onClick={() => setOpen(false)} className="p-1 rounded-full hover:bg-gray-100" aria-label="Close">
                  <ChevronDown className="w-6 h-6 text-gray-500" />
                </button>
              </div>

              {list.map((order, idx) => {
                const items = itemsOf(order);
                const addr = addressOf(order);
                const name = order.userName || order.user?.name || order.customerName || 'Customer';
                const cod = isCod(order);
                return (
                  <div
                    key={String(order._id || order.orderId || idx)}
                    className="mb-4 rounded-2xl border border-gray-100 bg-gray-50 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-black text-gray-900">#{shortId(order)}</p>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${
                          cod ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {cod ? `Collect ${rupee(totalOf(order))}` : 'Paid online'}
                      </span>
                    </div>

                    {order.restaurantName && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                        <Store className="w-4 h-4 shrink-0" /> {order.restaurantName}
                      </p>
                    )}

                    <div className="mt-3 space-y-1.5">
                      {items.length === 0 && <p className="text-xs text-gray-400">No item details</p>}
                      {items.map((it, i) => (
                        <div key={i} className="flex items-start justify-between gap-3 text-sm">
                          <span className="font-semibold text-gray-800">
                            {it.quantity || 1} × {it.name || it.foodName || 'Item'}
                          </span>
                          {it.price != null && (
                            <span className="text-gray-600 shrink-0">
                              {rupee((Number(it.price) || 0) * (Number(it.quantity) || 1))}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-2 text-sm">
                      <span className="font-bold text-gray-700">Bill total</span>
                      <span className="font-black text-gray-900">{rupee(totalOf(order))}</span>
                    </div>

                    <div className="mt-3 flex items-start gap-2">
                      <MapPin className="w-4 h-4 mt-0.5 text-gray-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-gray-900">{name}</p>
                        {addr && <p className="text-xs text-gray-500 leading-relaxed">{addr}</p>}
                      </div>
                      {onCall && (
                        <button
                          type="button"
                          onClick={() => onCall(order)}
                          aria-label="Call customer"
                          className="w-9 h-9 shrink-0 rounded-full bg-green-50 text-green-600 border border-green-100 flex items-center justify-center"
                        >
                          <Phone className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {order.note && (
                      <p className="mt-3 rounded-xl bg-orange-50 p-2.5 text-xs font-semibold text-gray-800">
                        Note: {order.note}
                      </p>
                    )}
                  </div>
                );
              })}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
