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

import { getCurrentLocation, getLastLocationName, getMapData, clearJourney, setSuppressJourneyClear } from './auto-mapper.js';
import {
  mapState, canvas, ctx, container, domRefs, isVisible, timers,
  setCanvas, setCtx, setContainer, setIsVisible, setDomRefs,
  GRID_SIZE, DIRECTION_OFFSETS, DIRECTION_OPPOSITES, COMMAND_DIRECTIONS, DIRECTION_TO_TYPE, NODE_RADIUS, FIRST_USE_KEY,
  NODE_COUNT_WARNING, NODE_COUNT_MAX, EDGE_COUNT_MAX
} from './map-config.js';
import { render, resizeCanvas, zoom, screenToCanvas } from './map-render.js';
import {
  handlePointerDown, handlePointerMove, handlePointerUp,
  handleTouchStart, handleTouchMove, handleTouchEnd,
  handleWheel, handleContextMenu,
  handleKeyDown, showFab, setHandlerCallbacks
} from './map-handlers.js';
import {
  createNodeEditSheet, openNodeSheet, closeNodeSheet, dismissNodeSheet,
  handleNodeNameChange, handleNodeNotesChange, handleNodeTypeChange, handleNodeSmallToggle,
  handleNodeDelete, startConnectionFromSheet, startMergeFromSheet, setSheetCallbacks, handleNodeMerge, handleNodeNotDuplicate,
  setupSheetDragHandlers, getSheetTopForViewport
} from './map-sheet.js';

// ============================================================================
// INITIALIZATION
// ============================================================================

// Store resize state for cleanup
let resizeState = null;

// In-memory cache of all maps' raw data for the current game (keyed by mapId).
// Active map data is always the live mapState fields; this holds the rest.
let _allMapsData = {};

// Set when a scene break arrives in a non-empty map and the new location is unknown.
// Cleared when the hint is shown, the user adds a map, or the game resets.
let _pendingNewAreaHint = false;

let _initialized = false;

