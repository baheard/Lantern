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

/** Navigation commands that are always allowed, even during narration or echo suppression. */
export const NAVIGATION_COMMANDS = ['stop', 'pause', 'play', 'resume', 'skip', 'back', 'repeat',
                                    'end', 'skip all', 'skip to end', 'skip to the end'];
export const SKIP_N_PATTERN = /^skip(?:\s+forward)?\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)$/i;
export const BACK_N_PATTERN = /^(?:back|go\s+back)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)$/i;

/**
 * Pronunciation dictionary for common misrecognitions.
 * Only applies to single-word commands to avoid false positives.
 * Exported so recognition.js can apply corrections before confidence checks.
 */
export const PRONUNCIATION_DICT = {
  'wet': 'west',
  'with': 'west',
  'so': 'south',
  'self': 'south',
  'quickie': 'quick save',
  'away': 'west',  // "go away" should be "go west" (phrase-level will be "go west")
  'murphy': 'northeast',
  'artist': 'northeast',
  'luck': 'look',
};

/**
 * Process voice keywords
 * @param {string} transcript - Voice recognition transcript
 * @param {Object} handlers - Object with handler functions
 * @param {number|null} confidence - Voice recognition confidence (0.0-1.0)
 * @returns {string|false} Processed command text or false if handled here
 */
