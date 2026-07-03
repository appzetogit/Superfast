import { useMemo, useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Store, Phone, KeyRound, ArrowLeft, Loader2, ConciergeBell, Soup, Utensils, Home } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@food/components/ui/button";
import { useCompanyName } from "@food/hooks/useCompanyName";
import { setAuthData } from "@food/utils/auth";
import { useAuth } from "@core/context/AuthContext";
import { sellerApi } from "../services/sellerApi";
import SuperfastLogo from "@/assets/Logo.webp"
import { loadBusinessSettings, getCachedSettings } from "@common/utils/businessSettings"

const DEFAULT_COUNTRY_CODE = "+91";

export default function SellerAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const companyName = useCompanyName();
  const [step, setStep] = useState("phone");
  const [isLoading, setIsLoading] = useState(false);
  const [phone, setPhone] = useState(() => sessionStorage.getItem("sellerAuthPhone") || "");
  const [otp, setOtp] = useState("");
  const [otpPhone, setOtpPhone] = useState("");
  const [logoUrl, setLogoUrl] = useState(() => getCachedSettings()?.logo?.url || null)
  const [keyboardInset, setKeyboardInset] = useState(0)

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settings = await loadBusinessSettings()
        if (settings?.logo?.url) setLogoUrl(settings.logo.url)
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



  const nextSellerPath =
    typeof location.state?.from === "string" &&
    location.state.from.startsWith("/seller")
      ? location.state.from
      : "/seller";

  const maskedPhone = useMemo(() => {
    if (phone.length < 4) return `${DEFAULT_COUNTRY_CODE} ${phone}`;
    return `${DEFAULT_COUNTRY_CODE} ${phone.slice(0, 2)}******${phone.slice(-2)}`;
  }, [phone]);

  const validatePhone = (value) => {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length !== 10) return "Enter a valid 10-digit mobile number";
    if (!["6", "7", "8", "9"].includes(digits[0])) return "Enter a valid Indian mobile number";
    return "";
  };

  const handleSendOtp = async () => {

    const validation = validatePhone(phone);
    if (validation) {
      toast.error(validation);
      return;
    }

    try {
      setIsLoading(true);
      const fullPhone = `${DEFAULT_COUNTRY_CODE} ${phone}`.trim();
      const response = await sellerApi.requestOtp(fullPhone);
      const payload = response?.data?.result || response?.data?.data || response?.data || {};
      const devOtp = payload?.otp || null;
      const deliveryMode = payload?.deliveryMode || "sms";
      const resolvedPhone = String(payload?.phone || fullPhone).trim();

      toast.success("OTP sent to your seller number.");
      setOtpPhone(resolvedPhone);
      setOtp("");
      setStep("otp");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to send OTP");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const code = String(otp || "").replace(/\D/g, "").slice(0, 4);
    if (code.length !== 4) {
      toast.error("Enter the 4-digit OTP");
      return;
    }

    try {
      setIsLoading(true);
      const verifyPhone = String(otpPhone || `${DEFAULT_COUNTRY_CODE} ${phone}`.trim()).trim();
      const response = await sellerApi.verifyOtp(verifyPhone, code);
      const data = response?.data?.result || response?.data?.data || response?.data || {};
      const accessToken = data?.accessToken || data?.token;
      const refreshToken = data?.refreshToken || null;
      const sellerUser = data?.seller || data?.user || data?.data?.seller || data?.data?.user;

      if (!accessToken) {
        throw new Error("Login succeeded but no access token was returned");
      }

      setAuthData("seller", accessToken, sellerUser, refreshToken);

      login({
        ...sellerUser,
        name:
          sellerUser?.name ||
          "Seller",
        shopName:
          sellerUser?.shopName ||
          sellerUser?.name ||
          "Store",
        phone:
          sellerUser?.phone ||
          `${DEFAULT_COUNTRY_CODE} ${phone}`.trim(),
        email: sellerUser?.email || "",
        token: accessToken,
        role: "seller",
      });
      toast.success(
        sellerUser?.approved === false
          ? "OTP verified. Continue your seller setup."
          : "Seller login successful",
      );
      navigate(
        sellerUser?.approved === false && sellerUser?.onboardingSubmitted !== true
          ? "/seller/onboarding"
          : nextSellerPath
      );
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || "OTP verification failed");
    } finally {
      setIsLoading(false);
    }
  };

  const isSubmitDisabled =
    isLoading ||
    (step === "phone" && phone.length !== 10) ||
    (step === "otp" && otp.length !== 4);

  return (
    <div
      className="h-[100dvh] bg-[#fafafa] flex flex-col relative font-sans overflow-hidden"
      style={{ paddingBottom: keyboardInset ? `${keyboardInset + 24}px` : undefined }}
    >
      {/* Top Green Section */}
      <div className="w-full flex flex-col shrink-0 z-10 drop-shadow-md">
        <div className="w-full relative overflow-hidden bg-[#16a34a] pb-4">
          {/* Back Button */}
          {step === "otp" && (
            <button
              onClick={() => {
                setStep("phone");
                setOtp("");
                setOtpPhone("");
              }}
              className="absolute top-6 left-6 p-2 bg-white/20 hover:bg-white/30 text-white rounded-full transition-all duration-200 z-20 backdrop-blur-md"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          {/* Abstract wavy background layers */}
          <div className="absolute inset-0 z-0">
             {/* Darker green gradient in the corners */}
             <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-bl from-[#14532d] via-transparent to-transparent opacity-80" />
             <div className="absolute bottom-0 left-0 w-full h-full bg-gradient-to-tr from-[#14532d] via-transparent to-transparent opacity-80" />
             
             {/* Dotted pattern top left */}
             <div className="absolute -top-10 -left-10 w-40 h-40 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, white 2px, transparent 2px)', backgroundSize: '12px 12px' }} />

             {/* Curved shape top right */}
             <div className="absolute -top-20 -right-10 w-64 h-64 bg-[#22c55e] rounded-full blur-2xl opacity-40" />
             {/* Curved shape bottom left */}
             <div className="absolute -bottom-10 -left-20 w-80 h-80 bg-[#22c55e] rounded-full blur-3xl opacity-40" />
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
              className="w-24 h-24 md:w-28 md:h-28 bg-white rounded-full flex items-center justify-center mb-3 shadow-2xl overflow-hidden border-[2px] border-[#16a34a] ring-[4px] ring-white"
            >
              <img src={logoUrl || SuperfastLogo} alt="Logo" className="w-full h-full object-cover rounded-full" />
            </motion.div>
            
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-2 uppercase">
              {companyName}
            </h1>
            <div className="flex items-center gap-2 justify-center">
               <div className="h-[1px] w-6 md:w-8 bg-white/70" />
               <p className="text-[12px] md:text-[14px] font-bold tracking-[0.1em] uppercase whitespace-nowrap">
                 Seller Partner Portal
               </p>
               <div className="h-[1px] w-6 md:w-8 bg-white/70" />
            </div>
            <div className="h-1 w-8 bg-white rounded-full mt-2" />
          </div>
        </div>

        {/* Wave SVG directly below the green section */}
        <div className="w-full overflow-hidden leading-[0] -mt-0.5">
          <svg viewBox="0 0 1440 100" preserveAspectRatio="none" className="w-full h-[40px] md:h-[60px] block">
            <path d="M0,0 L1440,0 L1440,40 C1200,10 960,10 720,40 C480,80 240,80 0,40 Z" fill="#16a34a" />
          </svg>
        </div>
      </div>

      <div className="flex-1 max-w-[420px] mx-auto w-full px-4 flex flex-col mt-16 md:mt-20 relative z-20 pb-4 h-full overflow-y-auto">
        {/* Main Card */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] border border-gray-100 shrink-0 mb-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {step === "phone" ? (
            <>
              <div className="text-center mb-5">
                <div className="flex items-center justify-center gap-3 mb-1.5">
                   <div className="relative w-5 h-5">
                     <div className="absolute top-1 right-0 w-2.5 h-0.5 bg-[#16a34a] transform rotate-45" />
                     <div className="absolute top-2.5 right-0 w-3 h-0.5 bg-[#16a34a]" />
                     <div className="absolute top-4 right-0 w-2.5 h-0.5 bg-[#16a34a] transform -rotate-45" />
                   </div>
                   <h2 className="text-2xl font-black text-[#1c1c1c]">Welcome Back!</h2>
                   <div className="relative w-5 h-5">
                     <div className="absolute top-1 left-0 w-2.5 h-0.5 bg-[#16a34a] transform -rotate-45" />
                     <div className="absolute top-2.5 left-0 w-3 h-0.5 bg-[#16a34a]" />
                     <div className="absolute top-4 left-0 w-2.5 h-0.5 bg-[#16a34a] transform rotate-45" />
                   </div>
                </div>
                <p className="text-sm text-gray-500 font-medium">Login to your seller partner account</p>
                <div className="h-1 w-8 bg-[#16a34a] mx-auto mt-2 rounded-full" />
              </div>

              <div className="space-y-5">
                <div className="space-y-4">
                  <div className="flex items-center border border-gray-200 rounded-xl p-1.5 bg-white focus-within:border-[#16a34a] focus-within:ring-1 focus-within:ring-[#16a34a] transition-all">
                    <div className="bg-[#EAFaf1] p-2 rounded-lg flex items-center justify-center shrink-0">
                      <Phone className="w-4 h-4 text-[#16a34a]" />
                    </div>
                    <div className="flex items-center pl-2 pr-3 border-r border-gray-200">
                      <span className="text-sm text-gray-700 font-semibold">+91</span>
                    </div>
                    <input
                      type="tel"
                      maxLength={10}
                      inputMode="numeric"
                      placeholder="Enter phone number"
                      value={phone}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                        setPhone(val);
                        sessionStorage.setItem("sellerAuthPhone", val);
                      }}
                      className="w-full bg-transparent pl-2 pr-2 py-1.5 text-sm text-gray-900 font-semibold outline-none placeholder:text-gray-400 placeholder:font-normal"
                    />
                  </div>
                </div>


                <Button
                  onClick={handleSendOtp}
                  disabled={isSubmitDisabled}
                  className={`w-full py-3 rounded-xl font-bold text-base transition-all flex items-center justify-center gap-2 ${
                    !isSubmitDisabled
                    ? "bg-[#16a34a] hover:bg-[#128a3e] text-white shadow-lg shadow-[#16a34a]/30 active:scale-[0.98]"
                    : "bg-gray-100 cursor-not-allowed opacity-50 text-gray-400 shadow-none"
                  }`}
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" />
                  ) : (
                    <>
                      Get Verification Code
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="text-center mb-5">
                <div className="flex items-center justify-center gap-3 mb-1.5">
                   <div className="relative w-5 h-5">
                     <div className="absolute top-1 right-0 w-2.5 h-0.5 bg-[#16a34a] transform rotate-45" />
                     <div className="absolute top-2.5 right-0 w-3 h-0.5 bg-[#16a34a]" />
                     <div className="absolute top-4 right-0 w-2.5 h-0.5 bg-[#16a34a] transform -rotate-45" />
                   </div>
                   <h2 className="text-2xl font-black text-[#1c1c1c]">Verify OTP</h2>
                   <div className="relative w-5 h-5">
                     <div className="absolute top-1 left-0 w-2.5 h-0.5 bg-[#16a34a] transform -rotate-45" />
                     <div className="absolute top-2.5 left-0 w-3 h-0.5 bg-[#16a34a]" />
                     <div className="absolute top-4 left-0 w-2.5 h-0.5 bg-[#16a34a] transform rotate-45" />
                   </div>
                </div>
                <p className="text-sm text-gray-500 font-medium">
                  Sent to <span className="text-[#16a34a] font-bold">{maskedPhone}</span>
                </p>
                <div className="h-1 w-8 bg-[#16a34a] mx-auto mt-2 rounded-full" />
              </div>

              <div className="space-y-5">
                <div className="space-y-4">
                  <div className="flex justify-between gap-3 sm:gap-4 max-w-[280px] mx-auto">
                    {[0, 1, 2, 3].map((index) => (
                      <input
                        key={index}
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={1}
                        value={otp[index] || ""}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "");
                          let newOtp = otp.split("");
                          newOtp[index] = val;
                          setOtp(newOtp.join("").slice(0, 4));
                          if (val && index < 3) {
                            e.target.nextElementSibling?.focus();
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Backspace" && !otp[index] && index > 0) {
                            e.target.previousElementSibling?.focus();
                          }
                        }}
                        onPaste={(e) => {
                          e.preventDefault();
                          const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
                          if (pastedData) {
                            setOtp(pastedData);
                          }
                        }}
                        className="w-12 h-12 sm:w-14 sm:h-14 text-center text-xl font-bold border-2 border-gray-200 rounded-xl focus:border-[#16a34a] focus:ring-1 focus:ring-[#16a34a] bg-white text-gray-900 transition-all outline-none"
                      />
                    ))}
                  </div>
                </div>

                <Button
                  onClick={handleVerifyOtp}
                  disabled={isSubmitDisabled}
                  className={`w-full py-3 rounded-xl font-bold text-base transition-all flex items-center justify-center gap-2 ${
                    !isSubmitDisabled
                    ? "bg-[#16a34a] hover:bg-[#128a3e] text-white shadow-lg shadow-[#16a34a]/30 active:scale-[0.98]"
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
              </div>
            </>
          )}
        </div>
      </div>

      <div className="text-center pt-4 pb-2">
        <p className="text-slate-400 text-xs font-medium">
          By continuing, you agree to our <br />
          <a href="/seller/terms" className="text-[#16a34a] font-bold hover:underline">
            Terms & Conditions
          </a>
          ,{" "}
          <a href="/seller/privacy" className="text-[#16a34a] font-bold hover:underline">
            Privacy Policy
          </a>
          {" "}and{" "}
          <a href="/seller/support" className="text-[#16a34a] font-bold hover:underline">
            Support
          </a>
        </p>
      </div>

      <div className="pb-8 text-center mt-auto">
          <p className="text-[10px] font-black text-slate-300 tracking-[0.2em] uppercase">
            &copy; {new Date().getFullYear()} {companyName.toUpperCase()} SELLER PORTAL
          </p>
      </div>
    </div>
  );
}




