/**
 * IFTalk - Voice-Powered Interactive Fiction
 * Main Application Entry Point
 *
 * This file wires together all modules and initializes the app.
 * Uses browser-based ZVM + GlkOte instead of server-side Frotz.
 */

// Remote console (must be first for iOS debugging)
import './utils/remote-console.js';

// Offline debug console (for debugging load times)
import { showDebugOverlay } from './utils/offline-debug.js';

// Core modules
import { state } from './core/state.js';
import { dom, initDOM } from './core/dom.js';
import { updateStatus } from './utils/status.js';

// Make debug overlay accessible globally (for testing)
window.showDebugOverlay = showDebugOverlay;

// Voice modules
import { initVoiceRecognition, showConfirmedTranscript } from './voice/recognition.js';
import { updateVoiceTranscript } from './input/keyboard/voice-ui.js';
import { processVoiceKeywords } from './voice/voice-commands.js';
import { startVoiceMeter, stopVoiceMeter } from './voice/voice-meter.js';

// Narration modules
import { speakTextChunked, stopNarration, speakAppMessage } from './narration/tts-player.js';
import { skipToChunk, skipToStart, skipToEnd } from './narration/navigation.js';
import { initScrollDetection } from './narration/highlighting.js';

// UI modules
import { updateNavButtons } from './ui/nav-buttons.js';
import { addGameText } from './ui/game-output.js';
import { initAllSettings, loadBrowserVoiceConfig, updateSettingsContext } from './ui/settings/index.js';
import { initHistoryButtons } from './ui/history.js';
import { initConfirmDialog } from './ui/confirm-dialog.js';
import { initMobileMenu, updateMobileMenuForGameState } from './ui/mobile-menu.js';
import { initScrollDownButton, updateButtonVisibility } from './ui/scroll-down-button.js';

// Game modules
import { sendCommand, sendCommandDirect, initDialogInterceptor } from './game/commands/index.js';
import { initSaveHandlers, quickSave, quickLoad } from './game/save-manager.js';
import { initGameSelection } from './game/game-loader.js';

// Features
import './features/auto-mapper.js';  // Auto-mapping location tracker (lightweight, must run always)
// Map canvas UI (~2500 lines) lazy loaded on demand
let mapModule = null;

// Utility modules
import { initKeepAwake, enableKeepAwake, disableKeepAwake, isKeepAwakeEnabled, activateIfEnabled } from './utils/wake-lock.js';
import { initLockScreen, lockScreen, unlockScreen, isScreenLocked, toggleLockScreen, updateLockScreenMicStatus, updateLockButtonVisibility } from './utils/lock-screen.js';
import { playMuteTone, playUnmuteTone } from './utils/audio-feedback.js';

// PWA Service Worker Registration with Beautiful Update Notification
if ('serviceWorker' in navigator) {
  let updateAvailable = false;
  let waitingWorker = null;
  let newVersionNumber = null; // Track the new version from service worker
  let lastNotificationTime = 0; // Prevent showing notification multiple times

  // Helper function to extract version from cache names
  async function getLatestCacheVersion() {
    try {
      const cacheNames = await caches.keys();
      // Find all IFTalk core cache names (e.g., "iftalk-core-v1.5.117")
      const versions = cacheNames
        .filter(name => name.startsWith('iftalk-core-v'))
        .map(name => name.replace('iftalk-core-v', ''))
        .sort((a, b) => {
          // Sort by version number (simple string comparison works for x.y.z format)
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

  // Function to show beautiful update notification
  async function showUpdateNotification() {
    // Prevent showing notification if we just applied an update (within last 5 seconds)
    const justUpdated = sessionStorage.getItem('iftalk_just_updated');
    if (justUpdated) {
      const timeSinceUpdate = Date.now() - parseInt(justUpdated);
      if (timeSinceUpdate < 5000) {
        return;
      }
      // Clear the flag after 5 seconds
      sessionStorage.removeItem('iftalk_just_updated');
    }

    // Prevent showing notification if it was shown in the last 2 seconds
    const now = Date.now();
    if (now - lastNotificationTime < 2000) {
      return;
    }
    lastNotificationTime = now;

    // Check if we're already on the latest version
    // This prevents duplicate notifications after updating
    try {
      const { APP_CONFIG } = await import('./config.js');
      const currentVersion = `v${APP_CONFIG.version}`;

      // Get the new version from service worker or cache
      const newVersion = newVersionNumber || await getLatestCacheVersion();

      // If versions match, we're already up to date - don't show notification
      if (newVersion && currentVersion === newVersion) {
        return;
      }
    } catch (err) {
      // If version check fails, continue and show notification
      // (better to show unnecessary notification than miss a real update)
    }

    // Remove existing notification if any
    const existing = document.getElementById('updateNotification');
    if (existing) {
      existing.remove();
    }

    // Create subdued update notification
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

    // Trigger entrance animation
    setTimeout(() => {
      notification.classList.add('visible');
    }, 100);

    // Auto-refresh countdown (5 seconds)
    let countdown = 5;
    const countdownEl = document.getElementById('updateCountdown');

    const autoRefreshTimer = setInterval(() => {
      countdown--;
      if (countdownEl) {
        countdownEl.textContent = countdown;
      }

      if (countdown <= 0) {
        clearInterval(autoRefreshTimer);
        // Auto-refresh
        if (waitingWorker) {
          sessionStorage.setItem('iftalk_just_updated', Date.now().toString());
          waitingWorker.postMessage({ type: 'SKIP_WAITING' });
        }
        notification.classList.remove('visible');
        setTimeout(() => notification.remove(), 300);
      }
    }, 1000);

    // Handle update button click
    document.getElementById('updateButton').addEventListener('click', () => {
      clearInterval(autoRefreshTimer); // Cancel auto-refresh
      if (waitingWorker) {
        // Mark that we just triggered an update to prevent duplicate notification after reload
        sessionStorage.setItem('iftalk_just_updated', Date.now().toString());
        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      }
      // Reload will happen automatically when controllerchange event fires
      notification.classList.remove('visible');
      setTimeout(() => notification.remove(), 300);
    });

    // Handle dismiss button click
    document.getElementById('updateDismiss').addEventListener('click', () => {
      clearInterval(autoRefreshTimer); // Cancel auto-refresh
      notification.classList.remove('visible');
      setTimeout(() => notification.remove(), 300);
    });
  }

  // Listen for messages from service worker
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'NEW_VERSION_ACTIVATED') {
      // Store the new version number for use in update messages
      newVersionNumber = event.data.version;
    }
  });

  window.addEventListener('load', async () => {
    // Add cache-busting to service worker URL using app version
    // This forces the browser to fetch the new service worker when version changes
    const { APP_CONFIG } = await import('./config.js');
    const cacheBust = APP_CONFIG.version.replace(/\./g, ''); // e.g., 1.5.108 -> 15108
    navigator.serviceWorker.register(`./service-worker.js?v=${cacheBust}`)
      .then(async (registration) => {
        // Check for updates on page load
        registration.update();

        // Check for updates every 30 seconds
        setInterval(() => {
          registration.update();
        }, 30000);

        // Listen for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;

          newWorker.addEventListener('statechange', async () => {
            if (newWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                // New service worker is waiting to activate
                updateAvailable = true;
                waitingWorker = newWorker;
                await showUpdateNotification();
              }
            }
          });
        });

        // Check if there's already a waiting service worker
        if (registration.waiting) {
          updateAvailable = true;
          waitingWorker = registration.waiting;
          await showUpdateNotification();
        }

        // Listen for controlling service worker change
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          window.location.reload();
        });
      })
      .catch(error => {
        console.error('[PWA] Service worker registration failed:', error);
      });
  });
}

