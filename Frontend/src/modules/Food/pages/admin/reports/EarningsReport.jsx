import { useEffect, useMemo, useState } from "react"
import { BarChart3, ChevronDown, Download, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { adminAPI } from "@food/api"
import { exportReportsToCSV } from "@food/components/admin/reports/reportsExportUtils"
import { useAdminFilterOptions, zoneLabel, restaurantLabel } from "@food/hooks/useAdminFilterOptions"
import { DATE_PRESETS, presetToRange, todayInputValue } from "@food/utils/adminDateFilters"

const formatMoney = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const formatDay = (value) => {
  if (!value) return ""
  const [y, m, d] = String(value).split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", weekday: "short" })
}

const idOf = (value) => String(value?._id || value?.id || value || "")

const TABS = [
  { key: "days", label: "Day-wise" },
  { key: "zones", label: "Zone-wise" },
  { key: "restaurants", label: "Restaurant-wise" },
  { key: "categories", label: "Category-wise" },
]

const EMPTY_REPORT = { summary: {}, days: [], restaurants: [], zones: [], categories: [] }

function FilterSelect({ label, value, onChange, children }) {
  return (
    <label className="flex-1 min-w-[150px]">
      <span className="block text-[11px] font-semibold text-slate-500 mb-1">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2.5 py-1.5 pr-6 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs appearance-none cursor-pointer"
        >
          {children}
        </select>
        <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
      </div>
    </label>
  )
}

function SummaryCard({ label, value, tone = "text-slate-900" }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-3">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className={`text-lg font-bold mt-1 ${tone}`}>{value}</p>
    </div>
  )
}

