import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@core/context/AuthContext";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Building2,
  Calendar,
  Check,
  CreditCard,
  FileBadge2,
  Loader2,
  MapPin,
  ShieldCheck,
  Store,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { sellerApi } from "../services/sellerApi";
import MapPicker from "@shared/components/MapPicker";

const businessTypes = [
  "Grocery",
  "Bakery",
  "Pharmacy",
  "Electronics",
  "Fashion",
  "General Store",
];

const initialState = {
  name: "",
  shopName: "",
  email: "",
  phone: "",
  zoneId: "",
  zoneSource: "",
  address: "",
  lat: "",
  lng: "",
  radius: 5,
  businessType: "",
  alternatePhone: "",
  supportEmail: "",
  openingHours: "",
  bankName: "",
  accountHolderName: "",
  accountNumber: "",
  ifscCode: "",
  accountType: "",
  upiId: "",
  panNumber: "",
  gstRegistered: false,
  gstNumber: "",
  gstLegalName: "",
  fssaiNumber: "",
  fssaiExpiry: "",
  shopLicenseNumber: "",
  shopLicenseExpiry: "",
};

const parseOpeningHours = (value) => {
  const raw = String(value || "").trim();
  if (!raw) {
    return { openingTime: "", closingTime: "" };
  }

  const match = raw.match(/(\d{1,2}:\d{2})(?::\d{2})?\s*(?:-|to)\s*(\d{1,2}:\d{2})(?::\d{2})?/i);
  if (match) {
    return {
      openingTime: match[1].padStart(5, "0"),
      closingTime: match[2].padStart(5, "0"),
    };
  }

  return { openingTime: "", closingTime: "" };
};

const buildOpeningHoursLabel = (openingTime, closingTime) => {
  if (!openingTime || !closingTime) return "";
  return `${openingTime} - ${closingTime}`;
};
const timeOptions = Array.from({ length: 48 }, (_, index) => {
  const hours = String(Math.floor(index / 2)).padStart(2, "0");
  const minutes = index % 2 === 0 ? "00" : "30";
  return `${hours}:${minutes}`;
});

const normalizeTimeValue = (value) => {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
};

const getSellerPhone = (seller = {}) => seller.phone || "";

