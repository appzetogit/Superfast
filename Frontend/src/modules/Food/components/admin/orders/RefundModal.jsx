import { useEffect, useState } from "react"
import { Wallet } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@food/components/ui/dialog"
import { Button } from "@food/components/ui/button"

export default function RefundModal({ isOpen, onOpenChange, order, onConfirm, isProcessing }) {
  const [refundAmount, setRefundAmount] = useState("")
  const [refundTo, setRefundTo] = useState("gateway")
  const [error, setError] = useState("")

  useEffect(() => {
    if (order && isOpen) {
      setRefundAmount(String(order.totalAmount || 0))
      setRefundTo(
        order?.refundPreference?.requestedMethod ||
          (order.paymentType === "Wallet" || order.payment?.method === "wallet" ? "wallet" : "gateway"),
      )
      setError("")
    }
  }, [order, isOpen])

  const handleAmountChange = (e) => {
    const value = e.target.value
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setRefundAmount(value)
      setError("")
    }
  }

  const handleConfirm = () => {
    const amount = parseFloat(refundAmount)
    const maxAmount = order?.totalAmount || 0

    if (!refundAmount || refundAmount.trim() === "") {
      setError("Refund amount is required")
      return
    }

    if (Number.isNaN(amount) || amount <= 0) {
      setError("Please enter a valid refund amount")
      return
    }

    if (amount > maxAmount) {
      setError(`Refund amount cannot exceed Rs. ${maxAmount.toFixed(2)}`)
      return
    }

    onConfirm(amount, refundTo)
  }

  const handleClose = () => {
    if (!isProcessing) {
      setRefundAmount("")
      setRefundTo("gateway")
      setError("")
      onOpenChange(false)
    }
  }

  if (!order) return null

  const maxAmount = order.totalAmount || 0
  const isWalletPayment = order.paymentType === "Wallet" || order.payment?.method === "wallet"
  const isOnlinePayment = ["razorpay", "razorpay_qr"].includes(String(order.payment?.method || "").toLowerCase())
  const isPartialOnlineRefund = order.refundPolicy?.allowPartialRefund
  const refundMethodLocked = Boolean(order?.refundPreference?.requestedByUser && order?.refundPreference?.requestedMethod)
  const allowsMethodSelection = isOnlinePayment && !isWalletPayment
  const supportsCustomAmount = isPartialOnlineRefund

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl md:max-w-3xl p-6 sm:p-8 rounded-3xl border-0 shadow-2xl bg-white overflow-hidden">
        <DialogHeader className="pb-4 border-b border-slate-100">
          <DialogTitle className="flex items-center gap-3 text-2xl font-extrabold text-slate-900">
            <div className="p-2.5 rounded-2xl bg-purple-100/80 text-purple-600 flex items-center justify-center">
              <Wallet className="w-7 h-7" />
            </div>
            <span>{isWalletPayment ? "Wallet Refund" : "Process Order Refund"}</span>
          </DialogTitle>
          <DialogDescription className="text-slate-600 text-sm mt-2 flex flex-wrap items-center gap-2">
            <span>Order ID:</span>
            <span className="font-bold text-slate-900 bg-slate-100 px-3 py-1 rounded-lg text-sm tracking-wide">
              {order.orderId}
            </span>
            <span className="block w-full mt-1 text-slate-500 font-medium">
              {isPartialOnlineRefund
                ? "User cancelled after 30 seconds. You can specify a partial or full refund amount below."
                : "This order is eligible for a full refund."}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-5">
          <div className="space-y-2.5">
            <label className="text-sm font-bold text-slate-800 tracking-wide uppercase">
              Refund Amount (INR)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-extrabold text-lg">
                ₹
              </span>
              <input
                type="text"
                value={refundAmount}
                onChange={handleAmountChange}
                placeholder="0.00"
                disabled={isProcessing || !supportsCustomAmount}
                className={`w-full rounded-2xl border-2 py-3.5 pl-11 pr-5 text-xl font-bold transition-all focus:outline-none focus:ring-4 ${
                  error
                    ? "border-red-300 focus:border-red-500 focus:ring-red-100 text-red-900"
                    : "border-slate-200 focus:border-purple-600 focus:ring-purple-100 text-slate-900"
                } ${isProcessing || !supportsCustomAmount ? "cursor-not-allowed bg-slate-50 text-slate-700" : "bg-white"}`}
              />
            </div>
            {error ? <p className="mt-1 text-sm font-semibold text-red-600">{error}</p> : null}
            <p className="text-xs font-semibold text-slate-500">
              {supportsCustomAmount
                ? `Maximum refundable amount: ₹${maxAmount.toFixed(2)}`
                : `This order is full-refund only for ₹${maxAmount.toFixed(2)}.`}
            </p>
          </div>

          {allowsMethodSelection ? (
            <div className="space-y-3.5">
              <div>
                <p className="text-sm font-bold text-slate-800 tracking-wide uppercase">
                  Refund Destination
                </p>
                <p className="text-xs font-medium text-slate-500 mt-0.5">
                  {refundMethodLocked
                    ? "Destination is locked to customer's requested refund method."
                    : "Select where the refunded amount should be credited."}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!refundMethodLocked) setRefundTo("gateway")
                  }}
                  disabled={isProcessing || refundMethodLocked}
                  className={`rounded-2xl border-2 p-4 text-left transition-all cursor-pointer ${
                    refundTo === "gateway"
                      ? "border-purple-600 bg-purple-50/60 shadow-xs"
                      : "border-slate-200 bg-white hover:border-purple-200"
                  } ${isProcessing || refundMethodLocked ? "cursor-not-allowed opacity-70" : ""}`}
                >
                  <p className="text-base font-bold text-slate-900">Original Payment Method</p>
                  <p className="mt-1.5 text-xs text-slate-500 font-medium leading-relaxed">
                    Refund directly through payment gateway to customer's source account.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!refundMethodLocked) setRefundTo("wallet")
                  }}
                  disabled={isProcessing || refundMethodLocked}
                  className={`rounded-2xl border-2 p-4 text-left transition-all cursor-pointer ${
                    refundTo === "wallet"
                      ? "border-purple-600 bg-purple-50/60 shadow-xs"
                      : "border-slate-200 bg-white hover:border-purple-200"
                  } ${isProcessing || refundMethodLocked ? "cursor-not-allowed opacity-70" : ""}`}
                >
                  <p className="text-base font-bold text-slate-900">Customer Wallet</p>
                  <p className="mt-1.5 text-xs text-slate-500 font-medium leading-relaxed">
                    Instant refund credited to customer's Superfast app wallet balance.
                  </p>
                </button>
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-purple-200 bg-purple-50/80 p-4">
            <p className="text-sm font-medium text-purple-900 leading-relaxed">
              <span className="font-extrabold text-purple-950">Note:</span>{" "}
              {isWalletPayment
                ? "Wallet orders are automatically refunded to the customer's wallet balance."
                : refundTo === "wallet"
                  ? "This refund will be credited instantly to the customer's wallet."
                  : "This refund will be processed back to the customer's original payment method via gateway."}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-5">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isProcessing}
            className="px-6 py-2.5 h-11 rounded-xl text-slate-700 font-semibold hover:bg-slate-100 border-slate-300"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isProcessing || !refundAmount || parseFloat(refundAmount) <= 0}
            className="bg-purple-600 px-7 py-2.5 h-11 rounded-xl text-white font-bold hover:bg-purple-700 active:scale-95 transition-all shadow-md"
          >
            {isProcessing ? "Processing..." : "Confirm Refund"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
