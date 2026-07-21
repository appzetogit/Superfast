import React, { useState, useEffect, memo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Flame, Star, Compass, Zap, Clock } from "lucide-react";
import { preferencesAPI } from "@food/api";
import { API_BASE_URL } from "@food/api/config";
import OptimizedImage from "@food/components/OptimizedImage";
import { getRestaurantAvailabilityStatus } from "@food/utils/restaurantAvailability";

const CATEGORY_EMOJIS = {
  pizza: "🍕",
  biryani: "🍲",
  burgers: "🍔",
  "south-indian": "🥞",
  "north-indian": "🍛",
  chinese: "🥢",
  italian: "🍝",
  sweets: "🍬",
  momos: "🥟",
  chaat: "🥙",
  cake: "🍰",
  desserts: "🍩",
  sandwich: "🥪",
  mediterranean: "🥗",
  rolls: "🌯",
  pasta: "🍝",
  salad: "🥗",
  kebabs: "🍢",
};

const RecommendationsSection = memo(({ fallbackRestaurants, zoneId }) => {
  const BACKEND_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");
  const [data, setData] = useState({ favouriteCategories: [], recommendedRestaurants: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState("all");

  useEffect(() => {
    const fetchRecommendations = async () => {
      try {
        const res = await preferencesAPI.getRecommendations(zoneId ? { zoneId } : {});
        setData(res?.data?.data || res?.data || { favouriteCategories: [], recommendedRestaurants: [] });
      } catch (err) {
        console.error("Failed to load recommendations:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRecommendations();
  }, [zoneId]);

  if (isLoading) {
    return (
      <div className="py-4 px-4 space-y-3 max-w-2xl mx-auto">
        <div className="h-4 w-32 bg-slate-100 rounded-full animate-pulse" />
        <div className="flex gap-2 overflow-x-auto pb-2">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className="h-8 w-20 bg-slate-100 rounded-full flex-shrink-0 animate-pulse" />
          ))}
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {[1, 2].map(n => (
            <div key={n} className="h-44 w-36 bg-slate-100 rounded-2xl flex-shrink-0 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const { favouriteCategories = [], recommendedRestaurants = [] } = data;

  const displayRestaurants = recommendedRestaurants.length > 0
    ? recommendedRestaurants
    : (fallbackRestaurants || []);

  const filteredRestaurants = displayRestaurants.filter(r => {
    if (activeCategoryFilter === "all") return true;
    
    const targetCat = favouriteCategories.find(c => c._id === activeCategoryFilter);
    if (!targetCat) return true;

    const catName = (targetCat.name || "").toLowerCase();
    const cuisines = (r.cuisines || []).map(c => c.toLowerCase());
    return cuisines.includes(catName);
  });

  if (filteredRestaurants.length === 0) return null;

  return (
    <motion.section
      className="pt-2 pb-6 max-w-2xl mx-auto border-b border-slate-50 dark:border-neutral-800 animate-in fade-in duration-300"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Title */}
      <h2 className="text-[11px] font-bold text-slate-400 tracking-widest uppercase mb-3 px-4">
        RECOMMENDED FOR YOU
      </h2>

      {/* Grid of Restaurant Cards - 3 columns on mobile */}
      <div className="grid grid-cols-3 gap-3 px-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 pb-2">
        {filteredRestaurants.map((restaurant, index) => {
          const name = restaurant.restaurantName || restaurant.name;
          const image = restaurant.profileImage || restaurant.image;
          const rating = Number(restaurant.rating) || 0;
          
          const restaurantSlug =
            restaurant.restaurantNameNormalized ||
            restaurant.slug ||
            name.toLowerCase().replace(/\s+/g, "-");
            
          const availabilityStatus = getRestaurantAvailabilityStatus(restaurant, new Date());
          const isOffline = !availabilityStatus.isOpen;
          const isNew = !(rating > 0);

          const offer = restaurant.offer || restaurant.discount || (index % 2 === 0 ? "₹120 OFF above ₹199" : "50% OFF select items");
          const deliveryTimeStr = restaurant.deliveryTime || restaurant.estimatedDeliveryTime || (index % 3 === 0 ? "15-20 mins" : index % 3 === 1 ? "25-30 mins" : "20-25 mins");
          const isFast = !deliveryTimeStr.includes("20-25");

          return (
            <motion.div
              key={`recommendation-${restaurant._id || restaurant.id || index}`}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className={`flex-shrink-0 ${isOffline ? "grayscale opacity-75" : ""}`}
            >
              <Link
                to={isOffline ? "#" : `/user/restaurants/${restaurantSlug}`}
                onClick={(e) => isOffline && e.preventDefault()}
                className={`block rounded-2xl overflow-hidden bg-white dark:bg-neutral-800 shadow-sm border border-slate-100 dark:border-neutral-700 ${
                  isOffline ? "cursor-default pointer-events-none" : "hover:shadow-md"
                }`}
              >
                {/* Image Cover */}
                <div className="relative aspect-[4/3] bg-slate-50 dark:bg-neutral-900 overflow-hidden">
                  <OptimizedImage
                    src={image}
                    alt={name}
                    className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                    backendOrigin={BACKEND_ORIGIN}
                  />
                  
                  {/* Offer Badge Overlay on Top */}
                  {offer && (
                    <div className="absolute top-0 left-0 right-0 bg-black/60 text-white px-1.5 py-0.5 text-[8px] sm:text-[9px] font-bold leading-tight truncate">
                      {offer}
                    </div>
                  )}

                  {/* Rating or New badge */}
                  <div className={`absolute bottom-1.5 left-1.5 px-1 py-0.5 rounded-md text-[8px] sm:text-[9px] font-bold shadow-md flex items-center gap-0.5 text-white ${
                    isNew
                      ? "bg-gray-400"
                      : "bg-[#259539]"
                  }`}>
                    {isNew ? "NEW" : rating.toFixed(1)}
                    {!isNew && <Star className="w-2 h-2 fill-white stroke-none" />}
                  </div>
                </div>

                {/* Details */}
                <div className="p-2 space-y-1">
                  <p className="text-[11px] font-bold text-slate-800 dark:text-white truncate">
                    {name}
                  </p>
                  
                  {/* Delivery time with icon */}
                  <div className="flex items-center gap-1">
                    {isFast ? (
                      <span className="text-[#259539] flex items-center gap-0.5 text-[9px] font-extrabold whitespace-nowrap">
                        <Zap className="w-2.5 h-2.5 fill-[#259539] text-[#259539]" />
                        <span>{deliveryTimeStr}</span>
                      </span>
                    ) : (
                      <span className="text-slate-500 dark:text-slate-400 flex items-center gap-0.5 text-[9px] font-medium whitespace-nowrap">
                        <Clock className="w-2.5 h-2.5 text-slate-500 dark:text-slate-400" />
                        <span>{deliveryTimeStr}</span>
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
});

export default RecommendationsSection;