export function initMapCanvas() {
  // Idempotence guard: both the map button and Ctrl+M lazy-init this module,
  // and their `if (!mapModule)` checks can interleave across awaits — a double
  // init would duplicate the window event listeners below.
  if (_initialized) return;
  _initialized = true;

  createMapUI();
  setupEventListeners();
  setupCallbacks();
  setupToastSystem();
  window.addEventListener('locationChanged', handleLocationChange);
  window.addEventListener('gameLoaded', handleGameLoaded);

  // If game already loaded before map module initialized, load map data now
  if (window._inGame) {
    const gameName = localStorage.getItem('lantern_last_game')?.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase();
    if (gameName) loadMapForGame(gameName);
  }

  // Set better initial zoom for desktop (larger screens) - after loading map
  if (window.innerWidth >= 768) {
    mapState.viewport.scale = 1.5;
  }
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
    centerOnCurrentLocation,
    captureUndoSnapshot: captureSnapshot,
    commitUndoSnapshot
  });

  // Pass callbacks to sheet module
  setSheetCallbacks({
    showHint,
    saveMapForGame,
    snapshotForUndo,
    startConnectionFromSheetCallback: (nodeId) => {
      mapState.isCreatingEdge = true;
      mapState.edgeStartNode = nodeId;
      domRefs.modeIndicator.classList.remove('hidden');
      domRefs.modeIndicator.querySelector('span:nth-child(2)').textContent = 'Tap destination';
      showHint(`Tap a location to connect from "${mapState.nodes.get(nodeId)?.name}"`);
      render();
    },
    startMergeFromSheetCallback: (nodeId) => {
      mapState.isMerging = true;
      mapState.mergeSourceNode = nodeId;
      domRefs.modeIndicator.classList.remove('hidden');
      domRefs.modeIndicator.querySelector('span:nth-child(2)').textContent = 'Tap location to merge into';
      showHint(`Tap the location to merge "${mapState.nodes.get(nodeId)?.name}" into`);
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
    <div class="map-panel">
      <div class="map-resize-handle" id="mapResizeHandle"></div>
      <div class="map-toolbar">
        <div class="map-title">
          <button class="map-name-btn" id="mapNameBtn" aria-haspopup="listbox" aria-label="Select map">
            <span id="mapNameText">Map 1</span>
            <span class="material-icons map-chevron">arrow_drop_down</span>
          </button>
          <div class="map-picker-dropdown hidden" id="mapPickerDropdown" role="listbox"></div>
        </div>
        <div class="map-toolbar-actions">
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
        <button class="map-btn map-close-btn" id="mapCloseBtn" aria-label="Close map">
          <span class="material-icons">close</span>
        </button>
      </div>
      <div class="map-canvas-container">
        <canvas id="mapCanvas"></canvas>
        <div class="map-fab-container">
          <button class="map-fab map-fab-undo" id="mapUndoBtn" title="Undo" aria-label="Undo" disabled>
            <span class="material-icons">undo</span>
          </button>
          <button class="map-fab map-fab-redo" id="mapRedoBtn" title="Redo" aria-label="Redo" disabled>
            <span class="material-icons">redo</span>
          </button>
          <button class="map-fab map-fab-center" id="mapCenterBtn" title="Center on current location" aria-label="Center on current location">
            <span class="material-icons">my_location</span>
          </button>
          <button class="map-fab map-fab-select" id="mapSelectBtn" title="Select nodes" aria-label="Select nodes">
            <span class="material-icons">select_all</span>
          </button>
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
          <button class="legend-close-btn" aria-label="Close legend">
            <span class="material-icons">close</span>
          </button>
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
      <div class="map-hint hidden" id="mapHint">
        <span class="map-hint-text"></span>
        <button class="map-hint-close" aria-label="Close hint">×</button>
      </div>
      <div class="map-mode-indicator hidden" id="mapModeIndicator">
        <span class="material-icons">touch_app</span>
        <span>Tap to add location</span>
        <button class="mode-cancel-btn" id="modeCancelBtn">Cancel</button>
      </div>
    </div>
  `;
  // Append to .container so map stays behind controls
  const gameContainer = document.querySelector('.container');
  gameContainer.appendChild(cont);
  setContainer(cont);

  const canvasEl = document.getElementById('mapCanvas');
  setCanvas(canvasEl);
  setCtx(canvasEl.getContext('2d'));
  resizeCanvas();
  createNodeEditSheet();
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
  // Cache DOM refs
  setDomRefs({
    modeIndicator: document.getElementById('mapModeIndicator'),
    fabContainer: document.querySelector('.map-fab-container'),
    hint: document.getElementById('mapHint'),
    legend: document.getElementById('mapLegend')
  });

  // Toolbar
  document.getElementById('mapCloseBtn').addEventListener('click', hideMap);
  document.getElementById('mapUndoBtn').addEventListener('click', performUndo);
  document.getElementById('mapRedoBtn').addEventListener('click', performRedo);
  document.getElementById('mapZoomInBtn').addEventListener('click', () => {
    const dpr = window.devicePixelRatio;
    const centerX = canvas.width / (2 * dpr);
    const centerY = canvas.height / (2 * dpr);
    zoom(1.3, centerX, centerY);
  });
  document.getElementById('mapZoomOutBtn').addEventListener('click', () => {
    const dpr = window.devicePixelRatio;
    const centerX = canvas.width / (2 * dpr);
    const centerY = canvas.height / (2 * dpr);
    zoom(0.7, centerX, centerY);
  });
  document.getElementById('mapAutoToggle').addEventListener('click', toggleAutoMap);
  document.getElementById('mapNameBtn').addEventListener('click', toggleMapPicker);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#mapNameBtn') && !e.target.closest('#mapPickerDropdown')) {
      closeMapPicker();
    }
  }, true);

  // FAB & Mode
  document.getElementById('mapAddNodeBtn').addEventListener('click', enterAddNodeMode);
  document.getElementById('mapAddEdgeBtn').addEventListener('click', enterAddEdgeMode);
  document.getElementById('mapSelectBtn').addEventListener('click', toggleSelectMode);
  document.getElementById('mapCenterBtn').addEventListener('click', () => centerOnCurrentLocation());
  document.getElementById('modeCancelBtn').addEventListener('click', exitAddMode);

  // Hint close button
  const hintCloseBtn = domRefs.hint.querySelector('.map-hint-close');
  if (hintCloseBtn) {
    hintCloseBtn.addEventListener('click', hideHint);
  }

  // Legend toggle - click button to expand, click legend to collapse
  const legendToggle = document.getElementById('mapLegendToggle');
  const toggleLegend = (show) => {
    const isVisible = show !== undefined ? show : !domRefs.legend.classList.contains('legend-visible');
    domRefs.legend.classList.toggle('legend-visible', isVisible);
    legendToggle.classList.toggle('legend-open', isVisible);
  };
  legendToggle.addEventListener('click', () => toggleLegend(true));
  domRefs.legend.addEventListener('pointerdown', (e) => { e.preventDefault(); toggleLegend(false); });

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
  document.getElementById('sheetCloseBtn').addEventListener('click', dismissNodeSheet);
  document.getElementById('nodeNameInput').addEventListener('input', handleNodeNameChange);
  document.getElementById('nodeNameInput').addEventListener('focus', (e) => {
    e.target.select();
    // Scroll into view after keyboard opens (delay to wait for keyboard animation)
    setTimeout(() => {
      e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  });
  document.getElementById('nodeNotesInput').addEventListener('input', handleNodeNotesChange);
  document.getElementById('nodeNotesInput').addEventListener('focus', (e) => {
    // Scroll into view after keyboard opens (delay to wait for keyboard animation)
    setTimeout(() => {
      e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  });
  document.getElementById('nodeDeleteBtn').addEventListener('click', handleNodeDelete);
  document.getElementById('nodeConnectBtn').addEventListener('click', startConnectionFromSheet);
  document.getElementById('nodeMergeWithBtn').addEventListener('click', startMergeFromSheet);
  document.getElementById('nodeMergeBtn').addEventListener('click', handleNodeMerge);
  document.getElementById('nodeNotDuplicateBtn').addEventListener('click', handleNodeNotDuplicate);
  document.querySelectorAll('#nodeTypePicker .type-btn').forEach(btn => {
    btn.addEventListener('click', () => handleNodeTypeChange(btn.dataset.type));
  });
  document.getElementById('nodeSmallToggle').addEventListener('click', handleNodeSmallToggle);

  // Global — only redraw the canvas when the map is actually showing.
  window.addEventListener('resize', () => { if (isVisible) resizeCanvas(); });
  document.addEventListener('keydown', handleKeyDown);

  // Visual viewport resize (keyboard open/close detection)
  if (window.visualViewport) {
    let lastHeight = window.visualViewport.height;
    window.visualViewport.addEventListener('resize', () => {
      const currentHeight = window.visualViewport.height;

      // Adjust node edit sheet top to fit within visible viewport
      const nodeSheet = document.getElementById('nodeEditSheet');
      if (nodeSheet && !nodeSheet.classList.contains('hidden')) {
        nodeSheet.style.top = `${getSheetTopForViewport(currentHeight)}px`;

        // Ensure focused input is visible after keyboard appears
        requestAnimationFrame(() => {
          const focusedElement = document.activeElement;
          if (focusedElement && (focusedElement.tagName === 'INPUT' || focusedElement.tagName === 'TEXTAREA')) {
            if (nodeSheet.contains(focusedElement)) {
              const sheetContent = nodeSheet.querySelector('.sheet-content');
              if (sheetContent) {
                const inputRect = focusedElement.getBoundingClientRect();
                const contentRect = sheetContent.getBoundingClientRect();
                if (inputRect.bottom > contentRect.bottom - 20) {
                  sheetContent.scrollBy({ top: inputRect.bottom - contentRect.bottom + 60, behavior: 'smooth' });
                }
              }
            }
          }
        });
      }

      // Hide toolbar and FAB buttons when keyboard is up (to maximize canvas space)
      updateUIVisibilityForKeyboard();

      lastHeight = currentHeight;
    });
  }

  // Sheet drag-to-dismiss
  setupSheetDragHandlers();

  // Resize handle - store for cleanup
  resizeState = setupResizeHandle();

  // Prevent map panel from stealing focus from input (keeps keyboard open)
  const panel = container.querySelector('.map-panel');
  const preventFocusSteal = (e) => {
    // Allow interactive elements to function normally
    if (e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.tagName === 'SELECT' ||
        e.target.tagName === 'BUTTON' ||
        e.target.closest('button')) {
      return;
    }
    // Don't interfere with canvas interactions (has its own touch handlers)
    if (e.target.tagName === 'CANVAS') {
      return;
    }
    // Prevent everything else from stealing focus
    e.preventDefault();
  };
  panel.addEventListener('mousedown', preventFocusSteal);
  panel.addEventListener('touchstart', preventFocusSteal, { passive: false });

  // Backdrop click handler - close map when clicking outside the panel
  container.addEventListener('click', (e) => {
    // Don't close if we just finished resizing
    if (resizeState && (resizeState.isResizing() || resizeState.wasResizing())) {
      return;
    }

    const nodeSheet = document.getElementById('nodeEditSheet');
    const nodeBackdrop = document.getElementById('nodeEditBackdrop');

    // Close if clicking outside the panel (on the backdrop area)
    // Don't close if clicking on node sheet or its backdrop
    if (!panel.contains(e.target) &&
        !nodeSheet?.contains(e.target) &&
        !nodeBackdrop?.contains(e.target)) {
      hideMap();
    }
  });
}

// ============================================================================
// RESIZE HANDLE
// ============================================================================

// Resize configuration constants
const RESIZE_CONFIG = {
  MIN_LEFT_PERCENT: 0,         // Minimum 0% from left edge - can resize to full width
  MIN_LEFT_PERCENT_MOBILE: 10, // Minimum 10% from left edge (mobile, easier to tap backdrop)
  MAX_LEFT_PERCENT: 80,        // Maximum 80% from left edge (20% min panel width)
  MOBILE_BREAKPOINT: 768,      // Screens below this use mobile constraints
  RESIZE_DEBOUNCE_MS: 100      // Debounce for wasResizing flag
};

// Helper: Get clientX from mouse or touch event
function getClientX(e) {
  return e.clientX || e.touches?.[0]?.clientX;
}

function setupResizeHandle() {
  const handle = document.getElementById('mapResizeHandle');
  const panel = document.querySelector('.map-panel');
  let isResizing = false;
  let wasResizing = false; // Track if we just finished resizing
  let startX = 0;
  let startLeft = 0;

  // Get responsive constraints based on screen size
  const getMinLeftPercent = () => {
    return window.innerWidth < RESIZE_CONFIG.MOBILE_BREAKPOINT
      ? RESIZE_CONFIG.MIN_LEFT_PERCENT_MOBILE
      : RESIZE_CONFIG.MIN_LEFT_PERCENT;
  };

  function startResize(e) {
    isResizing = true;
    wasResizing = false;
    startX = getClientX(e);
    // Get current left position as percentage
    const rect = panel.getBoundingClientRect();
    startLeft = (rect.left / window.innerWidth) * 100;

    handle.classList.add('dragging');
    panel.classList.add('resizing');
    document.body.classList.add('map-resizing');

    e.preventDefault();
    e.stopPropagation(); // Prevent backdrop click
  }

  function doResize(e) {
    if (!isResizing) return;

    const currentX = getClientX(e);
    const deltaX = currentX - startX;
    const deltaPercent = (deltaX / window.innerWidth) * 100;
    const minLeft = getMinLeftPercent();
    const newLeftPercent = Math.min(RESIZE_CONFIG.MAX_LEFT_PERCENT, Math.max(minLeft, startLeft + deltaPercent));

    panel.style.left = `${newLeftPercent}%`;

    // Trigger canvas resize to fit new panel width
    requestAnimationFrame(() => {
      resizeCanvas();
    });

    e.preventDefault();
  }

  function stopResize(e) {
    if (!isResizing) return;

    isResizing = false;
    wasResizing = true; // Mark that we just finished resizing
    handle.classList.remove('dragging');
    panel.classList.remove('resizing');
    document.body.classList.remove('map-resizing');

    // Save the custom left percentage preference (with error handling)
    try {
      const rect = panel.getBoundingClientRect();
      const leftPercent = (rect.left / window.innerWidth) * 100;
      localStorage.setItem('lantern_map_left_percent', leftPercent.toString());
    } catch (e) {
      console.error('Failed to save map panel position:', e);
    }

    // Reset wasResizing flag after a short delay to prevent backdrop click
    setTimeout(() => {
      wasResizing = false;
    }, RESIZE_CONFIG.RESIZE_DEBOUNCE_MS);

    e?.preventDefault();
    e?.stopPropagation();
  }

  // Use AbortController for clean event listener cleanup
  const abortController = new AbortController();
  const signal = abortController.signal;

  // Mouse events
  handle.addEventListener('mousedown', startResize, { signal });
  document.addEventListener('mousemove', doResize, { signal });
  document.addEventListener('mouseup', stopResize, { signal });

  // Touch events
  handle.addEventListener('touchstart', startResize, { passive: false, signal });
  document.addEventListener('touchmove', doResize, { passive: false, signal });
  document.addEventListener('touchend', stopResize, { signal });
  document.addEventListener('touchcancel', stopResize, { signal });

  // Restore saved left position on map show (with error handling)
  try {
    const savedLeftPercent = localStorage.getItem('lantern_map_left_percent');
    if (savedLeftPercent) {
      const leftPercent = parseFloat(savedLeftPercent);
      const minLeft = getMinLeftPercent();
      if (leftPercent >= minLeft && leftPercent <= RESIZE_CONFIG.MAX_LEFT_PERCENT) {
        panel.style.left = `${leftPercent}%`;
      }
    }
  } catch (e) {
    console.error('Failed to restore map panel position:', e);
  }

  // Expose state and cleanup function for backdrop click handler
  return {
    isResizing: () => isResizing,
    wasResizing: () => wasResizing,
    cleanup: () => abortController.abort()
  };
}

// ============================================================================
// MODE MANAGEMENT
// ============================================================================

function toggleAutoMap() {
  mapState.autoMapEnabled = !mapState.autoMapEnabled;
  document.getElementById('mapAutoToggle').classList.toggle('active', mapState.autoMapEnabled);
  showHint(mapState.autoMapEnabled ? 'Auto-mapping ON' : 'Auto-mapping OFF');

  // When turning automap ON, immediately map the current location if not already mapped
  if (mapState.autoMapEnabled) {
    seedCurrentLocation();
  }

  saveMapForGame();
}

// Add the current game location as a node at origin if automap is on and it isn't
// already mapped. Used when toggling automap on and when a fresh default map is
// created (e.g. after deleting the last map). Returns true if a node was added.
function seedCurrentLocation() {
  // Actively check the status bar for current location (don't just rely on cached lastLocationName)
  const statusBarEl = document.getElementById('statusBar');
  const leftEl = statusBarEl?.querySelector('.status-left');
  const statusText = (leftEl ?? statusBarEl)?.textContent?.trim();

  let currentLocationName = getLastLocationName();

  // If we have status bar text, try to extract the current location from it
  if (statusText && statusText.length > 0) {
    const location = getCurrentLocation(statusText);
    if (location?.name) {
      currentLocationName = location.name;
    }
  }

  if (currentLocationName && !mapState.nodes.has(currentLocationName) && !mapState.deletedNodes.has(currentLocationName)) {
    // Add the current location at origin (0, 0) since we have no context
    mapState.nodes.set(currentLocationName, {
      id: currentLocationName,
      name: currentLocationName,
      x: 0,
      y: 0,
      type: 'room',
      notes: '',
      isManual: false,
      isEdited: false,
      isSmall: false
    });
    mapState.protectedNodes.add(currentLocationName);
    mapState.currentNodeId = currentLocationName;
    mapState.selectedNode = currentLocationName;
    invalidateUndoHistory();  // Auto-map added a node outside the snapshot system
    render();
    centerOnCurrentLocation();
    return true;
  }
  return false;
}

export function enterAddNodeMode() {
  mapState.isAddingNode = true;
  domRefs.modeIndicator.classList.remove('hidden');
  domRefs.modeIndicator.querySelector('span:nth-child(2)').textContent = 'Tap to add location';
  canvas.style.cursor = 'crosshair';
  showHint('Tap anywhere on the map to add a new location');
}

export function toggleSelectMode() {
  if (mapState.isSelectMode) { exitAddMode(); return; }
  mapState.isSelectMode = true;
  mapState.selectedNodes.clear();
  domRefs.modeIndicator.classList.remove('hidden');
  domRefs.modeIndicator.querySelector('span:nth-child(2)').textContent = 'Tap nodes to select, drag canvas to box-select';
  document.getElementById('mapSelectBtn')?.classList.add('active');
  canvas.style.cursor = 'default';
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
  mapState.isMerging = false;
  mapState.mergeSourceNode = null;
  mapState.isSelectMode = false;
  mapState.selectedNodes.clear();
  mapState.isRectSelecting = false;
  mapState.rectSelectStart = null;
  mapState.rectSelectEnd = null;
  document.getElementById('mapSelectBtn')?.classList.remove('active');
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
    return;
  }

  // Remember the heading from this move so portal/unknown moves can still be placed after
  // the journey buffer is cleared (scene break, or transfer-to-canvas on map open).
  rememberDirection(getDirectionFromCommand(command));

  // Scene break into an unmapped area: when map is hidden, buffer until the user decides
  // which map to put the new area on. When map is visible, fall through and add node without
  // an edge so the user sees it immediately; hint still offers to create a new map.
  if (command === null && mapState.nodes.size > 0
      && !mapState.nodes.has(locationName) && !mapState.deletedNodes.has(locationName)) {
    if (!_pendingNewAreaHint) {
      _pendingNewAreaHint = true;
      setSuppressJourneyClear(true);
      if (isVisible) showNewAreaHint();
    }
    if (!isVisible) return;
    // Map is visible — fall through and add the node (no edge since command is null)
  }

  // While hint is pending and map is hidden, keep buffering
  if (_pendingNewAreaHint && !isVisible) return;

  // locationId is now the location NAME (name-based tracking)
  // Check if we already have a node with this name
  const existingNode = mapState.nodes.get(locationName);

  // Safety: Never add deleted nodes
  if (mapState.deletedNodes.has(locationName)) return;

  // Auto-mapping is about to (possibly) mutate the map outside the snapshot
  // system; any pending undo/redo snapshots predate this change and are no
  // longer safe to restore. (Scene break above is already handled by resetMap.)
  invalidateUndoHistory();

  // If node exists and is protected, just select it and maybe add edge
  if (existingNode && mapState.protectedNodes.has(locationName)) {
    // Check if we're coming from a different previous location than expected
    // This could indicate a potential duplicate room with the same name
    const hasNoDirectEdge = previousLocationId &&
      previousLocationId !== locationName &&
      !hasEdgeBetween(previousLocationId, locationName);

    if (hasNoDirectEdge) {
      // Scene break (null command) — just select the node, no edge
      if (command === null) {
        mapState.selectedNode = locationName;
        mapState.currentNodeId = locationName;
        if (isVisible) centerOnCurrentLocation();
        render();
        saveMapForGame();
        return;
      }
      // For "go to" commands, just mark the existing location as current (no connection)
      if (isGoToCommand(command)) {
        mapState.selectedNode = locationName;
        mapState.currentNodeId = locationName;
      } else {
        // Calculate where we'd expect to be based on direction traveled
        const direction = command ? getDirectionFromCommand(command) : null;
        const parentNode = previousLocationId ? mapState.nodes.get(previousLocationId) : null;
        let expectedPos = null;
        if (parentNode && direction && DIRECTION_OFFSETS[direction]) {
          const offset = DIRECTION_OFFSETS[direction];
          expectedPos = { x: parentNode.x + offset.x, y: parentNode.y + offset.y };
        }

        // Determine if this is the same room or a different one:
        // 1. If no direction info (expectedPos is null), assume same room - just add edge
        // 2. If direction info exists and position matches (within tolerance), same room - add edge
        // 3. If direction info exists but position doesn't match, create duplicate
        const hasDirectionInfo = expectedPos !== null;
        const positionMatches = hasDirectionInfo &&
          Math.abs(expectedPos.x - existingNode.x) <= GRID_SIZE &&
          Math.abs(expectedPos.y - existingNode.y) <= GRID_SIZE;

        // Same room if: no direction info OR position matches
        if (!hasDirectionInfo || positionMatches) {
          // Same room via different route - add edge
          const edgeKey = `${previousLocationId}-${locationName}`;
          if (!mapState.edges.has(edgeKey) && !mapState.deletedEdges.has(edgeKey)) {
            mapState.edges.set(edgeKey, {
              from: previousLocationId, to: locationName,
              command: command || '', connectionType: getConnectionTypeFromCommand(command),
              isManual: false, isEdited: false
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
      }
    } else {
      // Upgrade an unedited portal edge if the real direction is now known
      if (previousLocationId && command) {
        tryUpgradePortalEdge(previousLocationId, locationName, command);
        // Walking back along an existing connection: record this end's heading so a
        // bent (non-reciprocal) path is detected and rendered as a curve.
        recordReverseCommand(previousLocationId, locationName, command);
      }
      mapState.selectedNode = locationName;
      mapState.currentNodeId = locationName;
    }

    // If map is visible, center on the current location
    if (isVisible) {
      centerOnCurrentLocation();
    }

    render();
    saveMapForGame();
    return;
  }

  // Add new node (and immediately protect it from future auto-mapper changes)
  let stateSuffixBase = null;
  if (!existingNode) {
    const direction = command ? getDirectionFromCommand(command) : null;
    const parentNode = previousLocationId ? mapState.nodes.get(previousLocationId) : null;
    let position = { x: 0, y: 0 };

    if (parentNode && direction && DIRECTION_OFFSETS[direction]) {
      // Known direction - use directional offset
      const offset = DIRECTION_OFFSETS[direction];
      position = findAvailablePosition({ x: parentNode.x + offset.x, y: parentNode.y + offset.y });
    } else if (parentNode) {
      // Portal/unknown direction (enter/exit/in/out have no offset): place using the last
      // cardinal/vertical direction traveled, falling back to 'up'. Mirrors the replay path
      // in syncFromAutoMapper. Note: DIRECTION_OFFSETS has no 'enter' key, so guard against
      // an undefined offset rather than reading offset.x off it.
      const lastDir = getLastDirectionFromHistory();
      const offset = (lastDir && DIRECTION_OFFSETS[lastDir]) || DIRECTION_OFFSETS['up'];
      position = findAvailablePosition({ x: parentNode.x + offset.x, y: parentNode.y + offset.y });
    } else if (mapState.nodes.size > 0) {
      // No parent node - place near origin
      position = findAvailablePosition({ x: 0, y: 0 });
    }

    // Detect state-suffix variants before adding the node (e.g. "Catwalk, South; Night"
    // is a suffix-delimiter extension of "Catwalk, South"). Only fires on "; " and " ("
    // delimiters — loose substring overlap would produce false positives on rooms that
    // merely share text ("Catwalk, South" vs "Catwalk, East").
    for (const [existingName] of mapState.nodes) {
      if (locationName.startsWith(existingName + '; ') || locationName.startsWith(existingName + ' (')) {
        stateSuffixBase = existingName;
        break;
      }
    }

    mapState.nodes.set(locationName, {
      id: locationName, name: locationName, x: position.x, y: position.y,
      type: 'room', notes: '', isManual: false, isEdited: false, isSmall: false
    });
    // Protect from future auto-mapper modifications
    mapState.protectedNodes.add(locationName);
  }

  // Add edge (and immediately protect it from future auto-mapper changes)
  // Skip if command is null — indicates a scene break/restart, not directional travel
  if (previousLocationId && previousLocationId !== locationName && command !== null) {
    const edgeKey = `${previousLocationId}-${locationName}`;
    const shouldSkip = mapState.deletedEdges.has(edgeKey) || mapState.protectedEdges.has(edgeKey) || mapState.edges.has(edgeKey);
    if (!shouldSkip) {
      // "go to" commands create portal connections (dotted lines)
      const connectionType = isGoToCommand(command) ? 'portal' : getConnectionTypeFromCommand(command);
      mapState.edges.set(edgeKey, { from: previousLocationId, to: locationName, command: command || '', connectionType, isManual: false, isEdited: false });
      // Protect from future auto-mapper modifications
      mapState.protectedEdges.add(edgeKey);
    }
  }

  mapState.selectedNode = locationName;
  mapState.currentNodeId = locationName;  // New node is the current location
  updateNodeCount();
  checkMapLimits();  // Check if approaching limits

  if (stateSuffixBase) {
    showHint(`"${locationName}" may be a state variant of "${stateSuffixBase}". Merge if same place.`);
  }

  // If map is visible, center on the new location
  if (isVisible) {
    centerOnCurrentLocation();
  }

  render();
  saveMapForGame();
}

/**
 * Check map size limits and show warnings/prevent additions if exceeded
 * @returns {boolean} true if within limits, false if max exceeded
 */
function checkMapLimits() {
  const nodeCount = mapState.nodes.size;
  const edgeCount = mapState.edges.size;

  // Hard limits - prevent further additions
  if (nodeCount >= NODE_COUNT_MAX) {
    showHint(`⚠️ Map limit reached (${NODE_COUNT_MAX} locations). Auto-mapping paused.`);
    mapState.autoMapEnabled = false;
    document.getElementById('mapAutoToggle')?.classList.remove('active');
    return false;
  }

  if (edgeCount >= EDGE_COUNT_MAX) {
    showHint(`⚠️ Connection limit reached (${EDGE_COUNT_MAX}). Map may slow down.`);
    return false;
  }

  // Warning threshold - notify but allow
  if (nodeCount === NODE_COUNT_WARNING) {
    showHint(`ℹ️ Large map (${nodeCount} locations). Performance may degrade.`);
  }

  return true;
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
    isSmall: false,
    isDuplicate: true,
    duplicateGroup: locationName,  // Group for merging
    originalNodeId: locationName
  });
  mapState.protectedNodes.add(duplicateId);

  // Add edge from previous location to duplicate
  if (previousLocationId) {
    const edgeKey = `${previousLocationId}-${duplicateId}`;
    // Check for both existing edges and deleted edges (user might have deleted this connection)
    if (!mapState.edges.has(edgeKey) && !mapState.deletedEdges.has(edgeKey)) {
      mapState.edges.set(edgeKey, {
        from: previousLocationId,
        to: duplicateId,
        command: command || '',
        connectionType: getConnectionTypeFromCommand(command),
        isManual: false,
        isEdited: false
      });
      mapState.protectedEdges.add(edgeKey);
    }
  }

  return duplicateId;
}

/**
 * Check if command is a "go to" command (teleportation, not a physical connection)
 * @param {string} command - Command to check
 * @returns {boolean} True if this is a "go to" command
 */
function isGoToCommand(command) {
  if (!command) return false;
  const cmd = command.toLowerCase().trim();
  // Match "go to <location>", "goto <location>", etc.
  return /^go\s*to\s+/.test(cmd) || /^goto\s+/.test(cmd);
}

function getDirectionFromCommand(command) {
  if (!command) return null;
  const cmd = command.toLowerCase().trim();
  if (COMMAND_DIRECTIONS[cmd]) return COMMAND_DIRECTIONS[cmd];
  if (cmd.startsWith('go ')) {
    // Check if it's "go to" (not a direction)
    if (isGoToCommand(cmd)) return null;
    return COMMAND_DIRECTIONS[cmd.substring(3).trim()] || null;
  }
  // Check if command starts with a direction word (e.g., "enter post office")
  const firstWord = cmd.split(/\s+/)[0];
  if (COMMAND_DIRECTIONS[firstWord]) return COMMAND_DIRECTIONS[firstWord];
  return null;
}

function getConnectionTypeFromCommand(command) {
  const direction = getDirectionFromCommand(command);
  if (direction && DIRECTION_TO_TYPE[direction]) return DIRECTION_TO_TYPE[direction];
  // Unrecognized commands (like "yes", "open door") use portal type
  return 'portal';
}

/**
 * If an unedited portal edge exists between fromId→toId and newCommand reveals a real
 * direction (cardinal or vertical), upgrade it in-place. Also upgrades the reverse portal
 * edge (toId→fromId) using the opposite direction if one exists. Returns true if any upgrade made.
 */
function tryUpgradePortalEdge(fromId, toId, newCommand) {
  if (isGoToCommand(newCommand)) return false;
  const newType = getConnectionTypeFromCommand(newCommand);
  if (newType === 'portal') return false;

  let upgraded = false;

  const newDir = getDirectionFromCommand(newCommand);
  const oppositeDir = newDir && DIRECTION_OPPOSITES[newDir];

  // Forward edge — also reposition the destination node if auto-created
  const edge = mapState.edges.get(`${fromId}-${toId}`);
  if (edge && !edge.isEdited && edge.connectionType === 'portal') {
    edge.connectionType = newType;
    edge.command = newCommand;
    const fromNode = mapState.nodes.get(fromId);
    const toNode = mapState.nodes.get(toId);
    if (fromNode && toNode && !toNode.isManual && newDir && DIRECTION_OFFSETS[newDir]) {
      const offset = DIRECTION_OFFSETS[newDir];
      const pos = findAvailablePosition({ x: fromNode.x + offset.x, y: fromNode.y + offset.y }, toId);
      toNode.x = pos.x;
      toNode.y = pos.y;
    }
    upgraded = true;
  }

  // Reverse edge — also reposition the source node (fromId) relative to toId
  if (oppositeDir) {
    const reverseEdge = mapState.edges.get(`${toId}-${fromId}`);
    if (reverseEdge && !reverseEdge.isEdited && reverseEdge.connectionType === 'portal') {
      reverseEdge.connectionType = DIRECTION_TO_TYPE[oppositeDir] || 'cardinal';
      reverseEdge.command = oppositeDir;
      const fromNode = mapState.nodes.get(fromId);
      const toNode = mapState.nodes.get(toId);
      if (fromNode && toNode && !fromNode.isManual && DIRECTION_OFFSETS[oppositeDir]) {
        const offset = DIRECTION_OFFSETS[oppositeDir];
        const pos = findAvailablePosition({ x: toNode.x + offset.x, y: toNode.y + offset.y }, fromId);
        fromNode.x = pos.x;
        fromNode.y = pos.y;
      }
      upgraded = true;
    }
  }

  return upgraded;
}

/**
 * Record the *return* direction of a connection when a move retraces an existing edge.
 *
 * A move fromId→toId that already has an edge in the opposite orientation
 * (`toId-fromId`) is the player walking back along that connection. We store the
 * command as that edge's `reverseCommand` so the destination end of the connection
 * knows its real exit heading instead of assuming the reciprocal.
 *
 * - Only cardinal↔cardinal connections get a reverseCommand (per the cardinal-only design).
 * - Never overrides a user edit (`isEdited`). See [[automap-never-overrides-user-edits]].
 * - When the return heading is NOT the opposite of the forward heading, the connection is
 *   "bent" and renders as a curve (see drawEdges); reciprocal returns just fill in the
 *   heading and still render straight.
 */
function recordReverseCommand(fromId, toId, command) {
  const dir = getDirectionFromCommand(command);
  if (!dir || DIRECTION_TO_TYPE[dir] !== 'cardinal') return;
  const fwdEdge = mapState.edges.get(`${toId}-${fromId}`);
  if (!fwdEdge || fwdEdge.isEdited) return;
  const fwdDir = getDirectionFromCommand(fwdEdge.command);
  if (!fwdDir || DIRECTION_TO_TYPE[fwdDir] !== 'cardinal') return;
  if (fwdEdge.reverseCommand !== command) {
    fwdEdge.reverseCommand = command;
  }
}

/**
 * Record a placeable heading (cardinal/vertical) into mapState.recentDirections so it
 * survives journey-buffer clears. No-op for portal pseudo-directions (enter/exit/in/out)
 * and unknown commands, which have no DIRECTION_OFFSETS entry.
 */
function rememberDirection(direction) {
  if (!direction || !DIRECTION_OFFSETS[direction]) return;
  mapState.recentDirections.push(direction);
  if (mapState.recentDirections.length > 10) mapState.recentDirections.shift();
}

/**
 * Get the most recent placeable direction (cardinal/vertical) the player traveled.
 * @returns {string|null} Most recent direction, or null if none found
 */
function getLastDirectionFromHistory() {
  // Prefer the live journey (most current), searching backwards for a direction we can
  // actually place by — i.e. one with a DIRECTION_OFFSETS entry. Skip portal pseudo-directions
  // (enter/exit/in/out), which resolve via getDirectionFromCommand but have no offset.
  const mapData = getMapData();
  if (mapData.journey) {
    for (let i = mapData.journey.length - 1; i >= 0; i--) {
      const dir = getDirectionFromCommand(mapData.journey[i].command);
      if (dir && DIRECTION_OFFSETS[dir]) return dir;
    }
  }

  // Journey may have been cleared (scene break, or transferred to the canvas when the map
  // was opened). Fall back to the retained heading so portal/unknown moves are still placed
  // by the last real direction instead of defaulting to 'up'.
  for (let i = mapState.recentDirections.length - 1; i >= 0; i--) {
    if (DIRECTION_OFFSETS[mapState.recentDirections[i]]) return mapState.recentDirections[i];
  }
  return null;
}

/**
 * Find an available position near the preferred location
 * Uses spiral search pattern with limited iterations for performance
 * @param {Object} preferred - Preferred {x, y} position
 * @returns {Object} Available {x, y} position
 */
function findAvailablePosition(preferred, excludeId = null) {
  const MIN_DISTANCE = NODE_RADIUS * 3;
  const nodes = excludeId
    ? [...mapState.nodes.values()].filter(n => n.id !== excludeId)
    : [...mapState.nodes.values()];

  // Quick check: is preferred position already free?
  const hasCollision = nodes.some(n =>
    Math.sqrt((n.x - preferred.x) ** 2 + (n.y - preferred.y) ** 2) < MIN_DISTANCE
  );
  if (!hasCollision) return preferred;

  // Spiral search: 12 angles per ring, max 6 rings (72 total checks)
  // This limits worst-case to O(72*n) instead of unbounded
  const MAX_RINGS = 6;
  const ANGLES_PER_RING = 12;
  const RING_SPACING = 25;

  for (let ring = 0; ring < MAX_RINGS; ring++) {
    const radius = MIN_DISTANCE + (ring * RING_SPACING);
    const angleStep = (Math.PI * 2) / ANGLES_PER_RING;

    for (let i = 0; i < ANGLES_PER_RING; i++) {
      const angle = -Math.PI / 4 + i * angleStep;  // start top-right (NE in canvas)
      const candidate = {
        x: preferred.x + Math.cos(angle) * radius,
        y: preferred.y + Math.sin(angle) * radius
      };

      // Check if this position is valid (no collisions)
      const valid = !nodes.some(n =>
        Math.sqrt((n.x - candidate.x) ** 2 + (n.y - candidate.y) ** 2) < MIN_DISTANCE
      );

      if (valid) return candidate;
    }
  }

  // Fallback: if no position found after 72 checks, accept overlap
  // This prevents infinite loops in very dense maps
  return preferred;
}

// ============================================================================
// NODE CRUD
// ============================================================================

export function addNodeAtPosition(x, y) {
  // Check limits before adding
  if (mapState.nodes.size >= NODE_COUNT_MAX) {
    showHint(`Cannot add location: map limit reached (${NODE_COUNT_MAX} locations)`);
    return;
  }

  snapshotForUndo();
  const id = `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const position = findAvailablePosition({ x, y });
  const node = { id, name: 'New Location', x: position.x, y: position.y, type: 'room', notes: '', isManual: true, isEdited: false, isSmall: false };
  mapState.nodes.set(id, node);
  mapState.protectedNodes.add(id);
  mapState.selectedNode = id;
  updateNodeCount(); checkMapLimits(); render(); saveMapForGame();
  setTimeout(() => openNodeSheet(node), 100);
  showHint('Location added! Tap to edit the name.');
}

// ============================================================================
// HINTS & ONBOARDING
// ============================================================================

export function showHint(message) {
  const hintText = domRefs.hint.querySelector('.map-hint-text');
  if (hintText) hintText.textContent = message;
  domRefs.hint.classList.remove('hidden');
  clearTimeout(timers.hintTimeout);
  timers.hintTimeout = setTimeout(() => domRefs.hint.classList.add('hidden'), 6000);
}

export function hideHint() {
  clearTimeout(timers.hintTimeout);
  domRefs.hint?.classList.add('hidden');
}

// Dismiss handler for the new-area hint's close button. Tracked at module
// level because showNewAreaHint() re-runs on every map open while the hint is
// pending — without removing the previous listener first, dismiss handlers
// accumulate on the persistent close button, and the "Add map" path would
// leave a stale one armed to fire on a later unrelated hint close.
let _newAreaDismissHandler = null;

function _clearNewAreaDismissHandler(closeBtn) {
  if (_newAreaDismissHandler && closeBtn) {
    closeBtn.removeEventListener('click', _newAreaDismissHandler);
  }
  _newAreaDismissHandler = null;
}

function showNewAreaHint() {
  if (!domRefs.hint) return;
  clearTimeout(timers.hintTimeout);  // no auto-hide — user must decide

  const textEl = domRefs.hint.querySelector('.map-hint-text');
  if (textEl) textEl.textContent = 'Looks like a new area.';

  const closeBtn = domRefs.hint.querySelector('.map-hint-close');
  _clearNewAreaDismissHandler(closeBtn);

  domRefs.hint.querySelector('.map-hint-action')?.remove();
  const addBtn = document.createElement('button');
  addBtn.className = 'map-hint-action';
  addBtn.textContent = 'Add map';
  addBtn.addEventListener('click', () => {
    _clearNewAreaDismissHandler(closeBtn);
    setSuppressJourneyClear(false);
    addMap();
    syncFromAutoMapper();  // replay buffered journey into the new map
    hideHint();
  });
  closeBtn.before(addBtn);

  // Dismissing (X) flushes the buffered journey into the current map
  _newAreaDismissHandler = () => {
    _newAreaDismissHandler = null;
    _pendingNewAreaHint = false;
    setSuppressJourneyClear(false);
    syncFromAutoMapper();
  };
  closeBtn.addEventListener('click', _newAreaDismissHandler, { once: true });

  domRefs.hint.classList.remove('hidden');
}

function updateNodeCount() { /* node count display removed */ }

// ============================================================================
// TOAST NOTIFICATION SYSTEM
// ============================================================================

const TOAST_STORAGE_KEY = 'lantern_map_toasts_dismissed';
let toastQueue = [];
let currentToast = null;
let toastContainer = null;

function setupToastSystem() {
  // Create toast container
  toastContainer = document.createElement('div');
  toastContainer.id = 'mapToastContainer';
  toastContainer.className = 'map-toast-container';
  document.body.appendChild(toastContainer);
}

/**
 * Show a dismissable toast notification
 * @param {string} message - Toast message text
 * @param {string} id - Unique ID for this toast (for tracking dismissals)
 * @param {boolean} persistent - If true, toast stays until dismissed
 * @param {string} index - Optional index to display (e.g., "1/5")
 */
function showToast(message, id, persistent = false, index = null) {
  // Check if user has dismissed this toast before
  const dismissed = getDismissedToasts();
  if (dismissed.includes(id)) {
    // Skip and show next in queue
    showNextToast();
    return;
  }

  // Determine if this is the last toast (N/N)
  const isLastToast = index && (() => { const [a, b] = index.split('/'); return a && b && a === b; })();
  // Determine if this is an onboarding toast (has index like "1/5")
  const isOnboardingToast = index && index.match(/\d+\/\d+/);

  const toast = document.createElement('div');
  toast.className = 'map-toast';

  // Build toast structure based on whether it has an index
  if (index) {
    toast.innerHTML = `
      <div class="toast-header">
        <div class="toast-index">${index}</div>
        <div class="toast-buttons">
          <button class="toast-dismiss" aria-label="${isLastToast ? 'Dismiss' : 'Next'}">
            <span class="material-icons">${isLastToast ? 'close' : 'chevron_right'}</span>
          </button>
          ${!isLastToast ? `<button class="toast-cancel" aria-label="Cancel tutorial">
            <span class="material-icons">close</span>
          </button>` : ''}
        </div>
      </div>
      <div class="toast-content">${message}</div>
    `;
  } else {
    toast.innerHTML = `
      <div class="toast-buttons">
        <button class="toast-dismiss" aria-label="Dismiss">
          <span class="material-icons">close</span>
        </button>
      </div>
      <div class="toast-content">${message}</div>
    `;
  }

  const dismissBtn = toast.querySelector('.toast-dismiss');
  dismissBtn.addEventListener('click', () => {
    markToastDismissed(id);
    hideToast(toast);
  });

  // Add cancel button handler for onboarding toasts (not shown on last toast)
  if (isOnboardingToast && !isLastToast) {
    const cancelBtn = toast.querySelector('.toast-cancel');
    cancelBtn.addEventListener('click', () => {
      cancelOnboarding(toast);
    });
  }

  toastContainer.appendChild(toast);
  currentToast = toast;

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('toast-visible');
  });

  // Auto-hide after 8 seconds if not persistent
  if (!persistent) {
    setTimeout(() => {
      if (toast.parentElement) {
        hideToast(toast);
      }
    }, 8000);
  }

  return toast;
}

