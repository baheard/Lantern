/**
 * PWA Updater
 *
 * Service worker registration, silent background updates, install prompt handling,
 * and standalone/iOS detection. Extracted from app.js — see code-review Tier 2 Batch 1.
 *
 * Update model (v1.5.510+): the SW serves JS/CSS network-first, and a newly-installed
 * worker is activated as soon as it's ready (SKIP_WAITING). When it takes control,
 * `controllerchange` fires and the page reloads to run the fresh code. See tome
 * `service-worker-update-model`.
 */

import { APP_CONFIG } from '../config.js';

let deferredPwaPrompt = null;

// Guards against double-reload + blank flash: both the automatic `controllerchange`
// listener and the manual "Check for Updates" button's fallback timeout can each call
// reload() for the same activation. Only the first one should actually run.
let reloadTriggered = false;
function reloadForUpdate(reason) {
  if (reloadTriggered) return;
  reloadTriggered = true;
  console.log(`[PWA] reloading for update (${reason})`);
  window.location.reload();
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

        const activate = (worker) => { if (worker) worker.postMessage({ type: 'SKIP_WAITING' }); };

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              activate(newWorker);
            }
          });
        });

        // Worker that finished installing while the page was loading.
        if (registration.waiting) activate(registration.waiting);

        // Reload when the new SW takes control so the page runs fresh code.
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          reloadForUpdate('controllerchange');
        });
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
  //
  // Uses confirmDialog instead of alert() — alert()/confirm() are silently swallowed in
  // iOS standalone (home-screen) PWAs, which made this button appear completely
  // unresponsive even when it ran successfully (e.g. the "no updates found" case).
  window.addEventListener('load', () => {
    const updatePwaBtn = document.getElementById('updatePwaBtn');
    if (!updatePwaBtn) return;
    updatePwaBtn.addEventListener('click', async () => {
      const { confirmDialog } = await import('../ui/confirm-dialog.js');
      const notify = (message, title) => confirmDialog(message, { title, okOnly: true });

      if (!('serviceWorker' in navigator)) {
        await notify('Service worker not supported.\n\nYour browser may not support offline features.', 'Update Check');
        return;
      }
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) {
          await notify('Service worker not registered.\n\nPlease reload the app and try again.', 'Update Check');
          return;
        }

        // If a worker is already waiting, activate it now.
        if (registration.waiting) {
          console.log('[PWA] Check for updates: worker already waiting, activating');
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          // controllerchange listener will reload; fall back to a manual reload in
          // case controllerchange doesn't fire (seen on some iOS WebKit versions).
          // reloadForUpdate() guards against both firing and causing a double reload.
          setTimeout(() => reloadForUpdate('fallback-waiting'), 3000);
          return;
        }

        // Force a real network fetch of the SW script with a never-before-used URL.
        // registration.update() can be served from iOS's HTTP cache for the SW script,
        // reporting "no update" even when the server has a newer version — a fresh
        // ?v= query string has never been cached, so this always hits the network.
        console.log('[PWA] Check for updates: forcing fresh registration check');
        const freshRegistration = await navigator.serviceWorker.register(`./service-worker.js?v=${Date.now()}`);
        const newWorker = await new Promise((resolve) => {
          if (freshRegistration.waiting) { resolve(freshRegistration.waiting); return; }
          const timer = setTimeout(() => resolve(null), 15000);
          freshRegistration.addEventListener('updatefound', () => {
            const w = freshRegistration.installing;
            if (!w) return;
            w.addEventListener('statechange', () => {
              if (w.state === 'installed') { clearTimeout(timer); resolve(w); }
            });
          }, { once: true });
        });

        if (newWorker) {
          console.log('[PWA] Check for updates: new worker installed, activating');
          newWorker.postMessage({ type: 'SKIP_WAITING' });
          // controllerchange listener will reload; fall back to a manual reload in
          // case controllerchange doesn't fire (seen on some iOS WebKit versions).
          // reloadForUpdate() guards against both firing and causing a double reload.
          setTimeout(() => reloadForUpdate('fallback-newWorker'), 3000);
        } else {
          console.log('[PWA] Check for updates: no update found');
          await notify(`No updates found.\n\nYou're already on the latest version (${APP_CONFIG.version}).`, 'Up to Date');
        }
      } catch (err) {
        console.error('Update check error:', err);
        await notify(`Update check failed.\n\nError: ${err.message}\n\nPlease check your connection and try again.`, 'Update Check Failed');
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
