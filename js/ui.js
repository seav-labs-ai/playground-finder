/* ════════════════════════════════════════════════
   ui.js — Bottom sheet, detail view, filter panel,
           search, toast, and all UI interactions
           v1.5: dark mode, favorites, tabs, nearby,
                 neighborhood, photo hero
   ════════════════════════════════════════════════ */

import { formatDistance, distanceMiles, storage } from './utils.js';
import { getEquipmentList, getSurfaceInfo, formatAgeRange, getLocationLabel } from './data.js';
import { initDetailMap, destroyDetailMap } from './map.js';
import { getDirectionsUrl } from './utils.js';

/* ═══════════════════════════════ */
/*  BOTTOM SHEET                  */
/* ═══════════════════════════════ */

let _sheetState = 'peek'; // 'peek' | 'half' | 'full'
let _sheetEl = null;
let _dragStartY = 0;
let _dragStartHeight = 0;
let _isDragging = false;
const PEEK_HEIGHT = 160; // slightly taller for tabs

export function initBottomSheet() {
  _sheetEl = document.getElementById('bottom-sheet');
  const handleArea = document.getElementById('sheet-handle-area');
  const header = document.getElementById('sheet-header');

  if (!_sheetEl || !handleArea) return;

  // ── Touch drag ──
  handleArea.addEventListener('touchstart', onDragStart, { passive: true });
  document.addEventListener('touchmove', onDragMove, { passive: false });
  document.addEventListener('touchend', onDragEnd, { passive: true });

  // ── Mouse drag ──
  handleArea.addEventListener('mousedown', onMouseDragStart);
  document.addEventListener('mousemove', onMouseDragMove);
  document.addEventListener('mouseup', onMouseDragEnd);

  // Tapping header when peeked → open half
  header.addEventListener('click', () => {
    if (_sheetState === 'peek') setSheetState('half');
  });

  setSheetState('peek');
}

function onDragStart(e) {
  _isDragging = true;
  _dragStartY = e.touches[0].clientY;
  _dragStartHeight = _sheetEl.getBoundingClientRect().height;
  _sheetEl.style.transition = 'none';
}

function onMouseDragStart(e) {
  _isDragging = true;
  _dragStartY = e.clientY;
  _dragStartHeight = _sheetEl.getBoundingClientRect().height;
  _sheetEl.style.transition = 'none';
}

function onDragMove(e) {
  if (!_isDragging) return;
  const dy = _dragStartY - e.touches[0].clientY;
  const newH = Math.min(Math.max(_dragStartHeight + dy, PEEK_HEIGHT), window.innerHeight * 0.92);
  _sheetEl.style.height = `${newH}px`;
  if (e.cancelable) e.preventDefault();
}

function onMouseDragMove(e) {
  if (!_isDragging) return;
  const dy = _dragStartY - e.clientY;
  const newH = Math.min(Math.max(_dragStartHeight + dy, PEEK_HEIGHT), window.innerHeight * 0.92);
  _sheetEl.style.height = `${newH}px`;
}

function onDragEnd() {
  if (!_isDragging) return;
  _isDragging = false;
  _sheetEl.style.transition = '';
  const h = _sheetEl.getBoundingClientRect().height;
  const vh = window.innerHeight;
  if (h < vh * 0.25)       setSheetState('peek');
  else if (h < vh * 0.72)  setSheetState('half');
  else                      setSheetState('full');
}

const onMouseDragEnd = onDragEnd;

export function setSheetState(state) {
  _sheetState = state;
  _sheetEl?.classList.remove('peek', 'half', 'full');
  _sheetEl?.classList.add(state);
  _sheetEl?.style.removeProperty('height');
}

export function getSheetState() { return _sheetState; }

/* ═══════════════════════════════ */
/*  TABS (Nearby / Saved) — v1.5  */
/* ═══════════════════════════════ */

let _activeTab = 'nearby'; // 'nearby' | 'saved'
let _onTabChange = null;

export function initTabs(onTabChange) {
  _onTabChange = onTabChange;

  document.querySelectorAll('.sheet-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab === _activeTab) return;
      switchTab(tab);
    });
  });
}

