/* ════════════════════════════════════════════════
   app.js — Main application bootstrap + orchestration
   ════════════════════════════════════════════════ */

import {
  initMap, renderMarkers, setUserLocation, flyTo,
  getMapBounds, getUserLocationOnMap, panToPlayground,
  filterMarkers, deselectAllMarkers, getZoom,
} from './map.js';

import { fetchPlaygrounds, geocodeSearch, getLocationLabel } from './data.js';

import {
  defaultFilters, readFiltersFromDOM, resetFiltersInDOM,
  countActiveFilters, applyFilters, sortPlaygrounds, calculateDistances,
} from './filters.js';

import {
  initBottomSheet, setSheetState, getSheetState,
  initCards, renderCards, showCardsLoading, showCardsError,
  showDetail, hideDetail,
  showFilterPanel, hideFilterPanel, updateFilterBadge,
  initSearch, openSearchDropdown, closeSearchDropdown,
  toggleSearchClear, showSearchLoading, renderSearchResults,
  renderRecentSearches, showExploreBtn, hideExploreBtn,
  showMapLoading, hideMapLoading, showToast, highlightCard,
  showResultsPill,
} from './ui.js';

import {
  getUserLocation, debounce, storage,
  addRecentSearch, getRecentSearches,
} from './utils.js';

/* ─── State ─────────────────────────────────────── */
let _allPlaygrounds  = [];
let _filteredPlaygrounds = [];
let _activeFilters   = defaultFilters();
let _activeSortBy    = 'distance';
let _hasFetched      = false;
let _isLoading       = false;
let _mapMovedByUser  = false;
let _searchQuery     = '';
let _lastLocation    = null; // { lat, lng } used for current context

/* ─── Init ───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Expose global for popup button callbacks
  window._pgShowDetail = showDetailById;

  initBottomSheet();
  initCards(handleCardClick);
  initSearch(handleSearchSelect);
  bindEvents();
  initMapAndLoad();
});

/* ─── Map initialization ─────────────────────────── */
async function initMapAndLoad() {
  initMap('map', {
    onPlaygroundClick: handleMarkerClick,
    onMapMoved: handleMapMoved,
  });

  // Try to get user location immediately
  showMapLoading();
  try {
    const loc = await getUserLocation();
    _lastLocation = loc;
    setUserLocation(loc.lat, loc.lng);
    flyTo(loc.lat, loc.lng, 14);
    await loadPlaygrounds();
    showToast('📍 Showing playgrounds near you');
  } catch (err) {
    // Fall back to DC
    hideMapLoading();
    await loadPlaygrounds();

    if (err.code === 1) {
      // Permission denied
      showToast('📍 Showing Washington DC area');
    }
  }
}

/* ─── Data Loading ───────────────────────────────── */
async function loadPlaygrounds() {
  if (_isLoading) return;
  _isLoading = true;

  const bounds = getMapBounds();
  if (!bounds) { _isLoading = false; return; }

  showCardsLoading();
  showMapLoading();
  hideExploreBtn();

  try {
    const raw = await fetchPlaygrounds(bounds);

    _allPlaygrounds = calculateDistances(raw, _lastLocation || getUserLocationOnMap());
    _hasFetched = true;

    applyFiltersAndRender();
    hideMapLoading();
    _mapMovedByUser = false;

    const count = _filteredPlaygrounds.length;
    if (count > 0) {
      updateSheetSubtitle(count);
    }

  } catch (err) {
    console.error('Failed to load playgrounds:', err);
    hideMapLoading();
    showCardsError();
    showToast('⚠️ Couldn\'t load playgrounds. Try again.', null);
  } finally {
    _isLoading = false;
  }
}

function updateSheetSubtitle(count) {
  const subtitle = document.getElementById('sheet-subtitle');
  if (!subtitle) return;
  const loc = _lastLocation || getUserLocationOnMap();
  subtitle.textContent = loc ? 'Sorted by distance' : 'In this area';
}

