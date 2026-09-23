import React, { useState, useEffect } from "react";
import { adminAPI } from "@food/api";
import { Button } from "@food/components/ui/button";
import { Input } from "@food/components/ui/input";
import { Label } from "@food/components/ui/label";
import { Checkbox } from "@food/components/ui/checkbox";
import { Switch } from "@food/components/ui/switch";
import {
  Card,
  CardContent,
} from "@food/components/ui/card";
import { toast } from "sonner";
import { Loader2, Plus, Edit2, Trash2, ArrowLeft } from "lucide-react";

const FOOD_PERMISSION_GROUPS = {
  "CORE ACCESS": ["dashboard", "subadmins", "pos"],
  "OPERATIONS": ["orders", "restaurants", "foods", "categories", "zones", "delivery", "customers", "support", "dining"],
  "FINANCE": ["wallet", "reports", "promotions", "referrals"],
  "SETTINGS": ["fee_settings", "settings", "cms"]
};

const FOOD_PERMISSION_DISPLAY_NAMES = {
  "pos": "Point of Sale (POS)",
  "cms": "Content Management System (CMS)",
};

const MART_PERMISSION_GROUPS = {
  "CORE ACCESS": ["dashboard", "subadmins"],
  "OPERATIONS": ["orders", "restaurants", "foods", "categories", "zones", "customers", "support"],
  "FINANCE": ["wallet", "reports", "promotions", "referrals"],
  "SETTINGS": ["fee_settings", "settings", "cms"]
};

const MART_PERMISSION_DISPLAY_NAMES = {
  "restaurants": "Sellers",
  "foods": "Products",
  "wallet": "Money Requests & Wallets",
  "cms": "Content Management System (CMS)",
};

const getCurrentUser = () => {
  try {
    const saved = localStorage.getItem('admin_user') || localStorage.getItem('adminInfo');
    if (saved) {
      const parsed = JSON.parse(saved);
      const level = parsed.adminLevel || (parsed.role === 'ADMIN' ? 'PLATFORM_SUPERADMIN' : 'SUB_ADMIN');
      return { ...parsed, effectiveLevel: level };
    }
  } catch (e) {}
  return { effectiveLevel: 'SUB_ADMIN', permissions: [], food_zone_ids: [], quick_commerce_zone_ids: [] };
};

