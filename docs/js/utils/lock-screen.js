/**
 * Lock Screen Module
 *
 * Prevents accidental touches on mobile devices when using IFTalk voice-controlled IF.
 * Features:
 * - Transparent/frosty overlay (game content visible underneath)
 * - Narration highlights continue to work
 * - Lock button in controls row (emphasized when locked)
 * - Progress meter above lock button during hold-to-unlock (0.5 second)
 * - Touch feedback for locked screen interactions
 * - Voice recognition and TTS continue in background
 * - Auto-enables "keep awake" mode when locked (prevents screen sleep)
 */

import { state } from '../core/state.js';
import { updateStatus } from './status.js';
import { enableKeepAwake, disableKeepAwake } from './wake-lock.js';

// DOM elements
let lockScreenOverlay = null;
let lockBtn = null;
let lockProgressMeter = null;
let lockProgressFill = null;
let screenLockedMessage = null;
let lockScreenInstructions = null;
let controlsWrapper = null;

// Hold-to-unlock state
let holdTimer = null;
let holdStartTime = 0;
let holdUpdateInterval = null;

// Track keep awake state before locking (so we can restore it on unlock)
let wasKeepAwakeEnabledBeforeLock = false;

// Touch feedback timer
let touchFeedbackTimer = null;

/**
 * Initialize lock screen module
 */
