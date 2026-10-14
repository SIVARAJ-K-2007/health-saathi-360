// Health Saathi 360 - Interactive Hospital Map, Route Geometry & Facility Discovery (Leaflet + OpenStreetMap)

let mapInstance = null;
let markersLayer = null;
let routeLayer = null;
let routeMarkersLayer = null;
let currentCenter = [9.9252, 78.1198]; // Default Madurai, Tamil Nadu
let currentOriginName = 'Madurai City Center';
let currentFacilities = [];
let activeFilters = {
  type: 'all',
  operator: 'all',
  search: ''
};

// Known coordinates for quick locality selection in Madurai & surrounding rural blocks
const LOCALITY_PRESETS = {
  'Madurai': [9.9252, 78.1198],
  'Alanganallur': [10.0462, 78.0827],
  'Samayanallur': [9.9984, 78.0465],
  'Vadipatti': [10.0573, 77.9620],
  'Melur': [10.0336, 78.3378],
  'Usilampatti': [9.9702, 77.7952],
  'Tirumangalam': [9.8236, 77.9864],
  'Sholavandan': [10.0215, 78.0125]
};

function initHospitalMap(containerId = 'leaflet-map') {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Cleanup existing map if any
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }

  // Setup Leaflet default icon paths to local offline assets
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: '/assets/images/marker-icon-2x.png',
    iconUrl: '/assets/images/marker-icon.png',
    shadowUrl: '/assets/images/marker-shadow.png'
  });

  // Initialize map centered at Madurai
  mapInstance = L.map(containerId, {
    center: currentCenter,
    zoom: 12,
    zoomControl: true
  });

  // OpenStreetMap tile layer with required attribution
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors | OSRM Routing'
  }).addTo(mapInstance);

  markersLayer = L.layerGroup().addTo(mapInstance);
  routeLayer = L.layerGroup().addTo(mapInstance);
  routeMarkersLayer = L.layerGroup().addTo(mapInstance);

  // Load facilities for the initial default view
  loadFacilitiesForLocation(currentCenter[0], currentCenter[1], 'Madurai');
}

