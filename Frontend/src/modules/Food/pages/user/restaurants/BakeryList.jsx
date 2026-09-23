import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowLeft, Clock, MapPin, Heart, Star } from "lucide-react"
import AnimatedPage from "@food/components/user/AnimatedPage"
import Footer from "@food/components/user/Footer"
import ScrollReveal from "@food/components/user/ScrollReveal"
import TextReveal from "@food/components/user/TextReveal"
import { Card, CardTitle, CardContent } from "@food/components/ui/card"
import { Button } from "@food/components/ui/button"
import { RestaurantGridSkeleton } from "@food/components/ui/loading-skeletons"
import { useProfile } from "@food/context/ProfileContext"
import { useZone } from "@food/hooks/useZone"
import { useLocation } from "@food/hooks/useLocation"
import { restaurantAPI } from "@food/api"
import { API_BASE_URL } from "@food/api/config"
import { useDelayedLoading } from "@food/hooks/useDelayedLoading"

const BACKEND_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "")

const normalizeImageUrl = (imageUrl) => {
  if (typeof imageUrl !== "string" || !imageUrl.trim()) return ""
  const trimmed = imageUrl.trim()
  if (/^(https?:)?\/\//i.test(trimmed) || /^data:/i.test(trimmed) || /^blob:/i.test(trimmed)) {
    return trimmed
  }
  return trimmed.startsWith("/")
    ? `${BACKEND_ORIGIN}${trimmed}`
    : `${BACKEND_ORIGIN}/${trimmed}`
}

const pickRestaurantImage = (restaurant) => {
  const candidates = [
    restaurant?.coverImage?.url,
    restaurant?.coverImage,
    ...(Array.isArray(restaurant?.coverImages) ? restaurant.coverImages.map((img) => img?.url || img) : []),
    ...(Array.isArray(restaurant?.menuImages) ? restaurant.menuImages.map((img) => img?.url || img) : []),
    restaurant?.profileImage?.url,
    restaurant?.profileImage,
  ]
  const firstValid = candidates.find((value) => typeof value === "string" && value.trim())
  return normalizeImageUrl(firstValid || "")
}

