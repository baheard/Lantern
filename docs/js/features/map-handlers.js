/**
 * Map Canvas - Input Handlers
 */

import {
  canvas, mapState, domRefs,
  NODE_RADIUS, TOUCH_TARGET,
  timers, touchState, isVisible,
  DIRECTION_TO_TYPE, COMMAND_DIRECTIONS
} from './map-config.js';
import { render, screenToCanvas, zoom } from './map-render.js';
import { openNodeSheet, createManualEdge, closeNodeSheet, performManualMerge } from './map-sheet.js';

// Callbacks (set by map-canvas.js to avoid circular deps)
let callbacks = {
  addNodeAtPosition: () => {},
  exitAddMode: () => {},
  showHint: () => {},
  hideHint: () => {},
  saveMapForGame: () => {},
  hideMap: () => {},
  enterAddNodeMode: () => {},
  centerOnCurrentLocation: () => {},
  captureUndoSnapshot: () => null,
  commitUndoSnapshot: () => {}
};

export function setHandlerCallbacks(cbs) {
  callbacks = { ...callbacks, ...cbs };
}

// Undo snapshot captured on the first movement of a node drag, held until
// pointer-up. Committed only if the node actually ended up moved, so a pure tap
// (or a drag that returns to its origin) leaves the undo/redo stacks untouched.
let pendingMoveSnapshot = null;

// ============================================================================
// POINTER HANDLERS
// ============================================================================

export function handlePointerDown(e) {
  if (e.button !== 0) return;

  // Prevent focus steal and keyboard dismissal (only for real pointer events)
  if (e.preventDefault) {
    e.preventDefault();
  }

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  mapState.currentPointer = { x, y };
  const canvasPoint = screenToCanvas(x, y);
  const hitNode = getNodeAtPoint(canvasPoint.x, canvasPoint.y);

  timers.isInteracting = true;
  // Controls stay visible during panning - no hideFab() call

  if (mapState.isAddingNode && !hitNode) { callbacks.addNodeAtPosition(canvasPoint.x, canvasPoint.y); callbacks.exitAddMode(); return; }

  if (mapState.isCreatingEdge && hitNode) {
    if (!mapState.edgeStartNode) {
      mapState.edgeStartNode = hitNode.id;
      domRefs.modeIndicator.querySelector('span:nth-child(2)').textContent = 'Tap second location';
      callbacks.showHint(`Selected "${hitNode.name}" - now tap destination`);
      render();
    } else if (hitNode.id !== mapState.edgeStartNode) {
      createManualEdge(mapState.edgeStartNode, hitNode.id);
      callbacks.exitAddMode();
    }
    return;
  }

  if (mapState.isMerging && hitNode && hitNode.id !== mapState.mergeSourceNode) {
    performManualMerge(mapState.mergeSourceNode, hitNode.id);
    callbacks.exitAddMode();
    return;
  }

  if (hitNode) {
    mapState.dragNode = hitNode; mapState.dragStart = { x, y }; touchState.touchStartTime = Date.now();
    touchState.nodeStartPos = { x: hitNode.x, y: hitNode.y };  // Track for tap-vs-move detection
    pendingMoveSnapshot = null;  // Captured lazily on first actual movement
  } else {
    mapState.isDragging = true; mapState.dragStart = { x, y }; mapState.hasDragged = false;
    touchState.touchStartTime = Date.now();
    canvas.style.cursor = 'grabbing';
  }
}

