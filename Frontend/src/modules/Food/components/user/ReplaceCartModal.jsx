import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AlertTriangle, ShoppingBag, X } from "lucide-react"

export default function ReplaceCartModal({
  isOpen,
  existingRestaurantName,
  newRestaurantName,
  onConfirm,
  onCancel,
}) {
  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl bg-white p-6 shadow-2xl dark:bg-[#1c1c1e] dark:border dark:border-gray-800"
        >
          {/* Close button */}
          <button
            onClick={onCancel}
            className="absolute right-4 top-4 rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex flex-col items-center text-center">
            {/* Icon Header */}
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
              <ShoppingBag className="h-8 w-8" />
            </div>

            {/* Title */}
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
              Replace items in cart?
            </h3>

            {/* Description */}
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              Your cart contains items from{" "}
              <span className="font-semibold text-gray-900 dark:text-white">
                "{existingRestaurantName || "another restaurant"}"
              </span>
              . Do you want to discard these items and start a new order from{" "}
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                "{newRestaurantName || "this restaurant"}"
              </span>
              ?
            </p>

            {/* Action Buttons */}
            <div className="mt-6 flex w-full flex-col sm:flex-row items-center gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="w-full sm:flex-1 rounded-2xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 active:scale-[0.98] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                No, Keep Cart
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="w-full sm:flex-1 rounded-2xl bg-gradient-to-r from-emerald-600 to-green-600 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/30 transition-all hover:from-emerald-700 hover:to-green-700 active:scale-[0.98]"
              >
                Yes, Replace Cart
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
