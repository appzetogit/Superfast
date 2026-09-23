import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, Package, Loader2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { customerApi } from "../services/customerApi";

const ReturnsListPage = () => {
  const navigate = useNavigate();
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReturns = async () => {
      try {
        const response = await customerApi.getUserReturns();
        const data = response.data || {};
        if (data.success) {
          setReturns(data.returns || []);
        } else {
          toast.error("Failed to load returns");
        }
      } catch (err) {
        toast.error("Error loading returns");
      } finally {
        setLoading(false);
      }
    };

    fetchReturns();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-emerald-600" size={24} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background pb-24 transition-colors">
      <div className="sticky top-0 z-30 mb-4 flex items-center gap-2 border-b border-slate-200/60 dark:border-white/5 bg-slate-50/95 dark:bg-background/95 px-4 pb-3 pt-4 backdrop-blur-sm">
        <button
          onClick={() => navigate(-1)}
          className="-ml-1 flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-200/70 dark:hover:bg-white/10"
        >
          <ChevronLeft size={22} className="text-slate-800 dark:text-slate-200" />
        </button>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          My Returns
        </h1>
      </div>

      <div className="space-y-4 px-4 pb-2">
        {returns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Package size={56} className="mb-4 text-slate-300 dark:text-slate-700" />
            <h3 className="mb-1 text-base font-semibold text-slate-900 dark:text-slate-100">
              No Returns Yet
            </h3>
            <p className="text-sm text-slate-500">You haven't requested any returns.</p>
          </div>
        ) : (
          returns.map(ret => (
            <div 
              key={ret._id}
              onClick={() => navigate(`/quick/returns/${ret._id}`)}
              className="cursor-pointer bg-white dark:bg-neutral-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-neutral-700 flex flex-col gap-3"
            >
              <div className="flex justify-between items-start">
                <div className="flex gap-3">
                  <div className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden shrink-0">
                    {ret.productId?.image ? (
                      <img src={ret.productId.image} alt="Product" className="w-full h-full object-cover" />
                    ) : <Package className="w-full h-full p-2 text-slate-400" />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
                      {ret.productId?.name || "Product"}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">Qty: {ret.quantity}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-800 dark:text-white">₹{ret.refundAmount}</span>
                  <div className="mt-1">
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {ret.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              </div>
              <div className="border-t border-slate-100 dark:border-neutral-700 pt-2 flex justify-between items-center text-xs text-[#0c831f] font-semibold">
                <span>View Details</span>
                <ChevronRight size={14} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ReturnsListPage;
