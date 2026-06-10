/**
 * Game Settings Module
 *
 * Manages per-game settings with localStorage persistence.
 *
 * Hierarchy:
 * 1. Per-game settings (gameSettings_{name}) - overrides for specific game
 * 2. App defaults (iftalk_app_defaults) - inherited by all games
 * 3. Hardcoded defaults - fallback if nothing else set
 */

import { state } from '../core/state.js';
import { getJSON, setJSON, removeItem, hasItem, getItem, getItemsByPrefix } from './storage/storage-api.js';

const APP_DEFAULTS_KEY = 'iftalk_app_defaults';

/**
 * Get localStorage key for current game's settings
 * @returns {string} Storage key (e.g., "gameSettings_LostPig")
 */
function getGameSettingsKey() {
  const gameName = state.currentGameName;
  if (gameName) {
    return `gameSettings_${gameName}`;
  }
  return 'gameSettings_default';
}

// =============================================================================
// APP DEFAULTS (inherited by all games)
// =============================================================================

/**
 * Load app-wide default settings
 * @returns {Object} App defaults object
 */
export function loadAppDefaults() {
  return getJSON(APP_DEFAULTS_KEY, {});
}

/**
 * Save app-wide default settings
 * @param {Object} defaults - Defaults object to save
 */
export function saveAppDefaults(defaults) {
  setJSON(APP_DEFAULTS_KEY, defaults);
}

/**
 * Get a specific app default value
 * @param {string} settingName - Name of the setting
 * @param {*} hardcodedDefault - Fallback if not in app defaults
 * @returns {*} Setting value
 */
export function getAppDefault(settingName, hardcodedDefault = null) {
  const defaults = loadAppDefaults();
  const value = defaults[settingName];
  return value !== undefined ? value : hardcodedDefault;
}

/**
 * Set a specific app default value
 * @param {string} settingName - Name of the setting
 * @param {*} value - Value to save
 */
export function setAppDefault(settingName, value) {
  const defaults = loadAppDefaults();
  defaults[settingName] = value;
  saveAppDefaults(defaults);
}

/**
 * Clear all app defaults
 */
export function clearAppDefaults() {
  removeItem(APP_DEFAULTS_KEY);
}

// =============================================================================
// PER-GAME SETTINGS (overrides for specific game)
// =============================================================================

/**
 * Load all settings for current game
 * @returns {Object} Settings object with all per-game preferences
 */
export function loadGameSettings() {
  const key = getGameSettingsKey();
  return getJSON(key, {});
}

/**
 * Save all settings for current game
 * @param {Object} settings - Settings object to save
 */
export function saveGameSettings(settings) {
  const key = getGameSettingsKey();
  setJSON(key, settings);
}

/**
 * Get a specific setting value for current game
 * Falls back to app defaults, then to hardcoded default
 * @param {string} settingName - Name of the setting (e.g., "narratorVoice")
 * @param {*} hardcodedDefault - Default value if not found anywhere
 * @returns {*} Setting value
 */
export function getGameSetting(settingName, hardcodedDefault = null) {
  // 1. Check per-game override
  const settings = loadGameSettings();
  if (settings[settingName] !== undefined) {
    return settings[settingName];
  }

  // 2. Fall back to app defaults
  const appDefault = getAppDefault(settingName);
  if (appDefault !== null) {
    return appDefault;
  }

  // 3. Fall back to hardcoded default
  return hardcodedDefault;
}

/**
 * Check if current game has an override for a setting
 * @param {string} settingName - Name of the setting
 * @returns {boolean} True if game has its own value
 */
export function hasGameOverride(settingName) {
  const settings = loadGameSettings();
  return settings[settingName] !== undefined;
}

/**
 * Set a specific setting value for current game
 * @param {string} settingName - Name of the setting
 * @param {*} value - Value to save
 */
export function setGameSetting(settingName, value) {
  const settings = loadGameSettings();
  settings[settingName] = value;
  saveGameSettings(settings);
}

/**
 * Get default settings structure
 * @returns {Object} Default settings object
 */
export function getDefaultSettings() {
  return {
    narratorVoice: null,      // Auto-selected based on platform
    appVoice: null,           // Auto-selected based on platform
    speechRate: 1.0,          // 1.0x speed default (narrator)
    autoplay: false,          // Don't auto-play narration
    // Future settings can be added here:
    // highlightColor: null,
    // fontSize: null,
    // etc.
  };
}

/**
 * List all games with saved settings
 * @returns {Array<string>} Array of game names
 */
export function listGamesWithSettings() {
  const prefix = 'gameSettings_';
  const keys = getItemsByPrefix(prefix);

  return keys
    .map(key => key.substring(prefix.length))
    .filter(gameName => gameName !== 'default');
}

