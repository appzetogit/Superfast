import { useState, useEffect, useRef } from "react"
import { locationAPI, userAPI } from "@food/api"

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

// BigDataCloud reverse-geocode is expensive/noisy if many components mount `useLocation()`.
// This module-level guard dedupes concurrent calls + rate-limits starts across the whole app.
const GLOBAL_GEOCODE_MIN_INTERVAL_MS = 60_000
const GLOBAL_GEOCODE_REUSE_DISTANCE_METERS = 75
const geoDistanceMeters = (lat1, lng1, lat2, lng2) => {
  if (
    typeof lat1 !== "number" ||
    typeof lng1 !== "number" ||
    typeof lat2 !== "number" ||
    typeof lng2 !== "number"
  ) {
    return Number.POSITIVE_INFINITY
  }
  const latDiff = lat2 - lat1
  const lngDiff = lng2 - lng1
  return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 111320
}

let globalReverseGeocodeInFlight = null
let globalReverseGeocodeLastStartAt = 0
let globalReverseGeocodeLastCoords = { latitude: null, longitude: null }
let globalReverseGeocodeLastSuccess = null

// Default behavior: only resolve an address once on initial app load,
// then rely on localStorage/DB. Live watching is enabled only via explicit user action.
const AUTO_START_LIVE_WATCH = false

const isMeaningfulAddressValue = (value) => {
  const normalized = String(value || "").trim().toLowerCase()
  return Boolean(
    normalized &&
      normalized !== "select location" &&
      normalized !== "current location" &&
      !/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(normalized)
  )
}

const buildBigDataCloudAddress = (data, latitude, longitude) => {
  const administrative = Array.isArray(data?.localityInfo?.administrative)
    ? data.localityInfo.administrative
    : []

  const adminNames = administrative
    .map((item) => String(item?.name || "").trim())
    .filter(Boolean)

  const locality = String(data?.locality || data?.city || "").trim()
  const city = String(data?.city || data?.locality || "").trim()
  const state = String(data?.principalSubdivision || "").trim()
  const postcode = String(data?.postcode || "").trim()

  const areaCandidates = [
    data?.locality,
    data?.city,
    administrative.find((item) => Number(item?.adminLevel) >= 8)?.name,
    administrative.find((item) => Number(item?.adminLevel) === 6)?.name,
    administrative.find((item) => Number(item?.adminLevel) === 5)?.name,
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean)

  const uniqueParts = []
  const pushUnique = (value) => {
    const next = String(value || "").trim()
    if (!next) return
    if (uniqueParts.some((part) => part.toLowerCase() === next.toLowerCase())) return
    uniqueParts.push(next)
  }

  const explicitFormattedAddress =
    data?.formattedAddress || data?.lookupSourceAddress || data?.displayName
  if (isMeaningfulAddressValue(explicitFormattedAddress)) {
    return {
      area: areaCandidates[0] || city || "",
      city: city || "Unknown City",
      state,
      country: String(data?.countryName || "").trim(),
      postalCode: postcode,
      address: String(explicitFormattedAddress).trim(),
      formattedAddress: String(explicitFormattedAddress).trim(),
    }
  }

  pushUnique(areaCandidates[0])
  pushUnique(areaCandidates[1])
  pushUnique(areaCandidates[2])
  pushUnique(city)
  pushUnique(state)
  pushUnique(postcode)

  if (uniqueParts.length === 0) {
    const fallbackText = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
    return {
      area: "",
      city: city || "Unknown City",
      state,
      country: String(data?.countryName || "").trim(),
      postalCode: postcode,
      address: fallbackText,
      formattedAddress: fallbackText,
    }
  }

  return {
    area: areaCandidates[0] || locality || city || adminNames[0] || "",
    city: city || "Unknown City",
    state,
    country: String(data?.countryName || "").trim(),
    postalCode: postcode,
    address: uniqueParts.join(", "),
    formattedAddress: uniqueParts.join(", "),
  }
}

const reverseGeocodeDirect = async (latitude, longitude, forceFresh = false) => {
  const now = Date.now()
  const movedMeters = geoDistanceMeters(
    globalReverseGeocodeLastCoords.latitude,
    globalReverseGeocodeLastCoords.longitude,
    latitude,
    longitude
  )
  const timeSinceLastStart = now - globalReverseGeocodeLastStartAt

  // If we recently geocoded a nearby point, reuse the last successful payload (no network).
  // Skip cache when forceFresh is true (user explicitly requested current location)
  if (
    !forceFresh &&
    globalReverseGeocodeLastSuccess &&
    movedMeters < GLOBAL_GEOCODE_REUSE_DISTANCE_METERS &&
    timeSinceLastStart < GLOBAL_GEOCODE_MIN_INTERVAL_MS
  ) {
    return globalReverseGeocodeLastSuccess
  }

  // If another caller is already fetching, wait for it when it's "close enough".
  // Skip dedup when forceFresh is true
  if (!forceFresh && globalReverseGeocodeInFlight) {
    const inFlightMoved = geoDistanceMeters(
      globalReverseGeocodeLastCoords.latitude,
      globalReverseGeocodeLastCoords.longitude,
      latitude,
      longitude
    )
    if (inFlightMoved < GLOBAL_GEOCODE_REUSE_DISTANCE_METERS) {
      try {
        return await globalReverseGeocodeInFlight
      } catch {
        // fall through to a fresh attempt
      }
    }
  }

  globalReverseGeocodeLastStartAt = now
  globalReverseGeocodeLastCoords = { latitude, longitude }

  const run = (async () => {
    try {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 3000) // Faster timeout

      const res = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
        { signal: controller.signal }
      )

      const data = await res.json()

      const value = buildBigDataCloudAddress(data, latitude, longitude)

      globalReverseGeocodeLastSuccess = value
      return value
    } catch {
      const fallback = {
        city: "Current Location",
        address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        formattedAddress: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      }
      // Don't cache failures as "success" (keeps retries possible), but still return something usable.
      return fallback
    } finally {
      globalReverseGeocodeInFlight = null
    }
  })()

  globalReverseGeocodeInFlight = run
  return run
}

