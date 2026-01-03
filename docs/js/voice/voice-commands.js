/**
 * Voice Commands Module
 *
 * Processes voice keywords for navigation and game control.
 * Handles both navigation commands (back, skip, pause) and game commands.
 */

import { state } from '../core/state.js';
import { dom } from '../core/dom.js';
import { updateStatus } from '../utils/status.js';
import { speakAppMessage } from '../narration/tts-player.js';
import { displayAppCommand, displayBlockedCommand } from '../ui/game-output.js';
import { getInputType } from '../game/voxglk.js';
import { playBlockedCommand } from '../utils/audio-feedback.js';

/**
 * Parse number words and digits into integers
 * @param {string} word - Number word or digit string (e.g., "three", "3")
 * @returns {number} Parsed number
 */
function parseNumberWord(word) {
  const numberMap = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
  };
  return numberMap[word] || parseInt(word, 10);
}

/**
 * Process voice keywords (navigation and game commands)
 * @param {string} transcript - Voice recognition transcript
 * @param {Object} handlers - Object with handler functions for different commands
 * @param {number|null} confidence - Voice recognition confidence (0.0-1.0)
 * @returns {string|false} Processed command text or false if navigation command
 */
export function processVoiceKeywords(transcript, handlers, confidence = null) {
  let lower = transcript.toLowerCase().trim();

  // Detect spelled-out words within the transcript
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

  // Helper to mark command as processed
  const markCommandProcessed = () => {
    state.pendingCommandProcessed = true;
    state.pausedForSound = false;
  };

  // When muted, only respond to "unmute"
  if (state.isMuted) {
    if (lower === 'unmute' || lower === 'on mute' || lower === 'un mute') {
      markCommandProcessed();
      handlers.unmute();
      return false;
    }
    return false;
  }

  // NAVIGATION COMMANDS (never sent to game)

  // Screen unlock command
  if (lower === 'unlock') {
    markCommandProcessed();
    displayAppCommand('unlock', confidence);
    // Import and call unlock function
    import('../utils/lock-screen.js').then(module => {
      module.unlockScreen();
    });
    return false;
  }

  if (lower === 'repeat') {
    markCommandProcessed();
    displayAppCommand('repeat', confidence);
    handlers.restart();
    return false;
  }

  // "back N" command (e.g., "back 3", "go back 5", "back three")
  const backNMatch = lower.match(/^(?:go\s+)?back\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)$/);
  if (backNMatch) {
    const count = parseNumberWord(backNMatch[1]);
    markCommandProcessed();
    displayAppCommand(`back ${count}`, confidence);
    if (handlers.backN) handlers.backN(count);
    return false;
  }

  if (lower === 'back') {
    markCommandProcessed();
    displayAppCommand('back', confidence);
    handlers.back();
    return false;
  }

  if (lower === 'stop') {
    markCommandProcessed();
    displayAppCommand('end', confidence);
    handlers.skipToEnd();
    return false;
  }

  if (lower === 'pause') {
    markCommandProcessed();
    displayAppCommand('pause', confidence);
    handlers.pause();
    return false;
  }

  if (lower === 'play' || lower === 'resume') {
    markCommandProcessed();
    displayAppCommand('play', confidence);
    handlers.play();
    return false;
  }

  // "skip N" command (e.g., "skip 3", "forward 5", "skip three")
  const skipNMatch = lower.match(/^(?:skip|forward)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)$/);
  if (skipNMatch) {
    const count = parseNumberWord(skipNMatch[1]);
    markCommandProcessed();
    displayAppCommand(`skip ${count}`, confidence);
    if (handlers.skipN) handlers.skipN(count);
    return false;
  }

  if (lower === 'skip') {
    markCommandProcessed();
    displayAppCommand('skip', confidence);
    handlers.skip();
    return false;
  }

  if (lower === 'skip all' || lower === 'skip to end' || lower === 'skip to the end' || lower === 'end') {
    markCommandProcessed();
    displayAppCommand('skip all', confidence);
    handlers.skipToEnd();
    return false;
  }

  if (lower === 'unmute' || lower === 'on mute' || lower === 'un mute') {
    markCommandProcessed();
    displayAppCommand('unmute', confidence);
    handlers.unmute();
    return false;
  }

  if (lower === 'mute') {
    markCommandProcessed();
    displayAppCommand('mute', confidence);
    handlers.mute();
    return false;
  }

  if (lower === 'status') {
    markCommandProcessed();
    displayAppCommand('status', confidence);
    handlers.status();
    return false;
  }

  if (lower === 'get hint' || lower === 'hint') {
    markCommandProcessed();
    displayAppCommand('get hint', confidence);
    if (handlers.getHint) handlers.getHint();
    return false;
  }

  // Quick Save/Load Commands
  if (lower === 'quick save' || lower === 'quicksave') {
    markCommandProcessed();
    displayAppCommand('quick save', confidence);
    if (handlers.quickSave) handlers.quickSave();
    return false;
  }

  if (lower === 'quick load' || lower === 'quickload' || lower === 'quick restore' || lower === 'quickrestore') {
    markCommandProcessed();
    displayAppCommand('quick load', confidence);
    if (handlers.quickLoad) handlers.quickLoad();
    return false;
  }

  // SAVE Command (not quick save)
  if (lower === 'save game' || lower === 'save') {
    markCommandProcessed();
    displayAppCommand('save', confidence);
    if (handlers.saveGame) handlers.saveGame();
    return false;
  }

  // SAVE/RESTORE Commands
  if (lower === 'load game' || lower === 'restore game' || lower === 'load' || lower === 'restore') {
    markCommandProcessed();
    displayAppCommand('restore', confidence);
    if (handlers.restoreLatest) handlers.restoreLatest();
    return false;
  }

  const loadSlotMatch = lower.match(/^(?:load|restore)\s+slot\s+(\d+)$/);
  if (loadSlotMatch) {
    const slot = parseInt(loadSlotMatch[1]);
    markCommandProcessed();
    displayAppCommand(`restore slot ${slot}`, confidence);
    if (handlers.restoreSlot) handlers.restoreSlot(slot);
    return false;
  }

  // During narration, block game commands but show what was said
  if (state.isNarrating && !state.pausedForSound) {
    // Display the blocked command with special styling
    displayBlockedCommand(transcript, confidence);
    playBlockedCommand();
    updateStatus('Say "End" to stop narration');
    return false;
  }

  // GAME COMMANDS

  // "Enter" - Send empty command (for "press any key" screens)
  if (lower === 'enter') {
    handlers.sendCommandDirect('');
    return false;
  }

  // "Print [text]" - Literal text bypass
  const printMatch = transcript.match(/^print\s+(.+)$/i);
  if (printMatch) {
    const literalText = printMatch[1];
    handlers.sendCommandDirect(literalText);
    return false;
  }

  // Regular command - send to game
  return transcript;
}
