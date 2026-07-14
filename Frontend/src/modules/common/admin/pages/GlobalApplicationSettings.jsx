import React, { useState, useEffect, useRef } from 'react';
import { 
  ChevronRight, 
  Save, 
  Loader2,
  Image as ImageIcon,
  Upload,
  X,
  ArrowLeft
} from 'lucide-react';
import { toast } from "sonner";
import { adminAPI } from "@/services/api";
import { setCachedSettings } from "@/modules/common/utils/businessSettings";
import { cn } from "@/lib/utils";
import { compressImage } from "@/shared/utils/imageCompression";

const SectionCard = ({ title, children, id, headerAction }) => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-8" id={id}>
    {title && (
      <div className="px-8 py-4 border-b border-gray-100 bg-gray-50/30 flex items-center justify-between">
        <h3 className="text-[13px] font-bold text-gray-700 uppercase tracking-tight">{title}</h3>
        {headerAction && <div>{headerAction}</div>}
      </div>
    )}
    <div className="p-8">
      {children}
    </div>
  </div>
);

const InputField = ({ label, name, value, onChange, placeholder, info }) => {
  const inputClass = "w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors shadow-sm";
  const labelClass = "block text-xs font-semibold text-gray-500 mb-1.5";
  
  return (
    <div className="space-y-1">
      <label className={labelClass}>{label}</label>
      <div className="relative">
        <input
          type="text"
          name={name}
          value={value || ''}
          onChange={(e) => onChange(name, e.target.value)}
          placeholder={placeholder}
          className={cn(inputClass, name.toLowerCase().includes('themecolor') && "pl-10")}
        />
        {name.toLowerCase().includes('themecolor') && (
          <input 
            type="color"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 p-0 border-0 bg-transparent cursor-pointer"
            value={value || '#0a0a0a'}
            onChange={(e) => onChange(name, e.target.value)}
          />
        )}
      </div>
      {info && (
        <div className="mt-2 bg-[#FFF8F0] border border-orange-100 rounded-lg px-4 py-2 flex items-center gap-2">
           <span className="text-[11px] text-gray-500 italic">Example: {info.prefix}</span>
           <span className="text-[11px] bg-[var(--primary-theme)] text-white px-2 py-0.5 rounded font-bold">{value || info.default}</span>
        </div>
      )}
    </div>
  );
};

const ImageUploadBox = ({ title, size, preview, onUpload, onClear }) => {
  const fileInputRef = useRef(null);
  return (
    <div className="space-y-3">
       <div className="flex items-center justify-between px-0.5">
          <label className="text-xs font-bold text-gray-500">{title}({size})</label>
       </div>
       <div className="aspect-[2/1] w-full rounded-xl border border-dashed border-gray-300 bg-gray-50/50 relative overflow-hidden group hover:border-indigo-300 transition-colors cursor-pointer flex items-center justify-center" onClick={() => fileInputRef.current?.click()}>
          {preview ? (
            <img src={preview} alt={title} className="w-full h-full object-contain p-6" />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 text-gray-400">
                <p className="text-[11px] font-bold uppercase tracking-widest">Upload Image</p>
                <Upload size={24} strokeWidth={1.5} />
            </div>
          )}
          
          <div className="absolute top-4 right-4 flex items-center gap-2">
             <button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} className="w-8 h-8 rounded-lg bg-[#E6F8F6] text-[var(--primary-theme)] shadow-sm border border-[#C2EFE9] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Upload size={14} />
             </button>
             {preview && (
               <button onClick={(e) => { e.stopPropagation(); onClear(); }} className="w-8 h-8 rounded-lg bg-[#FFF1F1] text-[#FF4D4D] shadow-sm border border-[#FEDADA] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <X size={14} />
               </button>
             )}
          </div>
          <input type="file" className="hidden" ref={fileInputRef} onChange={(e) => { if(e.target.files[0]) onUpload(e.target.files[0]); }} />
       </div>
    </div>
  );
};

const GlobalApplicationSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState(null);
  const [faviconPreview, setFaviconPreview] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [faviconFile, setFaviconFile] = useState(null);
  const [foodLogoPreview, setFoodLogoPreview] = useState(null);
  const [foodLogoFile, setFoodLogoFile] = useState(null);
  const [qcLogoPreview, setQcLogoPreview] = useState(null);
  const [qcLogoFile, setQcLogoFile] = useState(null);
  const [deliveryLogoPreview, setDeliveryLogoPreview] = useState(null);
  const [deliveryLogoFile, setDeliveryLogoFile] = useState(null);
  const [restaurantLogoPreview, setRestaurantLogoPreview] = useState(null);
  const [restaurantLogoFile, setRestaurantLogoFile] = useState(null);
  const [userLogoPreview, setUserLogoPreview] = useState(null);
  const [userLogoFile, setUserLogoFile] = useState(null);
  const [sellerLogoPreview, setSellerLogoPreview] = useState(null);
  const [sellerLogoFile, setSellerLogoFile] = useState(null);

  const [formData, setFormData] = useState({
    companyName: "",
    themeColor: "#0a0a0a",
    email: "",
    phoneNumber: "",
    address: "",
    bannedNumbers: [],
    showLocationPopup: true,
    moduleThemes: {
      food: { 
        themeColor: "#cc2532",
        secondaryThemeColor: "#b3202c"
      },
      quickCommerce: { 
        themeColor: "#00BFA5",
        secondaryThemeColor: "#008b74"
      }
    },
    dynamicModuleThemes: true
  });
  const [newBannedNumber, setNewBannedNumber] = useState("");

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getBusinessSettings();
      const settings = response?.data?.data || response?.data;

      if (settings) {
        setFormData({
          companyName: settings.companyName || "",
          themeColor: settings.themeColor || "#0a0a0a",
          email: settings.email || "",
          phoneNumber: settings.phone?.number || "",
          address: settings.address || "",
          bannedNumbers: settings.bannedNumbers || [],
          showLocationPopup: settings.showLocationPopup ?? true,
          moduleThemes: {
            food: { 
              themeColor: settings.moduleThemes?.food?.themeColor || "#cc2532",
              secondaryThemeColor: settings.moduleThemes?.food?.secondaryThemeColor || "#b3202c"
            },
            quickCommerce: { 
              themeColor: settings.moduleThemes?.quickCommerce?.themeColor || "#00BFA5",
              secondaryThemeColor: settings.moduleThemes?.quickCommerce?.secondaryThemeColor || "#008b74"
            }
          },
          dynamicModuleThemes: settings.dynamicModuleThemes ?? true
        });

        if (settings.logo?.url) setLogoPreview(settings.logo.url);
        if (settings.favicon?.url) setFaviconPreview(settings.favicon.url);
        if (settings.moduleThemes?.food?.logo?.url) setFoodLogoPreview(settings.moduleThemes.food.logo.url);
        if (settings.moduleThemes?.quickCommerce?.logo?.url) setQcLogoPreview(settings.moduleThemes.quickCommerce.logo.url);
        if (settings.portals?.delivery?.logo?.url) setDeliveryLogoPreview(settings.portals.delivery.logo.url);
        if (settings.portals?.restaurant?.logo?.url) setRestaurantLogoPreview(settings.portals.restaurant.logo.url);
        if (settings.portals?.user?.logo?.url) setUserLogoPreview(settings.portals.user.logo.url);
        if (settings.portals?.seller?.logo?.url) setSellerLogoPreview(settings.portals.seller.logo.url);
      }
    } catch (err) {
      console.error('Fetch error:', err);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleChange = (name, value) => {
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleAddBannedNumber = () => {
    const trimmed = newBannedNumber.trim();
    if (!trimmed) return;
    
    if (!/^\d{10}$/.test(trimmed)) {
      toast.error("Phone number must be exactly 10 digits");
      return;
    }
    
    if (formData.bannedNumbers.includes(trimmed)) {
      toast.error("Number is already banned");
      return;
    }
    setFormData(prev => ({
      ...prev,
      bannedNumbers: [...prev.bannedNumbers, trimmed]
    }));
    setNewBannedNumber("");
  };

  const handleRemoveBannedNumber = (numberToRemove) => {
    setFormData(prev => ({
      ...prev,
      bannedNumbers: prev.bannedNumbers.filter(n => n !== numberToRemove)
    }));
  };

  const handleUpdate = async () => {
    try {
      if (!formData.companyName.trim()) {
        toast.error("Application name is required");
        return;
      }
      setSaving(true);
      const dataToSend = {
        companyName: formData.companyName.trim(),
        themeColor: formData.themeColor,
        email: formData.email,
        phoneNumber: formData.phoneNumber,
        address: formData.address,
        bannedNumbers: formData.bannedNumbers,
        showLocationPopup: formData.showLocationPopup,
        moduleThemes: formData.moduleThemes,
        dynamicModuleThemes: formData.dynamicModuleThemes
      };

      const files = {};
      if (logoFile) files.logo = logoFile;
      if (faviconFile) files.favicon = faviconFile;
      if (foodLogoFile) files.foodLogo = foodLogoFile;
      if (qcLogoFile) files.qcLogo = qcLogoFile;
      if (deliveryLogoFile) files.deliveryLogo = deliveryLogoFile;
      if (restaurantLogoFile) files.restaurantLogo = restaurantLogoFile;
      if (userLogoFile) files.userLogo = userLogoFile;
      if (sellerLogoFile) files.sellerLogo = sellerLogoFile;

      const response = await adminAPI.updateBusinessSettings(dataToSend, files);
      const updatedSettings = response?.data?.data || response?.data;

      if (updatedSettings) {
        setCachedSettings(updatedSettings);
      }
      toast.success('Configuration saved successfully!');
    } catch (err) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (file) => {
    const compressed = await compressImage(file);
    setLogoFile(compressed);
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(String(reader.result || ''));
    reader.readAsDataURL(compressed);
  };

  const handleFaviconUpload = (file) => {
    setFaviconFile(file);
    const reader = new FileReader();
    reader.onload = () => setFaviconPreview(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const handleFoodLogoUpload = async (file) => {
    const compressed = await compressImage(file);
    setFoodLogoFile(compressed);
    const reader = new FileReader();
    reader.onload = () => setFoodLogoPreview(String(reader.result || ''));
    reader.readAsDataURL(compressed);
  };

  const handleQcLogoUpload = async (file) => {
    const compressed = await compressImage(file);
    setQcLogoFile(compressed);
    const reader = new FileReader();
    reader.onload = () => setQcLogoPreview(String(reader.result || ''));
    reader.readAsDataURL(compressed);
  };

  const handleDeliveryLogoUpload = async (file) => {
    const compressed = await compressImage(file);
    setDeliveryLogoFile(compressed);
    const reader = new FileReader();
    reader.onload = () => setDeliveryLogoPreview(String(reader.result || ''));
    reader.readAsDataURL(compressed);
  };

  const handleRestaurantLogoUpload = async (file) => {
    const compressed = await compressImage(file);
    setRestaurantLogoFile(compressed);
    const reader = new FileReader();
    reader.onload = () => setRestaurantLogoPreview(String(reader.result || ''));
    reader.readAsDataURL(compressed);
  };

  const handleUserLogoUpload = async (file) => {
    const compressed = await compressImage(file);
    setUserLogoFile(compressed);
    const reader = new FileReader();
    reader.onload = () => setUserLogoPreview(String(reader.result || ''));
    reader.readAsDataURL(compressed);
  };

  const handleSellerLogoUpload = async (file) => {
    const compressed = await compressImage(file);
    setSellerLogoFile(compressed);
    const reader = new FileReader();
    reader.onload = () => setSellerLogoPreview(String(reader.result || ''));
    reader.readAsDataURL(compressed);
  };

  if (loading) {
     return (
       <div className="min-h-screen flex items-center justify-center bg-gray-50">
         <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
       </div>
     );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-10 font-sans">
      
      {/* Header */}
      <div className="mb-10 flex items-center justify-between">
        <h1 className="text-[15px] font-black text-gray-800 uppercase tracking-widest">GLOBAL SETTINGS</h1>
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-widest">
           <span>Common</span>
           <ChevronRight size={12} strokeWidth={3} />
           <span className="text-gray-600">Global Settings</span>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto space-y-10 pb-32">
        
        {/* Basic Identification */}
        <SectionCard title="Application Identification">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
              <InputField label="App Name" name="companyName" value={formData.companyName} onChange={handleChange} placeholder="SUPERFAST" />
              <InputField label="Admin Theme Color" name="themeColor" value={formData.themeColor} onChange={handleChange} placeholder="#0a0a0a" />
              <InputField label="Support Email" name="email" value={formData.email} onChange={handleChange} placeholder="admin@SUPERFAST.com" />
              <InputField label="Support Phone" name="phoneNumber" value={formData.phoneNumber} onChange={handleChange} placeholder="0000000000" />
              <InputField label="Office Address" name="address" value={formData.address} onChange={handleChange} placeholder="Main Street, NY" />
           </div>
        </SectionCard>

        {/* Media Assets */}
        <SectionCard title="Image Section (Global)">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <ImageUploadBox title="Brand Logo" size="512px x 512px" preview={logoPreview} onUpload={handleLogoUpload} onClear={() => { setLogoPreview(null); setLogoFile(null); }} />
              <ImageUploadBox title="Favicon" size="80px x 80px" preview={faviconPreview} onUpload={handleFaviconUpload} onClear={() => { setFaviconPreview(null); setFaviconFile(null); }} />
           </div>
        </SectionCard>

        {/* Module Themes */}
        <SectionCard 
          title="App / Module Themes"
          headerAction={
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-gray-600">
                {formData.dynamicModuleThemes ? "Enabled" : "Disabled"}
              </span>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, dynamicModuleThemes: !prev.dynamicModuleThemes }))}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2",
                  formData.dynamicModuleThemes ? "bg-[var(--primary-theme)]" : "bg-gray-200"
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                    formData.dynamicModuleThemes ? "translate-x-4" : "translate-x-0"
                  )}
                />
              </button>
            </div>
          }
        >
           <div className={cn("space-y-8", !formData.dynamicModuleThemes && "opacity-50 pointer-events-none transition-opacity")}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12 border-b border-gray-100 pb-8">
                 <div className="space-y-4">
                    <h4 className="text-sm font-bold text-gray-700">Food Module</h4>
                    <InputField 
                      label="Food Primary Color" 
                      name="foodThemeColor" 
                      value={formData.moduleThemes.food.themeColor} 
                      onChange={(_, val) => setFormData(prev => ({...prev, moduleThemes: {...prev.moduleThemes, food: {...prev.moduleThemes.food, themeColor: val}}}))} 
                      placeholder="#cc2532" 
                    />
                    <InputField 
                      label="Food Secondary Color" 
                      name="foodSecondaryThemeColor" 
                      value={formData.moduleThemes.food.secondaryThemeColor} 
                      onChange={(_, val) => setFormData(prev => ({...prev, moduleThemes: {...prev.moduleThemes, food: {...prev.moduleThemes.food, secondaryThemeColor: val}}}))} 
                      placeholder="#b3202c" 
                    />
                 </div>
                 <ImageUploadBox title="Food Module Logo" size="512px x 512px" preview={foodLogoPreview} onUpload={handleFoodLogoUpload} onClear={() => { setFoodLogoPreview(null); setFoodLogoFile(null); }} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-4">
                 <div className="space-y-4">
                    <h4 className="text-sm font-bold text-gray-700">Quick Commerce Module</h4>
                    <InputField 
                      label="Quick Commerce Primary Color" 
                      name="qcThemeColor" 
                      value={formData.moduleThemes?.quickCommerce?.themeColor} 
                      onChange={(_, val) => setFormData(prev => ({...prev, moduleThemes: {...prev.moduleThemes, quickCommerce: {...prev.moduleThemes.quickCommerce, themeColor: val}}}))} 
                      placeholder="var(--primary-theme, #00BFA5)" 
                    />
                    <InputField 
                      label="Quick Commerce Secondary Color" 
                      name="qcSecondaryThemeColor" 
                      value={formData.moduleThemes?.quickCommerce?.secondaryThemeColor} 
                      onChange={(_, val) => setFormData(prev => ({...prev, moduleThemes: {...prev.moduleThemes, quickCommerce: {...prev.moduleThemes.quickCommerce, secondaryThemeColor: val}}}))} 
                      placeholder="var(--primary-theme, #008b74)" 
                    />
                 </div>
                 <ImageUploadBox title="QC Module Logo" size="512px x 512px" preview={qcLogoPreview} onUpload={handleQcLogoUpload} onClear={() => { setQcLogoPreview(null); setQcLogoFile(null); }} />
              </div>
           </div>
        </SectionCard>

        {/* Portal Logos */}
        <SectionCard title="Portal Logos">
           <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
              <ImageUploadBox title="Delivery Partner Logo" size="512px x 512px" preview={deliveryLogoPreview} onUpload={handleDeliveryLogoUpload} onClear={() => { setDeliveryLogoPreview(null); setDeliveryLogoFile(null); }} />
              <ImageUploadBox title="Restaurant Portal Logo" size="512px x 512px" preview={restaurantLogoPreview} onUpload={handleRestaurantLogoUpload} onClear={() => { setRestaurantLogoPreview(null); setRestaurantLogoFile(null); }} />
              <ImageUploadBox title="User App Logo" size="512px x 512px" preview={userLogoPreview} onUpload={handleUserLogoUpload} onClear={() => { setUserLogoPreview(null); setUserLogoFile(null); }} />
              <ImageUploadBox title="Vendor / Seller Logo" size="512px x 512px" preview={sellerLogoPreview} onUpload={handleSellerLogoUpload} onClear={() => { setSellerLogoPreview(null); setSellerLogoFile(null); }} />
           </div>
        </SectionCard>

        {/* Banned Numbers */}
        <SectionCard title="Banned Numbers">
          <div className="space-y-6">
            <div className="flex items-end gap-4 max-w-md">
              <div className="flex-1 space-y-1">
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Phone Number to Ban</label>
                <input
                  type="text"
                  value={newBannedNumber}
                  onChange={(e) => setNewBannedNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="e.g. 9876543210"
                  maxLength={10}
                  className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition-colors shadow-sm"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddBannedNumber()}
                />
              </div>
              <button 
                onClick={handleAddBannedNumber}
                className="bg-red-50 text-red-600 hover:bg-red-100 px-6 py-2.5 rounded-lg text-sm font-bold tracking-wide transition-colors border border-red-200"
              >
                Ban
              </button>
            </div>
            
            {formData.bannedNumbers.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {formData.bannedNumbers.map(number => (
                  <div key={number} className="flex items-center gap-2 bg-red-50 border border-red-100 pl-3 pr-2 py-1.5 rounded-lg">
                    <span className="text-sm font-semibold text-red-700">{number}</span>
                    <button 
                      onClick={() => handleRemoveBannedNumber(number)}
                      className="p-1 hover:bg-red-200 rounded text-red-500 hover:text-red-700 transition-colors"
                    >
                      <X size={14} strokeWidth={3} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic">No numbers are currently banned.</p>
            )}
          </div>
        </SectionCard>

      </div>

      {/* Persistence Controls */}
      <div className="fixed bottom-10 right-10">
         <button onClick={handleUpdate} disabled={saving} className="bg-[var(--primary-theme)] text-white w-16 h-16 rounded-full flex items-center justify-center shadow-[0_15px_40px_rgba(0,191,165,0.4)] hover:bg-[#00AC95] active:scale-90 transition-all disabled:opacity-50">
            {saving ? <Loader2 size={24} className="animate-spin" /> : <Save size={24} />}
         </button>
      </div>

    </div>
  );
};

export default GlobalApplicationSettings;
