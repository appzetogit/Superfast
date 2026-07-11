import { useState, useEffect } from "react"
import { Eye, MapPin, Package, User, Phone, Mail, Calendar, Clock, Truck, CreditCard, X, Receipt, CheckCircle2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@food/components/ui/dialog"
const debugLog = (...args) => { }
const debugWarn = (...args) => { }
const debugError = (...args) => { }


const getStatusColor = (orderStatus) => {
  const colors = {
    "Delivered": "bg-emerald-100 text-emerald-700",
    "Pending": "bg-blue-100 text-blue-700",
    "Scheduled": "bg-blue-100 text-blue-700",
    "Accepted": "bg-green-100 text-green-700",
    "Processing": "bg-orange-100 text-orange-700",
    "Food On The Way": "bg-yellow-100 text-yellow-700",
    "Canceled": "bg-rose-100 text-rose-700",
    "Cancelled by Restaurant": "bg-red-100 text-red-700",
    "Cancelled by User": "bg-orange-100 text-orange-700",
    "Payment Failed": "bg-red-100 text-red-700",
    "Refunded": "bg-sky-100 text-sky-700",
    "Dine In": "bg-indigo-100 text-indigo-700",
    "Offline Payments": "bg-slate-100 text-slate-700",
  }
  return colors[orderStatus] || "bg-slate-100 text-slate-700"
}

const getPaymentStatusColor = (paymentStatus) => {
  if (paymentStatus === "Paid" || paymentStatus === "Collected") return "text-emerald-600"
  if (paymentStatus === "Not Collected") return "text-amber-600"
  if (paymentStatus === "Unpaid" || paymentStatus === "Failed") return "text-red-600"
  return "text-slate-600"
}

// Status options: { label shown in UI -> raw DB enum value }
const ADMIN_STATUS_OPTIONS = [
  { label: 'Pending', value: 'placed' },
  { label: 'Processing', value: 'preparing' },
  { label: 'Handover', value: 'ready_for_pickup' },
  { label: 'Out For Delivery', value: 'picked_up' },
  { label: 'Delivered', value: 'delivered' },
  { label: 'Cancelled', value: 'cancelled_by_admin' },
];


export default function ViewOrderDialog({ isOpen, onOpenChange, order, onStatusUpdated }) {
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [availableDrivers, setAvailableDrivers] = useState([]);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [isLoadingDrivers, setIsLoadingDrivers] = useState(false);
  const [isSubmittingReassign, setIsSubmittingReassign] = useState(false);
  const [reassignMessage, setReassignMessage] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [localRawStatus, setLocalRawStatus] = useState(null);

  useEffect(() => {
    let timer;
    const lastEntry = order?.reassignmentHistory?.[order.reassignmentHistory.length - 1];
    if (order?.reassignmentStatus === 'pending' && lastEntry) {
      const calculateRemaining = () => {
        const elapsed = Math.floor((Date.now() - new Date(lastEntry.createdAt).getTime()) / 1000);
        return Math.max(0, 60 - elapsed);
      };
      setCountdown(calculateRemaining());

      timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setCountdown(0);
    }
    return () => clearInterval(timer);
  }, [order?.reassignmentStatus, order?.reassignmentHistory]);

  // Sync local status whenever a new order is shown
  useEffect(() => {
    if (order?.rawOrderStatus) {
      setLocalRawStatus(order.rawOrderStatus);
    }
  }, [order?.rawOrderStatus, order?.id]);

  const handleStatusChange = async (newRawStatus) => {
    const orderId = order?.id || order?._id;
    if (!orderId || !newRawStatus || newRawStatus === localRawStatus) return;
    setIsUpdatingStatus(true);
    try {
      const { adminAPI } = await import('@/services/api');
      const response = await adminAPI.updateOrderStatus(orderId, newRawStatus);
      if (response?.data?.success !== false) {
        setLocalRawStatus(newRawStatus);
        toast.success('Order status updated');
        if (typeof onStatusUpdated === 'function') onStatusUpdated(orderId, newRawStatus);
      } else {
        toast.error(response?.data?.message || 'Failed to update status');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update status');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const fetchAvailableDrivers = async () => {
    if (!order) return;
    setIsLoadingDrivers(true);
    try {
      const { adminAPI } = await import('@/services/api');
      const res = await adminAPI.getAvailableDriversForOrder(order.id || order._id);
      const list = res?.data?.data?.drivers || res?.data?.drivers || [];
      setAvailableDrivers(list);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingDrivers(false);
    }
  };

  useEffect(() => {
    if (showReassignModal) {
      fetchAvailableDrivers();
    }
  }, [showReassignModal]);

  if (!order) return null

  // Debug: Log order data to check billImageUrl
  if (order.billImageUrl) {
    debugLog('?? Bill Image URL found:', order.billImageUrl)
  } else {
    debugLog('?? Bill Image URL not found in order:', {
      orderId: order.orderId,
      hasBillImageUrl: !!order.billImageUrl,
      orderKeys: Object.keys(order)
    })
  }

  // Format address for display
  const formatAddress = (address) => {
    if (!address || typeof address !== "object") return "N/A"

    const formattedAddress = String(address.formattedAddress || "").trim()
    const rawAddress = String(address.address || "").trim()
    const parts = [
      formattedAddress,
      rawAddress,
      address.label,
      address.street,
      address.additionalDetails,
      address.landmark,
      address.addressLine1,
      address.addressLine2,
      address.area,
      address.city,
      address.state,
      address.zipCode,
      address.postalCode,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean)

    const uniqueParts = []
    parts.forEach((part) => {
      const key = part.toLowerCase()
      const isContained = uniqueParts.some((existingPart) => {
        const existingKey = existingPart.toLowerCase()
        return existingKey === key || existingKey.includes(key) || key.includes(existingKey)
      })
      if (isContained) return
      uniqueParts.push(part)
    })

    return uniqueParts.length > 0 ? uniqueParts.join(", ") : "Address not available"
  }

  // Get coordinates if available
  const getCoordinates = (address) => {
    if (address?.location?.coordinates && Array.isArray(address.location.coordinates) && address.location.coordinates.length === 2) {
      const [lng, lat] = address.location.coordinates
      return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
    }
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] bg-white p-0 overflow-y-auto">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-[var(--primary-theme)]" />
            Order Details
          </DialogTitle>
          <DialogDescription>
            View complete information about this order
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 py-6 space-y-6">
          {/* Basic Order Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Order ID
                </p>
                <p className="text-sm font-medium text-slate-900">{order.orderId || order.id || order.subscriptionId}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Order Date
                </p>
                <p className="text-sm font-medium text-slate-900">{order.date}{order.time ? `, ${order.time}` : ""}</p>
              </div>
              {order.orderOtp && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-[var(--primary-theme)] uppercase tracking-wider flex items-center gap-2 font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    Handover Code (OTP)
                  </p>
                  <p className="text-lg font-bold text-slate-950 tracking-[0.2em]">{order.orderOtp}</p>
                </div>
              )}
              {order.estimatedDeliveryTime && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Estimated Delivery Time
                  </p>
                  <p className="text-sm font-medium text-slate-900">{order.estimatedDeliveryTime} minutes</p>
                </div>
              )}
              {order.deliveredAt && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Delivered At
                  </p>
                  <p className="text-sm font-medium text-slate-900">
                    {new Date(order.deliveredAt).toLocaleString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }).toUpperCase()}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {order.orderStatus && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    Order Status
                    {isUpdatingStatus && <Loader2 className="w-3 h-3 animate-spin text-[var(--primary-theme)]" />}
                  </p>
                  <div className="relative">
                    {(() => {
                      const currentStatus = localRawStatus || order.rawOrderStatus || '';
                      const isDisabled = isUpdatingStatus || ['delivered', 'cancelled_by_admin', 'cancelled_by_restaurant', 'cancelled_by_user'].includes(currentStatus);
                      
                      // Find index of current status to disable moving backwards
                      let currentIndex = ADMIN_STATUS_OPTIONS.findIndex(opt => opt.value === currentStatus);
                      // If current status is something like 'confirmed' or 'created', we can treat it as 'placed' for the purpose of the dropdown hierarchy
                      if (currentIndex === -1 && ['created', 'confirmed'].includes(currentStatus)) {
                         currentIndex = 0; // Treat as Pending
                      }

                      return (
                        <select
                          id="admin-order-status-select"
                          value={currentStatus}
                          onChange={(e) => handleStatusChange(e.target.value)}
                          disabled={isDisabled}
                          className="w-full text-sm font-medium rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer appearance-none"
                          style={{ minWidth: 160 }}
                        >
                          {ADMIN_STATUS_OPTIONS.map((opt, idx) => {
                            // Disable previous statuses in the workflow (can't go backwards)
                            // "Cancelled" (the last option) is always available unless the whole select is disabled.
                            const isOptionDisabled = currentIndex !== -1 && idx < currentIndex && opt.value !== 'cancelled_by_admin';
                            return (
                              <option key={opt.value} value={opt.value} disabled={isOptionDisabled}>
                                {opt.label}
                              </option>
                            );
                          })}
                        </select>
                      );
                    })()}
                    <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                      <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>
                  {order.cancellationReason && (
                    <p className="text-xs text-red-600 mt-1">
                      <span className="font-medium">
                        {order.cancelledBy === 'user' ? 'Cancelled by User - ' :
                          order.cancelledBy === 'restaurant' ? 'Cancelled by Restaurant - ' :
                            'Cancellation '}Reason:
                      </span> {order.cancellationReason}
                    </p>
                  )}
                  {order.cancelledAt && (
                    <p className="text-xs text-slate-500 mt-1">
                      Cancelled: {new Date(order.cancelledAt).toLocaleString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      }).toUpperCase()}
                    </p>
                  )}
                </div>
              )}
              {(order.paymentStatus || order.paymentCollectionStatus != null) && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    Payment Status
                  </p>
                  <p className={`text-sm font-medium ${getPaymentStatusColor(
                    order.paymentType === 'Cash on Delivery' || order.payment?.method === 'cash' || order.payment?.method === 'cod'
                      ? (order.paymentCollectionStatus ? 'Collected' : (order.status === 'delivered' ? 'Collected' : 'Not Collected'))
                      : order.paymentStatus
                  )}`}>
                    {order.paymentType === 'Cash on Delivery' || order.payment?.method === 'cash' || order.payment?.method === 'cod'
                      ? (order.paymentCollectionStatus ? 'Collected' : (order.status === 'delivered' ? 'Collected' : 'Not Collected'))
                      : order.paymentStatus}
                  </p>
                </div>
              )}
              {order.deliveryType && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Truck className="w-4 h-4" />
                    Delivery Type
                  </p>
                  <p className="text-sm font-medium text-slate-900">{order.deliveryType}</p>
                </div>
              )}
            </div>
          </div>

          {/* Customer Information */}
          <div className="border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <User className="w-4 h-4" />
              Customer Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer Name</p>
                <p className="text-sm font-medium text-slate-900">{order.customerName || "N/A"}</p>
              </div>
              {order.customerPhone && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Phone
                  </p>
                  <p className="text-sm font-medium text-slate-900">{order.customerPhone}</p>
                </div>
              )}
              {order.customerEmail && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Email
                  </p>
                  <p className="text-sm font-medium text-slate-900">{order.customerEmail}</p>
                </div>
              )}
            </div>
          </div>

          {/* Restaurant Information */}
          {order.restaurant && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Restaurant Information</h3>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Restaurant Name</p>
                <p className="text-sm font-medium text-slate-900">{order.restaurant}</p>
              </div>
            </div>
          )}

          {/* Order Items */}
          {order.items && Array.isArray(order.items) && order.items.length > 0 && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Order Items ({order.items.length})
              </h3>
              <div className="space-y-3">
                {order.items.map((item, index) => (
                  <div key={index} className="flex items-start justify-between p-3 bg-slate-50 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-700 bg-white px-2 py-1 rounded">
                          {item.quantity || 1}x
                        </span>
                        <p className="text-sm font-medium text-slate-900">{item.name || "Unknown Item"}</p>
                        {item.isVeg !== undefined && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${item.isVeg ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {item.isVeg ? 'Veg' : 'Non-Veg'}
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-xs text-slate-500 mt-1 ml-8">{item.description}</p>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-slate-900">
                      ₹{((item.price || 0) * (item.quantity || 1)).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bill Image (Captured by Delivery Boy) */}
          {(order.billImageUrl || order.billImage || order.deliveryState?.billImageUrl) && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[var(--primary-theme)]" />
                Bill Image (Captured by Delivery Boy)
              </h3>
              <div className="space-y-3">
                <div className="relative w-full max-w-2xl border-2 border-slate-300 rounded-xl overflow-hidden bg-white shadow-sm">
                  <img
                    src={order.billImageUrl || order.billImage || order.deliveryState?.billImageUrl}
                    alt="Order Bill"
                    className="w-full h-auto object-contain max-h-[500px] mx-auto block"
                    loading="lazy"
                    onError={(e) => {
                      debugError('? Failed to load bill image:', e.target.src)
                      e.target.style.display = 'none';
                      const errorDiv = e.target.parentElement.querySelector('.error-message');
                      if (errorDiv) errorDiv.style.display = 'block';
                    }}
                    onLoad={() => {
                      debugLog('? Bill image loaded successfully')
                    }}
                  />
                  <div className="error-message hidden p-6 text-center text-slate-500 text-sm bg-slate-50">
                    <Receipt className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                    Failed to load bill image
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <a
                    href={order.billImageUrl || order.billImage || order.deliveryState?.billImageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
                  >
                    <Eye className="w-4 h-4" />
                    View Full Size
                  </a>
                  <a
                    href={order.billImageUrl || order.billImage || order.deliveryState?.billImageUrl}
                    download
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    <Package className="w-4 h-4" />
                    Download
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Delivery Address */}
          {order.address && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Delivery Address
              </h3>
              <div className="space-y-2 p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-900">{formatAddress(order.address)}</p>
                {getCoordinates(order.address) && (
                  <p className="text-xs text-slate-500 mt-2">
                    <span className="font-medium">Coordinates:</span> {getCoordinates(order.address)}
                  </p>
                )}
                {order.address.label && (
                  <p className="text-xs text-slate-500">
                    <span className="font-medium">Label:</span> {order.address.label}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Delivery Partner Information */}
          {(order.deliveryPartnerName || order.deliveryPartnerPhone) && (
            <div className="border-t border-slate-200 pt-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 m-0">
                  <Truck className="w-4 h-4" />
                  Delivery Partner
                </h3>
                {['created', 'confirmed', 'preparing', 'ready_for_pickup', 'picked_up'].includes(order.orderStatus) && (
                  <button
                    type="button"
                    disabled={order.reassignmentStatus === 'pending' || countdown > 0}
                    onClick={() => setShowReassignModal(true)}
                    className="px-3 py-1.5 bg-[var(--primary-theme)] hover:bg-orange-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
                  >
                    Reassign Driver
                  </button>
                )}
              </div>
              {(order.reassignmentStatus === 'pending' || countdown > 0) && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between text-xs text-amber-800">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 animate-pulse" />
                    <span>Reassignment offer pending acceptance...</span>
                  </div>
                  <span className="font-bold text-sm bg-amber-100 px-2 py-0.5 rounded">{countdown}s</span>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {order.deliveryPartnerName && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</p>
                    <p className="text-sm font-medium text-slate-900">{order.deliveryPartnerName}</p>
                  </div>
                )}
                {order.deliveryPartnerPhone && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Phone</p>
                    <p className="text-sm font-medium text-slate-900">{order.deliveryPartnerPhone}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pricing Breakdown */}
          <div className="border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Pricing Breakdown</h3>
            <div className="space-y-2">
              {order.totalItemAmount !== undefined && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="font-medium text-slate-900">₹{order.totalItemAmount.toFixed(2)}</span>
                </div>
              )}
              {order.itemDiscount !== undefined && order.itemDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Discount</span>
                  <span className="font-medium text-emerald-600">-₹{order.itemDiscount.toFixed(2)}</span>
                </div>
              )}
              {order.couponDiscount !== undefined && order.couponDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Coupon Discount</span>
                  <span className="font-medium text-emerald-600">-₹{order.couponDiscount.toFixed(2)}</span>
                </div>
              )}
              {order.deliveryCharge !== undefined && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Delivery Charge</span>
                  <span className="font-medium text-slate-900">
                    {order.deliveryCharge > 0 ? `₹${order.deliveryCharge.toFixed(2)}` : <span className="text-emerald-600">Free delivery</span>}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Platform Fee</span>
                <span className="font-medium text-slate-900">
                  {order.platformFee !== undefined && order.platformFee > 0
                    ? `₹${order.platformFee.toFixed(2)}`
                    : <span className="text-slate-400">₹0.00</span>}
                </span>
              </div>
              {order.vatTax !== undefined && order.vatTax > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Tax (GST)</span>
                  <span className="font-medium text-slate-900">₹{order.vatTax.toFixed(2)}</span>
                </div>
              )}
              <div className="pt-2 border-t border-slate-200">
                <div className="flex justify-between items-center">
                  <span className="text-base font-semibold text-slate-700">Total Amount</span>
                  <span className="text-xl font-bold text-emerald-600">
                    ₹{(order.totalAmount || order.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Reassign Driver Modal */}
        {showReassignModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[400] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-200 text-slate-800">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-950 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-[var(--primary-theme)]" />
                  Reassign Delivery Partner
                </h3>
                <button
                  type="button"
                  onClick={() => { setShowReassignModal(false); setReassignMessage(null); }}
                  className="p-1 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {reassignMessage && (
                  <div className={`p-3 rounded-lg text-xs font-semibold ${reassignMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                    }`}>
                    {reassignMessage.text}
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Available Drivers</label>
                  {isLoadingDrivers ? (
                    <p className="text-xs text-slate-400 py-2">Searching nearby online drivers...</p>
                  ) : availableDrivers.length === 0 ? (
                    <p className="text-xs text-red-500 py-2">No available drivers found nearby</p>
                  ) : (
                    <select
                      value={selectedDriverId}
                      onChange={(e) => setSelectedDriverId(e.target.value)}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--primary-theme)] bg-white"
                    >
                      <option value="">Select a driver...</option>
                      {availableDrivers.map((driver) => (
                        <option key={driver._id} value={driver._id}>
                          {driver.name} ({driver.distanceKm} km away)
                        </option>
                      ))}
                    </select>
                  )}
                </div>


                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Reason for Reassignment</label>
                  <textarea
                    value={reassignReason}
                    onChange={(e) => setReassignReason(e.target.value)}
                    placeholder="Optional reason..."
                    rows={3}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--primary-theme)] resize-none bg-white"
                  />
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => { setShowReassignModal(false); setReassignMessage(null); }}
                  className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmittingReassign || !selectedDriverId}
                  onClick={async () => {
                    setIsSubmittingReassign(true);
                    try {
                      const { adminAPI } = await import('@/services/api');
                      const res = await adminAPI.reassignOrder(order.id || order._id, selectedDriverId, reassignReason);
                      if (res?.data?.success || res?.success) {
                        setReassignMessage({ type: 'success', text: 'Reassignment request sent to the driver successfully!' });
                        setTimeout(() => {
                          setShowReassignModal(false);
                          setReassignMessage(null);
                          setSelectedDriverId("");
                          setReassignReason("");
                          onOpenChange(false); // Close details dialog
                        }, 2000);
                      } else {
                        setReassignMessage({ type: 'error', text: res?.data?.message || 'Failed to reassign driver' });
                      }
                    } catch (err) {
                      setReassignMessage({ type: 'error', text: err?.response?.data?.message || err?.message || 'Failed to reassign driver' });
                    } finally {
                      setIsSubmittingReassign(false);
                    }
                  }}
                  className="px-4 py-2 text-sm font-semibold text-white bg-[var(--primary-theme)] hover:bg-orange-700 disabled:bg-slate-300 rounded-lg shadow-sm"
                >
                  {isSubmittingReassign ? 'Reassigning...' : 'Confirm Reassign'}
                </button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}


