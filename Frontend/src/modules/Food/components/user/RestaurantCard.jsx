import React, { useRef, useState, useEffect, useCallback } from 'react';
import { motion } from "framer-motion";
import { Star, Clock, IndianRupee, Heart, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import OptimizedImage from "@food/components/OptimizedImage";

const WEBVIEW_SESSION_CACHE_BUSTER = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const withCacheBuster = (url, backendOrigin) => {
  if (typeof url !== "string" || !url) return "";
  if (/^data:/i.test(url) || /^blob:/i.test(url)) return url;

  const isRelative = !/^(https?:|\/\/|data:|blob:)/i.test(url.trim());
  const resolvedUrl = (backendOrigin && isRelative)
    ? `${backendOrigin.replace(/\/$/, "")}${url.startsWith("/") ? url : `/${url}`}`
    : url;

  const hasSignedParams = /[?&](X-Amz-|Signature=|Expires=|AWSAccessKeyId=|GoogleAccessId=|token=|sig=|se=|sp=|sv=)/i.test(resolvedUrl);
  if (hasSignedParams) return resolvedUrl;

  try {
    const parsed = new URL(resolvedUrl, window.location.origin);
    const currentHost = typeof window !== "undefined" ? window.location.hostname : "";
    const isLocalHost = /^(localhost|127\.0\.0\.1)$/i.test(parsed.hostname);
    const isSameHost = currentHost && parsed.hostname === currentHost;

    if (isLocalHost || isSameHost) {
      parsed.searchParams.set("_wv", WEBVIEW_SESSION_CACHE_BUSTER);
    }
    return parsed.toString();
  } catch {
    return resolvedUrl;
  }
};

const RecommendedItemsCarousel = React.memo(({ items = [], restaurantSlug, backendOrigin }) => {
  const navigate = useNavigate();

  if (!items || items.length === 0) {
    // Fallback if no recommended items exist
    return (
      <div className="w-full h-[140px] sm:h-[160px] bg-gray-100 dark:bg-gray-800 flex flex-col items-center justify-center text-gray-400">
        <span className="text-sm font-medium">No items available</span>
      </div>
    );
  }

  const handleItemClick = (e, itemId) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/food/restaurant/${restaurantSlug}?scrollToItem=${itemId}`);
  };

  return (
    <div className="relative w-full h-[160px] sm:h-[180px] bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
      <div className="flex overflow-x-auto gap-3 px-3 py-3 h-full items-center hide-scrollbar scroll-smooth snap-x">
        {items.map((item) => (
          <div 
            key={item._id}
            onClick={(e) => handleItemClick(e, item._id)}
            className="flex-shrink-0 w-[120px] sm:w-[140px] h-full bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700 snap-start relative group cursor-pointer transition-transform active:scale-95"
          >
            <div className="h-[90px] sm:h-[110px] w-full relative overflow-hidden bg-gray-100 dark:bg-gray-800">
              {item.image ? (
                <OptimizedImage
                  src={withCacheBuster(item.image, backendOrigin)}
                  alt={item.name}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300">
                  <Star className="w-8 h-8 opacity-20" />
                </div>
              )}
              {/* Badge */}
              <div className="absolute top-1 left-1 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shadow-sm">
                Must Try
              </div>
            </div>
            <div className="p-2 flex flex-col justify-center bg-white dark:bg-gray-800 h-[calc(100%-90px)] sm:h-[calc(100%-110px)]">
              <h4 className="text-[11px] sm:text-xs font-bold text-gray-800 dark:text-gray-100 line-clamp-1 truncate">{item.name}</h4>
              <div className="flex items-center text-[10px] sm:text-[11px] font-semibold text-gray-600 dark:text-gray-400 mt-0.5">
                <IndianRupee className="w-2.5 h-2.5 mr-0.5" />
                {item.price}
              </div>
            </div>
          </div>
        ))}
        {/* View full menu card */}
        <div 
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/food/restaurant/${restaurantSlug}`);
          }}
          className="flex-shrink-0 w-[80px] h-[80px] rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center text-gray-400 hover:text-red-500 hover:border-red-500 transition-colors cursor-pointer snap-start mx-2"
        >
          <ChevronRight className="w-6 h-6" />
          <span className="text-[10px] font-medium mt-1">Menu</span>
        </div>
      </div>
    </div>
  );
});

