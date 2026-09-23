import React from "react";
import { cn } from "@/lib/utils";
import { getCloudinarySrcSet } from "@/shared/utils/cloudinaryUtils";
import { resolveQuickImageUrl } from "../../utils/image";
import CardBanner from "@/assets/CardBanner.webp";

const ExperienceBannerCarousel = ({ section, items, fullWidth = false, slideGap = 0, edgeToEdge = false }) => {
  if (!items.length) return null;

  const effectiveSlideGap = fullWidth ? 0 : slideGap;

  const [activeIndex, setActiveIndex] = React.useState(0);
  const [isResetting, setIsResetting] = React.useState(false);
  const loopedItems = items.length > 1 ? [...items, items[0]] : items;
  const stepPercent = 100 / loopedItems.length;

  React.useEffect(() => {
    if (items.length <= 1) return;

    const intervalId = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % items.length);
    }, 3500);

    return () => clearInterval(intervalId);
  }, [items.length]);

  return (
    <div className={cn("overflow-hidden", fullWidth && "w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw]")}>
      <div
        className="flex ease-out transition-transform duration-500"
        style={{
          width: `${items.length * 100}%`,
          gap: `${effectiveSlideGap}px`,
          transform: `translateX(-${activeIndex * (100 / items.length)}%)`,
        }}
      >
        {items.map((banner, idx) => {
          const rawImage = banner?.imageUrl || banner?.image || banner?.url || banner?.src || banner?.path || "";
          const resolvedUrl = resolveQuickImageUrl(rawImage);

          return (
            <div
              key={idx}
              className={cn(
                "relative shrink-0 overflow-hidden bg-slate-100 flex items-center justify-center box-border",
                fullWidth ? "h-[190px] rounded-none px-0" : "h-[190px] px-4 md:px-8"
              )}
              style={{
                width: `${100 / items.length}%`,
              }}
            >
              {fullWidth ? (
                <img
                  src={resolvedUrl || CardBanner}
                  srcSet={getCloudinarySrcSet(resolvedUrl)}
                  sizes="100vw"
                  alt={banner?.title || section?.title || "Banner"}
                  className="w-full h-full object-cover object-center"
                  loading={idx === 0 ? "eager" : "lazy"}
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = CardBanner;
                  }}
                />
              ) : (
                <div className="h-full w-full max-w-[560px] -translate-x-2 md:-translate-x-4 overflow-hidden rounded-3xl bg-slate-100 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
                  <img
                    src={resolvedUrl || CardBanner}
                    srcSet={getCloudinarySrcSet(resolvedUrl)}
                    sizes="(max-width: 768px) 100vw, 560px"
                    alt={banner?.title || section?.title || "Banner"}
                    className="w-full h-full object-cover object-center"
                    loading={idx === 0 ? "eager" : "lazy"}
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = CardBanner;
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ExperienceBannerCarousel;
