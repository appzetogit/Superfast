import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChefHat, MapPin, Phone, 
  ChevronDown, ChevronUp, Package, 
  Navigation, CheckCircle2, Camera, Loader2, Image as ImageIcon
} from 'lucide-react';
import { ActionSlider } from '@/modules/DeliveryV2/components/ui/ActionSlider';
import { uploadAPI } from '@food/api';
import { toast } from 'sonner';
import { openCamera, openGallery } from "@food/utils/imageUploadUtils";
import { isMixedOrder, normalizePickupPoints } from '@/modules/DeliveryV2/utils/orderRouting';

/**
 * PickupActionModal - Unified White/Green Theme with Slider Actions.
 * Includes Bill Upload feature prior to pickup.
 */
export const PickupActionModal = ({ 
  order, 
  status, 
  isWithinRange, 
  distanceToTarget,
  eta,
  onReachedPickup, 
  onPickedUp,
  onMinimize
}) => {
  const [showItems, setShowItems] = useState(true);
  const [isUploadingBill, setIsUploadingBill] = useState(false);
  const cameraInputRef = useRef(null);

  // Persist bill image state across remounts (e.g. returning from navigation app)
  const orderId = order?.orderId || order?._id || 'unknown';
  const storageKey = `bill_image_${orderId}`;

  const [billImageUrl, setBillImageUrl] = useState(() => {
    try { return sessionStorage.getItem(`${storageKey}_url`) || null; } catch { return null; }
  });
  const [billImageUploaded, setBillImageUploaded] = useState(() => {
    try { return sessionStorage.getItem(`${storageKey}_uploaded`) === 'true'; } catch { return false; }
  });

  const persistBillImage = (url) => {
    try {
      sessionStorage.setItem(`${storageKey}_url`, url || '');
      sessionStorage.setItem(`${storageKey}_uploaded`, 'true');
    } catch {}
  };

  const clearBillImage = () => {
    try {
      sessionStorage.removeItem(`${storageKey}_url`);
      sessionStorage.removeItem(`${storageKey}_uploaded`);
    } catch {}
  };


  if (!order) return null;

  const handleBillImageSelect = async (file) => {
    if (!file) return;

    setIsUploadingBill(true);
    try {
      let finalFile = file;
      if (file.type.startsWith('image/')) {
        const { compressImage } = await import('@/shared/utils/imageCompression');
        finalFile = await compressImage(file, { 
          maxSizeMB: 0.2, // 200KB max for bills
          maxWidthOrHeight: 1000,
          fileType: 'image/webp'
        });
      }

      if (finalFile.size > 5 * 1024 * 1024) {
        toast.error('Image size should be less than 5MB');
        setIsUploadingBill(false);
        return;
      }

      const res = await uploadAPI.uploadMedia(finalFile, { folder: 'superfast/delivery/bills' });
      if (res?.data?.success && res?.data?.data) {
        const url = res.data.data.url || res.data.data.secure_url;
        setBillImageUrl(url);
        setBillImageUploaded(true);
        persistBillImage(url);
        // toast.success('Bill image uploaded!');
      } else {
        throw new Error('Upload failed');
      }
    } catch (err) {
      toast.error('Failed to upload bill image');
      setBillImageUploaded(false);
      setBillImageUrl(null);
    } finally {
      setIsUploadingBill(false);
    }
  };

  const handleTakeCameraPhoto = () => {
    openCamera({
      onSelectFile: (file) => handleBillImageSelect(file),
      fileNamePrefix: `bill-${order.orderId || order._id}`
    })
  }

  const handlePickFromGallery = () => {
    openGallery({
      onSelectFile: (file) => handleBillImageSelect(file),
      fileNamePrefix: `bill-${order.orderId || order._id}`
    })
  }

  const isAtPickup = status === 'REACHED_PICKUP';
  const isQuickOrder = String(order?.orderType || order?.serviceType || order?.type || '').trim().toLowerCase() === 'quick';
  const restaurantName = isQuickOrder
    ? order?.storeName || order?.sellerName || order?.seller?.shopName || order?.seller?.name || 'Seller store'
    : order?.restaurantName || order?.restaurant_name || order?.restaurantId?.restaurantName || order?.restaurantId?.name || 'Restaurant';
  const restaurantAddress = isQuickOrder
    ? order?.storeAddress || order?.sellerAddress || order?.seller?.location?.address || order?.seller?.location?.formattedAddress || 'Address not available'
    : order?.restaurantAddress || order?.restaurant_address || order?.restaurantLocation?.address || 'Address not available';
  const restaurantPhone = isQuickOrder
    ? order?.storePhone || order?.sellerPhone || order?.seller?.phone || order?.seller?.ownerPhone || order?.seller?.primaryContactNumber || order?.seller?.contactNumber || order?.seller?.mobile || ''
    : order?.restaurantPhone || order?.restaurant_phone || order?.restaurantId?.phone || order?.restaurantId?.ownerPhone || order?.restaurantId?.primaryContactNumber || order?.restaurantId?.contactNumber || order?.restaurantId?.mobile || order?.restaurant?.phone || order?.restaurant?.ownerPhone || order?.restaurant?.primaryContactNumber || order?.restaurant?.contactNumber || order?.phone || '';
  const items = Array.isArray(order?.items) ? order.items : (Array.isArray(order?.products) ? order.products : (Array.isArray(order?.foodItems) ? order.foodItems : (Array.isArray(order?.cartItems) ? order.cartItems : [])));
  const restaurantLogo = isQuickOrder
    ? order?.storeImage || order?.seller?.logo || order?.seller?.image || order?.seller?.profileImage || 'https://cdn-icons-png.flaticon.com/512/3170/3170733.png'
    : order?.restaurantImage || order?.restaurant?.logo || order?.restaurant?.profileImage || 'https://cdn-icons-png.flaticon.com/512/3170/3170733.png';
  const pickupPoints = normalizePickupPoints(order);
  const mixedOrder = isMixedOrder(order);
  const pickupStops = pickupPoints.length
    ? pickupPoints
    : [
        {
          id: 'food:primary',
          pickupType: isQuickOrder ? 'quick' : 'food',
          sourceName: restaurantName,
          address: restaurantAddress,
          phone: restaurantPhone,
        },
      ];
  const primaryStop = pickupStops[0] || null;
  const primaryPickupType = primaryStop?.pickupType === 'quick' ? 'quick' : 'food';
  const primaryName = primaryStop?.sourceName || restaurantName;
  const primaryAddress = primaryStop?.address || restaurantAddress;
  const primaryPhone = primaryStop?.phone || restaurantPhone;
  const primaryDestinationLabel = primaryPickupType === 'quick' ? 'Store' : 'Restaurant';

  return (
    <div className="fixed inset-0 z-[110] p-0 sm:p-2 flex items-end justify-center pointer-events-none">
      {/* Background Dim */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/40 -z-10 pointer-events-auto"
        onClick={onMinimize}
      />

      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        className="w-full max-w-lg bg-white rounded-t-[2rem] shadow-[0_-15px_40px_rgba(0,0,0,0.2)] p-4 pb-8 pointer-events-auto max-h-[90dvh] max-h-[90vh] overflow-y-auto"
      >
        {/* Handle / Minimize */}
        <div className="w-full flex justify-center pb-4 pt-1">
          <button onClick={onMinimize} className="p-1 hover:bg-gray-100 active:scale-95 transition-all rounded-full flex flex-col items-center">
             <ChevronDown className="w-6 h-6 text-gray-400 stroke-[3]" />
          </button>
        </div>

        {/* Restaurant Header */}
        <div className="flex items-start justify-between mb-4 pb-3 border-b border-gray-50">
          <div className="flex gap-4">
            <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-lg shadow-black/5 overflow-hidden border border-gray-100">
              <img src={restaurantLogo} alt="Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <h3 className="text-gray-950 text-xl font-bold">{primaryName}</h3>
              {mixedOrder && (
                <div className="mt-2 inline-flex items-center rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--primary-theme)]">
                  Mixed Order
                </div>
              )}
              <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 mt-1.5">
                {isAtPickup ? (
                  <span className="text-green-600">Reached Location</span>
                ) : (
                  <span className="text-[var(--primary-theme)]">
                    {distanceToTarget && distanceToTarget !== Infinity ? `${(distanceToTarget / 1000).toFixed(1)} km` : '-- km'} • {eta || '--'} min to {primaryDestinationLabel}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            {primaryPhone && (
              <button
                onClick={() => window.location.href = `tel:${primaryPhone}`}
                className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center text-green-600 border border-green-100"
              >
                <Phone className="w-5 h-5" />
              </button>
            )}
            <button 
              onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(primaryAddress)}`, '_blank')}
              className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center text-white shadow-lg"
            >
              <Navigation className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="mb-4 space-y-2">
          {pickupStops.map((pickup, index) => {
            const isQuickStore = pickup.pickupType === 'quick';
            const label = isQuickStore ? 'Store Pickup' : 'Restaurant Pickup';
            const accentClasses = isQuickStore
              ? 'text-[var(--primary-theme)] bg-orange-50 border-orange-100'
              : 'text-green-600 bg-green-50 border-green-100';

            const pickupPhone = pickup.phone || pickup.phoneNumber || pickup.contactNumber || pickup.ownerPhone || pickup.primaryContactNumber || primaryPhone || restaurantPhone || order?.restaurantPhone || order?.sellerPhone || order?.restaurant?.phone || order?.restaurant?.ownerPhone || order?.restaurant?.primaryContactNumber || order?.seller?.phone || "";
            return (
              <div
                key={pickup.id || `${pickup.pickupType}-${index}`}
                className="rounded-xl border border-gray-100 bg-gray-50/80 p-3"
              >
                <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${accentClasses}`}>
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{pickupStops.length > 1 ? `${label} ${index + 1}` : label}</span>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <p className="text-base font-bold text-gray-950">{pickup.sourceName || (isQuickStore ? 'Seller store' : 'Restaurant')}</p>
                  <a 
                    href={pickupPhone ? `tel:${pickupPhone}` : '#'} 
                    className={`ml-2 w-8 h-8 rounded-full ${isQuickStore ? 'bg-orange-50 text-[var(--primary-theme)] border-orange-100' : 'bg-green-50 text-green-600 border-green-100'} flex items-center justify-center border flex-shrink-0`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!pickupPhone) {
                        e.preventDefault();
                        toast.error('Phone number not available');
                      }
                    }}
                  >
                    <Phone className="w-4 h-4" />
                  </a>
                </div>
                <p className="mt-1 text-sm font-medium leading-relaxed text-gray-500">{pickup.address || 'Address not available'}</p>
              </div>
            );
          })}
        </div>

        {/* Action Sliders */}
        <div className="space-y-4">
          {!isAtPickup ? (
            <div>
              <p className={`text-center text-[10px] font-bold uppercase tracking-widest mb-3 transition-colors ${
                isWithinRange ? 'text-green-600' : 'text-[var(--primary-theme)] animate-pulse'
              }`}>
                {isWithinRange ? 'Ready - Swipe to confirm arrival' : 'Get closer to pickup point'}
              </p>
              <ActionSlider 
                key="action-reach"
                label="Slide to Reach" 
                successLabel="Reached!"
                disabled={!isWithinRange}
                onConfirm={onReachedPickup}
                color="bg-green-600"
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-center items-center gap-3 w-full">
                 {!billImageUploaded && !isUploadingBill && (
                   <>
                      <button
                        onClick={handleTakeCameraPhoto}
                        className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-gray-900 text-white font-bold text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all"
                      >
                        <Camera className="w-5 h-5" />
                        <span>Camera</span>
                      </button>
                      <button
                        onClick={handlePickFromGallery}
                        className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-orange-50 text-[var(--primary-theme)] border border-orange-100 font-bold text-xs uppercase tracking-widest active:scale-95 transition-all"
                      >
                        <ImageIcon className="w-5 h-5" />
                        <span>Gallery</span>
                      </button>
                   </>
                 )}

                 {isUploadingBill && (
                    <div className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-gray-50 text-gray-400 font-bold text-xs uppercase tracking-widest">
                       <Loader2 className="w-4 h-4 animate-spin" />
                       <span>Uploading...</span>
                    </div>
                 )}

                 {billImageUploaded && (
                    <div className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-green-100 text-green-700 font-bold text-xs uppercase tracking-widest">
                       <CheckCircle2 className="w-4 h-4" />
                       <span>Bill Uploaded</span>
                    </div>
                 )}

                 <input
                   ref={cameraInputRef}
                   type="file"
                   accept="image/*"
                   onChange={(e) => handleBillImageSelect(e.target.files[0])}
                   className="hidden"
                 />
              </div>

              <div>
                <p className={`text-center text-[10px] font-bold uppercase tracking-widest mb-3 ${billImageUploaded ? 'text-green-600' : 'text-gray-400'}`}>
                  {billImageUploaded ? "Check the restaurant logo - Swipe to pick up" : "Capture bill to unlock swipe"}
                </p>
                <ActionSlider 
                  key="action-pickup"
                  label="Slide to Pick Up" 
                  successLabel="Picked Up!"
                  disabled={!billImageUploaded}
                  onConfirm={() => { clearBillImage(); return onPickedUp(billImageUrl); }}
                  color="bg-[var(--primary-theme)]"
                />
              </div>
            </div>
          )}

          {/* Delivery Instructions (User Note) */}
          {(order?.note || order?.instructions || order?.deliveryInstructions || order?.userNote) && (
            <div className="bg-amber-50/90 border border-amber-200/80 rounded-2xl p-3 flex gap-3 items-start shadow-2xs">
              <ChefHat className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-extrabold text-amber-800 uppercase tracking-wider mb-0.5">Customer Instructions</p>
                <p className="text-xs font-bold text-slate-900 leading-relaxed italic">"{order?.note || order?.instructions || order?.deliveryInstructions || order?.userNote}"</p>
              </div>
            </div>
          )}

          {/* Collapsible Order Summary */}
          <button 
            onClick={() => setShowItems(!showItems)}
            className="w-full flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 hover:bg-slate-100 transition-colors"
          >
            <div className="flex items-center gap-2.5 text-slate-900 font-extrabold text-xs uppercase tracking-wider">
              <Package className="w-4 h-4 text-emerald-600" />
              <span>Order Summary ({items.length || 0} Items)</span>
            </div>
            {showItems ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronUp className="w-4 h-4 text-slate-500" />}
          </button>

          {showItems && items.length > 0 && (
            <div className="space-y-1.5 px-1 max-h-48 overflow-y-auto">
              {items.map((item, idx) => {
                const itemName = item.name || item.itemName || item.title || item.productName || 'Item';
                const qty = item.quantity || item.qty || item.count || 1;
                const isVeg = item.isVeg !== undefined ? item.isVeg : true;

                return (
                  <div key={idx} className="flex justify-between items-center text-xs font-bold text-slate-800 bg-white p-2.5 rounded-xl border border-slate-100 shadow-2xs">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0 mr-2">
                      <div className={`w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center shrink-0 ${isVeg ? 'border-emerald-600 bg-emerald-50' : 'border-rose-600 bg-rose-50'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${isVeg ? 'bg-emerald-600' : 'bg-rose-600'}`} />
                      </div>
                      <span className="truncate text-slate-900 leading-snug">{itemName}</span>
                    </div>
                    <span className="font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 rounded-md text-[11px] shrink-0">
                      x{qty}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default PickupActionModal;
