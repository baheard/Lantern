/**
 * TTS Player Module
 *
 * Text-to-speech playback using browser's built-in voices.
 * Handles audio playback, voice configuration, and pronunciation fixes.
 */

import { state } from '../core/state.js';
import { dom } from '../core/dom.js';
import { updateStatus } from '../utils/status.js';
import { fixPronunciation } from '../utils/pronunciation.js';
import { recordSpokenChunk } from '../voice/echo-detection.js';
import { updateTextHighlight, removeHighlight } from './highlighting.js';
import { getDefaultVoice, getDefaultAppVoice } from '../ui/settings/index.js';
import { scrollToBottom } from '../utils/scroll.js';

// Keep-alive audio context for mobile background playback
let keepAliveAudio = null;
let keepAliveContext = null;

/**
 * Start silent audio to keep browser active during phone sleep
 * Uses Web Audio API to generate inaudible tone
 */
export function startKeepAlive() {
  if (keepAliveContext) return; // Already running

  try {
    keepAliveContext = new (window.AudioContext || window.webkitAudioContext)();

    // Create a very quiet oscillator (inaudible but keeps audio context alive)
    const oscillator = keepAliveContext.createOscillator();
    const gainNode = keepAliveContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(keepAliveContext.destination);

    // Set volume to nearly zero (inaudible)
    gainNode.gain.value = 0.001;
    oscillator.frequency.value = 1; // Very low frequency

    oscillator.start();

    // Set up Media Session API for lock screen controls
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'IFTalk Narration',
        artist: 'Interactive Fiction',
        album: state.currentGameName || 'Game'
      });

      navigator.mediaSession.setActionHandler('play', () => {
        // Resume narration from current position
        if (state.narrationEnabled && !state.isNarrating) {
          speakTextChunked(null, state.currentChunkIndex);
        }
      });

      navigator.mediaSession.setActionHandler('pause', () => {
        stopNarration();
      });

      navigator.mediaSession.setActionHandler('stop', () => {
        stopNarration();
        stopKeepAlive();
      });
    }
  } catch (err) {
    // KeepAlive failed to start - silently ignored
  }
}

/**
 * Stop the keep-alive audio
 */
export function stopKeepAlive() {
  if (keepAliveContext) {
    try {
      keepAliveContext.close();
    } catch (err) {
      // Ignore
    }
    keepAliveContext = null;
  }
}

/**
 * Play using browser's built-in TTS
 * @param {string} text - Text to speak
 * @param {string} voiceType - Voice type: 'narrator' or 'app'
 * @param {number} speedModifier - Speed modifier to apply (default: 0)
 * @param {number} pitchModifier - Pitch modifier to apply (default: 0)
 * @returns {Promise<void>} Resolves when speech finishes
 */
export async function playWithBrowserTTS(text, voiceType = 'narrator', speedModifier = 0, pitchModifier = 0) {
  if (!('speechSynthesis' in window)) {
    state.isNarrating = false;
    return;
  }

  // Fix pronunciation issues before speaking
  const fixedText = fixPronunciation(text);

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(fixedText);

    // Find configured voice based on voice type (fall back to default if not set)
    const voices = speechSynthesis.getVoices();
    const voiceName = voiceType === 'app'
      ? state.browserVoiceConfig?.appVoice
      : state.browserVoiceConfig?.voice;

    // Use configured voice, or fall back to our preferred default
    let selectedVoice = voiceName ? voices.find(v => v.name === voiceName) : null;
    if (!selectedVoice) {
      selectedVoice = getDefaultVoice(voices);
    }

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    // Apply base rate + speed modifier
    const baseRate = state.browserVoiceConfig?.rate || 1.0;
    utterance.rate = baseRate + speedModifier;

    // Apply base pitch + pitch modifier
    const basePitch = state.browserVoiceConfig?.pitch || 1.0;
    utterance.pitch = basePitch + pitchModifier;

    utterance.volume = state.browserVoiceConfig?.volume ?? 1.0;

    // Track if TTS actually started
    let ttsStarted = false;
    let startTimeout = null;

    utterance.onstart = () => {
      ttsStarted = true;
      if (startTimeout) {
        clearTimeout(startTimeout);
        startTimeout = null;
      }
    };

    utterance.onend = () => {
      if (startTimeout) {
        clearTimeout(startTimeout);
        startTimeout = null;
      }
      // Don't set isNarrating = false here - let speakTextChunked manage it
      state.ttsIsSpeaking = false;
      // Recognition stays active (echo detection filters out game text, allows navigation commands)

      // Check if page is hidden (tab switch) - if so, mark as interrupted
      if (document.hidden) {
        state.chunkWasInterrupted = true;
      } else {
        state.chunkWasInterrupted = false;
      }

      resolve();
    };

    utterance.onerror = (err) => {
      if (startTimeout) {
        clearTimeout(startTimeout);
        startTimeout = null;
      }

      // If interrupted unexpectedly (not by user pause), mark as interrupted
      // This catches iOS permission dialogs and other system interruptions
      if (err.error === 'interrupted' && !state.isPaused) {
        state.chunkWasInterrupted = true;
      }

      // Only show status for non-interrupted errors
      if (err.error !== 'interrupted') {
        updateStatus('TTS error: ' + err.error);
      }
      // Don't set isNarrating = false here - let speakTextChunked or stopNarration manage it
      state.ttsIsSpeaking = false;
      // Recognition stays active (no need to restart - we don't stop it anymore)
      resolve();
    };

    // Stop any current speech
    speechSynthesis.cancel();

    // Mark that TTS is speaking (but keep recognition active - echo detection will filter it)
    state.ttsIsSpeaking = true;

    // Record for echo detection BEFORE speaking (so recognition can filter it out)
    recordSpokenChunk(text);

    // Speak (recognition stays active, echo detection filters out our own voice)
    speechSynthesis.speak(utterance);

    // Safety timeout: If TTS doesn't start within 2 seconds, assume it failed.
    // This catches iOS permission dialog interruptions and other silent failures.
    // Also self-healing in stopNarration's path: cancel() fires onerror('interrupted'),
    // which clears this timer. If a browser ever fails to fire onerror, this still resolves.
    startTimeout = setTimeout(() => {
      if (!ttsStarted && state.ttsIsSpeaking) {
        // TTS claimed to start but never actually began speaking
        state.ttsIsSpeaking = false;
        state.chunkWasInterrupted = true;

        // Force a full reset of speech synthesis to clear any stuck state
        speechSynthesis.cancel();

        // If in play mode, the interruption handler will retry automatically
        resolve();
      }
    }, 2000);
  });
}

