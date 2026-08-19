import React, { memo } from "react";
import { Link } from "react-router-dom";
import { ArrowDownUp, UtensilsCrossed, ChevronDown } from "lucide-react";
import { CategoryChipRowSkeleton } from "@food/components/ui/loading-skeletons";
import OptimizedImage from "@food/components/OptimizedImage";
import foodPattern from "@food/assets/food_pattern_background.png";

const categoryEmojiMap = {
  pizza: "🍕",
  burger: "🍔",
  "south indian": "🥞",
  sandwich: "🥪",
  biryani: "🍲",
  starter: "🍗",
  starters: "🍗",
  potato: "🍟",
  "indian pasta": "🍝",
  pasta: "🍝",
  chinese: "🥢",
  dessert: "🍰",
  desserts: "🍰",
  beverages: "🧃",
  drinks: "🥤",
  cake: "🎂",
  bakery: "🥐",
  thali: "🍱",
  rolls: "🌯",
  noodle: "🍜",
  noodles: "🍜",
  momos: "🥟",
  icecream: "🍦",
  "ice cream": "🍦",
};

const getCategoryEmoji = (name = "") => {
  const key = String(name).toLowerCase().trim();
  for (const [k, emoji] of Object.entries(categoryEmojiMap)) {
    if (key.includes(k)) return emoji;
  }
  return "🍽️";
};

const CategoryRail = memo(({ 
  displayCategories, 
  showCategorySkeleton,
  navigate,
  setShowAllCategoriesModal,
  backendOrigin = ""
}) => {
  return (
    <section className="px-4 py-4 space-y-4">
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
        What's on your mind?
      </h2>
      
      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {/* Offers Card - Rounded Square */}
        <div 
          className="flex-shrink-0 flex flex-col items-center gap-2 cursor-pointer group"
          onClick={() => navigate("/user/under-250")}
        >
          <div className="w-[72px] h-[72px] sm:w-[84px] sm:h-[84px] bg-[var(--primary-color)] rounded-2xl flex flex-col items-center justify-center p-1 shadow-sm transition-transform group-hover:scale-105 group-active:scale-95">
            <span className="text-[10px] font-bold text-white/90">UNDER</span>
            <span className="text-sm sm:text-base font-black text-white">₹200</span>
            <div className="mt-1 px-2 py-0.5 bg-white rounded-full">
              <span className="text-[8px] font-extrabold text-[var(--primary-color)]">Explore</span>
            </div>
          </div>
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Offers</span>
        </div>

        {!showCategorySkeleton && displayCategories.map((category, index) => {
          const hasImage = category.image && typeof category.image === 'string' && category.image.trim() !== '';
          const emoji = getCategoryEmoji(category.name);

          return (
            <Link
              key={category.id || index}
              to={`/user/category/${category.slug || category.name.toLowerCase().replace(/\s+/g, "-")}`}
              className="flex-shrink-0 flex flex-col items-center gap-2 group"
            >
              <div className="w-[72px] h-[72px] sm:w-[84px] sm:h-[84px] rounded-full overflow-hidden shadow-sm border border-gray-100 dark:border-gray-800 transition-transform group-hover:scale-110 flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-100 dark:from-amber-950/40 dark:to-orange-900/40">
                {hasImage ? (
                  <OptimizedImage
                    src={category.image}
                    alt={category.name}
                    className="w-full h-full object-cover"
                    backendOrigin={backendOrigin}
                  />
                ) : (
                  <span className="text-3xl sm:text-4xl select-none transform group-hover:scale-110 transition-transform">
                    {emoji}
                  </span>
                )}
              </div>
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 truncate w-full text-center max-w-[84px]">
                {category.name}
              </span>
            </Link>
          );
        })}

        {/* See All Card (Matching Image 2 Design) */}
        {!showCategorySkeleton && (
          <div 
            className="flex-shrink-0 flex flex-col items-center gap-2 cursor-pointer group"
            onClick={() => {
              if (typeof setShowAllCategoriesModal === "function") {
                setShowAllCategoriesModal(true);
              } else if (typeof navigate === "function") {
                navigate("/food/user/categories");
              } else {
                window.location.href = "/food/user/categories";
              }
            }}
          >
            <div className="w-[72px] h-[72px] sm:w-[84px] sm:h-[84px] rounded-full overflow-hidden shadow-sm border border-emerald-100/80 dark:border-emerald-900/50 bg-[#e6f7ef] dark:bg-emerald-950/40 transition-transform group-hover:scale-110 flex items-center justify-center">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#d0f2e3] dark:bg-emerald-900/60 flex items-center justify-center">
                <UtensilsCrossed className="w-5 h-5 sm:w-6 sm:h-6 text-[#00B761] dark:text-emerald-400" />
              </div>
            </div>
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-0.5 whitespace-nowrap">
              See all <ChevronDown className="w-3 h-3 text-[#00B761]" />
            </span>
          </div>
        )}

        {showCategorySkeleton && <CategoryChipRowSkeleton className="flex-shrink-0" />}
      </div>
    </section>
  );
});

export default CategoryRail;
