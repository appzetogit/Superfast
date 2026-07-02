import React, { memo } from "react";
import { motion } from "framer-motion";
import { HeroBannerSkeleton } from "@food/components/ui/loading-skeletons";
import { optimizeCloudinaryVideoUrl } from "@shared/utils/cloudinaryUtils";

const TypewriterText = ({ text, isActive, delay = 0 }) => {
  const words = text.split(" ");
  return (
    <span className="inline-flex flex-wrap gap-x-1 sm:gap-x-1.5">
      {words.map((word, wordIndex) => (
        <span key={wordIndex} className="inline-block">
          {word.split("").map((char, charIndex) => {
            const previousCharsCount = words.slice(0, wordIndex).join("").length + wordIndex;
            const absoluteIndex = previousCharsCount + charIndex;
            return (
              <motion.span
                key={`${char}-${charIndex}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: isActive ? 1 : 0 }}
                transition={{ duration: 0.05, delay: isActive ? delay + absoluteIndex * 0.03 : 0 }}
              >
                {char}
              </motion.span>
            );
          })}
        </span>
      ))}
    </span>
  );
};
import OptimizedImage from "@food/components/OptimizedImage";

const BannerSection = memo(({
  showBannerSkeleton,
  heroBannerImages,
  heroBannersData,
  currentBannerIndex,
  setCurrentBannerIndex,
  heroShellRef,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  navigate,
  backendOrigin = ""
}) => {
  if (showBannerSkeleton) {
    return (
      <div className="h-full w-full">
        <HeroBannerSkeleton className="h-full w-full" />
      </div>
    );
  }

  if (!heroBannerImages || heroBannerImages.length === 0) return null;

  return (
    <div className="h-full w-full">
      <div
        ref={heroShellRef}
        data-home-hero-shell="true"
        className="relative w-full h-full overflow-hidden bg-transparent"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden">
            <motion.div
              animate={{
                x: ['-200%', '200%'],
              }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                repeatDelay: 5,
                ease: "easeInOut"
              }}
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-[-20deg] w-[150%] h-full"
            />
          </div>
          {heroBannerImages.map((image, index) => {
            const bannerData = heroBannersData[index];
            const isVideo = bannerData?.type === 'video' || (typeof image === 'string' && image.toLowerCase().endsWith('.mp4'));
            const isActive = currentBannerIndex === index;

            return (
              <div
                key={`${index}-${image}`}
                className="absolute inset-0 transition-opacity duration-700 ease-in-out"
                style={{
                  opacity: isActive ? 1 : 0,
                  zIndex: isActive ? 2 : 1,
                  pointerEvents: "none",
                }}>
                {isVideo ? (
                  <video
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="h-full w-full object-contain"
                    style={{ filter: "brightness(0.95)" }}
                  >
                    <source src={optimizeCloudinaryVideoUrl(image, { format: 'webm' })} type="video/webm" />
                    <source src={optimizeCloudinaryVideoUrl(image, { format: 'mp4' })} type="video/mp4" />
                    <source src={image} />
                  </video>
                ) : (
                    <OptimizedImage
                      src={image}
                      alt={`Hero Banner ${index + 1}`}
                      className="h-full w-full object-contain"
                      priority={index === currentBannerIndex}
                      backendOrigin={backendOrigin}
                      draggable={false}
                    />
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className="absolute inset-0 z-20 h-full w-full border-0 p-0 bg-transparent text-left"
          onClick={() => {
            const bannerData = heroBannersData[currentBannerIndex];
            const linkedRestaurants = bannerData?.linkedRestaurants || [];
            if (linkedRestaurants.length > 0) {
              const firstRestaurant = linkedRestaurants[0];
              const restaurantSlug = firstRestaurant.slug || firstRestaurant.restaurantId || firstRestaurant._id;
              navigate(`/restaurants/${restaurantSlug}`);
            }
          }}
          aria-label={`Open hero banner ${currentBannerIndex + 1}`}
        />

        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1.5 px-2 py-1 z-30 pointer-events-none">
          {heroBannerImages.map((_, index) => (
            <div
              key={index}
              className={`h-1 rounded-full transition-all duration-300 ${currentBannerIndex === index ? "bg-white/80 w-4" : "bg-white/30 w-1"
                }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

export default BannerSection;
