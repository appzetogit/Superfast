/**
 * Calculates the centroid (center point) of an array of coordinates.
 * @param {Array<{latitude: number, longitude: number}>|Array<{lat: number, lng: number}>} coordinates
 * @returns {{lat: number, lng: number}} The centroid coordinate.
 */
export const calculateCentroid = (coordinates) => {
  if (!coordinates || coordinates.length === 0) return { lat: 0, lng: 0 };
  
  let totalLat = 0;
  let totalLng = 0;
  
  coordinates.forEach(coord => {
    totalLat += typeof coord.lat === 'function' ? coord.lat() : (coord.latitude ?? coord.lat);
    totalLng += typeof coord.lng === 'function' ? coord.lng() : (coord.longitude ?? coord.lng);
  });
  
  return {
    lat: totalLat / coordinates.length,
    lng: totalLng / coordinates.length
  };
};

/**
 * Sorts coordinates radially around their centroid to prevent self-intersections
 * when drawing a polygon.
 * @param {Array<{latitude: number, longitude: number}>|Array<{lat: number, lng: number}>} coordinates
 * @returns {Array} The radially sorted coordinates.
 */
export const radiallySortCoordinates = (coordinates) => {
  if (!coordinates || coordinates.length < 3) return [...coordinates];
  
  const centroid = calculateCentroid(coordinates);
  
  // Sort by angle relative to the centroid
  return [...coordinates].sort((a, b) => {
    const latA = typeof a.lat === 'function' ? a.lat() : (a.latitude ?? a.lat);
    const lngA = typeof a.lng === 'function' ? a.lng() : (a.longitude ?? a.lng);
    const latB = typeof b.lat === 'function' ? b.lat() : (b.latitude ?? b.lat);
    const lngB = typeof b.lng === 'function' ? b.lng() : (b.longitude ?? b.lng);
    
    // Math.atan2(y, x) -> y is lat difference, x is lng difference
    const angleA = Math.atan2(latA - centroid.lat, lngA - centroid.lng);
    const angleB = Math.atan2(latB - centroid.lat, lngB - centroid.lng);
    
    return angleA - angleB;
  });
};
