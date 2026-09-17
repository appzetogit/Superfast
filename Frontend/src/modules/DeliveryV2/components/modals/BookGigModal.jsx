import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Clock, MapPin, Check, Sparkles, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { gigAPI } from '@food/api';
import { useDeliveryStore } from '@/modules/DeliveryV2/store/useDeliveryStore';

function formatLocalDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function BookGigModal({ isOpen, onClose, onBookingComplete }) {
  const [selectedDate, setSelectedDate] = useState(() => formatLocalDate(new Date()));
  const [gigs, setGigs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [bookingIdInProgress, setBookingIdInProgress] = useState(null);
  const setOnline = useDeliveryStore((state) => state.setOnline);

  const fetchGigs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await gigAPI.getZoneGigs({ date: selectedDate });
      if (res?.data?.success && res.data.data) {
        setGigs(res.data.data.gigs || []);
      }
    } catch (err) {
      console.warn('Failed to fetch gigs:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    if (isOpen) {
      fetchGigs();
    }
  }, [isOpen, fetchGigs]);

  const handleBook = async (gig) => {
    setBookingIdInProgress(gig._id);
    try {
      const res = await gigAPI.bookGig(gig._id);
      if (res?.data?.success) {
        toast.success(res.data.message || 'Gig shift booked successfully!');
        fetchGigs();
        if (onBookingComplete) onBookingComplete();
      } else {
        toast.error(res?.data?.message || 'Failed to book gig');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Error booking gig shift');
    } finally {
      setBookingIdInProgress(null);
    }
  };

  const handleCheckIn = async (gig) => {
    setBookingIdInProgress(gig._id);
    try {
      const res = await gigAPI.checkInGig({ gigId: gig._id, bookingId: gig.bookingId });
      if (res?.data?.success) {
        setOnline(true);
        toast.success('Checked-in to Gig shift! You are now online for orders.');
        fetchGigs();
        if (onBookingComplete) onBookingComplete();
        if (onClose) onClose();
      } else {
        toast.error(res?.data?.message || 'Check-in failed');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Check-in error');
    } finally {
      setBookingIdInProgress(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[600] flex items-end justify-center">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-xs"
      />

      {/* Bottom Sheet Card */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="relative w-full max-w-lg bg-white dark:bg-[#1c1c1e] rounded-t-3xl p-5 shadow-2xl z-[610] max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Handle Pill */}
        <div className="w-10 h-1 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto mb-4" />

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-1 text-[11px] font-black text-[#00A669] uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              <span>SHIFT BOOKING</span>
            </div>
            <h2 className="text-xl font-black text-gray-900 dark:text-white mt-0.5 tracking-tight">
              Book a Delivery Gig
            </h2>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 hover:text-gray-900 dark:hover:text-white transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Date Tabs (Matching Screenshot 4) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-4 no-scrollbar">
          {[0, 1, 2].map((offset) => {
            const dateObj = new Date();
            dateObj.setDate(dateObj.getDate() + offset);
            const isoStr = formatLocalDate(dateObj);
            const dayLabel = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            const isSelected = selectedDate === isoStr;

            return (
              <button
                key={isoStr}
                onClick={() => setSelectedDate(isoStr)}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-black transition-all flex-shrink-0 ${
                  isSelected
                    ? 'bg-[#00A669] text-white shadow-lg shadow-[#00A669]/25'
                    : 'bg-gray-50 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>{dayLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Gigs List */}
        {loading ? (
          <div className="py-12 text-center text-gray-400 font-bold text-xs">Loading available gigs...</div>
        ) : gigs.length === 0 ? (
          <div className="bg-gray-50 dark:bg-gray-900/60 rounded-2xl p-8 text-center border border-gray-100 dark:border-gray-800">
            <Clock className="w-10 h-10 text-gray-400 mx-auto mb-2 opacity-60" />
            <h4 className="text-sm font-bold text-gray-900 dark:text-white">No Shifts Available</h4>
            <p className="text-xs text-gray-500 mt-1">No active gigs created for this date. Check another date.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {gigs.map((gig) => {
              const maxSlots = gig.maxDrivers || 20;
              const bookedSlots = gig.bookedCount || 0;
              const remainingSlots = Math.max(0, maxSlots - bookedSlots);
              const isBooked = gig.isBooked;
              const isCheckedIn = gig.bookingStatus === 'checked_in';

              return (
                <div
                  key={gig._id}
                  className="bg-white dark:bg-[#252528] rounded-2xl p-4 border border-gray-200 dark:border-gray-700/80 shadow-xs space-y-3"
                >
                  {/* Line 1: Time & Available Badge */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-base font-black text-gray-900 dark:text-white">
                      <Clock className="w-4.5 h-4.5 text-[#00A669]" />
                      <span>{gig.startTime} – {gig.endTime}</span>
                    </div>

                    <span className="bg-emerald-50 text-[#00A669] dark:bg-emerald-950/60 dark:text-[#00E699] border border-emerald-200 dark:border-emerald-800 text-[10px] font-black uppercase px-2.5 py-1 rounded-full">
                      {gig.bookingStatus === 'checked_in' ? 'CHECKED IN' : isBooked ? 'BOOKED' : 'AVAILABLE'}
                    </span>
                  </div>

                  {/* Line 2: Zone Name */}
                  <p className="text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#00A669]" />
                    <span>Zone: <strong className="text-gray-800 dark:text-gray-200">{gig.zoneName || 'All Zones'}</strong></span>
                  </p>

                  {/* Line 3: Slots Grid Box (Matching Screenshot 4) */}
                  <div className="bg-slate-50 dark:bg-[#1c1c1e] rounded-xl p-3 grid grid-cols-3 text-center border border-slate-100 dark:border-slate-800">
                    <div>
                      <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">TOTAL SLOTS</p>
                      <p className="text-sm font-black text-gray-900 dark:text-white mt-0.5">{maxSlots}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">BOOKED</p>
                      <p className="text-sm font-black text-blue-600 dark:text-blue-400 mt-0.5">{bookedSlots}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">REMAINING</p>
                      <p className="text-sm font-black text-[#00A669] dark:text-[#00E699] mt-0.5">{remainingSlots}</p>
                    </div>
                  </div>

                  {/* Line 4: Full-width Green Button (Matching Screenshot 4) */}
                  {isCheckedIn ? (
                    <div className="w-full bg-blue-600 text-white font-black text-xs py-3 rounded-2xl text-center flex items-center justify-center gap-2">
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>CHECKED IN & WORKING</span>
                    </div>
                  ) : isBooked ? (
                    <button
                      onClick={() => handleCheckIn(gig)}
                      disabled={bookingIdInProgress === gig._id}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-3 rounded-2xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>CHECK IN NOW TO START WORKING</span>
                    </button>
                  ) : remainingSlots === 0 ? (
                    <button disabled className="w-full bg-gray-200 dark:bg-gray-800 text-gray-400 font-black text-xs py-3 rounded-2xl cursor-not-allowed text-center">
                      SLOTS FULL
                    </button>
                  ) : (
                    <button
                      onClick={() => handleBook(gig)}
                      disabled={bookingIdInProgress === gig._id}
                      className="w-full bg-[#00A669] hover:bg-[#008f5a] text-white font-black text-xs py-3.5 rounded-2xl shadow-lg shadow-[#00A669]/25 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>{bookingIdInProgress === gig._id ? 'BOOKING...' : 'BOOK THIS GIG'}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}
