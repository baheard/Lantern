/**
 * Map Canvas - Interactive Game Map with Auto-Mapping
 *
 * UX Principles:
 * - User intent always wins - auto-mapping never overrides user edits
 * - Auto-map is additive only - only adds, never modifies/removes
 * - Predictability over cleverness - same actions produce same results
 * - Never surprise the user - deleted items stay deleted, moved items stay moved
 *
 * Module Structure:
 * - map-config.js   : Configuration, constants, shared state
 * - map-render.js   : Grid, edges, nodes rendering
 * - map-handlers.js : Pointer, touch, wheel input handlers
 * - map-sheet.js    : Bottom sheet UI and node/edge CRUD
 * - map-canvas.js   : Core orchestrator (this file)
 */

import { getCurrentLocation, getLastLocationName } from './auto-mapper.js';
import {
  mapState, canvas, ctx, container, domRefs, isVisible, timers,
  setCanvas, setCtx, setContainer, setIsVisible, setDomRefs,
  DIRECTION_OFFSETS, COMMAND_DIRECTIONS, NODE_RADIUS, FIRST_USE_KEY
} from './map-config.js';
import { render, resizeCanvas, zoom, screenToCanvas } from './map-render.js';
import {
  handlePointerDown, handlePointerMove, handlePointerUp,
  handleTouchStart, handleTouchMove, handleTouchEnd,
  handleWheel, handleContextMenu, handleCtxAddNode, handleCtxCenterView,
  handleKeyDown, showFab, setHandlerCallbacks
} from './map-handlers.js';
import {
  createNodeEditSheet, createContextMenu, openNodeSheet, closeNodeSheet,
  handleNodeNameChange, handleNodeNotesChange, handleNodeTypeChange, handleNodeSmallToggle,
  handleNodeDelete, startConnectionFromSheet, setSheetCallbacks, handleNodeMerge, handleNodeNotDuplicate,
  setupSheetDragHandlers
} from './map-sheet.js';

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initMapCanvas() {
  createMapUI();
  setupEventListeners();
  setupCallbacks();
  window.addEventListener('locationChanged', handleLocationChange);
  window.addEventListener('gameLoaded', handleGameLoaded);
}

function setupCallbacks() {
  // Pass callbacks to handlers module (avoids circular dependencies)
  setHandlerCallbacks({
    addNodeAtPosition,
    exitAddMode,
    showHint,
    hideHint,
    saveMapForGame,
    hideMap,
    enterAddNodeMode,
    centerOnCurrentLocation
  });

  // Pass callbacks to sheet module
  setSheetCallbacks({
    showHint,
    saveMapForGame,
    pushUndo,
    startConnectionFromSheetCallback: (nodeId) => {
      mapState.isCreatingEdge = true;
      mapState.edgeStartNode = nodeId;
      domRefs.modeIndicator.classList.remove('hidden');
      domRefs.modeIndicator.querySelector('span:nth-child(2)').textContent = 'Tap destination';
      showHint(`Tap a location to connect from "${mapState.nodes.get(nodeId)?.name}"`);
      render();
    }
  });
}

// ============================================================================
// UI CREATION
// ============================================================================

