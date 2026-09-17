import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { publicGetOnce, adminAPI } from "@food/api";
import { adminApi as quickAdminApi } from "@/modules/quickCommerce/admin/services/adminApi";
import { clearGlobalHomeCache } from "@food/hooks/useFoodHomeData";
import { Button } from "@food/components/ui/button";
import { Input } from "@food/components/ui/input";
import { Label } from "@food/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@food/components/ui/card";
import { toast } from "sonner";
import { 
  Code2, 
  ShieldCheck, 
  Smartphone, 
  MapPin, 
  UtensilsCrossed, 
  KeyRound, 
  CreditCard, 
  Eye, 
  Save, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle,
  Copy,
  Sparkles,
  Store,
  Building2
} from "lucide-react";

export default function DeveloperSettings() {
  const location = useLocation();
  const isMartPath = location.pathname.includes("/admin/quick-commerce");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(isMartPath ? "mart" : "food");
  const [approvedRestaurants, setApprovedRestaurants] = useState([]);
  const [supermartStores, setSupermartStores] = useState([]);

  // Developer / Reviewer Mode State
  const [developerMode, setDeveloperMode] = useState({
    enabled: false,
    demoRestaurantIds: [],
    demoStoreIds: [],
    demoPhoneNumbers: "9999999999",
    demoOtp: "123456",
    bypassLocationRestriction: true,
    allowTestPayment: true,
    hideLiveRestaurantsInReview: true,
  });

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch Settings, Approved Restaurants, Supermart Sellers & Public Stores in parallel
        const [settingsRes, restaurantsRes, sellersRes, storesRes] = await Promise.all([
          adminAPI.getBusinessSettings().catch(() => null),
          adminAPI.getApprovedRestaurants().catch(() => null),
          quickAdminApi.getSellers().catch(() => null),
          publicGetOnce("/quick-commerce/stores").catch(() => null),
        ]);

        if (isMounted) {
          // Process Settings
          const settingsData = settingsRes?.data?.data || settingsRes?.data || {};
          if (settingsData.developerMode) {
            const dev = settingsData.developerMode;
            setDeveloperMode({
              enabled: Boolean(dev.enabled),
              demoRestaurantIds: Array.isArray(dev.demoRestaurantIds) ? dev.demoRestaurantIds.map(String) : [],
              demoStoreIds: Array.isArray(dev.demoStoreIds) ? dev.demoStoreIds.map(String) : [],
              demoPhoneNumbers: Array.isArray(dev.demoPhoneNumbers) ? dev.demoPhoneNumbers.join(", ") : (dev.demoPhoneNumbers || "9999999999"),
              demoOtp: dev.demoOtp || "123456",
              bypassLocationRestriction: dev.bypassLocationRestriction !== false,
              allowTestPayment: dev.allowTestPayment !== false,
              hideLiveRestaurantsInReview: dev.hideLiveRestaurantsInReview !== false,
            });
          }

          // Process Restaurants
          const restList = restaurantsRes?.data?.data?.restaurants || 
                           restaurantsRes?.data?.restaurants || 
                           restaurantsRes?.data?.data || [];
          if (Array.isArray(restList)) {
            setApprovedRestaurants(restList);
          }

          // Process Supermart Sellers & Stores
          const sellerItems = sellersRes?.data?.result?.items ||
                              sellersRes?.data?.data?.items ||
                              sellersRes?.data?.result ||
                              sellersRes?.data?.data || [];

          const publicStoreList = storesRes?.data?.results || storesRes?.data?.data || storesRes?.data || [];

          const combinedStoresMap = new Map();

          if (Array.isArray(sellerItems)) {
            sellerItems.forEach((s) => {
              const id = String(s._id || s.id);
              if (id) {
                combinedStoresMap.set(id, {
                  _id: id,
                  shopName: s.shopName || s.name || s.ownerName || "Supermart Seller",
                  ownerName: s.ownerName || s.name || "Seller Owner",
                  location: s.location || s.address || "Main Branch",
                  category: s.category || "Quick Commerce",
                  logo: s.logo || s.profileImage?.url || s.profileImage,
                });
              }
            });
          }

          if (Array.isArray(publicStoreList)) {
            publicStoreList.forEach((st) => {
              const id = String(st._id || st.id);
              if (id && !combinedStoresMap.has(id)) {
                combinedStoresMap.set(id, {
                  _id: id,
                  shopName: st.name || st.shopName || "Supermart Store",
                  ownerName: st.description || "Quick Commerce Outlet",
                  location: st.address || st.city || "Available Outlet",
                  category: st.category || "Store",
                  logo: st.image || st.logo,
                });
              }
            });
          }

          setSupermartStores(Array.from(combinedStoresMap.values()));
        }
      } catch (err) {
        console.error("Error loading developer settings:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();
    return () => { isMounted = false; };
  }, []);

  const handleToggle = (field) => {
    setDeveloperMode((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  const handleTextChange = (field, value) => {
    setDeveloperMode((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleRestaurantSelect = (restaurantId) => {
    setDeveloperMode((prev) => {
      const exists = prev.demoRestaurantIds.includes(restaurantId);
      const newIds = exists
        ? prev.demoRestaurantIds.filter((id) => id !== restaurantId)
        : [...prev.demoRestaurantIds, restaurantId];
      return { ...prev, demoRestaurantIds: newIds };
    });
  };

  const handleStoreSelect = (storeId) => {
    setDeveloperMode((prev) => {
      const exists = prev.demoStoreIds.includes(storeId);
      const newIds = exists
        ? prev.demoStoreIds.filter((id) => id !== storeId)
        : [...prev.demoStoreIds, storeId];
      return { ...prev, demoStoreIds: newIds };
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);

      // Clean phone numbers input into array of digits
      const phoneArray = developerMode.demoPhoneNumbers
        .split(",")
        .map((p) => p.replace(/\D/g, ""))
        .filter(Boolean);

      const payload = {
        developerMode: {
          enabled: developerMode.enabled,
          demoRestaurantIds: developerMode.demoRestaurantIds,
          demoStoreIds: developerMode.demoStoreIds,
          demoPhoneNumbers: phoneArray.length > 0 ? phoneArray : ["9999999999"],
          demoOtp: developerMode.demoOtp.trim() || "123456",
          bypassLocationRestriction: developerMode.bypassLocationRestriction,
          allowTestPayment: developerMode.allowTestPayment,
          hideLiveRestaurantsInReview: developerMode.hideLiveRestaurantsInReview,
        },
      };

      await adminAPI.updateBusinessSettings(payload);
      clearGlobalHomeCache();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("businessSettingsUpdated", { detail: payload }));
      }
      toast.success("Developer & App Reviewer settings updated successfully!");
    } catch (err) {
      console.error("Error saving developer settings:", err);
      toast.error(err?.response?.data?.message || "Failed to update developer settings");
    } finally {
      setSaving(false);
    }
  };

  const copyReviewerNotes = () => {
    const notes = `App Store / Play Store Reviewer Demo Login:
Phone: ${developerMode.demoPhoneNumbers.split(',')[0] || '9999999999'}
OTP: ${developerMode.demoOtp || '123456'}

Note: Developer Review Mode is ACTIVE. Reviewer can browse items, add to cart, and test checkout via Cash on Delivery (COD) without location restrictions.`;
    navigator.clipboard.writeText(notes);
    toast.success("Reviewer notes copied to clipboard!");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
        <span className="ml-3 text-neutral-600 font-medium">Loading Developer Settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 p-6 rounded-2xl text-white shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Code2 className="w-7 h-7 text-emerald-400" />
            <h2 className="text-2xl font-bold tracking-tight">
              {isMartPath ? "SuperfastMart Developer & App Reviewer Settings" : "Developer & App Reviewer Settings"}
            </h2>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
              iOS & PlayStore Ready
            </span>
          </div>
          <p className="text-emerald-100 text-sm max-w-2xl">
            Configure App Store / Play Store reviewer mode. Enable demo phone numbers, fixed OTP bypass, Supermart seller accounts, demo restaurants, and global location bypass for Apple & Google reviewers.
          </p>
        </div>

        {/* Master Switch Status Pill */}
        <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md px-4 py-3 rounded-xl border border-white/10">
          <div className="text-right">
            <p className="text-xs font-semibold text-emerald-200">Current Status</p>
            <p className="text-sm font-bold">
              {developerMode.enabled ? (
                <span className="text-amber-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                  REVIEW MODE ACTIVE
                </span>
              ) : (
                <span className="text-emerald-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  LIVE PRODUCTION MODE
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Main Mode Toggle Switch Card */}
      <Card className={`transition-all duration-300 ${developerMode.enabled ? "border-amber-400/50 bg-amber-50/20 shadow-md" : "border-neutral-200"}`}>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl ${developerMode.enabled ? "bg-amber-500 text-white" : "bg-neutral-100 text-neutral-600"}`}>
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-neutral-900">
                  App Store Reviewer Mode Toggle
                </CardTitle>
                <CardDescription>
                  When enabled, public APIs serve designated Demo Sellers / Stores & bypass live location checks for reviewer logins.
                </CardDescription>
              </div>
            </div>

            {/* Toggle Switch */}
            <button
              type="button"
              onClick={() => handleToggle("enabled")}
              className={`relative inline-flex h-8 w-16 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                developerMode.enabled ? "bg-amber-500" : "bg-neutral-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  developerMode.enabled ? "translate-x-8" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </CardHeader>

        {developerMode.enabled && (
          <CardContent className="pt-0">
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Reviewer Mode is currently ENABLED!</p>
                <p className="text-xs text-amber-800 mt-0.5">
                  Mobile app customers will see designated demo sellers/stores & test credentials. Remember to turn this toggle OFF after your app store approval process finishes.
                </p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Demo Credentials & Reviewer Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Demo Credentials Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-neutral-800">
              <KeyRound className="w-5 h-5 text-emerald-600" />
              <CardTitle className="text-base font-bold">Reviewer Login Credentials</CardTitle>
            </div>
            <CardDescription>
              Set demo phone numbers & fixed OTP for Apple & Google reviewers to bypass real SMS gateways.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="demoPhoneNumbers" className="flex items-center gap-2 font-semibold text-neutral-700">
                <Smartphone className="w-4 h-4 text-neutral-500" />
                Demo Reviewer Phone Number(s)
              </Label>
              <Input
                id="demoPhoneNumbers"
                type="text"
                value={developerMode.demoPhoneNumbers}
                onChange={(e) => handleTextChange("demoPhoneNumbers", e.target.value)}
                placeholder="e.g. 9999999999, 8888888888"
                className="h-11"
              />
              <p className="text-xs text-neutral-500">Separate multiple test numbers with commas.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="demoOtp" className="flex items-center gap-2 font-semibold text-neutral-700">
                <ShieldCheck className="w-4 h-4 text-neutral-500" />
                Fixed Demo OTP Code
              </Label>
              <Input
                id="demoOtp"
                type="text"
                value={developerMode.demoOtp}
                onChange={(e) => handleTextChange("demoOtp", e.target.value)}
                placeholder="123456"
                maxLength={6}
                className="h-11 font-mono tracking-widest font-semibold text-lg"
              />
              <p className="text-xs text-neutral-500">Reviewers logging in with demo numbers will use this fixed OTP without SMS.</p>
            </div>
          </CardContent>
        </Card>

        {/* Feature Switches Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-neutral-800">
              <Eye className="w-5 h-5 text-emerald-600" />
              <CardTitle className="text-base font-bold">Reviewer Isolation Rules</CardTitle>
            </div>
            <CardDescription>
              Configure how customer app listings behave during app review.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Location Bypass */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-neutral-200 bg-neutral-50">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 font-medium text-sm text-neutral-900">
                  <MapPin className="w-4 h-4 text-indigo-600" />
                  Bypass Geo-location & Radius
                </div>
                <p className="text-xs text-neutral-500">
                  Allows Apple reviewers anywhere in the world to browse & order without "Out of Coverage" error.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggle("bypassLocationRestriction")}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                  developerMode.bypassLocationRestriction ? "bg-emerald-600" : "bg-neutral-300"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    developerMode.bypassLocationRestriction ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Test Payment */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-neutral-200 bg-neutral-50">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 font-medium text-sm text-neutral-900">
                  <CreditCard className="w-4 h-4 text-emerald-600" />
                  Enable Test Payment / COD for Reviewers
                </div>
                <p className="text-xs text-neutral-500">
                  Allows app reviewers to place test orders using Cash on Delivery (COD) without real card charges.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggle("allowTestPayment")}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                  developerMode.allowTestPayment ? "bg-emerald-600" : "bg-neutral-300"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    developerMode.allowTestPayment ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Hide Live Outlets */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-neutral-200 bg-neutral-50">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 font-medium text-sm text-neutral-900">
                  <Building2 className="w-4 h-4 text-amber-600" />
                  Show ONLY Demo Outlets (Sellers & Restaurants) in Review Mode
                </div>
                <p className="text-xs text-neutral-500">
                  Hides real live seller operations & exposes only designated demo store(s) / restaurant(s).
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggle("hideLiveRestaurantsInReview")}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                  developerMode.hideLiveRestaurantsInReview ? "bg-emerald-600" : "bg-neutral-300"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    developerMode.hideLiveRestaurantsInReview ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Module Selection Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-neutral-200 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab("mart")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${
            activeTab === "mart"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
              : "bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200"
          }`}
        >
          <Store className="w-4 h-4" />
          SuperfastMart Sellers ({supermartStores.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("food")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${
            activeTab === "food"
              ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
              : "bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200"
          }`}
        >
          <UtensilsCrossed className="w-4 h-4" />
          Food Restaurants ({approvedRestaurants.length})
        </button>
      </div>

      {/* Demo Supermart Seller Selection */}
      {activeTab === "mart" && (
        <Card className="border-emerald-200">
          <CardHeader>
            <div className="flex items-center gap-2 text-neutral-800">
              <Store className="w-5 h-5 text-emerald-600" />
              <CardTitle className="text-base font-bold">Select Demo SuperfastMart Seller / Store(s) for App Reviewers</CardTitle>
            </div>
            <CardDescription>
              Choose which approved Supermart seller account(s) should be visible to reviewers when Developer Mode is ON.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {supermartStores.length === 0 ? (
              <p className="text-sm text-neutral-500 italic p-4 text-center bg-neutral-50 rounded-lg">
                No Supermart sellers found. Please approve a seller request first.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {supermartStores.map((store) => {
                  const isSelected = developerMode.demoStoreIds.includes(String(store._id || store.id));
                  return (
                    <div
                      key={store._id || store.id}
                      onClick={() => handleStoreSelect(String(store._id || store.id))}
                      className={`cursor-pointer p-3.5 rounded-xl border transition-all duration-200 flex items-center justify-between ${
                        isSelected
                          ? "border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500/30 shadow-sm"
                          : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50"
                      }`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-10 h-10 rounded-lg bg-emerald-50 overflow-hidden shrink-0 border border-emerald-200 flex items-center justify-center text-emerald-700">
                          {store.logo ? (
                            <img
                              src={store.logo}
                              alt={store.shopName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Building2 className="w-5 h-5 text-emerald-600" />
                          )}
                        </div>
                        <div className="truncate">
                          <p className="font-bold text-sm text-neutral-900 truncate">
                            {store.shopName || "Supermart Store"}
                          </p>
                          <p className="text-xs text-neutral-500 truncate">
                            Owner: {store.ownerName || "Seller Account"} • {store.location || "Active Outlet"}
                          </p>
                        </div>
                      </div>

                      <div className="ml-2 shrink-0">
                        {isSelected ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 fill-emerald-100" />
                        ) : (
                          <div className="w-5 h-5 rounded-full border border-neutral-300" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Demo Restaurant Selection */}
      {activeTab === "food" && (
        <Card className="border-purple-200">
          <CardHeader>
            <div className="flex items-center gap-2 text-neutral-800">
              <UtensilsCrossed className="w-5 h-5 text-purple-600" />
              <CardTitle className="text-base font-bold">Select Demo Restaurant(s) for App Reviewers</CardTitle>
            </div>
            <CardDescription>
              Choose which approved restaurant(s) should be visible to reviewers when Developer Mode is ON.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {approvedRestaurants.length === 0 ? (
              <p className="text-sm text-neutral-500 italic p-4 text-center bg-neutral-50 rounded-lg">
                No approved restaurants found. Please approve or register a restaurant first.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {approvedRestaurants.map((rest) => {
                  const isSelected = developerMode.demoRestaurantIds.includes(String(rest._id));
                  return (
                    <div
                      key={rest._id}
                      onClick={() => handleRestaurantSelect(String(rest._id))}
                      className={`cursor-pointer p-3.5 rounded-xl border transition-all duration-200 flex items-center justify-between ${
                        isSelected
                          ? "border-purple-600 bg-purple-50/60 ring-2 ring-purple-500/20 shadow-sm"
                          : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50"
                      }`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-10 h-10 rounded-lg bg-neutral-100 overflow-hidden shrink-0 border border-neutral-200">
                          {rest.profileImage?.url || rest.profileImage ? (
                            <img
                              src={rest.profileImage?.url || rest.profileImage}
                              alt={rest.restaurantName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <UtensilsCrossed className="w-5 h-5 text-neutral-400 m-2.5" />
                          )}
                        </div>
                        <div className="truncate">
                          <p className="font-semibold text-sm text-neutral-900 truncate">
                            {rest.restaurantName || "Unnamed Store"}
                          </p>
                          <p className="text-xs text-neutral-500 truncate">
                            {rest.location?.city || rest.city || rest.location?.area || "Demo Outlet"}
                          </p>
                        </div>
                      </div>

                      <div className="ml-2 shrink-0">
                        {isSelected ? (
                          <CheckCircle2 className="w-5 h-5 text-purple-600 fill-purple-100" />
                        ) : (
                          <div className="w-5 h-5 rounded-full border border-neutral-300" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* App Store Connect & Play Console Reviewer Notes Copy Box */}
      <Card className="bg-slate-900 text-white border-slate-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <CardTitle className="text-base font-bold text-white">App Store Connect / Play Console Review Notes</CardTitle>
            </div>
            <Button
              type="button"
              onClick={copyReviewerNotes}
              size="sm"
              className="bg-white/10 hover:bg-white/20 text-white border border-white/20 gap-1.5"
            >
              <Copy className="w-4 h-4" />
              Copy Notes
            </Button>
          </div>
          <CardDescription className="text-slate-300">
            Paste these details into the "App Review Information" notes field when submitting your iOS build to Apple.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="p-4 rounded-xl bg-slate-950 text-emerald-400 text-xs font-mono overflow-x-auto whitespace-pre-wrap border border-slate-800">
{`App Store / Play Store Reviewer Demo Credentials:
---------------------------------------------
Phone Number: ${developerMode.demoPhoneNumbers.split(',')[0] || '9999999999'}
OTP Code:     ${developerMode.demoOtp || '123456'}

Reviewer Instructions for Apple / Google Testing:
1. Log in using the test phone number and OTP code specified above.
2. Developer Reviewer Mode is active. Reviewers can browse Supermart sellers & food restaurants, add items to cart, and complete test orders using Cash on Delivery (COD).
3. Geo-location restriction bypass is active so testing is fully functional from any global coordinate.`}
          </pre>
        </CardContent>
      </Card>

      {/* Save Settings Bar */}
      <div className="flex justify-end pt-4 border-t border-neutral-200">
        <Button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-emerald-600 hover:bg-emerald-700 text-white h-11 px-8 shadow-lg shadow-emerald-600/20 font-semibold text-base"
        >
          {saving ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Saving Settings...
            </>
          ) : (
            <>
              <Save className="w-5 h-5 mr-2" />
              Save Developer Settings
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
