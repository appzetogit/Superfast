import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ShieldCheck, Phone, ArrowRight, Loader2, ConciergeBell, Soup, Utensils, Home } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { restaurantAPI } from "@food/api"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { toast } from "sonner"
import { motion } from "framer-motion"
import SuperfastLogo from "@/assets/Logo.webp"
import { loadBusinessSettings, getCachedSettings } from "@common/utils/businessSettings"

const DEFAULT_COUNTRY_CODE = "+91"
const countryCodes = [
  { code: DEFAULT_COUNTRY_CODE, country: "IN", flag: "India" },
]

export default function RestaurantLogin() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const phoneInputRef = useRef(null)
  const [formData, setFormData] = useState(() => {
    const saved = sessionStorage.getItem("restaurantLoginPhone")
    return {
      phone: saved || "",
      countryCode: DEFAULT_COUNTRY_CODE,
    }
  })
  const [error, setError] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [keyboardInset, setKeyboardInset] = useState(0)
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
      ensurePhoneFieldVisible()
    }
  }, [keyboardInset])

  const validatePhone = (phone, countryCode) => {
    if (!phone || phone.trim() === "") return "Phone number is required"

    const digitsOnly = phone.replace(/\D/g, "")
    if (digitsOnly.length < 7) return "Phone number must be at least 7 digits"
    if (digitsOnly.length > 15) return "Phone number is too long"

    if (digitsOnly.length !== 10) return "Indian phone number must be 10 digits"
    if (!["6", "7", "8", "9"].includes(digitsOnly[0])) {
      return "Invalid Indian mobile number"
    }

    return ""
  }

  const handlePhoneChange = (e) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 10)
    setFormData((prev) => ({ ...prev, phone: value }))
    sessionStorage.setItem("restaurantLoginPhone", value)

    if (error) {
      setError(validatePhone(value, formData.countryCode))
    }
  }

  const ensurePhoneFieldVisible = () => {
    // Wait for keyboard to animate in
    window.setTimeout(() => {
      phoneInputRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      })
    }, 300)
  }

  const handleSendOTP = async () => {
    const phoneError = validatePhone(formData.phone, formData.countryCode)
    setError(phoneError)
    if (phoneError) return

    const fullPhone = `${formData.countryCode || DEFAULT_COUNTRY_CODE} ${formData.phone}`.trim()

    try {
      setIsSending(true)
      await restaurantAPI.sendOTP(fullPhone, "login")

      const authData = {
        method: "phone",
        phone: fullPhone,
        isSignUp: false,
        module: "restaurant",
      }
      sessionStorage.setItem("restaurantAuthData", JSON.stringify(authData))
      navigate("/food/restaurant/otp")
    } catch (apiErr) {
      const message =
        apiErr?.response?.data?.message ||
        apiErr?.response?.data?.error ||
        "Failed to send OTP. Please try again."
      toast.error(message)
      setError(message)
    } finally {
      setIsSending(false)
    }
  }

  const isValidPhone = !validatePhone(formData.phone)

  return (
    <div
      className="h-[100dvh] bg-[#fafafa] flex flex-col relative font-sans overflow-hidden"
    >
      <AuthBrandHeader
        portalType="restaurant"
        subtitle="Restaurant Partner Portal"
      />

      <div
        className="flex-1 max-w-[420px] mx-auto w-full px-4 flex flex-col mt-16 md:mt-20 relative z-20 pb-4 overflow-y-auto"
        style={keyboardInset > 0 ? { maxHeight: `${window.visualViewport.height - 80}px` } : undefined}
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
               <h2 className="text-2xl font-black text-[#1c1c1c]">Welcome Back!</h2>
               <div className="relative w-5 h-5">
                 <div className="absolute top-1 left-0 w-2.5 h-0.5 bg-[#49AB14] transform -rotate-45" />
                 <div className="absolute top-2.5 left-0 w-3 h-0.5 bg-[#49AB14]" />
                 <div className="absolute top-4 left-0 w-2.5 h-0.5 bg-[#49AB14] transform rotate-45" />
               </div>
            </div>
            <p className="text-sm text-gray-500 font-medium">Login or Signup to restaurant partner account</p>
            <div className="h-1 w-8 bg-[#49AB14] mx-auto mt-2 rounded-full" />
          </div>

          <div className="space-y-5">
            <div className="space-y-4">
              <div className="flex items-center border border-gray-200 rounded-xl p-1.5 bg-white focus-within:border-[#49AB14] focus-within:ring-1 focus-within:ring-[#49AB14] transition-all">
                <div className="bg-[#E8F8E1] p-2 rounded-lg flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4 text-[#49AB14]" />
                </div>
                <div className="flex items-center pl-2 pr-3 border-r border-gray-200">
                  <span className="text-sm text-gray-700 font-semibold">+91</span>
                </div>
                <input
                  ref={phoneInputRef}
                  type="tel"
                  maxLength={10}
                  inputMode="numeric"
                  autoComplete="tel-national"
                  enterKeyHint="done"
                  placeholder="Enter phone number"
                  value={formData.phone}
                  onChange={handlePhoneChange}
                  onFocus={ensurePhoneFieldVisible}
                  className="w-full bg-transparent pl-2 pr-2 py-1.5 text-sm text-gray-900 font-semibold outline-none placeholder:text-gray-400 placeholder:font-normal"
                />
              </div>

              {error && (
                <p className="text-[10px] font-semibold text-red-500 px-1">{error}</p>
              )}
            </div>

            <Button
              onClick={handleSendOTP}
              disabled={!isValidPhone || isSending}
              className={`w-full py-3 rounded-xl font-bold text-base transition-all flex items-center justify-center gap-2 ${
                isValidPhone && !isSending
                ? "bg-[#49AB14] hover:bg-[#3d8f11] text-white shadow-lg shadow-[#49AB14]/20 active:scale-[0.98]"
                : "bg-gray-100 cursor-not-allowed opacity-50 text-gray-400 shadow-none"
              }`}
            >
              {isSending ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" />
              ) : (
                <>
                  Get Verification Code
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div>
        <div className="text-center pt-4 pb-2">
          <p className="text-slate-400 text-xs font-medium">
            By logging in, you agree to our <br />
            <button
              type="button"
              onClick={() => navigate("/food/restaurant/terms")}
              className="bg-transparent border-0 p-0 text-[#49AB14] font-bold hover:underline cursor-pointer"
            >
              Terms &amp; Conditions
            </button>{" "}
            and{" "}
            <button
              type="button"
              onClick={() => navigate("/food/restaurant/privacy")}
              className="bg-transparent border-0 p-0 text-[#49AB14] font-bold hover:underline cursor-pointer"
            >
              Privacy Policy
            </button>
            {" "}and{" "}
            <button
              type="button"
              onClick={() => navigate("/food/restaurant/support")}
              className="bg-transparent border-0 p-0 text-[#49AB14] font-bold hover:underline cursor-pointer"
            >
              Support
            </button>
          </p>
        </div>

        <div className="pb-8 text-center">
            <p className="text-[10px] font-black text-slate-300 tracking-[0.2em] uppercase">
              &copy; {new Date().getFullYear()} {companyName.toUpperCase()} RESTAURANT PARTNER
            </p>
        </div>
      </div>
    </div>
  )
}
