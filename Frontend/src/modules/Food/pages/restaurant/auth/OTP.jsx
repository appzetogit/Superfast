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

import AuthBrandHeader from "@/modules/auth/components/AuthBrandHeader"

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
    <div className="h-[100dvh] bg-[#fafafa] flex flex-col relative font-sans overflow-hidden">
      <AuthBrandHeader
        portalType="restaurant"
        subtitle="Restaurant Partner Portal"
        showBack
        onBack={() => navigate("/food/restaurant/login")}
      />

      <div
        className="flex-1 max-w-[420px] mx-auto w-full px-4 flex flex-col mt-16 md:mt-20 relative z-20 pb-4 overflow-y-auto"
        style={keyboardOffset > 0 ? { maxHeight: `${window.visualViewport.height - 80}px` } : undefined}
      >
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
      {/* Footer */}
      <div>
        <div className="pb-8 text-center mt-auto">
            <p className="text-[10px] font-black text-slate-300 tracking-[0.2em] uppercase">
              SECURE VERIFICATION SYSTEM &bull; {companyName.toUpperCase()}
            </p>
        </div>
      </div>
    </div>
  )
}
