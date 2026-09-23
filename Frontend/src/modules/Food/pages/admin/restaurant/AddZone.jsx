import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { MapPin, ArrowLeft, Save, X, Hand, Shapes, Search } from "lucide-react"
import { adminAPI } from "@food/api"
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey"
import { radiallySortCoordinates } from "@food/utils/mapDrawingUtils"
import { Loader } from "@googlemaps/js-api-loader"
const debugLog = (...args) => { }
const debugWarn = (...args) => { }
const debugError = (...args) => { }


export default function AddZone() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEditMode = !!id && !window.location.pathname.includes('/view/')
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const drawingManagerRef = useRef(null)
  const polygonRef = useRef(null)
  const markersRef = useRef([])
  const pathMarkersRef = useRef([])
  const drawingPointsRef = useRef([])
  const mapClickListenerRef = useRef(null)

  const [googleMapsApiKey, setGoogleMapsApiKey] = useState("")
  const [mapLoading, setMapLoading] = useState(true)
  const [loading, setLoading] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    country: "India",
    zoneName: "",
    unit: "kilometer",
  })

  const [coordinates, setCoordinates] = useState([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [locationSearch, setLocationSearch] = useState("")
  const [existingZones, setExistingZones] = useState([])
  const autocompleteInputRef = useRef(null)
  const autocompleteRef = useRef(null)
  const existingZonesPolygonsRef = useRef([])

  useEffect(() => {
    fetchExistingZones()
    loadGoogleMaps()
    if (isEditMode && id) {
      fetchZone()
    }
  }, [id, isEditMode])

  // Center map on India when country is selected
  useEffect(() => {
    if (formData.country === "India" && mapInstanceRef.current) {
      const indiaCenter = { lat: 20.5937, lng: 78.9629 }
      mapInstanceRef.current.setCenter(indiaCenter)
      mapInstanceRef.current.setZoom(5)
    }
  }, [formData.country])

  // Initialize Places Autocomplete when map is loaded
  useEffect(() => {
    if (!mapLoading && mapInstanceRef.current && autocompleteInputRef.current && window.google?.maps?.places && !autocompleteRef.current) {
      const autocomplete = new window.google.maps.places.Autocomplete(autocompleteInputRef.current, {
        // No `geocode` type — it routes predictions through Geocoding-style endpoints.
        componentRestrictions: { country: 'in' } // Restrict to India
      })

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace()
        if (place.geometry && place.geometry.location && mapInstanceRef.current) {
          const location = place.geometry.location
          mapInstanceRef.current.setCenter(location)
          mapInstanceRef.current.setZoom(15) // Zoom in when location is selected

          // Set the search input value
          setLocationSearch(place.formatted_address || place.name || "")
        }
      })

      autocompleteRef.current = autocomplete
    }
  }, [mapLoading])

  // Draw existing polygon when in edit mode and coordinates are loaded
  useEffect(() => {
    if (isEditMode && coordinates.length >= 3 && mapInstanceRef.current && window.google && !mapLoading) {
      debugLog("Drawing existing polygon in edit mode, coordinates:", coordinates.length)
      setTimeout(() => {
        if (mapInstanceRef.current && window.google) {
          // Ensure drawing mode is off when editing existing polygon
          if (drawingManagerRef.current) {
            drawingManagerRef.current.setDrawingMode(null)
            setIsDrawing(false)
            debugLog("Drawing mode disabled, polygon is editable")
          }
          drawExistingPolygon(window.google, mapInstanceRef.current, coordinates)
        }
      }, 500)
    }
  }, [isEditMode, coordinates.length, mapLoading])


  const fetchExistingZones = async () => {
    try {
      const response = await adminAPI.getZones({ limit: 1000 })
      if (response.data?.success && response.data.data?.zones) {
        // Filter out the current zone if in edit mode
        const zones = isEditMode && id
          ? response.data.data.zones.filter(zone => zone._id !== id)
          : response.data.data.zones
        setExistingZones(zones)
      }
    } catch (error) {
      debugError("Error fetching existing zones:", error)
      setExistingZones([])
    }
  }

  const fetchZone = async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getZoneById(id)
      if (response.data?.success && response.data.data?.zone) {
        const zoneData = response.data.data.zone
        setFormData({
          country: zoneData.country || "India",
          zoneName: zoneData.name || zoneData.zoneName || "",
          unit: zoneData.unit || "kilometer",
        })

        if (zoneData.coordinates && zoneData.coordinates.length > 0) {
          setCoordinates(zoneData.coordinates)
        }
      }
    } catch (error) {
      debugError("Error fetching zone:", error)
      alert("Failed to load zone")
      navigate("/admin/food/zone-setup")
    } finally {
      setLoading(false)
    }
  }

  const loadGoogleMaps = async () => {
    try {
      const apiKey = await getGoogleMapsApiKey()
      setGoogleMapsApiKey(apiKey || "loaded")

      // Wait for Google Maps to be loaded from main.jsx if it's loading
      let retries = 0
      const maxRetries = 50 // Wait up to 5 seconds (50 * 100ms)

      while (!window.google && retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100))
        retries++
      }

      // If Google Maps is already loaded with places and drawing libraries, use it directly
      if (window.google && window.google.maps && window.google.maps.places && window.google.maps.drawing) {
        initializeMap(window.google)
        return
      }

      // If Google Maps is not loaded yet and we have an API key, use Loader as fallback
      if (apiKey) {
        const loader = new Loader({
          apiKey: apiKey,
          version: "weekly",
          libraries: ["places", "drawing", "geometry"]
        })

        const google = await loader.load()
        initializeMap(google)
      } else {
        setMapLoading(false)
      }
    } catch (error) {
      debugError("Error loading Google Maps:", error)
      setMapLoading(false)
    }
  }

  const initializeMap = (google) => {
    if (!mapRef.current) return

    // Initial location (India center)
    const initialLocation = { lat: 20.5937, lng: 78.9629 }

    // Create map
    const map = new google.maps.Map(mapRef.current, {
      center: initialLocation,
      zoom: 5,
      mapTypeControl: true,
      mapTypeControlOptions: {
        style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
        position: google.maps.ControlPosition.TOP_RIGHT,
        mapTypeIds: [google.maps.MapTypeId.ROADMAP, google.maps.MapTypeId.SATELLITE]
      },
      zoomControl: true,
      streetViewControl: false,
      fullscreenControl: true,
      scrollwheel: true, // Enable mouse wheel zoom
      gestureHandling: 'greedy', // Allow zoom with mouse wheel and touch gestures
      disableDoubleClickZoom: false, // Allow double-click zoom
    })

    mapInstanceRef.current = map
    setMapLoading(false)

    // If in edit mode and coordinates are already loaded, draw the polygon
    if (isEditMode && coordinates.length >= 3) {
      setTimeout(() => {
        if (mapInstanceRef.current && window.google) {
          drawExistingPolygon(window.google, mapInstanceRef.current, coordinates)
        }
      }, 500)
    }
  }

  const drawExistingZonesOnMap = (google, map) => {
    if (!existingZones || existingZones.length === 0) return

    // Clear previous existing zone polygons
    existingZonesPolygonsRef.current.forEach(polygon => {
      if (polygon) polygon.setMap(null)
    })
    existingZonesPolygonsRef.current = []

    existingZones.forEach((zone, index) => {
      if (!zone.coordinates || zone.coordinates.length < 3) return

      // Convert coordinates to LatLng array
      const path = zone.coordinates.map(coord => {
        const lat = typeof coord === 'object' ? (coord.latitude || coord.lat) : null
        const lng = typeof coord === 'object' ? (coord.longitude || coord.lng) : null
        if (lat === null || lng === null) return null
        return new google.maps.LatLng(lat, lng)
      }).filter(Boolean)

      if (path.length < 3) return

      // Create polygon for existing zone with different color (gray/blue)
      const polygon = new google.maps.Polygon({
        paths: path,
        strokeColor: "#3b82f6", // Blue color for existing zones
        strokeOpacity: 0.6,
        strokeWeight: 2,
        fillColor: "#3b82f6",
        fillOpacity: 0.15, // Lighter opacity so new zone stands out
        editable: false, // Not editable
        draggable: false,
        clickable: true,
        zIndex: 0 // Lower z-index so new zone appears on top
      })

      polygon.setMap(map)
      existingZonesPolygonsRef.current.push(polygon)

      // Add info window on click
      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="padding: 8px;">
            <strong>${zone.name || zone.zoneName || 'Unnamed Zone'}</strong><br/>
            <small>Country: ${zone.country || 'N/A'}</small>
          </div>
        `
      })

      polygon.addListener('click', () => {
        infoWindow.setPosition(polygon.getPath().getAt(0))
        infoWindow.open(map)
      })
    })
  }

  // Redraw existing zones when zones data changes or map is ready
  useEffect(() => {
    if (!mapLoading && mapInstanceRef.current && existingZones.length > 0 && window.google) {
      drawExistingZonesOnMap(window.google, mapInstanceRef.current)
    }
  }, [existingZones, mapLoading])

  const updateCoordinatesFromPolygon = (polygon) => {
    const path = polygon.getPath()
    const coords = []
    path.forEach((latLng) => {
      coords.push({
        latitude: latLng.lat(),
        longitude: latLng.lng()
      })
    })
    setCoordinates(coords)
  }

  const drawExistingPolygon = (google, map, coords) => {
    if (!coords || coords.length < 3) return;

    if (polygonRef.current) {
      polygonRef.current.setMap(null);
    }

    const path = coords.map(coord => {
      const lat = typeof coord === 'object' ? (coord.latitude || coord.lat) : null;
      const lng = typeof coord === 'object' ? (coord.longitude || coord.lng) : null;
      if (lat === null || lng === null) return null;
      return new google.maps.LatLng(lat, lng);
    }).filter(Boolean);

    if (path.length < 3) return;

    const polygon = new google.maps.Polygon({
      paths: path,
      strokeColor: "#9333ea",
      strokeOpacity: 0.8,
      strokeWeight: 3,
      fillColor: "#9333ea",
      fillOpacity: 0.35,
      editable: true,
      draggable: false,
      clickable: true,
      zIndex: 1
    });

    polygon.setMap(map);
    polygonRef.current = polygon;

    const bounds = new google.maps.LatLngBounds();
    path.forEach(latLng => bounds.extend(latLng));
    map.fitBounds(bounds);

    const handlePolygonEdit = () => {
      updateCoordinatesFromPolygon(polygon);
    };

    const polygonPath = polygon.getPath();
    google.maps.event.addListener(polygonPath, 'set_at', handlePolygonEdit);
    google.maps.event.addListener(polygonPath, 'insert_at', handlePolygonEdit);

    // Context menu right-click for vertex deletion
    google.maps.event.addListener(polygon, 'rightclick', (e) => {
      if (e.vertex != null) {
        const path = polygon.getPath();
        if (path.getLength() > 3) {
          path.removeAt(e.vertex);
          handlePolygonEdit();
        } else {
          alert("A polygon must have at least 3 vertices.");
        }
      }
    });
  }

  const updatePreviewPolygon = () => {
    if (!polygonRef.current || !mapInstanceRef.current) {
      polygonRef.current = new window.google.maps.Polygon({
        map: mapInstanceRef.current,
        strokeColor: "#9333ea",
        strokeOpacity: 0.8,
        strokeWeight: 3,
        fillColor: "#9333ea",
        fillOpacity: 0.35,
        clickable: false,
        editable: false,
        draggable: false,
        zIndex: 1
      });
    }

    // Calculate radially sorted coordinates for preview
    const sortedCoords = radiallySortCoordinates(drawingPointsRef.current);
    polygonRef.current.setPath(sortedCoords);
  }

  const handleMarkerDrag = (marker, index) => {
    const pos = marker.getPosition();
    drawingPointsRef.current[index] = { lat: pos.lat(), lng: pos.lng() };
    if (drawingPointsRef.current.length >= 3) {
      updatePreviewPolygon();
    }
  }

  const handleMarkerDragEnd = () => {
    if (drawingPointsRef.current.length < 3) return;
    // Sort and update state
    const sortedCoords = radiallySortCoordinates(drawingPointsRef.current);
    drawingPointsRef.current = sortedCoords;

    // Update markers positions based on sorted order
    markersRef.current.forEach((m, i) => {
      m.setPosition(sortedCoords[i]);
    });

    setCoordinates(sortedCoords.map(c => ({ latitude: c.lat, longitude: c.lng })));
  }

  const toggleDrawingMode = () => {
    const map = mapInstanceRef.current;
    if (!map || !window.google) return;

    if (isDrawing) {
      // Finish Drawing
      setIsDrawing(false);
      map.setOptions({ draggableCursor: null });

      // Remove map click listener
      if (mapClickListenerRef.current) {
        window.google.maps.event.removeListener(mapClickListenerRef.current);
        mapClickListenerRef.current = null;
      }

      // Clear custom drawing markers
      markersRef.current.forEach(m => m.setMap(null));
      markersRef.current = [];

      // Finalize polygon
      if (drawingPointsRef.current.length >= 3) {
        const sortedCoords = radiallySortCoordinates(drawingPointsRef.current);
        const mappedCoords = sortedCoords.map(c => ({ latitude: c.lat, longitude: c.lng }));
        setCoordinates(mappedCoords);
        drawExistingPolygon(window.google, map, mappedCoords);
      } else {
        // Not enough points, clear drawing
        if (polygonRef.current) {
          polygonRef.current.setMap(null);
          polygonRef.current = null;
        }
        setCoordinates([]);
      }
      drawingPointsRef.current = [];
    } else {
      // Start Drawing
      clearDrawing(); // Reset existing drawing
      setIsDrawing(true);
      map.setOptions({ draggableCursor: 'crosshair' });

      mapClickListenerRef.current = window.google.maps.event.addListener(map, 'click', (e) => {
        const latLng = { lat: e.latLng.lat(), lng: e.latLng.lng() };
        const newIndex = drawingPointsRef.current.length;
        drawingPointsRef.current.push(latLng);

        const marker = new window.google.maps.Marker({
          position: latLng,
          map: map,
          draggable: true,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#9333ea",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2
          },
          zIndex: 1000
        });

        window.google.maps.event.addListener(marker, 'drag', () => handleMarkerDrag(marker, newIndex));
        window.google.maps.event.addListener(marker, 'dragend', handleMarkerDragEnd);

        markersRef.current.push(marker);

        if (drawingPointsRef.current.length >= 3) {
          updatePreviewPolygon();
        }
      });
    }
  }

  const clearDrawing = () => {
    if (polygonRef.current) {
      polygonRef.current.setMap(null);
      polygonRef.current = null;
    }
    if (markersRef.current) {
      markersRef.current.forEach(marker => marker.setMap(null));
      markersRef.current = [];
    }
    if (pathMarkersRef.current) {
      pathMarkersRef.current.forEach(marker => marker.setMap(null));
      pathMarkersRef.current = [];
    }
    drawingPointsRef.current = [];
    setCoordinates([]);
  }

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.zoneName) {
      alert("Please enter a zone name")
      return
    }

    if (!formData.country) {
      alert("Please select a country")
      return
    }

    if (coordinates.length < 3) {
      alert("Please draw at least 3 points on the map to create a zone")
      return
    }

    try {
      setLoading(true)

      // Validate coordinates format
      if (!coordinates || coordinates.length < 3) {
        alert("Please draw at least 3 points on the map")
        setLoading(false)
        return
      }

      // Ensure coordinates have correct format
      const validCoordinates = coordinates.map(coord => {
        if (typeof coord === 'object' && coord.latitude !== undefined && coord.longitude !== undefined) {
          return {
            latitude: parseFloat(coord.latitude),
            longitude: parseFloat(coord.longitude)
          }
        }
        return coord
      })

      const zoneData = {
        name: formData.zoneName,
        zoneName: formData.zoneName,
        country: formData.country,
        unit: formData.unit || "kilometer",
        coordinates: validCoordinates,
        isActive: true
      }

      debugLog("Sending zone data:", zoneData)

      if (isEditMode && id) {
        // Update existing zone
        const response = await adminAPI.updateZone(id, zoneData)
        debugLog("Zone updated successfully:", response)
        alert("Zone updated successfully!")
      } else {
        // Create new zone
        const response = await adminAPI.createZone(zoneData)
        debugLog("Zone created successfully:", response)
        alert("Zone created successfully!")
      }
      navigate("/admin/food/zone-setup")
    } catch (error) {
      debugError("Error creating zone:", error)

      // Handle different types of errors
      let errorMessage = "Failed to create zone. Please try again."

      if (error.code === 'ERR_NETWORK' || error.message === 'Network Error' || !error.response) {
        // Network error - backend not running or CORS issue
        errorMessage = "Cannot connect to server. Please make sure the backend server is running."
        debugError("Network error: Backend server might not be running")
      } else if (error.response) {
        // API error with response
        errorMessage = error.response.data?.message ||
          error.response.data?.error ||
          error.message ||
          `Server error: ${error.response.status}`
        debugError("API error:", error.response.data)
        debugError("Error status:", error.response.status)
      } else {
        // Other errors
        errorMessage = error.message || errorMessage
      }

      alert(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="p-4 lg:p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate("/admin/food/zone-setup")}
            className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {isEditMode ? "Edit Zone" : "Add New Zone"}
              </h1>
              <p className="text-sm text-slate-600">
                {isEditMode ? "Update delivery zone for customer" : "Create a delivery zone for customer"}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Panel - Form */}
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Zone Details</h2>

                <div className="space-y-4">
                  {/* Country Selection */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Country <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.country}
                      onChange={(e) => handleInputChange("country", e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="India">India</option>
                    </select>
                  </div>

                  {/* Zone Name */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Create Zone name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.zoneName}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (/^[a-zA-Z0-9 ]*$/.test(val)) {
                          handleInputChange("zoneName", val);
                        }
                      }}
                      placeholder="Enter zone name"
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  {/* Select Unit */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Select Unit <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.unit}
                      onChange={(e) => handleInputChange("unit", e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="kilometer">Kilometers (km)</option>
                      <option value="miles">Miles (mi)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Panel - Map */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Draw Zone on Map</h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleDrawingMode}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${isDrawing
                        ? "bg-red-600 text-white hover:bg-red-700"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                      }`}
                  >
                    <Shapes className="w-4 h-4" />
                    <span>{isDrawing ? "Stop Drawing" : "Start Drawing"}</span>
                  </button>
                  {coordinates.length > 0 && (
                    <button
                      type="button"
                      onClick={clearDrawing}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
                    >
                      <X className="w-4 h-4" />
                      <span>Clear</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    ref={autocompleteInputRef}
                    type="text"
                    placeholder="Search location on map..."
                    value={locationSearch}
                    onChange={(e) => setLocationSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {coordinates.length > 0 && (
                  <p className="text-xs text-slate-600 mt-2">
                    Points drawn: <strong>{coordinates.length}</strong>
                    {coordinates.length < 3 && (
                      <span className="text-red-600 ml-2">(Minimum 3 points required)</span>
                    )}
                  </p>
                )}
              </div>

              <div className="relative" style={{ height: "600px" }}>
                <div ref={mapRef} className="w-full h-full rounded-lg" />

                {mapLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-100 rounded-lg">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                      <p className="text-slate-600">Loading map...</p>
                    </div>
                  </div>
                )}

                {!googleMapsApiKey && !mapLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-100 rounded-lg">
                    <div className="text-center p-6">
                      <MapPin className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                      <p className="text-sm text-slate-600">Google Maps API key not found</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={() => navigate("/admin/food/zone-setup")}
              className="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || coordinates.length < 3 || !formData.zoneName || !formData.country}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Zone</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


