/**
 * IFTalk PWA Service Worker
 * Provides offline caching for all bundled games and core app resources
 */

const CACHE_VERSION = 'v1.5.557';
const CACHE_NAMES = {
  core: `iftalk-core-${CACHE_VERSION}`,
  games: `iftalk-games-${CACHE_VERSION}`,
  fonts: `iftalk-fonts-${CACHE_VERSION}`,
  icons: `iftalk-icons-${CACHE_VERSION}`
};
  
// Core app assets (HTML, CSS, JS, libs)
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.png',
  './images/lantern-hero.png',
  './images/lantern-hero-mobile.jpg',
  // CSS files
  './styles/base.css',
  './styles/controls.css',
  './styles/fonts.css',
  './styles/game-output.css',
  './styles/lock-screen.css',
  // hints.css is injected lazily by hints-panel.js â€” not pre-cached
  './styles/map-canvas.css',
  './styles/main.css',
  './styles/mobile.css',
  './styles/modals.css',
  './styles/settings.css',
  './styles/sync-preview.css',
  './styles/variables.css',
  './styles/welcome.css',
  // JavaScript modules
  './js/app.js',
  './js/config.js',
  './js/core/app-commands.js',
  './js/core/dom.js',
  './js/core/state.js',
  './js/features/auto-mapper.js',
  './js/features/map-canvas.js',
  './js/features/hints/hints-data.js',
  './js/features/hints/hints-state.js',
  './js/features/hints/hints-panel.js',
  './js/game/commands/command-router.js',
  './js/game/commands/index.js',
  './js/game/commands/meta-command-handlers.js',
  './js/game/commands/save-list-formatter.js',
  './js/game/game-loader.js',
  './js/game/save-manager.js',
  './js/game/voxglk.js',
  './js/game/voxglk-renderer.js',
  './js/input/keyboard/index.js',
  './js/input/keyboard/keyboard-core.js',
  './js/input/keyboard/system-entry.js',
  './js/input/keyboard/voice-ui.js',
  './js/input/word-extractor.js',
  './js/narration/chunking.js',
  './js/narration/highlighting.js',
  './js/narration/navigation.js',
  './js/narration/openai-tts.js',
  './js/narration/tts-player.js',
  './js/ui/confirm-dialog.js',
  './js/ui/game-output.js',
  './js/ui/history.js',
  './js/ui/manage-saves-modal.js',
  './js/ui/nav-buttons.js',
  './js/ui/mobile-menu.js',
  './js/ui/scroll-down-button.js',
  './js/ui/sync-modal.js',
  './js/ui/sync-preview-modal.js',
  './js/ui/settings/data-management-ui.js',
  './js/ui/settings/gdrive-ui.js',
  './js/ui/settings/index.js',
  './js/ui/settings/pronunciation-ui.js',
  './js/ui/settings/settings-panel.js',
  './js/ui/settings/voice-selection.js',
  './js/utils/audio-feedback.js',
  './js/utils/game-settings.js',
  './js/utils/gdrive/gdrive-api.js',
  './js/utils/gdrive/gdrive-auth.js',
  './js/utils/gdrive/gdrive-device.js',
  './js/utils/gdrive/gdrive-sync.js',
  './js/utils/gdrive/gdrive-sync-preview.js',
  './js/utils/gdrive/index.js',
  './js/utils/lock-screen.js',
  './js/utils/offline-debug.js',
  './js/utils/pronunciation.js',
  './js/utils/pwa-updater.js',
  './js/utils/remote-console.js',
  './js/utils/scroll.js',
  './js/utils/status.js',
  './js/utils/storage/storage-api.js',
  './js/utils/text-processing.js',
  './js/utils/touch-detection.js',
  './js/utils/wake-lock.js',
  './js/voice/command-handlers.js',
  './js/voice/echo-detection.js',
  './js/voice/recognition.js',
  './js/voice/voice-commands.js',
  './js/voice/voice-meter.js',
  // Third-party libraries
  './lib/dialog.css',
  './lib/dialog-stub.js',
  './lib/glkapi.js',
  './lib/glkote.css',
  './lib/glkote.js',
  './lib/pako.min.js',
  './lib/zvm.js'
];

// Font files
const FONTS = [
  './fonts/MaterialIcons-Regular.woff2',
  './fonts/Literata-Regular.woff2',
  './fonts/Inter-Regular.woff2',
  './fonts/Iosevka-Regular.woff2'
];

