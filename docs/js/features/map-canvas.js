/**
 * Map Canvas - Interactive Game Map with Auto-Mapping
 *
 * UX Principles:
 * - User intent always wins - auto-mapping never overrides user edits
 * - Auto-map is additive, not authoritative - only adds, never modifies
 * - Predictability over cleverness - same actions produce same results
 * - Trust is more important than correctness - prefer duplicates over wrong merges
 * - Never surprise the user - deleted edges stay deleted, moved nodes stay moved
 * - Visual clarity beats map accuracy - it's a thinking aid, not a GPS
 * - Auto vs user-created is visible but subtle - dotted outlines for user items
 */

import { getMapData, getCurrentLocation } from './auto-mapper.js';

// Direction offsets for node placement
const DIRECTION_OFFSETS = {
  north: { x: 0, y: -100 },
  south: { x: 0, y: 100 },
  east: { x: 100, y: 0 },
  west: { x: -100, y: 0 },
  northeast: { x: 70, y: -70 },
  northwest: { x: -70, y: -70 },
  southeast: { x: 70, y: 70 },
  southwest: { x: -70, y: 70 },
  up: { x: 0, y: -50 },
  down: { x: 0, y: 50 },
  enter: { x: 60, y: 0 },
  exit: { x: -60, y: 0 },
  'in': { x: 60, y: 0 },
  out: { x: -60, y: 0 }
};

// Command to direction mapping
const COMMAND_DIRECTIONS = {
  'n': 'north', 'north': 'north',
  's': 'south', 'south': 'south',
  'e': 'east', 'east': 'east',
  'w': 'west', 'west': 'west',
  'ne': 'northeast', 'northeast': 'northeast',
  'nw': 'northwest', 'northwest': 'northwest',
  'se': 'southeast', 'southeast': 'southeast',
  'sw': 'southwest', 'southwest': 'southwest',
  'u': 'up', 'up': 'up',
  'd': 'down', 'down': 'down',
  'enter': 'enter', 'go in': 'enter', 'in': 'enter',
  'exit': 'exit', 'go out': 'exit', 'out': 'exit'
};

// Node type icons (Material Icons)
const NODE_ICONS = {
  room: 'home',
  outdoor: 'park',
  shop: 'store',
  danger: 'warning',
  npc: 'person',
  item: 'inventory_2',
  locked: 'lock',
  custom: 'place'
};

// Node colors
const NODE_COLORS = {
  auto: '#3b82f6',      // Blue - auto-created
  user: '#8b5cf6',      // Purple - user-created/edited
  current: '#22c55e'    // Green - current location
};

// Constants
const NODE_RADIUS = 28;
const TOUCH_TARGET = 44;  // Minimum touch target size (iOS HIG)
const LONG_PRESS_DURATION = 400;
const DOUBLE_TAP_DELAY = 300;

// Map state
let mapState = {
  gameName: null,
  nodes: new Map(),           // nodeId -> node object
  edges: new Map(),           // edgeKey -> edge object
  protectedNodes: new Set(),  // Node IDs that user has edited (won't be auto-modified)
  protectedEdges: new Set(),  // Edge keys that user has edited
  deletedEdges: new Set(),    // Edge keys that user has deleted (won't be recreated)
  deletedNodes: new Set(),    // Node IDs that user has deleted
  viewport: { x: 0, y: 0, scale: 1 },
  selectedNode: null,
  autoMapEnabled: true,
  // Interaction state
  isDragging: false,
  dragStart: null,
  dragNode: null,
  isCreatingEdge: false,
  edgeStartNode: null,
  currentPointer: null,       // Track current pointer position for edge preview
  isAddingNode: false,        // FAB add mode active
  lastTapTime: 0,
  lastTapPosition: null
};

// Canvas elements
let canvas = null;
let ctx = null;
let container = null;
let isVisible = false;

// Touch handling
let lastTouchDistance = 0;
let lastTouchCenter = { x: 0, y: 0 };
let touchStartTime = 0;
let longPressTimer = null;
let longPressTriggered = false;

/**
 * Initialize the map canvas
 */
export function initMapCanvas() {
  createMapUI();
  setupEventListeners();

  // Listen for location changes from auto-mapper
  window.addEventListener('locationChanged', handleLocationChange);

  // Listen for game load events
  window.addEventListener('gameLoaded', handleGameLoaded);

  console.log('[MapCanvas] Initialized');
}

/**
 * Create the map UI elements
 */
function createMapUI() {
  // Create overlay container
  container = document.createElement('div');
  container.id = 'mapCanvasOverlay';
  container.className = 'map-canvas-overlay hidden';
  container.innerHTML = `
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

      <!-- Floating Action Buttons -->
      <div class="map-fab-container">
        <button class="map-fab map-fab-secondary" id="mapAddEdgeBtn" title="Add connection" aria-label="Add connection">
          <span class="material-icons">timeline</span>
        </button>
        <button class="map-fab map-fab-primary" id="mapAddNodeBtn" title="Add location" aria-label="Add location">
          <span class="material-icons">add_location</span>
        </button>
      </div>

      <!-- Legend -->
      <div class="map-legend" id="mapLegend">
        <div class="legend-item">
          <span class="legend-dot legend-auto"></span>
          <span>Auto-mapped</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot legend-user"></span>
          <span>Your edits</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot legend-current"></span>
          <span>Current</span>
        </div>
      </div>
    </div>

    <!-- Hint Toast -->
    <div class="map-hint hidden" id="mapHint"></div>

    <!-- Add Node Mode Indicator -->
    <div class="map-mode-indicator hidden" id="mapModeIndicator">
      <span class="material-icons">touch_app</span>
      <span>Tap to add location</span>
      <button class="mode-cancel-btn" id="modeCancelBtn">Cancel</button>
    </div>
  `;

  document.body.appendChild(container);

  // Get canvas reference
  canvas = document.getElementById('mapCanvas');
  ctx = canvas.getContext('2d');

  // Set up canvas size
  resizeCanvas();

  // Create bottom sheet for node editing
  createNodeEditSheet();

  // Create context menu for canvas
  createContextMenu();
}

