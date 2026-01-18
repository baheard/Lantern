/**
 * Pronunciation Dictionary
 *
 * Manages custom pronunciation mappings for TTS.
 * Stored in localStorage for persistence.
 */

import { getJSON, setJSON } from './storage/storage-api.js';

/**
 * Get the pronunciation map from localStorage
 * All keys are stored in lowercase for case-insensitive matching
 * @returns {Object} Pronunciation map {word: pronunciation}
 */
export function getPronunciationMap() {
  return getJSON('pronunciationMap', {
    'anchorhead': 'Anchor-head',
    'resume': 'reh-zoom',
    'nome': 'gnome',
  });
}

/**
 * Save pronunciation map to localStorage
 * @param {Object} map - Pronunciation map to save
 */
export function savePronunciationMap(map) {
  setJSON('pronunciationMap', map);
}

/**
 * Apply pronunciation fixes to text
 * @param {string} text - Text to fix
 * @returns {string} Text with pronunciation fixes applied
 */
export function fixPronunciation(text) {
  const pronunciationMap = getPronunciationMap();

  let fixed = text;

  // Remove formatting characters that shouldn't be spoken
  // Remove asterisks (used for emphasis/headings)
  fixed = fixed.replace(/\*/g, '');
  // Remove prompt characters (">") - display only, never spoken
  fixed = fixed.replace(/>/g, '');
  // Clean up multiple spaces
  fixed = fixed.replace(/\s+/g, ' ').trim();

  // Apply word-specific pronunciation fixes
  for (const [word, pronunciation] of Object.entries(pronunciationMap)) {
    // Use word boundaries to avoid partial matches
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    fixed = fixed.replace(regex, pronunciation);
  }

  return fixed;
}

/**
 * Add a new pronunciation mapping
 * Words are stored in lowercase for case-insensitive matching
 * @param {string} word - Word to add
 * @param {string} pronunciation - How to pronounce it
 */
export function addPronunciation(word, pronunciation) {
  const map = getPronunciationMap();
  // Store word in lowercase for case-insensitive matching
  map[word.toLowerCase()] = pronunciation;
  savePronunciationMap(map);
}

/**
 * Remove a pronunciation mapping
 * Words are stored in lowercase for case-insensitive matching
 * @param {string} word - Word to remove
 */
export function removePronunciation(word) {
  const map = getPronunciationMap();
  // Remove using lowercase key
  delete map[word.toLowerCase()];
  savePronunciationMap(map);
}
