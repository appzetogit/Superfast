import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { adminAPI } from "@food/api";
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import io from "socket.io-client";
import {
  Search,
  MapPin,
  CheckCircle2,
  Package,
  Bike,
  Truck,
  Phone,
  Power,
  Navigation,
  Check,
  Building2,
  User,
  Star,
  AlertCircle,
  ExternalLink,
  SlidersHorizontal,
  X
} from "lucide-react";

// Mock Data for Delivery Partners
const mockPartners = [
  { id: 1, name: "Aman Kuril", phone: "7974161582", vehicle: "bike", vehicleNo: "Mp01as1237", isOnline: true, status: "Free", deliveredToday: 0, orders: [] },
  { id: 2, name: "Vishnu Sharma", phone: "8882236180", vehicle: "bike", vehicleNo: "Mp01as1238", isOnline: true, status: "Busy", deliveredToday: 2, orders: [{ id: "10042", restaurant: "Pizza Fusion", status: "Delivering" }] },
  { id: 3, name: "Bantu Kumar", phone: "9084466541", vehicle: "truck", vehicleNo: "Mp01as1239", isOnline: true, status: "Free", deliveredToday: 1, orders: [] },
  { id: 4, name: "Harsh Sharma", phone: "8800301216", vehicle: "bike", vehicleNo: "Mp01as1240", isOnline: false, status: "Offline", deliveredToday: 3, orders: [] },
  { id: 5, name: "Pankaj Sharma", phone: "9719352801", vehicle: "bike", vehicleNo: "Mp01as1241", isOnline: true, status: "Free", deliveredToday: 0, orders: [] },
  { id: 6, name: "GM", phone: "8624862400", vehicle: "bike", vehicleNo: "Mp01as1242", isOnline: true, status: "Free", deliveredToday: 4, orders: [] },
  { id: 7, name: "Rajkumar Sharma", phone: "9084896959", vehicle: "bike", vehicleNo: "Mp01as1243", isOnline: true, status: "Free", deliveredToday: 1, orders: [] },
  { id: 8, name: "Ranjeet Singh", phone: "7895837305", vehicle: "bike", vehicleNo: "Mp01as1244", isOnline: true, status: "Free", deliveredToday: 0, orders: [] },
  { id: 9, name: "Ajay Kumar", phone: "8126884371", vehicle: "bike", vehicleNo: "Mp01as1245", isOnline: true, status: "Free", deliveredToday: 2, orders: [] },
  { id: 10, name: "Arjun Singh", phone: "8396856153", vehicle: "bike", vehicleNo: "Mp01as1246", isOnline: true, status: "Free", deliveredToday: 0, orders: [] },
  { id: 11, name: "Shri krishnan", phone: "7668222135", vehicle: "bike", vehicleNo: "Mp01as1247", isOnline: true, status: "Free", deliveredToday: 5, orders: [] }
];

// Mock Data for Restaurants
const mockRestaurants = [
  { id: 1, name: "The Air Bites PVT.LTD.", phone: "9876543210", address: "Pipliyahana, Indore", rating: 4.8, isOnline: true, category: "Indian Bite" },
  { id: 2, name: "Burger Palace", phone: "9876543211", address: "Vijay Nagar, Indore", rating: 4.5, isOnline: true, category: "Fast Food" },
  { id: 3, name: "Pizza Fusion", phone: "9876543212", address: "Rajendra Nagar, Indore", rating: 4.2, isOnline: true, category: "Italian" },
  { id: 4, name: "Royal Biryani", phone: "9876543213", address: "Palasia, Indore", rating: 4.6, isOnline: false, category: "Mughlai" },
  { id: 5, name: "Chai Chaska", phone: "9876543214", address: "Bhawarkua, Indore", rating: 4.0, isOnline: true, category: "Beverages" }
];

