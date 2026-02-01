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

import { getCurrentLocation, getLastLocationName, getMapData, clearJourney } from './auto-mapper.js';
import {
  mapState, canvas, ctx, container, domRefs, isVisible, timers,
  setCanvas, setCtx, setContainer, setIsVisible, setDomRefs,
  DIRECTION_OFFSETS, COMMAND_DIRECTIONS, DIRECTION_TO_TYPE, NODE_RADIUS, FIRST_USE_KEY,
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
  createNodeEditSheet, openNodeSheet, closeNodeSheet,
  handleNodeNameChange, handleNodeNotesChange, handleNodeTypeChange, handleNodeSmallToggle,
  handleNodeDelete, startConnectionFromSheet, startMergeFromSheet, setSheetCallbacks, handleNodeMerge, handleNodeNotDuplicate,
  setupSheetDragHandlers
} from './map-sheet.js';

// ============================================================================
// INITIALIZATION
// ============================================================================

// Store resize state for cleanup
let resizeState = null;

export function initMapCanvas() {
  createMapUI();
  setupEventListeners();
  setupCallbacks();
  setupToastSystem();
  window.addEventListener('locationChanged', handleLocationChange);
  window.addEventListener('gameLoaded', handleGameLoaded);

  // If game already loaded before map module initialized, load map data now
  if (window._inGame) {
    const gameName = localStorage.getItem('iftalk_last_game')?.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase();
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
    pushUndo
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
          <span class="map-title-text">Game Map</span>
          <span class="map-node-count" id="mapNodeCount"></span>
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
          <button class="map-btn" id="mapClearBtn" title="Clear map" aria-label="Clear map">
            <span class="material-icons">delete_sweep</span>
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
          <button class="map-fab map-fab-center" id="mapCenterBtn" title="Center on current location" aria-label="Center on current location">
            <span class="material-icons">my_location</span>
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
  document.getElementById('mapClearBtn').addEventListener('click', clearMapWithConfirm);

  // FAB & Mode
  document.getElementById('mapAddNodeBtn').addEventListener('click', enterAddNodeMode);
  document.getElementById('mapAddEdgeBtn').addEventListener('click', enterAddEdgeMode);
  document.getElementById('mapCenterBtn').addEventListener('click', centerOnCurrentLocation);
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

  // Global
  window.addEventListener('resize', resizeCanvas);
  document.addEventListener('keydown', handleKeyDown);

  // Visual viewport resize (keyboard open/close detection)
  if (window.visualViewport) {
    let lastHeight = window.visualViewport.height;
    let recenterTimer = null;
    window.visualViewport.addEventListener('resize', () => {
      const currentHeight = window.visualViewport.height;

      // Adjust node edit sheet height to fit within visible viewport
      const nodeSheet = document.getElementById('nodeEditSheet');
      if (nodeSheet && !nodeSheet.classList.contains('hidden')) {
        // Use visual viewport height to constrain sheet (leave 80px margin at top)
        const topGap = 80;
        const maxSheetHeight = Math.max(currentHeight - topGap, 300); // Min 300px for usability
        nodeSheet.style.maxHeight = `${maxSheetHeight}px`;

        // Note: sheet-content uses flexbox and will size automatically

        // Ensure focused input is visible after keyboard appears
        requestAnimationFrame(() => {
          const focusedElement = document.activeElement;
          if (focusedElement && (focusedElement.tagName === 'INPUT' || focusedElement.tagName === 'TEXTAREA')) {
            // Check if focused element is inside the sheet
            if (nodeSheet.contains(focusedElement)) {
              // Scroll within the sheet-content only, not the whole viewport
              const sheetContent = nodeSheet.querySelector('.sheet-content');
              if (sheetContent) {
                const inputRect = focusedElement.getBoundingClientRect();
                const contentRect = sheetContent.getBoundingClientRect();

                // Only scroll if input is below the visible area
                if (inputRect.bottom > contentRect.bottom - 20) {
                  const scrollOffset = inputRect.bottom - contentRect.bottom + 60; // Add 60px padding
                  sheetContent.scrollBy({ top: scrollOffset, behavior: 'smooth' });
                }
              }
            }
          }
        });
      }

      // Hide toolbar and FAB buttons when keyboard is up (to maximize canvas space)
      updateUIVisibilityForKeyboard();

      // Only recenter if map is visible and height changed significantly (keyboard appearing/disappearing)
      if (isVisible && Math.abs(currentHeight - lastHeight) > 100) {
        // Delay recentering to wait for keyboard animation and scroll settling (150-200ms)
        clearTimeout(recenterTimer);
        recenterTimer = setTimeout(() => {
          centerOnCurrentLocation();
        }, 200);
      }
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
      localStorage.setItem('iftalk_map_left_percent', leftPercent.toString());
    } catch (e) {
      console.warn('Failed to save map panel position:', e);
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
    const savedLeftPercent = localStorage.getItem('iftalk_map_left_percent');
    if (savedLeftPercent) {
      const leftPercent = parseFloat(savedLeftPercent);
      const minLeft = getMinLeftPercent();
      if (leftPercent >= minLeft && leftPercent <= RESIZE_CONFIG.MAX_LEFT_PERCENT) {
        panel.style.left = `${leftPercent}%`;
      }
    }
  } catch (e) {
    console.warn('Failed to restore map panel position:', e);
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
    // Actively check the status bar for current location (don't just rely on cached lastLocationName)
    const statusBarEl = document.getElementById('statusBar');
    const statusText = statusBarEl?.textContent?.trim();

    let currentLocationName = getLastLocationName();

    // If we have status bar text, try to extract the current location from it
    if (statusText && statusText.length > 0) {
      const location = window.getCurrentLocation ? window.getCurrentLocation(statusText) : null;
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
        isEdited: false
      });
      mapState.protectedNodes.add(currentLocationName);
      mapState.currentNodeId = currentLocationName;
      mapState.selectedNode = currentLocationName;
      render();
      centerOnCurrentLocation();
    }
  }

  saveMapForGame();
}

function clearMapWithConfirm() {
  if (mapState.nodes.size === 0) {
    showHint('Map is already empty');
    return;
  }
  if (confirm('Clear entire map? This cannot be undone.')) {
    // Clear any visible toasts (without marking as dismissed)
    clearAllToasts();
    resetMap();
    saveMapForGame(true);  // Immediate save for critical operation
    render();
    showHint('Map cleared');
  }
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
  mapState.isMerging = false;
  mapState.mergeSourceNode = null;
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
          Math.abs(expectedPos.x - existingNode.x) <= 120 &&
          Math.abs(expectedPos.y - existingNode.y) <= 120;

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
  if (!existingNode) {
    const direction = command ? getDirectionFromCommand(command) : null;
    const parentNode = previousLocationId ? mapState.nodes.get(previousLocationId) : null;
    let position = { x: 0, y: 0 };

    if (parentNode && direction && DIRECTION_OFFSETS[direction]) {
      // Known direction - use directional offset
      const offset = DIRECTION_OFFSETS[direction];
      position = findAvailablePosition({ x: parentNode.x + offset.x, y: parentNode.y + offset.y });
    } else if (parentNode) {
      // Unknown direction - use last known direction, or portal offset as fallback
      const lastDir = getLastDirectionFromHistory();
      const offset = (lastDir && DIRECTION_OFFSETS[lastDir]) ? DIRECTION_OFFSETS[lastDir] : DIRECTION_OFFSETS['enter'];
      position = findAvailablePosition({ x: parentNode.x + offset.x, y: parentNode.y + offset.y });
    } else if (mapState.nodes.size > 0) {
      // No parent node - place near origin
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
 * Get the most recent cardinal direction from command history.
 * @returns {string|null} Most recent direction, or null if none found
 */
function getLastDirectionFromHistory() {
  const mapData = getMapData();
  if (!mapData.journey || mapData.journey.length === 0) return null;

  // Search backwards for most recent directional command
  for (let i = mapData.journey.length - 1; i >= 0; i--) {
    const dir = getDirectionFromCommand(mapData.journey[i].command);
    if (dir) return dir;
  }
  return null;
}

/**
 * Find an available position near the preferred location
 * Uses spiral search pattern with limited iterations for performance
 * @param {Object} preferred - Preferred {x, y} position
 * @returns {Object} Available {x, y} position
 */
function findAvailablePosition(preferred) {
  const MIN_DISTANCE = NODE_RADIUS * 3;

  // Quick check: is preferred position already free?
  const hasCollision = [...mapState.nodes.values()].some(n =>
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
      const angle = i * angleStep;
      const candidate = {
        x: preferred.x + Math.cos(angle) * radius,
        y: preferred.y + Math.sin(angle) * radius
      };

      // Check if this position is valid (no collisions)
      const valid = ![...mapState.nodes.values()].some(n =>
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

  const id = `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const position = findAvailablePosition({ x, y });
  const node = { id, name: 'New Location', x: position.x, y: position.y, type: 'room', notes: '', isManual: true, isEdited: false };
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

function updateNodeCount() {
  const el = document.getElementById('mapNodeCount');
  if (el) el.textContent = mapState.nodes.size > 0 ? `${mapState.nodes.size} location${mapState.nodes.size !== 1 ? 's' : ''}` : '';
}

// ============================================================================
// TOAST NOTIFICATION SYSTEM
// ============================================================================

const TOAST_STORAGE_KEY = 'iftalk_map_toasts_dismissed';
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

  // Determine if this is the last toast (5/5)
  const isLastToast = index && index.includes('5/5');
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
function cancelOnboarding(currentToast) {
  // Clear the queue
  toastQueue = [];

  // Mark all onboarding toasts as dismissed
  const onboardingIds = ['map-intro-1', 'map-intro-2', 'map-intro-3', 'map-intro-4', 'map-intro-5'];
  const dismissed = getDismissedToasts();
  onboardingIds.forEach(id => {
    if (!dismissed.includes(id)) {
      dismissed.push(id);
    }
  });
  localStorage.setItem(TOAST_STORAGE_KEY, JSON.stringify(dismissed));

  // Hide current toast
  hideToast(currentToast);

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
    const onboardingIds = ['map-intro-1', 'map-intro-2', 'map-intro-3', 'map-intro-4', 'map-intro-5'];
    const allDismissed = onboardingIds.every(id => dismissed.includes(id));

    if (allDismissed && !dismissed.includes('dont-show-onboarding')) {
      // Show "don't show again" option after all toasts dismissed
      setTimeout(() => showDontShowAgainToast(), 1000);
    }
  } catch (e) {
    console.warn('Failed to save toast dismissal:', e);
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
      index: '5/5'
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
  const isKeyboardUp = currentHeight < window.innerHeight - 100;

  if (fabContainer) {
    fabContainer.style.display = isKeyboardUp ? 'none' : '';
  }
  if (toolbar) {
    toolbar.style.display = isKeyboardUp ? 'none' : '';
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

  resizeCanvas(); updateNodeCount(); centerOnCurrentLocation();
  showOnboardingOrHint();

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
  // Clear any visible toasts (without marking as dismissed)
  clearAllToasts();
  exitAddMode();

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

export function centerOnCurrentLocation() {
  // Use last known location name (from status bar tracking)
  const currentName = getLastLocationName();
  let target = currentName ? mapState.nodes.get(currentName) : null;
  if (!target && mapState.nodes.size > 0) target = mapState.nodes.values().next().value;
  if (target) {
    const canvasHeight = canvas.height / window.devicePixelRatio;

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

      mapState.viewport.x = -target.x * mapState.viewport.scale;
      mapState.viewport.y = -target.y * mapState.viewport.scale + verticalOffset;
    } else {
      // No visual viewport API - just center normally
      mapState.viewport.x = -target.x * mapState.viewport.scale;
      mapState.viewport.y = -target.y * mapState.viewport.scale;
    }

    // Only update selectedNode if the node edit sheet is not open
    // This prevents overriding the user's selection when keyboard opens
    const nodeSheet = document.getElementById('nodeEditSheet');
    if (!nodeSheet || nodeSheet.classList.contains('hidden')) {
      mapState.selectedNode = target.id;
    }
    render();
  }
}

// ============================================================================
// PERSISTENCE
// ============================================================================

function loadMapForGame(gameName) {
  mapState.gameName = gameName;
  // Always reset undo stack, selection, and unsaved changes when loading a game
  mapState.undoStack = [];
  mapState.selectedNode = null;
  mapState.hasUnsavedChanges = false;
  updateUndoButton();

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
    } catch (e) { resetMap(); }
  } else { resetMap(); }

  // Sync any locations tracked by auto-mapper that aren't in the map yet
  syncFromAutoMapper();

  updateNodeCount();
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

  // Direction offsets for spatial positioning (120px grid)
  const directionOffsets = {
    // Cardinal
    'n': { x: 0, y: -120 }, 'north': { x: 0, y: -120 },
    's': { x: 0, y: 120 }, 'south': { x: 0, y: 120 },
    'e': { x: 120, y: 0 }, 'east': { x: 120, y: 0 },
    'w': { x: -120, y: 0 }, 'west': { x: -120, y: 0 },
    // Diagonals
    'ne': { x: 120, y: -120 }, 'northeast': { x: 120, y: -120 },
    'nw': { x: -120, y: -120 }, 'northwest': { x: -120, y: -120 },
    'se': { x: 120, y: 120 }, 'southeast': { x: 120, y: 120 },
    'sw': { x: -120, y: 120 }, 'southwest': { x: -120, y: 120 },
    // Vertical (1.5x N/S distance = 180px, offset by half E/W = 60px for clarity)
    'u': { x: 60, y: -180 }, 'up': { x: 60, y: -180 },
    'd': { x: -60, y: 180 }, 'down': { x: -60, y: 180 }
    // Portal commands (in, out, enter, exit) use recent directional command or 'up' fallback
  };

  // Replay journey to create nodes/edges with proper positions
  let previousNode = null;
  const recentDirections = []; // Track last 10 directional commands (excluding portals)

  // Directional commands that have spatial meaning
  const directionalCommands = ['n', 'north', 's', 'south', 'e', 'east', 'w', 'west',
    'ne', 'northeast', 'nw', 'northwest', 'se', 'southeast', 'sw', 'southwest',
    'u', 'up', 'd', 'down'];

  // Portal commands that use recent direction for placement
  const portalCommands = ['in', 'out', 'enter', 'exit'];

  for (const visit of autoMapperData.journey) {
    const locationName = visit.locationName;

    // Skip if location was deleted by user
    if (mapState.deletedNodes.has(locationName)) {
      // Update previousNode for edge creation even if deleted
      previousNode = mapState.nodes.get(locationName) || { id: locationName, x: 0, y: 0 };
      continue;
    }

    // Check if node already exists
    let currentNode = mapState.nodes.get(locationName);

    if (!currentNode) {
      // Calculate position from direction command
      let x = 0, y = 0;
      if (previousNode && visit.command) {
        const cmd = visit.command.toLowerCase();

        // Portal commands use most recent directional command
        if (portalCommands.includes(cmd)) {
          const fallbackDirection = recentDirections.length > 0
            ? recentDirections[recentDirections.length - 1]  // Most recent from last 10
            : 'up';  // Default to "up" if no recent directions
          const fallbackOffset = directionOffsets[fallbackDirection];
          x = previousNode.x + fallbackOffset.x;
          y = previousNode.y + fallbackOffset.y;
        } else {
          const offset = directionOffsets[cmd];

          if (offset) {
            // Known directional command - use it
            x = previousNode.x + offset.x;
            y = previousNode.y + offset.y;

            // Track directional commands (not portals) for fallback
            if (directionalCommands.includes(cmd)) {
              recentDirections.push(cmd);
              if (recentDirections.length > 10) recentDirections.shift();
            }
          } else {
            // Unknown command - use most recent direction from last 10, or "up" as fallback
            const fallbackDirection = recentDirections.length > 0
              ? recentDirections[recentDirections.length - 1]  // Most recent
              : 'up';
            const fallbackOffset = directionOffsets[fallbackDirection];
            x = previousNode.x + fallbackOffset.x;
            y = previousNode.y + fallbackOffset.y;
          }
        }
      } else if (previousNode) {
        // No command - use "up" as default
        x = previousNode.x + directionOffsets['up'].x;
        y = previousNode.y + directionOffsets['up'].y;
      }
      // else: first node stays at (0, 0)

      // Create new node with spatial position
      currentNode = {
        id: locationName,
        name: locationName,
        x: x,
        y: y,
        type: 'room',
        notes: '',
        isManual: false,
        isEdited: false
      };

      mapState.nodes.set(locationName, currentNode);
      mapState.protectedNodes.add(locationName);
    }

    // Create edge from previous to current
    if (previousNode && previousNode.id !== locationName) {
      const edgeKey = `${previousNode.id}-${locationName}`;

      // Skip if edge was deleted by user or already exists
      if (!mapState.deletedEdges.has(edgeKey) && !mapState.edges.has(edgeKey)) {
        const command = visit.command || '';

        // Determine connection type from command
        let connectionType = 'cardinal';
        const cmd = command.toLowerCase();
        if (cmd === 'up' || cmd === 'down' || cmd === 'u' || cmd === 'd') {
          connectionType = 'vertical';
        } else if (cmd === 'in' || cmd === 'out' || cmd === 'enter' || cmd === 'exit') {
          connectionType = 'portal';
        }

        const newEdge = {
          from: previousNode.id,
          to: locationName,
          command: command,
          connectionType: connectionType,
          isManual: false,
          isEdited: false
        };

        mapState.edges.set(edgeKey, newEdge);
        mapState.protectedEdges.add(edgeKey);
      }
    }

    previousNode = currentNode;
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
  if (!mapState.gameName) return false;
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
    return true;
  } catch (e) {
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

function resetMap() {
  mapState.nodes = new Map(); mapState.edges = new Map();
  mapState.protectedNodes = new Set(); mapState.protectedEdges = new Set();
  mapState.deletedEdges = new Set(); mapState.deletedNodes = new Set();
  mapState.viewport = { x: 0, y: 0, scale: 1 };
  mapState.selectedNode = null; mapState.currentNodeId = null;
  // Check for user's default preference (only used for new games without saved map data)
  const automapPref = localStorage.getItem('iftalk_automap_default');
  mapState.autoMapEnabled = automapPref !== null ? automapPref === 'true' : true; // Default: enabled
  mapState.undoStack = [];
  mapState.hasUnsavedChanges = false;
  updateUndoButton();
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
  mapState.hasUnsavedChanges = true;  // Mark that user has made changes
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
      if (node) {
        node.x = action.oldX;
        node.y = action.oldY;
        node.isEdited = action.wasEdited || false;
        if (!node.isEdited) mapState.protectedNodes.delete(action.nodeId);
      }
      break;
    case 'editNode':
      const editedNode = mapState.nodes.get(action.nodeId);
      if (editedNode) {
        editedNode.name = action.oldName;
        editedNode.notes = action.oldNotes;
        editedNode.type = action.oldType;
        editedNode.isSmall = action.oldIsSmall;
        editedNode.isEdited = action.wasEdited;
        if (!editedNode.isEdited) mapState.protectedNodes.delete(action.nodeId);
      }
      break;
  }

  updateUndoButton();
  updateNodeCount();
  render();
  saveMapForGame(true);  // Immediate save for undo operations
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
  const mapKey = `iftalk_map_${gameName}`;
  const existing = localStorage.getItem(mapKey);
  if (!existing) {
    return; // No map canvas to update
  }

  const mapData = JSON.parse(existing);
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
        isEdited: false
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