function hideToast(toast) {
  toast.classList.remove('toast-visible');
  setTimeout(() => {
    toast.remove();
    if (currentToast === toast) {
      currentToast = null;
    }
    // Show next toast in queue after a short delay
    showNextToast();
  }, 150);
}

function showNextToast() {
  if (toastQueue.length > 0 && !currentToast) {
    const next = toastQueue.shift();
    // Immediate transition - no delay between toasts
    showToast(next.message, next.id, next.persistent, next.index);
  }
}

/**
 * Cancel the onboarding tutorial sequence
 * Clears remaining toasts and shows the "don't show again" dialog
 */
function cancelOnboarding(toastEl) {
  // Clear the queue
  toastQueue = [];

  // Mark all onboarding toasts as dismissed
  const onboardingIds = ['map-intro-1', 'map-intro-2', 'map-intro-3', 'map-intro-4', 'map-intro-5', 'map-intro-6'];
  const dismissed = getDismissedToasts();
  onboardingIds.forEach(id => {
    if (!dismissed.includes(id)) {
      dismissed.push(id);
    }
  });
  localStorage.setItem(TOAST_STORAGE_KEY, JSON.stringify(dismissed));

  // Hide current toast
  hideToast(toastEl);

  // Show "don't show again" dialog after a short delay
  setTimeout(() => showDontShowAgainToast(), 500);
}

