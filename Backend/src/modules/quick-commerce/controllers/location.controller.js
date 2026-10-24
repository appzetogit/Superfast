import axios from 'axios';
import { ApiError } from '../../../utils/ApiError.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

/**
 * Map Google Maps address components to a flatter structure
 */
const mapAddressComponents = (components) => {
  const get = (type) => {
    const c = components.find((x) => x.types?.includes(type));
    return c ? c.long_name : '';
  };
  const country = get('country');
  const state = get('administrative_area_level_1');
  const city = get('locality') || get('administrative_area_level_2') || get('sublocality');
  const area = get('sublocality') || get('neighborhood') || '';
  const pincode = get('postal_code');
  return { country, state, city, area, pincode };
};

/**
 * @desc    Geocode an address string to coordinates
 * @route   GET /api/v1/quick-commerce/location/geocode
 * @access  Public
 */
export const geocodeAddress = asyncHandler(async (req, res) => {
  const { address } = req.query;

  if (!address || !String(address).trim()) {
    throw new ApiError(400, 'Address query parameter is required');
  }

  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAP_API_KEY;

  if (key) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        address
      )}&key=${key}`;
      
      const { data } = await axios.get(url, { timeout: 5000 });

      if (data.status === 'OK' && data.results?.[0]) {
        const first = data.results[0];
        const { lat, lng } = first.geometry.location;
        const components = mapAddressComponents(first.address_components || []);

        return res.status(200).json({
          success: true,
          data: {
            latitude: lat,
            longitude: lng,
            formattedAddress: first.formatted_address,
            ...components,
            placeId: first.place_id,
          },
        });
      }

      if (data.status === 'ZERO_RESULTS') {
        return res.status(404).json({
          success: false,
          message: 'No location found for the provided address',
        });
      }

      console.warn(`[Location] Google Maps geocode returned status ${data.status}: ${data.error_message || ''}. Attempting fallback.`);
    } catch (err) {
      console.warn('[Location] Google Maps geocoding error:', err.message, '- attempting fallback');
    }
  }

  // Fallback to OpenStreetMap Nominatim
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&viewbox=70.0,26.5,73.5,23.5&bounded=0&q=${encodeURIComponent(
      address
    )}&limit=1`;
    const { data: nomData } = await axios.get(nomUrl, {
      timeout: 5000,
      headers: { 'User-Agent': 'SuperfastFoodDelivery/1.0' },
    });

    if (Array.isArray(nomData) && nomData.length > 0) {
      const first = nomData[0];
      return res.status(200).json({
        success: true,
        data: {
          latitude: parseFloat(first.lat),
          longitude: parseFloat(first.lon),
          formattedAddress: first.display_name,
          country: 'India',
          state: '',
          city: '',
          area: '',
          pincode: '',
          placeId: first.place_id ? String(first.place_id) : '',
        },
      });
    }

    return res.status(404).json({
      success: false,
      message: 'No location found for the provided address',
    });
  } catch (fallbackError) {
    console.error('[Location] Geocoding fallback failed:', fallbackError.message);
    throw new ApiError(500, 'Failed to geocode address');
  }
});

/**
 * @desc    Reverse geocode coordinates to an address
 * @route   GET /api/v1/quick-commerce/location/reverse-geocode
 * @access  Public
 */
export const reverseGeocode = asyncHandler(async (req, res) => {
  const { lat, lng } = req.query;

  if (!lat || !lng) {
    throw new ApiError(400, 'lat and lng query parameters are required');
  }

  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAP_API_KEY;

  if (key) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`;
      const { data } = await axios.get(url, { timeout: 5000 });

      if (data.status === 'OK' && data.results?.[0]) {
        const first = data.results[0];
        const components = mapAddressComponents(first.address_components || []);

        return res.status(200).json({
          success: true,
          data: {
            formattedAddress: first.formatted_address,
            ...components,
            latitude: Number(lat),
            longitude: Number(lng),
            placeId: first.place_id,
          },
        });
      }

      if (data.status === 'ZERO_RESULTS') {
        throw new ApiError(404, 'Address not found');
      }

      console.warn(`[Location] Google Maps reverse-geocode returned status ${data.status}: ${data.error_message || ''}. Attempting fallback.`);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 404) throw err;
      console.warn('[Location] Google Maps reverse geocode error:', err.message, '- attempting fallback');
    }
  }

  // Fallback 1: OpenStreetMap Nominatim (Accurate coordinate-based reverse geocoding)
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
    const { data: nom } = await axios.get(nomUrl, {
      timeout: 4500,
      headers: { 'User-Agent': 'SuperfastFoodDelivery/1.0', 'Accept-Language': 'en' },
    });

    if (nom && nom.display_name) {
      const addr = nom.address || {};
      const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
      const area = addr.suburb || addr.neighbourhood || addr.residential || addr.road || '';
      return res.status(200).json({
        success: true,
        data: {
          formattedAddress: nom.display_name,
          country: addr.country || 'India',
          state: addr.state || '',
          city,
          area,
          pincode: addr.postcode || '',
          latitude: Number(lat),
          longitude: Number(lng),
          placeId: nom.place_id ? String(nom.place_id) : '',
        },
      });
    }
  } catch (nomErr) {
    console.warn('[Location] Nominatim fallback failed:', nomErr.message);
  }

  // Fallback 2: BigDataCloud reverse geocode client (ONLY if lookupSource is coordinates)
  try {
    const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
    const { data: bdc } = await axios.get(bdcUrl, { timeout: 4000 });

    // Reject IP geolocation fallbacks (IP routing sends central India / Indore instead of real user location)
    if (bdc && bdc.lookupSource !== 'ip geolocation') {
      const formatted = [
        bdc.locality || bdc.subPremise,
        bdc.city || bdc.localityInfo?.administrative?.[2]?.name,
        bdc.principalSubdivision,
        bdc.postcode,
        bdc.countryName,
      ]
        .filter(Boolean)
        .join(', ');

      return res.status(200).json({
        success: true,
        data: {
          formattedAddress: formatted || `Location (${lat}, ${lng})`,
          country: bdc.countryName || 'India',
          state: bdc.principalSubdivision || '',
          city: bdc.city || bdc.locality || '',
          area: bdc.locality || '',
          pincode: bdc.postcode || '',
          latitude: Number(lat),
          longitude: Number(lng),
          placeId: '',
        },
      });
    }
  } catch (bdcErr) {
    console.warn('[Location] BigDataCloud fallback failed:', bdcErr.message);
  }

  // Fallback 3: Return Sanchore default location or coordinates so client NEVER 500s or defaults to wrong state
  const isNearSanchore = Math.hypot(Number(lat) - 24.7534, Number(lng) - 71.7720) < 1.0;
  return res.status(200).json({
    success: true,
    data: {
      formattedAddress: isNearSanchore ? 'Sanchore, Rajasthan 343041, India' : `Coordinates: ${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`,
      country: 'India',
      state: isNearSanchore ? 'Rajasthan' : '',
      city: isNearSanchore ? 'Sanchore' : '',
      area: isNearSanchore ? 'Sanchore' : '',
      pincode: isNearSanchore ? '343041' : '',
      latitude: Number(lat),
      longitude: Number(lng),
      placeId: '',
    },
  });
});
