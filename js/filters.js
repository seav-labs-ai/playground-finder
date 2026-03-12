/* ════════════════════════════════════════════════
   filters.js — Filter & sort logic
   ════════════════════════════════════════════════ */

import { distanceMiles } from './utils.js';

/**
 * Default active filters state
 */
export function defaultFilters() {
  return {
    equipment: [],   // array of OSM equipment tag values
    age: 'all',      // 'all' | 'toddler' | 'kids' | 'older'
    surfaces: [],    // array of surface tag values
    accessible: false,
    inPark: false,
  };
}

/**
 * Read the current filter values from the DOM
 */
export function readFiltersFromDOM() {
  const filters = defaultFilters();

  // Equipment checkboxes
  document.querySelectorAll('input[name="equipment"]:checked').forEach(el => {
    filters.equipment.push(el.value);
  });

  // Age radio
  const ageChecked = document.querySelector('input[name="age"]:checked');
  filters.age = ageChecked?.value || 'all';

  // Surface checkboxes
  document.querySelectorAll('input[name="surface"]:checked').forEach(el => {
    filters.surfaces.push(el.value);
  });

  // Toggles
  filters.accessible = document.getElementById('f-accessible')?.checked || false;
  filters.inPark = document.getElementById('f-in-park')?.checked || false;

  return filters;
}

/**
 * Reset all filter inputs to defaults
 */
export function resetFiltersInDOM() {
  document.querySelectorAll('input[name="equipment"]').forEach(el => el.checked = false);
  document.querySelectorAll('input[name="surface"]').forEach(el => el.checked = false);

  const ageAll = document.getElementById('f-age-all');
  if (ageAll) ageAll.checked = true;

  const accessible = document.getElementById('f-accessible');
  if (accessible) accessible.checked = false;

  const inPark = document.getElementById('f-in-park');
  if (inPark) inPark.checked = false;
}

/**
 * Count how many active filter constraints exist
 */
export function countActiveFilters(filters) {
  let count = 0;
  if (filters.equipment.length > 0) count += 1;
  if (filters.age !== 'all') count += 1;
  if (filters.surfaces.length > 0) count += 1;
  if (filters.accessible) count += 1;
  if (filters.inPark) count += 1;
  return count;
}

/**
 * Check if a playground matches the age filter
 */
function matchesAge(pg, ageFilter) {
  if (ageFilter === 'all') return true;

  const ranges = {
    toddler: { min: 0, max: 3 },
    kids:    { min: 3, max: 8 },
    older:   { min: 8, max: 12 },
  };

  const range = ranges[ageFilter];
  if (!range) return true;

  // If the playground has age data, check overlap
  if (pg.minAge !== null || pg.maxAge !== null) {
    const pgMin = pg.minAge ?? 0;
    const pgMax = pg.maxAge ?? 99;
    // Overlapping ranges
    return pgMin <= range.max && pgMax >= range.min;
  }

  // No age data — include it (don't exclude what we don't know)
  return true;
}

/**
 * Check if a playground matches equipment filter
 * Returns true if the playground has at least one of the requested equipment types
 */
function matchesEquipment(pg, equipmentFilter) {
  if (equipmentFilter.length === 0) return true;
  if (!pg.equipment?.length) return false;
  return equipmentFilter.some(eq => pg.equipment.includes(eq));
}

/**
 * Check if a playground matches surface filter
 */
function matchesSurface(pg, surfacesFilter) {
  if (surfacesFilter.length === 0) return true;
  if (!pg.rawSurface) return false;
  return surfacesFilter.includes(pg.rawSurface.toLowerCase());
}

/**
 * Apply filters to a list of playgrounds
 * Returns filtered list
 */
export function applyFilters(playgrounds, filters) {
  return playgrounds.filter(pg => {
    if (!matchesAge(pg, filters.age)) return false;
    if (!matchesEquipment(pg, filters.equipment)) return false;
    if (!matchesSurface(pg, filters.surfaces)) return false;
    if (filters.accessible && !pg.accessible) return false;
    if (filters.inPark && !pg.isPark) return false;
    return true;
  });
}

/**
 * Sort playgrounds
 * sortBy: 'distance' | 'name' | 'equipment'
 */
export function sortPlaygrounds(playgrounds, sortBy, userLocation) {
  const sorted = [...playgrounds];

  switch (sortBy) {
    case 'name':
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;

    case 'equipment':
      sorted.sort((a, b) => (b.equipment?.length || 0) - (a.equipment?.length || 0));
      break;

    case 'distance':
    default:
      if (userLocation) {
        sorted.sort((a, b) => {
          const da = distanceMiles(userLocation.lat, userLocation.lng, a.lat, a.lng);
          const db = distanceMiles(userLocation.lat, userLocation.lng, b.lat, b.lng);
          return da - db;
        });
      }
      break;
  }

  return sorted;
}

/**
 * Calculate distances for all playgrounds based on user location
 */
export function calculateDistances(playgrounds, userLocation) {
  if (!userLocation) return playgrounds;
  return playgrounds.map(pg => ({
    ...pg,
    distance: distanceMiles(userLocation.lat, userLocation.lng, pg.lat, pg.lng),
  }));
}