export default function EarningsReport() {
  const { zones, categories, restaurants } = useAdminFilterOptions()
  const initialRange = presetToRange("last7")
  const [filters, setFilters] = useState({
    zoneId: "",
    categoryId: "",
    restaurantId: "",
    preset: "last7",
    fromDate: initialRange.fromDate,
    toDate: initialRange.toDate,
  })
  const [report, setReport] = useState(EMPTY_REPORT)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState("days")

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }))

  const handlePreset = (preset) => {
    const range = presetToRange(preset)
    setFilters((prev) => ({ ...prev, preset, ...(range || {}) }))
  }

  const handleZone = (zoneId) => {
    setFilters((prev) => {
      // Drop a restaurant selection that is not in the newly chosen zone.
      const stillValid = !prev.restaurantId || !zoneId ||
        restaurants.some((r) => idOf(r) === prev.restaurantId && idOf(r.zoneId) === zoneId)
      return { ...prev, zoneId, restaurantId: stillValid ? prev.restaurantId : "" }
    })
  }

  const restaurantOptions = useMemo(
    () => (filters.zoneId ? restaurants.filter((r) => idOf(r.zoneId) === filters.zoneId) : restaurants),
    [restaurants, filters.zoneId],
  )

  const invalidRange = Boolean(filters.fromDate && filters.toDate && filters.fromDate > filters.toDate)

  useEffect(() => {
    if (invalidRange) return undefined
    let cancelled = false
    setLoading(true)

    adminAPI
      .getEarningsReport({
        zoneId: filters.zoneId || undefined,
        categoryId: filters.categoryId || undefined,
        restaurantId: filters.restaurantId || undefined,
        fromDate: filters.fromDate || undefined,
        toDate: filters.toDate || undefined,
      })
      .then((res) => {
        if (cancelled) return
        setReport({ ...EMPTY_REPORT, ...(res?.data?.data || {}) })
      })
      .catch((error) => {
        if (cancelled) return
        setReport(EMPTY_REPORT)
        toast.error(error?.response?.data?.message || "Failed to load earnings report")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [filters.zoneId, filters.categoryId, filters.restaurantId, filters.fromDate, filters.toDate, invalidRange])

  const { summary } = report
  const maxDayGross = useMemo(() => Math.max(1, ...report.days.map((d) => d.grossSales)), [report.days])

  const handleReset = () => {
    const range = presetToRange("last7")
    setFilters({ zoneId: "", categoryId: "", restaurantId: "", preset: "last7", ...range })
  }

  const handleExport = () => {
    const money = (key, label) => ({ key, label })
    const exportMap = {
      days: {
        rows: report.days,
        headers: [
          { key: "date", label: "Date" }, { key: "totalOrders", label: "Orders" },
          { key: "deliveredOrders", label: "Delivered" }, { key: "cancelledOrders", label: "Cancelled" },
          money("grossSales", "Gross Sales"), money("foodSales", "Food Sales"), money("tax", "Tax"),
          money("discount", "Discount"), money("deliveryFee", "Delivery Fee"), money("platformFee", "Platform Fee"),
          money("restaurantCommission", "Commission"), money("adminEarning", "Admin Earning"),
          money("restaurantEarning", "Restaurant Earning"), money("deliverymanEarning", "Deliveryman Earning"),
        ],
      },
      zones: {
        rows: report.zones,
        headers: [
          { key: "zoneName", label: "Zone" }, { key: "orders", label: "Delivered Orders" },
          money("grossSales", "Gross Sales"), money("adminEarning", "Admin Earning"),
          money("restaurantEarning", "Restaurant Earning"), money("deliverymanEarning", "Deliveryman Earning"),
        ],
      },
      restaurants: {
        rows: report.restaurants,
        headers: [
          { key: "restaurantName", label: "Restaurant" }, { key: "orders", label: "Delivered Orders" },
          money("grossSales", "Gross Sales"), money("adminEarning", "Admin Earning"),
          money("restaurantEarning", "Restaurant Earning"), money("deliverymanEarning", "Deliveryman Earning"),
        ],
      },
      categories: {
        rows: report.categories,
        headers: [
          { key: "name", label: "Category" }, { key: "orders", label: "Orders" },
          { key: "units", label: "Units Sold" }, money("sales", "Sales"),
        ],
      },
    }[tab]

    if (!exportMap.rows.length) {
      toast.error("No data to export")
      return
    }
    exportReportsToCSV(exportMap.rows, exportMap.headers, `earnings_${tab}_${filters.fromDate || "all"}_${filters.toDate || "all"}`)
  }

  const th = "px-3 py-2 text-left text-[11px] font-semibold text-slate-600 uppercase tracking-wide whitespace-nowrap"
  const td = "px-3 py-2 text-xs text-slate-700 whitespace-nowrap"
  const tdNum = `${td} text-right tabular-nums`

  const renderEmpty = (colSpan) => (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10 text-center text-xs text-slate-500">
        No delivered orders match these filters.
      </td>
    </tr>
  )

  return (
    <div className="p-2 lg:p-3 bg-slate-50 min-h-screen">
      <div className="w-full mx-auto space-y-3">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <BarChart3 className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Earnings Report</h1>
              <p className="text-[11px] text-slate-500">Delivered orders only. Days are shown in IST.</p>
            </div>
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <FilterSelect label="Zone" value={filters.zoneId} onChange={handleZone}>
              <option value="">All Zones</option>
              {zones.map((zone) => (
                <option key={idOf(zone)} value={idOf(zone)}>{zoneLabel(zone)}</option>
              ))}
            </FilterSelect>
            <FilterSelect label="Category" value={filters.categoryId} onChange={(v) => setFilter("categoryId", v)}>
              <option value="">All Categories</option>
              {categories.map((category) => (
                <option key={idOf(category)} value={idOf(category)}>{category.name}</option>
              ))}
            </FilterSelect>
            <FilterSelect label="Restaurant" value={filters.restaurantId} onChange={(v) => setFilter("restaurantId", v)}>
              <option value="">All Restaurants</option>
              {restaurantOptions.map((restaurant) => (
                <option key={idOf(restaurant)} value={idOf(restaurant)}>{restaurantLabel(restaurant)}</option>
              ))}
            </FilterSelect>
            <FilterSelect label="Period" value={filters.preset} onChange={handlePreset}>
              {DATE_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>{preset.label}</option>
              ))}
            </FilterSelect>
            <label className="min-w-[130px]">
              <span className="block text-[11px] font-semibold text-slate-500 mb-1">From</span>
              <input
                type="date"
                value={filters.fromDate}
                max={filters.toDate || todayInputValue()}
                onChange={(e) => setFilters((prev) => ({ ...prev, fromDate: e.target.value, preset: "custom" }))}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            <label className="min-w-[130px]">
              <span className="block text-[11px] font-semibold text-slate-500 mb-1">To</span>
              <input
                type="date"
                value={filters.toDate}
                min={filters.fromDate || undefined}
                max={todayInputValue()}
                onChange={(e) => setFilters((prev) => ({ ...prev, toDate: e.target.value, preset: "custom" }))}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              Reset
            </button>
          </div>
          {invalidRange && <p className="text-xs text-red-600 mt-2">"From" date cannot be after "To" date.</p>}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2">
          <SummaryCard label="Gross sales" value={formatMoney(summary.grossSales)} />
          <SummaryCard label="Admin earning" value={formatMoney(summary.adminEarning)} tone="text-emerald-600" />
          <SummaryCard label="Restaurant earning" value={formatMoney(summary.restaurantEarning)} tone="text-blue-600" />
          <SummaryCard label="Deliveryman earning" value={formatMoney(summary.deliverymanEarning)} tone="text-orange-600" />
          <SummaryCard label="Delivered orders" value={summary.deliveredOrders || 0} />
          <SummaryCard label="Cancelled orders" value={summary.cancelledOrders || 0} tone="text-red-600" />
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200">
          <div className="flex gap-1 border-b border-slate-200 px-3 pt-2 overflow-x-auto">
            {TABS.map((item) => (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={`px-3 py-2 text-xs font-semibold border-b-2 whitespace-nowrap ${
                  tab === item.key ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="py-16 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              {tab === "days" && (
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={th}>Date</th>
                      <th className={`${th} text-right`}>Orders</th>
                      <th className={`${th} text-right`}>Delivered</th>
                      <th className={`${th} text-right`}>Cancelled</th>
                      <th className={`${th} text-right`}>Gross sales</th>
                      <th className={th} style={{ minWidth: 120 }}>Trend</th>
                      <th className={`${th} text-right`}>Admin</th>
                      <th className={`${th} text-right`}>Restaurant</th>
                      <th className={`${th} text-right`}>Deliveryman</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.days.length === 0 ? renderEmpty(9) : report.days.map((day) => (
                      <tr key={day.date} className="hover:bg-slate-50">
                        <td className={td}>{formatDay(day.date)}</td>
                        <td className={tdNum}>{day.totalOrders}</td>
                        <td className={tdNum}>{day.deliveredOrders}</td>
                        <td className={tdNum}>{day.cancelledOrders}</td>
                        <td className={`${tdNum} font-semibold`}>{formatMoney(day.grossSales)}</td>
                        <td className={td}>
                          <div className="h-2 rounded bg-slate-100 w-28">
                            <div className="h-2 rounded bg-blue-500" style={{ width: `${(day.grossSales / maxDayGross) * 100}%` }} />
                          </div>
                        </td>
                        <td className={tdNum}>{formatMoney(day.adminEarning)}</td>
                        <td className={tdNum}>{formatMoney(day.restaurantEarning)}</td>
                        <td className={tdNum}>{formatMoney(day.deliverymanEarning)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {report.days.length > 0 && (
                    <tfoot className="bg-slate-50 font-semibold">
                      <tr>
                        <td className={td}>Total</td>
                        <td className={tdNum}>{summary.totalOrders}</td>
                        <td className={tdNum}>{summary.deliveredOrders}</td>
                        <td className={tdNum}>{summary.cancelledOrders}</td>
                        <td className={tdNum}>{formatMoney(summary.grossSales)}</td>
                        <td className={td} />
                        <td className={tdNum}>{formatMoney(summary.adminEarning)}</td>
                        <td className={tdNum}>{formatMoney(summary.restaurantEarning)}</td>
                        <td className={tdNum}>{formatMoney(summary.deliverymanEarning)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}

              {(tab === "zones" || tab === "restaurants") && (
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={th}>{tab === "zones" ? "Zone" : "Restaurant"}</th>
                      <th className={`${th} text-right`}>Delivered orders</th>
                      <th className={`${th} text-right`}>Gross sales</th>
                      <th className={`${th} text-right`}>Admin</th>
                      <th className={`${th} text-right`}>Restaurant</th>
                      <th className={`${th} text-right`}>Deliveryman</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report[tab].length === 0 ? renderEmpty(6) : report[tab].map((row) => (
                      <tr key={idOf(tab === "zones" ? row.zoneId : row.restaurantId) || row.zoneName} className="hover:bg-slate-50">
                        <td className={td}>{tab === "zones" ? row.zoneName : row.restaurantName}</td>
                        <td className={tdNum}>{row.orders}</td>
                        <td className={`${tdNum} font-semibold`}>{formatMoney(row.grossSales)}</td>
                        <td className={tdNum}>{formatMoney(row.adminEarning)}</td>
                        <td className={tdNum}>{formatMoney(row.restaurantEarning)}</td>
                        <td className={tdNum}>{formatMoney(row.deliverymanEarning)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {tab === "categories" && (
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={th}>Category</th>
                      <th className={`${th} text-right`}>Orders</th>
                      <th className={`${th} text-right`}>Units sold</th>
                      <th className={`${th} text-right`}>Item sales</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.categories.length === 0 ? renderEmpty(4) : report.categories.map((row) => (
                      <tr key={row.name} className="hover:bg-slate-50">
                        <td className={td}>{row.name}</td>
                        <td className={tdNum}>{row.orders}</td>
                        <td className={tdNum}>{row.units}</td>
                        <td className={`${tdNum} font-semibold`}>{formatMoney(row.sales)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