/* ─── Filter + Render ────────────────────────────── */
function applyFiltersAndRender() {
  const userLoc = _lastLocation || getUserLocationOnMap();

  // Apply filters
  _filteredPlaygrounds = applyFilters(_allPlaygrounds, _activeFilters);

  // Sort
  _filteredPlaygrounds = sortPlaygrounds(_filteredPlaygrounds, _activeSortBy, userLoc);

  // Render markers for all loaded (not just filtered)
  renderMarkers(_allPlaygrounds, userLoc);

  // Show/hide markers based on filter
  if (countActiveFilters(_activeFilters) > 0) {
    filterMarkers(_filteredPlaygrounds.map(p => p.id));
  } else {
    filterMarkers(null); // show all
  }

  // Render cards (filtered + sorted)
  renderCards(_filteredPlaygrounds, userLoc);

  // Update filter badge
  updateFilterBadge(countActiveFilters(_activeFilters));
}

/* ─── Event Bindings ─────────────────────────────── */
function bindEvents() {
  // ── Locate me (FAB) ──
  document.getElementById('locate-btn')?.addEventListener('click', handleLocate);

  // ── Filter FAB ──
  document.getElementById('filter-btn')?.addEventListener('click', () => showFilterPanel());

  // ── Filter panel controls ──
  document.getElementById('filter-overlay')?.addEventListener('click', () => hideFilterPanel());
  document.getElementById('filter-close-btn')?.addEventListener('click', () => hideFilterPanel());
  document.getElementById('filter-reset-btn')?.addEventListener('click', handleFilterReset);
  document.getElementById('filter-apply-btn')?.addEventListener('click', handleFilterApply);

  // ── Explore this area ──
  document.getElementById('explore-btn')?.addEventListener('click', () => {
    hideExploreBtn();
    loadPlaygrounds();
  });

  // ── Detail view back ──
  document.getElementById('detail-back-btn')?.addEventListener('click', () => {
    hideDetail();
    deselectAllMarkers();
    setSheetState('half');
  });

  // ── Retry button ──
  document.getElementById('retry-btn')?.addEventListener('click', loadPlaygrounds);

  // ── Clear filters (empty state) ──
  document.getElementById('clear-filters-empty')?.addEventListener('click', () => {
    handleFilterReset();
    handleFilterApply();
  });

  // ── Sort buttons ──
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _activeSortBy = btn.dataset.sort;
      applyFiltersAndRender();
    });
  });

  // ── Search ──
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  const useMyLocation = document.getElementById('use-my-location');

  searchInput?.addEventListener('focus', () => {
    openSearchDropdown();
    renderRecentSearches(getRecentSearches());
    if (!searchInput.value.trim()) {
      document.getElementById('search-results-section')?.classList.add('hidden');
      document.getElementById('search-no-results')?.classList.add('hidden');
    }
  });

  searchInput?.addEventListener('input', () => {
    const q = searchInput.value.trim();
    _searchQuery = q;
    toggleSearchClear(q.length > 0);
    if (q.length > 1) {
      debouncedSearch(q);
    } else {
      document.getElementById('search-results-section')?.classList.add('hidden');
      document.getElementById('search-no-results')?.classList.add('hidden');
      document.getElementById('search-loading')?.classList.add('hidden');
      renderRecentSearches(getRecentSearches());
    }
  });

  searchClear?.addEventListener('click', () => {
    searchInput.value = '';
    _searchQuery = '';
    toggleSearchClear(false);
    closeSearchDropdown();
    searchInput.blur();
    document.getElementById('search-results-section')?.classList.add('hidden');
  });

  useMyLocation?.addEventListener('click', () => {
    closeSearchDropdown();
    searchInput.value = '';
    toggleSearchClear(false);
    handleLocate();
  });

  // Close dropdown when tapping outside
  document.addEventListener('click', (e) => {
    const container = document.getElementById('search-container');
    if (container && !container.contains(e.target)) {
      closeSearchDropdown();
    }
  });

  // Close search on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSearchDropdown();
      hideDetail();
      hideFilterPanel();
    }
  });

  // Bottom sheet — scroll up when tapping cards in peek state
  document.getElementById('sheet-content')?.addEventListener('touchstart', () => {
    if (getSheetState() === 'peek') {
      setSheetState('half');
    }
  }, { passive: true });

  // Handle shared URL params on load
  handleURLParams();
}

