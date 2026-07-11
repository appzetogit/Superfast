import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, ShieldCheck, Timer, RefreshCw, Phone, ArrowRight, Loader2, ConciergeBell, Soup, Utensils, Home } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { restaurantAPI } from "@food/api"
import {
  setAuthData as setRestaurantAuthData,
  setRestaurantPendingPhone,
} from "@food/utils/auth"
import { checkOnboardingStatus, isRestaurantOnboardingComplete } from "@food/utils/onboardingUtils"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { motion } from "framer-motion"
import SuperfastLogo from "@/assets/Logo.webp"
import { loadBusinessSettings, getCachedSettings } from "@common/utils/businessSettings"

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

export default function RestaurantOTP() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const [otp, setOtp] = useState(["", "", "", ""])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [resendTimer, setResendTimer] = useState(0)
  const [authData, setAuthData] = useState(null)
  const [contactInfo, setContactInfo] = useState("") 
  const [focusedIndex, setFocusedIndex] = useState(null)
  const [keyboardOffset, setKeyboardOffset] = useState(0)
  const inputRefs = useRef([])
  const hasSubmittedRef = useRef(false)
  const otpSectionRef = useRef(null)
  const [logoUrl, setLogoUrl] = useState(() => getCachedSettings()?.portals?.restaurant?.logo?.url || getCachedSettings()?.logo?.url || null)

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settings = await loadBusinessSettings()
        if (settings?.portals?.restaurant?.logo?.url) {
          setLogoUrl(settings.portals.restaurant.logo.url)
        } else if (settings?.logo?.url) {
          setLogoUrl(settings.logo.url)
        }
      } catch (e) {}
    }
    fetchSettings()
  }, [])

  useEffect(() => {
    const stored = sessionStorage.getItem("restaurantAuthData")
    if (stored) {
      const data = JSON.parse(stored)
      setAuthData(data)

      if (data.method === "email" && data.email) {
        setContactInfo(data.email)
      } else if (data.phone) {
        const phoneMatch = data.phone?.match(/(\+\d+)\s*(.+)/)
        if (phoneMatch) {
          const formattedPhone = `${phoneMatch[1]} ${phoneMatch[2].replace(/\D/g, "")}`
          setContactInfo(formattedPhone)
        } else {
          setContactInfo(data.phone || "")
        }
      }
    } else {
      navigate("/food/restaurant/login")
      return
    }

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
  }, [navigate])

  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus()
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    const viewport = window.visualViewport
    if (!viewport) return

    const updateKeyboardState = () => {
      const keyboardHeight = Math.max(0, window.innerHeight - viewport.height)
      setKeyboardOffset(keyboardHeight > 120 ? keyboardHeight : 0)
    }

    updateKeyboardState()
    viewport.addEventListener("resize", updateKeyboardState)
    viewport.addEventListener("scroll", updateKeyboardState)

    return () => {
      viewport.removeEventListener("resize", updateKeyboardState)
      viewport.removeEventListener("scroll", updateKeyboardState)
    }
  }, [])

  useEffect(() => {
    if (focusedIndex == null) return

    const targetInput = inputRefs.current[focusedIndex]
    if (!targetInput) return

    const id = window.setTimeout(() => {
      try {
        targetInput.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        })
        otpSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        })
      } catch {
        // no-op
      }
    }, 120)

    return () => window.clearTimeout(id)
  }, [focusedIndex, keyboardOffset])

  const handleChange = (index, value) => {
    if (value && !/^\d$/.test(value)) {
      return
    }

    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)
    setError("")

    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      if (otp[index]) {
        const newOtp = [...otp]
        newOtp[index] = ""
        setOtp(newOtp)
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus()
        const newOtp = [...otp]
        newOtp[index - 1] = ""
        setOtp(newOtp)
      }
    }
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

  const handlePaste = (index, e) => {
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
    const code = otpValue || otp.join("")

    if (hasSubmittedRef.current && !otpValue) {
      return
    }

    if (code.length !== 4) {
      setError("Please enter the complete 4-digit code")
      hasSubmittedRef.current = false
      return
    }

    setIsLoading(true)
    setError("")

    try {
      if (!authData) {
        throw new Error("Session expired. Please try logging in again.")
      }

      const phone = authData.method === "phone" ? authData.phone : null
      const email = authData.method === "email" ? authData.email : null
      const purpose = authData.isSignUp ? "register" : "login"

      const response = await restaurantAPI.verifyOTP(phone, code, purpose, null, email)
      const data = response?.data?.data || response?.data

      const needsRegistration = data?.needsRegistration === true
      const normalizedPhone = data?.phone || phone

      if (needsRegistration) {
        setRestaurantPendingPhone(normalizedPhone)
        sessionStorage.removeItem("restaurantAuthData")
        sessionStorage.removeItem("restaurantLoginPhone")
        navigate("/food/restaurant/onboarding", { replace: true })
        return
      }

      const accessToken = data?.accessToken
      const refreshToken = data?.refreshToken ?? null
      const restaurant = data?.user ?? data?.restaurant

      if (accessToken && restaurant) {
        setRestaurantAuthData("restaurant", accessToken, restaurant, refreshToken)
        window.dispatchEvent(new Event("restaurantAuthChanged"))
        sessionStorage.removeItem("restaurantAuthData")
        sessionStorage.removeItem("restaurantLoginPhone")

        setTimeout(async () => {
          if (authData?.isSignUp) {
            navigate("/food/restaurant/onboarding", { replace: true })
          } else {
            try {
              const onboardingComplete = isRestaurantOnboardingComplete(restaurant)
              if (!onboardingComplete) {
                const incompleteStep = await checkOnboardingStatus()
                if (incompleteStep) {
                  navigate(`/food/restaurant/onboarding?step=${incompleteStep}`, { replace: true })
                  return
                }
              }
              navigate("/food/restaurant", { replace: true })
            } catch (err) {
              navigate("/food/restaurant", { replace: true })
            }
          }
        }, 500)
      }
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Invalid OTP. Please try again."

      if (/pending approval/i.test(message)) {
        const pendingPhone = authData?.phone || authData?.email || contactInfo
        if (pendingPhone) {
          setRestaurantPendingPhone(pendingPhone)
        }
        sessionStorage.removeItem("restaurantAuthData")
        sessionStorage.removeItem("restaurantLoginPhone")
        navigate("/food/restaurant/pending-verification", {
          replace: true,
          state: { phone: pendingPhone || "" },
        })
        return
      }

      setError(message)
      setOtp(["", "", "", ""])
      hasSubmittedRef.current = false
      inputRefs.current[0]?.focus()
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendTimer > 0) return

    setIsLoading(true)
    setError("")

    try {
      if (!authData) {
        throw new Error("Session expired. Please go back and try again.")
      }

      const purpose = authData.isSignUp ? "register" : "login"
      const phone = authData.method === "phone" ? authData.phone : null
      const email = authData.method === "email" ? authData.email : null

      await restaurantAPI.sendOTP(phone, purpose, email)
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to resend OTP. Please try again."
      setError(message)
    }

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

    setIsLoading(false)
    setOtp(["", "", "", ""])
    inputRefs.current[0]?.focus()
  }

  const isOtpComplete = otp.every((digit) => digit !== "")

  if (!authData) {
    return null
  }

  return (
    <div
      className={`h-[100dvh] bg-[#fafafa] flex flex-col relative font-sans ${keyboardOffset > 0 ? "overflow-y-auto overflow-x-hidden" : "overflow-hidden"}`}
      style={keyboardOffset > 0 ? { paddingBottom: `${Math.min(keyboardOffset, 360)}px` } : undefined}
    >
      {/* Top Green Section */}
      <div className="w-full flex flex-col shrink-0 z-10 drop-shadow-md">
        <div className="w-full relative overflow-hidden bg-[#49AB14] pb-4">
          {/* Back Button */}
          <button
            onClick={() => navigate("/food/restaurant/login")}
            className="absolute top-6 left-6 p-2 bg-white/20 hover:bg-white/30 text-white rounded-full transition-all duration-200 z-20 backdrop-blur-md"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {/* Abstract wavy background layers */}
          <div className="absolute inset-0 z-0">
             {/* Darker green gradient in the corners */}
             <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-bl from-[#347d0d] via-transparent to-transparent opacity-80" />
             <div className="absolute bottom-0 left-0 w-full h-full bg-gradient-to-tr from-[#347d0d] via-transparent to-transparent opacity-80" />
             
             {/* Dotted pattern top left */}
             <div className="absolute -top-10 -left-10 w-40 h-40 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, white 2px, transparent 2px)', backgroundSize: '12px 12px' }} />

             {/* Curved shape top right */}
             <div className="absolute -top-20 -right-10 w-64 h-64 bg-[#5ec427] rounded-full blur-2xl opacity-40" />
             {/* Curved shape bottom left */}
             <div className="absolute -bottom-10 -left-20 w-80 h-80 bg-[#5ec427] rounded-full blur-3xl opacity-40" />
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
              className="w-24 h-24 md:w-28 md:h-28 bg-white rounded-full flex items-center justify-center mb-3 shadow-2xl overflow-hidden border-[2px] border-[#49AB14] ring-[4px] ring-white"
            >
              <img src={logoUrl || SuperfastLogo} alt="Logo" className="w-full h-full object-cover rounded-full" />
            </motion.div>
            
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-2 uppercase">
              {companyName}
            </h1>
            <div className="flex items-center gap-2 justify-center">
               <div className="h-[1px] w-6 md:w-8 bg-white/70" />
               <p className="text-[12px] md:text-[14px] font-bold tracking-[0.1em] uppercase whitespace-nowrap">
                 Restaurant Partner Portal
               </p>
               <div className="h-[1px] w-6 md:w-8 bg-white/70" />
            </div>
            <div className="h-1 w-8 bg-white rounded-full mt-2" />
          </div>
        </div>

        {/* Wave SVG directly below the green section */}
        <div className="w-full overflow-hidden leading-[0] -mt-0.5">
          <svg viewBox="0 0 1440 100" preserveAspectRatio="none" className="w-full h-[40px] md:h-[60px] block">
            <path d="M0,0 L1440,0 L1440,40 C1200,10 960,10 720,40 C480,80 240,80 0,40 Z" fill="#49AB14" />
          </svg>
        </div>
      </div>

      <div className="flex-1 max-w-[420px] mx-auto w-full px-4 flex flex-col mt-16 md:mt-20 relative z-20 pb-4 h-full">
        {/* Main Card */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] border border-gray-100 shrink-0 mb-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="text-center mb-5">
            <div className="flex items-center justify-center gap-3 mb-1.5">
               <div className="relative w-5 h-5">
                 <div className="absolute top-1 right-0 w-2.5 h-0.5 bg-[#49AB14] transform rotate-45" />
                 <div className="absolute top-2.5 right-0 w-3 h-0.5 bg-[#49AB14]" />
                 <div className="absolute top-4 right-0 w-2.5 h-0.5 bg-[#49AB14] transform -rotate-45" />
               </div>
               <h2 className="text-2xl font-black text-[#1c1c1c]">Verify OTP</h2>
               <div className="relative w-5 h-5">
                 <div className="absolute top-1 left-0 w-2.5 h-0.5 bg-[#49AB14] transform -rotate-45" />
                 <div className="absolute top-2.5 left-0 w-3 h-0.5 bg-[#49AB14]" />
                 <div className="absolute top-4 left-0 w-2.5 h-0.5 bg-[#49AB14] transform rotate-45" />
               </div>
            </div>
            <p className="text-sm text-gray-500 font-medium">
              Sent to <span className="text-[#49AB14] font-bold">{contactInfo}</span>
            </p>
            <div className="h-1 w-8 bg-[#49AB14] mx-auto mt-2 rounded-full" />
          </div>

          <div className="space-y-6">
            <div ref={otpSectionRef} className="flex justify-center gap-3">
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
                  onPaste={(e) => handlePaste(index, e)}
                  onFocus={() => setFocusedIndex(index)}
                  onBlur={() => setFocusedIndex(null)}
                  disabled={isLoading}
                  className={`w-12 h-14 sm:w-14 sm:h-16 bg-slate-50 border-2 rounded-2xl text-center text-2xl font-bold text-slate-900 focus:outline-none transition-all duration-300 ${
                    error 
                      ? "border-red-500 bg-red-50" 
                      : focusedIndex === index 
                        ? "border-[#49AB14] ring-1 ring-[#49AB14] shadow-md bg-white" 
                        : "border-gray-200"
                  }`}
                />
              ))}
            </div>

            {error && (
              <p className="text-[10px] font-semibold text-red-500 text-center px-1 animate-pulse">
                {error}
              </p>
            )}

            <div className="space-y-4">
              <Button
                onClick={() => handleVerify()}
                disabled={isLoading || !isOtpComplete}
                className={`w-full py-3 rounded-xl font-bold text-base transition-all flex items-center justify-center gap-2 ${
                  isOtpComplete && !isLoading
                    ? "bg-[#49AB14] hover:bg-[#3d8f11] text-white shadow-lg shadow-[#49AB14]/30 active:scale-[0.98]"
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

              <div className="flex flex-col items-center gap-4 pt-1">
                {resendTimer > 0 ? (
                  <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold tracking-wider uppercase">
                    <Timer className="w-4 h-4 text-[#49AB14]" />
                    Resend in <span className="font-bold text-gray-900">{resendTimer}s</span>
                  </div>
                ) : (
                  <button
                    onClick={handleResend}
                    disabled={isLoading}
                    className="flex items-center gap-2 text-[#49AB14] font-bold text-xs tracking-wider uppercase hover:underline"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Resend Code
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="pb-8 text-center mt-auto">
          <p className="text-[10px] font-black text-slate-300 tracking-[0.2em] uppercase">
            SECURE VERIFICATION SYSTEM &bull; {companyName.toUpperCase()}
          </p>
      </div>
    </div>
  )
}
