/**
 * Smart URL Corrector & Typo Redirect Utility
 * Automatically detects misspelled URLs (e.g., /resturent, /delvery, /admn, /seler, /food/resturent/login)
 * and returns the corrected canonical route.
 */

export function levenshteinDistance(a, b) {
  if (!a || !b) return (a || b || "").length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1).toLowerCase() === a.charAt(j - 1).toLowerCase()) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// Canonical route definitions
const CANONICAL_TARGETS = [
  { name: "restaurants", prefix: "/food/user/restaurants", maxDistance: 3 },
  { name: "restaurant", prefix: "/food/restaurant", maxDistance: 3 },
  { name: "delivery", prefix: "/food/delivery", maxDistance: 2 },
  { name: "seller", prefix: "/seller", maxDistance: 2 },
  { name: "admin", prefix: "/admin", maxDistance: 2 },
  { name: "quick", prefix: "/quick", maxDistance: 2 },
  { name: "cart", prefix: "/cart", maxDistance: 1 },
  { name: "profile", prefix: "/profile", maxDistance: 2 },
  { name: "orders", prefix: "/food/user/orders", maxDistance: 2 },
  { name: "food", prefix: "/food/user", maxDistance: 1 },
  { name: "user", prefix: "/food/user", maxDistance: 1 },
];

// Dictionary of known typos -> canonical target name
const KNOWN_TYPO_MAP = {
  // Plural Restaurant Typos (Customer Page)
  resturents: "restaurants",
  resturants: "restaurants",
  restorants: "restaurants",
  restaurents: "restaurants",
  restarants: "restaurants",
  restuarents: "restaurants",
  restraunts: "restaurants",
  restaraunts: "restaurants",
  restuarants: "restaurants",
  restaurantss: "restaurants",

  // Singular Restaurant Typos (Restaurant Owner Portal)
  resturent: "restaurant",
  resturant: "restaurant",
  restorant: "restaurant",
  restaurent: "restaurant",
  restaurat: "restaurant",
  restarant: "restaurant",
  restuarent: "restaurant",
  restraunt: "restaurant",
  restaraunt: "restaurant",
  restuarant: "restaurant",
  restaurantt: "restaurant",
  "resturent-login": "restaurant",
  restaurantlogin: "restaurant",

  // Delivery Typos
  delvery: "delivery",
  delivry: "delivery",
  deliver: "delivery",
  deliveryy: "delivery",
  delivrey: "delivery",
  delivey: "delivery",
  delivry: "delivery",
  deliverypartner: "delivery",
  deliveryboy: "delivery",
  delivary: "delivery",

  // Seller Typos
  seler: "seller",
  sellr: "seller",
  sellers: "seller",
  sellerr: "seller",
  vendor: "seller",
  shopkeeper: "seller",

  // Admin Typos
  admn: "admin",
  adminn: "admin",
  addmin: "admin",
  admnin: "admin",
  admnistration: "admin",

  // Quick Commerce Typos
  quik: "quick",
  quickcommerce: "quick",
  "quick-commerce": "quick",
  qquick: "quick",
  qc: "quick",
  qcommerce: "quick",

  // Cart & Checkout Typos
  cartt: "cart",
  carte: "cart",
  checkoutt: "cart",
  checkut: "cart",
  checout: "cart",

  // Profile Typos
  profil: "profile",
  profilee: "profile",
  myprofile: "profile",
  profle: "profile",

  // Orders Typos
  ordrs: "orders",
  order: "orders",
  ordr: "orders",
  myorders: "orders",

  // User / Food Typos
  userr: "user",
  usr: "user",
  foodd: "food",
  fd: "food",
};

/**
 * Finds target canonical route for a path segment
 */
export function findCorrectTarget(segment) {
  if (!segment) return null;
  const lower = String(segment).toLowerCase().trim();

  // 1. Direct dictionary lookup
  if (KNOWN_TYPO_MAP[lower]) {
    const targetName = KNOWN_TYPO_MAP[lower];
    return CANONICAL_TARGETS.find((t) => t.name === targetName) || null;
  }

  // 2. Exact match on target names
  const exact = CANONICAL_TARGETS.find((t) => t.name === lower);
  if (exact) return exact;

  // 3. Fuzzy Levenshtein match
  if (lower.length >= 3) {
    let bestMatch = null;
    let minDistance = Infinity;

    for (const target of CANONICAL_TARGETS) {
      const dist = levenshteinDistance(lower, target.name);
      if (dist <= target.maxDistance && dist < minDistance) {
        minDistance = dist;
        bestMatch = target;
      }
    }

    if (bestMatch) return bestMatch;
  }

  return null;
}

/**
 * Returns corrected path if a typo was detected, otherwise returns null.
 * @param {string} pathname 
 * @returns {string | null}
 */
export function getCorrectedPath(pathname = "") {
  if (!pathname || pathname === "/") return null;

  const cleanPath = pathname.replace(/\/+$/, "");
  const segments = cleanPath.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  let corrected = false;
  let targetFound = null;
  let remainingSegments = [];

  // Case A: Path starts with /food/ (e.g., /food/resturent/login or /food/delvery)
  if (segments[0] === "food") {
    if (segments.length >= 2) {
      const target = findCorrectTarget(segments[1]);
      if (target && target.name !== segments[1]) {
        targetFound = target;
        corrected = true;
        remainingSegments = segments.slice(2);
      }
    }
  } else {
    // Case B: Path starts directly with typo (e.g. /resturent/login or /delvery or /admn)
    const target = findCorrectTarget(segments[0]);
    if (target) {
      targetFound = target;
      const canonicalPrefix = target.prefix;
      const isAlreadyCanonical = cleanPath === canonicalPrefix || cleanPath.startsWith(canonicalPrefix + "/");

      if (!isAlreadyCanonical) {
        corrected = true;
        remainingSegments = segments.slice(1);
      }
    }
  }

  if (corrected && targetFound) {
    const subpath = remainingSegments.length > 0 ? "/" + remainingSegments.join("/") : "";
    return `${targetFound.prefix}${subpath}`;
  }

  return null;
}
