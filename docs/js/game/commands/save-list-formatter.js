/**
 * Save List Formatter Module
 *
 * Functions for retrieving and formatting save game lists.
 */

import { state } from '../../core/state.js';
import { getJSON } from '../../utils/storage/storage-api.js';

/**
 * Get all custom saves for current game
 * @returns {Array} Array of save objects
 */
export function getCustomSaves() {
  const saves = [];
  const prefix = `iftalk_customsave_${state.currentGameName}_`;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      const saveName = key.substring(prefix.length);
      const saveData = getJSON(key);
      if (!saveData) continue;
      saves.push({
        name: saveName,
        timestamp: saveData.timestamp,
        key: key,
        type: 'customsave'
      });
    }
  }

  // Sort by timestamp, newest first
  saves.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return saves;
}

/**
 * Get quicksave info if it exists
 * @returns {object|null} Quicksave object or null
 */
export function getQuicksave() {
  // Try game signature first (newer saves), then game name (older saves)
  const gameSignature = window.zvmInstance?.get_signature?.() || state.currentGameName;
  let key = `iftalk_quicksave_${gameSignature}`;
  let saved = localStorage.getItem(key);

  // Fallback to game name if signature key doesn't exist
  if (!saved && gameSignature !== state.currentGameName) {
    key = `iftalk_quicksave_${state.currentGameName}`;
    saved = localStorage.getItem(key);
  }

  if (!saved) return null;

  const saveData = getJSON(key);
  if (!saveData) return null;
  return {
    name: 'quicksave',
    timestamp: saveData.timestamp,
    key: key,
    type: 'quicksave'
  };
}

/**
 * Get autosave info if it exists
 * @returns {object|null} Autosave object or null
 */
export function getAutosave() {
  const key = `iftalk_autosave_${state.currentGameName}`;
  const saved = localStorage.getItem(key);

  if (!saved) return null;

  const saveData = getJSON(key);
  if (!saveData) return null;
  return {
    name: 'autosave',
    timestamp: saveData.timestamp,
    key: key,
    type: 'autosave'
  };
}

/**
 * Format timestamp for display
 * @param {string} isoString - ISO timestamp string
 * @returns {string} Formatted timestamp
 */
export function formatTimestamp(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Format save entry for display with number
 * @param {object} save - Save object
 * @param {number} index - 1-based index for numbering
 * @returns {string} Formatted HTML string
 */
export function formatSaveEntry(save, index) {
  return `&nbsp;&nbsp;${index}. ${save.name}<br>`;
}

/**
 * Get unified list of all saves (custom + quicksave) for display
 * Sorted by timestamp, newest first
 * Note: Autosave is excluded - it's automatic and managed by the system
 * @returns {Array} Array of save objects
 */
export function getUnifiedSavesList() {
  const saves = getCustomSaves();
  const quicksave = getQuicksave();

  if (quicksave) {
    saves.push(quicksave);
  }

  // Sort by timestamp, newest first
  saves.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return saves;
}

/**
 * Format the unified saves list with numbers
 * @param {Array} saves - Array of save objects
 * @returns {string} Formatted HTML string
 */
export function formatSavesList(saves) {
  let html = '';
  saves.forEach((save, index) => {
    html += formatSaveEntry(save, index + 1);
  });
  return html;
}
