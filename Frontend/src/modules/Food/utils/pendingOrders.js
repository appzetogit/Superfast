import { useEffect, useState } from "react";
import { restaurantAPI } from "@food/api";

const PENDING_STATUSES = ["placed", "created", "pending", "placed_pending"];

export const isPendingRestaurantOrder = (order) => {
  const status = String(order?.orderStatus || order?.status || "").toLowerCase();
  return PENDING_STATUSES.includes(status);
};

export const extractOrderRows = (response) =>
  response?.data?.data?.orders || response?.data?.data?.data?.orders || [];

/** Live count of orders waiting for the restaurant to accept/reject (for nav badges). */
export const usePendingOrderCount = (intervalMs = 8000) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await restaurantAPI.getOrders({ page: 1, limit: 50 });
        if (!cancelled) setCount(extractOrderRows(response).filter(isPendingRestaurantOrder).length);
      } catch {
        // ignore; next tick retries
      }
    };
    load();
    const id = setInterval(load, intervalMs);
    window.addEventListener("ordersRefresh", load);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("ordersRefresh", load);
    };
  }, [intervalMs]);

  return count;
};
