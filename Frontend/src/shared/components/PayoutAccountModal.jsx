import { useCallback, useEffect, useRef, useState } from "react"
import { restaurantAPI, deliveryAPI } from "@food/api"

/**
 * Collects bank / UPI details, has the bank verify them (Razorpay X penny-drop), shows the REAL
 * account-holder name and asks the user to confirm it. Withdrawals are paid only to a confirmed account,
 * so money can never go to a wrong or someone else's account.
 *
 * Props: kind = "restaurant" | "delivery", open, onClose, onVerified()
 */
const apiFor = (kind) => (kind === "delivery" ? deliveryAPI : restaurantAPI)
const unwrap = (res) => res?.data?.data || {}
const errMsg = (e) => e?.response?.data?.message || e?.message || "Something went wrong. Please try again."

export default function PayoutAccountModal({ kind, open, onClose, onVerified }) {
  const api = apiFor(kind)
  const [state, setState] = useState(null) // server view of the payout account
  const [mode, setMode] = useState("bank") // bank | upi
  const [form, setForm] = useState({ accountHolderName: "", accountNumber: "", confirmAccountNumber: "", ifsc: "", upiId: "" })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const pollRef = useRef(null)

  const refresh = useCallback(async () => {
    try {
      const view = unwrap(await api.getPayoutAccount())
      setState(view)
      return view
    } catch (e) {
      setError(errMsg(e))
      return null
    }
  }, [api])

  useEffect(() => {
    if (!open) return undefined
    setError("")
    refresh()
    return () => clearInterval(pollRef.current)
  }, [open, refresh])

  // while the bank is still checking, poll every 3s
  useEffect(() => {
    clearInterval(pollRef.current)
    if (open && state?.status === "pending") {
      pollRef.current = setInterval(refresh, 3000)
    }
    return () => clearInterval(pollRef.current)
  }, [open, state?.status, refresh])

  if (!open) return null

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async () => {
    setError("")
    if (mode === "bank") {
      if (form.accountNumber.replace(/\s/g, "") !== form.confirmAccountNumber.replace(/\s/g, "")) {
        setError("Account numbers do not match")
        return
      }
    }
    setBusy(true)
    try {
      const body =
        mode === "bank"
          ? { accountHolderName: form.accountHolderName, accountNumber: form.accountNumber, ifsc: form.ifsc }
          : { upiId: form.upiId, accountHolderName: form.accountHolderName }
      setState(unwrap(await api.savePayoutAccount(body)))
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    setBusy(true)
    setError("")
    try {
      setState(unwrap(await api.confirmPayoutAccount()))
      onVerified?.()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const startOver = async () => {
    setBusy(true)
    setError("")
    try {
      setState(unwrap(await api.resetPayoutAccount()))
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const status = state?.status || "none"
  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-black"
  const btnPrimary = "flex-1 rounded-lg bg-black px-4 py-3 text-sm font-semibold text-white disabled:bg-gray-300"
  const btnGhost = "flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700"

  return (
    <div className="fixed inset-0 z-[100001] flex items-end justify-center bg-black/50 sm:items-center">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 text-gray-900 shadow-2xl sm:rounded-3xl">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">Payout account</h2>
            <p className="text-xs text-gray-500">We verify your account with a ₹1 test so your money always reaches you.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="px-2 text-2xl leading-none text-gray-400">
            ×
          </button>
        </div>

        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {state && state.autoPayoutEnabled === false && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Automatic payouts are not enabled yet. Your withdrawal will be paid manually by the team.
          </p>
        )}

        {/* 1) no account yet, or the last attempt failed -> form */}
        {state?.autoPayoutEnabled !== false && ["none", "failed", "name_mismatch"].includes(status) && (
          <div className="space-y-3">
            {status !== "none" && state?.failureReason && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.failureReason}</p>
            )}

            <div className="flex rounded-lg bg-gray-100 p-1 text-sm font-semibold">
              {[
                ["bank", "Bank account"],
                ["upi", "UPI ID"],
              ].map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`flex-1 rounded-md py-2 ${mode === m ? "bg-white shadow" : "text-gray-500"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Account holder name (as on bank / UPI)</label>
              <input className={inputCls} value={form.accountHolderName} onChange={set("accountHolderName")} placeholder="e.g. Rahul Sharma" />
            </div>

            {mode === "bank" ? (
              <>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-600">Account number</label>
                  <input className={inputCls} inputMode="numeric" value={form.accountNumber} onChange={set("accountNumber")} placeholder="Account number" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-600">Re-enter account number</label>
                  <input className={inputCls} inputMode="numeric" value={form.confirmAccountNumber} onChange={set("confirmAccountNumber")} placeholder="Re-enter account number" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-600">IFSC code</label>
                  <input className={inputCls} value={form.ifsc} onChange={(e) => setForm((f) => ({ ...f, ifsc: e.target.value.toUpperCase() }))} placeholder="e.g. SBIN0001234" maxLength={11} />
                </div>
              </>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600">UPI ID</label>
                <input className={inputCls} value={form.upiId} onChange={set("upiId")} placeholder="name@bank" />
              </div>
            )}

            <button type="button" className={`${btnPrimary} w-full`} disabled={busy} onClick={submit}>
              {busy ? "Verifying..." : "Verify account"}
            </button>
          </div>
        )}

        {/* 2) bank is checking */}
        {status === "pending" && (
          <div className="py-8 text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-b-2 border-black" />
            <p className="text-sm font-semibold">Verifying with your bank...</p>
            <p className="mt-1 text-xs text-gray-500">This usually takes a few seconds.</p>
          </div>
        )}

        {/* 3) verified: show the real name and ask to confirm */}
        {status === "verified" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-green-200 bg-green-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-green-700">Account found</p>
              <p className="mt-1 text-xl font-bold">{state.registeredName}</p>
              <p className="mt-1 text-sm text-gray-600">
                {state.kind === "bank" ? `Account ${state.maskedAccount} · ${state.ifsc}` : `UPI ${state.maskedAccount}`}
              </p>
            </div>
            <p className="text-sm text-gray-700">
              Your withdrawals will be sent to this account. <b>Is this your account?</b>
            </p>
            {state.confirmed ? (
              <p className="rounded-lg bg-green-100 px-3 py-2 text-sm font-semibold text-green-800">Confirmed. You can withdraw now.</p>
            ) : (
              <div className="flex gap-3">
                <button type="button" className={btnGhost} disabled={busy} onClick={startOver}>
                  No, change details
                </button>
                <button type="button" className={btnPrimary} disabled={busy} onClick={confirm}>
                  Yes, this is mine
                </button>
              </div>
            )}
            {state.confirmed && (
              <div className="flex gap-3">
                <button type="button" className={btnGhost} disabled={busy} onClick={startOver}>
                  Change account
                </button>
                <button type="button" className={btnPrimary} onClick={() => onVerified?.()}>
                  Continue
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
