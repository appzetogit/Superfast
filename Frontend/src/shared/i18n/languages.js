export const DEFAULT_LANGUAGE = "en"

// `label` is the language's own name (never translated), `english` is for search/aria.
export const LANGUAGES = [
  { code: "en", label: "English", english: "English" },
  { code: "hi", label: "हिन्दी", english: "Hindi" },
  { code: "bn", label: "বাংলা", english: "Bengali" },
  { code: "mr", label: "मराठी", english: "Marathi" },
  { code: "gu", label: "ગુજરાતી", english: "Gujarati" },
  { code: "ta", label: "தமிழ்", english: "Tamil" },
  { code: "te", label: "తెలుగు", english: "Telugu" },
  { code: "kn", label: "ಕನ್ನಡ", english: "Kannada" },
  { code: "ml", label: "മലയാളം", english: "Malayalam" },
  { code: "pa", label: "ਪੰਜਾਬੀ", english: "Punjabi" },
  { code: "or", label: "ଓଡ଼ିଆ", english: "Odia" },
  { code: "ur", label: "اردو", english: "Urdu" },
]

export const isSupportedLanguage = (code) => LANGUAGES.some((l) => l.code === code)