export function handlePointerMove(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  mapState.currentPointer = { x, y };

  if (mapState.isDragging && mapState.dragStart) {
    const dx = x - mapState.dragStart.x, dy = y - mapState.dragStart.y;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) mapState.hasDragged = true;
    mapState.viewport.x += dx;
    mapState.viewport.y += dy;
    mapState.dragStart = { x, y };
    render();
  } else if (mapState.dragNode && mapState.dragStart && !mapState.isCreatingEdge && !mapState.isMerging) {
    const dx = x - mapState.dragStart.x, dy = y - mapState.dragStart.y;
    if (Math.sqrt(dx * dx + dy * dy) > 3) {  // Fine control for alignment
      // Capture pre-move state once, before the first position change. Held
      // pending and committed on pointer-up only if the node actually moves.
      if (!pendingMoveSnapshot) pendingMoveSnapshot = callbacks.captureUndoSnapshot();
      mapState.dragNode.x += dx / mapState.viewport.scale;
      mapState.dragNode.y += dy / mapState.viewport.scale;
      mapState.dragNode.isEdited = true;
      mapState.protectedNodes.add(mapState.dragNode.id);
      mapState.dragStart = { x, y };
      render();
    }
  } else if ((mapState.isCreatingEdge && mapState.edgeStartNode) || mapState.isAddingNode || mapState.isMerging) {
    render();
  }
}

export function handlePointerUp(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  const canvasPoint = screenToCanvas(x, y);
  const hitNode = getNodeAtPoint(canvasPoint.x, canvasPoint.y);

  if (mapState.dragNode && !mapState.isDragging) {
    // Check if node was moved (not just tapped)
    const wasMoved = touchState.nodeStartPos &&
      (mapState.dragNode.x !== touchState.nodeStartPos.x || mapState.dragNode.y !== touchState.nodeStartPos.y);

    if (wasMoved) {
      // Commit the snapshot captured on the first movement (in handlePointerMove)
      if (pendingMoveSnapshot) callbacks.commitUndoSnapshot(pendingMoveSnapshot);
      mapState.hasUnsavedChanges = true; // Trigger full autosave on map close
      callbacks.saveMapForGame();
    } else if (Date.now() - touchState.touchStartTime < 250) {
      // Tapped on a node - open the sheet
      openNodeSheet(mapState.dragNode);
    }
    // Drag ended (or it was a tap): drop any pending snapshot. If the node moved
    // and returned to its exact origin, wasMoved is false and nothing is committed.
    pendingMoveSnapshot = null;
  } else if (!hitNode && !mapState.hasDragged && !mapState.isCreatingEdge && !mapState.isAddingNode && !mapState.isMerging) {
    // Check for question mark tap on uncertain portal connections
    const hitQuestionMark = getQuestionMarkAtPoint(canvasPoint.x, canvasPoint.y);
    if (hitQuestionMark) {
      const command = hitQuestionMark.command || 'portal';
      callbacks.showHint(`"${command}" used for move, direction uncertain. Move either location node to clear.`);
    } else if (mapState.selectedNode) {
      // Tapped on empty canvas - unselect any selected node
      mapState.selectedNode = null;
      render();
    }
  }

  mapState.isDragging = false; mapState.dragStart = null; mapState.dragNode = null; mapState.hasDragged = false;
  canvas.style.cursor = mapState.isAddingNode ? 'crosshair' : 'grab';
  scheduleFabShow(); render();
}

// ============================================================================
// TOUCH HANDLERS
// ============================================================================

export function handleTouchStart(e) {
  e.preventDefault();
  if (e.touches.length === 1) {
    handlePointerDown({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY, button: 0 });
  } else if (e.touches.length === 2) {
    mapState.isDragging = false; mapState.dragNode = null;
    timers.isInteracting = true;
    // Controls stay visible during pinch-zoom
    const dx = e.touches[1].clientX - e.touches[0].clientX, dy = e.touches[1].clientY - e.touches[0].clientY;
    touchState.lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
    touchState.lastTouchCenter = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
  }
}

export function handleTouchMove(e) {
  e.preventDefault();
  if (e.touches.length === 1) {
    handlePointerMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
  } else if (e.touches.length === 2) {
    const dx = e.touches[1].clientX - e.touches[0].clientX, dy = e.touches[1].clientY - e.touches[0].clientY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (touchState.lastTouchDistance > 0) {
      const rect = canvas.getBoundingClientRect();
      const center = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 };

      // Convert touch center to canvas-relative coordinates
      const canvasX = center.x - rect.left;
      const canvasY = center.y - rect.top;

      // Zoom around the pinch center
      const zoomFactor = distance / touchState.lastTouchDistance;
      zoom(zoomFactor, canvasX, canvasY);
    }

    touchState.lastTouchDistance = distance;
    touchState.lastTouchCenter = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
    render();
  }
}