export async function processVoiceKeywords(transcript, handlers, confidence = null) {
  let lower = transcript.toLowerCase().trim();

  // Fix homophones for number commands (e.g., "back to" -> "back two", "skip for" -> "skip four")
  transcript = transcript.replace(/\b(back|skip)\s+(to|too)\b/gi, '$1 two');
  transcript = transcript.replace(/\b(back|skip)\s+for\b/gi, '$1 four');

  // Fix common misrecognitions that should always be replaced
  transcript = transcript.replace(/\bali\b/gi, 'alley');
  transcript = transcript.replace(/\ballie\b/gi, 'alley');
  transcript = transcript.replace(/\bquick\s+safe\b/gi, 'quick save');
  transcript = transcript.replace(/\bgronk\b/gi, 'grunk');

  // Fix "paul" -> "pull" when it's the first word (common verb misrecognition)
  transcript = transcript.replace(/^paul\b/i, 'pull');

  // Fix "if" alone -> "east" (speech recognition misrecognition of direction)
  transcript = transcript.replace(/^if\.?$/i, 'east');

  lower = transcript.toLowerCase().trim();

  // Apply pronunciation corrections (only for single-word transcripts, using lowercase comparison)
  const words = transcript.trim().split(/\s+/);
  const singleWordLower = words.length === 1 ? words[0].toLowerCase() : null;
  if (singleWordLower && PRONUNCIATION_DICT[singleWordLower]) {
    transcript = PRONUNCIATION_DICT[singleWordLower];
    lower = transcript.toLowerCase();
  }

  // If "back [word]" where word is NOT a number, strip the word and just use "back"
  // This prevents "back lamp" from being sent to the game as a command
  const backNonNumberMatch = transcript.match(/^back\s+(?!(\d+|one|two|three|four|five|six|seven|eight|nine|ten)$)(.+)$/i);
  if (backNonNumberMatch) {
    transcript = 'back';
    lower = 'back';
  }

  // Same for skip - if "skip [word]" where word is NOT a number or "all/end", just use "skip"
  const skipNonNumberMatch = transcript.match(/^skip\s+(?!(\d+|one|two|three|four|five|six|seven|eight|nine|ten|all|to\s+(?:the\s+)?end|forward\s+\d+)$)(.+)$/i);
  if (skipNonNumberMatch) {
    transcript = 'skip';
    lower = 'skip';
  }

  // Detect spelled-out words within the transcript (e.g., "N O R T H" -> "NORTH")
  const transcriptWords = transcript.split(/\s+/);
  let modified = false;

  for (let i = 0; i < transcriptWords.length; i++) {
    let letterSequence = [];
    let startIndex = i;

    while (i < transcriptWords.length && transcriptWords[i].length === 1 && /^[a-zA-Z]$/.test(transcriptWords[i])) {
      letterSequence.push(transcriptWords[i]);
      i++;
    }

    // If we found 3+ consecutive single letters, combine them
    // OR if we found exactly 2 letters that form a valid direction (NE, NW, SE, SW)
    const validTwoLetterDirs = ['ne', 'nw', 'se', 'sw'];
    const isTwoLetterDir = letterSequence.length === 2 &&
                           validTwoLetterDirs.includes(letterSequence.join('').toLowerCase());

    if (letterSequence.length >= 3 || isTwoLetterDir) {
      const combinedWord = letterSequence.join('').toUpperCase();
      transcriptWords.splice(startIndex, letterSequence.length, combinedWord);
      modified = true;

      // Display "Spelled: X" message on screen and narrate if in play mode
      // (but only for 3+ letter words, not for 2-letter directions)
      if (letterSequence.length >= 3) {
        import('../ui/game-output.js').then(({ addGameText }) => {
          const message = `Spelled: ${combinedWord}`;
          addGameText(`<div class="system-message">${message}</div>`, false);

          // Trigger TTS narration if autoplay is enabled
          if (state.autoplayEnabled && window.handleGameOutput) {
            window.handleGameOutput(message);
          }
        });
      }

      i = startIndex - 1;
    } else if (letterSequence.length > 0) {
      i--;
    }
  }

  // If we modified the transcript, rebuild it
  if (modified) {
    transcript = transcriptWords.join(' ');
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

  // When mic is frozen, only respond to "unfreeze"
  if (state.isHoldMic) {
    if (lower === 'unfreeze') {
      state.pendingCommandProcessed = true;
      handlers.openMic();
      return false;
    }
    // Dismiss all other commands silently
    return false;
  }

  // Freeze mic immediately (before narration blocking check)
  if (lower === 'freeze') {
    state.pendingCommandProcessed = true;
    handlers.holdMic();
    return false;
  }

  // During narration, allow navigation commands but block game commands
  if (state.isNarrating && !state.pausedForSound) {
    if (NAVIGATION_COMMANDS.includes(lower) || SKIP_N_PATTERN.test(lower) || BACK_N_PATTERN.test(lower)) {
      // Let navigation commands pass through
      return transcript;
    }

    // Block other commands and show what was said
    displayBlockedCommand(transcript, confidence);
    playBlockedCommand();
    updateStatus('Say "Stop" to skip narration');
    return false;
  }

  // VOICE-SPECIFIC: "Escape" - Send escape key
  if (lower === 'escape') {
    handlers.sendCommandDirect('\x1b');  // ESC character
    return false;
  }

  // VOICE-SPECIFIC: Char mode key commands - Send special keys
  // Single destructuring import; runtime caches the module so repeated calls are free.
  const { getInputType, sendInput } = await import('../game/voxglk.js');
  const inputType = getInputType();

  // VOICE-SPECIFIC: "Enter" - Send enter key in char mode, empty command in line mode
  if (lower === 'enter') {
    if (inputType === 'char') {
      sendInput('return', 'char');
    } else {
      handlers.sendCommandDirect('');
    }
    return false;
  }

  if (inputType === 'char') {

    // "Read all" / "read screen" / "read menu" — re-narrate the full PAK screen
    if (['read', 'read all', 'read screen', 'read menu', 'read page'].includes(lower)) {
      const { getCharModeText, triggerCharModeNarration } = await import('../game/voxglk.js');
      const text = getCharModeText();
      if (text.trim()) triggerCharModeNarration(text);
      return false;
    }

    // Arrow keys
    if (lower === 'up') {
      sendInput('up', 'char');
      return false;
    }
    if (lower === 'down') {
      sendInput('down', 'char');
      return false;
    }
    if (lower === 'left') {
      sendInput('left', 'char');
      return false;
    }
    if (lower === 'right') {
      sendInput('right', 'char');
      return false;
    }

    // Space
    if (lower === 'space' || lower === 'spacebar') {
      sendInput(' ', 'char');
      return false;
    }

    // Backspace/Delete
    if (lower === 'backspace' || lower === 'back space') {
      sendInput('delete', 'char');
      return false;
    }
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
