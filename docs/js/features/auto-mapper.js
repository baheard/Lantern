/**
 * Auto-Mapper - Location Tracking for Interactive Fiction
 *
 * Captures unique location IDs from the Z-machine to enable auto-mapping.
 * Uses the same technique ZVM uses internally for the status bar.
 */

// Version 5: Z-machine v3-v8 support (object IDs only, no hash-based fallback)

// Map data structure per game
let mapData = {
  gameName: null,
  locations: new Map(),  // locationId -> { id, name, visits, firstVisit, lastVisit }
  journey: [],           // Array of { locationId, turn, timestamp, command }
  connections: new Map() // locationId -> Set of connected locationIds
};

// Track last known location and command
let lastLocationId = null;
let lastCommand = null;

/**
 * Get current location from ZVM
 * Uses object IDs only - no hash-based fallbacks to ensure mapping accuracy
 * @returns {{ id: number, name: string } | null}
 */
export function getCurrentLocation() {
  try {
    const vm = window.zvmInstance;
    if (!vm || !vm.m || !vm.globals || !vm.objects) {
      return null;
    }

    const version = vm.m.getUint8(0x00);
    const isV3 = version === 3;

    // Object table layout differs by version
    // v3: 9 bytes per entry (4 attrs + 3 links + 2 props)
    // v4+: 14 bytes per entry (6 attrs + 6 links + 2 props)
    const objEntrySize = isV3 ? 9 : 14;
    const parentOffset = isV3 ? 4 : 6;  // Offset to parent object number
    const propTableOffset = isV3 ? 7 : 12;

    let locationId = null;
    let roomName = null;

    // Method 1: Try global 0 (standard Inform location)
    const global0 = vm.m.getUint16(vm.globals);
    if (global0 > 0 && global0 < 65535) {
      locationId = global0;
    }

    // Method 2: If global 0 failed, find the player object by scanning
    // Then get its parent (the current room)
    if (!locationId || locationId === 0) {
      // Scan all objects looking for the player
      for (let objId = 1; objId < 1000; objId++) {
        try {
          const objAddr = vm.objects + objEntrySize * objId;
          const propTable = vm.m.getUint16(objAddr + propTableOffset);
          if (propTable <= 0) continue;

          const nameLen = vm.m.getUint8(propTable);
          if (nameLen <= 0 || nameLen > 50) continue;

          const objName = vm.decode(propTable + 1, nameLen * 2);

          // Look for player object (common names: "yourself", "self object", "self", "cretin")
          const lowerName = objName.toLowerCase();
          if (objName && (lowerName.includes('yourself') ||
                          lowerName.includes('self object') ||
                          lowerName === 'self' ||
                          lowerName === 'cretin' ||
                          lowerName === 'player')) {
            // Get player's parent (the room)
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
        } catch (e) {
          // Skip invalid objects
        }
      }
    }

    if (!locationId || locationId === 0) return null;

    // Decode room name from object
    const objAddr = vm.objects + objEntrySize * locationId;
    const proptable = vm.m.getUint16(objAddr + propTableOffset);
    const nameLength = vm.m.getUint8(proptable) * 2;
    roomName = vm.decode(proptable + 1, nameLength);

    return { id: locationId, name: roomName };
  } catch (e) {
    console.error('[AutoMapper] Error in getCurrentLocation:', e);
    return null;
  }
}

/**
 * Check for location change and dispatch event if changed
 * Called after each game turn from voxglk.js
 * @param {number} generation - Current game turn number
 */
export function checkLocationChange(generation) {
  const location = getCurrentLocation();
  if (!location) return;

  const locationChanged = location.id !== lastLocationId;

  if (locationChanged) {
    console.log('[AutoMapper] Location changed:', location.name, `(${location.id})`);
    const previousLocationId = lastLocationId;
    lastLocationId = location.id;

    // Record the location
    recordLocation(location, generation);

    // Record connection if we moved from a previous location
    if (previousLocationId !== null && lastCommand) {
      recordConnection(previousLocationId, location.id, lastCommand);
    }

    // Dispatch event for other modules to listen
    window.dispatchEvent(new CustomEvent('locationChanged', {
      detail: {
        locationId: location.id,
        locationName: location.name,
        previousLocationId,
        generation,
        command: lastCommand
      }
    }));
  }
}

/**
 * Record a location visit
 * @param {{ id: number, name: string }} location
 * @param {number} generation
 */
function recordLocation(location, generation) {
  const existing = mapData.locations.get(location.id);
  const now = Date.now();

  if (existing) {
    existing.visits++;
    existing.lastVisit = now;
    existing.lastTurn = generation;
  } else {
    mapData.locations.set(location.id, {
      id: location.id,
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
    locationId: location.id,
    locationName: location.name,
    turn: generation,
    timestamp: now,
    command: lastCommand
  });
}

/**
 * Record a connection between two locations
 * @param {number} fromId
 * @param {number} toId
 * @param {string} command - The command that caused the movement
 */
function recordConnection(fromId, toId, command) {
  if (!mapData.connections.has(fromId)) {
    mapData.connections.set(fromId, new Map());
  }

  const fromConnections = mapData.connections.get(fromId);

  // Store the command used to reach this destination
  if (!fromConnections.has(toId)) {
    fromConnections.set(toId, new Set());
  }
  fromConnections.get(toId).add(command);
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
  lastLocationId = null;
  lastCommand = null;

  // Expose helper to window for debugging
  window.getCurrentLocation = getCurrentLocation;
  window.getMapData = getMapData;

  console.log('[AutoMapper] Initialized for:', gameName);

  // Check for starting location after VM is fully initialized
  // The VM may need a moment after gameLoaded to have valid object data
  setTimeout(() => {
    checkLocationChange(0);
  }, 500);
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
  lastLocationId = null;
  lastCommand = null;
}

// Listen for game load events
window.addEventListener('gameLoaded', (e) => {
  const gameName = e.detail?.gameName || 'unknown';
  initAutoMapper(gameName);
});
