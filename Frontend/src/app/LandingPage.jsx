import React, { createContext, useContext, useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Link } from "react-router-dom"
import apiClient from "@/services/api/axios"
import { getCachedSettings, loadBusinessSettings } from "@common/utils/businessSettings"
import { mergeLanding } from "./landingDefaults"
import {
  MapPin,
  Clock,
  ShieldCheck,
  Bike,
  Store,
  TicketPercent,
  Wallet,
  Leaf,
  Star,
  Percent,
  BadgeCheck,
  Timer,
  Check,
} from "lucide-react"

// Play Store link is edited from Admin > Website Landing Content.
const PlayStoreContext = createContext("#")

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.6 },
}

const PlayIcon = ({ className = "w-6 h-6" }) => (
  <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
    <path fill="#00D7FE" d="M48 59.5v393c0 7 4 13 10 16l229-212.5v-.5L58 43.5c-6 3-10 9-10 16z" />
    <path fill="#00F076" d="M377 177 287 256l-.1.1L377 335l93-53.5c16-9.2 16-24.2 0-33.4L377 177z" />
    <path fill="#FF3A44" d="M287 256 58 468.5c6 3.5 14 3.5 22-1L377 335 287 256z" />
    <path fill="#FFD500" d="M377 177 80 44.5c-8-4.5-16-4.5-22-1L287 256l90-79z" />
  </svg>
)

/** Logo with a fallback chain: admin logo -> favicon -> first letter. */
function BrandLogo({ sources, name, className = "w-11 h-11", letterClass = "text-2xl" }) {
  const list = [...sources.filter(Boolean), "/favicon.png"]
  const key = list.join("|")
  const [idx, setIdx] = useState(0)
  useEffect(() => setIdx(0), [key])
  if (idx >= list.length) {
    return (
      <div className={`${className} bg-gradient-to-br from-orange-500 to-rose-500 rounded-xl flex items-center justify-center font-black text-white shadow-lg ${letterClass}`}>
        {name.charAt(0).toUpperCase()}
      </div>
    )
  }
  return <img src={list[idx]} alt={name} onError={() => setIdx((i) => i + 1)} className={`${className} rounded-xl object-contain`} />
}

function PlayStoreButton({ size = "lg", tone = "dark" }) {
  const dark = tone === "dark"
  const href = useContext(PlayStoreContext)
  return (
    <a
      href={href}
      aria-label="Get it on Google Play"
      className={`inline-flex items-center gap-3 rounded-2xl shadow-lg hover:scale-105 active:scale-95 transition-transform ${
        dark ? "bg-black text-white" : "bg-white text-black border border-gray-200"
      } ${size === "sm" ? "px-3 py-1.5" : "px-5 py-3"}`}
    >
      <PlayIcon className={size === "sm" ? "w-6 h-6" : "w-8 h-8"} />
      <span className="flex flex-col leading-none text-left">
        <span className={`uppercase tracking-wide ${size === "sm" ? "text-[8px]" : "text-[10px]"} opacity-80`}>Get it on</span>
        <span className={`font-bold ${size === "sm" ? "text-sm" : "text-xl"} mt-0.5`}>Google Play</span>
      </span>
    </a>
  )
}

/** Cross-fades through a list of images automatically. */
function Slideshow({ images, interval = 3200, fit = "contain", className = "" }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((p) => (p + 1) % images.length), interval)
    return () => clearInterval(t)
  }, [images.length, interval])
  return (
    <div className={`relative ${className}`}>
      <AnimatePresence mode="sync">
        <motion.img
          key={images[i]}
          src={images[i]}
          alt=""
          initial={{ opacity: 0, scale: 1.08 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.1 }}
          className={`absolute inset-0 w-full h-full mix-blend-multiply ${fit === "cover" ? "object-cover" : "object-contain"}`}
        />
      </AnimatePresence>
    </div>
  )
}

