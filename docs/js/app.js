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
import { processVoiceKeywords } from './voice/voice-commands.js';

// Narration modules
import { speakTextChunked, stopNarration, speakAppMessage } from './narration/tts-player.js';
import { removeHighlight } from './narration/highlighting.js';
import { skipToChunk, skipToStart, skipToEnd } from './narration/navigation.js';

// UI modules
import { updateNavButtons } from './ui/nav-buttons.js';
import { addGameText, ensureChunksReady } from './ui/game-output.js';
import { initAllSettings, loadBrowserVoiceConfig, updateSettingsContext } from './ui/settings/index.js';
import { toggleSettings, closeSettings, initSaveHandlers } from './ui/settings/settings-panel.js';
import { initHistoryButtons } from './ui/history.js';
import { initConfirmDialog } from './ui/confirm-dialog.js';
import { initFeedbackModal } from './ui/feedback-modal.js';
import { initMobileMenu, updateMobileMenuForGameState } from './ui/mobile-menu.js';
import { initManageSavesModal } from './ui/manage-saves-modal.js';
import { initScrollDownButton, updateButtonVisibility } from './ui/scroll-down-button.js';

// Game modules
import { sendCommandDirect, initDialogInterceptor } from './game/commands/index.js';
import { quickSave } from './game/save-manager.js';
import { initGameSelection } from './game/game-loader.js';

// Features
import './features/auto-mapper.js';  // Auto-mapping location tracker (lightweight, must run always)
// Map canvas UI (~2500 lines) lazy loaded on demand
let mapModule = null;

// Utility modules
import { initKeepAwake, enableKeepAwake, disableKeepAwake, isKeepAwakeEnabled, activateIfEnabled } from './utils/wake-lock.js';
import { initLockScreen, lockScreen, unlockScreen, isScreenLocked, toggleLockScreen, updateLockScreenMicStatus, updateLockButtonVisibility, updateConvModeButton } from './utils/lock-screen.js';
import { playMuteTone, playUnmuteTone } from './utils/audio-feedback.js';
import { initPWA } from './utils/pwa-updater.js';
import { scrollToBottom } from './utils/scroll.js';

// PWA: service worker, update notification, install prompt, standalone detection.
initPWA();

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

// Voice command handlers + pause/play helpers moved to ./voice/command-handlers.js.
// Imported here for internal use, re-exported so existing importers keep working.
import { voiceCommandHandlers, pausePlayback, resumePlayback } from './voice/command-handlers.js';
export { voiceCommandHandlers, pausePlayback, resumePlayback };

// Handle game output from GlkOte
async function handleGameOutput(text) {
  state.narrationT0 = performance.now();

  // Store for potential narration
  // Note: Don't stop narration here - speakTextChunked() handles stopping the old session
  // properly with a 50ms delay to let the old loop exit cleanly
  state.pendingNarrationText = text;

  // Suppress the intro-text update that fires before restore completes on page-reload restores.
  // autoplayEnabled was set in initApp(); addGameText auto-speaks the "Game restored" message,
  // and normal autoplay handles the subsequent LOOK response (char-mode games).
  if (window._suppressFirstNarration) {
    window._suppressFirstNarration = false;
    return;
  }

  // For char mode (PAK/menu screens) build the split chunks NOW, regardless of autoplay.
  // The text arrives pre-cleaned from cleanCharModeText with ". " at every line break and
  // big column gap. Splitting on ". " makes each line/column its own chunk so they narrate
  // with a pause between them. Building here (not only in the autoplay branch) means the
  // play button and "read page" also get the split chunks — otherwise speakTextChunked →
  // ensureChunksReady would rebuild ONE mashed-together chunk from the upper-window DOM.
  // Pieces are left bare (no trailing period) so the inter-chunk pause logic fires.
  const { getInputType } = await import('./game/voxglk.js');
  if (getInputType() === 'char' && text.trim()) {
    document.querySelectorAll('.chunk-marker-start, .chunk-marker-end').forEach(el => el.remove());
    removeHighlight();
    const items = text.trim().split(/\.\s+/).map(t => t.trim()).filter(t => t);
    state.narrationChunks = items.map(item => ({ text: item, voice: 'narrator' }));
    state.chunksValid = true;
    console.log('[PAK chunks]', state.narrationChunks.map(c => c.text));
  }

  // STRICT CHECK: Auto-start narration ONLY if autoplay is explicitly enabled
  if (state.autoplayEnabled === true) {
    // Check if we have a restored chunk index from autoload
    const startIndex = state.restoredChunkIndex !== null ? state.restoredChunkIndex : 0;

    // Clear the restored index so it's only used once
    state.restoredChunkIndex = null;

    // Enable narration and start playing
    state.narrationEnabled = true;
    state.isPaused = false;

    // Start narration (chunks created on-demand for line mode, or already set above for char mode)
    speakTextChunked(null, startIndex);
  }
}

