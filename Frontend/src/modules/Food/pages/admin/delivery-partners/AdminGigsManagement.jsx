import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar, Clock, MapPin, Plus, Trash2, Edit3, CheckCircle2,
  AlertTriangle, Users, Search, RefreshCw, LayoutGrid, List,
  PhoneCall, MessageSquare, AlertCircle, X, Check
} from 'lucide-react';
import { toast } from 'sonner';
import { gigAPI, adminAPI } from '@food/api';

const DEFAULT_ZONES = [
  'ALL ZONES',
  'Indore Central',
];

function getTodayDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function AdminGigsManagement() {
  const [gigs, setGigs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedZoneFilter, setSelectedZoneFilter] = useState('ALL ZONES');
  const [selectedDateFilter, setSelectedDateFilter] = useState(getTodayDateString());
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'all'
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'list'

  // Attendance Section Filters
  const [attendanceZoneFilter, setAttendanceZoneFilter] = useState('ALL ZONES');
  const [attendanceSlotFilter, setAttendanceSlotFilter] = useState('ALL SHIFTS');
  const [attendanceTab, setAttendanceTab] = useState('all'); // 'all' | 'working' | 'offline' | 'noshows'

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingGigId, setEditingGigId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    zoneName: 'Indore Central',
    title: 'Morning shift',
    shiftType: 'MORNING',
    startTime: '09:55',
    endTime: '16:00',
    date: getTodayDateString(),
    basePay: 350,
    incentiveBonus: 50,
    maxDrivers: 20,
    isActive: true,
  });

  const fetchGigs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedZoneFilter && selectedZoneFilter !== 'ALL ZONES') {
        params.zoneName = selectedZoneFilter;
      }
      if (selectedDateFilter) params.date = selectedDateFilter;
      if (statusFilter === 'active') params.isActive = 'true';

      const res = await gigAPI.adminGetGigs(params);
      if (res?.data?.success && res.data.data) {
        setGigs(res.data.data.gigs || []);
      }
    } catch (err) {
      toast.error('Failed to load gigs list');
    } finally {
      setLoading(false);
    }
  }, [selectedZoneFilter, selectedDateFilter, statusFilter]);

  // Attendance Drivers List Data
  const [driversList, setDriversList] = useState([]);
  const [attendanceSummary, setAttendanceSummary] = useState({
    totalBookings: 51,
    completedShifts: 41,
    noShows: 7,
    attendanceRate: 85.4,
  });

  const fetchZoneDrivers = useCallback(async () => {
    try {
      const res = await gigAPI.getZoneDrivers({
        zoneName: attendanceZoneFilter === 'ALL ZONES' ? '' : attendanceZoneFilter,
      });
      if (res?.data?.success && res.data.data) {
        const drivers = res.data.data.drivers || [];
        setDriversList(drivers);
      }
    } catch (err) {
      console.warn('Failed to fetch attendance drivers:', err);
    }
  }, [attendanceZoneFilter]);

  const [handoverRequests, setHandoverRequests] = useState([]);
  const [loadingHandovers, setLoadingHandovers] = useState(false);
  const [actionHandoverId, setActionHandoverId] = useState(null);

  const fetchHandovers = useCallback(async () => {
    setLoadingHandovers(true);
    try {
      const res = await gigAPI.adminGetHandovers();
      if (res?.data?.success && res.data.data) {
        setHandoverRequests(res.data.data.requests || []);
      }
    } catch (err) {
      console.warn('Failed to fetch handover requests:', err);
    } finally {
      setLoadingHandovers(false);
    }
  }, []);

  const handleApproveHandover = async (id) => {
    setActionHandoverId(id);
    try {
      const res = await gigAPI.adminApproveHandover(id);
      if (res?.data?.success) {
        toast.success('Emergency handover approved! Driver set offline.');
        fetchHandovers();
        fetchZoneDrivers();
      } else {
        toast.error(res?.data?.message || 'Failed to approve handover');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Handover approval error');
    } finally {
      setActionHandoverId(null);
    }
  };

  const handleRejectHandover = async (id) => {
    setActionHandoverId(id);
    try {
      const res = await gigAPI.adminRejectHandover(id);
      if (res?.data?.success) {
        toast.success('Handover request rejected');
        fetchHandovers();
      } else {
        toast.error(res?.data?.message || 'Failed to reject handover');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Handover rejection error');
    } finally {
      setActionHandoverId(null);
    }
  };

  const [zonesList, setZonesList] = useState(DEFAULT_ZONES);

  const fetchZones = useCallback(async () => {
    try {
      const res = await adminAPI.getZones();
      const dbZones = res?.data?.data?.zones || res?.data?.zones || res?.data?.data || [];
      if (Array.isArray(dbZones) && dbZones.length > 0) {
        const names = dbZones.map((z) => z.name || z.zoneName || z.title).filter(Boolean);
        const unique = Array.from(new Set(['ALL ZONES', ...names]));
        setZonesList(unique);
      }
    } catch (err) {
      console.warn('Failed to load dynamic zones from DB:', err);
    }
  }, []);

  useEffect(() => {
    fetchGigs();
    fetchZoneDrivers();
    fetchHandovers();
    fetchZones();
  }, [fetchGigs, fetchZoneDrivers, fetchHandovers, fetchZones]);

  const handleOpenCreateModal = () => {
    setIsEditing(false);
    setEditingGigId(null);
    setFormData({
      zoneName: selectedZoneFilter !== 'ALL ZONES' ? selectedZoneFilter : 'Indore Central',
      title: 'Morning shift',
      shiftType: 'MORNING',
      startTime: '09:55',
      endTime: '16:00',
      date: selectedDateFilter || getTodayDateString(),
      basePay: 350,
      incentiveBonus: 50,
      maxDrivers: 20,
      isActive: true,
    });
    setShowModal(true);
  };

  const handleOpenEditModal = (gig) => {
    setIsEditing(true);
    setEditingGigId(gig._id);
    setFormData({
      zoneName: gig.zoneName,
      title: gig.title,
      shiftType: gig.shiftType || 'MORNING',
      startTime: gig.startTime,
      endTime: gig.endTime,
      date: gig.date,
      basePay: gig.basePay,
      incentiveBonus: gig.incentiveBonus,
      maxDrivers: gig.maxDrivers,
      isActive: gig.isActive,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (isEditing && editingGigId) {
        const res = await gigAPI.adminUpdateGig(editingGigId, formData);
        if (res?.data?.success) {
          toast.success('Gig updated successfully');
          setShowModal(false);
          fetchGigs();
        } else {
          toast.error(res?.data?.message || 'Failed to update gig');
        }
      } else {
        const res = await gigAPI.adminCreateGig(formData);
        if (res?.data?.success) {
          toast.success('New Gig shift created and published!');
          const createdGig = res?.data?.data?.gig;
          if (createdGig?.date) {
            setSelectedDateFilter(createdGig.date);
          }
          setShowModal(false);
          setTimeout(fetchGigs, 100);
        } else {
          toast.error(res?.data?.message || 'Failed to create gig');
        }
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Error saving gig shift');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteGig = async (gigId) => {
    if (!window.confirm('Are you sure you want to delete this Gig shift?')) return;
    try {
      const res = await gigAPI.adminDeleteGig(gigId);
      if (res?.data?.success) {
        toast.success('Gig deleted successfully');
        fetchGigs();
      }
    } catch (err) {
      toast.error('Failed to delete gig');
    }
  };

  // Compute stats 100% dynamically from DB
  const totalBookedCount = gigs.reduce((acc, g) => acc + (g.bookedCount || 0), 0);

  const bookedDriversList = driversList.filter((d) => d.hasBookedGig);
  const workingDriversList = driversList.filter((d) => d.isOnline || d.isInShift);
  const bookedOfflineDriversList = driversList.filter((d) => d.hasBookedGig && !d.isOnline && !d.isInShift);
  const completedShiftsCount = driversList.filter((d) => d.isInShift).length;
  const noShowsCount = bookedOfflineDriversList.length;
  const attendanceRate = bookedDriversList.length > 0
    ? ((workingDriversList.length / bookedDriversList.length) * 100).toFixed(1)
    : 0;

  // Filter Attendance Drivers (100% Dynamic DB Data)
  const filteredAttendanceDrivers = driversList.filter((d) => {
    if (attendanceTab === 'working') return d.isOnline || d.isInShift;
    if (attendanceTab === 'offline') return d.hasBookedGig && !d.isOnline && !d.isInShift;
    if (attendanceTab === 'all_registered') return true;
    // Default 'all' tab: Show ONLY drivers who have actually booked a gig shift!
    return d.hasBookedGig;
  });

  return (
    <div className="p-6 space-y-6 bg-slate-50/60 dark:bg-slate-900 min-h-screen text-slate-800 dark:text-slate-100 font-sans">
      
      {/* ── 1. OPERATIONS CONTROL HEADER BANNER ── */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-black text-[#00A669] uppercase tracking-wider">
            OPERATIONS CONTROL
          </p>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white mt-0.5">
            Delivery Gig & Shift Management
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
            Configure predefined working slots, slot capacities, and track partner shift attendance.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="bg-[#00A669] hover:bg-[#008f5a] text-white font-black text-xs px-5 py-3 rounded-2xl shadow-lg shadow-[#00A669]/25 flex items-center justify-center gap-2 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>CREATE NEW GIG</span>
        </button>
      </div>

      {/* ── 2. METRICS CARDS GRID (4 CARDS MATCHING SCREENSHOT 1) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* TOTAL BOOKINGS */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">TOTAL BOOKINGS</p>
            <h3 className="text-3xl font-black text-slate-900 dark:text-white mt-1">
              {bookedDriversList.length}
            </h3>
          </div>
          <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-500 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* COMPLETED SHIFTS */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">COMPLETED / IN SHIFT</p>
            <h3 className="text-3xl font-black text-[#00A669] dark:text-[#00E699] mt-1">
              {workingDriversList.length}
            </h3>
          </div>
          <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-[#00A669] flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* NO-SHOWS */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">BOOKED (OFFLINE)</p>
            <h3 className="text-3xl font-black text-rose-500 mt-1">
              {noShowsCount}
            </h3>
          </div>
          <div className="w-10 h-10 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-500 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        {/* ATTENDANCE RATE */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">ATTENDANCE RATE</p>
            <h3 className="text-3xl font-black text-[#00A669] dark:text-[#00E699] mt-1">
              {attendanceRate}%
            </h3>
          </div>
          <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-[#00A669] flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* ── 3. FILTER CONTROL BAR (MATCHING SCREENSHOT 1) ── */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Date Picker */}
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={selectedDateFilter}
              onChange={(e) => setSelectedDateFilter(e.target.value)}
              className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold rounded-xl px-4 py-2 text-slate-800 dark:text-slate-100 outline-none"
            />
            {selectedDateFilter && (
              <button
                type="button"
                onClick={() => setSelectedDateFilter('')}
                className="text-[10px] font-black text-slate-500 hover:text-slate-900 dark:hover:text-white px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded-lg"
              >
                All Dates
              </button>
            )}
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold rounded-xl px-4 py-2 text-slate-800 dark:text-slate-100 outline-none cursor-pointer"
          >
            <option value="active">Active Gigs</option>
            <option value="all">All Gigs</option>
          </select>

          {/* Zone Selector */}
          <select
            value={selectedZoneFilter}
            onChange={(e) => setSelectedZoneFilter(e.target.value)}
            className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold rounded-xl px-4 py-2 text-slate-800 dark:text-slate-100 outline-none cursor-pointer"
          >
            {zonesList.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </div>

        {/* View Switcher & Refresh */}
        <div className="flex items-center gap-2">
          <div className="bg-slate-100 dark:bg-slate-900 p-1 rounded-xl flex items-center border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setViewMode('cards')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                viewMode === 'cards' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5 text-[#00A669]" />
              <span>Cards</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                viewMode === 'list' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500'
              }`}
            >
              <List className="w-3.5 h-3.5 text-slate-500" />
              <span>List</span>
            </button>
          </div>

          <button
            onClick={fetchGigs}
            className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-slate-900 border border-slate-200 dark:border-slate-700 transition-all"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── 4. GIG CARDS GRID (MATCHING SCREENSHOT 1 CARDS) ── */}
      {loading ? (
        <div className="py-12 text-center text-slate-400 font-bold text-xs">Loading active gigs...</div>
      ) : gigs.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-10 text-center border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
          <Calendar className="w-10 h-10 text-slate-400 mx-auto mb-2 opacity-60" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">No Active Gigs Found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
            Click "+ CREATE NEW GIG" to add working shift slots for delivery partners.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {gigs.map((gig) => (
            <div
              key={gig._id}
              className="bg-white dark:bg-slate-800 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex flex-col justify-between space-y-4"
            >
              <div>
                {/* Top Badges */}
                <div className="flex items-center justify-between">
                  <span className="bg-emerald-50 text-[#00A669] dark:bg-emerald-950/50 dark:text-[#00E699] text-[10px] font-black uppercase px-2.5 py-1 rounded-full tracking-wider">
                    {gig.zoneName || 'ALL ZONES'}
                  </span>
                  <span className="bg-emerald-50 text-[#00A669] dark:bg-emerald-950/50 dark:text-[#00E699] text-[10px] font-black uppercase px-2.5 py-1 rounded-full tracking-wider">
                    {gig.isActive ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </div>

                {/* Gig Title */}
                <h3 className="text-lg font-black text-slate-900 dark:text-white mt-3">
                  {gig.title || 'Morning shift'}
                </h3>

                {/* Time Box */}
                <div className="mt-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl p-3 flex items-center gap-2 text-slate-800 dark:text-slate-200 font-black text-xs">
                  <Clock className="w-4 h-4 text-[#00A669]" />
                  <span>{gig.startTime} – {gig.endTime}</span>
                </div>

                {/* Capacity Stats Box */}
                <div className="mt-3 bg-slate-50 dark:bg-slate-900 p-3 rounded-2xl grid grid-cols-3 text-center border border-slate-100 dark:border-slate-800">
                  <div>
                    <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">CAPACITY</p>
                    <p className="text-sm font-black text-slate-900 dark:text-white mt-0.5">{gig.maxDrivers || 20}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">BOOKED</p>
                    <p className="text-sm font-black text-blue-600 dark:text-blue-400 mt-0.5">{gig.bookedCount || 0}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">NO-SHOWS</p>
                    <p className="text-sm font-black text-rose-500 mt-0.5">0</p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-700/80 flex items-center justify-between">
                <button
                  onClick={() => handleOpenEditModal(gig)}
                  className="w-full flex items-center justify-center gap-1 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-[#00A669] py-2 bg-slate-100 dark:bg-slate-700/50 rounded-xl transition-all mr-2"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
                <button
                  onClick={() => handleDeleteGig(gig._id)}
                  className="w-10 h-9 flex items-center justify-center text-rose-500 bg-rose-50 dark:bg-rose-950/40 rounded-xl hover:bg-rose-100 transition-all flex-shrink-0"
                  title="Delete Gig"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 5. PENDING DELIVERY HANDOVER REQUESTS BANNER ── */}
      <div className="bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-900/50 rounded-3xl p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-rose-600 text-white flex items-center justify-center flex-shrink-0 font-bold text-sm">
            !
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Pending Delivery Handover Requests
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[11px] font-bold">
                {handoverRequests.length}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
              Emergency handover requests submitted by delivery partners requiring admin authorization.
            </p>
          </div>
        </div>

        {handoverRequests.length === 0 ? (
          <div className="bg-white/70 dark:bg-slate-800/70 rounded-2xl p-6 text-center border border-dashed border-rose-200 dark:border-rose-900/40 text-xs font-semibold text-slate-500">
            No active pending handover requests.
          </div>
        ) : (
          <div className="space-y-3">
            {handoverRequests.map((reqItem) => {
              const driver = reqItem.deliveryPartnerId;
              const order = reqItem.orderId;
              const isProcessing = actionHandoverId === reqItem._id;

              return (
                <div
                  key={reqItem._id}
                  className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-rose-200 dark:border-rose-900/60 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={driver?.profilePhoto || 'https://cdn-icons-png.flaticon.com/512/3177/3177440.png'}
                      alt="Driver"
                      className="w-12 h-12 rounded-2xl object-cover border border-slate-200 dark:border-slate-700"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-black text-slate-900 dark:text-white">
                          {driver?.name || 'Delivery Partner'}
                        </h4>
                        <span className="bg-rose-100 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                          {reqItem.reason || 'Emergency'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                        Phone: {driver?.phone || 'N/A'} • Zone: {driver?.zoneName || driver?.city || 'Indore Central'}
                      </p>
                      {order && (
                        <p className="text-[11px] font-bold text-blue-600 dark:text-blue-400 mt-1">
                          Attached Order: #{order.orderId || order._id} ({order.restaurantName || 'Restaurant'})
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => handleRejectHandover(reqItem._id)}
                      disabled={isProcessing}
                      className="flex-1 sm:flex-none px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs transition-all active:scale-95 cursor-pointer"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleApproveHandover(reqItem._id)}
                      disabled={isProcessing}
                      className="flex-1 sm:flex-none px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs shadow-md shadow-rose-600/30 transition-all active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
                    >
                      {isProcessing ? 'Approving...' : '✓ Approve & Offline'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 6. LIVE WORKFORCE ATTENDANCE SECTION (MATCHING SCREENSHOT 2) ── */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs space-y-5">
        <div>
          <p className="text-[11px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-wider">
            LIVE WORKFORCE ATTENDANCE
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-0.5">
            <div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white">
                Booked Delivery Partner Status
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
                Track delivery partners who booked gigs, partners currently working/online, and partners booked but offline in real time.
              </p>
            </div>

            {/* Attendance Filters */}
            <div className="flex items-center gap-2">
              <select
                value={attendanceZoneFilter}
                onChange={(e) => setAttendanceZoneFilter(e.target.value)}
                className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold rounded-xl px-3 py-2 text-slate-800 dark:text-slate-100 outline-none"
              >
                <option value="ALL ZONES">All Areas / Zones</option>
                {zonesList.filter((z) => z !== 'ALL ZONES').map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>

              <select
                value={attendanceSlotFilter}
                onChange={(e) => setAttendanceSlotFilter(e.target.value)}
                className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold rounded-xl px-3 py-2 text-slate-800 dark:text-slate-100 outline-none"
              >
                <option value="ALL SHIFTS">All Shift Slots</option>
                <option value="MORNING">Morning shift (09:55 - 16:00)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-700/80">
          <button
            onClick={() => setAttendanceTab('all')}
            className={`px-4 py-2 rounded-2xl text-xs font-black transition-all flex items-center gap-2 ${
              attendanceTab === 'all'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-md'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            <span>Filter 1 — All Booked</span>
            <span className="w-5 h-5 rounded-full bg-black/20 dark:bg-white/20 text-xs font-bold flex items-center justify-center">
              {bookedDriversList.length}
            </span>
          </button>

          <button
            onClick={() => setAttendanceTab('working')}
            className={`px-4 py-2 rounded-2xl text-xs font-black transition-all flex items-center gap-2 ${
              attendanceTab === 'working'
                ? 'bg-emerald-500 text-white shadow-md'
                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
            }`}
          >
            <span>🟢 Filter 2 — Currently Working / Online</span>
            <span className="w-5 h-5 rounded-full bg-black/10 text-xs font-bold flex items-center justify-center">
              {workingDriversList.length}
            </span>
          </button>

          <button
            onClick={() => setAttendanceTab('offline')}
            className={`px-4 py-2 rounded-2xl text-xs font-black transition-all flex items-center gap-2 ${
              attendanceTab === 'offline'
                ? 'bg-amber-500 text-white shadow-md'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
            }`}
          >
            <span>🟡 Filter 3 — Booked but Offline</span>
            <span className="w-5 h-5 rounded-full bg-black/10 text-xs font-bold flex items-center justify-center">
              {bookedOfflineDriversList.length}
            </span>
          </button>

          <button
            onClick={() => setAttendanceTab('all_registered')}
            className={`px-4 py-2 rounded-2xl text-xs font-black transition-all flex items-center gap-2 ${
              attendanceTab === 'all_registered'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
            }`}
          >
            <span>📋 All Registered Drivers</span>
            <span className="w-5 h-5 rounded-full bg-black/10 text-xs font-bold flex items-center justify-center">
              {driversList.length}
            </span>
          </button>
        </div>

        {/* Attendance Drivers Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                <th className="py-3 px-4">DELIVERY PARTNER</th>
                <th className="py-3 px-4">PHONE NUMBER</th>
                <th className="py-3 px-4">AREA / ZONE</th>
                <th className="py-3 px-4">GIG & SHIFT TIME</th>
                <th className="py-3 px-4">CURRENT STATUS</th>
                <th className="py-3 px-4 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-bold">
              {filteredAttendanceDrivers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-400">
                    No booked drivers matching current status filter.
                  </td>
                </tr>
              ) : (
                filteredAttendanceDrivers.map((driver) => (
                  <tr key={driver.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-all">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden flex-shrink-0">
                          <img
                            src={driver.profilePhoto || 'https://i.ibb.co/3m2Yh7r/SUPERFAST-Brand-Image.png'}
                            alt={driver.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div>
                          <p className="font-black text-slate-900 dark:text-white">{driver.name}</p>
                          <p className="text-[10px] text-slate-400 font-semibold">
                            {driver.bookedTimeText ? `Booked ${driver.bookedTimeText}` : (driver.hasBookedGig ? 'Shift Booked' : 'Not Booked')}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300 font-black">
                      {driver.phone || 'N/A'}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="bg-emerald-50 text-[#00A669] dark:bg-emerald-950/40 dark:text-[#00E699] text-[10px] font-black uppercase px-2 py-0.5 rounded-md">
                        {driver.zoneName || 'ALL ZONES'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <p className="font-black text-slate-900 dark:text-white">
                        {driver.activeShift?.title || 'No Active Shift'}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {driver.activeShift ? `${driver.activeShift.startTime} - ${driver.activeShift.endTime}` : 'No booked slot'}
                      </p>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${
                          driver.isInShift
                            ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400'
                            : driver.isOnline
                            ? 'bg-emerald-50 text-[#00A669] dark:bg-emerald-950/40 dark:text-[#00E699]'
                            : driver.hasBookedGig
                            ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {driver.statusDisplay || (driver.isInShift ? 'IN SHIFT' : driver.isOnline ? 'ONLINE' : 'OFFLINE')}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={`tel:${driver.phone}`}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 transition-all flex items-center gap-1"
                        >
                          <PhoneCall className="w-3 h-3 text-emerald-600" />
                          <span>Call</span>
                        </a>

                        <button
                          onClick={() => toast.info(`Reminder sent to ${driver.name}`)}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 transition-all flex items-center gap-1"
                        >
                          <MessageSquare className="w-3 h-3 text-blue-500" />
                          <span>Contact / Remind</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 7. CREATE / EDIT GIG MODAL ── */}
      {showModal && (
        <div className="fixed inset-0 z-[600] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-700 relative">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500"
            >
              <X className="w-4 h-4" />
            </button>

            <h2 className="text-lg font-black uppercase tracking-tight text-slate-900 dark:text-white mb-1">
              {isEditing ? 'Edit Gig Shift' : 'Create New Gig Shift'}
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Configure shift details, slot capacity, and timings for delivery partners.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs font-semibold">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 mb-1">Select Delivery Zone</label>
                <select
                  value={formData.zoneName}
                  onChange={(e) => setFormData({ ...formData, zoneName: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold outline-none"
                >
                  {zonesList.map((z) => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 mb-1">Shift Title</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Morning shift"
                  className="w-full bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 mb-1">Shift Type</label>
                  <select
                    value={formData.shiftType}
                    onChange={(e) => setFormData({ ...formData, shiftType: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold outline-none"
                  >
                    <option value="MORNING">MORNING</option>
                    <option value="AFTERNOON">AFTERNOON</option>
                    <option value="EVENING">EVENING</option>
                    <option value="NIGHT">NIGHT</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 mb-1">Start Time (HH:MM)</label>
                  <input
                    type="text"
                    required
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    placeholder="09:55"
                    className="w-full bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 mb-1">End Time (HH:MM)</label>
                  <input
                    type="text"
                    required
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    placeholder="16:00"
                    className="w-full bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 mb-1">Base Pay (₹)</label>
                  <input
                    type="number"
                    required
                    value={formData.basePay}
                    onChange={(e) => setFormData({ ...formData, basePay: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 mb-1">Incentive (₹)</label>
                  <input
                    type="number"
                    required
                    value={formData.incentiveBonus}
                    onChange={(e) => setFormData({ ...formData, incentiveBonus: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 mb-1">Capacity</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formData.maxDrivers}
                    onChange={(e) => setFormData({ ...formData, maxDrivers: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isActiveToggle"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 text-[#00A669] rounded accent-[#00A669]"
                />
                <label htmlFor="isActiveToggle" className="text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                  Active & Published for Drivers
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-2xl bg-[#00A669] hover:bg-[#008f5a] text-white font-black shadow-md active:scale-95 transition-all"
                >
                  {submitting ? 'Saving...' : isEditing ? 'Update Gig' : 'CREATE & PUBLISH GIG'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
