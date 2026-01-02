/**
 * Map Canvas - Input Handlers
 */

import {
  canvas, mapState, domRefs,
  NODE_RADIUS, TOUCH_TARGET, LONG_PRESS_DURATION,
  timers, touchState, isVisible
} from './map-config.js';
import { render, drawLongPressProgress, screenToCanvas, zoom } from './map-render.js';
import { openNodeSheet, createManualEdge, closeNodeSheet } from './map-sheet.js';

// Callbacks (set by map-canvas.js to avoid circular deps)
let callbacks = {
  addNodeAtPosition: () => {},
  exitAddMode: () => {},
  showHint: () => {},
  hideHint: () => {},
  saveMapForGame: () => {},
  hideMap: () => {},
  enterAddNodeMode: () => {},
  centerOnCurrentLocation: () => {}
};

export function setHandlerCallbacks(cbs) {
  callbacks = { ...callbacks, ...cbs };
}

// ============================================================================
// POINTER HANDLERS
// ============================================================================

export function handlePointerDown(e) {
  if (e.button !== 0) return;
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

  if (hitNode) {
    mapState.dragNode = hitNode; mapState.dragStart = { x, y }; touchState.touchStartTime = Date.now(); timers.longPressTriggered = false;
    startLongPressAnimation(hitNode.id);
    timers.longPressTimer = setTimeout(() => {
      timers.longPressTriggered = true; stopLongPressAnimation();
      mapState.isCreatingEdge = true; mapState.edgeStartNode = hitNode.id;
      callbacks.showHint('Drag to another location to create connection'); render();
    }, LONG_PRESS_DURATION);
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
  } else if (mapState.dragNode && mapState.dragStart && !mapState.isCreatingEdge) {
    const dx = x - mapState.dragStart.x, dy = y - mapState.dragStart.y;
    if (Math.sqrt(dx * dx + dy * dy) > 10) {
      clearTimeout(timers.longPressTimer); stopLongPressAnimation();
      mapState.dragNode.x += dx / mapState.viewport.scale;
      mapState.dragNode.y += dy / mapState.viewport.scale;
      mapState.dragNode.isEdited = true;
      mapState.protectedNodes.add(mapState.dragNode.id);
      mapState.dragStart = { x, y };
      render();
    }
  } else if ((mapState.isCreatingEdge && mapState.edgeStartNode) || mapState.isAddingNode) {
    render();
  }
}

