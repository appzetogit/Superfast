import { useMemo } from "react"
import { ChevronDown } from "lucide-react"
import { zoneLabel, restaurantLabel } from "@food/hooks/useAdminFilterOptions"
import { DATE_PRESETS, presetToRange, todayInputValue } from "@food/utils/adminDateFilters"

/**
 * Shared zone / restaurant / category / period filters for admin report pages.
 * Every value is a plain string; "" means "all". Pages keep the filters in state and
 * turn them into API params with buildReportParams().
 */

export const EMPTY_REPORT_FILTERS = {
  zone: "",
  restaurant: "",
  category: "",
  time: "",
  fromDate: "",
  toDate: "",
}

const idOf = (value) => String(value?._id || value?.id || value || "")

export function buildReportParams(filters) {
  const range = filters.time === "custom"
    ? { fromDate: filters.fromDate, toDate: filters.toDate }
    : presetToRange(filters.time) || {}

  return {
    zoneId: filters.zone || undefined,
    restaurantId: filters.restaurant || undefined,
    categoryId: filters.category || undefined,
    fromDate: range.fromDate || undefined,
    toDate: range.toDate || undefined,
  }
}

export function hasInvalidDateRange(filters) {
  return filters.time === "custom" && Boolean(filters.fromDate && filters.toDate && filters.fromDate > filters.toDate)
}

export function countActiveReportFilters(filters) {
  return ["zone", "restaurant", "category", "time"].filter((key) => Boolean(filters[key])).length
}

const selectClass =
  "w-full px-2.5 py-1.5 pr-5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs appearance-none cursor-pointer"
const dateClass =
  "w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"

export function FilterSelect({ value, onChange, children }) {
  return (
    <div className="relative flex-1 min-w-0">
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        {children}
      </select>
      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
    </div>
  )
}

export default function ReportFilterFields({
  filters,
  setFilters,
  zones = [],
  restaurants = [],
  categories = [],
  showRestaurant = true,
  showCategory = true,
  showZone = true,
}) {
  const restaurantOptions = useMemo(
    () => (filters.zone ? restaurants.filter((r) => idOf(r.zoneId) === filters.zone) : restaurants),
    [restaurants, filters.zone],
  )

  const handleZone = (zone) => {
    setFilters((prev) => {
      // Drop a restaurant that does not belong to the newly selected zone.
      const keepRestaurant = !prev.restaurant || !zone ||
        restaurants.some((r) => idOf(r) === prev.restaurant && idOf(r.zoneId) === zone)
      return { ...prev, zone, restaurant: keepRestaurant ? prev.restaurant : "" }
    })
  }

  const isCustom = filters.time === "custom"
  const today = todayInputValue()

  return (
    <>
      {showZone && (
        <FilterSelect value={filters.zone} onChange={handleZone}>
          <option value="">All Zones</option>
          {zones.map((zone) => (
            <option key={idOf(zone)} value={idOf(zone)}>{zoneLabel(zone)}</option>
          ))}
        </FilterSelect>
      )}

      {showRestaurant && (
        <FilterSelect value={filters.restaurant} onChange={(restaurant) => setFilters((prev) => ({ ...prev, restaurant }))}>
          <option value="">All restaurants</option>
          {restaurantOptions.map((restaurant) => (
            <option key={idOf(restaurant)} value={idOf(restaurant)}>{restaurantLabel(restaurant)}</option>
          ))}
        </FilterSelect>
      )}

      {showCategory && (
        <FilterSelect value={filters.category} onChange={(category) => setFilters((prev) => ({ ...prev, category }))}>
          <option value="">All Categories</option>
          {categories.map((category) => (
            <option key={idOf(category)} value={idOf(category)}>{category.name}</option>
          ))}
        </FilterSelect>
      )}

      <FilterSelect
        value={filters.time}
        onChange={(time) => setFilters((prev) => ({ ...prev, time, ...(time === "custom" ? {} : { fromDate: "", toDate: "" }) }))}
      >
        <option value="">All Time</option>
        {DATE_PRESETS.map((preset) => (
          <option key={preset.value} value={preset.value}>{preset.label}</option>
        ))}
      </FilterSelect>

      {isCustom && (
        <>
          <div className="flex-1 min-w-0">
            <input
              type="date"
              aria-label="From date"
              value={filters.fromDate}
              max={filters.toDate || today}
              onChange={(e) => setFilters((prev) => ({ ...prev, fromDate: e.target.value }))}
              className={dateClass}
            />
          </div>
          <div className="flex-1 min-w-0">
            <input
              type="date"
              aria-label="To date"
              value={filters.toDate}
              min={filters.fromDate || undefined}
              max={today}
              onChange={(e) => setFilters((prev) => ({ ...prev, toDate: e.target.value }))}
              className={dateClass}
            />
          </div>
        </>
      )}
    </>
  )
}
