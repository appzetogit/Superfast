import React, { useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { ChevronLeft, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { customerApi } from "../services/customerApi";

const ReturnProductPage = () => {
  const navigate = useNavigate();
  const { orderId, productId } = useParams();
  const location = useLocation();
  const item = location.state?.item || {};
  
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState([]);
  const [refundMethod, setRefundMethod] = useState("Wallet");
  
  // Bank details
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [upiId, setUpiId] = useState("");

  const [loading, setLoading] = useState(false);

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    
    // Stub for image upload - in real app would use your cloud storage upload
    // const uploadedUrls = await Promise.all(files.map(uploadToCloudinary));
    // For now, we will just simulate it
    const fakeUrls = files.map(file => URL.createObjectURL(file));
    setImages(prev => [...prev, ...fakeUrls]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason) {
      toast.error("Please select a reason for return");
      return;
    }
    
    if (refundMethod === "Bank" && (!accountNumber || !ifsc || !accountHolder)) {
      toast.error("Please fill all bank details");
      return;
    }

    if (refundMethod === "UPI" && !upiId) {
      toast.error("Please enter UPI ID");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        orderId,
        productId,
        quantity,
        reason,
        description,
        userImages: images, // Use real uploaded URLs here in production
        refundMethod,
        bankDetails: refundMethod === "Bank" ? {
          accountNumber,
          ifscCode: ifsc,
          accountHolderName: accountHolder
        } : undefined,
        upiId: refundMethod === "UPI" ? upiId : undefined
      };

      const response = await customerApi.createReturnRequest(payload);
      const data = response.data || {};
      if (data.success) {
        toast.success("Return request submitted successfully");
        navigate("/quick/returns");
      } else {
        toast.error(data.message || "Failed to submit return request");
      }
    } catch (err) {
      console.error(err);
      toast.error("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const maxQuantity = item.quantity || item.qty || 1;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background pb-24 transition-colors">
      <div className="sticky top-0 z-30 mb-4 flex items-center gap-2 border-b border-slate-200/60 dark:border-white/5 bg-slate-50/95 dark:bg-background/95 px-4 pb-3 pt-4 backdrop-blur-sm transition-colors">
        <button
          onClick={() => navigate(-1)}
          className="-ml-1 flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-slate-200/70 dark:hover:bg-white/10"
        >
          <ChevronLeft size={22} className="text-slate-800 dark:text-slate-200" />
        </button>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Return Item
        </h1>
      </div>

      <div className="px-4 space-y-6">
        {/* Item Info */}
        <div className="flex gap-4 p-4 bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-slate-100 dark:border-white/5">
          <div className="w-16 h-16 bg-slate-100 rounded-lg overflow-hidden shrink-0">
            {item.image ? (
              <img src={item.image} alt="Product" className="w-full h-full object-cover" />
            ) : null}
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">{item.name || "Product"}</h3>
            <p className="text-sm text-slate-500">₹{item.price}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Quantity */}
          <div className="bg-white dark:bg-neutral-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-white/5">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Quantity to Return</h3>
            <div className="flex items-center gap-4">
              <button 
                type="button"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-neutral-700 flex items-center justify-center font-bold"
              >-</button>
              <span className="font-semibold">{quantity}</span>
              <button 
                type="button"
                onClick={() => setQuantity(Math.min(maxQuantity, quantity + 1))}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-neutral-700 flex items-center justify-center font-bold"
              >+</button>
              <span className="text-sm text-slate-500 ml-2">(Max: {maxQuantity})</span>
            </div>
          </div>

          {/* Reason */}
          <div className="bg-white dark:bg-neutral-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-white/5">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Reason for Return</h3>
            <select 
              value={reason} 
              onChange={(e) => setReason(e.target.value)}
              className="w-full p-3 rounded-lg bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700"
              required
            >
              <option value="">Select a reason</option>
              <option value="Damaged Product">Damaged Product</option>
              <option value="Wrong Item Delivered">Wrong Item Delivered</option>
              <option value="Expired Product">Expired Product</option>
              <option value="Quality Issue">Quality Issue</option>
              <option value="Missing Parts">Missing Parts</option>
            </select>

            <textarea 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Please provide more details (optional)"
              className="w-full mt-3 p-3 rounded-lg bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 h-24"
            ></textarea>
          </div>

          {/* Images */}
          <div className="bg-white dark:bg-neutral-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-white/5">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Upload Images</h3>
            <div className="flex flex-wrap gap-3">
              {images.map((img, i) => (
                <div key={i} className="w-20 h-20 rounded-lg overflow-hidden border border-slate-200">
                  <img src={img} alt="Upload" className="w-full h-full object-cover" />
                </div>
              ))}
              <label className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-300 dark:border-neutral-600 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 dark:hover:bg-neutral-700 transition-colors">
                <Upload size={20} className="text-slate-400" />
                <span className="text-[10px] text-slate-500 mt-1">Upload</span>
                <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
            </div>
          </div>

          {/* Refund Method */}
          <div className="bg-white dark:bg-neutral-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-white/5">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Refund Method</h3>
            <div className="flex gap-4 mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="refund" value="Wallet" checked={refundMethod === "Wallet"} onChange={() => setRefundMethod("Wallet")} className="text-blue-600" />
                <span>Wallet</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="refund" value="Bank" checked={refundMethod === "Bank"} onChange={() => setRefundMethod("Bank")} className="text-blue-600" />
                <span>Bank</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="refund" value="UPI" checked={refundMethod === "UPI"} onChange={() => setRefundMethod("UPI")} className="text-blue-600" />
                <span>UPI</span>
              </label>
            </div>

            {refundMethod === "Bank" && (
              <div className="space-y-3">
                <input type="text" placeholder="Account Number" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} className="w-full p-3 rounded-lg bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700" />
                <input type="text" placeholder="IFSC Code" value={ifsc} onChange={e => setIfsc(e.target.value)} className="w-full p-3 rounded-lg bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700" />
                <input type="text" placeholder="Account Holder Name" value={accountHolder} onChange={e => setAccountHolder(e.target.value)} className="w-full p-3 rounded-lg bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700" />
              </div>
            )}

            {refundMethod === "UPI" && (
              <div className="space-y-3">
                <input type="text" placeholder="UPI ID (e.g. name@okhdfc)" value={upiId} onChange={e => setUpiId(e.target.value)} className="w-full p-3 rounded-lg bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700" />
              </div>
            )}
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-[#0c831f] hover:bg-[#0a6d19] text-white py-3.5 rounded-xl font-bold flex items-center justify-center transition-colors shadow-sm disabled:opacity-70"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Submit Return Request"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ReturnProductPage;
