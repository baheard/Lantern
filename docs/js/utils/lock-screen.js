/**
 * Lock Screen Module
 *
 * Prevents accidental touches on mobile devices when using IFTalk voice-controlled IF.
 * Features:
 * - Screen dimming (90% black overlay) for battery savings on OLED screens
 * - Unlock via voice command "unlock" OR 1-second hold-to-unlock button
 * - Touch event blocking when locked
 * - Voice recognition and TTS continue in background
 * - Auto-enables "keep awake" mode when locked (prevents screen sleep)
 */

import { state } from '../core/state.js';
import { updateStatus } from './status.js';
import { enableKeepAwake, disableKeepAwake } from './wake-lock.js';

// DOM elements
let lockScreenOverlay = null;
let unlockButton = null;
let unlockProgress = null;
let lockMicButton = null;
let lockMicProgress = null;
let lockMicButtonText = null;
let lockListeningIndicator = null;
let lockMutedIndicator = null;
let lockTranscript = null;

// Hold-to-unlock state
let holdTimer = null;
let holdStartTime = 0;

// Hold-to-speak state
let micHoldActive = false;
let micHoldTimer = null;
let micHoldStartTime = 0;

// Track keep awake state before locking (so we can restore it on unlock)
let wasKeepAwakeEnabledBeforeLock = false;

/**
 * Initialize lock screen module
 */
export function initLockScreen() {
  // Query DOM elements
  lockScreenOverlay = document.getElementById('lockScreenOverlay');
  unlockButton = document.getElementById('unlockButton');
  unlockProgress = document.getElementById('unlockProgress');
  lockMicButton = document.getElementById('lockMicButton');
  lockMicProgress = document.getElementById('lockMicProgress');
  lockMicButtonText = document.getElementById('lockMicButtonText');
  lockListeningIndicator = document.getElementById('lockListeningIndicator');
  lockMutedIndicator = document.getElementById('lockMutedIndicator');
  lockTranscript = document.getElementById('lockTranscript');

  if (!lockScreenOverlay || !unlockButton || !unlockProgress) {
    return;
  }

  // Monitor fullscreen changes to detect if user exits fullscreen
  const fullscreenChangeHandler = () => {
    const isFullscreen = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );

    if (state.isScreenLocked && !isFullscreen) {
      // Screen is locked but fullscreen was exited - show warning
      showFullscreenWarning();
    }
  };

  // Add listeners for all vendor-prefixed fullscreen change events
  document.addEventListener('fullscreenchange', fullscreenChangeHandler);
  document.addEventListener('webkitfullscreenchange', fullscreenChangeHandler);
  document.addEventListener('mozfullscreenchange', fullscreenChangeHandler);
  document.addEventListener('MSFullscreenChange', fullscreenChangeHandler);
}

/**
 * Lock the screen
 */
export function lockScreen() {
  if (state.isScreenLocked) {
    return;
  }

  state.isScreenLocked = true;

  // Enable keep awake mode (prevent screen sleep during lock)
  // Store previous state so we can restore it on unlock
  import('./wake-lock.js').then(async module => {
    wasKeepAwakeEnabledBeforeLock = module.isKeepAwakeEnabled();
    if (!wasKeepAwakeEnabledBeforeLock) {
      await module.enableKeepAwake();
    }
  });

  // Request fullscreen to hide browser controls (mobile)
  requestFullscreen();

  // Show overlay
  if (lockScreenOverlay) {
    lockScreenOverlay.classList.remove('hidden');
  }

  // Pause non-essential animations for battery savings
  pauseNonEssentialAnimations();

  // Prevent body scroll
  document.body.style.overflow = 'hidden';

  // Show current mic status immediately
  updateLockScreenMicStatus();

  // Add touch event listeners to unlock button
  if (unlockButton) {
    unlockButton.addEventListener('touchstart', handleUnlockHoldStart, { passive: false });
    unlockButton.addEventListener('touchend', handleUnlockHoldEnd, { passive: false });
    unlockButton.addEventListener('touchcancel', handleUnlockHoldEnd, { passive: false });

    // Mouse events for desktop testing
    unlockButton.addEventListener('mousedown', handleUnlockHoldStart);
    unlockButton.addEventListener('mouseup', handleUnlockHoldEnd);
    unlockButton.addEventListener('mouseleave', handleUnlockHoldEnd);
  }

  // Add touch event listeners to mic button (hold to speak)
  if (lockMicButton) {
    lockMicButton.addEventListener('touchstart', handleMicHoldStart, { passive: false });
    lockMicButton.addEventListener('touchend', handleMicHoldEnd, { passive: false });
    lockMicButton.addEventListener('touchcancel', handleMicHoldEnd, { passive: false });

    // Mouse events for desktop testing
    lockMicButton.addEventListener('mousedown', handleMicHoldStart);
    lockMicButton.addEventListener('mouseup', handleMicHoldEnd);
    lockMicButton.addEventListener('mouseleave', handleMicHoldEnd);
  }

  updateStatus('Screen locked (touch disabled) - voice active');
}

