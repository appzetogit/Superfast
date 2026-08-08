import React, { useState, useEffect } from 'react'
import AppRoutes from './routes'
import SplashScreen from '@/components/ui/SplashScreen'
import { WifiOff, RefreshCw } from 'lucide-react'

function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const handleOffline = () => setIsOffline(true)
    const handleOnline = () => {
      setIsOffline(false)
      // Soft reload or trigger state refresh on reconnect
      window.dispatchEvent(new Event('onlineReconnect'))
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)

    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  if (!isOffline) return null

  return (
    <div className="fixed top-0 inset-x-0 z-[99999] bg-amber-600 text-white px-4 py-2 text-xs font-bold flex items-center justify-between shadow-lg animate-in slide-in-from-top duration-300">
      <div className="flex items-center gap-2">
        <WifiOff className="w-4 h-4 animate-pulse shrink-0" />
        <span>Network connection lost. Reconnecting...</span>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-1 bg-amber-700 hover:bg-amber-800 px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wider text-white transition-colors"
      >
        <RefreshCw className="w-3 h-3" /> Retry
      </button>
    </div>
  )
}

function App() {
  const [showSplash, setShowSplash] = useState(() => {
    const hasSeenSession = sessionStorage.getItem('hasSeenSplash')
    return !hasSeenSession
  })

  const handleSplashComplete = () => {
    sessionStorage.setItem('hasSeenSplash', 'true')
    setShowSplash(false)
  }

  useEffect(() => {
    const handleGlobalButtonClick = (e) => {
      const target = e.target
      if (target && (target.closest('button') || target.closest('[type="submit"]') || target.closest('[role="button"]'))) {
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
          document.activeElement.blur()
        }
      }
    }

    document.addEventListener('click', handleGlobalButtonClick, true)
    document.addEventListener('touchstart', handleGlobalButtonClick, { passive: true })

    return () => {
      document.removeEventListener('click', handleGlobalButtonClick, true)
      document.removeEventListener('touchstart', handleGlobalButtonClick)
    }
  }, [])

  return (
    <>
      <OfflineBanner />
      <AppRoutes />
      {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
    </>
  )
}

export default App
