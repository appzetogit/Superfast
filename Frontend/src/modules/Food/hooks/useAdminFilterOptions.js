import { useEffect, useState } from "react"
import { adminAPI } from "@food/api"

const asList = (res, ...keys) => {
  const data = res?.data?.data ?? res?.data ?? {}
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key]
  }
  return Array.isArray(data) ? data : []
}

/** Zones, categories and restaurants for the admin filter dropdowns (loaded once). */
export function useAdminFilterOptions({ zones = true, categories = true, restaurants = true } = {}) {
  const [options, setOptions] = useState({ zones: [], categories: [], restaurants: [] })

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const [zoneRes, categoryRes, restaurantRes] = await Promise.all([
        zones ? adminAPI.getZones({ limit: 1000 }).catch(() => null) : null,
        categories ? adminAPI.getCategories({ limit: 1000 }).catch(() => null) : null,
        restaurants ? (adminAPI.getApprovedRestaurants || adminAPI.getRestaurants)({ limit: 1000 }).catch(() => null) : null,
      ])
      if (cancelled) return

      // Restaurant-owned categories often repeat a global one by name; show each name once.
      const seen = new Set()
      const uniqueCategories = asList(categoryRes, "categories", "docs", "items").filter((category) => {
        const key = String(category?.name || "").trim().toLowerCase()
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })

      setOptions({
        zones: asList(zoneRes, "zones"),
        categories: uniqueCategories,
        restaurants: asList(restaurantRes, "restaurants", "docs"),
      })
    }

    load()
    return () => {
      cancelled = true
    }
  }, [zones, categories, restaurants])

  return options
}

export const zoneLabel = (zone) => zone?.name || zone?.zoneName || zone?.serviceLocation || String(zone?._id || "")
export const restaurantLabel = (restaurant) => restaurant?.restaurantName || restaurant?.name || String(restaurant?._id || "")
