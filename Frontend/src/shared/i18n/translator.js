/**
 * Runtime page translator.
 *
 * Translates every visible text node (plus placeholder/title/aria-label/alt) in the DOM
 * through the Google Cloud Translation API, using the same key as Google Maps
 * (VITE_GOOGLE_MAPS_API_KEY — "Cloud Translation API" must be enabled for that key).
 * Results are cached per language in localStorage. English restores the original text.
 */
import { DEFAULT_LANGUAGE } from "./languages"

const ENDPOINT = "https://translation.googleapis.com/language/translate/v2"
const CACHE_PREFIX = "i18nCache:v1:"
const MAX_CACHE_ENTRIES = 4000
const BATCH_SIZE = 100
const MAX_TEXT_LENGTH = 1000
const ATTRS = ["placeholder", "title", "aria-label", "alt"]
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE", "PRE", "SVG", "OPTION"])

const LETTER_RE = /\p{L}/u

let language = DEFAULT_LANGUAGE
let observer = null
let onError = null
let flushTimer = null
let errorShown = false
let cache = {}
let cacheDirty = false

const textRecords = new WeakMap() // Text node -> { orig, out }
const attrRecords = new WeakMap() // Element -> { [attr]: { orig, out } }
const pending = new Set() // Text nodes / [element, attr] entries waiting for translation

const getApiKey = () => String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim().replace(/^['"]|['"]$/g, "")

function loadCache(lang) {
  try {
    cache = JSON.parse(localStorage.getItem(CACHE_PREFIX + lang) || "{}") || {}
  } catch {
    cache = {}
  }
  cacheDirty = false
}

function saveCache() {
  if (!cacheDirty) return
  cacheDirty = false
  try {
    const keys = Object.keys(cache)
    if (keys.length > MAX_CACHE_ENTRIES) {
      keys.slice(0, keys.length - MAX_CACHE_ENTRIES).forEach((k) => delete cache[k])
    }
    localStorage.setItem(CACHE_PREFIX + language, JSON.stringify(cache))
  } catch {
    /* storage full / blocked — translations still work in memory */
  }
}

function isSkipped(el) {
  for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
    if (SKIP_TAGS.has(node.tagName?.toUpperCase())) return true
    if (node.isContentEditable) return true
    if (node.getAttribute?.("translate") === "no" || node.classList?.contains("notranslate")) return true
  }
  return false
}

function splitSpace(value) {
  const m = value.match(/^(\s*)([\s\S]*?)(\s*)$/)
  return { lead: m[1], core: m[2], trail: m[3] }
}

function translatable(core) {
  return core && core.length <= MAX_TEXT_LENGTH && LETTER_RE.test(core)
}

/* ---------- API ---------- */

async function requestTranslations(texts, lang) {
  const key = getApiKey()
  if (!key) throw new Error("VITE_GOOGLE_MAPS_API_KEY is not set")
  const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: texts, target: lang, format: "text" }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message || `Translation API HTTP ${res.status}`)
  }
  const json = await res.json()
  return (json?.data?.translations || []).map((t) => t.translatedText)
}

async function resolve(texts, lang) {
  const missing = [...new Set(texts.filter((t) => cache[t] === undefined))]
  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const chunk = missing.slice(i, i + BATCH_SIZE)
    const out = await requestTranslations(chunk, lang)
    if (lang !== language) return // language changed while waiting
    chunk.forEach((t, idx) => {
      cache[t] = out[idx] ?? t
    })
    cacheDirty = true
  }
  saveCache()
}

/* ---------- DOM walking ---------- */

function queueTextNode(node) {
  if (isSkipped(node.parentElement)) return
  let rec = textRecords.get(node)
  if (!rec || node.nodeValue !== rec.out) {
    rec = { orig: node.nodeValue, out: null }
    textRecords.set(node, rec)
  }
  if (language === DEFAULT_LANGUAGE) {
    restoreText(node, rec)
    return
  }
  if (translatable(splitSpace(rec.orig).core) && node.nodeValue !== rec.out) pending.add(node)
  else if (rec.out !== null && node.nodeValue === rec.out) pending.add(node) // re-translate for new language
}

