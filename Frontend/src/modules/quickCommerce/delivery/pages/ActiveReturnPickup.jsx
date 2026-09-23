import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, Package, MapPin, CheckCircle, Upload, ArrowRight, ArrowLeft, X } from "lucide-react";
import { toast } from "sonner";
import { convertToWebP } from "../../../../shared/utils/imageUploadUtils.js";
import { ImageSourcePicker } from "@food/components/ImageSourcePicker";
import apiClient from "../../../../services/api/axios";
import { OrderSummaryModal } from "@/modules/DeliveryV2/components/modals/OrderSummaryModal";

const formatAddress = (addr) => {
  if (!addr) return '';
  if (typeof addr === 'string') return addr;
  if (typeof addr === 'object') {
    return [
      addr.street || addr.addressLine1 || addr.address || '',
      addr.additionalDetails || addr.area || '',
      addr.city || '',
      addr.state || '',
      addr.zipCode || addr.pincode || '',
      addr.country || ''
    ]
      .map(v => String(v || '').trim())
      .filter(Boolean)
      .join(', ');
  }
  return '';
};

const ActiveReturnPickup = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [returnReq, setReturnReq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  
  const [otp, setOtp] = useState("");
  const [pickupImage, setPickupImage] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    fetchActivePickup();
  }, [id]);

  const fetchActivePickup = async () => {
    try {
      const response = await apiClient.get('/quick-commerce/delivery/returns/active', { contextModule: 'delivery' });
      const data = response.data || {};
      if (data.success) {
        const found = data.activePickups?.find(p => p._id === id);
        if (found) {
          setReturnReq(found);
          setLoading(false);
        } else {
          toast.error("Active return pickup not found");
          navigate("/delivery/quick-commerce/returns");
        }
      }
    } catch (error) {
      console.warn("Network error fetching active pickup, retrying in 2 seconds...");
      setTimeout(fetchActivePickup, 2000);
    }
  };

  const handleImageSelected = async (file) => {
    if (!file) return;
    try {
      const compressedFile = await convertToWebP(file);
      const reader = new FileReader();
      reader.readAsDataURL(compressedFile);
      reader.onloadend = () => {
        setPickupImage(reader.result);
      };
    } catch (err) {
      console.error("Image loading failed:", err);
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = () => {
        setPickupImage(reader.result);
      };
    }
  };

  const handleConfirmPickup = async () => {
    if (!otp || otp.length !== 4) {
      toast.error("Please enter a valid 4-digit OTP from customer");
      return;
    }
    if (!pickupImage) {
      toast.error("Please upload a photo of the picked up item");
      return;
    }

    setActionLoading(true);
    try {
      const response = await apiClient.post(`/quick-commerce/delivery/returns/${id}/confirm-pickup`, { otp, pickupImage }, { contextModule: 'delivery' });
      const data = response.data || {};
      if (data.success) {
        toast.success("Pickup confirmed!");
        if (data.returnRequest) {
          setReturnReq(data.returnRequest);
        } else {
          setReturnReq({ ...returnReq, status: "PICKED_UP" });
        }
      } else {
        toast.error(data.message || "Failed to confirm pickup");
      }
    } catch (error) {
      toast.error("Error confirming pickup");
    } finally {
      setActionLoading(false);
    }
  };

  const getCustomerMapUrl = () => {
    const custCoords = returnReq?.orderId?.deliveryAddress?.location?.coordinates || returnReq?.orderId?.deliveryAddress?.coordinates;
    if (custCoords && custCoords.length === 2) {
      // Assuming GeoJSON [lng, lat]
      return `https://www.google.com/maps/dir/?api=1&destination=${custCoords[1]},${custCoords[0]}`;
    }
    const customerAddressResolved = formatAddress(returnReq?.orderId?.deliveryAddress || returnReq?.userId?.address) || "Customer Address";
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customerAddressResolved)}`;
  };

  const getSellerMapUrl = () => {
    const sellCoords = returnReq?.sellerId?.location?.coordinates;
    if (sellCoords && sellCoords.length === 2) {
      return `https://www.google.com/maps/dir/?api=1&destination=${sellCoords[1]},${sellCoords[0]}`;
    }
    const sellerAddress = returnReq?.sellerId?.location?.address || returnReq?.sellerId?.location?.formattedAddress || returnReq?.sellerId?.address;
    if (sellerAddress) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formatAddress(sellerAddress))}`;
    }
    return '';
  };

  const handleNavigateToDrop = () => {
    const mapsUrl = getSellerMapUrl();
    if (mapsUrl) {
      window.open(mapsUrl, "_blank");
      toast.success("Opening Google Maps for seller location...");
    } else {
      toast.error("Seller address not available");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-emerald-600" size={24} />
      </div>
    );
  }

  if (!returnReq) return null;

  const sellerNameResolved = returnReq.sellerId?.shopName || returnReq.sellerId?.name || "Seller Store";
  const sellerAddressResolved = formatAddress(returnReq.sellerId?.location?.address || returnReq.sellerId?.location?.formattedAddress || returnReq.sellerId?.address) || "Seller Address";
  const customerAddressResolved = formatAddress(returnReq.orderId?.deliveryAddress || returnReq.userId?.address) || "Customer Address";
  const displayOrderId = typeof returnReq.orderId === 'object' ? (returnReq.orderId?.orderId || returnReq.orderId?._id || '') : returnReq.orderId;
  const slicedOrderId = displayOrderId ? (displayOrderId.length > 6 ? displayOrderId.slice(-6).toUpperCase() : displayOrderId.toUpperCase()) : "";

  return (
    <div className="p-4 bg-gray-50 min-h-screen pb-24">
      <div className="mb-4 flex items-center gap-3">
        <button 
          onClick={() => navigate("/food/delivery")}
          className="p-2 -ml-2 rounded-full hover:bg-gray-200 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Active Return</h1>
          <p className="text-sm text-gray-500">Order #{slicedOrderId}</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Customer Details Block */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h3 className="font-semibold text-gray-900 mb-4 uppercase tracking-wide text-xs">Customer Details (Pickup)</h3>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-base text-gray-800 font-bold">{returnReq.userId?.name || "Customer"}</p>
                <p className="text-sm text-gray-600 mt-1">{customerAddressResolved}</p>
                <p className="text-sm text-gray-500 mt-1">Phone: {returnReq.userId?.phone || "N/A"}</p>
              </div>
            </div>
            <button 
              onClick={() => {
                const url = getCustomerMapUrl();
                if (url) window.open(url, "_blank");
                else toast.error("Customer location not available");
              }}
              className="p-2.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors shrink-0 flex items-center justify-center border border-blue-100 active:scale-95"
              title="Open Customer Location in Google Maps"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Product Info Block */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h3 className="font-semibold text-gray-900 mb-4 uppercase tracking-wide text-xs">Product Info</h3>
          <div className="flex gap-4">
            <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden shrink-0">
              {returnReq.productId?.image ? (
                <img src={returnReq.productId.image} alt="Product" className="w-full h-full object-cover" />
              ) : <Package className="w-full h-full p-3 text-gray-400" />}
            </div>
            <div>
              <h4 className="font-bold text-gray-800">{returnReq.productId?.name || "Product"}</h4>
              <p className="text-sm text-gray-500">Qty: {returnReq.quantity}</p>
            </div>
          </div>
        </div>

        {/* Customer Uploaded Photos Block */}
        {returnReq.userImages && returnReq.userImages.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 className="font-semibold text-gray-900 mb-3 uppercase tracking-wide text-xs">Customer Uploaded Photos</h3>
            <div className="flex flex-wrap gap-2">
              {returnReq.userImages.map((imgUrl, idx) => (
                <div 
                  key={idx} 
                  className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden border border-gray-200 shrink-0 cursor-pointer hover:opacity-90 active:scale-95 transition-all" 
                  onClick={() => setSelectedImage(imgUrl)}
                >
                  <img src={imgUrl} alt={`Customer Upload ${idx + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Panel based on state */}
        {returnReq.status === "RETURN_PICKUP_ASSIGNED" && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-4">
            <h3 className="font-semibold text-gray-900 uppercase tracking-wide text-xs">Confirm Pickup</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Enter OTP from Customer</label>
              <input 
                type="text" 
                maxLength="4"
                value={otp}
                onChange={e => setOtp(e.target.value)}
                placeholder="4-digit OTP"
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-center text-xl tracking-[0.5em] font-bold focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Upload Product Photo</label>
              {pickupImage ? (
                <div className="relative w-full h-32 rounded-lg overflow-hidden border border-gray-200">
                  <img src={pickupImage} alt="Pickup" className="w-full h-full object-cover" />
                  <button 
                    onClick={() => setPickupImage("")} 
                    className="absolute top-2 right-2 bg-red-600 text-white p-1.5 rounded-full hover:bg-red-700 transition-colors shadow"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowPicker(true)}
                  className="w-full border-2 border-dashed border-gray-300 rounded-lg p-5 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors bg-white outline-none active:scale-[0.98]"
                >
                  <Upload className="w-6 h-6 text-gray-400 mb-1" />
                  <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Upload Photo</span>
                </button>
              )}
            </div>

            <button
              onClick={handleConfirmPickup}
              disabled={actionLoading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl shadow-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-70"
            >
              {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
              Verify & Confirm Pickup
            </button>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-gray-100"></div>
              <span className="flex-shrink mx-4 text-gray-400 text-[10px] font-bold uppercase tracking-wider">Or</span>
              <div className="flex-grow border-t border-gray-100"></div>
            </div>

            <button
              onClick={async () => {
                setActionLoading(true);
                try {
                  const response = await apiClient.put(`/quick-commerce/delivery/returns/${id}/status`, { status: "PICKED_UP" }, { contextModule: 'delivery' });
                  const data = response.data || {};
                  if (data.success) {
                    toast.success("Status manually updated to PICKED_UP");
                    if (data.returnRequest) {
                      setReturnReq(data.returnRequest);
                    } else {
                      setReturnReq({ ...returnReq, status: "PICKED_UP" });
                    }
                  } else {
                    toast.error(data.message || "Failed to update status");
                  }
                } catch (error) {
                  toast.error("Error updating status");
                } finally {
                  setActionLoading(false);
                }
              }}
              disabled={actionLoading}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2.5 rounded-lg text-xs transition-colors flex items-center justify-center gap-2"
            >
              Manual Mark as Picked Up
            </button>
          </div>
        )}

        {returnReq.status === "PICKED_UP" && (
          <div className="bg-emerald-50 rounded-xl shadow-sm border border-emerald-100 p-5 text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-bold text-emerald-900 text-lg">Product Picked Up</h3>
              <p className="text-sm text-emerald-700 mt-1">Please drop the item at the seller's location.</p>
            </div>

            <div className="text-left bg-white p-4 rounded-lg border border-emerald-100 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                <div>
                  <h4 className="font-semibold text-gray-900 text-sm mb-1">Drop to Seller</h4>
                  <p className="text-gray-800 font-bold">{sellerNameResolved}</p>
                  <p className="text-sm text-gray-600 mt-1">{sellerAddressResolved}</p>
                  <p className="text-sm text-gray-500 mt-1">Phone: {returnReq.sellerId?.phone || "N/A"}</p>
                </div>
              </div>
              <button 
                onClick={handleNavigateToDrop}
                className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors shrink-0 flex items-center justify-center border border-emerald-100 active:scale-95"
                title="Open Seller Location in Google Maps"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>

            <button
              onClick={handleNavigateToDrop}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl shadow-sm flex items-center justify-center gap-2"
            >
              Navigate to Drop Location <ArrowRight className="w-4 h-4" />
            </button>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-emerald-200/50"></div>
              <span className="flex-shrink mx-4 text-emerald-600 text-[10px] font-bold uppercase tracking-wider">Or</span>
              <div className="flex-grow border-t border-emerald-200/50"></div>
            </div>

            <button
              onClick={async () => {
                setActionLoading(true);
                try {
                  const response = await apiClient.put(`/quick-commerce/delivery/returns/${id}/status`, { status: "RETURN_RECEIVED_BY_SELLER" }, { contextModule: 'delivery' });
                  const data = response.data || {};
                  if (data.success) {
                    toast.success("Status manually updated to RETURN_RECEIVED_BY_SELLER");
                    if (data.returnRequest) {
                      setReturnReq(data.returnRequest);
                    } else {
                      setReturnReq({ ...returnReq, status: "RETURN_RECEIVED_BY_SELLER" });
                    }
                    setShowSummary(true);
                  } else {
                    toast.error(data.message || "Failed to update status");
                  }
                } catch (error) {
                  toast.error("Error updating status");
                } finally {
                  setActionLoading(false);
                }
              }}
              disabled={actionLoading}
              className="w-full bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-bold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              Mark as Received by Seller
            </button>
          </div>
        )}

        {(returnReq.status === "RETURN_RECEIVED_BY_SELLER" || returnReq.status === "REFUND_COMPLETED") && (
          <div className="bg-emerald-50 rounded-xl shadow-sm border border-emerald-100 p-5 text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-bold text-emerald-900 text-lg">Return Dropped Off</h3>
              <p className="text-sm text-emerald-700 mt-1">This package has been successfully delivered to the seller.</p>
            </div>
            <div className="text-left bg-white p-4 rounded-lg border border-emerald-100">
              <p className="text-sm font-semibold text-gray-500 uppercase">Seller</p>
              <p className="text-base text-gray-800 font-bold mt-0.5">{sellerNameResolved}</p>
              <p className="text-sm text-gray-600 mt-1">{sellerAddressResolved}</p>
            </div>
          </div>
        )}

      </div>

      <ImageSourcePicker
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        onFileSelect={handleImageSelected}
        title="Upload Product Photo"
        description="Capture or choose product photo to verify pickup."
        fileNamePrefix={`return-pickup-${id}`}
      />

      {selectedImage && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={() => setSelectedImage(null)}>
          <button 
            onClick={() => setSelectedImage(null)} 
            className="absolute top-4 right-4 text-white hover:text-gray-300 p-2 rounded-full bg-white/10 transition-colors"
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

      {showSummary && (
        <OrderSummaryModal
          order={{
            orderId: displayOrderId || returnReq._id,
            earnings: returnReq.returnPickupEarning || 0
          }}
          onDone={() => navigate('/food/delivery/feed')}
        />
      )}
    </div>
  );
};

export default ActiveReturnPickup;
