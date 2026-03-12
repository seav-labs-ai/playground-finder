/* ════════════════════════════════════════════════
   ui.js — Bottom sheet, detail view, filter panel,
           search, toast, and all UI interactions
   ════════════════════════════════════════════════ */

import { formatDistance, distanceMiles } from './utils.js';
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
const PEEK_HEIGHT = 140;

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

  // Snap to nearest state
  if (h < vh * 0.25)           setSheetState('peek');
  else if (h < vh * 0.72)      setSheetState('half');
  else                          setSheetState('full');
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
/*  PLAYGROUND CARDS              */
/* ═══════════════════════════════ */

let _onCardClick = null;

export function initCards(onCardClick) {
  _onCardClick = onCardClick;
}

export function renderCards(playgrounds, userLocation) {
  const container = document.getElementById('playground-cards');
  const loading = document.getElementById('cards-loading');
  const empty = document.getElementById('empty-state');
  const error = document.getElementById('error-state');

  if (!container) return;

  loading?.classList.add('hidden');
  error?.classList.add('hidden');

  if (playgrounds.length === 0) {
    empty?.classList.remove('hidden');
    container.innerHTML = '';
    updateSheetTitle(0, null);
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

  updateSheetTitle(playgrounds.length, userLocation);
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

  // Icon
  const iconClass = isPark ? 'is-park' : equipList.length > 0 ? '' : 'no-equipment';
  const emoji = isPark ? '🌳' : '🛝';

  // Equipment tags (max 3 shown)
  const equipTags = equipList.slice(0, 3)
    .map(e => `<span class="card-tag equipment">${e.icon} ${e.label}</span>`)
    .join('');
  const moreTag = equipList.length > 3
    ? `<span class="card-tag equipment">+${equipList.length - 3}</span>` : '';

  // Surface tag
  const surfTag = surf ? `<span class="card-tag surface">${surf.icon} ${surf.label}</span>` : '';

  // Age tag
  const ageTag = ageStr ? `<span class="card-tag age">👶 ${ageStr}</span>` : '';

  // Accessible
  const accessTag = pg.accessible ? `<span class="card-tag accessible">♿ Accessible</span>` : '';

  const distLabel = distanceMi !== null
    ? `<span class="dist-value">${formatDistance(distanceMi)}</span> away`
    : isPark ? 'Park' : 'Playground';

  card.innerHTML = `
    <div class="card-icon ${iconClass}">${emoji}</div>
    <div class="card-body">
      <div class="card-name">${pg.name}</div>
      <div class="card-distance">${distLabel}</div>
      <div class="card-tags">
        ${equipTags}${moreTag}
        ${surfTag}
        ${ageTag}
        ${accessTag}
      </div>
    </div>
    <div class="card-arrow">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="m9 18 6-6-6-6"/>
      </svg>
    </div>
  `;

  card.addEventListener('click', () => {
    // Highlight this card
    document.querySelectorAll('.playground-card.active').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    if (_onCardClick) _onCardClick(pg);
  });

  return card;
}

function updateSheetTitle(count, userLocation) {
  const title = document.getElementById('sheet-title');
  const subtitle = document.getElementById('sheet-subtitle');

  if (!title) return;

  if (count === 0) {
    title.textContent = 'No playgrounds found';
    subtitle.textContent = 'Try adjusting your filters or zooming out';
    return;
  }

  title.textContent = count === 1 ? '1 Playground' : `${count} Playgrounds`;
  subtitle.textContent = userLocation ? 'Sorted by distance' : 'In this area';
}

export function showCardsLoading() {
  document.getElementById('cards-loading')?.classList.remove('hidden');
  document.getElementById('playground-cards').innerHTML = '';
  document.getElementById('empty-state')?.classList.add('hidden');
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

export function showDetail(pg, userLocation) {
  _currentDetailPg = pg;
  const view = document.getElementById('detail-view');
  if (!view) return;

  // Populate name
  const nameEl = document.getElementById('detail-name');
  if (nameEl) nameEl.textContent = pg.name;

  // Distance
  const distEl = document.getElementById('detail-distance');
  if (distEl) {
    if (userLocation) {
      const d = distanceMiles(userLocation.lat, userLocation.lng, pg.lat, pg.lng);
      distEl.textContent = `${formatDistance(d)} away`;
    } else {
      distEl.textContent = '';
    }
  }

  // Hours
  const hoursEl = document.getElementById('detail-hours');
  if (hoursEl) {
    hoursEl.textContent = pg.hours ? `🕐 ${pg.hours}` : '';
  }

  // Equipment
  const equipGrid = document.getElementById('detail-equipment-grid');
  const noEquipNote = document.getElementById('no-equipment-note');
  const equipSection = document.getElementById('detail-equipment-section');

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

  // Details grid
  const detailGrid = document.getElementById('detail-grid');
  if (detailGrid) {
    const surf = getSurfaceInfo(pg);
    const ageStr = formatAgeRange(pg.minAge, pg.maxAge);

    const items = [
      { label: 'Type', value: pg.isPlayground ? '🛝 Playground' : '🌳 Park' },
      surf ? { label: 'Surface', value: `${surf.icon} ${surf.label}` } : null,
      ageStr ? { label: 'Age Range', value: `👶 ${ageStr}` } : null,
      { label: 'Accessible', value: pg.accessible ? '♿ Yes' : '—' },
      pg.hours ? { label: 'Hours', value: `🕐 ${pg.hours}` } : null,
    ].filter(Boolean);

    detailGrid.innerHTML = items.map(item => `
      <div class="detail-item">
        <span class="detail-item-label">${item.label}</span>
        <span class="detail-item-value">${item.value}</span>
      </div>
    `).join('');
  }

  // Directions button
  const dirBtn = document.getElementById('directions-btn');
  if (dirBtn) {
    dirBtn.href = getDirectionsUrl(pg.lat, pg.lng, pg.name);
  }

  // OSM button
  const osmBtn = document.getElementById('detail-osm-btn');
  if (osmBtn) {
    osmBtn.onclick = () => {
      window.open(`https://www.openstreetmap.org/${pg.osmType}/${pg.osmId}`, '_blank', 'noopener');
    };
  }

  // Share button
  const shareBtn = document.getElementById('detail-share-btn');
  if (shareBtn) {
    shareBtn.onclick = () => sharePlayground(pg);
  }

  // Show view with animation
  view.classList.remove('hidden', 'slide-out');
  view.classList.add('slide-in');

  // Init detail mini map
  setTimeout(() => {
    initDetailMap('detail-map', pg.lat, pg.lng, pg.name);
  }, 50);

  // Scroll to top
  document.getElementById('detail-content')?.scrollTo(0, 0);
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

async function sharePlayground(pg) {
  const url = `${window.location.origin}${window.location.pathname}?lat=${pg.lat}&lng=${pg.lng}&name=${encodeURIComponent(pg.name)}`;
  const text = `Check out ${pg.name} on PlaygroundFinder!`;

  if (navigator.share) {
    try {
      await navigator.share({ title: pg.name, text, url });
    } catch (e) {
      if (e.name !== 'AbortError') copyToClipboard(url);
    }
  } else {
    copyToClipboard(url);
    showToast('📎 Link copied to clipboard');
  }
}

function copyToClipboard(text) {
  navigator.clipboard?.writeText(text).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
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
  const dropdown = document.getElementById('search-dropdown');
  dropdown?.classList.add('open');
}

export function closeSearchDropdown() {
  const dropdown = document.getElementById('search-dropdown');
  dropdown?.classList.remove('open');
}

export function toggleSearchClear(visible) {
  const btn = document.getElementById('search-clear');
  btn?.classList.toggle('visible', visible);
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
    const type = r.type || 'place';
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

  if (!recents?.length) {
    section?.classList.add('hidden');
    return;
  }

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
/*  EXPLORE THIS AREA BUTTON      */
/* ═══════════════════════════════ */

export function showExploreBtn() {
  document.getElementById('explore-btn')?.classList.remove('hidden');
}

export function hideExploreBtn() {
  document.getElementById('explore-btn')?.classList.add('hidden');
}

/* ═══════════════════════════════ */
/*  MAP LOADING OVERLAY           */
/* ═══════════════════════════════ */

export function showMapLoading() {
  const overlay = document.getElementById('map-loading');
  overlay?.classList.remove('fade-out');
  overlay?.classList.remove('hidden');
}

export function hideMapLoading() {
  const overlay = document.getElementById('map-loading');
  if (!overlay) return;
  overlay.classList.add('fade-out');
  setTimeout(() => overlay.classList.add('hidden'), 350);
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
