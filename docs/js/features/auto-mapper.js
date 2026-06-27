/**
 * Auto-Mapper - Location Tracking for Interactive Fiction
 *
 * Version 6: Name-based tracking using status bar text.
 * No VM memory reading - uses direction traveled + location name only.
 * This avoids exposing internal object IDs and works across all game types.
 */

// Map data structure per game
// Journey is all we need! It contains:
// - All locations (with revisits)
// - All connections (implicit in sequence)
// - All commands (for edge labels)
// - Spatial info (via direction commands)
let mapData = {
  gameName: null,
  journey: []  // Array of { locationName, command }
};

// Track last known location and command
let lastLocationName = null;
let lastStatusContext = '';  // right-aligned status region (e.g. "day one, evening") — for phase-scoped hints
let lastCommand = null;
let startCheckTimeout = null;
let pendingSceneBreak = false; // Set when a screen clear happens — next location change gets no edge
let suppressJourneyClear = false; // Set by map-canvas while a new-area hint is pending
let suppressNextJourneyClear = false; // One-shot: suppress the single scene-break clear after restore

export function setSuppressJourneyClear(val) { suppressJourneyClear = val; }
export function setSuppressNextJourneyClear(val) { suppressNextJourneyClear = val; }

/**
 * Get current location from status bar text
 * Extracts location name from the left side of the status bar
 * @param {string} statusBarText - Raw status bar text from the game
 * @returns {{ name: string } | null}
 */
export function getCurrentLocation(statusBarText) {
  if (!statusBarText || !statusBarText.trim()) {
    return null;
  }

  // Multi-line upper windows (e.g. Bronze map display): use only the first line,
  // which always contains the room name.
  let locationName = statusBarText.trim();
  if (locationName.includes('\n')) {
    locationName = locationName.split('\n')[0];
  }

  // Remove common suffixes like "Score:", "Moves:", "Time:", etc.
  const suffixPatterns = [
    /\s+Score:\s*\d+.*/i,
    /\s+Moves:\s*\d+.*/i,
    /\s+Time:\s*.*/i,
    /\s+Turns:\s*\d+.*/i,
    /\s{3,}.*$/,           // Multiple spaces often separate location from stats
    /,\s+[a-z].*$/,        // Comma + lowercase = status suffix (e.g. "Room, day one, evening")
  ];

  for (const pattern of suffixPatterns) {
    locationName = locationName.replace(pattern, '');
  }

  // Clean up trailing punctuation (commas, periods, etc.)
  locationName = locationName.trim().replace(/[,.:;!?]+$/, '').trim();

  if (!locationName) {
    return null;
  }

  return { name: locationName };
}

/**
 * Map-node identity for a location name: strip a trailing parenthetical SUB-STATE
 * like "(on the chair)" / "(on the settee)" / "(in the bed)" so a transient posture/
 * position state collapses onto its base room and doesn't spawn a phantom map node
 * when the player merely sits/lies/mounts.
 *
 * IMPORTANT — map identity ONLY. The FULL name still rides `getCurrentLocation()` and
 * the `locationChanged` event, because location art keys on it to show the distinct
 * seated view (e.g. "Curtained Room (on the chair)" → the mirror-reflection image).
 * Only the map's node identity is stripped, so the two consumers stay independent
 * (route-by-consumer, same as the live-vs-replay parity rule).
 *
 * Conservative: only collapses a trailing paren that opens with a positional
 * preposition/gerund — arbitrary parentheticals are left intact.
 *
 * @param {string} name
 * @returns {string}
 */
export function mapNodeName(name) {
  if (!name || typeof name !== 'string') return name;
  const stripped = name.replace(
    /\s*\((?:on|in|at|atop|under|behind|astride|aboard|sitting|seated|lying|lain|riding|standing|kneeling|perched)\b[^)]*\)\s*$/i,
    ''
  ).trim();
  return stripped || name; // never collapse a name that is ENTIRELY a parenthetical
}

/**
 * Get the secondary "phase" context from the status bar — the right-aligned region
 * the location parser discards (e.g. "day one, evening", "Chapter 2", "Score: 10").
 * This is the game-agnostic signal hint sections can scope to via an optional `phase`
 * field (see hints-data.js). Returns '' when the status bar has no right-aligned region.
 *
 * @param {string} statusBarText - Raw status bar text from the game
 * @returns {string}
 */