function switchTab(tab) {
  _activeTab = tab;
  document.querySelectorAll('.sheet-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  // Show/hide sheet header (sort controls only for nearby)
  const header = document.getElementById('sheet-header');
  if (header) header.style.display = tab === 'nearby' ? '' : 'none';

  if (_onTabChange) _onTabChange(tab);
}

export function getActiveTab() { return _activeTab; }

export function updateSavedBadge(count) {
  const badge = document.getElementById('saved-badge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

/* ═══════════════════════════════ */
/*  FAVORITES (v1.5)              */
/* ═══════════════════════════════ */

const SAVED_KEY = 'savedPlaygrounds';

export function getSavedIds() {
  return storage.get(SAVED_KEY, []);
}

export function isSaved(pgId) {
  return getSavedIds().includes(pgId);
}

export function toggleSaved(pg) {
  const ids = getSavedIds();
  const idx = ids.indexOf(pg.id);
  if (idx >= 0) {
    ids.splice(idx, 1);
    showToast(`Removed from saved`, '💔');
  } else {
    ids.push(pg.id);
    showToast(`Saved! ❤️ ${pg.name}`);
  }
  storage.set(SAVED_KEY, ids);

  // Update UI
  updateSavedBadge(ids.length);
  refreshSaveButtons(pg.id, ids.includes(pg.id));
  return ids.includes(pg.id);
}

function refreshSaveButtons(pgId, saved) {
  document.querySelectorAll(`[data-save-id="${pgId}"]`).forEach(btn => {
    btn.classList.toggle('saved', saved);
  });
}

/* ═══════════════════════════════ */
/*  PLAYGROUND CARDS              */
/* ═══════════════════════════════ */

let _onCardClick = null;
let _allPlaygroundsRef = []; // keep reference for nearby section

export function initCards(onCardClick) {
  _onCardClick = onCardClick;
}

export function renderCards(playgrounds, userLocation) {
  const container = document.getElementById('playground-cards');
  const loading = document.getElementById('cards-loading');
  const empty = document.getElementById('empty-state');
  const savedEmpty = document.getElementById('saved-empty-state');
  const error = document.getElementById('error-state');

  _allPlaygroundsRef = playgrounds;

  if (!container) return;

  loading?.classList.add('hidden');
  error?.classList.add('hidden');
  savedEmpty?.classList.add('hidden');

  if (playgrounds.length === 0) {
    if (_activeTab === 'saved') {
      savedEmpty?.classList.remove('hidden');
      empty?.classList.add('hidden');
    } else {
      empty?.classList.remove('hidden');
    }
    container.innerHTML = '';
    updateSheetTitle(0);
    return;
  }

  empty?.classList.add('hidden');
  container.innerHTML = '';

  playgrounds.forEach(pg => {
    const dist = userLocation
      ? distanceMiles(userLocation.lat, userLocation.lng, pg.lat, pg.lng)
      : null;
    const card = createCard(pg, dist);
    container.appendChild(card);
  });

  updateSheetTitle(playgrounds.length);
}

function createCard(pg, distanceMi) {
  const card = document.createElement('button');
  card.className = 'playground-card';
  card.dataset.id = pg.id;
  card.setAttribute('aria-label', `${pg.name}, ${distanceMi ? formatDistance(distanceMi) + ' away' : ''}`);

  const equipList = getEquipmentList(pg);
  const surf = getSurfaceInfo(pg);
  const ageStr = formatAgeRange(pg.minAge, pg.maxAge);
  const isPark = pg.isPark && !pg.isPlayground;
  const saved = isSaved(pg.id);

  const equipTags = equipList.slice(0, 3)
    .map(e => `<span class="card-tag equipment">${e.icon} ${e.label}</span>`)
    .join('');
  const moreTag = equipList.length > 3
    ? `<span class="card-tag equipment">+${equipList.length - 3}</span>` : '';
  const surfTag = surf ? `<span class="card-tag surface">${surf.icon} ${surf.label}</span>` : '';
  const ageTag = ageStr ? `<span class="card-tag age">👶 ${ageStr}</span>` : '';
  const accessTag = pg.accessible ? `<span class="card-tag accessible">♿</span>` : '';

  const distLabel = distanceMi !== null
    ? `<span class="dist-value">${formatDistance(distanceMi)}</span> away`
    : isPark ? 'Park' : 'Playground';

  card.innerHTML = `
    <div class="card-icon ${isPark ? 'is-park' : ''}">${isPark ? '🌳' : '🛝'}</div>
    <div class="card-body">
      <div class="card-name">${pg.name}</div>
      <div class="card-distance">${distLabel}</div>
      <div class="card-tags">
        ${equipTags}${moreTag}
        ${surfTag}${ageTag}${accessTag}
      </div>
    </div>
    <button class="card-save-btn ${saved ? 'saved' : ''}" data-save-id="${pg.id}" aria-label="${saved ? 'Unsave' : 'Save'} ${pg.name}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
    </button>
    <div class="card-arrow">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="m9 18 6-6-6-6"/>
      </svg>
    </div>
  `;

  // Card body click → open detail
  card.addEventListener('click', (e) => {
    // Don't trigger if clicking the save button
    if (e.target.closest('.card-save-btn')) return;
    document.querySelectorAll('.playground-card.active').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    if (_onCardClick) _onCardClick(pg);
  });

  // Save button
  const saveBtn = card.querySelector('.card-save-btn');
  saveBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSaved(pg);
  });

  return card;
}

function updateSheetTitle(count) {
  const title = document.getElementById('sheet-title');
  if (!title) return;

  if (_activeTab === 'saved') {
    title.textContent = count === 0 ? 'Saved Playgrounds' : `${count} Saved`;
    const sub = document.getElementById('sheet-subtitle');
    if (sub) sub.textContent = count === 0 ? '' : 'Your favorites';
    return;
  }

  if (count === 0) {
    title.textContent = 'No playgrounds found';
  } else {
    title.textContent = count === 1 ? '1 Playground' : `${count} Playgrounds`;
  }
}

export function showCardsLoading() {
  document.getElementById('cards-loading')?.classList.remove('hidden');
  const container = document.getElementById('playground-cards');
  if (container) container.innerHTML = '';
  document.getElementById('empty-state')?.classList.add('hidden');
  document.getElementById('saved-empty-state')?.classList.add('hidden');
  document.getElementById('error-state')?.classList.add('hidden');
}

export function showCardsError() {
  document.getElementById('cards-loading')?.classList.add('hidden');
  document.getElementById('error-state')?.classList.remove('hidden');
}

/* ═══════════════════════════════ */
/*  RESULTS COUNT                 */
/* ═══════════════════════════════ */

export function showResultsPill(count) {
  const pill = document.getElementById('results-pill');
  const countEl = document.getElementById('results-count');
  if (!pill || !countEl) return;
  countEl.textContent = count;
  pill.classList.remove('hidden');
  setTimeout(() => pill.classList.add('hidden'), 3000);
}

/* ═══════════════════════════════ */
/*  DETAIL VIEW                   */
/* ═══════════════════════════════ */

let _currentDetailPg = null;
let _showingPhoto = false;

export function showDetail(pg, userLocation, allPlaygrounds) {
  _currentDetailPg = pg;
  _showingPhoto = false;
  const view = document.getElementById('detail-view');
  if (!view) return;

  // ── Name ──
  const nameEl = document.getElementById('detail-name');
  if (nameEl) nameEl.textContent = pg.name;

  // ── Distance ──
  const distEl = document.getElementById('detail-distance');
  if (distEl) {
    if (userLocation) {
      const d = distanceMiles(userLocation.lat, userLocation.lng, pg.lat, pg.lng);
      distEl.textContent = `📍 ${formatDistance(d)} away`;
    } else {
      distEl.textContent = '';
    }
  }

  // ── Hours ──
  const hoursEl = document.getElementById('detail-hours');
  if (hoursEl) hoursEl.textContent = pg.hours ? `🕐 ${pg.hours}` : '';

  // ── Neighborhood (async) ──
  const neighEl = document.getElementById('detail-neighborhood');
  let neighborhoodName = '';
  if (neighEl) {
    neighEl.textContent = '';
    reverseGeocode(pg.lat, pg.lng).then(label => {
      if (_currentDetailPg?.id === pg.id) {
        neighborhoodName = label || '';
        neighEl.textContent = label ? `· ${label}` : '';
        // Update image search link with neighborhood
        const imgLink = document.getElementById('detail-search-images');
        if (imgLink) {
          const q = encodeURIComponent(`${pg.name} ${label || ''} playground`);
          imgLink.href = `https://www.google.com/search?q=${q}&tbm=isch`;
        }
      }
    });
  }

  // ── Description (v2.0) ──
  const descEl = document.getElementById('detail-description');
  if (descEl) {
    if (pg.description) {
      descEl.textContent = pg.description;
      descEl.classList.remove('hidden');
    } else {
      descEl.classList.add('hidden');
    }
  }

  // ── Safety & Amenities (v2.0) ──
  const safetyGrid = document.getElementById('detail-safety-grid');
  if (safetyGrid) {
    const amenities = [
      pg.fenced ? { label: 'Fenced', icon: '🔒' } : null,
      pg.shaded ? { label: 'Shaded', icon: '⛱️' } : null,
      pg.lit ? { label: 'Lit at Night', icon: '💡' } : null,
      pg.amenities?.includes('toilets') ? { label: 'Restrooms', icon: '🚻' } : null,
      pg.amenities?.includes('drinking_water') ? { label: 'Water', icon: '🚰' } : null,
    ].filter(Boolean);

    safetyGrid.innerHTML = amenities.map(a => `
      <div class="equipment-item">
        <span class="equip-icon">${a.icon}</span>
        <span>${a.label}</span>
      </div>
    `).join('');
    
    // Hide section if empty
    safetyGrid.parentElement.classList.toggle('hidden', amenities.length === 0);
  }

  // ── Operator (v2.0) ──
  const operatorEl = document.getElementById('detail-operator');
  if (operatorEl) {
    operatorEl.textContent = pg.operator ? `Managed by ${pg.operator}` : '';
  }

  // ── External Links (v2.0) ──
  const streetViewBtn = document.getElementById('detail-streetview-btn');
  if (streetViewBtn) {
    streetViewBtn.href = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${pg.lat},${pg.lng}`;
  }

  // ── Equipment ──
  const equipGrid = document.getElementById('detail-equipment-grid');
  const noEquipNote = document.getElementById('no-equipment-note');
  if (equipGrid) {
    const equipList = getEquipmentList(pg);
    if (equipList.length > 0) {
      noEquipNote?.classList.add('hidden');
      equipGrid.innerHTML = equipList.map(e => `
        <div class="equipment-item">
          <span class="equip-icon">${e.icon}</span>
          <span>${e.label}</span>
        </div>
      `).join('');
    } else {
      equipGrid.innerHTML = '';
      noEquipNote?.classList.remove('hidden');
    }
  }

  // ── Details Grid ──
  const detailGrid = document.getElementById('detail-grid');
  if (detailGrid) {
    const surf = getSurfaceInfo(pg);
    const ageStr = formatAgeRange(pg.minAge, pg.maxAge);
    const items = [
      { label: 'Type',       value: pg.isPlayground ? '🛝 Playground' : '🌳 Park' },
      surf ? { label: 'Surface',    value: `${surf.icon} ${surf.label}` } : null,
      ageStr ? { label: 'Ages',     value: `👶 ${ageStr}` } : null,
      { label: 'Accessible', value: pg.accessible ? '♿ Yes' : '—' },
      pg.hours ? { label: 'Hours',  value: `🕐 ${pg.hours}` } : null,
    ].filter(Boolean);

    detailGrid.innerHTML = items.map(item => `
      <div class="detail-item">
        <span class="detail-item-label">${item.label}</span>
        <span class="detail-item-value">${item.value}</span>
      </div>
    `).join('');
  }

  // ── Nearby (same area, excluding current) ──
  renderNearbySection(pg, allPlaygrounds, userLocation);

  // ── Save button ──
  const saveBtn = document.getElementById('detail-save-btn');
  if (saveBtn) {
    saveBtn.classList.toggle('saved', isSaved(pg.id));
    saveBtn.dataset.saveId = pg.id;
    saveBtn.onclick = () => toggleSaved(pg);
  }

  // ── Directions ──
  const dirBtn = document.getElementById('directions-btn');
  if (dirBtn) dirBtn.href = getDirectionsUrl(pg.lat, pg.lng, pg.name);

  // ── OSM link ──
  const osmBtn = document.getElementById('detail-osm-btn');
  if (osmBtn) {
    osmBtn.onclick = () => {
      window.open(`https://www.openstreetmap.org/${pg.osmType}/${pg.osmId}`, '_blank', 'noopener');
    };
  }

  // ── Share ──
  const shareBtn = document.getElementById('detail-share-btn');
  if (shareBtn) shareBtn.onclick = () => sharePlayground(pg);

  // ── Photo toggle ──
  const photoToggle = document.getElementById('detail-photo-toggle');
  const photoOverlay = document.getElementById('detail-photo-overlay');
  if (photoToggle && photoOverlay) {
    photoOverlay.classList.add('hidden');
    // Try to fetch a photo (async)
    fetchPlaygroundPhoto(pg).then(photo => {
      if (photo && _currentDetailPg?.id === pg.id) {
        const img = document.getElementById('detail-photo');
        const attr = document.getElementById('detail-photo-attribution');
        if (img) img.src = photo.url;
        if (attr) attr.textContent = photo.attribution;
        photoOverlay.classList.remove('hidden');
        photoToggle.onclick = () => togglePhoto(photoOverlay);
      }
    });
  }

  // ── Show view ──
  view.classList.remove('hidden', 'slide-out');
  view.classList.add('slide-in');

  // Init mini map
  setTimeout(() => {
    initDetailMap('detail-map', pg.lat, pg.lng, pg.name);
  }, 50);

  document.getElementById('detail-content')?.scrollTo(0, 0);
}

