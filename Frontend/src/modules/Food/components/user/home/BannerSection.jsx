import React, { memo, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { HeroBannerSkeleton } from "@food/components/ui/loading-skeletons";
import { optimizeCloudinaryVideoUrl } from "@shared/utils/cloudinaryUtils";
import OptimizedImage from "@food/components/OptimizedImage";

const DEFAULT_FALLBACK_BANNERS = [
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=1200&auto=format&fit=crop&q=80"
];

const BannerImageItem = memo(({ image, index, isVideo, bannerData, isCurrent, backendOrigin, onClick }) => {
  const fallbackSrc = DEFAULT_FALLBACK_BANNERS[index % DEFAULT_FALLBACK_BANNERS.length];
  const [imgSrc, setImgSrc] = useState(() => (image && typeof image === "string" && image.trim() !== "" ? image : fallbackSrc));
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const nextSrc = image && typeof image === "string" && image.trim() !== "" ? image : fallbackSrc;
    setImgSrc(nextSrc);
    setHasError(false);
  }, [image, fallbackSrc]);

  return (
    <div
      key={`${index}-${image}`}
      className="relative h-full w-full flex-shrink-0 snap-start"
      onClick={onClick}
    >
      {isVideo && !hasError ? (
        <video
          autoPlay
          loop
          muted
          playsInline
          className="h-full w-full object-cover"
          onError={() => setHasError(true)}
        >
          <source src={optimizeCloudinaryVideoUrl(image, { format: 'webm' })} type="video/webm" />
          <source src={optimizeCloudinaryVideoUrl(image, { format: 'mp4' })} type="video/mp4" />
          <source src={image} />
        </video>
      ) : (
        <OptimizedImage
          src={hasError ? fallbackSrc : imgSrc}
          alt={`Hero Banner ${index + 1}`}
          className="h-full w-full object-cover"
          priority={true}
          backendOrigin={backendOrigin}
          draggable={false}
          onError={() => {
            if (!hasError) {
              setHasError(true);
              setImgSrc(fallbackSrc);
            }
          }}
        />
      )}
    </div>
  );
});

const BannerSection = memo(({
  showBannerSkeleton,
  heroBannerImages = [],
  heroBannersData = [],
  currentBannerIndex = 0,
  setCurrentBannerIndex,
  navigate,
  backendOrigin = ""
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const scrollRef = useRef(null);

  // Filter out null, empty, or invalid banner image URLs
  const activeBannerImages = useMemo(() => {
    const list = Array.isArray(heroBannerImages)
      ? heroBannerImages.filter((img) => img && typeof img === "string" && img.trim() !== "")
      : [];
    return list.length > 0 ? list : DEFAULT_FALLBACK_BANNERS;
  }, [heroBannerImages]);

  const bannerCount = activeBannerImages.length;

  useEffect(() => {
    if (currentBannerIndex >= bannerCount && bannerCount > 0) {
      setCurrentBannerIndex(0);
    }
  }, [bannerCount, currentBannerIndex, setCurrentBannerIndex]);

  const scrollToIndex = useCallback((index) => {
    if (!scrollRef.current) return;
    const width = scrollRef.current.offsetWidth;
    scrollRef.current.scrollTo({ left: index * width, behavior: 'smooth' });
    setCurrentBannerIndex(index);
  }, [setCurrentBannerIndex]);

  const goToNext = useCallback(() => {
    if (bannerCount <= 1) return;
    setCurrentBannerIndex((prev) => {
      const nextIndex = (prev + 1) % bannerCount;
      if (scrollRef.current) {
        const width = scrollRef.current.offsetWidth;
        scrollRef.current.scrollTo({ left: nextIndex * width, behavior: 'smooth' });
      }
      return nextIndex;
    });
  }, [bannerCount, setCurrentBannerIndex]);

  const goToPrev = useCallback(() => {
    if (bannerCount <= 1) return;
    setCurrentBannerIndex((prev) => {
      const prevIndex = (prev - 1 + bannerCount) % bannerCount;
      if (scrollRef.current) {
        const width = scrollRef.current.offsetWidth;
        scrollRef.current.scrollTo({ left: prevIndex * width, behavior: 'smooth' });
      }
      return prevIndex;
    });
  }, [bannerCount, setCurrentBannerIndex]);

  // Auto-slide effect
  useEffect(() => {
    if (bannerCount <= 1 || isHovered) return;
    const interval = setInterval(() => {
      goToNext();
    }, 3500);

    return () => clearInterval(interval);
  }, [bannerCount, isHovered, goToNext]);

  if (showBannerSkeleton) {
    return (
      <div className="h-full w-full">
        <HeroBannerSkeleton className="h-full w-full" />
      </div>
    );
  }

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const scrollLeft = scrollRef.current.scrollLeft;
    const width = scrollRef.current.offsetWidth;
    const index = Math.round(scrollLeft / width);
    if (index !== currentBannerIndex && index >= 0 && index < bannerCount) {
      setCurrentBannerIndex(index);
    }
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
      className="group relative h-full w-full overflow-hidden rounded-[22px] select-none bg-gray-900/5 dark:bg-white/5"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={() => {
        setIsHovered(true);
        setTimeout(() => setIsHovered(false), 2000);
      }}
      onTouchEnd={() => setIsHovered(false)}
    >
      {/* Sliding Track */}
      <div
        ref={scrollRef}
        className="flex h-full w-full overflow-x-auto scrollbar-hide snap-x snap-mandatory cursor-pointer [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        onScroll={handleScroll}
      >
        {activeBannerImages.map((image, index) => {
          const bannerData = heroBannersData[index];
          const isVideo = bannerData?.type === 'video' || (typeof image === 'string' && image.toLowerCase().endsWith('.mp4'));

          return (
            <BannerImageItem
              key={`${index}-${image}`}
              image={image}
              index={index}
              isVideo={isVideo}
              bannerData={bannerData}
              isCurrent={index === currentBannerIndex}
              backendOrigin={backendOrigin}
              onClick={() => handleBannerClick(index)}
            />
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

      {/* Clean Floating Pagination Dots */}
      {bannerCount > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-2 py-0.5">
          {activeBannerImages.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                scrollToIndex(index);
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
