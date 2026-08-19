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

  const rawItems = [
    ...(Array.isArray(restaurant?.recommendedItems) ? restaurant.recommendedItems : []),
    ...(Array.isArray(restaurant?.items) ? restaurant.items : []),
    ...(Array.isArray(restaurant?.menuItems) ? restaurant.menuItems : []),
    ...(Array.isArray(restaurant?.menu) ? restaurant.menu.flatMap(c => (Array.isArray(c?.items) ? c.items : Array.isArray(c?.dishes) ? c.dishes : [])) : []),
    ...(Array.isArray(restaurant?.categories) ? restaurant.categories.flatMap(c => (Array.isArray(c?.items) ? c.items : Array.isArray(c?.dishes) ? c.dishes : [])) : [])
  ];

  const seenIds = new Set();
  const items = rawItems.filter(item => {
    if (!item) return false;
    const id = item._id || item.id || item.name;
    if (!id || seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });

  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  activeIndexRef.current = activeIndex;
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
        activeIndexRef.current = newIndex;
        setActiveIndex(newIndex);
      }
    }
  };

  React.useEffect(() => {
    if (!items || items.length <= 1) return;
    
    // Auto-slide every 2 seconds continuously
    const interval = setInterval(() => {
      if (scrollContainerRef.current) {
        const width = scrollContainerRef.current.clientWidth || scrollContainerRef.current.getBoundingClientRect().width;
        if (!width || width <= 0) return;

        const nextIndex = (activeIndexRef.current + 1) % items.length;
        activeIndexRef.current = nextIndex;
        setActiveIndex(nextIndex);

        scrollContainerRef.current.scrollTo({
          left: nextIndex * width,
          behavior: 'smooth'
        });
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [items?.length]);

  if (!items || items.length === 0) {
    // Fallback if no recommended items exist (render cover photo, profile image, or default food placeholder)
    const extractUrl = (img) => {
      if (!img) return "";
      if (typeof img === "string") return img.trim();
      if (typeof img === "object") return (img.url || img.imageUrl || img.secure_url || "").trim();
      return "";
    };

    const rawList = [
      ...(Array.isArray(restaurant?.coverImages) ? restaurant.coverImages : []),
      ...(Array.isArray(restaurant?.images) ? restaurant.images : []),
      restaurant?.profileImage,
      restaurant?.image,
      restaurant?.coverImage,
    ];

    const validImages = rawList.map(extractUrl).filter(Boolean);
    const renderSrc = validImages.length > 0 ? withCacheBuster(validImages[0], backendOrigin) : undefined;
    
    return (
      <div className="relative w-full h-[220px] sm:h-[240px] overflow-hidden bg-gray-100 dark:bg-gray-800 rounded-t-[28px] rounded-b-none">
        <OptimizedImage
          src={renderSrc}
          alt={restaurant.name || "Restaurant"}
          priority={priority}
          className="w-full h-full object-cover transform scale-100 group-hover:scale-105 transition-transform duration-700"
        />
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
          const itemImg = item.image || item.imageUrl || (Array.isArray(restaurant?.coverImages) && (restaurant.coverImages[0]?.url || restaurant.coverImages[0])) || restaurant?.profileImage?.url || restaurant?.profileImage || restaurant?.image || null;
          return (
            <div 
              key={item._id || index}
              onClick={(e) => handleItemClick(e, item._id)}
              className="w-full h-full flex-shrink-0 snap-center relative cursor-pointer"
            >
              <OptimizedImage
                src={itemImg ? withCacheBuster(itemImg, backendOrigin) : null}
                alt={item.name}
                priority={priority && index === 0}
                className="w-full h-full object-cover"
              />
              
              {/* Subtle top gradient for better text readability */}
              <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black/40 to-transparent pointer-events-none" />

              {/* Top-left Dish Name & Price Badge */}
              <div className="absolute top-2 left-2 max-w-[70%] z-10 bg-black/75 backdrop-blur-sm text-white text-[11px] sm:text-xs font-medium px-2 py-1 rounded-md flex items-center gap-1.5 shadow-sm truncate pointer-events-none">
                <div className={`flex items-center justify-center w-3 h-3 border shrink-0 ${isVeg ? 'border-green-600' : 'border-red-600'} bg-white rounded-[2px]`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${isVeg ? 'bg-green-600' : 'bg-red-600'}`} />
                </div>
                <span className="truncate">{item.name}</span>
                <span className="opacity-70 mx-0.5 shrink-0">•</span>
                <span className="flex items-center font-semibold shrink-0"><IndianRupee className="w-2.5 h-2.5" />{item.price}</span>
              </div>
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
