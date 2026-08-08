import { useEffect, useState } from "react"
import { ShieldCheck, Clock3, CheckCircle2 } from "lucide-react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { deliveryAPI } from "@food/api"
import { toast } from "sonner"

export default function PendingVerification() {
  const navigate = useNavigate()
  const location = useLocation()
  const [checking, setChecking] = useState(false)
  const phone =
    location.state?.phone ||
    sessionStorage.getItem("deliveryPendingPhone") ||
    ""

  useEffect(() => {
    let timer = null
    const checkApprovalStatus = async () => {
      try {
        setChecking(true)
        const response = await deliveryAPI.getProfile()
        if (response?.data?.success && response?.data?.data?.profile) {
          const profile = response.data.data.profile
          const status = String(profile.status || "").toLowerCase()
          if (["approved", "active"].includes(status)) {
            toast.success("🎉 Application Approved!", {
              description: "Your delivery partner profile has been activated! Welcome aboard.",
              duration: 6000
            })
            navigate("/food/delivery/welcome", { replace: true })
          }
        }
      } catch (err) {
        // Silently ignore polling errors
      } finally {
        setChecking(false)
      }
    }

    checkApprovalStatus()
    timer = setInterval(checkApprovalStatus, 5000)

    return () => {
      if (timer) clearInterval(timer)
    }
  }, [navigate])

  return (
    <div className="min-h-screen bg-[#f8faf8] px-6 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md flex-col justify-center">
        <div className="rounded-[28px] border border-[#d8e7d8] bg-white p-7 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#e9f8ef] text-[#00B761]">
            <ShieldCheck className="h-8 w-8" />
          </div>

          <div className="space-y-3">
            <p className="inline-flex items-center gap-2 rounded-full bg-[#f3faf5] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#0f7a42]">
              <Clock3 className="h-3.5 w-3.5" />
              Verification In Progress
            </p>

            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              Your delivery profile is under review
            </h1>

            <p className="text-sm leading-6 text-slate-600">
              Your onboarding is complete. Our team will verify your documents and activate your account after approval.
            </p>

            {phone ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Registered Number
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{phone}</p>
              </div>
            ) : null}
          </div>

          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={() => navigate("/food/delivery/login", { replace: true })}
              className="w-full rounded-2xl bg-[#00B761] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[#00A055]"
            >
              Back to Login
            </button>

            <p className="text-center text-xs leading-5 text-slate-500">
              Auto-checking approval status... You will be redirected automatically upon approval.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
