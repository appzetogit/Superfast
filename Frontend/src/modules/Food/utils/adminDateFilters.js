/**
 * Date helpers for admin filters. Dates are sent as YYYY-MM-DD in the admin's local
 * calendar (never via toISOString, which shifts the day for timezones ahead of UTC);
 * the backend treats a date-only value as a whole IST day.
 */

const pad = (n) => String(n).padStart(2, "0")

export const toDateInputValue = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

export const todayInputValue = () => toDateInputValue(new Date())

const daysAgo = (days) => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}

export const DATE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7", label: "Last 7 days" },
  { value: "last30", label: "Last 30 days" },
  { value: "thisMonth", label: "This month" },
  { value: "custom", label: "Custom range" },
]

/** Returns { fromDate, toDate } (YYYY-MM-DD) for a preset value; null for "custom". */
export function presetToRange(preset) {
  const now = new Date()
  switch (preset) {
    case "today":
      return { fromDate: toDateInputValue(now), toDate: toDateInputValue(now) }
    case "yesterday": {
      const y = toDateInputValue(daysAgo(1))
      return { fromDate: y, toDate: y }
    }
    case "last7":
      return { fromDate: toDateInputValue(daysAgo(6)), toDate: toDateInputValue(now) }
    case "last30":
      return { fromDate: toDateInputValue(daysAgo(29)), toDate: toDateInputValue(now) }
    case "thisMonth":
      return {
        fromDate: toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)),
        toDate: toDateInputValue(now),
      }
    default:
      return null
  }
}