// Load Google Identity Services (OAuth) and Picker API - only when online
// This prevents 60-second timeout when offline
if (navigator.onLine) {
  // Load Google Identity Services (for auth)
  const gsiScript = document.createElement('script');
  gsiScript.src = 'https://accounts.google.com/gsi/client';
  gsiScript.async = true;
  gsiScript.defer = true;
  document.head.appendChild(gsiScript);

  // Load Google API client (for Picker)
  const gapiScript = document.createElement('script');
  gapiScript.src = 'https://apis.google.com/js/api.js';
  gapiScript.async = true;
  gapiScript.defer = true;
  document.head.appendChild(gapiScript);
}

// PWA Install Prompt Handling
let deferredPwaPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault();
  // Stash the event so it can be triggered later
  deferredPwaPrompt = e;
  // Show the install button in settings
  const pwaInstallSection = document.getElementById('pwaInstallSection');
  if (pwaInstallSection) {
    pwaInstallSection.classList.remove('hidden');
  }
});

// Handle install button click
window.addEventListener('load', () => {
  const pwaInstallBtn = document.getElementById('pwaInstallBtn');
  if (pwaInstallBtn) {
    pwaInstallBtn.addEventListener('click', async () => {
      if (!deferredPwaPrompt) {
        return;
      }
      // Show the install prompt
      deferredPwaPrompt.prompt();
      // Wait for the user to respond
      const { outcome } = await deferredPwaPrompt.userChoice;
      // Clear the deferred prompt
      deferredPwaPrompt = null;
      // Hide the install button
      const pwaInstallSection = document.getElementById('pwaInstallSection');
      if (pwaInstallSection) {
        pwaInstallSection.classList.add('hidden');
      }
    });
  }
});

// Handle update button click
window.addEventListener('load', () => {
  const updatePwaBtn = document.getElementById('updatePwaBtn');
  if (updatePwaBtn) {
    updatePwaBtn.addEventListener('click', async () => {
      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          if (registration) {
            // Check for updates
            await registration.update();

            // If there's a waiting service worker, activate it
            if (registration.waiting) {
              // Try to get version from cache, message, or use 'latest'
              const newVersion = newVersionNumber || await getLatestCacheVersion() || 'latest';
              alert(`Update found!\n\nUpdating to version ${newVersion}.\n\nThe page will reload now.`);
              // Mark that we just triggered an update to prevent duplicate notification after reload
              sessionStorage.setItem('iftalk_just_updated', Date.now().toString());
              registration.waiting.postMessage({ type: 'SKIP_WAITING' });
              setTimeout(() => window.location.reload(), 500);
            } else {
              const { APP_CONFIG } = await import('./config.js');
              alert(`No updates found.\n\nYou're already on the latest version (${APP_CONFIG.version}).`);
            }
          } else {
            alert('Service worker not registered.\n\nPlease reload the app and try again.');
          }
        } catch (err) {
          alert('Update check failed.\n\nPlease check your connection and try again.');
        }
      } else {
        alert('Service worker not supported.\n\nYour browser may not support offline features.');
      }
    });
  }
});

// Detect if app is already installed (standalone mode)
window.addEventListener('load', () => {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone
    || document.referrer.includes('android-app://');

  if (isStandalone) {
    // Hide install button if already installed
    const pwaInstallSection = document.getElementById('pwaInstallSection');
    if (pwaInstallSection) {
      pwaInstallSection.classList.add('hidden');
    }
  } else {
    // Detect iOS devices (which don't support beforeinstallprompt)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    if (isIOS && !isStandalone) {
      // Show iOS-specific install instructions
      const pwaInstallSection = document.getElementById('pwaInstallSection');
      const pwaInstallBtn = document.getElementById('pwaInstallBtn');
      const pwaInstallDescription = document.getElementById('pwaInstallDescription');

      if (pwaInstallSection && pwaInstallBtn && pwaInstallDescription) {
        pwaInstallSection.classList.remove('hidden');
        pwaInstallBtn.innerHTML = '<span class="material-icons">ios_share</span> Install App (iOS)';
        pwaInstallDescription.innerHTML = 'Tap the Share button <span class="material-icons" style="vertical-align:middle;font-size:16px;">ios_share</span> in Safari, then select "Add to Home Screen"';

        // Make button show an alert with instructions instead of triggering prompt
        pwaInstallBtn.addEventListener('click', () => {
          alert('To install Voxi on iOS:\n\n1. Tap the Share button (□↑) at the bottom of Safari\n2. Scroll down and tap "Add to Home Screen"\n3. Tap "Add" to confirm\n\nVoxi will then appear on your home screen like a native app!');
        });
      }
    }
  }
});