function getDismissedToasts() {
  try {
    const stored = localStorage.getItem(TOAST_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Clear all visible toasts without marking them as dismissed
 * Used when map is cleared or closed to remove clutter
 */
function clearAllToasts() {
  // Clear the queue
  toastQueue = [];

  // Remove current toast if any
  if (currentToast && currentToast.parentElement) {
    currentToast.remove();
    currentToast = null;
  }

  // Remove any other toasts in the container
  if (toastContainer) {
    while (toastContainer.firstChild) {
      toastContainer.removeChild(toastContainer.firstChild);
    }
  }
}

function markToastDismissed(id) {
  try {
    const dismissed = getDismissedToasts();
    if (!dismissed.includes(id)) {
      dismissed.push(id);
      localStorage.setItem(TOAST_STORAGE_KEY, JSON.stringify(dismissed));
    }

    // Check if all onboarding toasts have been dismissed
    const onboardingIds = ['map-intro-1', 'map-intro-2', 'map-intro-3', 'map-intro-4', 'map-intro-5', 'map-intro-6'];
    const allDismissed = onboardingIds.every(id => dismissed.includes(id));

    if (allDismissed && !dismissed.includes('dont-show-onboarding')) {
      // Show "don't show again" option after all toasts dismissed
      setTimeout(() => showDontShowAgainToast(), 1000);
    }
  } catch (e) {
    console.error('Failed to save toast dismissal:', e);
  }
}

function showDontShowAgainToast() {
  const toast = document.createElement('div');
  toast.className = 'map-toast map-toast-action';
  toast.innerHTML = `
    <div class="toast-content">
      <strong>Map tips complete!</strong><br>
      Want to see these tips again next time?
    </div>
    <div class="toast-actions">
      <button class="toast-action-btn toast-btn-secondary" id="toastKeepShowing">
        Yes, show again
      </button>
      <button class="toast-action-btn toast-btn-primary" id="toastDontShow">
        Don't show again
      </button>
    </div>
  `;

  toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('toast-visible');
  });

  toast.querySelector('#toastKeepShowing').addEventListener('click', () => {
    // Clear all dismissed toasts AND first-use flag so they show again next time
    localStorage.removeItem(TOAST_STORAGE_KEY);
    localStorage.removeItem(FIRST_USE_KEY);
    hideToast(toast);
    showHint('Map tips will show again next time');
  });

  toast.querySelector('#toastDontShow').addEventListener('click', () => {
    markToastDismissed('dont-show-onboarding');
    hideToast(toast);
    showHint('Map tips disabled');
  });
}

function showOnboardingToasts() {
  // Check if user has opted out of onboarding
  const dismissed = getDismissedToasts();
  if (dismissed.includes('dont-show-onboarding')) {
    return;
  }

  // Queue onboarding toasts (sequential - one at a time)
  const toasts = [
    {
      id: 'map-intro-1',
      message: '<strong>Welcome to the Game Map!</strong><br>Use this as a mapping tool or note-taking tool as you explore.',
      persistent: true,
      index: '1/5'
    },
    {
      id: 'map-intro-2',
      message: '<strong>Auto-mapping is enabled by default.</strong><br>Tap the <span class="material-icons" style="font-size:16px;vertical-align:middle">auto_fix_high</span> Auto button to disable it if you prefer manual mapping.',
      persistent: true,
      index: '2/5'
    },
    {
      id: 'map-intro-3',
      message: '<strong>Note:</strong> The auto-mapper tries to parse locations from the game, but may not work as expected in all games.',
      persistent: true,
      index: '3/5'
    },
    {
      id: 'map-intro-4',
      message: '<strong>Manual mapping:</strong> Automapped locations that are edited or deleted by the user will not be recreated by the automapper. You can always add locations manually using the <span class="material-icons" style="font-size:16px;vertical-align:middle">add_location</span> button.',
      persistent: true,
      index: '4/5'
    },
    {
      id: 'map-intro-5',
      message: '<strong>Clear Map:</strong> Use the <span class="material-icons" style="font-size:16px;vertical-align:middle">delete_sweep</span> Clear Map button to reset the map data for this game.',
      persistent: true,
      index: '5/6'
    },
    {
      id: 'map-intro-6',
      message: '<strong>Multi-select:</strong> Tap the <span class="material-icons" style="font-size:16px;vertical-align:middle">select_all</span> Select button to pick multiple nodes, then drag any to move them together. On desktop, shift-click nodes directly.',
      persistent: true,
      index: '6/6'
    }
  ];

  // Show first toast immediately
  const first = toasts.shift();
  showToast(first.message, first.id, first.persistent, first.index);

  // Queue the rest (will show sequentially after each dismissal)
  toastQueue = toasts;
}

function showOnboardingOrHint() {
  // Show onboarding toasts for first-time users
  if (!localStorage.getItem(FIRST_USE_KEY)) {
    localStorage.setItem(FIRST_USE_KEY, 'true');
    showOnboardingToasts();
  } else if (!mapState.autoMapEnabled && mapState.nodes.size === 0) {
    showHint('Auto-mapping is off. Tap the Auto button to enable, or add locations manually');
  }
}

// ============================================================================
// MAP VISIBILITY
// ============================================================================

/**
 * Update toolbar and FAB visibility based on keyboard state
 */
function updateUIVisibilityForKeyboard() {
  if (!isVisible || !window.visualViewport) return;

  const fabContainer = container.querySelector('.map-fab-container');
  const toolbar = container.querySelector('.map-toolbar');
  const currentHeight = window.visualViewport.height;

  // More aggressive keyboard detection for iPhone
  // Check if viewport height is significantly reduced OR if an input is focused
  const active = document.activeElement;
  const hasActiveInput = active &&
    (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
  const heightReduced = currentHeight < window.innerHeight - 50; // Reduced threshold from 100 to 50
  const isKeyboardUp = heightReduced || hasActiveInput;

  if (fabContainer) {
    fabContainer.style.display = isKeyboardUp ? 'none' : '';
  }
  if (toolbar) {
    // Keep the toolbar visible when the focused field lives inside it (the map
    // rename input in the picker dropdown). Hiding the toolbar would hide the
    // very input being edited, blurring it and reverting the rename — the
    // "flash and return" seen only on touch, where focusing the input opens the
    // keyboard and triggers this keyboard-visibility pass.
    const editingInToolbar = hasActiveInput && toolbar.contains(active);
    toolbar.style.display = (isKeyboardUp && !editingInToolbar) ? 'none' : '';
  }
}

export function showMap() {
  container.classList.remove('hidden');
  // Trigger reflow to ensure transition happens
  container.offsetHeight;
  container.classList.add('visible');
  setIsVisible(true);
  document.getElementById('mapAutoToggle').classList.toggle('active', mapState.autoMapEnabled);
  timers.fabVisible = true; timers.isInteracting = false;
  domRefs.fabContainer?.classList.remove('fab-hidden');

  // Re-setup resize handle if it was cleaned up
  if (!resizeState) {
    resizeState = setupResizeHandle();
  }

  resizeCanvas(); updateNodeCount(); centerOnCurrentLocation({ instant: true });
  if (_pendingNewAreaHint) { showNewAreaHint(); }
  else { showOnboardingOrHint(); }

  // Check keyboard state and hide UI elements if keyboard is up
  setTimeout(() => {
    updateUIVisibilityForKeyboard();
  }, 100);
}

export async function hideMap() {
  container?.classList.remove('visible');
  setIsVisible(false);
  clearTimeout(timers.onboardingTimeout);
  clearTimeout(timers.fabHideTimer);
  clearAllToasts();
  closeMapPicker();
  exitAddMode();
  mapState.selectedNode = null;
  mapState.selectedNodes.clear();

  // Reset FAB and toolbar visibility (from keyboard handling)
  const fabContainer = container?.querySelector('.map-fab-container');
  const toolbar = container?.querySelector('.map-toolbar');
  if (fabContainer) {
    fabContainer.style.display = '';
  }
  if (toolbar) {
    toolbar.style.display = '';
  }

  saveMapForGame(true);  // Immediate save when hiding map

  // If user made changes to the map, trigger a full autosave
  if (mapState.hasUnsavedChanges) {
    const { autoSave } = await import('../game/save-manager.js');
    await autoSave();
    mapState.hasUnsavedChanges = false;  // Reset flag after save
  }

  // Clean up resize event listeners
  if (resizeState && resizeState.cleanup) {
    resizeState.cleanup();
    resizeState = null;
  }

  // Wait for slide-out animation using transitionend event
  const panel = container?.querySelector('.map-panel');
  if (panel) {
    const handleTransitionEnd = (e) => {
      // Only handle the transform transition on the panel itself
      if (e.target === panel && e.propertyName === 'transform' && !isVisible) {
        container?.classList.add('hidden');
        panel.removeEventListener('transitionend', handleTransitionEnd);
      }
    };
    panel.addEventListener('transitionend', handleTransitionEnd);

    // Fallback timeout in case transitionend doesn't fire
    setTimeout(() => {
      if (!isVisible) {
        container?.classList.add('hidden');
        panel.removeEventListener('transitionend', handleTransitionEnd);
      }
    }, 500);
  }
}

export function toggleMap() { isVisible ? hideMap() : showMap(); }
export function isMapVisible() { return isVisible; }

// ---- Viewport pan animation ----------------------------------------------
// Smoothly eases viewport.x/y toward a target instead of jump-cutting. Single RAF
// loop that runs only while a pan is in flight, then idles (keeps the canvas's
// one-shot, zero-idle-cost render model). Scale and node positions are untouched.
const PAN_DURATION_MS = 220;
let panAnim = null;     // { startX, startY, targetX, targetY, startTime }
let panRaf = null;

function easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Pan the viewport to (targetX, targetY). Animates by default; jumps instantly when
// `instant` is set, the map isn't visible, or the user prefers reduced motion.
function panViewportTo(targetX, targetY, instant) {
  if (instant || !isVisible || prefersReducedMotion()) {
    if (panRaf) { cancelAnimationFrame(panRaf); panRaf = null; }
    panAnim = null;
    mapState.viewport.x = targetX;
    mapState.viewport.y = targetY;
    render();
    return;
  }
  // Interruptible: a new target re-anchors the tween from wherever we are right now.
  panAnim = {
    startX: mapState.viewport.x, startY: mapState.viewport.y,
    targetX, targetY, startTime: performance.now()
  };
  if (!panRaf) panRaf = requestAnimationFrame(stepPan);
}

function stepPan(now) {
  if (!panAnim) { panRaf = null; return; }
  const t = Math.min(1, (now - panAnim.startTime) / PAN_DURATION_MS);
  const e = easeInOutQuad(t);
  mapState.viewport.x = panAnim.startX + (panAnim.targetX - panAnim.startX) * e;
  mapState.viewport.y = panAnim.startY + (panAnim.targetY - panAnim.startY) * e;
  render();
  if (t < 1) {
    panRaf = requestAnimationFrame(stepPan);
  } else {
    panAnim = null;
    panRaf = null;
  }
}

export function centerOnCurrentLocation(options = {}) {
  // Use last known location name (from status bar tracking)
  const currentName = getLastLocationName();
  let target = currentName ? mapState.nodes.get(currentName) : null;
  if (!target && mapState.nodes.size > 0) target = mapState.nodes.values().next().value;
  if (target) {
    const canvasHeight = canvas.height / window.devicePixelRatio;
    let targetX, targetY;

    // Use visual viewport to account for keyboard
    if (window.visualViewport) {
      const vv = window.visualViewport;
      const canvasRect = canvas.getBoundingClientRect();

      // Calculate visible portion of canvas in viewport coordinates
      const visibleTop = Math.max(0, canvasRect.top);
      const visibleBottom = Math.min(canvasRect.bottom, vv.height);
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);

      // Target screen Y position (center of visible area, with upward bias) in viewport coordinates
      // Use 30% from top to position node higher when keyboard is visible
      const targetScreenY = visibleTop + visibleHeight * 0.3;

      // Convert to canvas-relative coordinates
      const targetCanvasY = targetScreenY - canvasRect.top;

      // The render translates by (height/2 + viewport.y), so node appears at:
      // canvasY = node.y * scale + height/2 + viewport.y
      // We want: canvasY = targetCanvasY
      // So: viewport.y = targetCanvasY - height/2 - node.y * scale
      const verticalOffset = targetCanvasY - canvasHeight / 2;

      targetX = -target.x * mapState.viewport.scale;
      targetY = -target.y * mapState.viewport.scale + verticalOffset;
    } else {
      // No visual viewport API - just center normally
      targetX = -target.x * mapState.viewport.scale;
      targetY = -target.y * mapState.viewport.scale;
    }

    // Only update selectedNode if the node edit sheet is not open
    // This prevents overriding the user's selection when keyboard opens
    const nodeSheet = document.getElementById('nodeEditSheet');
    if (!nodeSheet || nodeSheet.classList.contains('hidden')) {
      mapState.selectedNode = target.id;
    }
    panViewportTo(targetX, targetY, options.instant);
  }
}

// ============================================================================
// MAP MANAGEMENT
// ============================================================================

function generateMapId() { return 'map_' + Date.now(); }

function getCurrentMapName() {
  const entry = mapState.mapOrder.find(m => m.id === mapState.activeMapId);
  return entry ? entry.name : 'Map 1';
}

function extractMapData() {
  return {
    nodes: Array.from(mapState.nodes.values()),
    edges: Array.from(mapState.edges.values()),
    protectedNodes: Array.from(mapState.protectedNodes),
    protectedEdges: Array.from(mapState.protectedEdges),
    deletedEdges: Array.from(mapState.deletedEdges),
    deletedNodes: Array.from(mapState.deletedNodes),
    viewport: { ...mapState.viewport },
    autoMapEnabled: mapState.autoMapEnabled,
    currentNodeId: mapState.currentNodeId
  };
}

function applyMapData(data) {
  const validNodes = (data.nodes || []).filter(n => n && n.id && n.name).map(n => ({
    ...n,
    x: typeof n.x === 'number' && !isNaN(n.x) ? n.x : 0,
    y: typeof n.y === 'number' && !isNaN(n.y) ? n.y : 0,
    isSmall: n.isSmall === true
  }));
  mapState.nodes = new Map(validNodes.map(n => [n.id, n]));
  mapState.edges = new Map((data.edges || []).map(e => [`${e.from}-${e.to}`, e]));
  mapState.protectedNodes = new Set(data.protectedNodes || []);
  mapState.protectedEdges = new Set(data.protectedEdges || []);
  mapState.deletedEdges = new Set(data.deletedEdges || []);
  mapState.deletedNodes = new Set(data.deletedNodes || []);
  if (data.viewport && typeof data.viewport.x === 'number' && !isNaN(data.viewport.x) &&
      typeof data.viewport.y === 'number' && !isNaN(data.viewport.y) &&
      typeof data.viewport.scale === 'number' && !isNaN(data.viewport.scale) && data.viewport.scale > 0) {
    mapState.viewport = data.viewport;
  } else {
    mapState.viewport = { x: 0, y: 0, scale: 1 };
  }
  if (typeof data.autoMapEnabled === 'boolean') mapState.autoMapEnabled = data.autoMapEnabled;
  mapState.currentNodeId = data.currentNodeId || null;
}

function clearActiveMapData() {
  mapState.nodes = new Map(); mapState.edges = new Map();
  mapState.protectedNodes = new Set(); mapState.protectedEdges = new Set();
  mapState.deletedEdges = new Set(); mapState.deletedNodes = new Set();
  mapState.viewport = { x: 0, y: 0, scale: 1 };
  mapState.selectedNode = null; mapState.currentNodeId = null;
  const automapPref = localStorage.getItem('lantern_automap_default');
  mapState.autoMapEnabled = automapPref !== null ? automapPref === 'true' : true;
  mapState.undoStack = [];
  mapState.redoStack = [];
  mapState.hasUnsavedChanges = false;
  updateUndoButton();
}

function initFirstMap() {
  const mapId = 'map_1';
  mapState.activeMapId = mapId;
  mapState.mapOrder = [{ id: mapId, name: 'Map 1' }];
  _allMapsData = {};
  clearActiveMapData();
}

function switchMap(mapId) {
  if (mapId === mapState.activeMapId) return;
  if (!mapState.mapOrder.find(m => m.id === mapId)) return;

  _allMapsData[mapState.activeMapId] = extractMapData();
  mapState.activeMapId = mapId;
  mapState.undoStack = [];
  mapState.redoStack = [];
  mapState.selectedNode = null;
  mapState.hasUnsavedChanges = false;
  updateUndoButton();

  const data = _allMapsData[mapId];
  if (data) { applyMapData(data); }
  else { clearActiveMapData(); }

  saveMapForGame(true);
  updateMapNameDisplay();
  updateNodeCount();
  updateMapBadge();
  if (isVisible) { render(); centerOnCurrentLocation({ instant: true }); }
}

function addMap() {
  _pendingNewAreaHint = false;
  setSuppressJourneyClear(false);
  _allMapsData[mapState.activeMapId] = extractMapData();

  const mapId = generateMapId();
  const name = `Map ${mapState.mapOrder.length + 1}`;
  mapState.mapOrder.push({ id: mapId, name });
  _allMapsData[mapId] = {
    nodes: [], edges: [], protectedNodes: [], protectedEdges: [],
    deletedEdges: [], deletedNodes: [],
    viewport: { x: 0, y: 0, scale: 1 },
    autoMapEnabled: mapState.autoMapEnabled,
    currentNodeId: null
  };
  mapState.activeMapId = mapId;
  mapState.undoStack = [];
  mapState.redoStack = [];
  mapState.selectedNode = null;
  mapState.hasUnsavedChanges = false;
  updateUndoButton();
  applyMapData(_allMapsData[mapId]);

  saveMapForGame(true);
  updateMapNameDisplay();
  updateNodeCount();
  updateMapBadge();
  if (isVisible) render();
}

function renameCurrentMap(name) {
  const entry = mapState.mapOrder.find(m => m.id === mapState.activeMapId);
  if (entry) { entry.name = name; saveMapForGame(true); }
}

async function deleteMapWithConfirm(mapId, mapName) {
  const { confirmDialog } = await import('../ui/confirm-dialog.js');
  const ok = await confirmDialog(`Delete "${mapName}"? This cannot be undone.`, {
    title: 'Delete Map', okText: 'Delete', cancelText: 'Cancel'
  });
  if (!ok) return;
  deleteMap(mapId);
  closeMapPicker();
}

function deleteMap(mapId) {
  const idx = mapState.mapOrder.findIndex(m => m.id === mapId);
  if (idx === -1) return;

  delete _allMapsData[mapId];
  mapState.mapOrder.splice(idx, 1);

  if (mapState.mapOrder.length === 0) {
    // Deleted the last map — reset to a fresh default "Map 1", seeding the
    // current location if automap is on (like any other new map).
    const newId = 'map_1';
    mapState.activeMapId = newId;
    mapState.mapOrder = [{ id: newId, name: 'Map 1' }];
    _allMapsData = {};
    clearActiveMapData();          // resets nodes/viewport and restores the automap pref
    if (mapState.gameName) localStorage.removeItem(`lantern_automapper_restore_${mapState.gameName}`);
    clearJourney();
    if (mapState.autoMapEnabled) seedCurrentLocation();
  } else if (mapState.activeMapId === mapId) {
    // Active (but not last) map deleted — switch to the previous remaining map.
    const fallback = mapState.mapOrder[Math.max(0, idx - 1)];
    mapState.activeMapId = fallback.id;
    mapState.undoStack = []; mapState.redoStack = [];
    mapState.selectedNode = null; mapState.hasUnsavedChanges = false;
    updateUndoButton();
    const data = _allMapsData[fallback.id];
    if (data) { applyMapData(data); } else { clearActiveMapData(); }
  }

  saveMapForGame(true);
  updateMapNameDisplay();
  updateNodeCount();
  updateMapBadge();
  if (isVisible) { render(); centerOnCurrentLocation({ instant: true }); }
  showHint(`Deleted "${mapName}"`);
}

// ============================================================================
// MAP PICKER UI
// ============================================================================

function updateMapNameDisplay() {
  const el = document.getElementById('mapNameText');
  if (el) el.textContent = getCurrentMapName();
}

function buildPickerDropdown() {
  const dropdown = document.getElementById('mapPickerDropdown');
  if (!dropdown) return;
  dropdown.innerHTML = '';

  for (const { id, name } of mapState.mapOrder) {
    const row = document.createElement('div');
    row.className = 'map-picker-row' + (id === mapState.activeMapId ? ' active' : '');
    row.dataset.mapId = id;

    const nameBtn = document.createElement('button');
    nameBtn.className = 'map-picker-item';
    nameBtn.textContent = name;
    nameBtn.addEventListener('click', () => { switchMap(id); closeMapPicker(); });

    const editBtn = document.createElement('button');
    editBtn.className = 'map-picker-edit';
    editBtn.title = 'Rename';
    editBtn.setAttribute('aria-label', 'Rename map');
    editBtn.innerHTML = '<span class="material-icons">edit</span>';
    editBtn.addEventListener('click', (e) => { e.stopPropagation(); startMapRenameInRow(row, id, name); });

    row.appendChild(nameBtn);
    row.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'map-picker-edit map-picker-delete';
    deleteBtn.title = 'Delete map';
    deleteBtn.setAttribute('aria-label', 'Delete map');
    deleteBtn.innerHTML = '<span class="material-icons">delete</span>';
    deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteMapWithConfirm(id, name); });
    row.appendChild(deleteBtn);

    dropdown.appendChild(row);
  }

  const divider = document.createElement('div');
  divider.className = 'map-picker-divider';
  dropdown.appendChild(divider);

  const addBtn = document.createElement('button');
  addBtn.className = 'map-picker-add';
  addBtn.innerHTML = '<span class="material-icons">add</span> Add map';
  addBtn.addEventListener('click', () => { addMap(); closeMapPicker(); });
  dropdown.appendChild(addBtn);
}

