// src/context/cart-context.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { buildCartLineId } from "@food/utils/foodVariants"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


// Default cart context value to prevent errors during initial render
const defaultCartContext = {
  _isProvider: false, // Flag to identify if this is from the actual provider
  cart: [],
  items: [],
  itemCount: 0,
  total: 0,
  lastAddEvent: null,
  lastRemoveEvent: null,
  addToCart: () => {
    debugWarn('CartProvider not available - addToCart called');
  },
  removeFromCart: () => {
    debugWarn('CartProvider not available - removeFromCart called');
  },
  updateQuantity: () => {
    debugWarn('CartProvider not available - updateQuantity called');
  },
  getCartCount: () => 0,
  isInCart: () => false,
  getCartItem: () => null,
  clearCart: () => {
    debugWarn('CartProvider not available - clearCart called');
  },
  cleanCartForRestaurant: () => {
    debugWarn('CartProvider not available - cleanCartForRestaurant called');
  },
  replaceCart: () => {
    debugWarn('CartProvider not available - replaceCart called');
  },
}

const CartContext = createContext(defaultCartContext)

const getItemOrderType = (item) => (item?.orderType === "quick" ? "quick" : "food")
const getItemSourceId = (item, orderType) =>
  String(
    item?.sourceId ||
      (orderType === "quick"
        ? item?.quickStoreId || item?.storeId || item?.sellerId || item?.restaurantId || ""
        : item?.restaurantId || item?.sourceRestaurantId || ""),
  )

const normalizeCartData = (rawCart) => {
  if (!Array.isArray(rawCart)) return []

  return rawCart
    .filter((item) => item && typeof item === "object")
    .map((item, index) => {
      const parsedQuantity = Number(item.quantity)
      const parsedPrice = Number(item.price)
      const normalizedRestaurantName =
        typeof item.restaurant === "string"
          ? item.restaurant
          : typeof item.restaurant?.name === "string"
            ? item.restaurant.name
            : ""

      const normalizedRestaurantId =
        item.restaurantId ||
        item.restaurant_id ||
        item.restaurant?._id ||
        item.restaurant?.restaurantId ||
        null

      const normalizedImage =
        item.image ||
        item.imageUrl ||
        item.product?.imageUrl ||
        item.product?.image ||
        ""

      const baseItemId =
        item.itemId ||
        item.productId ||
        item.foodId ||
        item.baseItemId ||
        item.menuItemId ||
        item.id ||
        item._id ||
        `cart-item-${index}`

      const variantId = item.variantId || item.variant?._id || item.variant?.id || ""
      const variantName =
        typeof item.variantName === "string"
          ? item.variantName
          : typeof item.variant?.name === "string"
            ? item.variant.name
            : ""
      const parsedVariantPrice = Number(
        item.variantPrice ?? item.variant?.price ?? item.price,
      )
      const orderType = item.orderType === "quick" ? "quick" : "food"
      const sourceId = getItemSourceId(item, orderType)
      const lineItemId =
        item.lineItemId ||
        item.cartLineId ||
        buildCartLineId(baseItemId, variantId)

      return {
        ...item,
        id: lineItemId,
        lineItemId,
        itemId: String(baseItemId),
        productId: String(baseItemId),
        variantId: variantId ? String(variantId) : "",
        variantName,
        variantPrice: Number.isFinite(parsedVariantPrice) ? parsedVariantPrice : 0,
        name: item.name || item.product?.name || "Item",
        orderType,
        type: orderType,
        sourceId,
        sourceName:
          item.sourceName ||
          (orderType === "quick"
            ? item.quickStoreName || item.storeName || item.sellerName || "Quick Commerce"
            : normalizedRestaurantName),
        quantity:
          Number.isFinite(parsedQuantity) && parsedQuantity > 0
            ? Math.floor(parsedQuantity)
            : 1,
        price: Number.isFinite(parsedPrice) ? parsedPrice : 0,
        restaurant: normalizedRestaurantName,
        restaurantId: normalizedRestaurantId,
        image: normalizedImage,
        imageUrl: normalizedImage,
      }
    })
}