/**
 * Speak text in chunks (with resume and navigation support)
 * @param {string|null} text - Unused (chunks come from state.narrationChunks)
 * @param {number} startFromIndex - Chunk index to start from
 */
export async function speakTextChunked(_text, startFromIndex = 0) {
  // Import ensureChunksReady dynamically to avoid circular dependency
  const { ensureChunksReady } = await import('../ui/game-output.js');

  // Check if narration is enabled at the very start
  if (!state.narrationEnabled) {
    return;
  }

  // Wait for app voice to finish before starting narration
  if (state.appVoicePromise) {
    await state.appVoicePromise;
  }

  // Stop any currently playing narration to prevent double voices
  if (state.isNarrating) {
    await stopNarration();
    // Give the old loop time to fully exit
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // Increment session ID to invalidate any old loops
  state.narrationSessionId++;
  const currentSessionId = state.narrationSessionId;

  // LAZY CHUNKING: Create chunks on-demand if needed
  if (!ensureChunksReady()) {
    return;
  }

  state.currentChunkIndex = startFromIndex;
  state.isPaused = false;
  state.isNarrating = true;

  // Mic state is intentionally decoupled from narration — see .tome/mic-narration-coupling.md.

  // Start keep-alive for mobile background playback
  startKeepAlive();

  const totalChunks = state.narrationChunks.length;

  // Update nav buttons now that chunks are ready
  const { updateNavButtons } = await import('../ui/nav-buttons.js');
  updateNavButtons();

  // Start from current index
  for (let i = state.currentChunkIndex; i < totalChunks; i++) {
    // Check if this session is still valid (not superseded by newer narration)
    if (currentSessionId !== state.narrationSessionId) {
      // Don't remove highlight - the new session will manage it
      updateNavButtons();
      break;
    }

    // Update position
    state.currentChunkIndex = i;

    // Check narration state
    if (!state.narrationEnabled || state.isPaused || state.isNavigating) {
      // NOTE: Currently there is no "stop" command (only pause).
      // If stop is reimplemented, add: if (!state.isPaused) { removeHighlight(); }
      updateNavButtons();
      break;
    }

    // Highlight current sentence
    // For chunk 0, add RAF delay to ensure DOM is fully rendered
    if (i === 0) {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }
    updateTextHighlight(i);

    // Update nav buttons for current position
    updateNavButtons();

    const chunk = state.narrationChunks[i];
    const chunkText = typeof chunk === 'string' ? chunk : chunk.text;
    const voiceType = typeof chunk === 'object' ? chunk.voice : 'narrator';

    // Look up speed and pitch modifiers based on marker's Glk class
    // Check the END marker of this chunk (not start), because glkClass is detected
    // when we process the marker that ENDS the chunk
    let speedModifier = 0;
    let pitchModifier = 0;
    const endMarker = document.querySelector(`.chunk-marker-end[data-chunk="${i}"]`);
    if (endMarker && endMarker.dataset.glkClass) {
      const glkClass = endMarker.dataset.glkClass;
      if (glkClass === 'header' || glkClass === 'subheader') {
        speedModifier = -0.1;  // Slower for headers and subheaders
        pitchModifier = -0.1;  // Lower pitch for headers and subheaders
      } else if (glkClass === 'note') {
        speedModifier = 0.1;   // Faster for notes
      }
    }

    // Use browser TTS directly (no server round-trip needed)
    // Mark when this chunk started playing
    state.currentChunkStartTime = Date.now();
    await playWithBrowserTTS(chunkText, voiceType, speedModifier, pitchModifier);

    // Check if chunk was interrupted by tab switch or TTS failure
    if (state.chunkWasInterrupted) {
      state.chunkWasInterrupted = false;  // Clear the flag

      // Skip recovery if we're navigating (user clicked a nav button)
      if (state.isNavigating) {
        break;  // Let navigation handle it
      }

      // If not manually paused, resume playing from current position
      // This handles iOS permission dialogs and other system interruptions
      if (!state.isPaused) {
        // Small delay to let iOS settle after permission dialog
        await new Promise(resolve => setTimeout(resolve, 100));
        state.isNarrating = true;  // Resume narrating state
        // Continue loop from current chunk (don't increment i)
        i--;  // Decrement so loop increment brings us back to current chunk
        continue;
      } else {
        // User manually paused - stay paused
        state.isNarrating = false;  // Clear narrating flag so voice commands work
        break;
      }
    }

    // Check if we should still continue
    if (!state.narrationEnabled || state.isPaused || state.isNavigating) {
      // NOTE: Currently there is no "stop" command (only pause).
      // If stop is reimplemented, add: if (!state.isPaused) { removeHighlight(); }
      break;
    }
  }

  // Finished all chunks
  // Only clean up if this is still the current session (not superseded)
  if (currentSessionId === state.narrationSessionId) {
    if (state.currentChunkIndex >= totalChunks - 1 && state.narrationEnabled && !state.isPaused) {
      // Completed all chunks naturally
      state.currentChunkIndex = totalChunks;
      state.isNarrating = false;

      // If in autoplay mode, stay ready for new content (don't enter pause mode)
      // This allows new text to auto-play when it appears
      if (!state.autoplayEnabled) {
        // Not in autoplay mode - stop completely
        state.narrationEnabled = false;
        state.isPaused = true;
      }
      // Otherwise: stay in play mode, ready to auto-play new content

      removeHighlight();

      // DISABLED: Testing if we need this scroll
      // Scroll to bottom
      // scrollToBottom();

      updateStatus('Ready');
      updateNavButtons();
    } else {
      // Interrupted (paused) - preserve highlight and autoplay state
      // NOTE: Currently there is no "stop" command (only pause).
      // If stop is reimplemented, add: if (!state.isPaused) { removeHighlight(); }
      state.isNarrating = false;  // Ensure narrating flag is cleared when paused
      updateNavButtons();
    }
  }
  // If session was superseded, don't remove highlight - new session will manage it
}

/**
 * Stop narration
 * @param {boolean} preserveHighlight - If true, don't remove highlighting
 */
export async function stopNarration(preserveHighlight = false) {

  // Cancel browser TTS
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
  }

  if (state.currentAudio) {
    state.currentAudio.pause();
    state.currentAudio.currentTime = 0;
    state.currentAudio = null;
  }

  state.isNarrating = false;
  state.isPaused = true;

  // Clear echo detection buffer to prevent blocking commands after pause
  state.recentlySpokenChunks = [];

  // Stop keep-alive audio (saves battery when not narrating)
  stopKeepAlive();

  // Only update status if not showing something else
  const statusText = dom.status?.textContent || '';
  if (statusText.includes('Speaking')) {
    updateStatus('Ready');
  }

  // Remove highlighting unless preserving it
  if (!preserveHighlight) {
    removeHighlight();
  }

  // Update nav buttons to reflect stopped state
  const { updateNavButtons } = await import('../ui/nav-buttons.js');
  updateNavButtons();
}