export default function StatusMonitor() {
  const [activeToggle, setActiveToggle] = useState("partners"); // "restaurants" or "partners"
  const [activeReassignOrder, setActiveReassignOrder] = useState(null);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [availableDrivers, setAvailableDrivers] = useState([]);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [isLoadingDrivers, setIsLoadingDrivers] = useState(false);
  const [isSubmittingReassign, setIsSubmittingReassign] = useState(false);
  const [reassignMessage, setReassignMessage] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPartnerId, setSelectedPartnerId] = useState(null);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(null);
  const [partners, setPartners] = useState([]);
  const [restaurantsState, setRestaurantsState] = useState([]);
  
  // Dynamic Orders State for Selected Partner
  const [partnerOrders, setPartnerOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loading, setLoading] = useState(false);

  // Assign Order Form State
  const [orderIdInput, setOrderIdInput] = useState("");
  const [assignmentMessage, setAssignmentMessage] = useState(null);

  // New Filters States
  const [statusFilter, setStatusFilter] = useState("all"); // "all", "online", "offline"
  const [selectedZone, setSelectedZone] = useState("all"); // "all" or specific zone name
  const [zones, setZones] = useState([]);

  // Filters & Sorting Modal States
  const [sortBy, setSortBy] = useState("online_first"); // "online_first", "name_asc"
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [tempStatus, setTempStatus] = useState("all");
  const [tempZone, setTempZone] = useState("all");
  const [tempSort, setTempSort] = useState("online_first");

  // Filters & Counts
  const activePartner = useMemo(() => {
    return partners.find(p => p._id === selectedPartnerId) || partners[0];
  }, [partners, selectedPartnerId]);

  const activeRestaurant = useMemo(() => {
    return restaurantsState.find(r => r._id === selectedRestaurantId) || restaurantsState[0];
  }, [restaurantsState, selectedRestaurantId]);

  const filteredPartners = useMemo(() => {
    return partners
      .filter(p => {
        // 1. Search filter
        const matchesSearch = (p.name || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
                              (p.phone || "").includes(searchQuery);

        // 2. Status filter
        const isOnline = p.availabilityStatus === 'online';
        const matchesStatus = statusFilter === 'all' || 
                              (statusFilter === 'online' && isOnline) || 
                              (statusFilter === 'offline' && !isOnline);

        // 3. Zone filter
        const matchesZone = selectedZone === 'all' || 
                            (p.zone && p.zone === selectedZone);

        return matchesSearch && matchesStatus && matchesZone;
      })
      .sort((a, b) => {
        if (sortBy === "online_first") {
          const aOnline = a.availabilityStatus === 'online' ? 1 : 0;
          const bOnline = b.availabilityStatus === 'online' ? 1 : 0;
          if (bOnline !== aOnline) {
            return bOnline - aOnline; // Online first
          }
        }
        // Alphabetical secondary or primary sort
        return (a.name || "").localeCompare(b.name || "");
      });
  }, [partners, searchQuery, statusFilter, selectedZone, sortBy]);

  const filteredRestaurants = useMemo(() => {
    return restaurantsState.filter(r => 
      (r.restaurantName || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
      (r.ownerPhone || "").includes(searchQuery)
    );
  }, [restaurantsState, searchQuery]);

  // Map Refs
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  // Initialize/Update Google Map
  useEffect(() => {
    let active = true;
    async function initMap() {
      if (!activePartner) return;
      const lat = Number(activePartner.lastLat) || 22.7196; // Indore fallback
      const lng = Number(activePartner.lastLng) || 75.8577; // Indore fallback

      // Wait for container ref
      if (!mapContainerRef.current) return;

      const apiKey = await getGoogleMapsApiKey();
      
      // Wait for window.google
      let retries = 0;
      while (!window.google && retries < 30) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
      }

      if (!active) return;

      let google = window.google;
      if (!google && apiKey) {
        try {
          const { Loader } = await import("@googlemaps/js-api-loader");
          const loader = new Loader({
            apiKey: apiKey,
            version: "weekly",
            libraries: ["places"]
          });
          google = await loader.load();
        } catch (err) {
          console.error("Failed to load Google Maps Loader:", err);
        }
      }

      if (!google || !mapContainerRef.current || !document.body.contains(mapContainerRef.current) || !active) return;

      const position = { lat, lng };

      if (!mapInstanceRef.current) {
        // Create map
        if (!document.body.contains(mapContainerRef.current)) return;
        const map = new google.maps.Map(mapContainerRef.current, {
          center: position,
          zoom: 14,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
        });
        mapInstanceRef.current = map;

        // Trigger container resizing adjustment right after map successfully mounts
        google.maps.event.trigger(map, 'resize');

        // Delay slightly to ensure layout is fully initialized and bounds are set
        setTimeout(() => {
          if (mapInstanceRef.current && document.body.contains(mapContainerRef.current)) {
            google.maps.event.trigger(mapInstanceRef.current, 'resize');
            mapInstanceRef.current.setCenter(position);
          }
        }, 150);

        // Create marker
        const marker = new google.maps.Marker({
          position: position,
          map: map,
          title: activePartner.name || "Delivery Partner",
          icon: {
            url: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
            scaledSize: new google.maps.Size(32, 32)
          }
        });
        markerRef.current = marker;
      } else {
        // Update map center & marker position
        if (mapInstanceRef.current && document.body.contains(mapContainerRef.current)) {
          google.maps.event.trigger(mapInstanceRef.current, 'resize');
          mapInstanceRef.current.setCenter(position);
          if (markerRef.current) {
            markerRef.current.setPosition(position);
            markerRef.current.setTitle(activePartner.name || "Delivery Partner");
          }
        }
      }
    }

    initMap();
    return () => {
      active = false;
    };
  }, [activePartner]);

  // Fetch initial data
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const partnersRes = await adminAPI.getDeliveryPartners({ limit: 1000 });
        const partnersList = partnersRes?.data?.data?.deliveryPartners || partnersRes?.data?.deliveryPartners || [];
        setPartners(partnersList);
        if (partnersList.length > 0) {
          setSelectedPartnerId(partnersList[0]._id);
        }

        const restRes = await adminAPI.getRestaurants({ limit: 1000 });
        const restList = restRes?.data?.data?.restaurants || restRes?.data?.restaurants || [];
        setRestaurantsState(restList);
        if (restList.length > 0) {
          setSelectedRestaurantId(restList[0]._id);
        }

        const zonesRes = await adminAPI.getZones({ limit: 1000 });
        const zonesList = zonesRes?.data?.data?.zones || zonesRes?.data?.zones || [];
        setZones(zonesList);
      } catch (err) {
        console.error("Failed to load Status Monitor initial data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const fetchOrdersForActivePartner = useCallback(async () => {
    if (!selectedPartnerId) {
      setPartnerOrders([]);
      return;
    }
    setLoadingOrders(true);
    try {
      const ordersRes = await adminAPI.getOrders({ deliveryPartnerId: selectedPartnerId, limit: 10 });
      const ordersList = ordersRes?.data?.data?.orders || ordersRes?.data?.orders || [];
      setPartnerOrders(ordersList);
    } catch (err) {
      console.error("Failed to load partner orders:", err);
    } finally {
      setLoadingOrders(false);
    }
  }, [selectedPartnerId]);

  useEffect(() => {
    fetchOrdersForActivePartner();
  }, [fetchOrdersForActivePartner]);

  const handleReassignClick = async (order) => {
    setActiveReassignOrder(order);
    setShowReassignModal(true);
    setIsLoadingDrivers(true);
    try {
      const res = await adminAPI.getAvailableDriversForOrder(order._id || order.id);
      const list = res?.data?.data?.drivers || res?.data?.drivers || [];
      setAvailableDrivers(list);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingDrivers(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("admin_accessToken") || localStorage.getItem("accessToken");
    const resolveSocketOrigin = (value) => {
      const raw = String(value || "").trim();
      if (!raw) return "";
      try {
        return new URL(raw).origin;
      } catch {
        return raw.replace(/\/api\/v\d+\/?$/i, "").replace(/\/api\/?$/i, "").replace(/\/+$/, "");
      }
    };
    const socketOrigin = import.meta.env.VITE_API_URL || window.location.origin;
    if (!token || !socketOrigin) return undefined;

    const socket = io(resolveSocketOrigin(socketOrigin), {
      path: "/socket.io/",
      transports: ["websocket", "polling"],
      auth: { token },
    });

    socket.on("reassignment_complete", (data) => {
      toast.success("Order Reassignment Complete!");
      fetchOrdersForActivePartner();
      adminAPI.getDeliveryPartners({ limit: 1000 }).then(res => {
         const partnersList = res?.data?.data?.deliveryPartners || res?.data?.deliveryPartners || [];
         setPartners(partnersList);
      }).catch(err => console.error(err));
    });

    socket.on("driver_rejected_reassignment", (data) => {
      toast.error("Reassignment Rejected by driver.");
      fetchOrdersForActivePartner();
    });

    socket.on("reassignment_timed_out", (data) => {
      toast.error("Reassignment Timed Out.");
      fetchOrdersForActivePartner();
    });

    socket.on("driver_status_updated", (data) => {
      if (data && data.partnerId && data.status) {
         setPartners(prev => prev.map(p => {
           if (p._id === data.partnerId) {
             return { ...p, availabilityStatus: data.status };
           }
           return p;
         }));
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [fetchOrdersForActivePartner]);

  // Actions
  const handleToggleOnline = async (id) => {
    const partner = partners.find(p => p._id === id);
    if (!partner) return;

    const newStatus = partner.availabilityStatus === 'online' ? 'offline' : 'online';
    try {
      const res = await adminAPI.updateDeliveryPartnerStatus(id, newStatus);
      if (res?.data?.success || res?.success) {
        setPartners(prev => prev.map(p => {
          if (p._id === id) {
            return {
              ...p,
              availabilityStatus: newStatus
            };
          }
          return p;
        }));
      }
    } catch (err) {
      console.error("Failed to update partner availability:", err);
    }
  };

  const handleAssignOrder = async (e) => {
    e.preventDefault();
    if (!orderIdInput.trim() || !selectedPartnerId) return;

    try {
      setAssignmentMessage(null);
      const res = await adminAPI.assignOrder(orderIdInput.trim(), selectedPartnerId);
      if (res?.data?.success || res?.success) {
        setAssignmentMessage({ type: "success", text: `Order #${orderIdInput} assigned successfully!` });
        // Refresh partner's orders list
        const ordersRes = await adminAPI.getOrders({ deliveryPartnerId: selectedPartnerId, limit: 10 });
        const ordersList = ordersRes?.data?.data?.orders || ordersRes?.data?.orders || [];
        setPartnerOrders(ordersList);
        setOrderIdInput("");
      } else {
        setAssignmentMessage({ type: "error", text: res?.data?.message || "Failed to assign order" });
      }
    } catch (err) {
      console.error(err);
      setAssignmentMessage({ type: "error", text: err?.response?.data?.message || err?.message || "Failed to assign order" });
    }
    setTimeout(() => setAssignmentMessage(null), 5000);
  };

  return (
    <div className="p-4 md:p-6 w-full max-w-none space-y-6 text-neutral-800 dark:text-neutral-200">
      
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-neutral-100 dark:border-neutral-800 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">Live Status Monitor</h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Real-time status of service locations and delivery fleets</p>
        </div>
        
        {/* Toggle Buttons */}
        <div className="flex items-center gap-2 p-1 bg-neutral-100 dark:bg-neutral-800/80 rounded-xl">
          <button
            type="button"
            onClick={() => { setActiveToggle("restaurants"); setSearchQuery(""); }}
            className={`px-4 py-2 text-xs font-bold uppercase rounded-lg transition-all ${
              activeToggle === "restaurants"
                ? "bg-[#cc2532] text-white shadow-sm"
                : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
            }`}
          >
            Restaurants ({restaurantsState.length})
          </button>
          <button
            type="button"
            onClick={() => { setActiveToggle("partners"); setSearchQuery(""); }}
            className={`px-4 py-2 text-xs font-bold uppercase rounded-lg transition-all ${
              activeToggle === "partners"
                ? "bg-[#cc2532] text-white shadow-sm"
                : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
            }`}
          >
            Delivery Partners ({partners.length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <span className="text-sm font-medium text-neutral-500">Loading directory...</span>
        </div>
      ) : (
        /* Main Grid View */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full">
          
          {/* LEFT COLUMN: directory list (approx 35% / 4 cols) */}
          <div className="lg:col-span-4 bg-white dark:bg-[#111115] border border-neutral-150 dark:border-neutral-800/80 rounded-2xl p-4 shadow-[0_4px_20px_rgba(0,0,0,0.02)] flex flex-col h-[650px]">
            
            <span className="text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-2">
              {activeToggle === "partners" ? "All Partners" : "All Restaurants"}
            </span>

            {/* Search Box & Filter Button */}
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <input
                  type="text"
                  placeholder={activeToggle === "partners" ? "Search partners..." : "Search restaurants..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-neutral-900 dark:text-white placeholder:text-neutral-400"
                />
              </div>
              {activeToggle === "partners" && (
                <button
                  type="button"
                  onClick={() => {
                    setTempStatus(statusFilter);
                    setTempZone(selectedZone);
                    setTempSort(sortBy);
                    setIsFilterOpen(true);
                  }}
                  className={`p-2 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 transition-colors flex items-center justify-center shrink-0 ${
                    statusFilter !== "all" || selectedZone !== "all" || sortBy !== "online_first"
                      ? "border-[#cc2532] text-[#cc2532] bg-red-50/10"
                      : ""
                  }`}
                  title="Filters and Sorting"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Scrollable List Container */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              <AnimatePresence>
                {activeToggle === "partners" ? (
                  filteredPartners.map((partner) => {
                    const isSelected = selectedPartnerId === partner._id;
                    const isOnline = partner.availabilityStatus === 'online';
                    return (
                      <motion.button
                        key={partner._id}
                        onClick={() => setSelectedPartnerId(partner._id)}
                        className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                          isSelected
                            ? "border-[#cc2532] bg-red-50/20 dark:bg-red-950/10 shadow-sm"
                            : "border-neutral-100 dark:border-neutral-800/60 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-500 shrink-0">
                            {partner.vehicleType === "truck" ? <Truck className="w-4 h-4" /> : <User className="w-4 h-4" />}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-bold text-neutral-900 dark:text-white truncate">{partner.name}</span>
                            <span className="text-[10px] text-neutral-400 font-medium truncate mt-0.5">{partner.phone}</span>
                          </div>
                        </div>
                        <div className="flex items-center shrink-0">
                          <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? "bg-emerald-500" : "bg-neutral-300"}`} />
                        </div>
                      </motion.button>
                    );
                  })
                ) : (
                  filteredRestaurants.map((restaurant) => {
                    const isSelected = selectedRestaurantId === restaurant._id;
                    const isApproved = restaurant.status === 'approved';
                    return (
                      <motion.button
                        key={restaurant._id}
                        onClick={() => setSelectedRestaurantId(restaurant._id)}
                        className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                          isSelected
                            ? "border-[#cc2532] bg-red-50/20 dark:bg-red-950/10 shadow-sm"
                            : "border-neutral-100 dark:border-neutral-800/60 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-500 shrink-0">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-bold text-neutral-900 dark:text-white truncate">{restaurant.restaurantName}</span>
                            <span className="text-[10px] text-neutral-400 font-medium truncate mt-0.5">{restaurant.city || "Restaurant"}</span>
                          </div>
                        </div>
                        <div className="flex items-center shrink-0">
                          <span className={`w-2.5 h-2.5 rounded-full ${isApproved ? "bg-emerald-500" : "bg-neutral-300"}`} />
                        </div>
                      </motion.button>
                    );
                  })
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* RIGHT COLUMN: detail panel (approx 65% / 8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            
            {activeToggle === "partners" ? (
              activePartner ? (
                <div className="bg-white dark:bg-[#111115] border border-neutral-150 dark:border-neutral-800/80 rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)] space-y-6">
                  
                  {/* Partner Metadata */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-500">
                        {activePartner.vehicleType === "truck" ? <Truck className="w-6 h-6" /> : <Bike className="w-6 h-6" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-bold text-neutral-900 dark:text-white">{activePartner.name}</h2>
                          <span className={`w-2.5 h-2.5 rounded-full ${activePartner.availabilityStatus === 'online' ? "bg-emerald-500 animate-pulse" : "bg-neutral-300"}`} />
                        </div>
                        <p className="text-xs text-neutral-500 font-medium">{activePartner.phone}</p>
                        <p className="text-[10px] text-neutral-400 font-bold mt-1 uppercase">Vehicle: {activePartner.vehicleType || "bike"} ({activePartner.vehicleNumber || activePartner.deliveryId || "N/A"})</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleOnline(activePartner._id)}
                      className={`px-3 py-1.5 border text-xs font-bold rounded-lg transition-all ${
                        activePartner.availabilityStatus === 'online'
                          ? "border-red-500 text-red-500 hover:bg-red-50/50"
                          : "border-emerald-500 text-emerald-500 hover:bg-emerald-50/50"
                      }`}
                    >
                      {activePartner.availabilityStatus === 'online' ? "Mark Offline" : "Mark Online"}
                    </button>
                  </div>

                  {/* Manual Assign Order Box */}
                  <div className="bg-blue-50/50 dark:bg-blue-950/10 border border-blue-100 dark:border-blue-900/30 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-xs font-bold text-blue-800 dark:text-blue-300">Manual Assign Order</span>
                    </div>
                    
                    <form onSubmit={handleAssignOrder} className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Order ID (e.g. 10042)"
                        value={orderIdInput}
                        onChange={(e) => setOrderIdInput(e.target.value)}
                        className="flex-1 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-900 dark:text-white focus:outline-none focus:border-blue-500 placeholder:text-neutral-400"
                      />
                      <button
                        type="submit"
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-sm transition-all"
                      >
                        Assign
                      </button>
                    </form>

                    {assignmentMessage && (
                      <p className={`text-[10px] font-bold flex items-center gap-1 mt-1 ${assignmentMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {assignmentMessage.type === 'success' ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                        {assignmentMessage.text}
                      </p>
                    )}
                  </div>

                  {/* Status Grid Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="border border-neutral-100 dark:border-neutral-800/80 rounded-xl p-4 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block">Delivered Today</span>
                        <span className="text-xl font-black text-neutral-900 dark:text-white mt-1 block">{activePartner.totalOrders || 0}</span>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                    </div>

                    <div className="border border-neutral-100 dark:border-neutral-800/80 rounded-xl p-4 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block">Current Status</span>
                        <span className={`text-sm font-bold mt-1.5 block ${activePartner.availabilityStatus === 'online' ? "text-neutral-950 dark:text-white" : "text-amber-600 dark:text-amber-400"}`}>
                          {activePartner.availabilityStatus === 'online' ? 'Free' : 'Offline'}
                        </span>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-neutral-50 dark:bg-neutral-800 text-neutral-500 flex items-center justify-center">
                        <Package className="w-5 h-5" />
                      </div>
                    </div>
                  </div>

                  {/* Bottom Row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Today's Orders Card */}
                    <div className="border border-neutral-100 dark:border-neutral-800/80 rounded-xl p-4 flex flex-col h-[220px]">
                      <div className="flex items-center gap-2 mb-4">
                        <Package className="w-4 h-4 text-neutral-500" />
                        <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300">Today's Orders</span>
                      </div>

                      <div className="flex-1 flex flex-col items-center justify-center gap-2">
                        {loadingOrders ? (
                          <span className="text-xs text-neutral-500">Loading orders...</span>
                        ) : partnerOrders.length > 0 ? (
                          <div className="w-full space-y-2 overflow-y-auto max-h-[140px] pr-1">
                            {partnerOrders.map((o, idx) => (
                              <div key={idx} className="p-2 border border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 rounded-lg flex justify-between items-center text-[10px]">
                                <div>
                                  <span className="font-bold text-neutral-800 dark:text-white">Order #{o.orderId || o._id}</span>
                                  <span className="block text-neutral-400 truncate max-w-[140px]">{o.restaurantId?.restaurantName || "Direct Order"}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded font-bold uppercase text-[9px]">{o.orderStatus}</span>
                                  {!['delivered', 'cancelled_by_user', 'cancelled_by_restaurant', 'cancelled_by_admin'].includes(o.orderStatus) && (
                                    <button
                                      type="button"
                                      disabled={o.reassignmentStatus === 'pending'}
                                      onClick={() => handleReassignClick(o)}
                                      className="px-1.5 py-0.5 bg-orange-600 hover:bg-orange-700 disabled:bg-neutral-300 disabled:text-neutral-500 text-white rounded font-bold text-[9px] uppercase transition-colors"
                                    >
                                      {o.reassignmentStatus === 'pending' ? 'Pending' : 'Reassign'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <>
                            <Package className="w-8 h-8 text-neutral-200" />
                            <span className="text-xs text-neutral-400">No orders assigned today</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Live Tracking Preview Card */}
                    <div className="border border-neutral-100 dark:border-neutral-800/80 rounded-xl flex flex-col h-[220px] overflow-hidden relative">
                      <div ref={mapContainerRef} className="w-full h-full overflow-hidden" style={{ minHeight: '100%', minWidth: '100%' }} />
                      {!activePartner?.lastLat && (
                        <div className="absolute top-2 left-2 bg-amber-500 text-white text-[9px] font-bold px-2 py-0.5 rounded shadow-sm">
                          Using Default Fallback Location
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              ) : (
                <div className="bg-white dark:bg-[#111115] border border-neutral-100 dark:border-neutral-800 rounded-2xl p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
                  <User className="w-12 h-12 text-neutral-200" />
                  <span className="text-sm text-neutral-400 mt-2">Select a delivery partner from the directory</span>
                </div>
              )
            ) : (
              activeRestaurant ? (
                <div className="bg-white dark:bg-[#111115] border border-neutral-150 dark:border-neutral-800/80 rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)] space-y-6">
                  
                  {/* Restaurant Metadata */}
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-500">
                        <Building2 className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-bold text-neutral-900 dark:text-white">{activeRestaurant.restaurantName}</h2>
                          <span className={`w-2.5 h-2.5 rounded-full ${activeRestaurant.status === 'approved' ? "bg-emerald-500 animate-pulse" : "bg-neutral-300"}`} />
                        </div>
                        <p className="text-xs text-neutral-500 font-medium">{activeRestaurant.ownerPhone}</p>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <span className="text-[10px] bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400 font-bold px-2 py-0.5 rounded-md uppercase">
                            {activeRestaurant.category || activeRestaurant.city || "Restaurant"}
                          </span>
                          <div className="flex items-center gap-0.5 text-xs text-amber-500">
                            <Star className="w-3.5 h-3.5 fill-current" />
                            <span className="font-bold">{activeRestaurant.rating || "4.5"}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <a
                      href={`/admin/food/restaurants/edit/${activeRestaurant._id}`}
                      className="flex items-center gap-1 text-xs text-blue-600 font-bold hover:underline"
                    >
                      View Details
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  {/* Additional Details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="border border-neutral-100 dark:border-neutral-800/80 rounded-xl p-4">
                      <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block">Address</span>
                      <p className="text-xs font-bold text-neutral-800 dark:text-neutral-300 mt-1">
                        {activeRestaurant.location?.address || activeRestaurant.area || activeRestaurant.city || "N/A"}
                      </p>
                    </div>

                    <div className="border border-neutral-100 dark:border-neutral-800/80 rounded-xl p-4">
                      <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block">Real-time status</span>
                      <p className="text-xs font-bold text-neutral-800 dark:text-neutral-300 mt-1 flex items-center gap-1">
                        <span className={`w-2.5 h-2.5 rounded-full ${activeRestaurant.status === 'approved' ? "bg-emerald-500" : "bg-neutral-300"}`} />
                        {activeRestaurant.status === 'approved' ? "Receiving Orders" : "Closed / Inactive"}
                      </p>
                    </div>
                  </div>

                </div>
              ) : (
                <div className="bg-white dark:bg-[#111115] border border-neutral-100 dark:border-neutral-800 rounded-2xl p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
                  <Building2 className="w-12 h-12 text-neutral-200" />
                  <span className="text-sm text-neutral-400 mt-2">Select a restaurant from the directory</span>
                </div>
              )
            )}

          </div>

        </div>
      )}

      {/* Filters & Sorting Modal Overlay */}
      {isFilterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white dark:bg-[#111115] border border-neutral-150 dark:border-neutral-800 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-neutral-100 dark:border-neutral-800">
              <span className="text-sm font-bold text-neutral-900 dark:text-white uppercase tracking-wider">Filters and Sorting</span>
              <button
                type="button"
                onClick={() => setIsFilterOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-white p-1 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6 overflow-y-auto max-h-[60vh] custom-scrollbar">
              


              {/* Status Preference */}
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Status preference:</p>
                <div className="grid grid-cols-3 gap-2">
                  {["all", "online", "offline"].map((status) => {
                    const isSelected = tempStatus === status;
                    return (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setTempStatus(status)}
                        className={`px-3 py-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                          isSelected
                            ? "border-[#cc2532] bg-red-50/20 text-[#cc2532]"
                            : "border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-350 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                        }`}
                      >
                        {status === "online" && <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />}
                        {status === "offline" && <span className="w-2.5 h-2.5 rounded-full bg-neutral-300 dark:bg-neutral-700 shrink-0" />}
                        <span className="capitalize">{status}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Zone Preference */}
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Zone preference:</p>
                <select
                  value={tempZone}
                  onChange={(e) => setTempZone(e.target.value)}
                  className="w-full px-4 py-3 border border-neutral-200 dark:border-neutral-800 rounded-xl bg-neutral-50 dark:bg-neutral-900 text-xs font-bold text-neutral-800 dark:text-neutral-200 focus:outline-none focus:border-red-500 cursor-pointer"
                >
                  <option value="all">All Zones</option>
                  {zones.map((z) => (
                    <option key={z._id || z.id} value={z.name || z.zoneName}>
                      {z.name || z.zoneName}
                    </option>
                  ))}
                </select>
              </div>

            </div>

            {/* Footer */}
            <div className="flex justify-between items-center px-6 py-4 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30">
              <button
                type="button"
                onClick={() => {
                  setTempStatus("all");
                  setTempZone("all");
                  setTempSort("online_first");
                }}
                className="text-xs font-bold text-neutral-400 hover:text-neutral-800 dark:hover:text-white transition-colors"
              >
                Clear All
              </button>
              <button
                type="button"
                onClick={() => {
                  setStatusFilter(tempStatus);
                  setSelectedZone(tempZone);
                  setSortBy(tempSort);
                  setIsFilterOpen(false);
                }}
                className="bg-[#cc2532] hover:bg-[#b21f2b] text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-md transition-all active:scale-95"
              >
                Apply
              </button>
            </div>
          </motion.div>
        </div>
      )}
      {/* Reassign Driver Modal */}
      {showReassignModal && activeReassignOrder && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111115] rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-100 dark:border-neutral-800 animate-in fade-in zoom-in-95 duration-200 text-slate-800 dark:text-neutral-200">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-neutral-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-950 dark:text-white flex items-center gap-2">
                <Truck className="w-5 h-5 text-orange-600" />
                Reassign Delivery Partner
              </h3>
              <button 
                type="button"
                onClick={() => { setShowReassignModal(false); setReassignMessage(null); }}
                className="p-1 hover:bg-slate-50 dark:hover:bg-neutral-800 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {reassignMessage && (
                <div className={`p-3 rounded-lg text-xs font-semibold ${
                  reassignMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
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
                    className="w-full text-sm border border-slate-200 dark:border-neutral-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200"
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
                  className="w-full text-sm border border-slate-200 dark:border-neutral-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 dark:bg-neutral-900/50 border-t border-slate-100 dark:border-neutral-800 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => { setShowReassignModal(false); setReassignMessage(null); }}
                className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-neutral-300 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 hover:bg-slate-50 dark:hover:bg-neutral-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmittingReassign || !selectedDriverId}
                onClick={async () => {
                  setIsSubmittingReassign(true);
                  try {
                    const res = await adminAPI.reassignOrder(activeReassignOrder._id || activeReassignOrder.id, selectedDriverId, reassignReason);
                    if (res?.data?.success || res?.success) {
                      setReassignMessage({ type: 'success', text: 'Reassignment request sent to the driver successfully!' });
                      setTimeout(() => {
                        setShowReassignModal(false);
                        setReassignMessage(null);
                        setSelectedDriverId("");
                        setReassignReason("");
                        fetchOrdersForActivePartner();
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
                className="px-4 py-2 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 rounded-lg shadow-sm"
              >
                {isSubmittingReassign ? 'Reassigning...' : 'Confirm Reassign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
