const toArray = (value) => (Array.isArray(value) ? value : [])

export const normalizeFoodVariants = (value) =>
  toArray(value)
    .map((entry = {}, index) => {
      const id = String(entry?.id || entry?._id || `variant-${index}`)
      const name = String(entry?.name || "").trim()
      const price = Number(entry?.price)
      if (!name || !Number.isFinite(price) || price <= 0) return null

      return {
        id,
        _id: id,
        name,
        price,
      }
    })
    .filter(Boolean)

export const getFoodVariants = (item = {}) =>
  normalizeFoodVariants(item?.variants || item?.variations || [])

export const hasFoodVariants = (item = {}) => getFoodVariants(item).length > 0

export const getDefaultFoodVariant = (item = {}) => {
  const variants = getFoodVariants(item)
  if (variants.length === 0) return null
  return variants[0]
}

export const getFoodDisplayPrice = (item = {}) => {
  const variants = getFoodVariants(item)
  const minVariantPrice = variants.length > 0
    ? Math.min(...variants.map((variant) => Number(variant.price) || 0))
    : 0

  if (variants.length > 0) {
    return minVariantPrice
  }

  const price = Number(item?.price)
  return Number.isFinite(price) && price > 0 ? price : 0
}

export const getFoodPriceLabel = (item = {}) => {
  const variants = getFoodVariants(item)
  if (variants.length > 0) {
    const minVariantPrice = Math.min(...variants.map((variant) => Number(variant.price) || 0))
    return `Starting from ₹${Math.round(minVariantPrice)}`
  }
  const price = Number(item?.price)
  return `₹${Math.round(Number.isFinite(price) && price > 0 ? price : 0)}`
}

export const buildCartLineId = (itemId, variantId = "") =>
  `${String(itemId || "")}::${String(variantId || "base")}`
