import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Plus, Trash2, Upload, Save, Loader2 } from "lucide-react"
import apiClient from "@/services/api/axios"
import { LANDING_DEFAULTS, mergeLanding } from "../../../../../app/landingDefaults"

const SETTINGS_URL = "/common/settings"
const APP_LABELS = { food: "Food (orange)", grocery: "Grocery (green)" }

const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  )
}

function ImageList({ title, images, onChange, single = false }) {
  const [busy, setBusy] = useState(false)

  const upload = async (file, index) => {
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append("image", file)
      const res = await apiClient.post(`${SETTINGS_URL}/landing/image`, fd, { contextModule: "admin" })
      const url = res?.data?.data?.url
      if (!url) throw new Error("No URL returned")
      const next = [...images]
      if (single) next.splice(0, next.length, url)
      else if (index === undefined) next.push(url)
      else next[index] = url
      onChange(next)
    } catch (e) {
      toast.error(e?.response?.data?.message || "Image upload failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-600">{title}{single ? "" : " (auto-rotating slideshow)"}</span>
        <label className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 cursor-pointer">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} {single ? "Upload logo" : "Add image"}
          <input type="file" accept="image/*" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = "" }} />
        </label>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {images.map((src, i) => (
          <div key={`${src}-${i}`} className="relative group rounded-xl border bg-gray-50 overflow-hidden aspect-square">
            <img src={src} alt="" className="w-full h-full object-contain" />
            <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/60 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <label className="text-white cursor-pointer" title="Replace">
                <Upload className="w-4 h-4" />
                <input type="file" accept="image/*" hidden onChange={(e) => { upload(e.target.files?.[0], i); e.target.value = "" }} />
              </label>
              <button type="button" className="text-white" title="Remove" onClick={() => onChange(images.filter((_, j) => j !== i))}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-400 mt-1">{single ? "Remove it to use the Business Settings logo." : "If you remove all images, the defaults are used."}</p>
    </div>
  )
}

export default function LandingContentSettings() {
  const [data, setData] = useState(() => mergeLanding({}))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiClient
      .get(`${SETTINGS_URL}/landing`, { noCache: true })
      .then((res) => setData(mergeLanding(res?.data?.data)))
      .catch(() => toast.error("Could not load landing page content"))
      .finally(() => setLoading(false))
  }, [])

  const set = (path, value) =>
    setData((prev) => {
      const next = structuredClone(prev)
      let o = next
      path.slice(0, -1).forEach((k) => (o = o[k]))
      o[path[path.length - 1]] = value
      return next
    })

  const save = async () => {
    setSaving(true)
    try {
      await apiClient.put(`${SETTINGS_URL}/landing`, { landingPage: data }, { contextModule: "admin" })
      toast.success("Landing page saved")
    } catch (e) {
      toast.error(e?.response?.data?.message || "Save failed")
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-10 text-gray-500">Loading...</div>

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Landing Page Content</h1>
          <p className="text-sm text-gray-500">
            Edit the public website (superfastfood.in). Logo, company name, email, phone and address come from Business Settings.
          </p>
        </div>
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold px-5 py-2.5 rounded-lg">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
        </button>
      </div>

      <section className="bg-white rounded-2xl border p-5 space-y-4">
        <h2 className="font-bold">General &amp; Hero</h2>
        <ImageList
          title="Website logo (first image is used; falls back to Business Settings logo)"
          images={data.logo ? [data.logo] : []}
          single
          onChange={(v) => set(["logo"], v[v.length - 1] || "")}
        />
        <Field label="Google Play Store URL">
          <input className={inputCls} value={data.playStoreUrl} placeholder="https://play.google.com/store/apps/details?id=..." onChange={(e) => set(["playStoreUrl"], e.target.value)} />
        </Field>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Badge text"><input className={inputCls} value={data.hero.badge} onChange={(e) => set(["hero", "badge"], e.target.value)} /></Field>
          <Field label="Heading (plain part)"><input className={inputCls} value={data.hero.titleLead} onChange={(e) => set(["hero", "titleLead"], e.target.value)} /></Field>
          <Field label="Heading (colourful part)"><input className={inputCls} value={data.hero.titleHighlight} onChange={(e) => set(["hero", "titleHighlight"], e.target.value)} /></Field>
          <Field label="Sub text"><input className={inputCls} value={data.hero.subtitle} onChange={(e) => set(["hero", "subtitle"], e.target.value)} /></Field>
        </div>
        <ImageList title="Hero images" images={data.hero.images} onChange={(v) => set(["hero", "images"], v)} />
      </section>

      {Object.keys(data.apps).map((key) => {
        const app = data.apps[key]
        return (
          <section key={key} className="bg-white rounded-2xl border p-5 space-y-4">
            <h2 className="font-bold">{APP_LABELS[key]}</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="App name"><input className={inputCls} value={app.name} onChange={(e) => set(["apps", key, "name"], e.target.value)} /></Field>
              <Field label="Tagline"><input className={inputCls} value={app.tagline} onChange={(e) => set(["apps", key, "tagline"], e.target.value)} /></Field>
            </div>
            <Field label="Description"><textarea rows={2} className={inputCls} value={app.text} onChange={(e) => set(["apps", key, "text"], e.target.value)} /></Field>
            <div className="grid md:grid-cols-2 gap-4">
              {app.benefits.map((b, i) => (
                <div key={i} className="rounded-xl bg-gray-50 border p-3 space-y-2">
                  <Field label={`Benefit ${i + 1} title`}><input className={inputCls} value={b.title} onChange={(e) => set(["apps", key, "benefits", i, "title"], e.target.value)} /></Field>
                  <Field label="Description"><input className={inputCls} value={b.desc} onChange={(e) => set(["apps", key, "benefits", i, "desc"], e.target.value)} /></Field>
                </div>
              ))}
            </div>
            <ImageList title={`${APP_LABELS[key]} images`} images={app.images} onChange={(v) => set(["apps", key, "images"], v)} />
          </section>
        )
      })}

      <section className="bg-white rounded-2xl border p-5 space-y-4">
        <h2 className="font-bold">Footer</h2>
        <Field label="About text"><textarea rows={2} className={inputCls} value={data.footer.about} onChange={(e) => set(["footer", "about"], e.target.value)} /></Field>
        <Field label="Copyright line (blank = automatic)">
          <input className={inputCls} value={data.footer.copyright} placeholder={`© ${new Date().getFullYear()} Superfast. All rights reserved.`} onChange={(e) => set(["footer", "copyright"], e.target.value)} />
        </Field>
        <div className="space-y-2">
          <span className="block text-xs font-semibold text-gray-600">Footer links</span>
          {data.footer.links.map((l, i) => (
            <div key={i} className="flex gap-2">
              <input className={inputCls} placeholder="Label" value={l.label} onChange={(e) => set(["footer", "links", i, "label"], e.target.value)} />
              <input className={inputCls} placeholder="/path or https://..." value={l.url} onChange={(e) => set(["footer", "links", i, "url"], e.target.value)} />
              <button type="button" className="text-red-500 px-2" onClick={() => set(["footer", "links"], data.footer.links.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-orange-600" onClick={() => set(["footer", "links"], [...data.footer.links, { label: "", url: "" }])}>
            <Plus className="w-4 h-4" /> Add link
          </button>
        </div>
        <button type="button" className="text-xs text-gray-500 underline" onClick={() => set(["footer", "links"], LANDING_DEFAULTS.footer.links)}>Reset links to default</button>
      </section>
    </div>
  )
}
