import { useState, useEffect, useMemo, useCallback, useRef, startTransition, useDeferredValue } from "react";
import { publicGetOnce, restaurantAPI, adminAPI } from "@food/api";
import { foodImages } from "@food/constants/images";
import { getRestaurantAvailabilityStatus } from "@food/utils/restaurantAvailability";
import * as imgUtils from "@food/utils/imageUtils";
import offersIcon from "@food/assets/explore more icons/offers.png";
import gourmetIcon from "@food/assets/explore more icons/gourmet.png";
import collectionIcon from "@food/assets/explore more icons/collection.png";
import bakeryIcon from "@food/assets/explore more icons/bakery.png";

const getExploreIconFallback = (label = "", type = "") => {
  const name = (label || "").toLowerCase();
  const linkType = (type || "").toLowerCase();
  if (name.includes("offer") || linkType === "offers") return offersIcon;
  if (name.includes("gourmet") || linkType === "gourmet") return gourmetIcon;
  if (name.includes("collection") || linkType === "collections") return collectionIcon;
  if (name.includes("bakery")) return bakeryIcon;
  return offersIcon;
};

/**
 * Custom hook to manage all data fetching and filtering for the Food Module Home Page.
 * Encapsulates banners, categories, settings, and restaurant filtering logic.
 */
// --- Global Persistence Cache (Outlives Component Lifecycle) ---
let globalHomeCache = {
  bootstrap: null,
  restaurants: null,
  lastFetched: 0,
};

const CACHE_EXPIRY_MS = 5 * 1000; // 5 seconds to ensure fresh reviewer / dev mode data

export const clearGlobalHomeCache = () => {
  globalHomeCache = {
    bootstrap: null,
    restaurants: null,
    lastFetched: 0,
  };
};

