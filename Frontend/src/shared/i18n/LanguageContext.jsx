import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { useLocation } from "react-router-dom"
import { Globe } from "lucide-react"
import { DEFAULT_LANGUAGE, LANGUAGES, isSupportedLanguage } from "./languages"
import { applyLanguage, setTranslatorErrorHandler } from "./translator"

const STORAGE_KEY = "appLanguage"

const LanguageContext = createContext({
  language: DEFAULT_LANGUAGE,
  hasChosen: true,
  setLanguage: () => {},
})

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v && isSupportedLanguage(v) ? v : null
  } catch {
    return null
  }
}

export function LanguageProvider({ children }) {
  const [stored] = useState(readStored)
  const [language, setLanguageState] = useState(stored || DEFAULT_LANGUAGE)
  const [hasChosen, setHasChosen] = useState(Boolean(stored))

  useEffect(() => {
    // Translation is a best-effort enhancement: on failure the original text stays
    // visible, so don't show users a technical error toast (details go to console).
    setTranslatorErrorHandler(() => {})
  }, [])

  useEffect(() => {
    applyLanguage(language)
  }, [language])

  const setLanguage = useCallback((code) => {
    if (!isSupportedLanguage(code)) return
    try {
      localStorage.setItem(STORAGE_KEY, code)
    } catch {
      /* ignore */
    }
    setHasChosen(true)
    setLanguageState(code)
  }, [])

  const value = useMemo(() => ({ language, hasChosen, setLanguage }), [language, hasChosen, setLanguage])

  return (
    <LanguageContext.Provider value={value}>
      {children}
      <FirstRunLanguagePicker />
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => useContext(LanguageContext)

/** Grid of language buttons. Language names stay in their own script (never translated). */
function LanguageGrid({ value, onPick }) {
  return (
    <div className="notranslate grid grid-cols-2 gap-2" translate="no">
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => onPick(l.code)}
          className={`rounded-xl border px-3 py-3 text-left transition-colors ${
            value === l.code
              ? "border-[#CB202D] bg-red-50 text-[#CB202D]"
              : "border-gray-200 bg-white text-gray-900 hover:bg-gray-50"
          }`}
        >
          <span className="block text-base font-bold leading-tight">{l.label}</span>
          <span className="block text-xs text-gray-500">{l.english}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * Shown once, on first launch (before login / permission prompts) for the user,
 * restaurant, delivery and seller apps. Admin screens are excluded.
 */
function FirstRunLanguagePicker() {
  const { hasChosen, language, setLanguage } = useLanguage()
  const { pathname } = useLocation()
  const [splashDone, setSplashDone] = useState(() => {
    try {
      return Boolean(sessionStorage.getItem("hasSeenSplash"))
    } catch {
      return true
    }
  })

  useEffect(() => {
    if (splashDone || hasChosen) return
    const id = setInterval(() => {
      try {
        if (sessionStorage.getItem("hasSeenSplash")) setSplashDone(true)
      } catch {
        setSplashDone(true)
      }
    }, 400)
    return () => clearInterval(id)
  }, [splashDone, hasChosen])

  if (hasChosen || !splashDone || /\/admin(\/|$)|^\/(account-deletion|delete-account)/.test(pathname)) return null

  return (
    <div className="fixed inset-0 z-[100000] flex items-end justify-center bg-black/50 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
        <h2 className="text-xl font-black text-gray-900">Choose your language</h2>
        <p className="mb-4 mt-1 text-sm text-gray-500">
          The whole app will be shown in this language. You can change it later in Settings.
        </p>
        <LanguageGrid value={language} onPick={setLanguage} />
      </div>
    </div>
  )
}

/** Drop-in settings control: label + native select. Use inside any profile/settings page. */
export function LanguageSelector({ className = "" }) {
  const { language, setLanguage } = useLanguage()
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <span className="text-sm font-bold">Language</span>
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        translate="no"
        className="notranslate max-w-[60%] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900"
        aria-label="Language"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label} ({l.english})
          </option>
        ))}
      </select>
    </div>
  )
}

/** Compact globe + select for top bars (e.g. admin navbar). */
export function LanguageMenu({ className = "" }) {
  const { language, setLanguage } = useLanguage()
  return (
    <label
      className={`notranslate flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-bold text-neutral-700 ${className}`}
      translate="no"
    >
      <Globe className="h-4 w-4 shrink-0" />
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        className="cursor-pointer bg-transparent outline-none"
        aria-label="Language"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  )
}
