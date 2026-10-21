import { useEffect, useMemo, useState } from "react"
import { FileText } from "lucide-react"
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
  formatReportDateTime,
  formatReportMoney,
  useReportFetch,
} from "@food/components/admin/reports/DataReportPage"

const EXPENSE_TYPES = ["Coupon Discount", "Rider Payout", "Refund"]

const columns = [
  { key: "sl", label: "SI" },
  { key: "orderId", label: "Order ID" },
  { key: "createdAt", label: "Date & Time", render: (row) => formatReportDateTime(row.createdAt) },
  { key: "expenseType", label: "Expense Type" },
  { key: "restaurant", label: "Restaurant" },
  { key: "customerName", label: "Customer Name" },
  { key: "expenseAmount", label: "Expense Amount", align: "right", render: (row) => formatReportMoney(row.expenseAmount) },
]

/** What the platform pays out per order: admin-funded coupon discounts, rider payouts and refunds. */
export default function ExpenseReport() {
  const { zones, restaurants, categories } = useAdminFilterOptions()
  const [filters, setFilters] = useState(EMPTY_REPORT_FILTERS)
  const [type, setType] = useState("")
  const [customer, setCustomer] = useState("")
  const [customers, setCustomers] = useState([])
  const [search, setSearch] = useState("")

  useEffect(() => {
    adminAPI
      .getCustomers({ limit: 1000 })
      .then((res) => setCustomers(res?.data?.data?.customers || []))
      .catch(() => setCustomers([]))
  }, [])

  const { data, loading } = useReportFetch(
    async () => {
      const res = await adminAPI.getExpenseReport({
        ...buildReportParams(filters),
        type: type || undefined,
        userId: customer || undefined,
        search: search || undefined,
      })
      return res?.data?.data || { rows: [], totals: {} }
    },
    [filters, type, customer, search],
    { enabled: !hasInvalidDateRange(filters), errorMessage: "Failed to load expense report" },
  )

  const rows = data?.rows || []
  const totals = data?.totals || {}
  const activeFilters = countActiveReportFilters(filters) + (type ? 1 : 0) + (customer ? 1 : 0)

  const typeCards = useMemo(
    () => EXPENSE_TYPES.map((name) => <SummaryCard key={name} label={name} value={formatReportMoney(totals.byType?.[name])} />),
    [totals],
  )

  return (
    <DataReportPage
      title="Expense Report"
      icon={FileText}
      exportName="expense_report"
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search order ID"
      loading={loading}
      rows={rows}
      columns={columns}
      notice={data?.truncated ? "Showing the latest 5000 expenses. Narrow the filters to see the rest." : null}
      filters={
        <>
          <ReportFilterFields filters={filters} setFilters={setFilters} zones={zones} restaurants={restaurants} categories={categories} />
          <FilterSelect value={customer} onChange={setCustomer}>
            <option value="">All customers</option>
            {customers.map((c) => (
              <option key={c._id} value={c._id}>{c.name || c.phone}</option>
            ))}
          </FilterSelect>
          <FilterSelect value={type} onChange={setType}>
            <option value="">All Type</option>
            {EXPENSE_TYPES.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </FilterSelect>
          <button
            onClick={() => {
              setFilters(EMPTY_REPORT_FILTERS)
              setType("")
              setCustomer("")
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
          <SummaryCard label="Total expense" value={formatReportMoney(totals.all)} tone="text-red-600" />
          {typeCards}
        </>
      }
    />
  )
}