export const useFoodHomeData = ({ 
  zoneId, 
  location, 
  vegMode, 
  backendOrigin,
  availabilityTick 
}) => {
  // Use cache as initial state even if expired (Stale-While-Revalidate)
  const hasData = !!globalHomeCache.bootstrap;
  
  // Clear restaurant cache when zone changes (prevents stale dev-mode or cross-zone data)
  const prevZoneIdRef = useRef(zoneId);
  if (prevZoneIdRef.current !== zoneId) {
    prevZoneIdRef.current = zoneId;
    globalHomeCache.restaurants = null;
  }

  // --- Bootstrap State ---
  const [isBootstrapped, setIsBootstrapped] = useState(hasData);
  
  // --- Banners State ---
  const [heroBannerImages, setHeroBannerImages] = useState(globalHomeCache.bootstrap?.banners?.images || []);
  const [heroBannersData, setHeroBannersData] = useState(globalHomeCache.bootstrap?.banners?.data || []);
  const [loadingBanners, setLoadingBanners] = useState(!hasData);

  // --- Categories State ---
  const [realCategories, setRealCategories] = useState(globalHomeCache.bootstrap?.categories || []);
  const [loadingRealCategories, setLoadingRealCategories] = useState(!hasData);
  const [menuCategories, setMenuCategories] = useState([]);
  const [loadingMenuCategories, setLoadingMenuCategories] = useState(false);
  const [landingCategories, setLandingCategories] = useState([]);
  
  // --- Landing Config State ---
  const [landingExploreMore, setLandingExploreMore] = useState(globalHomeCache.bootstrap?.exploreMore || []);
  const [exploreMoreHeading, setExploreMoreHeading] = useState(globalHomeCache.bootstrap?.settings?.heading || "Explore More");
  const [headerVideoUrl, setHeaderVideoUrl] = useState(globalHomeCache.bootstrap?.settings?.videoUrl || "");
  const [recommendedRestaurantIds, setRecommendedRestaurantIds] = useState(globalHomeCache.bootstrap?.settings?.recommendedIds || []);
  const [recommendedRestaurantsFromSettings, setRecommendedRestaurantsFromSettings] = useState(globalHomeCache.bootstrap?.settings?.recommendedRaw || []);
  const [loadingLandingConfig, setLoadingLandingConfig] = useState(!hasData);

  // --- Restaurants State ---
  const [restaurantsData, setRestaurantsData] = useState(globalHomeCache.restaurants || []);
  const [loadingRestaurants, setLoadingRestaurants] = useState(!globalHomeCache.restaurants);
  const [visibleRestaurantCount, setVisibleRestaurantCount] = useState(6);
  const [isLoadingFilterResults, setIsLoadingFilterResults] = useState(false);
  
  // ... existing filter state ...
  const [activeFilters, setActiveFilters] = useState(new Set());
  const [sortBy, setSortBy] = useState(null);
  const [selectedCuisine, setSelectedCuisine] = useState(null);
  const [appliedFilters, setAppliedFilters] = useState({
    activeFilters: new Set(),
    sortBy: null,
    selectedCuisine: null,
  });

  // --- Internal Refs ---
  const restaurantsRequestSeqRef = useRef(0);
  const menuUnionRequestSeqRef = useRef(0);
  const menuUnionCacheRef = useRef(new Map());
  const publicCategoriesCacheRef = useRef(new Map());

  // --- Image Helpers ---
  const normalizeImageUrl = useCallback((imageUrl) => 
    imgUtils.normalizeImageUrl(imageUrl, backendOrigin), [backendOrigin]);
  
  const extractImages = useCallback((source) => 
    imgUtils.extractImages(source, backendOrigin), [backendOrigin]);

  const buildRestaurantImageCandidates = useCallback((value) => 
    imgUtils.buildRestaurantImageCandidates(value, backendOrigin), [backendOrigin]);

  const slugifyCategory = imgUtils.slugifyCategory;

  // --- Consolidated Bootstrap Fetch ---
  useEffect(() => {
    let cancelled = false;
    const zoneKey = String(zoneId || "global");

    const handleSettingsUpdated = () => {
      clearGlobalHomeCache();
      fetchBootstrap();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("businessSettingsUpdated", handleSettingsUpdated);
    }

    const fetchBootstrap = async () => {
      // Re-use cache if strictly valid
      if (globalHomeCache.bootstrap && (Date.now() - globalHomeCache.lastFetched < CACHE_EXPIRY_MS)) {
        return;
      }

      // Fire all metadata requests in parallel
      const results = await Promise.allSettled([
        publicGetOnce(zoneId 
          ? `/food/hero-banners/public?zoneId=${encodeURIComponent(String(zoneId))}`
          : "/food/hero-banners/public"
        ),
        (async () => {
          let list = [];
          try {
            const resCat = await publicGetOnce("/food/hero-banners/landing/categories/public");
            if (resCat?.data?.success && Array.isArray(resCat?.data?.data?.categories) && resCat.data.data.categories.length > 0) {
              list = resCat.data.data.categories;
            }
          } catch (e) {
            // fallback if error
          }
          if (!list || list.length === 0) {
            const res = await adminAPI.getPublicCategories(zoneId ? { zoneId } : {});
            list = res?.data?.data?.categories || res?.data?.categories || [];
          }
          return list.map((cat, idx) => ({
            id: String(cat?.id || cat?._id || cat?.slug || idx),
            name: cat?.name || cat?.label || "",
            slug: cat?.slug || String(cat?.name || cat?.label || "").toLowerCase().replace(/\s+/g, "-"),
            image: normalizeImageUrl(cat?.image || cat?.imageUrl) || "",
          }));
        })(),
        publicGetOnce("/food/explore-icons/public"),
        (() => {
          const params = new URLSearchParams();
          if (zoneId) params.set("zoneId", String(zoneId));
          if (location?.latitude && location?.longitude) {
            params.set("lat", String(location.latitude));
            params.set("lng", String(location.longitude));
          }
          const qs = params.toString();
          return publicGetOnce(qs ? `/food/landing/settings/public?${qs}` : "/food/landing/settings/public");
        })(),
      ]);

      if (cancelled) return;

      const newBootstrapCache = { banners: {}, categories: [], exploreMore: [], settings: {} };

      // Process Banners
      if (results[0].status === "fulfilled") {
        const data = results[0].value?.data?.data;
        const list = Array.isArray(data?.banners) ? data.banners : (Array.isArray(data) ? data : []);
        setHeroBannersData(list);
        const imgs = list.map(b => b?.imageUrl).filter(Boolean);
        setHeroBannerImages(imgs);
        newBootstrapCache.banners = { data: list, images: imgs };
      }

      // Process Categories
      if (results[1].status === "fulfilled") {
        const cats = results[1].value;
        setRealCategories(cats);
        newBootstrapCache.categories = cats;
      }

      // Process Explore & Settings
      if (results[2].status === "fulfilled") {
        const exploreData = results[2].value?.data?.data;
        const items = Array.isArray(exploreData?.items) ? exploreData.items : (Array.isArray(exploreData) ? exploreData : []);
        const transformedItems = items.map(it => {
          let href = "/food/user";
          const type = it.linkType || "";
          const target = it.link || it.targetPath || "";

          if (type === 'offers') href = "/user/offers";
          else if (type === 'gourmet') href = "/user/gourmet";
          else if (type === 'collections') href = "/user/collections";
          else if (target) href = target;

          const normalizedImg = normalizeImageUrl(it.image || it.imageUrl || it.iconUrl || it.icon);
          const finalImage = normalizedImg || getExploreIconFallback(it.label || it.name, type);

          return {
            ...it,
            image: finalImage,
            label: it.label || it.name || "Explore",
            href,
          };
        }).filter(it => it.linkType !== 'top-10' && !it.label?.toLowerCase().includes('top 10'));

        setLandingExploreMore(transformedItems);
        newBootstrapCache.exploreMore = transformedItems;
      }

      if (results[3].status === "fulfilled") {
        const settings = results[3].value?.data?.data || {};
        setExploreMoreHeading(settings.exploreMoreHeading || "Explore More");
        setHeaderVideoUrl(settings.headerVideoUrl || "");
        setRecommendedRestaurantIds(settings.recommendedRestaurantIds || []);
        setRecommendedRestaurantsFromSettings(settings.recommendedRestaurants || []);
        newBootstrapCache.settings = {
          heading: settings.exploreMoreHeading,
          videoUrl: settings.headerVideoUrl,
          recommendedIds: settings.recommendedRestaurantIds,
          recommendedRaw: settings.recommendedRestaurants,
        };
      }

      // Update global cache
      globalHomeCache.bootstrap = newBootstrapCache;
      globalHomeCache.lastFetched = Date.now();

      setLoadingBanners(false);
      setLoadingRealCategories(false);
      setLoadingLandingConfig(false);
      setIsBootstrapped(true);
    };

    fetchBootstrap();
    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("businessSettingsUpdated", handleSettingsUpdated);
      }
    };
  }, [zoneId, normalizeImageUrl]);

  // --- Fetch Restaurants ---
  const fetchRestaurants = useCallback(async (filters = {}) => {
    if (!location) return; // Wait for location to initialize to prevent premature/duplicate calls
    
    const requestSeq = ++restaurantsRequestSeqRef.current;
    try {
      if (restaurantsData.length === 0) {
        setLoadingRestaurants(true);
      }
      const params = {};

      // Use provided zoneId or fall back to localStorage cached zone
      const effectiveZoneId = zoneId || (typeof window !== 'undefined' ? window.localStorage.getItem('userZoneId') : null);
      if (effectiveZoneId) {
        params.zoneId = effectiveZoneId;
        // When zone filter is applied, skip lat/lng to avoid $geoNear 25km radius
        // blocking restaurants whose location coordinates aren't properly indexed
      } else {
        // No zone — use geo-based discovery if coordinates available
        const lat = Number(location?.latitude);
        const lng = Number(location?.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          params.lat = lat;
          params.lng = lng;
        }
      }

      if (filters.sortBy) params.sortBy = filters.sortBy;
      if (filters.selectedCuisine) params.cuisine = filters.selectedCuisine;

      // Map local active filters to API params
      if (filters.activeFilters?.has("rating-45-plus")) params.minRating = 4.5;
      else if (filters.activeFilters?.has("rating-4-plus")) params.minRating = 4.0;
      
      const response = await restaurantAPI.getRestaurants(params);
      if (requestSeq !== restaurantsRequestSeqRef.current) return;

      if (response.data?.success && response.data?.data?.restaurants) {
        const transformed = response.data.data.restaurants.map(restaurant => {
          const profileImageCandidates = buildRestaurantImageCandidates(restaurant.profileImage || restaurant.image);
          const coverImages = extractImages(restaurant.coverImages || restaurant.coverImage);
          const allImages = Array.from(new Set([...profileImageCandidates, ...coverImages].filter(Boolean)));
          
          return {
            id: restaurant.restaurantId || restaurant._id,
            mongoId: restaurant._id,
            name: restaurant.restaurantName || restaurant.name || "Restaurant",
            cuisine: restaurant.cuisines?.[0] || "Multi-cuisine",
            rating: Number(restaurant.rating) || 0,
            deliveryTime: restaurant.estimatedDeliveryTime || "25-30 mins",
            distance: restaurant.distanceInKm 
              ? `${restaurant.distanceInKm} km` 
              : (restaurant.distance ? String(restaurant.distance).includes("km") ? restaurant.distance : `${restaurant.distance} km` : `${(2 + Math.random()).toFixed(1)} km`),
            featuredDish: restaurant.featuredDish || "Special Dish",
            featuredPrice: restaurant.featuredPrice || (restaurant.restaurantName === "Sayaji" ? "249" : "199"),
            image: allImages[0] || "",
            images: allImages,
            pureVegRestaurant: Boolean(restaurant.pureVegRestaurant === true || restaurant.foodType === 'Veg' || restaurant.veg === true || restaurant.isPureVeg === true),
            location: restaurant.location,
            offer: restaurant.offer,
            slug: restaurant.slug,
            // Timing & status fields for availability status
            openingTime: restaurant.openingTime,
            closingTime: restaurant.closingTime,
            outletTimings: restaurant.outletTimings,
            deliveryTimings: restaurant.deliveryTimings,
            openDays: restaurant.openDays,
            isActive: restaurant.isActive,
            isAcceptingOrders: restaurant.isAcceptingOrders,
            manualOffline: restaurant.manualOffline,
            status: restaurant.status,
            isOpen: restaurant.isOpen,
            coverImages: restaurant.coverImages,
            recommendedItems: restaurant.recommendedItems || [],
          };
        });

        startTransition(() => {
          setRestaurantsData(transformed);
          globalHomeCache.restaurants = transformed;
        });
      }
    } catch (err) {
      setRestaurantsData([]);
    } finally {
      if (requestSeq === restaurantsRequestSeqRef.current) setLoadingRestaurants(false);
    }
  }, [location, zoneId, buildRestaurantImageCandidates, extractImages]);

  useEffect(() => {
    fetchRestaurants(appliedFilters);
  }, [appliedFilters, fetchRestaurants]);

  // --- Menu Context Fetching (Veg Mode) ---
  const menuUnionRestaurantIdsKey = restaurantsData.map(r => r.mongoId || r.id).join(",");
  useEffect(() => {
    const restaurantIds = menuUnionRestaurantIdsKey.split(",").filter(Boolean);
    const shouldFetchMenuMeta = vegMode || realCategories.length === 0;
    if (!menuUnionRestaurantIdsKey || !shouldFetchMenuMeta) {
      setMenuCategories([]);
      return;
    }

    const fetchMenu = async () => {
      const requestSeq = ++menuUnionRequestSeqRef.current;
      setLoadingMenuCategories(true);
      try {
        const categoryMap = new Map();
        for (let i = 0; i < restaurantIds.length; i += 4) {
          const batch = restaurantIds.slice(i, i + 4);
          const res = await Promise.all(batch.map(async id => {
            if (menuUnionCacheRef.current.has(id)) return menuUnionCacheRef.current.get(id);
            try {
              const r = await restaurantAPI.getMenuByRestaurantId(id);
              const m = r.data?.data?.menu || null;
              menuUnionCacheRef.current.set(id, m);
              return m;
            } catch { return null; }
          }));
          if (requestSeq !== menuUnionRequestSeqRef.current) return;
          
          res.forEach(menu => {
            if (!menu?.sections) return;
            menu.sections.forEach(section => {
              const slug = slugifyCategory(section.name);
              if (!slug) return;
              if (!categoryMap.has(slug)) {
                categoryMap.set(slug, {
                  id: slug,
                  name: section.name,
                  slug,
                  image: normalizeImageUrl(section.items?.[0]?.image) || "",
                });
              }
            });
          });
        }
        setMenuCategories(Array.from(categoryMap.values()));
      } finally {
        if (requestSeq === menuUnionRequestSeqRef.current) setLoadingMenuCategories(false);
      }
    };
    fetchMenu();
  }, [menuUnionRestaurantIdsKey, vegMode, realCategories.length, normalizeImageUrl, slugifyCategory]);

  const deferredRestaurants = useDeferredValue(restaurantsData);

  // --- Memoized Derived Data ---
  const filteredRestaurants = useMemo(() => {
    // If vegMode is active (boolean true / 'pure'), only show 100% vegetarian restaurants.
    let filtered = [...deferredRestaurants].filter(r => (!vegMode || r.pureVegRestaurant) && r.hasFood !== false);
    
    // Apply active filters (Under 30/45 mins, Under 1km/2km)
    if (activeFilters && activeFilters.size > 0) {
      filtered = filtered.filter(r => {
        let deliveryTimeNum = Infinity;
        if (r.deliveryTime) {
          const match = String(r.deliveryTime).match(/\d+/);
          if (match) deliveryTimeNum = parseInt(match[0], 10);
        }

        let distanceNum = Infinity;
        if (r.distance) {
          const match = String(r.distance).match(/[\d.]+/);
          if (match) distanceNum = parseFloat(match[0]);
        }

        let matches = true;
        if (activeFilters.has("delivery-under-30") && deliveryTimeNum > 30) {
          matches = false;
        }
        if (activeFilters.has("delivery-under-45") && deliveryTimeNum > 45) {
          matches = false;
        }
        if (activeFilters.has("distance-under-1km") && distanceNum > 1.0) {
          matches = false;
        }
        if (activeFilters.has("distance-under-2km") && distanceNum > 2.0) {
          matches = false;
        }
        return matches;
      });
    }

    // Compute availability status for sorting rather than strictly filtering out closed ones
    filtered = filtered.map(r => {
      const status = getRestaurantAvailabilityStatus(r, new Date(availabilityTick), { ignoreOperationalStatus: false });
      return { ...r, _isOpen: status.isOpen };
    });

    // Apply sorting: Open restaurants first, then by rating
    filtered.sort((a, b) => {
      if (a._isOpen !== b._isOpen) {
        return a._isOpen ? -1 : 1;
      }
      if (sortBy === "rating-high") {
        return b.rating - a.rating;
      }
      // Default: Rating
      return b.rating - a.rating;
    });
    return filtered;
  }, [deferredRestaurants, vegMode, sortBy, activeFilters, availabilityTick]);

  const visibleRestaurants = useMemo(() => 
    filteredRestaurants.slice(0, visibleRestaurantCount), [filteredRestaurants, visibleRestaurantCount]);

  const displayCategories = useMemo(() => {
    if (realCategories.length > 0) return realCategories;
    if (menuCategories.length > 0) return menuCategories;
    return (landingCategories || []).map((cat, idx) => ({
      ...cat,
      image: normalizeImageUrl(cat.image) || "",
    }));
  }, [realCategories, menuCategories, landingCategories, normalizeImageUrl]);

  const recommendedForYouRestaurants = useMemo(() => {
    if (!restaurantsData || restaurantsData.length === 0) return [];
    
    const allowedIds = new Set(restaurantsData.map(r => String(r.mongoId || r.id)));
    
    // 1. Try matching configured settings recommendations against allowed restaurants
    let matched = (recommendedRestaurantsFromSettings || [])
      .map(r => {
        const rId = String(r._id || r.restaurantId || r.id);
        return allowedIds.has(rId) ? (restaurantsData.find(fr => String(fr.mongoId || fr.id) === rId) || r) : null;
      })
      .filter(Boolean);

    // 2. If no matched settings recommendations exist in allowed restaurants (e.g. in dev mode), fallback to restaurantsData
    if (matched.length === 0) {
      matched = restaurantsData;
    }

    return matched
      .filter(r => (!vegMode || r.pureVegRestaurant))
      .slice(0, 12);
  }, [restaurantsData, recommendedRestaurantsFromSettings, vegMode]);

  // --- Actions ---
  const toggleFilter = useCallback((filterId) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(filterId)) next.delete(filterId);
      else next.add(filterId);
      return next;
    });
  }, []);

  const applyFiltersAndRefetch = useCallback(async (nextFilters, nextSortBy, nextCuisine) => {
    const state = { activeFilters: new Set(nextFilters), sortBy: nextSortBy, selectedCuisine: nextCuisine };
    setAppliedFilters(state);
    setIsLoadingFilterResults(true);
    await fetchRestaurants(state);
    setIsLoadingFilterResults(false);
  }, [fetchRestaurants]);

  const loadMoreRestaurants = useCallback(() => {
    setVisibleRestaurantCount(prev => Math.min(prev + 6, filteredRestaurants.length));
  }, [filteredRestaurants.length]);

  return {
    banners: { images: heroBannerImages, data: heroBannersData, loading: loadingBanners },
    categories: { display: displayCategories, loading: loadingRealCategories || loadingMenuCategories },
    restaurants: { 
      visible: visibleRestaurants, 
      loading: loadingRestaurants, 
      isLoadingFilterResults,
      hasMore: visibleRestaurantCount < filteredRestaurants.length 
    },
    landing: { exploreMore: landingExploreMore, heading: exploreMoreHeading, loading: loadingLandingConfig, videoUrl: headerVideoUrl },
    meta: { recommended: recommendedForYouRestaurants },
    actions: { toggleFilter, applyFiltersAndRefetch, loadMoreRestaurants },
    state: { activeFilters, sortBy, setSortBy, selectedCuisine, setSelectedCuisine, isBootstrapped }
  };
};
