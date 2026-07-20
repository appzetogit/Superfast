import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { customerApi } from "../services/customerApi";
import { Sparkles } from "lucide-react";

// MUI Icons (shared with admin & icon selector)
import HomeIcon from "@mui/icons-material/Home";
import DevicesIcon from "@mui/icons-material/Devices";
import LocalGroceryStoreIcon from "@mui/icons-material/LocalGroceryStore";
import KitchenIcon from "@mui/icons-material/Kitchen";
import ChildCareIcon from "@mui/icons-material/ChildCare";
import PetsIcon from "@mui/icons-material/Pets";
import SportsSoccerIcon from "@mui/icons-material/SportsSoccer";
import CardGiftcardIcon from "@mui/icons-material/CardGiftcard";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import SpaIcon from "@mui/icons-material/Spa";
import ToysIcon from "@mui/icons-material/Toys";
import DirectionsCarIcon from "@mui/icons-material/DirectionsCar";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import YardIcon from "@mui/icons-material/Yard";
import BusinessCenterIcon from "@mui/icons-material/BusinessCenter";
import MusicNoteIcon from "@mui/icons-material/MusicNote";
import CheckroomIcon from "@mui/icons-material/Checkroom";
import LocalCafeIcon from "@mui/icons-material/LocalCafe";
import DiamondIcon from "@mui/icons-material/Diamond";
import ColorLensIcon from "@mui/icons-material/ColorLens";
import BuildIcon from "@mui/icons-material/Build";
import LuggageIcon from "@mui/icons-material/Luggage";
import AppleIcon from "@mui/icons-material/Apple";
import EggIcon from "@mui/icons-material/Egg";
import LocalDrinkIcon from "@mui/icons-material/LocalDrink";
import CookieIcon from "@mui/icons-material/Cookie";
import FastfoodIcon from "@mui/icons-material/Fastfood";
import AcUnitIcon from "@mui/icons-material/AcUnit";

import { resolveQuickImageUrl } from "../utils/image";

// --- Constants ---
const DEFAULT_CATEGORY_THEME = {
  gradient: "linear-gradient(to bottom, #25D366, #4ADE80)",
  shadow: "shadow-green-500/20",
  accent: "text-[#1A1A1A]",
};