/**
 * Unlock the screen
 */
export function unlockScreen() {
  if (!state.isScreenLocked) {
    return;
  }

  state.isScreenLocked = false;

  // Restore keep awake mode to previous state
  import('./wake-lock.js').then(async module => {
    if (!wasKeepAwakeEnabledBeforeLock) {
      await module.disableKeepAwake();
    }
  });

  // Exit fullscreen
  exitFullscreen();

  // Hide overlay
  if (lockScreenOverlay) {
    lockScreenOverlay.classList.add('hidden');
  }

  // Clear lock screen display elements
  hideLockListeningIndicator();
  hideLockMutedIndicator();
  hideLockMicButton();
  clearLockTranscript();

  // Resume animations
  resumeAnimations();

  // Restore body scroll
  document.body.style.overflow = '';

  // Remove event listeners
  if (unlockButton) {
    unlockButton.removeEventListener('touchstart', handleUnlockHoldStart);
    unlockButton.removeEventListener('touchend', handleUnlockHoldEnd);
    unlockButton.removeEventListener('touchcancel', handleUnlockHoldEnd);
    unlockButton.removeEventListener('mousedown', handleUnlockHoldStart);
    unlockButton.removeEventListener('mouseup', handleUnlockHoldEnd);
    unlockButton.removeEventListener('mouseleave', handleUnlockHoldEnd);
  }

  // Remove mic button event listeners
  if (lockMicButton) {
    lockMicButton.removeEventListener('touchstart', handleMicHoldStart);
    lockMicButton.removeEventListener('touchend', handleMicHoldEnd);
    lockMicButton.removeEventListener('touchcancel', handleMicHoldEnd);
    lockMicButton.removeEventListener('mousedown', handleMicHoldStart);
    lockMicButton.removeEventListener('mouseup', handleMicHoldEnd);
    lockMicButton.removeEventListener('mouseleave', handleMicHoldEnd);
  }

  // Clear any active hold timer
  clearHoldTimer();

  // Clear any active mic hold timer
  clearMicHoldTimer();

  // Stop any active mic hold
  if (micHoldActive) {
    stopMicHold();
  }

  updateStatus('Screen unlocked');
}

/**
 * Toggle lock screen state
 * @returns {boolean} New lock state
 */
export function toggleLockScreen() {
  if (state.isScreenLocked) {
    unlockScreen();
  } else {
    lockScreen();
  }
  return state.isScreenLocked;
}

/**
 * Check if screen is currently locked
 * @returns {boolean} True if locked
 */
export function isScreenLocked() {
  return state.isScreenLocked;
}

/**
 * Handle unlock button hold start
 * @param {TouchEvent|MouseEvent} e - Event
 */
function handleUnlockHoldStart(e) {
  if (!state.isScreenLocked) return;

  e.preventDefault(); // Prevent default touch/mouse behavior

  holdStartTime = Date.now();

  // Add visual feedback class
  if (unlockButton) {
    unlockButton.classList.add('unlocking');
  }

  // Start progress animation (2-second fill)
  if (unlockProgress) {
    // Reset height first
    unlockProgress.style.transition = 'none';
    unlockProgress.style.height = '0%';

    // Trigger animation after a frame
    requestAnimationFrame(() => {
      unlockProgress.style.transition = 'height 1s linear';
      unlockProgress.style.height = '100%';
    });
  }

  // Set timer for 1 second - unlock when complete
  holdTimer = setTimeout(() => {
    unlockScreen();
  }, 1000);
}

/**
 * Handle unlock button hold end (release before 1 second)
 * @param {TouchEvent|MouseEvent} e - Event
 */