/**
 * Clear settings for current game
 */
export function clearGameSettings() {
  const key = getGameSettingsKey();
  removeItem(key);
}

/**
 * Clear settings for all games
 */
export function clearAllGameSettings() {
  const prefix = 'gameSettings_';
  const keys = getItemsByPrefix(prefix);
  keys.forEach(key => removeItem(key));
}

/**
 * Clear voice settings (narratorVoice, appVoice, speechRate) from all games
 * This makes all games fall back to app defaults for voice settings
 * @returns {number} Number of games updated
 */
export function clearVoiceSettingsFromAllGames() {
  const prefix = 'gameSettings_';
  const voiceSettings = ['narratorVoice', 'appVoice', 'speechRate'];
  const keys = getItemsByPrefix(prefix);
  let gamesUpdated = 0;

  keys.forEach(key => {
    const settings = getJSON(key, null);
    if (!settings) return;

    let modified = false;

    // Remove voice-related settings
    for (const setting of voiceSettings) {
      if (settings[setting] !== undefined) {
        delete settings[setting];
        modified = true;
      }
    }

    if (modified) {
      // If settings object is now empty, remove the key entirely
      if (Object.keys(settings).length === 0) {
        removeItem(key);
      } else {
        setJSON(key, settings);
      }
      gamesUpdated++;
    }
  });

  return gamesUpdated;
}

/**
 * Get all data for a game (settings + save data)
 * @param {string} gameName - Game name (optional, defaults to current game)
 * @returns {Object} Object with settings and saves
 */
export function getGameData(gameName = null) {
  const name = gameName || state.currentGameName || 'default';

  return {
    gameName: name,
    settings: gameName ?
      getJSON(`gameSettings_${name}`, {}) :
      loadGameSettings(),
    saves: {
      quicksave: getItem(`iftalk_quicksave_${name}`),
      glkoteSave: getItem(`glkote_quetzal_${name}`)
    }
  };
}

/**
 * Check if a game has any saved data (settings or saves)
 * @param {string} gameName - Game name
 * @returns {Object} Object indicating what data exists
 */
export function hasGameData(gameName) {
  return {
    hasSettings: hasItem(`gameSettings_${gameName}`),
    hasQuickSave: hasItem(`iftalk_quicksave_${gameName}`),
    hasGlkoteSave: hasItem(`glkote_quetzal_${gameName}`)
  };
}

/**
 * Clear ALL data for a specific game (settings + saves + autosave)
 * @param {string} gameName - Game name (optional, defaults to current game)
 */
export function clearAllGameData(gameName = null) {
  const name = gameName || state.currentGameName || 'default';

  removeItem(`gameSettings_${name}`);
  removeItem(`iftalk_quicksave_${name}`);
  removeItem(`iftalk_autosave_${name}`);
  removeItem(`glkote_quetzal_${name}`);
  removeItem(`zvm_autosave_${name}`);
}

/**
 * Clear ALL app data (all games + app defaults)
 * Used by "Delete All Data" on welcome screen
 */
export function clearAllAppData() {
  const prefixes = ['iftalk_', 'gameSettings_', 'glkote_quetzal_', 'zvm_autosave_'];
  let totalRemoved = 0;

  // Find and remove all IFTalk-related keys
  prefixes.forEach(prefix => {
    const keys = getItemsByPrefix(prefix);
    keys.forEach(key => removeItem(key));
    totalRemoved += keys.length;
  });

  // Reset narrator pronunciation and STT substitution dictionaries to defaults
  // (stored under unprefixed keys, not covered by the prefixes above)
  ['pronunciationMap', 'sttSubstitutionsAdded', 'sttSubstitutionsDeleted'].forEach(key => {
    if (hasItem(key)) {
      removeItem(key);
      totalRemoved++;
    }
  });

  return totalRemoved;
}

/**
 * List all games with any data (settings or saves)
 * @returns {Array<Object>} Array of game objects with data info
 */
export function listAllGames() {
  const games = new Map();

  const processKeys = (prefix, property) => {
    const keys = getItemsByPrefix(prefix);
    keys.forEach(key => {
      const gameName = key.substring(prefix.length);
      if (gameName !== 'default') {
        if (!games.has(gameName)) {
          games.set(gameName, { gameName, hasSettings: false, hasQuickSave: false, hasGlkoteSave: false });
        }
        games.get(gameName)[property] = true;
      }
    });
  };

  processKeys('gameSettings_', 'hasSettings');
  processKeys('iftalk_quicksave_', 'hasQuickSave');
  processKeys('glkote_quetzal_', 'hasGlkoteSave');

  return Array.from(games.values()).sort((a, b) => a.gameName.localeCompare(b.gameName));
}