// Voice command handlers (exported so typed commands can use them too)
export const voiceCommandHandlers = {
  restart: () => {
    // Voice navigation commands enable autoplay
    state.autoplayEnabled = true;
    skipToStart(() => speakTextChunked(null, state.currentChunkIndex));
  },
  back: () => {
    // Voice navigation commands enable autoplay
    state.autoplayEnabled = true;
    skipToChunk(-1, () => speakTextChunked(null, state.currentChunkIndex));
  },
  backN: (count) => {
    // Voice navigation commands enable autoplay
    state.autoplayEnabled = true;
    skipToChunk(-count, () => speakTextChunked(null, state.currentChunkIndex));
  },
  pause: () => {
    // Switch to MANUAL mode (same as clicking pause button)
    if (state.autoplayEnabled || state.isNarrating) {
      state.autoplayEnabled = false;
      state.narrationEnabled = false;
      state.isPaused = true;
      stopNarration(true);  // Preserve highlight when pausing

      // Auto-mute mic when pausing (unless manually controlled or in push-to-talk mode)
      // TEMPORARILY DISABLED for debugging
      if (false && !state.pushToTalkMode && !state.isMuted && !state.manuallyMuted) {
        state.isMuted = true;
        state.listeningEnabled = false;

        // Update UI to reflect muted state
        playMuteTone();
        const icon = dom.muteBtn?.querySelector('.material-icons');
        if (icon) icon.textContent = 'mic_off';
        if (dom.muteBtn) {
          dom.muteBtn.classList.add('muted');
          dom.muteBtn.classList.remove('listening');
          dom.muteBtn.style.setProperty('--mic-intensity', '0');
        }
        stopVoiceMeter();
        updateLockScreenMicStatus();

        // Stop voice recognition
        if (state.recognition && state.isRecognitionActive) {
          try {
            state.recognition.stop();
          } catch (err) {
            // Recognition already stopped
          }
        }
      }

      updateStatus('Autoplay off');
      updateNavButtons();
    }
  },
  play: async () => {
    // If at end, restart from beginning (like "repeat")
    if (state.narrationChunks.length > 0 && state.currentChunkIndex >= state.narrationChunks.length) {
      state.autoplayEnabled = true;
      skipToStart(() => speakTextChunked(null, state.currentChunkIndex));
      return;
    }

    // Only act if not already in autoplay mode
    if (!state.autoplayEnabled) {
      // Switch to AUTOPLAY mode (same as clicking play button)
      state.autoplayEnabled = true;
      state.narrationEnabled = true;
      state.isPaused = false;

      // Auto-unmute mic when playing (unless manually controlled or in push-to-talk mode)
      // TEMPORARILY DISABLED for debugging
      if (false && !state.pushToTalkMode && state.isMuted && !state.manuallyMuted) {
        state.isMuted = false;
        state.listeningEnabled = true;

        // Update UI to reflect unmuted state
        playUnmuteTone();
        const icon = dom.muteBtn?.querySelector('.material-icons');
        if (icon) icon.textContent = 'mic';
        if (dom.muteBtn) dom.muteBtn.classList.remove('muted');
        startVoiceMeter();
        updateLockScreenMicStatus();

        // Restart voice recognition if needed
        if (state.recognition && !state.isRecognitionActive) {
          try {
            state.recognition.start();
          } catch (err) {
            // Recognition already running or failed to start
          }
        }
      }

      // Start playing from current position (if not at end)
      if (state.narrationChunks.length > 0 && state.currentChunkIndex < state.narrationChunks.length) {
        speakTextChunked(null, state.currentChunkIndex);
      } else {
        // No chunks - try to read the last game response
        const { ensureChunksReady } = await import('./ui/game-output.js');

        const lowerWindow = document.getElementById('lowerWindow');
        const gameTexts = lowerWindow?.querySelectorAll('.game-text');
        const lastGameText = gameTexts && gameTexts.length > 0 ? gameTexts[gameTexts.length - 1] : null;

        if (lastGameText) {
          state.currentGameTextElement = lastGameText;
          state.chunksValid = false;
          state.narrationChunks = [];

          if (ensureChunksReady() && state.narrationChunks.length > 0) {
            state.currentChunkIndex = 0;
            speakTextChunked(null, 0);
          }
        }
      }
      updateNavButtons();
    }
  },
  skip: () => {
    // Voice navigation commands enable autoplay
    state.autoplayEnabled = true;
    skipToChunk(1, () => speakTextChunked(null, state.currentChunkIndex));
  },
  skipN: (count) => {
    // Voice navigation commands enable autoplay
    state.autoplayEnabled = true;
    skipToChunk(count, () => speakTextChunked(null, state.currentChunkIndex));
  },
  skipToEnd: () => {
    // Voice navigation commands enable autoplay
    state.autoplayEnabled = true;
    skipToEnd();
  },
  status: () => {
    // Read status bar content
    const statusText = dom.statusBar?.textContent?.trim();
    if (statusText) {
      speakAppMessage(statusText);
      updateStatus('Reading status');
    } else {
      speakAppMessage('No status presently shown');
      updateStatus('No status to read');
    }
  },
  quickSave: () => {
    quickSave();
  },
  quickLoad: () => {
    quickLoad();
  },
  restoreLatest: async () => {
    try {
      const { handleRestoreCommand } = await import('./game/commands/meta-command-handlers.js');
      await handleRestoreCommand();
    } catch (error) {
      console.error('Error in restoreLatest:', error);
      updateStatus('Restore failed', 'error');
      speakAppMessage('Restore command failed');
    }
  },
  restoreSlot: async (slot) => {
    try {
      const { getUnifiedSavesList } = await import('./game/commands/save-list-formatter.js');
      const { handleMetaResponse, setAwaitingMetaInput } = await import('./game/commands/meta-command-handlers.js');

      const allSaves = getUnifiedSavesList();

      if (!slot || slot < 1 || slot > allSaves.length) {
        speakAppMessage(`Invalid slot number. There are ${allSaves.length} saved games.`);
        updateStatus('Invalid slot number');
        return;
      }

      setAwaitingMetaInput('restore');
      await handleMetaResponse(slot.toString());
    } catch (error) {
      console.error('Error in restoreSlot:', error);
      updateStatus('Restore failed', 'error');
      speakAppMessage('Restore command failed');
    }
  },
  saveGame: async () => {
    try {
      const { handleSaveCommand } = await import('./game/commands/meta-command-handlers.js');
      await handleSaveCommand();
    } catch (error) {
      console.error('Error in saveGame:', error);
      updateStatus('Save failed', 'error');
      speakAppMessage('Save command failed');
    }
  },
  unmute: async () => {
    // Temporarily set state to attempt unmute
    state.isMuted = false;
    state.manuallyMuted = false;  // User manually unmuted - allow auto-management again
    state.listeningEnabled = true;
    const icon = dom.muteBtn?.querySelector('.material-icons');
    if (icon) icon.textContent = 'mic';
    if (dom.muteBtn) dom.muteBtn.classList.remove('muted');
    startVoiceMeter();
    updateStatus('Starting microphone...');
    updateNavButtons();
    updateLockScreenMicStatus();
    updateLockButtonVisibility();

    // Update message input placeholder
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
      messageInput.placeholder = 'Say command...';
    }

    // Try to start voice recognition
    if (state.recognition && !state.isRecognitionActive) {
      const { startRecognitionSafely } = await import('./voice/recognition.js');
      const success = await startRecognitionSafely();

      // If recognition started successfully, play unmute tone
      if (success) {
        playUnmuteTone();
        updateStatus('Microphone unmuted - Listening...');
      } else {
        // If recognition failed to start, revert UI to muted state
        // (error buzz already played by startRecognitionSafely)
        state.isMuted = true;
        state.listeningEnabled = false;
        const icon = dom.muteBtn?.querySelector('.material-icons');
        if (icon) icon.textContent = 'mic_off';
        if (dom.muteBtn) {
          dom.muteBtn.classList.add('muted');
          dom.muteBtn.classList.remove('listening');
          dom.muteBtn.style.setProperty('--mic-intensity', '0');
        }
        stopVoiceMeter();
        updateNavButtons();
        updateLockScreenMicStatus();
        updateLockButtonVisibility();

        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
          messageInput.placeholder = 'Type a command...';
        }
      }
    } else {
      // Recognition not available or already active
      playUnmuteTone();
      updateStatus('Microphone unmuted - Listening...');
    }
  },
  mute: () => {
    playMuteTone();
    state.isMuted = true;
    state.manuallyMuted = true;  // User manually muted - break auto-link to play/pause
    state.listeningEnabled = false;  // Fully disable mic when muted
    const icon = dom.muteBtn?.querySelector('.material-icons');
    if (icon) icon.textContent = 'mic_off';
    if (dom.muteBtn) {
      dom.muteBtn.classList.add('muted');
      dom.muteBtn.classList.remove('listening');
      dom.muteBtn.style.setProperty('--mic-intensity', '0');
    }
    stopVoiceMeter();
    updateStatus('Microphone muted');
    updateNavButtons();
    updateLockScreenMicStatus();
    updateLockButtonVisibility();

    // Update message input placeholder
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
      messageInput.placeholder = 'Type a command...';
    }

    // Stop voice recognition completely when muted
    if (state.recognition && state.isRecognitionActive) {
      try {
        state.recognition.stop();
      } catch (err) {
        // Ignore stop errors
      }
    }
  },
  holdMic: async () => {
    playMuteTone();
    state.isHoldMic = true;

    // Clear any interim transcript to prevent it from being displayed
    state.currentInterimTranscript = '';

    updateStatus('Mic locked - Say "Unlock mic" to resume');

    // Update voice transcript to show "Mic locked"
    updateVoiceTranscript('Mic locked', 'listening');
    if (dom.voiceTranscript) {
      dom.voiceTranscript.textContent = 'Mic locked';
    }

    // Display in game area as system message (auto-narrated only in play mode)
    const { addGameText } = await import('./ui/game-output.js');
    addGameText('<div class="system-message">Mic locked. Say "unlock mic" to resume.</div>', false);

    // Update lock screen if it's active
    const { updateLockScreenMicStatus } = await import('./utils/lock-screen.js');
    updateLockScreenMicStatus();

    // Keep mic active but only listening for "unlock mic"
    // Don't stop recognition - we still want to hear "unlock mic"
  },
  openMic: async () => {
    playUnmuteTone();
    state.isHoldMic = false;
    updateStatus('Microphone listening...');

    // Update voice transcript to show "Listening..."
    updateVoiceTranscript('Listening...', 'listening');
    if (dom.voiceTranscript) {
      dom.voiceTranscript.textContent = 'Listening...';
    }

    // Display in game area as system message (auto-narrated only in play mode)
    const { addGameText } = await import('./ui/game-output.js');
    addGameText('<div class="system-message">Microphone listening</div>', false);

    // Update lock screen if it's active
    const { updateLockScreenMicStatus } = await import('./utils/lock-screen.js');
    updateLockScreenMicStatus();
  },
  sendCommandDirect: (cmd) => sendCommandDirect(cmd),
};

