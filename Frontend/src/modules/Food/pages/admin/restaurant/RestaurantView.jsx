import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { adminAPI } from "@food/api"
import {
  ArrowLeft,
  Loader2,
  Pencil,
  Trash2,
  Search,
  Star,
  MapPin,
  Phone,
  Mail,
  User,
  Store,
  Wallet,
  Banknote,
  TrendingUp,
  Clock,
  Eye,
  X,
} from "lucide-react"

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "orders", label: "Orders" },
  { id: "foods", label: "Foods" },
  { id: "reviews", label: "Reviews" },
  { id: "transactions", label: "Transactions" },
  { id: "settings", label: "Settings" },
]

const inr = (n) =>
  `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtDateTime = (d) => {
  if (!d) return "-"
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return "-"
  return dt.toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

const imgUrl = (v) => (typeof v === "string" ? v : v?.url || v?.secure_url || "")

// Old imported restaurants only have a bare file name (e.g. "2025-10-27-xxx.png") which the browser
// cannot load, so only treat real URLs as images and fall back to a placeholder otherwise.
const isLoadableUrl = (u) => /^(https?:)?\/\//i.test(u) || u.startsWith("/") || u.startsWith("data:")
const pickRestaurantImage = (r) => {
  const list = [
    r?.profileImage,
    r?.logo,
    r?.restaurantImage,
    ...(Array.isArray(r?.coverImages) ? r.coverImages : []),
    ...(Array.isArray(r?.menuImages) ? r.menuImages : []),
  ]
  return list.map(imgUrl).find((u) => u && isLoadableUrl(u)) || ""
}

function SafeImage({ src, alt = "", className = "", fallbackClassName = "", label = "" }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-slate-100 text-slate-400 ${fallbackClassName || className}`}
      >
        <Store className="w-1/3 h-1/3 min-w-4 min-h-4" />
        {label ? <span className="mt-1 text-[10px] font-medium uppercase tracking-wide">{label}</span> : null}
      </div>
    )
  }
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} loading="lazy" />
}

const ORDER_STATUS_STYLE = {
  delivered: "bg-emerald-50 text-emerald-600",
  cancelled_by_user: "bg-rose-50 text-rose-500",
  cancelled_by_restaurant: "bg-rose-50 text-rose-500",
  cancelled_by_admin: "bg-rose-50 text-rose-500",
}
const orderStatusLabel = (s) => {
  const v = String(s || "")
  if (v.startsWith("cancelled")) return "Canceled"
  return v.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) || "-"
}

function StatCard({ label, value, tone, icon: Icon }) {
  const tones = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    red: "bg-rose-50 text-rose-600 border-rose-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    blue: "bg-sky-50 text-sky-700 border-sky-100",
  }
  return (
    <div className={`rounded-xl border p-5 flex items-center justify-between ${tones[tone]}`}>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm font-medium mt-1 text-slate-600">{label}</p>
      </div>
      <Icon className="w-9 h-9 opacity-60" />
    </div>
  )
}

function Pager({ page, total, limit, onChange }) {
  const pages = Math.max(1, Math.ceil(total / limit))
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-100 text-sm">
      <button
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="px-3 py-1 rounded border border-slate-200 disabled:opacity-40"
      >
        Prev
      </button>
      <span className="text-slate-500">
        Page {page} / {pages}
      </span>
      <button
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
        className="px-3 py-1 rounded border border-slate-200 disabled:opacity-40"
      >
        Next
      </button>
    </div>
  )
}

function Empty({ text }) {
  return <div className="py-14 text-center text-sm text-slate-400">{text}</div>
}

/* ----------------------------- Overview tab ----------------------------- */