// Custom markers for Government vs Private
function createCustomMarkerIcon(operatorType, isEmergency) {
  const isGov = operatorType === 'government';
  const color = isGov ? '#2E7D6A' : '#1976D2';
  const badgeColor = isEmergency ? '#C62828' : '#F57C00';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="32" height="42">
      <path d="M16 0C7.16 0 0 7.16 0 16c0 10.8 14.5 24.8 15.1 25.4.5.5 1.3.5 1.8 0C17.5 40.8 32 26.8 32 16 32 7.16 24.8 0 16 0z" fill="${color}" stroke="#ffffff" stroke-width="2"/>
      <circle cx="16" cy="15" r="8" fill="#ffffff"/>
      <path d="M14 9h4v4h4v4h-4v4h-4v-4h-4v-4h4z" fill="${color}"/>
      ${isEmergency ? `<circle cx="24" cy="6" r="4" fill="${badgeColor}" stroke="#ffffff" stroke-width="1.5"/>` : ''}
    </svg>
  `;

  return L.divIcon({
    className: 'custom-map-pin',
    html: svg,
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -38]
  });
}

function createRouteStartIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28">
      <circle cx="14" cy="14" r="12" fill="#D97706" stroke="#ffffff" stroke-width="3"/>
      <circle cx="14" cy="14" r="5" fill="#ffffff"/>
    </svg>
  `;
  return L.divIcon({
    className: 'custom-start-pin',
    html: svg,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
}

// Fetch facilities from backend (which queries Overpass or serves SQLite cache)
async function loadFacilitiesForLocation(lat, lng, localityName = 'Madurai') {
  currentCenter = [lat, lng];
  currentOriginName = localityName;
  clearActiveRoute(); // Clear any existing route when center changes

  const listEl = document.getElementById('facility-cards-container');
  const cacheNoticeEl = document.getElementById('map-cache-status-notice');

  if (listEl) {
    listEl.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Searching verified public health facilities near ${localityName}...</p>
      </div>
    `;
  }

  try {
    let result;
    // If online, fetch or refresh Overpass facilities
    if (navigator.onLine) {
      result = await api.fetchOverpassFacilities(lat, lng, 12000, localityName);
    } else {
      // Offline: read from local SQLite / IndexedDB cache
      result = await api.getFacilities({ lat, lng });
    }

    currentFacilities = result.facilities || [];

    if (cacheNoticeEl) {
      if (result.is_fallback || !navigator.onLine) {
        cacheNoticeEl.style.display = 'block';
        cacheNoticeEl.className = 'cache-alert warning';
        cacheNoticeEl.innerHTML = `
          <strong>${t('cached_data_badge')}:</strong> ${t('osm_disclaimer')}
        `;
      } else {
        cacheNoticeEl.style.display = 'block';
        cacheNoticeEl.className = 'cache-alert info';
        cacheNoticeEl.innerHTML = `
          <span>Showing ${currentFacilities.length} real healthcare facilities retrieved via OpenStreetMap Overpass.</span>
        `;
      }
    }

    renderFilteredFacilities();

    // Center map view on query coordinates
    if (mapInstance) {
      mapInstance.setView(currentCenter, 12);
    }
  } catch (err) {
    console.error('Error loading facilities:', err);
    if (listEl) {
      listEl.innerHTML = `
        <div class="empty-state">
          <p>Unable to retrieve live facility data.</p>
          <button class="btn btn-primary" onclick="loadFacilitiesForLocation(${lat}, ${lng}, '${localityName}')">Retry Search</button>
        </div>
      `;
    }
  }
}

// Render markers and cards based on active filter criteria
function renderFilteredFacilities() {
  if (!markersLayer) return;
  markersLayer.clearLayers();

  const listContainer = document.getElementById('facility-cards-container');
  const countEl = document.getElementById('facilities-count-label');

  const filtered = currentFacilities.filter(f => {
    // Type filter
    if (activeFilters.type !== 'all') {
      if (activeFilters.type === 'hospital' && f.facility_type !== 'hospital') return false;
      if (activeFilters.type === 'clinic' && f.facility_type !== 'clinic') return false;
      if (activeFilters.type === 'doctors' && f.facility_type !== 'doctors') return false;
    }

    // Operator filter
    if (activeFilters.operator !== 'all') {
      if (activeFilters.operator === 'government' && f.operator_type !== 'government') return false;
      if (activeFilters.operator === 'private' && f.operator_type !== 'private') return false;
    }

    // Text search filter
    if (activeFilters.search) {
      const q = activeFilters.search.toLowerCase();
      const matchName = (f.name || '').toLowerCase().includes(q);
      const matchAddr = (f.address || '').toLowerCase().includes(q);
      if (!matchName && !matchAddr) return false;
    }

    return true;
  });

  if (countEl) {
    countEl.textContent = `${filtered.length} facilities found`;
  }

  if (filtered.length === 0) {
    if (listContainer) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <p>${t('no_facilities_found')}</p>
        </div>
      `;
    }
    return;
  }

  // Populate map markers
  filtered.forEach(fac => {
    const isGov = fac.operator_type === 'government';
    const isEmergency = fac.emergency_services === 1;
    const icon = createCustomMarkerIcon(fac.operator_type, isEmergency);

    const marker = L.marker([fac.lat, fac.lng], { icon }).addTo(markersLayer);

    const gMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${fac.lat},${fac.lng}`;
    const osmUrl = `https://www.openstreetmap.org/directions?from=&to=${fac.lat}%2C${fac.lng}`;

    const popupHtml = `
      <div class="map-popup-card">
        <div class="popup-header">
          <span class="badge ${isGov ? 'badge-gov' : 'badge-private'}">${isGov ? 'Government (Free)' : 'Private'}</span>
          ${isEmergency ? '<span class="badge badge-emergency">24x7 Casualty</span>' : ''}
        </div>
        <h4 class="popup-title">${escapeHTML(fac.name)}</h4>
        <p class="popup-address">${escapeHTML(fac.address || 'Address recorded on OpenStreetMap')}</p>
        ${fac.distance_km !== undefined ? `<p class="popup-distance">📍 <strong>${fac.distance_km} km</strong> away</p>` : ''}
        ${fac.phone ? `<p class="popup-phone">📞 <a href="tel:${fac.phone}">${escapeHTML(fac.phone)}</a></p>` : ''}
        
        <div class="popup-route-btn-row" style="margin: 10px 0 6px;">
          <button class="btn btn-sm btn-primary" style="width: 100%;" onclick="showRouteOnMap(${fac.lat}, ${fac.lng}, '${escapeHTML(fac.name)}')">
            🚗 Show Route on Map
          </button>
        </div>

        <div class="popup-actions" style="display: flex; gap: 6px; flex-wrap: wrap;">
          <button class="btn btn-xs btn-outline" onclick="selectFacilityForReferral('${escapeHTML(fac.id)}', '${escapeHTML(fac.name)}')">
            + ${t('btn_select_for_referral')}
          </button>
          <a href="${gMapsUrl}" target="_blank" rel="noopener" class="btn btn-xs btn-outline">
            Google Maps
          </a>
          <a href="${osmUrl}" target="_blank" rel="noopener" class="btn btn-xs btn-outline">
            OSM Direct
          </a>
        </div>
      </div>
    `;

    marker.bindPopup(popupHtml);
  });

  // Populate facility cards list
  if (listContainer) {
    listContainer.innerHTML = filtered.map(fac => {
      const isGov = fac.operator_type === 'government';
      const isEmergency = fac.emergency_services === 1;
      const gMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${fac.lat},${fac.lng}`;

      return `
        <div class="facility-card" data-fac-id="${fac.id}" onclick="panToFacility(${fac.lat}, ${fac.lng})">
          <div class="card-header">
            <span class="badge ${isGov ? 'badge-gov' : 'badge-private'}">
              ${isGov ? 'Government / Public' : 'Private'}
            </span>
            ${isEmergency ? '<span class="badge badge-emergency">24/7 Casualty</span>' : ''}
            ${fac.distance_km !== undefined ? `<span class="distance-pill">${fac.distance_km} km</span>` : ''}
          </div>
          <h4 class="card-facility-name">${escapeHTML(fac.name)}</h4>
          <p class="card-facility-address">${escapeHTML(fac.address || 'Locality recorded on map')}</p>
          ${fac.phone ? `<p class="card-phone">📞 ${escapeHTML(fac.phone)}</p>` : ''}
          
          <div class="card-footer-buttons" style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px;">
            <button class="btn btn-xs btn-primary" onclick="event.stopPropagation(); showRouteOnMap(${fac.lat}, ${fac.lng}, '${escapeHTML(fac.name)}')">
              🚗 Show Route
            </button>
            <button class="btn btn-xs btn-outline" onclick="event.stopPropagation(); selectFacilityForReferral('${escapeHTML(fac.id)}', '${escapeHTML(fac.name)}')">
              + Refer
            </button>
            <a href="${gMapsUrl}" target="_blank" rel="noopener" class="btn btn-xs btn-outline" onclick="event.stopPropagation()">
              External
            </a>
          </div>
        </div>
      `;
    }).join('');
  }
}

// IN-WEBSITE ROUTE CALCULATION & POLYLINE RENDERING
async function showRouteOnMap(destLat, destLng, destName) {
  if (!mapInstance) return;

  const startLat = currentCenter[0];
  const startLng = currentCenter[1];

  // Show loading indicator
  const routePanel = document.getElementById('map-route-panel');
  if (routePanel) {
    routePanel.style.display = 'block';
    routePanel.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px; font-size: 0.88rem;">
        <div class="spinner" style="width: 18px; height: 18px;"></div>
        <span>Calculating road route via OpenStreetMap (OSRM)...</span>
      </div>
    `;
  }

  try {
    const routeData = await api.getRoute(startLat, startLng, destLat, destLng);
    
    // Clear previous route
    if (routeLayer) routeLayer.clearLayers();
    if (routeMarkersLayer) routeMarkersLayer.clearLayers();

    // 1. Draw Casing (dark border line for visual pop and high visibility)
    const casing = L.geoJSON(routeData.geometry, {
      style: {
        color: '#133E32',
        weight: 8,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      }
    });

    // 2. Draw Main Route Polyline (Healthcare Teal)
    const polyline = L.geoJSON(routeData.geometry, {
      style: {
        color: '#2E7D6A',
        weight: 5,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round'
      }
    });

    casing.addTo(routeLayer);
    polyline.addTo(routeLayer);

    // 3. Add Origin Start Pin
    const startMarker = L.marker([startLat, startLng], {
      icon: createRouteStartIcon()
    }).addTo(routeMarkersLayer);
    startMarker.bindPopup(`<strong>Starting Point</strong><br>${escapeHTML(currentOriginName)}`).openPopup();

    // 4. Zoom to fit the entire route
    const bounds = polyline.getBounds();
    mapInstance.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });

    // 5. Update floating Route Info Panel
    if (routePanel) {
      const gMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}`;
      const osmUrl = `https://www.openstreetmap.org/directions?from=&to=${destLat}%2C${destLng}`;

      routePanel.style.display = 'block';
      routePanel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <span class="badge badge-gov">🚗 Driving Route Active</span>
              <span style="font-size: 0.72rem; color: var(--text-muted);">${routeData.source}</span>
            </div>
            <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-main);">
              ${routeData.distance_km} km &bull; ${routeData.duration_text}
            </div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
              <strong>From:</strong> ${escapeHTML(currentOriginName)} &rarr; <strong>To:</strong> ${escapeHTML(destName)}
            </div>
          </div>
          <button class="btn btn-xs btn-outline" onclick="clearActiveRoute()" title="Close route view" style="border-radius: 50%; width: 24px; height: 24px; padding: 0;">
            ✕
          </button>
        </div>

        <div style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap;">
          <button class="btn btn-xs btn-primary" onclick="selectFacilityForReferral('FAC-SEL', '${escapeHTML(destName)}')">
            + Refer Patient Here
          </button>
          <a href="${gMapsUrl}" target="_blank" rel="noopener" class="btn btn-xs btn-outline">
            Open in Google Maps
          </a>
          <a href="${osmUrl}" target="_blank" rel="noopener" class="btn btn-xs btn-outline">
            Open in OSM
          </a>
        </div>
      `;
    }
  } catch (err) {
    console.error('Route error:', err);
    if (routePanel) {
      routePanel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: var(--status-missed); font-size: 0.85rem;">Unable to compute road route. Using direct view.</span>
          <button class="btn btn-xs btn-outline" onclick="clearActiveRoute()">✕</button>
        </div>
      `;
    }
  }
}

function clearActiveRoute() {
  if (routeLayer) routeLayer.clearLayers();
  if (routeMarkersLayer) routeMarkersLayer.clearLayers();
  const routePanel = document.getElementById('map-route-panel');
  if (routePanel) routePanel.style.display = 'none';
}

function panToFacility(lat, lng) {
  if (mapInstance) {
    mapInstance.flyTo([lat, lng], 15, { duration: 1 });
  }
}

// User location with consent
function requestUserGeolocation() {
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser.');
    return;
  }

  const btn = document.getElementById('btn-gps-locate');
  if (btn) btn.classList.add('loading');

  navigator.geolocation.getCurrentPosition(
    (position) => {
      if (btn) btn.classList.remove('loading');
      const userLat = position.coords.latitude;
      const userLng = position.coords.longitude;
      loadFacilitiesForLocation(userLat, userLng, 'Your Current Location');
    },
    (error) => {
      if (btn) btn.classList.remove('loading');
      console.warn('Geolocation error:', error.message);
      alert('Unable to retrieve your location. Please check browser location permissions or choose a town from the list.');
    },
    { timeout: 10000, enableHighAccuracy: false }
  );
}

// Helper to escape HTML safely
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