function initViewport() {
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
    // Skip scroll-position pinning on rotation — layout changes too much; just go to bottom
    window.skipBottomLinePinning = true;
    setMobileViewportHeight();
    setTimeout(() => {
      scrollToBottom();
      // Restart voice recognition after orientation change (can terminate recognition)
      if (state.listeningEnabled && state.recognition && !state.isRecognitionActive) {
        try {
          state.recognition.start();
        } catch (err) {
          // Voice recognition already active or failed to restart
        }
      }
    }, 500); // Wait for orientation transition to complete
  });
}

function initDOMandValidation() {
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
}

function initVoice() {
  // Load voice configuration (synchronous, non-blocking)
  try {
    loadBrowserVoiceConfig();
  } catch (e) {
    // Voice config failed (expected offline)
  }

  // Initialize voice recognition in background (non-blocking)
  // This allows it to work offline if device supports it, but doesn't delay app load
  setTimeout(() => {
    try {
      const processVoice = (transcript, confidence) => processVoiceKeywords(transcript, voiceCommandHandlers, confidence);
      state.recognition = initVoiceRecognition(processVoice);

      // Update lock button visibility now that recognition is initialized
      updateLockButtonVisibility();

      // Re-enable mic if it was on before a restore reload (skip if push-to-talk mode)
      if (window._pendingRestoreMic && !state.pushToTalkMode) {
        window._pendingRestoreMic = false;
        voiceCommandHandlers.unmute();
      }
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
}

function initUIComponents() {
  initAllSettings();
  initHistoryButtons();
  initConfirmDialog();
  initFeedbackModal();
  initManageSavesModal();
  initMobileMenu();
  initScrollDownButton();
  initSaveHandlers();
  initDialogInterceptor();
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
  const isTouchDevice = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  if (!isTouchDevice) {
    keepAwakeToggle?.closest('.setting-item')?.remove();
  }
  if (keepAwakeToggle && isTouchDevice) {
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
  if (tapToExamineToggle && !isTouchDevice) {
    const tapLabel = tapToExamineToggle.closest('.setting-item');
    tapLabel.querySelector('label').childNodes[0].textContent = 'Click to Examine';
    tapLabel.querySelector('.setting-description').textContent = 'Click words to enter them in the command input';
  }
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
}

function wireEventListeners() {
  // Navigation button handlers
  const skipToStartBtn = document.getElementById('skipToStartBtn');
  if (skipToStartBtn) {
    const handleSkipToStart = () => {
      state.autoplayEnabled = true;  // Enable autoplay when clicking nav buttons
      skipToStart(() => speakTextChunked(null, state.currentChunkIndex));
    };
    skipToStartBtn.addEventListener('click', (e) => {
      e.preventDefault(); // Prevent keyboard dismissal
      // Preserve focus on input to keep keyboard open
      const activeElement = document.activeElement;
      const isInputFocused = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');

      handleSkipToStart();

      // Restore focus to input after handling action
      if (isInputFocused) {
        setTimeout(() => activeElement.focus(), 0);
      }
    });
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
    prevChunkBtn.addEventListener('click', (e) => {
      e.preventDefault(); // Prevent keyboard dismissal
      // Preserve focus on input to keep keyboard open
      const activeElement = document.activeElement;
      const isInputFocused = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');

      handlePrev();

      // Restore focus to input after handling action
      if (isInputFocused) {
        setTimeout(() => activeElement.focus(), 0);
      }
    });
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
        pausePlayback();
      } else {
        await resumePlayback();
      }
    };
    pausePlayBtn.addEventListener('click', (e) => {
      e.preventDefault(); // Prevent keyboard dismissal
      // Preserve focus on input to keep keyboard open
      const activeElement = document.activeElement;
      const isInputFocused = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');

      handlePausePlay();

      // Restore focus to input after handling pause/play
      if (isInputFocused) {
        setTimeout(() => activeElement.focus(), 0);
      }
    });
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
    nextChunkBtn.addEventListener('click', (e) => {
      e.preventDefault(); // Prevent keyboard dismissal
      // Preserve focus on input to keep keyboard open
      const activeElement = document.activeElement;
      const isInputFocused = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');

      handleNext();

      // Restore focus to input after handling action
      if (isInputFocused) {
        setTimeout(() => activeElement.focus(), 0);
      }
    });
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
    skipToEndBtn.addEventListener('click', (e) => {
      e.preventDefault(); // Prevent keyboard dismissal
      // Preserve focus on input to keep keyboard open
      const activeElement = document.activeElement;
      const isInputFocused = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');

      handleSkipToEnd();

      // Restore focus to input after handling action
      if (isInputFocused) {
        setTimeout(() => activeElement.focus(), 0);
      }
    });
    skipToEndBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSkipToEnd();
      }
    });
  }

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

      // Cancel any pending fallback timer from a previous release and clear
      // stale transcript state so a new session starts clean.
      if (state.pttStopTimeout) {
        clearTimeout(state.pttStopTimeout);
        state.pttStopTimeout = null;
      }
      state.pttPendingTranscript = null;
      state.pttPendingConfidence = null;
      state.currentInterimTranscript = '';

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
      updateStatus('Processing...');

      // IMPORTANT: Don't set isMuted=true yet!
      // Setting isMuted before stop() causes onresult to discard final results
      // Instead, set listeningEnabled=false to prevent auto-restart
      // The onend handler will set isMuted=true after processing results
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
        // Don't call recognition.stop() — on iOS, stop() fires onerror("aborted")
        // which discards the audio buffer before the final result is produced.
        // Instead let recognition finish naturally: it fires onresult(final) once it
        // detects end-of-speech (~300-700ms after the user stops talking), then onend
        // which dispatches and mutes. This gives the proper final result, not raw interim.
        //
        // The 1000ms fallback only fires if onend never arrives (no audio captured, etc).
        state.pttStopTimeout = setTimeout(async () => {
          state.pttStopTimeout = null;
          const { dispatchPTTFallback } = await import('./voice/recognition.js');
          await dispatchPTTFallback();
          if (state.recognition && state.isRecognitionActive) {
            try {
              state.recognition.stop();
            } catch (err) {
              state.isMuted = true;
              updateStatus('Hold mic button to speak');
            }
          } else {
            state.isMuted = true;
            updateStatus('Hold mic button to speak');
          }
        }, 1000);
      } else {
        // Recognition is still starting (onstart hasn't fired yet).
        // Don't mute immediately — that would cause onresult to discard the final.
        // Flag it so onstart stops recognition cleanly and lets onend dispatch the result.
        state.pttReleasePending = true;
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

  // Conversation mode button: one tap starts narration + mic; second tap stops both
  if (dom.convModeBtn) {
    dom.convModeBtn.addEventListener('click', async () => {
      const isConvMode = state.autoplayEnabled && !state.isMuted;
      if (isConvMode) {
        pausePlayback();
        voiceCommandHandlers.mute();
      } else {
        if (state.isMuted) await voiceCommandHandlers.unmute();
        if (!state.autoplayEnabled) await resumePlayback();
        updateConvModeButton();
      }
    });
  }
}

