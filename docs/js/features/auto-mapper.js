/**
 * Auto-Mapper - Location Tracking for Interactive Fiction
 *
 * Version 6: Name-based tracking using status bar text.
 * No VM memory reading - uses direction traveled + location name only.
 * This avoids exposing internal object IDs and works across all game types.
 */

// Map data structure per game
let mapData = {
  gameName: null,
  locations: new Map(),  // locationName -> { name, visits, firstVisit, lastVisit }
  journey: [],           // Array of { locationName, turn, timestamp, command }
  connections: new Map() // locationName -> Map of connected locationNames with commands
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

  locationName = locationName.trim();

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

  const locationChanged = location.name !== lastLocationName;

  if (locationChanged) {
    console.log('[AutoMapper] Location changed:', location.name);
    const previousLocationName = lastLocationName;
    lastLocationName = location.name;

    // Record the location
    recordLocation(location, generation);

    // Record connection if we moved from a previous location
    if (previousLocationName !== null && lastCommand) {
      recordConnection(previousLocationName, location.name, lastCommand);
    }

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
 * Record a location visit
 * @param {{ name: string }} location
 * @param {number} generation
 */
function recordLocation(location, generation) {
  const existing = mapData.locations.get(location.name);
  const now = Date.now();

  if (existing) {
    existing.visits++;
    existing.lastVisit = now;
    existing.lastTurn = generation;
  } else {
    mapData.locations.set(location.name, {
      name: location.name,
      visits: 1,
      firstVisit: now,
      lastVisit: now,
      firstTurn: generation,
      lastTurn: generation
    });
  }

  // Add to journey
  mapData.journey.push({
    locationName: location.name,
    turn: generation,
    timestamp: now,
    command: lastCommand
  });
}

/**
 * Record a connection between two locations
 * @param {string} fromName - Source location name
 * @param {string} toName - Destination location name
 * @param {string} command - The command that caused the movement
 */
function recordConnection(fromName, toName, command) {
  if (!mapData.connections.has(fromName)) {
    mapData.connections.set(fromName, new Map());
  }

  const fromConnections = mapData.connections.get(fromName);

  // Store the command used to reach this destination
  if (!fromConnections.has(toName)) {
    fromConnections.set(toName, new Set());
  }
  fromConnections.get(toName).add(command);
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
    locations: Array.from(mapData.locations.values()),
    journey: mapData.journey,
    connections: serializeConnections()
  };
}

/**
 * Serialize connections map for export
 */
function serializeConnections() {
  const result = {};
  for (const [fromId, toMap] of mapData.connections) {
    result[fromId] = {};
    for (const [toId, commands] of toMap) {
      result[fromId][toId] = Array.from(commands);
    }
  }
  return result;
}

/**
 * Get visited locations count
 * @returns {number}
 */
export function getVisitedCount() {
  return mapData.locations.size;
}

/**
 * Initialize auto-mapper for a game
 * @param {string} gameName
 */
export function initAutoMapper(gameName) {
  mapData = {
    gameName,
    locations: new Map(),
    journey: [],
    connections: new Map()
  };
  lastLocationName = null;
  lastCommand = null;

  // Expose helper to window for debugging
  window.getCurrentLocation = getCurrentLocation;
  window.getMapData = getMapData;

  console.log('[AutoMapper] Initialized for:', gameName);

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
      console.log('[AutoMapper] Found starting location:', statusText);
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
    locations: new Map(),
    journey: [],
    connections: new Map()
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

// Listen for game load events
window.addEventListener('gameLoaded', (e) => {
  const gameName = e.detail?.gameName || 'unknown';
  initAutoMapper(gameName);
});