export function handleTouchEnd(e) {
  if (e.touches.length === 0 && e.changedTouches[0]) {
    handlePointerUp({ clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY });
  }
  touchState.lastTouchDistance = 0;
}

// ============================================================================
// OTHER HANDLERS
// ============================================================================

export function handleWheel(e) {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  // Use deltaY for zoom amount (works well for instant-scroll mice)
  const delta = Math.max(-150, Math.min(150, e.deltaY));
  const zoomFactor = 1 - (delta * 0.003); // ~30% zoom per 100 deltaY
  zoom(zoomFactor, mouseX, mouseY);
}

export function handleContextMenu(e) {
  // Disabled - right-click context menu removed
  e.preventDefault();
}

export function handleKeyDown(e) {
  if (!isVisible) return;

  // Ignore shortcuts when typing in input fields (except Escape)
  const isTyping = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);

  if (e.key === 'Escape') {
    if (mapState.isAddingNode || mapState.isCreatingEdge || mapState.isMerging) callbacks.exitAddMode();
    else if (!document.getElementById('nodeEditSheet').classList.contains('hidden')) closeNodeSheet();
    else callbacks.hideMap();
    e.preventDefault();
  }

  if (isTyping) return;  // Don't process other shortcuts when typing

  if (e.key === '+' || e.key === '=') { callbacks.enterAddNodeMode(); e.preventDefault(); }
}

// ============================================================================
// FAB VISIBILITY
// ============================================================================

export function showFab() { if (!timers.fabVisible) { timers.fabVisible = true; domRefs.fabContainer?.classList.remove('fab-hidden'); } clearTimeout(timers.fabHideTimer); }
export function scheduleFabShow() { clearTimeout(timers.fabHideTimer); timers.fabHideTimer = setTimeout(() => { timers.isInteracting = false; showFab(); }, 300); }

// ============================================================================
// NODE HIT DETECTION
// ============================================================================

export function getNodeAtPoint(x, y) {
  const hitRadius = Math.max(NODE_RADIUS, TOUCH_TARGET / 2 / mapState.viewport.scale);
  for (const node of mapState.nodes.values()) {
    if (Math.sqrt((node.x - x) ** 2 + (node.y - y) ** 2) <= hitRadius) return node;
  }
  return null;
}

// ============================================================================
// QUESTION MARK HIT DETECTION
// ============================================================================

/**
 * Check if a tap is on a question mark of an uncertain portal connection
 * @param {number} x - Canvas X coordinate
 * @param {number} y - Canvas Y coordinate
 * @returns {Object|null} Edge object if hit, null otherwise
 */
export function getQuestionMarkAtPoint(x, y) {
  const hitRadius = 15 / mapState.viewport.scale;  // 15px touch target in screen space

  for (const edge of mapState.edges.values()) {
    const from = mapState.nodes.get(edge.from);
    const to = mapState.nodes.get(edge.to);
    if (!from || !to) continue;

    // Determine connection type
    let connectionType = edge.connectionType;
    if (!connectionType && edge.command) {
      const direction = COMMAND_DIRECTIONS[edge.command.toLowerCase().trim()];
      if (direction && DIRECTION_TO_TYPE[direction]) {
        connectionType = DIRECTION_TO_TYPE[direction];
      }
    }
    if (!connectionType) connectionType = 'cardinal';

    // Check if this is an unverified portal edge (same criteria as rendering)
    const isUser = edge.isManual;
    if (connectionType === 'portal' && !isUser && !edge.isEdited && !from.isEdited && !to.isEdited) {
      // Calculate midpoint
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2;

      // Check if tap is within hit radius
      const dist = Math.sqrt((x - midX) ** 2 + (y - midY) ** 2);
      if (dist <= hitRadius) {
        return edge;
      }
    }
  }

  return null;
}
