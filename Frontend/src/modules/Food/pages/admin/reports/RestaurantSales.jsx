import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { adminAPI } from "@food/api"
import { useAdminFilterOptions, zoneLabel } from "@food/hooks/useAdminFilterOptions"

const PERIODS = [
  { id: "today", label: "Today" },
  { id: "week", label: "Last 7 days" },
  { id: "month", label: "Last 30 days" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom" },
]

const inr = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`

function Card({ label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  )
}

function RestaurantOrdersModal({ restaurant, filters, onClose }) {
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    adminAPI
      .getRestaurantSalesDetail(restaurant.restaurantId, { ...filters, page, limit: 15 })
      .then((res) => {
        if (!cancelled) setData(res?.data?.data || null)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [restaurant.restaurantId, filters, page])

  const orders = data?.orders || []
  const pages = data?.pagination?.pages || 1

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{restaurant.restaurantName}</h2>
            <p className="text-xs text-slate-500">
              {restaurant.totalOrders} orders · Sales {inr(restaurant.totalSales)} · Commission {inr(restaurant.totalCommission)} · Earning {inr(restaurant.totalEarning)}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr className="text-left text-[11px] uppercase text-slate-600">
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3 text-right">Sale</th>
                <th className="px-4 py-3 text-right">Commission</th>
                <th className="px-4 py-3 text-right">Earning</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">Loading...</td>
                </tr>
              )}
              {!loading && orders.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">No delivered orders</td>
                </tr>
              )}
              {!loading &&
                orders.map((o) => (
                  <tr key={o._id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-semibold">#{o.orderId}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {new Date(o.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td className="px-4 py-3">{o.customerName || "-"}</td>
                    <td className="px-4 py-3 max-w-xs truncate" title={o.itemsSummary}>{o.itemsSummary}</td>
                    <td className="px-4 py-3 text-right">{inr(o.sale)}</td>
                    <td className="px-4 py-3 text-right text-red-600">{inr(o.commission)}</td>
                    <td className="px-4 py-3 text-right text-green-600 font-semibold">{inr(o.earning)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40">Prev</button>
            <span className="text-sm text-slate-600">{page} / {pages}</span>
            <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40">Next</button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function RestaurantSales() {
  const [period, setPeriod] = useState("month")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [search, setSearch] = useState("")
  const [zoneId, setZoneId] = useState("")
  const { zones } = useAdminFilterOptions({ categories: false, restaurants: false })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  const filters = { period, startDate, endDate, zoneId: zoneId || undefined }

  useEffect(() => {
    if (period === "custom" && (!startDate || !endDate)) return
    let cancelled = false
    setLoading(true)
    const t = setTimeout(() => {
      adminAPI
        .getRestaurantSales({ period, startDate, endDate, search, zoneId: zoneId || undefined })
        .then((res) => {
          if (!cancelled) setData(res?.data?.data || null)
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [period, startDate, endDate, search, zoneId])

  const totals = data?.totals
  const list = data?.restaurants || []

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Restaurant Sales &amp; Commission</h1>
        <p className="text-sm text-slate-500">Sabhi restaurants ki list: delivered orders, sale, admin commission aur restaurant earning</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Zone</label>
          <select
            value={zoneId}
            onChange={(e) => setZoneId(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">All Zones</option>
            {zones.map((z) => (
              <option key={z._id} value={z._id}>{zoneLabel(z)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Date</label>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            {PERIODS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>
        {period === "custom" ? (
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-600 mb-1">From</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm" />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-600 mb-1">To</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm" />
            </div>
          </div>
        ) : (
          <div className="hidden lg:block" />
        )}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Restaurant</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search restaurant..."
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card label="Total Orders" value={totals?.totalOrders ?? 0} color="text-blue-600" />
        <Card label="Total Sales" value={inr(totals?.totalSales)} color="text-slate-900" />
        <Card label="Admin Commission" value={inr(totals?.totalCommission)} color="text-red-600" />
        <Card label="Restaurants Earning" value={inr(totals?.totalEarning)} color="text-green-600" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left text-[11px] uppercase text-slate-600">
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Restaurant</th>
              <th className="px-4 py-3 text-right">Orders</th>
              <th className="px-4 py-3 text-right">Sales</th>
              <th className="px-4 py-3 text-right">Admin Commission</th>
              <th className="px-4 py-3 text-right">Restaurant Earning</th>
              <th className="px-4 py-3 text-center">Orders</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-500">Loading...</td>
              </tr>
            )}
            {!loading && list.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-500">Koi restaurant nahi mila</td>
              </tr>
            )}
            {!loading &&
              list.map((r, i) => (
                <tr key={String(r.restaurantId)} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">{i + 1}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{r.restaurantName}</p>
                    {r.location && <p className="text-xs text-slate-500">{r.location}</p>}
                  </td>
                  <td className="px-4 py-3 text-right">{r.totalOrders}</td>
                  <td className="px-4 py-3 text-right">{inr(r.totalSales)}</td>
                  <td className="px-4 py-3 text-right text-red-600">{inr(r.totalCommission)}</td>
                  <td className="px-4 py-3 text-right text-green-600 font-semibold">{inr(r.totalEarning)}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => setSelected(r)} className="px-3 py-1 text-xs font-medium rounded-full border border-blue-600 text-blue-600 hover:bg-blue-50">
                      View
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {selected && <RestaurantOrdersModal restaurant={selected} filters={filters} onClose={() => setSelected(null)} />}
    </div>
  )
}
