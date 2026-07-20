import React, { useState, useEffect } from 'react';
import { adminApi } from '../services/adminApi';
import { 
  FileText, Search, Download, Filter, 
  ChevronLeft, ChevronRight, Eye, RefreshCw
} from 'lucide-react';
import Pagination from '@shared/components/ui/Pagination';

const TransactionReport = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [summaryStats, setSummaryStats] = useState(null);

  const handleExportCSV = () => {
    if (!transactions || transactions.length === 0) return;
    
    const headers = [
      'Order ID', 'Date', 'Customer', 'Seller', 'Delivery Boy',
      'User Paid', 'Subtotal', 'Delivery Fee', 'Handling Fee',
      'Platform Fee', 'Tax/GST', 'Discount', 'Seller Earned',
      'Rider Earned', 'Admin Earned', 'Status'
    ];
    
    const rows = transactions.map(txn => [
      txn.orderId || txn._id,
      new Date(txn.createdAt).toLocaleString(),
      txn.customerName,
      txn.sellerName,
      txn.deliveryBoyName,
      (txn.userPaid || 0).toFixed(2),
      (txn.paymentBreakdown?.subtotal || 0).toFixed(2),
      (txn.paymentBreakdown?.deliveryFee || 0).toFixed(2),
      (txn.paymentBreakdown?.handlingFee || 0).toFixed(2),
      (txn.paymentBreakdown?.platformFee || 0).toFixed(2),
      (txn.paymentBreakdown?.gst || txn.paymentBreakdown?.tax || 0).toFixed(2),
      (txn.paymentBreakdown?.discount || 0).toFixed(2),
      (txn.sellerEarning || 0).toFixed(2),
      (txn.deliveryEarning || 0).toFixed(2),
      (txn.adminEarning || 0).toFixed(2),
      txn.status
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `transaction_report_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const fetchTransactions = async (currentPage = 1) => {
    setLoading(true);
    setError(null);
    try {
      const [res, summaryRes] = await Promise.all([
        adminApi.getFinanceTransactions({ page: currentPage, limit: pageSize }),
        adminApi.getFinanceSummary().catch(() => ({ data: { success: false, result: {} } }))
      ]);

      if (res?.data?.success) {
        setTransactions(res.data.result.transactions || []);
        setTotalPages(res.data.result.pages || 1);
        setTotalCount(res.data.result.total || 0);
        setPage(res.data.result.page || currentPage);
      } else {
        throw new Error(res?.data?.message || 'Failed to fetch transactions');
      }

      if (summaryRes?.data?.success) {
        setSummaryStats(summaryRes.data.result);
      }
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setError(err.message || 'Error fetching transactions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions(page);
  }, [page, pageSize]);

  const getStatusBadge = (status) => {
    const s = String(status || '').toLowerCase();
    if (['delivered', 'completed', 'settled'].includes(s)) {
      return <span className="px-2 py-1 text-xs font-bold rounded-full bg-green-100 text-green-700">Completed</span>;
    }
    if (['cancelled', 'failed', 'rejected'].includes(s)) {
      return <span className="px-2 py-1 text-xs font-bold rounded-full bg-red-100 text-red-700">Cancelled</span>;
    }
    return <span className="px-2 py-1 text-xs font-bold rounded-full bg-amber-100 text-amber-700 uppercase tracking-wider">{s || 'PENDING'}</span>;
  };

  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-6 font-['Outfit']">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-indigo-600 mb-2">
              <FileText className="w-5 h-5" />
              <span className="text-sm font-bold tracking-widest uppercase">Finance Reports</span>
            </div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Transaction Report</h1>
            <p className="text-gray-500 font-medium mt-1">Detailed breakdown of all quick commerce order transactions</p>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => fetchTransactions(page)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-all shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button 
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Stats Strip */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-center">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Total User Paid</span>
            <span className="text-2xl font-black text-indigo-600">₹{(summaryStats?.totalPlatformEarning || 0).toLocaleString()}</span>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-center">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Total Sellers Earning</span>
            <span className="text-2xl font-black text-emerald-600">₹{(summaryStats?.totalSellerEarning || 0).toLocaleString()}</span>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-center">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Admin Earning</span>
            <span className="text-2xl font-black text-purple-600">₹{(summaryStats?.totalAdminEarning || 0).toLocaleString()}</span>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-center">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Delivery Earning</span>
            <span className="text-2xl font-black text-amber-600">₹{(summaryStats?.totalDeliveryEarning || 0).toLocaleString()}</span>
          </div>
        </div>

        {/* Table Container */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          
          {/* Filters/Search */}
          <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search by Order ID, Customer, or Seller..." 
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-100 transition-all"
              />
            </div>
            <button className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 text-gray-700 font-bold rounded-xl hover:bg-gray-100 transition-all">
              <Filter className="w-4 h-4" />
              Filter
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100">
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Order ID & Date</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Customer</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Seller</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Delivery Boy</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-right">User Paid</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-right">Seller Earned</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-right">Rider Earned</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-right">Admin Earned</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td colSpan="9" className="px-6 py-12 text-center">
                      <RefreshCw className="w-8 h-8 animate-spin text-indigo-400 mx-auto mb-4" />
                      <p className="text-gray-500 font-medium">Loading transactions...</p>
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan="9" className="px-6 py-12 text-center">
                      <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <FileText className="w-6 h-6 text-red-500" />
                      </div>
                      <p className="text-red-500 font-bold">{error}</p>
                      <button 
                        onClick={() => fetchTransactions(page)}
                        className="mt-4 px-4 py-2 bg-red-50 text-red-700 font-bold rounded-xl hover:bg-red-100 transition-all"
                      >
                        Try Again
                      </button>
                    </td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="px-6 py-12 text-center">
                      <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <FileText className="w-8 h-8 text-gray-300" />
                      </div>
                      <h3 className="text-lg font-black text-gray-900 mb-1">No Transactions Found</h3>
                      <p className="text-gray-500 font-medium">There are no quick commerce orders yet.</p>
                    </td>
                  </tr>
                ) : (
                  transactions.map((txn) => (
                    <tr key={txn._id} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-gray-900">{txn.orderId || txn._id.substring(0,8)}</span>
                          <span className="text-xs font-medium text-gray-500">
                            {new Date(txn.createdAt).toLocaleString('en-IN', {
                              day: '2-digit', month: 'short', hour: '2-digit', minute:'2-digit'
                            })}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-gray-700">{txn.customerName}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-gray-700">{txn.sellerName}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-gray-700">{txn.deliveryBoyName}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex flex-col items-end">
                          <span className="text-sm font-black text-gray-900 mb-1">₹{(txn.userPaid || 0).toFixed(2)}</span>
                          {txn.paymentBreakdown && (
                            <div className="text-[10px] text-gray-500 font-medium space-y-0.5 mt-1 border-t border-gray-100 pt-1 w-full min-w-[120px]">
                              <div className="flex justify-between w-full gap-2"><span>Subtotal:</span> <span>₹{(txn.paymentBreakdown.subtotal || 0).toFixed(2)}</span></div>
                              <div className="flex justify-between w-full gap-2"><span>Delivery:</span> <span>₹{(txn.paymentBreakdown.deliveryFee || 0).toFixed(2)}</span></div>
                              <div className="flex justify-between w-full gap-2"><span>Handling:</span> <span>₹{(txn.paymentBreakdown.handlingFee || 0).toFixed(2)}</span></div>
                              <div className="flex justify-between w-full gap-2"><span>Tax/GST:</span> <span>₹{(txn.paymentBreakdown.gst || txn.paymentBreakdown.tax || 0).toFixed(2)}</span></div>
                              <div className="flex justify-between w-full gap-2"><span>Platform:</span> <span>₹{(txn.paymentBreakdown.platformFee || 0).toFixed(2)}</span></div>
                              {txn.paymentBreakdown.discount > 0 && <div className="flex justify-between w-full gap-2 text-green-600"><span>Discount:</span> <span>-₹{txn.paymentBreakdown.discount.toFixed(2)}</span></div>}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-bold text-emerald-600">₹{(txn.sellerEarning || 0).toFixed(2)}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-bold text-indigo-600">₹{(txn.deliveryEarning || 0).toFixed(2)}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-bold text-purple-600">₹{(txn.adminEarning || 0).toFixed(2)}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {getStatusBadge(txn.status)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!loading && transactions.length > 0 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              total={totalCount}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
              className="border-t-0 rounded-b-3xl"
            />
          )}

        </div>
      </div>
    </div>
  );
};

export default TransactionReport;