export default function BakeryList() {
  const { addFavorite, removeFavorite, isFavorite } = useProfile()
  const { location: userLocation } = useLocation()
  const { zoneId } = useZone(userLocation)
  const [bakeries, setBakeries] = useState([])
  const [loading, setLoading] = useState(true)
  const showSkeleton = useDelayedLoading(loading)

  useEffect(() => {
    let cancelled = false

    const fetchBakeries = async () => {
      try {
        setLoading(true)
        const params = { limit: 300, businessType: "home_bakery", _ts: Date.now() }
        if (zoneId) {
          params.zoneId = zoneId
        }
        const response = await restaurantAPI.getRestaurants(params, { noCache: true })
        const list =
          response?.data?.data?.restaurants ||
          response?.data?.restaurants ||
          []
        if (cancelled) return

        // Helper to calculate distance
        const calculateDistance = (lat1, lon1, lat2, lon2) => {
          if (!lat1 || !lon1 || !lat2 || !lon2) return null;
          const R = 6371;
          const dLat = (lat2 - lat1) * Math.PI / 180;
          const dLon = (lon2 - lon1) * Math.PI / 180;
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                    Math.sin(dLon/2) * Math.sin(dLon/2);
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        }

        const transformed = list.map((bakery) => {
          const slug =
            bakery?.slug ||
            String(bakery?.name || "")
              .toLowerCase()
              .trim()
              .replace(/\s+/g, "-")
          const cuisine = Array.isArray(bakery?.cuisines) && bakery.cuisines.length > 0
            ? bakery.cuisines[0]
            : "Bakery & Desserts"
            
          let finalDistance = bakery?.distance;
          if (!finalDistance && userLocation?.latitude && userLocation?.longitude && bakery?.location?.coordinates) {
            // MongoDB coordinates are [longitude, latitude]
            const [bakeryLng, bakeryLat] = bakery.location.coordinates;
            finalDistance = calculateDistance(userLocation.latitude, userLocation.longitude, bakeryLat, bakeryLng);
          }
          const distanceStr = finalDistance ? (typeof finalDistance === 'number' ? `${finalDistance.toFixed(1)} km` : finalDistance) : "N/A";

          return {
            id: bakery?._id || bakery?.restaurantId || slug,
            slug,
            name: bakery?.name || "Unknown Bakery",
            cuisine,
            rating: Number(bakery?.rating || 0),
            deliveryTime: bakery?.estimatedDeliveryTime || (bakery?.estimatedDeliveryTimeMinutes ? `${bakery.estimatedDeliveryTimeMinutes} mins` : `30-40 mins`),
            distance: distanceStr,
            priceRange: bakery?.priceRange || "$$",
            image: pickRestaurantImage(bakery),
            coverImages: bakery?.coverImages,
          }
        })

        setBakeries(transformed)
      } catch (error) {
        if (!cancelled) {
          setBakeries([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchBakeries()
    return () => {
      cancelled = true
    }
  }, [zoneId])

  const hasBakeries = useMemo(() => bakeries.length > 0, [bakeries.length])

  return (
    <AnimatedPage className="min-h-screen bg-gradient-to-b from-pink-50/20 dark:from-[#0a0a0a] via-white dark:via-[#0a0a0a] to-amber-50/10 dark:to-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 pt-4 pb-24 md:py-8 lg:py-10 space-y-4 sm:space-y-6 lg:space-y-8">
        <ScrollReveal>
          <div className="flex items-center gap-3 sm:gap-4 lg:gap-5 mb-4 lg:mb-6">
            <Link to="/food/user">
              <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 sm:h-10 sm:w-10 lg:h-12 lg:w-12 hover:bg-gray-100 dark:hover:bg-gray-800">
                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6 text-gray-900 dark:text-gray-100" />
              </Button>
            </Link>
            <TextReveal className="flex items-center gap-2 sm:gap-3 lg:gap-4">
              <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl font-bold text-gray-900 dark:text-white">
                Home Bakeries
              </h1>
            </TextReveal>
          </div>
        </ScrollReveal>

        {showSkeleton ? (
          <RestaurantGridSkeleton count={4} />
        ) : !hasBakeries ? (
          <div className="py-16 text-center text-sm text-gray-500">No bakeries available in your zone right now.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-5 xl:gap-6 pt-2 sm:pt-3 lg:pt-4">
            {bakeries.map((bakery, index) => {
              const favorite = isFavorite(bakery.slug)

              const handleToggleFavorite = (e) => {
                e.preventDefault()
                e.stopPropagation()
                if (favorite) {
                  removeFavorite(bakery.slug)
                } else {
                  addFavorite({
                    slug: bakery.slug,
                    name: bakery.name,
                    cuisine: bakery.cuisine,
                    rating: bakery.rating,
                    deliveryTime: bakery.deliveryTime,
                    distance: bakery.distance,
                    priceRange: bakery.priceRange,
                    image: bakery.image,
                  })
                }
              }

              return (
                <ScrollReveal key={bakery.id} delay={index * 0.05}>
                  <Link to={`/user/restaurants/${bakery.slug}`} className="h-full flex">
                    <Card className="overflow-hidden cursor-pointer border border-rose-100 dark:border-rose-900/30 group bg-rose-50/40 hover:bg-rose-50/70 dark:bg-[#1c191a] hover:shadow-md dark:hover:shadow-lg dark:hover:shadow-rose-900/20 flex flex-col h-[180px] sm:h-[200px] w-full transition-all duration-300">
                      <div className="flex flex-row h-full w-full">
                        <CardContent className="flex-1 flex flex-col justify-between py-3 px-3 sm:py-4 sm:px-4 min-w-0 overflow-hidden">
                          <div className="flex-1 flex flex-col justify-between">
                            <div className="flex-shrink-0">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <div className="flex-1 min-w-0 pr-2">
                                  <CardTitle className="text-lg sm:text-xl font-bold mb-0.5 line-clamp-1 text-gray-900 dark:text-rose-50">
                                    {bakery.name}
                                  </CardTitle>
                                  <p className="text-sm sm:text-base text-gray-700 dark:text-gray-400 font-medium mb-1.5 line-clamp-1">
                                    {bakery.cuisine}
                                  </p>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <div className="flex items-center gap-1 bg-yellow-100 dark:bg-yellow-900/40 px-1.5 py-0.5 rounded-md shadow-sm">
                                      <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
                                      <span className="font-bold text-sm text-yellow-800 dark:text-yellow-300">{bakery.rating.toFixed(1)}</span>
                                    </div>
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className={`h-8 w-8 rounded-full flex-shrink-0 bg-white/50 dark:bg-black/20 hover:bg-white dark:hover:bg-gray-800 transition-colors ${favorite ? "text-red-500 dark:text-red-400" : "text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400"}`}
                                  onClick={handleToggleFavorite}
                                >
                                  <Heart className={`h-5 w-5 ${favorite ? "fill-red-500 dark:fill-red-400" : ""}`} />
                                </Button>
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-rose-200/50 dark:border-rose-900/30 flex-shrink-0">
                              <div className="flex items-center gap-3 text-sm font-semibold text-gray-700 dark:text-gray-300 flex-wrap">
                                <div className="flex items-center gap-1">
                                  <Clock className="h-4 w-4 flex-shrink-0 text-rose-500" />
                                  <span className="whitespace-nowrap">{bakery.deliveryTime}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>

                        <div className="w-[180px] sm:w-[200px] flex-shrink-0 relative overflow-hidden group/image">
                          <img
                            src={bakery.image || "https://via.placeholder.com/400x300?text=Bakery"}
                            alt={bakery.name}
                            className="w-full h-full object-cover group-hover/image:scale-105 transition-transform duration-500"
                          />
                          <div className="absolute inset-0 bg-gradient-to-l from-black/20 dark:from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    </Card>
                  </Link>
                </ScrollReveal>
              )
            })}
          </div>
        )}
      </div>
      <Footer />
    </AnimatedPage>
  )
}