// PWA icons
const ICONS = [
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install event - precache all assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAMES.core).then(cache => {
        return cache.addAll(CORE_ASSETS);
      }),
      caches.open(CACHE_NAMES.fonts).then(cache => {
        return cache.addAll(FONTS);
      }),
      caches.open(CACHE_NAMES.icons).then(cache => {
        return cache.addAll(ICONS);
      })
      // Games and hints JSON are NOT pre-cached here â€” see /games/ fetch handler.
    ]).then(() => {
      // Don't auto-activate - wait for user approval via SKIP_WAITING message
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      const cachesToDelete = cacheNames.filter(name => {
        return name.startsWith('iftalk-') && !Object.values(CACHE_NAMES).includes(name);
      });

      return Promise.all(
        cachesToDelete.map(name => {
          return caches.delete(name);
        })
      );
    }).then(() => {
      // Take control of all pages immediately
      return self.clients.claim();
    })
  );
});

// Listen for skip waiting message from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  // Lets the page compare the controlling SW's version against its own APP_CONFIG
  // version, so controllerchange can skip the reload when the code is already current.
  if (event.data && event.data.type === 'GET_VERSION' && event.ports[0]) {
    event.ports[0].postMessage(CACHE_VERSION);
  }
});

// How long to wait for the network before falling back to cache for CSS/JS.
const NETWORK_TIMEOUT_MS = 1500;

/**
 * Network-first with a timeout fallback to cache. Used for CSS/JS so a single online
 * reload serves the newest code, but a slow or offline network falls back to the cached
 * copy quickly instead of hanging. `cache: 'no-cache'` forces a server revalidation
 * (etag/last-modified), defeating any stale HTTP cache while still allowing a fast 304.
 */
function networkFirstWithTimeout(request, timeoutMs) {
  return caches.match(request).then(cached => new Promise(resolve => {
    let settled = false;
    const finish = (resp) => { if (!settled && resp) { settled = true; resolve(resp); } };

    // If the network is slow, serve the cached copy (when we have one) after the timeout.
    const timer = setTimeout(() => finish(cached), timeoutMs);

    fetch(request, { cache: 'no-cache' }).then(networkResponse => {
      clearTimeout(timer);
      if (networkResponse && networkResponse.status === 200) {
        // Refresh the cache so the offline/slow-path fallback stays current.
        const copy = networkResponse.clone();
        caches.open(CACHE_NAMES.core).then(cache => cache.put(request, copy));
        if (settled) return;            // timeout already served cache; cache is now updated
        settled = true; resolve(networkResponse);
      } else {
        // Non-200 (e.g. 404): prefer cache if present, else hand back the response as-is.
        if (settled) return;
        settled = true; resolve(cached || networkResponse);
      }
    }).catch(() => {
      // Offline / network error â€” fall back to cache (may be undefined â†’ network-error to page).
      clearTimeout(timer);
      if (settled) return;
      settled = true; resolve(cached);
    });
  }));
}

// Fetch event - network-first for HTML, cache-first for assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Network-only for external OAuth (Google Identity Services)
  if (url.hostname === 'accounts.google.com') {
    return;
  }

  // Network-only for external requests (different origin)
  if (url.hostname !== location.hostname) {
    return;
  }

  // Network-only for API endpoints
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Network-first for HTML files (always get latest index.html)
  if (request.destination === 'document' || url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache the response for offline use
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAMES.core).then(cache => {
              cache.put(request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // Network failed - fall back to cache
          return caches.match(request);
        })
    );
    return;
  }

  // Network-first with timeout for CSS and JS. A single online reload picks up the
  // newest code (the network copy wins), while slow/offline connections fall back to
  // cache within NETWORK_TIMEOUT_MS so startup never stalls. The cache is refreshed
  // whenever the network responds, so the fallback stays current for next time.
  if (url.pathname.endsWith('.css') || url.pathname.endsWith('.js')) {
    event.respondWith(networkFirstWithTimeout(request, NETWORK_TIMEOUT_MS));
    return;
  }

  // Cache-on-demand for game files and hints JSON.
  // Not pre-cached on install; downloaded and stored on first play/use.
  if (url.pathname.startsWith('/games/')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }
          const copy = response.clone();
          caches.open(CACHE_NAMES.games).then(cache => cache.put(request, copy));
          return response;
        });
      })
    );
    return;
  }

  // Cache-first for everything else (images, fonts, etc.)
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }

      // Not in cache - fetch from network
      return fetch(request).then(response => {
        // Don't cache non-successful responses
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }

        // Clone the response (can only be consumed once)
        const responseToCache = response.clone();

        // Cache new resources (runtime caching)
        caches.open(CACHE_NAMES.core).then(cache => {
          cache.put(request, responseToCache);
        });

        return response;
      }).catch(error => {
        console.error('[SW] Fetch failed:', error);
        throw error;
      });
    })
  );
});
