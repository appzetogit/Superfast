import { useSearchParams, Link, useNavigate, useLocation as useRouterLocation } from "react-router-dom";
import React, {
  Suspense,
  lazy,
  useRef,
  useEffect,
  useState,
  useMemo,
  useCallback,
  startTransition,
} from "react";
import { createPortal } from "react-dom";
import {
  Star,
  Clock,
  MapPin,
  Heart,
  Search,
  Tag,
  Flame,
  ShoppingBag,
  ShoppingCart,
  Mic,
  SlidersHorizontal,
  CheckCircle2,
  Bookmark,
  BadgePercent,
  X,
  ArrowDownUp,
  Timer,
  CalendarClock,
  ShieldCheck,
  IndianRupee,
  UtensilsCrossed,
  Leaf,
  AlertCircle,
  Loader2,
  Plus,
  Check,
  Share2,
} from "lucide-react";
import { motion, AnimatePresence, useScroll } from "framer-motion";
import {
  CategoryChipRowSkeleton,
  ExploreGridSkeleton,
  HeroBannerSkeleton,
  LoadingSkeletonRegion,
  RestaurantCardSkeleton,
  RestaurantGridSkeleton,
} from "@food/components/ui/loading-skeletons";
import { useProfile } from "@food/context/ProfileContext";
import { useCart } from "@food/context/CartContext";
import { HorizontalCarousel } from "@food/components/ui/horizontal-carousel";
import { DotPattern } from "@food/components/ui/dot-pattern";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@food/components/ui/card";
import { Button } from "@food/components/ui/button";
import { Badge } from "@food/components/ui/badge";
import { Input } from "@food/components/ui/input";
import { Switch } from "@food/components/ui/switch";
import { Checkbox } from "@food/components/ui/checkbox";
import {
  useSearchOverlay,
  useLocationSelector,
} from "@food/components/user/UserLayout";

const debugLog = (...args) => { };
const debugWarn = (...args) => { };
const debugError = (...args) => { };

// Import shared food images - prevents duplication
import { foodImages } from "@food/constants/images";

import { Avatar, AvatarFallback } from "@food/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@food/components/ui/dropdown-menu";
import { useLocation } from "@food/hooks/useLocation";
import { useZone } from "@food/hooks/useZone";


import api, { publicGetOnce, restaurantAPI, adminAPI } from "@food/api";
import { API_BASE_URL } from "@food/api/config";
import OptimizedImage from "@food/components/OptimizedImage";
import { getRestaurantAvailabilityStatus } from "@food/utils/restaurantAvailability";
import HomeHeader from "@food/components/user/home/HomeHeader";
import { LocationProvider as QuickLocationProvider } from "../../../quickCommerce/user/context/LocationContext";
import { ProductDetailProvider as QuickProductDetailProvider } from "../../../quickCommerce/user/context/ProductDetailContext";
import { WishlistProvider as QuickWishlistProvider } from "../../../quickCommerce/user/context/WishlistContext";
import { CartAnimationProvider as QuickCartAnimationProvider } from "../../../quickCommerce/user/context/CartAnimationContext";
import { CartProvider as QuickCartProvider } from "../../../quickCommerce/user/context/CartContext";
import { prefetchQuickHomeBootstrap } from "../../../quickCommerce/user/services/customerApi";
import PromoRow from "@food/components/user/home/PromoRow";
import { optimizeCloudinaryUrl } from "../../../../shared/utils/cloudinaryUtils";
import VegModePopups from "@food/components/user/VegModePopups";

import * as imgUtils from "@food/utils/imageUtils";
import { useFoodHomeData } from "@food/hooks/useFoodHomeData";
import { getCachedSettings, loadBusinessSettings } from "@/modules/common/utils/businessSettings";
import { useServiceability } from "@/modules/common/hooks/useServiceability";
import ServiceUnavailable from "@/modules/common/components/ServiceUnavailable";
import bakeryIcon from "@food/assets/explore more icons/bakery.png";
// Extracted Sub-components (Statically imported to make tab switching buttery smooth and instant)
import BannerSection from "@food/components/user/home/BannerSection";
import CategoryRail from "@food/components/user/home/CategoryRail";
import RecommendedSection from "@food/components/user/home/RecommendedSection";
import RecommendationsSection from "@food/components/user/home/RecommendationsSection";
import RestaurantGrid from "@food/components/user/home/RestaurantGrid";
import SortFilterSection from "@food/components/user/home/SortFilterSection";
import ExploreMoreSection from "@food/components/user/home/ExploreMoreSection";

