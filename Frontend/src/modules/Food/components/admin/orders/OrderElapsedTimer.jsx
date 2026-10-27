import { useEffect, useState } from "react"
import { Timer, Bike, CheckCircle2 } from "lucide-react"

const DONE = /deliver|cancel|reject/i
const PREP_DONE = /ready|picked|out_for_delivery|out for delivery|food on the way|deliver|cancel|reject/i

const toMs = (v) => {
  if (!v) return null
  const t = new Date(v).getTime()
  return Number.isNaN(t) ? null : t
}

export const formatElapsed = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n) => String(n).padStart(2, "0")
  return h > 0 ? `${h}h ${pad(m)}m ${pad(s)}s` : `${m}m ${pad(s)}s`
}

const statusOf = (order) => String(order?.rawOrderStatus || order?.orderStatus || order?.status || "")

/** When the restaurant marked the order ready (starts the delivery-phase timer). */
export const getReadyAtMs = (order) => {
  const direct = toMs(order?.readyAt) || toMs(order?.tracking?.readyForPickup?.timestamp)
  if (direct) return direct
  const entry = [...(order?.statusHistory || [])].reverse().find((h) => h?.to === "ready_for_pickup")
  return toMs(entry?.at)
}

const startOf = (order) => toMs(order?.createdAt || order?.created_at || order?.orderDate)

/**
 * mode "total"    - placed -> delivered/cancelled (admin & restaurant)
 * mode "prep"     - placed -> marked ready (restaurant kitchen timer)
 * mode "delivery" - marked ready -> delivered (admin, delivery-partner phase)
 */
function resolveWindow(order, mode) {
  const status = statusOf(order)
  const deliveredMs = toMs(order?.deliveredAt) || toMs(order?.deliveryState?.deliveredAt)
  const closedMs = deliveredMs || toMs(order?.cancelledAt) || toMs(order?.updatedAt)

  if (mode === "delivery") {
    const start = getReadyAtMs(order)
    if (!start || /cancel|reject/i.test(status)) return null
    const final = /deliver/i.test(status)
    return { start, end: final ? deliveredMs || toMs(order?.updatedAt) : null, final }
  }
  if (mode === "prep") {
    const start = startOf(order)
    if (!start) return null
    const final = PREP_DONE.test(status)
    return { start, end: final ? getReadyAtMs(order) || closedMs || toMs(order?.updatedAt) : null, final }
  }
  const start = startOf(order)
  if (!start) return null
  const final = DONE.test(status)
  return { start, end: final ? closedMs : null, final }
}

export default function OrderElapsedTimer({ order, mode = "total", className = "" }) {
  const win = resolveWindow(order, mode)
  const start = win?.start ?? null
  const end = win?.end ?? null
  const frozen = Boolean(win?.final && end !== null)

  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (start === null || frozen) return undefined
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [start, frozen])

  if (!win) return null

  const elapsed = (frozen ? end : now) - start
  const minutes = elapsed / 60000
  const tone = frozen
    ? "bg-slate-100 text-slate-700"
    : minutes >= 20
      ? "bg-red-100 text-red-700"
      : minutes >= 10
        ? "bg-amber-100 text-amber-700"
        : "bg-emerald-100 text-emerald-700"

  const Icon = mode === "delivery" ? Bike : Timer
  const label = mode === "delivery" ? "Delivery" : mode === "prep" ? "Kitchen" : ""
  const title =
    mode === "delivery"
      ? "Time since the order was marked ready (delivery partner)"
      : mode === "prep"
        ? "Time since the order was placed (stops when marked ready)"
        : "Time since the order was placed"

  return (
    <span
      title={frozen ? `${title} - final` : title}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${tone} ${className}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label && <span className="font-semibold opacity-80">{label}</span>}
      {formatElapsed(elapsed)}
    </span>
  )
}

/** Stored completion times (set by the backend when the order is delivered). */
export function CompletedTimings({ order, className = "" }) {
  const t = order?.timings
  if (!t || t.totalMinutes == null) return null
  const fmt = (m) => (m == null ? "-" : `${m} min`)
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800 ${className}`}>
      <span className="inline-flex items-center gap-1 font-bold">
        <CheckCircle2 className="w-4 h-4" /> Completed in {fmt(t.totalMinutes)}
      </span>
      <span>Kitchen: {fmt(t.preparationMinutes)}</span>
      <span>Delivery: {fmt(t.deliveryMinutes)}</span>
    </div>
  )
}