function startMapRenameInRow(row, mapId, currentName) {
  const nameBtn = row.querySelector('.map-picker-item');
  const editBtn = row.querySelector('.map-picker-edit');
  if (!nameBtn || !editBtn) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'map-picker-rename-input';
  input.value = currentName;
  input.maxLength = 30;

  nameBtn.replaceWith(input);
  editBtn.innerHTML = '<span class="material-icons">check</span>';
  editBtn.classList.add('map-picker-confirm');
  input.focus();
  input.select();

  function commit() {
    input.removeEventListener('keydown', onKeyDown);
    const newName = input.value.trim() || currentName;
    const entry = mapState.mapOrder.find(m => m.id === mapId);
    if (entry) { entry.name = newName; saveMapForGame(true); }
    nameBtn.textContent = newName;
    input.replaceWith(nameBtn);
    editBtn.innerHTML = '<span class="material-icons">edit</span>';
    editBtn.classList.remove('map-picker-confirm');
    if (mapId === mapState.activeMapId) updateMapNameDisplay();
    // Close the picker after a rename so a stray second tap on the pencil
    // can't land on the just-committed row and revert it.
    closeMapPicker();
  }
  function onKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = currentName; input.blur(); }
  }
  editBtn.onclick = (e) => { e.stopPropagation(); input.blur(); };
  input.addEventListener('keydown', onKeyDown);
  input.addEventListener('blur', commit, { once: true });
}

