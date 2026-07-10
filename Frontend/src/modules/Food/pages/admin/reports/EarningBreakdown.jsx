import { useState, useMemo, useEffect } from "react"
import { useSearchParams, useNavigate } from "react-router-dom"
import { BarChart3, Loader2, ArrowLeft, Search } from "lucide-react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"
import Pagination from '@shared/components/ui/Pagination'

export default function EarningBreakdown() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const type = searchParams.get('type') || 'admin'
  
  const [searchQuery, setSearchQuery] = useState("")
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        setLoading(true)
        const response = await adminAPI.getTransactionReport({ limit: 1000 })
        if (response?.data?.data?.transactions) {
          setTransactions(response.data.data.transactions)
        } else if (response?.data?.transactions) {
          setTransactions(response.data.transactions)
        }
      } catch (error) {
        toast.error("Failed to fetch earning breakdown data")
      } finally {
        setLoading(false)
      }
    }

    fetchTransactions()
  }, [])

  const filteredTransactions = useMemo(() => {
    let result = [...transactions]
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(tx => 
        (tx.orderId && tx.orderId.toLowerCase().includes(q)) ||
        (tx.restaurant && tx.restaurant.toLowerCase().includes(q)) ||
        (tx.customerName && tx.customerName.toLowerCase().includes(q))
      )
    }
    return result
  }, [transactions, searchQuery])

  const paginatedTransactions = useMemo(() => {
    return filteredTransactions.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
    );
  }, [filteredTransactions, currentPage, itemsPerPage]);

  const formatCurrency = (amount) => {
    const num = Number(amount) || 0;
    return `\u20B9 ${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const getStatusBadgeClasses = (status) => {
    const normalized = String(status || '').toLowerCase()
    if (['captured', 'settled', 'completed', 'paid', 'delivered'].includes(normalized)) {
      return 'bg-green-100 text-green-700'
    }
    if (['pending', 'created', 'authorized', 'cod_pending'].includes(normalized)) {
      return 'bg-yellow-100 text-yellow-700'
    }
    if (['failed', 'refunded', 'cancelled', 'cancelled_by_admin', 'cancelled_by_user', 'cancelled_by_restaurant'].includes(normalized)) {
      return 'bg-red-100 text-red-700'
    }
    return 'bg-slate-100 text-slate-700'
  }

  const getTitle = () => {
    if (type === 'restaurant') return "Restaurant Earning Breakdown"
    if (type === 'deliveryman') return "Deliveryman Earning Breakdown"
    return "Admin Earning Breakdown"
  }

  if (loading) {
    return (
      <div className="p-2 lg:p-3 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-gray-600">Loading earning breakdown...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-2 lg:p-3 bg-slate-50 min-h-screen">
      <div className="w-full mx-auto">
        {/* Page Header */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3 mb-3">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate(-1)} 
              className="p-1 hover:bg-slate-100 rounded-md transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <BarChart3 className="w-3.5 h-3.5 text-white" />
            </div>
            <h1 className="text-lg font-bold text-slate-900">{getTitle()}</h1>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3 mb-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Search by Order ID or Name..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentPage(1)
              }}
              className="w-full pl-9 pr-4 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden mb-3">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-3 py-2 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">SL</th>
                  <th className="px-3 py-2 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Order ID</th>
                  
                  {type === 'restaurant' && (
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Restaurant</th>
                  )}
                  {type === 'deliveryman' && (
                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Deliveryman</th>
                  )}
                  
                  <th className="px-3 py-2 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Order Amount</th>
                  
                  {type === 'admin' && (
                    <th className="px-3 py-2 text-left text-xs font-bold text-green-700 uppercase tracking-wider">Admin Earning</th>
                  )}
                  {type === 'restaurant' && (
                    <th className="px-3 py-2 text-left text-xs font-bold text-green-700 uppercase tracking-wider">Restaurant Earning</th>
                  )}
                  {type === 'deliveryman' && (
                    <th className="px-3 py-2 text-left text-xs font-bold text-green-700 uppercase tracking-wider">Deliveryman Earning</th>
                  )}

                  <th className="px-3 py-2 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <p className="text-sm font-semibold text-slate-700">No Data Found</p>
                    </td>
                  </tr>
                ) : (
                  paginatedTransactions.map((tx, index) => (
                    <tr key={tx.id || index} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2 text-xs text-slate-700">
                        {(currentPage - 1) * itemsPerPage + index + 1}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-700">
                        {tx.orderId}
                      </td>
                      
                      {type === 'restaurant' && (
                        <td className="px-3 py-2 text-xs text-slate-700 truncate max-w-[150px]">
                          {tx.restaurant}
                        </td>
                      )}
                      {type === 'deliveryman' && (
                        <td className="px-3 py-2 text-xs text-slate-700 truncate max-w-[150px]">
                          {tx.deliverymanName || 'N/A'}
                        </td>
                      )}

                      <td className="px-3 py-2 text-xs text-slate-700">
                        {formatCurrency(tx.orderAmount)}
                      </td>

                      {type === 'admin' && (
                        <td className="px-3 py-2 text-xs font-semibold text-green-600">
                          {formatCurrency(tx.adminEarning)}
                        </td>
                      )}
                      {type === 'restaurant' && (
                        <td className="px-3 py-2 text-xs font-semibold text-green-600">
                          {formatCurrency(tx.restaurantEarning)}
                        </td>
                      )}
                      {type === 'deliveryman' && (
                        <td className="px-3 py-2 text-xs font-semibold text-green-600">
                          {formatCurrency(tx.deliverymanEarning)}
                        </td>
                      )}

                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${getStatusBadgeClasses(tx.status)}`}>
                          {(tx.status || 'Unknown').replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-200">
            <Pagination
              currentPage={currentPage}
              totalPages={Math.ceil(filteredTransactions.length / itemsPerPage)}
              onPageChange={setCurrentPage}
              itemsPerPage={itemsPerPage}
              onItemsPerPageChange={(val) => {
                setItemsPerPage(val)
                setCurrentPage(1)
              }}
              itemsPerPageOptions={[25, 50, 100]}
              totalItems={filteredTransactions.length}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
