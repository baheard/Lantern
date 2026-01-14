/**
 * Pronunciation Dictionary
 *
 * Manages custom pronunciation mappings for TTS.
 * Stored in localStorage for persistence.
 */

import { getJSON, setJSON } from './storage/storage-api.js';

/**
 * Get the pronunciation map from localStorage
 * @returns {Object} Pronunciation map {word: pronunciation}
 */
export function getPronunciationMap() {
  return getJSON('pronunciationMap', {
    'Anchorhead': 'Anchor-head',
    'ANCHORHEAD': 'ANCHOR-HEAD',
    'resume': 'reh-zoom',
    'Resume': 'Reh-zoom',
    'RESUME': 'REH-ZOOM',
    'nome': 'gnome',
    'Nome': 'Gnome',
    'NOME': 'GNOME',
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
 * @param {string} word - Word to add
 * @param {string} pronunciation - How to pronounce it
 */
export function addPronunciation(word, pronunciation) {
  const map = getPronunciationMap();
  map[word] = pronunciation;
  savePronunciationMap(map);
}

/**
 * Remove a pronunciation mapping
 * @param {string} word - Word to remove
 */
export function removePronunciation(word) {
  const map = getPronunciationMap();
  delete map[word];
  savePronunciationMap(map);
}
