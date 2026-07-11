import { useState, useEffect, useRef } from "react"
import { useNavigate, Link } from "react-router-dom"
import { ArrowLeft, ShieldCheck, Timer, RefreshCw, Phone, ArrowRight, Loader2, ConciergeBell, Soup, Utensils, Home } from "lucide-react"
import { Input } from "@food/components/ui/input"
import { Button } from "@food/components/ui/button"
import { deliveryAPI } from "@food/api"
import { setAuthData as storeAuthData } from "@food/utils/auth"
import { motion } from "framer-motion"
import SuperfastLogo from "@/assets/Logo.webp"
import { loadBusinessSettings, getCachedSettings } from "@common/utils/businessSettings"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { useDeliveryStore } from '@/modules/DeliveryV2/store/useDeliveryStore'
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


export default function DeliveryOTP() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const [otp, setOtp] = useState(["", "", "", ""])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)
  const [authData, setAuthData] = useState(null)
  const [showNameInput, setShowNameInput] = useState(false)
  const [name, setName] = useState("")
  const [nameError, setNameError] = useState("")
  const [verifiedOtp, setVerifiedOtp] = useState("")
  const [pendingMessage, setPendingMessage] = useState("")
  const [isRejected, setIsRejected] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")
  const [deviceToken, setDeviceToken] = useState(null)
  const [activePlatform, setActivePlatform] = useState("web")
  const inputRefs = useRef([])
  const [logoUrl, setLogoUrl] = useState(() => getCachedSettings()?.portals?.delivery?.logo?.url || getCachedSettings()?.logo?.url || null)
  const [keyboardInset, setKeyboardInset] = useState(0)

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settings = await loadBusinessSettings()
        if (settings?.portals?.delivery?.logo?.url) {
          setLogoUrl(settings.portals.delivery.logo.url)
        } else if (settings?.logo?.url) {
          setLogoUrl(settings.logo.url)
        }
      } catch (e) {}
    }
    fetchSettings()
  }, [])

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
    // Get auth data from sessionStorage (delivery module key)
    const stored = sessionStorage.getItem("deliveryAuthData")
    if (stored) {
      const data = JSON.parse(stored)
      setAuthData(data)
    } else {
      // No active OTP flow: if already authenticated, go to delivery home
      const token = localStorage.getItem("delivery_accessToken")
      const authenticated = localStorage.getItem("delivery_authenticated") === "true"
      if (token && authenticated) {
        try {
          const parts = token.split('.')
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
            const now = Math.floor(Date.now() / 1000)
            if (payload.exp && payload.exp > now) {
              navigate("/food/delivery", { replace: true })
              return
            }
          }
        } catch (e) {
          // Ignore token parse errors and continue to sign-in redirect
        }
      }

      // No auth data, redirect to sign in
      navigate("/food/delivery/login", { replace: true })
      return
    }

    // OTP field should be empty - delivery boy needs to enter it manually
    // No auto-fill for delivery OTP

    // Start resend timer (60 seconds)
    setResendTimer(60)
    const timer = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Don't auto-focus - let user manually enter OTP
    // Focus first input only if all fields are empty (small delay to ensure inputs are rendered)
    if (inputRefs.current[0] && otp.every(digit => digit === "")) {
      setTimeout(() => {
        inputRefs.current[0]?.focus()
      }, 100)
    }
  }, [otp])

  const handleChange = (index, value) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) {
      return
    }

    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)
    setError("")

    // Auto-focus next input
    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus()
    }

    // No auto-submit, user must click Verify & Continue
  }

  const handleKeyDown = (index, e) => {
    // Handle backspace
    if (e.key === "Backspace") {
      if (otp[index]) {
        // If current input has value, clear it
        const newOtp = [...otp]
        newOtp[index] = ""
        setOtp(newOtp)
      } else if (index > 0) {
        // If current input is empty, move to previous and clear it
        inputRefs.current[index - 1]?.focus()
        const newOtp = [...otp]
        newOtp[index - 1] = ""
        setOtp(newOtp)
      }
    }
    // Handle paste
    if (e.key === "v" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      navigator.clipboard.readText().then((text) => {
        const digits = text.replace(/\D/g, "").slice(0, 4).split("")
        const newOtp = [...otp]
        digits.forEach((digit, i) => {
          if (i < 4) {
            newOtp[i] = digit
          }
        })
        setOtp(newOtp)
        inputRefs.current[Math.min(digits.length, 3)]?.focus()
      })
    }
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData("text")
    const digits = pastedData.replace(/\D/g, "").slice(0, 4).split("")
    const newOtp = [...otp]
    digits.forEach((digit, i) => {
      if (i < 4) {
        newOtp[i] = digit
      }
    })
    setOtp(newOtp)
    inputRefs.current[Math.min(digits.length, 3)]?.focus()
  }

  const handleVerify = async (otpValue = null) => {
    if (showNameInput) {
      // In name collection step, ignore OTP auto-submit
      return
    }

    const code = otpValue || otp.join("")

    if (code.length !== 4) {
      return
    }

    setIsLoading(true)
    setError("")

    try {
      const phone = authData?.phone
      const purpose = authData?.purpose || "login"
      const providedName = authData?.isSignUp ? authData?.name || null : null
      if (!phone) {
        setError("Phone number not found. Please try again.")
        setIsLoading(false)
        return
      }

      // Try to get FCM token before verifying OTP
      let fcmToken = null;
      let platform = "web";
      try {
        if (typeof window !== "undefined") {
          if (window.flutter_inappwebview) {
            platform = "mobile";
            const handlerNames = ["getFcmToken", "getFCMToken", "getPushToken", "getFirebaseToken"];
            for (const handlerName of handlerNames) {
              try {
                const t = await window.flutter_inappwebview.callHandler(handlerName, { module: "delivery" });
                if (t && typeof t === "string" && t.length > 20) {
                  fcmToken = t.trim();
                  break;
                }
              } catch (e) {}
            }
          } else {
            fcmToken = localStorage.getItem("fcm_web_registered_token_delivery") || null;
          }
        }
      } catch (e) {
        debugWarn("Failed to get FCM token during login", e);
      }

      setDeviceToken(fcmToken);
      setActivePlatform(platform);

      // Backend: POST /auth/delivery/verify-otp returns either:
      // - { needsRegistration: true } when no partner exists yet
      // - or { accessToken, refreshToken, user } for existing partners
      const response = await deliveryAPI.verifyOTP(phone, code, purpose, providedName, fcmToken, platform)
      debugLog("Delivery OTP Response:", response)
      const data = response?.data?.data || response?.data || {}
      debugLog("Parsed Delivery OTP Data:", data)

      if (data.pendingApproval === true) {
        sessionStorage.removeItem("deliveryAuthData")
        setIsLoading(false)
        setError("")
        setPendingMessage(data.message || "Your account is pending admin verification. You will be notified once approved.")
        setIsRejected(data.isRejected || false)
        setRejectionReason(data.rejectionReason || "")
        return
      }

      const needsRegistration = data.needsRegistration === true

      if (needsRegistration) {
        // No DB record yet; redirect to registration details page WITHOUT creating anything in DB.
        const existingDetailsRaw = sessionStorage.getItem("deliverySignupDetails")
        let existingDetails = {}
        try {
          if (existingDetailsRaw) {
            existingDetails = JSON.parse(existingDetailsRaw)
          }
        } catch (e) {
          debugError("Error parsing existing signup details:", e)
        }

        sessionStorage.removeItem("deliveryAuthData")
        sessionStorage.setItem("deliveryNeedsRegistration", "true")
        const digits = String(phone || "").replace(/\D/g, "")
        const details = {
          ...existingDetails,
          name: existingDetails.name || "",
          phone: digits.slice(-10),
          countryCode: "+91",
        }
        sessionStorage.setItem("deliverySignupDetails", JSON.stringify(details))
        setIsLoading(false)
        navigate("/food/delivery/signup/details", { replace: true })
        return
      }

      const accessToken = data.accessToken
      const refreshToken = data.refreshToken || null
      const user = data.user

      if (!accessToken || !user) {
        throw new Error("Invalid response from server")
      }

      sessionStorage.removeItem("deliveryAuthData")

      try {
        debugLog("Storing auth data for delivery:", { hasToken: !!accessToken, hasUser: !!user })
        storeAuthData("delivery", accessToken, user, refreshToken)
        
        // Force online state on successful login
        useDeliveryStore.getState().setOnline(true)
        localStorage.setItem("app:isOnline", "true")

        debugLog("Auth data stored successfully")
      } catch (storageError) {
        debugError("Failed to store authentication data:", storageError)
        setError("Failed to save authentication. Please try again or clear your browser storage.")
        setIsLoading(false)
        return
      }

      window.dispatchEvent(new Event("deliveryAuthChanged"))

      setSuccess(true)
      setIsLoading(false)

      let retryCount = 0
      const maxRetries = 10
      const verifyAndNavigate = () => {
        const storedToken = localStorage.getItem("delivery_accessToken")
        const storedAuth = localStorage.getItem("delivery_authenticated")

        if (storedToken && storedAuth === "true") {
          navigate("/food/delivery", { replace: true })
        } else if (retryCount < maxRetries) {
          retryCount++
          setTimeout(verifyAndNavigate, 100)
        } else {
          setError("Failed to save authentication. Please try again.")
          setIsLoading(false)
        }
      }
      setTimeout(verifyAndNavigate, 200)
    } catch (err) {
      debugError("OTP Verification Error:", err)
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to verify OTP. Please try again."
      setError(message)
      setIsLoading(false)
    }
  }

  const handleSubmitName = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setNameError("Name is required")
      return
    }

    if (!verifiedOtp) {
      setError("OTP verification step missing. Please request a new OTP.")
      return
    }

    setIsLoading(true)
    setError("")
    setNameError("")

    try {
      const phone = authData?.phone
      const purpose = authData?.purpose || "login"
      if (!phone) {
        setError("Phone number not found. Please try again.")
        return
      }

      // Second call with name to auto-register and login
      const response = await deliveryAPI.verifyOTP(phone, verifiedOtp, purpose, trimmedName, deviceToken, activePlatform)
      const data = response?.data?.data || response?.data || {}

      const accessToken = data.accessToken
      const refreshToken = data.refreshToken || null
      const user = data.user

      if (!accessToken || !user) {
        throw new Error("Invalid response from server")
      }

      // Clear auth data from sessionStorage
      sessionStorage.removeItem("deliveryAuthData")

      // Store auth data using utility function to ensure proper role handling
      // The setAuthData function includes error handling and verification
      try {
        debugLog("Storing auth data for delivery (with name):", { hasToken: !!accessToken, hasUser: !!user })
        storeAuthData("delivery", accessToken, user, refreshToken)
        
        // Force online state on successful login
        useDeliveryStore.getState().setOnline(true)
        localStorage.setItem("app:isOnline", "true")

        debugLog("Auth data stored successfully")
      } catch (storageError) {
        debugError("Failed to store authentication data:", storageError)
        setError("Failed to save authentication. Please try again or clear your browser storage.")
        setIsLoading(false)
        return
      }

      // Dispatch custom event for same-tab updates
      window.dispatchEvent(new Event("deliveryAuthChanged"))

      setSuccess(true)
      setIsLoading(false)

      // Verify token is stored and then navigate
      let retryCount = 0
      const maxRetries = 10
      const verifyAndNavigate = () => {
        const storedToken = localStorage.getItem("delivery_accessToken")
        const storedAuth = localStorage.getItem("delivery_authenticated")

        debugLog("Verifying token storage (with name):", { hasToken: !!storedToken, authenticated: storedAuth, retryCount })

        if (storedToken && storedAuth === "true") {
          // Token is stored, navigate to delivery home
          debugLog("Token verified, navigating to /delivery")
          navigate("/food/delivery", { replace: true })
        } else if (retryCount < maxRetries) {
          // Token not stored yet, retry after short delay
          retryCount++
          setTimeout(verifyAndNavigate, 100)
        } else {
          // Max retries reached, show error
          debugError("Token storage verification failed after max retries")
          setError("Failed to save authentication. Please try again.")
          setIsLoading(false)
        }
      }

      // Start verification after a small delay
      setTimeout(verifyAndNavigate, 200)
    } catch (err) {
      debugError("Name Submission Error:", err)
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to complete registration. Please try again."
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendTimer > 0) return

    setIsLoading(true)
    setError("")

    try {
      const phone = authData?.phone
      const purpose = authData?.purpose || "login"
      if (!phone) {
        setError("Phone number not found. Please go back and try again.")
        return
      }

      // Call backend to resend OTP
      await deliveryAPI.sendOTP(phone, purpose)
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to resend OTP. Please try again."
      setError(message)
    } finally {
      setIsLoading(false)
    }

    // Reset timer to 60 seconds
    setResendTimer(60)
    const timer = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    setOtp(["", "", "", ""])
    setShowNameInput(false)
    setName("")
    setNameError("")
    setVerifiedOtp("")
    inputRefs.current[0]?.focus()
  }

  const getPhoneNumber = () => {
    if (!authData) return ""
    if (authData.method === "phone") {
      // Format phone number as +91-9098569620
      const phone = authData.phone || ""
      // Remove spaces and format
      const cleaned = phone.replace(/\s/g, "")
      // Add hyphen after country code if not present
      if (cleaned.startsWith("+91") && cleaned.length > 3) {
        return cleaned.slice(0, 3) + "-" + cleaned.slice(3)
      }
      return cleaned
    }
    return authData.email || ""
  }

  if (!authData) {
    return null
  }

  return (
    <div
      className="h-[100dvh] bg-[#fafafa] flex flex-col relative font-sans overflow-hidden"
      style={{ paddingBottom: keyboardInset ? `${keyboardInset + 24}px` : undefined }}
    >
      {/* Top Blue Section */}
      <div className="w-full flex flex-col shrink-0 z-10 drop-shadow-md">
        <div className="w-full relative overflow-hidden bg-[#005b96] pb-4">
          {/* Back Button */}
          <button
            onClick={() => navigate("/food/delivery/login", { replace: true })}
            className="absolute top-6 left-6 p-2 bg-white/20 hover:bg-white/30 text-white rounded-full transition-all duration-200 z-20 backdrop-blur-md"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {/* Abstract wavy background layers */}
          <div className="absolute inset-0 z-0">
             {/* Darker blue gradient in the corners */}
             <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-bl from-[#004b7c] via-transparent to-transparent opacity-80" />
             <div className="absolute bottom-0 left-0 w-full h-full bg-gradient-to-tr from-[#004b7c] via-transparent to-transparent opacity-80" />
             
             {/* Dotted pattern top left */}
             <div className="absolute -top-10 -left-10 w-40 h-40 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, white 2px, transparent 2px)', backgroundSize: '12px 12px' }} />

             {/* Curved shape top right */}
             <div className="absolute -top-20 -right-10 w-64 h-64 bg-[#0074bf] rounded-full blur-2xl opacity-40" />
             {/* Curved shape bottom left */}
             <div className="absolute -bottom-10 -left-20 w-80 h-80 bg-[#0074bf] rounded-full blur-3xl opacity-40" />
          </div>

          {/* Background Icons */}
          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-20">
            <motion.div
              animate={{ y: [0, -10, 0], rotate: [-12, -8, -12] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="absolute top-6 left-8"
            >
              <ConciergeBell className="w-16 h-16" strokeWidth={1} />
            </motion.div>
            <motion.div
              animate={{ y: [0, 8, 0], rotate: [12, 16, 12] }}
              transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
              className="absolute top-6 right-8"
            >
              <Soup className="w-12 h-12" strokeWidth={1} />
            </motion.div>
            <motion.div
              animate={{ y: [0, -8, 0], rotate: [-12, -16, -12] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
              className="absolute bottom-10 left-8"
            >
              <Utensils className="w-12 h-12" strokeWidth={1} />
            </motion.div>
            <motion.div
              animate={{ y: [0, 6, 0], rotate: [0, 4, 0] }}
              transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
              className="absolute bottom-10 right-8"
            >
              <Home className="w-12 h-12" strokeWidth={1} />
            </motion.div>
          </div>

          <div className="relative z-10 flex flex-col items-center pt-8 pb-10 px-6 text-center text-white">
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              className="w-24 h-24 md:w-28 md:h-28 bg-white rounded-full flex items-center justify-center mb-3 shadow-2xl overflow-hidden border-[2px] border-[#005b96] ring-[4px] ring-white"
            >
              <img src={logoUrl || SuperfastLogo} alt="Logo" className="w-full h-full object-cover rounded-full" />
            </motion.div>
            
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-2 uppercase">
              {companyName}
            </h1>
            <div className="flex items-center gap-2 justify-center">
               <div className="h-[1px] w-6 md:w-8 bg-white/70" />
               <p className="text-[12px] md:text-[14px] font-bold tracking-[0.1em] uppercase whitespace-nowrap">
                 Delivery Partner Portal
               </p>
               <div className="h-[1px] w-6 md:w-8 bg-white/70" />
            </div>
            <div className="h-1 w-8 bg-white rounded-full mt-2" />
          </div>
        </div>

        {/* Wave SVG directly below the blue section */}
        <div className="w-full overflow-hidden leading-[0] -mt-0.5">
          <svg viewBox="0 0 1440 100" preserveAspectRatio="none" className="w-full h-[40px] md:h-[60px] block">
            <path d="M0,0 L1440,0 L1440,40 C1200,10 960,10 720,40 C480,80 240,80 0,40 Z" fill="#005b96" />
          </svg>
        </div>
      </div>

      <div className="flex-1 max-w-[420px] mx-auto w-full px-4 flex flex-col mt-16 md:mt-20 relative z-20 pb-4 h-full overflow-y-auto">
        {/* Main Card */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] border border-gray-100 shrink-0 mb-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* Pending approval message */}
          {pendingMessage ? (
            <div className={`rounded-xl border p-5 text-center space-y-4 shadow-sm ${isRejected ? "bg-red-50 border-red-100" : "bg-amber-50 border-amber-100"}`}>
              <div className="space-y-2">
                <p className={`text-sm font-semibold ${isRejected ? "text-red-800" : "text-amber-800"}`}>
                  {isRejected ? "Application Rejected" : "Pending Verification"}
                </p>
                <p className={`text-sm leading-relaxed ${isRejected ? "text-red-700" : "text-amber-700"}`}>
                  {pendingMessage}
                </p>
                {isRejected && rejectionReason && (
                  <div className="mt-2 p-3 bg-white/50 rounded-lg border border-red-200">
                    <p className="text-xs font-medium text-red-600 uppercase tracking-wider mb-1">Reason</p>
                    <p className="text-sm text-red-800 italic">"{rejectionReason}"</p>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 pt-2">
                {isRejected && (
                  <button
                    type="button"
                    onClick={() => {
                      const phone = authData?.phone
                      const digits = String(phone || "").replace(/\D/g, "")
                      sessionStorage.setItem("deliveryNeedsRegistration", "true")
                      const details = {
                        name: "",
                        phone: digits.slice(-10),
                        countryCode: "+91",
                      }
                      sessionStorage.setItem("deliverySignupDetails", JSON.stringify(details))
                      navigate("/food/delivery/signup/details", { replace: true })
                    }}
                    className="w-full py-3 bg-red-600 text-white rounded-lg font-bold text-sm hover:bg-red-700 shadow-md transition-all active:scale-95"
                  >
                    Re-apply Now
                  </button>
                )}
                
                <button
                  type="button"
                  onClick={() => navigate("/food/delivery/login", { replace: true })}
                  className={`text-sm font-medium underline transition-colors ${isRejected ? "text-red-600 hover:text-red-800" : "text-amber-700 hover:text-amber-900"}`}
                >
                  Back to Login
                </button>
              </div>
            </div>
          ) : showNameInput ? (
            /* Name Input Step */
            <>
              <div className="text-center mb-5">
                <div className="flex items-center justify-center gap-3 mb-1.5">
                   <div className="relative w-5 h-5">
                     <div className="absolute top-1 right-0 w-2.5 h-0.5 bg-[#005b96] transform rotate-45" />
                     <div className="absolute top-2.5 right-0 w-3 h-0.5 bg-[#005b96]" />
                     <div className="absolute top-4 right-0 w-2.5 h-0.5 bg-[#005b96] transform -rotate-45" />
                   </div>
                   <h2 className="text-2xl font-black text-[#1c1c1c]">Full Name</h2>
                   <div className="relative w-5 h-5">
                     <div className="absolute top-1 left-0 w-2.5 h-0.5 bg-[#005b96] transform -rotate-45" />
                     <div className="absolute top-2.5 left-0 w-3 h-0.5 bg-[#005b96]" />
                     <div className="absolute top-4 left-0 w-2.5 h-0.5 bg-[#005b96] transform rotate-45" />
                   </div>
                </div>
                <p className="text-sm text-gray-500 font-medium">Please enter your name to complete registration</p>
                <div className="h-1 w-8 bg-[#005b96] mx-auto mt-2 rounded-full" />
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <Input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value)
                      if (nameError) setNameError("")
                    }}
                    disabled={isLoading}
                    placeholder="Enter your name"
                    className={`h-11 border ${nameError ? "border-red-500" : "border-gray-300"}`}
                  />
                  {nameError && (
                    <p className="text-xs text-red-500 text-left px-1 font-semibold mt-1">
                      {nameError}
                    </p>
                  )}
                </div>

                {error && (
                  <p className="text-xs text-red-500 text-center font-semibold animate-pulse">{error}</p>
                )}

                <Button
                  onClick={handleSubmitName}
                  disabled={isLoading || !name.trim()}
                  className={`w-full py-3 rounded-xl font-bold text-base transition-all flex items-center justify-center gap-2 ${
                    !isLoading && name.trim()
                    ? "bg-[#005b96] hover:bg-[#004b7c] text-white shadow-lg shadow-[#005b96]/30 active:scale-[0.98]"
                    : "bg-gray-100 cursor-not-allowed opacity-50 text-gray-400 shadow-none"
                  }`}
                >
                  {isLoading ? "Continuing..." : "Continue"}
                </Button>
              </div>
            </>
          ) : (
            /* OTP Input Step */
            <>
              <div className="text-center mb-5">
                <div className="flex items-center justify-center gap-3 mb-1.5">
                   <div className="relative w-5 h-5">
                     <div className="absolute top-1 right-0 w-2.5 h-0.5 bg-[#005b96] transform rotate-45" />
                     <div className="absolute top-2.5 right-0 w-3 h-0.5 bg-[#005b96]" />
                     <div className="absolute top-4 right-0 w-2.5 h-0.5 bg-[#005b96] transform -rotate-45" />
                   </div>
                   <h2 className="text-2xl font-black text-[#1c1c1c]">Verify OTP</h2>
                   <div className="relative w-5 h-5">
                     <div className="absolute top-1 left-0 w-2.5 h-0.5 bg-[#005b96] transform -rotate-45" />
                     <div className="absolute top-2.5 left-0 w-3 h-0.5 bg-[#005b96]" />
                     <div className="absolute top-4 left-0 w-2.5 h-0.5 bg-[#005b96] transform rotate-45" />
                   </div>
                </div>
                <p className="text-sm text-gray-500 font-medium">
                  Sent to <span className="text-[#005b96] font-bold">{getPhoneNumber()}</span>
                </p>
                <div className="h-1 w-8 bg-[#005b96] mx-auto mt-2 rounded-full" />
              </div>

              <div className="space-y-6">
                <div className="flex justify-center gap-3">
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => (inputRefs.current[index] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      onPaste={index === 0 ? handlePaste : undefined}
                      disabled={isLoading}
                      autoComplete="off"
                      className={`w-12 h-14 sm:w-14 sm:h-16 bg-slate-50 border-2 rounded-2xl text-center text-2xl font-bold text-slate-900 focus:outline-none transition-all duration-300 border-gray-200`}
                    />
                  ))}
                </div>

                {error && (
                  <p className="text-[10px] font-semibold text-red-500 text-center px-1 animate-pulse">
                    {error}
                  </p>
                )}

                <div className="space-y-4">
                  {/* Auto-verify loader / fallback button */}
                  <Button
                    onClick={() => handleVerify()}
                    disabled={isLoading || otp.some(d => !d)}
                    className={`w-full py-3 rounded-xl font-bold text-base transition-all flex items-center justify-center gap-2 ${
                      !isLoading && otp.every(d => d)
                        ? "bg-[#005b96] hover:bg-[#004b7c] text-white shadow-lg shadow-[#005b96]/30 active:scale-[0.98]"
                        : "bg-gray-100 cursor-not-allowed opacity-50 text-gray-400 shadow-none"
                    }`}
                  >
                    {isLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" />
                    ) : (
                      <>
                        Verify & Continue
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>

                  <div className="text-center space-y-1">
                    <p className="text-xs text-slate-400 font-medium">
                      Didn't get the OTP?
                    </p>
                    {resendTimer > 0 ? (
                      <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                        Resend SMS in <span className="font-bold text-gray-900">{resendTimer}s</span>
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResend}
                        disabled={isLoading}
                        className="text-xs text-[#005b96] font-bold tracking-wider uppercase hover:underline disabled:opacity-50"
                      >
                        Resend SMS
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="pb-8 text-center mt-auto">
          <p className="text-[10px] font-black text-slate-300 tracking-[0.2em] uppercase">
            &copy; {new Date().getFullYear()} {companyName.toUpperCase()} DELIVERY PARTNER
          </p>
      </div>
    </div>
  )
}

