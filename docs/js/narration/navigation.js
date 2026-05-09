/**
 * Narration Navigation Module
 *
 * Controls for navigating through narration chunks (sentences).
 * Supports skip forward/back, restart, and skip to end.
 */

import { state } from '../core/state.js';
import { stopNarration, stopKeepAlive } from './tts-player.js';
import { updateTextHighlight, removeHighlight } from './highlighting.js';
import { updateStatus } from '../utils/status.js';
import { ensureChunksReady } from '../ui/game-output.js';
import { updateNavButtons } from '../ui/nav-buttons.js';

/** Returns true if a chunk is an app-voice chunk (not game output) */
function isAppChunk(chunk) {
  return typeof chunk === 'object' && chunk.voice === 'app';
}

/**
 * Navigate chunks (skip forward or backward)
 * @param {number} offset - Number of chunks to skip (negative = backward)
 * @param {Function} speakTextChunked - Function to resume narration
 */
export function skipToChunk(offset, speakTextChunked) {
  // Prevent concurrent navigation
  if (state.isNavigating) {
    return;
  }

  // Ensure chunks exist (lazy creation after autoload)
  if (!state.chunksValid || state.narrationChunks.length === 0) {
    ensureChunksReady();
  }

  // If still no chunks, can't navigate
  if (state.narrationChunks.length === 0) {
    return;
  }

  let targetIndex = state.currentChunkIndex + offset;

  // Special case: if at end and going back, jump to last non-app chunk
  if (offset === -1 && state.currentChunkIndex >= state.narrationChunks.length) {
    targetIndex = state.narrationChunks.length - 1;
    while (targetIndex >= 0 && isAppChunk(state.narrationChunks[targetIndex])) targetIndex--;
  }
  // Smart back button: if going back and within 3 seconds, go to previous chunk
  // When paused, always go to previous chunk (don't replay current)
  else if (offset === -1) {
    const timeSinceStart = Date.now() - state.currentChunkStartTime;
    // If paused OR within 3 seconds of start, go to previous chunk
    if ((state.isPaused || timeSinceStart < 3000) && state.currentChunkIndex > 0) {
      targetIndex = state.currentChunkIndex - 1;
      while (targetIndex >= 0 && isAppChunk(state.narrationChunks[targetIndex])) targetIndex--;
    } else {
      targetIndex = state.currentChunkIndex;
    }
  }
  // Back N (N > 1): count only game chunks, skip app chunks
  else if (offset < -1) {
    let remaining = Math.abs(offset);
    let idx = state.currentChunkIndex - 1;
    while (idx >= 0 && remaining > 0) {
      if (!isAppChunk(state.narrationChunks[idx])) {
        remaining--;
      }
      if (remaining > 0) idx--;
    }
    targetIndex = idx;
  }

  if (targetIndex < 0 || targetIndex >= state.narrationChunks.length) {
    return;
  }


  state.isNavigating = true;

  // Stop current playback but preserve highlighting (we'll update it next)
  stopNarration(true);
  state.currentChunkIndex = targetIndex;

  // Small delay to prevent rapid navigation loops
  setTimeout(async () => {
    state.isNavigating = false;

    // Update highlighting to new chunk
    updateTextHighlight(targetIndex);

    // Update nav button states
    updateNavButtons();

    // If in autoplay mode, start playing from new position
    if (state.autoplayEnabled) {
      state.isPaused = false;
      state.narrationEnabled = true;
      speakTextChunked(null, targetIndex);
    } else {
      // Just update highlight if not in autoplay mode
      state.isPaused = true;
    }
  }, 50);
}

/**
 * Skip to beginning (skips app chunks, starts at first narrator chunk)
 * @param {Function} speakTextChunked - Function to resume narration
 */
export function skipToStart(speakTextChunked) {
  if (state.isNavigating) return;

  // Ensure chunks exist (lazy creation after autoload)
  if (!state.chunksValid || state.narrationChunks.length === 0) {
    ensureChunksReady();
  }

  if (state.narrationChunks.length === 0) return;

  state.isNavigating = true;
  state.currentChunkStartTime = 0;

  // Stop but preserve highlighting (we'll update it next)
  stopNarration(true);

  // Find first non-app chunk (skip app chunks at the beginning)
  let startIndex = 0;
  for (let i = 0; i < state.narrationChunks.length; i++) {
    const chunk = state.narrationChunks[i];
    const voiceType = typeof chunk === 'object' ? chunk.voice : 'narrator';
    if (voiceType !== 'app') {
      startIndex = i;
      break;
    }
  }

  state.currentChunkIndex = startIndex;

  setTimeout(async () => {
    state.isNavigating = false;

    // Always update highlighting to first non-app chunk
    updateTextHighlight(startIndex);

    // Update nav button states
    updateNavButtons();

    // If in autoplay mode, start playing from beginning
    if (state.autoplayEnabled) {
      state.isPaused = false;
      state.narrationEnabled = true;
      speakTextChunked(null, startIndex);
    } else {
      // Stay paused but keep first chunk highlighted
      state.isPaused = true;
    }
  }, 100);
}

/**
 * Skip to end (stop all narration and jump to end)
 */
export function skipToEnd() {
  // Ensure chunks exist (lazy creation after autoload)
  if (!state.chunksValid || state.narrationChunks.length === 0) {
    ensureChunksReady();
  }

  if (state.narrationChunks.length === 0) return;

  // Force stop everything immediately (like the old working version)
  state.narrationEnabled = false;
  state.isPaused = true;
  state.isNavigating = false;

  // Stop audio immediately
  if (state.currentAudio) {
    state.currentAudio.pause();
    state.currentAudio.currentTime = 0;
    state.currentAudio = null;
  }

  // Stop browser TTS
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
  }

  state.isNarrating = false;

  // Stop keep-alive audio (avoid unnecessary battery drain after skip-to-end)
  stopKeepAlive();

  // Jump past end (no highlighting)
  state.currentChunkIndex = state.narrationChunks.length;
  state.currentChunkStartTime = 0;

  updateStatus('⏩ Skipped to end');

  // Remove all highlighting
  removeHighlight();

  // Update nav button states
  updateNavButtons();
}
