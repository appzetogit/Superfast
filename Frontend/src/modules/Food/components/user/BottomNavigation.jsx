import { useState, useEffect } from "react"
import { Link, useLocation } from "react-router-dom"
import { Tag, User, Truck, ShoppingBag } from "lucide-react"
import { useAuth } from "@core/context/AuthContext"
import { useSettings } from "@core/context/SettingsContext"
import DraggableModuleSwitcher from "../../../common/components/DraggableModuleSwitcher"

export default function BottomNavigation() {
  const location = useLocation()
  const { isAuthenticated } = useAuth()
  const { settings } = useSettings()
  const activeColor = settings?.moduleThemes?.food?.secondaryThemeColor || "#dc2626"
  const pathname = location.pathname
  const profileSource = new URLSearchParams(location.search).get("from")
  const redirectTo = `${location.pathname || "/food/user"}${location.search || ""}${location.hash || ""}`
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)

  useEffect(() => {
    let initialHeight = window.innerHeight

    const handleResize = () => {
      const currentHeight = window.innerHeight
      if (initialHeight - currentHeight > 150) {
        setIsKeyboardOpen(true)
      } else {
        setIsKeyboardOpen(false)
        if (currentHeight > initialHeight) {
          initialHeight = currentHeight
        }
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Check active routes - support both /user/* and /* paths
  const isBakery = pathname.startsWith("/food/user/bakery")
  const isUnder250 = pathname === "/food/under-250" || pathname.startsWith("/food/user/under-250")
  const isSharedFoodProfile =
    (pathname === "/profile" || pathname.startsWith("/profile/")) &&
    profileSource !== "quick"
  const isOrders = pathname.includes("/orders")
  const isProfile =
    !isOrders &&
    (pathname.startsWith("/food/profile") ||
    pathname.startsWith("/food/user/profile") ||
    isSharedFoodProfile)
  const isDelivery =
    !isBakery &&
    !isUnder250 &&
    !isProfile &&
    (pathname === "/food" ||
      pathname === "/food/" ||
      pathname === "/food/user" ||
      (pathname.startsWith("/food/user") &&
        !pathname.includes("/bakery") &&
        !pathname.includes("/under-250") &&
        !pathname.includes("/profile")))

  if (isKeyboardOpen) return null

  return (
    <div
      className="md:hidden fixed bottom-0 left-0 right-0 z-50"
    >
      <DraggableModuleSwitcher />

      <div
        className="relative bg-white dark:bg-[#1a1a1a] border-t border-gray-200 dark:border-gray-800 shadow-lg"
      >
      <div className="flex items-center justify-around h-auto px-2 sm:px-4">
        {/* Delivery Tab */}
        <Link
          to="/food/user"
          replace
          className={`flex flex-1 flex-col items-center gap-1.5 px-2 sm:px-3 py-2 transition-all duration-200 relative ${!isDelivery ? "text-gray-600 dark:text-gray-400" : ""}`}
          style={isDelivery ? { color: activeColor } : {}}
        >
          < Truck 
            className={`h-5 w-5 ${!isDelivery ? "text-gray-600 dark:text-gray-400" : ""}`} 
            style={isDelivery ? { color: activeColor, fill: activeColor } : {}}
            strokeWidth={2} 
          />
          <span 
            className={`text-xs sm:text-sm font-medium ${isDelivery ? "font-semibold" : "text-gray-600 dark:text-gray-400"}`}
          >
            Delivery
          </span>
          {isDelivery && (
            <div className="absolute top-0 left-0 right-0 h-0.5 rounded-b-full" style={{ backgroundColor: activeColor }} />
          )}
        </Link>

        {/* Divider */}
        <div className="h-8 w-px bg-gray-300 dark:bg-gray-700" />

        {/*
        <Link
          to="/food/user/bakery/list"
          className={`flex flex-1 flex-col items-center gap-1.5 px-2 sm:px-3 py-2 transition-all duration-200 relative ${isBakery
              ? "text-red-600 dark:text-red-500"
              : "text-gray-600 dark:text-gray-400"
            }`}
        >
          <Cake className={`h-5 w-5 ${isBakery ? "text-red-600 dark:text-red-500" : "text-gray-600 dark:text-gray-400"}`} strokeWidth={2} />
          <span className={`text-xs sm:text-sm font-medium ${isBakery ? "text-red-600 dark:text-red-500 font-semibold" : "text-gray-600 dark:text-gray-400"}`}>
            Bakery
          </span>
          {isBakery && (
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-red-600 dark:bg-red-500 rounded-b-full" />
          )}
        </Link>

        <div className="h-8 w-px bg-gray-300 dark:bg-gray-700" />
        */}

        {/* Under 250 Tab */}
        <Link
          to="/food/user/under-250"
          className={`flex flex-1 flex-col items-center gap-1.5 px-2 sm:px-3 py-2 transition-all duration-200 relative ${!isUnder250 ? "text-gray-600 dark:text-gray-400" : ""}`}
          style={isUnder250 ? { color: activeColor } : {}}
        >
          <Tag 
            className={`h-5 w-5 ${!isUnder250 ? "text-gray-600 dark:text-gray-400" : ""}`} 
            style={isUnder250 ? { color: activeColor, fill: activeColor } : {}}
            strokeWidth={2} 
          />
          <span 
            className={`text-xs sm:text-sm font-medium ${isUnder250 ? "font-semibold" : "text-gray-600 dark:text-gray-400"}`}
          >
            Under 250
          </span>
          {isUnder250 && (
            <div className="absolute top-0 left-0 right-0 h-0.5 rounded-b-full" style={{ backgroundColor: activeColor }} />
          )}
        </Link>

        {/* Divider */}
        <div className="h-8 w-px bg-gray-300 dark:bg-gray-700" />

        {/* Orders Tab */}
        <Link
          to={isAuthenticated ? "/user/orders" : "/user/auth/login"}
          state={!isAuthenticated ? { redirectTo: "/user/orders" } : undefined}
          className={`flex flex-1 flex-col items-center gap-1.5 px-2 sm:px-3 py-2 transition-all duration-200 relative ${!isOrders ? "text-gray-600 dark:text-gray-400" : ""}`}
          style={isOrders ? { color: activeColor } : {}}
        >
          <ShoppingBag 
            className={`h-5 w-5 ${!isOrders ? "text-gray-600 dark:text-gray-400" : ""}`} 
            style={isOrders ? { color: activeColor, fill: activeColor } : {}}
            strokeWidth={2} 
          />
          <span 
            className={`text-xs sm:text-sm font-medium ${isOrders ? "font-semibold" : "text-gray-600 dark:text-gray-400"}`}
          >
            Order
          </span>
          {isOrders && (
            <div className="absolute top-0 left-0 right-0 h-0.5 rounded-b-full" style={{ backgroundColor: activeColor }} />
          )}
        </Link>

        {/* Divider */}
        <div className="h-8 w-px bg-gray-300 dark:bg-gray-700" />

        {/* Profile Tab */}
        <Link
          to={isAuthenticated ? "/food/user/profile" : "/user/auth/login"}
          state={!isAuthenticated ? { redirectTo: "/food/user/profile" } : undefined}
          className={`flex flex-1 flex-col items-center gap-1.5 px-2 sm:px-3 py-2 transition-all duration-200 relative ${!isProfile ? "text-gray-600 dark:text-gray-400" : ""}`}
          style={isProfile ? { color: activeColor } : {}}
        >
          <User 
            className={`h-5 w-5 ${!isProfile ? "text-gray-600 dark:text-gray-400" : ""}`} 
            style={isProfile ? { color: activeColor, fill: activeColor } : {}}
          />
          <span 
            className={`text-xs sm:text-sm font-medium ${isProfile ? "font-semibold" : "text-gray-600 dark:text-gray-400"}`}
          >
            Profile
          </span>
          {isProfile && (
            <div className="absolute top-0 left-0 right-0 h-0.5 rounded-b-full" style={{ backgroundColor: activeColor }} />
          )}
        </Link>
      </div>
      </div>
    </div>
  )
}
