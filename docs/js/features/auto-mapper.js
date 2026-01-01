/**
 * Auto-Mapper - Location Tracking for Interactive Fiction
 *
 * Captures unique location IDs from the Z-machine to enable auto-mapping.
 * Uses the same technique ZVM uses internally for the status bar.
 */

// DEBUG: Version marker to verify fresh code is loaded
console.log('[AutoMapper] Module loaded - v2');

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
 * Uses the same method ZVM uses for status bar display
 * @returns {{ id: number, name: string } | null}
 */
export function getCurrentLocation() {
  console.log('[AutoMapper] getCurrentLocation called - v2');
  try {
    const vm = window.zvmInstance;
    console.log('[AutoMapper] vm exists:', !!vm);
    if (vm) {
      console.log('[AutoMapper] vm properties:', Object.keys(vm).slice(0, 20));
      console.log('[AutoMapper] vm.m:', vm.m, 'vm.globals:', vm.globals);
    }
    if (!vm || !vm.m || !vm.globals) {
      console.log('[AutoMapper] Missing required vm properties, returning null');
      return null;
    }

    // Read location object ID from global 0 (first global variable)
    const locationId = vm.m.getUint16(vm.globals);
    console.log('[AutoMapper] locationId:', locationId);

    if (!locationId || locationId === 0) return null;

    // Decode room name using ZVM's method (same as status bar)
    const proptable = vm.m.getUint16(vm.objects + 9 * locationId + 7);
    const nameLength = vm.m.getUint8(proptable) * 2;
    const roomName = vm.decode(proptable + 1, nameLength);

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
  console.log('[AutoMapper] checkLocationChange called, generation:', generation, 'location:', location);
  if (!location) return;

  const locationChanged = location.id !== lastLocationId;
  console.log('[AutoMapper] Location changed?', locationChanged, 'lastLocationId:', lastLocationId, 'currentId:', location.id);

  if (locationChanged) {
    const previousLocationId = lastLocationId;
    lastLocationId = location.id;

    // Record the location
    recordLocation(location, generation);

    // Record connection if we moved from a previous location
    if (previousLocationId !== null && lastCommand) {
      recordConnection(previousLocationId, location.id, lastCommand);
    }

    // Dispatch event for other modules to listen
    console.log('[AutoMapper] Dispatching locationChanged event:', {
      locationId: location.id,
      locationName: location.name,
      previousLocationId,
      command: lastCommand
    });
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
