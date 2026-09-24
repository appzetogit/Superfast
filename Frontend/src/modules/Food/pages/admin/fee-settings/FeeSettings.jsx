import { useState, useEffect } from "react"
import { Save, Loader2, DollarSign, Plus, Trash2, Edit, Check, X, MapPin, Sliders, ShieldCheck, Power, Info, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { adminAPI } from "@food/api"
import { toast } from "sonner"

const debugError = (...args) => {}

// Fee Settings Component - Interactive fee toggles & conditions
export default function FeeSettings() {
  const [feeSettings, setFeeSettings] = useState({
    deliveryFee: "",
    perKmDeliveryFee: "",
    deliveryFeeRanges: [],
    zoneDeliveryFees: [],
    freeDeliveryThreshold: "",
    platformFee: "",
    gstRate: "",
    isIncentiveEnabled: false,
    incentiveThreshold: "",
    incentivePercentage: "",
    // Toggle switches for each fee model
    enableRangeFee: true,
    enablePerKmFee: true,
    enableZoneFees: true,
    enableDefaultFee: true,
    enableDistanceBasedFee: false,
    baseDistanceKm: "1",
    baseDistanceFee: "",
    extraFeePerKm: "",
  })

  const [zones, setZones] = useState([])
  const [loadingZones, setLoadingZones] = useState(false)
  const [loadingFeeSettings, setLoadingFeeSettings] = useState(false)
  const [savingFeeSettings, setSavingFeeSettings] = useState(false)
  const [editingRangeIndex, setEditingRangeIndex] = useState(null)

  // Collapse / Expand state for UI sections
  const [openSections, setOpenSections] = useState({
    baseFee: true,
    zoneFee: true,
    rangeFee: true,
    advanceFee: false,
    generalFee: true,
    incentiveFee: true,
  })

  const [newRange, setNewRange] = useState({ min: '', max: '', fee: '', zoneId: '' })
  const [newZoneFee, setNewZoneFee] = useState({ zoneId: '', deliveryFee: '', perKmDeliveryFee: '' })

  const toggleSection = (sectionKey) => {
    setOpenSections(prev => ({ ...prev, [sectionKey]: !prev[sectionKey] }))
  }

  // Fetch zones created by admin
  const fetchZones = async () => {
    try {
      setLoadingZones(true)
      const res = await adminAPI.getZones({ limit: 1000, isActive: true })
      if (res.data?.success) {
        const fetchedZones = res.data?.data?.zones || res.data?.zones || []
        setZones(fetchedZones)
      }
    } catch (error) {
      debugError('Error fetching zones:', error)
    } finally {
      setLoadingZones(false)
    }
  }

  const parseZoneIdStr = (zid) => {
    if (!zid) return "";
    if (typeof zid === 'object' && zid !== null && zid._id) return String(zid._id);
    const s = String(zid).trim();
    return s && s !== 'null' && s !== 'undefined' ? s : "";
  };

  // Fetch fee settings from backend
  const fetchFeeSettings = async () => {
    try {
      setLoadingFeeSettings(true)
      const response = await adminAPI.getFeeSettings()
      const saved = response.data?.data?.feeSettings || response.data?.feeSettings
      if (response.data?.success && saved) {
        setFeeSettings({
          deliveryFee: saved.deliveryFee ?? "",
          perKmDeliveryFee: saved.perKmDeliveryFee ?? "",
          deliveryFeeRanges: (saved.deliveryFeeRanges || []).map(r => ({
            min: r.min,
            max: r.max,
            fee: r.fee,
            zoneId: parseZoneIdStr(r.zoneId)
          })),
          zoneDeliveryFees: (saved.zoneDeliveryFees || []).map(z => ({
            zoneId: parseZoneIdStr(z.zoneId),
            deliveryFee: z.deliveryFee ?? "",
            perKmDeliveryFee: z.perKmDeliveryFee ?? ""
          })),
          freeDeliveryThreshold: saved.freeDeliveryThreshold ?? "",
          platformFee: saved.platformFee ?? "",
          gstRate: saved.gstRate ?? "",
          isIncentiveEnabled: saved.isIncentiveEnabled ?? false,
          incentiveThreshold: saved.incentiveThreshold ?? "",
          incentivePercentage: saved.incentivePercentage ?? "",
          enableRangeFee: saved.enableRangeFee ?? true,
          enablePerKmFee: saved.enablePerKmFee ?? true,
          enableZoneFees: saved.enableZoneFees ?? true,
          enableDefaultFee: saved.enableDefaultFee ?? true,
          enableDistanceBasedFee: saved.enableDistanceBasedFee ?? false,
          baseDistanceKm: saved.baseDistanceKm ?? "1",
          baseDistanceFee: saved.baseDistanceFee ?? "",
          extraFeePerKm: saved.extraFeePerKm ?? "",
        })
      } else if (response.data?.success && response.data?.data?.feeSettings === null) {
        setFeeSettings({
          deliveryFee: "",
          perKmDeliveryFee: "",
          deliveryFeeRanges: [],
          zoneDeliveryFees: [],
          freeDeliveryThreshold: "",
          platformFee: "",
          gstRate: "",
          isIncentiveEnabled: false,
          incentiveThreshold: "",
          incentivePercentage: "",
          enableRangeFee: true,
          enablePerKmFee: true,
          enableZoneFees: true,
          enableDefaultFee: true,
          enableDistanceBasedFee: false,
          baseDistanceKm: "1",
          baseDistanceFee: "",
          extraFeePerKm: "",
        })
      }
    } catch (error) {
      debugError('Error fetching fee settings:', error)
      toast.error('Failed to load fee settings')
    } finally {
      setLoadingFeeSettings(false)
    }
  }

  // Fetch on mount
  useEffect(() => {
    fetchZones()
    fetchFeeSettings()
  }, [])

  // Helper to find Zone Name by zoneId
  const getZoneName = (zoneId) => {
    const parsedId = parseZoneIdStr(zoneId)
    if (!parsedId) return "All Zones (Global)"
    const z = zones.find((item) => String(item._id) === String(parsedId))
    return z ? (z.name || z.zoneName || z.serviceLocation || "Unknown Zone") : "Selected Zone"
  }

  // Persistent save helper
  const saveSettingsToBackend = async (nextSettings) => {
    try {
      setSavingFeeSettings(true)
      const payload = {
        deliveryFee: nextSettings.deliveryFee === "" ? undefined : Number(nextSettings.deliveryFee),
        perKmDeliveryFee: nextSettings.perKmDeliveryFee === "" ? undefined : Number(nextSettings.perKmDeliveryFee),
        deliveryFeeRanges: nextSettings.deliveryFeeRanges.map(r => ({
          min: Number(r.min),
          max: Number(r.max),
          fee: Number(r.fee),
          zoneId: parseZoneIdStr(r.zoneId) || null
        })),
        zoneDeliveryFees: nextSettings.zoneDeliveryFees.map(z => ({
          zoneId: parseZoneIdStr(z.zoneId),
          deliveryFee: z.deliveryFee === "" ? undefined : Number(z.deliveryFee),
          perKmDeliveryFee: z.perKmDeliveryFee === "" ? undefined : Number(z.perKmDeliveryFee),
        })),
        freeDeliveryThreshold: nextSettings.freeDeliveryThreshold === "" ? undefined : Number(nextSettings.freeDeliveryThreshold),
        platformFee: nextSettings.platformFee === "" ? undefined : Number(nextSettings.platformFee),
        gstRate: nextSettings.gstRate === "" ? undefined : Number(nextSettings.gstRate),
        isIncentiveEnabled: nextSettings.isIncentiveEnabled,
        incentiveThreshold: nextSettings.incentiveThreshold === "" ? undefined : Number(nextSettings.incentiveThreshold),
        incentivePercentage: nextSettings.incentivePercentage === "" ? undefined : Number(nextSettings.incentivePercentage),
        enableRangeFee: nextSettings.enableRangeFee,
        enablePerKmFee: nextSettings.enablePerKmFee,
        enableZoneFees: nextSettings.enableZoneFees,
        enableDefaultFee: nextSettings.enableDefaultFee,
        enableDistanceBasedFee: nextSettings.enableDistanceBasedFee,
        baseDistanceKm: nextSettings.baseDistanceKm === "" ? undefined : Number(nextSettings.baseDistanceKm),
        baseDistanceFee: nextSettings.baseDistanceFee === "" ? undefined : Number(nextSettings.baseDistanceFee),
        extraFeePerKm: nextSettings.extraFeePerKm === "" ? undefined : Number(nextSettings.extraFeePerKm),
        isActive: true,
      }

      const response = await adminAPI.createOrUpdateFeeSettings(payload)
      if (response.data?.success) {
        const saved = response?.data?.data?.feeSettings || response?.data?.feeSettings
        if (saved) {
          setFeeSettings({
            deliveryFee: saved.deliveryFee ?? "",
            perKmDeliveryFee: saved.perKmDeliveryFee ?? "",
            deliveryFeeRanges: (saved.deliveryFeeRanges || []).map(r => ({
              min: r.min,
              max: r.max,
              fee: r.fee,
              zoneId: parseZoneIdStr(r.zoneId)
            })),
            zoneDeliveryFees: (saved.zoneDeliveryFees || []).map(z => ({
              zoneId: parseZoneIdStr(z.zoneId),
              deliveryFee: z.deliveryFee ?? "",
              perKmDeliveryFee: z.perKmDeliveryFee ?? ""
            })),
            freeDeliveryThreshold: saved.freeDeliveryThreshold ?? "",
            platformFee: saved.platformFee ?? "",
            gstRate: saved.gstRate ?? "",
            isIncentiveEnabled: saved.isIncentiveEnabled ?? false,
            incentiveThreshold: saved.incentiveThreshold ?? "",
            incentivePercentage: saved.incentivePercentage ?? "",
            enableRangeFee: saved.enableRangeFee ?? true,
            enablePerKmFee: saved.enablePerKmFee ?? true,
            enableZoneFees: saved.enableZoneFees ?? true,
            enableDefaultFee: saved.enableDefaultFee ?? true,
            enableDistanceBasedFee: saved.enableDistanceBasedFee ?? false,
            baseDistanceKm: saved.baseDistanceKm ?? "1",
            baseDistanceFee: saved.baseDistanceFee ?? "",
            extraFeePerKm: saved.extraFeePerKm ?? "",
          })
        }
        return true
      } else {
        toast.error(response.data?.message || 'Failed to save fee settings')
        return false
      }
    } catch (error) {
      debugError('Error saving fee settings:', error)
      toast.error(error.response?.data?.message || 'Failed to save fee settings')
      return false
    } finally {
      setSavingFeeSettings(false)
    }
  }

  // Save fee settings main button
  const handleSaveFeeSettings = async () => {
    const success = await saveSettingsToBackend(feeSettings)
    if (success) {
      toast.success('Fee settings saved successfully to database')
    }
  }

  // Add new delivery fee range
  const handleAddRange = async () => {
    if (newRange.min === '' || newRange.max === '' || newRange.fee === '') {
      toast.error('Please fill all required fields (Min, Max, Fee)')
      return
    }

    const min = Number(newRange.min)
    const max = Number(newRange.max)
    const fee = Number(newRange.fee)
    const selectedZoneId = newRange.zoneId || null

    if (min < 0 || max < 0 || fee < 0) {
      toast.error('All values must be positive numbers')
      return
    }

    if (min >= max) {
      toast.error('Min value must be less than Max value')
      return
    }

    const ranges = [...feeSettings.deliveryFeeRanges]
    for (const range of ranges) {
      const sameZone = (range.zoneId || null) === selectedZoneId
      if (sameZone) {
        if ((min >= range.min && min < range.max) || (max > range.min && max <= range.max) || (min <= range.min && max >= range.max)) {
          toast.error(`This range overlaps with an existing range for ${getZoneName(selectedZoneId)}`)
          return
        }
      }
    }

    const updatedRanges = [...ranges, { min, max, fee, zoneId: selectedZoneId }].sort((a, b) => a.min - b.min)
    const nextSettings = { ...feeSettings, deliveryFeeRanges: updatedRanges }

    setFeeSettings(nextSettings)
    setNewRange({ min: '', max: '', fee: '', zoneId: '' })
    
    const saved = await saveSettingsToBackend(nextSettings)
    if (saved) {
      toast.success('Range added & saved successfully')
    }
  }

  // Delete range
  const handleDeleteRange = async (index) => {
    const newRanges = feeSettings.deliveryFeeRanges.filter((_, i) => i !== index)
    const nextSettings = { ...feeSettings, deliveryFeeRanges: newRanges }
    setFeeSettings(nextSettings)
    const saved = await saveSettingsToBackend(nextSettings)
    if (saved) {
      toast.success('Range deleted & saved successfully')
    }
  }

  // Edit range
  const handleEditRange = (index) => {
    const range = feeSettings.deliveryFeeRanges[index]
    setNewRange({ min: range.min, max: range.max, fee: range.fee, zoneId: range.zoneId || '' })
    setEditingRangeIndex(index)
  }

  // Save edited range
  const handleSaveEditRange = async () => {
    if (newRange.min === '' || newRange.max === '' || newRange.fee === '') {
      toast.error('Please fill all required fields')
      return
    }

    const min = Number(newRange.min)
    const max = Number(newRange.max)
    const fee = Number(newRange.fee)
    const selectedZoneId = newRange.zoneId || null

    if (min < 0 || max < 0 || fee < 0) {
      toast.error('All values must be positive numbers')
      return
    }

    if (min >= max) {
      toast.error('Min value must be less than Max value')
      return
    }

    const ranges = [...feeSettings.deliveryFeeRanges]
    ranges.splice(editingRangeIndex, 1)

    for (const range of ranges) {
      const sameZone = (range.zoneId || null) === selectedZoneId
      if (sameZone) {
        if ((min >= range.min && min < range.max) || (max > range.min && max <= range.max) || (min <= range.min && max >= range.max)) {
          toast.error(`This range overlaps with an existing range for ${getZoneName(selectedZoneId)}`)
          return
        }
      }
    }

    ranges.push({ min, max, fee, zoneId: selectedZoneId })
    ranges.sort((a, b) => a.min - b.min)

    const nextSettings = { ...feeSettings, deliveryFeeRanges: ranges }
    setFeeSettings(nextSettings)
    setNewRange({ min: '', max: '', fee: '', zoneId: '' })
    setEditingRangeIndex(null)

    const saved = await saveSettingsToBackend(nextSettings)
    if (saved) {
      toast.success('Range updated & saved successfully')
    }
  }

  // Cancel edit range
  const handleCancelEdit = () => {
    setNewRange({ min: '', max: '', fee: '', zoneId: '' })
    setEditingRangeIndex(null)
  }

  // Add Zone-specific delivery fee override
  const handleAddZoneFee = async () => {
    if (!newZoneFee.zoneId) {
      toast.error('Please select an existing zone')
      return
    }
    if (newZoneFee.deliveryFee === '' && newZoneFee.perKmDeliveryFee === '') {
      toast.error('Please specify at least Default Delivery Fee or 1 KM Fee for the selected zone')
      return
    }

    const existingIndex = feeSettings.zoneDeliveryFees.findIndex(z => String(z.zoneId) === String(newZoneFee.zoneId))
    const updatedZoneFees = [...feeSettings.zoneDeliveryFees]

    const item = {
      zoneId: newZoneFee.zoneId,
      deliveryFee: newZoneFee.deliveryFee === '' ? '' : Number(newZoneFee.deliveryFee),
      perKmDeliveryFee: newZoneFee.perKmDeliveryFee === '' ? '' : Number(newZoneFee.perKmDeliveryFee),
    }

    if (existingIndex >= 0) {
      updatedZoneFees[existingIndex] = item
    } else {
      updatedZoneFees.push(item)
    }

    const nextSettings = { ...feeSettings, zoneDeliveryFees: updatedZoneFees }
    setFeeSettings(nextSettings)
    setNewZoneFee({ zoneId: '', deliveryFee: '', perKmDeliveryFee: '' })

    const saved = await saveSettingsToBackend(nextSettings)
    if (saved) {
      toast.success('Zone fee saved successfully')
    }
  }

  // Remove Zone-specific fee override
  const handleDeleteZoneFee = async (index) => {
    const updated = feeSettings.zoneDeliveryFees.filter((_, i) => i !== index)
    const nextSettings = { ...feeSettings, zoneDeliveryFees: updated }
    setFeeSettings(nextSettings)
    const saved = await saveSettingsToBackend(nextSettings)
    if (saved) {
      toast.success('Zone fee override removed & saved')
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      {/* Header Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-700 flex items-center justify-center shadow-md">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Delivery & Platform Fee Settings</h1>
              <p className="text-sm text-slate-600">
                Enable or disable fee calculation conditions and configure zone-wise rates
              </p>
            </div>
          </div>
          <Button
            onClick={handleSaveFeeSettings}
            disabled={savingFeeSettings || loadingFeeSettings}
            className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2 px-5 py-2.5 rounded-lg shadow-sm shrink-0"
          >
            {savingFeeSettings ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Fee Calculation Priority & Rules Overview Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-xl p-5 mb-6 shadow-md border border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-bold">Active Fee Calculation Rules & Priority</h2>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-amber-400/20 text-amber-300 rounded-full border border-amber-400/30">
            System Logic
          </span>
        </div>
        <p className="text-xs text-slate-300 mb-4">
          Enable or Disable specific fee conditions below using the toggle switches. When an order is placed, fees are applied in the following order:
        </p>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          <div className={`p-2.5 rounded-lg border flex flex-col justify-between ${
            feeSettings.enableRangeFee 
              ? 'bg-purple-950/60 border-purple-500/50 text-purple-200' 
              : 'bg-slate-800/50 border-slate-700 text-slate-500 line-through'
          }`}>
            <div className="font-semibold text-slate-100">1. Order Value Ranges</div>
            <div className="text-[10px] mt-1 font-mono">{feeSettings.enableRangeFee ? '✓ ENABLED' : '✗ DISABLED'}</div>
          </div>

          <div className={`p-2.5 rounded-lg border flex flex-col justify-between ${
            feeSettings.enableDistanceBasedFee 
              ? 'bg-blue-950/60 border-blue-500/50 text-blue-200' 
              : 'bg-slate-800/50 border-slate-700 text-slate-500 line-through'
          }`}>
            <div className="font-semibold text-slate-100">2. Distance-Based Fee</div>
            <div className="text-[10px] mt-1 font-mono">{feeSettings.enableDistanceBasedFee ? '✓ ENABLED' : '✗ DISABLED'}</div>
          </div>

          <div className={`p-2.5 rounded-lg border flex flex-col justify-between ${
            feeSettings.enablePerKmFee 
              ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200' 
              : 'bg-slate-800/50 border-slate-700 text-slate-500 line-through'
          }`}>
            <div className="font-semibold text-slate-100">3. 1 KM / Per KM Fee</div>
            <div className="text-[10px] mt-1 font-mono">{feeSettings.enablePerKmFee ? '✓ ENABLED' : '✗ DISABLED'}</div>
          </div>

          <div className={`p-2.5 rounded-lg border flex flex-col justify-between ${
            feeSettings.enableZoneFees 
              ? 'bg-teal-950/60 border-teal-500/50 text-teal-200' 
              : 'bg-slate-800/50 border-slate-700 text-slate-500 line-through'
          }`}>
            <div className="font-semibold text-slate-100">4. Zone Fee Override</div>
            <div className="text-[10px] mt-1 font-mono">{feeSettings.enableZoneFees ? '✓ ENABLED' : '✗ DISABLED'}</div>
          </div>

          <div className={`p-2.5 rounded-lg border flex flex-col justify-between ${
            feeSettings.enableDefaultFee 
              ? 'bg-amber-950/60 border-amber-500/50 text-amber-200' 
              : 'bg-slate-800/50 border-slate-700 text-slate-500 line-through'
          }`}>
            <div className="font-semibold text-slate-100">5. Default Fallback Fee</div>
            <div className="text-[10px] mt-1 font-mono">{feeSettings.enableDefaultFee ? '✓ ENABLED' : '✗ DISABLED'}</div>
          </div>
        </div>
      </div>

      {loadingFeeSettings ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-green-600" />
        </div>
      ) : (
        <div className="space-y-6">

          {/* Section 1: Base & 1 KM Delivery Fee */}
          <div className={`bg-white rounded-xl shadow-sm border transition-all ${
            feeSettings.enablePerKmFee ? 'border-slate-200' : 'border-slate-200 opacity-75'
          }`}>
            <div className="p-5 flex items-center justify-between border-b border-slate-100 bg-slate-50/50 rounded-t-xl">
              <div className="flex items-center gap-3">
                <DollarSign className={`w-5 h-5 ${feeSettings.enablePerKmFee ? 'text-green-600' : 'text-slate-400'}`} />
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    1 KM Delivery Fee (Rate per KM)
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                      feeSettings.enablePerKmFee ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {feeSettings.enablePerKmFee ? 'Active' : 'Disabled'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">Standard rate charged per 1 KM distance</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Toggle Switch */}
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={feeSettings.enablePerKmFee}
                    onChange={(e) => setFeeSettings({ ...feeSettings, enablePerKmFee: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                  <span className="ml-2 text-xs font-semibold text-slate-700">
                    {feeSettings.enablePerKmFee ? 'Enabled' : 'Disabled'}
                  </span>
                </label>

                <button
                  onClick={() => toggleSection('baseFee')}
                  className="p-1.5 hover:bg-slate-200/60 rounded-lg text-slate-500 transition-colors"
                >
                  {openSections.baseFee ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {openSections.baseFee && (
              <div className="p-5">
                {!feeSettings.enablePerKmFee && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
                    <Power className="w-4 h-4 text-amber-600 shrink-0" />
                    <strong>Note:</strong> 1 KM Delivery Fee is currently <strong>DISABLED</strong>. This rate won't be charged unless enabled.
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">
                      1 KM Delivery Fee (₹)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-medium">₹</span>
                      <input
                        type="number"
                        value={feeSettings.perKmDeliveryFee}
                        onChange={(e) => setFeeSettings({ ...feeSettings, perKmDeliveryFee: e.target.value })}
                        disabled={!feeSettings.enablePerKmFee}
                        min="0"
                        step="1"
                        className="w-full pl-8 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none disabled:bg-slate-100 disabled:text-slate-400"
                        placeholder="e.g. 15"
                      />
                    </div>
                    <p className="text-xs text-slate-500">Standard fee per 1 KM distance</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Zone-Wise Delivery Fee Settings */}
          <div className={`bg-white rounded-xl shadow-sm border transition-all ${
            feeSettings.enableZoneFees ? 'border-emerald-200' : 'border-slate-200 opacity-75'
          }`}>
            <div className="p-5 flex items-center justify-between border-b border-slate-100 bg-emerald-50/40 rounded-t-xl">
              <div className="flex items-center gap-3">
                <MapPin className={`w-5 h-5 ${feeSettings.enableZoneFees ? 'text-emerald-600' : 'text-slate-400'}`} />
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    Zone-Wise Delivery Fee Settings
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                      feeSettings.enableZoneFees ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {feeSettings.enableZoneFees ? 'Active' : 'Disabled'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">Set specific default delivery fees and 1 KM fees for existing zones created by Admin</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Toggle Switch */}
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={feeSettings.enableZoneFees}
                    onChange={(e) => setFeeSettings({ ...feeSettings, enableZoneFees: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  <span className="ml-2 text-xs font-semibold text-slate-700">
                    {feeSettings.enableZoneFees ? 'Enabled' : 'Disabled'}
                  </span>
                </label>

                <button
                  onClick={() => toggleSection('zoneFee')}
                  className="p-1.5 hover:bg-slate-200/60 rounded-lg text-slate-500 transition-colors"
                >
                  {openSections.zoneFee ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {openSections.zoneFee && (
              <div className="p-5 bg-emerald-50/20">
                {!feeSettings.enableZoneFees && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
                    <Power className="w-4 h-4 text-amber-600 shrink-0" />
                    <strong>Note:</strong> Zone-wise Fee Overrides are <strong>DISABLED</strong>. Orders won't use zone-specific rates unless enabled.
                  </div>
                )}

                {/* Configured Zone Fees Table */}
                {feeSettings.zoneDeliveryFees.length > 0 && (
                  <div className="mb-4 overflow-x-auto">
                    <table className="w-full border border-emerald-200 bg-white rounded-lg overflow-hidden">
                      <thead className="bg-emerald-100/60 text-slate-700">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Zone</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Default Delivery Fee (₹)</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">1 KM Delivery Fee (₹)</th>
                          <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-emerald-100">
                        {feeSettings.zoneDeliveryFees.map((zf, idx) => (
                          <tr key={idx} className="hover:bg-emerald-50/50 transition-colors">
                            <td className="px-4 py-2.5 text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                              <MapPin className="w-4 h-4 text-emerald-600" />
                              {getZoneName(zf.zoneId)}
                            </td>
                            <td className="px-4 py-2.5 text-sm font-medium text-slate-800">
                              {zf.deliveryFee !== undefined && zf.deliveryFee !== '' ? `₹${zf.deliveryFee}` : <span className="text-slate-400 font-normal">Global Default</span>}
                            </td>
                            <td className="px-4 py-2.5 text-sm font-medium text-emerald-700">
                              {zf.perKmDeliveryFee !== undefined && zf.perKmDeliveryFee !== '' ? `₹${zf.perKmDeliveryFee}` : <span className="text-slate-400 font-normal">Global Default</span>}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <button
                                onClick={() => handleDeleteZoneFee(idx)}
                                className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="Delete Zone Fee"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Add/Edit Zone Fee Form */}
                <div className="bg-white p-4 rounded-lg border border-emerald-200">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Select Existing Zone</label>
                      <select
                        value={newZoneFee.zoneId}
                        onChange={(e) => setNewZoneFee({ ...newZoneFee, zoneId: e.target.value })}
                        disabled={!feeSettings.enableZoneFees}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-100"
                      >
                        <option value="">-- Choose Zone --</option>
                        {zones.map((z) => (
                          <option key={z._id} value={z._id}>
                            {z.name || z.zoneName} {z.serviceLocation ? `(${z.serviceLocation})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Default Delivery Fee (₹)</label>
                      <input
                        type="number"
                        value={newZoneFee.deliveryFee}
                        onChange={(e) => setNewZoneFee({ ...newZoneFee, deliveryFee: e.target.value })}
                        disabled={!feeSettings.enableZoneFees}
                        min="0"
                        placeholder="e.g. 40"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-100"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">1 KM Fee (₹)</label>
                      <input
                        type="number"
                        value={newZoneFee.perKmDeliveryFee}
                        onChange={(e) => setNewZoneFee({ ...newZoneFee, perKmDeliveryFee: e.target.value })}
                        disabled={!feeSettings.enableZoneFees}
                        min="0"
                        placeholder="e.g. 20"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-100"
                      />
                    </div>

                    <div className="flex items-end">
                      <Button
                        onClick={handleAddZoneFee}
                        disabled={!feeSettings.enableZoneFees}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm w-full flex items-center justify-center gap-1.5 py-2 disabled:opacity-50"
                      >
                        <Plus className="w-4 h-4" />
                        Save Zone Fee
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Delivery Fee by Order Value Range */}
          <div className={`bg-white rounded-xl shadow-sm border transition-all ${
            feeSettings.enableRangeFee ? 'border-purple-200' : 'border-slate-200 opacity-75'
          }`}>
            <div className="p-5 flex items-center justify-between border-b border-slate-100 bg-purple-50/40 rounded-t-xl">
              <div className="flex items-center gap-3">
                <Sliders className={`w-5 h-5 ${feeSettings.enableRangeFee ? 'text-purple-600' : 'text-slate-400'}`} />
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    Delivery Fee by Order Value Range
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                      feeSettings.enableRangeFee ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {feeSettings.enableRangeFee ? 'Active' : 'Disabled'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">Set order value ranges and assign them to specific admin zones or globally</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Toggle Switch */}
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={feeSettings.enableRangeFee}
                    onChange={(e) => setFeeSettings({ ...feeSettings, enableRangeFee: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                  <span className="ml-2 text-xs font-semibold text-slate-700">
                    {feeSettings.enableRangeFee ? 'Enabled' : 'Disabled'}
                  </span>
                </label>

                <button
                  onClick={() => toggleSection('rangeFee')}
                  className="p-1.5 hover:bg-slate-200/60 rounded-lg text-slate-500 transition-colors"
                >
                  {openSections.rangeFee ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {openSections.rangeFee && (
              <div className="p-5">
                {!feeSettings.enableRangeFee && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
                    <Power className="w-4 h-4 text-amber-600 shrink-0" />
                    <strong>Note:</strong> Order Value Range Fees are <strong>DISABLED</strong>. Range calculations won't apply unless enabled.
                  </div>
                )}

                {/* Ranges Table */}
                {feeSettings.deliveryFeeRanges.length > 0 && (
                  <div className="mb-5 overflow-x-auto">
                    <table className="w-full border border-slate-200 rounded-lg">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Zone</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Min (₹)</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Max (₹)</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Delivery Fee (₹)</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {feeSettings.deliveryFeeRanges
                          .map((range, originalIndex) => ({ range, originalIndex }))
                          .sort((a, b) => a.range.min - b.range.min)
                          .map(({ range, originalIndex }) => {
                            const isEditing = editingRangeIndex === originalIndex;
                            return (
                              <tr key={originalIndex} className={`${isEditing ? 'bg-blue-50/70' : 'hover:bg-slate-50'} transition-colors`}>
                                <td className="px-4 py-3 text-sm text-slate-900 font-medium">
                                  {isEditing ? (
                                    <select
                                      value={newRange.zoneId}
                                      onChange={(e) => setNewRange({ ...newRange, zoneId: e.target.value })}
                                      className="px-2 py-1 text-xs border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                      <option value="">All Zones (Global)</option>
                                      {zones.map((z) => (
                                        <option key={z._id} value={z._id}>
                                          {z.name || z.zoneName}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${
                                      range.zoneId 
                                        ? 'bg-purple-50 text-purple-700 border border-purple-200' 
                                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                                    }`}>
                                      <MapPin className="w-3 h-3 shrink-0" />
                                      {getZoneName(range.zoneId)}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-sm text-slate-900 font-medium">
                                  {isEditing ? (
                                    <div className="flex items-center gap-1">
                                      <span className="text-slate-400">₹</span>
                                      <input
                                        type="number"
                                        value={newRange.min}
                                        onChange={(e) => setNewRange({ ...newRange, min: e.target.value })}
                                        className="w-20 px-2 py-1 text-xs border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                                      />
                                    </div>
                                  ) : (
                                    <>₹{range.min}</>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-sm text-slate-900 font-medium">
                                  {isEditing ? (
                                    <div className="flex items-center gap-1">
                                      <span className="text-slate-400">₹</span>
                                      <input
                                        type="number"
                                        value={newRange.max}
                                        onChange={(e) => setNewRange({ ...newRange, max: e.target.value })}
                                        className="w-20 px-2 py-1 text-xs border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                                      />
                                    </div>
                                  ) : (
                                    <>₹{range.max}</>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-sm font-semibold text-green-600">
                                  {isEditing ? (
                                    <div className="flex items-center gap-1">
                                      <span className="text-slate-400">₹</span>
                                      <input
                                        type="number"
                                        value={newRange.fee}
                                        onChange={(e) => setNewRange({ ...newRange, fee: e.target.value })}
                                        className="w-20 px-2 py-1 text-xs border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-green-600 font-medium"
                                      />
                                    </div>
                                  ) : (
                                    <>₹{range.fee}</>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    {isEditing ? (
                                      <>
                                        <button
                                          onClick={handleSaveEditRange}
                                          className="p-1.5 text-green-600 hover:bg-green-100 rounded transition-colors"
                                          title="Save"
                                        >
                                          <Check className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={handleCancelEdit}
                                          className="p-1.5 text-red-600 hover:bg-red-100 rounded transition-colors"
                                          title="Cancel"
                                        >
                                          <X className="w-4 h-4" />
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <button
                                          onClick={() => handleEditRange(originalIndex)}
                                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                          title="Edit"
                                        >
                                          <Edit className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteRange(originalIndex)}
                                          className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                          title="Delete"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Add New Range Form */}
                {editingRangeIndex === null && (
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <div className="flex items-center gap-2 mb-3">
                      <Plus className="w-4 h-4 text-purple-600" />
                      <h4 className="text-sm font-semibold text-slate-800">Add New Value Range</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Select Zone</label>
                        <select
                          value={newRange.zoneId}
                          onChange={(e) => setNewRange({ ...newRange, zoneId: e.target.value })}
                          disabled={!feeSettings.enableRangeFee}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white disabled:bg-slate-100"
                        >
                          <option value="">All Zones (Global)</option>
                          {zones.map((z) => (
                            <option key={z._id} value={z._id}>
                              {z.name || z.zoneName} {z.serviceLocation ? `(${z.serviceLocation})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Min Order Value (₹)</label>
                        <input
                          type="number"
                          value={newRange.min}
                          onChange={(e) => setNewRange({ ...newRange, min: e.target.value })}
                          disabled={!feeSettings.enableRangeFee}
                          min="0"
                          step="1"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white disabled:bg-slate-100"
                          placeholder="0"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Max Order Value (₹)</label>
                        <input
                          type="number"
                          value={newRange.max}
                          onChange={(e) => setNewRange({ ...newRange, max: e.target.value })}
                          disabled={!feeSettings.enableRangeFee}
                          min="0"
                          step="1"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white disabled:bg-slate-100"
                          placeholder="1000"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Delivery Fee (₹)</label>
                        <input
                          type="number"
                          value={newRange.fee}
                          onChange={(e) => setNewRange({ ...newRange, fee: e.target.value })}
                          disabled={!feeSettings.enableRangeFee}
                          min="0"
                          step="1"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white disabled:bg-slate-100"
                          placeholder="50"
                        />
                      </div>

                      <div className="flex items-end">
                        <Button
                          onClick={handleAddRange}
                          disabled={!feeSettings.enableRangeFee}
                          className="bg-purple-600 hover:bg-purple-700 text-white text-sm w-full flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          <Plus className="w-4 h-4" />
                          Add Range
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 4: Advance Settings (Distance-Based Fee) */}
          <div className={`bg-white rounded-xl shadow-sm border transition-all ${
            feeSettings.enableDistanceBasedFee ? 'border-blue-300' : 'border-slate-200 opacity-75'
          }`}>
            <div className="p-5 flex items-center justify-between border-b border-slate-100 bg-blue-50/40 rounded-t-xl">
              <div className="flex items-center gap-3">
                <Sliders className={`w-5 h-5 ${feeSettings.enableDistanceBasedFee ? 'text-blue-600' : 'text-slate-400'}`} />
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    Advance Settings (Distance-Based Fee Calculation)
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                      feeSettings.enableDistanceBasedFee ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {feeSettings.enableDistanceBasedFee ? 'Active' : 'Disabled'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">Base distance fee and per extra KM rates</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Toggle Switch */}
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={feeSettings.enableDistanceBasedFee}
                    onChange={(e) => setFeeSettings({ ...feeSettings, enableDistanceBasedFee: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  <span className="ml-2 text-xs font-semibold text-slate-700">
                    {feeSettings.enableDistanceBasedFee ? 'Enabled' : 'Disabled'}
                  </span>
                </label>

                <button
                  onClick={() => toggleSection('advanceFee')}
                  className="p-1.5 hover:bg-slate-200/60 rounded-lg text-slate-500 transition-colors"
                >
                  {openSections.advanceFee ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {openSections.advanceFee && (
              <div className="p-5">
                {!feeSettings.enableDistanceBasedFee && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
                    <Power className="w-4 h-4 text-amber-600 shrink-0" />
                    <strong>Note:</strong> Distance-Based Fee System is <strong>DISABLED</strong>.
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">Base Distance (KM)</label>
                    <input
                      type="number"
                      value={feeSettings.baseDistanceKm}
                      onChange={(e) => setFeeSettings({ ...feeSettings, baseDistanceKm: e.target.value })}
                      min="0.1"
                      step="0.5"
                      disabled={!feeSettings.enableDistanceBasedFee}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100 bg-white"
                      placeholder="e.g. 1.0"
                    />
                    <p className="text-[11px] text-slate-500">Distance covered by base fee (e.g. first 1 KM)</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">Base Distance Fee (₹)</label>
                    <input
                      type="number"
                      value={feeSettings.baseDistanceFee}
                      onChange={(e) => setFeeSettings({ ...feeSettings, baseDistanceFee: e.target.value })}
                      min="0"
                      step="1"
                      disabled={!feeSettings.enableDistanceBasedFee}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100 bg-white"
                      placeholder="e.g. 25"
                    />
                    <p className="text-[11px] text-slate-500">Fee charged for base distance</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">Extra Fee Per KM (₹/KM)</label>
                    <input
                      type="number"
                      value={feeSettings.extraFeePerKm}
                      onChange={(e) => setFeeSettings({ ...feeSettings, extraFeePerKm: e.target.value })}
                      min="0"
                      step="1"
                      disabled={!feeSettings.enableDistanceBasedFee}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100 bg-white"
                      placeholder="e.g. 10"
                    />
                    <p className="text-[11px] text-slate-500">Charge per extra KM after base distance</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 5: Default Fallback Delivery Fee, Platform Fee, GST */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">General Charges & Default Fallback Fee</h3>
              <button
                onClick={() => toggleSection('generalFee')}
                className="p-1.5 hover:bg-slate-200/60 rounded-lg text-slate-500 transition-colors"
              >
                {openSections.generalFee ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>

            {openSections.generalFee && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Default Delivery Fee (Fallback) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-semibold text-slate-700">
                      Default Delivery Fee (₹)
                    </label>
                    {/* Toggle Switch */}
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={feeSettings.enableDefaultFee}
                        onChange={(e) => setFeeSettings({ ...feeSettings, enableDefaultFee: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-600"></div>
                    </label>
                  </div>
                  <input
                    type="number"
                    value={feeSettings.deliveryFee}
                    onChange={(e) => setFeeSettings({ ...feeSettings, deliveryFee: e.target.value })}
                    disabled={!feeSettings.enableDefaultFee}
                    min="0"
                    step="1"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none disabled:bg-slate-100 disabled:text-slate-400"
                    placeholder="e.g. 30"
                  />
                  <p className="text-xs text-slate-500">Fallback fee when no other condition matches</p>
                </div>

                {/* Free Delivery Threshold */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Free Delivery Threshold (₹)
                  </label>
                  <input
                    type="number"
                    value={feeSettings.freeDeliveryThreshold}
                    onChange={(e) => setFeeSettings({ ...feeSettings, freeDeliveryThreshold: e.target.value })}
                    min="0"
                    step="1"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                    placeholder="e.g. 149"
                  />
                  <p className="text-xs text-slate-500">Orders at or above get free delivery</p>
                </div>

                {/* Platform Fee */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Platform Fee (₹)
                  </label>
                  <input
                    type="number"
                    value={feeSettings.platformFee}
                    onChange={(e) => setFeeSettings({ ...feeSettings, platformFee: e.target.value })}
                    min="0"
                    step="1"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                    placeholder="e.g. 5"
                  />
                  <p className="text-xs text-slate-500">Platform service fee charged on each order</p>
                </div>

                {/* GST Rate */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    GST Rate (%)
                  </label>
                  <input
                    type="number"
                    value={feeSettings.gstRate}
                    onChange={(e) => setFeeSettings({ ...feeSettings, gstRate: e.target.value })}
                    min="0"
                    max="100"
                    step="0.1"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                    placeholder="e.g. 5"
                  />
                  <p className="text-xs text-slate-500">GST percentage applied on subtotal</p>
                </div>
              </div>
            )}
          </div>

          {/* Section 6: Delivery Partner Incentive Section */}
          <div className="border border-green-200 bg-green-50/20 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-green-600" />
                  Delivery Partner Incentive
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  Extra rider payout when order subtotal meets the threshold
                </p>
              </div>
              <button
                onClick={() => toggleSection('incentiveFee')}
                className="p-1.5 hover:bg-slate-200/60 rounded-lg text-slate-500 transition-colors"
              >
                {openSections.incentiveFee ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>

            {openSections.incentiveFee && (
              <div className="space-y-5">
                <div>
                  <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border transition-all cursor-pointer select-none text-sm font-medium ${
                    feeSettings.isIncentiveEnabled 
                      ? 'border-green-500 bg-green-50 text-green-700' 
                      : 'border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}>
                    <input
                      type="checkbox"
                      checked={feeSettings.isIncentiveEnabled}
                      onChange={(e) => setFeeSettings({ ...feeSettings, isIncentiveEnabled: e.target.checked })}
                      className="w-4 h-4 text-green-600 rounded border-slate-300 focus:ring-green-500 accent-green-600 cursor-pointer"
                    />
                    <span>Enable Incentive</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">
                      Order Amount Threshold (₹)
                    </label>
                    <input
                      type="number"
                      value={feeSettings.incentiveThreshold}
                      onChange={(e) => setFeeSettings({ ...feeSettings, incentiveThreshold: e.target.value })}
                      min="0"
                      step="1"
                      disabled={!feeSettings.isIncentiveEnabled}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none disabled:bg-slate-100 disabled:text-slate-400"
                      placeholder="e.g. 500"
                    />
                    <p className="text-xs text-slate-500">Minimum subtotal value for rider incentive</p>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">
                      Incentive Percentage (%)
                    </label>
                    <input
                      type="number"
                      value={feeSettings.incentivePercentage}
                      onChange={(e) => setFeeSettings({ ...feeSettings, incentivePercentage: e.target.value })}
                      min="0"
                      max="100"
                      step="0.1"
                      disabled={!feeSettings.isIncentiveEnabled}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none disabled:bg-slate-100 disabled:text-slate-400"
                      placeholder="e.g. 10"
                    />
                    <p className="text-xs text-slate-500">Percentage of subtotal given to rider</p>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}
