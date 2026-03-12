/* ════════════════════════════════════════════════
   map.js — Leaflet map setup, markers, interactions
   ════════════════════════════════════════════════ */

import { distanceMiles, formatDistance } from './utils.js';
import { getEquipmentList, getSurfaceInfo } from './data.js';

// DC default center
const DC_CENTER = [38.9072, -77.0369];
const DC_ZOOM   = 13;

let _map = null;
let _markerGroup = null;
let _detailMap = null;
let _userMarker = null;
let _selectedMarker = null;
let _markers = new Map(); // id → Leaflet marker
let _userLocation = null;

// Callback references (set by app.js)
let _onPlaygroundClick = null;
let _onMapMoved = null;

/**
 * Initialize the main map
 */
export function initMap(containerId, { onPlaygroundClick, onMapMoved }) {
  _onPlaygroundClick = onPlaygroundClick;
  _onMapMoved = onMapMoved;

  _map = L.map(containerId, {
    center: DC_CENTER,
    zoom: DC_ZOOM,
    zoomControl: true,
    attributionControl: true,
    zoomAnimation: true,
    fadeAnimation: true,
    tap: true,
    tapTolerance: 15,
  });

  // Tile layer — CartoDB Voyager (clean, modern look, free)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(_map);

  // Move zoom controls to bottom-right
  _map.zoomControl.setPosition('bottomright');

  // Marker cluster group — custom style
  _markerGroup = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 60,
    iconCreateFunction(cluster) {
      const count = cluster.getChildCount();
      return L.divIcon({
        html: `<div class="cluster-icon"><span>${count}</span></div>`,
        className: 'custom-cluster',
        iconSize: L.point(42, 42),
        iconAnchor: L.point(21, 21),
      });
    },
    animate: true,
    animateAddingMarkers: false,
  });

  _map.addLayer(_markerGroup);

  // Map move event → show "Search this area" button
  _map.on('moveend', () => {
    if (_onMapMoved) _onMapMoved(_map.getBounds());
  });

  // Close popups when tapping empty map area
  _map.on('click', () => {
    _map.closePopup();
    if (_selectedMarker) {
      deselectMarker(_selectedMarker);
      _selectedMarker = null;
    }
  });

  return _map;
}

/**
 * Get current map bounds
 */
export function getMapBounds() {
  return _map?.getBounds();
}

/**
 * Get current map center
 */
export function getMapCenter() {
  return _map?.getCenter();
}

/**
 * Fly/pan the map to a lat/lng
 */
export function flyTo(lat, lng, zoom = 14) {
  _map?.flyTo([lat, lng], zoom, { animate: true, duration: 1.0 });
}

/**
 * Set user location marker (pulsing dot)
 */
export function setUserLocation(lat, lng) {
  _userLocation = { lat, lng };

  const icon = L.divIcon({
    html: `<div class="user-location-marker"><div class="user-pulse"></div><div class="user-dot"></div></div>`,
    className: '',
    iconSize:   L.point(20, 20),
    iconAnchor: L.point(10, 10),
  });

  if (_userMarker) {
    _userMarker.setLatLng([lat, lng]);
  } else {
    _userMarker = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(_map);
  }
}

/**
 * Get current user location (if set)
 */
export function getUserLocationOnMap() {
  return _userLocation;
}

/**
 * Render playground markers on the map
 */
export function renderMarkers(playgrounds, userLocation) {
  // Track which IDs we receive
  const incoming = new Set(playgrounds.map(p => p.id));

  // Remove markers no longer in view
  for (const [id, marker] of _markers) {
    if (!incoming.has(id)) {
      _markerGroup.removeLayer(marker);
      _markers.delete(id);
    }
  }

  // Add/update markers
  for (const pg of playgrounds) {
    if (_markers.has(pg.id)) continue; // already rendered

    const equipCount = pg.equipment?.length || 0;
    const hasEquip = equipCount > 0;
    const isPark = pg.isPark && !pg.isPlayground;

    const emojiIcon = isPark ? '🌳' : hasEquip ? '🛝' : '🛝';
    const pinClass = isPark ? 'is-park' : hasEquip ? 'has-equipment' : 'no-equipment';

    const icon = L.divIcon({
      html: `
        <div class="playground-marker">
          <div class="marker-pin ${pinClass}" id="pin-${pg.id}">
            <span class="marker-pin-inner">${emojiIcon}</span>
          </div>
        </div>
      `,
      className: '',
      iconSize:   L.point(40, 40),
      iconAnchor: L.point(20, 40),
      popupAnchor: L.point(0, -42),
    });

    const marker = L.marker([pg.lat, pg.lng], { icon });

    // Bind popup
    marker.bindPopup(() => buildPopupContent(pg, userLocation), {
      closeButton: false,
      maxWidth: 280,
      className: 'playground-popup',
    });

    marker.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      selectMarker(marker, pg.id);
      if (_onPlaygroundClick) _onPlaygroundClick(pg);
    });

    _markerGroup.addLayer(marker);
    _markers.set(pg.id, marker);
  }
}

