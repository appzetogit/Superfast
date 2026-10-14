import { useState } from "react"
import apiClient from "@/services/api/axios.js"

/**
 * Public account-deletion page (no login). This is the URL given to Google Play as the
 * "Account deletion link" in the Data safety form:  https://superfastfood.in/account-deletion
 */

const SUPPORT_EMAIL = "superfastfooddelivery509@gmail.com"

const ACCOUNT_TYPES = [
  { id: "user", title: "Customer", app: "SuperFast App", hint: "You order food" },
  { id: "restaurant", title: "Restaurant partner", app: "SuperFast Partner App", hint: "You run a restaurant" },
  { id: "delivery", title: "Delivery partner", app: "SuperFast Delivery", hint: "You deliver orders" },
  { id: "seller", title: "Vendor", app: "SuperFast Vendor", hint: "You sell products" },
]

const DELETED = [
  "Your name, mobile number and email",
  "Saved addresses, profile photo and date of birth",
  "Identity and bank / UPI details you gave us",
  "Push-notification tokens and login sessions",
  "For restaurants: your profile, menu and categories",
]

const KEPT = [
  "Order and payment records, with your personal details removed, because tax and accounting law requires them",
  "Records needed to prevent fraud and settle disputes, with personal details removed",
]

const errText = (e) => e?.response?.data?.message || e?.message || "Something went wrong. Please try again."