export function handlePointerUp(e) {
  clearTimeout(timers.longPressTimer); stopLongPressAnimation();
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  const canvasPoint = screenToCanvas(x, y);
  const hitNode = getNodeAtPoint(canvasPoint.x, canvasPoint.y);

  if (mapState.isCreatingEdge && mapState.edgeStartNode && timers.longPressTriggered) {
    if (hitNode && hitNode.id !== mapState.edgeStartNode) createManualEdge(mapState.edgeStartNode, hitNode.id);
    mapState.isCreatingEdge = false; mapState.edgeStartNode = null; callbacks.hideHint();
  } else if (mapState.dragNode && !mapState.isDragging && !timers.longPressTriggered) {
    if (Date.now() - touchState.touchStartTime < 250) openNodeSheet(mapState.dragNode);
    else callbacks.saveMapForGame();
  } else if (!hitNode && !mapState.hasDragged && !mapState.isCreatingEdge && !mapState.isAddingNode) {
    // Double-tap detection: add node on empty canvas (only if no drag movement)
    const now = Date.now();
    const tapDx = x - touchState.lastTapPosition.x;
    const tapDy = y - touchState.lastTapPosition.y;
    const tapDist = Math.sqrt(tapDx * tapDx + tapDy * tapDy);
    if (now - touchState.lastTapTime < 300 && tapDist < 30) {
      callbacks.addNodeAtPosition(canvasPoint.x, canvasPoint.y);
      touchState.lastTapTime = 0; // Reset to prevent triple-tap
    } else {
      touchState.lastTapTime = now;
      touchState.lastTapPosition = { x, y };
    }
  }

  mapState.isDragging = false; mapState.dragStart = null; mapState.dragNode = null; mapState.hasDragged = false; timers.longPressTriggered = false;
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
    clearTimeout(timers.longPressTimer); stopLongPressAnimation();
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
    if (touchState.lastTouchDistance > 0) mapState.viewport.scale = Math.max(0.25, Math.min(4, mapState.viewport.scale * distance / touchState.lastTouchDistance));
    touchState.lastTouchDistance = distance;
    const center = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
    mapState.viewport.x += center.x - touchState.lastTouchCenter.x;
    mapState.viewport.y += center.y - touchState.lastTouchCenter.y;
    touchState.lastTouchCenter = center;
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

export function handleWheel(e) { e.preventDefault(); zoom(e.deltaY > 0 ? 0.85 : 1.15); }

export function handleContextMenu(e) {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  mapState.currentPointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  domRefs.contextMenu.style.left = e.clientX + 'px';
  domRefs.contextMenu.style.top = e.clientY + 'px';
  domRefs.contextMenu.classList.remove('hidden');
}

export function handleCtxAddNode() {
  domRefs.contextMenu.classList.add('hidden');
  if (mapState.currentPointer) callbacks.addNodeAtPosition(...Object.values(screenToCanvas(mapState.currentPointer.x, mapState.currentPointer.y)));
}

export function handleCtxCenterView() {
  domRefs.contextMenu.classList.add('hidden');
  if (mapState.currentPointer) {
    const p = screenToCanvas(mapState.currentPointer.x, mapState.currentPointer.y);
    mapState.viewport.x = -p.x * mapState.viewport.scale;
    mapState.viewport.y = -p.y * mapState.viewport.scale;
    render();
  }
}

export function handleKeyDown(e) {
  if (!isVisible) return;

  // Ignore shortcuts when typing in input fields (except Escape)
  const isTyping = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);

  if (e.key === 'Escape') {
    if (mapState.isAddingNode || mapState.isCreatingEdge) callbacks.exitAddMode();
    else if (!document.getElementById('nodeEditSheet').classList.contains('hidden')) closeNodeSheet();
    else callbacks.hideMap();
    e.preventDefault();
  }

  if (isTyping) return;  // Don't process other shortcuts when typing

  if (e.key === '+' || e.key === '=') { callbacks.enterAddNodeMode(); e.preventDefault(); }
  if (e.key === 'c' || e.key === 'C') { callbacks.centerOnCurrentLocation(); e.preventDefault(); }
}

// ============================================================================
// LONG PRESS ANIMATION
// ============================================================================

export function startLongPressAnimation(nodeId) {
  timers.longPressNode = nodeId; timers.longPressStartTime = Date.now(); timers.longPressProgress = 0;
  (function animate() {
    timers.longPressProgress = Math.min((Date.now() - timers.longPressStartTime) / LONG_PRESS_DURATION, 1);
    render(); drawLongPressProgress();
    if (timers.longPressProgress < 1 && timers.longPressNode) timers.longPressAnimationFrame = requestAnimationFrame(animate);
  })();
}

export function stopLongPressAnimation() {
  if (timers.longPressAnimationFrame) cancelAnimationFrame(timers.longPressAnimationFrame);
  timers.longPressAnimationFrame = null; timers.longPressNode = null; timers.longPressProgress = 0; timers.longPressStartTime = 0;
}

// ============================================================================
// FAB VISIBILITY
// ============================================================================

export function showFab() { if (!timers.fabVisible) { timers.fabVisible = true; domRefs.fabContainer?.classList.remove('fab-hidden'); } clearTimeout(timers.fabHideTimer); }
export function hideFab() { if (timers.fabVisible && timers.isInteracting) { timers.fabVisible = false; domRefs.fabContainer?.classList.add('fab-hidden'); } }
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