const isPointInPolygon = (lat, lng, polygon) => {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = Number(polygon[i].longitude || polygon[i].lng);
    const yi = Number(polygon[i].latitude || polygon[i].lat);
    const xj = Number(polygon[j].longitude || polygon[j].lng);
    const yj = Number(polygon[j].latitude || polygon[j].lat);
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

const findMatchingZone = (lat, lng, zonesList) => {
  if (!lat || !lng || !Array.isArray(zonesList)) return null;
  const numLat = Number(lat);
  const numLng = Number(lng);
  for (const zone of zonesList) {
    if (Array.isArray(zone.coordinates) && zone.coordinates.length >= 3) {
      if (isPointInPolygon(numLat, numLng, zone.coordinates)) {
        return zone;
      }
    }
  }
  return null;
};

const formatToDDMMYY = (value) => {
  const clean = value.replace(/\D/g, "");
  if (clean.length <= 2) return clean;
  if (clean.length <= 4) return `${clean.slice(0, 2)}/${clean.slice(2)}`;
  return `${clean.slice(0, 2)}/${clean.slice(2, 4)}/${clean.slice(4, 8)}`;
};

const convertDDMMYYToYYYYMMDD = (dateStr) => {
  if (!dateStr) return "";
  const parts = dateStr.split("/");
  if (parts.length !== 3) return "";
  const day = parts[0].padStart(2, "0");
  const month = parts[1].padStart(2, "0");
  let year = parts[2];
  if (year.length === 2) {
    year = "20" + year;
  }
  return `${year}-${month}-${day}`;
};

const convertYYYYMMDDToDDMMYY = (ymd) => {
  if (!ymd) return "";
  const datePart = ymd.split("T")[0];
  const parts = datePart.split("-");
  if (parts.length !== 3) return ymd;
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  return `${day}/${month}/${year.slice(-2)}`;
};

const isPastDate = (dateStr) => {
  const ymd = convertDDMMYYToYYYYMMDD(dateStr);
  if (!ymd || ymd.length !== 10) return false;
  return ymd < new Date().toISOString().split("T")[0];
};

export default function SellerOnboarding() {
  const navigate = useNavigate();
  const { user, refreshUser, logout } = useAuth();
  const [form, setForm] = useState(initialState);
  const [qrFile, setQrFile] = useState(null);
  const [licenseFile, setLicenseFile] = useState(null);
  const [panFile, setPanFile] = useState(null);
  const [gstFile, setGstFile] = useState(null);
  const [fssaiFile, setFssaiFile] = useState(null);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [zones, setZones] = useState([]);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [isSavingHours, setIsSavingHours] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hoursDraft, setHoursDraft] = useState({ openingTime: "", closingTime: "" });

  useEffect(() => {
    if (user) {
      const fssaiExpiryVal = user.fssaiExpiry || user.documents?.fssaiExpiry || user.shopInfo?.fssaiExpiry || "";
      const shopLicenseExpiryVal = user.shopLicenseExpiry || user.documents?.shopLicenseExpiry || user.shopInfo?.shopLicenseExpiry || "";
      const displayName = user.name && /^Seller \d+$/i.test(user.name) ? "" : (user.name || "");
      const displayShopName = user.shopName && /^Store \d+$/i.test(user.shopName) ? "" : (user.shopName || "");
      const displayEmail = user.email && /@seller\.local$/i.test(user.email) ? "" : (user.email || "");
      setForm((prev) => ({
        ...initialState,
        ...user,
        name: displayName,
        shopName: displayShopName,
        email: displayEmail,
        phone: getSellerPhone(user) || prev.phone,
        fssaiExpiry: fssaiExpiryVal ? convertYYYYMMDDToDDMMYY(fssaiExpiryVal) : "",
        shopLicenseExpiry: shopLicenseExpiryVal ? convertYYYYMMDDToDDMMYY(shopLicenseExpiryVal) : "",
      }));
      setHoursDraft({ openingTime: "", closingTime: "" });
    }
  }, [user]);

  useEffect(() => {
    const loadProfile = async () => {
      const sellerToken = localStorage.getItem("auth_seller");
      if (!sellerToken) {
        setIsLoading(false);
        navigate("/seller/auth", { replace: true });
        return;
      }

      try {
        const response = await sellerApi.getProfile();
        const data = response?.data?.result || {};
        const fssaiExpiryVal = data.fssaiExpiry || data.documents?.fssaiExpiry || data.shopInfo?.fssaiExpiry || "";
        const shopLicenseExpiryVal = data.shopLicenseExpiry || data.documents?.shopLicenseExpiry || data.shopInfo?.shopLicenseExpiry || "";
        const displayName = data.name && /^Seller \d+$/i.test(data.name) ? "" : (data.name || "");
        const displayShopName = data.shopName && /^Store \d+$/i.test(data.shopName) ? "" : (data.shopName || "");
        const displayEmail = data.email && /@seller\.local$/i.test(data.email) ? "" : (data.email || "");
        setForm((prev) => ({
          ...initialState,
          ...data,
          name: displayName,
          shopName: displayShopName,
          email: displayEmail,
          phone: getSellerPhone(data) || prev.phone,
          fssaiExpiry: fssaiExpiryVal ? convertYYYYMMDDToDDMMYY(fssaiExpiryVal) : "",
          shopLicenseExpiry: shopLicenseExpiryVal ? convertYYYYMMDDToDDMMYY(shopLicenseExpiryVal) : "",
        }));
        setHoursDraft(parseOpeningHours(data?.shopInfo?.openingHours || data?.openingHours || ""));
      } catch (error) {
        if (error?.response?.status !== 401) {
          toast.error("Failed to load seller onboarding data");
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, []);

  useEffect(() => {
    const loadZones = async () => {
      try {
        setZonesLoading(true);
        const quickResponse = await sellerApi.getQuickZonesPublic();
        const quickZones = Array.isArray(quickResponse?.data?.result?.zones)
          ? quickResponse.data.result.zones
          : Array.isArray(quickResponse?.data?.data?.zones)
            ? quickResponse.data.data.zones
            : [];

        setZones(
          quickZones.map((zone) => ({
            ...zone,
            source: "quick",
            label: zone?.name || zone?.zoneName || zone?.serviceLocation || "Quick Zone",
          })),
        );
      } catch (error) {
        toast.error("Failed to load service zones");
        setZones([]);
      } finally {
        setZonesLoading(false);
      }
    };

    loadZones();
  }, []);

  useEffect(() => {
    if (!form.lat || !form.lng || zonesLoading || zones.length === 0) return;
    const matching = findMatchingZone(form.lat, form.lng, zones);
    if (matching) {
      const matchId = String(matching._id || matching.id || "");
      const matchSource = String(matching.source || "");
      if (form.zoneId !== matchId || form.zoneSource !== matchSource) {
        setForm((prev) => ({
          ...prev,
          zoneId: matchId,
          zoneSource: matchSource,
        }));
      }
    } else {
      if (form.zoneId || form.zoneSource) {
        setForm((prev) => ({
          ...prev,
          zoneId: "",
          zoneSource: "",
        }));
      }
    }
  }, [form.lat, form.lng, zones, zonesLoading]);


  const isLocationOutsideZones = useMemo(() => {
    if (!form.lat || !form.lng || zonesLoading || zones.length === 0) return false;
    const matching = findMatchingZone(form.lat, form.lng, zones);
    return !matching;
  }, [form.lat, form.lng, zones, zonesLoading]);

  const completionText = useMemo(() => {
    const fields = [
      form.name,
      form.shopName,
      form.email,
      form.address,
      form.businessType,
      form.accountNumber,
      form.ifscCode,
      form.upiId,
      form.shopLicenseNumber,
    ];
    const done = fields.filter(Boolean).length;
    return `${done}/9 core fields filled`;
  }, [form]);

  const initialLocation = useMemo(
    () => (form.lat && form.lng ? { lat: Number(form.lat), lng: Number(form.lng) } : null),
    [form.lat, form.lng],
  );

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const { openingTime, closingTime } = useMemo(
    () => parseOpeningHours(form.openingHours),
    [form.openingHours],
  );


  const selectedZone = useMemo(
    () =>
      zones.find(
        (zone) =>
          String(zone?._id || zone?.id || "") === String(form.zoneId || "") &&
          String(zone?.source || "") === String(form.zoneSource || ""),
      ) || null,
    [form.zoneId, form.zoneSource, zones],
  );

  const handleOpeningHoursChange = (key, value) => {
    const normalizedValue = normalizeTimeValue(value);
    setHoursDraft((prev) => ({
      ...prev,
      [key]: normalizedValue,
    }));
  };

  const handleSaveOpeningHours = async () => {
    if (!hoursDraft.openingTime || !hoursDraft.closingTime) {
      toast.error("Select both opening and closing time first");
      return;
    }

    const openTimeStr = normalizeTimeValue(hoursDraft.openingTime);
    const closeTimeStr = normalizeTimeValue(hoursDraft.closingTime);
    if (openTimeStr && closeTimeStr) {
      const [openH, openM] = openTimeStr.split(":").map(Number);
      const [closeH, closeM] = closeTimeStr.split(":").map(Number);
      const openMins = (openH || 0) * 60 + (openM || 0);
      const closeMins = (closeH || 0) * 60 + (closeM || 0);
      if (openMins === closeMins) {
        toast.error("Opening time and closing time cannot be same");
        return;
      }
    }

    const openingHoursLabel = buildOpeningHoursLabel(
      hoursDraft.openingTime,
      hoursDraft.closingTime,
    );

    setIsSavingHours(true);
    try {
      updateField("openingHours", openingHoursLabel);
      await sellerApi.updateProfile({
        openingHours: openingHoursLabel,
      });
      toast.success("Opening hours saved");
    } catch (error) {
      toast.error(
        error?.response?.data?.message || "Failed to save opening hours",
      );
    } finally {
      setIsSavingHours(false);
    }
  };

  const openingHoursPreview =
    buildOpeningHoursLabel(hoursDraft.openingTime, hoursDraft.closingTime) ||
    form.openingHours ||
    "Not set";

  const handleLocationSelect = (location) => {
    setForm((prev) => ({
      ...prev,
      lat: Number.isFinite(location?.lat) ? Number(location.lat.toFixed(6)) : prev.lat,
      lng: Number.isFinite(location?.lng) ? Number(location.lng.toFixed(6)) : prev.lng,
      radius: location?.radius !== undefined ? location.radius : prev.radius,
      address: location?.address || prev.address,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.name || !form.shopName || !form.email || !form.address) {
      toast.error("Fill seller name, shop name, email, and address first");
      return;
    }

    if (!form.zoneId || !form.zoneId.trim()) {
      toast.error("Please select a service zone before submitting");
      return;
    }

    if (form.email && !/^(?!.*\.comm+$)[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/i.test(form.email)) {
      toast.error("Enter a valid email address (e.g. name@gmail.com)");
      return;
    }

    if (form.supportEmail && !/^(?!.*\.comm+$)[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/i.test(form.supportEmail)) {
      toast.error("Enter a valid support email address (e.g. support@example.com)");
      return;
    }

    if (form.panNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(form.panNumber)) {
      toast.error("Invalid PAN format. Must be 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F)");
      return;
    }

    if (form.gstRegistered) {
      if (!form.gstNumber || !form.gstLegalName) {
        toast.error("GST number and GST legal name are required when GST registered is checked");
        return;
      }
      if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(form.gstNumber)) {
        toast.error("Invalid GST format. Must be 15 characters (e.g. 22ABCDE1234F1Z5)");
        return;
      }
    }

    if (form.fssaiExpiry) {
      const fssaiExpiryYMD = convertDDMMYYToYYYYMMDD(form.fssaiExpiry);
      const today = new Date().toISOString().split("T")[0];
      if (!fssaiExpiryYMD || fssaiExpiryYMD.length !== 10) {
        toast.error("FSSAI expiry date must be in DD/MM/YY or DD/MM/YYYY format");
        return;
      }
      if (fssaiExpiryYMD < today) {
        toast.error("FSSAI expiry date cannot be a past date");
        return;
      }
    }

    if (form.shopLicenseNumber && !/^[A-Za-z0-9\/\-]{5,20}$/.test(form.shopLicenseNumber)) {
      toast.error("Shop license number must be 5–20 characters (letters, numbers, / and - only)");
      return;
    }

    if (form.shopLicenseExpiry) {
      const shopLicenseExpiryYMD = convertDDMMYYToYYYYMMDD(form.shopLicenseExpiry);
      const today = new Date().toISOString().split("T")[0];
      if (!shopLicenseExpiryYMD || shopLicenseExpiryYMD.length !== 10) {
        toast.error("Shop license expiry date must be in DD/MM/YY or DD/MM/YYYY format");
        return;
      }
      if (shopLicenseExpiryYMD < today) {
        toast.error("Shop license expiry date cannot be a past date");
        return;
      }
    }

    if (form.accountNumber && !/^\d{9,18}$/.test(form.accountNumber)) {
      toast.error("Account number must be 9–18 digits (numbers only)");
      return;
    }

    if (form.ifscCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.ifscCode)) {
      toast.error("Invalid IFSC code. Format: 4 letters + 0 + 6 alphanumeric (e.g. ABCD0EF1234)");
      return;
    }

    if (form.upiId && !/^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/.test(form.upiId)) {
      toast.error("Invalid UPI ID. Format: username@bankhandle (e.g. name@okhdfcbank)");
      return;
    }

    if (!form.zoneId) {
      toast.error("Please select a service zone before submitting");
      return;
    }

    const accountHolderWords = String(form.accountHolderName || "").trim().split(/\s+/).filter(Boolean);
    if (accountHolderWords.length < 2) {
      toast.error("Account holder name must include both first and last name");
      return;
    }

    if (form.alternatePhone && form.alternatePhone === form.phone) {
      toast.error("Alternate phone number cannot be the same as primary phone number");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = new FormData();
      const nextForm = {
        ...form,
        zoneName: selectedZone?.label || "",
        fssaiExpiry: convertDDMMYYToYYYYMMDD(form.fssaiExpiry),
        shopLicenseExpiry: convertDDMMYYToYYYYMMDD(form.shopLicenseExpiry),
      };
      Object.entries(nextForm).forEach(([key, value]) => {
        payload.append(
          key,
          typeof value === "boolean" ? String(value) : String(value ?? ""),
        );
      });
      payload.append("submitForApproval", "true");
      if (qrFile) payload.append("upiQrImage", qrFile);
      if (licenseFile) payload.append("shopLicenseImage", licenseFile);
      if (panFile) payload.append("panImage", panFile);
      if (gstFile) payload.append("gstCert", gstFile);
      if (fssaiFile) payload.append("fssaiCert", fssaiFile);

      await sellerApi.updateProfile(payload);
      await refreshUser();
      toast.success("Application submitted for admin approval");
      navigate("/seller/pending", { replace: true });
    } catch (error) {
      toast.error(
        error?.response?.data?.message || "Failed to submit onboarding",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f6f2]">
        <Loader2 className="h-8 w-8 animate-spin text-slate-700" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full max-w-full overflow-x-hidden bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_transparent_28%),linear-gradient(180deg,#f8fafc_0%,#fffaf2_100%)] px-4 py-6 font-['Outfit'] sm:py-8 md:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={async () => {
              try {
                if (logout) await logout();
              } catch (e) {}
              navigate("/seller/auth", { replace: true });
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 border border-slate-200"
          >
            ← Back to Login
          </button>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.05fr_1.4fr]">
          <div
            className="rounded-[28px] sm:rounded-[34px] bg-[linear-gradient(160deg,#0f172a_0%,#0f766e_55%,#f59e0b_130%)] p-6 sm:p-8 text-white shadow-[0_35px_90px_rgba(15,23,42,0.22)] animate-in fade-in slide-in-from-bottom-4 duration-500"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.3em]">
              <ShieldCheck className="h-4 w-4" />
              Seller Onboarding
            </div>
            <h1 className="mt-8 text-3xl sm:text-4xl font-black leading-tight">
              Set up your store once and send it straight for approval.
            </h1>
            <p className="mt-4 max-w-lg text-sm font-medium leading-7 text-white/78">
              We&apos;ll save your banking, compliance, and shop details together,
              then raise a real joining request in quick-commerce admin.
            </p>

            <div className="mt-10 space-y-4">
              {[
                {
                  icon: Store,
                  title: "Store Identity",
                  text: "Owner, shop, location, and operational details.",
                },
                {
                  icon: CreditCard,
                  title: "Bank & UPI",
                  text: "Settlement-ready bank account and QR image.",
                },
                {
                  icon: FileBadge2,
                  title: "Compliance",
                  text: "PAN, GST, FSSAI, and shop license details.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-3xl border border-white/12 bg-white/10 p-4 sm:p-5 backdrop-blur-sm"
                >
                  <div className="flex items-start gap-4">
                    <div className="rounded-2xl bg-white/12 p-3">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-black">{item.title}</p>
                      <p className="mt-1 text-xs font-medium leading-6 text-white/72">
                        {item.text}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-3xl border border-white/12 bg-white/10 p-4 sm:p-5">
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-white/60">
                Progress Signal
              </p>
              <p className="mt-2 text-2xl font-black">{completionText}</p>
              <p className="mt-2 text-xs font-semibold text-white/70">
                Add the missing core details and submit. Admin will see the
                request inside quick-commerce.
              </p>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-6 rounded-[28px] sm:rounded-[34px] border border-white/70 bg-white/90 p-4 sm:p-6 shadow-[0_35px_90px_rgba(15,23,42,0.08)] backdrop-blur xl:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500"
          >
            <section className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900">
                    Store identity
                  </h2>
                  <p className="text-sm font-medium text-slate-500">
                    How your seller account will appear to admin and customers.
                  </p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500">Seller name <span className="text-red-500">*</span></label>
                  <input required className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-slate-900" placeholder="Seller name" value={form.name} onChange={(e) => updateField("name", e.target.value.replace(/[^a-zA-Z\s]/g, ""))} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500">Shop name <span className="text-red-500">*</span></label>
                  <input required className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-slate-900" placeholder="Shop name" value={form.shopName} onChange={(e) => updateField("shopName", e.target.value.replace(/[^a-zA-Z\s]/g, ""))} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500">Email <span className="text-red-500">*</span></label>
                  <input
                    required
                    className={`w-full rounded-2xl border px-4 py-3 font-semibold outline-none focus:border-slate-900 ${form.email && !/^(?!.*\.comm+$)[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/i.test(form.email) ? "border-red-400 bg-red-50" : "border-slate-200"}`}
                    placeholder="Email (e.g. name@domain.com)"
                    type="email"
                    value={form.email}
                    onChange={(e) => updateField("email", e.target.value)}
                  />
                  {form.email && !/^(?!.*\.comm+$)[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/i.test(form.email) && (
                    <p className="text-xs font-semibold text-red-500 px-1">Enter a valid email address (e.g. name@domain.com)</p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500">Primary phone <span className="text-red-500">*</span></label>
                  <input className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 font-semibold text-slate-500 outline-none" placeholder="Primary phone" value={form.phone} readOnly title="Linked from the seller OTP login" />
                </div>
                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="text-xs font-bold text-slate-500">Business type (Select multiple) <span className="text-red-500">*</span></label>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {businessTypes.map((item) => {
                      const selectedList = Array.isArray(form.businessType)
                        ? form.businessType
                        : String(form.businessType || "").split(",").map((s) => s.trim()).filter(Boolean);
                      const isSelected = selectedList.includes(item);
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => {
                            const next = isSelected
                              ? selectedList.filter((b) => b !== item)
                              : [...selectedList, item];
                            updateField("businessType", next);
                          }}
                          className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                            isSelected
                              ? "bg-slate-900 border-slate-900 text-white shadow-sm"
                              : "bg-white border-slate-200 text-slate-700 hover:border-slate-400"
                          }`}
                        >
                          {isSelected ? "✓ " : "+ "}{item}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500">Alternate phone <span className="text-red-500">*</span></label>
                  <input
                    required
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={10}
                    autoComplete="tel"
                    className={`w-full rounded-2xl border px-4 py-3 font-semibold outline-none focus:border-slate-900 ${form.alternatePhone && form.alternatePhone === form.phone ? "border-red-400 bg-red-50" : "border-slate-200"}`}
                    placeholder="Alternate phone"
                    value={form.alternatePhone}
                    onChange={(e) => updateField("alternatePhone", e.target.value.replace(/\D/g, "").slice(0, 10))}
                  />
                  {form.alternatePhone && form.alternatePhone === form.phone && (
                    <p className="text-xs font-semibold text-red-500 px-1">Alternate number cannot be same as primary number</p>
                  )}
                </div>

                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="text-xs font-bold text-slate-500">Support email <span className="text-red-500">*</span></label>
                  <input
                    required
                    className={`w-full rounded-2xl border px-4 py-3 font-semibold outline-none focus:border-slate-900 ${form.supportEmail && !/^(?!.*\.comm+$)[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/i.test(form.supportEmail) ? "border-red-400 bg-red-50" : "border-slate-200"}`}
                    placeholder="Support email (e.g. support@example.com)"
                    type="email"
                    value={form.supportEmail}
                    onChange={(e) => updateField("supportEmail", e.target.value)}
                  />
                  {form.supportEmail && !/^(?!.*\.comm+$)[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/i.test(form.supportEmail) && (
                    <p className="text-xs font-semibold text-red-500 px-1">Enter a valid email address (e.g. support@example.com)</p>
                  )}
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4 md:col-span-2">
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-black text-slate-900">Opening hours</p>
                      <p className="text-xs font-medium text-slate-500">Select your daily opening and closing time.</p>
                    </div>
                    <span className="self-start sm:self-auto rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                      {openingHoursPreview}
                    </span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Opens at</span>
                      <select
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold outline-none focus:border-slate-900"
                        value={hoursDraft.openingTime}
                        onChange={(e) => handleOpeningHoursChange("openingTime", e.target.value)}
                      >
                        <option value="">Select opening time</option>
                        {timeOptions.map((time) => (
                          <option key={time} value={time}>
                            {time}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2">
                      <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Closes at</span>
                      <select
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold outline-none focus:border-slate-900"
                        value={hoursDraft.closingTime}
                        onChange={(e) => handleOpeningHoursChange("closingTime", e.target.value)}
                      >
                        <option value="">Select closing time</option>
                        {timeOptions.map((time) => (
                          <option key={time} value={time}>
                            {time}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveOpeningHours}
                      disabled={isSavingHours}
                      className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isSavingHours ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      {isSavingHours ? "Saving..." : "Save Hours"}
                    </button>
                  </div>
                </div>
                <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4 md:col-span-2">
                  <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-black text-slate-900">Store location</p>
                      <p className="text-xs font-medium text-slate-500">Pin your storefront on the map so deliveries route correctly.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsMapOpen(true)}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-white transition hover:bg-black"
                    >
                      <MapPin className="h-4 w-4" />
                      {form.lat && form.lng ? "Change Pin" : "Pick On Map"}
                    </button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-[1.4fr_0.8fr]">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Selected address</p>
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
                        {form.address || "Choose your store location on the map to auto-fill the address."}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Coverage</p>
                      <p className="mt-2 text-2xl font-black text-slate-900">{(form.radius !== null && form.radius !== undefined) ? form.radius : 5} km</p>
                      <p className="mt-1 text-xs font-medium text-slate-500">Adjust this inside the map picker.</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Latitude</p>
                      <p className="mt-1 font-semibold text-slate-700">{(form.lat !== null && form.lat !== "") ? form.lat : "Not selected"}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Longitude</p>
                      <p className="mt-1 font-semibold text-slate-700">{(form.lng !== null && form.lng !== "") ? form.lng : "Not selected"}</p>
                    </div>
                  </div>
                  {isLocationOutsideZones && (
                    <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
                      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-red-600">Location Warning</p>
                      <p className="mt-1 text-xs font-semibold text-red-700">
                        Selected storefront location does not lie inside any active service zones. Please pick a location inside your desired service zone.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="text-xs font-bold text-slate-500">Service zone <span className="text-red-500">*</span></label>
                  <select
                    required
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-slate-900"
                    value={form.zoneId ? `${form.zoneSource}:${form.zoneId}` : ""}
                    onChange={(e) => {
                      if (!e.target.value) {
                        setForm((prev) => ({ ...prev, zoneSource: "", zoneId: "" }));
                        return;
                      }
                      const [zoneSource, zoneId] = e.target.value.split(":");
                      setForm((prev) => ({
                        ...prev,
                        zoneSource: zoneSource || "",
                        zoneId: zoneId || "",
                      }));
                    }}
                    disabled={zonesLoading}
                  >
                    <option value="">
                      {zonesLoading ? "Loading zones..." : "Select a service zone"}
                    </option>
                    {zones.map((zone) => {
                      const zoneId = String(zone?._id || zone?.id || "");
                      const zoneSource = String(zone?.source || "");
                      return (
                        <option key={`${zoneSource}-${zoneId}`} value={`${zoneSource}:${zoneId}`}>
                          {zone.label}
                        </option>
                      );
                    })}
                  </select>
                </div>
                {selectedZone && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 md:col-span-2 animate-in fade-in duration-300">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600">Selected zone</p>
                    <p className="mt-1 text-sm font-semibold text-emerald-900">
                      {selectedZone.label}
                    </p>
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-5 rounded-[28px] bg-slate-50/80 p-4 sm:p-5">
              <h2 className="text-lg font-black text-slate-900">
                Banking and UPI
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500">Bank name <span className="text-red-500">*</span></label>
                  <input required className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-slate-900" placeholder="Bank name" value={form.bankName} onChange={(e) => updateField("bankName", e.target.value.replace(/[^a-zA-Z\s]/g, ""))} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500">Account holder name <span className="text-red-500">*</span></label>
                  <input
                    required
                    className={`w-full rounded-2xl border px-4 py-3 font-semibold outline-none focus:border-slate-900 ${form.accountHolderName && String(form.accountHolderName).trim().split(/\s+/).filter(Boolean).length < 2 ? "border-red-400 bg-red-50" : "border-slate-200"}`}
                    placeholder="Account holder name (e.g. John Doe)"
                    value={form.accountHolderName}
                    onChange={(e) => updateField("accountHolderName", e.target.value.replace(/[^a-zA-Z\s]/g, ""))}
                  />
                  {form.accountHolderName && String(form.accountHolderName).trim().split(/\s+/).filter(Boolean).length < 2 && (
                    <p className="text-xs font-semibold text-red-500 px-1">Account holder name must include both first and last name (e.g. John Doe)</p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500">Account number <span className="text-red-500">*</span></label>
                  <input
                    required
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className={`w-full rounded-2xl border px-4 py-3 font-semibold outline-none focus:border-slate-900 ${form.accountNumber && !/^\d{9,18}$/.test(form.accountNumber) ? "border-red-400 bg-red-50" : "border-slate-200"}`}
                    placeholder="Account number (9–18 digits)"
                    value={form.accountNumber}
                    maxLength={18}
                    onChange={(e) => updateField("accountNumber", e.target.value.replace(/\D/g, "").slice(0, 18))}
                  />
                  {form.accountNumber && !/^\d{9,18}$/.test(form.accountNumber) && (
                    <p className="text-xs font-semibold text-red-500 px-1">Account number must be 9–18 digits (numbers only)</p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500">IFSC code <span className="text-red-500">*</span></label>
                  <input
                    required
                    className={`w-full rounded-2xl border px-4 py-3 font-semibold uppercase outline-none focus:border-slate-900 ${form.ifscCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.ifscCode) ? "border-red-400 bg-red-50" : "border-slate-200"}`}
                    placeholder="IFSC code (e.g. ABCD0EF1234)"
                    value={form.ifscCode}
                    maxLength={11}
                    onChange={(e) => updateField("ifscCode", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11))}
                  />
                  {form.ifscCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.ifscCode) && (
                    <p className="text-xs font-semibold text-red-500 px-1">Invalid IFSC: 4 letters + 0 + 6 alphanumeric (e.g. ABCD0EF1234)</p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500">Account type <span className="text-red-500">*</span></label>
                <select
                  required
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-slate-900"
                  value={form.accountType}
                  onChange={(e) => updateField("accountType", e.target.value)}
                >
                  <option value="">Select account type</option>
                  <option value="Savings">Savings Account</option>
                  <option value="Current">Current Account</option>
                  <option value="Salary">Salary Account</option>
                  <option value="Fixed Deposit">Fixed Deposit Account</option>
                  <option value="Recurring Deposit">Recurring Deposit Account</option>
                  <option value="NRI">NRI Account (NRE/NRO)</option>
                  <option value="Jan Dhan">Jan Dhan Account</option>
                  <option value="BSBDA">Basic Savings Bank Deposit (BSBDA)</option>
                </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500">UPI ID <span className="text-red-500">*</span></label>
                  <input
                    required
                    className={`w-full rounded-2xl border px-4 py-3 font-semibold outline-none focus:border-slate-900 ${form.upiId && !/^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/.test(form.upiId) ? "border-red-400 bg-red-50" : "border-slate-200"}`}
                    placeholder="UPI ID (e.g. name@okhdfcbank)"
                    value={form.upiId}
                    onChange={(e) => updateField("upiId", e.target.value)}
                  />
                  {form.upiId && !/^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/.test(form.upiId) && (
                    <p className="text-xs font-semibold text-red-500 px-1">Invalid UPI ID. Format: username@bankhandle (e.g. name@okhdfcbank)</p>
                  )}
                </div>
                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="text-xs font-bold text-slate-500">UPI QR image <span className="text-red-500">*</span></label>
                  <div className="flex flex-col gap-2">
                    <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-slate-400">
                      <span className="truncate max-w-[150px] sm:max-w-xs" title={qrFile?.name || "Upload or take photo of UPI QR"}>
                        {qrFile?.name || "Upload or take photo of UPI QR"}
                      </span>
                      <span className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-white shrink-0">
                        <Upload className="h-3.5 w-3.5" />
                        Choose / Camera
                      </span>
                      <input
                        type="file"
                        accept="image/*,image/heic,image/heif"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setQrFile(file);
                        }}
                      />
                    </label>
                    {qrFile && (
                      <div className="relative flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-2 pr-4">
                        <img
                          src={URL.createObjectURL(qrFile)}
                          alt="UPI QR Preview"
                          className="h-12 w-12 rounded-xl object-cover border border-emerald-200"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-xs font-bold text-emerald-900">{qrFile.name}</p>
                          <p className="text-[10px] font-medium text-emerald-600">{(qrFile.size / (1024 * 1024)).toFixed(2)} MB • Photo Attached</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setQrFile(null)}
                          className="rounded-full bg-emerald-100 p-1 text-emerald-700 hover:bg-emerald-200 text-xs font-bold"
                          title="Remove image"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-5">
              <h2 className="text-lg font-black text-slate-900">
                Compliance and license
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500">PAN number <span className="text-red-500">*</span></label>
                  <input
                    required
                    className={`w-full rounded-2xl border px-4 py-3 font-semibold uppercase outline-none focus:border-slate-900 ${form.panNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(form.panNumber) ? "border-red-400 bg-red-50" : "border-slate-200"}`}
                    placeholder="PAN number (e.g. ABCDE1234F)"
                    value={form.panNumber}
                    maxLength={10}
                    onChange={(e) => updateField("panNumber", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))}
                  />
                  {form.panNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(form.panNumber) && (
                    <p className="text-xs font-semibold text-red-500 px-1">Invalid PAN format. Must be 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F)</p>
                  )}
                  <div className="mt-1 flex flex-col gap-2">
                    <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:border-slate-400">
                      <span className="truncate max-w-[150px] sm:max-w-xs" title={panFile?.name || "Upload PAN card document"}>
                        {panFile?.name || "Upload PAN card photo/doc"}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-2.5 py-1 text-[9px] uppercase tracking-[0.2em] text-white shrink-0">
                        <Upload className="h-3 w-3" />
                        Choose / Camera
                      </span>
                      <input
                        type="file"
                        accept="image/*,application/pdf,image/heic,image/heif"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setPanFile(file);
                        }}
                      />
                    </label>
                    {panFile && (
                      <div className="relative flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50/60 p-2 pr-4">
                        <img
                          src={URL.createObjectURL(panFile)}
                          alt="PAN Preview"
                          className="h-10 w-10 rounded-xl object-cover border border-blue-200"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-xs font-bold text-blue-900">{panFile.name}</p>
                          <p className="text-[10px] font-medium text-blue-600">{(panFile.size / (1024 * 1024)).toFixed(2)} MB • Document Attached</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPanFile(null)}
                          className="rounded-full bg-blue-100 p-1 text-blue-700 hover:bg-blue-200 text-xs font-bold"
                          title="Remove file"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.gstRegistered}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setForm((prev) => ({
                        ...prev,
                        gstRegistered: checked,
                        ...(!checked ? { gstNumber: "", gstLegalName: "" } : {}),
                      }));
                    }}
                  />
                  GST registered
                </label>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500">GST number {form.gstRegistered && <span className="text-red-500">*</span>}</label>
                  <input
                    required={form.gstRegistered}
                    className={`w-full rounded-2xl border px-4 py-3 font-semibold uppercase outline-none focus:border-slate-900 ${form.gstRegistered && form.gstNumber && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(form.gstNumber) ? "border-red-400 bg-red-50" : "border-slate-200"}`}
                    placeholder="GST number (e.g. 22ABCDE1234F1Z5)"
                    value={form.gstNumber}
                    maxLength={15}
                    onChange={(e) => updateField("gstNumber", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 15))}
                  />
                  {form.gstRegistered && form.gstNumber && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(form.gstNumber) && (
                    <p className="text-xs font-semibold text-red-500 px-1">Invalid GST format. Must be 15 chars: 2 digits + PAN (10) + entity + Z + check (e.g. 22ABCDE1234F1Z5)</p>
                  )}
                  {form.gstRegistered && (
                    <div className="mt-1 flex flex-col gap-2">
                      <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:border-slate-400">
                        <span className="truncate max-w-[150px] sm:max-w-xs" title={gstFile?.name || "Upload GST certificate document"}>
                          {gstFile?.name || "Upload GST cert photo/doc"}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-2.5 py-1 text-[9px] uppercase tracking-[0.2em] text-white shrink-0">
                          <Upload className="h-3 w-3" />
                          Choose / Camera
                        </span>
                        <input
                          type="file"
                          accept="image/*,application/pdf,image/heic,image/heif"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setGstFile(file);
                          }}
                        />
                      </label>
                      {gstFile && (
                        <div className="relative flex items-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-2 pr-4">
                          <img
                            src={URL.createObjectURL(gstFile)}
                            alt="GST Preview"
                            className="h-10 w-10 rounded-xl object-cover border border-indigo-200"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="truncate text-xs font-bold text-indigo-900">{gstFile.name}</p>
                            <p className="text-[10px] font-medium text-indigo-600">{(gstFile.size / (1024 * 1024)).toFixed(2)} MB • Document Attached</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setGstFile(null)}
                            className="rounded-full bg-indigo-100 p-1 text-indigo-700 hover:bg-indigo-200 text-xs font-bold"
                            title="Remove file"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500">GST legal name {form.gstRegistered && <span className="text-red-500">*</span>}</label>
                  <input required={form.gstRegistered} className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-slate-900" placeholder="GST legal name" value={form.gstLegalName} onChange={(e) => updateField("gstLegalName", e.target.value.replace(/[^a-zA-Z\s]/g, ""))} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500">FSSAI number <span className="text-red-500">*</span></label>
                  <input
                    required
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className={`w-full rounded-2xl border px-4 py-3 font-semibold outline-none focus:border-slate-900 ${form.fssaiNumber && !/^\d{14}$/.test(form.fssaiNumber) ? "border-red-400 bg-red-50" : "border-slate-200"}`}
                    placeholder="FSSAI number (14 digits)"
                    value={form.fssaiNumber}
                    maxLength={14}
                    onChange={(e) => updateField("fssaiNumber", e.target.value.replace(/\D/g, "").slice(0, 14))}
                  />
                  {form.fssaiNumber && !/^\d{14}$/.test(form.fssaiNumber) && (
                    <p className="text-xs font-semibold text-red-500 px-1">FSSAI number must be exactly 14 digits (numbers only)</p>
                  )}
                  <div className="mt-1 flex flex-col gap-2">
                    <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:border-slate-400">
                      <span className="truncate max-w-[150px] sm:max-w-xs" title={fssaiFile?.name || "Upload FSSAI certificate document"}>
                        {fssaiFile?.name || "Upload FSSAI cert photo/doc"}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-2.5 py-1 text-[9px] uppercase tracking-[0.2em] text-white shrink-0">
                        <Upload className="h-3 w-3" />
                        Choose / Camera
                      </span>
                      <input
                        type="file"
                        accept="image/*,application/pdf,image/heic,image/heif"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setFssaiFile(file);
                        }}
                      />
                    </label>
                    {fssaiFile && (
                      <div className="relative flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-2 pr-4">
                        <img
                          src={URL.createObjectURL(fssaiFile)}
                          alt="FSSAI Preview"
                          className="h-10 w-10 rounded-xl object-cover border border-emerald-200"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-xs font-bold text-emerald-900">{fssaiFile.name}</p>
                          <p className="text-[10px] font-medium text-emerald-600">{(fssaiFile.size / (1024 * 1024)).toFixed(2)} MB • Document Attached</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFssaiFile(null)}
                          className="rounded-full bg-emerald-100 p-1 text-emerald-700 hover:bg-emerald-200 text-xs font-bold"
                          title="Remove file"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500">FSSAI expiry date <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input
                      required
                      className={`w-full rounded-2xl border pl-4 pr-11 py-3 font-semibold outline-none focus:border-slate-900 ${form.fssaiExpiry && isPastDate(form.fssaiExpiry) ? "border-red-400 bg-red-50" : "border-slate-200"}`}
                      type="text"
                      placeholder="DD/MM/YY"
                      value={form.fssaiExpiry}
                      maxLength={10}
                      onChange={(e) => updateField("fssaiExpiry", formatToDDMMYY(e.target.value))}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6">
                      <Calendar className="w-5 h-5 text-slate-400 pointer-events-none" />
                      <input
                        type="date"
                        min={new Date().toISOString().split("T")[0]}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        onChange={(e) => {
                          if (e.target.value) {
                            updateField("fssaiExpiry", convertYYYYMMDDToDDMMYY(e.target.value));
                          }
                        }}
                      />
                    </div>
                  </div>
                  {form.fssaiExpiry && isPastDate(form.fssaiExpiry) && (
                    <p className="text-xs font-semibold text-red-500 px-1">FSSAI expiry date cannot be a past date</p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500">Shop license number <span className="text-red-500">*</span></label>
                  <input
                    required
                    className={`w-full rounded-2xl border px-4 py-3 font-semibold outline-none focus:border-slate-900 ${form.shopLicenseNumber && !/^[A-Za-z0-9\/\-]{5,20}$/.test(form.shopLicenseNumber) ? "border-red-400 bg-red-50" : "border-slate-200"}`}
                    placeholder="Shop license number (e.g. MH/2023/12345)"
                    value={form.shopLicenseNumber}
                    maxLength={20}
                    onChange={(e) => updateField("shopLicenseNumber", e.target.value.replace(/[^A-Za-z0-9\/\-]/g, "").slice(0, 20))}
                  />
                  {form.shopLicenseNumber && !/^[A-Za-z0-9\/\-]{5,20}$/.test(form.shopLicenseNumber) && (
                    <p className="text-xs font-semibold text-red-500 px-1">License number must be 5–20 characters (letters, numbers, / and - only)</p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500">Shop license expiry date <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input
                      required
                      className={`w-full rounded-2xl border pl-4 pr-11 py-3 font-semibold outline-none focus:border-slate-900 ${form.shopLicenseExpiry && isPastDate(form.shopLicenseExpiry) ? "border-red-400 bg-red-50" : "border-slate-200"}`}
                      type="text"
                      placeholder="DD/MM/YY"
                      value={form.shopLicenseExpiry}
                      maxLength={10}
                      onChange={(e) => updateField("shopLicenseExpiry", formatToDDMMYY(e.target.value))}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6">
                      <Calendar className="w-5 h-5 text-slate-400 pointer-events-none" />
                      <input
                        type="date"
                        min={new Date().toISOString().split("T")[0]}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        onChange={(e) => {
                          if (e.target.value) {
                            updateField("shopLicenseExpiry", convertYYYYMMDDToDDMMYY(e.target.value));
                          }
                        }}
                      />
                    </div>
                  </div>
                  {form.shopLicenseExpiry && isPastDate(form.shopLicenseExpiry) && (
                    <p className="text-xs font-semibold text-red-500 px-1">Shop license expiry date cannot be a past date</p>
                  )}
                </div>
                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="text-xs font-bold text-slate-500">Shop license image <span className="text-red-500">*</span></label>
                  <div className="flex flex-col gap-2">
                    <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-slate-400">
                      <span className="truncate max-w-[150px] sm:max-w-xs" title={licenseFile?.name || "Upload or take photo of shop license"}>
                        {licenseFile?.name || "Upload or take photo of shop license"}
                      </span>
                      <span className="inline-flex items-center gap-2 rounded-full bg-amber-500 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-white shrink-0">
                        <Upload className="h-3.5 w-3.5" />
                        Choose / Camera
                      </span>
                      <input
                        type="file"
                        accept="image/*,image/heic,image/heif"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setLicenseFile(file);
                        }}
                      />
                    </label>
                    {licenseFile && (
                      <div className="relative flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-2 pr-4">
                        <img
                          src={URL.createObjectURL(licenseFile)}
                          alt="License Preview"
                          className="h-12 w-12 rounded-xl object-cover border border-amber-200"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-xs font-bold text-amber-900">{licenseFile.name}</p>
                          <p className="text-[10px] font-medium text-amber-600">{(licenseFile.size / (1024 * 1024)).toFixed(2)} MB • Photo Attached</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setLicenseFile(null)}
                          className="rounded-full bg-amber-100 p-1 text-amber-700 hover:bg-amber-200 text-xs font-bold"
                          title="Remove image"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <div className="flex flex-col gap-3 border-t border-slate-100 pt-6 md:flex-row md:items-center md:justify-between">
              <p className="max-w-xl text-sm font-medium leading-6 text-slate-500">
                When you submit, the seller request will move into admin review
                under quick-commerce. Approval unlocks the seller dashboard.
              </p>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-6 py-4 text-sm font-black uppercase tracking-[0.22em] text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? "Submitting..." : "Submit for approval"}
                {!isSubmitting && <ArrowRight className="h-4 w-4" />}
              </button>
            </div>
          </form>
        </div>
      </div>

      {isMapOpen && (
        <MapPicker
          isOpen={isMapOpen}
          onClose={() => setIsMapOpen(false)}
          onConfirm={handleLocationSelect}
          initialLocation={initialLocation}
          initialRadius={Number(form.radius) || 5}
          maxRadius={100}
          zoneCoordinates={selectedZone?.coordinates || []}
          zoneLabel={selectedZone?.label || ""}
        />
      )}
    </div>
  );
}



