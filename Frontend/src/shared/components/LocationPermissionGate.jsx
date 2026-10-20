import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { MapPin, Navigation } from 'lucide-react'
import { isModuleAuthenticated } from '@food/utils/auth'

/**
 * Asks for location as soon as a signed-in user / rider / restaurant / seller opens the app,
 * and keeps a friendly "turn on location" sheet up while it is blocked or the device GPS is off.
 *
 * A web page cannot switch GPS on by itself: the browser/WebView shows the permission prompt
 * (triggered here automatically), and for a denied permission or GPS switched off we guide the
 * person and re-check as soon as they come back to the app. Native wrappers can additionally
 * answer the optional `requestLocationPermission` / `openLocationSettings` bridge handlers.
 */

const MODULES = [
  { prefix: '/food/delivery', module: 'delivery', label: 'delivery partner', required: true },
  { prefix: '/food/restaurant', module: 'restaurant', label: 'restaurant', required: true },
  { prefix: '/seller', module: 'seller', label: 'seller', required: true },
  { prefix: '/food/user', module: 'user', label: 'customer', required: false },
  { prefix: '/quick', module: 'user', label: 'customer', required: false },
]

const AUTH_PATH_RE = /\/(auth|login|signup|otp|terms|privacy|support)(\/|$)/i
const DISMISS_KEY = 'locationGateDismissed'

function resolveModule(pathname) {
  if (/^\/admin/.test(pathname) || AUTH_PATH_RE.test(pathname)) return null
  const hit = MODULES.find((m) => pathname.startsWith(m.prefix))
  if (!hit) return null
  try {
    return isModuleAuthenticated(hit.module) ? hit : null
  } catch {
    return null
  }
}

const callNativeBridge = async (handler) => {
  try {
    if (window.flutter_inappwebview?.callHandler) {
      await window.flutter_inappwebview.callHandler(handler)
      return true
    }
    if (window.ReactNativeWebView?.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: handler }))
      return true
    }
  } catch {
    /* bridge handler not implemented by this app version */
  }
  return false
}

export default function LocationPermissionGate() {
  const { pathname } = useLocation()
  const target = resolveModule(pathname)
  const moduleKey = target?.module || ''
  const required = Boolean(target?.required)

  // null = fine / unknown, 'denied' = permission blocked, 'off' = device GPS off
  const [problem, setProblem] = useState(null)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })
  const checkingRef = useRef(false)

  const check = useCallback(async () => {
    if (!moduleKey || typeof navigator === 'undefined' || !navigator.geolocation || checkingRef.current) return
    checkingRef.current = true
    try {
      let permission = 'prompt'
      try {
        permission = (await navigator.permissions?.query({ name: 'geolocation' }))?.state || 'prompt'
      } catch {
        /* Permissions API unavailable (older WebView) - the position request below decides */
      }

      if (permission === 'denied') {
        setProblem('denied')
        return
      }

      // For "prompt" this triggers the system permission dialog automatically.
      await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => {
            setProblem(null)
            resolve()
          },
          (err) => {
            if (err?.code === 1) setProblem('denied')
            else if (err?.code === 2) setProblem('off')
            // code 3 (timeout) is a weak signal, not a blocked location: leave state as is
            resolve()
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
        )
      })
    } finally {
      checkingRef.current = false
    }
  }, [moduleKey])

  // Ask right away, and re-check when the person returns from system settings.
  useEffect(() => {
    if (!moduleKey) {
      setProblem(null)
      return undefined
    }
    check()
    const onVisible = () => {
      if (!document.hidden) check()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [moduleKey, check])

  // While blocked, keep polling so the sheet disappears once location is turned on.
  useEffect(() => {
    if (!problem) return undefined
    const id = setInterval(check, 5000)
    return () => clearInterval(id)
  }, [problem, check])

  if (!target || !problem || (!required && dismissed)) return null

  const handleEnable = async () => {
    await callNativeBridge(problem === 'off' ? 'openLocationSettings' : 'requestLocationPermission')
    check()
  }

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
    setDismissed(true)
  }

  const isOff = problem === 'off'

  return (
    <div className="fixed inset-0 z-[100001] flex items-end justify-center bg-black/60 sm:items-center">
      <div role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-t-3xl bg-white p-6 text-center shadow-2xl sm:rounded-3xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-50">
          {isOff ? <Navigation className="h-8 w-8 text-orange-500" /> : <MapPin className="h-8 w-8 text-orange-500" />}
        </div>
        <h2 className="text-lg font-black text-gray-900">
          {isOff ? 'Turn on your phone\'s location' : 'Location access is needed'}
        </h2>
        <p className="mt-2 text-sm text-gray-500">
          {required
            ? `As a ${target.label}, the app needs your live location for orders, delivery tracking and nearby assignments.`
            : 'Allow location to see restaurants and shops that deliver to you, and to track your order.'}
        </p>
        {problem === 'denied' && (
          <p className="mt-2 text-xs text-gray-400">
            Location is blocked. Open the app/browser Settings &rarr; Permissions &rarr; Location and choose &ldquo;Allow&rdquo;, then come back here.
          </p>
        )}
        {isOff && (
          <p className="mt-2 text-xs text-gray-400">
            Swipe down from the top of your screen and switch on &ldquo;Location&rdquo;, then come back here.
          </p>
        )}
        <button
          type="button"
          onClick={handleEnable}
          className="mt-5 w-full rounded-xl bg-orange-500 py-3 text-sm font-bold text-white shadow-md active:scale-95"
        >
          {isOff ? 'I\'ve turned it on' : 'Allow location'}
        </button>
        {!required && (
          <button type="button" onClick={handleDismiss} className="mt-2 w-full py-2 text-sm font-semibold text-gray-400">
            Not now
          </button>
        )}
      </div>
    </div>
  )
}
