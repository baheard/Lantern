/**
 * Hints State - Reveal-state persistence for UHS-style hints
 *
 * Persists per-game hint reveal counts to localStorage using storage-api.js.
 * Key pattern: getGameKey('hints') → "lantern_hints_<gameName>"
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
 * Does NOT reset seen-sections (those track visited rooms, not hint state).
 *
 * @param {string} [gameName]
 */
export function resetAll(gameName) {
    const key = getGameKey('hints', gameName);
    setJSON(key, { revealed: {}, updatedAt: new Date().toISOString() });
}

/**
 * Return the set of section IDs that have ever been pinned (location-matched)
 * for this game. Used to decide which sections to blur.
 *
 * @param {string} [gameName]
 * @returns {Set<string>}
 */
export function getSeenSections(gameName) {
    const key = getGameKey('hints_seen', gameName);
    const stored = getJSON(key, null);
    return new Set(Array.isArray(stored) ? stored : []);
}

/**
 * Persist one or more section IDs as "ever seen" (location matched at some point).
 *
 * @param {Iterable<string>} sectionIds
 * @param {string} [gameName]
 */
export function markSectionsSeen(sectionIds, gameName) {
    const key = getGameKey('hints_seen', gameName);
    const existing = getSeenSections(gameName);
    for (const id of sectionIds) existing.add(id);
    setJSON(key, [...existing]);
}

/**
 * Get the user's own rating for a specific revealed hint, if any.
 * Keyed by "<questionId>:<hintIndex>" within the per-game `hints_ratings` store.
 * Local-only (like reveal state) — never Drive-synced. See [[hints-feedback-system]].
 *
 * @param {string} questionId
 * @param {number} hintIndex - 0-based index of the hint within the question
 * @param {string} [gameName]
 * @returns {'up'|'down'|null}
 */
export function getHintRating(questionId, hintIndex, gameName) {
    const key = getGameKey('hints_ratings', gameName);
    const stored = getJSON(key, null);
    if (!stored || typeof stored !== 'object') return null;
    const r = stored[`${questionId}:${hintIndex}`];
    return r === 'up' || r === 'down' ? r : null;
}

/**
 * Persist the user's rating for a specific hint (prevents re-voting / duplicate sends).
 *
 * @param {string} questionId
 * @param {number} hintIndex
 * @param {'up'|'down'} rating
 * @param {string} [gameName]
 */
export function setHintRating(questionId, hintIndex, rating, gameName) {
    if (rating !== 'up' && rating !== 'down') return;
    const key = getGameKey('hints_ratings', gameName);
    const stored = getJSON(key, null);
    const map = stored && typeof stored === 'object' ? stored : {};
    map[`${questionId}:${hintIndex}`] = rating;
    setJSON(key, map);
}

/**
 * Return the milestone (act) index the player is currently in for this game.
 *
 * Milestones model act boundaries (e.g. Festeron → Witchville) for games whose
 * status bar can't name the act (the `phase` mechanism's blind spot — e.g. a
 * clock-only status bar). Index 0 is the first/start act in the file's ordered
 * `milestones` array; index N is `milestones[N]`. The value is set EXACT by the
 * most-recently-entered act-exclusive marker room (see updateMilestone in
 * hints-data.js) — not monotonic — so re-entering the start act's marker after an
 * in-game RESTART correctly drops the player back to act 0.
 *
 * @param {string} [gameName]
 * @returns {number}
 */
export function getReachedMilestone(gameName) {
    const key = getGameKey('hints_milestone', gameName);
    const stored = getJSON(key, 0);
    return typeof stored === 'number' && stored >= 0 ? stored : 0;
}

/**
 * Set the current milestone (act) index EXACTLY — may move up OR down. Down-moves
 * are intentional: entering the start act's marker room (e.g. after RESTART) resets
 * to act 0, and restoring an earlier save (save-coupling, save-manager.js) restores
 * that save's act. Marker rooms must be act-exclusive and not revisited later (the
 * start room on RESTART being the deliberate exception) — see the generate-hints skill.
 *
 * @param {number} index
 * @param {string} [gameName]
 */
export function setReachedMilestone(index, gameName) {
    const key = getGameKey('hints_milestone', gameName);
    if (typeof index === 'number' && index >= 0) setJSON(key, index);
}
