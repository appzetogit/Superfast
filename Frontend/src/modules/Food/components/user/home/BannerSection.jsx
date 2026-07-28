import React, { memo, useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { HeroBannerSkeleton } from "@food/components/ui/loading-skeletons";
import { optimizeCloudinaryVideoUrl } from "@shared/utils/cloudinaryUtils";
import OptimizedImage from "@food/components/OptimizedImage";

const BannerSection = memo(({
  showBannerSkeleton,
  heroBannerImages = [],
  heroBannersData = [],
  currentBannerIndex = 0,
  setCurrentBannerIndex,
  navigate,
  backendOrigin = ""
}) => {
  const [touchStartX, setTouchStartX] = useState(null);
  const [touchEndX, setTouchEndX] = useState(null);
  const [isHovered, setIsHovered] = useState(false);
  const autoSlideTimerRef = useRef(null);

  const bannerCount = heroBannerImages.length;

  const goToNext = useCallback(() => {
    if (bannerCount <= 1) return;
    setCurrentBannerIndex((prev) => (prev + 1) % bannerCount);
  }, [bannerCount, setCurrentBannerIndex]);

  const goToPrev = useCallback(() => {
    if (bannerCount <= 1) return;
    setCurrentBannerIndex((prev) => (prev - 1 + bannerCount) % bannerCount);
  }, [bannerCount, setCurrentBannerIndex]);

  // Auto-slide effect that pauses on user hover or touch
  useEffect(() => {
    if (bannerCount <= 1 || isHovered) return;
    autoSlideTimerRef.current = setInterval(() => {
      goToNext();
    }, 3500);
    return () => {
      if (autoSlideTimerRef.current) clearInterval(autoSlideTimerRef.current);
    };
  }, [bannerCount, isHovered, goToNext]);

  if (showBannerSkeleton) {
    return (
      <div className="h-full w-full">
        <HeroBannerSkeleton className="h-full w-full" />
      </div>
    );
  }

  if (!heroBannerImages || bannerCount === 0) return null;

  // Touch gesture handlers for manual swiping
  const handleTouchStart = (e) => {
    setIsHovered(true);
    setTouchStartX(e.targetTouches[0].clientX);
    setTouchEndX(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e) => {
    setTouchEndX(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    setIsHovered(false);
    if (!touchStartX || !touchEndX) return;
    const distance = touchStartX - touchEndX;
    const minSwipeDistance = 35;
    if (distance > minSwipeDistance) {
      goToNext(); // Swiped left -> next banner
    } else if (distance < -minSwipeDistance) {
      goToPrev(); // Swiped right -> previous banner
    }
    setTouchStartX(null);
    setTouchEndX(null);
  };

  const handleBannerClick = (index) => {
    const bannerData = heroBannersData[index];
    const linkedRestaurants = bannerData?.linkedRestaurants || [];
    if (linkedRestaurants.length > 0) {
      const firstRestaurant = linkedRestaurants[0];
      const restaurantSlug = firstRestaurant.slug || firstRestaurant.restaurantId || firstRestaurant._id;
      navigate(`/restaurants/${restaurantSlug}`);
    }
  };

  return (
    <div
      className="group relative h-full w-full overflow-hidden rounded-[22px] select-none bg-transparent"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Sliding Track */}
      <div
        className="flex h-full w-full transition-transform duration-500 ease-out cursor-pointer"
        style={{ transform: `translateX(-${currentBannerIndex * 100}%)` }}
      >
        {heroBannerImages.map((image, index) => {
          const bannerData = heroBannersData[index];
          const isVideo = bannerData?.type === 'video' || (typeof image === 'string' && image.toLowerCase().endsWith('.mp4'));

          return (
            <div
              key={`${index}-${image}`}
              className="relative h-full w-full flex-shrink-0"
              onClick={() => handleBannerClick(index)}
            >
              {isVideo ? (
                <video
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="h-full w-full object-cover"
                >
                  <source src={optimizeCloudinaryVideoUrl(image, { format: 'webm' })} type="video/webm" />
                  <source src={optimizeCloudinaryVideoUrl(image, { format: 'mp4' })} type="video/mp4" />
                  <source src={image} />
                </video>
              ) : (
                <OptimizedImage
                  src={image}
                  alt={`Hero Banner ${index + 1}`}
                  className="h-full w-full object-cover"
                  priority={index === currentBannerIndex}
                  backendOrigin={backendOrigin}
                  draggable={false}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Clean Navigation Arrows */}
      {bannerCount > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goToPrev();
            }}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-gray-800 shadow-md backdrop-blur-sm transition-all hover:bg-white hover:scale-110 active:scale-95 opacity-0 group-hover:opacity-100"
            aria-label="Previous Banner"
          >
            <ChevronLeft className="h-4 w-4 stroke-[2.5]" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goToNext();
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-gray-800 shadow-md backdrop-blur-sm transition-all hover:bg-white hover:scale-110 active:scale-95 opacity-0 group-hover:opacity-100"
            aria-label="Next Banner"
          >
            <ChevronRight className="h-4 w-4 stroke-[2.5]" />
          </button>
        </>
      )}

      {/* Clean Floating Pagination Dots (No black/grey background strip) */}
      {bannerCount > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-2 py-0.5">
          {heroBannerImages.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCurrentBannerIndex(index);
              }}
              className={`h-1.5 rounded-full transition-all duration-300 drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)] ${
                currentBannerIndex === index
                  ? "w-4.5 bg-white"
                  : "w-1.5 bg-white/50 hover:bg-white/90"
              }`}
              aria-label={`Go to banner ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export default BannerSection;
