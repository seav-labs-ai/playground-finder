/* ════════════════════════════════════════════════
   data.js — Overpass API queries + data processing
   ════════════════════════════════════════════════ */

import { bboxCacheKey } from './utils.js';

// Equipment tag mapping: OSM tag value → display info
const EQUIPMENT_MAP = {
  swing:         { label: 'Swings',         icon: '🔵', key: 'swing' },
  slide:         { label: 'Slide',          icon: '🟠', key: 'slide' },
  climbingframe: { label: 'Climbing',       icon: '🟢', key: 'climbingframe' },
  sandpit:       { label: 'Sandbox',        icon: '🟡', key: 'sandpit' },
  seesaw:        { label: 'Seesaw',         icon: '🟣', key: 'seesaw' },
  structure:     { label: 'Structure',      icon: '⚪', key: 'structure' },
  springy:       { label: 'Spring Riders',  icon: '🟤', key: 'springy' },
  balance:       { label: 'Balance Beam',   icon: '🔴', key: 'balance' },
  roundabout:    { label: 'Roundabout',     icon: '🔵', key: 'roundabout' },
  zipwire:       { label: 'Zip Wire',       icon: '🟢', key: 'zipwire' },
  climbing_wall: { label: 'Climbing Wall',  icon: '🟢', key: 'climbing_wall' },
  horizontal_bar:{ label: 'Bars',           icon: '⚪', key: 'horizontal_bar' },
  basketball:    { label: 'Basketball',     icon: '🟠', key: 'basketball' },
};

// Surface tag mapping
const SURFACE_MAP = {
  grass:     { label: 'Grass',     icon: '🌿' },
  woodchips: { label: 'Woodchips', icon: '🪵' },
  wood_chips:{ label: 'Woodchips', icon: '🪵' },
  rubber:    { label: 'Rubber',    icon: '⚫' },
  sand:      { label: 'Sand',      icon: '🟤' },
  asphalt:   { label: 'Paved',     icon: '🔲' },
  paved:     { label: 'Paved',     icon: '🔲' },
  concrete:  { label: 'Concrete',  icon: '🔲' },
  compacted: { label: 'Compacted', icon: '🟫' },
  dirt:      { label: 'Dirt',      icon: '🟫' },
  bark:      { label: 'Bark',      icon: '🪵' },
  mulch:     { label: 'Mulch',     icon: '🪵' },
  gravel:    { label: 'Gravel',    icon: '🔘' },
};

// Simple in-memory cache keyed by bbox string
const _cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Build an Overpass API QL query for a bounding box.
 * Fetches playgrounds (nodes + ways) and nearby park info.
 */
function buildQuery(south, west, north, east) {
  const bbox = `${south},${west},${north},${east}`;
  return `
[out:json][timeout:25];
(
  node["leisure"="playground"](${bbox});
  way["leisure"="playground"](${bbox});
  node["leisure"="park"]["name"](${bbox});
  way["leisure"="park"]["name"](${bbox});
);
out body center qt;
  `.trim();
}

/**
 * Build a query to fetch equipment *nodes* within an expanded bbox
 */
function buildEquipmentQuery(south, west, north, east) {
  const bbox = `${south},${west},${north},${east}`;
  return `
[out:json][timeout:20];
node["playground"](${bbox});
out body qt;
  `.trim();
}

/**
 * Fetch playgrounds from Overpass API for a given Leaflet bounds object
 */