export function useLocation() {
  const [location, setLocation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [permissionGranted, setPermissionGranted] = useState(false)

  const [deliveryAddressMode, setDeliveryAddressMode] = useState(() => {
    if (typeof window === "undefined") return "saved";
    return window.localStorage.getItem("deliveryAddressMode") || "saved";
  });

  useEffect(() => {
    const handleStorageChange = () => {
      setDeliveryAddressMode(window.localStorage.getItem("deliveryAddressMode") || "saved");
    };
    window.addEventListener("deliveryAddressModeChanged", handleStorageChange);
    // Also listen to normal storage events for cross-tab sync
    window.addEventListener("storage", (e) => {
      if (e.key === "deliveryAddressMode") handleStorageChange();
    });
    return () => {
      window.removeEventListener("deliveryAddressModeChanged", handleStorageChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const watchIdRef = useRef(null)
  const updateTimerRef = useRef(null)
  const prevLocationCoordsRef = useRef({ latitude: null, longitude: null })
  const lastGeocodeAtRef = useRef(0)
  const lastGeocodedCoordsRef = useRef({ latitude: null, longitude: null })
  const lastResolvedAddressRef = useRef(null)
  const lastDbLocationFetchAtRef = useRef(0)
  const lastDbLocationRef = useRef(null)
  const lastDbUpdateAtRef = useRef(0)
  const lastDbUpdatedCoordsRef = useRef({ latitude: null, longitude: null })

  const GEOCODE_REUSE_DISTANCE_METERS = 120
  const GEOCODE_REUSE_TIME_MS = 10 * 60 * 1000
  const DB_LOCATION_FETCH_TTL_MS = 2 * 60 * 1000
  const DB_UPDATE_MIN_DISTANCE_METERS = 30
  const DB_UPDATE_MIN_INTERVAL_MS = 90 * 1000
  const getDistanceMeters = (lat1, lng1, lat2, lng2) => {
    if (
      typeof lat1 !== "number" ||
      typeof lng1 !== "number" ||
      typeof lat2 !== "number" ||
      typeof lng2 !== "number"
    ) {
      return Number.POSITIVE_INFINITY
    }
    const latDiff = lat2 - lat1
    const lngDiff = lng2 - lng1
    return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 111320
  }

  /* ===================== DB UPDATE (LIVE LOCATION TRACKING) ===================== */
  const updateLocationInDB = async (locationData) => {
    try {
      // Check if location has placeholder values - don't save placeholders
      const hasPlaceholder =
        locationData?.city === "Current Location" ||
        locationData?.address === "Select location" ||
        locationData?.formattedAddress === "Select location" ||
        (!locationData?.city && !locationData?.address && !locationData?.formattedAddress);

      if (hasPlaceholder) {
        debugLog("?? Skipping DB update - location contains placeholder values:", {
          city: locationData?.city,
          address: locationData?.address,
          formattedAddress: locationData?.formattedAddress
        });
        return;
      }

      // Check if user is authenticated before trying to update DB
      const userToken = localStorage.getItem('user_accessToken') || localStorage.getItem('accessToken')
      if (!userToken || userToken === 'null' || userToken === 'undefined') {
        // User not logged in - skip DB update, just use localStorage
        debugLog("?? User not authenticated, skipping DB update (using localStorage only)")
        return
      }

      const dbUpdateDistanceMeters = getDistanceMeters(
        lastDbUpdatedCoordsRef.current.latitude,
        lastDbUpdatedCoordsRef.current.longitude,
        locationData.latitude,
        locationData.longitude
      )
      const dbUpdateAgeMs = Date.now() - lastDbUpdateAtRef.current
      const shouldSkipDbUpdate =
        dbUpdateDistanceMeters < DB_UPDATE_MIN_DISTANCE_METERS &&
        dbUpdateAgeMs < DB_UPDATE_MIN_INTERVAL_MS
      if (shouldSkipDbUpdate) {
        debugLog("Skipping DB update (small movement + recent update):", {
          dbUpdateDistanceMeters: dbUpdateDistanceMeters.toFixed(1),
          dbUpdateAgeMs
        })
        return
      }

      // Prepare complete location data for database storage
      const locationPayload = {
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        address: locationData.address || "",
        city: locationData.city || "",
        state: locationData.state || "",
        area: locationData.area || "",
        formattedAddress: locationData.formattedAddress || locationData.address || "",
      }

      // Add optional fields if available
      if (locationData.accuracy !== undefined && locationData.accuracy !== null) {
        locationPayload.accuracy = locationData.accuracy
      }
      if (locationData.postalCode) {
        locationPayload.postalCode = locationData.postalCode
      }
      if (locationData.street) {
        locationPayload.street = locationData.street
      }
      if (locationData.streetNumber) {
        locationPayload.streetNumber = locationData.streetNumber
      }

      debugLog("?? Updating live location in database:", {
        coordinates: `${locationPayload.latitude}, ${locationPayload.longitude}`,
        formattedAddress: locationPayload.formattedAddress,
        city: locationPayload.city,
        area: locationPayload.area,
        accuracy: locationPayload.accuracy
      })

      await userAPI.updateLocation(locationPayload)
      lastDbUpdatedCoordsRef.current = {
        latitude: locationPayload.latitude,
        longitude: locationPayload.longitude
      }
      lastDbUpdateAtRef.current = Date.now()

      debugLog("? Live location successfully stored in database")
    } catch (err) {
      // Only log non-network and non-auth errors
      if (err.code !== "ERR_NETWORK" && err.response?.status !== 404 && err.response?.status !== 401) {
        debugError("? DB location update error:", err)
      } else if (err.response?.status === 404 || err.response?.status === 401) {
        // 404 or 401 means user not authenticated or route doesn't exist
        // Silently skip - this is expected for non-authenticated users
        debugLog("?? Location update skipped (user not authenticated or route not available)")
      }
    }
  }

  /* ===================== LOCATION RESOLUTION (Google Maps + Fallbacks) ===================== */
  const resolveDetailedLocation = async (latitude, longitude, forceFresh = false) => {
    let primaryAddr = null;
    let fallbackAddr = null;

    const isDetailed = (addr) => {
      if (!addr) return false;
      if (!addr.area || addr.area.trim() === "") return false;
      if (addr.formattedAddress && addr.city && addr.formattedAddress.toLowerCase() === addr.city.toLowerCase()) return false;
      return true;
    };

    // 1. Primary API (Backend Google Maps)
    try {
      debugLog("📍 Trying Primary API for:", latitude, longitude);
      // Timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Primary API timeout")), 10000)
      );
      const apiPromise = locationAPI.reverseGeocode(latitude, longitude);
      const res = await Promise.race([apiPromise, timeoutPromise]);

      if (res?.data?.success && res?.data?.data) {
        const data = res.data.data;
        primaryAddr = {
          city: data.city || "Unknown City",
          state: data.state || "",
          country: data.country || "",
          area: data.area || data.locality || "",
          address: data.formattedAddress || "",
          formattedAddress: data.formattedAddress || "",
        };
        debugLog("✅ Primary API Success:", primaryAddr);
      }
    } catch (err) {
      debugWarn("⚠️ Primary API failed:", err.message);
    }

    if (isDetailed(primaryAddr)) {
      return primaryAddr;
    }

    // 2. Fallback API (BigDataCloud)
    try {
      debugLog("⚠️ Primary incomplete/failed. Trying Fallback API for:", latitude, longitude);
      fallbackAddr = await reverseGeocodeDirect(latitude, longitude, forceFresh);
      debugLog("✅ Fallback API Success:", fallbackAddr);
    } catch (err) {
      debugWarn("⚠️ Fallback API failed:", err.message);
    }

    // Pick best
    if (isDetailed(fallbackAddr)) return fallbackAddr;

    // If neither is detailed, try to parse area from formattedAddress of primary
    if (primaryAddr && primaryAddr.formattedAddress) {
      const parts = primaryAddr.formattedAddress.split(',').map(p => p.trim());
      if (parts.length >= 3 && !primaryAddr.area) {
        const potentialArea = parts[0];
        const potentialAreaLower = potentialArea.toLowerCase();
        const cityLower = (primaryAddr.city || "").toLowerCase();
        const stateLower = (primaryAddr.state || "").toLowerCase();
        if (potentialAreaLower !== cityLower && potentialAreaLower !== stateLower && !potentialAreaLower.match(/^\d+/)) {
          primaryAddr.area = potentialArea;
          debugLog("🎯 FORCE EXTRACTED area (final fallback):", primaryAddr.area);
        }
      }
      if (primaryAddr.area || primaryAddr.city) return primaryAddr;
    }

    if (fallbackAddr && fallbackAddr.city && fallbackAddr.city !== "Unknown City") return fallbackAddr;
    if (primaryAddr) return primaryAddr;

    throw new Error("Both geocoding APIs failed to return a valid location");
  }

  /* ===================== DB FETCH ===================== */
  const fetchLocationFromDB = async () => {
    try {
      // Check if user is authenticated before trying to fetch from DB
      const userToken = localStorage.getItem('user_accessToken') || localStorage.getItem('accessToken')
      if (!userToken || userToken === 'null' || userToken === 'undefined') {
        return null
      }

      // If userLocation is already stored in localStorage, prefer userLocation over DB fetch
      const existingStored = localStorage.getItem("userLocation")
      if (existingStored) {
        try {
          const parsed = JSON.parse(existingStored)
          if (parsed && (parsed.address || parsed.formattedAddress || parsed.city || parsed.area)) {
            return parsed
          }
        } catch (e) {}
      }

      const dbLocationAgeMs = Date.now() - lastDbLocationFetchAtRef.current
      if (lastDbLocationRef.current && dbLocationAgeMs < DB_LOCATION_FETCH_TTL_MS) {
        return lastDbLocationRef.current
      }

      const res = await userAPI.getAddresses()
      const addressesData = res?.data?.data?.addresses || res?.data?.addresses || []
      const defaultAddr = addressesData.find((addr) => addr.isDefault) || addressesData[0] || null

      if (defaultAddr) {
        const coords = defaultAddr.location?.coordinates || []
        const lat = typeof defaultAddr.location?.lat === "number" ? defaultAddr.location.lat : (coords[1] ?? defaultAddr.latitude ?? defaultAddr.lat)
        const lng = typeof defaultAddr.location?.lng === "number" ? defaultAddr.location.lng : (coords[0] ?? defaultAddr.longitude ?? defaultAddr.lng)

        const street = String(defaultAddr.street || "").trim()
        const area = String(defaultAddr.additionalDetails || defaultAddr.area || defaultAddr.landmark || "").trim()
        const city = String(defaultAddr.city || "").trim()
        const state = String(defaultAddr.state || "").trim()
        const zipCode = String(defaultAddr.zipCode || defaultAddr.postalCode || "").trim()
        const rawFormatted = String(defaultAddr.formattedAddress || defaultAddr.address || "").trim()
        const formattedAddress = rawFormatted || [area, street, city, state, zipCode].filter(Boolean).join(", ")
        const displayAddress = [street || area, city].filter(Boolean).join(", ") || formattedAddress || defaultAddr.label || "Saved Address"

        const storedLocation = {
          latitude: Number.isFinite(Number(lat)) ? Number(lat) : undefined,
          longitude: Number.isFinite(Number(lng)) ? Number(lng) : undefined,
          city: city || "Current Location",
          area: area,
          state: state,
          street: street,
          postalCode: zipCode,
          zipCode: zipCode,
          address: displayAddress,
          formattedAddress: formattedAddress,
          label: defaultAddr.label || "Saved Address"
        }
        lastDbLocationRef.current = storedLocation
        lastDbLocationFetchAtRef.current = Date.now()
        localStorage.setItem("userLocation", JSON.stringify(storedLocation))
        window.dispatchEvent(new CustomEvent("userLocationUpdated", { detail: { location: storedLocation } }))
        return storedLocation
      }
    } catch (err) {
      if (err.code !== "ERR_NETWORK" && err.response?.status !== 404 && err.response?.status !== 401) {
        debugError("DB location fetch error:", err)
      }
    }
    return null
  }

  /* ===================== MAIN LOCATION ===================== */
  const getLocation = async (updateDB = true, forceFresh = false, showLoading = false) => {
    // If not forcing fresh, try DB first (faster)
    let dbLocation = !forceFresh ? await fetchLocationFromDB() : null
    if (dbLocation && !forceFresh) {
      setLocation(dbLocation)
      if (showLoading) setLoading(false)
      return dbLocation
    }

    if (!navigator.geolocation) {
      setError("Geolocation not supported")
      if (showLoading) setLoading(false)
      return dbLocation
    }

    // Helper function to get position with retry mechanism
    const getPositionWithRetry = (options, retryCount = 0) => {
      return new Promise((resolve, reject) => {
        const isRetry = retryCount > 0
        debugLog(`?? Requesting location${isRetry ? ' (retry with lower accuracy)' : ' (high accuracy)'}...`)
        debugLog(`?? Force fresh: ${forceFresh ? 'YES' : 'NO'}, maximumAge: ${options.maximumAge || (forceFresh ? 0 : 60000)}`)

        // Use cached location if available and not too old (faster response)
        // If forceFresh is true, don't use cache (maximumAge: 0)
        const cachedOptions = {
          ...options,
          maximumAge: forceFresh ? 0 : (options.maximumAge || 60000), // If forceFresh, get fresh location
        }

        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              const { latitude, longitude, accuracy } = pos.coords
              const timestamp = pos.timestamp || Date.now()

              debugLog(`? Got location${isRetry ? ' (lower accuracy)' : ' (high accuracy)'}:`, {
                latitude,
                longitude,
                accuracy: `${accuracy}m`,
                timestamp: new Date(timestamp).toISOString(),
                coordinates: `${latitude.toFixed(8)}, ${longitude.toFixed(8)}`
              })

              // Validate coordinates are in India range BEFORE attempting geocoding
              // India: Latitude 6.5 to 37.1 N, Longitude 68.7 to 97.4 E
              const isInIndiaRange = latitude >= 6.5 && latitude <= 37.1 && longitude >= 68.7 && longitude <= 97.4 && longitude > 0

              // Resolve detailed location
              let addr
              if (!isInIndiaRange || longitude < 0) {
                // Coordinates are outside India - skip geocoding and use placeholder
                debugWarn("⚠️ Coordinates outside India range, skipping geocoding:", { latitude, longitude })
                addr = {
                  city: "Current Location",
                  state: "",
                  country: "",
                  area: "",
                  address: "Select location",
                  formattedAddress: "Select location",
                }
              } else {
                debugLog("📍 Calling reverse geocode with coordinates:", { latitude, longitude })
                try {
                  addr = await resolveDetailedLocation(latitude, longitude, forceFresh)
                  debugLog("✅ Reverse geocoding successful:", addr)
                } catch (err) {
                  debugError("❌ All geocoding methods failed:", err.message)
                  addr = {
                    city: "Current Location",
                    state: "",
                    country: "",
                    area: "",
                    address: "Select location",
                    formattedAddress: "Select location",
                  }
                }
              }

              debugLog("Reverse geocode result:", addr)
              if (addr?.formattedAddress && addr.formattedAddress !== "Select location") {
                lastResolvedAddressRef.current = addr
                lastGeocodedCoordsRef.current = { latitude, longitude }
                lastGeocodeAtRef.current = Date.now()
              }
              // Ensure we don't use coordinates as address if we have area/city
              // Keep the complete formattedAddress from geocoder when available
              const completeFormattedAddress = addr.formattedAddress || "";
              let displayAddress = addr.address || "";

              // If address contains coordinates pattern, use area/city instead
              const isCoordinatesPattern = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(displayAddress.trim());
              if (isCoordinatesPattern) {
                if (addr.area && addr.area.trim() !== "") {
                  displayAddress = addr.area;
                } else if (addr.city && addr.city.trim() !== "" && addr.city !== "Unknown City") {
                  displayAddress = addr.city;
                }
              }

              // Build location object with ALL fields from reverse geocoding
              const finalLoc = {
                ...addr, // This includes: city, state, area, street, streetNumber, postalCode, formattedAddress
                latitude,
                longitude,
                accuracy: accuracy || null,
                address: displayAddress, // Locality parts for navbar display
                formattedAddress: completeFormattedAddress || addr.formattedAddress || displayAddress // Complete detailed address
              }

              // Check if location has placeholder values - don't save placeholders
              const hasPlaceholder =
                finalLoc.city === "Current Location" ||
                finalLoc.address === "Select location" ||
                finalLoc.formattedAddress === "Select location" ||
                (!finalLoc.city && !finalLoc.address && !finalLoc.formattedAddress && !finalLoc.area);

              // PREVENT OVERWRITING DETAILED ADDRESS WITH INCOMPLETE ONE
              if (!hasPlaceholder) {
                const isNewDetailed = finalLoc.area && finalLoc.area.trim() !== "";
                if (!isNewDetailed) {
                  const cachedStr = localStorage.getItem("userLocation");
                  if (cachedStr) {
                    try {
                      const cached = JSON.parse(cachedStr);
                      const isOldDetailed = cached.area && cached.area.trim() !== "";
                      if (isOldDetailed && cached.latitude && cached.longitude) {
                        const dist = getDistanceMeters(cached.latitude, cached.longitude, latitude, longitude);
                        if (dist < 200) {
                          debugWarn("⚠️ Aborting overwrite: existing detailed address is within 200m. Reusing it.");
                          Object.assign(finalLoc, cached);
                          // Since we reused cached, we update accuracy with new accuracy
                          finalLoc.accuracy = accuracy || null;
                        }
                      }
                    } catch (e) {}
                  }
                }
              }

              if (hasPlaceholder) {
                debugWarn("⚠️ Skipping save - location contains placeholder values:", finalLoc)
                // Don't save placeholder values to localStorage or DB
                // Just set in state for display but don't persist
                const coordOnlyLoc = {
                  latitude,
                  longitude,
                  accuracy: accuracy || null,
                  city: finalLoc.city,
                  address: finalLoc.address,
                  formattedAddress: finalLoc.formattedAddress
                }
                setLocation(coordOnlyLoc)
                setPermissionGranted(true)
                if (showLoading) setLoading(false)
                setError(null)
                resolve(coordOnlyLoc)
                return
              }

              debugLog("?? Saving location:", finalLoc)
              localStorage.setItem("userLocation", JSON.stringify(finalLoc))
              setLocation(finalLoc)
              setPermissionGranted(true)
              if (showLoading) setLoading(false)
              setError(null)

              if (updateDB) {
                await updateLocationInDB(finalLoc).catch(err => {
                  debugWarn("Failed to update location in DB:", err)
                })
              }
              resolve(finalLoc)
            } catch (err) {
              debugError("? Error processing location:", err)
              // Try one more time with direct reverse geocode as last resort
              const { latitude, longitude } = pos.coords

              try {
                debugLog("?? Last attempt: trying direct reverse geocode...")
                const lastResortAddr = await reverseGeocodeDirect(latitude, longitude)

                // Check if we got valid data (not just coordinates)
                if (lastResortAddr &&
                  lastResortAddr.city !== "Current Location" &&
                  !lastResortAddr.address.includes(latitude.toFixed(4)) &&
                  lastResortAddr.formattedAddress &&
                  !lastResortAddr.formattedAddress.includes(latitude.toFixed(4))) {
                  const lastResortLoc = {
                    ...lastResortAddr,
                    latitude,
                    longitude,
                    accuracy: pos.coords.accuracy || null
                  }
                  debugLog("? Last resort geocoding succeeded:", lastResortLoc)
                  localStorage.setItem("userLocation", JSON.stringify(lastResortLoc))
                  setLocation(lastResortLoc)
                  setPermissionGranted(true)
                  if (showLoading) setLoading(false)
                  setError(null)
                  if (updateDB) await updateLocationInDB(lastResortLoc).catch(() => { })
                  resolve(lastResortLoc)
                  return
                } else {
                  debugWarn("?? Last resort geocoding returned invalid data:", lastResortAddr)
                }
              } catch (lastErr) {
                debugError("? Last resort geocoding also failed:", lastErr.message)
              }

              // If all geocoding fails, use placeholder but don't save
              const fallbackLoc = {
                latitude,
                longitude,
                city: "Current Location",
                area: "",
                state: "",
                address: "Select location", // Don't show coordinates
                formattedAddress: "Select location", // Don't show coordinates
              }
              // Don't save placeholder values to localStorage
              // Only set in state for display
              debugWarn("?? Skipping save - all geocoding failed, using placeholder")
              setLocation(fallbackLoc)
              setPermissionGranted(true)
              if (showLoading) setLoading(false)
              // Don't try to update DB with placeholder
              resolve(fallbackLoc)
            }
          },
          async (err) => {
            // If timeout and we haven't retried yet, try with lower accuracy
            if (err.code === 3 && retryCount === 0 && options.enableHighAccuracy) {
              debugWarn("?? High accuracy timeout, retrying with lower accuracy...")
              // Retry with lower accuracy - faster response (uses network-based location)
              getPositionWithRetry({
                enableHighAccuracy: false,
                timeout: 5000,  // 5 seconds for lower accuracy (network-based is faster)
                maximumAge: 300000 // Allow 5 minute old cached location for instant response
              }, 1).then(resolve).catch(reject)
              return
            }

            // Don't log timeout errors as errors - they're expected in some cases
            if (err.code === 3) {
              debugWarn("?? Geolocation timeout (code 3) - using fallback location")
            } else {
              debugError("? Geolocation error:", err.code, err.message)
            }
            // Try multiple fallback strategies
            try {
              // Strategy 1: Use DB location if available
              let fallback = dbLocation
              if (!fallback) {
                fallback = await fetchLocationFromDB()
              }

              // Strategy 2: Use cached location from localStorage
              if (!fallback) {
                const stored = localStorage.getItem("userLocation")
                if (stored) {
                  try {
                    fallback = JSON.parse(stored)
                    debugLog("? Using cached location from localStorage")
                  } catch (parseErr) {
                    debugWarn("?? Failed to parse stored location:", parseErr)
                  }
                }
              }

              if (fallback) {
                debugLog("? Using fallback location:", fallback)
                setLocation(fallback)
                // Don't set error for timeout when we have fallback
                if (err.code !== 3) {
                  setError(err.message)
                }
                setPermissionGranted(true) // Still grant permission if we have location
                if (showLoading) setLoading(false)
                resolve(fallback)
              } else {
                // No fallback available - set a default location so UI doesn't hang
                debugWarn("?? No fallback location available, setting default")
                const defaultLocation = {
                  city: "Select location",
                  address: "Select location",
                  formattedAddress: "Select location"
                }
                setLocation(defaultLocation)
                setError(err.code === 3 ? "Location request timed out. Please try again." : err.message)
                setPermissionGranted(false)
                if (showLoading) setLoading(false)
                resolve(defaultLocation) // Always resolve with something
              }
            } catch (fallbackErr) {
              debugWarn("?? Fallback retrieval failed:", fallbackErr)
              setLocation(null)
              setError(err.code === 3 ? "Location request timed out. Please try again." : err.message)
              setPermissionGranted(false)
              if (showLoading) setLoading(false)
              resolve(null)
            }
          },
          options
        )
      })
    }

    // Try with high accuracy first
    // If forceFresh is true, don't use cached location (maximumAge: 0)
    // Otherwise, allow cached location for faster response
    return getPositionWithRetry({
      enableHighAccuracy: true,  // Use GPS for exact location (highest accuracy)
      timeout: 15000,            // 15 seconds timeout (gives GPS more time to get accurate fix)
      maximumAge: forceFresh ? 0 : 60000  // If forceFresh, get fresh location. Otherwise allow 1 minute cache
    })
  }

  /* ===================== WATCH LOCATION ===================== */
  const startWatchingLocation = () => {
    if (!navigator.geolocation) {
      debugWarn("?? Geolocation not supported")
      return
    }

    // Clear any existing watch
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }

    debugLog("?? Starting to watch location for live updates...")

    let retryCount = 0
    const maxRetries = 2

    const startWatch = (options) => {
      watchIdRef.current = navigator.geolocation.watchPosition(
        async (pos) => {
          try {
            const { latitude, longitude, accuracy } = pos.coords
            debugLog("?? Location updated:", { latitude, longitude, accuracy: `${accuracy}m` })

            // Reset retry count on success
            retryCount = 0

            // Validate coordinates are in India range BEFORE attempting geocoding
            // India: Latitude 6.5� to 37.1� N, Longitude 68.7� to 97.4� E
            const isInIndiaRange = latitude >= 6.5 && latitude <= 37.1 && longitude >= 68.7 && longitude <= 97.4 && longitude > 0

            // "Geocode once" mode:
            // Do NOT reverse-geocode on every watch tick (it causes frequent api-bdc.io calls).
            // Instead reuse the last resolved address (from the initial page load / explicit request).
            let addr
            if (!isInIndiaRange || longitude < 0) {
              debugWarn("?? Coordinates outside India range; skipping reverse geocoding:", { latitude, longitude })
              addr = {
                city: "Current Location",
                state: "",
                country: "",
                area: "",
                address: "Select location",
                formattedAddress: "Select location",
              }
            } else if (lastResolvedAddressRef.current && lastResolvedAddressRef.current.formattedAddress) {
              addr = lastResolvedAddressRef.current
            } else {
              // If we don't have an address yet, avoid network calls and keep placeholders.
              // (The initial location fetch should set `lastResolvedAddressRef`.)
              addr = {
                city: "Current Location",
                state: "",
                country: "",
                area: "",
                address: "Select location",
                formattedAddress: "Select location",
              }
            }

            // CRITICAL: Ensure formattedAddress is NEVER coordinates
            // Check if reverse geocoding returned proper address or just coordinates
            let completeFormattedAddress = addr.formattedAddress || "";
            let displayAddress = addr.address || "";

            // Check if formattedAddress is coordinates pattern
            const isFormattedAddressCoordinates = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(completeFormattedAddress.trim());
            const isDisplayAddressCoordinates = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(displayAddress.trim());

            // If formattedAddress is coordinates, it means reverse geocoding failed
            // Build proper address from components or use fallback
            if (isFormattedAddressCoordinates || !completeFormattedAddress || completeFormattedAddress === "Select location") {
              debugWarn("?????? Reverse geocoding returned coordinates or empty address!")
              debugWarn("?? Attempting to build address from components:", {
                city: addr.city,
                state: addr.state,
                area: addr.area,
                street: addr.street,
                streetNumber: addr.streetNumber
              })

              // Build address from components
              const addressParts = [];
              if (addr.area && addr.area.trim() !== "") {
                addressParts.push(addr.area);
              }
              if (addr.city && addr.city.trim() !== "") {
                addressParts.push(addr.city);
              }
              if (addr.state && addr.state.trim() !== "") {
                addressParts.push(addr.state);
              }

              if (addressParts.length > 0) {
                completeFormattedAddress = addressParts.join(', ');
                displayAddress = addr.area || addr.city || "Select location";
                debugLog("? Built address from components:", completeFormattedAddress);
              } else {
                // Final fallback - don't use coordinates
                completeFormattedAddress = addr.city || "Select location";
                displayAddress = addr.city || "Select location";
                debugWarn("?? Using fallback address:", completeFormattedAddress);
              }
            }

            // Also check displayAddress
            if (isDisplayAddressCoordinates) {
              displayAddress = addr.area || addr.city || "Select location";
            }

            // Build location object with ALL fields from reverse geocoding
            // NEVER include coordinates in formattedAddress or address
            const loc = {
              ...addr, // This includes: city, state, area, street, streetNumber, postalCode
              latitude,
              longitude,
              accuracy: accuracy || null,
              address: displayAddress, // Locality parts for navbar display (NEVER coordinates)
              formattedAddress: completeFormattedAddress // Complete detailed address (NEVER coordinates)
            }

            // STABILITY: Only update if location changed significantly (>10m) OR address improved
            const currentLoc = location
            if (currentLoc && currentLoc.latitude && currentLoc.longitude) {
              // Calculate distance in meters (Haversine formula simplified for small distances)
              const latDiff = latitude - currentLoc.latitude
              const lngDiff = longitude - currentLoc.longitude
              const distanceMeters = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 111320 // ~111320m per degree

              // Check if address is better (more parts = more complete)
              const currentParts = (currentLoc.formattedAddress || "").split(',').filter(p => p.trim()).length
              const newParts = completeFormattedAddress.split(',').filter(p => p.trim()).length
              const addressImproved = newParts > currentParts

              // Only update if moved >10 meters OR address significantly improved
              if (distanceMeters <= 10 && !addressImproved) {
                debugLog(`?? Location unchanged (${distanceMeters.toFixed(1)}m change), keeping stable address`)
                return // Don't update - keep current stable address
              }

              debugLog(`?? Location updated: ${distanceMeters.toFixed(1)}m change, address parts: ${currentParts} ? ${newParts}`)
            }

            // Final validation - ensure formattedAddress is never coordinates
            if (loc.formattedAddress && /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(loc.formattedAddress.trim())) {
              debugError("??? CRITICAL: formattedAddress is still coordinates! Replacing with city/area")
              loc.formattedAddress = loc.area || loc.city || "Select location";
              loc.address = loc.area || loc.city || "Select location";
            }

            // Check if location has placeholder values - don't save placeholders
            const hasPlaceholder =
              loc.city === "Current Location" ||
              loc.address === "Select location" ||
              loc.formattedAddress === "Select location" ||
              (!loc.city && !loc.address && !loc.formattedAddress && !loc.area);

            if (hasPlaceholder) {
              debugWarn("?? Skipping live location update - contains placeholder values:", loc)
              return // Don't update location or save to DB
            }

            // Check if coordinates have changed significantly (threshold: ~10 meters)
            const coordThreshold = 0.0001 // approximately 10 meters
            const coordsChanged =
              !prevLocationCoordsRef.current.latitude ||
              !prevLocationCoordsRef.current.longitude ||
              Math.abs(prevLocationCoordsRef.current.latitude - loc.latitude) > coordThreshold ||
              Math.abs(prevLocationCoordsRef.current.longitude - loc.longitude) > coordThreshold
            let persistedLocation = loc
            try {
              const storedRaw = localStorage.getItem("userLocation")
              const storedLocation = storedRaw ? JSON.parse(storedRaw) : null
              const savedLabel = loc?.label || storedLocation?.label
              if (savedLabel && String(savedLabel).trim()) {
                persistedLocation = { ...loc, label: String(savedLabel).trim() }
              }
            } catch {
              persistedLocation = loc
            }

            // Only update location state if coordinates changed significantly
            if (coordsChanged) {
              prevLocationCoordsRef.current = { latitude: loc.latitude, longitude: loc.longitude }
              debugLog("?? Updating live location:", loc)
              localStorage.setItem("userLocation", JSON.stringify(persistedLocation))
              setLocation(persistedLocation)
              setPermissionGranted(true)
              setError(null)
            } else {
              // Coordinates haven't changed significantly, skip state update to prevent re-renders
              // Still update localStorage silently for persistence
              localStorage.setItem("userLocation", JSON.stringify(persistedLocation))
            }

            // Debounce DB updates - only update every 5 seconds
            clearTimeout(updateTimerRef.current)
            updateTimerRef.current = setTimeout(() => {
              updateLocationInDB(loc).catch(err => {
                debugWarn("Failed to update location in DB:", err)
              })
            }, 5000)
          } catch (err) {
            debugError("? Error processing live location update:", err)
            // If reverse geocoding fails, DON'T use coordinates - use placeholder
            const { latitude, longitude } = pos.coords
            const fallbackLoc = {
              latitude,
              longitude,
              city: "Current Location",
              area: "",
              state: "",
              address: "Select location", // NEVER use coordinates
              formattedAddress: "Select location", // NEVER use coordinates
            }
            debugWarn("?? Using fallback location (reverse geocoding failed):", fallbackLoc)
            // Don't save placeholder values to localStorage
            // Only set in state for display
            debugWarn("?? Skipping localStorage save - fallback location contains placeholder values")
            setLocation(fallbackLoc)
            setPermissionGranted(true)
          }
        },
        (err) => {
          // Don't log timeout errors for watchPosition (it's a background operation)
          // Only log non-timeout errors
          if (err.code !== 3) {
            debugWarn("?? Watch position error (non-timeout):", err.code, err.message)
          }

          // If timeout and we haven't exceeded max retries, retry with HIGH ACCURACY GPS
          // CRITICAL: Keep using GPS (not network-based) for accurate location
          // Network-based location won't give exact landmarks like "Mama Loca Cafe"
          if (err.code === 3 && retryCount < maxRetries) {
            retryCount++
            debugLog(`?? GPS timeout, retrying with high accuracy GPS (attempt ${retryCount}/${maxRetries})...`)

            // Clear current watch
            if (watchIdRef.current) {
              navigator.geolocation.clearWatch(watchIdRef.current)
              watchIdRef.current = null
            }

            // Retry with HIGH ACCURACY GPS (don't use network-based location)
            // Network-based location is less accurate and won't give exact landmarks
            setTimeout(() => {
              startWatch({
                enableHighAccuracy: true,   // Keep using GPS (not network-based)
                timeout: 20000,              // 20 seconds timeout (give GPS more time)
                maximumAge: 0                // Always get fresh GPS location
              })
            }, 3000) // 3 second delay before retry
            return
          }

          // If all retries failed, silently continue - don't set error state for background watch
          // The watch will keep trying in background, user won't notice
          // Only set error for non-timeout errors that are critical
          if (err.code !== 3) {
            setError(err.message)
            setPermissionGranted(false)
          }

          // Don't clear the watch - let it keep trying in background
          // The user might move to a location with better GPS signal
        },
        options
      )
    }

    // Start with HIGH ACCURACY GPS for live location tracking
    // CRITICAL: enableHighAccuracy: true forces GPS (not network-based) for accurate location
    // Network-based location won't give exact landmarks like "Mama Loca Cafe"
    startWatch({
      enableHighAccuracy: true,   // CRITICAL: Use GPS (not network-based) for accurate location
      timeout: 15000,             // 15 seconds timeout (gives GPS more time to get accurate fix)
      maximumAge: 0               // Always get fresh GPS location (no cache for live tracking)
    })

    debugLog("??? GPS High Accuracy enabled for live location tracking")
    debugLog("? GPS will provide accurate coordinates for reverse geocoding")
    debugLog("? Network-based location disabled (less accurate)")
  }

  const stopWatchingLocation = () => {
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    clearTimeout(updateTimerRef.current)
  }

  useEffect(() => {
    if (typeof window === "undefined") return undefined

    const applyExternalLocationUpdate = (event) => {
      try {
        const nextLocation =
          event?.detail?.location ||
          JSON.parse(window.localStorage.getItem("userLocation") || "null")

        if (!nextLocation || typeof nextLocation !== "object") return

        lastDbLocationRef.current = nextLocation
        lastDbLocationFetchAtRef.current = Date.now()
        setLocation(nextLocation)
        setPermissionGranted(true)
        setLoading(false)
        setError(null)
      } catch (err) {
        debugWarn("Failed to apply external location update:", err)
      }
    }

    const handleAuthChange = () => {
      // User logged in/out, re-fetch location from DB
      fetchLocationFromDB().then((dbLoc) => {
        if (dbLoc && Number.isFinite(Number(dbLoc.latitude)) && Number.isFinite(Number(dbLoc.longitude))) {
          setLocation(dbLoc)
          setPermissionGranted(true)
          setLoading(false)
        }
      })
    }

    window.addEventListener("userLocationUpdated", applyExternalLocationUpdate)
    window.addEventListener("userAuthChanged", handleAuthChange)
    return () => {
      window.removeEventListener("userLocationUpdated", applyExternalLocationUpdate)
      window.removeEventListener("userAuthChanged", handleAuthChange)
    }
  }, [])

  /* ===================== INIT ===================== */
  useEffect(() => {
    // Load stored location first for IMMEDIATE display (no loading state)
    const stored = localStorage.getItem("userLocation")
    let shouldForceRefresh = false
    let hasInitialLocation = false

    if (stored) {
      try {
        const parsedLocation = JSON.parse(stored)

        // Show cached location immediately.
        // Requirement: only geocode again on explicit manual change.
        const lat = Number(parsedLocation?.latitude)
        const lng = Number(parsedLocation?.longitude)
        const hasLatLng = Number.isFinite(lat) && Number.isFinite(lng)

        if (parsedLocation && hasLatLng) {
          setLocation(parsedLocation)
          setPermissionGranted(true)
          setLoading(false) // Set loading to false immediately
          hasInitialLocation = true
          shouldForceRefresh = false
          debugLog("?? Loaded stored location instantly (no auto-refresh):", parsedLocation)
        } else {
          // If we don't have usable coordinates, we must fetch once on first open.
          debugLog("?? Stored location missing coordinates; will fetch once")
          shouldForceRefresh = true
        }
      } catch (err) {
        debugError("Failed to parse stored location:", err)
        shouldForceRefresh = true
      }
    }

    // If no cached location, try DB
    if (!hasInitialLocation) {
      fetchLocationFromDB()
        .then((dbLoc) => {
          if (dbLoc && Number.isFinite(Number(dbLoc.latitude)) && Number.isFinite(Number(dbLoc.longitude))) {
            setLocation(dbLoc)
            setPermissionGranted(true)
            setLoading(false)
            hasInitialLocation = true
            debugLog("?? Loaded location from DB:", dbLoc)
          } else {
            // No location found - set loading to false and show fallback
            setLoading(false)
            shouldForceRefresh = true
          }
        })
        .catch(() => {
          setLoading(false)
          shouldForceRefresh = true
        })
    }

    // Always ensure loading is false after initial check
    // Safety timeout to prevent infinite loading
    const loadingTimeout = setTimeout(() => {
      setLoading((currentLoading) => {
        if (currentLoading) {
          debugWarn("?? Loading timeout - setting loading to false")
          // Only set fallback if we still don't have a location
          setLocation((currentLocation) => {
            if (!currentLocation ||
              (currentLocation.formattedAddress === "Select location" &&
                !currentLocation.latitude && !currentLocation.city)) {
              return {
                city: "Select location",
                address: "Select location",
                formattedAddress: "Select location"
              }
            }
            return currentLocation
          })
        }
        return false
      })
    }, 5000) // 5 second safety timeout (increased to allow background fetch to complete)

    // Don't set fallback immediately - wait for background fetch to complete
    // The background fetch will set the location, or we'll use the cached/DB location
    // Only set fallback if we have no location after all attempts

    // Request fresh location in BACKGROUND (non-blocking)
    // CRITICAL FIX: Only auto-request if permission is ALREADY granted
    // This prevents "Requests geolocation permission on page load" warning
    const checkPermissionAndStart = async () => {
      try {
        let permissionGranted = false;

        if (navigator.permissions && navigator.permissions.query) {
          try {
            const result = await navigator.permissions.query({ name: 'geolocation' });
            if (result.state === 'granted') {
              permissionGranted = true;
            } else {
              debugLog(`?? Geolocation permission is '${result.state}' - Waiting for user action (avoiding prompt on load)`);
            }
          } catch (permErr) {
            debugWarn("?? Permission query failed:", permErr);
          }
        } else {
          // Fallback for browsers without permissions API - assume not granted to be safe
          debugLog("?? Permissions API not available - Skipping auto-start");
        }

        // If permission NOT granted, and we don't have a specific user request (this is page load),
        // we should SKIP automatic fetching/watching to allow the user to choose when to enable it.
        // UNLESS we already have a valid initial location from localStorage/DB, in which case we might want to refresh?
        if (!permissionGranted) {
          setLoading(false);
          return;
        }

        const addressMode = localStorage.getItem("deliveryAddressMode") || "saved";
        if (addressMode === "saved") {
          debugLog("📍 deliveryAddressMode is 'saved'; preserving user-selected saved address.");
          setLoading(false);
          return;
        }

        debugLog("📍 Permission granted & mode is 'current'! Auto-fetching fresh GPS location in background on app open...");

        // Automatically fetch fresh GPS location in background when user opens app with location enabled in 'current' mode
        getLocation(true, true)
          .then((location) => {
            if (
              location &&
              location.formattedAddress !== "Select location" &&
              location.city !== "Current Location"
            ) {
              debugLog("✅ Fresh location auto-updated on app open:", location);
              setLocation(location);
              try {
                localStorage.setItem("userLocation", JSON.stringify(location));
                localStorage.setItem("deliveryAddressMode", "current");
                window.dispatchEvent(
                  new CustomEvent("userLocationUpdated", {
                    detail: { location },
                  })
                );
              } catch (e) {}
              setPermissionGranted(true);
              if (AUTO_START_LIVE_WATCH) startWatchingLocation();
            }
          })
          .catch((err) => {
            debugWarn("⚠️ Background location refresh error:", err);
          });
      } catch (err) {
        debugError("Error in checkPermissionAndStart:", err);
        setLoading(false);
      }
    };

    // Always check permission state on startup.
    // This does NOT trigger browser prompt by itself; it only auto-fetches when permission is already granted.
    checkPermissionAndStart();

    // Cleanup timeout and watcher
    return () => {
      clearTimeout(loadingTimeout)
      debugLog("?? Cleaning up location watcher")
      stopWatchingLocation()
    }
  }, [])

  const requestLocation = async () => {
    debugLog("?????? User requested location update - clearing cache and fetching fresh")
    setLoading(true)
    setError(null)

    try {
      // Clear cached location to force fresh fetch
      localStorage.removeItem("userLocation")
      debugLog("??? Cleared cached location from localStorage")

      // Clear global reverse geocode cache so we get a truly fresh address
      globalReverseGeocodeLastSuccess = null
      globalReverseGeocodeLastStartAt = 0
      globalReverseGeocodeLastCoords = { latitude: null, longitude: null }
      globalReverseGeocodeInFlight = null
      debugLog("??? Cleared global reverse geocode cache")

      // Also clear instance-level geocode refs so fresh geocode happens
      lastGeocodedCoordsRef.current = { latitude: null, longitude: null }
      lastGeocodeAtRef.current = 0
      lastResolvedAddressRef.current = null

      // Show loading, so pass showLoading = true
      // forceFresh = true, updateDB = true, showLoading = true
      // This ensures we get fresh GPS coordinates and reverse geocode
      const location = await getLocation(true, true, true)

      debugLog("??? Fresh location requested successfully:", location)
      debugLog("??? Complete Location details:", {
        formattedAddress: location?.formattedAddress,
        address: location?.address,
        city: location?.city,
        state: location?.state,
        area: location?.area,
        pointOfInterest: location?.pointOfInterest,
        premise: location?.premise,
        coordinates: location?.latitude && location?.longitude ?
          `${location.latitude.toFixed(8)}, ${location.longitude.toFixed(8)}` : "N/A",
        hasCompleteAddress: location?.formattedAddress &&
          location.formattedAddress !== "Select location" &&
          !location.formattedAddress.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/) &&
          location.formattedAddress.split(',').length >= 4
      })

      // Verify we got complete address (POI, building, floor, area, city, state, pincode)
      if (!location?.formattedAddress ||
        location.formattedAddress === "Select location" ||
        location.formattedAddress.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/) ||
        location.formattedAddress.split(',').length < 4) {
        debugWarn("?????? Location received but address is incomplete!")
        debugWarn("?? Address parts count:", location?.formattedAddress?.split(',').length || 0)
        debugWarn("?? This might be due to:")
        debugWarn("   1. Geocoding service unavailable or rate-limited")
        debugWarn("   2. Location permission not granted")
        debugWarn("   3. GPS accuracy too low (try on mobile device)")
      } else {
        debugLog("??? SUCCESS: Complete detailed address received!")
        debugLog("? Full address:", location.formattedAddress)
      }

      return location
    } catch (err) {
      debugError("? Failed to request location:", err)
      setError(err.message || "Failed to get location")
      throw err
    } finally {
      setLoading(false)
    }
  }

  return {
    location,
    loading,
    error,
    permissionGranted,
    deliveryAddressMode,
    requestLocation,
    startWatchingLocation,
    stopWatchingLocation,
  }
}