function togglePhoto(overlay) {
  _showingPhoto = !_showingPhoto;
  const detailMap = document.getElementById('detail-map');
  if (_showingPhoto) {
    detailMap.style.opacity = '0';
  } else {
    detailMap.style.opacity = '1';
    overlay.style.opacity = '0.3';
    setTimeout(() => overlay.style.opacity = '1', 10);
  }
}

function renderNearbySection(pg, allPlaygrounds, userLocation) {
  const section = document.getElementById('detail-nearby-section');
  const list = document.getElementById('detail-nearby-list');
  if (!section || !list || !allPlaygrounds?.length) {
    section?.classList.add('hidden');
    return;
  }

  // Get up to 5 nearby (within ~1 mile), excluding current
  const nearby = allPlaygrounds
    .filter(p => p.id !== pg.id)
    .map(p => ({
      ...p,
      _dist: distanceMiles(pg.lat, pg.lng, p.lat, p.lng)
    }))
    .filter(p => p._dist < 0.8)
    .sort((a, b) => a._dist - b._dist)
    .slice(0, 6);

  if (nearby.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  list.innerHTML = nearby.map(p => {
    const isPark = p.isPark && !p.isPlayground;
    return `
      <button class="nearby-card" data-nearby-id="${p.id}">
        <div class="nearby-card-icon">${isPark ? '🌳' : '🛝'}</div>
        <div class="nearby-card-name">${p.name}</div>
        <div class="nearby-card-dist">${formatDistance(p._dist)}</div>
      </button>
    `;
  }).join('');

  list.querySelectorAll('.nearby-card').forEach(card => {
    card.addEventListener('click', () => {
      const nearbyPg = allPlaygrounds.find(p => p.id === card.dataset.nearbyId);
      if (nearbyPg) {
        // Replace detail with this one
        showDetail(nearbyPg, userLocation, allPlaygrounds);
      }
    });
  });
}

export function hideDetail() {
  const view = document.getElementById('detail-view');
  if (!view || view.classList.contains('hidden')) return;
  view.classList.remove('slide-in');
  view.classList.add('slide-out');
  setTimeout(() => {
    view.classList.add('hidden');
    view.classList.remove('slide-out');
    destroyDetailMap();
    _currentDetailPg = null;
  }, 260);
}

/* ─── Reverse geocode (neighborhood name) ─── */
async function reverseGeocode(lat, lng) {
  const cacheKey = `rgeo_${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=15`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'PlaygroundFinder/1.5' },
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    const addr = data.address || {};
    const label = addr.suburb || addr.neighbourhood || addr.quarter ||
                  addr.city_district || addr.city || addr.town || null;
    if (label) sessionStorage.setItem(cacheKey, label);
    return label;
  } catch {
    return null;
  }
}

