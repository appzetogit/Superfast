import React, { useEffect, useState, useRef } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { Phone, ArrowRight, ShieldCheck, Loader2, UserRound, Zap, HeadphonesIcon } from "lucide-react"
import { toast } from "sonner"
import { authAPI, userAPI } from "@food/api"
import { isModuleAuthenticated, setAuthData } from "@food/utils/auth"
import { useAuth } from "@core/context/AuthContext"
import AuthBrandHeader from "../components/AuthBrandHeader"
import { SUPERFAST_BRAND } from "../constants/brand"

export default function UnifiedOTPFastLogin() {
  const RESEND_COOLDOWN_SECONDS = 60
  const [phoneNumber, setPhoneNumber] = useState(() => sessionStorage.getItem("userLoginPhone") || "")
  const [otp, setOtp] = useState("")
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)
  const [showNameInput, setShowNameInput] = useState(false)
  const [name, setName] = useState("")
  const [nameError, setNameError] = useState("")
  const location = useLocation()
  const navigate = useNavigate()
  const { login: globalLogin } = useAuth()
  const submitting = useRef(false)
  const searchParams = new URLSearchParams(location.search)
  const referralCode = searchParams.get("ref") || ""
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



  const fromPath = typeof location.state?.from === "string" ? location.state.from : (location.state?.from?.pathname || "/portal")
  const fromSearch = typeof location.state?.from === "object" ? (location.state?.from?.search || "") : ""
  const redirectTo = fromPath + fromSearch

  useEffect(() => {
    if (!isModuleAuthenticated("user")) return
    navigate(redirectTo, { replace: true })
  }, [navigate, redirectTo])

  const clearNameFlow = () => {
    setShowNameInput(false)
    setName("")
    setNameError("")
  }

  const normalizedPhone = () => {
    const digits = String(phoneNumber).replace(/\D/g, "").slice(-10)
    return digits.length === 10 ? digits : ""
  }

  const handleSendOTP = async (e) => {
    e.preventDefault()
    const phone = normalizedPhone()
    if (phone.length !== 10) {
      toast.error("Please enter a valid 10-digit phone number")
      return
    }
    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    try {
      clearNameFlow()
      await authAPI.sendOTP(phoneNumber, "login", null)
      setOtpSent(true)
      setOtp("")
      setStep(2)
      setResendTimer(RESEND_COOLDOWN_SECONDS)
      toast.success("OTP sent! Check your phone.")
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to send OTP."
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  const handleResendOTP = async () => {
    const phone = normalizedPhone()
    if (phone.length !== 10) {
      toast.error("Please enter a valid 10-digit phone number")
      return
    }
    if (resendTimer > 0 || submitting.current) return
    submitting.current = true
    setLoading(true)
    try {
      clearNameFlow()
      await authAPI.sendOTP(phoneNumber, "login", null)
      setOtp("")
      setOtpSent(true)
      setResendTimer(RESEND_COOLDOWN_SECONDS)
      toast.success("OTP resent successfully.")
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to resend OTP."
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  const handleEditNumber = () => {
    setStep(1)
    setOtp("")
    setResendTimer(0)
    clearNameFlow()
  }

  const handleVerifyOTP = async (e) => {
    e.preventDefault()
    const phone = normalizedPhone()
    const otpDigits = String(otp).replace(/\D/g, "").slice(0, 4)
    if (otpDigits.length !== 4) {
      toast.error("Please enter the 4-digit OTP")
      return
    }
    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    try {
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
                const t = await window.flutter_inappwebview.callHandler(handlerName, { module: "user" });
                if (t && typeof t === "string" && t.length > 20) {
                  fcmToken = t.trim();
                  break;
                }
              } catch (e) { }
            }
          } else {
            fcmToken = localStorage.getItem("fcm_web_registered_token_user") || null;
          }
        }
      } catch (e) {
        console.warn("Failed to get FCM token during login", e);
      }

      const response = await authAPI.verifyOTP(
        phoneNumber,
        otpDigits,
        "login",
        null,
        null,
        "user",
        null,
        referralCode,
        fcmToken,
        platform
      )
      const data = response?.data?.data || response?.data || {}
      const accessToken = data.accessToken
      const refreshToken = data.refreshToken || null
      const user = data.user

      if (!accessToken || !user) {
        throw new Error("Invalid response from server")
      }

      const hasName =
        user.name &&
        String(user.name).trim().length > 0 &&
        String(user.name).toLowerCase() !== "null"
      const needsName = data.isNewUser === true || !hasName

      if (needsName) {
        setAuthData("user", accessToken, user, refreshToken)
        window.dispatchEvent(new Event("userAuthChanged"))
        setShowNameInput(true)
        setLoading(false)
        submitting.current = false
        return
      }

      setAuthData("user", accessToken, user, refreshToken)
      globalLogin({ ...user, token: accessToken, role: 'customer' })
      window.dispatchEvent(new Event("userAuthChanged"))
      toast.success("Login successful!")
      navigate(redirectTo, { replace: true })
    } catch (err) {
      const status = err?.response?.status
      let msg = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Invalid OTP. Please try again."
      if (status === 401) {
        if (/deactivat(ed|e)/i.test(String(msg))) {
          msg = "Your account is deactivated. Please contact support."
        } else {
          msg = "Invalid or expired code, or account not active."
        }
      }
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  const handleSubmitName = async (e) => {
    e.preventDefault()

    const trimmedName = name.trim()
    if (!trimmedName) {
      setNameError("Please enter your name")
      return
    }

    if (trimmedName.length < 2) {
      setNameError("Name must be at least 2 characters")
      return
    }

    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    setNameError("")

    try {
      const response = await userAPI.updateProfile({ name: trimmedName })
      const updatedUser =
        response?.data?.data?.user ||
        response?.data?.user ||
        response?.data?.data ||
        response?.data
      const storedToken = localStorage.getItem("user_accessToken") || localStorage.getItem("accessToken")
      const storedRefreshToken = localStorage.getItem("user_refreshToken") || null

      if (!storedToken || !updatedUser) {
        throw new Error("Invalid response from server")
      }

      setAuthData("user", storedToken, updatedUser, storedRefreshToken)
      globalLogin({ ...updatedUser, token: storedToken, role: 'customer' })
      window.dispatchEvent(new Event("userAuthChanged"))
      clearNameFlow()
      toast.success("Profile saved successfully!")
      navigate(redirectTo, { replace: true })
    } catch (err) {
      const status = err?.response?.status
      let msg = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Failed to save your name."
      if (status === 401) {
        msg = "Invalid or expired code, or account not active."
      }
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  useEffect(() => {
    if (step !== 2 || resendTimer <= 0) return
    const intervalId = setInterval(() => {
      setResendTimer((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(intervalId)
  }, [step, resendTimer])

  const formatResendTimer = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
  }

  const isSubmitDisabled =
    loading ||
    (step === 1 && !showNameInput && phoneNumber.length !== 10) ||
    (showNameInput && name.trim().length === 0) ||
    (step === 2 && !showNameInput && otp.length !== 4)

  return (
    <div
      className="h-[100dvh] flex flex-col relative font-sans overflow-hidden"
      style={{
        backgroundColor: SUPERFAST_BRAND.cream,
        '--primary-theme': '#f97316',
        paddingBottom: keyboardInset ? `${keyboardInset + 24}px` : undefined,
      }}
    >
      <AuthBrandHeader />

      <div className="flex-1 max-w-[420px] mx-auto w-full px-4 flex flex-col mt-10 md:mt-14 relative z-20 pb-4 h-full overflow-y-auto">
        {/* Main Card */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-[0_10px_40px_-10px_rgba(249,115,22,0.14)] border border-orange-100 shrink-0 mb-4">
          <div className="text-center mb-5">
            <div className="flex items-center justify-center gap-3 mb-1.5">
               <div className="relative w-5 h-5">
                 <div className="absolute top-1 right-0 w-2.5 h-0.5 transform rotate-45" style={{ background: SUPERFAST_BRAND.orange }} />
                 <div className="absolute top-2.5 right-0 w-3 h-0.5" style={{ background: SUPERFAST_BRAND.primary }} />
                 <div className="absolute top-4 right-0 w-2.5 h-0.5 transform -rotate-45" style={{ background: SUPERFAST_BRAND.orangeDeep }} />
               </div>
               <h2 className="text-2xl font-black text-[#1c1c1c]">Welcome!</h2>
               <div className="relative w-5 h-5">
                 <div className="absolute top-1 left-0 w-2.5 h-0.5 transform -rotate-45" style={{ background: SUPERFAST_BRAND.orange }} />
                 <div className="absolute top-2.5 left-0 w-3 h-0.5" style={{ background: SUPERFAST_BRAND.primary }} />
                 <div className="absolute top-4 left-0 w-2.5 h-0.5 transform rotate-45" style={{ background: SUPERFAST_BRAND.orangeDeep }} />
               </div>
            </div>
            <p className="text-sm text-gray-500 font-medium">Login or Signup to continue</p>
            <div className="h-1 w-8 mx-auto mt-2 rounded-full" style={{ background: SUPERFAST_BRAND.gradient }} />
          </div>

          <form onSubmit={showNameInput ? handleSubmitName : step === 1 ? handleSendOTP : handleVerifyOTP} className="space-y-5">
            {step === 1 ? (
              <div className="space-y-4">
                <div className="flex items-center border border-gray-200 rounded-xl p-1.5 bg-white focus-within:border-[var(--primary-theme)] focus-within:ring-1 focus-within:ring-[var(--primary-theme)] transition-all">
                  <div className="p-2 rounded-lg flex items-center justify-center shrink-0" style={{ background: SUPERFAST_BRAND.tint }}>
                    <Phone className="w-4 h-4" style={{ color: SUPERFAST_BRAND.primary }} />
                  </div>
                  <div className="flex items-center pl-2 pr-3 border-r border-gray-200">
                    <span className="text-sm text-gray-700 font-semibold">+91</span>
                  </div>
                  <input
                    type="tel"
                    required
                    autoFocus
                    value={phoneNumber}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                      setPhoneNumber(val);
                      sessionStorage.setItem("userLoginPhone", val);
                    }}
                    maxLength={10}
                    className="w-full bg-transparent pl-2 pr-2 py-1.5 text-sm text-gray-900 font-semibold outline-none placeholder:text-gray-400 placeholder:font-normal"
                    placeholder="Enter phone number"
                  />
                </div>
                
                <div className="flex items-start gap-2 pt-1">
                  <div className="shrink-0 mt-0.5">
                    <ShieldCheck className="w-4 h-4" style={{ color: SUPERFAST_BRAND.primary }} />
                  </div>
                  <p className="text-xs text-gray-500 leading-tight font-medium">
                    We will send success notifications and order updates via SMS
                  </p>
                </div>
              </div>
            ) : showNameInput ? (
              <div className="space-y-4">
                <div className="flex items-center border border-gray-200 rounded-xl p-1.5 bg-white focus-within:border-[var(--primary-theme)] focus-within:ring-1 focus-within:ring-[var(--primary-theme)] transition-all">
                  <div className="p-2 rounded-lg flex items-center justify-center shrink-0" style={{ background: SUPERFAST_BRAND.tint }}>
                    <UserRound className="w-4 h-4" style={{ color: SUPERFAST_BRAND.primary }} />
                  </div>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value)
                      if (nameError) setNameError("")
                    }}
                    className="w-full bg-transparent pl-2 pr-2 py-1.5 text-sm text-gray-900 font-semibold outline-none placeholder:text-gray-400 placeholder:font-normal"
                    placeholder="Enter your full name"
                  />
                </div>
                {nameError && (
                  <p className="text-[10px] font-semibold text-red-500 px-1">{nameError}</p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-xs text-gray-500 font-medium">Enter the 4-digit code sent to</p>
                  <p className="text-sm text-gray-900 font-bold mt-1">+91 {phoneNumber} <button type="button" onClick={handleEditNumber} className="text-xs ml-1 hover:underline" style={{ color: SUPERFAST_BRAND.primary }}>Edit</button></p>
                </div>
                <div className="flex justify-center gap-2">
                  {[0, 1, 2, 3].map((index) => (
                    <input
                      key={index}
                      id={`otp-${index}`}
                      type="tel"
                      inputMode="numeric"
                      required
                      autoFocus={index === 0}
                      value={otp[index] || ""}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "").slice(-1);
                        if (!val) return;
                        const newOtp = otp.split("");
                        newOtp[index] = val;
                        const combined = newOtp.join("").slice(0, 4);
                        setOtp(combined);

                        if (index < 3 && val) {
                          document.getElementById(`otp-${index + 1}`)?.focus();
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Backspace") {
                          if (!otp[index] && index > 0) {
                            document.getElementById(`otp-${index - 1}`)?.focus();
                          } else {
                            const newOtp = otp.split("");
                            newOtp[index] = "";
                            setOtp(newOtp.join(""));
                          }
                        }
                      }}
                      onPaste={(e) => {
                        e.preventDefault();
                        const pasteData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
                        if (pasteData) {
                          setOtp(pasteData);
                          document.getElementById(`otp-${Math.min(pasteData.length, 3)}`)?.focus();
                        }
                      }}
                      className="w-12 h-12 text-center text-xl font-bold bg-white border border-gray-200 focus:border-[var(--primary-theme)] focus:ring-1 focus:ring-[var(--primary-theme)] rounded-xl outline-none transition-all text-gray-900"
                    />
                  ))}
                </div>
                <div className="text-center mt-3">
                  {resendTimer > 0 ? (
                    <p className="text-xs text-gray-500 font-medium">
                      Resend code in <span className="font-bold text-gray-900">{formatResendTimer(resendTimer)}</span>
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendOTP}
                      disabled={loading}
                      className="text-xs font-bold hover:underline disabled:opacity-60 disabled:cursor-not-allowed"
                      style={{ color: SUPERFAST_BRAND.primary }}
                    >
                      Resend Code
                    </button>
                  )}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitDisabled}
              className={`w-full py-3 rounded-xl font-bold text-base transition-all flex items-center justify-center gap-2 ${
                isSubmitDisabled
                ? "bg-gray-100 cursor-not-allowed opacity-50 text-gray-400 shadow-none"
                : "text-white shadow-lg active:scale-[0.98] hover:opacity-95"
              }`}
              style={!isSubmitDisabled ? { background: SUPERFAST_BRAND.gradient, boxShadow: "0 10px 24px rgba(249,115,22,0.28)" } : undefined}
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-white" />
              ) : (
                <>
                  {step === 1 ? "Get Verification Code" : showNameInput ? "Save Name & Continue" : "Verify & Continue"}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Features Row */}
        {step === 1 && (
        <div className="grid grid-cols-3 gap-1 shrink-0 mt-2">
          <div className="flex flex-col items-center text-center">
            <div className="w-10 h-10 rounded-full flex items-center justify-center mb-1" style={{ background: SUPERFAST_BRAND.tint }}>
               <ShieldCheck className="w-5 h-5" style={{ color: SUPERFAST_BRAND.primary }} />
            </div>
            <h4 className="text-[10px] font-bold text-gray-900 mb-0.5">Safe & Secure</h4>
            <p className="text-[8px] text-gray-500 leading-tight">Your data is protected</p>
          </div>
          <div className="flex flex-col items-center text-center border-l border-r border-gray-200">
            <div className="w-10 h-10 rounded-full flex items-center justify-center mb-1" style={{ background: SUPERFAST_BRAND.tint }}>
               <Zap className="w-5 h-5" style={{ color: SUPERFAST_BRAND.orange }} />
            </div>
            <h4 className="text-[10px] font-bold text-gray-900 mb-0.5">Fast & Easy</h4>
            <p className="text-[8px] text-gray-500 leading-tight">Quick login in seconds</p>
          </div>
          <div className="flex flex-col items-center text-center">
            <div className="w-10 h-10 rounded-full flex items-center justify-center mb-1" style={{ background: SUPERFAST_BRAND.tint }}>
               <HeadphonesIcon className="w-5 h-5" style={{ color: SUPERFAST_BRAND.primary }} />
            </div>
            <h4 className="text-[10px] font-bold text-gray-900 mb-0.5">24/7 Support</h4>
            <p className="text-[8px] text-gray-500 leading-tight">We're here to help</p>
          </div>
        </div>
        )}

        <div className="text-center space-y-1 shrink-0 mt-auto pt-4 mb-2">
          <p className="text-[10px] text-gray-500 font-medium">By continuing, you agree to our</p>
          <div className="flex items-center justify-center gap-1.5 text-[10px] font-semibold">
            <Link to="/food/user/profile/terms" className="hover:underline" style={{ color: SUPERFAST_BRAND.primary }}>Terms & Conditions</Link>
            <span className="text-gray-400">•</span>
            <Link to="/food/user/profile/privacy" className="hover:underline" style={{ color: SUPERFAST_BRAND.primary }}>Privacy Policy</Link>
            <span className="text-gray-400">•</span>
            <Link to="/food/user/profile/support" className="hover:underline" style={{ color: SUPERFAST_BRAND.primary }}>Support</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