function toggleMapPicker() {
  const dropdown = document.getElementById('mapPickerDropdown');
  if (!dropdown) return;
  if (dropdown.classList.contains('hidden')) {
    buildPickerDropdown();
    dropdown.classList.remove('hidden');
  } else {
    dropdown.classList.add('hidden');
  }
}

function closeMapPicker() {
  document.getElementById('mapPickerDropdown')?.classList.add('hidden');
}


// ============================================================================
// PERSISTENCE
// ============================================================================

function loadMapForGame(gameName) {
  mapState.gameName = gameName;
  mapState.undoStack = [];
  mapState.redoStack = [];
  mapState.recentDirections = [];  // reset heading memory per game; re-seeded by syncFromAutoMapper below
  mapState.selectedNode = null;
  mapState.hasUnsavedChanges = false;
  updateUndoButton();
  _allMapsData = {};
  _pendingNewAreaHint = false;
  setSuppressJourneyClear(false);

  const saved = localStorage.getItem(`lantern_map_${gameName}`);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      let v2;
      if (parsed.v === 2 && parsed.maps) {
        v2 = parsed;
      } else if (parsed.nodes !== undefined || parsed.edges !== undefined) {
        // Migrate v1 single-map format
        const mapId = 'map_1';
        v2 = { v: 2, activeMapId: mapId, mapOrder: [{ id: mapId, name: 'Map 1' }], maps: { [mapId]: parsed } };
      } else {
        v2 = null;
      }

      if (v2) {
        mapState.activeMapId = v2.activeMapId;
        mapState.mapOrder = v2.mapOrder || [];
        for (const [id, data] of Object.entries(v2.maps || {})) {
          _allMapsData[id] = data;
        }
        const activeData = _allMapsData[mapState.activeMapId];
        if (activeData) { applyMapData(activeData); }
        else { clearActiveMapData(); }
      } else {
        initFirstMap();
      }
    } catch (e) { initFirstMap(); }
  } else {
    initFirstMap();
  }

  syncFromAutoMapper();
  updateNodeCount();
  updateMapBadge();
  updateMapNameDisplay();
  if (isVisible) render();
}

