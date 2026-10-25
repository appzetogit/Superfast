import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { MapPin, Navigation, X } from 'lucide-react'
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
  // Customers browse without signing in, so they must be asked for location too.
  if (!hit.required) return hit
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
  const navigate = useNavigate()
  const target = resolveModule(pathname)
  const moduleKey = target?.module || ''
  const required = Boolean(target?.required)

  // null = fine / unknown, 'denied' = permission blocked, 'off' = device GPS off
  const [problem, setProblem] = useState(null)
  const [dismissed, setDismissed] = useState(() => {
    // Session-only: a past "Not now" must not silence the prompt forever.
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })
  const checkingRef = useRef(false)
  const hadProblemRef = useRef(false)
  const gotFixRef = useRef(false)

  // Tell location providers that GPS just became available so they replace the default city.
  const announceGranted = useCallback(() => {
    if (hadProblemRef.current) {
      hadProblemRef.current = false
      window.dispatchEvent(new Event('liveLocationPermissionGranted'))
    }
  }, [])

  const check = useCallback(async () => {
    if (!moduleKey || typeof navigator === 'undefined' || !navigator.geolocation || checkingRef.current) return
    checkingRef.current = true
    try {
      // Always decide by a real position request: the Permissions API often reports "denied"
      // inside app WebViews even though location works. For "prompt" this also triggers the
      // system permission dialog automatically.
      await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => {
            gotFixRef.current = true
            setProblem(null)
            announceGranted()
            resolve()
          },
          (err) => {
            if (err?.code === 1) {
              hadProblemRef.current = true
              setProblem('denied')
            } else if (err?.code === 2 || (err?.code === 3 && !gotFixRef.current)) {
              // Phone GPS switched off usually shows up as "unavailable" or as a timeout when
              // we have never received a fix, so treat both as "location is off".
              hadProblemRef.current = true
              setProblem('off')
            }
            resolve()
          },
          // maximumAge 0: a cached fix must not hide the fact that GPS is now off
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 },
        )
      })
    } finally {
      checkingRef.current = false
    }
  }, [moduleKey, announceGranted])

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

  // Hide the sheet the moment the person allows location in the browser's site settings.
  useEffect(() => {
    if (!moduleKey || !navigator.permissions?.query) return undefined
    let status
    const onChange = () => {
      if (status?.state === 'granted') {
        setProblem(null)
        check()
      }
    }
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((s) => {
        status = s
        status.addEventListener?.('change', onChange)
      })
      .catch(() => {})
    return () => status?.removeEventListener?.('change', onChange)
  }, [moduleKey, check])

  // While blocked, keep polling so the sheet disappears once location is turned on.
  useEffect(() => {
    if (!problem || dismissed) return undefined
    const id = setInterval(check, 5000)
    return () => clearInterval(id)
  }, [problem, dismissed, check])

  const handleDismiss = useCallback(() => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
    setDismissed(true)
    setProblem(null)
  }, [])

  const handleEnable = async () => {
    try {
      await callNativeBridge(problem === 'off' ? 'openLocationSettings' : 'requestLocationPermission')
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          () => {
            setProblem(null)
            announceGranted()
          },
          (err) => {
            // Still blocked: keep the sheet (with instructions) up; "Not now" closes it.
            console.warn('[LocationGate] Permission error:', err?.message)
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 },
        )
      }
    } catch (e) {
      console.warn('[LocationGate] Enable error:', e)
    }
  }

  // Only an address the customer explicitly picked ("saved" mode) skips this prompt.
  // The auto-filled default city is not a real location.
  const hasUserLocation = !required && (() => {
    try {
      return (
        localStorage.getItem('deliveryAddressMode') === 'saved' &&
        Boolean(localStorage.getItem('userLocation'))
      )
    } catch {
      return false
    }
  })()

  // Customers (Zomato-style): the home screen stays hidden until location is on or an address is picked.
  const blocking = !required
  if (!target || !problem || (dismissed && !blocking) || hasUserLocation) return null

  const isOff = problem === 'off'

  return (
    <div
      className={`fixed inset-0 z-[100001] flex items-end justify-center sm:items-center p-0 sm:p-4 transition-opacity animate-in fade-in ${blocking ? 'bg-white' : 'bg-black/60'}`}
      onClick={blocking ? undefined : handleDismiss}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        className="relative w-full max-w-md rounded-t-3xl bg-white p-6 pb-8 text-center shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top-right close button */}
        {!blocking && (
          <button
            type="button"
            onClick={handleDismiss}
            className="absolute right-4 top-4 rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-50">
          {isOff ? <Navigation className="h-8 w-8 text-orange-500" /> : <MapPin className="h-8 w-8 text-orange-500" />}
        </div>
        <h2 className="text-lg font-black text-gray-900">
          {isOff ? "Turn on your phone's location" : 'Location access is needed'}
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
          className="mt-5 w-full rounded-xl bg-orange-500 py-3 text-sm font-bold text-white shadow-md active:scale-95 transition-all hover:bg-orange-600 cursor-pointer"
        >
          {isOff ? "I've turned it on" : 'Allow location'}
        </button>
        {blocking ? (
          <button
            type="button"
            onClick={() => navigate('/cart/address-selector')}
            className="mt-3 w-full py-2.5 text-sm font-semibold text-orange-600 hover:text-orange-700 active:scale-95 transition-all cursor-pointer"
          >
            Enter location manually
          </button>
        ) : (
          <button
            type="button"
            onClick={handleDismiss}
            className="mt-3 w-full py-2.5 text-sm font-semibold text-gray-500 hover:text-gray-700 active:scale-95 transition-all cursor-pointer"
          >
            Not now
          </button>
        )}
      </div>
    </div>
  )
}
