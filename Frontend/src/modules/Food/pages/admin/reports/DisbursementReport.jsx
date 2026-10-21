import { useMemo, useState } from "react"
import { Truck, UtensilsCrossed } from "lucide-react"
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

const STATUS_STYLES = {
  Pending: "bg-yellow-100 text-yellow-700",
  Completed: "bg-green-100 text-green-700",
  Canceled: "bg-red-100 text-red-700",
}

const prettyMethod = (method) => String(method || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())

/** Withdrawal payouts for restaurants (party="restaurant") or deliverymen (party="deliveryman"). */
export default function DisbursementReport({ party = "restaurant" }) {
  const isDeliveryman = party === "deliveryman"
  const { zones, restaurants } = useAdminFilterOptions({ categories: false, restaurants: !isDeliveryman, zones: !isDeliveryman })
  const [filters, setFilters] = useState(EMPTY_REPORT_FILTERS)
  const [status, setStatus] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("")
  const [search, setSearch] = useState("")
  const [knownMethods, setKnownMethods] = useState([])

  const { data, loading } = useReportFetch(
    async () => {
      const res = await adminAPI.getDisbursementReport({
        party,
        ...buildReportParams(filters),
        categoryId: undefined,
        status: status || undefined,
        paymentMethod: paymentMethod || undefined,
        search: search || undefined,
      })
      const payload = res?.data?.data || { rows: [], stats: {} }
      setKnownMethods((prev) => [...new Set([...prev, ...payload.rows.map((row) => row.paymentMethod).filter(Boolean)])])
      return payload
    },
    [party, filters, status, paymentMethod, search],
    { enabled: !hasInvalidDateRange(filters), errorMessage: "Failed to load disbursement report" },
  )

  const rows = data?.rows || []
  const stats = data?.stats || {}
  const activeFilters = countActiveReportFilters(filters) + (status ? 1 : 0) + (paymentMethod ? 1 : 0)

  const columns = useMemo(
    () => [
      { key: "sl", label: "SI" },
      { key: "id", label: "Reference" },
      { key: "name", label: isDeliveryman ? "Deliveryman" : "Restaurant", render: (row) => (
        <div>
          <p className="font-medium text-slate-800">{row.name}</p>
          {row.phone ? <p className="text-[11px] text-slate-400">{row.phone}</p> : null}
        </div>
      ) },
      { key: "createdAt", label: "Created At", render: (row) => formatReportDateTime(row.createdAt), exportKey: "createdAt" },
      { key: "disburseAmount", label: "Disburse Amount", align: "right", render: (row) => formatReportMoney(row.disburseAmount) },
      { key: "paymentMethod", label: "Payment Method", render: (row) => prettyMethod(row.paymentMethod) },
      { key: "status", label: "Status", render: (row) => (
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_STYLES[row.status] || "bg-slate-100 text-slate-700"}`}>
          {row.status}
        </span>
      ) },
      { key: "note", label: "Note" },
    ],
    [isDeliveryman],
  )

  const card = (label, key, tone) => (
    <SummaryCard
      label={label}
      value={formatReportMoney(stats[key]?.amount)}
      hint={`${stats[key]?.count || 0} request${stats[key]?.count === 1 ? "" : "s"}`}
      tone={tone}
    />
  )

  return (
    <DataReportPage
      title={isDeliveryman ? "Deliveryman Disbursement Report" : "Restaurant Disbursement Report"}
      icon={isDeliveryman ? Truck : UtensilsCrossed}
      exportName={isDeliveryman ? "disbursement_report_deliverymen" : "disbursement_report_restaurants"}
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder={isDeliveryman ? "Search reference or deliveryman" : "Search reference or restaurant"}
      loading={loading}
      rows={rows}
      columns={columns}
      filters={
        <>
          {!isDeliveryman && (
            <ReportFilterFields
              filters={filters}
              setFilters={setFilters}
              zones={zones}
              restaurants={restaurants}
              showCategory={false}
            />
          )}
          {isDeliveryman && (
            <ReportFilterFields filters={filters} setFilters={setFilters} showZone={false} showRestaurant={false} showCategory={false} />
          )}
          <FilterSelect value={status} onChange={setStatus}>
            <option value="">All status</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="canceled">Canceled</option>
          </FilterSelect>
          <FilterSelect value={paymentMethod} onChange={setPaymentMethod}>
            <option value="">All Payment Method</option>
            {[...new Set([...knownMethods, paymentMethod].filter(Boolean))].map((method) => (
              <option key={method} value={method}>{prettyMethod(method)}</option>
            ))}
          </FilterSelect>
          <button
            onClick={() => {
              setFilters(EMPTY_REPORT_FILTERS)
              setStatus("")
              setPaymentMethod("")
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
          {card("Pending disbursements", "pending", "text-yellow-600")}
          {card("Completed disbursements", "completed", "text-green-600")}
          {card("Canceled disbursements", "canceled", "text-red-600")}
        </>
      }
    />
  )
}
