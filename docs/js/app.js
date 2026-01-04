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
import { debugLog, showDebugOverlay } from './utils/offline-debug.js';
debugLog('App.js start');

// Core modules
import { state } from './core/state.js';
import { dom, initDOM } from './core/dom.js';
import { updateStatus } from './utils/status.js';

// Make debug overlay accessible globally (for testing)
window.showDebugOverlay = showDebugOverlay;

// Voice modules
import { initVoiceRecognition, showConfirmedTranscript } from './voice/recognition.js';
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
import { initLockScreen, lockScreen, unlockScreen, isScreenLocked, toggleLockScreen, updateLockScreenMicStatus } from './utils/lock-screen.js';
import { playMuteTone, playUnmuteTone } from './utils/audio-feedback.js';

// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(registration => {
        console.log('[PWA] Service worker registered:', registration.scope);
      })
      .catch(error => {
        console.log('[PWA] Service worker registration failed:', error);
      });
  });
}

// Load Google Identity Services (OAuth) - only when online
// This prevents 60-second timeout when offline
debugLog('Checking if should load Google OAuth');
if (navigator.onLine) {
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
  console.log('[OAuth] Loading Google Identity Services');
  debugLog('Google OAuth script added');
} else {
  console.log('[OAuth] Offline - skipping Google Identity Services');
  debugLog('Skipped Google OAuth (offline)');
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
  console.log('[PWA] Install prompt available');
});

