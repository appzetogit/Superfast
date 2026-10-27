import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { BellRing } from 'lucide-react'
import { isModuleAuthenticated } from '@food/utils/auth'

/**
 * Order alerts on iPhone (web app): Safari only plays sound after a tap and only delivers push
 * notifications to an app that was added to the Home Screen and allowed to send notifications.
 * This banner walks restaurant / delivery users through that one-time setup and unlocks audio.
 */

const MODULES = [
  { prefix: '/food/delivery', module: 'delivery' },
  { prefix: '/food/restaurant', module: 'restaurant' },
]
const AUTH_PATH_RE = /\/(auth|login|signup|otp|terms|privacy|support|welcome)(\/|$)/i

const isIos = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches)

const permissionState = () =>
  typeof Notification === 'undefined' ? 'unsupported' : Notification.permission

export default function SoundAlertGate() {
  const { pathname } = useLocation()
  const [perm, setPerm] = useState(permissionState)
  const [audioReady, setAudioReady] = useState(false)

  const target = !AUTH_PATH_RE.test(pathname) && MODULES.find((m) => pathname.startsWith(m.prefix))
  let signedIn = false
  try {
    signedIn = Boolean(target) && isModuleAuthenticated(target.module)
  } catch {
    signedIn = false
  }

  useEffect(() => {
    const refresh = () => setPerm(permissionState())
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])

  if (!signedIn) return null

  const ios = isIos()
  const needsInstall = ios && !isStandalone()
  const needsPermission = perm === 'default' || perm === 'denied'
  if (!needsInstall && !needsPermission && audioReady) return null
  // Android/desktop with notifications already allowed: the normal first tap unlocks audio.
  if (!ios && !needsPermission) return null

  const handleEnable = async () => {
    // Must stay synchronous with the tap so Safari accepts the audio unlock.
    window.dispatchEvent(new Event('unlock-alert-audio'))
    try {
      const beep = new Audio('/zomato_sms.mp3')
      beep.volume = 1
      beep.play().catch(() => {})
    } catch {
      /* ignore */
    }
    setAudioReady(true)
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try {
        setPerm(await Notification.requestPermission())
      } catch {
        /* ignore */
      }
    }
  }

  let message = 'Tap to turn on order alerts and sound.'
  if (needsInstall) {
    message = 'For order alerts on iPhone: tap Share, then "Add to Home Screen", and open the app from there.'
  } else if (perm === 'denied') {
    message = 'Notifications are blocked. Open iPhone Settings > this app > Notifications and allow Sounds.'
  } else if (ios) {
    message = 'Tap to turn on order alerts. Also keep the Silent switch off and allow Sounds in Settings > Notifications.'
  }

  return (
    <div className="fixed inset-x-0 top-0 z-[100000] flex items-center gap-3 bg-amber-500 px-4 py-2.5 text-white shadow-lg">
      <BellRing className="h-5 w-5 shrink-0" />
      <p className="flex-1 text-xs font-semibold leading-snug">{message}</p>
      {!needsInstall && perm !== 'denied' && (
        <button
          type="button"
          onClick={handleEnable}
          className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-amber-700 active:scale-95"
        >
          Enable
        </button>
      )}
    </div>
  )
}
