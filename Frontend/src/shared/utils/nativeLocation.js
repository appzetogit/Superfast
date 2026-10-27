/**
 * Location through the native app wrapper (Flutter WebView), same `getLocation` bridge handler the
 * SMS Pro app uses. The native side asks for the location permission AND shows the Android
 * "Turn on device location" dialog, so GPS switches on after one "Allow" - something a web page
 * cannot do. Outside the wrapper (plain browser) this resolves to null and callers fall back to
 * navigator.geolocation.
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
  typeof window !== 'undefined' && Boolean(window.flutter_inappwebview)

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