function handleUnlockHoldEnd(e) {
  if (!state.isScreenLocked) return;

  e.preventDefault();

  const holdDuration = Date.now() - holdStartTime;

  // Clear timer and reset UI
  clearHoldTimer();

  // If held for less than 1 second, show feedback
  if (holdDuration < 1000 && holdDuration > 0) {
    updateStatus('Hold for 1 second to unlock');
  }
}

/**
 * Clear hold timer and reset visual state
 */
function clearHoldTimer() {
  // Clear timeout
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }

  // Remove visual feedback
  if (unlockButton) {
    unlockButton.classList.remove('unlocking');
  }

  // Reset progress bar with smooth transition
  if (unlockProgress) {
    unlockProgress.style.transition = 'height 0.2s ease';
    unlockProgress.style.height = '0%';
  }

  holdStartTime = 0;
}

/**
 * Clear mic hold timer and reset visual state
 */
function clearMicHoldTimer() {
  // Clear timeout
  if (micHoldTimer) {
    clearTimeout(micHoldTimer);
    micHoldTimer = null;
  }

  // Remove visual feedback
  if (lockMicButton) {
    lockMicButton.classList.remove('speaking');
  }

  // Reset progress bar with smooth transition
  if (lockMicProgress) {
    lockMicProgress.style.transition = 'height 0.2s ease';
    lockMicProgress.style.height = '0%';
  }

  micHoldActive = false;
  micHoldStartTime = 0;
}

/**
 * Pause non-essential animations for battery savings
 */
function pauseNonEssentialAnimations() {
  // Pause TTS text highlighting animations
  const highlights = document.querySelectorAll('[style*="animation"]');
  highlights.forEach(el => {
    if (el.style.animationPlayState !== 'paused') {
      el.style.animationPlayState = 'paused';
      el.dataset.wasPaused = 'false'; // Track that we paused it
    } else {
      el.dataset.wasPaused = 'true'; // Was already paused
    }
  });
}

/**
 * Resume animations after unlock
 */
function resumeAnimations() {
  // Resume TTS text highlighting animations (only ones we paused)
  const highlights = document.querySelectorAll('[style*="animation"]');
  highlights.forEach(el => {
    if (el.dataset.wasPaused === 'false') {
      el.style.animationPlayState = 'running';
    }
    delete el.dataset.wasPaused;
  });
}

/**
 * Request fullscreen mode to hide browser controls
 */
async function requestFullscreen() {
  try {
    const elem = document.documentElement;
    let fullscreenPromise = null;

    // Try standard fullscreen API
    if (elem.requestFullscreen) {
      fullscreenPromise = elem.requestFullscreen();
    } else if (elem.webkitRequestFullscreen) {
      fullscreenPromise = elem.webkitRequestFullscreen();
    } else if (elem.mozRequestFullScreen) {
      fullscreenPromise = elem.mozRequestFullScreen();
    } else if (elem.msRequestFullscreen) {
      fullscreenPromise = elem.msRequestFullscreen();
    }

    if (fullscreenPromise) {
      await fullscreenPromise;
      hideFullscreenWarning();
    } else {
      showFullscreenWarning();
    }
  } catch (err) {
    showFullscreenWarning();
  }
}

/**
 * Show warning that fullscreen is not active
 */
function showFullscreenWarning() {
  // Add visual warning to lock screen
  if (lockScreenOverlay) {
    let warning = lockScreenOverlay.querySelector('.fullscreen-warning');
    if (!warning) {
      warning = document.createElement('div');
      warning.className = 'fullscreen-warning';
      warning.innerHTML = `
        <div class="warning-content">
          ⚠️ Browser controls visible<br>
          <small>Be careful not to tap browser buttons</small>
        </div>
      `;
      lockScreenOverlay.insertBefore(warning, lockScreenOverlay.firstChild);
    }
    warning.classList.remove('hidden');
  }
}

/**
 * Hide fullscreen warning
 */
function hideFullscreenWarning() {
  if (lockScreenOverlay) {
    const warning = lockScreenOverlay.querySelector('.fullscreen-warning');
    if (warning) {
      warning.classList.add('hidden');
    }
  }
}

/**
 * Exit fullscreen mode
 */