/* ─── Fetch photo from Wikimedia Commons ─── */
async function fetchPlaygroundPhoto(pg) {
  // Try Nominatim photo (via Wikimedia), or known park photos
  // This is speculative — many playgrounds won't have photos
  const name = encodeURIComponent(pg.name);
  try {
    // Search Wikimedia for the playground name
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${name}&prop=pageimages&format=json&pithumbsize=600&origin=*`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    const pages = Object.values(data.query?.pages || {});
    const page = pages[0];
    if (page?.thumbnail?.source) {
      return {
        url: page.thumbnail.source,
        attribution: `📷 Wikipedia`,
      };
    }
  } catch {
    // Silent fail — photos are optional
  }
  return null;
}

/* ─── Share ─── */
async function sharePlayground(pg) {
  const url = `${window.location.origin}${window.location.pathname}?lat=${pg.lat}&lng=${pg.lng}&name=${encodeURIComponent(pg.name)}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: pg.name, text: `Check out ${pg.name} on PlaygroundFinder!`, url });
    } catch (e) {
      if (e.name !== 'AbortError') { copyToClipboard(url); showToast('Link copied!'); }
    }
  } else {
    copyToClipboard(url);
    showToast('📎 Link copied to clipboard');
  }
}

function copyToClipboard(text) {
  navigator.clipboard?.writeText(text).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
  });
}