function restoreText(node, rec) {
  if (rec.out !== null && node.nodeValue === rec.out) node.nodeValue = rec.orig
  rec.out = null
}

function queueAttrs(el) {
  if (isSkipped(el)) return
  let recs = attrRecords.get(el)
  for (const attr of ATTRS) {
    const value = el.getAttribute(attr)
    if (value == null) continue
    if (!recs) {
      recs = {}
      attrRecords.set(el, recs)
    }
    let rec = recs[attr]
    if (!rec || value !== rec.out) {
      rec = { orig: value, out: null }
      recs[attr] = rec
    }
    if (language === DEFAULT_LANGUAGE) {
      if (rec.out !== null && value === rec.out) el.setAttribute(attr, rec.orig)
      rec.out = null
    } else if (translatable(splitSpace(rec.orig).core)) {
      pending.add([el, attr])
    }
  }
}

function scan(root) {
  if (!root) return
  if (root.nodeType === 3) {
    queueTextNode(root)
  } else if (root.nodeType === 1) {
    if (isSkipped(root)) return
    queueAttrs(root)
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: (n) => (n.nodeType === 1 && isSkipped(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    })
    let n = walker.nextNode()
    while (n) {
      if (n.nodeType === 3) queueTextNode(n)
      else queueAttrs(n)
      n = walker.nextNode()
    }
  }
  scheduleFlush()
}

function scheduleFlush() {
  if (language === DEFAULT_LANGUAGE || pending.size === 0) {
    pending.clear()
    return
  }
  clearTimeout(flushTimer)
  flushTimer = setTimeout(flush, 120)
}

async function flush() {
  const lang = language
  const batch = [...pending]
  pending.clear()
  if (lang === DEFAULT_LANGUAGE || batch.length === 0) return

  const items = batch
    .map((entry) => {
      if (Array.isArray(entry)) {
        const [el, attr] = entry
        const rec = attrRecords.get(el)?.[attr]
        return rec ? { entry, rec, orig: rec.orig, apply: (v) => el.setAttribute(attr, v) } : null
      }
      const rec = textRecords.get(entry)
      return rec ? { entry, rec, orig: rec.orig, apply: (v) => (entry.nodeValue = v) } : null
    })
    .filter(Boolean)

  const cores = items.map((it) => splitSpace(it.orig).core)
  try {
    await resolve(cores, lang)
  } catch (err) {
    if (!errorShown) {
      errorShown = true
      console.warn("[i18n] Translation failed:", err?.message || err)
      onError?.(err)
    }
    return
  }
  if (lang !== language) return

  items.forEach((it, i) => {
    const translated = cache[cores[i]]
    if (translated === undefined) return
    const { lead, trail } = splitSpace(it.orig)
    const out = lead + translated + trail
    // skip if the node/attribute changed under us (React re-rendered)
    const current = Array.isArray(it.entry) ? it.entry[0].getAttribute(it.entry[1]) : it.entry.nodeValue
    if (current !== it.orig && current !== it.rec.out) return
    it.rec.out = out
    it.apply(out)
  })
}

function handleMutations(mutations) {
  for (const m of mutations) {
    if (m.type === "characterData") {
      const rec = textRecords.get(m.target)
      if (rec && m.target.nodeValue === rec.out) continue // our own write
      queueTextNode(m.target)
    } else if (m.type === "attributes") {
      const rec = attrRecords.get(m.target)?.[m.attributeName]
      if (rec && m.target.getAttribute(m.attributeName) === rec.out) continue
      queueAttrs(m.target)
    } else {
      m.addedNodes.forEach((n) => scan(n))
    }
  }
  scheduleFlush()
}

function startObserver() {
  if (observer || typeof MutationObserver === "undefined") return
  observer = new MutationObserver(handleMutations)
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS,
  })
}

/* ---------- public ---------- */

export function setTranslatorErrorHandler(fn) {
  onError = fn
}

export function applyLanguage(lang) {
  language = lang || DEFAULT_LANGUAGE
  errorShown = false
  if (typeof document === "undefined") return
  document.documentElement.setAttribute("lang", language)
  loadCache(language)
  pending.clear()
  clearTimeout(flushTimer)
  startObserver()
  // Re-scan the full page: restores originals for English, translates otherwise.
  scan(document.body)
}