// Handle game output from GlkOte
function handleGameOutput(text) {

  // Store for potential narration
  // Note: Don't stop narration here - speakTextChunked() handles stopping the old session
  // properly with a 50ms delay to let the old loop exit cleanly
  state.pendingNarrationText = text;

  // STRICT CHECK: Auto-start narration ONLY if autoplay is explicitly enabled
  if (state.autoplayEnabled === true) {
    // Check if we have a restored chunk index from autoload
    const startIndex = state.restoredChunkIndex !== null ? state.restoredChunkIndex : 0;

    // Clear the restored index so it's only used once
    state.restoredChunkIndex = null;

    // Enable narration and start playing
    state.narrationEnabled = true;
    state.isPaused = false;

    // Start narration (chunks will be created on-demand)
    speakTextChunked(null, startIndex);
  }
}

// Initialize app
async function initApp() {
  // Fix mobile viewport height for browser chrome and keyboard
  let viewportUpdateTimeout;
  let previousViewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;

  function setMobileViewportHeight() {
    // Throttle updates to reduce flashing during keyboard animation
    clearTimeout(viewportUpdateTimeout);
    viewportUpdateTimeout = setTimeout(() => {
      // Detect if keyboard is opening (viewport shrinking) or closing (viewport growing)
      const currentHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      const isKeyboardOpening = currentHeight < previousViewportHeight;
      previousViewportHeight = currentHeight;

      // Save game output scroll position before viewport change
      const gameOutput = document.getElementById('gameOutput');
      // Calculate the position of the bottom edge of the viewport in the content
      const oldClientHeight = gameOutput ? gameOutput.clientHeight : 0;
      const bottomPosition = gameOutput ? gameOutput.scrollTop + oldClientHeight : 0;

      // Use visualViewport when available (better for mobile keyboard handling)
      const vh = currentHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);

      // Lock document scroll to prevent black space
      requestAnimationFrame(() => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      });

      // Restore game output scroll - instant for both opening and closing
      // BUT skip this if we're intentionally closing keyboard to show new content
      const scrollDelay = 0;
      setTimeout(() => {
        if (gameOutput && !window.skipBottomLinePinning) {
          // Pin the bottom line: keep the same content at the bottom edge of the viewport
          const newClientHeight = gameOutput.clientHeight;
          gameOutput.scrollTop = bottomPosition - newClientHeight;
        }
        // Clear flag after use
        window.skipBottomLinePinning = false;
      }, scrollDelay);
    }, 150); // 150ms delay before viewport resize
  }

  setMobileViewportHeight();
  window.addEventListener('resize', setMobileViewportHeight);

  // Also listen to visualViewport resize for better keyboard handling
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', setMobileViewportHeight);
  }

  window.addEventListener('orientationchange', () => {
    setMobileViewportHeight();
    // Restart voice recognition after orientation change (can terminate recognition)
    setTimeout(() => {
      if (state.listeningEnabled && state.recognition && !state.isRecognitionActive) {
        try {
          state.recognition.start();
        } catch (err) {
          // Voice recognition already active or failed to restart
        }
      }
    }, 500); // Wait for orientation transition to complete
  });

  // Initialize DOM
  initDOM();

  // Inject version from config into status bars
  import('./config.js').then(({ APP_CONFIG }) => {
    document.querySelectorAll('.status-version').forEach(el => {
      el.textContent = `v${APP_CONFIG.version}`;
    });
  });

  // Update welcome screen status bar with protocol indicator
  const welcomeStatusProtocol = document.getElementById('welcomeStatusProtocol');
  if (welcomeStatusProtocol && window.location.protocol === 'http:') {
    welcomeStatusProtocol.textContent = 'HTTP';
  }

  // Setup game card info icons - set data-title from parent game-title text
  // Click handling is done by initHelpTooltips() for all tooltips
  document.querySelectorAll('.game-meta').forEach(el => {
    const titleEl = el.closest('.game-title');
    if (titleEl) {
      const titleText = titleEl.childNodes[0]?.textContent?.trim() || '';
      el.dataset.title = titleText;
    }
  });

  // Browser back button is handled in game-loader.js

  // Add debug event listener for chunk highlighting
  window.addEventListener('chunkHighlighted', async (e) => {
    const { chunkIndex, chunkText, totalChunks, success } = e.detail;

    // Query DOM for markers to verify they exist
    const statusEl = window.currentStatusBarElement || document.getElementById('statusBar');
    const mainEl = state.currentGameTextElement;
    const upperEl = document.getElementById('upperWindow');

    const startMarkers = [];
    const endMarkers = [];

    if (statusEl) {
      startMarkers.push(...statusEl.querySelectorAll(`.chunk-marker-start[data-chunk="${chunkIndex}"]`));
      endMarkers.push(...statusEl.querySelectorAll(`.chunk-marker-end[data-chunk="${chunkIndex}"]`));
    }
    if (upperEl) {
      startMarkers.push(...upperEl.querySelectorAll(`.chunk-marker-start[data-chunk="${chunkIndex}"]`));
      endMarkers.push(...upperEl.querySelectorAll(`.chunk-marker-end[data-chunk="${chunkIndex}"]`));
    }
    if (mainEl) {
      startMarkers.push(...mainEl.querySelectorAll(`.chunk-marker-start[data-chunk="${chunkIndex}"]`));
      endMarkers.push(...mainEl.querySelectorAll(`.chunk-marker-end[data-chunk="${chunkIndex}"]`));
    }


    // Check CSS Highlights API
    if (CSS.highlights) {
      const highlight = CSS.highlights.get('speaking');
      if (highlight) {
      }
    }
  });

  // Load voice configuration (with timeout, non-blocking)
  loadBrowserVoiceConfig().catch(() => {
    // Voice config failed (expected offline)
  });

  // Initialize voice recognition in background (non-blocking)
  // This allows it to work offline if device supports it, but doesn't delay app load
  setTimeout(() => {
    try {
      const processVoice = (transcript, confidence) => processVoiceKeywords(transcript, voiceCommandHandlers, confidence);
      state.recognition = initVoiceRecognition(processVoice);

      // Update lock button visibility now that recognition is initialized
      updateLockButtonVisibility();
    } catch (error) {
      // Voice recognition failed
    }
  }, 100); // Small delay to let app finish loading first

  // Make sendCommand available globally for recognition module
  window._sendCommand = () => {
    const cmd = dom.userInput ? dom.userInput.value.trim() : '';
    if (cmd) {
      sendCommandDirect(cmd, true); // true = isVoiceCommand
      if (dom.userInput) dom.userInput.value = '';
    }
  };

  // Initialize voice controls visibility from global settings
  const voiceControlsEnabled = localStorage.getItem('iftalk_voiceControlsEnabled') !== 'false';
  const controls = document.getElementById('controls');
  if (controls && !voiceControlsEnabled) {
    controls.classList.add('hidden');
    document.body.classList.add('voice-controls-hidden');
  }

  // Load global audio settings into state
  if (!state.browserVoiceConfig) state.browserVoiceConfig = {};
  state.browserVoiceConfig.voice = localStorage.getItem('iftalk_narratorVoice') || state.browserVoiceConfig.voice;
  state.browserVoiceConfig.appVoice = localStorage.getItem('iftalk_appVoice') || state.browserVoiceConfig.appVoice;
  state.browserVoiceConfig.rate = parseFloat(localStorage.getItem('iftalk_speechRate') || state.browserVoiceConfig.rate || '1.0');
  state.browserVoiceConfig.volume = parseFloat(localStorage.getItem('iftalk_masterVolume') || '100') / 100;

  // Initialize UI components
  initAllSettings();
  initHistoryButtons();
  initConfirmDialog();
  initMobileMenu();
  initScrollDownButton();
  initSaveHandlers();
  initDialogInterceptor();
  initScrollDetection();

  // Initialize Google Drive sync (optional, non-blocking)
  import('./utils/gdrive/index.js').then(({ initGDriveSync }) => {
    return initGDriveSync();
  }).catch(error => {
    // Google Drive init failed (expected offline)
    // Hide Cloud Sync section if init fails
    const cloudSyncSection = document.getElementById('cloudSyncSection');
    if (cloudSyncSection) cloudSyncSection.style.display = 'none';
  });

  // Initialize keep awake (screen wake lock)
  initKeepAwake();
  const keepAwakeToggle = document.getElementById('keepAwakeToggle');
  if (keepAwakeToggle) {
    keepAwakeToggle.checked = isKeepAwakeEnabled();
    keepAwakeToggle.addEventListener('change', (e) => {
      if (e.target.checked) {
        enableKeepAwake();
        updateStatus('Keep awake enabled - screen will stay on');
      } else {
        disableKeepAwake();
        updateStatus('Keep awake disabled');
      }
    });
  }

  // Initialize tap-to-examine toggle
  const tapToExamineToggle = document.getElementById('tapToExamineToggle');
  if (tapToExamineToggle) {
    const saved = localStorage.getItem('iftalk_tap_to_examine');
    tapToExamineToggle.checked = saved !== 'false'; // default enabled

    // Set initial body class based on saved setting
    if (saved !== 'false') {
      document.body.classList.add('tap-to-examine-enabled');
    } else {
      document.body.classList.remove('tap-to-examine-enabled');
    }

    tapToExamineToggle.addEventListener('change', (e) => {
      localStorage.setItem('iftalk_tap_to_examine', e.target.checked.toString());
      updateStatus(`Tap to examine ${e.target.checked ? 'enabled' : 'disabled'}`);

      // Update cursor immediately via body class
      if (e.target.checked) {
        document.body.classList.add('tap-to-examine-enabled');
      } else {
        document.body.classList.remove('tap-to-examine-enabled');
      }
    });
  }

  // Initialize push-to-talk mode toggle
  const pushToTalkToggle = document.getElementById('pushToTalkToggle');
  if (pushToTalkToggle) {
    const saved = localStorage.getItem('iftalk_push_to_talk');
    state.pushToTalkMode = saved === 'true'; // default disabled
    pushToTalkToggle.checked = state.pushToTalkMode;

    // If push-to-talk mode is enabled on startup, ensure mic is muted
    if (state.pushToTalkMode) {
      state.isMuted = true;
      state.listeningEnabled = false;
    }

    pushToTalkToggle.addEventListener('change', (e) => {
      state.pushToTalkMode = e.target.checked;
      localStorage.setItem('iftalk_push_to_talk', e.target.checked.toString());

      if (e.target.checked) {
        updateStatus('Push-to-talk mode enabled - Hold mic button to speak');
        // Stop continuous listening and mute
        if (state.recognition && state.isRecognitionActive) {
          try {
            state.recognition.stop();
          } catch (err) {
            // Recognition already stopped
          }
        }
        state.isMuted = true;
        state.listeningEnabled = false;

        // Update UI to show muted state
        const icon = dom.muteBtn?.querySelector('.material-icons');
        if (icon) icon.textContent = 'mic_off';
        if (dom.muteBtn) {
          dom.muteBtn.classList.add('muted');
          dom.muteBtn.classList.remove('listening');
        }
        updateLockScreenMicStatus();
      } else {
        updateStatus('Push-to-talk mode disabled - Continuous listening');
        // Resume continuous listening if mic is unmuted
        if (!state.isMuted && state.recognition && !state.isRecognitionActive) {
          state.listeningEnabled = true;
          try {
            state.recognition.start();
          } catch (err) {
            // Recognition already running
          }
        }
      }
    });
  }

  // Initialize keep keyboard open toggle (mobile only)
  const keepKeyboardOpenToggle = document.getElementById('keepKeyboardOpenToggle');
  if (keepKeyboardOpenToggle) {
    const saved = localStorage.getItem('iftalk_keep_keyboard_open');
    keepKeyboardOpenToggle.checked = saved === 'true'; // default disabled

    keepKeyboardOpenToggle.addEventListener('change', (e) => {
      localStorage.setItem('iftalk_keep_keyboard_open', e.target.checked.toString());
      updateStatus(`Keyboard ${e.target.checked ? 'will stay open' : 'will auto-close'}`);
    });
  }

  // Initialize help icon tooltips (shared utility for all help icons)
  initHelpTooltips();

  // Initialize lock screen (mobile only)
  initLockScreen();
  const lockScreenBtn = document.getElementById('lockScreenBtn');
  if (lockScreenBtn) {
    lockScreenBtn.addEventListener('click', () => {
      lockScreen();
    });
  }

  // Initialize map canvas - lazy load on first use
  const mapBtn = document.getElementById('mapBtn');
  if (mapBtn) {
    mapBtn.addEventListener('click', async () => {
      if (!mapModule) {
        // First time opening map - load UI modules dynamically (~2500 lines)
        // Auto-mapper has been tracking locations since game start
        mapModule = await import('./features/map-canvas.js');
        mapModule.initMapCanvas();
      }
      mapModule.showMap();
    });
  }

  // Initialize mute button state to match default (muted)
  if (dom.muteBtn) {
    const icon = dom.muteBtn.querySelector('.material-icons');
    if (icon) icon.textContent = 'mic_off';
    dom.muteBtn.classList.add('muted');
  }

  // Initialize game selection with output callback
  initGameSelection(handleGameOutput);

  // Navigation button handlers
  const skipToStartBtn = document.getElementById('skipToStartBtn');
  if (skipToStartBtn) {
    const handleSkipToStart = () => {
      state.autoplayEnabled = true;  // Enable autoplay when clicking nav buttons
      skipToStart(() => speakTextChunked(null, state.currentChunkIndex));
    };
    skipToStartBtn.addEventListener('click', handleSkipToStart);
    skipToStartBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSkipToStart();
      }
    });
  }

  const prevChunkBtn = document.getElementById('prevChunkBtn');
  if (prevChunkBtn) {
    const handlePrev = () => {
      state.autoplayEnabled = true;  // Enable autoplay when clicking nav buttons
      skipToChunk(-1, () => speakTextChunked(null, state.currentChunkIndex));
    };
    prevChunkBtn.addEventListener('click', handlePrev);
    prevChunkBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handlePrev();
      }
    });
  }

  const pausePlayBtn = document.getElementById('pausePlayBtn');
  if (pausePlayBtn) {
    const handlePausePlay = async () => {
      if (state.autoplayEnabled) {
        // Currently in AUTOPLAY mode - switch to MANUAL mode
        state.autoplayEnabled = false;
        state.narrationEnabled = false;
        state.isPaused = true;
        stopNarration(true);  // Preserve highlight when pausing

        // Auto-mute mic when pausing (unless manually controlled or in push-to-talk mode)
        // TEMPORARILY DISABLED for debugging
        if (false && !state.pushToTalkMode && !state.isMuted && !state.manuallyMuted) {
          state.isMuted = true;
          state.listeningEnabled = false;

          // Update UI to reflect muted state
          playMuteTone();
          const icon = dom.muteBtn?.querySelector('.material-icons');
          if (icon) icon.textContent = 'mic_off';
          if (dom.muteBtn) {
            dom.muteBtn.classList.add('muted');
            dom.muteBtn.classList.remove('listening');
            dom.muteBtn.style.setProperty('--mic-intensity', '0');
          }
          stopVoiceMeter();
          updateLockScreenMicStatus();

          // Stop voice recognition
          if (state.recognition && state.isRecognitionActive) {
            try {
              state.recognition.stop();
            } catch (err) {
              // Recognition already stopped
            }
          }
        }

        updateStatus('Autoplay off');
        updateNavButtons();
      } else {
        // Currently in MANUAL mode - switch to AUTOPLAY mode
        state.autoplayEnabled = true;
        state.narrationEnabled = true;
        state.isPaused = false;

        // Auto-unmute mic when playing (unless manually controlled or in push-to-talk mode)
        // TEMPORARILY DISABLED for debugging
        if (false && !state.pushToTalkMode && state.isMuted && !state.manuallyMuted) {
          state.isMuted = false;
          state.listeningEnabled = true;

          // Update UI to reflect unmuted state
          playUnmuteTone();
          const icon = dom.muteBtn?.querySelector('.material-icons');
          if (icon) icon.textContent = 'mic';
          if (dom.muteBtn) dom.muteBtn.classList.remove('muted');

          // IMPORTANT: Await microphone permission before starting narration
          // On mobile, getUserMedia shows a permission dialog that can interrupt playback
          await startVoiceMeter();

          updateLockScreenMicStatus();

          // Restart voice recognition if needed
          if (state.recognition && !state.isRecognitionActive) {
            try {
              state.recognition.start();
            } catch (err) {
              // Recognition already running or failed to start
            }
          }
        }

        // Start playing from current position (if not at end)
        if (state.narrationChunks.length > 0 && state.currentChunkIndex < state.narrationChunks.length) {
          // Not at end - resume from current position
          speakTextChunked(null, state.currentChunkIndex);
        } else {
          // At end or no chunks - try to read the last game response
          const { ensureChunksReady } = await import('./ui/game-output.js');

          // Find the last game-text element (not command) to read
          const lowerWindow = document.getElementById('lowerWindow');
          const gameTexts = lowerWindow?.querySelectorAll('.game-text');
          const lastGameText = gameTexts && gameTexts.length > 0 ? gameTexts[gameTexts.length - 1] : null;

          if (lastGameText) {
            // Set as current element and invalidate chunks to rechunk just this element
            state.currentGameTextElement = lastGameText;
            state.chunksValid = false;
            state.narrationChunks = [];
          } else {
            // No game text in lower window - but there might be upper window content
            // (e.g., Photopia intro dialog in grid window)
            // Invalidate chunks to force ensureChunksReady to process upper window
            state.chunksValid = false;
            state.narrationChunks = [];
            state.currentGameTextElement = null;
          }

          // Try to create chunks (will process upper window if present)
          if (ensureChunksReady() && state.narrationChunks.length > 0) {
            // Play the content from the beginning
            state.currentChunkIndex = 0;
            speakTextChunked(null, 0);
          }
        }

        updateStatus('Autoplay on');
        updateNavButtons();
      }
    };
    pausePlayBtn.addEventListener('click', handlePausePlay);
    pausePlayBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handlePausePlay();
      }
    });
  }

  const nextChunkBtn = document.getElementById('nextChunkBtn');
  if (nextChunkBtn) {
    const handleNext = () => {
      state.autoplayEnabled = true;  // Enable autoplay when clicking nav buttons
      skipToChunk(1, () => speakTextChunked(null, state.currentChunkIndex));
    };
    nextChunkBtn.addEventListener('click', handleNext);
    nextChunkBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleNext();
      }
    });
  }

  const skipToEndBtn = document.getElementById('skipToEndBtn');
  if (skipToEndBtn) {
    const handleSkipToEnd = () => {
      state.autoplayEnabled = true;  // Enable autoplay when clicking nav buttons
      skipToEnd();
    };
    skipToEndBtn.addEventListener('click', handleSkipToEnd);
    skipToEndBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSkipToEnd();
      }
    });
  }

  // Talk Mode button - REMOVED
  // Talk mode functionality integrated into play button
  // const talkModeBtn = document.getElementById('talkModeBtn');
  // if (talkModeBtn) { ... }

  // Mute button with push-to-talk support
  if (dom.muteBtn) {
    // Click handler - toggles mute in continuous mode, does nothing in push-to-talk mode
    dom.muteBtn.addEventListener('click', (e) => {
      // Only handle clicks in continuous listening mode
      if (!state.pushToTalkMode) {
        if (state.isMuted) {
          voiceCommandHandlers.unmute();
        } else {
          voiceCommandHandlers.mute();
        }
      }
      // In push-to-talk mode, clicks are ignored (only hold matters)
    });

    // Push-to-talk: Hold to activate mic
    const startPushToTalk = async (e) => {
      if (!state.pushToTalkMode || state.pushToTalkActive) return;

      e.preventDefault();
      state.pushToTalkActive = true;

      dom.muteBtn.classList.add('push-to-talk-active');
      updateStatus('Starting microphone...');

      // Unmute and start recognition
      state.isMuted = false;
      state.listeningEnabled = true;

      // Update UI
      const icon = dom.muteBtn?.querySelector('.material-icons');
      if (icon) icon.textContent = 'mic';
      if (dom.muteBtn) {
        dom.muteBtn.classList.remove('muted');
        dom.muteBtn.classList.add('listening');
      }
      updateLockScreenMicStatus();

      // Try to start recognition
      if (state.recognition && !state.isRecognitionActive) {
        const { startRecognitionSafely } = await import('./voice/recognition.js');
        const success = await startRecognitionSafely();

        // If recognition started successfully, play unmute tone
        if (success) {
          playUnmuteTone();
          updateStatus('🎤 Listening... Speak now!');
        } else {
          // If recognition failed, revert state
          // (error buzz already played by startRecognitionSafely)
          state.pushToTalkActive = false;
          state.isMuted = true;
          state.listeningEnabled = false;

          dom.muteBtn.classList.remove('push-to-talk-active', 'listening');
          dom.muteBtn.classList.add('muted');

          const icon = dom.muteBtn?.querySelector('.material-icons');
          if (icon) icon.textContent = 'mic_off';

          updateLockScreenMicStatus();
        }
      } else {
        // Recognition already active or not available
        playUnmuteTone();
        updateStatus('🎤 Listening... Speak now!');
      }
    };

    const stopPushToTalk = (e) => {
      if (!state.pushToTalkMode || !state.pushToTalkActive) return;

      e.preventDefault();
      state.pushToTalkActive = false;

      dom.muteBtn.classList.remove('push-to-talk-active');
      updateStatus('Hold mic button to speak');

      // Re-mute and stop recognition
      state.isMuted = true;
      state.listeningEnabled = false;

      // Play mute tone
      playMuteTone();

      // Update UI
      const icon = dom.muteBtn?.querySelector('.material-icons');
      if (icon) icon.textContent = 'mic_off';
      if (dom.muteBtn) {
        dom.muteBtn.classList.add('muted');
        dom.muteBtn.classList.remove('listening');
      }
      updateLockScreenMicStatus();

      if (state.recognition && state.isRecognitionActive) {
        try {
          state.recognition.stop();
        } catch (err) {
          // Recognition already stopped
        }
      }
    };

    // Mouse events (desktop)
    dom.muteBtn.addEventListener('mousedown', startPushToTalk);
    dom.muteBtn.addEventListener('mouseup', stopPushToTalk);
    dom.muteBtn.addEventListener('mouseleave', stopPushToTalk);

    // Touch events (mobile)
    dom.muteBtn.addEventListener('touchstart', startPushToTalk, { passive: false });
    dom.muteBtn.addEventListener('touchend', stopPushToTalk, { passive: false });
    dom.muteBtn.addEventListener('touchcancel', stopPushToTalk, { passive: false });

    // Keyboard events (Enter key)
    dom.muteBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // In continuous mode, toggle on keydown
        if (!state.pushToTalkMode) {
          // Trigger click handler to toggle
          if (state.isMuted) {
            voiceCommandHandlers.unmute();
          } else {
            voiceCommandHandlers.mute();
          }
        } else {
          // In push-to-talk mode, start listening on keydown
          startPushToTalk(e);
        }
      }
    });

    dom.muteBtn.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // In push-to-talk mode, stop listening on keyup
        if (state.pushToTalkMode) {
          stopPushToTalk(e);
        }
        // In continuous mode, keyup does nothing (toggle happened on keydown)
      }
    });
  }


  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Arrow keys - navigation
    if (e.key === 'ArrowLeft') {
      skipToChunk(-1, () => speakTextChunked(null, state.currentChunkIndex));
    } else if (e.key === 'ArrowRight') {
      skipToChunk(1, () => speakTextChunked(null, state.currentChunkIndex));
    }

    // Ctrl+L - Lock/unlock screen (for testing)
    if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      toggleLockScreen();
      return;
    }


    // Escape key is reserved for closing dialogs and clearing input only
    // (No longer stops autoplay/narration)
  });


  // Stop narration immediately when navigating away from page
  window.addEventListener('beforeunload', () => {
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
  });

  // Also handle page hide (for iOS and some mobile browsers)
  window.addEventListener('pagehide', () => {
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
  });

  // Handle page show (returning from bfcache on iOS/mobile)
  window.addEventListener('pageshow', async (event) => {
    // If page was restored from bfcache, restart voice recognition
    if (event.persisted && state.listeningEnabled && state.recognition && !state.isRecognitionActive) {
      // Use startRecognitionSafely for better error handling (detects permission loss)
      const { startRecognitionSafely } = await import('./voice/recognition.js');
      await startRecognitionSafely();
    }
  });

  // Handle visibility change (tab switch, minimize, lock screen, etc.)
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) {
      // Page hidden: pause narration immediately (like pause button)
      if (state.isNarrating && !state.isPaused) {
        state.isPaused = true;
        state.pausedByTabSwitch = true;  // Track that this was auto-paused
      }
      // Cancel speech synthesis immediately
      if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
      }

      // Stop voice recognition when tab is hidden
      if (state.recognition && state.isRecognitionActive) {
        try {
          // If there's interim text, send it as 0% confidence command
          if (state.currentInterimTranscript && state.currentInterimTranscript.trim()) {
            const { sendCommandDirect } = await import('./game/commands/command-router.js');
            sendCommandDirect(state.currentInterimTranscript.trim(), true, 0);
            state.currentInterimTranscript = '';
          }

          state.recognition.stop();
        } catch (err) {
          // Error stopping voice recognition
        }
      }
    } else {
      // Page visible again: restart voice recognition if it should be running
      if (state.listeningEnabled && state.recognition && !state.isRecognitionActive) {
        // Use startRecognitionSafely for better error handling (detects permission loss)
        const { startRecognitionSafely } = await import('./voice/recognition.js');
        await startRecognitionSafely();
      }

      // Auto-resume narration if it was paused by tab switch
      if (state.pausedByTabSwitch && state.isPaused) {
        state.pausedByTabSwitch = false;
        state.isPaused = false;
        // Resume from current chunk
        speakTextChunked(null, state.currentChunkIndex);
      }
    }
  });

  // Handle window focus/blur (app switching, returning from lock screen, etc.)
  window.addEventListener('focus', async () => {
    // Window regained focus: restart voice recognition if it should be running
    setTimeout(async () => {
      if (state.listeningEnabled && state.recognition && !state.isRecognitionActive) {
        // Use startRecognitionSafely for better error handling (detects permission loss)
        const { startRecognitionSafely } = await import('./voice/recognition.js');
        await startRecognitionSafely();
      }
    }, 300); // Small delay to ensure focus is fully restored
  });

  // Smart scroll on window resize to keep content visible
  window.addEventListener('resize', () => {
    if (state.currentGameTextElement) {
      // Use the same smart scroll logic as addGameText
      const walker = document.createTreeWalker(
        state.currentGameTextElement,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (node) => {
            if (node.classList?.contains('blank-line-spacer')) {
              return NodeFilter.FILTER_SKIP;
            }
            const text = node.textContent?.trim();
            if (text && text.length > 0) {
              return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_SKIP;
          }
        }
      );

      const firstTextElement = walker.nextNode();
      const scrollTarget = firstTextElement || state.currentGameTextElement;
      scrollTarget.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  });

}