export default function SubAdminManagement() {
  const currentUser = getCurrentUser();
  const [subAdmins, setSubAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentEdit, setCurrentEdit] = useState(null);

  // 'list' | 'form'
  const [view, setView] = useState('list');
  const [searchQuery, setSearchQuery] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    isActive: true,
    module: "food",
    adminType: "subadmin", // 'superadmin' | 'subadmin'
    zones: [],
    permissions: [],
  });

  const [availablePermissions, setAvailablePermissions] = useState([]);
  const [assignableZones, setAssignableZones] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const availableModules = [
    { id: "food", label: "Superfast Food" },
    { id: "quick_commerce", label: "Superfast Mart" },
  ];

  const fetchSubAdmins = async () => {
    try {
      setLoading(true);
      const res = await adminAPI.getSubAdmins();
      const adminData = res?.data?.data || [];
      setSubAdmins(Array.isArray(adminData) ? adminData : (adminData.subAdmins || []));
    } catch (error) {
      toast.error("Failed to load sub admins");
    } finally {
      setLoading(false);
    }
  };

  const fetchOptions = async (moduleStr) => {
    try {
      setLoadingOptions(true);
      const currentGroups = moduleStr === 'quick_commerce' ? MART_PERMISSION_GROUPS : FOOD_PERMISSION_GROUPS;
      const allPerms = Object.values(currentGroups).flat();
      
      // Fetch zones using existing getZones endpoint
      const zoneRes = await adminAPI.getZones({ limit: 1000 });
      setAvailablePermissions(allPerms);
      
      let zonesList = [];
      if (Array.isArray(zoneRes?.data?.data)) {
        zonesList = zoneRes.data.data;
      } else if (zoneRes?.data?.data?.zones) {
        zonesList = zoneRes.data.data.zones;
      } else if (Array.isArray(zoneRes?.data)) {
        zonesList = zoneRes.data;
      }
      setAssignableZones(zonesList);
    } catch (error) {
      toast.error("Failed to load permissions and zones");
    } finally {
      setLoadingOptions(false);
    }
  };

  useEffect(() => {
    fetchSubAdmins();
  }, []);

  useEffect(() => {
    if (view === 'form' && formData.module) {
      fetchOptions(formData.module);
    }
  }, [formData.module, view]);

  const handleOpenForm = (admin = null) => {
    const defaultModule = currentUser.effectiveLevel === 'QUICK_COMMERCE_SUPERADMIN' ? 'quick_commerce' : 'food';
    const defaultAdminType = 'subadmin';

    if (admin) {
      setCurrentEdit(admin._id);
      const mod = admin.module || (admin.servicesAccess?.includes('quickCommerce') ? 'quick_commerce' : 'food');
      const isSuper = admin.adminLevel === 'FOOD_SUPERADMIN' || admin.adminLevel === 'QUICK_COMMERCE_SUPERADMIN';
      setFormData({
        name: admin.name || "",
        email: admin.email || "",
        password: "", // Empty for security
        isActive: admin.isActive,
        module: mod,
        adminType: isSuper ? "superadmin" : "subadmin",
        zones: mod === 'quick_commerce' ? (admin.quick_commerce_zone_ids || []) : (admin.food_zone_ids || []),
        permissions: admin.permissions || [],
      });
    } else {
      setCurrentEdit(null);
      setFormData({
        name: "",
        email: "",
        password: "",
        isActive: true,
        module: defaultModule,
        adminType: defaultAdminType,
        zones: [],
        permissions: [],
      });
    }
    setView('form');
  };

  const handleCloseForm = () => {
    setView('list');
  };

  const handleModuleChange = (modId) => {
    setFormData(prev => ({ ...prev, module: modId, zones: [], permissions: [] }));
  };

  const toggleZone = (zoneId) => {
    setFormData(prev => {
      const z = prev.zones.includes(zoneId)
        ? prev.zones.filter(id => id !== zoneId)
        : [...prev.zones, zoneId];
      return { ...prev, zones: z };
    });
  };

  const handlePermissionToggle = (resource, action) => {
    setFormData(prev => {
      let perms = [...prev.permissions];
      const readKey = `${resource}.read`;
      const writeKey = `${resource}.write`;

      if (action === 'read') {
        if (perms.includes(readKey) || perms.includes(resource)) {
          // Uncheck read (also unchecks write implicitly by our UI logic, but let's clear it explicitly)
          perms = perms.filter(p => p !== readKey && p !== writeKey && p !== resource);
        } else {
          perms.push(readKey);
        }
      } else if (action === 'write') {
        if (perms.includes(writeKey)) {
          // Uncheck write
          perms = perms.filter(p => p !== writeKey);
        } else {
          // Check write (must also ensure read is logically present, but we just save .write)
          perms.push(writeKey);
        }
      }
      return { ...prev, permissions: perms };
    });
  };

  const hasPermission = (resource, action) => {
    const { permissions } = formData;
    if (permissions.includes('*')) return true;
    if (permissions.includes(resource)) return true;
    if (action === 'read') {
      return permissions.includes(`${resource}.read`) || permissions.includes(`${resource}.write`);
    }
    return permissions.includes(`${resource}.write`);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.email) return toast.error("Email is required");
    if (!currentEdit && !formData.password) return toast.error("Password is required for new sub-admin");
    
    if (formData.zones.length === 0) return toast.error("Select at least one zone");
    if (formData.permissions.length === 0) return toast.error("Select at least one permission");

    setSaving(true);

    const level = formData.adminType === 'superadmin' 
      ? (formData.module === 'food' ? 'FOOD_SUPERADMIN' : 'QUICK_COMMERCE_SUPERADMIN')
      : 'SUB_ADMIN';
    
    // Prepare payload
    const payload = {
      name: formData.name,
      email: formData.email,
      password: formData.password || undefined,
      password_confirmation: formData.password || undefined,
      active: formData.isActive,
      adminLevel: level,
      permissions: formData.permissions
    };
    
    if (formData.module === 'food') payload.food_zone_ids = formData.zones;
    if (formData.module === 'quick_commerce') payload.quick_commerce_zone_ids = formData.zones;

    try {
      if (currentEdit) {
        await adminAPI.updateSubAdmin(currentEdit, payload);
        toast.success("Admin updated successfully");
      } else {
        await adminAPI.createSubAdmin(payload);
        toast.success("Admin created successfully");
      }
      setView('list');
      fetchSubAdmins();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to save admin");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (admin) => {
    if (!window.confirm("Are you sure you want to delete this admin?")) return;
    try {
      await adminAPI.deleteSubAdmin(admin._id);
      toast.success("Admin deleted");
      fetchSubAdmins();
    } catch (error) {
      toast.error("Failed to delete admin");
    }
  };

  const toggleStatus = async (admin) => {
    try {
      await adminAPI.updateSubAdmin(admin._id, { active: !admin.isActive });
      toast.success("Status updated");
      fetchSubAdmins();
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  if (view === 'form') {
    const currentGroups = formData.module === 'quick_commerce' ? MART_PERMISSION_GROUPS : FOOD_PERMISSION_GROUPS;
    const grouped = {};
    Object.keys(currentGroups).forEach(k => { grouped[k] = []; });
    grouped["OTHER"] = [];

    if (Array.isArray(availablePermissions)) {
      availablePermissions.forEach(perm => {
        // Hide subadmins permission for regular subadmins, as they cannot manage other subadmins
        if (formData.adminType === 'subadmin' && perm === 'subadmins') return;

        let found = false;
        for (const [groupName, perms] of Object.entries(currentGroups)) {
          if (perms.includes(perm)) {
            grouped[groupName].push(perm);
            found = true;
            break;
          }
        }
        if (!found) grouped["OTHER"].push(perm);
      });
    }

    return (
      <div className="mt-6 space-y-6 max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-semibold tracking-wider text-neutral-500 uppercase flex items-center gap-1.5">
              <button onClick={handleCloseForm} type="button" className="hover:text-neutral-900 transition-colors">
                Admin Management
              </button>
              <span>&gt;</span>
              <span className="text-neutral-900">Create Admin</span>
            </div>
            <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">Create Scoped Admin</h1>
            <p className="text-neutral-500 max-w-2xl text-sm pt-1">
              Assign read or write access per module, then limit the account to the right food zones.
            </p>
          </div>
          <Button onClick={handleCloseForm} variant="outline" className="rounded-full border-neutral-200 px-6 shadow-sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Admins
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* LEFT COLUMN: IDENTITY */}
            <div className="lg:col-span-4 space-y-6">
              <Card className="shadow-sm border-neutral-100 rounded-3xl overflow-hidden">
                <CardContent className="p-6 space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-orange-600">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-bold text-neutral-900 uppercase tracking-wider text-sm">Identity</h3>
                      <p className="text-xs text-neutral-500 font-medium">Who will use this access profile</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Admin Type</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className={`
                        flex flex-col items-center justify-center py-4 rounded-xl border-2 cursor-pointer transition-all text-center
                        ${formData.adminType === 'superadmin' ? 'border-orange-500 text-orange-600 font-bold bg-orange-50' : 'border-neutral-100 text-neutral-500 hover:border-neutral-200 font-semibold'}
                        ${currentUser.effectiveLevel !== 'PLATFORM_SUPERADMIN' ? 'opacity-50 cursor-not-allowed' : ''}
                      `}>
                        <input type="radio" name="adminType" className="hidden" 
                          checked={formData.adminType === 'superadmin'} 
                          onChange={() => setFormData(p => ({...p, adminType: 'superadmin'}))} 
                          disabled={!!currentEdit || currentUser.effectiveLevel !== 'PLATFORM_SUPERADMIN'}
                        />
                        Super<br/>Admin
                      </label>
                      <label className={`
                        flex flex-col items-center justify-center py-4 rounded-xl border-2 cursor-pointer transition-all text-center
                        ${formData.adminType === 'subadmin' ? 'border-orange-500 text-orange-600 font-bold bg-orange-50' : 'border-neutral-100 text-neutral-500 hover:border-neutral-200 font-semibold'}
                      `}>
                        <input type="radio" name="adminType" className="hidden" 
                          checked={formData.adminType === 'subadmin'} 
                          onChange={() => setFormData(p => ({...p, adminType: 'subadmin'}))} 
                          disabled={!!currentEdit}
                        />
                        Sub<br/>Admin
                      </label>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Module Assignment</Label>
                    <div className="grid grid-cols-2 gap-3">
                      {availableModules.map((m) => {
                        const isDisabled = !!currentEdit || (
                          currentUser.effectiveLevel !== 'PLATFORM_SUPERADMIN' && (
                            (currentUser.effectiveLevel === 'FOOD_SUPERADMIN' && m.id !== 'food') ||
                            (currentUser.effectiveLevel === 'QUICK_COMMERCE_SUPERADMIN' && m.id !== 'quick_commerce')
                          )
                        );
                        return (
                          <label key={m.id} className={`
                            flex flex-col items-center justify-center px-4 py-4 rounded-xl border-2 cursor-pointer transition-all text-center text-sm
                            ${formData.module === m.id ? 'border-neutral-900 text-neutral-900 font-bold' : 'border-neutral-100 text-neutral-500 hover:border-neutral-200 font-semibold'}
                            ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
                          `}>
                            <input type="radio" name="module" className="hidden" 
                              checked={formData.module === m.id} 
                              onChange={() => handleModuleChange(m.id)} 
                              disabled={isDisabled}
                            />
                            {m.label}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="name" className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Enter name"
                      className="h-12 rounded-xl bg-white border-neutral-200 font-medium"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="email" className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="Enter email address"
                      className="h-12 rounded-xl bg-white border-neutral-200 font-medium"
                    />
                  </div>
                  
                  <div className="space-y-3">
                    <Label htmlFor="password" className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                      {currentEdit ? "New Password (Optional)" : "Password"}
                    </Label>
                    <Input
                      id="password"
                      type="text"
                      required={!currentEdit}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder={currentEdit ? "Leave empty to keep unchanged" : "Set password"}
                      className="h-12 rounded-xl bg-white border-neutral-200 font-medium"
                    />
                  </div>
                  
                  <div className="flex items-center space-x-3 pt-2">
                    <Switch
                      id="isActive"
                      checked={formData.isActive}
                      onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                      className="data-[state=checked]:bg-green-600"
                    />
                    <Label htmlFor="isActive" className="font-bold cursor-pointer text-neutral-700 text-sm">
                      Active Account
                    </Label>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* RIGHT COLUMN: PERMISSIONS */}
            <div className="lg:col-span-8 space-y-6">
                <Card className="shadow-sm border-neutral-100 rounded-3xl overflow-hidden h-full">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-600">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="font-bold text-neutral-900 uppercase tracking-wider text-sm">Sidebar Permissions</h3>
                        <p className="text-xs text-neutral-500 font-medium">Choose read-only or read+write access for each module.</p>
                      </div>
                    </div>

                    {loadingOptions ? (
                      <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 text-neutral-400 animate-spin" /></div>
                    ) : (
                      <div className="space-y-8">
                        {Object.keys(grouped).map(groupName => {
                          if (grouped[groupName].length === 0) return null;
                          return (
                            <div key={groupName} className="space-y-3">
                              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{groupName}</h4>
                              <div className="border border-neutral-100 rounded-2xl overflow-hidden divide-y divide-neutral-100">
                                {grouped[groupName].map(perm => {
                                  const displayNames = formData.module === 'quick_commerce' ? MART_PERMISSION_DISPLAY_NAMES : FOOD_PERMISSION_DISPLAY_NAMES;
                                  return (
                                  <div key={perm} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white hover:bg-neutral-50/50 transition-colors gap-4">
                                    <div>
                                      <div className="font-bold text-neutral-900 text-sm capitalize">
                                        {displayNames[perm] || perm.replace(/_/g, ' ')}
                                      </div>
                                      <div className="text-xs font-medium text-neutral-500 mt-0.5">Read or write access</div>
                                    </div>
                                    <div className="flex items-center gap-4 sm:gap-6">
                                      {(() => {
                                        const isReadDisabled = currentUser.effectiveLevel !== 'PLATFORM_SUPERADMIN' &&
                                          !currentUser.permissions?.includes(`${perm}.read`) &&
                                          !currentUser.permissions?.includes(`${perm}.write`) &&
                                          !currentUser.permissions?.includes(perm) &&
                                          !currentUser.permissions?.includes('*');

                                        const isWriteDisabled = currentUser.effectiveLevel !== 'PLATFORM_SUPERADMIN' &&
                                          !currentUser.permissions?.includes(`${perm}.write`) &&
                                          !currentUser.permissions?.includes(perm) &&
                                          !currentUser.permissions?.includes('*');

                                        return (
                                          <>
                                            <label className={`flex items-center gap-2 cursor-pointer group ${isReadDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${hasPermission(perm, 'read') ? 'border-orange-500 bg-orange-500' : 'border-neutral-200 group-hover:border-neutral-300'}`}>
                                                {hasPermission(perm, 'read') && <div className="w-2 h-2 rounded-full bg-white" />}
                                              </div>
                                              <input type="checkbox" className="hidden" checked={hasPermission(perm, 'read')} onChange={() => !isReadDisabled && handlePermissionToggle(perm, 'read')} disabled={isReadDisabled} />
                                              <span className={`text-xs font-bold tracking-wider ${hasPermission(perm, 'read') ? 'text-neutral-900' : 'text-neutral-400 group-hover:text-neutral-600'}`}>READ</span>
                                            </label>
                                            
                                            <label className={`flex items-center gap-2 cursor-pointer group ${isWriteDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${hasPermission(perm, 'write') ? 'border-orange-500 bg-orange-500' : 'border-neutral-200 group-hover:border-neutral-300'}`}>
                                                {hasPermission(perm, 'write') && <div className="w-2 h-2 rounded-full bg-white" />}
                                              </div>
                                              <input type="checkbox" className="hidden" checked={hasPermission(perm, 'write')} onChange={() => !isWriteDisabled && handlePermissionToggle(perm, 'write')} disabled={isWriteDisabled} />
                                              <span className={`text-xs font-bold tracking-wider ${hasPermission(perm, 'write') ? 'text-neutral-900' : 'text-neutral-400 group-hover:text-neutral-600'}`}>WRITE</span>
                                            </label>
                                          </>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
          </div>

          {/* ZONES SECTION */}
          <Card className="shadow-sm border-neutral-100 rounded-3xl overflow-hidden">
            <CardContent className="p-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-bold text-neutral-900 uppercase tracking-wider text-sm">Food Zone Scope</h3>
                    <p className="text-xs text-neutral-500 font-medium">Subadmins only see records inside the zones selected here.</p>
                  </div>
                </div>

                {loadingOptions ? (
                  <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-neutral-400" /></div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {(!Array.isArray(assignableZones) || assignableZones.length === 0) && <span className="text-sm text-neutral-500">No zones available</span>}
                    {Array.isArray(assignableZones) && assignableZones.map((z) => {
                      const isChecked = formData.zones.includes(z._id);
                      const isZoneDisabled = currentUser.effectiveLevel !== 'PLATFORM_SUPERADMIN' &&
                        !(currentUser.food_zone_ids || []).includes(z._id) &&
                        !(currentUser.quick_commerce_zone_ids || []).includes(z._id);

                      return (
                        <label key={z._id} className={`
                          flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all
                          ${isChecked ? 'border-emerald-500 bg-emerald-50/30' : 'border-neutral-100 hover:border-neutral-200 bg-white'}
                          ${isZoneDisabled ? 'opacity-50 cursor-not-allowed' : ''}
                        `}>
                          <span className={`font-bold text-sm ${isChecked ? 'text-emerald-900' : 'text-neutral-700'}`}>{z.name}</span>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${isChecked ? 'border-emerald-500 bg-emerald-500' : 'border-neutral-200'}`}>
                            {isChecked && <div className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                          <input type="checkbox" className="hidden" checked={isChecked} onChange={() => !isZoneDisabled && toggleZone(z._id)} disabled={isZoneDisabled} />
                        </label>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

          {/* ACTIONS */}
          <Card className="shadow-sm border-neutral-100 rounded-3xl overflow-hidden bg-white/50">
            <CardContent className="p-4 flex flex-wrap items-center justify-end gap-4">
              <Button type="button" variant="ghost" onClick={handleCloseForm} className="font-bold rounded-full px-6 hover:bg-neutral-100">
                Cancel
              </Button>
              <Button type="submit" className="bg-black text-white hover:bg-neutral-800 font-bold rounded-full px-8 shadow-md" disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {currentEdit ? "Update Admin Access" : "Create Admin Access"}
              </Button>
            </CardContent>
          </Card>
        </form>
      </div>
    );
  }

  const superAdminsCount = subAdmins.filter(a => a.adminLevel === 'FOOD_SUPERADMIN' || a.adminLevel === 'QUICK_COMMERCE_SUPERADMIN').length;
  const subadminsCount = subAdmins.length - superAdminsCount;
  const activeCount = subAdmins.filter(a => a.isActive).length;

  const filteredAdmins = subAdmins.filter(a => 
    a.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    a.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs font-semibold tracking-wider text-neutral-500 uppercase flex items-center gap-1.5">
            <span className="text-neutral-500">Admin Management</span>
            <span>&gt;</span>
            <span className="text-neutral-900">Admins</span>
          </div>
          <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">
            {currentUser.effectiveLevel === 'PLATFORM_SUPERADMIN' ? 'Platform Admin Hierarchy' : 
             (currentUser.effectiveLevel === 'FOOD_SUPERADMIN' ? 'Food Admin Hierarchy' : 'Quick Commerce Admin Hierarchy')}
          </h1>
          <p className="text-neutral-500 max-w-2xl text-sm pt-1">
            Manage descendant admins in your branch. Permissions and zones must stay within your scope.
          </p>
        </div>
        <Button onClick={() => handleOpenForm()} className="bg-blue-600 text-white hover:bg-blue-700 rounded-full px-6 shadow-sm">
          <Plus className="w-4 h-4 mr-2" />
          Create Admin
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="shadow-sm border-neutral-100 rounded-2xl">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center text-orange-500">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18V3l-5 4-4-4-4 4-5-4z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Super Admins</p>
              <h3 className="text-2xl font-bold text-neutral-900">{superAdminsCount}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-neutral-100 rounded-2xl">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center text-orange-500">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Subadmins</p>
              <h3 className="text-2xl font-bold text-neutral-900">{subadminsCount}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-neutral-100 rounded-2xl">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center text-orange-500">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Active</p>
              <h3 className="text-2xl font-bold text-neutral-900">{activeCount}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-neutral-100 rounded-3xl">
        <CardContent className="p-6">
          <div className="mb-6 relative">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <Input 
              placeholder="Search admins..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-12 rounded-full bg-white border-neutral-200 w-full"
            />
          </div>

          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAdmins.length === 0 ? (
                <div className="text-center py-12 text-neutral-500">
                  No admins found matching your search.
                </div>
              ) : (
                filteredAdmins.map((admin) => {
                  const readCount = (admin.permissions || []).filter(p => p.includes('.read') || p === '*').length;
                  const writeCount = (admin.permissions || []).filter(p => p.includes('.write') || p === '*').length;
                  const roleLabel = admin.adminLevel === 'FOOD_SUPERADMIN' || admin.adminLevel === 'QUICK_COMMERCE_SUPERADMIN' ? 'SUPERADMIN' : 'SUBADMIN';
                  const zoneLabel = (admin.food_zone_ids?.length || admin.quick_commerce_zone_ids?.length) ? `${admin.food_zone_ids?.length || admin.quick_commerce_zone_ids?.length} ZONES` : 'NO ZONES';

                  return (
                    <div key={admin._id} className="p-5 border border-neutral-100 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:shadow-md transition-shadow bg-white">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-bold text-neutral-900">{admin.name || "—"}</h3>
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold tracking-wider">
                            {roleLabel}
                          </span>
                          {!admin.isActive && (
                            <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] font-bold tracking-wider">
                              INACTIVE
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-neutral-500">{admin.email}</p>
                        <div className="flex items-center gap-3 pt-1">
                          <span className="px-3 py-1 rounded-full bg-orange-50 text-orange-600 text-[11px] font-bold tracking-wider uppercase">
                            {zoneLabel}
                          </span>
                          <span className="text-xs font-medium text-slate-500">
                            {readCount} read - {writeCount} write
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" className="h-10 w-10 rounded-full border-neutral-200 text-neutral-600 hover:text-neutral-900" onClick={() => handleOpenForm(admin)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="icon" className="h-10 w-10 rounded-full border-red-100 text-red-500 hover:bg-red-50 hover:text-red-600" onClick={() => handleDelete(admin)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
