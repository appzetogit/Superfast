import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { X, Search, Clock, Loader2, Mic, Utensils, Store, Grid2x2, Star } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { searchAPI } from "@/services/api"
import { getImageUrl } from "../../../../shared/utils/imageHelper"

const SEARCH_HISTORY_KEY = "user_recent_searches_v1"

export default function SearchOverlay({ isOpen, onClose, searchValue, onSearchChange }) {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [recentSuggestions, setRecentSuggestions] = useState([])
  const [liveCategories, setLiveCategories] = useState([])
  const [liveDishes, setLiveDishes] = useState([])
  const [liveRestaurants, setLiveRestaurants] = useState([])
  const [loading, setLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const loadRecentSuggestions = () => {
      try {
        const raw = localStorage.getItem(SEARCH_HISTORY_KEY)
        const parsed = raw ? JSON.parse(raw) : []
        if (Array.isArray(parsed)) {
          setRecentSuggestions(parsed.filter((item) => typeof item === "string" && item.trim()).slice(0, 8))
          return
        }
      } catch {
        // Ignore parse errors.
      }
      setRecentSuggestions([])
    }

    loadRecentSuggestions()
  }, [isOpen])

  // Live real-time search effect
  useEffect(() => {
    if (!isOpen) return

    const term = searchValue.trim()
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await searchAPI.unifiedSearch({ q: term, limit: 30 })
        if (res.data?.success) {
          const payload = res.data.data || {}
          setLiveCategories(payload.categories || [])
          setLiveDishes(payload.dishes || [])
          setLiveRestaurants(payload.restaurants || [])
        }
      } catch (err) {
        console.warn("Live search error:", err)
      } finally {
        setLoading(false)
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [searchValue, isOpen])

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape)
      document.body.style.overflow = "hidden"
    }

    return () => {
      document.removeEventListener("keydown", handleEscape)
      document.body.style.overflow = "unset"
    }
  }, [isOpen, onClose])

  const saveRecentSearch = (term) => {
    const value = String(term || "").trim()
    if (!value) return

    setRecentSuggestions((prev) => {
      const next = [value, ...prev.filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, 8)
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next))
      return next
    })
  }

  const handleSuggestionClick = (suggestion) => {
    const term = String(suggestion || "").trim()
    if (term) {
      saveRecentSearch(term)
      navigate(`/food/user/search?q=${encodeURIComponent(term)}`)
      onClose()
      onSearchChange("")
    }
  }

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    if (searchValue.trim()) {
      saveRecentSearch(searchValue)
      navigate(`/food/user/search?q=${encodeURIComponent(searchValue.trim())}`)
      onClose()
      onSearchChange("")
    }
  }

  const handleCategoryClick = (category) => {
    saveRecentSearch(category.name)
    navigate(`/food/user/search?q=${encodeURIComponent(category.name)}&cat=${category._id}`)
    onClose()
    onSearchChange("")
  }

  const handleDishClick = (dish) => {
    saveRecentSearch(dish.name)
    navigate(`/food/user/restaurants/${dish.restaurantSlug || dish.restaurantId}?dish=${dish._id}`)
    onClose()
    onSearchChange("")
  }

  const handleRestaurantClick = (restaurant) => {
    saveRecentSearch(restaurant.restaurantName || restaurant.name)
    navigate(`/food/user/restaurants/${restaurant.slug || restaurant._id}`)
    onClose()
    onSearchChange("")
  }

  const handleVoiceSearch = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert("Voice search is not supported in this browser.")
      return
    }

    try {
      const recognition = new SpeechRecognition()
      recognition.lang = 'en-IN'
      recognition.onstart = () => setIsListening(true)
      recognition.onend = () => setIsListening(false)
      recognition.onerror = (event) => {
        setIsListening(false)
        console.warn("Speech recognition error:", event?.error)
      }
      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript
        if (transcript) {
          onSearchChange(transcript)
          saveRecentSearch(transcript)
        }
      }
      recognition.start()
    } catch (err) {
      setIsListening(false)
      console.warn("Speech recognition start failed:", err)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-white dark:bg-[#0a0a0a]"
      style={{ animation: 'fadeIn 0.2s ease-out' }}
    >
      {/* Header with Search Input */}
      <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground dark:text-gray-400 z-10" />
              <Input
                ref={inputRef}
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search for food items, categories, restaurants..."
                className="pl-12 pr-12 h-12 w-full bg-white dark:bg-[#1a1a1a] border-gray-100 dark:border-gray-800 focus:border-[var(--primary-theme)] dark:focus:border-[var(--primary-theme)] rounded-full text-lg dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
              />
              <button
                type="button"
                onClick={handleVoiceSearch}
                className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full transition-all ${isListening ? 'text-[var(--primary-theme)] scale-110 animate-pulse' : 'text-gray-400 hover:text-gray-600'}`}
              >
                <Mic className="h-5 w-5" />
              </button>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X className="h-5 w-5 text-gray-700 dark:text-gray-300" />
            </Button>
          </form>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 scrollbar-hide bg-white dark:bg-[#0a0a0a] space-y-8">
        
        {/* Recent Searches */}
        {recentSuggestions.length > 0 && searchValue.trim() === "" && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-[var(--primary-theme)]" />
              Recent Searches
            </h3>
            <div className="flex gap-2 flex-wrap">
              {recentSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 hover:bg-[var(--primary-theme)]/10 text-gray-700 dark:text-gray-300 hover:text-[var(--primary-theme)] transition-all text-xs font-medium"
                >
                  <Clock className="h-3 w-3 text-gray-400" />
                  <span>{suggestion}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading Indicator */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 text-[var(--primary-theme)] animate-spin" />
            <span className="ml-3 text-sm text-gray-500 font-medium">Searching items and categories...</span>
          </div>
        )}

        {!loading && (
          <>
            {/* Matching Categories */}
            {liveCategories.length > 0 && (
              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2 uppercase tracking-wider">
                  <Grid2x2 className="h-4 w-4 text-[var(--primary-theme)]" />
                  Categories
                </h3>
                <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-none">
                  {liveCategories.map((cat) => (
                    <div
                      key={cat._id}
                      onClick={() => handleCategoryClick(cat)}
                      className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:border-[var(--primary-theme)] cursor-pointer transition-all flex-shrink-0 group"
                    >
                      {cat.image && (
                        <img src={getImageUrl(cat.image)} alt={cat.name} className="w-7 h-7 object-cover rounded-full" onError={(e) => e.target.style.display = 'none'} />
                      )}
                      <span className="font-semibold text-xs text-slate-800 dark:text-zinc-200 group-hover:text-[var(--primary-theme)]">{cat.name}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Matching Food Items / Dishes */}
            {liveDishes.length > 0 && (
              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2 uppercase tracking-wider">
                  <Utensils className="h-4 w-4 text-[var(--primary-theme)]" />
                  Dishes ({liveDishes.length})
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {liveDishes.map((dish) => (
                    <div
                      key={dish._id || dish.name}
                      onClick={() => handleDishClick(dish)}
                      className="flex flex-col p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 shadow-sm hover:shadow-md cursor-pointer transition-all group"
                    >
                      <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-slate-100 dark:bg-zinc-800 mb-2">
                        {dish.image ? (
                          <img src={getImageUrl(dish.image)} alt={dish.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Utensils className="h-6 w-6 text-slate-400" />
                          </div>
                        )}
                        <div className={`absolute top-1.5 left-1.5 w-3.5 h-3.5 border p-[1px] bg-white rounded-sm ${dish.isVeg ? 'border-green-600' : 'border-red-600'}`}>
                          <div className={`w-full h-full rounded-full ${dish.isVeg ? 'bg-green-600' : 'bg-red-600'}`} />
                        </div>
                      </div>
                      <span className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1 group-hover:text-[var(--primary-theme)]">{dish.name}</span>
                      <span className="text-xs font-extrabold text-[var(--primary-theme)] mt-0.5">₹{dish.price}</span>
                      <span className="text-[10px] text-slate-500 dark:text-zinc-400 line-clamp-1 mt-0.5">{dish.restaurantName}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Matching Restaurants */}
            {liveRestaurants.length > 0 && (
              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2 uppercase tracking-wider">
                  <Store className="h-4 w-4 text-[var(--primary-theme)]" />
                  Restaurants ({liveRestaurants.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {liveRestaurants.map((res) => (
                    <div
                      key={res._id}
                      onClick={() => handleRestaurantClick(res)}
                      className="flex gap-3 p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 shadow-sm hover:shadow-md cursor-pointer transition-all group"
                    >
                      <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0 relative">
                        <img src={getImageUrl(res.profileImage || res.image)} alt={res.restaurantName} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <h4 className="font-bold text-xs text-slate-900 dark:text-white line-clamp-1 group-hover:text-[var(--primary-theme)]">{res.restaurantName}</h4>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 line-clamp-1">{res.cuisines?.join(", ") || "Multi-cuisine"}</p>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-1">
                          <span className="flex items-center gap-0.5 text-amber-500 font-bold">
                            <Star className="w-3 h-3 fill-amber-500" />
                            {res.rating || "4.0"}
                          </span>
                          <span>•</span>
                          <span>{res.estimatedDeliveryTime || "30 mins"}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Empty State */}
            {searchValue.trim() !== "" && liveCategories.length === 0 && liveDishes.length === 0 && liveRestaurants.length === 0 && (
              <div className="text-center py-16">
                <Search className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-600 dark:text-gray-400 text-base font-semibold">No food items, categories, or restaurants found for "{searchValue}"</p>
                <p className="text-xs text-gray-400 mt-1">Try checking your spelling or searching for another term like "Paneer", "Pizza", or "Biryani".</p>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
