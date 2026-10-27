import { Phone, User } from "lucide-react"

const clean = (v) => {
  const s = String(v ?? "").trim()
  return s && s.toUpperCase() !== "N/A" ? s : ""
}

/**
 * "Currently assigned" delivery partner, shown at the top of the reassign dialogs so the admin
 * can see who accepted the order before picking someone else.
 */
export default function AssignedDriverCard({ order }) {
  const partner = order?.dispatch?.deliveryPartnerId
  const partnerObj = partner && typeof partner === "object" ? partner : null
  const name = clean(
    order?.deliveryPartnerName ||
    order?.deliveryBoyName ||
    partnerObj?.name ||
    order?.deliveryPartnerId?.name,
  )
  const phone = clean(
    order?.deliveryPartnerPhone ||
    order?.deliveryBoyNumber ||
    partnerObj?.phone ||
    order?.deliveryPartnerId?.phone,
  )
  if (!name && !phone) return null

  const accepted = String(order?.dispatch?.status || "").toLowerCase() === "accepted"

  return (
    <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
          Currently assigned
        </span>
        {accepted && (
          <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">Accepted</span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-emerald-600">
          <User className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-900">{name || "Delivery partner"}</p>
          {phone && <p className="text-xs font-medium text-slate-600">{phone}</p>}
        </div>
        {phone && (
          <a
            href={`tel:${phone.replace(/[^\d+]/g, "")}`}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-emerald-600 border border-emerald-100"
            aria-label="Call delivery partner"
          >
            <Phone className="h-4 w-4" />
          </a>
        )}
      </div>
    </div>
  )
}