function wireKeyboardShortcuts() {
  // Keyboard shortcuts
  document.addEventListener('keydown', async (e) => {
    // Arrow keys - navigation
    if (e.key === 'ArrowLeft') {
      skipToChunk(-1, () => speakTextChunked(null, state.currentChunkIndex));
    } else if (e.key === 'ArrowRight') {
      skipToChunk(1, () => speakTextChunked(null, state.currentChunkIndex));
    }

    // Ctrl+M - Toggle map
    if (e.key === 'm' && e.ctrlKey) {
      e.preventDefault();
      if (!mapModule) {
        // First time opening map - load UI modules dynamically
        mapModule = await import('./features/map-canvas.js');
        mapModule.initMapCanvas();
      }
      mapModule.toggleMap();
      return;
    }

    // Ctrl+S - Quick save
    if (e.key === 's' && e.ctrlKey) {
      e.preventDefault();
      await quickSave();
      return;
    }

    // Ctrl+R - Open Manage Saves (restore is a deliberate "find the right save" action)
    if (e.key === 'r' && e.ctrlKey) {
      e.preventDefault();
      const { openManageSavesModal } = await import('./ui/manage-saves-modal.js');
      openManageSavesModal();
      return;
    }

    // Ctrl+X - Toggle settings panel
    if (e.key === 'x' && e.ctrlKey) {
      e.preventDefault();
      toggleSettings();
      return;
    }

    // Escape key - Close settings panel if open (otherwise reserved for dialogs)
    if (e.key === 'Escape') {
      // Check if settings panel is open
      if (dom.settingsPanel?.classList.contains('open')) {
        e.preventDefault();
        closeSettings();
        return;
      }
      // Otherwise, Escape is reserved for closing dialogs and clearing input
    }
  });
}