/**
 * Create the node edit bottom sheet
 */
function createNodeEditSheet() {
  const sheet = document.createElement('div');
  sheet.id = 'nodeEditSheet';
  sheet.className = 'node-edit-sheet hidden';
  sheet.innerHTML = `
    <div class="sheet-handle" aria-hidden="true"></div>
    <div class="sheet-content">
      <div class="sheet-header">
        <div class="sheet-header-left">
          <span class="sheet-node-badge" id="sheetNodeBadge">Auto</span>
          <h3 id="sheetNodeName">Edit Location</h3>
        </div>
        <button class="sheet-close-btn" id="sheetCloseBtn" aria-label="Close">
          <span class="material-icons">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="sheet-field">
          <label for="nodeNameInput">Name</label>
          <input type="text" id="nodeNameInput" placeholder="Location name" autocomplete="off">
        </div>
        <div class="sheet-field">
          <label for="nodeNotesInput">Notes</label>
          <textarea id="nodeNotesInput" placeholder="Add notes about this location..." rows="3"></textarea>
        </div>
        <div class="sheet-field">
          <label>Type</label>
          <div class="node-type-picker" id="nodeTypePicker" role="radiogroup" aria-label="Location type">
            <button class="type-btn" data-type="room" aria-label="Room" role="radio">
              <span class="material-icons">home</span>
            </button>
            <button class="type-btn" data-type="outdoor" aria-label="Outdoor" role="radio">
              <span class="material-icons">park</span>
            </button>
            <button class="type-btn" data-type="shop" aria-label="Shop" role="radio">
              <span class="material-icons">store</span>
            </button>
            <button class="type-btn" data-type="danger" aria-label="Danger" role="radio">
              <span class="material-icons">warning</span>
            </button>
            <button class="type-btn" data-type="npc" aria-label="NPC" role="radio">
              <span class="material-icons">person</span>
            </button>
            <button class="type-btn" data-type="item" aria-label="Item" role="radio">
              <span class="material-icons">inventory_2</span>
            </button>
            <button class="type-btn" data-type="locked" aria-label="Locked" role="radio">
              <span class="material-icons">lock</span>
            </button>
          </div>
        </div>

        <!-- Connections section -->
        <div class="sheet-field" id="nodeConnectionsField">
          <label>Connections</label>
          <div class="node-connections-list" id="nodeConnectionsList">
            <!-- Populated dynamically -->
          </div>
        </div>

        <div class="sheet-actions">
          <button class="sheet-btn sheet-btn-secondary" id="nodeConnectBtn">
            <span class="material-icons">add_link</span> Add Connection
          </button>
          <button class="sheet-btn sheet-btn-danger" id="nodeDeleteBtn">
            <span class="material-icons">delete</span> Delete
          </button>
        </div>
      </div>
    </div>
  `;

  container.appendChild(sheet);
}

/**
 * Create context menu for canvas
 */
function createContextMenu() {
  const menu = document.createElement('div');
  menu.id = 'mapContextMenu';
  menu.className = 'map-context-menu hidden';
  menu.innerHTML = `
    <button class="context-menu-item" id="ctxAddNode">
      <span class="material-icons">add_location</span>
      <span>Add location here</span>
    </button>
    <button class="context-menu-item" id="ctxCenterView">
      <span class="material-icons">center_focus_strong</span>
      <span>Center view here</span>
    </button>
  `;

  container.appendChild(menu);
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Toolbar buttons
  document.getElementById('mapCloseBtn').addEventListener('click', hideMap);
  document.getElementById('mapCenterBtn').addEventListener('click', centerOnCurrentLocation);
  document.getElementById('mapZoomInBtn').addEventListener('click', () => zoom(1.3));
  document.getElementById('mapZoomOutBtn').addEventListener('click', () => zoom(0.7));

  // Auto-map toggle (now a button, not checkbox)
  document.getElementById('mapAutoToggle').addEventListener('click', toggleAutoMap);

  // FAB buttons
  document.getElementById('mapAddNodeBtn').addEventListener('click', enterAddNodeMode);
  document.getElementById('mapAddEdgeBtn').addEventListener('click', enterAddEdgeMode);

  // Mode cancel
  document.getElementById('modeCancelBtn').addEventListener('click', exitAddMode);

  // Canvas interactions
  canvas.addEventListener('mousedown', handlePointerDown);
  canvas.addEventListener('mousemove', handlePointerMove);
  canvas.addEventListener('mouseup', handlePointerUp);
  canvas.addEventListener('mouseleave', handlePointerUp);
  canvas.addEventListener('wheel', handleWheel, { passive: false });
  canvas.addEventListener('contextmenu', handleContextMenu);

  // Touch events
  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.addEventListener('touchend', handleTouchEnd);
  canvas.addEventListener('touchcancel', handleTouchEnd);

  // Node edit sheet
  document.getElementById('sheetCloseBtn').addEventListener('click', closeNodeSheet);
  document.getElementById('nodeNameInput').addEventListener('input', handleNodeNameChange);
  document.getElementById('nodeNotesInput').addEventListener('input', handleNodeNotesChange);
  document.getElementById('nodeDeleteBtn').addEventListener('click', handleNodeDelete);
  document.getElementById('nodeConnectBtn').addEventListener('click', startConnectionFromSheet);

  // Type picker
  document.querySelectorAll('#nodeTypePicker .type-btn').forEach(btn => {
    btn.addEventListener('click', () => handleNodeTypeChange(btn.dataset.type));
  });

  // Context menu items
  document.getElementById('ctxAddNode').addEventListener('click', handleCtxAddNode);
  document.getElementById('ctxCenterView').addEventListener('click', handleCtxCenterView);

  // Close context menu on click outside
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('mapContextMenu');
    if (!menu.contains(e.target)) {
      menu.classList.add('hidden');
    }
  });

  // Window resize
  window.addEventListener('resize', resizeCanvas);

  // Keyboard shortcuts when map is visible
  document.addEventListener('keydown', handleKeyDown);
}

