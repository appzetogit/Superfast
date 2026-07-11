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

  const isValidPhone = !validatePhone(formData.phone, formData.countryCode)

  return (
    <div
      className="h-[100dvh] bg-[#fafafa] flex flex-col relative font-sans overflow-hidden"
      style={{ paddingBottom: keyboardInset ? `${keyboardInset + 24}px` : undefined }}
    >
      {/* Top Green Section */}
      <div className="w-full flex flex-col shrink-0 z-10 drop-shadow-md">
        <div className="w-full relative overflow-hidden bg-[#49AB14] pb-4">
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

      <div id="login-content" className="flex-1 max-w-[420px] mx-auto w-full px-4 flex flex-col mt-16 md:mt-20 relative z-20 pb-4 h-full overflow-y-auto">
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

        <div className={`text-center pt-4 pb-2 ${keyboardInset ? "hidden" : ""}`}>
          <p className="text-slate-400 text-xs font-medium">
            By logging in, you agree to our <br />
            <button
              type="button"
              onClick={() => navigate("/food/restaurant/terms")}
              className="bg-transparent border-0 p-0 text-[#49AB14] font-bold hover:underline cursor-pointer"
            >
              Terms & Conditions
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
      </div>

      <div className={`pb-8 text-center mt-auto ${keyboardInset ? "hidden" : ""}`}>
          <p className="text-[10px] font-black text-slate-300 tracking-[0.2em] uppercase">
            &copy; {new Date().getFullYear()} {companyName.toUpperCase()} RESTAURANT PARTNER
          </p>
      </div>
    </div>
  )
}