function OverviewTab({ restaurant, overview }) {
  const w = overview?.wallet || {}
  const coords = restaurant?.location?.coordinates
  const lat = Array.isArray(coords) ? Number(coords[1]) : Number(restaurant?.location?.latitude)
  const lng = Array.isArray(coords) ? Number(coords[0]) : Number(restaurant?.location?.longitude)
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)
  const address =
    restaurant?.location?.formattedAddress ||
    [restaurant?.addressLine1, restaurant?.addressLine2, restaurant?.area, restaurant?.city, restaurant?.state, restaurant?.pincode]
      .filter(Boolean)
      .join(", ")

  const rows = [
    [User, "Owner", restaurant?.ownerName],
    [Phone, "Phone", restaurant?.ownerPhone || restaurant?.primaryContactNumber],
    [Mail, "Email", restaurant?.ownerEmail || restaurant?.email],
    [MapPin, "Address", address],
    [Clock, "Joined", fmtDateTime(restaurant?.createdAt)],
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Pending withdraw" value={inr(w.pendingWithdraw)} tone="amber" icon={Wallet} />
        <StatCard label="Total withdrawn amount" value={inr(w.totalWithdrawn)} tone="red" icon={Banknote} />
        <StatCard label="Balance" value={inr(w.balance)} tone="green" icon={Wallet} />
        <StatCard label="Total earning" value={inr(w.totalEarnings)} tone="blue" icon={TrendingUp} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
          <Store className="w-4 h-4 text-slate-500" />
          <h3 className="font-semibold text-slate-800">Restaurant Info</h3>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-5">
          <div className="flex gap-4">
            <div className="w-28 h-28 shrink-0 rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
              <SafeImage
                src={pickRestaurantImage(restaurant)}
                alt={restaurant?.restaurantName}
                className="w-full h-full object-cover"
                fallbackClassName="w-full h-full"
                label="No image"
              />
            </div>
            <div className="min-w-0 space-y-2 text-sm">
              <p className="text-lg font-semibold text-slate-900">{restaurant?.restaurantName}</p>
              {Array.isArray(restaurant?.cuisines) && restaurant.cuisines.length > 0 && (
                <p className="text-slate-500">{restaurant.cuisines.join(", ")}</p>
              )}
              <p className="flex items-center gap-1 text-slate-600">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                {Number(restaurant?.rating || 0).toFixed(1)}
                <span className="text-slate-400">({restaurant?.totalRatings || 0} reviews)</span>
              </p>
              <p>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    restaurant?.status === "approved" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {restaurant?.status === "approved" ? "Active" : restaurant?.status || "Inactive"}
                </span>
              </p>
            </div>
          </div>

          {hasCoords ? (
            <div className="rounded-lg overflow-hidden border border-slate-200 h-52">
              <iframe
                title="map"
                className="w-full h-full"
                loading="lazy"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.01}%2C${lat - 0.006}%2C${lng + 0.01}%2C${lat + 0.006}&layer=mapnik&marker=${lat}%2C${lng}`}
              />
            </div>
          ) : (
            <div className="h-52 rounded-lg border border-dashed border-slate-200 flex items-center justify-center text-sm text-slate-400">
              Location not set
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 divide-y divide-slate-100">
          {rows.map(([Icon, label, value]) => (
            <div key={label} className="flex items-start gap-3 px-5 py-3 text-sm">
              <Icon className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
              <span className="w-24 text-slate-500 shrink-0">{label}</span>
              <span className="text-slate-800 break-words">{value || "-"}</span>
            </div>
          ))}
          {(restaurant?.fssaiNumber || restaurant?.gstNumber) && (
            <div className="flex flex-wrap gap-x-10 gap-y-1 px-5 py-3 text-sm text-slate-600">
              {restaurant?.fssaiNumber && <span>FSSAI: {restaurant.fssaiNumber}</span>}
              {restaurant?.gstNumber && <span>GST: {restaurant.gstNumber}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------ Orders tab ------------------------------ */

const ORDER_FILTERS = [
  { id: "all", label: "All Orders", key: "all", color: "text-sky-600" },
  { id: "scheduled", label: "Scheduled Orders", key: "scheduled", color: "text-amber-500" },
  { id: "pending", label: "Pending Orders", key: "pending", color: "text-orange-500" },
  { id: "delivered", label: "Delivered Orders", key: "delivered", color: "text-emerald-600" },
  { id: "canceled", label: "Canceled Orders", key: "canceled", color: "text-rose-500" },
]

function OrderDetailModal({ orderId, onClose }) {
  const [order, setOrder] = useState(null)
  const [error, setError] = useState("")

  useEffect(() => {
    adminAPI
      .getOrderById(orderId)
      .then((res) => {
        const d = res?.data?.data
        setOrder(d?.order || d)
      })
      .catch((e) => setError(e?.response?.data?.message || "Failed to load order"))
  }, [orderId])

  const p = order?.pricing || {}
  const lines = [
    ["Subtotal", p.subtotal],
    ["Delivery fee", p.deliveryFee],
    ["Packaging", p.packagingFee],
    ["Platform fee", p.platformFee],
    ["Tax", p.tax],
    ["Discount", p.discount ? -Math.abs(p.discount) : 0],
  ].filter(([, v]) => Number(v))

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">Order {order?.orderId || ""}</h3>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        {error ? (
          <p className="text-rose-500 text-sm">{error}</p>
        ) : !order ? (
          <div className="py-10 text-center">
            <Loader2 className="w-5 h-5 animate-spin inline text-slate-400" />
          </div>
        ) : (
          <>
            <div className="text-sm text-slate-600 space-y-1">
              <p>
                <span className="text-slate-400">Status: </span>
                {orderStatusLabel(order.orderStatus)}
              </p>
              <p>
                <span className="text-slate-400">Placed: </span>
                {fmtDateTime(order.createdAt)}
              </p>
              <p>
                <span className="text-slate-400">Customer: </span>
                {order.userId?.name || order.customer?.name || "-"} {order.userId?.phone || ""}
              </p>
              <p>
                <span className="text-slate-400">Payment: </span>
                {String(order.payment?.method || order.paymentMethod || "-").toUpperCase()} ·{" "}
                {order.payment?.status || "-"}
              </p>
              {order.dispatch?.deliveryPartnerId?.name && (
                <p>
                  <span className="text-slate-400">Rider: </span>
                  {order.dispatch.deliveryPartnerId.name} {order.dispatch.deliveryPartnerId.phone || ""}
                </p>
              )}
            </div>
            <div className="border-t border-slate-100 pt-3 space-y-2">
              {(order.items || []).map((it, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>
                    {it.quantity} × {it.name}
                  </span>
                  <span>{inr((Number(it.price) || 0) * (Number(it.quantity) || 1))}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 pt-3 space-y-1 text-sm">
              {lines.map(([l, v]) => (
                <div key={l} className="flex justify-between text-slate-600">
                  <span>{l}</span>
                  <span>{inr(v)}</span>
                </div>
              ))}
              <div className="flex justify-between font-semibold text-slate-900 pt-1">
                <span>Total</span>
                <span>{inr(p.total)}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function OrdersTab({ restaurantId, counts }) {
  const [openOrder, setOpenOrder] = useState(null)
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const limit = 20

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    adminAPI
      .getOrders({ restaurantId, status: filter, search: query || undefined, page, limit })
      .then((res) => {
        if (cancelled) return
        const d = res?.data?.data || {}
        setRows(Array.isArray(d.orders) ? d.orders : Array.isArray(d.data) ? d.data : [])
        setTotal(Number(d.total ?? d.pagination?.total ?? 0))
      })
      .catch(() => {
        if (!cancelled) {
          setRows([])
          setTotal(0)
        }
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [restaurantId, filter, query, page])

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-wrap gap-x-8 gap-y-3">
        {ORDER_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => {
              setFilter(f.id)
              setPage(1)
            }}
            className={`flex items-center gap-2 text-sm pb-1 border-b-2 ${
              filter === f.id ? "border-sky-500 text-slate-900" : "border-transparent text-slate-500"
            }`}
          >
            {f.label}
            <span className={`font-bold ${f.color}`}>{counts?.[f.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <form
          className="flex justify-end p-4"
          onSubmit={(e) => {
            e.preventDefault()
            setPage(1)
            setQuery(search.trim())
          }}
        >
          <div className="flex">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ID"
              className="border border-slate-200 rounded-l-lg px-3 py-2 text-sm w-60 outline-none focus:border-sky-400"
            />
            <button className="px-3 bg-slate-100 border border-l-0 border-slate-200 rounded-r-lg text-slate-500">
              <Search className="w-4 h-4" />
            </button>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                {["SI", "Order Id", "Order Date", "Customer Info", "Total Amount", "Order Status", "Action"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <Loader2 className="w-5 h-5 animate-spin inline text-slate-400" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <Empty text="No orders found" />
                  </td>
                </tr>
              ) : (
                rows.map((o, i) => {
                  const paid = String(o?.payment?.status || "").toLowerCase()
                  const isPaid = ["paid", "captured", "completed", "cod_collected"].includes(paid)
                  return (
                    <tr key={o._id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">{(page - 1) * limit + i + 1}</td>
                      <td className="px-4 py-3 font-medium">{o.orderId}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{fmtDateTime(o.createdAt)}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{o.userId?.name || "-"}</p>
                        <p className="text-xs text-slate-500">{o.userId?.phone}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p>{inr(o.pricing?.total)}</p>
                        <p className={`text-xs font-medium ${isPaid ? "text-emerald-600" : "text-rose-500"}`}>
                          {isPaid ? "Paid" : "Unpaid"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-3 py-1 rounded-md text-xs font-medium ${
                            ORDER_STATUS_STYLE[o.orderStatus] || "bg-sky-50 text-sky-600"
                          }`}
                        >
                          {orderStatusLabel(o.orderStatus)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setOpenOrder(o._id)}
                          className="p-2 rounded-lg border border-amber-300 text-amber-600 hover:bg-amber-50"
                          title="View order"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <Pager page={page} total={total} limit={limit} onChange={setPage} />
      </div>
      {openOrder && <OrderDetailModal orderId={openOrder} onClose={() => setOpenOrder(null)} />}
    </div>
  )
}