/**
 * Handle keyboard shortcuts
 */
function handleKeyDown(e) {
  if (!isVisible) return;

  // Escape to close or cancel mode
  if (e.key === 'Escape') {
    if (mapState.isAddingNode || mapState.isCreatingEdge) {
      exitAddMode();
    } else if (document.getElementById('nodeEditSheet').classList.contains('hidden') === false) {
      closeNodeSheet();
    } else {
      hideMap();
    }
    e.preventDefault();
  }

  // + to add node
  if (e.key === '+' || e.key === '=') {
    enterAddNodeMode();
    e.preventDefault();
  }

  // c to center
  if (e.key === 'c' || e.key === 'C') {
    centerOnCurrentLocation();
    e.preventDefault();
  }
}

/**
 * Toggle auto-mapping
 */
function toggleAutoMap() {
  mapState.autoMapEnabled = !mapState.autoMapEnabled;
  const btn = document.getElementById('mapAutoToggle');
  btn.classList.toggle('active', mapState.autoMapEnabled);

  if (mapState.autoMapEnabled) {
    showHint('Auto-mapping ON: New locations will be added as you explore');
  } else {
    showHint('Auto-mapping OFF: Map changes only when you add them');
  }

  saveMapForGame();
}

/**
 * Enter add node mode
 */
function enterAddNodeMode() {
  mapState.isAddingNode = true;
  document.getElementById('mapModeIndicator').classList.remove('hidden');
  document.getElementById('mapModeIndicator').querySelector('span:nth-child(2)').textContent = 'Tap to add location';
  canvas.style.cursor = 'crosshair';
  showHint('Tap anywhere on the map to add a new location');
}

/**
 * Enter add edge mode
 */
function enterAddEdgeMode() {
  if (mapState.nodes.size < 2) {
    showHint('Add at least 2 locations first to create connections');
    return;
  }
  mapState.isCreatingEdge = true;
  mapState.edgeStartNode = null;
  document.getElementById('mapModeIndicator').classList.remove('hidden');
  document.getElementById('mapModeIndicator').querySelector('span:nth-child(2)').textContent = 'Tap first location';
  canvas.style.cursor = 'crosshair';
  showHint('Tap the first location, then tap the second to connect them');
}

/**
 * Exit add mode
 */
function exitAddMode() {
  mapState.isAddingNode = false;
  mapState.isCreatingEdge = false;
  mapState.edgeStartNode = null;
  document.getElementById('mapModeIndicator').classList.add('hidden');
  canvas.style.cursor = 'grab';
  hideHint();
  render();
}

/**
 * Resize canvas to fit container
 */
function resizeCanvas() {
  if (!canvas || !container) return;

  const rect = container.querySelector('.map-canvas-container').getBoundingClientRect();

  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';

  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  render();
}

/**
 * Handle game loaded event
 */
function handleGameLoaded(e) {
  const gameName = e.detail?.gameName;
  if (gameName) {
    loadMapForGame(gameName);
  }
}

/**
 * Handle location change from auto-mapper
 * FOLLOWS UX PRINCIPLE: Auto-map is additive only, never modifies user edits
 */
function handleLocationChange(e) {
  if (!mapState.autoMapEnabled) return;

  const { locationId, locationName, previousLocationId, command } = e.detail;

  // SAFETY: Never add a node that user has deleted
  if (mapState.deletedNodes.has(locationId)) {
    return;
  }

  // SAFETY: Never modify a node that user has edited
  const existingNode = mapState.nodes.get(locationId);
  if (existingNode && mapState.protectedNodes.has(locationId)) {
    // Node exists and is protected - just update current selection, don't modify
    mapState.selectedNode = locationId;
    render();
    return;
  }

  // Add new node if it doesn't exist
  if (!existingNode) {
    const direction = command ? getDirectionFromCommand(command) : null;
    const parentNode = previousLocationId ? mapState.nodes.get(previousLocationId) : null;

    let position;
    if (parentNode && direction && DIRECTION_OFFSETS[direction]) {
      // Place relative to parent using direction offset
      const offset = DIRECTION_OFFSETS[direction];
      position = {
        x: parentNode.x + offset.x,
        y: parentNode.y + offset.y
      };
      // Nudge if position is occupied
      position = findAvailablePosition(position);
    } else if (mapState.nodes.size === 0) {
      // First node - center of viewport
      position = { x: 0, y: 0 };
    } else {
      // No parent direction - place near center
      position = findAvailablePosition({ x: 0, y: 0 });
    }

    mapState.nodes.set(locationId, {
      id: locationId,
      name: locationName,
      x: position.x,
      y: position.y,
      type: 'room',
      notes: '',
      isManual: false,  // Created by auto-mapper
      isEdited: false   // Not edited by user
    });
  }

  // Add edge from previous location
  if (previousLocationId && previousLocationId !== locationId) {
    const edgeKey = `${previousLocationId}-${locationId}`;

    // SAFETY: Never recreate deleted edges
    if (mapState.deletedEdges.has(edgeKey)) {
      // Edge was deleted by user - respect that decision
    }
    // SAFETY: Never modify protected edges
    else if (mapState.protectedEdges.has(edgeKey)) {
      // Edge was edited by user - don't touch it
    }
    // Only add if edge doesn't exist
    else if (!mapState.edges.has(edgeKey)) {
      mapState.edges.set(edgeKey, {
        from: previousLocationId,
        to: locationId,
        command: command || '',
        isManual: false,
        isEdited: false
      });
    }
  }

  // Update current node highlight
  mapState.selectedNode = locationId;

  // Update node count
  updateNodeCount();

  // Re-render and save
  render();
  saveMapForGame();
}

/**
 * Get direction from command string
 */
function getDirectionFromCommand(command) {
  if (!command) return null;
  const cmd = command.toLowerCase().trim();

  if (COMMAND_DIRECTIONS[cmd]) {
    return COMMAND_DIRECTIONS[cmd];
  }

  if (cmd.startsWith('go ')) {
    const dir = cmd.substring(3).trim();
    if (COMMAND_DIRECTIONS[dir]) {
      return COMMAND_DIRECTIONS[dir];
    }
  }

  return null;
}

