import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ChevronRight } from "lucide-react";
import OptimizedImage from "@food/components/OptimizedImage";

const WEBVIEW_SESSION_CACHE_BUSTER = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const RestaurantImageCarousel = React.memo(
  ({ restaurant, priority = false, backendOrigin = "" }) => {
    const webviewSessionKeyRef = useRef(WEBVIEW_SESSION_CACHE_BUSTER);
    const [currentIndex, setCurrentIndex] = useState(0);
    const touchStartX = useRef(0);
    const touchEndX = useRef(0);
    const isSwiping = useRef(false);

    const withCacheBuster = useCallback(
      (url) => {
        if (typeof url !== "string" || !url) return "";
        if (/^data:/i.test(url) || /^blob:/i.test(url)) return url;

        const isRelative = !/^(https?:|\/\/|data:|blob:)/i.test(url.trim());
        const resolvedUrl =
          backendOrigin && isRelative
            ? `${backendOrigin.replace(/\/$/, "")}${url.startsWith("/") ? url : `/${url}`}`
            : url;

        const hasSignedParams =
          /[?&](X-Amz-|Signature=|Expires=|AWSAccessKeyId=|GoogleAccessId=|token=|sig=|se=|sp=|sv=)/i.test(
            resolvedUrl,
          );
        if (hasSignedParams) return resolvedUrl;

        try {
          const parsed = new URL(resolvedUrl, window.location.origin);
          const currentHost =
            typeof window !== "undefined" ? window.location.hostname : "";
          const isLocalHost = /^(localhost|127\.0\.0\.1)$/i.test(
            parsed.hostname,
          );
          const isSameHost = currentHost && parsed.hostname === currentHost;

          if (isLocalHost || isSameHost) {
            parsed.searchParams.set("_wv", webviewSessionKeyRef.current);
          }
          return parsed.toString();
        } catch {
          return resolvedUrl;
        }
      },
      [backendOrigin],
    );

    // Build slides from standard restaurant images first, falling back to famousDishes
    const slides = useMemo(() => {
      // 1. If we have custom cover images, build slides from them (with label support)
      if (Array.isArray(restaurant?.coverImages) && restaurant.coverImages.length > 0) {
        return restaurant.coverImages.map((img, idx) => {
          const url = typeof img === 'object' && img !== null ? img.url : img;
          const label = typeof img === 'object' && img !== null ? img.label : '';
          return {
            id: `cover-${idx}`,
            imageUrl: withCacheBuster(url),
            isDish: false,
            label: label || ''
          };
        }).filter(slide => Boolean(slide.imageUrl));
      }

      const sourceImages =
        Array.isArray(restaurant?.images) && restaurant.images.length > 0
          ? restaurant.images
          : [restaurant?.image];

      const validImages = sourceImages
        .filter((img) => typeof img === "string")
        .map((img) => img.trim())
        .filter(Boolean);

      // If the restaurant has multiple custom uploaded cover/profile images, prioritize showing them
      if (validImages.length > 1) {
        return validImages.map((img, idx) => ({
          id: `img-${idx}`,
          imageUrl: withCacheBuster(img),
          isDish: false,
          label: ''
        }));
      }

      // Fall back to famous dishes if no custom multiple images exist
      if (Array.isArray(restaurant?.famousDishes) && restaurant.famousDishes.length > 0) {
        return restaurant.famousDishes.map((dish) => ({
          id: dish.id || dish._id,
          name: dish.name,
          price: dish.price,
          imageUrl: withCacheBuster(dish.imageUrl || dish.image),
          isDish: true,
          isVeg: dish.isVeg !== false // default to veg
        }));
      }

      // Default fallback for single image
      const result = validImages.map((img, idx) => ({
        id: `img-${idx}`,
        imageUrl: withCacheBuster(img),
        isDish: false,
        label: ''
      }));

      console.log("RestaurantImageCarousel slides for:", restaurant?.name, {
        images: restaurant?.images,
        coverImages: restaurant?.coverImages,
        slidesResult: result,
        slidesLength: result.length
      });

      return result;
    }, [restaurant?.famousDishes, restaurant?.images, restaurant?.image, restaurant?.coverImages, withCacheBuster]);

    // Reset index on restaurant change
    useEffect(() => {
      setCurrentIndex(0);
    }, [restaurant?.id, restaurant?.slug]);

    // Auto-scroll images every 4 seconds when multiple slides are available
    useEffect(() => {
      if (slides.length <= 1) return;

      const timer = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % slides.length);
      }, 4000);

      return () => clearInterval(timer);
    }, [slides.length]);

    const handleTouchStart = (e) => {
      touchStartX.current = e.touches[0].clientX;
      isSwiping.current = false;
    };

    const handleTouchMove = (e) => {
      const currentX = e.touches[0].clientX;
      const diff = touchStartX.current - currentX;
      if (Math.abs(diff) > 10) {
        isSwiping.current = true;
      }
    };

    const handleTouchEnd = (e) => {
      if (!isSwiping.current) return;
      touchEndX.current = e.changedTouches[0].clientX;
      const diff = touchStartX.current - touchEndX.current;
      const minSwipeDistance = 50;

      if (Math.abs(diff) > minSwipeDistance && slides.length > 0) {
        if (diff > 0) {
          setCurrentIndex((prev) => (prev + 1) % slides.length);
        } else {
          setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length);
        }
      }
      isSwiping.current = false;
    };

    if (slides.length === 0) {
      return (
        <div className="relative h-48 sm:h-56 md:h-60 lg:h-64 xl:h-72 w-full overflow-hidden rounded-t-md flex-shrink-0 bg-slate-100 flex items-center justify-center">
          <span className="text-xs text-gray-400 font-medium">No image available</span>
        </div>
      );
    }

    const currentSlide = slides[currentIndex];

    return (
      <div
        className="relative h-48 sm:h-56 md:h-60 lg:h-64 xl:h-72 w-full overflow-hidden rounded-t-[28px] flex-shrink-0 group"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Slides rendering with CSS transition crossfade */}
        {slides.map((slide, idx) => (
          <div
            key={slide.id || idx}
            className={`absolute inset-0 transition-opacity duration-500 ease-in-out ${
              idx === currentIndex ? "opacity-100 z-0" : "opacity-0 pointer-events-none"
            }`}
          >
            <OptimizedImage
              src={slide.imageUrl}
              alt={slide.isDish ? slide.name : `${restaurant?.name} image`}
              className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
              priority={priority && idx === 0}
              backendOrigin={backendOrigin}
            />
          </div>
        ))}

        {/* Famous Dish Info Overlay (Top-Left) */}
        {currentSlide?.isDish && (
          <div className="absolute left-4 top-4 z-10 flex items-center transform transition-transform duration-300 group-hover:scale-105">
            <div className="flex items-center rounded-full border border-white/20 bg-black/70 px-3 py-1 text-[11px] font-semibold tracking-tight text-white shadow-2xl backdrop-blur-md">
              {/* Veg Icon representation */}
              <span className={`inline-flex items-center justify-center border w-3 h-3 mr-1.5 flex-shrink-0 bg-white ${
                currentSlide.isVeg ? "border-emerald-600" : "border-red-600"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  currentSlide.isVeg ? "bg-emerald-600" : "bg-red-600"
                }`} />
              </span>
              {currentSlide.name} · ₹{currentSlide.price}
            </div>
          </div>
        )}

        {/* Cover Image Custom Label Overlay (Top-Left) */}
        {!currentSlide?.isDish && currentSlide?.label && (
          <div className="absolute left-4 top-4 z-10 flex items-center transform transition-transform duration-300 group-hover:scale-105">
            <div className="flex items-center rounded-full border border-white/20 bg-black/70 px-3 py-1 text-[11px] font-semibold tracking-tight text-white shadow-2xl backdrop-blur-md">
              {currentSlide.label}
            </div>
          </div>
        )}

        {/* Fallback to Static Featured Dish Info (Top-Left) if no other label is active */}
        {!currentSlide?.isDish && !currentSlide?.label && restaurant?.featuredDish && (
          <div className="absolute left-4 top-4 z-10 flex items-center transform transition-transform duration-300 group-hover:scale-105">
            <div className="flex items-center rounded-full border border-white/20 bg-black/70 px-4 py-1.5 text-[11px] font-medium tracking-tight text-white shadow-2xl backdrop-blur-lg">
              {restaurant.featuredDish} {restaurant.featuredPrice ? `• ₹${restaurant.featuredPrice}` : ""}
            </div>
          </div>
        )}

        {/* Circular Next Button (Middle-Right) */}
        {slides.length > 1 && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setCurrentIndex((prev) => (prev + 1) % slides.length);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-md text-gray-800 transition-all duration-300 hover:bg-white hover:scale-110 opacity-0 group-hover:opacity-100"
            aria-label="Next slide"
          >
            <ChevronRight className="h-4 h-4 stroke-[3]" />
          </button>
        )}

        {/* Subtle Pagination Indicators (Bottom-Right Corner) */}
        {slides.length > 1 && (
          <div className="absolute bottom-4 right-4 flex items-center z-10 gap-1.5">
            {slides.map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === currentIndex ? "w-4 bg-white" : "w-1.5 bg-white/50"
                }`}
              />
            ))}
          </div>
        )}

        {/* Shine hover effect overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full transition-transform duration-1000 group-hover:animate-shine pointer-events-none" />
      </div>
    );
  }
);

export default RestaurantImageCarousel;
