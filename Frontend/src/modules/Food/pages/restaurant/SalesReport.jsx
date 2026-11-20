import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, ShoppingBag, IndianRupee, Percent, Wallet } from "lucide-react"
import { restaurantAPI } from "@food/api"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"

const PERIODS = [
  { id: "today", label: "Today" },
  { id: "week", label: "7 Days" },
  { id: "month", label: "30 Days" },
  { id: "all", label: "All" },
  { id: "custom", label: "Custom" },
]

const inr = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`

function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${tone}`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-900">{value}</p>
    </div>
  )
}

export default function SalesReport() {
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const [period, setPeriod] = useState("month")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    if (period === "custom" && (!startDate || !endDate)) return
    let cancelled = false
    setLoading(true)
    setError("")
    restaurantAPI
      .getSalesReport({ period, startDate, endDate, page, limit: 20 })
      .then((res) => {
        if (!cancelled) setData(res?.data?.data || null)
      })
      .catch((e) => {
        if (!cancelled && e?.response?.status !== 401) setError("Data load nahi ho paya")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [period, startDate, endDate, page])

  const s = data?.summary
  const orders = data?.orders || []
  const pages = data?.pagination?.pages || 1
  const pending = loading && !s

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <div className="sticky top-0 z-20 bg-white px-4 py-3 flex items-center gap-3 border-b border-gray-200">
        <button onClick={goBack} className="p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-semibold">Sales &amp; Earnings</h1>
      </div>

      <div className="px-4 pt-4 space-y-4">
        <div className="flex gap-2 overflow-x-auto">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setPeriod(p.id)
                setPage(1)
              }}
              className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap border ${
                period === p.id ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-300"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {period === "custom" && (
          <div className="flex gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value)
                setPage(1)
              }}
              className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value)
                setPage(1)
              }}
              className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
            />
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={ShoppingBag} label="Total Orders" value={pending ? "…" : s?.totalOrders ?? 0} tone="bg-blue-50 text-blue-600" />
          <StatCard icon={IndianRupee} label="Total Sales" value={pending ? "…" : inr(s?.totalSales)} tone="bg-green-50 text-green-600" />
          <StatCard icon={Percent} label="Admin Commission" value={pending ? "…" : inr(s?.totalCommission)} tone="bg-red-50 text-red-600" />
          <StatCard icon={Wallet} label="Your Earning" value={pending ? "…" : inr(s?.totalEarning)} tone="bg-orange-50 text-orange-600" />
        </div>
        {s?.cancelledOrders > 0 && (
          <p className="text-xs text-gray-500">Cancelled orders (is period mein): {s.cancelledOrders}</p>
        )}

        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-800">Delivered Orders</h2>
          {!loading && orders.length === 0 && (
            <p className="text-sm text-gray-500 py-6 text-center">Is period mein koi delivered order nahi hai</p>
          )}
          {orders.map((o) => (
            <div key={o._id} className="bg-white rounded-xl border border-gray-200 p-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-semibold">#{o.orderId}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(o.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
                <button
                  onClick={() => navigate(`/restaurant/orders/${o.orderId}`)}
                  className="text-xs font-medium text-[#ff8100] border border-[#ff8100] rounded-full px-3 py-1"
                >
                  View
                </button>
              </div>
              <p className="text-xs text-gray-600 mt-1 line-clamp-2">{o.itemsSummary}</p>
              <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                <div>
                  <p className="text-[11px] text-gray-500">Sale</p>
                  <p className="text-sm font-semibold">{inr(o.sale)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-500">Commission</p>
                  <p className="text-sm font-semibold text-red-600">-{inr(o.commission)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-500">Earning</p>
                  <p className="text-sm font-semibold text-green-600">{inr(o.earning)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 text-sm border rounded-lg bg-white disabled:opacity-40">
              Prev
            </button>
            <span className="text-sm text-gray-600">
              {page} / {pages}
            </span>
            <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 text-sm border rounded-lg bg-white disabled:opacity-40">
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