/**
 * Find available position that doesn't overlap existing nodes
 */
function findAvailablePosition(preferred) {
  const MIN_DISTANCE = NODE_RADIUS * 3;

  // Check if preferred position is available
  let hasCollision = false;
  for (const node of mapState.nodes.values()) {
    const dx = node.x - preferred.x;
    const dy = node.y - preferred.y;
    if (Math.sqrt(dx * dx + dy * dy) < MIN_DISTANCE) {
      hasCollision = true;
      break;
    }
  }

  if (!hasCollision) return preferred;

  // Spiral out to find available position
  for (let radius = MIN_DISTANCE; radius < MIN_DISTANCE * 10; radius += 25) {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
      const candidate = {
        x: preferred.x + Math.cos(angle) * radius,
        y: preferred.y + Math.sin(angle) * radius
      };

      let valid = true;
      for (const node of mapState.nodes.values()) {
        const dx = node.x - candidate.x;
        const dy = node.y - candidate.y;
        if (Math.sqrt(dx * dx + dy * dy) < MIN_DISTANCE) {
          valid = false;
          break;
        }
      }

      if (valid) return candidate;
    }
  }

  return preferred;
}

/**
 * Render the map
 */
function render() {
  if (!ctx || !canvas) return;

  const width = canvas.width / window.devicePixelRatio;
  const height = canvas.height / window.devicePixelRatio;

  // Clear canvas with dark background
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, width, height);

  // Draw grid
  drawGrid(width, height);

  // Apply viewport transform
  ctx.save();
  ctx.translate(width / 2 + mapState.viewport.x, height / 2 + mapState.viewport.y);
  ctx.scale(mapState.viewport.scale, mapState.viewport.scale);

  // Draw edges (behind nodes)
  drawEdges();

  // Draw edge creation preview
  if (mapState.isCreatingEdge && mapState.edgeStartNode && mapState.currentPointer) {
    drawEdgePreview();
  }

  // Draw nodes
  drawNodes();

  ctx.restore();

  // Draw crosshair in add mode
  if (mapState.isAddingNode) {
    drawAddModeCrosshair(width, height);
  }
}

/**
 * Draw background grid
 */
