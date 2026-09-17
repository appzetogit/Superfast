import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Calendar, Clock, MapPin, CheckCircle2, UserCheck,
  Users, AlertCircle, ShieldCheck, Zap, ChevronRight, Search,
  Award, TrendingUp, Sparkles, RefreshCw, Plus, X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { gigAPI } from '@food/api';

const ZONES = [
  { id: 'indore_central', name: 'Indore Central' },
  { id: 'vijay_nagar', name: 'Vijay Nagar Zone' },
  { id: 'palasia', name: 'Palasia Zone' },
  { id: 'bhawarkua', name: 'Bhawarkua Zone' },
  { id: 'rauw', name: 'Rau & Bypass Zone' },
];

export default function GigsV2() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('gigs'); // 'gigs' | 'drivers' | 'my_shifts'
  const [selectedZone, setSelectedZone] = useState('Indore Central');
  const [driverZone, setDriverZone] = useState('Indore Central');
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });

  const [gigs, setGigs] = useState([]);
  const [loadingGigs, setLoadingGigs] = useState(false);
  const [myBookings, setMyBookings] = useState([]);

  const [zoneDriversData, setZoneDriversData] = useState({
    totalDrivers: 0,
    summary: { total: 0, onlineCount: 0, inShiftCount: 0, offlineCount: 0 },
    drivers: [],
  });
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [driverSearch, setDriverSearch] = useState('');

  // Admin Create Gig Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingGig, setCreatingGig] = useState(false);
  const [gigFormData, setGigFormData] = useState({
    zoneName: 'Indore Central',
    title: 'Peak Surge Shift',
    shiftType: 'MORNING',
    startTime: '08:00',
    endTime: '12:00',
    date: selectedDate,
    basePay: 350,
    incentiveBonus: 50,
    maxDrivers: 15,
  });

  // 1. Fetch Zone Gigs
  const fetchGigs = useCallback(async () => {
    setLoadingGigs(true);
    try {
      const res = await gigAPI.getZoneGigs({ zoneName: selectedZone, date: selectedDate });
      if (res?.data?.success && res.data.data) {
        setGigs(res.data.data.gigs || []);
        if (res.data.data.driverZone) {
          setDriverZone(res.data.data.driverZone);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch zone gigs:', err);
    } finally {
      setLoadingGigs(false);
    }
  }, [selectedZone, selectedDate]);

  // 2. Fetch My Bookings
  const fetchMyBookings = useCallback(async () => {
    try {
      const res = await gigAPI.getMyGigs();
      if (res?.data?.success && res.data.data) {
        setMyBookings(res.data.data.bookings || []);
      }
    } catch (err) {
      console.warn('Failed to fetch my gigs:', err);
    }
  }, []);

  // 3. Fetch Zone Drivers List ("list ke form me")
  const fetchZoneDrivers = useCallback(async () => {
    setLoadingDrivers(true);
    try {
      const res = await gigAPI.getZoneDrivers({ zoneName: selectedZone });
      if (res?.data?.success && res.data.data) {
        setZoneDriversData(res.data.data);
      }
    } catch (err) {
      console.warn('Failed to fetch zone drivers:', err);
    } finally {
      setLoadingDrivers(false);
    }
  }, [selectedZone]);

  useEffect(() => {
    fetchGigs();
    fetchMyBookings();
    fetchZoneDrivers();
  }, [fetchGigs, fetchMyBookings, fetchZoneDrivers]);

  // Handle Book Gig
  const handleBookGig = async (gigId) => {
    try {
      const res = await gigAPI.bookGig(gigId);
      if (res?.data?.success) {
        toast.success(res.data.message || 'Gig shift booked successfully!');
        fetchGigs();
        fetchMyBookings();
      } else {
        toast.error(res?.data?.message || 'Failed to book gig');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Error booking gig shift');
    }
  };

  // Handle Check-in Gig
  const handleCheckIn = async (gigId, bookingId) => {
    try {
      const res = await gigAPI.checkInGig({ gigId, bookingId });
      if (res?.data?.success) {
        toast.success('Checked-in to Gig shift! You are now online for orders.');
        fetchGigs();
        fetchMyBookings();
        fetchZoneDrivers();
      } else {
        toast.error(res?.data?.message || 'Check-in failed');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Check-in error');
    }
  };

  // Handle Check-out Gig
  const handleCheckOut = async (bookingId) => {
    try {
      const res = await gigAPI.checkOutGig({ bookingId });
      if (res?.data?.success) {
        toast.success('Completed Gig shift successfully!');
        fetchGigs();
        fetchMyBookings();
        fetchZoneDrivers();
      } else {
        toast.error(res?.data?.message || 'Check-out failed');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Check-out error');
    }
  };

  // Handle Admin Create Gig
  const handleAdminCreateGig = async (e) => {
    e.preventDefault();
    setCreatingGig(true);
    try {
      const res = await gigAPI.adminCreateGig({
        ...gigFormData,
        zoneName: selectedZone,
        date: selectedDate,
      });
      if (res?.data?.success) {
        toast.success('Admin Gig shift created successfully!');
        setShowCreateModal(false);
        fetchGigs();
      } else {
        toast.error(res?.data?.message || 'Failed to create admin gig');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Error creating gig shift');
    } finally {
      setCreatingGig(false);
    }
  };

  const filteredDrivers = (zoneDriversData.drivers || []).filter((d) =>
    (d.name || '').toLowerCase().includes(driverSearch.toLowerCase()) ||
    (d.phone || '').includes(driverSearch)
  );

  return (
    <div className="min-h-screen bg-[#f4f5f7] dark:bg-[#121212] text-gray-900 dark:text-white flex flex-col pb-12">
      {/* ─── 1. TOP HEADER BANNER ─── */}
      <div className="bg-gradient-to-r from-[#f94e10] via-[#e03d00] to-[#b33100] text-white pt-4 pb-5 px-4 shadow-xl sticky top-0 z-[150]">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => navigate('/food/delivery')}
            className="w-9 h-9 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center text-white active:scale-95 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <h1 className="text-xl font-black uppercase tracking-tight">GIGS & ZONE SHIFTS</h1>
            <p className="text-[11px] font-bold text-white/80">
              Your Zone: <span className="underline">{driverZone}</span>
            </p>
          </div>
          <button
            onClick={() => { fetchGigs(); fetchZoneDrivers(); }}
            className="w-9 h-9 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center text-white active:scale-95 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loadingGigs || loadingDrivers ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Zone Selector & Admin Add Button */}
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-white/15 backdrop-blur-md rounded-2xl p-2 flex items-center justify-between border border-white/20">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide">
              <MapPin className="w-4 h-4 text-amber-300" />
              <span>Zone:</span>
            </div>
            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              className="bg-black/30 text-white font-bold text-xs rounded-xl px-3 py-1.5 outline-none border border-white/20 cursor-pointer"
            >
              {ZONES.map((z) => (
                <option key={z.id} value={z.name} className="bg-gray-900 text-white">
                  {z.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-black/40 hover:bg-black/60 text-white text-xs font-black px-3 py-3 rounded-2xl border border-white/30 flex items-center gap-1 active:scale-95 transition-all"
            title="Create Admin Gig"
          >
            <Plus className="w-4 h-4 text-amber-300" />
            <span className="hidden sm:inline">Add Gig</span>
          </button>
        </div>

        {/* Navigation Sub-Tabs */}
        <div className="grid grid-cols-3 gap-1 mt-3 bg-[#b33100]/60 p-1 rounded-2xl border border-white/20">
          <button
            onClick={() => setActiveTab('gigs')}
            className={`py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
              activeTab === 'gigs' ? 'bg-white text-gray-900 shadow-md' : 'text-white/80 hover:text-white'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Book Gigs</span>
          </button>

          <button
            onClick={() => setActiveTab('drivers')}
            className={`py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
              activeTab === 'drivers' ? 'bg-white text-gray-900 shadow-md' : 'text-white/80 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Zone Drivers</span>
          </button>

          <button
            onClick={() => setActiveTab('my_shifts')}
            className={`py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
              activeTab === 'my_shifts' ? 'bg-white text-gray-900 shadow-md' : 'text-white/80 hover:text-white'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>My Shifts</span>
          </button>
        </div>
      </div>

      {/* ─── 2. MAIN CONTENT AREA ─── */}
      <div className="p-4 flex-1 space-y-4">
        {/* TAB 1: BOOK GIGS */}
        {activeTab === 'gigs' && (
          <div className="space-y-4">
            {/* Date Picker Bar */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              {[0, 1, 2].map((offset) => {
                const dateObj = new Date();
                dateObj.setDate(dateObj.getDate() + offset);
                const isoStr = dateObj.toISOString().split('T')[0];
                const dayLabel = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                const dateNum = dateObj.getDate();
                const isSelected = selectedDate === isoStr;

                return (
                  <button
                    key={isoStr}
                    onClick={() => { setSelectedDate(isoStr); setGigFormData((prev) => ({ ...prev, date: isoStr })); }}
                    className={`flex-1 min-w-[90px] py-2 px-3 rounded-2xl border text-center transition-all ${
                      isSelected
                        ? 'bg-[#f94e10] text-white border-[#f94e10] shadow-lg shadow-orange-500/20 font-black'
                        : 'bg-white dark:bg-[#1c1c1e] text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-800 font-bold'
                    }`}
                  >
                    <p className="text-[10px] uppercase tracking-wider opacity-80">{dayLabel}</p>
                    <p className="text-sm font-black">{dateNum} {dateObj.toLocaleDateString('en-US', { month: 'short' })}</p>
                  </button>
                );
              })}
            </div>

            {/* Gigs List */}
            {loadingGigs ? (
              <div className="py-12 text-center text-gray-400">Loading active zone gigs...</div>
            ) : gigs.length === 0 ? (
              <div className="bg-white dark:bg-[#1c1c1e] rounded-3xl p-8 text-center border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col items-center">
                <Calendar className="w-12 h-12 text-orange-500 mx-auto mb-2 opacity-80" />
                <h3 className="font-bold text-gray-900 dark:text-white">No Active Gigs in {selectedZone}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs">
                  Admin has not created active Gig shifts for this zone on {selectedDate}.
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="mt-4 bg-[#f94e10] text-white text-xs font-black px-4 py-2 rounded-2xl shadow-md flex items-center gap-1 active:scale-95 transition-all"
                >
                  <Plus className="w-4 h-4" /> Create Admin Gig
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {gigs.map((gig) => {
                  const isCheckedIn = gig.bookingStatus === 'checked_in';
                  const isBooked = gig.isBooked;
                  const slotsPercent = Math.min(100, Math.round(((gig.bookedCount || 0) / (gig.maxDrivers || 15)) * 100));

                  return (
                    <motion.div
                      key={gig._id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white dark:bg-[#1c1c1e] rounded-3xl p-4 border border-gray-100 dark:border-gray-800 shadow-md relative overflow-hidden"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="bg-orange-100 text-[#f94e10] dark:bg-orange-950/40 dark:text-orange-400 text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
                              {gig.shiftType || 'SHIFT'}
                            </span>
                            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-orange-500" />
                              {gig.startTime} - {gig.endTime}
                            </span>
                          </div>
                          <h3 className="text-base font-black text-gray-900 dark:text-white mt-1">
                            {gig.title}
                          </h3>
                        </div>

                        <div className="text-right">
                          <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Guarantee</p>
                          <p className="text-lg font-black text-green-600 dark:text-green-400">
                            ₹{gig.basePay} <span className="text-[10px] text-gray-500">+ ₹{gig.incentiveBonus} Bonus</span>
                          </p>
                        </div>
                      </div>

                      {/* Capacity Bar */}
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1">
                          <span>Slots Capacity</span>
                          <span>{gig.bookedCount || 0}/{gig.maxDrivers || 15} Booked ({gig.slotsLeft} Left)</span>
                        </div>
                        <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${
                              slotsPercent >= 90 ? 'bg-red-500' : slotsPercent >= 60 ? 'bg-amber-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${slotsPercent}%` }}
                          />
                        </div>
                      </div>

                      {/* Action Button */}
                      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800/80 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500">
                          <ShieldCheck className="w-4 h-4 text-blue-500" />
                          <span>Punctuality Bonus Eligible</span>
                        </div>

                        {isCheckedIn ? (
                          <button
                            onClick={() => handleCheckOut(gig.bookingId)}
                            className="bg-blue-600 text-white text-xs font-black px-4 py-2 rounded-2xl shadow-md active:scale-95 transition-all"
                          >
                            CHECK OUT
                          </button>
                        ) : isBooked ? (
                          <button
                            onClick={() => handleCheckIn(gig._id, gig.bookingId)}
                            className="bg-green-600 text-white text-xs font-black px-4 py-2 rounded-2xl shadow-md active:scale-95 transition-all"
                          >
                            CHECK IN NOW
                          </button>
                        ) : gig.slotsLeft === 0 ? (
                          <button disabled className="bg-gray-200 dark:bg-gray-800 text-gray-400 text-xs font-black px-4 py-2 rounded-2xl cursor-not-allowed">
                            SLOTS FULL
                          </button>
                        ) : (
                          <button
                            onClick={() => handleBookGig(gig._id)}
                            className="bg-[#f94e10] hover:bg-[#e03d00] text-white text-xs font-black px-5 py-2.5 rounded-2xl shadow-lg shadow-orange-500/20 active:scale-95 transition-all"
                          >
                            BOOK GIG SLOT
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ZONE DRIVERS LIST ("List ke form me") */}
        {activeTab === 'drivers' && (
          <div className="space-y-4">
            {/* Zone Status Summary Counters */}
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-white dark:bg-[#1c1c1e] p-3 rounded-2xl border border-gray-100 dark:border-gray-800 text-center shadow-sm">
                <p className="text-[10px] font-bold text-gray-400 uppercase">Total</p>
                <p className="text-lg font-black text-gray-900 dark:text-white">{zoneDriversData.summary?.total || 0}</p>
              </div>
              <div className="bg-white dark:bg-[#1c1c1e] p-3 rounded-2xl border border-green-500/30 text-center shadow-sm">
                <p className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase">Online 🟢</p>
                <p className="text-lg font-black text-green-600 dark:text-green-400">{zoneDriversData.summary?.onlineCount || 0}</p>
              </div>
              <div className="bg-white dark:bg-[#1c1c1e] p-3 rounded-2xl border border-blue-500/30 text-center shadow-sm">
                <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">In Shift 🔵</p>
                <p className="text-lg font-black text-blue-600 dark:text-blue-400">{zoneDriversData.summary?.inShiftCount || 0}</p>
              </div>
              <div className="bg-white dark:bg-[#1c1c1e] p-3 rounded-2xl border border-gray-200 dark:border-gray-800 text-center shadow-sm">
                <p className="text-[10px] font-bold text-gray-400 uppercase">Offline 🔴</p>
                <p className="text-lg font-black text-gray-500">{zoneDriversData.summary?.offlineCount || 0}</p>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search drivers by name or phone..."
                value={driverSearch}
                onChange={(e) => setDriverSearch(e.target.value)}
                className="w-full bg-white dark:bg-[#1c1c1e] pl-10 pr-4 py-2.5 rounded-2xl border border-gray-200 dark:border-gray-800 text-xs font-bold text-gray-900 dark:text-white outline-none focus:border-[#f94e10]"
              />
            </div>

            {/* Driver List ("List Form") */}
            {loadingDrivers ? (
              <div className="py-12 text-center text-gray-400">Loading zone drivers list...</div>
            ) : filteredDrivers.length === 0 ? (
              <div className="bg-white dark:bg-[#1c1c1e] rounded-3xl p-8 text-center border border-gray-100 dark:border-gray-800 shadow-sm">
                <Users className="w-12 h-12 text-gray-400 mx-auto mb-2 opacity-80" />
                <h3 className="font-bold text-gray-900 dark:text-white">No Drivers Found</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">No delivery partners registered in this zone matching search.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredDrivers.map((driver) => (
                  <div
                    key={driver.id}
                    className="bg-white dark:bg-[#1c1c1e] rounded-2xl p-3.5 border border-gray-100 dark:border-gray-800 shadow-sm flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative w-11 h-11 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden border border-gray-200 dark:border-gray-700 flex-shrink-0">
                        <img
                          src={driver.profilePhoto || 'https://i.ibb.co/3m2Yh7r/SUPERFAST-Brand-Image.png'}
                          alt={driver.name}
                          className="w-full h-full object-cover"
                        />
                        {/* Status Dot */}
                        <span
                          className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#1c1c1e] ${
                            driver.isInShift
                              ? 'bg-blue-500'
                              : driver.isOnline
                              ? 'bg-green-500'
                              : 'bg-gray-400'
                          }`}
                        />
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-black text-gray-900 dark:text-white">{driver.name}</h4>
                          <span className="text-[10px] font-extrabold text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.2 rounded-md">
                            ★ {driver.rating}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 font-bold">
                          {driver.vehicleType} • {driver.vehicleNumber}
                        </p>
                        {driver.activeShift && (
                          <p className="text-[10px] text-blue-600 dark:text-blue-400 font-bold mt-0.5">
                            Shift: {driver.activeShift.title} ({driver.activeShift.startTime}-{driver.activeShift.endTime})
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="text-right">
                      <span
                        className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-xl shadow-xs ${
                          driver.isInShift
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400'
                            : driver.isOnline
                            ? 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400'
                            : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                        }`}
                      >
                        {driver.statusDisplay}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: MY SHIFTS */}
        {activeTab === 'my_shifts' && (
          <div className="space-y-3">
            {myBookings.length === 0 ? (
              <div className="bg-white dark:bg-[#1c1c1e] rounded-3xl p-8 text-center border border-gray-100 dark:border-gray-800 shadow-sm">
                <UserCheck className="w-12 h-12 text-orange-500 mx-auto mb-2 opacity-80" />
                <h3 className="font-bold text-gray-900 dark:text-white">No Shift Bookings</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Book your first gig shift in your zone.</p>
              </div>
            ) : (
              myBookings.map((booking) => {
                const gig = booking.gigId || {};
                return (
                  <div
                    key={booking._id}
                    className="bg-white dark:bg-[#1c1c1e] rounded-2xl p-4 border border-gray-100 dark:border-gray-800 shadow-sm flex items-center justify-between"
                  >
                    <div>
                      <span className="text-[10px] font-black uppercase bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
                        {gig.zoneName || booking.zoneName}
                      </span>
                      <h4 className="text-sm font-black text-gray-900 dark:text-white mt-1">
                        {gig.title || 'Gig Shift'}
                      </h4>
                      <p className="text-xs text-gray-500 font-bold mt-0.5">
                        {gig.date} • {gig.startTime} - {gig.endTime}
                      </p>
                    </div>

                    <div className="text-right">
                      <span
                        className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-xl ${
                          booking.status === 'checked_in'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400'
                            : booking.status === 'completed'
                            ? 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                        }`}
                      >
                        {booking.status}
                      </span>
                      <p className="text-xs font-black text-green-600 dark:text-green-400 mt-1">
                        ₹{gig.basePay || 350}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* ─── ADMIN CREATE GIG MODAL ─── */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-[#1c1c1e] rounded-3xl p-6 w-full max-w-md shadow-2xl border border-gray-200 dark:border-gray-800 relative"
            >
              <button
                onClick={() => setShowCreateModal(false)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500"
              >
                <X className="w-4 h-4" />
              </button>

              <h2 className="text-lg font-black uppercase tracking-tight text-gray-900 dark:text-white mb-1">
                Create Admin Gig Shift
              </h2>
              <p className="text-xs text-gray-500 mb-4">
                Drivers in <span className="font-bold text-[#f94e10]">{selectedZone}</span> will see this active Gig for booking.
              </p>

              <form onSubmit={handleAdminCreateGig} className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Shift Title</label>
                  <input
                    type="text"
                    required
                    value={gigFormData.title}
                    onChange={(e) => setGigFormData({ ...gigFormData, title: e.target.value })}
                    placeholder="e.g. Morning Rush Peak"
                    className="w-full bg-gray-50 dark:bg-gray-900 p-2.5 rounded-xl border border-gray-200 dark:border-gray-800 font-bold outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Shift Type</label>
                    <select
                      value={gigFormData.shiftType}
                      onChange={(e) => setGigFormData({ ...gigFormData, shiftType: e.target.value })}
                      className="w-full bg-gray-50 dark:bg-gray-900 p-2.5 rounded-xl border border-gray-200 dark:border-gray-800 font-bold outline-none"
                    >
                      <option value="MORNING">MORNING</option>
                      <option value="AFTERNOON">AFTERNOON</option>
                      <option value="EVENING">EVENING</option>
                      <option value="NIGHT">NIGHT</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Max Drivers Slot</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={gigFormData.maxDrivers}
                      onChange={(e) => setGigFormData({ ...gigFormData, maxDrivers: e.target.value })}
                      className="w-full bg-gray-50 dark:bg-gray-900 p-2.5 rounded-xl border border-gray-200 dark:border-gray-800 font-bold outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Start Time</label>
                    <input
                      type="text"
                      required
                      placeholder="08:00"
                      value={gigFormData.startTime}
                      onChange={(e) => setGigFormData({ ...gigFormData, startTime: e.target.value })}
                      className="w-full bg-gray-50 dark:bg-gray-900 p-2.5 rounded-xl border border-gray-200 dark:border-gray-800 font-bold outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">End Time</label>
                    <input
                      type="text"
                      required
                      placeholder="12:00"
                      value={gigFormData.endTime}
                      onChange={(e) => setGigFormData({ ...gigFormData, endTime: e.target.value })}
                      className="w-full bg-gray-50 dark:bg-gray-900 p-2.5 rounded-xl border border-gray-200 dark:border-gray-800 font-bold outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Base Pay (₹)</label>
                    <input
                      type="number"
                      required
                      value={gigFormData.basePay}
                      onChange={(e) => setGigFormData({ ...gigFormData, basePay: e.target.value })}
                      className="w-full bg-gray-50 dark:bg-gray-900 p-2.5 rounded-xl border border-gray-200 dark:border-gray-800 font-bold outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Incentive Bonus (₹)</label>
                    <input
                      type="number"
                      required
                      value={gigFormData.incentiveBonus}
                      onChange={(e) => setGigFormData({ ...gigFormData, incentiveBonus: e.target.value })}
                      className="w-full bg-gray-50 dark:bg-gray-900 p-2.5 rounded-xl border border-gray-200 dark:border-gray-800 font-bold outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={creatingGig}
                  className="w-full mt-4 bg-[#f94e10] hover:bg-[#e03d00] text-white font-black text-sm py-3 rounded-2xl shadow-lg shadow-orange-500/20 active:scale-95 transition-all flex items-center justify-center"
                >
                  {creatingGig ? 'Creating Gig...' : 'CREATE & PUBLISH GIG'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
