/**
 * PWA Updater
 *
 * Service worker registration, silent background updates, install prompt handling,
 * and standalone/iOS detection. Extracted from app.js — see code-review Tier 2 Batch 1.
 *
 * Update model (v1.5.476+): the SW serves JS/CSS network-first, so the running page
 * already loads fresh code on a normal reload. A newly-installed worker is therefore
 * activated SILENTLY — no "update available" toast, no forced reload. Activation just
 * lets the new worker clean up old version caches and re-precache for offline; the next
 * natural reload picks up everything. See tome `service-worker-update-model`.
 */

import { APP_CONFIG } from '../config.js';

let deferredPwaPrompt = null;

// Read the latest IFTalk core cache version from the SW cache list.
// Used by the manual "Check for updates" button to report the installed version.
async function getLatestCacheVersion() {
  try {
    const cacheNames = await caches.keys();
    const versions = cacheNames
      .filter(name => name.startsWith('iftalk-core-v'))
      .map(name => name.replace('iftalk-core-v', ''))
      .sort((a, b) => {
        const aParts = a.split('.').map(Number);
        const bParts = b.split('.').map(Number);
        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
          const diff = (bParts[i] || 0) - (aParts[i] || 0);
          if (diff !== 0) return diff;
        }
        return 0;
      });
    return versions[0] ? `v${versions[0]}` : null;
  } catch (err) {
    return null;
  }
}

function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    // Cache-bust the SW URL with the app version so browsers refetch on bump.
    const cacheBust = APP_CONFIG.version.replace(/\./g, '');
    navigator.serviceWorker.register(`./service-worker.js?v=${cacheBust}`)
      .then((registration) => {
        registration.update();

        // Check for updates every 30s while the page is open.
        setInterval(() => registration.update(), 30000);

        // Silently activate a freshly-installed worker. Network-first asset serving means
        // the page is already running fresh code, so there's nothing to prompt or reload —
        // we just let the new worker take over (it deletes superseded version caches and
        // finishes precaching for offline use). No controllerchange→reload: a forced reload
        // would be redundant and disruptive.
        const activate = (worker) => { if (worker) worker.postMessage({ type: 'SKIP_WAITING' }); };

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            // Only when there's already a controller (i.e. this is an update, not the very
            // first install) — a first install activates and claims on its own.
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              activate(newWorker);
            }
          });
        });

        // Worker that finished installing while the page was loading.
        if (registration.waiting) activate(registration.waiting);
      })
      .catch(error => {
        console.error('[PWA] Service worker registration failed:', error);
      });
  });
}

function initInstallPrompt() {
  // Stash the prompt event so the install button in settings can trigger it later.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPwaPrompt = e;
    document.getElementById('pwaInstallSection')?.classList.remove('hidden');
  });

  window.addEventListener('load', () => {
    const pwaInstallBtn = document.getElementById('pwaInstallBtn');
    if (!pwaInstallBtn) return;
    pwaInstallBtn.addEventListener('click', async () => {
      if (!deferredPwaPrompt) return;
      deferredPwaPrompt.prompt();
      await deferredPwaPrompt.userChoice;
      deferredPwaPrompt = null;
      document.getElementById('pwaInstallSection')?.classList.add('hidden');
    });
  });
}

function initUpdateButton() {
  // Manual "Check for updates" button in settings. This is an explicit user action, so a
  // confirming reload here is expected (unlike the automatic path, which stays silent).
  window.addEventListener('load', () => {
    const updatePwaBtn = document.getElementById('updatePwaBtn');
    if (!updatePwaBtn) return;
    updatePwaBtn.addEventListener('click', async () => {
      if (!('serviceWorker' in navigator)) {
        alert('Service worker not supported.\n\nYour browser may not support offline features.');
        return;
      }
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) {
          alert('Service worker not registered.\n\nPlease reload the app and try again.');
          return;
        }
        await registration.update();
        if (registration.waiting) {
          const newVersion = await getLatestCacheVersion() || 'latest';
          alert(`Update found!\n\nUpdating to version ${newVersion}.\n\nThe page will reload now.`);
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          setTimeout(() => window.location.reload(), 500);
        } else {
          alert(`No updates found.\n\nYou're already on the latest version (${APP_CONFIG.version}).`);
        }
      } catch (err) {
        console.error('Update check error:', err);
        alert(`Update check failed.\n\nError: ${err.message}\n\nPlease check your connection and try again.`);
      }
    });
  });
}

function detectStandalone() {
  window.addEventListener('load', () => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone
      || document.referrer.includes('android-app://');

    if (isStandalone) {
      document.getElementById('pwaInstallSection')?.classList.add('hidden');
      return;
    }

    // iOS doesn't fire beforeinstallprompt, so show manual instructions.
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (!isIOS) return;

    const pwaInstallSection = document.getElementById('pwaInstallSection');
    const pwaInstallBtn = document.getElementById('pwaInstallBtn');
    const pwaInstallDescription = document.getElementById('pwaInstallDescription');
    if (!pwaInstallSection || !pwaInstallBtn || !pwaInstallDescription) return;

    pwaInstallSection.classList.remove('hidden');
    pwaInstallBtn.innerHTML = '<span class="material-icons">ios_share</span> Install App (iOS)';
    pwaInstallDescription.innerHTML = 'Tap the Share button <span class="material-icons" style="vertical-align:middle;font-size:16px;">ios_share</span> in Safari, then select "Add to Home Screen"';

    pwaInstallBtn.addEventListener('click', () => {
      alert('To install Voxi on iOS:\n\n1. Tap the Share button (□↑) at the bottom of Safari\n2. Scroll down and tap "Add to Home Screen"\n3. Tap "Add" to confirm\n\nVoxi will then appear on your home screen like a native app!');
    });
  });
}

export function initPWA() {
  initServiceWorker();
  initInstallPrompt();
  initUpdateButton();
  detectStandalone();
}
