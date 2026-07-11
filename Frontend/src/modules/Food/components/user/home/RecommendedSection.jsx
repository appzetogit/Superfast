import React, { memo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Flame } from "lucide-react";

import { getRestaurantAvailabilityStatus } from "@food/utils/restaurantAvailability";

const RecommendedSection = memo(({ recommendedForYouRestaurants }) => {
  if (!recommendedForYouRestaurants || recommendedForYouRestaurants.length === 0) return null;

  return (
    <motion.section
      className="content-auto pt-2 pb-4"
      initial={false}
      animate={{ opacity: 1, y: 0 }}
    >
      <h2 className="text-[11px] font-bold text-slate-400 tracking-widest uppercase mb-3 px-4">
        RECOMMENDED FOR YOU
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 px-4">
        {[...recommendedForYouRestaurants].sort((a, b) => {
          const aAvail = getRestaurantAvailabilityStatus(a, new Date());
          const bAvail = getRestaurantAvailabilityStatus(b, new Date());
          if (!aAvail.isOpen && bAvail.isOpen) return 1;
          if (aAvail.isOpen && !bAvail.isOpen) return -1;
          return 0;
        }).map((restaurant, index) => {
          const restaurantSlug =
            restaurant.slug ||
            restaurant.name.toLowerCase().replace(/\s+/g, "-");
          const isNew = !(Number(restaurant.rating) > 0);
          const availabilityStatus = getRestaurantAvailabilityStatus(restaurant, new Date());
          const isOffline = !availabilityStatus.isOpen;

          return (
            <motion.div
              key={`recommended-${restaurant.mongoId || restaurant.id || restaurantSlug}`}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: index * 0.05 }}
              className={isOffline ? "grayscale opacity-75" : ""}
            >
              <Link
                to={isOffline ? "#" : `/user/restaurants/${restaurantSlug}`}
                onClick={(e) => isOffline && e.preventDefault()}
                className={`block rounded-2xl overflow-hidden bg-white dark:bg-neutral-800 shadow-sm border border-gray-50 dark:border-neutral-700 ${isOffline ? "cursor-default pointer-events-none" : ""}`}
              >
                <div className="relative aspect-[4/3] bg-gray-100 dark:bg-neutral-900">
                  <img
                    src={restaurant.image}
                    alt={restaurant.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className={`absolute bottom-2 left-2 px-2 py-0.5 rounded-lg text-[10px] font-bold shadow-md ${isNew ? "bg-white/90 dark:bg-neutral-800/90 text-slate-500 dark:text-slate-300 border border-gray-100 dark:border-neutral-700" : "bg-black/80 dark:bg-white/80 text-white dark:text-black"}`}>
                    {isNew ? "NEW" : Number(restaurant.rating).toFixed(1)}
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                    {restaurant.name}
                  </p>
                  <p className="text-[10px] text-[var(--primary-theme)] font-extrabold mt-1.5 flex items-center gap-1 uppercase tracking-wider">
                    <Flame className="w-3.5 h-3.5 fill-[var(--primary-theme)]" />
                    NEAR & FAST
                  </p>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
});

export default RecommendedSection;
