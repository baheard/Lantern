/**
 * Voice Commands Module
 *
 * Minimal voice-specific handling. Most commands pass through to the
 * typed command router. Only handles:
 * - "enter" - sends empty command for "press any key" screens
 * - "escape" - sends escape key
 * - Spelled-out word detection
 * - Muted state (only responds to "unmute")
 * - Blocked commands during narration
 */

import { state } from '../core/state.js';
import { updateStatus } from '../utils/status.js';
import { speakAppMessage } from '../narration/tts-player.js';
import { displayBlockedCommand } from '../ui/game-output.js';
import { playBlockedCommand } from '../utils/audio-feedback.js';

/**
 * Process voice keywords
 * @param {string} transcript - Voice recognition transcript
 * @param {Object} handlers - Object with handler functions
 * @param {number|null} confidence - Voice recognition confidence (0.0-1.0)
 * @returns {string|false} Processed command text or false if handled here
 */
export function processVoiceKeywords(transcript, handlers, confidence = null) {
  let lower = transcript.toLowerCase().trim();

  // Detect spelled-out words within the transcript (e.g., "N O R T H" -> "NORTH")
  const words = transcript.split(/\s+/);
  let modified = false;

  for (let i = 0; i < words.length; i++) {
    let letterSequence = [];
    let startIndex = i;

    while (i < words.length && words[i].length === 1 && /^[a-zA-Z]$/.test(words[i])) {
      letterSequence.push(words[i]);
      i++;
    }

    // If we found 3+ consecutive single letters, combine them
    if (letterSequence.length >= 3) {
      const combinedWord = letterSequence.join('').toUpperCase();
      words.splice(startIndex, letterSequence.length, combinedWord);
      modified = true;
      speakAppMessage(`Spelled: ${combinedWord}`);
      i = startIndex - 1;
    } else if (letterSequence.length > 0) {
      i--;
    }
  }

  // If we modified the transcript, rebuild it
  if (modified) {
    transcript = words.join(' ');
    lower = transcript.toLowerCase();
  }

  // When muted, only respond to "unmute"
  if (state.isMuted) {
    if (lower === 'unmute' || lower === 'on mute' || lower === 'un mute') {
      state.pendingCommandProcessed = true;
      state.pausedForSound = false;
      handlers.unmute();
      return false;
    }
    return false;
  }

  // During narration, block game commands but show what was said
  if (state.isNarrating && !state.pausedForSound) {
    displayBlockedCommand(transcript, confidence);
    playBlockedCommand();
    updateStatus('Say "End" to stop narration');
    return false;
  }

  // VOICE-SPECIFIC: "Enter" - Send empty command (for "press any key" screens)
  if (lower === 'enter') {
    handlers.sendCommandDirect('');
    return false;
  }

  // VOICE-SPECIFIC: "Escape" - Send escape key
  if (lower === 'escape') {
    handlers.sendCommandDirect('\x1b');  // ESC character
    return false;
  }

  // "Print [text]" - Literal text bypass (skip command routing)
  const printMatch = transcript.match(/^print\s+(.+)$/i);
  if (printMatch) {
    handlers.sendCommandDirect(printMatch[1]);
    return false;
  }

  // Everything else passes through to be handled as a typed command
  return transcript;
}
