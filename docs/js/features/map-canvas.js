/**
 * Map Canvas - Interactive Game Map with Auto-Mapping
 *
 * Provides an infinite 2D canvas for mapping game locations.
 * Integrates with auto-mapper for automatic node/edge creation.
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

// Node type icons
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

// Map state
let mapState = {
  gameName: null,
  nodes: new Map(),        // nodeId -> { id, name, x, y, type, notes, isManual, isEdited }
  edges: new Map(),        // edgeId -> { from, to, command, isManual, isDeleted }
  deletedEdges: new Set(), // Set of "from-to" keys for user-deleted edges
  viewport: { x: 0, y: 0, scale: 1 },
  selectedNode: null,
  autoMapEnabled: true,
  isDragging: false,
  dragStart: null,
  dragNode: null,
  isCreatingEdge: false,
  edgeStartNode: null
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
const LONG_PRESS_DURATION = 500;

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
      <button class="map-btn map-close-btn" id="mapCloseBtn">
        <span class="material-icons">close</span>
      </button>
      <div class="map-title">Game Map</div>
      <div class="map-toolbar-actions">
        <button class="map-btn" id="mapCenterBtn" title="Center on current location">
          <span class="material-icons">my_location</span>
        </button>
        <button class="map-btn" id="mapZoomInBtn" title="Zoom in">
          <span class="material-icons">add</span>
        </button>
        <button class="map-btn" id="mapZoomOutBtn" title="Zoom out">
          <span class="material-icons">remove</span>
        </button>
        <label class="map-toggle" title="Auto-map new locations">
          <input type="checkbox" id="mapAutoToggle" checked>
          <span class="map-toggle-slider"></span>
          <span class="map-toggle-label">Auto</span>
        </label>
      </div>
    </div>
    <canvas id="mapCanvas"></canvas>
    <div class="map-hint hidden" id="mapHint"></div>
  `;

  document.body.appendChild(container);

  // Get canvas reference
  canvas = document.getElementById('mapCanvas');
  ctx = canvas.getContext('2d');

  // Set up canvas size
  resizeCanvas();

  // Create bottom sheet for node editing
  createNodeEditSheet();
}

/**
 * Create the node edit bottom sheet
 */