/* ═══════════════════════════════ */
/*  FILTER PANEL                  */
/* ═══════════════════════════════ */

export function showFilterPanel() {
  document.getElementById('filter-overlay')?.classList.remove('hidden');
  document.getElementById('filter-panel')?.classList.remove('hidden');
}

export function hideFilterPanel() {
  document.getElementById('filter-overlay')?.classList.add('hidden');
  document.getElementById('filter-panel')?.classList.add('hidden');
}

export function updateFilterBadge(count) {
  const badge = document.getElementById('filter-badge');
  const btn = document.getElementById('filter-btn');
  if (!badge || !btn) return;
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
    btn.classList.add('active');
  } else {
    badge.classList.add('hidden');
    btn.classList.remove('active');
  }
}

/* ═══════════════════════════════ */
/*  SEARCH                        */
/* ═══════════════════════════════ */

let _onSearchSelect = null;

export function initSearch(onSearchSelect) {
  _onSearchSelect = onSearchSelect;
}

export function openSearchDropdown() {
  document.getElementById('search-dropdown')?.classList.add('open');
}

export function closeSearchDropdown() {
  document.getElementById('search-dropdown')?.classList.remove('open');
}

export function toggleSearchClear(visible) {
  document.getElementById('search-clear')?.classList.toggle('visible', visible);
}