function createMapUI() {
  const cont = document.createElement('div');
  cont.id = 'mapCanvasOverlay';
  cont.className = 'map-canvas-overlay hidden';
  cont.innerHTML = `
    <div class="map-toolbar">
      <button class="map-btn map-close-btn" id="mapCloseBtn" aria-label="Close map">
        <span class="material-icons">close</span>
      </button>
      <div class="map-title">
        <span class="map-title-text">Game Map</span>
        <span class="map-node-count" id="mapNodeCount"></span>
      </div>
      <div class="map-toolbar-actions">
        <button class="map-btn" id="mapUndoBtn" title="Undo" aria-label="Undo" disabled>
          <span class="material-icons">undo</span>
        </button>
        <button class="map-btn" id="mapCenterBtn" title="Center on current location" aria-label="Center view">
          <span class="material-icons">my_location</span>
        </button>
        <div class="map-zoom-controls">
          <button class="map-btn map-btn-small" id="mapZoomOutBtn" title="Zoom out" aria-label="Zoom out">
            <span class="material-icons">remove</span>
          </button>
          <button class="map-btn map-btn-small" id="mapZoomInBtn" title="Zoom in" aria-label="Zoom in">
            <span class="material-icons">add</span>
          </button>
        </div>
        <button class="map-toggle-btn ${mapState.autoMapEnabled ? 'active' : ''}" id="mapAutoToggle"
                title="Toggle auto-mapping" aria-label="Toggle auto-mapping">
          <span class="material-icons">auto_fix_high</span>
          <span class="toggle-label">Auto</span>
        </button>
      </div>
    </div>
    <div class="map-canvas-container">
      <canvas id="mapCanvas"></canvas>
      <div class="map-fab-container">
        <button class="map-fab map-fab-secondary" id="mapAddEdgeBtn" title="Add connection" aria-label="Add connection">
          <span class="material-icons">timeline</span>
        </button>
        <button class="map-fab map-fab-primary" id="mapAddNodeBtn" title="Add location" aria-label="Add location">
          <span class="material-icons">add_location</span>
        </button>
      </div>
      <button class="map-legend-toggle" id="mapLegendToggle" aria-label="Show legend" title="Legend">
        <span class="material-icons">help_outline</span>
      </button>
      <div class="map-legend" id="mapLegend" title="Click to close">
        <div class="legend-section">Nodes</div>
        <div class="legend-item"><span class="legend-dot legend-auto"></span><span>Auto-mapped</span></div>
        <div class="legend-item"><span class="legend-dot legend-user"></span><span>Player-created</span></div>
        <div class="legend-item"><span class="legend-dot legend-current"></span><span>Current location</span></div>
        <div class="legend-section">Connections</div>
        <div class="legend-item"><span class="legend-line legend-cardinal"></span><span>Cardinal</span></div>
        <div class="legend-item"><span class="legend-line legend-vertical"></span><span>Up/Down</span></div>
        <div class="legend-item"><span class="legend-line legend-portal"></span><span>Portal</span></div>
        <div class="legend-item"><span class="legend-line legend-player"></span><span>Player-created</span></div>
      </div>
    </div>
    <div class="map-hint hidden" id="mapHint"></div>
    <div class="map-mode-indicator hidden" id="mapModeIndicator">
      <span class="material-icons">touch_app</span>
      <span>Tap to add location</span>
      <button class="mode-cancel-btn" id="modeCancelBtn">Cancel</button>
    </div>
  `;
  document.body.appendChild(cont);
  setContainer(cont);

  const canvasEl = document.getElementById('mapCanvas');
  setCanvas(canvasEl);
  setCtx(canvasEl.getContext('2d'));
  resizeCanvas();
  createNodeEditSheet();
  createContextMenu();
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
  // Cache DOM refs
  setDomRefs({
    modeIndicator: document.getElementById('mapModeIndicator'),
    contextMenu: document.getElementById('mapContextMenu'),
    fabContainer: document.querySelector('.map-fab-container'),
    hint: document.getElementById('mapHint'),
    legend: document.getElementById('mapLegend')
  });

  // Toolbar
  document.getElementById('mapCloseBtn').addEventListener('click', hideMap);
  document.getElementById('mapUndoBtn').addEventListener('click', performUndo);
  document.getElementById('mapCenterBtn').addEventListener('click', centerOnCurrentLocation);
  document.getElementById('mapZoomInBtn').addEventListener('click', () => zoom(1.3));
  document.getElementById('mapZoomOutBtn').addEventListener('click', () => zoom(0.7));
  document.getElementById('mapAutoToggle').addEventListener('click', toggleAutoMap);

  // FAB & Mode
  document.getElementById('mapAddNodeBtn').addEventListener('click', enterAddNodeMode);
  document.getElementById('mapAddEdgeBtn').addEventListener('click', enterAddEdgeMode);
  document.getElementById('modeCancelBtn').addEventListener('click', exitAddMode);
  // Legend toggle - click button to expand, click legend to collapse
  const legendToggle = document.getElementById('mapLegendToggle');
  const toggleLegend = (show) => {
    const isVisible = show !== undefined ? show : !domRefs.legend.classList.contains('legend-visible');
    domRefs.legend.classList.toggle('legend-visible', isVisible);
    legendToggle.classList.toggle('legend-open', isVisible);
  };
  legendToggle.addEventListener('click', () => toggleLegend(true));
  domRefs.legend.addEventListener('click', () => toggleLegend(false));

  // Canvas
  const canvasEl = document.getElementById('mapCanvas');
  canvasEl.addEventListener('mousedown', handlePointerDown);
  canvasEl.addEventListener('mousemove', handlePointerMove);
  canvasEl.addEventListener('mouseup', handlePointerUp);
  canvasEl.addEventListener('mouseleave', handlePointerUp);
  canvasEl.addEventListener('wheel', handleWheel, { passive: false });
  canvasEl.addEventListener('contextmenu', handleContextMenu);
  canvasEl.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvasEl.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvasEl.addEventListener('touchend', handleTouchEnd);
  canvasEl.addEventListener('touchcancel', handleTouchEnd);

  // Sheet
  document.getElementById('sheetCloseBtn').addEventListener('click', closeNodeSheet);
  document.getElementById('nodeNameInput').addEventListener('input', handleNodeNameChange);
  document.getElementById('nodeNameInput').addEventListener('focus', (e) => e.target.select());
  document.getElementById('nodeNotesInput').addEventListener('input', handleNodeNotesChange);
  document.getElementById('nodeDeleteBtn').addEventListener('click', handleNodeDelete);
  document.getElementById('nodeConnectBtn').addEventListener('click', startConnectionFromSheet);
  document.getElementById('nodeMergeBtn').addEventListener('click', handleNodeMerge);
  document.getElementById('nodeNotDuplicateBtn').addEventListener('click', handleNodeNotDuplicate);
  document.querySelectorAll('#nodeTypePicker .type-btn').forEach(btn => {
    btn.addEventListener('click', () => handleNodeTypeChange(btn.dataset.type));
  });
  document.getElementById('nodeSmallToggle').addEventListener('click', handleNodeSmallToggle);

  // Context menu
  document.getElementById('ctxAddNode').addEventListener('click', handleCtxAddNode);
  document.getElementById('ctxCenterView').addEventListener('click', handleCtxCenterView);
  document.addEventListener('click', (e) => {
    if (!domRefs.contextMenu.contains(e.target)) domRefs.contextMenu.classList.add('hidden');
  });

  // Global
  window.addEventListener('resize', resizeCanvas);
  document.addEventListener('keydown', handleKeyDown);

  // Sheet drag-to-dismiss
  setupSheetDragHandlers();
}