const CATEGORY_METADATA = {
  All: {
    icon: HomeIcon,
    theme: DEFAULT_CATEGORY_THEME,
    banner: { title: "HOUSEFULL", subtitle: "SALE", floatingElements: "sparkles" },
  },
  Grocery: {
    icon: LocalGroceryStoreIcon,
    theme: { gradient: "linear-gradient(to bottom, #FF9F1C, #FFBF69)", shadow: "shadow-[var(--primary-theme)]/20", accent: "text-orange-900" },
    banner: { title: "SUPERSAVER", subtitle: "FRESH & FAST", floatingElements: "leaves" },
  },
  Wedding: {
    icon: CardGiftcardIcon,
    theme: { gradient: "linear-gradient(to bottom, #FF4D6D, #FF8FA3)", shadow: "shadow-rose-500/20", accent: "text-rose-900" },
    banner: { title: "WEDDING", subtitle: "BLISS", floatingElements: "hearts" },
  },
  "Home & Kitchen": {
    icon: KitchenIcon,
    theme: { gradient: "linear-gradient(to bottom, #BC6C25, #DDA15E)", shadow: "shadow-amber-500/20", accent: "text-amber-900" },
    banner: { title: "HOME", subtitle: "KITCHEN", floatingElements: "smoke" },
  },
  Electronics: {
    icon: DevicesIcon,
    theme: { gradient: "linear-gradient(to bottom, #7209B7, #B5179E)", shadow: "shadow-purple-500/20", accent: "text-purple-900" },
    banner: { title: "TECH FEST", subtitle: "GADGETS", floatingElements: "tech" },
  },
  Kids: {
    icon: ChildCareIcon,
    theme: { gradient: "linear-gradient(to bottom, #4CC9F0, #A0E7E5)", shadow: "shadow-blue-500/20", accent: "text-blue-900" },
    banner: { title: "LITTLE ONE", subtitle: "CARE", floatingElements: "bubbles" },
  },
  "Pet Supplies": {
    icon: PetsIcon,
    theme: { gradient: "linear-gradient(to bottom, #FB8500, #FFB703)", shadow: "shadow-yellow-500/20", accent: "text-yellow-900" },
    banner: { title: "PAWSOME", subtitle: "DEALS", floatingElements: "bones" },
  },
  Sports: {
    icon: SportsSoccerIcon,
    theme: { gradient: "linear-gradient(to bottom, #4361EE, #4895EF)", shadow: "shadow-indigo-500/20", accent: "text-indigo-900" },
    banner: { title: "SPORTS", subtitle: "GEAR", floatingElements: "confetti" },
  },
  "Fruits & Vegetables": {
    icon: AppleIcon,
    theme: { gradient: "linear-gradient(to bottom, #4CAF50, #81C784)", shadow: "shadow-green-500/20", accent: "text-green-900" },
    banner: { title: "FRESH", subtitle: "VEGGIES & FRUITS", floatingElements: "leaves" },
  },
  "Dairy, Bread & Eggs": {
    icon: EggIcon,
    theme: { gradient: "linear-gradient(to bottom, #FFD54F, #FFE082)", shadow: "shadow-yellow-500/20", accent: "text-yellow-900" },
    banner: { title: "DAIRY FRESH", subtitle: "BREAD & EGGS", floatingElements: "bubbles" },
  },
  "Cold Drinks & Juices": {
    icon: LocalDrinkIcon,
    theme: { gradient: "linear-gradient(to bottom, #29B6F6, #4FC3F7)", shadow: "shadow-blue-500/20", accent: "text-blue-900" },
    banner: { title: "CHILLED", subtitle: "DRINKS & JUICES", floatingElements: "bubbles" },
  },
  "Snacks & Munchies": {
    icon: FastfoodIcon,
    theme: { gradient: "linear-gradient(to bottom, #FF7043, #FF8A65)", shadow: "shadow-[var(--primary-theme)]/20", accent: "text-orange-900" },
    banner: { title: "SNACKS", subtitle: "MUNCHIES TIME", floatingElements: "sparkles" },
  },
  "Bakery & Biscuits": {
    icon: CookieIcon,
    theme: { gradient: "linear-gradient(to bottom, #8D6E63, #A1887F)", shadow: "shadow-brown-500/20", accent: "text-amber-950" },
    banner: { title: "BAKERY", subtitle: "BISCUITS & MORE", floatingElements: "smoke" },
  },
  "Instant & Frozen Food": {
    icon: AcUnitIcon,
    theme: { gradient: "linear-gradient(to bottom, #26C6DA, #4DD0E1)", shadow: "shadow-cyan-500/20", accent: "text-cyan-900" },
    banner: { title: "INSTANT", subtitle: "FROZEN FOODS", floatingElements: "tech" },
  },
};

const ICON_COMPONENTS = {
  electronics: DevicesIcon,
  fashion: CheckroomIcon,
  home: HomeIcon,
  food: LocalCafeIcon,
  sports: SportsSoccerIcon,
  books: MenuBookIcon,
  beauty: SpaIcon,
  toys: ToysIcon,
  automotive: DirectionsCarIcon,
  pets: PetsIcon,
  health: LocalHospitalIcon,
  garden: YardIcon,
  office: BusinessCenterIcon,
  music: MusicNoteIcon,
  jewelry: DiamondIcon,
  baby: ChildCareIcon,
  tools: BuildIcon,
  luggage: LuggageIcon,
  art: ColorLensIcon,
  grocery: LocalGroceryStoreIcon,
  "fruits-vegetables": AppleIcon,
  "dairy-bread-eggs": EggIcon,
  "cold-drinks-juices": LocalDrinkIcon,
  "snacks-munchies": FastfoodIcon,
  "bakery-biscuits": CookieIcon,
  "instant-frozen-food": AcUnitIcon,
};

const ALL_CATEGORY = {
  id: "all",
  _id: "all",
  name: "All",
  icon: HomeIcon,
  theme: DEFAULT_CATEGORY_THEME,
  headerColor: "#065f46",
  banner: {
    title: "HOUSEFULL",
    subtitle: "SALE",
    floatingElements: "sparkles",
    textColor: "text-white",
  },
};

const QUICK_HEADER_RETURN_STORAGE_KEY = "food.quick.headerReturn";

