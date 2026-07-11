import { motion } from "framer-motion"
import SuperfastLogo from "@/assets/Logo.webp"
import { getCachedSettings, getDynamicLogoUrl } from "@common/utils/businessSettings"
import { SUPERFAST_BRAND } from "../constants/brand"

export default function AuthBrandHeader({ compact = false, subtitle }) {
  const settings = getCachedSettings()
  const logoUrl = getDynamicLogoUrl(settings) || null

  return (
    <div className="w-full flex flex-col shrink-0 z-10 drop-shadow-md">
      <div
        className={`w-full relative overflow-hidden pb-4 ${compact ? "pt-6" : "pt-8"}`}
        style={{ background: SUPERFAST_BRAND.gradientSoft }}
      >
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div
            className="absolute -top-16 -right-10 w-72 h-72 rounded-full blur-3xl opacity-35"
            style={{ background: SUPERFAST_BRAND.orange }}
          />
          <div
            className="absolute -bottom-20 -left-16 w-80 h-80 rounded-full blur-3xl opacity-30"
            style={{ background: SUPERFAST_BRAND.orangeDeep }}
          />

          {/* Speed lines inspired by the SuperFast logo */}
          <div className="absolute left-3 top-1/2 -translate-y-1/2 flex flex-col gap-2 opacity-25">
            {[56, 42, 68, 36, 50].map((width, index) => (
              <div
                key={index}
                className="h-1.5 rounded-full bg-white"
                style={{ width }}
              />
            ))}
          </div>
        </div>

        <div
          className={`relative z-10 flex flex-col items-center px-6 text-center text-white ${
            compact ? "pb-6" : "pb-8"
          }`}
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 18 }}
            className={`${
              compact ? "w-20 h-20 mb-2" : "w-24 h-24 md:w-28 md:h-28 mb-3"
            } bg-white rounded-2xl flex items-center justify-center shadow-2xl overflow-hidden ring-4 ring-white/90`}
          >
            <img
              src={logoUrl || SuperfastLogo}
              alt="Superfast"
              className="w-[88%] h-[88%] object-contain"
            />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            className={`font-black italic tracking-tight mb-1.5 drop-shadow-sm ${
              compact ? "text-xl" : "text-2xl md:text-3xl"
            }`}
          >
            SUPER FAST
          </motion.h1>

          <div className="flex items-center gap-2 justify-center">
            <div className="h-px w-6 md:w-8 bg-white/70" />
            <p className="text-[12px] sm:text-[14px] md:text-[15px] font-bold tracking-[0.08em] uppercase whitespace-nowrap">
              {subtitle || SUPERFAST_BRAND.tagline}
            </p>
            <div className="h-px w-6 md:w-8 bg-white/70" />
          </div>
        </div>
      </div>

      <div className="w-full overflow-hidden leading-[0] -mt-0.5">
        <svg viewBox="0 0 1440 100" preserveAspectRatio="none" className="w-full h-[36px] md:h-[52px] block">
          <defs>
            <linearGradient id="superfastAuthWave" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#FFC266" />
              <stop offset="55%" stopColor="#FF9A1A" />
              <stop offset="100%" stopColor="var(--primary-theme, #f97316)" />
            </linearGradient>
          </defs>
          <path
            d="M0,0 L1440,0 L1440,40 C1200,10 960,10 720,40 C480,80 240,80 0,40 Z"
            fill="url(#superfastAuthWave)"
          />
        </svg>
      </div>
    </div>
  )
}
