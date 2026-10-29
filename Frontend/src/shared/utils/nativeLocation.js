/**
 * Location through the native app wrapper (Flutter WebView / React Native), same `getLocation` bridge handler.
 * The native side asks for the location permission AND shows the Android "Turn on device location"
 * dialog (Google Play Services Location Accuracy, Screenshot 1), so GPS switches on automatically.
 * Outside the wrapper or if bridge is unavailable, it uses navigator.geolocation with enableHighAccuracy: true,
 * which triggers the same system prompts in Android Chrome and Android WebViews.
 */

const waitForBridge = () =>
  new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false)
    if (window.flutter_inappwebview?.callHandler) return resolve(true)
    const onReady = () => resolve(Boolean(window.flutter_inappwebview?.callHandler))
    window.addEventListener('flutterInAppWebViewPlatformReady', onReady, { once: true })
    setTimeout(() => {
      window.removeEventListener('flutterInAppWebViewPlatformReady', onReady)
      resolve(Boolean(window.flutter_inappwebview?.callHandler))
    }, 800)
  })

export const isNativeWrapper = () =>
  typeof window !== 'undefined' &&
  (Boolean(window.flutter_inappwebview) || Boolean(window.ReactNativeWebView))

export async function callNativeBridge(handler, payload) {
  try {
    if (window.flutter_inappwebview?.callHandler) {
      const res = await window.flutter_inappwebview.callHandler(handler, payload)
      return res ?? true
    }
    if (window.ReactNativeWebView?.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: handler, payload }))
      return true
    }
  } catch {
    /* bridge handler not implemented by this app version */
  }
  return false
}

export async function requestNativeLocationPermission() {
  return callNativeBridge('requestLocationPermission')
}

export async function openNativeLocationSettings() {
  return callNativeBridge('openLocationSettings')
}

/** Resolves { lat, lng, accuracy } from the native layer, or null when unavailable/denied. */
export async function getNativeLocation() {
  try {
    if (!(await waitForBridge())) return null
    const result = await window.flutter_inappwebview.callHandler('getLocation')
    const lat = Number(result?.latitude ?? result?.lat)
    const lng = Number(result?.longitude ?? result?.lng)
    if (result?.success === false || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng, accuracy: Number(result?.accuracy) || null }
  } catch {
    return null
  }
}

/**
 * Universal live GPS location request:
 * 1. Checks native wrapper bridge first.
 * 2. Uses navigator.geolocation.getCurrentPosition with enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0.
 *    In Android Chrome and Android System WebView, enableHighAccuracy: true triggers Google Play Services
 *    Location Accuracy dialog ("Turn on", Screenshot 1) and OS permission dialog ("Allow", Screenshot 2).
 * 3. Resolves with { latitude, longitude, accuracy, isLiveGPS: true } or rejects with error.
 */
export async function requestLiveGpsLocation(timeoutMs = 20000) {
  // 1. Try native bridge first if available
  try {
    const native = await getNativeLocation()
    if (native && Number.isFinite(native.lat) && Number.isFinite(native.lng)) {
      return {
        latitude: native.lat,
        longitude: native.lng,
        accuracy: native.accuracy,
        isLiveGPS: true,
      }
    }
  } catch (err) {
    console.warn('[nativeLocation] Native bridge location failed:', err)
  }

  // 2. Also notify native layer to request permission if bridge exists
  callNativeBridge('requestLocationPermission').catch(() => {})

  // 3. Browser / WebView Geolocation API
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('Geolocation is not supported on this device')
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          isLiveGPS: true,
        })
      },
      (err) => {
        reject(err)
      },
      {
        enableHighAccuracy: true, // Forces Google Location Accuracy dialog (Screenshot 1)
        timeout: timeoutMs,
        maximumAge: 0,            // Never use cached fix
      }
    )
  })
}