export async function fetchPlaygrounds(bounds) {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();

  const key = bboxCacheKey(bounds);
  const cached = _cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  const query = buildQuery(sw.lat, sw.lng, ne.lat, ne.lng);
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Overpass API error: ${res.status}`);

  const json = await res.json();
  const playgrounds = parseElements(json.elements);

  // Also fetch equipment data in the background to enrich
  enrichWithEquipment(playgrounds, sw.lat, sw.lng, ne.lat, ne.lng);

  _cache.set(key, { data: playgrounds, ts: Date.now() });
  return playgrounds;
}

/**
 * Fetch equipment nodes and attach them to matching playgrounds
 * This is best-effort — doesn't block the main results
 */
async function enrichWithEquipment(playgrounds, south, west, north, east) {
  if (playgrounds.length === 0) return;

  try {
    // Expand bbox slightly to catch equipment nodes inside playground areas
    const pad = 0.005;
    const query = buildEquipmentQuery(south - pad, west - pad, north + pad, east + pad);
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return;

    const json = await res.json();
    const equipNodes = json.elements || [];

    // First: convert all existing equipment arrays to Sets so we can merge with .add()
    for (const pg of playgrounds) {
      pg._equipSet = new Set(pg.equipment || []);
    }

    // For each equipment node, find the nearest playground within ~220m
    for (const node of equipNodes) {
      if (!node.tags?.playground) continue;
      const eqType = node.tags.playground;
      if (!EQUIPMENT_MAP[eqType]) continue;

      // Find closest playground
      let closest = null;
      let minDist = Infinity;
      for (const pg of playgrounds) {
        const dLat = pg.lat - node.lat;
        const dLng = pg.lng - node.lon;
        const dist = Math.sqrt(dLat * dLat + dLng * dLng);
        if (dist < minDist) { minDist = dist; closest = pg; }
      }

      // ~0.002 degrees ≈ 220m — generous to catch equipment inside large playground areas
      if (closest && minDist < 0.002) {
        closest._equipSet.add(eqType);
      }
    }

    // Convert Sets back to arrays and clean up temp property
    for (const pg of playgrounds) {
      if (pg._equipSet) {
        pg.equipment = Array.from(pg._equipSet);
        delete pg._equipSet;
      }
    }

  } catch (err) {
    // Silent fail — equipment enrichment is non-blocking
    console.debug('Equipment enrichment failed:', err.message);
    // Clean up temp sets if any
    for (const pg of playgrounds) {
      if (pg._equipSet) {
        pg.equipment = Array.from(pg._equipSet);
        delete pg._equipSet;
      }
    }
  }
}

/**
 * Parse OSM elements into our playground data model
 */
function parseElements(elements) {
  const results = [];
  const seen = new Set();

  for (const el of elements) {
    // Get lat/lng
    let lat, lng;
    if (el.type === 'node') {
      lat = el.lat;
      lng = el.lon;
    } else if (el.type === 'way' && el.center) {
      lat = el.center.lat;
      lng = el.center.lon;
    } else {
      continue;
    }

    // Deduplicate by coords rounded to 4 decimal places
    const dedupeKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const tags = el.tags || {};
    const leisure = tags.leisure;
    const isPlayground = leisure === 'playground';
    const isPark = leisure === 'park';

    // Parse equipment from tags
    const equipment = [];
    for (const [tagKey, tagVal] of Object.entries(tags)) {
      if (tagKey === 'playground' && EQUIPMENT_MAP[tagVal]) {
        equipment.push(tagVal);
      }
    }

    // Parse surface
    const rawSurface = tags.surface || tags.playground_surface || '';
    const surface = SURFACE_MAP[rawSurface?.toLowerCase()] || null;

    // Parse age
    const minAge = tags.min_age ? parseInt(tags.min_age) : null;
    const maxAge = tags.max_age ? parseInt(tags.max_age) : null;

    // Parse accessibility
    const wheelchair = tags.wheelchair;
    const accessible = wheelchair === 'yes' || wheelchair === 'designated';

    // Parse hours
    const hours = tags.opening_hours || null;

    // Determine name
    const name = tags.name || tags['name:en'] || (isPlayground ? 'Unnamed Playground' : 'Unnamed Park');

    results.push({
      id: `${el.type}-${el.id}`,
      osmId: el.id,
      osmType: el.type,
      lat,
      lng,
      name,
      isPlayground,
      isPark,
      equipment,           // array of equipment tags
      surface,             // { label, icon } or null
      rawSurface,
      minAge,
      maxAge,
      accessible,
      wheelchair,
      hours,
      tags,               // raw tags for reference
      distance: null,     // populated later
    });
  }

  return results.filter(p => p.isPlayground || (p.isPark && p.name));
}

/**
 * Get display info for equipment type
 */
export function getEquipmentInfo(key) {
  return EQUIPMENT_MAP[key] || { label: key, icon: '⚪', key };
}

/**
 * Get all equipment display info for a playground
 */
export function getEquipmentList(playground) {
  if (!playground.equipment?.length) return [];
  return playground.equipment.map(eq => EQUIPMENT_MAP[eq] || { label: eq, icon: '⚪', key: eq });
}

/**
 * Get surface display info for a playground
 */
export function getSurfaceInfo(playground) {
  return playground.surface || null;
}

/**
 * Format age range for display
 */
export function formatAgeRange(minAge, maxAge) {
  if (minAge !== null && maxAge !== null) return `Ages ${minAge}–${maxAge}`;
  if (minAge !== null) return `Ages ${minAge}+`;
  if (maxAge !== null) return `Up to age ${maxAge}`;
  return null;
}

/**
 * Geocode a text query using Nominatim (OSM geocoding)
 */
export async function geocodeSearch(query) {
  const url = `https://nominatim.openstreetmap.org/search?` +
    new URLSearchParams({
      q: query,
      format: 'json',
      limit: '6',
      countrycodes: 'us',
      'accept-language': 'en',
      addressdetails: '1',
    });

  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'PlaygroundFinder/1.0' },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error('Geocoding failed');
  return res.json();
}

/**
 * Get a short display label from a Nominatim result
 */
export function getLocationLabel(result) {
  const addr = result.address || {};
  const parts = [];

  if (addr.suburb || addr.neighbourhood) parts.push(addr.suburb || addr.neighbourhood);
  if (addr.city || addr.town || addr.village) parts.push(addr.city || addr.town || addr.village);
  if (addr.state) parts.push(addr.state);

  return parts.join(', ') || result.display_name?.split(',').slice(0, 2).join(',') || 'Unknown';
}
