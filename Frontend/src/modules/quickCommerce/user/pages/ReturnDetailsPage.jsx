import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Package, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { customerApi } from "../services/customerApi";

const ReturnDetailsPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [returnReq, setReturnReq] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        const response = await customerApi.getReturnDetails(id);
        const data = response.data || {};
        if (data.success) {
          setReturnReq(data.returnRequest);
        } else {
          toast.error("Failed to load return details");
        }
      } catch (err) {
        toast.error("Error loading return details");
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-emerald-600" size={24} />
      </div>
    );
  }

  if (!returnReq) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p>Return request not found</p>
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
          Return Details
        </h1>
      </div>

      <div className="px-4 space-y-4">
        {/* Status */}
        <div className="bg-white dark:bg-neutral-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-neutral-700">
          <h3 className="text-xs text-slate-500 uppercase tracking-wider mb-2">Status</h3>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-slate-100 text-slate-800 font-bold text-sm rounded-full">
              {returnReq.status.replace(/_/g, ' ')}
            </span>
          </div>
          {returnReq.pickupOtp && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
              <Info className="text-amber-600 w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Pickup OTP: {returnReq.pickupOtp}</p>
                <p className="text-xs text-amber-700">Share this OTP with the delivery partner when they arrive.</p>
              </div>
            </div>
          )}
        </div>

        {/* Product Details */}
        <div className="bg-white dark:bg-neutral-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-neutral-700">
          <h3 className="text-xs text-slate-500 uppercase tracking-wider mb-3">Product</h3>
          <div className="flex gap-3">
            <div className="w-16 h-16 bg-slate-100 rounded-lg overflow-hidden shrink-0">
              {returnReq.productId?.image ? (
                <img src={returnReq.productId.image} alt="Product" className="w-full h-full object-cover" />
              ) : <Package className="w-full h-full p-2 text-slate-400" />}
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
                {returnReq.productId?.name || "Product"}
              </h3>
              <p className="text-xs text-slate-500 mt-1">Quantity returning: {returnReq.quantity}</p>
              <p className="text-sm font-bold text-slate-800 mt-1">Expected Refund: ₹{returnReq.refundAmount}</p>
            </div>
          </div>
        </div>

        {/* Reason & Info */}
        <div className="bg-white dark:bg-neutral-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-neutral-700 space-y-3">
          <div>
            <h3 className="text-xs text-slate-500 uppercase tracking-wider mb-1">Reason</h3>
            <p className="text-sm font-medium">{returnReq.reason}</p>
            {returnReq.description && <p className="text-xs text-slate-600 mt-1">{returnReq.description}</p>}
          </div>
          <div>
            <h3 className="text-xs text-slate-500 uppercase tracking-wider mb-1 mt-3">Refund Method</h3>
            <p className="text-sm font-medium">{returnReq.refundMethod}</p>
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-white dark:bg-neutral-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-neutral-700">
          <h3 className="text-xs text-slate-500 uppercase tracking-wider mb-4">Timeline</h3>
          <div className="space-y-4">
            {returnReq.statusHistory?.map((history, idx) => (
              <div key={idx} className="flex gap-3 relative">
                {idx !== returnReq.statusHistory.length - 1 && (
                  <div className="absolute left-1.5 top-5 bottom-[-16px] w-[2px] bg-slate-200"></div>
                )}
                <div className="w-3 h-3 rounded-full bg-[#0c831f] mt-1 shrink-0 relative z-10"></div>
                <div>
                  <p className="text-sm font-semibold">{history.status.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(history.timestamp).toLocaleString()} - {history.remarks}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default ReturnDetailsPage;
