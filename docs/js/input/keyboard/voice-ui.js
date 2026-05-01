/**
 * Voice UI Module
 *
 * Handles voice indicator and transcript display.
 * Uses pre-cached DOM refs from core/dom.js instead of local element caches.
 */

import { dom } from '../../core/dom.js';

/**
 * Update voice indicator state (for speaking animation)
 * @param {boolean} isSpeaking - Whether user is currently speaking
 */
export function setVoiceSpeaking(isSpeaking) {
  dom.voiceListeningIndicator?.classList.toggle('speaking', isSpeaking);
}

/**
 * Update voice transcript text
 * @param {string} text - Text to display
 * @param {string} mode - 'listening', 'interim', 'confirmed', or 'nav'
 */
export function updateVoiceTranscript(text, mode = 'listening') {
  if (!dom.voiceTranscript) return;
  dom.voiceTranscript.textContent = text;
  dom.voiceTranscript.classList.remove('interim', 'confirmed', 'nav-command');
  if (mode === 'interim') dom.voiceTranscript.classList.add('interim');
  else if (mode === 'confirmed') dom.voiceTranscript.classList.add('confirmed');
  else if (mode === 'nav') dom.voiceTranscript.classList.add('nav-command');
}

/**
 * Show voice listening indicator
 */
export function showVoiceIndicator() {
  dom.voiceListeningIndicator?.classList.remove('hidden');
}

/**
 * Hide voice listening indicator
 */
export function hideVoiceIndicator() {
  dom.voiceListeningIndicator?.classList.add('hidden');
}
