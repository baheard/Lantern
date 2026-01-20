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
let lastCommand = null;
let startCheckTimeout = null;

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

  // Status bar typically has format: "Location Name    Score: X  Moves: Y"
  // Extract the location name (left part before score/moves)
  let locationName = statusBarText.trim();

  // Remove common suffixes like "Score:", "Moves:", "Time:", etc.
  const suffixPatterns = [
    /\s+Score:\s*\d+.*/i,
    /\s+Moves:\s*\d+.*/i,
    /\s+Time:\s*.*/i,
    /\s+Turns:\s*\d+.*/i,
    /\s{3,}.*$/,  // Multiple spaces often separate location from stats
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

// ============================================================================
// COMMENTED OUT: VM Memory Reading (v5 approach)
// Kept for reference but no longer used - was exposing internal object IDs
// and breaking some games. Now using status bar text instead.
// ============================================================================
/*
function getCurrentLocationFromVM() {
  try {
    const vm = window.zvmInstance;
    if (!vm || !vm.m || !vm.globals || !vm.objects) {
      return null;
    }

    const version = vm.m.getUint8(0x00);
    const isV3 = version === 3;
    const objEntrySize = isV3 ? 9 : 14;
    const parentOffset = isV3 ? 4 : 6;
    const propTableOffset = isV3 ? 7 : 12;

    let locationId = null;

    // Method 1: Try global 0 (standard Inform location)
    const global0 = vm.m.getUint16(vm.globals);
    if (global0 > 0 && global0 < 65535) {
      locationId = global0;
    }

    // Method 2: If global 0 failed, find the player object by scanning
    if (!locationId || locationId === 0) {
      for (let objId = 1; objId < 1000; objId++) {
        try {
          const objAddr = vm.objects + objEntrySize * objId;
          const propTable = vm.m.getUint16(objAddr + propTableOffset);
          if (propTable <= 0) continue;

          const nameLen = vm.m.getUint8(propTable);
          if (nameLen <= 0 || nameLen > 50) continue;

          const objName = vm.decode(propTable + 1, nameLen * 2);
          const lowerName = objName.toLowerCase();
          if (objName && (lowerName.includes('yourself') ||
                          lowerName.includes('self object') ||
                          lowerName === 'self' ||
                          lowerName === 'cretin' ||
                          lowerName === 'player')) {
            let parentId;
            if (isV3) {
              parentId = vm.m.getUint8(objAddr + parentOffset);
            } else {
              parentId = vm.m.getUint16(objAddr + parentOffset);
            }
            if (parentId > 0) {
              locationId = parentId;
              break;
            }
          }
        } catch (e) {}
      }
    }

    if (!locationId || locationId === 0) return null;

    const objAddr = vm.objects + objEntrySize * locationId;
    const proptable = vm.m.getUint16(objAddr + propTableOffset);
    const nameLength = vm.m.getUint8(proptable) * 2;
    const roomName = vm.decode(proptable + 1, nameLength);

    return { id: locationId, name: roomName };
  } catch (e) {
    console.error('[AutoMapper] Error in getCurrentLocationFromVM:', e);
    return null;
  }
}
*/

/**
 * Check for location change and dispatch event if changed
 * Called after each game turn from voxglk.js
 * @param {string} statusBarText - Status bar text from the game
 * @param {number} generation - Current game turn number
 */
export function checkLocationChange(statusBarText, generation) {
  const location = getCurrentLocation(statusBarText);
  if (!location) return;

  // IMPORTANT: Skip location tracking during char mode (press any key screens)
  // These are menus, pagers, and intro screens - not real game locations
  // Check if voxglk is loaded and has getInputType function
  const voxglk = window._voxglkModule;
  if (voxglk && voxglk.getInputType) {
    const inputType = voxglk.getInputType();
    if (inputType === 'char') {
      // Char mode - this is a press-any-key screen, not a real location
      // Don't add to journey or fire location change events
      return;
    }
  }

  const locationChanged = location.name !== lastLocationName;

  if (locationChanged) {
    const previousLocationName = lastLocationName;
    lastLocationName = location.name;

    // Add to journey (that's all we need!)
    mapData.journey.push({
      locationName: location.name,
      command: lastCommand
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
        command: lastCommand
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
  const restoreKey = `iftalk_automapper_restore_${gameName}`;
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
    const statusText = statusBarEl?.textContent?.trim();
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
