/* ════════════════════════════════════════════════
   utils.js — Geolocation, distance, helpers
   ════════════════════════════════════════════════ */

/**
 * Calculate distance between two lat/lng points (Haversine formula)
 * Returns distance in miles
 */
export function distanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Format distance for display
 */
export function formatDistance(miles) {
  if (miles < 0.1) return `${Math.round(miles * 5280)} ft`;
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

/**
 * Get user's current geolocation (returns Promise)
 */
export function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => reject(err),
      { timeout: 10000, enableHighAccuracy: true, maximumAge: 60000 }
    );
  });
}

/**
 * Debounce utility
 */
export function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/**
 * Throttle utility
 */
export function throttle(fn, limit) {
  let lastCall = 0;
  return (...args) => {
    const now = Date.now();
    if (now - lastCall < limit) return;
    lastCall = now;
    return fn(...args);
  };
}

/**
 * LocalStorage helpers
 */
export const storage = {
  get(key, fallback = null) {
    try {
      const val = localStorage.getItem(key);
      return val ? JSON.parse(val) : fallback;
    } catch { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch {}
  }
};

/**
 * Get directions URL (smart: Apple Maps on iOS, Google Maps otherwise)
 */
export function getDirectionsUrl(lat, lng, name) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const encodedName = encodeURIComponent(name || 'Playground');
  if (isIOS) {
    return `maps://maps.apple.com/?daddr=${lat},${lng}&q=${encodedName}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=&travelmode=driving`;
}

/**
 * Add recent search to localStorage
 */
export function addRecentSearch(search) {
  const MAX = 5;
  const recents = storage.get('recentSearches', []);
  const filtered = recents.filter(r => r.display_name !== search.display_name);
  filtered.unshift(search);
  storage.set('recentSearches', filtered.slice(0, MAX));
}

/**
 * Get recent searches from localStorage
 */
export function getRecentSearches() {
  return storage.get('recentSearches', []);
}

/**
 * Clamp a value between min and max
 */
export function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

/**
 * Generate a cache key from a bounding box (rounded to 2 decimal places)
 */
export function bboxCacheKey(bounds) {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  return [
    sw.lat.toFixed(2), sw.lng.toFixed(2),
    ne.lat.toFixed(2), ne.lng.toFixed(2)
  ].join(',');
}
