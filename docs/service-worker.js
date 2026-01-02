/**
 * IFTalk PWA Service Worker
 * Provides offline caching for all bundled games and core app resources
 */

const CACHE_VERSION = 'v1.4.22';
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
  // CSS files
  './styles/base.css',
  './styles/controls.css',
  './styles/fonts.css',
  './styles/game-output.css',
  './styles/lock-screen.css',
  './styles/map-canvas.css',
  './styles/main.css',
  './styles/mobile.css',
  './styles/modals.css',
  './styles/settings.css',
  './styles/variables.css',
  './styles/welcome.css',
  // JavaScript modules
  './js/app.js',
  './js/config.js',
  './js/core/app-commands.js',
  './js/core/dom.js',
  './js/core/state.js',
  './js/features/hints.js',
  './js/features/auto-mapper.js',
  './js/features/map-canvas.js',
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
  './js/narration/tts-player.js',
  './js/ui/confirm-dialog.js',
  './js/ui/game-output.js',
  './js/ui/history.js',
  './js/ui/nav-buttons.js',
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
  './js/utils/gdrive/index.js',
  './js/utils/lock-screen.js',
  './js/utils/offline-debug.js',
  './js/utils/pronunciation.js',
  './js/utils/remote-console.js',
  './js/utils/scroll.js',
  './js/utils/status.js',
  './js/utils/storage/storage-api.js',
  './js/utils/storage-sync.js',
  './js/utils/text-processing.js',
  './js/utils/wake-lock.js',
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
  './lib/zvm.js'
];

// Bundled game files (28 games)
const BUNDLED_GAMES = [
  './games/905.z5',
  './games/aisle.z5',
  './games/allroads.z5',
  './games/amfv.z4',
  './games/anchorhead.z8',
  './games/bronze.zblorb',
  './games/curses.z5',
  './games/dreamhold.z8',
  './games/edifice.z5',
  './games/galatea.zblorb',
  './games/hitchhik.z5',
  './games/jigsaw.z8',
  './games/lostpig.z8',
  './games/metamorphoses.z5',
  './games/photopia.z5',
  './games/planetfall.z3',
  './games/savoirfaire.zblorb',
  './games/seastalker.z3',
  './games/shade.z5',
  './games/slouching.z5',
  './games/spiderandweb.z5',
  './games/theatre.z5',
  './games/trinity.z4',
  './games/varicella.z8',
  './games/violet.zblorb',
  './games/wishbringer.z3',
  './games/witness.z3',
  './games/zork.z5'
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
  console.log('[PWA] Service worker installing...');

  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAMES.core).then(cache => {
        console.log('[PWA] Caching core assets...');
        return cache.addAll(CORE_ASSETS);
      }),
      caches.open(CACHE_NAMES.fonts).then(cache => {
        console.log('[PWA] Caching fonts...');
        return cache.addAll(FONTS);
      }),
      caches.open(CACHE_NAMES.icons).then(cache => {
        console.log('[PWA] Caching icons...');
        return cache.addAll(ICONS);
      }),
      caches.open(CACHE_NAMES.games).then(cache => {
        console.log('[PWA] Caching bundled games...');
        return cache.addAll(BUNDLED_GAMES);
      })
    ]).then(() => {
      console.log('[PWA] All assets cached successfully');
      // Don't skipWaiting - let user finish their session
      // New version will activate on next app launch
      // return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[PWA] Service worker activating...');

  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => {
            // Delete any cache that starts with 'iftalk-' but isn't in our current cache names
            return name.startsWith('iftalk-') && !Object.values(CACHE_NAMES).includes(name);
          })
          .map(name => {
            console.log('[PWA] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[PWA] Service worker activated');
      // Don't claim clients immediately - can cause reloads on iOS
      // return self.clients.claim();
    })
  );
});

// Fetch event - cache-first strategy
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

  // Cache-first for everything else
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

        // Optionally cache new resources (runtime caching)
        // This helps with dynamically loaded resources
        caches.open(CACHE_NAMES.core).then(cache => {
          cache.put(request, responseToCache);
        });

        return response;
      }).catch(error => {
        console.error('[PWA] Fetch failed:', error);
        // Could return an offline page here
        throw error;
      });
    })
  );
});