export function getStatusContext(statusBarText) {
  if (!statusBarText || !statusBarText.trim()) return '';
  const line = statusBarText.split('\n')[0];
  // The right region is whatever follows a run of 3+ spaces (status bars right-align
  // stats/act/time there). Greedy from the first such gap to end of line.
  const m = line.match(/\S\s{3,}(\S.*)$/);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

/**
 * Check for location change and dispatch event if changed
 * Called after each game turn from voxglk.js
 * @param {string} statusBarText - Status bar text from the game
 * @param {number} generation - Current game turn number
 */
export function checkLocationChange(statusBarText, generation, currentInputType = null) {
  const location = getCurrentLocation(statusBarText);
  if (!location) {
    return;
  }

  // IMPORTANT: Skip location tracking during char mode (press any key screens)
  // These are menus, pagers, and intro screens - not real game locations
  // Use the current turn's input type (passed from voxglk) or fall back to getInputType()
  let inputType = currentInputType;
  if (inputType === null) {
    const voxglk = window._voxglkModule;
    if (voxglk && voxglk.getInputType) {
      inputType = voxglk.getInputType();
    }
  }

  if (inputType === 'char') {
    // Char mode - this is a press-any-key screen, not a real location
    // Don't add to journey or fire location change events
    return;
  }

  // Update phase context every real turn — it can change while the room name stays
  // the same (e.g. Master Bedroom: "day one, evening" → "day two").
  const previousStatusContext = lastStatusContext;
  lastStatusContext = getStatusContext(statusBarText);

  const locationChanged = location.name !== lastLocationName;

  if (!locationChanged) {
    // Same location — consume any pending scene break so it doesn't bleed into the next
    // real move. This happens after restore: the screen clears but the status bar still
    // shows the same room, so the break should be discarded here rather than carried forward.
    if (pendingSceneBreak) pendingSceneBreak = false;
    // The room name didn't change but the phase context might have (e.g. sleeping
    // "day one" → "day two" in the same bedroom). Phase-scoped hints need to re-evaluate,
    // so signal the change — locationChanged won't fire to do it for them.
    if (lastStatusContext !== previousStatusContext) {
      window.dispatchEvent(new CustomEvent('statusContextChanged', {
        detail: { locationName: location.name, statusContext: lastStatusContext, generation }
      }));
    }
    return;
  }

  {
    const previousLocationName = lastLocationName;
    lastLocationName = location.name;

    // If a screen clear happened since the last location, this is a scene transition —
    // not directional travel. Record with null command so no edge is drawn.
    const effectiveCommand = pendingSceneBreak ? null : lastCommand;
    pendingSceneBreak = false;

    // Scene break — discard the old journey so syncFromAutoMapper sees a clean slate.
    // Suppressed while map-canvas is holding a new-area decision (accumulates across breaks).
    // Also suppressed once after restore so the restore's screen-clear doesn't wipe the
    // just-loaded journey (suppressNextJourneyClear is a one-shot flag).
    if (effectiveCommand === null) {
      if (!suppressJourneyClear && !suppressNextJourneyClear) {
        mapData.journey = [];
      }
      suppressNextJourneyClear = false;
    }

    // Add to journey (that's all we need!)
    // positionCommand preserves the actual direction typed even when effectiveCommand is
    // null (scene break). syncFromAutoMapper uses it so nodes stay spatially correct.
    mapData.journey.push({
      locationName: location.name,
      command: effectiveCommand,
      positionCommand: lastCommand || null
    });

    // Dispatch event for other modules to listen
    // Use location name as the identifier (no more object IDs)
    window.dispatchEvent(new CustomEvent('locationChanged', {
      detail: {
        locationId: location.name,  // Use name as ID for compatibility
        locationName: location.name,
        previousLocationId: previousLocationName,
        previousLocationName,
        generation,
        command: effectiveCommand
      }
    }));
  }
}

/**
 * Set the last command (called before VM processes it)
 * @param {string} command
 */
export function setLastCommand(command) {
  lastCommand = command;
}

/**
 * Signal that a screen clear just happened.
 * The next location change is a scene transition, not directional travel —
 * so no map edge should be drawn for it.
 */
export function setSceneBreak() {
  pendingSceneBreak = true;
}

/**
 * Get all map data
 * @returns {Object}
 */
export function getMapData() {
  return {
    gameName: mapData.gameName,
    journey: mapData.journey
  };
}

/**
 * Get visited locations count (count unique names in journey)
 * @returns {number}
 */
export function getVisitedCount() {
  const uniqueLocations = new Set(mapData.journey.map(j => j.locationName));
  return uniqueLocations.size;
}

/**
 * Initialize auto-mapper for a game
 * @param {string} gameName
 */
export function initAutoMapper(gameName) {
  // Check for restored auto-mapper data from save file
  const restoreKey = `lantern_automapper_restore_${gameName}`;
  const restoredDataStr = localStorage.getItem(restoreKey);

  if (restoredDataStr) {
    try {
      const restoredData = JSON.parse(restoredDataStr);

      mapData = {
        gameName,
        journey: restoredData.journey || []
      };

      // Set last location from journey
      if (restoredData.journey && restoredData.journey.length > 0) {
        const lastJourney = restoredData.journey[restoredData.journey.length - 1];
        lastLocationName = lastJourney.locationName;
      }

      // Clean up restore key
      localStorage.removeItem(restoreKey);

      // Skip the starting location check since we restored from save
      return;

    } catch (error) {
      console.error('Failed to restore auto-mapper data:', error);
      // Fall back to fresh initialization
      mapData = {
        gameName,
        journey: []
      };
      lastLocationName = null;
    }
  } else {
    // No restored data - fresh start
    mapData = {
      gameName,
      journey: []
    };
    lastLocationName = null;
  }

  lastCommand = null;

  // Expose helper to window for debugging
  window.getCurrentLocation = getCurrentLocation;
  window.getMapData = getMapData;

  // Cancel any pending start check from previous init
  if (startCheckTimeout) {
    clearTimeout(startCheckTimeout);
    startCheckTimeout = null;
  }

  // Check for starting location from existing status bar
  // Status bar may have already been rendered before this init
  // Use retry mechanism since game may still be initializing
  let attempts = 0;
  const checkStartingLocation = () => {
    const statusBarEl = document.getElementById('statusBar');
    // Prefer the left span (room name only) — textContent includes the chunk-delimiter span (", ")
    // which would concatenate left+right into e.g. "Master Bedroom, day one, evening".
    // Re-join the right span (phase/act context, e.g. "day one") with a 3+ space gap so
    // getStatusContext() rehydrates lastStatusContext on resume — otherwise phase-scoped
    // hints (Anchorhead's day sections) don't badge until the first live move. See
    // getCurrentLocation/getStatusContext: both split on the 3+ space gap.
    const leftEl = statusBarEl?.querySelector('.status-left');
    const rightEl = statusBarEl?.querySelector('.status-right');
    const leftText = (leftEl ?? statusBarEl)?.textContent?.trim();
    const rightText = rightEl?.textContent?.trim();
    const statusText = rightText ? `${leftText}   ${rightText}` : leftText;
    if (statusText && statusText.length > 0) {
      checkLocationChange(statusText, 0);
      startCheckTimeout = null;
    } else if (attempts < 5) {
      attempts++;
      startCheckTimeout = setTimeout(checkStartingLocation, 200);
    } else {
      startCheckTimeout = null;
    }
  };
  startCheckTimeout = setTimeout(checkStartingLocation, 100);
}

/**
 * Reset auto-mapper (on game change)
 */
export function resetAutoMapper() {
  mapData = {
    gameName: null,
    journey: []
  };
  lastLocationName = null;
  lastStatusContext = '';
  lastCommand = null;
}

/**
 * Get the last known location name
 * @returns {string|null}
 */
export function getLastLocationName() {
  return lastLocationName;
}

/**
 * Get the last known status "phase" context (e.g. "day one, evening").
 * Used by phase-scoped hint matching. '' if none seen.
 * @returns {string}
 */
export function getLastStatusContext() {
  return lastStatusContext;
}

/**
 * Set current location (used when restoring from map canvas)
 * @param {string} locationName - Current location name
 * @param {string} gameName - Game name
 */
export function setCurrentLocation(locationName, gameName) {
  lastLocationName = locationName;
  mapData.gameName = gameName;
}

/**
 * Clear journey after transferring to map canvas
 * Journey will start fresh, tracking only new moves since map was last opened
 * This keeps journey bounded and reduces save file size
 */
export function clearJourney() {
  mapData.journey = [];
}

// Listen for game load events
window.addEventListener('gameLoaded', (e) => {
  const gameName = e.detail?.gameName || 'unknown';
  initAutoMapper(gameName);
});
