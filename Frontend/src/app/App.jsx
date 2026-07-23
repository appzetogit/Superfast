import React, { useState, useEffect } from 'react'
import AppRoutes from './routes'
import SplashScreen from '@/components/ui/SplashScreen'

function App() {
  const [showSplash, setShowSplash] = useState(false)

  useEffect(() => {
    const hasSeen = sessionStorage.getItem('hasSeenSplash')
    if (!hasSeen) {
      setShowSplash(true)
    }
  }, [])

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

  const handleSplashComplete = () => {
    sessionStorage.setItem('hasSeenSplash', 'true')
    setShowSplash(false)
  }

  if (showSplash) {
    return <SplashScreen onComplete={handleSplashComplete} />
  }

  return <AppRoutes />
}

export default App