/**
 * Sync locations from auto-mapper journey that were tracked before map UI loaded
 * This ensures we don't lose locations visited before opening the map
 * Replays journey to build nodes/edges with proper spatial positioning from directions
 */
function syncFromAutoMapper() {
  if (!mapState.autoMapEnabled) {
    return;
  }

  const autoMapperData = getMapData();

  if (!autoMapperData || !autoMapperData.journey || autoMapperData.journey.length === 0) {
    return;
  }

  // Replay journey to create nodes/edges with proper positions
  let previousNode = null;
  const recentDirections = []; // Track last 10 directional commands (excluding portals)
  const journey = autoMapperData.journey;

  // Portal commands that use recent direction for placement
  const portalCommands = ['in', 'out', 'enter', 'exit'];

  for (let i = 0; i < journey.length; i++) {
    const visit = journey[i];
    const locationName = visit.locationName;

    // Skip if location was deleted by user
    if (mapState.deletedNodes.has(locationName)) {
      // Update previousNode for edge creation even if deleted
      previousNode = mapState.nodes.get(locationName) || { id: locationName, x: 0, y: 0 };
      continue;
    }

    // Resolve the best command to use for positioning.
    // positionCommand (new saves): the actual direction typed, even if a scene break nulled `command`.
    // Fallback — look at the next entry's return direction and reverse it (old saves without positionCommand).
    let navCommand = visit.positionCommand || visit.command;
    if (!navCommand && previousNode) {
      const next = journey[i + 1];
      if (next && next.locationName === previousNode.id) {
        const returnDir = getDirectionFromCommand(next.positionCommand || next.command);
        if (returnDir && DIRECTION_OPPOSITES[returnDir]) {
          navCommand = DIRECTION_OPPOSITES[returnDir];
        }
      }
    }

    // Check if node already exists
    let currentNode = mapState.nodes.get(locationName);

    if (!currentNode) {
      // Calculate position from direction command
      let x = 0, y = 0;
      if (previousNode && navCommand) {
        const cmd = navCommand.toLowerCase();

        const canonicalDir = getDirectionFromCommand(navCommand);
        const offset = canonicalDir ? DIRECTION_OFFSETS[canonicalDir] : null;

        // Portal commands use most recent directional command
        if (portalCommands.includes(cmd)) {
          const fallbackDir = recentDirections.length > 0
            ? recentDirections[recentDirections.length - 1]
            : 'up';
          const fallbackOffset = DIRECTION_OFFSETS[fallbackDir];
          x = previousNode.x + fallbackOffset.x;
          y = previousNode.y + fallbackOffset.y;
        } else if (offset) {
          // Known directional command - use it
          x = previousNode.x + offset.x;
          y = previousNode.y + offset.y;

          // Track canonical direction for portal fallback
          recentDirections.push(canonicalDir);
          if (recentDirections.length > 10) recentDirections.shift();
        } else {
          // Unknown command - use most recent direction or "up" as fallback
          const fallbackDir = recentDirections.length > 0
            ? recentDirections[recentDirections.length - 1]
            : 'up';
          const fallbackOffset = DIRECTION_OFFSETS[fallbackDir];
          x = previousNode.x + fallbackOffset.x;
          y = previousNode.y + fallbackOffset.y;
        }
      } else if (previousNode) {
        // No command at all - use "up" as default
        x = previousNode.x + DIRECTION_OFFSETS['up'].x;
        y = previousNode.y + DIRECTION_OFFSETS['up'].y;
      }
      // else: first node stays at (0, 0)

      // Create new node with spatial position; apply collision avoidance same as live play
      const position = findAvailablePosition({ x, y });
      currentNode = {
        id: locationName,
        name: locationName,
        x: position.x,
        y: position.y,
        type: 'room',
        notes: '',
        isManual: false,
        isEdited: false,
        isSmall: false
      };

      mapState.nodes.set(locationName, currentNode);
      mapState.protectedNodes.add(locationName);
    }

    // Create edge from previous to current.
    // Use navCommand for edge (handles scene-break entries where command is null but
    // positionCommand or look-ahead inference recovered the real direction).
    // Only skip if there's truly no directional info (genuine teleport/scene restart).
    const edgeCommand = navCommand && getDirectionFromCommand(navCommand) ? navCommand : visit.command;
    if (previousNode && previousNode.id !== locationName && edgeCommand !== null) {
      const edgeKey = `${previousNode.id}-${locationName}`;
      const reverseKey = `${locationName}-${previousNode.id}`;

      if (!mapState.deletedEdges.has(edgeKey)) {
        const command = edgeCommand || '';
        // Upgrade an unedited portal edge (forward OR reverse) if this move reveals a real
        // direction. Mirrors the live handleLocationChange path; must run even when the
        // forward edge doesn't exist yet, so a reverse portal edge (e.g. an earlier
        // "enter gate") gets upgraded and its node repositioned during journey replay.
        tryUpgradePortalEdge(previousNode.id, locationName, command);
        // Retracing an existing connection: record the return heading (bent-path detection)
        // and do NOT create a second opposite-orientation edge — keeps replay in parity with
        // live, where a there-and-back yields a single edge carrying both headings.
        recordReverseCommand(previousNode.id, locationName, command);
        if (!mapState.edges.has(edgeKey) && !mapState.edges.has(reverseKey)) {
          const connectionType = isGoToCommand(command) ? 'portal' : getConnectionTypeFromCommand(command);
          mapState.edges.set(edgeKey, {
            from: previousNode.id,
            to: locationName,
            command: command,
            connectionType: connectionType,
            isManual: false,
            isEdited: false
          });
          mapState.protectedEdges.add(edgeKey);
        }
      }
    }

    previousNode = currentNode;
  }

  // Retain the headings gathered during replay so live portal/unknown moves can still be
  // placed after the journey is cleared below. Only overwrite when this replay actually
  // produced directions, so a no-op resync doesn't wipe a previously retained heading.
  if (recentDirections.length > 0) {
    mapState.recentDirections = recentDirections.slice(-10);
  }

  // Set current location (last in journey)
  const currentLocation = getLastLocationName();
  if (currentLocation) {
    mapState.currentNodeId = currentLocation;
  }

  // Save map data, then clear journey only if save succeeded
  const saveSuccess = saveMapImmediately();
  if (saveSuccess) {
    // Clear journey after successful sync (journey transferred to map canvas!)
    clearJourney();
  }
}

/**
 * Save map data immediately (no debouncing)
 * Use for critical operations: delete, undo, hide map, clear
 * @returns {boolean} True if save succeeded, false otherwise
 */
function saveMapImmediately() {
  if (!mapState.gameName || !mapState.activeMapId) return false;
  try {
    _allMapsData[mapState.activeMapId] = extractMapData();
    const dataToSave = {
      v: 2,
      activeMapId: mapState.activeMapId,
      mapOrder: mapState.mapOrder,
      maps: _allMapsData
    };
    localStorage.setItem(`lantern_map_${mapState.gameName}`, JSON.stringify(dataToSave));
    updateMapBadge();
    return true;
  } catch (e) {
    console.error('Map save failed:', e);
    return false;
  }
}

/**
 * Save map data with debouncing (default 500ms)
 * Reduces localStorage writes during frequent operations (drag, edit, auto-map)
 * @param {boolean} immediate - If true, save immediately and cancel debounce
 */
export function saveMapForGame(immediate = false) {
  // Cancel pending save
  if (timers.saveTimer) {
    clearTimeout(timers.saveTimer);
    timers.saveTimer = null;
  }

  if (immediate) {
    // Save immediately (for critical operations)
    saveMapImmediately();
  } else {
    // Debounce save (for frequent operations)
    timers.saveTimer = setTimeout(() => {
      saveMapImmediately();
      timers.saveTimer = null;
    }, 500);
  }
}

/**
 * Flush any pending debounced map save immediately.
 * Called by autosave before reading map data from localStorage
 * to ensure the latest move is captured (avoids 500ms debounce race).
 */
export function flushMapSave() {
  if (timers.saveTimer) {
    clearTimeout(timers.saveTimer);
    timers.saveTimer = null;
    saveMapImmediately();
  }
}

/**
 * Export map canvas state in an optimized save format.
 * Flushes any pending debounced save before reading so the snapshot is current.
 * Returns null when no map data exists for this game (map was never opened).
 * @param {string} gameName
 * @returns {Object|null} Optimized map data ready for embedding in a save file
 */
function optimizeMapData(mapData) {
  const nodes = (mapData.nodes || []).map(node => {
    const opt = { id: node.id, name: node.name, x: node.x, y: node.y };
    if (node.type && node.type !== 'room') opt.type = node.type;
    if (node.notes && node.notes !== '') opt.notes = node.notes;
    if (node.isManual === true) opt.isManual = true;
    if (node.isEdited === true) opt.isEdited = true;
    if (node.isSmall === true) opt.isSmall = true;
    return opt;
  });
  const edges = (mapData.edges || []).map(edge => {
    const opt = { from: edge.from, to: edge.to, cmd: edge.command || edge.cmd };
    if (edge.connectionType && edge.connectionType !== 'cardinal') opt.connectionType = edge.connectionType;
    if (edge.reverseCommand) opt.reverseCommand = edge.reverseCommand;
    if (edge.isManual === true) opt.isManual = true;
    if (edge.isEdited === true) opt.isEdited = true;
    return opt;
  });
  const result = { nodes, edges, protectedNodes: mapData.protectedNodes || [], protectedEdges: mapData.protectedEdges || [] };
  if (mapData.deletedEdges?.length > 0) result.deletedEdges = mapData.deletedEdges;
  if (mapData.deletedNodes?.length > 0) result.deletedNodes = mapData.deletedNodes;
  if (mapData.viewport) result.viewport = mapData.viewport;
  if (mapData.currentNodeId) result.currentNodeId = mapData.currentNodeId;
  if (typeof mapData.autoMapEnabled === 'boolean') result.autoMapEnabled = mapData.autoMapEnabled;
  return result;
}

function expandMapData(opt) {
  const nodes = (opt.nodes || []).map(n => ({
    id: n.id, name: n.name, x: n.x, y: n.y,
    type: n.type || 'room', notes: n.notes || '',
    isManual: n.isManual || false, isEdited: n.isEdited || false, isSmall: n.isSmall || false
  }));
  const edges = (opt.edges || []).map(e => ({
    from: e.from, to: e.to, command: e.cmd || e.command,
    connectionType: e.connectionType || 'cardinal',
    ...(e.reverseCommand ? { reverseCommand: e.reverseCommand } : {}),
    isManual: e.isManual || false, isEdited: e.isEdited || false
  }));
  return {
    nodes, edges,
    protectedNodes: opt.protectedNodes || [], protectedEdges: opt.protectedEdges || [],
    deletedEdges: opt.deletedEdges || [], deletedNodes: opt.deletedNodes || [],
    viewport: opt.viewport || { x: 0, y: 0, scale: 1 },
    currentNodeId: opt.currentNodeId || null,
    autoMapEnabled: opt.autoMapEnabled !== undefined ? opt.autoMapEnabled : true
  };
}

