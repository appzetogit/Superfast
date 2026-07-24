import React, { useState, useRef } from 'react';
import { IndianRupee, Bookmark } from "lucide-react";
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

const RestaurantImageCarousel = React.memo(({ restaurant, priority = false, backendOrigin = "" }) => {
  const navigate = useNavigate();
  const items = restaurant?.recommendedItems || [];
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollContainerRef = useRef(null);
  
  const nameStr = typeof restaurant?.name === "string" ? restaurant.name.trim() : "";
  const fallbackSlugSource =
    nameStr ||
    (typeof restaurant?.restaurantName === "string" ? restaurant.restaurantName.trim() : "") ||
    String(restaurant?.slug || restaurant?.id || restaurant?._id || `restaurant`);
  const restaurantSlug =
    typeof restaurant?.slug === "string" && restaurant.slug.trim()
      ? restaurant.slug.trim()
      : fallbackSlugSource.toLowerCase().replace(/\s+/g, "-");

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const scrollLeft = scrollContainerRef.current.scrollLeft;
      const width = scrollContainerRef.current.clientWidth;
      if (width > 0) {
        const newIndex = Math.round(scrollLeft / width);
        setActiveIndex(newIndex);
      }
    }
  };

  React.useEffect(() => {
    if (items.length <= 1) return;
    
    // Auto-slide every 1.5 seconds
    const interval = setInterval(() => {
      if (scrollContainerRef.current) {
        const width = scrollContainerRef.current.clientWidth;
        const nextIndex = (activeIndex + 1) % items.length;
        scrollContainerRef.current.scrollTo({
          left: nextIndex * width,
          behavior: 'smooth'
        });
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [activeIndex, items.length]);

  if (!items || items.length === 0) {
    // Fallback if no recommended items exist (render a single image or placeholder)
    const sourceImages = Array.isArray(restaurant?.images) && restaurant.images.length > 0
      ? restaurant.images
      : [restaurant?.image];
    const validImages = sourceImages.filter((img) => typeof img === "string").map((img) => img.trim()).filter(Boolean);
    const renderSrc = validImages.length > 0 ? withCacheBuster(validImages[0], backendOrigin) : null;
    
    return (
      <div className="relative w-full h-[220px] sm:h-[240px] overflow-hidden bg-gray-100 dark:bg-gray-800 rounded-t-[28px] rounded-b-none">
        {renderSrc ? (
          <OptimizedImage
            src={renderSrc}
            alt={restaurant.name}
            priority={priority}
            className="w-full h-full object-cover transform scale-100 group-hover:scale-105 transition-transform duration-700"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
            <span className="text-sm font-medium">No items available</span>
          </div>
        )}
      </div>
    );
  }

  const handleItemClick = (e, itemId) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/user/restaurants/${restaurantSlug}?scrollToItem=${itemId}`);
  };

  return (
    <div 
      className="relative w-full h-[220px] sm:h-[240px] bg-gray-100 dark:bg-gray-900 border-t border-x border-b-0 border-gray-100 dark:border-gray-800 rounded-t-[28px] rounded-b-none overflow-hidden shadow-sm"
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto h-full w-full hide-scrollbar [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] snap-x snap-mandatory scroll-smooth"
      >
        {items.map((item, index) => {
          const isVeg = item.foodType !== 'Non-Veg';
          const itemImg = item.image || restaurant?.image || (Array.isArray(restaurant?.images) && restaurant.images[0]) || '';
          return (
            <div 
              key={item._id || index}
              onClick={(e) => handleItemClick(e, item._id)}
              className="w-full h-full flex-shrink-0 snap-center relative cursor-pointer"
            >
              <OptimizedImage
                src={itemImg ? withCacheBuster(itemImg, backendOrigin) : ''}
                alt={item.name}
                priority={priority && index === 0}
                className="w-full h-full object-cover"
              />
              
              {/* Subtle top gradient for better text readability */}
              <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black/40 to-transparent pointer-events-none" />

              {/* Top-left Badge */}
              <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm text-white text-[11px] sm:text-xs font-medium px-2 py-1.5 rounded-md flex items-center gap-1.5 shadow-sm">
                <div className={`flex items-center justify-center w-3 h-3 border ${isVeg ? 'border-green-600' : 'border-red-600'} bg-white rounded-[2px]`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${isVeg ? 'bg-green-600' : 'bg-red-600'}`} />
                </div>
                <span>{item.name}</span>
                <span className="opacity-70 mx-0.5">•</span>
                <span className="flex items-center font-semibold"><IndianRupee className="w-2.5 h-2.5" />{item.price}</span>
              </div>
              
              {/* Top-right Bookmark */}
              <button 
                className="absolute top-2 right-2 text-white drop-shadow-md z-10"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // Bookmark action could go here
                }}
              >
                <Bookmark className="w-5 h-5 stroke-[2.5px] hover:fill-white/30 transition-colors" />
              </button>
            </div>
          );
        })}
      </div>
      
      {/* Pagination Dots (Bottom Right) */}
      {items.length > 1 && (
        <div className="absolute bottom-2 right-2 flex gap-1 z-10 pointer-events-none">
          {items.map((_, idx) => (
            <div 
              key={idx} 
              className={`h-1.5 rounded-full transition-all duration-300 ${
                activeIndex === idx ? 'w-4 bg-white shadow-sm' : 'w-1.5 bg-white/50 shadow-sm'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export default RestaurantImageCarousel;