/* ─── Debounced search ───────────────────────────── */
const debouncedSearch = debounce(async (query) => {
  if (!query || query.length < 2) return;
  showSearchLoading(true);
  try {
    const results = await geocodeSearch(query);
    if (_searchQuery === query) { // Still current query
      renderSearchResults(results);
    }
  } catch (err) {
    renderSearchResults([]);
  }
}, 400);

/* ─── Handlers ───────────────────────────────────── */
async function handleLocate() {
  showToast('Finding your location…', '📍');
  try {
    const loc = await getUserLocation();
    _lastLocation = loc;
    setUserLocation(loc.lat, loc.lng);
    flyTo(loc.lat, loc.lng, 14);
    // Recalculate distances with new location
    _allPlaygrounds = calculateDistances(_allPlaygrounds, loc);
    await loadPlaygrounds();
  } catch (err) {
    if (err.code === 1) {
      showToast('Location access denied. Enable in browser settings.', '⚠️');
    } else {
      showToast('Couldn\'t get your location.', '⚠️');
    }
  }
}

function handleMapMoved(bounds) {
  if (_hasFetched) {
    _mapMovedByUser = true;
    showExploreBtn();
  }
}

function handleCardClick(pg) {
  panToPlayground(pg);
  showDetail(pg, _lastLocation || getUserLocationOnMap());
  setSheetState('peek');
}

function handleMarkerClick(pg) {
  highlightCard(pg.id);
  showDetail(pg, _lastLocation || getUserLocationOnMap());
  if (getSheetState() === 'full') setSheetState('half');
}

function showDetailById(pgId) {
  const pg = _allPlaygrounds.find(p => p.id === pgId);
  if (pg) {
    highlightCard(pg.id);
    showDetail(pg, _lastLocation || getUserLocationOnMap());
  }
}

async function handleSearchSelect(result) {
  const label = getLocationLabel(result);
  const input = document.getElementById('search-input');
  if (input) {
    input.value = label;
    toggleSearchClear(true);
  }
  closeSearchDropdown();

  addRecentSearch(result);

  const lat = parseFloat(result.lat);
  const lng = parseFloat(result.lon);

  _lastLocation = null; // Clear user location context when searching
  flyTo(lat, lng, 14);

  // Wait for map to move, then load
  setTimeout(loadPlaygrounds, 800);
}

function handleFilterReset() {
  resetFiltersInDOM();
  _activeFilters = defaultFilters();
  updateFilterBadge(0);
}

function handleFilterApply() {
  _activeFilters = readFiltersFromDOM();
  hideFilterPanel();
  applyFiltersAndRender();

  const count = countActiveFilters(_activeFilters);
  if (count > 0) {
    showToast(`${count} filter${count > 1 ? 's' : ''} applied`, '🔍');
  } else {
    showToast('Filters cleared', '✓');
  }
}

/* ─── URL Params (for sharing) ───────────────────── */
function handleURLParams() {
  const params = new URLSearchParams(window.location.search);
  const lat = parseFloat(params.get('lat'));
  const lng = parseFloat(params.get('lng'));
  const name = params.get('name');

  if (!isNaN(lat) && !isNaN(lng)) {
    setTimeout(() => {
      flyTo(lat, lng, 16);
      showToast(`Showing ${name || 'shared playground'}`, '🛝');
    }, 500);
  }
}
