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

import { getCurrentLocation } from './auto-mapper.js';
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
  handleKeyDown, stopLongPressAnimation, showFab, setHandlerCallbacks
} from './map-handlers.js';
import {
  createNodeEditSheet, createContextMenu, openNodeSheet, closeNodeSheet,
  handleNodeNameChange, handleNodeNotesChange, handleNodeTypeChange, handleNodeDelete,
  startConnectionFromSheet, setSheetCallbacks
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
  console.log('[MapCanvas] Initialized');
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
      <div class="map-legend" id="mapLegend">
        <button class="legend-close" id="legendCloseBtn" aria-label="Close legend">
          <span class="material-icons">close</span>
        </button>
        <div class="legend-section">Locations</div>
        <div class="legend-item"><span class="legend-dot legend-auto"></span><span>Auto-mapped</span></div>
        <div class="legend-item"><span class="legend-dot legend-user"></span><span>Your edits</span></div>
        <div class="legend-item"><span class="legend-dot legend-current"></span><span>Current</span></div>
        <div class="legend-section">Connections</div>
        <div class="legend-item"><span class="legend-line legend-cardinal"></span><span>Cardinal (N/S/E/W)</span></div>
        <div class="legend-item"><span class="legend-line legend-vertical"></span><span>Vertical (Up/Down)</span></div>
        <div class="legend-item"><span class="legend-line legend-portal"></span><span>Portal (Enter/Exit)</span></div>
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
  document.getElementById('mapCenterBtn').addEventListener('click', centerOnCurrentLocation);
  document.getElementById('mapZoomInBtn').addEventListener('click', () => zoom(1.3));
  document.getElementById('mapZoomOutBtn').addEventListener('click', () => zoom(0.7));
  document.getElementById('mapAutoToggle').addEventListener('click', toggleAutoMap);

  // FAB & Mode
  document.getElementById('mapAddNodeBtn').addEventListener('click', enterAddNodeMode);
  document.getElementById('mapAddEdgeBtn').addEventListener('click', enterAddEdgeMode);
  document.getElementById('modeCancelBtn').addEventListener('click', exitAddMode);
  document.getElementById('mapLegendToggle').addEventListener('click', () => domRefs.legend.classList.toggle('legend-visible'));
  document.getElementById('legendCloseBtn').addEventListener('click', () => domRefs.legend.classList.remove('legend-visible'));

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
  document.getElementById('nodeNotesInput').addEventListener('input', handleNodeNotesChange);
  document.getElementById('nodeDeleteBtn').addEventListener('click', handleNodeDelete);
  document.getElementById('nodeConnectBtn').addEventListener('click', startConnectionFromSheet);
  document.querySelectorAll('#nodeTypePicker .type-btn').forEach(btn => {
    btn.addEventListener('click', () => handleNodeTypeChange(btn.dataset.type));
  });

  // Context menu
  document.getElementById('ctxAddNode').addEventListener('click', handleCtxAddNode);
  document.getElementById('ctxCenterView').addEventListener('click', handleCtxCenterView);
  document.addEventListener('click', (e) => {
    if (!domRefs.contextMenu.contains(e.target)) domRefs.contextMenu.classList.add('hidden');
  });

  // Global
  window.addEventListener('resize', resizeCanvas);
  document.addEventListener('keydown', handleKeyDown);
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
  console.log('[MapCanvas] handleLocationChange received:', e.detail);
  if (!mapState.autoMapEnabled) {
    console.log('[MapCanvas] Auto-map disabled, ignoring');
    return;
  }
  const { locationId, locationName, previousLocationId, command } = e.detail;

  // Safety: Never add deleted nodes or modify protected nodes
  if (mapState.deletedNodes.has(locationId)) return;
  const existingNode = mapState.nodes.get(locationId);
  if (existingNode && mapState.protectedNodes.has(locationId)) {
    mapState.selectedNode = locationId;
    render();
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

    console.log('[MapCanvas] Creating new node:', locationId, locationName, 'at', position);
    mapState.nodes.set(locationId, {
      id: locationId, name: locationName, x: position.x, y: position.y,
      type: 'room', notes: '', isManual: false, isEdited: false
    });
    // Protect from future auto-mapper modifications
    mapState.protectedNodes.add(locationId);
  } else {
    console.log('[MapCanvas] Node already exists:', locationId);
  }

  // Add edge (and immediately protect it from future auto-mapper changes)
  if (previousLocationId && previousLocationId !== locationId) {
    const edgeKey = `${previousLocationId}-${locationId}`;
    const shouldSkip = mapState.deletedEdges.has(edgeKey) || mapState.protectedEdges.has(edgeKey) || mapState.edges.has(edgeKey);
    if (!shouldSkip) {
      mapState.edges.set(edgeKey, { from: previousLocationId, to: locationId, command: command || '', isManual: false, isEdited: false });
      // Protect from future auto-mapper modifications
      mapState.protectedEdges.add(edgeKey);
    }
  }

  mapState.selectedNode = locationId;
  updateNodeCount();
  render();
  saveMapForGame();
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
  stopLongPressAnimation();
  clearTimeout(timers.onboardingTimeout);
  clearTimeout(timers.fabHideTimer);
  exitAddMode();
  saveMapForGame();
}

export function toggleMap() { isVisible ? hideMap() : showMap(); }
export function isMapVisible() { return isVisible; }

export function centerOnCurrentLocation() {
  const current = getCurrentLocation();
  let target = current ? mapState.nodes.get(current.id) : null;
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
      mapState.nodes = new Map((data.nodes || []).map(n => [n.id, n]));
      mapState.edges = new Map((data.edges || []).map(e => [`${e.from}-${e.to}`, e]));
      mapState.protectedNodes = new Set(data.protectedNodes || []);
      mapState.protectedEdges = new Set(data.protectedEdges || []);
      mapState.deletedEdges = new Set(data.deletedEdges || []);
      mapState.deletedNodes = new Set(data.deletedNodes || []);
      if (data.viewport) mapState.viewport = data.viewport;
      if (typeof data.autoMapEnabled === 'boolean') mapState.autoMapEnabled = data.autoMapEnabled;
      console.log('[MapCanvas] Loaded map for:', gameName, 'with', mapState.nodes.size, 'nodes');
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
      autoMapEnabled: mapState.autoMapEnabled
    }));
  } catch (e) { console.error('[MapCanvas] Failed to save map:', e); }
}

function resetMap() {
  mapState.nodes = new Map(); mapState.edges = new Map();
  mapState.protectedNodes = new Set(); mapState.protectedEdges = new Set();
  mapState.deletedEdges = new Set(); mapState.deletedNodes = new Set();
  mapState.viewport = { x: 0, y: 0, scale: 1 };
  mapState.selectedNode = null; mapState.autoMapEnabled = true;
}

// Debug exports
window.showMap = showMap;
window.hideMap = hideMap;
window.toggleMap = toggleMap;
window.getMapState = () => mapState;
