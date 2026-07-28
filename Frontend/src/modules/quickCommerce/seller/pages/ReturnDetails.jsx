import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Loader2, Package, CheckCircle, Upload } from "lucide-react";
import { toast } from "sonner";
import axiosInstance from "@core/api/axios";
import { openCamera } from "@food/utils/imageUploadUtils";

const ReturnDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [returnReq, setReturnReq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  
  const [sellerImage, setSellerImage] = useState("");

  useEffect(() => {
    fetchDetails();
  }, [id]);

  const fetchDetails = async () => {
    try {
      const response = await axiosInstance.get('/quick-commerce/seller/returns');
      if (response.data?.success) {
        const found = (response.data.returns || response.data.result?.items || []).find(r => r._id === id);
        if (found) {
          setReturnReq(found);
        } else {
          toast.error("Return request not found");
        }
      }
    } catch (error) {
      toast.error("Error loading return details");
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fakeUrl = URL.createObjectURL(file);
    setSellerImage(fakeUrl);
  };

  const handleReceiveReturn = async () => {
    if (!sellerImage) {
      toast.error("Please upload an image of the received return package");
      return;
    }

    setActionLoading(true);
    try {
      const response = await axiosInstance.put(`/quick-commerce/seller/returns/${id}/receive`, { sellerImage });
      if (response.data?.success) {
        toast.success("Return marked as received");
        setReturnReq(response.data.returnRequest);
      } else {
        toast.error(response.data?.message || "Failed to mark return as received");
      }
    } catch (error) {
      const errorMsg = error.response?.data?.message || "An error occurred";
      toast.error(errorMsg);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="animate-spin text-emerald-600" size={24} />
      </div>
    );
  }

  if (!returnReq) return null;

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-full transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Return Details</h1>
          <p className="text-gray-500 text-sm mt-1">Order #{returnReq.orderId?.slice(-6).toUpperCase()}</p>
        </div>
        <div className="ml-auto">
          <span className="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full font-bold text-sm uppercase tracking-wider">
            {returnReq.status.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col - Details */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-gray-200 dark:border-neutral-700 p-6">
            <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-4">Product Info</h3>
            <div className="flex gap-4">
              <div className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden shrink-0">
                {returnReq.productId?.image ? (
                  <img src={returnReq.productId.image} alt="Product" className="w-full h-full object-cover" />
                ) : <Package className="w-full h-full p-4 text-gray-400" />}
              </div>
              <div>
                <h4 className="font-bold text-gray-800 dark:text-gray-100">{returnReq.productId?.name || "Product"}</h4>
                <p className="text-sm text-gray-500 mt-1">Quantity: {returnReq.quantity}</p>
                <div className="mt-2 p-2 bg-red-50 border border-red-100 rounded inline-block">
                  <p className="text-sm font-semibold text-red-700">Deduction: -₹{returnReq.refundAmount}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-gray-200 dark:border-neutral-700 p-6">
            <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-4">Return Reason</h3>
            <p className="text-gray-800 dark:text-gray-200 font-medium">{returnReq.reason}</p>
            {returnReq.description && <p className="text-gray-600 dark:text-gray-400 mt-2">{returnReq.description}</p>}
          </div>
        </div>

        {/* Right Col - Actions */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-gray-200 dark:border-neutral-700 p-6">
            <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-4">Seller Actions</h3>
            
            <div className="space-y-4">
              {returnReq.status === "PICKED_UP" ? (
                <>
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
                    <p className="text-sm font-medium text-amber-800">The delivery partner has picked up the return. Await drop-off at your store.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Upload Photo of Received Package</label>
                    {sellerImage ? (
                      <div className="relative w-full h-32 rounded-lg overflow-hidden border border-gray-200">
                        <img src={sellerImage} alt="Received" className="w-full h-full object-cover" />
                        <button onClick={() => setSellerImage("")} className="absolute top-2 right-2 bg-white/80 p-1 rounded text-red-600 font-bold text-xs">Remove</button>
                      </div>
                    ) : (
                      <button onClick={() => {
                        openCamera({
                          onSelectFile: (file) => {
                            if (!file) return;
                            const fakeUrl = URL.createObjectURL(file);
                            setSellerImage(fakeUrl);
                          },
                          fileNamePrefix: "return-received"
                        })
                      }} className="w-full h-32 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50">
                        <Upload className="w-6 h-6 text-gray-400 mb-2" />
                        <span className="text-sm text-gray-500 font-medium">Take Photo</span>
                      </button>
                    )}
                  </div>

                  <button
                    onClick={handleReceiveReturn}
                    disabled={actionLoading}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-70"
                  >
                    {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                    Mark as Received
                  </button>
                </>
              ) : returnReq.status === "RETURN_RECEIVED_BY_SELLER" || returnReq.status === "REFUND_COMPLETED" ? (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-center">
                  <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                  <p className="font-semibold text-emerald-800">Return Received</p>
                  <p className="text-xs text-emerald-600 mt-1">You have successfully received this return package.</p>
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic text-center">No actions available for current status.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReturnDetails;
