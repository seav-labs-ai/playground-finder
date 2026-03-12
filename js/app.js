/* ════════════════════════════════════════════════
   app.js — Main application bootstrap + orchestration
   v1.5: dark mode, favorites, tabs, PWA, neighborhood
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
  // v1.5
  initDarkMode, initPWA,
  initTabs, getActiveTab, updateSavedBadge,
  getSavedIds, isSaved, toggleSaved,
} from './ui.js';

import {
  getUserLocation, debounce, storage,
  addRecentSearch, getRecentSearches,
} from './utils.js';

/* ─── State ─────────────────────────────────────── */
let _allPlaygrounds    = [];
let _filteredPlaygrounds = [];
let _activeFilters     = defaultFilters();
let _activeSortBy      = 'distance';
let _hasFetched        = false;
let _isLoading         = false;
let _mapMovedByUser    = false;
let _searchQuery       = '';
let _lastLocation      = null;

/* ─── Init ───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Expose global for popup button callbacks
  window._pgShowDetail = showDetailById;

  // v1.5 inits
  initDarkMode();
  initPWA();
  registerServiceWorker();

  initBottomSheet();
  initCards(handleCardClick);
  initSearch(handleSearchSelect);
  initTabs(handleTabChange);
  bindEvents();
  initMapAndLoad();

  // Update saved badge on load
  updateSavedBadge(getSavedIds().length);
});

/* ─── Service Worker ─────────────────────────────── */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.debug('SW registration error (dev):', err.message);
      });
    });
  }
}

/* ─── Map initialization ─────────────────────────── */
async function initMapAndLoad() {
  initMap('map', {
    onPlaygroundClick: handleMarkerClick,
    onMapMoved: handleMapMoved,
  });

  showMapLoading();
  try {
    const loc = await getUserLocation();
    _lastLocation = loc;
    setUserLocation(loc.lat, loc.lng);
    flyTo(loc.lat, loc.lng, 14);
    await loadPlaygrounds();
    showToast('📍 Showing playgrounds near you');
  } catch (err) {
    hideMapLoading();
    await loadPlaygrounds();
    if (err.code === 1) {
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
  } catch (err) {
    console.error('Failed to load playgrounds:', err);
    hideMapLoading();
    showCardsError();
    showToast('⚠️ Couldn\'t load playgrounds. Try again.');
  } finally {
    _isLoading = false;
  }
}

/* ─── Filter + Render ────────────────────────────── */
function applyFiltersAndRender() {
  const userLoc = _lastLocation || getUserLocationOnMap();
  const tab = getActiveTab();

  if (tab === 'saved') {
    renderSavedTab(userLoc);
    return;
  }

  // Apply filters
  _filteredPlaygrounds = applyFilters(_allPlaygrounds, _activeFilters);

  // Sort
  _filteredPlaygrounds = sortPlaygrounds(_filteredPlaygrounds, _activeSortBy, userLoc);

  // Render all markers (un-filtered)
  renderMarkers(_allPlaygrounds, userLoc);

  // Marker visibility based on current filter
  if (countActiveFilters(_activeFilters) > 0) {
    filterMarkers(_filteredPlaygrounds.map(p => p.id));
  } else {
    filterMarkers(null);
  }

  // Render cards
  renderCards(_filteredPlaygrounds, userLoc);
  updateFilterBadge(countActiveFilters(_activeFilters));
}

function renderSavedTab(userLoc) {
  const savedIds = getSavedIds();
  const saved = _allPlaygrounds.filter(p => savedIds.includes(p.id));
  const sorted = sortPlaygrounds(saved, _activeSortBy, userLoc);

  renderMarkers(sorted.length > 0 ? sorted : _allPlaygrounds, userLoc);
  if (sorted.length > 0) filterMarkers(sorted.map(p => p.id));
  else filterMarkers(null);

  renderCards(sorted, userLoc);
}

/* ─── Tab Handler ────────────────────────────────── */
function handleTabChange(tab) {
  const userLoc = _lastLocation || getUserLocationOnMap();
  if (tab === 'saved') {
    renderSavedTab(userLoc);
  } else {
    applyFiltersAndRender();
  }
}

/* ─── Event Bindings ─────────────────────────────── */
function bindEvents() {
  // ── Locate me ──
  document.getElementById('locate-btn')?.addEventListener('click', handleLocate);

  // ── Filter ──
  document.getElementById('filter-btn')?.addEventListener('click', () => showFilterPanel());
  document.getElementById('filter-overlay')?.addEventListener('click', () => hideFilterPanel());
  document.getElementById('filter-close-btn')?.addEventListener('click', () => hideFilterPanel());
  document.getElementById('filter-reset-btn')?.addEventListener('click', handleFilterReset);
  document.getElementById('filter-apply-btn')?.addEventListener('click', handleFilterApply);

  // ── Explore ──
  document.getElementById('explore-btn')?.addEventListener('click', () => {
    hideExploreBtn();
    loadPlaygrounds();
  });

  // ── Detail back ──
  document.getElementById('detail-back-btn')?.addEventListener('click', () => {
    hideDetail();
    deselectAllMarkers();
    setSheetState('half');
  });

  // ── Retry ──
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

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    const container = document.getElementById('search-container');
    if (container && !container.contains(e.target)) closeSearchDropdown();
  });

  // Escape closes panels
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSearchDropdown();
      hideDetail();
      hideFilterPanel();
    }
  });

  // Bottom sheet tap to open
  document.getElementById('sheet-content')?.addEventListener('touchstart', () => {
    if (getSheetState() === 'peek') setSheetState('half');
  }, { passive: true });

  // URL params for sharing
  handleURLParams();
}

/* ─── Debounced search ───────────────────────────── */
const debouncedSearch = debounce(async (query) => {
  if (!query || query.length < 2) return;
  showSearchLoading(true);
  try {
    const results = await geocodeSearch(query);
    if (_searchQuery === query) renderSearchResults(results);
  } catch {
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

function handleMapMoved() {
  if (_hasFetched) {
    _mapMovedByUser = true;
    showExploreBtn();
  }
}

function handleCardClick(pg) {
  panToPlayground(pg);
  const userLoc = _lastLocation || getUserLocationOnMap();
  showDetail(pg, userLoc, _allPlaygrounds);
  setSheetState('peek');
}

function handleMarkerClick(pg) {
  highlightCard(pg.id);
  const userLoc = _lastLocation || getUserLocationOnMap();
  showDetail(pg, userLoc, _allPlaygrounds);
  if (getSheetState() === 'full') setSheetState('half');
}

function showDetailById(pgId) {
  const pg = _allPlaygrounds.find(p => p.id === pgId);
  if (pg) {
    highlightCard(pg.id);
    const userLoc = _lastLocation || getUserLocationOnMap();
    showDetail(pg, userLoc, _allPlaygrounds);
  }
}

async function handleSearchSelect(result) {
  const label = getLocationLabel(result);
  const input = document.getElementById('search-input');
  if (input) { input.value = label; toggleSearchClear(true); }
  closeSearchDropdown();
  addRecentSearch(result);

  const lat = parseFloat(result.lat);
  const lng = parseFloat(result.lon);
  _lastLocation = null;
  flyTo(lat, lng, 14);
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
  showToast(count > 0 ? `${count} filter${count > 1 ? 's' : ''} applied` : 'Filters cleared', '🔍');
}

/* ─── URL Params ─────────────────────────────────── */
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