// Handle install button click
window.addEventListener('load', () => {
  const pwaInstallBtn = document.getElementById('pwaInstallBtn');
  if (pwaInstallBtn) {
    pwaInstallBtn.addEventListener('click', async () => {
      if (!deferredPwaPrompt) {
        console.log('[PWA] Install prompt not available');
        return;
      }
      // Show the install prompt
      deferredPwaPrompt.prompt();
      // Wait for the user to respond
      const { outcome } = await deferredPwaPrompt.userChoice;
      console.log(`[PWA] User response: ${outcome}`);
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

// Detect if app is already installed (standalone mode)
window.addEventListener('load', () => {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone
    || document.referrer.includes('android-app://');

  if (isStandalone) {
    console.log('[PWA] App running in standalone mode');
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

        console.log('[PWA] iOS detected - showing manual install instructions');
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
    // Only act if not already in autoplay mode
    if (!state.autoplayEnabled) {
      // If at end (not paused), restart from beginning
      if (state.narrationChunks.length > 0 && state.currentChunkIndex >= state.narrationChunks.length) {
        state.autoplayEnabled = true;
        skipToStart(() => speakTextChunked(null, state.currentChunkIndex));
        return;
      }

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
  unmute: () => {
    playUnmuteTone();
    state.isMuted = false;
    state.manuallyMuted = false;  // User manually unmuted - allow auto-management again
    state.listeningEnabled = true;
    const icon = dom.muteBtn?.querySelector('.material-icons');
    if (icon) icon.textContent = 'mic';
    if (dom.muteBtn) dom.muteBtn.classList.remove('muted');
    startVoiceMeter();
    updateStatus('Microphone unmuted - Listening...');
    updateNavButtons();
    updateLockScreenMicStatus();

    // Update message input placeholder
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
      messageInput.placeholder = 'Say command...';
    }

    // Voice recognition should already be running (listening for "unmute")
    // Just verify it's active, start it if needed
    if (state.recognition && !state.isRecognitionActive) {
      try {
        state.recognition.start();
      } catch (err) {
        // Recognition already running or start failed
      }
    }
  },
  mute: () => {
    playMuteTone();
    state.isMuted = true;
    state.manuallyMuted = true;  // User manually muted - break auto-link to play/pause
    // Keep listeningEnabled = true so recognition keeps running for "unmute"
    // state.listeningEnabled = false; // DON'T disable - need to hear "unmute"
    const icon = dom.muteBtn?.querySelector('.material-icons');
    if (icon) icon.textContent = 'mic_off';
    if (dom.muteBtn) {
      dom.muteBtn.classList.add('muted');
      dom.muteBtn.classList.remove('listening');
      dom.muteBtn.style.setProperty('--mic-intensity', '0');
    }
    stopVoiceMeter();
    updateStatus('Microphone muted (say "unmute" to re-enable)');
    updateNavButtons();
    updateLockScreenMicStatus();

    // Update message input placeholder
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
      messageInput.placeholder = 'Type or say "unmute"...';
    }

    // DON'T stop voice recognition - keep it running to listen for "unmute"
  },
  sendCommandDirect: (cmd) => sendCommandDirect(cmd),
  getHint: async function() {
    const { getHint } = await import('./features/hints.js');
    // Respect user's hint type selection from dropdown
    const hintType = localStorage.getItem('iftalk_hintType') || 'general';
    getHint(hintType);
  }
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
  debugLog('initApp() start');

  // Fix mobile viewport height for browser chrome
  function setMobileViewportHeight() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  }

  setMobileViewportHeight();
  window.addEventListener('resize', setMobileViewportHeight);
  debugLog('Viewport height set');
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
  debugLog('Loading voice config (background)...');
  loadBrowserVoiceConfig().then(() => {
    debugLog('Voice config loaded');
  }).catch(() => {
    debugLog('Voice config failed (expected offline)');
  });

  // Initialize voice recognition in background (non-blocking)
  // This allows it to work offline if device supports it, but doesn't delay app load
  debugLog('Initializing voice recognition (background)...');
  setTimeout(() => {
    try {
      const processVoice = (transcript, confidence) => processVoiceKeywords(transcript, voiceCommandHandlers, confidence);
      state.recognition = initVoiceRecognition(processVoice);
      debugLog('Voice recognition ready');
    } catch (error) {
      debugLog('Voice recognition failed: ' + error.message);
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
  initSaveHandlers();
  initDialogInterceptor();
  initScrollDetection();

  // Initialize Google Drive sync (optional, non-blocking)
  debugLog('Initializing Google Drive (background)...');
  import('./utils/gdrive/index.js').then(({ initGDriveSync }) => {
    return initGDriveSync();
  }).then(() => {
    debugLog('Google Drive sync ready');
  }).catch(error => {
    debugLog('Google Drive init failed (expected offline)');
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
    tapToExamineToggle.checked = saved === 'true'; // default disabled

    // Set initial body class based on saved setting
    if (saved === 'true') {
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

    pushToTalkToggle.addEventListener('change', (e) => {
      state.pushToTalkMode = e.target.checked;
      localStorage.setItem('iftalk_push_to_talk', e.target.checked.toString());

      if (e.target.checked) {
        updateStatus('Push-to-talk mode enabled - Hold mic button to speak');
        // Stop continuous listening if currently active
        if (state.recognition && state.isRecognitionActive) {
          try {
            state.recognition.stop();
          } catch (err) {
            // Recognition already stopped
          }
        }
        state.listeningEnabled = false;
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
    skipToStartBtn.addEventListener('click', () => {
      state.autoplayEnabled = true;  // Enable autoplay when clicking nav buttons
      skipToStart(() => speakTextChunked(null, state.currentChunkIndex));
    });
  }

  const prevChunkBtn = document.getElementById('prevChunkBtn');
  if (prevChunkBtn) {
    prevChunkBtn.addEventListener('click', () => {
      state.autoplayEnabled = true;  // Enable autoplay when clicking nav buttons
      skipToChunk(-1, () => speakTextChunked(null, state.currentChunkIndex));
    });
  }

  const pausePlayBtn = document.getElementById('pausePlayBtn');
  if (pausePlayBtn) {
    pausePlayBtn.addEventListener('click', async () => {
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

            if (ensureChunksReady() && state.narrationChunks.length > 0) {
              // Play the last game response from the beginning
              state.currentChunkIndex = 0;
              speakTextChunked(null, 0);
            }
          }
        }

        updateStatus('Autoplay on');
        updateNavButtons();
      }
    });
  }

  const nextChunkBtn = document.getElementById('nextChunkBtn');
  if (nextChunkBtn) {
    nextChunkBtn.addEventListener('click', () => {
      state.autoplayEnabled = true;  // Enable autoplay when clicking nav buttons
      skipToChunk(1, () => speakTextChunked(null, state.currentChunkIndex));
    });
  }

  const skipToEndBtn = document.getElementById('skipToEndBtn');
  if (skipToEndBtn) {
    skipToEndBtn.addEventListener('click', () => {
      state.autoplayEnabled = true;  // Enable autoplay when clicking nav buttons
      skipToEnd();
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
    let pushToTalkActive = false;

    const startPushToTalk = (e) => {
      if (!state.pushToTalkMode || pushToTalkActive) return;

      e.preventDefault();
      pushToTalkActive = true;

      dom.muteBtn.classList.add('push-to-talk-active');
      updateStatus('🎤 Listening... Speak now!');

      // Start recognition
      state.listeningEnabled = true;
      if (state.recognition && !state.isRecognitionActive) {
        try {
          state.recognition.start();
        } catch (err) {
          // Recognition already running
        }
      }
    };

    const stopPushToTalk = (e) => {
      if (!state.pushToTalkMode || !pushToTalkActive) return;

      e.preventDefault();
      pushToTalkActive = false;

      dom.muteBtn.classList.remove('push-to-talk-active');
      updateStatus('Hold mic button to speak');

      // Stop recognition
      state.listeningEnabled = false;
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

    // Ctrl+Shift+H - Get hint from ChatGPT
    if (e.key === 'H' && e.ctrlKey && e.shiftKey) {
      e.preventDefault();
      voiceCommandHandlers.getHint();
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
  window.addEventListener('pageshow', (event) => {
    // If page was restored from bfcache, restart voice recognition
    if (event.persisted && state.listeningEnabled && state.recognition && !state.isRecognitionActive) {
      try {
        state.recognition.start();
      } catch (err) {
        // Voice recognition already active or failed to restart
      }
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
        try {
          state.recognition.start();
        } catch (err) {
          // Voice recognition already active or failed to restart
        }
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
  window.addEventListener('focus', () => {
    // Window regained focus: restart voice recognition if it should be running
    setTimeout(() => {
      if (state.listeningEnabled && state.recognition && !state.isRecognitionActive) {
        try {
          state.recognition.start();
        } catch (err) {
          // Voice recognition already active or failed to restart
        }
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
  debugLog('startApp() called - DOM ready');
  try {
    await initApp();
    debugLog('initApp() completed successfully');
  } catch (error) {
    debugLog('ERROR in initApp(): ' + error.message);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
