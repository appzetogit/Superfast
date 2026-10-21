import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Star, Clock, Store } from "lucide-react"
import { restaurantAPI } from "@food/api"
import { getRestaurantAvailabilityStatus } from "@food/utils/restaurantAvailability"

const getRestaurantId = (r) => String(r?._id || r?.id || r?.restaurantId || "")

const getImageUrl = (r) => {
  const pick = (v) => (typeof v === "string" ? v : v?.url || "")
  return (
    pick(r?.profileImage) ||
    pick(Array.isArray(r?.coverImages) ? r.coverImages[0] : null) ||
    ""
  )
}

/**
 * Banner shown when a restaurant is closed/offline, with open restaurants from the same zone
 * the user can order from instead.
 */
export default function ClosedRestaurantAlternatives({
  zoneId,
  excludeRestaurantId,
  restaurantName,
  message,
  limit = 6,
  onSelect,
}) {
  const [alternatives, setAlternatives] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const params = { limit: 30, ...(zoneId ? { zoneId } : {}) }
        const response = await restaurantAPI.getRestaurants(params, { noCache: true })
        const list = response?.data?.data?.restaurants || response?.data?.data || []
        const excludeId = String(excludeRestaurantId || "")
        const open = (Array.isArray(list) ? list : []).filter(
          (r) =>
            getRestaurantId(r) &&
            getRestaurantId(r) !== excludeId &&
            getRestaurantAvailabilityStatus(r).isOpen
        )
        if (!cancelled) setAlternatives(open.slice(0, limit))
      } catch {
        if (!cancelled) setAlternatives([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [zoneId, excludeRestaurantId, limit])

  return (
    <div className="rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 p-4">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 shrink-0 rounded-full bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center">
          <Store className="h-4 w-4 text-rose-600" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-rose-700 dark:text-rose-300">
            {restaurantName ? `${restaurantName} is closed right now` : "This restaurant is closed right now"}
          </p>
          <p className="text-xs text-rose-600/90 dark:text-rose-300/80 mt-0.5">
            {message || "It is not accepting orders at the moment. Try one of these open restaurants nearby."}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="mt-3 flex gap-3 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-36 w-36 shrink-0 rounded-xl bg-rose-100/70 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      ) : alternatives.length > 0 ? (
        <>
          <p className="mt-4 mb-2 text-xs font-bold uppercase tracking-wide text-gray-700 dark:text-gray-300">
            Open now in your area
          </p>
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 scrollbar-hide">
            {alternatives.map((r) => {
              const id = getRestaurantId(r)
              const slug = r.slug || id
              const image = getImageUrl(r)
              return (
                <Link
                  key={id}
                  to={`/user/restaurants/${slug}`}
                  onClick={() => onSelect?.(r)}
                  className="w-36 shrink-0 overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1a1a1a] shadow-sm active:scale-[0.98] transition-transform"
                >
                  <div className="h-20 w-full bg-gray-100 dark:bg-gray-800">
                    {image ? (
                      <img src={image} alt={r.name || r.restaurantName} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <Store className="h-6 w-6 text-gray-300" />
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="truncate text-xs font-bold text-gray-900 dark:text-white">
                      {r.name || r.restaurantName}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-[10px] font-medium text-gray-500 dark:text-gray-400">
                      {Number(r.rating) > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Star className="h-3 w-3 fill-[#008d48] text-[#008d48]" />
                          {Number(r.rating).toFixed(1)}
                        </span>
                      )}
                      {r.estimatedDeliveryTime && (
                        <span className="flex items-center gap-0.5 truncate">
                          <Clock className="h-3 w-3" />
                          {r.estimatedDeliveryTime}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </>
      ) : (
        <p className="mt-3 text-xs text-gray-600 dark:text-gray-400">
          No other restaurants are open in your area right now.
        </p>
      )}
    </div>
  )
}
