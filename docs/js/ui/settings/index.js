/**
 * Settings Module - Main Entry Point
 *
 * Re-exports all settings functionality for backward compatibility.
 */

// Import for use in initAllSettings
import { initSettings } from './settings-panel.js';
import { initVoiceSelection } from './voice-selection.js';
import { initPronunciationUI } from './pronunciation-ui.js';
import { initSttSubstitutionsUI } from './stt-substitutions-ui.js';
import { initDataManagementUI } from './data-management-ui.js';
import { initGDriveUI } from './gdrive-ui.js';
import { initSyncPreview } from '../sync-preview-modal.js';

// Settings Panel
export {
  isOnWelcomeScreen,
  getGameDisplayName,
  updateSettingsContext,
  updateCurrentGameDisplay,
  reloadSettingsForGame,
  initSettings
} from './settings-panel.js';

// Voice Selection
export {
  getDefaultVoice,
  getDefaultAppVoice,
  populateVoiceDropdown,
  loadBrowserVoiceConfig,
  initVoiceSelection
} from './voice-selection.js';

// Pronunciation UI
export {
  initPronunciationUI
} from './pronunciation-ui.js';

// STT Substitutions UI
export {
  initSttSubstitutionsUI
} from './stt-substitutions-ui.js';

// Data Management UI
export {
  initDataManagementUI
} from './data-management-ui.js';

// Google Drive UI
export {
  initGDriveUI
} from './gdrive-ui.js';

/**
 * Initialize all settings modules
 * This is the main entry point that should be called from app.js
 */
export function initAllSettings() {
  initSettings();
  initVoiceSelection();
  initPronunciationUI();
  initSttSubstitutionsUI();
  initDataManagementUI();
  initGDriveUI();
  initSyncPreview();
}