export function initLockScreen() {
  // Query DOM elements
  lockScreenOverlay = document.getElementById('lockScreenOverlay');
  lockBtn = document.getElementById('lockBtn');
  lockProgressMeter = document.getElementById('lockProgressMeter');
  lockProgressFill = document.getElementById('lockProgressFill');
  screenLockedMessage = document.getElementById('screenLockedMessage');
  lockScreenInstructions = document.getElementById('lockScreenInstructions');
  controlsWrapper = document.getElementById('controlsWrapper');

  if (!lockScreenOverlay || !lockBtn || !lockProgressMeter || !lockProgressFill) {
    return;
  }

  // Add click handler to lock button
  lockBtn.addEventListener('click', toggleLockScreen);

  // Add touch event listeners to overlay for feedback
  lockScreenOverlay.addEventListener('touchstart', handleLockedTouchStart, { passive: false });
  lockScreenOverlay.addEventListener('touchend', handleLockedTouchEnd, { passive: false });
  lockScreenOverlay.addEventListener('touchcancel', handleLockedTouchEnd, { passive: false });
  lockScreenOverlay.addEventListener('mousedown', handleLockedTouchStart);
  lockScreenOverlay.addEventListener('mouseup', handleLockedTouchEnd);
  lockScreenOverlay.addEventListener('mouseleave', handleLockedTouchEnd);

  // Update lock button visibility when mic state changes
  updateLockButtonVisibility();
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

  // Raise controls wrapper above overlay (pointer-events: none keeps other buttons blocked)
  if (controlsWrapper) {
    controlsWrapper.classList.add('screen-locked');
  }

  // Show overlay
  if (lockScreenOverlay) {
    lockScreenOverlay.classList.remove('hidden');
  }

  // Show instructions
  if (lockScreenInstructions) {
    lockScreenInstructions.classList.remove('hidden');
  }

  // Emphasize lock button
  if (lockBtn) {
    lockBtn.classList.add('locked');
    lockBtn.title = 'Hold to Unlock';
  }

  // Handle mic button visibility based on push-to-talk mode
  const muteBtn = document.getElementById('muteBtn');
  if (muteBtn) {
    if (state.pushToTalkMode) {
      // In push-to-talk mode: emphasize the mic button
      muteBtn.classList.add('push-to-talk-locked');
      muteBtn.classList.remove('mic-locked-hidden');
    } else {
      // NOT in push-to-talk mode: hide mic button from taps
      muteBtn.classList.add('mic-locked-hidden');
      muteBtn.classList.remove('push-to-talk-locked');
    }
  }

  // Add touch event listeners to lock button
  if (lockBtn) {
    lockBtn.addEventListener('touchstart', handleUnlockHoldStart, { passive: false });
    lockBtn.addEventListener('touchend', handleUnlockHoldEnd, { passive: false });
    lockBtn.addEventListener('touchcancel', handleUnlockHoldEnd, { passive: false });

    // Mouse events for desktop testing
    lockBtn.addEventListener('mousedown', handleUnlockHoldStart);
    lockBtn.addEventListener('mouseup', handleUnlockHoldEnd);
    lockBtn.addEventListener('mouseleave', handleUnlockHoldEnd);
  }

  // Add Escape key listener to unlock
  document.addEventListener('keydown', handleEscapeKey);

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

  // Restore controls wrapper z-index
  if (controlsWrapper) {
    controlsWrapper.classList.remove('screen-locked');
  }

  // Hide overlay
  if (lockScreenOverlay) {
    lockScreenOverlay.classList.add('hidden');
  }

  // Hide instructions
  if (lockScreenInstructions) {
    lockScreenInstructions.classList.add('hidden');
  }

  // Remove emphasis from lock button
  if (lockBtn) {
    lockBtn.classList.remove('locked');
    lockBtn.title = 'Lock Screen';
  }

  // Remove lock-related classes from mic button
  const muteBtn = document.getElementById('muteBtn');
  if (muteBtn) {
    muteBtn.classList.remove('push-to-talk-locked', 'mic-locked-hidden');
  }

  // Hide screen locked message if visible
  if (screenLockedMessage) {
    screenLockedMessage.classList.remove('show');
  }

  // Remove event listeners from lock button
  if (lockBtn) {
    lockBtn.removeEventListener('touchstart', handleUnlockHoldStart);
    lockBtn.removeEventListener('touchend', handleUnlockHoldEnd);
    lockBtn.removeEventListener('touchcancel', handleUnlockHoldEnd);
    lockBtn.removeEventListener('mousedown', handleUnlockHoldStart);
    lockBtn.removeEventListener('mouseup', handleUnlockHoldEnd);
    lockBtn.removeEventListener('mouseleave', handleUnlockHoldEnd);
  }

  // Remove Escape key listener
  document.removeEventListener('keydown', handleEscapeKey);

  // Clear any active hold timer
  clearHoldTimer();

  // Update lock button visibility (hide if mic inactive)
  updateLockButtonVisibility();

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
 * Update lock/conv button visibility.
 * - Screen locked: show lock button (for unlocking), hide conv button.
 * - Screen unlocked: show conv button (if recognition available), hide lock button.
 */
export function updateLockButtonVisibility() {
  if (!lockBtn) return;
  const convBtn = document.getElementById('convModeBtn');

  if (state.isScreenLocked) {
    lockBtn.classList.remove('lock-btn-hidden');
    lockBtn.classList.add('lock-btn-visible');
    if (convBtn) {
      convBtn.classList.remove('conv-btn-visible');
      convBtn.classList.add('conv-btn-hidden');
    }
    return;
  }

  // Not locked: show conv button when recognition is available; lock button stays hidden.
  const isRecognitionEnabled = state.recognition !== null && state.recognition !== undefined;

  lockBtn.classList.remove('lock-btn-visible');
  lockBtn.classList.add('lock-btn-hidden');

  if (convBtn) {
    if (isRecognitionEnabled) {
      convBtn.classList.remove('conv-btn-hidden');
      convBtn.classList.add('conv-btn-visible');
    } else {
      convBtn.classList.remove('conv-btn-visible');
      convBtn.classList.add('conv-btn-hidden');
    }
  }
}

/**
 * Update conv mode button active highlight.
 * Active = narration playing + mic on.
 */
export function updateConvModeButton() {
  const convBtn = document.getElementById('convModeBtn');
  if (!convBtn) return;
  const isConvMode = state.autoplayEnabled && !state.isMuted;
  convBtn.classList.toggle('conv-mode-active', isConvMode);
  const icon = convBtn.querySelector('.material-icons');
  if (icon) icon.textContent = isConvMode ? 'lock' : 'record_voice_over';
}

/**
 * Handle unlock button hold start
 * @param {TouchEvent|MouseEvent} e - Event
 */
function handleUnlockHoldStart(e) {
  if (!state.isScreenLocked) return;

  e.preventDefault(); // Prevent default touch/mouse behavior
  e.stopPropagation(); // Prevent overlay touch handler

  holdStartTime = Date.now();

  // Show progress meter
  if (lockProgressMeter) {
    lockProgressMeter.classList.add('show', 'unlocking');
  }

  // Add unlocking class to instructions box for fill animation
  if (lockScreenInstructions) {
    lockScreenInstructions.classList.add('unlocking');
  }

  // Reset progress fill
  if (lockProgressFill) {
    lockProgressFill.style.transition = 'none';
    lockProgressFill.style.width = '0%';
  }

  // Start progress animation (0.5-second fill)
  requestAnimationFrame(() => {
    if (lockProgressFill) {
      lockProgressFill.style.transition = 'width 0.5s linear';
      lockProgressFill.style.width = '100%';
    }
  });

  // Set timer for 0.5 second - unlock when complete
  holdTimer = setTimeout(() => {
    unlockScreen();
  }, 500);

  // Update progress every frame for smooth animation
  holdUpdateInterval = setInterval(() => {
    const elapsed = Date.now() - holdStartTime;
    const progress = Math.min(elapsed / 500, 1);
    if (lockProgressFill) {
      lockProgressFill.style.width = `${progress * 100}%`;
    }
  }, 16);
}

/**
 * Handle unlock button hold end (release before 0.5 second)
 * @param {TouchEvent|MouseEvent} e - Event
 */
function handleUnlockHoldEnd(e) {
  if (!state.isScreenLocked) return;

  e.preventDefault();
  e.stopPropagation();

  const holdDuration = Date.now() - holdStartTime;

  // Clear timer and reset UI
  clearHoldTimer();

  // If held for less than 0.5 second, show feedback
  if (holdDuration < 500 && holdDuration > 0) {
    updateStatus('Hold for 0.5 seconds to unlock');
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

  // Clear interval
  if (holdUpdateInterval) {
    clearInterval(holdUpdateInterval);
    holdUpdateInterval = null;
  }

  // Hide progress meter
  if (lockProgressMeter) {
    lockProgressMeter.classList.remove('show', 'unlocking');
  }

  // Remove unlocking class from instructions box
  if (lockScreenInstructions) {
    lockScreenInstructions.classList.remove('unlocking');
  }

  // Reset progress bar with smooth transition
  if (lockProgressFill) {
    lockProgressFill.style.transition = 'width 0.2s ease';
    lockProgressFill.style.width = '0%';
  }

  holdStartTime = 0;
}

/**
 * Handle Escape key press to unlock screen
 * @param {KeyboardEvent} e - Keyboard event
 */
function handleEscapeKey(e) {
  if (e.key === 'Escape' && state.isScreenLocked) {
    e.preventDefault();
    unlockScreen();
  }
}

/**
 * Handle touch start on locked screen (show feedback and blur)
 * @param {TouchEvent|MouseEvent} e - Event
 */
function handleLockedTouchStart(e) {
  if (!state.isScreenLocked) return;

  // Don't show feedback if touching the lock button or mic button
  const target = e.target;
  if (target && (
    target.id === 'lockBtn' ||
    target.id === 'muteBtn' ||
    target.closest('#lockBtn') ||
    target.closest('#muteBtn')
  )) {
    return;
  }

  e.preventDefault();

  // Show "screen locked" message
  if (screenLockedMessage) {
    screenLockedMessage.classList.add('show');
  }

  // Add touched class to overlay for increased blur
  if (lockScreenOverlay) {
    lockScreenOverlay.classList.add('touched');
  }
}

/**
 * Handle touch end on locked screen (remove feedback)
 * @param {TouchEvent|MouseEvent} e - Event
 */
function handleLockedTouchEnd(e) {
  if (!state.isScreenLocked) return;

  // Hide "screen locked" message
  if (screenLockedMessage) {
    screenLockedMessage.classList.remove('show');
  }

  // Remove touched class from overlay
  if (lockScreenOverlay) {
    lockScreenOverlay.classList.remove('touched');
  }
}

/**
 * Update lock screen status to show current mic state
 * Called when mic state changes (e.g., switching between push-to-talk and continuous modes)
 */
export function updateLockScreenMicStatus() {
  if (!state.isScreenLocked) return;

  // Update mic button visibility based on push-to-talk mode
  const muteBtn = document.getElementById('muteBtn');
  if (muteBtn) {
    if (state.pushToTalkMode) {
      // In push-to-talk mode: emphasize the mic button
      muteBtn.classList.add('push-to-talk-locked');
      muteBtn.classList.remove('mic-locked-hidden');
    } else {
      // NOT in push-to-talk mode: hide mic button from taps
      muteBtn.classList.add('mic-locked-hidden');
      muteBtn.classList.remove('push-to-talk-locked');
    }
  }

  // Update lock button visibility
  updateLockButtonVisibility();
}

// Export functions that were used by other modules (for compatibility)
// These are now no-ops since we don't have the old overlay elements
export function showLockListeningIndicator() {
  // No-op: indicators removed from new design
}

export function hideLockListeningIndicator() {
  // No-op: indicators removed from new design
}

export function updateLockTranscript(text, mode = 'interim') {
  // No-op: transcript removed from new design
}

export function clearLockTranscript() {
  // No-op: transcript removed from new design
}

export function showLockMutedIndicator() {
  // No-op: indicators removed from new design
}

export function hideLockMutedIndicator() {
  // No-op: indicators removed from new design
}

export function showLockMicLockedIndicator() {
  // No-op: indicators removed from new design
}

export function hideLockMicLockedIndicator() {
  // No-op: indicators removed from new design
}