import MiniCart from "@food/components/user/MiniCart";
import OrderTrackingCard from "@food/components/user/OrderTrackingCard";
import QuickCommerceHomePage from "../../../quickCommerce/user/pages/Home";

// Animated placeholder for search - moved outside component to prevent recreation
const placeholders = [
  'Search "burger"', 'Search "biryani"', 'Search "pizza"', 'Search "desserts"',
  'Search "chinese"', 'Search "thali"', 'Search "momos"', 'Search "dosa"', 'Search "thali"',
];

const quickPlaceholders = [
  'Search "milk"', 'Search "bread"', 'Search "eggs"', 'Search "chips"',
  'Search "fruits"', 'Search "atta"', 'Search "cold drink"', 'Search "ice cream"',
];

const WEBVIEW_SESSION_CACHE_BUSTER = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const getStoredDeliveryAddressMode = () => {
  if (typeof window === "undefined") return "saved";
  return window.localStorage.getItem("deliveryAddressMode") || "saved";
};

const defaultBannersImages = [];

const defaultBannersData = [];

export default function Home() {
  const HERO_BANNER_AUTO_SLIDE_MS = 3500;
  const BACKEND_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [heroSearch, setHeroSearch] = useState("");
  const { openSearch, closeSearch, searchValue, setSearchValue } = useSearchOverlay();
  const { openLocationSelector } = useLocationSelector();
  const { vegMode, setVegMode: setVegModeContext, isFavorite, addFavorite, removeFavorite, getDefaultAddress, userProfile } = useProfile();
  const { cart } = useCart();
  const hasFoodCartItems = useMemo(
    () => cart.some((item) => (item?.orderType || "food") !== "quick"),
    [cart],
  );

  const [prevVegMode, setPrevVegMode] = useState(vegMode);
  const [showVegModePopup, setShowVegModePopup] = useState(false);
  const [showSwitchOffPopup, setShowSwitchOffPopup] = useState(false);
  const [isApplyingVegMode, setIsApplyingVegMode] = useState(false);
  const [isSwitchingOffVegMode, setIsSwitchingOffVegMode] = useState(false);
  const [showAllCategoriesModal, setShowAllCategoriesModal] = useState(false);
  const [availabilityTick, setAvailabilityTick] = useState(Date.now());
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.get('tab') === 'quick' || window.location.pathname.startsWith('/quick')) return "quick";
    }
    return "food";
  });
  const [quickThemeColor, setQuickThemeColor] = useState(() => {
    const settings = getCachedSettings();
    return settings?.moduleThemes?.quickCommerce?.themeColor || "#00BFA5";
  });
  const [quickSecondaryThemeColor, setQuickSecondaryThemeColor] = useState(() => {
    const settings = getCachedSettings();
    return settings?.moduleThemes?.quickCommerce?.secondaryThemeColor || "#008b74";
  });
  const [foodThemeColor, setFoodThemeColor] = useState(() => {
    const settings = getCachedSettings();
    return settings?.moduleThemes?.food?.themeColor || "#cc2532";
  });
  const [foodSecondaryThemeColor, setFoodSecondaryThemeColor] = useState(() => {
    const settings = getCachedSettings();
    return settings?.moduleThemes?.food?.secondaryThemeColor || "#b3202c";
  });
  const [showToast, setShowToast] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  const heroShellRef = useRef(null);
  const restaurantLoadMoreRef = useRef(null);
  const isHandlingSwitchOff = useRef(false);
  const routerLocation = useRouterLocation();

  // Listen for business settings updates to dynamically change theme color without refreshing
  useEffect(() => {
    const handleSettingsUpdate = (e) => {
      const settings = e.detail;
      if (settings?.moduleThemes?.quickCommerce?.themeColor) {
        setQuickThemeColor(settings.moduleThemes.quickCommerce.themeColor);
      }
      if (settings?.moduleThemes?.quickCommerce?.secondaryThemeColor) {
        setQuickSecondaryThemeColor(settings.moduleThemes.quickCommerce.secondaryThemeColor);
      }
      if (settings?.moduleThemes?.food?.themeColor) {
        setFoodThemeColor(settings.moduleThemes.food.themeColor);
      }
      if (settings?.moduleThemes?.food?.secondaryThemeColor) {
        setFoodSecondaryThemeColor(settings.moduleThemes.food.secondaryThemeColor);
      }
    };
    window.addEventListener('businessSettingsUpdated', handleSettingsUpdate);
    return () => window.removeEventListener('businessSettingsUpdated', handleSettingsUpdate);
  }, []);

  // Fetch fresh settings from server on mount to ensure colors are up-to-date
  useEffect(() => {
    loadBusinessSettings(true).then((settings) => {
      if (settings?.moduleThemes?.quickCommerce?.themeColor) {
        setQuickThemeColor(settings.moduleThemes.quickCommerce.themeColor);
      }
      if (settings?.moduleThemes?.quickCommerce?.secondaryThemeColor) {
        setQuickSecondaryThemeColor(settings.moduleThemes.quickCommerce.secondaryThemeColor);
      }
      if (settings?.moduleThemes?.food?.themeColor) {
        setFoodThemeColor(settings.moduleThemes.food.themeColor);
      }
      if (settings?.moduleThemes?.food?.secondaryThemeColor) {
        setFoodSecondaryThemeColor(settings.moduleThemes.food.secondaryThemeColor);
      }
    });
  }, []);

  // --- Location Logic ---
  const { location, deliveryAddressMode } = useLocation();
  const { zoneId: effectiveZoneId, isInService: isLiveInService, isOutOfService: isEffectiveOutOfService } = useZone(location);

  // --- Serviceability ---
  const { isModuleEnabled, loading: serviceabilityLoading } = useServiceability(activeTab);

  const hideExtras = !isModuleEnabled || isEffectiveOutOfService;

  // --- Core Data Hook ---
  const {
    banners,
    categories,
    restaurants,
    landing,
    meta,
    actions,
    state
  } = useFoodHomeData({
    zoneId: effectiveZoneId,
    location: location,
    vegMode,
    backendOrigin: BACKEND_ORIGIN,
    availabilityTick
  });

  const finalExploreItemsFiltered = useMemo(() => {
    const items = landing?.exploreMore || [];
    const settings = getCachedSettings();
    const isHomeBakeryEnabled = settings?.modules?.homeBakery;
    if (isHomeBakeryEnabled) {
      const hasBakery = items.some(item => item.id === "home-bakery" || item.href?.includes("bakery"));
      if (!hasBakery) {
        return [
          ...items,
          {
            id: "home-bakery",
            label: "Home Bakery",
            href: "/food/user/bakery/list",
            image: bakeryIcon,
          }
        ];
      }
    }
    return items;
  }, [landing?.exploreMore]);

  const userPreferredCategories = useMemo(() => {
    const rawCategories = categories.display;
    const userPrefs = userProfile?.preferences || [];
    if (!userPrefs || userPrefs.length === 0) {
      return rawCategories;
    }

    const prefIds = userPrefs.map(pref => typeof pref === "string" ? pref : String(pref._id || pref));
    const filtered = rawCategories.filter(cat =>
      prefIds.includes(String(cat.id)) || prefIds.includes(String(cat._id)) || prefIds.includes(String(cat.slug))
    );

    return filtered.length > 0 ? filtered : rawCategories;
  }, [categories.display, userProfile?.preferences]);

  // --- UI Effects ---
  useEffect(() => {
    const intervalId = setInterval(() => setAvailabilityTick(Date.now()), 60000);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const activePlaceholders = activeTab === "quick" ? quickPlaceholders : placeholders;
      setPlaceholderIndex((prev) => (prev + 1) % activePlaceholders.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [activeTab]);

  const activeBannerImages = useMemo(() => banners?.images || [], [banners?.images]);

  const activeBannerData = useMemo(() => banners?.data || [], [banners?.data]);

  // Auto-slide banners
  useEffect(() => {
    if (!activeBannerImages.length) return;
    const interval = setInterval(() => {
      setCurrentBannerIndex((prev) => (prev + 1) % activeBannerImages.length);
    }, HERO_BANNER_AUTO_SLIDE_MS);
    return () => clearInterval(interval);
  }, [activeBannerImages.length]);

  // Prevent body scroll when popups are open
  useEffect(() => {
    if (showVegModePopup || showSwitchOffPopup || showAllCategoriesModal) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [showVegModePopup, showSwitchOffPopup, showAllCategoriesModal]);

  // Sync activeTab with URL
  useEffect(() => {
    const searchParams = new URLSearchParams(routerLocation.search);
    const targetTab = (searchParams.get('tab') === 'quick' || routerLocation.pathname.startsWith('/quick')) ? 'quick' : 'food';

    if (activeTab !== targetTab) setActiveTab(targetTab);
  }, [routerLocation.search, routerLocation.pathname, activeTab]);

  // --- Handlers ---
  const handleTabChange = (tab) => {
    startTransition(() => setActiveTab(tab));
    navigate({ search: `?tab=${tab}` }, { replace: true });
  };

  const handleVegModeChange = (newValue) => {
    if (isHandlingSwitchOff.current) return;
    if (newValue && !vegMode) setShowVegModePopup(true);
    else if (!newValue && vegMode) {
      isHandlingSwitchOff.current = true;
      setShowSwitchOffPopup(true);
    } else {
      setVegModeContext(newValue);
    }
  };

  const handleSearchFocus = useCallback(() => {
    navigate(`/search?tab=${activeTab}`);
  }, [activeTab, navigate]);

  // --- Render ---
  return (
    <div 
      className="relative min-h-screen bg-white dark:bg-[#0a0a0a] pb-16 md:pb-6 overflow-x-clip"
      style={{
        '--primary-color': activeTab === "quick" ? quickThemeColor : foodThemeColor,
        '--primary-theme': activeTab === "quick" ? quickThemeColor : foodThemeColor,
        '--secondary-color': activeTab === "quick" ? quickSecondaryThemeColor : foodSecondaryThemeColor,
        '--secondary-theme': activeTab === "quick" ? quickSecondaryThemeColor : foodSecondaryThemeColor,
      }}
    >
      <div className="md:hidden relative overflow-x-clip z-[50]">
          <HomeHeader
            activeTab={activeTab}
            setActiveTab={handleTabChange}
            location={location}
            savedAddressText={imgUtils.formatSavedAddress(location)}
            handleLocationClick={() => openLocationSelector()}
            handleSearchFocus={handleSearchFocus}
            placeholderIndex={placeholderIndex}
            placeholders={activeTab === "quick" ? quickPlaceholders : placeholders}
            vegMode={vegMode}
            onVegModeChange={handleVegModeChange}
            headerVideoUrl={landing.videoUrl}
            quickThemeColor={quickThemeColor}
            quickSecondaryThemeColor={quickSecondaryThemeColor}
            foodThemeColor={foodThemeColor}
            foodSecondaryThemeColor={foodSecondaryThemeColor}
            hideExtras={hideExtras}
            bannerComponent={
              <div className="h-[130px] sm:h-36 md:h-44 mt-3 relative z-10 w-full bg-transparent" />
            }
          />
      </div>

      <AnimatePresence initial={false} mode="wait">
        {hideExtras ? (
          <motion.div
            key="unavailable"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="bg-white dark:bg-[#0a0a0a]"
          >
            <ServiceUnavailable
              type={!isModuleEnabled ? "module" : "zone"}
              moduleName={activeTab === 'food' ? 'Food Delivery' : 'SuperfastMart'}
              onRefresh={() => window.location.reload()}
            />
          </motion.div>
        ) : activeTab === "food" ? (
          <motion.div
            key="food-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="bg-white dark:bg-[#0a0a0a]"
          >
            <Suspense fallback={<CategoryChipRowSkeleton className="py-1" />}>
              <div className="sticky top-[66px] z-[40] md:relative md:top-auto bg-white dark:bg-[#0a0a0a] border-b border-slate-100 dark:border-white/5 transition-all">
                <CategoryRail
                  displayCategories={userPreferredCategories}
                  showCategorySkeleton={categories.loading}
                  navigate={navigate}
                  setShowAllCategoriesModal={setShowAllCategoriesModal}
                  backendOrigin={BACKEND_ORIGIN}
                />
              </div>
            </Suspense>

            {(banners.loading || (banners?.images?.length > 0)) && (
              <Suspense fallback={<HeroBannerSkeleton className="h-full w-full px-4 mt-3" />}>
                <section className="content-auto px-4 pt-3 sm:pt-4 lg:pt-5 mb-4 sm:mb-6">
                  <div className="overflow-hidden rounded-[22px] border border-slate-100 bg-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.3)] h-48 sm:h-56 md:h-64 lg:h-72">
                    <BannerSection
                      showBannerSkeleton={banners.loading}
                      heroBannerImages={banners.images}
                      heroBannersData={banners.data}
                      currentBannerIndex={currentBannerIndex}
                      setCurrentBannerIndex={setCurrentBannerIndex}
                      heroShellRef={heroShellRef}
                      navigate={navigate}
                      backendOrigin={BACKEND_ORIGIN}
                    />
                  </div>
                </section>
              </Suspense>
            )}

            <Suspense fallback={null}>
              <SortFilterSection
                activeFilters={state.activeFilters}
                toggleFilter={actions.toggleFilter}
                setIsFilterOpen={(val) => { }} // Hook handles internal apply
              />
            </Suspense>

            <Suspense fallback={null}>
              <RecommendationsSection fallbackRestaurants={meta.recommended} zoneId={effectiveZoneId} />
            </Suspense>

            <Suspense fallback={null}>
              <ExploreMoreSection
                exploreMoreHeading={landing.heading}
                showExploreSkeleton={landing.loading}
                finalExploreItems={finalExploreItemsFiltered}
                backendOrigin={BACKEND_ORIGIN}
              />
            </Suspense>

            {/* Custom cake promo banner removed */}

            <Suspense fallback={<RestaurantGridSkeleton count={3} />}>
              <RestaurantGrid
                filteredRestaurants={restaurants.visible}
                visibleRestaurants={restaurants.visible}
                showRestaurantSkeleton={restaurants.loading}
                isLoadingFilterResults={restaurants.isLoadingFilterResults}
                loadingRestaurants={restaurants.loading}
                availabilityTick={availabilityTick}
                isFavorite={isFavorite}
                onFavoriteToggle={(e, restaurant, slug, favorite) => {
                  if (favorite) removeFavorite(slug);
                  else {
                    addFavorite(restaurant);
                    setShowToast(true);
                    setTimeout(() => setShowToast(false), 2000);
                  }
                }}
                backendOrigin={BACKEND_ORIGIN}
                hasMoreRestaurants={restaurants.hasMore}
                loadMoreRestaurants={actions.loadMoreRestaurants}
                restaurantLoadMoreRef={restaurantLoadMoreRef}
              />
            </Suspense>
          </motion.div>
        ) : (
          <motion.div
            key="quick-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="bg-white dark:bg-[#0a0a0a]"
          >
            <QuickLocationProvider>
              <QuickCartProvider>
                <QuickWishlistProvider>
                  <QuickCartAnimationProvider>
                    <QuickProductDetailProvider>
                      <Suspense fallback={<div className="h-screen w-full bg-white dark:bg-[#0a0a0a]" />}>
                        <QuickCommerceHomePage
                          embedded
                          embeddedHeaderColor={quickSecondaryThemeColor}
                        />
                      </Suspense>
                    </QuickProductDetailProvider>
                  </QuickCartAnimationProvider>
                </QuickWishlistProvider>
              </QuickCartProvider>
            </QuickLocationProvider>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Veg Mode Popups (Enable / Switch Off) */}
      <VegModePopups
        showVegModePopup={showVegModePopup}
        showSwitchOffPopup={showSwitchOffPopup}
        onCloseVegPopup={(level) => {
          setShowVegModePopup(false);
          if (level) {
            setVegModeContext(level);
          }
        }}
        onCloseSwitchOffPopup={() => {
          setShowSwitchOffPopup(false);
          isHandlingSwitchOff.current = false;
        }}
        onConfirmSwitchOff={() => {
          setVegModeContext(false);
          setShowSwitchOffPopup(false);
          isHandlingSwitchOff.current = false;
        }}
      />

      {/* Category Modal */}
      <AnimatePresence>
        {showAllCategoriesModal && (
          <div className="fixed inset-0 z-[9999] flex flex-col bg-white dark:bg-[#1a1a1a]">
            <HomeHeader embedded location={location} savedAddressText="All Categories" handleLocationClick={() => setShowAllCategoriesModal(false)} />
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-3 gap-6">
              {categories.display.map(cat => (
                <Link key={cat.id} to={`/user/category/${cat.slug}`} className="flex flex-col items-center gap-2" onClick={() => setShowAllCategoriesModal(false)}>
                  <div className="w-20 h-20 rounded-full overflow-hidden shadow-sm bg-gray-50">
                    <OptimizedImage src={cat.image} className="w-full h-full object-cover" backendOrigin={BACKEND_ORIGIN} />
                  </div>
                  <span className="text-xs font-semibold text-center">{cat.name}</span>
                </Link>
              ))}
            </div>
            <Button className="m-6 rounded-2xl" variant="secondary" onClick={() => setShowAllCategoriesModal(false)}>Close</Button>
          </div>
        )}
      </AnimatePresence>

      {activeTab === "food" && hasFoodCartItems && !hideExtras && <Suspense fallback={null}><MiniCart /></Suspense>}
      {!hideExtras && <Suspense fallback={null}><OrderTrackingCard hasBottomNav /></Suspense>}
    </div>
  );
}
