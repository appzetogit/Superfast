import React from 'react'
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react'

/**
 * One consistent loading / error / empty wrapper for list & detail screens.
 *
 *   <DataState loading={loading} error={error} empty={!items.length} onRetry={reload}
 *              emptyTitle="No orders yet" emptyMessage="New orders will show up here.">
 *     {...content}
 *   </DataState>
 *
 * Order of precedence: loading -> error -> empty -> children.
 */
export default function DataState({
  loading = false,
  error = null,
  empty = false,
  onRetry,
  loadingNode = null,
  loadingText = 'Loading...',
  errorTitle = 'Something went wrong',
  errorMessage,
  emptyTitle = 'Nothing here yet',
  emptyMessage = 'There is no data to show right now.',
  emptyIcon = null,
  emptyAction = null,
  className = '',
  children,
}) {
  if (loading) {
    return (
      loadingNode || (
        <div role="status" aria-live="polite" className={`flex flex-col items-center justify-center gap-3 px-4 py-16 ${className}`}>
          <div className="h-9 w-9 animate-spin rounded-full border-4 border-orange-200 border-t-orange-500" />
          <p className="text-sm font-semibold text-gray-500">{loadingText}</p>
        </div>
      )
    )
  }

  if (error) {
    const isNetwork = !error?.response && (error?.code === 'ERR_NETWORK' || error?.message === 'Network Error' || error?.code === 'ECONNABORTED')
    const message =
      errorMessage ||
      (isNetwork
        ? 'Please check your internet connection and try again.'
        : 'We could not load this right now. Please try again in a moment.')
    return (
      <div role="alert" className={`flex flex-col items-center justify-center px-6 py-14 text-center ${className}`}>
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
          <AlertTriangle className="h-8 w-8 text-red-500" />
        </div>
        <h3 className="text-base font-bold text-gray-900">{isNetwork ? 'No connection' : errorTitle}</h3>
        <p className="mt-1 max-w-xs text-sm text-gray-500">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm active:scale-95"
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
        )}
      </div>
    )
  }

  if (empty) {
    return (
      <div className={`flex flex-col items-center justify-center px-6 py-14 text-center ${className}`}>
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-gray-400">
          {emptyIcon || <Inbox className="h-8 w-8" />}
        </div>
        <h3 className="text-base font-bold text-gray-900">{emptyTitle}</h3>
        <p className="mt-1 max-w-xs text-sm text-gray-500">{emptyMessage}</p>
        {emptyAction && <div className="mt-5">{emptyAction}</div>}
      </div>
    )
  }

  return <>{children}</>
}