// ============================================================================
// MODE MANAGEMENT
// ============================================================================

function toggleAutoMap() {
  mapState.autoMapEnabled = !mapState.autoMapEnabled;
  document.getElementById('mapAutoToggle').classList.toggle('active', mapState.autoMapEnabled);
  showHint(mapState.autoMapEnabled ? 'Auto-mapping ON' : 'Auto-mapping OFF');
  saveMapForGame();
}

export function enterAddNodeMode() {
  mapState.isAddingNode = true;
  domRefs.modeIndicator.classList.remove('hidden');
  domRefs.modeIndicator.querySelector('span:nth-child(2)').textContent = 'Tap to add location';
  canvas.style.cursor = 'crosshair';
  showHint('Tap anywhere on the map to add a new location');
}

function enterAddEdgeMode() {
  if (mapState.nodes.size < 2) { showHint('Add at least 2 locations first'); return; }
  mapState.isCreatingEdge = true;
  mapState.edgeStartNode = null;
  domRefs.modeIndicator.classList.remove('hidden');
  domRefs.modeIndicator.querySelector('span:nth-child(2)').textContent = 'Tap first location';
  canvas.style.cursor = 'crosshair';
  showHint('Tap the first location, then tap the second to connect them');
}

export function exitAddMode() {
  mapState.isAddingNode = false;
  mapState.isCreatingEdge = false;
  mapState.edgeStartNode = null;
  domRefs.modeIndicator?.classList.add('hidden');
  canvas.style.cursor = 'grab';
  hideHint();
  render();
}

// ============================================================================
// AUTO-MAPPING LOGIC
// ============================================================================

function handleGameLoaded(e) {
  if (e.detail?.gameName) loadMapForGame(e.detail.gameName);
}