export function showSearchLoading(show) {
  document.getElementById('search-loading')?.classList.toggle('hidden', !show);
  document.getElementById('search-results-section')?.classList.add('hidden');
  document.getElementById('search-no-results')?.classList.add('hidden');
}

export function renderSearchResults(results) {
  const section = document.getElementById('search-results-section');
  const list = document.getElementById('search-results-list');
  const loading = document.getElementById('search-loading');
  const noResults = document.getElementById('search-no-results');
  loading?.classList.add('hidden');

  if (!results || results.length === 0) {
    section?.classList.add('hidden');
    noResults?.classList.remove('hidden');
    return;
  }
  noResults?.classList.add('hidden');
  section?.classList.remove('hidden');
  if (!list) return;

  list.innerHTML = results.map((r, i) => {
    const label = getLocationLabel(r);
    return `
      <button class="search-option" data-result-index="${i}">
        <span class="search-option-icon" style="background:var(--green-100);color:var(--primary)">📍</span>
        <span>${label}</span>
      </button>
    `;
  }).join('');

  list.querySelectorAll('.search-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.resultIndex);
      if (_onSearchSelect) _onSearchSelect(results[idx]);
    });
  });
}

export function renderRecentSearches(recents) {
  const section = document.getElementById('recent-searches-section');
  const list = document.getElementById('recent-searches-list');
  if (!recents?.length) { section?.classList.add('hidden'); return; }
  section?.classList.remove('hidden');
  if (!list) return;

  list.innerHTML = recents.map((r, i) => {
    const label = getLocationLabel(r);
    return `
      <button class="search-option" data-recent-index="${i}">
        <span class="search-option-icon history-icon">🕐</span>
        <span>${label}</span>
      </button>
    `;
  }).join('');

  list.querySelectorAll('.search-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.recentIndex);
      if (_onSearchSelect) _onSearchSelect(recents[idx]);
    });
  });
}

