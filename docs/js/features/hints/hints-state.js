/**
 * Hints State - Reveal-state persistence for UHS-style hints
 *
 * Persists per-game hint reveal counts to localStorage using storage-api.js.
 * Key pattern: getGameKey('hints') → "iftalk_hints_<gameName>"
 *
 * Storage format: { revealed: { "<questionId>": <count>, ... }, updatedAt }
 *
 * NOTE: This state is intentionally local-only. The Drive sync whitelist in
 * gdrive-sync.js covers save-slot types only; hint reveal state is ephemeral
 * enough that it should not bloat synced data.
 */

import { getJSON, setJSON, getGameKey } from '../../utils/storage/storage-api.js';

/**
 * Load the reveal state for the current game.
 *
 * @param {string} [gameName] - Override game name; defaults to current game via getGameKey
 * @returns {{ revealed: Object.<string, number>, updatedAt: string|null }}
 */
function loadState(gameName) {
    const key = getGameKey('hints', gameName);
    const stored = getJSON(key, null);
    if (stored && typeof stored === 'object' && stored.revealed) {
        return stored;
    }
    return { revealed: {}, updatedAt: null };
}

/**
 * Persist the reveal state.
 *
 * @param {{ revealed: Object, updatedAt: string|null }} state
 * @param {string} [gameName]
 */
function saveState(state, gameName) {
    const key = getGameKey('hints', gameName);
    setJSON(key, state);
}

/**
 * Get the number of hints already revealed for a question.
 *
 * @param {string} questionId
 * @param {string} [gameName]
 * @returns {number}
 */
export function getRevealedCount(questionId, gameName) {
    const state = loadState(gameName);
    return state.revealed[questionId] || 0;
}

/**
 * Reveal the next hint for a question (increment count, persist).
 * Returns the new revealed count (capped at totalHints).
 *
 * @param {string} questionId
 * @param {number} totalHints - Total hints available for this question
 * @param {string} [gameName]
 * @returns {number} New revealed count
 */
export function revealNext(questionId, totalHints, gameName) {
    const state = loadState(gameName);
    const current = state.revealed[questionId] || 0;
    if (current >= totalHints) return current;

    const next = current + 1;
    state.revealed[questionId] = next;
    state.updatedAt = new Date().toISOString();
    saveState(state, gameName);
    return next;
}

/**
 * Reset all revealed hints for the current game.
 *
 * @param {string} [gameName]
 */
export function resetAll(gameName) {
    const key = getGameKey('hints', gameName);
    setJSON(key, { revealed: {}, updatedAt: new Date().toISOString() });
}