/**
 * Build popup HTML for a playground
 */
function buildPopupContent(pg, userLocation) {
  const dist = userLocation
    ? formatDistance(distanceMiles(userLocation.lat, userLocation.lng, pg.lat, pg.lng))
    : null;

  const equipList = getEquipmentList(pg);
  const surf = getSurfaceInfo(pg);

  const equipHtml = equipList.slice(0, 4)
    .map(e => `<span class="popup-pill">${e.icon} ${e.label}</span>`)
    .join('');

  const distHtml = dist ? `<div class="popup-meta">📍 ${dist} away${surf ? ` · ${surf.icon} ${surf.label}` : ''}</div>` : '';
  const extraPills = equipList.length > 4 ? `<span class="popup-pill">+${equipList.length - 4} more</span>` : '';

  const el = L.DomUtil.create('div', '');
  el.innerHTML = `
    <div class="popup-content">
      <div class="popup-name">${pg.name}</div>
      ${distHtml}
      ${equipList.length ? `<div class="popup-equipment">${equipHtml}${extraPills}</div>` : ''}
    </div>
    <button class="popup-btn" onclick="window._pgShowDetail('${pg.id}')">View Details →</button>
  `;
  return el;
}

/**
 * Select a marker (highlight as orange)
 */
function selectMarker(marker, id) {
  if (_selectedMarker && _selectedMarker !== marker) {
    deselectMarker(_selectedMarker);
  }
  _selectedMarker = marker;

  // Update pin class
  const pin = document.getElementById(`pin-${id}`);
  if (pin) pin.classList.add('selected');
}

/**
 * Deselect a marker
 */
function deselectMarker(marker) {
  const el = marker.getElement();
  if (!el) return;
  const pin = el.querySelector('.marker-pin');
  if (pin) pin.classList.remove('selected');
}

/**
 * Deselect all markers
 */
export function deselectAllMarkers() {
  document.querySelectorAll('.marker-pin.selected').forEach(el => {
    el.classList.remove('selected');
  });
  _selectedMarker = null;
}

/**
 * Show/hide markers based on a filter predicate
 */
export function filterMarkers(visibleIds) {
  if (!visibleIds) {
    // Show all
    for (const [, marker] of _markers) {
      if (!_markerGroup.hasLayer(marker)) _markerGroup.addLayer(marker);
    }
    return;
  }

  const visSet = new Set(visibleIds);
  for (const [id, marker] of _markers) {
    if (visSet.has(id)) {
      if (!_markerGroup.hasLayer(marker)) _markerGroup.addLayer(marker);
    } else {
      _markerGroup.removeLayer(marker);
    }
  }
}

/**
 * Initialize the detail mini-map (small contextual map in detail view)
 */
export function initDetailMap(containerId, lat, lng, name) {
  if (_detailMap) {
    _detailMap.remove();
    _detailMap = null;
  }

  _detailMap = L.map(containerId, {
    center: [lat, lng],
    zoom: 16,
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    touchZoom: false,
    doubleClickZoom: false,
    tap: false,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(_detailMap);

  // Add a marker with a circle
  L.circle([lat, lng], {
    radius: 40,
    color: '#3d9e51',
    fillColor: '#3d9e51',
    fillOpacity: 0.2,
    weight: 2,
  }).addTo(_detailMap);

  const icon = L.divIcon({
    html: `<div style="width:30px;height:30px;background:linear-gradient(135deg,#3d9e51,#4aba5e);border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.25)"><span style="display:block;transform:rotate(45deg);text-align:center;font-size:14px;line-height:26px">🛝</span></div>`,
    className: '',
    iconSize: L.point(30, 30),
    iconAnchor: L.point(15, 30),
  });

  L.marker([lat, lng], { icon }).addTo(_detailMap);

  // Force redraw (needed when container was hidden)
  setTimeout(() => _detailMap.invalidateSize(), 50);
}

/**
 * Pan to a specific playground and open its popup
 */
export function panToPlayground(pg) {
  if (!_map) return;
  _map.panTo([pg.lat, pg.lng], { animate: true, duration: 0.5 });
  const marker = _markers.get(pg.id);
  if (marker) {
    selectMarker(marker, pg.id);
    marker.openPopup();
  }
}

/**
 * Get current zoom level
 */
export function getZoom() {
  return _map?.getZoom();
}

/**
 * Clean up detail map
 */
export function destroyDetailMap() {
  if (_detailMap) {
    _detailMap.remove();
    _detailMap = null;
  }
}