/* ═══════════════════════════════ */
/*  EXPLORE BTN                   */
/* ═══════════════════════════════ */

export function showExploreBtn() { document.getElementById('explore-btn')?.classList.remove('hidden'); }
export function hideExploreBtn() { document.getElementById('explore-btn')?.classList.add('hidden'); }

/* ═══════════════════════════════ */
/*  MAP LOADING                   */
/* ═══════════════════════════════ */

export function showMapLoading() {
  const o = document.getElementById('map-loading');
  o?.classList.remove('fade-out', 'hidden');
}

export function hideMapLoading() {
  const o = document.getElementById('map-loading');
  if (!o) return;
  o.classList.add('fade-out');
  setTimeout(() => o.classList.add('hidden'), 350);
}

/* ═══════════════════════════════ */
/*  DARK MODE (v1.5)              */
/* ═══════════════════════════════ */

const THEME_KEY = 'theme';

export function initDarkMode() {
  // Check saved pref or system pref
  const saved = storage.get(THEME_KEY);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  applyTheme(theme);

  document.getElementById('dark-mode-btn')?.addEventListener('click', toggleDarkMode);

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!storage.get(THEME_KEY)) applyTheme(e.matches ? 'dark' : 'light');
  });
}

function toggleDarkMode() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  storage.set(THEME_KEY, next);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  // Update theme-color meta
  const meta = document.getElementById('theme-color-meta');
  if (meta) meta.content = theme === 'dark' ? '#0f1115' : '#3d9e51';
}

/* ═══════════════════════════════ */
/*  PWA INSTALL BANNER (v1.5)     */
/* ═══════════════════════════════ */

let _installPrompt = null;

export function initPWA() {
  // Capture install prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _installPrompt = e;

    // Don't show if user dismissed before
    if (!storage.get('installDismissed')) {
      setTimeout(() => showInstallBanner(), 30000); // show after 30s
    }
  });

  window.addEventListener('appinstalled', () => {
    hideInstallBanner();
    showToast('🎉 PlaygroundFinder installed!');
    _installPrompt = null;
  });

  document.getElementById('install-dismiss')?.addEventListener('click', () => {
    hideInstallBanner();
    storage.set('installDismissed', true);
  });

  document.getElementById('install-confirm')?.addEventListener('click', async () => {
    if (!_installPrompt) return;
    _installPrompt.prompt();
    const choice = await _installPrompt.userChoice;
    if (choice.outcome === 'accepted') hideInstallBanner();
    _installPrompt = null;
  });
}

function showInstallBanner() {
  document.getElementById('install-banner')?.classList.remove('hidden');
}

function hideInstallBanner() {
  document.getElementById('install-banner')?.classList.add('hidden');
}

/* ═══════════════════════════════ */
/*  TOAST NOTIFICATIONS           */
/* ═══════════════════════════════ */

export function showToast(message, icon = null) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  const iconHtml = icon ? `<span class="toast-icon">${icon}</span>` : '';
  toast.innerHTML = `${iconHtml}<span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 260);
  }, 3000);
}

/* ═══════════════════════════════ */
/*  HIGHLIGHT ACTIVE CARD         */
/* ═══════════════════════════════ */

export function highlightCard(pgId) {
  document.querySelectorAll('.playground-card').forEach(c => c.classList.remove('active'));
  const card = document.querySelector(`.playground-card[data-id="${pgId}"]`);
  if (card) {
    card.classList.add('active');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}