const APPS = [
  {
    id: "food",
    icon: Store,
    // orange
    accent: "#F97316",
    soft: "from-orange-50 via-white to-orange-100",
    chip: "bg-orange-100 text-orange-700",
    benefitIcons: [Clock, MapPin, TicketPercent, Star],
  },
  {
    id: "grocery",
    icon: Leaf,
    // green
    accent: "#16A34A",
    soft: "from-emerald-50 via-white to-green-100",
    chip: "bg-green-100 text-green-700",
    benefitIcons: [Timer, Leaf, Percent, Wallet],
  },
]

function AppSection({ app, index }) {
  const Icon = app.icon
  return (
    <section
      className={`md:sticky md:top-0 md:min-h-screen rounded-t-[40px] md:rounded-t-[56px] overflow-hidden bg-gradient-to-br ${app.soft} shadow-[0_-24px_60px_rgba(0,0,0,0.12)]`}
      style={{ zIndex: 20 + index * 10 }}
    >
      {/* soft accent glow */}
      <div className="absolute -top-24 -right-24 w-[28rem] h-[28rem] rounded-full blur-[110px] opacity-30" style={{ background: app.accent }} />
      <div className="relative max-w-7xl mx-auto px-6 pt-28 pb-16 md:pt-32 grid lg:grid-cols-2 gap-12 items-center md:min-h-screen">
        <div className="space-y-6">
          <motion.div {...fadeUp} className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm ${app.chip}`}>
            <Icon className="w-4 h-4" />
            {app.name}
          </motion.div>
          <motion.h2 {...fadeUp} className="text-4xl md:text-6xl font-black tracking-tight leading-[1.1]">
            {app.tagline}
          </motion.h2>
          <motion.p {...fadeUp} className="text-gray-600 text-lg font-medium max-w-xl">
            {app.text}
          </motion.p>

          <div className="grid sm:grid-cols-2 gap-4 pt-2">
            {app.benefits.map(({ title, desc }, i) => {
              const BIcon = app.benefitIcons[i] || Check
              return (
              <motion.div
                key={i}
                {...fadeUp}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="bg-white/80 backdrop-blur rounded-2xl border border-white p-4 shadow-sm"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: `${app.accent}1A` }}>
                  <BIcon className="w-5 h-5" style={{ color: app.accent }} />
                </div>
                <h4 className="font-bold">{title}</h4>
                <p className="text-sm text-gray-500 font-medium mt-1">{desc}</p>
              </motion.div>
              )
            })}
          </div>

          <motion.div {...fadeUp} className="pt-2">
            <PlayStoreButton />
          </motion.div>
        </div>

        <motion.div {...fadeUp} className="relative">
          <div className="absolute inset-0 m-auto w-[80%] h-[80%] rounded-full blur-3xl opacity-40" style={{ background: app.accent }} />
          <Slideshow images={app.images} className="relative h-[320px] md:h-[520px] w-full" />
        </motion.div>
      </div>
    </section>
  )
}

export default function LandingPage() {
  const [content, setContent] = useState(() => mergeLanding({}))
  const [biz, setBiz] = useState(() => getCachedSettings() || {})

  useEffect(() => {
    let alive = true
    apiClient
      .get("/common/settings/landing", { noCache: true })
      .then((res) => alive && setContent(mergeLanding(res?.data?.data)))
      .catch(() => {})
    loadBusinessSettings(true).then((s) => alive && s && setBiz(s)).catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const companyName = biz.companyName || "SUPERFAST"
  const bizLogo = biz.logo?.url || (typeof biz.logo === "string" ? biz.logo : "")
  // Admin > Website Landing Content logo wins; Business Settings logo is the fallback.
  const logoSources = [content.logo, bizLogo]
  const { hero, footer } = content
  const apps = APPS.map((t) => ({ ...t, ...content.apps[t.id] }))

  return (
    <PlayStoreContext.Provider value={content.playStoreUrl}>
    <div className="bg-slate-50 text-slate-900 font-sans overflow-x-clip relative">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-[100] bg-white/80 backdrop-blur-xl border-b border-gray-200/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <span className="group-hover:scale-105 transition-transform">
              <BrandLogo sources={logoSources} name={companyName} />
            </span>
            <span className="text-2xl font-black tracking-tighter italic text-gray-900 uppercase">{companyName}</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 font-semibold text-gray-600">
            <a href="#food" className="hover:text-orange-500">Food</a>
            <a href="#grocery" className="hover:text-green-600">Grocery</a>
            <a href="#partners" className="hover:text-gray-900">Partner with us</a>
          </div>
          <PlayStoreButton size="sm" />
        </div>
      </nav>

      {/* Hero (stays pinned while the app sections slide over it) */}
      <header className="relative md:sticky md:top-0 min-h-screen z-10 overflow-hidden bg-gradient-to-br from-orange-100 via-emerald-50 to-sky-100">
        <motion.div animate={{ x: [0, 40, 0], y: [0, 30, 0] }} transition={{ duration: 9, repeat: Infinity }} className="absolute top-[-120px] right-[-80px] w-[28rem] h-[28rem] bg-orange-400/50 blur-[110px] rounded-full" />
        <motion.div animate={{ x: [0, -30, 0], y: [0, -40, 0] }} transition={{ duration: 11, repeat: Infinity }} className="absolute bottom-[-120px] left-[-80px] w-[28rem] h-[28rem] bg-green-400/50 blur-[110px] rounded-full" />
        <motion.div animate={{ x: [0, 50, 0], y: [0, -20, 0] }} transition={{ duration: 13, repeat: Infinity }} className="absolute top-1/4 left-1/3 w-96 h-96 bg-blue-400/40 blur-[110px] rounded-full" />

        <div className="relative max-w-7xl mx-auto px-6 pt-32 pb-20 min-h-screen grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6 text-center lg:text-left">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 bg-white shadow-sm px-5 py-2 rounded-full text-sm font-bold border border-gray-200 text-gray-700"
            >
              <Bike className="w-4 h-4 text-orange-500" />
              {hero.badge}
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-5xl md:text-7xl font-black tracking-tight leading-[1.1]"
            >
              {hero.titleLead}{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 via-green-500 to-blue-500">
                {hero.titleHighlight}
              </span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-gray-500 text-lg md:text-xl max-w-xl mx-auto lg:mx-0 font-medium leading-relaxed"
            >
              {hero.subtitle}
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex justify-center lg:justify-start"
            >
              <PlayStoreButton />
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.7 }}
            className="relative"
          >
            <div className="absolute inset-0 m-auto w-[85%] h-[85%] rounded-full bg-gradient-to-br from-orange-200 via-green-200 to-blue-200 blur-3xl opacity-70" />
            <Slideshow images={hero.images} interval={2800} className="relative h-[340px] md:h-[520px] w-full" />
          </motion.div>
        </div>
      </header>

      {/* Stacked app sections: each one slides over the previous */}
      {apps.map((app, i) => (
        <div id={app.id} key={app.id}>
          <AppSection app={app} index={i} />
        </div>
      ))}

      {/* Why + partners + footer slide over the last app */}
      <div className="relative bg-gradient-to-br from-orange-50 via-white to-sky-50 rounded-t-[40px] md:rounded-t-[56px] shadow-[0_-24px_60px_rgba(0,0,0,0.12)] overflow-hidden" style={{ zIndex: 60 }}>
        <div className="absolute top-20 -left-24 w-80 h-80 bg-orange-300/30 blur-[100px] rounded-full" />
        <div className="absolute top-1/2 -right-24 w-80 h-80 bg-green-300/30 blur-[100px] rounded-full" />
        <div className="absolute bottom-20 left-1/3 w-80 h-80 bg-blue-300/30 blur-[100px] rounded-full" />
        <section className="relative px-6 pt-24 pb-16">
          <div className="max-w-6xl mx-auto">
            <motion.h2 {...fadeUp} className="text-4xl md:text-5xl font-black text-center mb-12">Why Superfast</motion.h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                [MapPin, "Live tracking", "Know exactly where your order is.", "#F97316"],
                [BadgeCheck, "Verified partners", "Trusted restaurants, stores and drivers.", "#16A34A"],
                [Wallet, "Secure payments", "UPI, cards and wallet with safe checkout.", "#2563EB"],
              ].map(([I, t, d, c], i) => (
                <motion.div key={t} {...fadeUp} transition={{ duration: 0.5, delay: i * 0.1 }} className="rounded-3xl bg-white/80 backdrop-blur border border-white p-8 text-center shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all">
                  <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4" style={{ background: `${c}1A` }}>
                    <I className="w-7 h-7" style={{ color: c }} />
                  </div>
                  <h4 className="font-bold text-lg mb-1">{t}</h4>
                  <p className="text-gray-500 font-medium">{d}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section id="partners" className="relative px-6 pb-20">
          <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-8">
            <motion.div {...fadeUp} className="rounded-3xl bg-orange-50 border border-orange-100 p-8">
              <Store className="w-10 h-10 text-orange-500 mb-4" />
              <h3 className="text-2xl font-black mb-2">Partner restaurant</h3>
              <p className="text-gray-600 font-medium mb-4">Grow your business and manage orders and menu from one dashboard.</p>
              <ul className="space-y-1 mb-6 text-gray-600 font-medium">
                <li className="flex gap-2"><Check className="w-5 h-5 text-orange-500" /> More customers nearby</li>
                <li className="flex gap-2"><Check className="w-5 h-5 text-orange-500" /> Easy order management</li>
              </ul>
              <Link to="/food/restaurant/login" className="font-bold text-orange-600">Join as restaurant →</Link>
            </motion.div>
            <motion.div {...fadeUp} transition={{ duration: 0.6, delay: 0.1 }} className="rounded-3xl bg-blue-50 border border-blue-100 p-8">
              <Bike className="w-10 h-10 text-blue-600 mb-4" />
              <h3 className="text-2xl font-black mb-2">Delivery partner</h3>
              <p className="text-gray-600 font-medium mb-4">Log in anytime, deliver nearby and earn on your own schedule.</p>
              <ul className="space-y-1 mb-6 text-gray-600 font-medium">
                <li className="flex gap-2"><Check className="w-5 h-5 text-blue-600" /> Flexible hours</li>
                <li className="flex gap-2"><Check className="w-5 h-5 text-blue-600" /> Earn on every delivery</li>
              </ul>
              <Link to="/food/delivery/login" className="font-bold text-blue-600">Become a delivery partner →</Link>
            </motion.div>
          </div>
          <div className="flex justify-center mt-14">
            <PlayStoreButton />
          </div>
        </section>

        <footer className="relative py-12 px-6 border-t border-gray-200/60 text-gray-500 font-medium">
          <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8 text-center md:text-left">
            <div>
              <div className="flex items-center justify-center md:justify-start gap-3 mb-3">
                <BrandLogo sources={logoSources} name={companyName} className="w-9 h-9" letterClass="text-lg" />
                <span className="text-xl font-black italic text-gray-900 uppercase">{companyName}</span>
              </div>
              <p className="text-sm">{footer.about}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm content-start">
              {footer.links.map((l) =>
                /^https?:\/\//i.test(l.url) ? (
                  <a key={l.label + l.url} href={l.url} target="_blank" rel="noreferrer" className="hover:text-gray-900">{l.label}</a>
                ) : (
                  <Link key={l.label + l.url} to={l.url} className="hover:text-gray-900">{l.label}</Link>
                )
              )}
            </div>
            <div className="text-sm space-y-1 md:text-right">
              {footer.email && <p><a href={`mailto:${footer.email}`} className="hover:text-gray-900">{footer.email}</a></p>}
              {footer.phone && <p><a href={`tel:${footer.phone.replace(/\s/g, "")}`} className="hover:text-gray-900">{footer.phone}</a></p>}
              {footer.address && <p>{footer.address}</p>}
            </div>
          </div>
          <p className="text-center text-sm mt-8">{footer.copyright || `© ${new Date().getFullYear()} ${companyName}. All rights reserved.`}</p>
        </footer>
      </div>
    </div>
    </PlayStoreContext.Provider>
  )
}
