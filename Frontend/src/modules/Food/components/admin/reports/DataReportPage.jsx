import { useEffect, useMemo, useState } from "react"
import { Download, FileSpreadsheet, FileText, Code, Loader2, Search } from "lucide-react"
import { toast } from "sonner"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@food/components/ui/dropdown-menu"
import Pagination from "@shared/components/ui/Pagination"
import { exportReportsToCSV, exportReportsToExcel, exportReportsToPDF, exportReportsToJSON } from "@food/components/admin/reports/reportsExportUtils"

export const formatReportMoney = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const formatReportDateTime = (value) => {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })
}

/**
 * Runs `load()` whenever `deps` change (debounced so typing in search does not spam the API).
 * Returns { data, loading }.
 */
export function useReportFetch(load, deps, { enabled = true, errorMessage = "Failed to load report" } = {}) {
  const [state, setState] = useState({ data: null, loading: true })

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, loading: false })
      return undefined
    }
    let cancelled = false
    setState((prev) => ({ ...prev, loading: true }))

    const timer = setTimeout(() => {
      load()
        .then((data) => {
          if (!cancelled) setState({ data, loading: false })
        })
        .catch((error) => {
          if (cancelled) return
          toast.error(error?.response?.data?.message || errorMessage)
          setState({ data: null, loading: false })
        })
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled])

  return state
}

export function SummaryCard({ label, value, hint, tone = "text-slate-900" }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-3">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className={`text-lg font-bold mt-1 ${tone}`}>{value}</p>
      {hint ? <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p> : null}
    </div>
  )
}

/**
 * Shared shell for the admin data reports: header, filter bar, summary cards, searchable
 * table with pagination and exports. The page supplies the data and the columns.
 *
 * columns: [{ key, label, align?: "right", render?: (row) => node, exportKey? }]
 */
export default function DataReportPage({
  title,
  icon: Icon,
  filters,
  summary,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search",
  columns,
  rows,
  loading,
  exportName,
  notice,
  emptyText = "No records match these filters.",
  extra,
}) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  useEffect(() => {
    setPage(1)
  }, [rows])

  const pagedRows = useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [rows, page, pageSize])

  const handleExport = (format) => {
    if (!rows.length) {
      toast.error("No data to export")
      return
    }
    const headers = columns.map((column) => ({ key: column.exportKey || column.key, label: column.label }))
    if (format === "csv") exportReportsToCSV(rows, headers, exportName)
    if (format === "excel") exportReportsToExcel(rows, headers, exportName)
    if (format === "pdf") exportReportsToPDF(rows, headers, exportName, title)
    if (format === "json") exportReportsToJSON(rows, exportName)
  }

  return (
    <div className="p-2 lg:p-3 bg-slate-50 min-h-screen">
      <div className="w-full mx-auto space-y-3">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3 flex items-center gap-2">
          {Icon ? (
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <Icon className="w-3.5 h-3.5 text-white" />
            </div>
          ) : null}
          <h1 className="text-lg font-bold text-slate-900">{title}</h1>
        </div>

        {filters ? (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">{filters}</div>
          </div>
        ) : null}

        {summary ? <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">{summary}</div> : null}

        {extra}

        <div className="bg-white rounded-lg shadow-sm border border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-900">
              {title} <span className="text-slate-500 font-medium">({rows.length})</span>
            </h2>
            <div className="flex items-center gap-2">
              {onSearchChange ? (
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchValue}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="pl-8 pr-3 py-1.5 w-56 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">
                    <Download className="w-3.5 h-3.5" />
                    Export
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel>Export as</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleExport("csv")}><FileText className="w-4 h-4 mr-2" />CSV</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("excel")}><FileSpreadsheet className="w-4 h-4 mr-2" />Excel</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("pdf")}><FileText className="w-4 h-4 mr-2" />PDF</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("json")}><Code className="w-4 h-4 mr-2" />JSON</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {notice ? <p className="px-3 py-2 text-[11px] text-amber-700 bg-amber-50 border-b border-amber-100">{notice}</p> : null}

          {loading ? (
            <div className="py-16 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    {columns.map((column) => (
                      <th
                        key={column.key}
                        className={`px-3 py-2 text-[11px] font-semibold text-slate-600 uppercase tracking-wide whitespace-nowrap ${column.align === "right" ? "text-right" : "text-left"}`}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedRows.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length} className="px-3 py-10 text-center text-xs text-slate-500">{emptyText}</td>
                    </tr>
                  ) : (
                    pagedRows.map((row, index) => (
                      <tr key={row._id || row.itemId || `${row.orderId}-${row.expenseType}-${index}`} className="hover:bg-slate-50">
                        {columns.map((column) => (
                          <td
                            key={column.key}
                            className={`px-3 py-2 text-xs text-slate-700 whitespace-nowrap ${column.align === "right" ? "text-right tabular-nums" : ""}`}
                          >
                            {column.render ? column.render(row) : row[column.key]}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="border-t border-slate-200">
            <Pagination
              page={page}
              total={rows.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(value) => {
                setPageSize(value)
                setPage(1)
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