function wireLifecycle() {
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
          // Visibility-change cleanup path; recognition may already be stopped — ignore.
        }
      }
    } else {
      // Page visible again: restart voice recognition if it should be running.
      // Force-clear isRecognitionActive first — the background stop may have left it stale
      // (e.g., onend fired a restart attempt in a hidden tab before our document.hidden guard).
      if (state.listeningEnabled && state.recognition && !state.isMuted) {
        state.isRecognitionActive = false;
        const { startRecognitionSafely } = await import('./voice/recognition.js');
        await startRecognitionSafely();
      }

      // Proactively resume AudioContext — it may be suspended or closed after backgrounding
      import('./utils/audio-feedback.js').then(({ initAudioContext }) => {
        initAudioContext();
      });

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

// Initialize app
async function initApp() {
  // Restore player/mic state preserved across a restore reload
  const savedUiState = sessionStorage.getItem('iftalk_restore_ui_state');
  if (savedUiState) {
    sessionStorage.removeItem('iftalk_restore_ui_state');
    try {
      const ui = JSON.parse(savedUiState);
      if (ui.autoplayEnabled) {
        state.autoplayEnabled = true;
        window._suppressFirstNarration = true;  // suppress intro text on the page-reload update
      }
      if (ui.micUnmuted) window._pendingRestoreMic = true;
      window._pendingRepeatAfterRestore = true;  // speak app message + read section after restore
    } catch (e) {}
  }

  initViewport();
  initDOMandValidation();
  initVoice();
  initUIComponents();
  wireEventListeners();
  wireKeyboardShortcuts();
  wireLifecycle();
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
  window.__startAppCalled = true;
  try {
    await initApp();
    window.__initAppDone = true;
  } catch (error) {
    window.__initAppError = error.message;
    console.error('ERROR in initApp():', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
