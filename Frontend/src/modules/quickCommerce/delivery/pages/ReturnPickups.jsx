import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Package, Check, X, MapPin } from "lucide-react";
import { toast } from "sonner";
import axiosInstance from "@core/api/axios";

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

const ReturnPickups = () => {
  const navigate = useNavigate();
  const [pickups, setPickups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchActivePickups();
    // In a real implementation we would also listen for socket events here:
    // socket.on('new_return_pickup_available', (payload) => setPickups(prev => [payload, ...prev]));
    // socket.on('remove_return_pickup', ({returnId}) => setPickups(prev => prev.filter(p => p._id !== returnId)));
  }, []);

  const fetchActivePickups = async () => {
    try {
      const response = await axiosInstance.get('/quick-commerce/delivery/returns/active');
      const data = response.data || {};
      if (data.success) {
        setPickups(data.activePickups || []);
        
        // If there's an already accepted one, redirect to active screen
        const activeOne = data.activePickups?.find(p => p.status === 'RETURN_PICKUP_ASSIGNED' || p.status === 'PICKED_UP');
        if (activeOne) {
          navigate(`/delivery/quick-commerce/returns/${activeOne._id}/active`);
        }
      }
    } catch (error) {
      toast.error("Error loading return pickups");
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (id) => {
    setActionLoading(true);
    try {
      const response = await axiosInstance.put(`/quick-commerce/delivery/returns/${id}/accept`);
      const data = response.data || {};
      if (data.success) {
        toast.success("Return pickup accepted");
        navigate(`/delivery/quick-commerce/returns/${id}/active`);
      } else {
        toast.error(data.message || "Failed to accept pickup");
        // Remove from list if someone else took it
        setPickups(prev => prev.filter(p => p._id !== id));
      }
    } catch (error) {
      toast.error("Error accepting pickup");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (id) => {
    // Optimistic UI update
    setPickups(prev => prev.filter(p => p._id !== id));
    try {
      await axiosInstance.put(`/quick-commerce/delivery/returns/${id}/reject-broadcast`);
    } catch (error) {
      console.error("Failed to register reject");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-emerald-600" size={24} />
      </div>
    );
  }

  return (
    <div className="p-4 bg-gray-50 min-h-screen pb-20">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Return Pickups</h1>
      </div>

      <div className="space-y-4">
        {pickups.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center shadow-sm">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No return pickup requests available right now.</p>
          </div>
        ) : (
          pickups.map((pickup) => (
            <div key={pickup._id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-gray-900">Return Pickup</h3>
                  {(() => {
                    const displayOrderId = typeof pickup.orderId === 'object' ? (pickup.orderId?.orderId || pickup.orderId?._id || '') : pickup.orderId;
                    const slicedOrderId = displayOrderId ? (displayOrderId.length > 6 ? displayOrderId.slice(-6).toUpperCase() : displayOrderId.toUpperCase()) : "";
                    return <p className="text-sm text-gray-500 mt-0.5">Order #{slicedOrderId}</p>;
                  })()}
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold text-emerald-600">₹{pickup.returnPickupEarning || '20.00'}</span>
                  <p className="text-xs text-gray-400">Estimated Earning</p>
                </div>
              </div>

              <div className="space-y-3 mb-4">
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase">Pickup From Customer</p>
                    <p className="text-sm text-gray-800 font-medium">{pickup.userId?.name || "Customer"}</p>
                    <p className="text-xs text-gray-600 line-clamp-1">{formatAddress(pickup.orderId?.deliveryAddress || pickup.userId?.address) || "Customer Address"}</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase">Drop to Seller</p>
                    <p className="text-sm text-gray-800 font-medium">{pickup.sellerId?.shopName || pickup.sellerId?.name || "Seller Store"}</p>
                    <p className="text-xs text-gray-600 line-clamp-1">{formatAddress(pickup.sellerId?.location?.address || pickup.sellerId?.location?.formattedAddress || pickup.sellerId?.address) || "Seller Address"}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Phone: {pickup.sellerId?.phone || "N/A"}</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => handleReject(pickup._id)}
                  disabled={actionLoading}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-colors flex justify-center items-center gap-2"
                >
                  <X className="w-4 h-4" /> Reject
                </button>
                <button
                  onClick={() => handleAccept(pickup._id)}
                  disabled={actionLoading}
                  className="flex-[2] py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors shadow-sm flex justify-center items-center gap-2"
                >
                  {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />} Accept
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ReturnPickups;