// --- Global Persistence Cache ---
let globalQuickHomeCache = {
  data: null,
  headerSections: new Map(), // headerId -> sections
  categoryProducts: new Map(), // headerId -> products
  lastFetched: 0,
};

const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export const useQuickHomeData = ({ currentLocation }) => {
  // Use cache as initial state even if expired (Stale-While-Revalidate)
  const hasData = !!globalQuickHomeCache.data;
  
  const [isLoading, setIsLoading] = useState(!hasData);
  const [isBootstrapped, setIsBootstrapped] = useState(hasData);
  const [categories, setCategories] = useState(globalQuickHomeCache.data?.categories || [ALL_CATEGORY]);
  const [activeCategory, setActiveCategory] = useState(globalQuickHomeCache.data?.activeCategory || ALL_CATEGORY);
  const [products, setProducts] = useState(globalQuickHomeCache.data?.products || []);
  const [quickCategories, setQuickCategories] = useState(globalQuickHomeCache.data?.quickCategories || []);
  const [experienceSections, setExperienceSections] = useState(globalQuickHomeCache.data?.experienceSections || []);
  const [offerSections, setOfferSections] = useState(globalQuickHomeCache.data?.offerSections || []);
  const [categoryMap, setCategoryMap] = useState(globalQuickHomeCache.data?.categoryMap || {});
  const [subcategoryMap, setSubcategoryMap] = useState(globalQuickHomeCache.data?.subcategoryMap || {});
  const [heroConfig, setHeroConfig] = useState(globalQuickHomeCache.data?.heroConfig || { banners: { items: [] }, categoryIds: [] });
  const [headerSections, setHeaderSections] = useState([]);
  const [loadingHeaderSections, setLoadingHeaderSections] = useState(false);
  const [categoryProducts, setCategoryProducts] = useState(null); // null = use global products

  const fetchDataSeqRef = useRef(0);

  const getQuickCategoryImage = useCallback((category = {}) => {
    const candidate = category?.image || category?.icon || category?.thumbnail || category?.imageUrl || category?.iconUrl || category?.media?.image || category?.media?.url || "";
    return resolveQuickImageUrl(candidate) || "https://cdn-icons-png.flaticon.com/128/2321/2321831.png";
  }, []);

  const fetchData = useCallback(async () => {
    const seq = ++fetchDataSeqRef.current;
    
    // We do not return early here to allow Stale-While-Revalidate background fetching.
    // Only show loading UI if we don't already have cached data.
    if (!globalQuickHomeCache.data) {
      setIsLoading(true);
    }
    
    try {
      const hasValidLocation = Number.isFinite(currentLocation?.latitude) && Number.isFinite(currentLocation?.longitude);
      const productParams = { limit: 20 };
      if (hasValidLocation) {
        productParams.lat = currentLocation.latitude;
        productParams.lng = currentLocation.longitude;
      }

      // Initialize cache object
      const newDataCache = {
        categories: [ALL_CATEGORY],
        activeCategory: ALL_CATEGORY,
        products: [],
        quickCategories: [],
        experienceSections: [],
        offerSections: [],
        heroConfig: { banners: { items: [] }, categoryIds: [] },
        categoryMap: {},
        subcategoryMap: {},
      };

      let pendingTasks = 5;
      const checkDone = () => {
        pendingTasks--;
        if (pendingTasks <= 0) {
          globalQuickHomeCache.data = newDataCache;
          globalQuickHomeCache.lastFetched = Date.now();
          if (seq === fetchDataSeqRef.current) setIsLoading(false);
        }
      };

      // 1. Categories (Fastest, unblocks header)
      customerApi.getCategories().then(catRes => {
        if (seq !== fetchDataSeqRef.current) return;
        if (catRes?.data?.success) {
          const dbCats = catRes.data.results || catRes.data.result || [];
          const catMap = {};
          const subMap = {};
          dbCats.forEach((c) => {
            if (c.type === "category") catMap[c._id] = c;
            else if (c.type === "subcategory") subMap[c._id] = c;
          });
          setCategoryMap(catMap);
          setSubcategoryMap(subMap);
          newDataCache.categoryMap = catMap;
          newDataCache.subcategoryMap = subMap;

          const formattedHeaders = dbCats.filter((cat) => cat.type === "header").map((cat) => {
            const catName = cat.name;
            const meta = CATEGORY_METADATA[catName] || CATEGORY_METADATA[catName.charAt(0).toUpperCase() + catName.slice(1).toLowerCase()] || CATEGORY_METADATA[catName.toUpperCase()] || {
              icon: Sparkles, theme: DEFAULT_CATEGORY_THEME, banner: { title: catName.toUpperCase(), subtitle: "TOP PICKS", floatingElements: "sparkles" }
            };
            const IconComp = (cat.iconId && ICON_COMPONENTS[cat.iconId]) || meta.icon || Sparkles;
            return { ...cat, id: cat._id, iconId: cat.iconId, icon: IconComp, theme: meta.theme, headerColor: cat.headerColor || null, banner: { ...meta.banner, textColor: "text-white" } };
          });

          const allHeaderFromAdmin = formattedHeaders.find(h => (h.slug?.toLowerCase() === "all") || (h.name?.toLowerCase() === "all"));
          const mergedAllCategory = allHeaderFromAdmin ? { ...ALL_CATEGORY, headerColor: allHeaderFromAdmin.headerColor || ALL_CATEGORY.headerColor, icon: allHeaderFromAdmin.icon || ALL_CATEGORY.icon } : ALL_CATEGORY;
          const headersWithoutAll = formattedHeaders.filter(h => !((h.slug?.toLowerCase() === "all") || (h.name?.toLowerCase() === "all")));
          
          const finalCategories = [mergedAllCategory, ...headersWithoutAll];
          setCategories(finalCategories);
          newDataCache.categories = finalCategories;

          let initialActive = mergedAllCategory;
          const storedHeaderReturn = window.sessionStorage.getItem(QUICK_HEADER_RETURN_STORAGE_KEY);
          const storedExpReturn = window.sessionStorage.getItem("experienceReturn");
          const restoreId = (storedHeaderReturn && JSON.parse(storedHeaderReturn)?.headerId) || (storedExpReturn && JSON.parse(storedExpReturn)?.headerId);
          if (restoreId) {
              const match = finalCategories.find(h => h._id === restoreId || h.id === restoreId);
              if (match) initialActive = match;
          }
          setActiveCategory(initialActive);
          newDataCache.activeCategory = initialActive;

          const formattedQuickCats = dbCats.filter((cat) => cat.type === "category").map((cat) => ({ id: cat._id, name: cat.name, image: getQuickCategoryImage(cat) }));
          setQuickCategories(formattedQuickCats);
          newDataCache.quickCategories = formattedQuickCats;
        }
        setIsBootstrapped(true); // Unblock the UI skeleton!
      }).catch(console.error).finally(checkDone);

      // 2. Products (Usually slowest)
      const fetchProducts = hasValidLocation ? customerApi.getProducts(productParams) : Promise.resolve({ data: { success: true, result: { items: [] } } });
      fetchProducts.then(prodRes => {
        if (seq !== fetchDataSeqRef.current) return;
        if (prodRes?.data?.success) {
          const rawResult = prodRes.data.result;
          const dbProds = Array.isArray(prodRes.data.results) ? prodRes.data.results : (Array.isArray(rawResult?.items) ? rawResult.items : (Array.isArray(rawResult) ? rawResult : []));
          const formattedProds = dbProds.map((p) => ({
            ...p, id: p._id, image: p.mainImage || p.image,
            price: Number(p.salePrice || 0) > 0 ? Number(p.salePrice) : Number(p.price || 0),
            originalPrice: Number(p.originalPrice || p.mrp || p.price || p.salePrice || 0),
            weight: p.weight || "1 unit", deliveryTime: "8-15 mins"
          }));
          setProducts(formattedProds);
          newDataCache.products = formattedProds;
        }
      }).catch(console.error).finally(checkDone);

      // 3. Experience Sections
      customerApi.getExperienceSections({ pageType: "home" }).then(expRes => {
        if (seq !== fetchDataSeqRef.current) return;
        if (expRes?.data?.success) {
          const raw = expRes.data.result || expRes.data.results || expRes.data;
          const sections = Array.isArray(raw) ? raw : [];
          setExperienceSections(sections);
          newDataCache.experienceSections = sections;
        }
      }).catch(console.error).finally(checkDone);

      // 4. Offer Sections
      const fetchOffers = hasValidLocation ? customerApi.getOfferSections({ lat: currentLocation.latitude, lng: currentLocation.longitude }) : Promise.resolve({ data: { results: [] } });
      fetchOffers.then(sectionsRes => {
        if (seq !== fetchDataSeqRef.current) return;
        const sectionsList = sectionsRes?.data?.results || sectionsRes?.data?.result || sectionsRes?.data;
        const offerSecs = Array.isArray(sectionsList) ? sectionsList : [];
        setOfferSections(offerSecs);
        newDataCache.offerSections = offerSecs;
      }).catch(console.error).finally(checkDone);

      // 5. Hero Config
      customerApi.getHeroConfig({ pageType: "home" }).then(heroRes => {
        if (seq !== fetchDataSeqRef.current) return;
        if (heroRes?.data?.success) {
          const payload = heroRes.data.result || heroRes.data.results || heroRes.data;
          const config = payload && (payload.banners?.items?.length > 0 || payload.categoryIds?.length > 0)
            ? { banners: payload.banners || { items: [] }, categoryIds: payload.categoryIds || [] }
            : { banners: { items: [] }, categoryIds: [] };
          setHeroConfig(config);
          newDataCache.heroConfig = config;
        }
      }).catch(console.error).finally(checkDone);

    } catch (error) {
      console.error("Error fetching quick home data:", error);
      setIsLoading(false);
    }
  }, [currentLocation, getQuickCategoryImage]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch header-specific sections
  useEffect(() => {
    if (!activeCategory || activeCategory._id === "all") {
      setHeaderSections([]);
      setCategoryProducts(null); // reset to global products
      return;
    }

    const headerId = activeCategory._id;

    const fetchHeader = async () => {
      if (globalQuickHomeCache.headerSections.has(headerId)) {
        setHeaderSections(globalQuickHomeCache.headerSections.get(headerId));
      } else {
        setLoadingHeaderSections(true);
        try {
          const res = await customerApi.getExperienceSections({ pageType: "header", headerId });
          if (res.data.success) {
            const raw = res.data.result || res.data.results || res.data;
            const sections = Array.isArray(raw) ? raw : [];
            setHeaderSections(sections);
            globalQuickHomeCache.headerSections.set(headerId, sections);
          }
        } catch (e) {
          console.error("Error fetching header sections:", e);
        } finally {
          setLoadingHeaderSections(false);
        }
      }
    };

    const fetchCategoryProducts = async () => {
      if (globalQuickHomeCache.categoryProducts.has(headerId)) {
        setCategoryProducts(globalQuickHomeCache.categoryProducts.get(headerId));
        return;
      }
      try {
        const res = await customerApi.getProducts({ categoryId: headerId, limit: 50 });
        if (res?.data?.success) {
          const rawResult = res.data.result;
          const dbProds = Array.isArray(res.data.results)
            ? res.data.results
            : Array.isArray(rawResult?.items)
            ? rawResult.items
            : Array.isArray(rawResult)
            ? rawResult
            : [];
          const formatted = dbProds.map((p) => ({
            ...p,
            id: p._id,
            image: p.mainImage || p.image,
            price: Number(p.salePrice || 0) > 0 ? Number(p.salePrice) : Number(p.price || 0),
            originalPrice: Number(p.originalPrice || p.mrp || p.price || p.salePrice || 0),
            weight: p.weight || "1 unit",
            deliveryTime: "8-15 mins",
          }));
          globalQuickHomeCache.categoryProducts.set(headerId, formatted);
          setCategoryProducts(formatted);
        }
      } catch (e) {
        console.error("Error fetching category products:", e);
      }
    };

    fetchHeader();
    fetchCategoryProducts();
  }, [activeCategory]);

  return {
    categories,
    activeCategory,
    setActiveCategory,
    products,
    categoryProducts, // null when "All" is active, array when a specific category is selected
    quickCategories,
    experienceSections,
    offerSections,
    categoryMap,
    subcategoryMap,
    headerSections,
    heroConfig,
    isLoading: isLoading || !isBootstrapped,
    loadingHeaderSections,
    isBootstrapped,
    actions: {
        refresh: () => {
            globalQuickHomeCache.data = null;
            fetchData();
        }
    }
  };
};
