import { useState, useEffect, useRef } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"
import useDeliveryBackNavigation from "../../hooks/useDeliveryBackNavigation"
import Select from "react-select"
import { State, City } from "country-state-city"
import { deliveryAPI } from "@food/api"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


export default function SignupStep1() {
  const navigate = useNavigate()
  const goBack = useDeliveryBackNavigation()
  const location = useLocation()
  const searchParams = new URLSearchParams(location.search)
  const queryRef = searchParams.get("ref") || ""

  const [formData, setFormData] = useState(() => {
    const saved = sessionStorage.getItem("deliverySignupDetails")
    const base = {
      name: "",
      phone: "",
      countryCode: "+91",
      ref: queryRef,
      email: "",
      address: "",
      city: "",
      state: "",
      vehicleType: "bike",
      vehicleName: "",
      vehicleNumber: "",
      drivingLicenseNumber: "",
      panNumber: "",
      aadharNumber: ""
    }
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        return { ...base, ...parsed, ref: parsed.ref || queryRef }
      } catch (e) {
        debugError("Error parsing saved details:", e)
      }
    }
    return base
  })
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [states, setStates] = useState([])
  const [cities, setCities] = useState([])
  const [vehicleNumberChecking, setVehicleNumberChecking] = useState(false)
  const vehicleNumberCheckRef = useRef(null)
  const [aadharChecking, setAadharChecking] = useState(false)
  const aadharCheckRef = useRef(null)
  const [panChecking, setPanChecking] = useState(false)
  const panCheckRef = useRef(null)
  const [emailChecking, setEmailChecking] = useState(false)
  const emailCheckRef = useRef(null)

  useEffect(() => {
    const IN_STATES = State.getStatesOfCountry("IN")
    setStates(IN_STATES.map(state => ({ label: state.name, value: state.name, isoCode: state.isoCode })))
  }, [])

  useEffect(() => {
    if (formData.state) {
      const selectedState = states.find(s => s.value === formData.state)
      if (selectedState) {
        const stateCities = City.getCitiesOfState("IN", selectedState.isoCode)
        setCities(stateCities.map(city => ({ label: city.name, value: city.name })))
      } else {
        setCities([])
      }
    } else {
      setCities([])
    }
  }, [formData.state, states])

  // Real-time vehicle number uniqueness check with debounce
  useEffect(() => {
    const vehicleNumber = formData.vehicleNumber
    if (!vehicleNumber || formData.vehicleType === "bicycle") return

    // Only check when format is valid
    const isValidFormat = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,2}[0-9]{4}$/.test(vehicleNumber)
    if (!isValidFormat) return

    // Clear any previous timer
    if (vehicleNumberCheckRef.current) {
      clearTimeout(vehicleNumberCheckRef.current)
    }

    setVehicleNumberChecking(true)
    vehicleNumberCheckRef.current = setTimeout(async () => {
      try {
        const res = await deliveryAPI.checkVehicleNumber(vehicleNumber)
        const isRegistered = res?.data?.data?.isRegistered
        if (isRegistered) {
          setErrors(prev => ({ ...prev, vehicleNumber: "This vehicle number is already registered" }))
        } else {
          setErrors(prev => {
            if (prev.vehicleNumber === "This vehicle number is already registered") {
              return { ...prev, vehicleNumber: "" }
            }
            return prev
          })
        }
      } catch {
        // Silently ignore check failures
      } finally {
        setVehicleNumberChecking(false)
      }
    }, 600)

    return () => {
      if (vehicleNumberCheckRef.current) clearTimeout(vehicleNumberCheckRef.current)
    }
  }, [formData.vehicleNumber, formData.vehicleType])

  // Real-time Aadhaar uniqueness check
  useEffect(() => {
    const raw = formData.aadharNumber
    const digits = String(raw || '').replace(/\s/g, '')
    if (digits.length !== 12) return
    if (aadharCheckRef.current) clearTimeout(aadharCheckRef.current)
    setAadharChecking(true)
    aadharCheckRef.current = setTimeout(async () => {
      try {
        const res = await deliveryAPI.checkField('aadhar', digits)
        const isRegistered = res?.data?.data?.isRegistered
        setErrors(prev => ({
          ...prev,
          aadharNumber: isRegistered ? 'This Aadhaar number is already registered' : (prev.aadharNumber === 'This Aadhaar number is already registered' ? '' : prev.aadharNumber)
        }))
      } catch { /* silent */ } finally { setAadharChecking(false) }
    }, 600)
    return () => { if (aadharCheckRef.current) clearTimeout(aadharCheckRef.current) }
  }, [formData.aadharNumber])

  // Real-time PAN uniqueness check
  useEffect(() => {
    const pan = formData.panNumber
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan)) return
    if (panCheckRef.current) clearTimeout(panCheckRef.current)
    setPanChecking(true)
    panCheckRef.current = setTimeout(async () => {
      try {
        const res = await deliveryAPI.checkField('pan', pan)
        const isRegistered = res?.data?.data?.isRegistered
        setErrors(prev => ({
          ...prev,
          panNumber: isRegistered ? 'This PAN number is already registered' : (prev.panNumber === 'This PAN number is already registered' ? '' : prev.panNumber)
        }))
      } catch { /* silent */ } finally { setPanChecking(false) }
    }, 600)
    return () => { if (panCheckRef.current) clearTimeout(panCheckRef.current) }
  }, [formData.panNumber])

  // Real-time email uniqueness check
  useEffect(() => {
    const email = formData.email
    if (!email || !email.includes('@') || !email.includes('.')) return
    if (emailCheckRef.current) clearTimeout(emailCheckRef.current)
    setEmailChecking(true)
    emailCheckRef.current = setTimeout(async () => {
      try {
        const res = await deliveryAPI.checkField('email', email)
        const isRegistered = res?.data?.data?.isRegistered
        setErrors(prev => ({
          ...prev,
          email: isRegistered ? 'This email is already registered' : (prev.email === 'This email is already registered' ? '' : prev.email)
        }))
      } catch { /* silent */ } finally { setEmailChecking(false) }
    }, 600)
    return () => { if (emailCheckRef.current) clearTimeout(emailCheckRef.current) }
  }, [formData.email])

  const [keyboardInset, setKeyboardInset] = useState(0)

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return undefined

    const updateKeyboardInset = () => {
      const viewport = window.visualViewport
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      setKeyboardInset(inset > 0 ? inset : 0)
    }

    updateKeyboardInset()
    window.visualViewport.addEventListener("resize", updateKeyboardInset)
    window.visualViewport.addEventListener("scroll", updateKeyboardInset)

    return () => {
      window.visualViewport.removeEventListener("resize", updateKeyboardInset)
      window.visualViewport.removeEventListener("scroll", updateKeyboardInset)
    }
  }, [])

  useEffect(() => {
    if (keyboardInset > 0) {
      const activeElement = document.activeElement
      if (activeElement && (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA")) {
        setTimeout(() => {
          activeElement.scrollIntoView({ behavior: "smooth", block: "center" })
        }, 150)
      }
    }
  }, [keyboardInset])

  const sanitizeLocationValue = (value) =>
    value.replace(/[^A-Za-z\s.-]/g, "").replace(/\s{2,}/g, " ")

  const sanitizeNameValue = (value) =>
    value.replace(/[^A-Za-z\s]/g, "").replace(/\s{2,}/g, " ")

  const isValidLocationValue = (value) =>
    /^[A-Za-z][A-Za-z\s.-]*[A-Za-z.]$/.test(value.trim())

  const isValidNameValue = (value) =>
    /^[A-Za-z][A-Za-z\s]*[A-Za-z]$/.test(value.trim())

  const isValidEmailValue = (value) => {
    const normalizedValue = value.trim().toLowerCase()
    // General email regex
    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(normalizedValue)) {
      return false
    }

    const [, domain = ""] = normalizedValue.split("@")
    
    // Catch common typos for Gmail
    const gmailTypos = [
      "gnail.com", "gmal.com", "gmaill.com", "gamil.com", "gmial.com", 
      "gmail.co", "gmail.con", "gmail.cm", "g-mail.com"
    ]
    
    if (gmailTypos.includes(domain)) {
      return false
    }

    // If it starts with gmail. but isn't gmail.com (e.g. gmail.in is usually not a thing)
    if (domain.startsWith("gmail.") && domain !== "gmail.com") {
      return false
    }

    return true
  }

  const sanitizeEmailValue = (value) =>
    value.replace(/\s/g, "").toLowerCase()

  // Save data to session storage whenever formData changes
  useEffect(() => {
    sessionStorage.setItem("deliverySignupDetails", JSON.stringify(formData))
  }, [formData])

  const isValidAddressValue = (value) => {
    const trimmed = String(value || "").trim()
    if (!trimmed) return false
    if (/^[^a-zA-Z0-9]+$/.test(trimmed)) return false
    if (/([@#$%\^&*+=_{}\[\]\\|/<>~`])\1{2,}/.test(trimmed)) return false
    return true
  }

  const handleSelectChange = (name, selectedOption) => {
    setFormData(prev => {
      const newData = { ...prev, [name]: selectedOption ? selectedOption.value : "" }
      if (name === "state") {
        newData.city = ""
      }
      return newData
    })
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: "" }))
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    let updatedValue = value

    // Auto-uppercase for Vehicle, DL and PAN numbers and reject special chars
    if (name === "vehicleNumber" || name === "panNumber" || name === "drivingLicenseNumber") {
      updatedValue = value.toUpperCase().replace(/[^A-Z0-9]/g, "")
    }

    if (name === "name") {
      updatedValue = sanitizeNameValue(value)
    }

    if (name === "vehicleNumber") {
      updatedValue = updatedValue.slice(0, 10)
    }

    if (name === "drivingLicenseNumber") {
      updatedValue = updatedValue.slice(0, 16)
    }

    if (name === "panNumber") {
      updatedValue = updatedValue.slice(0, 10)
    }

    // Restrict Aadhaar to numeric only and format as XXXX XXXX XXXX
    if (name === "aadharNumber") {
      const digits = value.replace(/\D/g, "").slice(0, 12)
      updatedValue = digits.replace(/(\d{4})(?=\d)/g, "$1 ")
    }

    if (name === "city" || name === "state") {
      updatedValue = sanitizeLocationValue(value)
    }

    if (name === "email") {
      updatedValue = sanitizeEmailValue(value)
    }

    setFormData(prev => {
      const nextData = {
        ...prev,
        [name]: updatedValue
      }
      // When vehicleType changes, preserve common fields (PAN, Aadhaar) but clear vehicle-specific fields
      if (name === "vehicleType" && updatedValue !== prev.vehicleType) {
        nextData.vehicleName = ""
        nextData.vehicleNumber = ""
        nextData.drivingLicenseNumber = ""
      }
      return nextData
    })

    // Real-time error validations on change
    setErrors(prev => {
      const nextErrors = { ...prev, [name]: "" }
      
      if (name === "email" && updatedValue.trim()) {
        if (!isValidEmailValue(updatedValue)) {
          nextErrors.email = "Enter a valid email address. Gmail must be gmail.com"
        }
      }

      if (name === "address" && updatedValue.trim()) {
        if (!isValidAddressValue(updatedValue)) {
          nextErrors.address = "Address contains invalid symbols or repeated characters"
        }
      }

      if (name === "vehicleNumber" && updatedValue.trim()) {
        if (!/^[A-Z]{2}[0-9]{1,2}[A-Z]{1,2}[0-9]{4}$/.test(updatedValue)) {
          nextErrors.vehicleNumber = "Invalid Indian vehicle number format (e.g., MH12AB1234)"
        }
      }

      if (name === "drivingLicenseNumber" && updatedValue.trim()) {
        if (!/^[A-Z]{2}[0-9]{2}[0-9A-Z]{11,12}$/.test(updatedValue)) {
          nextErrors.drivingLicenseNumber = "Invalid DL format (e.g., MH1220110012345)"
        }
      }

      if (name === "panNumber" && updatedValue.trim()) {
        if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(updatedValue)) {
          nextErrors.panNumber = "Invalid PAN format (e.g., ABCDE1234F)"
        }
      }

      if (name === "vehicleType") {
        nextErrors.vehicleNumber = ""
        nextErrors.drivingLicenseNumber = ""
      }

      return nextErrors
    })
  }

  const validate = () => {
    const newErrors = {}

    if (!formData.name.trim()) {
      newErrors.name = "Name is required"
    } else if (!isValidNameValue(formData.name)) {
      newErrors.name = "Name can contain letters only"
    }

    if (formData.email && !isValidEmailValue(formData.email)) {
      newErrors.email = "Enter a valid email address. Gmail must be gmail.com"
    }

    if (!formData.address.trim()) {
      newErrors.address = "Address is required"
    }

    if (!formData.city.trim()) {
      newErrors.city = "City is required"
    } else if (!isValidLocationValue(formData.city)) {
      newErrors.city = "City can contain letters only"
    }

    if (!formData.state.trim()) {
      newErrors.state = "State is required"
    } else if (!isValidLocationValue(formData.state)) {
      newErrors.state = "State can contain letters only"
    }

    if (formData.vehicleType !== "bicycle") {
      if (!formData.vehicleNumber.trim()) {
        newErrors.vehicleNumber = "Vehicle number is required"
      } else if (!/^[A-Z]{2}[0-9]{1,2}[A-Z]{1,2}[0-9]{4}$/.test(formData.vehicleNumber)) {
        newErrors.vehicleNumber = "Invalid Indian vehicle number format (e.g., MH12AB1234)"
      }

      if (formData.drivingLicenseNumber.trim() && !/^[A-Z]{2}[0-9]{2}[0-9]{4}[0-9]{7}$/.test(formData.drivingLicenseNumber)) {
        newErrors.drivingLicenseNumber = "Invalid DL format (e.g., MH1220110012345)"
      }
    }

    if (!formData.panNumber.trim()) {
      newErrors.panNumber = "PAN number is required"
    } else if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(formData.panNumber.replace(/\s/g, ""))) {
      newErrors.panNumber = "Invalid PAN format (e.g., ABCDE1234F)"
    }

    const aadharClean = formData.aadharNumber.replace(/\s/g, "")
    if (!aadharClean) {
      newErrors.aadharNumber = "Aadhar number is required"
    } else if (!/^\d{12}$/.test(aadharClean)) {
      newErrors.aadharNumber = "Aadhar number must be 12 digits"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!validate()) {
      toast.error("Please fill all required fields correctly")
      return
    }

    setIsSubmitting(true)

    try {
      const details = {
        name: formData.name.trim(),
        phone: String(formData.phone || "").replace(/\D/g, "").slice(0, 15),
        countryCode: formData.countryCode || "+91",
        ref: String(formData.ref || "").trim() || "",
        email: formData.email?.trim() || "",
        address: formData.address.trim(),
        city: formData.city.trim(),
        state: formData.state.trim(),
        vehicleType: formData.vehicleType || "bike",
        vehicleName: formData.vehicleName?.trim() || "",
        vehicleNumber: formData.vehicleType === "bicycle" ? "" : formData.vehicleNumber.trim(),
        drivingLicenseNumber: formData.vehicleType === "bicycle" ? "" : formData.drivingLicenseNumber.trim().toUpperCase(),
        panNumber: formData.panNumber.trim().toUpperCase(),
        aadharNumber: formData.aadharNumber.replace(/\s/g, "")
      }
      sessionStorage.setItem("deliverySignupDetails", JSON.stringify(details))
      toast.success("Details saved")
      navigate("/food/delivery/signup/documents")
    } catch (error) {
      debugError("Error saving details:", error)
      toast.error("Failed to save. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className={`min-h-screen bg-gray-100 ${keyboardInset > 0 ? "overflow-y-auto overflow-x-hidden" : ""}`}
      style={{ paddingBottom: keyboardInset ? `${keyboardInset + 24}px` : undefined }}
    >
      {/* Header */}
      <div className="bg-white px-4 py-3 flex items-center gap-4 border-b border-gray-200">
        <button
          onClick={goBack}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-medium">Complete Your Profile</h1>
      </div>

      {/* Content */}
      <div className="px-4 py-6">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Basic Details</h2>
          <p className="text-sm text-gray-600">Please provide your information to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              inputMode="text"
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${errors.name ? "border-red-500" : "border-gray-300"
                }`}
              placeholder="Enter your full name"
            />
            {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email (Optional)
            </label>
            <div className="relative">
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="email"
                inputMode="email"
                className={`w-full px-4 py-3 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${errors.email ? "border-red-500" : emailChecking ? "border-yellow-400" : (formData.email && formData.email.includes('@') && !errors.email ? "border-green-500" : "border-gray-300")}`}
                placeholder="Enter your email"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                {emailChecking && <svg className="w-4 h-4 text-yellow-500 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>}
                {!emailChecking && errors.email && <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>}
                {!emailChecking && !errors.email && formData.email && formData.email.includes('@') && <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>}
              </div>
            </div>
            {emailChecking && <p className="text-yellow-600 text-xs mt-1">Checking availability...</p>}
            {errors.email && !emailChecking && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Address <span className="text-red-500">*</span>
            </label>
            <textarea
              name="address"
              value={formData.address}
              onChange={handleChange}
              rows={3}
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${errors.address ? "border-red-500" : "border-gray-300"
                }`}
              placeholder="Enter your address"
            />
            {errors.address && <p className="text-red-500 text-sm mt-1">{errors.address}</p>}
          </div>

          {/* State and City */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                State <span className="text-red-500">*</span>
              </label>
              <Select
                options={states}
                value={states.find(s => s.value === formData.state) || null}
                onChange={(option) => handleSelectChange("state", option)}
                placeholder="State"
                isSearchable
                styles={{
                  control: (base, state) => ({
                    ...base,
                    padding: '3px 2px',
                    borderRadius: '0.5rem',
                    borderColor: errors.state ? '#ef4444' : state.isFocused ? '#22c55e' : '#d1d5db',
                    boxShadow: state.isFocused ? '0 0 0 2px rgba(34, 197, 94, 0.5)' : 'none',
                    '&:hover': {
                      borderColor: state.isFocused ? '#22c55e' : '#9ca3af'
                    }
                  })
                }}
              />
              {errors.state && <p className="text-red-500 text-sm mt-1">{errors.state}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                City <span className="text-red-500">*</span>
              </label>
              <Select
                options={cities}
                value={cities.find(c => c.value === formData.city) || null}
                onChange={(option) => handleSelectChange("city", option)}
                placeholder="City"
                isSearchable
                isDisabled={!formData.state}
                styles={{
                  control: (base, state) => ({
                    ...base,
                    padding: '3px 2px',
                    borderRadius: '0.5rem',
                    borderColor: errors.city ? '#ef4444' : state.isFocused ? '#22c55e' : '#d1d5db',
                    boxShadow: state.isFocused ? '0 0 0 2px rgba(34, 197, 94, 0.5)' : 'none',
                    '&:hover': {
                      borderColor: state.isFocused ? '#22c55e' : '#9ca3af'
                    }
                  })
                }}
              />
              {errors.city && <p className="text-red-500 text-sm mt-1">{errors.city}</p>}
            </div>
          </div>

          {/* Vehicle Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vehicle Type <span className="text-red-500">*</span>
            </label>
            <select
              name="vehicleType"
              value={formData.vehicleType}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="bike">Bike</option>
              <option value="scooter">Scooter</option>
              <option value="bicycle">Bicycle</option>
              <option value="car">Car</option>
            </select>
          </div>

          {/* Vehicle Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vehicle Name/Model (Optional)
            </label>
            <input
              type="text"
              name="vehicleName"
              value={formData.vehicleName}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="e.g., Honda Activa"
            />
          </div>

          {formData.vehicleType !== "bicycle" && (
            <>
              {/* Vehicle Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vehicle Number <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    name="vehicleNumber"
                    value={formData.vehicleNumber}
                    onChange={handleChange}
                    maxLength={10}
                    className={`w-full px-4 py-3 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${errors.vehicleNumber ? "border-red-500" : (vehicleNumberChecking ? "border-yellow-400" : (!errors.vehicleNumber && formData.vehicleNumber && /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,2}[0-9]{4}$/.test(formData.vehicleNumber) ? "border-green-500" : "border-gray-300"))
                      }`}
                    placeholder="e.g., MH12AB1234"
                  />
                  {/* Status icon inside input */}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    {vehicleNumberChecking && (
                      <svg className="w-4 h-4 text-yellow-500 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                    )}
                    {!vehicleNumberChecking && errors.vehicleNumber && (
                      <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    )}
                    {!vehicleNumberChecking && !errors.vehicleNumber && formData.vehicleNumber && /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,2}[0-9]{4}$/.test(formData.vehicleNumber) && (
                      <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </div>
                {vehicleNumberChecking && (
                  <p className="text-yellow-600 text-xs mt-1">Checking availability...</p>
                )}
                {errors.vehicleNumber && !vehicleNumberChecking && <p className="text-red-500 text-sm mt-1">{errors.vehicleNumber}</p>}
              </div>

              {/* Driving License Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Driving License Number (Optional)
                </label>
                <input
                  type="text"
                  name="drivingLicenseNumber"
                  value={formData.drivingLicenseNumber}
                  onChange={handleChange}
                  maxLength={16}
                  className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 uppercase ${errors.drivingLicenseNumber ? "border-red-500" : "border-gray-300"
                    }`}
                  placeholder="e.g., MH1220110012345"
                />
                {errors.drivingLicenseNumber && <p className="text-red-500 text-sm mt-1">{errors.drivingLicenseNumber}</p>}
              </div>
            </>
          )}

          {/* PAN Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              PAN Number <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                name="panNumber"
                value={formData.panNumber}
                onChange={handleChange}
                maxLength={10}
                className={`w-full px-4 py-3 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 uppercase ${errors.panNumber ? "border-red-500" : panChecking ? "border-yellow-400" : (formData.panNumber && /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(formData.panNumber) && !errors.panNumber ? "border-green-500" : "border-gray-300")}`}
                placeholder="ABCDE1234F"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                {panChecking && <svg className="w-4 h-4 text-yellow-500 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>}
                {!panChecking && errors.panNumber && <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>}
                {!panChecking && !errors.panNumber && formData.panNumber && /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(formData.panNumber) && <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>}
              </div>
            </div>
            {panChecking && <p className="text-yellow-600 text-xs mt-1">Checking availability...</p>}
            {errors.panNumber && !panChecking && <p className="text-red-500 text-sm mt-1">{errors.panNumber}</p>}
          </div>

          {/* Aadhar Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Aadhar Number <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                name="aadharNumber"
                value={formData.aadharNumber}
                onChange={handleChange}
                maxLength={14}
                inputMode="numeric"
                className={`w-full px-4 py-3 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${errors.aadharNumber ? "border-red-500" : aadharChecking ? "border-yellow-400" : (formData.aadharNumber.replace(/\s/g, '').length === 12 && !errors.aadharNumber ? "border-green-500" : "border-gray-300")}`}
                placeholder="1234 5678 9012"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                {aadharChecking && <svg className="w-4 h-4 text-yellow-500 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>}
                {!aadharChecking && errors.aadharNumber && <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>}
                {!aadharChecking && !errors.aadharNumber && formData.aadharNumber.replace(/\s/g, '').length === 12 && <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>}
              </div>
            </div>
            {aadharChecking && <p className="text-yellow-600 text-xs mt-1">Checking availability...</p>}
            {errors.aadharNumber && !aadharChecking && <p className="text-red-500 text-sm mt-1">{errors.aadharNumber}</p>}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || vehicleNumberChecking || aadharChecking || panChecking || emailChecking}
            className={`w-full py-4 rounded-lg font-bold text-white text-base transition-colors mt-6 ${isSubmitting || vehicleNumberChecking || aadharChecking || panChecking || emailChecking
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-[#00B761] hover:bg-[#00A055]"
              }`}
          >
            {isSubmitting ? "Saving..." : (vehicleNumberChecking || aadharChecking || panChecking || emailChecking) ? "Checking..." : "Continue"}
          </button>
        </form>
      </div>
    </div>
  )
}


