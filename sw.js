/* ════════════════════════════════════════════════
   sw.js — Service Worker for PlaygroundFinder PWA
   Caches static assets + handles offline fallbacks
   ════════════════════════════════════════════════ */

const CACHE_NAME = 'playground-finder-v1.5';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/index.css',
  '/css/map.css',
  '/css/components.css',
  '/js/app.js',
  '/js/map.js',
  '/js/data.js',
  '/js/filters.js',
  '/js/ui.js',
  '/js/utils.js',
  '/manifest.json',
];

// CDN resources to cache on first use
const CDN_CACHE_NAME = 'playground-finder-cdn-v1';

// Install — cache static assets immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        await cache.addAll(STATIC_ASSETS);
      } catch (err) {
        console.warn('[SW] Failed to cache some assets during install:', err);
      }
    })
  );
});

// Activate — clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== CDN_CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch — serve from cache, falling back to network
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept Overpass API or Nominatim (always need fresh data)
  if (
    url.hostname.includes('overpass-api.de') ||
    url.hostname.includes('nominatim.openstreetmap.org')
  ) {
    return; // Let browser handle
  }

  // For tile requests: cache-first with network fallback
  if (
    url.hostname.includes('basemaps.cartocdn.com') ||
    url.hostname.includes('openstreetmap.org') ||
    url.pathname.includes('/tiles/')
  ) {
    event.respondWith(
      caches.open(CDN_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const response = await fetch(event.request);
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        } catch {
          return new Response('', { status: 503 });
        }
      })
    );
    return;
  }

  // For CDN JS/CSS (Leaflet etc): cache-first
  if (
    url.hostname.includes('unpkg.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.open(CDN_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) cache.put(event.request, response.clone());
        return response;
      })
    );
    return;
  }

  // For app shell: network-first, then cache fallback
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
});
