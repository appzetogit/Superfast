import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Package, Eye } from "lucide-react";
import { toast } from "sonner";

import axiosInstance from "@core/api/axios";

const ReturnManagement = () => {
  const navigate = useNavigate();
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReturns();
  }, []);

  const fetchReturns = async () => {
    try {
      const response = await axiosInstance.get('/quick-commerce/seller/returns');
      if (response.data?.success) {
        setReturns(response.data.returns || response.data.result?.items || []);
      } else {
        toast.error("Failed to load returns");
      }
    } catch (error) {
      toast.error("Error loading returns");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="animate-spin text-emerald-600" size={24} />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Store Returns</h1>
        <p className="text-gray-500 text-sm mt-1">Manage returns heading to your store.</p>
      </div>

      <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-gray-200 dark:border-neutral-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-neutral-900/50 border-b border-gray-200 dark:border-neutral-700">
              <tr>
                <th className="px-6 py-4 font-semibold text-gray-600 dark:text-gray-300">Order ID</th>
                <th className="px-6 py-4 font-semibold text-gray-600 dark:text-gray-300">Product</th>
                <th className="px-6 py-4 font-semibold text-gray-600 dark:text-gray-300">Deduction</th>
                <th className="px-6 py-4 font-semibold text-gray-600 dark:text-gray-300">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
              {returns.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                    <Package className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                    No return requests found.
                  </td>
                </tr>
              ) : (
                returns.map((ret) => (
                  <tr key={ret._id} className="hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors">
                    <td className="px-6 py-4 text-gray-800 dark:text-gray-200 font-medium">
                      {ret.orderId?.slice(-6).toUpperCase() || "N/A"}
                    </td>
                    <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                      {ret.productId?.name || "Product"}
                      <span className="block text-xs text-gray-400">Qty: {ret.quantity}</span>
                    </td>
                    <td className="px-6 py-4 text-red-600 font-medium">
                      -₹{ret.sellerEarningDeduction || 0}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                        {ret.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ReturnManagement;
