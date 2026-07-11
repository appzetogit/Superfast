import { useState, useEffect, useRef } from "react"
import { useNavigate, Link, useSearchParams } from "react-router-dom"
import { AlertCircle, Loader2 } from "lucide-react"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { authAPI } from "@food/api"
import { clearUserSession } from "@food/utils/auth"
import AuthBrandHeader from "@/modules/auth/components/AuthBrandHeader"
import { SUPERFAST_BRAND } from "@/modules/auth/constants/brand"

const debugError = (...args) => {}

export default function SignIn() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [formData, setFormData] = useState(() => {
    return {
      phone: sessionStorage.getItem("userSignInPhone") || "",
      countryCode: "+91",
    }
  })

  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const submittingRef = useRef(false)

  useEffect(() => {
    clearUserSession()
    const stored = sessionStorage.getItem("userAuthData")
    if (!stored) return

    try {
      const data = JSON.parse(stored)
      const fullPhone = String(data.phone || "").trim()
      const phoneDigits = fullPhone.replace(/^\+91\s*/, "").replace(/\D/g, "").slice(0, 10)

      setFormData((prev) => ({
        ...prev,
        phone: phoneDigits || prev.phone,
      }))
    } catch (err) {
      debugError("Error parsing stored auth data:", err)
    }
  }, [])

  const validatePhone = (phone) => {
    if (!phone.trim()) return "Phone number is required"
    const cleanPhone = phone.replace(/\D/g, "")
    if (!/^\d{10}$/.test(cleanPhone)) return "Phone number must be exactly 10 digits"
    return ""
  }

  const handleChange = (e) => {
    const { name } = e.target
    let { value } = e.target

    if (name === "phone") {
      value = value.replace(/\D/g, "").slice(0, 10)
      setError(validatePhone(value))
      sessionStorage.setItem("userSignInPhone", value)
    }

    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const phoneError = validatePhone(formData.phone)
    setError(phoneError)
    if (phoneError) return
    if (submittingRef.current) return
    submittingRef.current = true
    setIsLoading(true)
    setError("")

    try {
      const countryCode = formData.countryCode?.trim() || "+91"
      const phoneDigits = String(formData.phone ?? "").replace(/\D/g, "").slice(0, 10)
      if (phoneDigits.length !== 10) {
        setError("Phone number must be exactly 10 digits")
        setIsLoading(false)
        submittingRef.current = false
        return
      }
      const fullPhone = `${countryCode} ${phoneDigits}`
      await authAPI.sendOTP(fullPhone, "login", null)

      const ref = String(searchParams.get("ref") || "").trim()
      const authData = {
        method: "phone",
        phone: fullPhone,
        email: null,
        name: null,
        referralCode: ref || null,
        isSignUp: false,
        module: "user",
      }

      sessionStorage.setItem("userAuthData", JSON.stringify(authData))
      navigate("/food/user/auth/otp")
    } catch (apiError) {
      const message =
        apiError?.response?.data?.message ||
        apiError?.response?.data?.error ||
        "Failed to send OTP. Please try again."
      setError(message)
    } finally {
      setIsLoading(false)
      submittingRef.current = false
    }
  }

  return (
    <AnimatedPage
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: SUPERFAST_BRAND.cream }}
    >
      <div className="w-full max-w-[420px] mx-auto flex flex-col min-h-screen">
        <AuthBrandHeader compact subtitle="Superfast Food Delivery" />

        <div className="flex-1 px-4 -mt-2 pb-6">
          <div className="bg-white rounded-3xl p-5 sm:p-8 shadow-[0_10px_40px_-10px_rgba(249,115,22,0.14)] border border-orange-100">
            <div className="text-center space-y-2 mb-6">
              <h2 className="text-2xl sm:text-3xl font-black text-gray-900 leading-tight">
                Login or Signup
              </h2>
              <p className="text-sm text-gray-500">
                Enter your phone number to continue
              </p>
              <div className="h-1 w-8 mx-auto rounded-full" style={{ background: SUPERFAST_BRAND.gradient }} />
            </div>

            <form id="user-signin-form" onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <div className="relative flex items-center">
                  <div
                    className="flex items-center px-4 h-12 md:h-14 border border-gray-300 bg-white text-gray-900 rounded-xl border-r-0 rounded-r-none font-semibold"
                    style={{ background: SUPERFAST_BRAND.tint }}
                  >
                    <span>+91</span>
                  </div>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={10}
                    placeholder="Phone number"
                    value={formData.phone}
                    onChange={handleChange}
                    className={`flex-1 h-12 md:h-14 text-lg bg-white text-gray-900 border-gray-300 rounded-xl rounded-l-none focus-visible:ring-1 focus-visible:ring-[var(--primary-theme)] focus-visible:border-[var(--primary-theme)] ${error ? "border-red-500" : ""} transition-all`}
                    aria-invalid={error ? "true" : "false"}
                    onFocus={(e) => {
                      setTimeout(() => {
                        e.target.scrollIntoView({ behavior: "smooth", block: "center" })
                      }, 300)
                    }}
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-1.5 text-xs text-red-500 pl-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              <Button
                type="submit"
                form="user-signin-form"
                className="w-full h-12 md:h-14 text-white font-bold text-base md:text-lg rounded-xl transition-all hover:opacity-95 active:scale-[0.98]"
                style={{ background: SUPERFAST_BRAND.gradient }}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Sending OTP...
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            </form>

            <div className="text-center text-xs md:text-sm text-gray-500 pt-6">
              <p className="mb-2">By continuing, you agree to our</p>
              <div className="flex justify-center gap-2 flex-wrap">
                <Link to="/profile/terms" className="font-semibold hover:underline" style={{ color: SUPERFAST_BRAND.primary }}>
                  Terms & Conditions
                </Link>
                <span className="text-gray-300">•</span>
                <Link to="/profile/privacy" className="font-semibold hover:underline" style={{ color: SUPERFAST_BRAND.primary }}>
                  Privacy Policy
                </Link>
                <span className="text-gray-300">•</span>
                <Link to="/profile/support" className="font-semibold hover:underline" style={{ color: SUPERFAST_BRAND.primary }}>
                  Support
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AnimatedPage>
  )
}