const RestaurantCard = ({ 
  restaurant, 
  isFavorite, 
  onFavoriteClick, 
  onClick, 
  backendOrigin 
}) => {
  const navigate = useNavigate();

  const handleCardClick = (e) => {
    // If onClick is provided, use it, otherwise default navigate
    if (onClick) {
      onClick(e);
    } else {
      navigate(`/food/restaurant/${restaurant.slug}`);
    }
  };

  return (
    <motion.div
      onClick={handleCardClick}
      className="bg-white dark:bg-[#1a1a1a] rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800 shadow-[0_4px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-all duration-300 group relative cursor-pointer transform hover:-translate-y-1"
    >
      <div className="relative">
        <RecommendedItemsCarousel items={restaurant.recommendedItems} restaurantSlug={restaurant.slug} backendOrigin={backendOrigin} />
        
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (onFavoriteClick) onFavoriteClick(restaurant.id);
          }}
          className="absolute top-2 right-2 p-2 bg-white/90 dark:bg-black/50 backdrop-blur-md rounded-full shadow-sm hover:bg-red-50 dark:hover:bg-red-900/30 hover:shadow-md hover:scale-110 transition-all duration-300 z-10"
        >
          <Heart
            className={`w-4 h-4 transition-colors duration-300 ${
              isFavorite ? "fill-red-500 text-red-500 border-none" : "text-gray-400 dark:text-gray-300 stroke-[2.5]"
            }`}
          />
        </button>

        {restaurant.discount && (
          <div className="absolute top-2 left-0 px-2.5 py-1 bg-gradient-to-r from-red-500 to-red-600 text-white text-[10px] sm:text-xs font-black rounded-r-lg shadow-lg uppercase tracking-wider flex items-center gap-1 z-10">
            <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24"><path d="M12.864 2.227l8.909 8.91a2.182 2.182 0 010 3.085l-7.364 7.364a2.182 2.182 0 01-3.085 0l-8.91-8.91A2.182 2.182 0 012 11.137V4.41A2.182 2.182 0 014.182 2.23h6.727a2.182 2.182 0 011.955-.003z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            {restaurant.discount}
          </div>
        )}
      </div>

      <div className="p-3 sm:p-4">
        <div className="flex justify-between items-start gap-2 mb-1.5">
          <h3 className="text-[15px] sm:text-[17px] font-bold text-gray-900 dark:text-white line-clamp-1 group-hover:text-red-500 transition-colors duration-200 flex-1 tracking-tight">
            {restaurant.name}
          </h3>
          <div className="flex items-center gap-1 bg-green-600 text-white px-1.5 py-0.5 rounded-md text-[10px] sm:text-[11px] font-bold shadow-sm flex-shrink-0">
            <span>{restaurant.rating || "4.2"}</span>
            <Star className="w-2.5 h-2.5 fill-current" />
          </div>
        </div>

        <p className="text-[11px] sm:text-[13px] text-gray-500 dark:text-gray-400 mb-2.5 line-clamp-1 font-medium">
          {restaurant.cuisine || "North Indian, Chinese"}
        </p>

        <div className="flex items-center justify-between pt-2.5 border-t border-gray-100/80 dark:border-gray-800">
          <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 px-2 py-1 rounded-md">
            <Clock className="w-3.5 h-3.5 text-red-500" />
            <span className="text-[10px] sm:text-xs font-semibold">{restaurant.deliveryTime || "25-30 min"}</span>
          </div>
          <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 px-2 py-1 rounded-md">
            <IndianRupee className="w-3 h-3 text-red-500" />
            <span className="text-[10px] sm:text-xs font-semibold">{restaurant.avgPrice || "200 for one"}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default React.memo(RestaurantCard);