const resolveCartEntryId = (items, itemId, variantId = "") => {
  const normalizedItemId = String(itemId || "")
  const safeItems = Array.isArray(items) ? items : []

  const directMatch = safeItems.find((item) => item.id === normalizedItemId)
  if (directMatch) return directMatch.id

  const preferredId = buildCartLineId(normalizedItemId, variantId)

  const exactMatch = safeItems.find((item) => item.id === preferredId)
  if (exactMatch) return exactMatch.id

  if (!variantId) {
    const legacyBaseMatch = safeItems.find(
      (item) =>
        String(item.itemId || item.productId || item.id || "") === normalizedItemId &&
        !String(item.variantId || "").trim(),
    )
    if (legacyBaseMatch) return legacyBaseMatch.id
  }

  return preferredId
}

export function CartProvider({ children }) {
  // Safe init (works with SSR and bad JSON)
  const [cart, setCart] = useState(() => {
    if (typeof window === "undefined") return []
    try {
      const saved = localStorage.getItem("cart")
      const parsed = saved ? JSON.parse(saved) : []
      return normalizeCartData(parsed)
    } catch {
      return []
    }
  })

  // Track last add event for animation
  const [lastAddEvent, setLastAddEvent] = useState(null)
  // Track last remove event for animation
  const [lastRemoveEvent, setLastRemoveEvent] = useState(null)

  // Persist to localStorage whenever cart changes
  useEffect(() => {
    try {
      // Only save if we have items or user is authenticated to avoid cluttering localStorage for every guest visitor
      const isAuthenticated = localStorage.getItem("user_authenticated") === "true" || !!localStorage.getItem("user_accessToken");
      if (cart.length > 0) {
        localStorage.setItem("cart", JSON.stringify(normalizeCartData(cart)))
      } else {
        localStorage.removeItem("cart")
      }
    } catch {
      // ignore storage errors (private mode, quota, etc.)
    }
  }, [cart])

  // Separate items by type
  const foodItems = useMemo(() => normalizeCartData(cart).filter(item => getItemOrderType(item) === "food"), [cart])
  const quickItems = useMemo(() => normalizeCartData(cart).filter(item => getItemOrderType(item) === "quick"), [cart])

  const foodCount = useMemo(() => foodItems.reduce((sum, item) => sum + (item.quantity || 0), 0), [foodItems])
  const quickCount = useMemo(() => quickItems.reduce((sum, item) => sum + (item.quantity || 0), 0), [quickItems])

  const foodTotal = useMemo(() => foodItems.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0), [foodItems])
  const quickTotal = useMemo(() => quickItems.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0), [quickItems])

  const addToCart = (item, sourcePosition = null) => {
    const safeCart = normalizeCartData(cart)
    const nextOrderType = getItemOrderType(item)


    if (safeCart.length > 0) {
      if (nextOrderType === "food") {
        const existingFoodItems = safeCart.filter(i => getItemOrderType(i) === "food")
        if (existingFoodItems.length > 0) {
          const firstItemRestaurantId = existingFoodItems[0]?.restaurantId
          const firstItemRestaurantName = existingFoodItems[0]?.restaurant
          const newItemRestaurantId = item?.restaurantId
          const newItemRestaurantName = item?.restaurant
          const normalizeName = (name) => (name ? String(name).trim().toLowerCase() : '')

          const firstRestaurantNameNormalized = normalizeName(firstItemRestaurantName)
          const newRestaurantNameNormalized = normalizeName(newItemRestaurantName)
          const hasNameMismatch =
            firstRestaurantNameNormalized &&
            newRestaurantNameNormalized &&
            firstRestaurantNameNormalized !== newRestaurantNameNormalized

          const hasIdMismatch =
            !firstRestaurantNameNormalized &&
            !newRestaurantNameNormalized &&
            firstItemRestaurantId &&
            newItemRestaurantId &&
            String(firstItemRestaurantId) !== String(newItemRestaurantId)

          if (hasNameMismatch || hasIdMismatch) {
            const message = `Cart already contains items from "${firstItemRestaurantName || 'another restaurant'}". Please clear food cart first.`
            return { ok: false, error: message, code: 'RESTAURANT_MISMATCH' }
          }
        }
      } else if (nextOrderType === "quick") {
        const existingQuickItems = safeCart.filter(i => getItemOrderType(i) === "quick");
        if (existingQuickItems.length > 0) {
          const firstItemStoreId = existingQuickItems[0]?.sourceId;
          const firstItemStoreName = existingQuickItems[0]?.sourceName;
          const newItemStoreId = getItemSourceId(item, "quick");
          const newItemStoreName = item?.quickStoreName || item?.storeName || item?.sellerName || item?.sourceName || "another store";

          if (firstItemStoreId && newItemStoreId && String(firstItemStoreId) !== String(newItemStoreId)) {
            const message = `Cart already contains items from "${firstItemStoreName || 'another store'}". Please clear your cart first.`;
            return { ok: false, error: message, code: 'STORE_MISMATCH' };
          }
        }
      }
    }

    if (nextOrderType === "food" && !item?.restaurantId && !item?.restaurant) {
      return {
        ok: false,
        error: 'Item is missing restaurant information.',
        code: 'MISSING_RESTAURANT'
      }
    }

    setCart((prev) => {
      const safePrev = normalizeCartData(prev)
      const resolvedItemId = resolveCartEntryId(safePrev, item.id || item._id || item.itemId || item.productId, item.variantId)
      const existing = safePrev.find((i) => i.id === resolvedItemId)
      
      if (existing) {
        if (sourcePosition) {
          setLastAddEvent({
            product: { id: item.id, name: item.name, imageUrl: item.image || item.imageUrl },
            sourcePosition,
          })
          setTimeout(() => setLastAddEvent(null), 1500)
        }
        return safePrev.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      }
      
      const newItem = { ...item, quantity: 1 }
      if (sourcePosition) {
        setLastAddEvent({
          product: { id: item.id, name: item.name, imageUrl: item.image || item.imageUrl },
          sourcePosition,
        })
        setTimeout(() => setLastAddEvent(null), 1500)
      }
      return [...safePrev, newItem]
    })

    return { ok: true }
  }

  const removeFromCart = (itemId, sourcePosition = null, productInfo = null) => {
    setCart((prev) => {
      const safePrev = normalizeCartData(prev)
      const resolvedItemId = resolveCartEntryId(safePrev, itemId)
      const itemToRemove = safePrev.find((i) => i.id === resolvedItemId)
      if (itemToRemove && sourcePosition && productInfo) {
        setLastRemoveEvent({
          product: {
            id: productInfo.id || itemToRemove.id,
            name: productInfo.name || itemToRemove.name,
            imageUrl: productInfo.imageUrl || productInfo.image || itemToRemove.image || itemToRemove.imageUrl,
          },
          sourcePosition,
        })
        setTimeout(() => setLastRemoveEvent(null), 1500)
      }
      return safePrev.filter((i) => i.id !== resolvedItemId)
    })
  }

  const updateQuantity = (itemId, quantity, sourcePosition = null, productInfo = null) => {
    const safeCart = normalizeCartData(cart)
    const resolvedItemId = resolveCartEntryId(safeCart, itemId)
    if (quantity <= 0) {
      removeFromCart(itemId, sourcePosition, productInfo)
      return
    }
    
    setCart((prev) => {
      const safePrev = normalizeCartData(prev)
      const existingItem = safePrev.find((i) => i.id === resolvedItemId)

      if (existingItem && quantity < existingItem.quantity && sourcePosition && productInfo) {
        setLastRemoveEvent({
          product: {
            id: productInfo.id || existingItem.id,
            name: productInfo.name || existingItem.name,
            imageUrl: productInfo.imageUrl || productInfo.image || existingItem.image || existingItem.imageUrl,
          },
          sourcePosition,
        })
        setTimeout(() => setLastRemoveEvent(null), 1500)
      }
      return safePrev.map((i) => (i.id === resolvedItemId ? { ...i, quantity } : i))
    })
  }

  const getCartCount = (type = "food") => {
    const safeCart = normalizeCartData(cart)
    if (type === "all") return safeCart.reduce((total, item) => total + (item.quantity || 0), 0)
    return safeCart
      .filter(item => getItemOrderType(item) === type)
      .reduce((total, item) => total + (item.quantity || 0), 0)
  }

  const isInCart = (itemId, variantId = "", type = "food") => {
    const safeCart = normalizeCartData(cart)
    const resolvedItemId = resolveCartEntryId(safeCart, itemId, variantId)
    return safeCart.some((i) => i.id === resolvedItemId && (type === "all" || getItemOrderType(i) === type))
  }

  const getCartItem = (itemId, variantId = "", type = "food") => {
    const safeCart = normalizeCartData(cart)
    const resolvedItemId = resolveCartEntryId(safeCart, itemId, variantId)
    return safeCart.find((i) => i.id === resolvedItemId && (type === "all" || getItemOrderType(i) === type)) || null
  }

  const clearCart = (type = null) => {
    if (!type) {
      setCart([])
    } else {
      setCart(prev => normalizeCartData(prev).filter(item => getItemOrderType(item) !== type))
    }
  }

  const replaceCart = (items) => {
    const normalizedItems = normalizeCartData(items).filter((item) => {
      const quantity = Number(item?.quantity)
      return item?.id && Number.isFinite(quantity) && quantity > 0
    })
    setCart(normalizedItems)
    return { ok: true, count: normalizedItems.length }
  }

  const cleanCartForRestaurant = (restaurantId, restaurantName) => {
    setCart((prev) => {
      const safePrev = normalizeCartData(prev)
      if (safePrev.length === 0) return safePrev;
      const normalizeName = (name) => name ? name.trim().toLowerCase() : '';
      const targetRestaurantNameNormalized = normalizeName(restaurantName);
      
      const cleanedCart = safePrev.filter((item) => {
        if (getItemOrderType(item) === "quick") return true; // Keep quick items
        
        const itemRestaurantId = item?.restaurantId;
        const itemRestaurantName = item?.restaurant;
        const itemRestaurantNameNormalized = normalizeName(itemRestaurantName);
        
        if (targetRestaurantNameNormalized && itemRestaurantNameNormalized) {
          return itemRestaurantNameNormalized === targetRestaurantNameNormalized;
        }
        if (restaurantId && itemRestaurantId) {
          return itemRestaurantId === restaurantId || String(itemRestaurantId) === String(restaurantId);
        }
        return false;
      });
      return cleanedCart;
    });
  }

  const value = useMemo(
    () => ({
      _isProvider: true,
      cart,
      items: foodItems, // Compatibility for AddToCartAnimation
      foodItems,
      quickItems,
      itemCount: foodCount, // Compatibility for AddToCartAnimation
      foodCount,
      quickCount,
      total: foodTotal, // Compatibility for AddToCartAnimation
      foodTotal,
      quickTotal,
      lastAddEvent,
      lastRemoveEvent,
      addToCart,
      removeFromCart,
      updateQuantity,
      getCartCount,
      isInCart,
      getCartItem,
      clearCart,
      cleanCartForRestaurant,
      replaceCart,
    }),
    [cart, foodItems, quickItems, foodCount, quickCount, foodTotal, quickTotal, lastAddEvent, lastRemoveEvent]
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context || context._isProvider !== true) return defaultCartContext
  return context
}

