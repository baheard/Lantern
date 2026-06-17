/**
 * Hints Data - Loader and location matcher for UHS-style hint files
 *
 * Loads per-game static JSON hint files from docs/games/hints/<gameName>.json.
 * Location matching is powered by the auto-mapper (getLastLocationName +
 * getMapData().journey) so matches are exact against observed room names.
 *
 * See reference/ai-hints-system.md for history of the previous AI hints
 * approach and why it was removed (v1.4.85).
 */

import { getLastLocationName, getLastStatusContext } from '../auto-mapper.js';
import { getReachedMilestone, setReachedMilestone } from './hints-state.js';

// Module-level cache: maps gameName → { data } or { error } (404s cached too)
const _cache = new Map();

/**
 * Load hints JSON for the given game name.
 * Returns null when no hints file exists for this game (404 is cached as null).
 *
 * @param {string} gameName - Normalised game name (e.g. "theatre")
 * @returns {Promise<Object|null>} Parsed hints data or null
 */
export async function loadHints(gameName) {
    if (_cache.has(gameName)) {
        return _cache.get(gameName);
    }

    try {
        const url = `games/hints/${gameName}.json`;
        const resp = await fetch(url);

        if (resp.status === 404) {
            _cache.set(gameName, null);
            return null;
        }

        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status} fetching ${url}`);
        }

        const data = await resp.json();

        if (data.schema !== 1) {
            console.warn('[hints-data] Unsupported schema version:', data.schema);
            _cache.set(gameName, null);
            return null;
        }

        _cache.set(gameName, data);
        return data;
    } catch (err) {
        console.error('[hints-data] Failed to load hints for', gameName, err);
        _cache.set(gameName, null);
        return null;
    }
}

/**
 * Find which sections and questions are relevant to the player's current
 * location.  Uses getLastLocationName() as the primary source (survives
 * clearJourney()) and falls back to the last ~10 journey entries for recency.
 *
 * Matching is case-insensitive / whitespace-trimmed.
 *
 * @param {Object} hintsData - Loaded hints data object
 * @param {string} [gameName] - Current game (needed for milestone scoping)
 * @returns {{ sectionIds: Set<string>, questionIds: Set<string> }}
 */
export function findCurrentTopics(hintsData, gameName) {
    const sectionIds = new Set();
    const questionIds = new Set();

    if (!hintsData || !Array.isArray(hintsData.sections)) {
        return { sectionIds, questionIds };
    }

    const lastName = getLastLocationName();
    if (!lastName) return { sectionIds, questionIds };

    const currentLoc = lastName.trim().toLowerCase();
    const currentPhase = (getLastStatusContext() || '').toLowerCase();

    // Optional `phase` scoping: when a section/question declares a `phase` string, it
    // only matches if the game's current status-bar context contains it (e.g. "day two").
    // No `phase` → location-only behaviour, exactly as before. This lets games that reuse
    // the same geography across acts/days (Anchorhead) avoid badging the wrong act.
    const phaseMatches = (obj, inheritedPhase) => {
        const phase = (obj.phase || inheritedPhase || '').trim().toLowerCase();
        return !phase || currentPhase.includes(phase);
    };

    // Optional `milestone` scoping: for games whose status bar can't name the act (e.g. a
    // clock), a section/question can declare an `afterMilestone`/`untilMilestone` window.
    // Milestones latch one-way as the player crosses act boundaries (see updateMilestone),
    // so a room that recurs across acts (Wishbringer's Festeron→Witchville) badges the
    // section whose act the player is actually in. No milestone fields → always-active.
    const milestones = Array.isArray(hintsData.milestones) ? hintsData.milestones : [];
    // Reached-index space is 0-based: index 0 is the first/start act (milestones[0]),
    // index N is milestones[N]. Default reached = 0 = start act.
    const indexById = new Map(milestones.map((m, i) => [m.id, i]));
    const reached = getReachedMilestone(gameName);
    const milestoneMatches = (obj, inheritedAfter, inheritedUntil) => {
        const after = obj.afterMilestone || inheritedAfter;
        const until = obj.untilMilestone || inheritedUntil;
        if (after && reached < (indexById.get(after) ?? 0)) return false;
        if (until && reached >= (indexById.get(until) ?? Infinity)) return false;
        return true;
    };

    for (const section of hintsData.sections) {
        const sectionLocs = Array.isArray(section.locations) ? section.locations : [];
        const locMatch = sectionLocs.some(loc => currentLoc === loc.trim().toLowerCase());
        // A phase-scoped section pins for its WHOLE act: once the status-bar phase matches,
        // the section is "current" regardless of which room you're in, so the pin/badge
        // doesn't blink out in transit rooms a section's `locations` doesn't list (e.g.
        // Anchorhead's Upstairs Hall on day two). Location-only sections (no `phase`) keep
        // strict room matching. Question matching below stays room-based either way — hints
        // still unlock per room; only the section-level pin follows the act.
        const hasPhase = !!(section.phase && section.phase.trim());
        if ((locMatch || hasPhase) && phaseMatches(section) && milestoneMatches(section)) {
            sectionIds.add(section.id);
        }

        if (!Array.isArray(section.questions)) continue;

        for (const question of section.questions) {
            const qLocs = Array.isArray(question.locations) ? question.locations : [];
            // A question inherits its section's phase/milestone window unless it overrides.
            if (qLocs.some(loc => currentLoc === loc.trim().toLowerCase())
                && phaseMatches(question, section.phase)
                && milestoneMatches(question, section.afterMilestone, section.untilMilestone)) {
                sectionIds.add(section.id);
                questionIds.add(question.id);
            }
        }
    }

    return { sectionIds, questionIds };
}

/**
 * Latch the player's milestone (act) progress. Called on every location change with the
 * current turn's output text. A milestone *fires* when the current room is one of its
 * `enterLocations` OR the output text contains its `textMatch` signature (any-of).
 *
 * Two latch behaviours:
 *  - A `start: true` milestone (the first/reset act) fires → milestone is FORCED to its
 *    index (a down-move). This is how an in-game RESTART self-heals: returning to the start
 *    act's room / seeing its prose ("Festeron") resets to act 0 with no VM-event hook.
 *  - Any other milestone fires → milestone advances to the highest such index (forward only,
 *    never regresses). Non-start signatures need NOT be act-exclusive — a recurring prose
 *    word like "Witchville" only ever raises the floor, so a later act mentioning it can't
 *    pull the player back.
 *
 * `textMatch` recovers the discriminator the status-bar location parser discards (room prose
 * says "the Witchville Cemetery"; the status bar says only "Outside Cemetery"). Pass the
 * latest game output (current turn's text), not the whole scrollback, so a stale signature
 * from many turns ago can't force a spurious reset.
 *
 * See the generate-hints skill ("Milestone scoping") for how to choose triggers.
 *
 * @param {Object} hintsData - Loaded hints data object
 * @param {string} [gameName]
 * @param {string} [outputText] - The current turn's game output text (for `textMatch`)
 */
export function updateMilestone(hintsData, gameName, outputText = '') {
    const milestones = Array.isArray(hintsData?.milestones) ? hintsData.milestones : [];
    if (milestones.length === 0) return;

    const currentLoc = (getLastLocationName() || '').trim().toLowerCase();
    const text = (outputText || '').toLowerCase();

    const fires = (m) => {
        const locHit = Array.isArray(m.enterLocations)
            && m.enterLocations.some(loc => currentLoc === loc.trim().toLowerCase());
        const textHit = m.textMatch && text.includes(String(m.textMatch).toLowerCase());
        return locHit || textHit;
    };

    // Start/reset milestone wins: its trigger forces an exact reset (down-move allowed).
    for (let i = 0; i < milestones.length; i++) {
        if (milestones[i].start && fires(milestones[i])) {
            setReachedMilestone(i, gameName);
            return;
        }
    }

    // Forward latch: advance to the highest non-start milestone whose trigger fired.
    const reached = getReachedMilestone(gameName);
    let best = reached;
    milestones.forEach((m, i) => { if (!m.start && fires(m) && i > best) best = i; });
    if (best > reached) setReachedMilestone(best, gameName);
}
