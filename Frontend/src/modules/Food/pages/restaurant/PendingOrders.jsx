import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BellRing, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { restaurantAPI } from "@food/api";
import BottomNavOrders from "@food/components/restaurant/BottomNavOrders";
import { isPendingRestaurantOrder, extractOrderRows } from "@food/utils/pendingOrders";

const POLL_MS = 5000;
const URGENT_AFTER_MS = 2 * 60 * 1000;

const formatWaiting = (createdAt, now) => {
  const ms = Math.max(0, now - new Date(createdAt || now).getTime());
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
};

export default function PendingOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const response = await restaurantAPI.getOrders({ page: 1, limit: 50 });
      const pending = extractOrderRows(response)
        .filter(isPendingRestaurantOrder)
        .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      setOrders(pending);
    } catch {
      // keep the last known list; next poll will retry
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    window.addEventListener("ordersRefresh", load);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      window.removeEventListener("ordersRefresh", load);
    };
  }, [load]);

  const act = async (order, kind) => {
    const id = order._id || order.orderMongoId || order.orderId;
    if (!id || busyId) return;
    setBusyId(id);
    try {
      if (kind === "accept") {
        await restaurantAPI.acceptOrder(id);
        toast.success("Order accepted");
      } else {
        await restaurantAPI.rejectOrder(id, "Rejected by restaurant");
        toast.info("Order rejected");
      }
      window.dispatchEvent(new Event("ordersRefresh"));
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Action failed. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-white px-4 py-3">
        <button onClick={() => navigate(-1)} aria-label="Back" className="rounded-full p-1.5 hover:bg-gray-100">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-gray-900">Pending orders</h1>
          <p className="text-xs text-gray-500">Waiting for your accept / reject</p>
        </div>
        <span className="rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white">{orders.length}</span>
      </div>

      <div className="space-y-3 p-4">
        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        )}

        {!loading && orders.length === 0 && (
          <div className="py-20 text-center text-gray-500">
            <BellRing className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="text-sm font-semibold">No pending orders</p>
            <p className="mt-1 text-xs">New orders will show up here with a ring.</p>
          </div>
        )}

        {orders.map((order) => {
          const id = order._id || order.orderMongoId || order.orderId;
          const waitMs = now - new Date(order.createdAt || now).getTime();
          const urgent = waitMs > URGENT_AFTER_MS;
          const items = Array.isArray(order.items) ? order.items : [];
          const total = Number(order.pricing?.total ?? order.total ?? 0);
          return (
            <div
              key={id}
              className={`rounded-2xl border bg-white p-4 shadow-sm ${urgent ? "border-red-300" : "border-gray-200"}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-900">#{order.orderId || order.order_id || String(id).slice(-6)}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {items.length} item{items.length === 1 ? "" : "s"} · ₹{total.toFixed(2)}
                  </p>
                </div>
                <span
                  className={`flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${
                    urgent ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"
                  }`}
                >
                  <Clock className="h-3 w-3" />
                  Waiting {formatWaiting(order.createdAt, now)}
                </span>
              </div>

              {items.length > 0 && (
                <p className="mt-2 line-clamp-2 text-xs text-gray-600">
                  {items.map((i) => `${i.quantity}x ${i.name}`).join(", ")}
                </p>
              )}

              <div className="mt-3 flex gap-2">
                <button
                  disabled={busyId === id}
                  onClick={() => act(order, "reject")}
                  className="flex-1 rounded-lg border-2 border-red-500 py-2 text-sm font-semibold text-red-600 disabled:opacity-60"
                >
                  Reject
                </button>
                <button
                  disabled={busyId === id}
                  onClick={() => act(order, "accept")}
                  className="flex-1 rounded-lg bg-[#49AB14] py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busyId === id ? "Please wait..." : "Accept"}
                </button>
              </div>
              <button
                onClick={() => navigate(`/food/restaurant/orders/${order._id || order.orderMongoId || order.orderId}`)}
                className="mt-2 w-full text-center text-xs font-semibold text-gray-500"
              >
                View details
              </button>
            </div>
          );
        })}
      </div>
      <BottomNavOrders />
    </div>
  );
}