function exitFullscreen() {
  try {
    if (document.exitFullscreen) {
      document.exitFullscreen()
        .then(() => {
          // Fullscreen exited
        })
        .catch(err => {
          // Exit fullscreen failed
        });
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  } catch (err) {
    // Exit fullscreen not supported
  }
}

/**
 * Show listening indicator on lock screen
 */
export function showLockListeningIndicator() {
  if (lockListeningIndicator && state.isScreenLocked) {
    lockListeningIndicator.classList.remove('hidden');
  }
}

/**
 * Hide listening indicator on lock screen
 */
export function hideLockListeningIndicator() {
  if (lockListeningIndicator) {
    lockListeningIndicator.classList.add('hidden');
  }
}

/**
 * Update transcript text on lock screen
 * @param {string} text - Transcript text to display
 * @param {string} mode - Display mode: 'interim', 'confirmed', 'nav-command', 'low-confidence'
 */
export function updateLockTranscript(text, mode = 'interim') {
  if (!lockTranscript || !state.isScreenLocked) return;

  if (text && text.trim()) {
    lockTranscript.textContent = text;
    lockTranscript.classList.remove('hidden', 'interim', 'confirmed', 'nav-command', 'low-confidence');

    // Add appropriate class based on mode
    if (mode === 'confirmed' || mode === 'nav-command' || mode === 'low-confidence' || mode === 'interim') {
      lockTranscript.classList.add(mode);
    }
  } else {
    lockTranscript.textContent = '';
    lockTranscript.classList.add('hidden');
    lockTranscript.classList.remove('interim', 'confirmed', 'nav-command', 'low-confidence');
  }
}

/**
 * Clear transcript on lock screen
 */
export function clearLockTranscript() {
  updateLockTranscript('');
}

/**
 * Show muted indicator on lock screen
 */
export function showLockMutedIndicator() {
  if (lockMutedIndicator && state.isScreenLocked) {
    lockMutedIndicator.classList.remove('hidden');
    // Hide listening indicator when showing muted
    hideLockListeningIndicator();
  }
}

/**
 * Hide muted indicator on lock screen
 */
export function hideLockMutedIndicator() {
  if (lockMutedIndicator) {
    lockMutedIndicator.classList.add('hidden');
  }
}

/**
 * Update lock screen status to show current mic state
 * Call this when lock screen is shown or when mic state changes
 */
export function updateLockScreenMicStatus() {
  if (!state.isScreenLocked) return;

  if (state.isMuted) {
    showLockMutedIndicator();
    // Show mic button when muted (hold to speak)
    showLockMicButton();
  } else {
    hideLockMutedIndicator();
    // Hide mic button when not muted
    hideLockMicButton();
    // Show listening indicator immediately when not muted
    showLockListeningIndicator();
  }
}

/**
 * Show lock mic button (hold to unmute/speak)
 */
function showLockMicButton() {
  if (lockMicButton && state.isScreenLocked) {
    // Update button text based on push-to-talk mode
    if (lockMicButtonText) {
      lockMicButtonText.textContent = state.pushToTalkMode ? 'Hold to Speak' : 'Hold to Unmute';
    }
    lockMicButton.classList.remove('hidden');
  }
}

/**
 * Hide lock mic button
 */
function hideLockMicButton() {
  if (lockMicButton) {
    lockMicButton.classList.add('hidden');
  }
}

/**
 * Handle mic button hold start
 * @param {TouchEvent|MouseEvent} e - Event
 */
async function handleMicHoldStart(e) {
  if (!state.isScreenLocked || !state.isMuted) return;

  e.preventDefault(); // Prevent default touch/mouse behavior

  micHoldActive = true;
  micHoldStartTime = Date.now();

  // Add visual feedback class
  if (lockMicButton) {
    lockMicButton.classList.add('speaking');
  }

  const isPushToTalk = state.pushToTalkMode;

  // Push-to-talk mode: immediate unmute (temporary for hold duration)
  // Continuous mode: 1-second hold required to permanently unmute
  if (isPushToTalk) {
    // Show progress indicator immediately (full height)
    if (lockMicProgress) {
      lockMicProgress.style.transition = 'none';
      lockMicProgress.style.height = '100%';
    }

    // Unmute immediately for push-to-talk
    await unmuteMicInLockScreen(isPushToTalk);
  } else {
    // Continuous mode: require 1-second hold
    // Start progress animation (1-second fill)
    if (lockMicProgress) {
      // Reset height first
      lockMicProgress.style.transition = 'none';
      lockMicProgress.style.height = '0%';

      // Trigger animation after a frame
      requestAnimationFrame(() => {
        lockMicProgress.style.transition = 'height 1s linear';
        lockMicProgress.style.height = '100%';
      });
    }

    // Set timer for 1 second - unmute when complete
    micHoldTimer = setTimeout(async () => {
      await unmuteMicInLockScreen(isPushToTalk);
    }, 1000);
  }
}

/**
 * Perform the actual unmute operation in lock screen
 * @param {boolean} isPushToTalk - Whether in push-to-talk mode
 */
async function unmuteMicInLockScreen(isPushToTalk) {
  // Unmute mic and start recognition
  state.isMuted = false;
  state.listeningEnabled = true;

  // Hide muted indicator and show listening indicator
  hideLockMutedIndicator();
  showLockListeningIndicator();

  // Hide mic button if not in push-to-talk mode (mic is now unmuted permanently)
  if (!isPushToTalk) {
    hideLockMicButton();
  }

  // Try to start voice recognition
  if (state.recognition && !state.isRecognitionActive) {
    const { startRecognitionSafely } = await import('../voice/recognition.js');
    const success = await startRecognitionSafely();

    // If recognition failed to start, revert to muted state
    // (error buzz already played by startRecognitionSafely)
    if (!success) {
      state.isMuted = true;
      state.listeningEnabled = false;

      // Restore muted indicators
      showLockMutedIndicator();
      hideLockListeningIndicator();

      // Show mic button again
      showLockMicButton();

      // Clean up hold state (button classes, progress bar, flags)
      clearMicHoldTimer();

      // Update main UI to sync with lock screen
      const icon = document.querySelector('#muteBtn .material-icons');
      if (icon) icon.textContent = 'mic_off';
      const muteBtn = document.getElementById('muteBtn');
      if (muteBtn) {
        muteBtn.classList.add('muted');
        muteBtn.classList.remove('listening');
        muteBtn.style.setProperty('--mic-intensity', '0');
      }

      const { stopVoiceMeter } = await import('../voice/voice-meter.js');
      stopVoiceMeter();

      const { updateNavButtons } = await import('../ui/nav-buttons.js');
      updateNavButtons();

      return; // Exit early - unmute failed
    }
  }

  // If we got here, recognition started successfully
  // Play unmute tone
  const { playUnmuteTone } = await import('./audio-feedback.js');
  playUnmuteTone();

  // In continuous mode, clean up hold state since button is now hidden
  if (!isPushToTalk) {
    clearMicHoldTimer();
  }

  if (isPushToTalk) {
    updateStatus('🎤 Listening... Speak now!');
  } else {
    updateStatus('Microphone unmuted');
  }
}

/**
 * Handle mic button hold end (release)
 * @param {TouchEvent|MouseEvent} e - Event
 */
function handleMicHoldEnd(e) {
  if (!state.isScreenLocked || !micHoldActive) return;

  e.preventDefault();

  const holdDuration = Date.now() - micHoldStartTime;
  const isPushToTalk = state.pushToTalkMode;

  // In continuous mode, if released before 1 second, show feedback and reset
  if (!isPushToTalk && holdDuration < 1000 && holdDuration > 0 && state.isMuted) {
    // Released too early - clear timer and reset
    clearMicHoldTimer();
    updateStatus('Hold for 1 second to unmute');
    return;
  }

  // Normal release handling (push-to-talk mode or after successful unmute)
  stopMicHold();
}

/**
 * Stop mic hold - only re-mute if in push-to-talk mode
 */
async function stopMicHold() {
  if (!micHoldActive) return;

  micHoldActive = false;

  // Remove visual feedback
  if (lockMicButton) {
    lockMicButton.classList.remove('speaking');
  }

  // Reset progress indicator
  if (lockMicProgress) {
    lockMicProgress.style.height = '0%';
  }

  const isPushToTalk = state.pushToTalkMode;

  // Only re-mute if in push-to-talk mode
  if (isPushToTalk) {
    // Restore muted state
    state.isMuted = true;
    state.listeningEnabled = false;

    // Stop voice recognition
    if (state.recognition && state.isRecognitionActive) {
      try {
        state.recognition.stop();
      } catch (err) {
        // Recognition already stopped
      }
    }

    // Restore indicators
    hideLockListeningIndicator();
    showLockMutedIndicator();
    showLockMicButton();

    const { playMuteTone } = await import('./audio-feedback.js');
    playMuteTone();

    updateStatus('Hold mic button to speak');
  } else {
    // Continuous mode - mic stays unmuted
    // Indicators already updated in handleMicHoldStart
    updateStatus('Microphone active');
  }
}