function createNodeEditSheet() {
  const sheet = document.createElement('div');
  sheet.id = 'nodeEditSheet';
  sheet.className = 'node-edit-sheet hidden';
  sheet.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-content">
      <div class="sheet-header">
        <h3 id="sheetNodeName">Edit Node</h3>
        <button class="sheet-close-btn" id="sheetCloseBtn">
          <span class="material-icons">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="sheet-field">
          <label>Name</label>
          <input type="text" id="nodeNameInput" placeholder="Location name">
        </div>
        <div class="sheet-field">
          <label>Notes</label>
          <textarea id="nodeNotesInput" placeholder="Add notes about this location..." rows="3"></textarea>
        </div>
        <div class="sheet-field">
          <label>Type</label>
          <div class="node-type-picker" id="nodeTypePicker">
            <button class="type-btn active" data-type="room"><span class="material-icons">home</span></button>
            <button class="type-btn" data-type="outdoor"><span class="material-icons">park</span></button>
            <button class="type-btn" data-type="shop"><span class="material-icons">store</span></button>
            <button class="type-btn" data-type="danger"><span class="material-icons">warning</span></button>
            <button class="type-btn" data-type="npc"><span class="material-icons">person</span></button>
            <button class="type-btn" data-type="item"><span class="material-icons">inventory_2</span></button>
            <button class="type-btn" data-type="locked"><span class="material-icons">lock</span></button>
          </div>
        </div>
        <div class="sheet-actions">
          <button class="sheet-btn sheet-btn-danger" id="nodeDeleteBtn">
            <span class="material-icons">delete</span> Delete Node
          </button>
        </div>
      </div>
    </div>
  `;

  container.appendChild(sheet);
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Toolbar buttons
  document.getElementById('mapCloseBtn').addEventListener('click', hideMap);
  document.getElementById('mapCenterBtn').addEventListener('click', centerOnCurrentLocation);
  document.getElementById('mapZoomInBtn').addEventListener('click', () => zoom(1.2));
  document.getElementById('mapZoomOutBtn').addEventListener('click', () => zoom(0.8));
  document.getElementById('mapAutoToggle').addEventListener('change', (e) => {
    mapState.autoMapEnabled = e.target.checked;
    if (e.target.checked) {
      showHint('Auto-map enabled: new locations will be added automatically');
    }
  });

  // Canvas interactions
  canvas.addEventListener('mousedown', handlePointerDown);
  canvas.addEventListener('mousemove', handlePointerMove);
  canvas.addEventListener('mouseup', handlePointerUp);
  canvas.addEventListener('mouseleave', handlePointerUp);
  canvas.addEventListener('wheel', handleWheel);

  // Touch events
  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.addEventListener('touchend', handleTouchEnd);

  // Node edit sheet
  document.getElementById('sheetCloseBtn').addEventListener('click', closeNodeSheet);
  document.getElementById('nodeNameInput').addEventListener('input', handleNodeNameChange);
  document.getElementById('nodeNotesInput').addEventListener('input', handleNodeNotesChange);
  document.getElementById('nodeDeleteBtn').addEventListener('click', handleNodeDelete);

  // Type picker
  document.querySelectorAll('#nodeTypePicker .type-btn').forEach(btn => {
    btn.addEventListener('click', () => handleNodeTypeChange(btn.dataset.type));
  });

  // Window resize
  window.addEventListener('resize', resizeCanvas);
}

/**
 * Resize canvas to fit container
 */
function resizeCanvas() {
  if (!canvas || !container) return;

  const rect = container.getBoundingClientRect();
  const toolbarHeight = 50;

  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = (rect.height - toolbarHeight) * window.devicePixelRatio;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = (rect.height - toolbarHeight) + 'px';

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
 */
function handleLocationChange(e) {
  if (!mapState.autoMapEnabled) return;

  const { locationId, locationName, previousLocationId, command } = e.detail;

  // Add or update node for new location
  if (!mapState.nodes.has(locationId)) {
    // Calculate position based on command direction
    const direction = command ? getDirectionFromCommand(command) : null;
    const parentNode = previousLocationId ? mapState.nodes.get(previousLocationId) : null;

    let position;
    if (parentNode && direction && DIRECTION_OFFSETS[direction]) {
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
      // No parent - place near center
      position = findAvailablePosition({ x: 0, y: 0 });
    }

    mapState.nodes.set(locationId, {
      id: locationId,
      name: locationName,
      x: position.x,
      y: position.y,
      type: 'room',
      notes: '',
      isManual: false,
      isEdited: false
    });
  }

  // Add edge from previous location
  if (previousLocationId && previousLocationId !== locationId) {
    const edgeKey = `${previousLocationId}-${locationId}`;
    const reverseKey = `${locationId}-${previousLocationId}`;

    // Don't recreate deleted edges
    if (!mapState.deletedEdges.has(edgeKey) && !mapState.edges.has(edgeKey)) {
      mapState.edges.set(edgeKey, {
        from: previousLocationId,
        to: locationId,
        command: command || '',
        isManual: false,
        isDeleted: false
      });
    }
  }

  // Update current node highlight
  mapState.selectedNode = locationId;

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

  // Check for exact matches first
  if (COMMAND_DIRECTIONS[cmd]) {
    return COMMAND_DIRECTIONS[cmd];
  }

  // Check for "go X" pattern
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
  const NODE_RADIUS = 30;
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
  for (let radius = MIN_DISTANCE; radius < MIN_DISTANCE * 10; radius += 20) {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
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

  // Clear canvas
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, width, height);

  // Draw grid
  drawGrid(width, height);

  // Apply viewport transform
  ctx.save();
  ctx.translate(width / 2 + mapState.viewport.x, height / 2 + mapState.viewport.y);
  ctx.scale(mapState.viewport.scale, mapState.viewport.scale);

  // Draw edges (behind nodes)
  drawEdges();

  // Draw nodes
  drawNodes();

  // Draw edge creation preview
  if (mapState.isCreatingEdge && mapState.edgeStartNode) {
    drawEdgePreview();
  }

  ctx.restore();
}

/**
 * Draw background grid
 */
function drawGrid(width, height) {
  const gridSize = 50 * mapState.viewport.scale;
  const offsetX = (mapState.viewport.x % gridSize + gridSize) % gridSize;
  const offsetY = (mapState.viewport.y % gridSize + gridSize) % gridSize;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;

  // Vertical lines
  for (let x = offsetX; x < width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  // Horizontal lines
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
  ctx.lineWidth = 2;

  for (const edge of mapState.edges.values()) {
    if (edge.isDeleted) continue;

    const fromNode = mapState.nodes.get(edge.from);
    const toNode = mapState.nodes.get(edge.to);

    if (!fromNode || !toNode) continue;

    // Edge color
    ctx.strokeStyle = edge.isManual ? '#4ade80' : '#6366f1';
    ctx.globalAlpha = 0.7;

    ctx.beginPath();
    ctx.moveTo(fromNode.x, fromNode.y);
    ctx.lineTo(toNode.x, toNode.y);
    ctx.stroke();

    // Draw arrow
    drawArrow(fromNode.x, fromNode.y, toNode.x, toNode.y);

    ctx.globalAlpha = 1;
  }
}

/**
 * Draw arrow on edge
 */
function drawArrow(x1, y1, x2, y2) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const length = 10;
  const NODE_RADIUS = 25;

  // Position arrow at edge of target node
  const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const ratio = (dist - NODE_RADIUS) / dist;
  const arrowX = x1 + (x2 - x1) * ratio;
  const arrowY = y1 + (y2 - y1) * ratio;

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
 * Draw all nodes
 */
function drawNodes() {
  const NODE_RADIUS = 25;
  const currentLocation = getCurrentLocation();

  for (const node of mapState.nodes.values()) {
    const isSelected = mapState.selectedNode === node.id;
    const isCurrent = currentLocation && currentLocation.id === node.id;

    // Node background
    ctx.beginPath();
    ctx.arc(node.x, node.y, NODE_RADIUS, 0, Math.PI * 2);

    // Fill color based on state
    if (isCurrent) {
      ctx.fillStyle = '#22c55e';
    } else if (node.isManual || node.isEdited) {
      ctx.fillStyle = '#8b5cf6';
    } else {
      ctx.fillStyle = '#3b82f6';
    }
    ctx.fill();

    // Border
    if (isSelected) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
    } else {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 2;
    }
    ctx.stroke();

    // Icon
    const icon = NODE_ICONS[node.type] || NODE_ICONS.room;
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px Material Icons';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, node.x, node.y);

    // Name label
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // Truncate long names
    let displayName = node.name;
    if (displayName.length > 15) {
      displayName = displayName.substring(0, 12) + '...';
    }
    ctx.fillText(displayName, node.x, node.y + NODE_RADIUS + 5);
  }
}

/**
 * Draw edge creation preview
 */
function drawEdgePreview() {
  const startNode = mapState.nodes.get(mapState.edgeStartNode);
  if (!startNode) return;

  // Get current pointer position in canvas coordinates
  // This would need to be tracked during touch/mouse move
  // For now, just draw from start node
}

/**
 * Handle pointer down (mouse/touch)
 */
function handlePointerDown(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const canvasPoint = screenToCanvas(x, y);
  const hitNode = getNodeAtPoint(canvasPoint.x, canvasPoint.y);

  if (hitNode) {
    mapState.dragNode = hitNode;
    mapState.dragStart = { x, y };
    touchStartTime = Date.now();

    // Long press timer for edge creation
    longPressTimer = setTimeout(() => {
      mapState.isCreatingEdge = true;
      mapState.edgeStartNode = hitNode.id;
      showHint('Drag to another node to create connection');
    }, LONG_PRESS_DURATION);
  } else {
    // Pan the canvas
    mapState.isDragging = true;
    mapState.dragStart = { x, y };
  }
}

/**
 * Handle pointer move
 */
function handlePointerMove(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (mapState.isDragging && mapState.dragStart) {
    const dx = x - mapState.dragStart.x;
    const dy = y - mapState.dragStart.y;

    mapState.viewport.x += dx;
    mapState.viewport.y += dy;
    mapState.dragStart = { x, y };

    render();
  } else if (mapState.dragNode && mapState.dragStart && !mapState.isCreatingEdge) {
    // Check if we've moved enough to cancel long press and start dragging
    const dx = x - mapState.dragStart.x;
    const dy = y - mapState.dragStart.y;

    if (Math.sqrt(dx * dx + dy * dy) > 10) {
      clearTimeout(longPressTimer);

      // Move the node
      const canvasDx = dx / mapState.viewport.scale;
      const canvasDy = dy / mapState.viewport.scale;

      mapState.dragNode.x += canvasDx;
      mapState.dragNode.y += canvasDy;
      mapState.dragNode.isEdited = true;
      mapState.dragStart = { x, y };

      render();
    }
  }
}

/**
 * Handle pointer up
 */
function handlePointerUp(e) {
  clearTimeout(longPressTimer);

  if (mapState.isCreatingEdge && mapState.edgeStartNode) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const canvasPoint = screenToCanvas(x, y);
    const hitNode = getNodeAtPoint(canvasPoint.x, canvasPoint.y);

    if (hitNode && hitNode.id !== mapState.edgeStartNode) {
      // Create manual edge
      const edgeKey = `${mapState.edgeStartNode}-${hitNode.id}`;
      if (!mapState.edges.has(edgeKey)) {
        mapState.edges.set(edgeKey, {
          from: mapState.edgeStartNode,
          to: hitNode.id,
          command: '',
          isManual: true,
          isDeleted: false
        });
        saveMapForGame();
      }
    }

    mapState.isCreatingEdge = false;
    mapState.edgeStartNode = null;
    hideHint();
  } else if (mapState.dragNode && !mapState.isDragging) {
    const elapsed = Date.now() - touchStartTime;
    if (elapsed < 300) {
      // Short tap - open edit sheet
      openNodeSheet(mapState.dragNode);
    } else {
      // Drag ended - save position
      saveMapForGame();
    }
  }

  mapState.isDragging = false;
  mapState.dragStart = null;
  mapState.dragNode = null;

  render();
}

/**
 * Handle touch start
 */
function handleTouchStart(e) {
  e.preventDefault();

  if (e.touches.length === 1) {
    const touch = e.touches[0];
    handlePointerDown({ clientX: touch.clientX, clientY: touch.clientY });
  } else if (e.touches.length === 2) {
    // Pinch zoom
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
    handlePointerUp(e.changedTouches[0] ? {
      clientX: e.changedTouches[0].clientX,
      clientY: e.changedTouches[0].clientY
    } : { clientX: 0, clientY: 0 });
  }
  lastTouchDistance = 0;
}

/**
 * Handle mouse wheel for zoom
 */
function handleWheel(e) {
  e.preventDefault();

  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  zoom(delta);
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
 * Get node at canvas point
 */
function getNodeAtPoint(x, y) {
  const NODE_RADIUS = 25;

  for (const node of mapState.nodes.values()) {
    const dx = node.x - x;
    const dy = node.y - y;
    if (Math.sqrt(dx * dx + dy * dy) <= NODE_RADIUS) {
      return node;
    }
  }

  return null;
}

/**
 * Center viewport on current location
 */
function centerOnCurrentLocation() {
  const current = getCurrentLocation();
  if (!current) return;

  const node = mapState.nodes.get(current.id);
  if (!node) return;

  mapState.viewport.x = -node.x * mapState.viewport.scale;
  mapState.viewport.y = -node.y * mapState.viewport.scale;

  render();
}

/**
 * Open node edit bottom sheet
 */
function openNodeSheet(node) {
  mapState.selectedNode = node.id;

  document.getElementById('sheetNodeName').textContent = node.name;
  document.getElementById('nodeNameInput').value = node.name;
  document.getElementById('nodeNotesInput').value = node.notes || '';

  // Update type picker
  document.querySelectorAll('#nodeTypePicker .type-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === node.type);
  });

  document.getElementById('nodeEditSheet').classList.remove('hidden');
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
    document.getElementById('sheetNodeName').textContent = e.target.value;
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

    // Update UI
    document.querySelectorAll('#nodeTypePicker .type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });

    render();
  }
}

/**
 * Handle node delete
 */
function handleNodeDelete() {
  if (!mapState.selectedNode) return;

  const nodeId = mapState.selectedNode;

  // Remove node
  mapState.nodes.delete(nodeId);

  // Remove connected edges
  for (const [edgeKey, edge] of mapState.edges) {
    if (edge.from === nodeId || edge.to === nodeId) {
      mapState.edges.delete(edgeKey);
    }
  }

  mapState.selectedNode = null;
  closeNodeSheet();
  render();
  saveMapForGame();
}

/**
 * Show hint toast
 */
function showHint(message) {
  const hint = document.getElementById('mapHint');
  hint.textContent = message;
  hint.classList.remove('hidden');

  setTimeout(() => {
    hint.classList.add('hidden');
  }, 3000);
}

/**
 * Hide hint toast
 */
function hideHint() {
  document.getElementById('mapHint').classList.add('hidden');
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
  resizeCanvas();
  centerOnCurrentLocation();

  if (mapState.autoMapEnabled) {
    showHint('Auto-map will add new locations; existing nodes won\'t be changed');
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
      mapState.nodes = new Map(data.nodes.map(n => [n.id, n]));

      // Restore edges
      mapState.edges = new Map(data.edges.map(e => [`${e.from}-${e.to}`, e]));

      // Restore deleted edges
      mapState.deletedEdges = new Set(data.deletedEdges || []);

      // Restore viewport
      if (data.viewport) {
        mapState.viewport = data.viewport;
      }

      console.log('[MapCanvas] Loaded map for:', gameName, 'with', mapState.nodes.size, 'nodes');
    } catch (e) {
      console.error('[MapCanvas] Failed to load map:', e);
      resetMap();
    }
  } else {
    resetMap();
  }

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
    deletedEdges: Array.from(mapState.deletedEdges),
    viewport: mapState.viewport
  };

  localStorage.setItem(key, JSON.stringify(data));
}

/**
 * Reset map state
 */
function resetMap() {
  mapState.nodes = new Map();
  mapState.edges = new Map();
  mapState.deletedEdges = new Set();
  mapState.viewport = { x: 0, y: 0, scale: 1 };
  mapState.selectedNode = null;
}

/**
 * Add a manual node
 */
export function addManualNode(name, x = 0, y = 0, type = 'room') {
  const id = `manual_${Date.now()}`;
  const position = findAvailablePosition({ x, y });

  mapState.nodes.set(id, {
    id,
    name,
    x: position.x,
    y: position.y,
    type,
    notes: '',
    isManual: true,
    isEdited: false
  });

  saveMapForGame();
  render();

  return id;
}

// Expose for debugging
window.showMap = showMap;
window.hideMap = hideMap;
window.toggleMap = toggleMap;