function drawGrid(width, height) {
  const gridSize = 50 * mapState.viewport.scale;
  const offsetX = ((mapState.viewport.x + width / 2) % gridSize + gridSize) % gridSize;
  const offsetY = ((mapState.viewport.y + height / 2) % gridSize + gridSize) % gridSize;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;

  for (let x = offsetX; x < width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = offsetY; y < height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

/**
 * Draw all edges
 */
function drawEdges() {
  for (const edge of mapState.edges.values()) {
    const fromNode = mapState.nodes.get(edge.from);
    const toNode = mapState.nodes.get(edge.to);

    if (!fromNode || !toNode) continue;

    const isUserEdge = edge.isManual || edge.isEdited;

    // Set line style based on user vs auto
    ctx.lineWidth = 2.5;
    if (isUserEdge) {
      // User edges: dashed line, purple color
      ctx.strokeStyle = '#a78bfa';
      ctx.setLineDash([8, 4]);
    } else {
      // Auto edges: solid line, blue color
      ctx.strokeStyle = '#60a5fa';
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 0.8;

    // Draw the line
    ctx.beginPath();
    ctx.moveTo(fromNode.x, fromNode.y);
    ctx.lineTo(toNode.x, toNode.y);
    ctx.stroke();

    // Draw arrow
    drawArrow(fromNode.x, fromNode.y, toNode.x, toNode.y, isUserEdge);

    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
  }
}

/**
 * Draw arrow on edge
 */
function drawArrow(x1, y1, x2, y2, isUserEdge) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const length = 12;

  // Position arrow at edge of target node
  const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  if (dist < NODE_RADIUS * 2) return; // Too close

  const ratio = (dist - NODE_RADIUS - 5) / dist;
  const arrowX = x1 + (x2 - x1) * ratio;
  const arrowY = y1 + (y2 - y1) * ratio;

  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(arrowX, arrowY);
  ctx.lineTo(
    arrowX - length * Math.cos(angle - Math.PI / 6),
    arrowY - length * Math.sin(angle - Math.PI / 6)
  );
  ctx.moveTo(arrowX, arrowY);
  ctx.lineTo(
    arrowX - length * Math.cos(angle + Math.PI / 6),
    arrowY - length * Math.sin(angle + Math.PI / 6)
  );
  ctx.stroke();
}

/**
 * Draw edge creation preview
 */
function drawEdgePreview() {
  const startNode = mapState.nodes.get(mapState.edgeStartNode);
  if (!startNode || !mapState.currentPointer) return;

  const endPoint = screenToCanvas(mapState.currentPointer.x, mapState.currentPointer.y);

  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.globalAlpha = 0.7;

  ctx.beginPath();
  ctx.moveTo(startNode.x, startNode.y);
  ctx.lineTo(endPoint.x, endPoint.y);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

/**
 * Draw all nodes
 */
function drawNodes() {
  const currentLocation = getCurrentLocation();

  for (const node of mapState.nodes.values()) {
    const isSelected = mapState.selectedNode === node.id;
    const isCurrent = currentLocation && currentLocation.id === node.id;
    const isUserNode = node.isManual || node.isEdited;
    const isEdgeStart = mapState.edgeStartNode === node.id;

    // Determine fill color
    let fillColor;
    if (isCurrent) {
      fillColor = NODE_COLORS.current;
    } else if (isUserNode) {
      fillColor = NODE_COLORS.user;
    } else {
      fillColor = NODE_COLORS.auto;
    }

    // Draw node shadow
    ctx.beginPath();
    ctx.arc(node.x + 2, node.y + 2, NODE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fill();

    // Draw node background
    ctx.beginPath();
    ctx.arc(node.x, node.y, NODE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();

    // Draw border - DOTTED for user-edited nodes, solid for auto
    ctx.lineWidth = isSelected || isEdgeStart ? 3 : 2;
    if (isUserNode) {
      // Dotted border for user nodes
      ctx.strokeStyle = '#ffffff';
      ctx.setLineDash([4, 3]);
    } else {
      // Solid border for auto nodes
      ctx.strokeStyle = isSelected || isEdgeStart ? '#ffffff' : 'rgba(255, 255, 255, 0.4)';
      ctx.setLineDash([]);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw glow for current/selected
    if (isCurrent || isSelected || isEdgeStart) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, NODE_RADIUS + 4, 0, Math.PI * 2);
      ctx.strokeStyle = isCurrent ? 'rgba(34, 197, 94, 0.5)' : 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Draw icon
    const icon = NODE_ICONS[node.type] || NODE_ICONS.room;
    ctx.fillStyle = '#ffffff';
    ctx.font = '18px Material Icons';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, node.x, node.y);

    // Draw name label with background
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    let displayName = node.name || 'Unknown';
    if (displayName.length > 18) {
      displayName = displayName.substring(0, 15) + '...';
    }

    const textWidth = ctx.measureText(displayName).width;
    const labelY = node.y + NODE_RADIUS + 8;

    // Label background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.roundRect(node.x - textWidth / 2 - 4, labelY - 6, textWidth + 8, 14, 4);
    ctx.fill();

    // Label text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayName, node.x, labelY);

    // Draw user edit indicator (small dot)
    if (isUserNode && !isCurrent) {
      ctx.beginPath();
      ctx.arc(node.x + NODE_RADIUS - 4, node.y - NODE_RADIUS + 4, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#a78bfa';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
}

/**
 * Draw crosshair in add mode
 */
function drawAddModeCrosshair(width, height) {
  if (!mapState.currentPointer) return;

  const x = mapState.currentPointer.x;
  const y = mapState.currentPointer.y;

  ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);

  // Vertical line
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, height);
  ctx.stroke();

  // Horizontal line
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.stroke();

  // Circle at cursor
  ctx.beginPath();
  ctx.arc(x, y, NODE_RADIUS, 0, Math.PI * 2);
  ctx.stroke();

  ctx.setLineDash([]);
}

/**
 * Handle pointer down (mouse)
 */
function handlePointerDown(e) {
  if (e.button !== 0) return; // Only left click

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  mapState.currentPointer = { x, y };
  const canvasPoint = screenToCanvas(x, y);
  const hitNode = getNodeAtPoint(canvasPoint.x, canvasPoint.y);

  // Check for double-tap to add node
  const now = Date.now();
  if (mapState.lastTapPosition && now - mapState.lastTapTime < DOUBLE_TAP_DELAY) {
    const dx = x - mapState.lastTapPosition.x;
    const dy = y - mapState.lastTapPosition.y;
    if (Math.sqrt(dx * dx + dy * dy) < 30 && !hitNode) {
      // Double tap on empty space - add node
      addNodeAtPosition(canvasPoint.x, canvasPoint.y);
      mapState.lastTapTime = 0;
      return;
    }
  }
  mapState.lastTapTime = now;
  mapState.lastTapPosition = { x, y };

  // Handle add node mode
  if (mapState.isAddingNode && !hitNode) {
    addNodeAtPosition(canvasPoint.x, canvasPoint.y);
    exitAddMode();
    return;
  }

  // Handle edge creation mode
  if (mapState.isCreatingEdge) {
    if (hitNode) {
      if (!mapState.edgeStartNode) {
        // First node selected
        mapState.edgeStartNode = hitNode.id;
        document.getElementById('mapModeIndicator').querySelector('span:nth-child(2)').textContent = 'Tap second location';
        showHint(`Selected "${hitNode.name}" - now tap destination`);
        render();
      } else if (hitNode.id !== mapState.edgeStartNode) {
        // Second node selected - create edge
        createManualEdge(mapState.edgeStartNode, hitNode.id);
        exitAddMode();
      }
    }
    return;
  }

  // Normal interaction
  if (hitNode) {
    mapState.dragNode = hitNode;
    mapState.dragStart = { x, y };
    touchStartTime = Date.now();
    longPressTriggered = false;

    // Long press timer for context actions
    longPressTimer = setTimeout(() => {
      longPressTriggered = true;
      // Start edge creation from this node
      mapState.isCreatingEdge = true;
      mapState.edgeStartNode = hitNode.id;
      showHint('Drag to another location to create connection');
      render();
    }, LONG_PRESS_DURATION);
  } else {
    // Pan the canvas
    mapState.isDragging = true;
    mapState.dragStart = { x, y };
    canvas.style.cursor = 'grabbing';
  }
}

/**
 * Handle pointer move
 */
function handlePointerMove(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  mapState.currentPointer = { x, y };

  if (mapState.isDragging && mapState.dragStart) {
    const dx = x - mapState.dragStart.x;
    const dy = y - mapState.dragStart.y;

    mapState.viewport.x += dx;
    mapState.viewport.y += dy;
    mapState.dragStart = { x, y };

    render();
  } else if (mapState.dragNode && mapState.dragStart && !mapState.isCreatingEdge) {
    const dx = x - mapState.dragStart.x;
    const dy = y - mapState.dragStart.y;

    // Cancel long press if moved
    if (Math.sqrt(dx * dx + dy * dy) > 10) {
      clearTimeout(longPressTimer);

      // Move the node - marks it as user-edited
      const canvasDx = dx / mapState.viewport.scale;
      const canvasDy = dy / mapState.viewport.scale;

      mapState.dragNode.x += canvasDx;
      mapState.dragNode.y += canvasDy;
      mapState.dragNode.isEdited = true;

      // Add to protected list
      mapState.protectedNodes.add(mapState.dragNode.id);

      mapState.dragStart = { x, y };
      render();
    }
  } else if (mapState.isCreatingEdge && mapState.edgeStartNode) {
    // Update edge preview
    render();
  } else if (mapState.isAddingNode) {
    // Update crosshair
    render();
  }
}

/**
 * Handle pointer up
 */
function handlePointerUp(e) {
  clearTimeout(longPressTimer);

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (mapState.isCreatingEdge && mapState.edgeStartNode && longPressTriggered) {
    const canvasPoint = screenToCanvas(x, y);
    const hitNode = getNodeAtPoint(canvasPoint.x, canvasPoint.y);

    if (hitNode && hitNode.id !== mapState.edgeStartNode) {
      createManualEdge(mapState.edgeStartNode, hitNode.id);
    }

    mapState.isCreatingEdge = false;
    mapState.edgeStartNode = null;
    hideHint();
  } else if (mapState.dragNode && !mapState.isDragging && !longPressTriggered) {
    const elapsed = Date.now() - touchStartTime;
    if (elapsed < 250) {
      // Short tap - open edit sheet
      openNodeSheet(mapState.dragNode);
    } else {
      // Drag ended - save
      saveMapForGame();
    }
  }

  mapState.isDragging = false;
  mapState.dragStart = null;
  mapState.dragNode = null;
  longPressTriggered = false;
  canvas.style.cursor = mapState.isAddingNode ? 'crosshair' : 'grab';

  render();
}

/**
 * Handle touch start
 */
function handleTouchStart(e) {
  e.preventDefault();

  if (e.touches.length === 1) {
    const touch = e.touches[0];
    handlePointerDown({
      clientX: touch.clientX,
      clientY: touch.clientY,
      button: 0
    });
  } else if (e.touches.length === 2) {
    // Pinch zoom - cancel any drag
    clearTimeout(longPressTimer);
    mapState.isDragging = false;
    mapState.dragNode = null;

    const dx = e.touches[1].clientX - e.touches[0].clientX;
    const dy = e.touches[1].clientY - e.touches[0].clientY;
    lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
    lastTouchCenter = {
      x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
      y: (e.touches[0].clientY + e.touches[1].clientY) / 2
    };
  }
}

/**
 * Handle touch move
 */
function handleTouchMove(e) {
  e.preventDefault();

  if (e.touches.length === 1) {
    const touch = e.touches[0];
    handlePointerMove({ clientX: touch.clientX, clientY: touch.clientY });
  } else if (e.touches.length === 2) {
    // Pinch zoom
    const dx = e.touches[1].clientX - e.touches[0].clientX;
    const dy = e.touches[1].clientY - e.touches[0].clientY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (lastTouchDistance > 0) {
      const scale = distance / lastTouchDistance;
      const newScale = Math.max(0.25, Math.min(4, mapState.viewport.scale * scale));
      mapState.viewport.scale = newScale;
    }

    lastTouchDistance = distance;

    // Pan with two fingers
    const center = {
      x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
      y: (e.touches[0].clientY + e.touches[1].clientY) / 2
    };

    mapState.viewport.x += center.x - lastTouchCenter.x;
    mapState.viewport.y += center.y - lastTouchCenter.y;
    lastTouchCenter = center;

    render();
  }
}

/**
 * Handle touch end
 */
function handleTouchEnd(e) {
  if (e.touches.length === 0) {
    const touch = e.changedTouches[0];
    if (touch) {
      handlePointerUp({ clientX: touch.clientX, clientY: touch.clientY });
    }
  }
  lastTouchDistance = 0;
}

/**
 * Handle mouse wheel for zoom
 */
function handleWheel(e) {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.85 : 1.15;
  zoom(delta);
}

/**
 * Handle context menu (right-click)
 */
function handleContextMenu(e) {
  e.preventDefault();

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  mapState.currentPointer = { x, y };

  const menu = document.getElementById('mapContextMenu');
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
  menu.classList.remove('hidden');
}

/**
 * Handle context menu: Add node
 */
function handleCtxAddNode() {
  document.getElementById('mapContextMenu').classList.add('hidden');

  if (mapState.currentPointer) {
    const canvasPoint = screenToCanvas(mapState.currentPointer.x, mapState.currentPointer.y);
    addNodeAtPosition(canvasPoint.x, canvasPoint.y);
  }
}

/**
 * Handle context menu: Center view
 */
function handleCtxCenterView() {
  document.getElementById('mapContextMenu').classList.add('hidden');

  if (mapState.currentPointer) {
    const canvasPoint = screenToCanvas(mapState.currentPointer.x, mapState.currentPointer.y);
    mapState.viewport.x = -canvasPoint.x * mapState.viewport.scale;
    mapState.viewport.y = -canvasPoint.y * mapState.viewport.scale;
    render();
  }
}

/**
 * Zoom the viewport
 */
function zoom(factor) {
  const newScale = Math.max(0.25, Math.min(4, mapState.viewport.scale * factor));
  mapState.viewport.scale = newScale;
  render();
}

/**
 * Convert screen coordinates to canvas coordinates
 */
function screenToCanvas(screenX, screenY) {
  const width = canvas.width / window.devicePixelRatio;
  const height = canvas.height / window.devicePixelRatio;

  return {
    x: (screenX - width / 2 - mapState.viewport.x) / mapState.viewport.scale,
    y: (screenY - height / 2 - mapState.viewport.y) / mapState.viewport.scale
  };
}

/**
 * Get node at canvas point (with touch-friendly hit area)
 */
function getNodeAtPoint(x, y) {
  const hitRadius = Math.max(NODE_RADIUS, TOUCH_TARGET / 2 / mapState.viewport.scale);

  for (const node of mapState.nodes.values()) {
    const dx = node.x - x;
    const dy = node.y - y;
    if (Math.sqrt(dx * dx + dy * dy) <= hitRadius) {
      return node;
    }
  }

  return null;
}

/**
 * Add a new node at position (user-created)
 */
function addNodeAtPosition(x, y) {
  const id = `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const position = findAvailablePosition({ x, y });

  const node = {
    id,
    name: 'New Location',
    x: position.x,
    y: position.y,
    type: 'room',
    notes: '',
    isManual: true,   // User-created
    isEdited: false
  };

  mapState.nodes.set(id, node);
  mapState.protectedNodes.add(id);  // Protect from auto-mapper
  mapState.selectedNode = id;

  updateNodeCount();
  render();
  saveMapForGame();

  // Open edit sheet immediately
  setTimeout(() => openNodeSheet(node), 100);

  showHint('Location added! Tap to edit the name.');
}

/**
 * Create a manual edge between two nodes
 */
function createManualEdge(fromId, toId) {
  const edgeKey = `${fromId}-${toId}`;

  if (mapState.edges.has(edgeKey)) {
    showHint('Connection already exists');
    return;
  }

  mapState.edges.set(edgeKey, {
    from: fromId,
    to: toId,
    command: '',
    isManual: true,
    isEdited: false
  });

  mapState.protectedEdges.add(edgeKey);

  const fromNode = mapState.nodes.get(fromId);
  const toNode = mapState.nodes.get(toId);
  showHint(`Connected "${fromNode?.name}" to "${toNode?.name}"`);

  render();
  saveMapForGame();
}

/**
 * Center viewport on current location
 */
function centerOnCurrentLocation() {
  const current = getCurrentLocation();
  let targetNode = null;

  if (current) {
    targetNode = mapState.nodes.get(current.id);
  }

  if (!targetNode && mapState.nodes.size > 0) {
    // Center on first node if no current
    targetNode = mapState.nodes.values().next().value;
  }

  if (targetNode) {
    mapState.viewport.x = -targetNode.x * mapState.viewport.scale;
    mapState.viewport.y = -targetNode.y * mapState.viewport.scale;
    mapState.selectedNode = targetNode.id;
    render();
  }
}

/**
 * Open node edit bottom sheet
 */
function openNodeSheet(node) {
  mapState.selectedNode = node.id;

  const isUserNode = node.isManual || node.isEdited;
  const badge = document.getElementById('sheetNodeBadge');
  badge.textContent = isUserNode ? 'Your edit' : 'Auto-mapped';
  badge.className = `sheet-node-badge ${isUserNode ? 'user' : 'auto'}`;

  document.getElementById('sheetNodeName').textContent = node.name || 'Edit Location';
  document.getElementById('nodeNameInput').value = node.name || '';
  document.getElementById('nodeNotesInput').value = node.notes || '';

  // Update type picker
  document.querySelectorAll('#nodeTypePicker .type-btn').forEach(btn => {
    const isActive = btn.dataset.type === node.type;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-checked', isActive);
  });

  // Populate connections list
  populateConnectionsList(node);

  document.getElementById('nodeEditSheet').classList.remove('hidden');
  render();

  // Focus name input for quick editing
  setTimeout(() => {
    document.getElementById('nodeNameInput').focus();
    document.getElementById('nodeNameInput').select();
  }, 100);
}

/**
 * Populate connections list in edit sheet
 */
function populateConnectionsList(node) {
  const list = document.getElementById('nodeConnectionsList');
  const connections = [];

  // Find all edges involving this node
  for (const [key, edge] of mapState.edges) {
    if (edge.from === node.id) {
      const toNode = mapState.nodes.get(edge.to);
      if (toNode) {
        connections.push({ type: 'to', node: toNode, edge, key });
      }
    } else if (edge.to === node.id) {
      const fromNode = mapState.nodes.get(edge.from);
      if (fromNode) {
        connections.push({ type: 'from', node: fromNode, edge, key });
      }
    }
  }

  if (connections.length === 0) {
    list.innerHTML = '<div class="no-connections">No connections yet</div>';
    return;
  }

  list.innerHTML = connections.map(conn => `
    <div class="connection-item ${conn.edge.isManual ? 'user' : 'auto'}">
      <span class="connection-direction">${conn.type === 'to' ? '→' : '←'}</span>
      <span class="connection-name">${conn.node.name}</span>
      ${conn.edge.command ? `<span class="connection-cmd">${conn.edge.command}</span>` : ''}
      <button class="connection-delete" data-edge="${conn.key}" aria-label="Delete connection">
        <span class="material-icons">close</span>
      </button>
    </div>
  `).join('');

  // Add delete handlers
  list.querySelectorAll('.connection-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const edgeKey = btn.dataset.edge;
      deleteEdge(edgeKey);
      populateConnectionsList(node);
    });
  });
}

/**
 * Delete an edge
 */
function deleteEdge(edgeKey) {
  mapState.edges.delete(edgeKey);
  mapState.deletedEdges.add(edgeKey);  // Remember deletion so auto-mapper won't recreate
  saveMapForGame();
  render();
  showHint('Connection removed');
}

/**
 * Start connection creation from edit sheet
 */
function startConnectionFromSheet() {
  const nodeId = mapState.selectedNode;
  if (!nodeId) return;

  closeNodeSheet();
  mapState.isCreatingEdge = true;
  mapState.edgeStartNode = nodeId;

  document.getElementById('mapModeIndicator').classList.remove('hidden');
  document.getElementById('mapModeIndicator').querySelector('span:nth-child(2)').textContent = 'Tap destination';

  const node = mapState.nodes.get(nodeId);
  showHint(`Tap a location to connect from "${node?.name}"`);

  render();
}

/**
 * Close node edit sheet
 */
function closeNodeSheet() {
  document.getElementById('nodeEditSheet').classList.add('hidden');
  saveMapForGame();
}

/**
 * Handle node name change
 */
function handleNodeNameChange(e) {
  if (!mapState.selectedNode) return;

  const node = mapState.nodes.get(mapState.selectedNode);
  if (node) {
    node.name = e.target.value;
    node.isEdited = true;
    mapState.protectedNodes.add(node.id);
    document.getElementById('sheetNodeName').textContent = e.target.value || 'Edit Location';

    // Update badge
    const badge = document.getElementById('sheetNodeBadge');
    badge.textContent = 'Your edit';
    badge.className = 'sheet-node-badge user';

    render();
  }
}

/**
 * Handle node notes change
 */
function handleNodeNotesChange(e) {
  if (!mapState.selectedNode) return;

  const node = mapState.nodes.get(mapState.selectedNode);
  if (node) {
    node.notes = e.target.value;
    node.isEdited = true;
    mapState.protectedNodes.add(node.id);
  }
}

/**
 * Handle node type change
 */
function handleNodeTypeChange(type) {
  if (!mapState.selectedNode) return;

  const node = mapState.nodes.get(mapState.selectedNode);
  if (node) {
    node.type = type;
    node.isEdited = true;
    mapState.protectedNodes.add(node.id);

    // Update UI
    document.querySelectorAll('#nodeTypePicker .type-btn').forEach(btn => {
      const isActive = btn.dataset.type === type;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-checked', isActive);
    });

    // Update badge
    const badge = document.getElementById('sheetNodeBadge');
    badge.textContent = 'Your edit';
    badge.className = 'sheet-node-badge user';

    render();
  }
}

/**
 * Handle node delete
 */
function handleNodeDelete() {
  if (!mapState.selectedNode) return;

  const nodeId = mapState.selectedNode;
  const node = mapState.nodes.get(nodeId);

  // Remove node
  mapState.nodes.delete(nodeId);

  // Add to deleted set so auto-mapper won't recreate it
  mapState.deletedNodes.add(nodeId);

  // Remove connected edges
  for (const [edgeKey, edge] of mapState.edges) {
    if (edge.from === nodeId || edge.to === nodeId) {
      mapState.edges.delete(edgeKey);
      mapState.deletedEdges.add(edgeKey);
    }
  }

  mapState.selectedNode = null;
  closeNodeSheet();
  updateNodeCount();
  render();
  saveMapForGame();

  showHint(`Deleted "${node?.name}"`);
}

/**
 * Show hint toast
 */
function showHint(message) {
  const hint = document.getElementById('mapHint');
  hint.textContent = message;
  hint.classList.remove('hidden');

  clearTimeout(hint._timeout);
  hint._timeout = setTimeout(() => {
    hint.classList.add('hidden');
  }, 3000);
}

/**
 * Hide hint toast
 */
function hideHint() {
  const hint = document.getElementById('mapHint');
  clearTimeout(hint._timeout);
  hint.classList.add('hidden');
}

/**
 * Update node count display
 */
function updateNodeCount() {
  const count = mapState.nodes.size;
  const el = document.getElementById('mapNodeCount');
  if (el) {
    el.textContent = count > 0 ? `${count} location${count !== 1 ? 's' : ''}` : '';
  }
}

/**
 * Show the map overlay
 */
export function showMap() {
  if (!container) {
    initMapCanvas();
  }

  container.classList.remove('hidden');
  isVisible = true;

  // Restore auto-map toggle state
  document.getElementById('mapAutoToggle').classList.toggle('active', mapState.autoMapEnabled);

  resizeCanvas();
  updateNodeCount();
  centerOnCurrentLocation();

  if (mapState.autoMapEnabled && mapState.nodes.size === 0) {
    showHint('Explore the game to start auto-mapping locations');
  }
}

/**
 * Hide the map overlay
 */
export function hideMap() {
  if (container) {
    container.classList.add('hidden');
  }
  isVisible = false;
  exitAddMode();
  saveMapForGame();
}

/**
 * Toggle map visibility
 */
export function toggleMap() {
  if (isVisible) {
    hideMap();
  } else {
    showMap();
  }
}

/**
 * Check if map is visible
 */
export function isMapVisible() {
  return isVisible;
}

/**
 * Load map data for a game
 */
function loadMapForGame(gameName) {
  mapState.gameName = gameName;

  const key = `iftalk_map_${gameName}`;
  const saved = localStorage.getItem(key);

  if (saved) {
    try {
      const data = JSON.parse(saved);

      // Restore nodes
      mapState.nodes = new Map((data.nodes || []).map(n => [n.id, n]));

      // Restore edges
      mapState.edges = new Map((data.edges || []).map(e => [`${e.from}-${e.to}`, e]));

      // Restore protection sets
      mapState.protectedNodes = new Set(data.protectedNodes || []);
      mapState.protectedEdges = new Set(data.protectedEdges || []);
      mapState.deletedEdges = new Set(data.deletedEdges || []);
      mapState.deletedNodes = new Set(data.deletedNodes || []);

      // Restore viewport
      if (data.viewport) {
        mapState.viewport = data.viewport;
      }

      // Restore auto-map setting
      if (typeof data.autoMapEnabled === 'boolean') {
        mapState.autoMapEnabled = data.autoMapEnabled;
      }

      console.log('[MapCanvas] Loaded map for:', gameName, 'with', mapState.nodes.size, 'nodes');
    } catch (e) {
      console.error('[MapCanvas] Failed to load map:', e);
      resetMap();
    }
  } else {
    resetMap();
  }

  updateNodeCount();

  if (isVisible) {
    render();
  }
}

/**
 * Save map data for current game
 */
function saveMapForGame() {
  if (!mapState.gameName) return;

  const key = `iftalk_map_${mapState.gameName}`;
  const data = {
    nodes: Array.from(mapState.nodes.values()),
    edges: Array.from(mapState.edges.values()),
    protectedNodes: Array.from(mapState.protectedNodes),
    protectedEdges: Array.from(mapState.protectedEdges),
    deletedEdges: Array.from(mapState.deletedEdges),
    deletedNodes: Array.from(mapState.deletedNodes),
    viewport: mapState.viewport,
    autoMapEnabled: mapState.autoMapEnabled
  };

  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error('[MapCanvas] Failed to save map:', e);
  }
}

/**
 * Reset map state
 */
function resetMap() {
  mapState.nodes = new Map();
  mapState.edges = new Map();
  mapState.protectedNodes = new Set();
  mapState.protectedEdges = new Set();
  mapState.deletedEdges = new Set();
  mapState.deletedNodes = new Set();
  mapState.viewport = { x: 0, y: 0, scale: 1 };
  mapState.selectedNode = null;
  mapState.autoMapEnabled = true;
}

// Expose for debugging
window.showMap = showMap;
window.hideMap = hideMap;
window.toggleMap = toggleMap;
window.getMapState = () => mapState;
