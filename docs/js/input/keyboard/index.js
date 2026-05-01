/**
 * Keyboard Input Module - Main Export
 *
 * Coordinates keyboard input, voice UI, and system entry mode.
 */

// Import voice UI functions
import {
  setVoiceSpeaking,
  updateVoiceTranscript
} from './voice-ui.js';

// Import system entry functions
import {
  initSystemEntry,
  enterSystemEntryMode as enterSystemEntryModeCore,
  exitSystemEntryMode as exitSystemEntryModeCore,
  isSystemEntryMode
} from './system-entry.js';

// Import core keyboard functionality (will be created from original keyboard.js)
import {
  initKeyboardInput as initKeyboardCore,
  showMessageInput,
  hideMessageInput,
  hasPhysicalKeyboard
} from './keyboard-core.js';

/**
 * Initialize all keyboard input modules
 */
export function initKeyboardInput() {
  initSystemEntry();
  initKeyboardCore();
}

/**
 * Enter system entry mode with proper dependencies injected
 */
export function enterSystemEntryMode(promptText) {
  return enterSystemEntryModeCore(promptText, showMessageInput, hasPhysicalKeyboard);
}

/**
 * Exit system entry mode
 */
export function exitSystemEntryMode() {
  return exitSystemEntryModeCore();
}

// Re-export all public functions
export {
  setVoiceSpeaking,
  updateVoiceTranscript,
  isSystemEntryMode,
  showMessageInput,
  hideMessageInput
};