export default function AccountDeletion() {
  const [role, setRole] = useState("user")
  const [phone, setPhone] = useState("")
  const [otp, setOtp] = useState("")
  const [step, setStep] = useState("phone") // phone | otp | done
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")
  const [blockers, setBlockers] = useState([])
  const [proof, setProof] = useState("")
  const [walletBalance, setWalletBalance] = useState(null)
  const [consent, setConsent] = useState(false)

  const digits = phone.replace(/\D/g, "").slice(-10)
  const selected = ACCOUNT_TYPES.find((t) => t.id === role)

  const resetFlow = () => {
    setStep("phone")
    setOtp("")
    setError("")
    setInfo("")
    setBlockers([])
    setProof("")
    setWalletBalance(null)
    setConsent(false)
  }

  const sendOtp = async () => {
    setError("")
    setInfo("")
    if (digits.length !== 10) {
      setError("Enter your 10-digit mobile number")
      return
    }
    setBusy(true)
    try {
      await apiClient.post("/food/auth/account-deletion/request-otp", { role, phone: digits })
      setStep("otp")
      setInfo(`If an account exists for ${digits}, we have sent a 6-digit OTP by SMS.`)
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async () => {
    setError("")
    if (!proof && !otp.trim()) {
      setError("Enter the OTP")
      return
    }
    setBusy(true)
    try {
      const res = await apiClient.post("/food/auth/account-deletion/confirm", {
        role,
        phone: digits,
        ...(proof ? { token: proof } : { otp: otp.trim() }),
        acceptWalletForfeit: consent,
      })
      const data = res?.data?.data || {}
      if (data.deleted) {
        setStep("done")
        return
      }
      if (data.token) setProof(data.token)
      if (data.needsWalletConsent) {
        setWalletBalance(data.walletBalance)
        setBlockers([])
      } else if (data.blockers?.length) {
        setBlockers(data.blockers)
        setWalletBalance(null)
      }
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const card = "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
  const input =
    "w-full rounded-xl border border-gray-300 px-4 py-3 text-base text-gray-900 outline-none focus:border-[#CB202D] focus:ring-2 focus:ring-[#CB202D]/20"

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-5">
          <p className="text-sm font-bold uppercase tracking-widest text-[#CB202D]">SuperFast</p>
          <h1 className="mt-1 text-2xl font-black sm:text-3xl">Delete your account</h1>
          <p className="mt-2 text-sm text-gray-600">
            This page lets you delete your SuperFast account and personal data. It works for all our apps and you do not
            need to log in or install anything.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        {/* Delete on the web */}
        <section className={card} aria-labelledby="web-delete">
          <h2 id="web-delete" className="text-lg font-bold">
            Delete your account here
          </h2>

          {step === "done" ? (
            <div className="mt-4 rounded-xl bg-green-50 p-4 text-green-900">
              <p className="font-bold">Your account has been deleted.</p>
              <p className="mt-1 text-sm">
                Your personal data has been erased and you have been signed out everywhere. You can create a new account
                any time with the same number.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-gray-700">1. Which account?</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {ACCOUNT_TYPES.map((t) => (
                    <label
                      key={t.id}
                      className={`cursor-pointer rounded-xl border p-3 transition-colors ${
                        role === t.id ? "border-[#CB202D] bg-red-50" : "border-gray-200 hover:bg-gray-50"
                      } ${step !== "phone" ? "pointer-events-none opacity-60" : ""}`}
                    >
                      <input
                        type="radio"
                        name="role"
                        className="sr-only"
                        checked={role === t.id}
                        onChange={() => setRole(t.id)}
                      />
                      <span className="block font-bold">{t.title}</span>
                      <span className="block text-xs text-gray-500">
                        {t.app} · {t.hint}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label htmlFor="del-phone" className="mb-2 block text-sm font-semibold text-gray-700">
                  2. Mobile number of the {selected.title.toLowerCase()} account
                </label>
                <input
                  id="del-phone"
                  className={input}
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="10-digit mobile number"
                  value={phone}
                  disabled={step !== "phone"}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              {step === "phone" && (
                <button
                  type="button"
                  onClick={sendOtp}
                  disabled={busy}
                  className="w-full rounded-xl bg-[#CB202D] px-4 py-3 font-bold text-white disabled:opacity-60"
                >
                  {busy ? "Sending..." : "Send OTP"}
                </button>
              )}

              {step === "otp" && (
                <div className="space-y-3">
                  {!proof && (
                    <div>
                      <label htmlFor="del-otp" className="mb-2 block text-sm font-semibold text-gray-700">
                        3. Enter the OTP
                      </label>
                      <input
                        id="del-otp"
                        className={input}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="OTP"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                      />
                    </div>
                  )}

                  {walletBalance !== null && (
                    <label className="flex items-start gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                      />
                      <span>
                        My wallet has <b>₹{Number(walletBalance).toFixed(2)}</b>. I understand it will be lost when I delete
                        the account.
                      </span>
                    </label>
                  )}

                  {blockers.length > 0 && (
                    <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                      <p className="font-bold">We can't delete the account yet:</p>
                      <ul className="mt-1 list-disc pl-5">
                        {blockers.map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                      <p className="mt-2">Fix this in the app, then come back and try again.</p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={resetFlow}
                      disabled={busy}
                      className="flex-1 rounded-xl border border-gray-300 px-4 py-3 font-semibold text-gray-700"
                    >
                      Start over
                    </button>
                    <button
                      type="button"
                      onClick={confirmDelete}
                      disabled={busy || (walletBalance !== null && !consent) || blockers.length > 0}
                      className="flex-1 rounded-xl bg-red-700 px-4 py-3 font-bold text-white disabled:opacity-50"
                    >
                      {busy ? "Deleting..." : "Delete my account"}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">This cannot be undone.</p>
                </div>
              )}

              {info && <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">{info}</p>}
              {error && (
                <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}
            </div>
          )}
        </section>

        {/* Delete in the app */}
        <section className={card} aria-labelledby="app-delete">
          <h2 id="app-delete" className="text-lg font-bold">
            Or delete it inside the app
          </h2>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-gray-700">
            <li>Open the app and log in.</li>
            <li>
              Go to <b>Profile</b> (restaurants: <b>Outlet info</b>).
            </li>
            <li>
              Tap <b>Delete account</b>, type <b>DELETE</b> and confirm.
            </li>
          </ol>
        </section>

        {/* What happens */}
        <section className={card} aria-labelledby="what-happens">
          <h2 id="what-happens" className="text-lg font-bold">
            What happens to your data
          </h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-bold text-red-700">Deleted immediately</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
                {DELETED.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-800">Kept (without your personal details)</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
                {KEPT.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-4 text-sm text-gray-600">
            Money: restaurants and delivery partners must withdraw any balance (and delivery partners must deposit
            collected cash) before deleting. Customers lose any remaining wallet balance.
          </p>
        </section>

        <section className={card}>
          <h2 className="text-lg font-bold">Need help?</h2>
          <p className="mt-2 text-sm text-gray-700">
            If you cannot receive the OTP or have any question, email us at{" "}
            <a className="font-semibold text-[#CB202D] underline" href={`mailto:${SUPPORT_EMAIL}?subject=Account%20deletion%20request`}>
              {SUPPORT_EMAIL}
            </a>{" "}
            from the email linked to your account and mention your mobile number.
          </p>
        </section>
      </main>
    </div>
  )
}