function handleLocationChange(e) {
  if (!mapState.autoMapEnabled) return;
  const { locationId, locationName, previousLocationId, command } = e.detail;

  // Validate location name - reject empty or invalid names
  if (!locationName || typeof locationName !== 'string' || !locationName.trim()) {
    console.warn('[MapCanvas] Invalid location name, ignoring:', locationName);
    return;
  }

  // locationId is now the location NAME (name-based tracking)
  // Check if we already have a node with this name
  const existingNode = mapState.nodes.get(locationName);

  // Safety: Never add deleted nodes
  if (mapState.deletedNodes.has(locationName)) return;

  // If node exists and is protected, just select it and maybe add edge
  if (existingNode && mapState.protectedNodes.has(locationName)) {
    // Check if we're coming from a different previous location than expected
    // This could indicate a potential duplicate room with the same name
    const hasNoDirectEdge = previousLocationId &&
      previousLocationId !== locationName &&
      !hasEdgeBetween(previousLocationId, locationName);

    if (hasNoDirectEdge) {
      // Calculate where we'd expect to be based on direction traveled
      const direction = command ? getDirectionFromCommand(command) : null;
      const parentNode = previousLocationId ? mapState.nodes.get(previousLocationId) : null;
      let expectedPos = null;
      if (parentNode && direction && DIRECTION_OFFSETS[direction]) {
        const offset = DIRECTION_OFFSETS[direction];
        expectedPos = { x: parentNode.x + offset.x, y: parentNode.y + offset.y };
      }

      // If expected position matches the existing node's position (within tolerance),
      // it's the same room - just add an edge. Otherwise create a duplicate.
      const positionMatches = expectedPos &&
        Math.abs(expectedPos.x - existingNode.x) < 50 &&
        Math.abs(expectedPos.y - existingNode.y) < 50;

      if (positionMatches) {
        // Same room via different route - add edge
        const edgeKey = `${previousLocationId}-${locationName}`;
        if (!mapState.edges.has(edgeKey) && !mapState.deletedEdges.has(edgeKey)) {
          mapState.edges.set(edgeKey, {
            from: previousLocationId, to: locationName,
            command: command || '', isManual: false, isEdited: false
          });
          mapState.protectedEdges.add(edgeKey);
        }
        mapState.selectedNode = locationName;
        mapState.currentNodeId = locationName;
      } else {
        // Different position - likely a duplicate room with same name
        const duplicateId = createDuplicateNode(locationName, existingNode, previousLocationId, command);
        if (duplicateId) {
          mapState.selectedNode = duplicateId;
          mapState.currentNodeId = duplicateId;  // Duplicate is the current location
          showHint(`Found "${locationName}" via different route. Merge if same place.`);
        } else {
          mapState.selectedNode = locationName;
          mapState.currentNodeId = locationName;
        }
      }
    } else {
      mapState.selectedNode = locationName;
      mapState.currentNodeId = locationName;
    }
    render();
    saveMapForGame();
    return;
  }

  // Add new node (and immediately protect it from future auto-mapper changes)
  if (!existingNode) {
    const direction = command ? getDirectionFromCommand(command) : null;
    const parentNode = previousLocationId ? mapState.nodes.get(previousLocationId) : null;
    let position = { x: 0, y: 0 };

    if (parentNode && direction && DIRECTION_OFFSETS[direction]) {
      const offset = DIRECTION_OFFSETS[direction];
      position = findAvailablePosition({ x: parentNode.x + offset.x, y: parentNode.y + offset.y });
    } else if (mapState.nodes.size > 0) {
      position = findAvailablePosition({ x: 0, y: 0 });
    }

    mapState.nodes.set(locationName, {
      id: locationName, name: locationName, x: position.x, y: position.y,
      type: 'room', notes: '', isManual: false, isEdited: false
    });
    // Protect from future auto-mapper modifications
    mapState.protectedNodes.add(locationName);
  }

  // Add edge (and immediately protect it from future auto-mapper changes)
  if (previousLocationId && previousLocationId !== locationName) {
    const edgeKey = `${previousLocationId}-${locationName}`;
    const shouldSkip = mapState.deletedEdges.has(edgeKey) || mapState.protectedEdges.has(edgeKey) || mapState.edges.has(edgeKey);
    if (!shouldSkip) {
      mapState.edges.set(edgeKey, { from: previousLocationId, to: locationName, command: command || '', isManual: false, isEdited: false });
      // Protect from future auto-mapper modifications
      mapState.protectedEdges.add(edgeKey);
    }
  }

  mapState.selectedNode = locationName;
  mapState.currentNodeId = locationName;  // New node is the current location
  updateNodeCount();
  render();
  saveMapForGame();
}

