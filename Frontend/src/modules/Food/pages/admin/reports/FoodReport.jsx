import { useState } from "react"
import { UtensilsCrossed } from "lucide-react"
import { adminAPI } from "@food/api"
import { useAdminFilterOptions } from "@food/hooks/useAdminFilterOptions"
import ReportFilterFields, {
  EMPTY_REPORT_FILTERS,
  FilterSelect,
  buildReportParams,
  countActiveReportFilters,
  hasInvalidDateRange,
} from "@food/components/admin/reports/ReportFilterFields"
import DataReportPage, {
  SummaryCard,
  formatReportMoney,
  useReportFetch,
} from "@food/components/admin/reports/DataReportPage"

const columns = [
  { key: "sl", label: "SI" },
  { key: "name", label: "Name" },
  { key: "restaurant", label: "Restaurant" },
  { key: "category", label: "Category" },
  { key: "foodType", label: "Type" },
  { key: "orderCount", label: "Order Count", align: "right" },
  { key: "units", label: "Units Sold", align: "right" },
  { key: "price", label: "Price", align: "right", render: (row) => formatReportMoney(row.price) },
  { key: "totalAmountSold", label: "Total Amount Sold", align: "right", render: (row) => formatReportMoney(row.totalAmountSold) },
  { key: "totalDiscountGiven", label: "Total Discount Given", align: "right", render: (row) => formatReportMoney(row.totalDiscountGiven) },
  { key: "averageSaleValue", label: "Average Sale Value", align: "right", render: (row) => formatReportMoney(row.averageSaleValue) },
]

function SalesTrend({ yearly }) {
  const data = yearly?.chartData || []
  const max = Math.max(1, ...data.map((d) => d.amount))

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-slate-900">Sales, last 12 months</h2>
        <p className="text-xs text-slate-500">Average per month: <span className="font-semibold text-slate-800">{formatReportMoney(yearly?.averageYearlySales)}</span></p>
      </div>
      {data.length === 0 ? (
        <p className="text-xs text-slate-500 py-6 text-center">No delivered orders in the last 12 months for these filters.</p>
      ) : (
        <div className="flex items-end gap-2 h-40">
          {data.map((point) => (
            <div key={point.month} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full gap-1" title={`${point.label}: ${formatReportMoney(point.amount)}`}>
              <span className="text-[10px] text-slate-500 tabular-nums">{Math.round(point.amount).toLocaleString("en-IN")}</span>
              <div className="w-full max-w-10 rounded-t bg-blue-500" style={{ height: `${Math.max(2, (point.amount / max) * 100)}%` }} />
              <span className="text-[10px] text-slate-500">{point.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Per-dish sales from delivered orders, filterable by zone, restaurant, category, food type and date. */
export default function FoodReport() {
  const { zones, restaurants, categories } = useAdminFilterOptions()
  const [filters, setFilters] = useState(EMPTY_REPORT_FILTERS)
  const [foodType, setFoodType] = useState("")
  const [search, setSearch] = useState("")

  const { data, loading } = useReportFetch(
    async () => {
      const res = await adminAPI.getFoodReport({
        ...buildReportParams(filters),
        foodType: foodType || undefined,
        search: search || undefined,
      })
      return res?.data?.data || { rows: [], yearly: {} }
    },
    [filters, foodType, search],
    { enabled: !hasInvalidDateRange(filters), errorMessage: "Failed to load food report" },
  )

  const rows = data?.rows || []
  const totalSold = rows.reduce((sum, row) => sum + row.totalAmountSold, 0)
  const totalUnits = rows.reduce((sum, row) => sum + row.units, 0)
  const activeFilters = countActiveReportFilters(filters) + (foodType ? 1 : 0)

  return (
    <DataReportPage
      title="Food Report"
      icon={UtensilsCrossed}
      exportName="food_report"
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search food or restaurant"
      loading={loading}
      rows={rows}
      columns={columns}
      filters={
        <>
          <ReportFilterFields filters={filters} setFilters={setFilters} zones={zones} restaurants={restaurants} categories={categories} />
          <FilterSelect value={foodType} onChange={setFoodType}>
            <option value="">All types</option>
            <option value="veg">Veg</option>
            <option value="non-veg">Non-Veg</option>
          </FilterSelect>
          <button
            onClick={() => {
              setFilters(EMPTY_REPORT_FILTERS)
              setFoodType("")
              setSearch("")
            }}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            Reset{activeFilters ? ` (${activeFilters})` : ""}
          </button>
        </>
      }
      summary={
        <>
          <SummaryCard label="Foods sold" value={rows.length} />
          <SummaryCard label="Units sold" value={totalUnits.toLocaleString("en-IN")} />
          <SummaryCard label="Total amount sold" value={formatReportMoney(totalSold)} tone="text-emerald-600" />
        </>
      }
      extra={<SalesTrend yearly={data?.yearly} />}
    />
  )
}
