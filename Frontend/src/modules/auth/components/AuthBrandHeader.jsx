import { motion } from "framer-motion"
import { ArrowLeft } from "lucide-react"
import SuperfastLogo from "@/assets/Logo.webp"
import { getCachedSettings, getDynamicLogoUrl, getCompanyName } from "@common/utils/businessSettings"
import { SUPERFAST_BRAND } from "../constants/brand"

const PORTAL_THEMES = {
  user: {
    bg: SUPERFAST_BRAND.gradientSoft,
    accent1: SUPERFAST_BRAND.orange,
    accent2: SUPERFAST_BRAND.orangeDeep,
    waveStop1: "#FFC266",
    waveStop2: "#FF9A1A",
    waveStop3: SUPERFAST_BRAND.primary,
    title: "SUPER FAST",
    defaultSubtitle: SUPERFAST_BRAND.tagline,
  },
  seller: {
    bg: "linear-gradient(135deg, #16a34a 0%, #15803d 50%, #14532d 100%)",
    accent1: "#22c55e",
    accent2: "#14532d",
    waveStop1: "#4ade80",
    waveStop2: "#16a34a",
    waveStop3: "#15803d",
    title: "SUPER FAST",
    defaultSubtitle: "Seller Partner Portal",
  },
  restaurant: {
    bg: "linear-gradient(135deg, #49AB14 0%, #3e9311 50%, #347d0d 100%)",
    accent1: "#5ec427",
    accent2: "#347d0d",
    waveStop1: "#72d63c",
    waveStop2: "#49AB14",
    waveStop3: "#38840f",
    title: "SUPER FAST",
    defaultSubtitle: "Restaurant Partner Portal",
  },
  delivery: {
    bg: "linear-gradient(135deg, #005b96 0%, #004b7c 50%, #00365a 100%)",
    accent1: "#0074bf",
    accent2: "#00365a",
    waveStop1: "#3385c6",
    waveStop2: "#005b96",
    waveStop3: "#004b7c",
    title: "SUPER FAST",
    defaultSubtitle: "Delivery Partner Portal",
  },
}

export default function AuthBrandHeader({
  compact = false,
  subtitle,
  portalType = "user",
  showBack = false,
  onBack,
  customTitle,
}) {
  const settings = getCachedSettings()
  const logoUrl = getDynamicLogoUrl(settings) || null
  const companyName = getCompanyName(settings) || "SUPER FAST"

  const theme = PORTAL_THEMES[portalType] || PORTAL_THEMES.user
  const displayTitle = customTitle || (portalType !== "user" ? companyName.toUpperCase() : theme.title)
  const displaySubtitle = subtitle || theme.defaultSubtitle
  const gradientId = `authWave_${portalType}`

  return (
    <div className="w-full flex flex-col shrink-0 z-10 drop-shadow-md">
      <div
        className={`w-full relative overflow-hidden pb-4 ${compact ? "pt-6" : "pt-8"}`}
        style={{ background: theme.bg }}
      >
        {/* Back Button */}
        {showBack && (
          <button
            type="button"
            onClick={onBack}
            className="absolute top-6 left-6 p-2 bg-white/20 hover:bg-white/30 text-white rounded-full transition-all duration-200 z-20 backdrop-blur-md"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}

        <div className="absolute inset-0 z-0 pointer-events-none">
          <div
            className="absolute -top-16 -right-10 w-72 h-72 rounded-full blur-3xl opacity-35"
            style={{ background: theme.accent1 }}
          />
          <div
            className="absolute -bottom-20 -left-16 w-80 h-80 rounded-full blur-3xl opacity-30"
            style={{ background: theme.accent2 }}
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
            } flex items-center justify-center overflow-hidden rounded-2xl`}
          >
            <img
              src={logoUrl || SuperfastLogo}
              alt="Superfast"
              className="w-full h-full object-contain drop-shadow-md rounded-2xl"
            />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            className={`font-black italic tracking-tight mb-1.5 drop-shadow-sm ${
              compact ? "text-xl" : "text-2xl md:text-3xl"
            }`}
          >
            {displayTitle}
          </motion.h1>

          <div className="flex items-center gap-2 justify-center">
            <div className="h-px w-6 md:w-8 bg-white/70" />
            <p className="text-[12px] sm:text-[14px] md:text-[15px] font-bold tracking-[0.08em] uppercase whitespace-nowrap">
              {displaySubtitle}
            </p>
            <div className="h-px w-6 md:w-8 bg-white/70" />
          </div>
        </div>
      </div>

      <div className="w-full overflow-hidden leading-[0] -mt-0.5">
        <svg viewBox="0 0 1440 100" preserveAspectRatio="none" className="w-full h-[36px] md:h-[52px] block">
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={theme.waveStop1} />
              <stop offset="55%" stopColor={theme.waveStop2} />
              <stop offset="100%" stopColor={theme.waveStop3} />
            </linearGradient>
          </defs>
          <path
            d="M0,0 L1440,0 L1440,40 C1200,10 960,10 720,40 C480,80 240,80 0,40 Z"
            fill={`url(#${gradientId})`}
          />
        </svg>
      </div>
    </div>
  )
}
