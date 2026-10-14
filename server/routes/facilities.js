const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');

// Calculate Haversine distance in km
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round((R * c) * 10) / 10;
}

// Classify facility based on tags
function determineOperatorType(tags) {
  if (!tags) return 'unknown';
  const opType = (tags['operator:type'] || '').toLowerCase();
  const operator = (tags.operator || '').toLowerCase();
  const name = (tags.name || '').toLowerCase();

  if (
    opType === 'government' || opType === 'public' ||
    operator.includes('government') || operator.includes('govt') ||
    operator.includes('tamil nadu') || operator.includes('dph') ||
    name.includes('government') || name.includes('govt') ||
    name.includes('primary health centre') || name.includes('phc') ||
    name.includes('community health centre') || name.includes('chc') ||
    name.includes('sub-centre') || name.includes('uphc')
  ) {
    return 'government';
  }

  if (opType === 'private' || tags.fee === 'yes' || tags.health_facility_type === 'private') {
    return 'private';
  }

  return 'unknown';
}

// GET /api/facilities - Retrieve cached facilities with optional distance calculation
router.get('/', (req, res) => {
  try {
    const { lat, lng, type, operator, search } = req.query;

    let conditions = ['1=1'];
    let params = [];

    if (type && type !== 'all') {
      conditions.push('facility_type = ?');
      params.push(type);
    }

    if (operator && operator !== 'all') {
      conditions.push('operator_type = ?');
      params.push(operator);
    }

    if (search && search.trim()) {
      conditions.push('(name LIKE ? OR address LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }

    const whereClause = conditions.join(' AND ');
    const facilities = db.prepare(`SELECT * FROM facilities_cache WHERE ${whereClause} ORDER BY name ASC`).all(...params);

    // If lat & lng provided, add distance and sort by proximity
    let results = facilities;
    if (lat && lng) {
      const userLat = parseFloat(lat);
      const userLng = parseFloat(lng);
      if (!isNaN(userLat) && !isNaN(userLng)) {
        results = facilities.map(f => ({
          ...f,
          distance_km: calculateDistance(userLat, userLng, f.lat, f.lng)
        })).sort((a, b) => a.distance_km - b.distance_km);
      }
    }

    return res.json({
      facilities: results,
      count: results.length,
      is_cached: true,
      cached_notice: 'Facility data is retrieved from local cache and OpenStreetMap. Verify availability directly with the facility.'
    });
  } catch (err) {
    console.error('Error fetching facilities:', err);
    return res.status(500).json({ error: 'Failed to retrieve facility records.' });
  }
});

// GET /api/facilities/match - Match facilities based on service requirements and distance
router.get('/match', (req, res) => {
  try {
    const { service = 'general', lat = 9.9252, lng = 78.1198, max_distance = 25 } = req.query;
    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);
    const maxDist = parseFloat(max_distance) || 25;

    const allFacilities = db.prepare('SELECT * FROM facilities_cache').all();

    const scoredFacilities = allFacilities.map(fac => {
      const dist = calculateDistance(userLat, userLng, fac.lat, fac.lng);
      let matchScore = 0;
      let reasons = [];

      // Proximity score (0-40)
      if (dist <= 5) {
        matchScore += 40;
        reasons.push(`Within 5 km (${dist} km away)`);
      } else if (dist <= 15) {
        matchScore += 25;
        reasons.push(`Moderate distance (${dist} km away)`);
      } else if (dist <= maxDist) {
        matchScore += 10;
        reasons.push(`Accessible within ${dist} km`);
      }

      // Public / Government advantage (free care access)
      if (fac.operator_type === 'government') {
        matchScore += 20;
        reasons.push('Public healthcare facility (Free care & government scheme access)');
      }

      // Service specific matching
      const facName = (fac.name || '').toLowerCase();
      const facType = (fac.facility_type || '').toLowerCase();

      switch (service) {
        case 'emergency':
          if (fac.emergency_services === 1 || facName.includes('hospital') || facName.includes('medical college')) {
            matchScore += 35;
            reasons.push('24/7 Casualty / Emergency care capability recorded');
          } else {
            matchScore -= 20;
          }
          break;

        case 'maternal':
          if (facName.includes('phc') || facName.includes('chc') || facName.includes('medical college') || facName.includes('hospital')) {
            matchScore += 30;
            reasons.push('Standard maternal, child health and delivery support available');
          }
          break;

        case 'lab':
          if (facName.includes('hospital') || facName.includes('chc') || facName.includes('phc')) {
            matchScore += 25;
            reasons.push('Routine diagnostic tests and lab investigations available');
          }
          break;

        case 'specialist':
          if (facName.includes('medical college') || facName.includes('headquarters') || facType.includes('specialized') || facName.includes('rajaji') || facName.includes('apollo') || facName.includes('mission')) {
            matchScore += 35;
            reasons.push('Multispecialty doctors and advanced diagnostic equipment');
          }
          break;

        case 'general':
        default:
          if (facType === 'clinic' || facName.includes('phc') || facType === 'hospital') {
            matchScore += 25;
            reasons.push('Primary outpatient consultation and essential drug dispensary');
          }
          break;
      }

      return {
        ...fac,
        distance_km: dist,
        score: matchScore,
        match_reasons: reasons
      };
    })
    .filter(f => f.distance_km <= maxDist)
    .sort((a, b) => b.score - a.score);

    return res.json({
      service,
      user_coords: { lat: userLat, lng: userLng },
      matched_facilities: scoredFacilities.slice(0, 10),
      explanation: `Ranked by proximity to location, facility type suitability for ${service}, and public health subsidy tier.`,
      disclaimer: 'Facility capabilities are based on OpenStreetMap tags and administrative classifications. Verify specialty availability directly before travel.'
    });
  } catch (err) {
    console.error('Error matching facilities:', err);
    return res.status(500).json({ error: 'Failed to compute facility matches.' });
  }
});

// POST /api/facilities/fetch-overpass - Fetch live OpenStreetMap data for a location and cache in SQLite
router.post('/fetch-overpass', async (req, res) => {
  try {
    const { lat = 9.9252, lng = 78.1198, radius = 10000, query = 'Madurai' } = req.body;
    const centerLat = parseFloat(lat);
    const centerLng = parseFloat(lng);
    const radiusMeters = Math.min(25000, Math.max(2000, parseInt(radius, 10)));

    // Construct Overpass QL query around given center
    const overpassQuery = `
      [out:json][timeout:25];
      (
        node["amenity"~"hospital|clinic|doctors|health_centre"](around:${radiusMeters},${centerLat},${centerLng});
        way["amenity"~"hospital|clinic|doctors|health_centre"](around:${radiusMeters},${centerLat},${centerLng});
      );
      out center 40;
    `;

    const overpassUrl = process.env.OVERPASS_ENDPOINT || 'https://overpass-api.de/api/interpreter';

    const response = await fetch(overpassUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'HealthSaathi360/1.0 (Public Health Referral Platform)'
      },
      body: `data=${encodeURIComponent(overpassQuery)}`,
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      throw new Error(`Overpass API responded with HTTP status ${response.status}`);
    }

    const data = await response.json();
    const elements = data.elements || [];

    const insertOrReplace = db.prepare(`
      INSERT INTO facilities_cache (
        id, osm_id, name, lat, lng, facility_type, operator_type,
        address, phone, emergency_services, search_query, cached_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        lat = excluded.lat,
        lng = excluded.lng,
        facility_type = excluded.facility_type,
        operator_type = excluded.operator_type,
        address = excluded.address,
        phone = excluded.phone,
        emergency_services = excluded.emergency_services,
        search_query = excluded.search_query,
        cached_at = CURRENT_TIMESTAMP
    `);

    let cachedCount = 0;
    const facilitiesFound = [];

    const tx = db.transaction(() => {
      for (const el of elements) {
        const tags = el.tags || {};
        const name = tags.name || tags['name:en'] || tags['name:ta'];
        if (!name) continue; // Skip unnamed POIs

        const elLat = el.lat || (el.center && el.center.lat);
        const elLng = el.lon || (el.center && el.center.lon);
        if (!elLat || !elLng) continue;

        const facId = `FAC-OSM-${el.id}`;
        const osmId = `osm-${el.type}-${el.id}`;
        const facType = tags.amenity === 'hospital' ? 'hospital' : (tags.amenity === 'clinic' ? 'clinic' : 'doctors');
        const operatorType = determineOperatorType(tags);
        const address = [tags['addr:street'], tags['addr:suburb'], tags['addr:city'] || query].filter(Boolean).join(', ') || tags['addr:full'] || `${query} Area`;
        const phone = tags.phone || tags['contact:phone'] || '';
        const emergency = tags.emergency === 'yes' ? 1 : (facType === 'hospital' ? 1 : 0);

        insertOrReplace.run(
          facId,
          osmId,
          name,
          elLat,
          elLng,
          facType,
          operatorType,
          address,
          phone,
          emergency,
          query
        );

        facilitiesFound.push({
          id: facId,
          name,
          lat: elLat,
          lng: elLng,
          facility_type: facType,
          operator_type: operatorType,
          address,
          phone,
          emergency_services: emergency,
          distance_km: calculateDistance(centerLat, centerLng, elLat, elLng)
        });

        cachedCount++;
      }
    });

    tx();

    return res.json({
      message: `Successfully retrieved and cached ${cachedCount} healthcare facilities from OpenStreetMap.`,
      source: 'OpenStreetMap Overpass API',
      facilities: facilitiesFound.sort((a, b) => a.distance_km - b.distance_km),
      count: cachedCount
    });
  } catch (err) {
    console.warn('Overpass fetch failed or timed out. Falling back to local cached facilities:', err.message);
    // Graceful offline fallback: return existing cached facilities around the coordinates
    const fallbackFacilities = db.prepare('SELECT * FROM facilities_cache').all().map(f => ({
      ...f,
      distance_km: calculateDistance(parseFloat(req.body.lat || 9.9252), parseFloat(req.body.lng || 78.1198), f.lat, f.lng)
    })).sort((a, b) => a.distance_km - b.distance_km);

    return res.json({
      message: 'External OpenStreetMap query unavailable or offline. Served from verified local offline cache.',
      source: 'Local SQLite Cache (Offline fallback)',
      facilities: fallbackFacilities,
      count: fallbackFacilities.length,
      is_fallback: true
    });
  }
});

