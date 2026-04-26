/**
 * PWA Updater
 *
 * Service worker registration, update notification UI, install prompt handling,
 * and standalone/iOS detection. Extracted from app.js — see code-review Tier 2 Batch 1.
 */

import { APP_CONFIG } from '../config.js';

let waitingWorker = null;
let newVersionNumber = null;
let lastNotificationTime = 0;
let deferredPwaPrompt = null;

// Read the latest IFTalk core cache version from the SW cache list.
// Used to compare the running app version against what the SW just installed.
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

async function showUpdateNotification() {
  // Suppress if we just applied an update (prevents duplicate notification after reload).
  const justUpdated = sessionStorage.getItem('iftalk_just_updated');
  if (justUpdated) {
    if (Date.now() - parseInt(justUpdated) < 5000) return;
    sessionStorage.removeItem('iftalk_just_updated');
  }

  // Debounce: don't show twice within 2s.
  const now = Date.now();
  if (now - lastNotificationTime < 2000) return;
  lastNotificationTime = now;

  // If the running version already matches what the SW reports, nothing to show.
  try {
    const currentVersion = `v${APP_CONFIG.version}`;
    const newVersion = newVersionNumber || await getLatestCacheVersion();
    if (newVersion && currentVersion === newVersion) return;
  } catch (err) {
    // If version check fails, fall through and show — better than silently missing a real update.
  }

  document.getElementById('updateNotification')?.remove();

  const notification = document.createElement('div');
  notification.id = 'updateNotification';
  notification.className = 'update-notification';
  notification.innerHTML = `
    <div class="update-content">
      <div class="update-text">
        <div class="update-title">Update available</div>
        <div class="update-description">Refreshing in <span id="updateCountdown">5</span>s...</div>
      </div>
      <button class="update-button" id="updateButton">
        Refresh Now
      </button>
      <button class="update-dismiss" id="updateDismiss">
        <span class="material-icons">close</span>
      </button>
    </div>
  `;
  document.body.appendChild(notification);
  setTimeout(() => notification.classList.add('visible'), 100);

  // Auto-refresh countdown.
  let countdown = 5;
  const countdownEl = document.getElementById('updateCountdown');
  const autoRefreshTimer = setInterval(() => {
    countdown--;
    if (countdownEl) countdownEl.textContent = countdown;
    if (countdown <= 0) {
      clearInterval(autoRefreshTimer);
      if (waitingWorker) {
        sessionStorage.setItem('iftalk_just_updated', Date.now().toString());
        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      }
      notification.classList.remove('visible');
      setTimeout(() => notification.remove(), 300);
    }
  }, 1000);

  document.getElementById('updateButton').addEventListener('click', () => {
    clearInterval(autoRefreshTimer);
    if (waitingWorker) {
      sessionStorage.setItem('iftalk_just_updated', Date.now().toString());
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
    notification.classList.remove('visible');
    setTimeout(() => notification.remove(), 300);
  });

  document.getElementById('updateDismiss').addEventListener('click', () => {
    clearInterval(autoRefreshTimer);
    notification.classList.remove('visible');
    setTimeout(() => notification.remove(), 300);
  });
}

function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'NEW_VERSION_ACTIVATED') {
      newVersionNumber = event.data.version;
    }
  });

  window.addEventListener('load', async () => {
    // Cache-bust the SW URL with the app version so browsers refetch on bump.
    const cacheBust = APP_CONFIG.version.replace(/\./g, '');
    navigator.serviceWorker.register(`./service-worker.js?v=${cacheBust}`)
      .then(async (registration) => {
        registration.update();

        // Check for updates every 30s while the page is open.
        setInterval(() => registration.update(), 30000);

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', async () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              waitingWorker = newWorker;
              await showUpdateNotification();
            }
          });
        });

        // Already-waiting worker (e.g., SW updated while page was loading).
        if (registration.waiting) {
          waitingWorker = registration.waiting;
          await showUpdateNotification();
        }

        navigator.serviceWorker.addEventListener('controllerchange', () => {
          window.location.reload();
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
  // Manual "Check for updates" button in settings.
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
          sessionStorage.setItem('iftalk_just_updated', Date.now().toString());
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