/**
 * Speak feedback using app voice (for confirmations)
 * @param {string} text - Text to speak
 * @returns {Promise<void>} Promise that resolves when speech is done
 */
export function speakAppMessage(text) {
  if (!('speechSynthesis' in window) || !text) return Promise.resolve();

  state.appVoicePromise = new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = speechSynthesis.getVoices();
    const appVoiceName = state.browserVoiceConfig?.appVoice;

    // Use configured app voice, or fall back to our preferred app voice default
    let appVoice = appVoiceName ? voices.find(v => v.name === appVoiceName) : null;
    if (!appVoice) {
      appVoice = getDefaultAppVoice(voices);
    }

    if (appVoice) {
      utterance.voice = appVoice;
    }

    utterance.rate = (state.browserVoiceConfig?.rate || 1.0) + 0.1;  // App voice +0.1 faster than main
    utterance.pitch = 1.0;
    utterance.volume = (state.browserVoiceConfig?.volume ?? 1.0) * 0.8;  // Slightly quieter than narration

    utterance.onend = () => {
      state.appVoicePromise = null;
      resolve();
    };

    utterance.onerror = () => {
      state.appVoicePromise = null;
      resolve();
    };

    speechSynthesis.speak(utterance);
  });

  return state.appVoicePromise;
}