/* ------------------------------- Foods tab ------------------------------- */

function EditFoodModal({ food, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: food.name || "",
    price: food.basePrice ?? food.price ?? "",
    description: food.description || "",
    foodType: food.foodType || "Non-Veg",
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const save = async () => {
    setSaving(true)
    setError("")
    try {
      await adminAPI.updateFood(food._id, {
        name: form.name,
        price: Number(form.price),
        description: form.description,
        foodType: form.foodType,
      })
      onSaved()
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to save food")
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">Edit food</h3>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <label className="block text-sm">
          <span className="text-slate-600">Name</span>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-sky-400"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-slate-600">Price (₹)</span>
            <input
              type="number"
              min="0"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-sky-400"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Type</span>
            <select
              value={form.foodType}
              onChange={(e) => setForm({ ...form, foodType: e.target.value })}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 bg-white"
            >
              <option>Veg</option>
              <option>Non-Veg</option>
            </select>
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-slate-600">Description</span>
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-sky-400"
          />
        </label>
        {error && <p className="text-sm text-rose-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !form.name.trim() || form.price === ""}
            className="px-4 py-2 text-sm rounded-lg bg-sky-600 text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  )
}

function FoodsTab({ restaurantId, counts, onChanged }) {
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const limit = 25

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    adminAPI
      .getFoods({ restaurantId, search: query || undefined, page, limit })
      .then((res) => {
        if (cancelled) return
        const raw = res?.data?.data || res?.data || {}
        setRows(Array.isArray(raw.foods) ? raw.foods : [])
        setTotal(Number(raw.total ?? 0))
      })
      .catch(() => {
        if (!cancelled) {
          setRows([])
          setTotal(0)
        }
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [restaurantId, query, page, reloadKey])

  const toggle = async (food) => {
    const next = !food.isAvailable
    setRows((r) => r.map((f) => (f._id === food._id ? { ...f, isAvailable: next } : f)))
    try {
      await adminAPI.updateFood(food._id, { isAvailable: next })
      onChanged()
    } catch {
      setRows((r) => r.map((f) => (f._id === food._id ? { ...f, isAvailable: !next } : f)))
      alert("Failed to update food status")
    }
  }

  const remove = async (food) => {
    if (!window.confirm(`Delete "${food.name}"? This cannot be undone.`)) return
    try {
      await adminAPI.deleteFood(food._id)
      setReloadKey((k) => k + 1)
      onChanged()
    } catch (e) {
      alert(e?.response?.data?.message || "Failed to delete food")
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 grid grid-cols-3 text-sm">
        {[
          ["All", counts?.all, "text-sky-600"],
          ["Active Food", counts?.active, "text-emerald-600"],
          ["Inactive Food", counts?.inactive, "text-rose-500"],
        ].map(([label, n, color]) => (
          <div key={label} className="py-4 text-center border-r last:border-r-0 border-slate-100">
            <span className="text-slate-500">{label} </span>
            <span className={`font-bold ${color}`}>{n ?? 0}</span>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <h3 className="font-semibold text-slate-800">
            Foods <span className="ml-1 px-2 py-0.5 rounded-full bg-slate-100 text-xs">{total}</span>
          </h3>
          <form
            className="flex"
            onSubmit={(e) => {
              e.preventDefault()
              setPage(1)
              setQuery(search.trim())
            }}
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name."
              className="border border-slate-200 rounded-l-lg px-3 py-2 text-sm w-60 outline-none focus:border-sky-400"
            />
            <button className="px-3 bg-slate-100 border border-l-0 border-slate-200 rounded-r-lg text-slate-500">
              <Search className="w-4 h-4" />
            </button>
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                {["SI", "Name", "Category", "Price", "Status", "Action"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <Loader2 className="w-5 h-5 animate-spin inline text-slate-400" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <Empty text="No foods found" />
                  </td>
                </tr>
              ) : (
                rows.map((f, i) => (
                  <tr key={f._id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">{(page - 1) * limit + i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-100 shrink-0">
                          <SafeImage
                            src={f.image && isLoadableUrl(f.image) ? f.image : ""}
                            alt={f.name}
                            className="w-full h-full object-cover"
                            fallbackClassName="w-full h-full"
                          />
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{f.name}</p>
                          <p className="text-xs text-slate-400">
                            {f.foodType}
                            {f.approvalStatus && f.approvalStatus !== "approved" ? ` · ${f.approvalStatus}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">{f.categoryName || "-"}</td>
                    <td className="px-4 py-3">{inr(f.price)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggle(f)}
                        role="switch"
                        aria-checked={f.isAvailable}
                        className={`relative w-11 h-6 rounded-full transition-colors ${
                          f.isAvailable ? "bg-sky-500" : "bg-slate-300"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                            f.isAvailable ? "translate-x-5" : ""
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditing(f)}
                          className="p-2 rounded-lg border border-sky-300 text-sky-600 hover:bg-sky-50"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => remove(f)}
                          className="p-2 rounded-lg border border-rose-300 text-rose-500 hover:bg-rose-50"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pager page={page} total={total} limit={limit} onChange={setPage} />
      </div>

      {editing && (
        <EditFoodModal
          food={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            setReloadKey((k) => k + 1)
          }}
        />
      )}
    </div>
  )
}

/* ------------------------------ Reviews tab ------------------------------ */

function ReviewsTab({ restaurantId }) {
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const limit = 20

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    adminAPI
      .getRestaurantReviews({ restaurantId, page, limit })
      .then((res) => {
        if (cancelled) return
        const d = res?.data?.data || {}
        setRows(Array.isArray(d.reviews) ? d.reviews : [])
        setTotal(Number(d.total || 0))
      })
      .catch(() => !cancelled && setRows([]))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [restaurantId, page])

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {["SI", "Order Id", "Customer", "Rating", "Review", "Date"].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-12 text-center">
                  <Loader2 className="w-5 h-5 animate-spin inline text-slate-400" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <Empty text="No reviews yet" />
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.orderId}-${i}`}>
                  <td className="px-4 py-3">{(page - 1) * limit + i + 1}</td>
                  <td className="px-4 py-3 font-medium">{r.orderId}</td>
                  <td className="px-4 py-3">{r.customer}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1">
                      <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                      {r.rating}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-md">{r.review || <span className="text-slate-400">-</span>}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{fmtDateTime(r.submittedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={total} limit={limit} onChange={setPage} />
    </div>
  )
}

/* --------------------------- Transactions tab --------------------------- */

function TransactionsTab({ restaurantId, overview }) {
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const limit = 20
  const w = overview?.wallet || {}

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    adminAPI
      .getWithdrawals({ restaurantId, page, limit })
      .then((res) => {
        if (cancelled) return
        const d = res?.data?.data || {}
        setRows(Array.isArray(d.requests) ? d.requests : [])
        setTotal(Number(d.total || 0))
      })
      .catch(() => !cancelled && setRows([]))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [restaurantId, page])

  const statusStyle = {
    Pending: "bg-amber-50 text-amber-600",
    Approved: "bg-emerald-50 text-emerald-600",
    Rejected: "bg-rose-50 text-rose-500",
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Balance" value={inr(w.balance)} tone="green" icon={Wallet} />
        <StatCard label="Pending withdraw" value={inr(w.pendingWithdraw)} tone="amber" icon={Wallet} />
        <StatCard label="Total withdrawn" value={inr(w.totalWithdrawn)} tone="red" icon={Banknote} />
        <StatCard label="Total earning" value={inr(w.totalEarnings)} tone="blue" icon={TrendingUp} />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 font-semibold text-slate-800">Withdraw requests</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                {["SI", "Requested on", "Amount", "Method", "Status"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center">
                    <Loader2 className="w-5 h-5 animate-spin inline text-slate-400" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <Empty text="No withdraw requests" />
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={r._id || r.id}>
                    <td className="px-4 py-3">{(page - 1) * limit + i + 1}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{fmtDateTime(r.createdAt)}</td>
                    <td className="px-4 py-3 font-medium">{inr(r.amount)}</td>
                    <td className="px-4 py-3 capitalize">{String(r.paymentMethod || "-").replace(/_/g, " ")}</td>
                    <td className="px-4 py-3">
                      <span className={`px-3 py-1 rounded-md text-xs font-medium ${statusStyle[r.status] || "bg-slate-100"}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pager page={page} total={total} limit={limit} onChange={setPage} />
      </div>
    </div>
  )
}

/* ------------------------------ Settings tab ------------------------------ */

function SettingsTab({ restaurant, onStatusChanged }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const active = restaurant?.status === "approved"

  const toggle = async () => {
    setBusy(true)
    try {
      await adminAPI.updateRestaurantStatus(restaurant._id, !active)
      await onStatusChanged()
    } catch (e) {
      alert(e?.response?.data?.message || "Failed to update status")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 max-w-2xl">
      <div className="flex items-center justify-between p-5">
        <div>
          <p className="font-medium text-slate-800">Restaurant status</p>
          <p className="text-sm text-slate-500">
            {active ? "Active — visible to customers." : "Inactive — hidden from customers."}
          </p>
        </div>
        <button
          onClick={toggle}
          disabled={busy}
          role="switch"
          aria-checked={active}
          className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-60 ${
            active ? "bg-sky-500" : "bg-slate-300"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              active ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>
      <div className="flex items-center justify-between p-5">
        <div>
          <p className="font-medium text-slate-800">Restaurant details</p>
          <p className="text-sm text-slate-500">Name, owner, address, location, zone and documents.</p>
        </div>
        <button
          onClick={() => navigate(`/admin/food/restaurants/edit/${restaurant._id}`)}
          className="px-4 py-2 text-sm rounded-lg bg-sky-600 text-white"
        >
          Edit
        </button>
      </div>
    </div>
  )
}

/* --------------------------------- Page --------------------------------- */

export default function RestaurantView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = TABS.some((t) => t.id === searchParams.get("tab")) ? searchParams.get("tab") : "overview"

  const [restaurant, setRestaurant] = useState(null)
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const loadOverview = useCallback(async () => {
    try {
      const res = await adminAPI.getRestaurantOverview(id)
      setOverview(res?.data?.data || null)
    } catch {
      /* counts are optional */
    }
  }, [id])

  const loadRestaurant = useCallback(async () => {
    const res = await adminAPI.getRestaurantById(id)
    const d = res?.data?.data
    setRestaurant(d?.restaurant || d || null)
  }, [id])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError("")
    Promise.all([loadRestaurant(), loadOverview()])
      .catch((e) => !cancelled && setError(e?.response?.data?.message || "Failed to load restaurant"))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [loadRestaurant, loadOverview])

  const setTab = (t) => setSearchParams(t === "overview" ? {} : { tab: t }, { replace: true })

  const content = useMemo(() => {
    if (!restaurant) return null
    switch (tab) {
      case "orders":
        return <OrdersTab restaurantId={id} counts={overview?.orders} />
      case "foods":
        return <FoodsTab restaurantId={id} counts={overview?.foods} onChanged={loadOverview} />
      case "reviews":
        return <ReviewsTab restaurantId={id} />
      case "transactions":
        return <TransactionsTab restaurantId={id} overview={overview} />
      case "settings":
        return <SettingsTab restaurant={restaurant} onStatusChanged={loadRestaurant} />
      default:
        return <OverviewTab restaurant={restaurant} overview={overview} />
    }
  }, [tab, restaurant, overview, id, loadOverview, loadRestaurant])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    )
  }

  if (error || !restaurant) {
    return (
      <div className="p-6">
        <button onClick={() => navigate("/admin/food/restaurants")} className="flex items-center gap-2 text-sm text-slate-600">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <p className="mt-6 text-rose-500">{error || "Restaurant not found"}</p>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/admin/food/restaurants")}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50"
            title="Back to restaurants"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-xl font-bold text-slate-900 uppercase">{restaurant.restaurantName}</h1>
        </div>
        <button
          onClick={() => navigate(`/admin/food/restaurants/edit/${id}`)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium"
        >
          <Pencil className="w-4 h-4" /> Edit Restaurant
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-3 text-sm whitespace-nowrap border-b-2 -mb-px ${
              tab === t.id ? "border-sky-500 text-sky-600 font-medium" : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {content}
    </div>
  )
}
