import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Loader2, Package, CheckCircle, XCircle, Send, CreditCard, X } from "lucide-react";
import { toast } from "sonner";
import { adminApi } from "../services/adminApi";

const ReturnDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [returnReq, setReturnReq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");

  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  // Refund completion details
  const [refundRef, setRefundRef] = useState("");
  const [refundNotes, setRefundNotes] = useState("");
  const [showRefundInput, setShowRefundInput] = useState(false);
  const [refundAmount, setRefundAmount] = useState(0);
  const [selectedImage, setSelectedImage] = useState(null);

  useEffect(() => {
    fetchDetails();
  }, [id]);

  useEffect(() => {
    if (returnReq) {
      setRefundAmount(returnReq.refundAmount || 0);
    }
  }, [returnReq]);

  const fetchDetails = async () => {
    try {
      // In a real app we'd have a GET /admin/returns/:id
      // For now we fetch all and filter
      const response = await adminApi.getReturns();
      const data = response.data || {};
      if (data.success) {
        const found = data.returns?.find(r => r._id === id);
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

  const handleAction = async (endpoint, payload = {}, actionName) => {
    setActionLoading(actionName);
    try {
      const response = await adminApi.updateReturnAction(id, endpoint, payload);
      const data = response.data || {};
      if (data.success) {
        toast.success(`Action '${actionName}' successful`);
        setReturnReq(data.returnRequest);
        if (actionName === "Reject") setShowRejectInput(false);
        if (actionName === "Complete Refund") setShowRefundInput(false);
      } else {
        toast.error(data.message || `Failed to ${actionName.toLowerCase()}`);
      }
    } catch (error) {
      const errorMsg = error.response?.data?.message || `An error occurred during ${actionName.toLowerCase()}`;
      toast.error(errorMsg);
    } finally {
      setActionLoading("");
    }
  };

  const handleReject = () => {
    if (!rejectReason) {
      toast.error("Please provide a reason for rejection");
      return;
    }
    handleAction("reject", { reason: rejectReason }, "Reject");
  };

  const handleCompleteRefund = () => {
    if (!refundRef) {
      toast.error("Transaction Reference Number is required");
      return;
    }
    handleAction("refund", { 
      refundAmount: returnReq.refundAmount,
      refundMethod: returnReq.refundMethod,
      transactionReferenceNumber: refundRef,
      refundNotes
    }, "Complete Refund");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="animate-spin text-emerald-600" size={24} />
      </div>
    );
  }

  if (!returnReq) return null;

  const displayOrderId = typeof returnReq.orderId === 'object' ? (returnReq.orderId?.orderId || returnReq.orderId?._id || '') : returnReq.orderId;

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
          <p className="text-gray-500 text-sm mt-1">Order #{displayOrderId ? (displayOrderId.length > 8 ? displayOrderId.slice(-8).toUpperCase() : displayOrderId) : ""}</p>
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
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-1">Refund Amount: ₹{returnReq.refundAmount}</p>
              </div>
            </div>
          </div>

          {/* Original Order Details */}
          {typeof returnReq.orderId === 'object' && returnReq.orderId && (
            <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-gray-200 dark:border-neutral-700 p-6 space-y-4">
              <h3 className="font-semibold text-lg text-gray-900 dark:text-white border-b dark:border-neutral-700 pb-2">Original Order Details</h3>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-gray-500 block">Order ID</span>
                  <span className="font-bold text-gray-800 dark:text-gray-200">{returnReq.orderId.orderId || returnReq.orderId._id}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Order Status</span>
                  <span className="font-medium text-gray-800 dark:text-gray-200 capitalize">{returnReq.orderId.orderStatus}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Payment Method</span>
                  <span className="font-medium text-gray-800 dark:text-gray-200 uppercase">{returnReq.orderId.payment?.method || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Payment Status</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 uppercase">{returnReq.orderId.payment?.status || 'N/A'}</span>
                </div>
              </div>

              {/* Order Items */}
              <div className="mt-4">
                <span className="text-gray-500 text-xs font-semibold block mb-2">Returned Item from Original Order:</span>
                <div className="border border-gray-100 dark:border-neutral-700 rounded-lg divide-y divide-gray-100 dark:divide-neutral-700">
                  {returnReq.orderId.items?.filter(item => item.itemId?.toString() === returnReq.productId?._id?.toString() || item.productId?.toString() === returnReq.productId?._id?.toString()).map((item, idx) => {
                    return (
                      <div key={idx} className="p-3 flex justify-between items-center text-xs bg-amber-50/50 dark:bg-amber-900/10">
                        <div>
                          <span className="font-medium text-gray-800 dark:text-gray-200">{item.name}</span>
                          <span className="ml-2 px-1.5 py-0.5 text-[9px] bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 rounded font-semibold">Returning Item</span>
                        </div>
                        <span className="text-gray-600 dark:text-gray-400">Order Qty: {item.quantity} x ₹{item.price}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pricing breakdown */}
              <div className="mt-4 pt-3 border-t border-gray-100 dark:border-neutral-700 space-y-2 text-xs">
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>Subtotal</span>
                  <span>₹{returnReq.orderId.pricing?.subtotal || 0}</span>
                </div>
                {returnReq.orderId.pricing?.tax > 0 && (
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>Tax</span>
                    <span>₹{returnReq.orderId.pricing?.tax || 0}</span>
                  </div>
                )}
                {returnReq.orderId.pricing?.handlingFee > 0 && (
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>Handling Fee</span>
                    <span>₹{returnReq.orderId.pricing?.handlingFee || 0}</span>
                  </div>
                )}
                {returnReq.orderId.pricing?.deliveryFee > 0 && (
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>Delivery Fee</span>
                    <span>₹{returnReq.orderId.pricing?.deliveryFee || 0}</span>
                  </div>
                )}
                {returnReq.orderId.pricing?.platformFee > 0 && (
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>Platform Fee</span>
                    <span>₹{returnReq.orderId.pricing?.platformFee || 0}</span>
                  </div>
                )}
                {returnReq.orderId.pricing?.discount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Discount</span>
                    <span>-₹{returnReq.orderId.pricing?.discount || 0}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-gray-900 dark:text-white text-sm pt-2 border-t border-dashed dark:border-neutral-700">
                  <span>Total Paid by User</span>
                  <span>₹{returnReq.orderId.pricing?.total || 0}</span>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-gray-200 dark:border-neutral-700 p-6">
            <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-4">Return Reason</h3>
            <p className="text-gray-800 dark:text-gray-200 font-medium">{returnReq.reason}</p>
            {returnReq.description && <p className="text-gray-600 dark:text-gray-400 mt-2">{returnReq.description}</p>}
            
            {returnReq.userImages?.length > 0 && (
              <div className="mt-4">
                <p className="text-sm text-gray-500 mb-2">Attached Images</p>
                <div className="flex gap-3">
                  {returnReq.userImages.map((img, i) => (
                    <img 
                      key={i} 
                      src={img} 
                      alt="User upload" 
                      className="w-20 h-20 object-cover rounded border border-gray-200 dark:border-neutral-700 cursor-pointer hover:opacity-90 active:scale-95 transition-all" 
                      onClick={() => setSelectedImage(img)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Delivery Partner Verification */}
          {returnReq.pickupImage && (
            <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-gray-200 dark:border-neutral-700 p-6">
              <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-4">Delivery Partner Verification</h3>
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <div 
                  className="w-32 h-32 bg-gray-100 dark:bg-neutral-900 rounded-lg overflow-hidden shrink-0 border border-gray-200 dark:border-neutral-700 cursor-pointer hover:opacity-90 active:scale-95 transition-all"
                  onClick={() => setSelectedImage(returnReq.pickupImage)}
                >
                  <img src={returnReq.pickupImage} alt="Pickup verification" className="w-full h-full object-cover" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    This photo was uploaded by the delivery boy when verifying the return request with the customer.
                  </p>
                  {returnReq.deliveryPartnerId && (
                    <div className="p-3 bg-gray-50 dark:bg-neutral-900 rounded-lg border border-gray-150 dark:border-neutral-700 inline-block">
                      <p className="text-xs font-semibold text-gray-850 dark:text-gray-200">
                        Rider: {returnReq.deliveryPartnerId.name || "N/A"}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Phone: {returnReq.deliveryPartnerId.phone || "N/A"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-gray-200 dark:border-neutral-700 p-6">
            <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-4">Refund Details</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500 block mb-1">Method</span>
                <span className="font-medium text-gray-800 dark:text-gray-200">{returnReq.refundMethod}</span>
              </div>
              {returnReq.refundMethod === "Bank" && returnReq.bankDetails && (
                <>
                  <div>
                    <span className="text-gray-500 block mb-1">Account Holder</span>
                    <span className="font-medium text-gray-800 dark:text-gray-200">{returnReq.bankDetails.accountHolderName}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block mb-1">Account Number</span>
                    <span className="font-medium text-gray-800 dark:text-gray-200">{returnReq.bankDetails.accountNumber}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block mb-1">IFSC Code</span>
                    <span className="font-medium text-gray-800 dark:text-gray-200">{returnReq.bankDetails.ifscCode}</span>
                  </div>
                </>
              )}
              {returnReq.refundMethod === "UPI" && (
                <div>
                  <span className="text-gray-500 block mb-1">UPI ID</span>
                  <span className="font-medium text-gray-800 dark:text-gray-200">{returnReq.upiId}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Col - Actions & Timeline */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-gray-200 dark:border-neutral-700 p-6">
            <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-4">Admin Actions</h3>
            
            <div className="space-y-3">
              {returnReq.status === "RETURN_REQUESTED" && (
                <>
                  <div className="space-y-3 p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Set Refund Amount (₹)</label>
                      <input 
                        type="number" 
                        value={refundAmount} 
                        onChange={e => setRefundAmount(Number(e.target.value))}
                        className="w-full p-2 border border-emerald-200 dark:border-emerald-800 rounded bg-white dark:bg-neutral-900 focus:outline-none text-sm font-semibold text-gray-800 dark:text-gray-200"
                      />
                    </div>
                    <button
                      onClick={() => handleAction("approve", { refundAmount }, "Approve")}
                      disabled={actionLoading === "Approve"}
                      className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-70"
                    >
                      {actionLoading === "Approve" ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                      Approve Return
                    </button>
                  </div>
                  
                  {!showRejectInput ? (
                    <button
                      onClick={() => setShowRejectInput(true)}
                      className="w-full flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 py-2.5 rounded-lg font-medium transition-colors"
                    >
                      <XCircle className="w-5 h-5" />
                      Reject Return
                    </button>
                  ) : (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <input 
                        type="text" 
                        placeholder="Reason for rejection"
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        className="w-full p-2 mb-2 border border-red-300 rounded focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button onClick={handleReject} disabled={actionLoading === "Reject"} className="flex-1 bg-red-600 text-white py-1.5 rounded text-sm font-medium">Submit</button>
                        <button onClick={() => setShowRejectInput(false)} className="flex-1 bg-white text-gray-600 border border-gray-300 py-1.5 rounded text-sm font-medium">Cancel</button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {returnReq.status === "RETURN_APPROVED" && (
                <button
                  onClick={() => handleAction("broadcast", {}, "Broadcast")}
                  disabled={actionLoading === "Broadcast"}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-70"
                >
                  {actionLoading === "Broadcast" ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  Broadcast to Delivery Partners
                </button>
              )}

              {returnReq.status === "RETURN_RECEIVED_BY_SELLER" && (
                <>
                  {!showRefundInput ? (
                    <button
                      onClick={() => setShowRefundInput(true)}
                      className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-lg font-medium transition-colors"
                    >
                      <CreditCard className="w-5 h-5" />
                      Complete Refund
                    </button>
                  ) : (
                    <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg space-y-2">
                      <input 
                        type="text" 
                        placeholder="Transaction Reference Number"
                        value={refundRef}
                        onChange={e => setRefundRef(e.target.value)}
                        className="w-full p-2 border border-purple-300 rounded focus:outline-none text-sm"
                      />
                      <input 
                        type="text" 
                        placeholder="Refund Notes (Optional)"
                        value={refundNotes}
                        onChange={e => setRefundNotes(e.target.value)}
                        className="w-full p-2 border border-purple-300 rounded focus:outline-none text-sm"
                      />
                      <div className="flex gap-2 pt-1">
                        <button onClick={handleCompleteRefund} disabled={actionLoading === "Complete Refund"} className="flex-1 bg-purple-600 text-white py-1.5 rounded text-sm font-medium">Complete</button>
                        <button onClick={() => setShowRefundInput(false)} className="flex-1 bg-white text-gray-600 border border-gray-300 py-1.5 rounded text-sm font-medium">Cancel</button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {returnReq.status === "REFUND_COMPLETED" && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-center">
                  <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                  <p className="font-semibold text-emerald-800">Refund Completed</p>
                  <p className="text-xs text-emerald-600 mt-1">Ref: {returnReq.transactionReferenceNumber}</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-gray-200 dark:border-neutral-700 p-6">
            <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-4">Timeline</h3>
            <div className="space-y-4">
              {returnReq.statusHistory?.map((history, idx) => (
                <div key={idx} className="flex gap-3 relative">
                  {idx !== returnReq.statusHistory.length - 1 && (
                    <div className="absolute left-1.5 top-5 bottom-[-16px] w-[2px] bg-gray-200 dark:bg-neutral-700"></div>
                  )}
                  <div className="w-3 h-3 rounded-full bg-emerald-500 mt-1.5 shrink-0 relative z-10"></div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{history.status.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(history.timestamp).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 font-medium">
                      By: {history.updatedBy}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {selectedImage && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={() => setSelectedImage(null)}>
          <button 
            onClick={() => setSelectedImage(null)} 
            className="absolute top-4 right-4 text-white hover:text-gray-300 p-2.5 rounded-full bg-white/10 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <img 
            src={selectedImage} 
            alt="Preview" 
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()} 
          />
        </div>
      )}
    </div>
  );
};

export default ReturnDetails;