/**
 * Check if there's an edge between two nodes (in either direction)
 */
function hasEdgeBetween(nodeA, nodeB) {
  return mapState.edges.has(`${nodeA}-${nodeB}`) || mapState.edges.has(`${nodeB}-${nodeA}`);
}

/**
 * Calculate distance between two nodes on the canvas
 */
function getNodeDistance(nodeA, nodeB) {
  const dx = nodeA.x - nodeB.x;
  const dy = nodeA.y - nodeB.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Create a duplicate node when same-named location reached via different route
 * Places it close to the original with special coloring
 */
function createDuplicateNode(locationName, originalNode, previousLocationId, command) {
  // Generate unique ID for duplicate
  let duplicateNum = 2;
  let duplicateId = `${locationName} (${duplicateNum})`;
  while (mapState.nodes.has(duplicateId) || mapState.deletedNodes.has(duplicateId)) {
    duplicateNum++;
    duplicateId = `${locationName} (${duplicateNum})`;
  }

  // Position close to original but offset
  const direction = command ? getDirectionFromCommand(command) : null;
  const parentNode = previousLocationId ? mapState.nodes.get(previousLocationId) : null;
  let position;

  if (parentNode && direction && DIRECTION_OFFSETS[direction]) {
    // Place based on direction from previous location
    const offset = DIRECTION_OFFSETS[direction];
    position = findAvailablePosition({ x: parentNode.x + offset.x, y: parentNode.y + offset.y });
  } else {
    // Place near the original with slight offset
    position = findAvailablePosition({ x: originalNode.x + 50, y: originalNode.y + 50 });
  }

  // Mark original as having duplicates
  originalNode.hasDuplicates = true;
  originalNode.duplicateGroup = locationName;

  // Create the duplicate node
  mapState.nodes.set(duplicateId, {
    id: duplicateId,
    name: locationName,  // Same display name
    x: position.x,
    y: position.y,
    type: 'room',
    notes: `Possible duplicate of "${locationName}". Merge if same location.`,
    isManual: false,
    isEdited: false,
    isDuplicate: true,
    duplicateGroup: locationName,  // Group for merging
    originalNodeId: locationName
  });
  mapState.protectedNodes.add(duplicateId);

  // Add edge from previous location to duplicate
  if (previousLocationId) {
    const edgeKey = `${previousLocationId}-${duplicateId}`;
    if (!mapState.edges.has(edgeKey)) {
      mapState.edges.set(edgeKey, {
        from: previousLocationId,
        to: duplicateId,
        command: command || '',
        isManual: false,
        isEdited: false
      });
      mapState.protectedEdges.add(edgeKey);
    }
  }

  return duplicateId;
}

function getDirectionFromCommand(command) {
  if (!command) return null;
  const cmd = command.toLowerCase().trim();
  if (COMMAND_DIRECTIONS[cmd]) return COMMAND_DIRECTIONS[cmd];
  if (cmd.startsWith('go ')) return COMMAND_DIRECTIONS[cmd.substring(3).trim()] || null;
  return null;
}

function findAvailablePosition(preferred) {
  const MIN_DISTANCE = NODE_RADIUS * 3;
  const hasCollision = [...mapState.nodes.values()].some(n =>
    Math.sqrt((n.x - preferred.x) ** 2 + (n.y - preferred.y) ** 2) < MIN_DISTANCE
  );
  if (!hasCollision) return preferred;

  for (let radius = MIN_DISTANCE; radius < MIN_DISTANCE * 10; radius += 25) {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
      const candidate = { x: preferred.x + Math.cos(angle) * radius, y: preferred.y + Math.sin(angle) * radius };
      const valid = ![...mapState.nodes.values()].some(n =>
        Math.sqrt((n.x - candidate.x) ** 2 + (n.y - candidate.y) ** 2) < MIN_DISTANCE
      );
      if (valid) return candidate;
    }
  }
  return preferred;
}

