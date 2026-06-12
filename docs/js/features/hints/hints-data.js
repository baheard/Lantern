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

import { getLastLocationName, getMapData } from '../auto-mapper.js';

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
 * @returns {{ sectionIds: Set<string>, questionIds: Set<string> }}
 */
export function findCurrentTopics(hintsData) {
    const sectionIds = new Set();
    const questionIds = new Set();

    if (!hintsData || !Array.isArray(hintsData.sections)) {
        return { sectionIds, questionIds };
    }

    // Build candidate location name set from last-known location + recent journey
    const candidates = new Set();

    const lastName = getLastLocationName();
    if (lastName) {
        candidates.add(lastName.trim().toLowerCase());
    }

    try {
        const mapData = getMapData();
        if (mapData && Array.isArray(mapData.journey)) {
            const recent = mapData.journey.slice(-10);
            for (const entry of recent) {
                if (entry && entry.locationName) {
                    candidates.add(entry.locationName.trim().toLowerCase());
                }
            }
        }
    } catch (_) {
        // getMapData may not be available before auto-mapper initialises
    }

    if (candidates.size === 0) {
        return { sectionIds, questionIds };
    }

    for (const section of hintsData.sections) {
        if (!section.verified) continue;

        const sectionLocs = Array.isArray(section.locations) ? section.locations : [];
        const sectionMatches = sectionLocs.some(
            loc => candidates.has(loc.trim().toLowerCase())
        );

        if (sectionMatches) {
            sectionIds.add(section.id);
        }

        if (!Array.isArray(section.questions)) continue;

        for (const question of section.questions) {
            const qLocs = Array.isArray(question.locations) ? question.locations : [];
            const qMatches = qLocs.some(
                loc => candidates.has(loc.trim().toLowerCase())
            );
            if (qMatches) {
                sectionIds.add(section.id);
                questionIds.add(question.id);
            }
        }
    }

    return { sectionIds, questionIds };
}
