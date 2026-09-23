import re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Imports
    content = content.replace(
        'import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey"',
        'import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey"\nimport { radiallySortCoordinates } from "@food/utils/mapDrawingUtils"'
    )

    # 2. Refs
    content = content.replace(
        'const drawingManagerRef = useRef(null)\n  const polygonRef = useRef(null)\n  const markersRef = useRef([])\n  const pathMarkersRef = useRef([])',
        'const drawingManagerRef = useRef(null)\n  const polygonRef = useRef(null)\n  const markersRef = useRef([])\n  const pathMarkersRef = useRef([])\n  const drawingPointsRef = useRef([])\n  const mapClickListenerRef = useRef(null)'
    )

    # 3. initializeMap
    init_map_start = content.find('const initializeMap = (google) => {')
    init_map_end = content.find('  const drawExistingZonesOnMap =', init_map_start)
    
    new_init_map = '''const initializeMap = (google) => {
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

'''
    content = content[:init_map_start] + new_init_map + content[init_map_end:]

    # 4. updateCoordinatesFromPolygon and drawExistingPolygon
    draw_start = content.find('const updateCoordinatesFromPolygon =')
    draw_end = content.find('const toggleDrawingMode =', draw_start)
    
    new_draw_logic = '''const updateCoordinatesFromPolygon = (polygon) => {
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

  '''
    content = content[:draw_start] + new_draw_logic + content[draw_end:]

    # 5. toggleDrawingMode and clearDrawing
    toggle_start = content.find('const toggleDrawingMode =')
    toggle_end = content.find('const handleInputChange =', toggle_start)
    
    new_toggle_logic = '''const toggleDrawingMode = () => {
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

  '''
    content = content[:toggle_start] + new_toggle_logic + content[toggle_end:]

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

process_file(r'c:\Users\Abcom\Desktop\AppzetoProjects\OyeChotuu\Frontend\src\modules\quickCommerce\admin\pages\AddZone.jsx')
process_file(r'c:\Users\Abcom\Desktop\AppzetoProjects\OyeChotuu\Frontend\src\modules\Food\pages\admin\restaurant\AddZone.jsx')