export function exportMapState(gameName) {
  if (!gameName) return null;
  flushMapSave();

  const raw = localStorage.getItem(`lantern_map_${gameName}`);
  if (!raw) return null;

  let stored;
  try { stored = JSON.parse(raw); } catch { return null; }

  if (stored.v === 2 && stored.maps) {
    const optimizedMaps = {};
    for (const [mapId, data] of Object.entries(stored.maps)) {
      optimizedMaps[mapId] = optimizeMapData(data);
    }
    return { v: 2, activeMapId: stored.activeMapId, mapOrder: stored.mapOrder, maps: optimizedMaps };
  }

  // Migrate v1 — wrap as v2
  const mapId = 'map_1';
  return {
    v: 2, activeMapId: mapId,
    mapOrder: [{ id: mapId, name: 'Map 1' }],
    maps: { [mapId]: optimizeMapData(stored) }
  };
}

/**
 * Restore map state from exportMapState format into localStorage.
 * Does not update in-memory mapState — next loadMapForGame() call picks it up.
 */
export function importMapState(optimizedData, gameName) {
  if (!optimizedData || !gameName) return;

  let v2;
  if (optimizedData.v === 2 && optimizedData.maps) {
    const maps = {};
    for (const [mapId, data] of Object.entries(optimizedData.maps)) {
      maps[mapId] = expandMapData(data);
    }
    v2 = { v: 2, activeMapId: optimizedData.activeMapId, mapOrder: optimizedData.mapOrder, maps };
  } else {
    // Migrate v1
    const mapId = 'map_1';
    v2 = { v: 2, activeMapId: mapId, mapOrder: [{ id: mapId, name: 'Map 1' }], maps: { [mapId]: expandMapData(optimizedData) } };
  }

  localStorage.setItem(`lantern_map_${gameName}`, JSON.stringify(v2));
}

function resetMap() {
  clearActiveMapData();
  const mapId = 'map_1';
  mapState.activeMapId = mapId;
  mapState.mapOrder = [{ id: mapId, name: 'Map 1' }];
  _allMapsData = {};
}

// ============================================================================
// ANOMALY DETECTION
// ============================================================================

/**
 * Detect map anomalies that need user review.
 * Returns the count of anomalies found.
 */
function detectAnomalies() {
  let count = 0;

  for (const node of mapState.nodes.values()) {
    if (node.isDuplicate) count++;
  }

  for (const edge of mapState.edges.values()) {
    if (!mapState.nodes.has(edge.from) || !mapState.nodes.has(edge.to)) count++;
  }

  return count;
}

/**
 * Update the anomaly warning badge on map trigger buttons.
 * Shows an amber dot when anomalies exist, removes it when none.
 */
function updateMapBadge() {
  const count = detectAnomalies();
  const buttons = [
    document.getElementById('quickMenuMapBtn')
  ];

  for (const btn of buttons) {
    if (!btn) continue;
    let badge = btn.querySelector('.map-anomaly-badge');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'map-anomaly-badge';
        badge.setAttribute('aria-hidden', 'true');
        btn.appendChild(badge);
      }
      badge.title = `${count} map anomal${count === 1 ? 'y' : 'ies'} — open map to review`;
    } else if (badge) {
      badge.remove();
    }
  }
}

// ============================================================================
// UNDO SYSTEM
// ============================================================================

function updateUndoButton() {
  const undoBtn = document.getElementById('mapUndoBtn');
  if (undoBtn) undoBtn.disabled = mapState.undoStack.length === 0;
  const redoBtn = document.getElementById('mapRedoBtn');
  if (redoBtn) redoBtn.disabled = mapState.redoStack.length === 0;
}

const MAX_UNDO = 50;  // Stack depth limit

/**
 * Discard all undo/redo history.
 *
 * Snapshots are whole-map captures, so restoring one reverts EVERYTHING that
 * changed since it was taken. That is fine for user edits (the only mutations
 * the undo system manages), but the auto-mapper mutates the same collections
 * outside the snapshot system as the player moves. If an undo snapshot predates
 * an auto-mapped node, restoring it would silently wipe that node. So whenever
 * auto-mapping changes the map, we drop the now-unsafe history rather than risk
 * clobbering gameplay-created rooms on a later undo. No-op (and free) when the
 * stacks are already empty, which is the case during normal play with no pending
 * edits.
 */
function invalidateUndoHistory() {
  if (mapState.undoStack.length === 0 && mapState.redoStack.length === 0) return;
  mapState.undoStack = [];
  mapState.redoStack = [];
  updateUndoButton();
}

/**
 * Build a full snapshot of the mutable map collections (does not push it anywhere).
 *
 * Node/edge values are plain objects with only primitive fields, so a shallow
 * `{...v}` clone per value is enough; the live objects are mutated in place
 * elsewhere, so we must clone (not alias) them here. Sets hold string ids/keys,
 * so `new Set(...)` copies suffice. Snapshots live in memory only —
 * `saveMapForGame` never serializes the undo/redo stacks.
 */
function captureSnapshot() {
  return {
    nodes: new Map(Array.from(mapState.nodes, ([k, v]) => [k, { ...v }])),
    edges: new Map(Array.from(mapState.edges, ([k, v]) => [k, { ...v }])),
    protectedNodes: new Set(mapState.protectedNodes),
    protectedEdges: new Set(mapState.protectedEdges),
    deletedNodes: new Set(mapState.deletedNodes),
    deletedEdges: new Set(mapState.deletedEdges),
    selectedNode: mapState.selectedNode
  };
}

/**
 * Swap the snapshotted collections in wholesale. Nothing aliases these containers
 * (all access is via mapState.<collection>), so reassignment is safe.
 */
function restoreSnapshot(snapshot) {
  mapState.nodes = snapshot.nodes;
  mapState.edges = snapshot.edges;
  mapState.protectedNodes = snapshot.protectedNodes;
  mapState.protectedEdges = snapshot.protectedEdges;
  mapState.deletedNodes = snapshot.deletedNodes;
  mapState.deletedEdges = snapshot.deletedEdges;
  mapState.selectedNode = snapshot.selectedNode;
}

/**
 * Push an already-captured snapshot onto the undo stack as a new edit, and clear
 * the redo future (a new edit branches off it). Split out from snapshotForUndo so
 * the node-drag handler can capture a pending snapshot on the first movement but
 * only commit it on pointer-up if the node actually moved — a drag that returns
 * to its origin commits nothing, leaving the undo/redo stacks untouched.
 */
function commitUndoSnapshot(snapshot) {
  mapState.undoStack.push(snapshot);
  if (mapState.undoStack.length > MAX_UNDO) mapState.undoStack.shift();
  mapState.redoStack = [];  // New edit branches off; redo history no longer valid
  mapState.hasUnsavedChanges = true;  // Mark that user has made changes
  updateUndoButton();
}

/**
 * Snapshot the current state for undo, BEFORE a user edit mutates it.
 *
 * Snapshot-based (not delta-based) by design: undo/redo just restore whole
 * snapshots, so new map operations are undoable for free — no per-operation
 * inverse logic. Call exactly once per logical operation, before the first
 * mutation, so the stack stays in LIFO order with other operations (see
 * map-sheet.js edit handlers, which snapshot lazily on the first change of an
 * edit session).
 */
export function snapshotForUndo() {
  commitUndoSnapshot(captureSnapshot());
}

// Shared tail for undo/redo: mark dirty, refresh UI, persist the restored state.
function finishRestore() {
  mapState.hasUnsavedChanges = true;
  updateUndoButton();
  updateNodeCount();
  render();
  saveMapForGame(true);  // Immediate save for undo/redo operations
}

function performUndo() {
  if (mapState.undoStack.length === 0) return;
  mapState.redoStack.push(captureSnapshot());  // Save current state so redo can return to it
  if (mapState.redoStack.length > MAX_UNDO) mapState.redoStack.shift();
  restoreSnapshot(mapState.undoStack.pop());
  finishRestore();
}

function performRedo() {
  if (mapState.redoStack.length === 0) return;
  mapState.undoStack.push(captureSnapshot());  // Save current state so undo can return to it
  if (mapState.undoStack.length > MAX_UNDO) mapState.undoStack.shift();
  restoreSnapshot(mapState.redoStack.pop());
  finishRestore();
}

/**
 * Sync map canvas from auto-mapper (for save operations)
 * Updates the map canvas in localStorage without loading the full UI
 * @param {string} gameName - Name of the current game
 */
export async function syncMapFromAutoMapper(gameName) {
  if (!gameName) return;

  // Get auto-mapper data
  const { getMapData } = await import('./auto-mapper.js');
  const autoMapperData = getMapData();

  if (!autoMapperData || !autoMapperData.journey || autoMapperData.journey.length === 0) {
    return; // No auto-mapper data to sync
  }

  // Load existing map canvas from localStorage
  const mapKey = `lantern_map_${gameName}`;
  const existing = localStorage.getItem(mapKey);
  if (!existing) {
    return; // No map canvas to update
  }

  let mapData;
  try { mapData = JSON.parse(existing); } catch { return; }
  const existingNodes = new Map(mapData.nodes.map(n => [n.id, n]));
  const existingEdges = new Map(mapData.edges.map(e => [e.from + '-' + e.to, e]));

  // Track what we've added
  let addedNodes = 0;
  let addedEdges = 0;

  // Replay journey to add missing nodes/edges
  let previousLocation = null;
  for (const visit of autoMapperData.journey) {
    const locationName = visit.locationName;

    // Skip deleted nodes
    if (mapData.deletedNodes && mapData.deletedNodes.includes(locationName)) {
      previousLocation = locationName;
      continue;
    }

    // Add node if missing
    if (!existingNodes.has(locationName)) {
      // Auto-layout new node (simple positioning)
      const x = existingNodes.size * 100;
      const y = 0;

      mapData.nodes.push({
        id: locationName,
        name: locationName,
        x, y,
        type: 'room',
        notes: '',
        isManual: false,
        isEdited: false,
        isSmall: false
      });

      existingNodes.set(locationName, true);
      addedNodes++;

      // Mark as protected (from auto-mapper)
      if (!mapData.protectedNodes) mapData.protectedNodes = [];
      if (!mapData.protectedNodes.includes(locationName)) {
        mapData.protectedNodes.push(locationName);
      }
    }

    // Add edge if missing
    if (previousLocation && previousLocation !== locationName) {
      const edgeKey = previousLocation + '-' + locationName;
      const deletedEdgeKey = `${previousLocation}-${locationName}`;
      const isDeleted = mapData.deletedEdges && mapData.deletedEdges.includes(deletedEdgeKey);

      if (!existingEdges.has(edgeKey) && !isDeleted) {
        mapData.edges.push({
          from: previousLocation,
          to: locationName,
          command: visit.command || '',
          connectionType: 'cardinal',
          isManual: false,
          isEdited: false
        });

        existingEdges.set(edgeKey, true);
        addedEdges++;

        // Mark edge as protected
        if (!mapData.protectedEdges) mapData.protectedEdges = [];
        if (!mapData.protectedEdges.includes(deletedEdgeKey)) {
          mapData.protectedEdges.push(deletedEdgeKey);
        }
      }
    }

    previousLocation = locationName;
  }

  // Update current node if changed
  if (autoMapperData.journey.length > 0) {
    const lastVisit = autoMapperData.journey[autoMapperData.journey.length - 1];
    mapData.currentNodeId = lastVisit.locationName;
  }

  // Save updated map canvas back to localStorage
  if (addedNodes > 0 || addedEdges > 0) {
    localStorage.setItem(mapKey, JSON.stringify(mapData));
  }
}

// Debug exports
window.showMap = showMap;
window.hideMap = hideMap;
window.toggleMap = toggleMap;
window.getMapState = () => mapState;