// GET /api/facilities/route - Calculate route using OpenStreetMap OSRM with offline fallback
router.get('/route', async (req, res) => {
  try {
    const { start_lat, start_lng, end_lat, end_lng } = req.query;
    const sLat = parseFloat(start_lat);
    const sLng = parseFloat(start_lng);
    const eLat = parseFloat(end_lat);
    const eLng = parseFloat(end_lng);

    if (isNaN(sLat) || isNaN(sLng) || isNaN(eLat) || isNaN(eLng)) {
      return res.status(400).json({ error: 'Valid start and end coordinates are required.' });
    }

    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${sLng},${sLat};${eLng},${eLat}?overview=full&geometries=geojson`;

    try {
      const response = await fetch(osrmUrl, {
        headers: { 'User-Agent': 'HealthSaathi360/1.0' },
        signal: AbortSignal.timeout(6000)
      });

      if (response.ok) {
        const data = await response.json();
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          const distKm = Math.round((route.distance / 1000) * 10) / 10;
          const durationMins = Math.max(1, Math.round(route.duration / 60));

          return res.json({
            code: 'Ok',
            source: 'OpenStreetMap OSRM',
            distance_km: distKm,
            duration_mins: durationMins,
            duration_text: `~${durationMins} mins by road`,
            geometry: route.geometry
          });
        }
      }
    } catch (netErr) {
      console.warn('[OSRM Route Warning] OSRM query failed or timed out:', netErr.message);
    }

    // Offline / Network Fallback: Generate direct line with Haversine distance
    const distKm = calculateDistance(sLat, sLng, eLat, eLng);
    const estimatedMins = Math.max(2, Math.round(distKm * 2.2)); // ~25-30 km/h average speed in rural/semi-urban areas

    return res.json({
      code: 'Fallback',
      source: 'Direct Geodesic Route (Offline Mode)',
      distance_km: distKm,
      duration_mins: estimatedMins,
      duration_text: `~${estimatedMins} mins estimated`,
      geometry: {
        type: 'LineString',
        coordinates: [
          [sLng, sLat],
          [(sLng + eLng) / 2, (sLat + eLat) / 2],
          [eLng, eLat]
        ]
      },
      is_fallback: true
    });
  } catch (err) {
    console.error('Routing calculation error:', err);
    return res.status(500).json({ error: 'Failed to compute route.' });
  }
});

module.exports = router;

