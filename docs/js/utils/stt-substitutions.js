/**
 * STT Substitutions
 *
 * Manages speech-to-text substitution mappings — single-word corrections
 * applied to voice command transcripts before they're processed
 * (e.g., "wet" -> "west").
 *
 * The effective map is computed live as: built-in defaults, minus any keys
 * the user has deleted, plus any entries the user has added (which can also
 * override a default's value). Only the deletions and additions are stored.
 * This means new defaults added in a future version automatically reach
 * existing users (unless they deleted that key), and "reset to defaults" is
 * just clearing the two override lists.
 */

import { getJSON, setJSON, removeItem } from './storage/storage-api.js';

/** Built-in default substitutions for common single-word misrecognitions. */
export const DEFAULT_STT_SUBSTITUTIONS = {
  'wet': 'west',
  'with': 'west',
  'we': 'west',
  'wes': 'west',
  'what': 'west',
  'so': 'south',
  'self': 'south',
  'quickie': 'quick save',
  'quicksand': 'quick save',
  'away': 'west',
  'murphy': 'northeast',
  'artist': 'northeast',
  'luck': 'look',
  'breath': 'brief',
  'breathe': 'brief',
  'town': 'down',
  'cell': 'south',
  'safe': 'save',
};

const ADDED_KEY = 'sttSubstitutionsAdded';
const DELETED_KEY = 'sttSubstitutionsDeleted';

/**
 * Get the effective STT substitutions map: built-in defaults, minus deleted
 * keys, plus user-added/overridden entries.
 * @returns {Object} Substitutions map {heard: command}
 */
export function getSttSubstitutionsMap() {
  const added = getJSON(ADDED_KEY, {});
  const deleted = getJSON(DELETED_KEY, []);

  const map = { ...DEFAULT_STT_SUBSTITUTIONS };
  for (const key of deleted) {
    delete map[key];
  }
  return { ...map, ...added };
}

/**
 * Add a new STT substitution, or override a default's value
 * Heard words are stored in lowercase for case-insensitive matching
 * @param {string} heard - Word as recognized by speech-to-text
 * @param {string} command - Word/phrase to substitute it with
 */
export function addSttSubstitution(heard, command) {
  const key = heard.toLowerCase().trim();
  const added = getJSON(ADDED_KEY, {});
  added[key] = command.trim();
  setJSON(ADDED_KEY, added);
}

/**
 * Remove an STT substitution. If it's a built-in default, records it as
 * deleted so it stays removed (until reset to defaults).
 * @param {string} heard - Word key to remove (matched case-insensitively)
 */
export function removeSttSubstitution(heard) {
  const key = heard.toLowerCase().trim();

  const added = getJSON(ADDED_KEY, {});
  if (key in added) {
    delete added[key];
    setJSON(ADDED_KEY, added);
  }

  if (key in DEFAULT_STT_SUBSTITUTIONS) {
    const deleted = getJSON(DELETED_KEY, []);
    if (!deleted.includes(key)) {
      deleted.push(key);
      setJSON(DELETED_KEY, deleted);
    }
  }
}

/**
 * Reset STT substitutions to built-in defaults, discarding all
 * user additions, overrides, and deletions.
 */
export function resetSttSubstitutions() {
  removeItem(ADDED_KEY);
  removeItem(DELETED_KEY);
}