// ============================================================================
// NODE CRUD
// ============================================================================

export function addNodeAtPosition(x, y) {
  const id = `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const position = findAvailablePosition({ x, y });
  const node = { id, name: 'New Location', x: position.x, y: position.y, type: 'room', notes: '', isManual: true, isEdited: false };
  mapState.nodes.set(id, node);
  mapState.protectedNodes.add(id);
  mapState.selectedNode = id;
  updateNodeCount(); render(); saveMapForGame();
  setTimeout(() => openNodeSheet(node), 100);
  showHint('Location added! Tap to edit the name.');
}

// ============================================================================
// HINTS & ONBOARDING
// ============================================================================

export function showHint(message) {
  domRefs.hint.textContent = message;
  domRefs.hint.classList.remove('hidden');
  clearTimeout(timers.hintTimeout);
  timers.hintTimeout = setTimeout(() => domRefs.hint.classList.add('hidden'), 3000);
}

export function hideHint() {
  clearTimeout(timers.hintTimeout);
  domRefs.hint?.classList.add('hidden');
}

function updateNodeCount() {
  const el = document.getElementById('mapNodeCount');
  if (el) el.textContent = mapState.nodes.size > 0 ? `${mapState.nodes.size} location${mapState.nodes.size !== 1 ? 's' : ''}` : '';
}

function showOnboardingOrHint() {
  if (!localStorage.getItem(FIRST_USE_KEY)) {
    localStorage.setItem(FIRST_USE_KEY, 'true');
    const tips = ['Welcome to Game Map! Locations are added automatically as you explore.', 'Tip: Hold a location to connect it to another.', 'Tap the + button to add your own locations.'];
    let i = 0;
    (function next() { if (i < tips.length && isVisible) { showHint(tips[i++]); timers.onboardingTimeout = setTimeout(next, 3500); } })();
  } else if (mapState.autoMapEnabled && mapState.nodes.size === 0) {
    showHint('Explore the game to start auto-mapping locations');
  }
}

// ============================================================================
// MAP VISIBILITY
// ============================================================================

export function showMap() {
  if (!container) initMapCanvas();
  container.classList.remove('hidden');
  setIsVisible(true);
  document.getElementById('mapAutoToggle').classList.toggle('active', mapState.autoMapEnabled);
  timers.fabVisible = true; timers.isInteracting = false;
  domRefs.fabContainer?.classList.remove('fab-hidden');
  resizeCanvas(); updateNodeCount(); centerOnCurrentLocation();
  showOnboardingOrHint();
}

export function hideMap() {
  container?.classList.add('hidden');
  setIsVisible(false);
  clearTimeout(timers.onboardingTimeout);
  clearTimeout(timers.fabHideTimer);
  exitAddMode();
  saveMapForGame();
}

export function toggleMap() { isVisible ? hideMap() : showMap(); }
export function isMapVisible() { return isVisible; }

export function centerOnCurrentLocation() {
  // Use last known location name (from status bar tracking)
  const currentName = getLastLocationName();
  let target = currentName ? mapState.nodes.get(currentName) : null;
  if (!target && mapState.nodes.size > 0) target = mapState.nodes.values().next().value;
  if (target) {
    mapState.viewport.x = -target.x * mapState.viewport.scale;
    mapState.viewport.y = -target.y * mapState.viewport.scale;
    mapState.selectedNode = target.id;
    render();
  }
}

// ============================================================================
// PERSISTENCE
// ============================================================================

function loadMapForGame(gameName) {
  mapState.gameName = gameName;
  const saved = localStorage.getItem(`iftalk_map_${gameName}`);
  if (saved) {
    try {
      const data = JSON.parse(saved);
      // Filter out invalid nodes (no id or name) and fix corrupted coordinates
      const validNodes = (data.nodes || []).filter(n => n && n.id && n.name).map(n => ({
        ...n,
        x: typeof n.x === 'number' && !isNaN(n.x) ? n.x : 0,
        y: typeof n.y === 'number' && !isNaN(n.y) ? n.y : 0
      }));
      mapState.nodes = new Map(validNodes.map(n => [n.id, n]));
      mapState.edges = new Map((data.edges || []).map(e => [`${e.from}-${e.to}`, e]));
      mapState.protectedNodes = new Set(data.protectedNodes || []);
      mapState.protectedEdges = new Set(data.protectedEdges || []);
      mapState.deletedEdges = new Set(data.deletedEdges || []);
      mapState.deletedNodes = new Set(data.deletedNodes || []);
      // Validate viewport - reset if corrupted
      if (data.viewport &&
          typeof data.viewport.x === 'number' && !isNaN(data.viewport.x) &&
          typeof data.viewport.y === 'number' && !isNaN(data.viewport.y) &&
          typeof data.viewport.scale === 'number' && !isNaN(data.viewport.scale) &&
          data.viewport.scale > 0) {
        mapState.viewport = data.viewport;
      } else {
        mapState.viewport = { x: 0, y: 0, scale: 1 };
      }
      if (typeof data.autoMapEnabled === 'boolean') mapState.autoMapEnabled = data.autoMapEnabled;
      if (data.currentNodeId) mapState.currentNodeId = data.currentNodeId;
    } catch (e) { console.error('[MapCanvas] Failed to load map:', e); resetMap(); }
  } else { resetMap(); }
  updateNodeCount();
  if (isVisible) render();
}

export function saveMapForGame() {
  if (!mapState.gameName) return;
  try {
    localStorage.setItem(`iftalk_map_${mapState.gameName}`, JSON.stringify({
      nodes: Array.from(mapState.nodes.values()),
      edges: Array.from(mapState.edges.values()),
      protectedNodes: Array.from(mapState.protectedNodes),
      protectedEdges: Array.from(mapState.protectedEdges),
      deletedEdges: Array.from(mapState.deletedEdges),
      deletedNodes: Array.from(mapState.deletedNodes),
      viewport: mapState.viewport,
      autoMapEnabled: mapState.autoMapEnabled,
      currentNodeId: mapState.currentNodeId
    }));
  } catch (e) { console.error('[MapCanvas] Failed to save map:', e); }
}

function resetMap() {
  mapState.nodes = new Map(); mapState.edges = new Map();
  mapState.protectedNodes = new Set(); mapState.protectedEdges = new Set();
  mapState.deletedEdges = new Set(); mapState.deletedNodes = new Set();
  mapState.viewport = { x: 0, y: 0, scale: 1 };
  mapState.selectedNode = null; mapState.currentNodeId = null;
  mapState.autoMapEnabled = true;
}

// ============================================================================
// UNDO SYSTEM
// ============================================================================

function updateUndoButton() {
  const btn = document.getElementById('mapUndoBtn');
  if (btn) btn.disabled = mapState.undoStack.length === 0;
}

export function pushUndo(action) {
  mapState.undoStack.push(action);
  if (mapState.undoStack.length > 50) mapState.undoStack.shift();  // Limit stack size
  updateUndoButton();
}

function performUndo() {
  if (mapState.undoStack.length === 0) return;
  const action = mapState.undoStack.pop();

  switch (action.type) {
    case 'deleteNode':
      mapState.nodes.set(action.node.id, action.node);
      mapState.deletedNodes.delete(action.node.id);
      if (action.wasProtected) mapState.protectedNodes.add(action.node.id);
      // Restore edges
      for (const edge of action.edges) {
        mapState.edges.set(edge.key, edge.data);
        mapState.deletedEdges.delete(edge.key);
        if (edge.wasProtected) mapState.protectedEdges.add(edge.key);
      }
      break;
    case 'deleteEdge':
      mapState.edges.set(action.key, action.edge);
      mapState.deletedEdges.delete(action.key);
      if (action.wasProtected) mapState.protectedEdges.add(action.key);
      break;
    case 'moveNode':
      const node = mapState.nodes.get(action.nodeId);
      if (node) { node.x = action.oldX; node.y = action.oldY; }
      break;
  }

  updateUndoButton();
  updateNodeCount();
  render();
  saveMapForGame();
}

// Debug exports
window.showMap = showMap;
window.hideMap = hideMap;
window.toggleMap = toggleMap;
window.getMapState = () => mapState;