/**
 * Initialize all tooltips (help icons and info icons)
 * Shared utility for all tooltips across the app (settings panel, home screen, etc.)
 * Supports both hover (desktop) and click (mobile/desktop) interactions
 */
function initHelpTooltips() {
  // Get all tooltip elements
  const tooltipSelectors = [
    '.setting-help-icon',   // Settings panel help icons
    '.voice-help-icon',     // Voice command help icons
    '.info-help-icon',      // General info icons
    '.game-meta'            // Game card info icons (welcome screen)
  ];

  const allTooltips = [];
  tooltipSelectors.forEach(selector => {
    const tooltips = document.querySelectorAll(selector);
    tooltips.forEach(tooltip => allTooltips.push(tooltip));
  });

  if (allTooltips.length === 0) return;

  // Handle click/tap events for all tooltips
  allTooltips.forEach(tooltip => {
    tooltip.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Toggle active class (close if already open, open if was closed)
      const wasActive = tooltip.classList.contains('active');

      // Close all other tooltips first
      allTooltips.forEach(t => t.classList.remove('active'));

      // Toggle this one (close if was open, open if was closed)
      if (!wasActive) {
        tooltip.classList.add('active');
      }
    });
  });

  // Close all tooltips when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest(tooltipSelectors.join(', '))) {
      allTooltips.forEach(tooltip => tooltip.classList.remove('active'));
    }
  });
}

// Initialize when DOM is ready
async function startApp() {
  try {
    await initApp();
  } catch (error) {
    console.error('ERROR in initApp():', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
