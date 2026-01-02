/**
 * Map Canvas - Rendering Functions
 */

import { getLastLocationName } from './auto-mapper.js';
import {
  canvas, ctx, container, mapState,
  NODE_RADIUS, NODE_RADIUS_SMALL, SMALL_NODE_FADE_SCALE,
  NODE_COLORS, NODE_ICONS,
  CONNECTION_STYLES, DIRECTION_TO_TYPE, COMMAND_DIRECTIONS,
  timers
} from './map-config.js';

// ============================================================================
// CANVAS RESIZE
// ============================================================================

export function resizeCanvas() {
  if (!canvas || !container) return;
  const rect = container.querySelector('.map-canvas-container').getBoundingClientRect();
  const dpr = window.devicePixelRatio;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  render();
}

// ============================================================================
// MAIN RENDER
// ============================================================================

export function render() {
  if (!ctx || !canvas) return;
  const width = canvas.width / window.devicePixelRatio;
  const height = canvas.height / window.devicePixelRatio;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, width, height);
  drawGrid(width, height);

  ctx.save();
  ctx.translate(width / 2 + mapState.viewport.x, height / 2 + mapState.viewport.y);
  ctx.scale(mapState.viewport.scale, mapState.viewport.scale);
  drawEdges();
  if (mapState.isCreatingEdge && mapState.edgeStartNode && mapState.currentPointer) drawEdgePreview();
  drawNodes();
  ctx.restore();

  if (mapState.isAddingNode) drawAddModeCrosshair(width, height);
}

// ============================================================================
// GRID
// ============================================================================

function drawGrid(width, height) {
  const gridSize = 50 * mapState.viewport.scale;
  const offsetX = ((mapState.viewport.x + width / 2) % gridSize + gridSize) % gridSize;
  const offsetY = ((mapState.viewport.y + height / 2) % gridSize + gridSize) % gridSize;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  for (let x = offsetX; x < width; x += gridSize) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  for (let y = offsetY; y < height; y += gridSize) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
}

// ============================================================================
// EDGES
// ============================================================================

function drawEdges() {
  for (const edge of mapState.edges.values()) {
    const from = mapState.nodes.get(edge.from), to = mapState.nodes.get(edge.to);
    if (!from || !to) continue;

    const isUser = edge.isManual;
    const connectionType = getConnectionType(edge);
    const style = CONNECTION_STYLES[connectionType] || CONNECTION_STYLES.cardinal;

    // Color: purple for player-created, type color for auto-mapped
    const edgeColor = isUser ? '#8b5cf6' : style.color;

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = edgeColor;
    ctx.setLineDash(style.dash);
    ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
    // Only draw arrows when explicitly enabled (for one-way paths)
    if (edge.showArrow) {
      drawArrow(from.x, from.y, to.x, to.y, edgeColor);
    }
    ctx.globalAlpha = 1; ctx.setLineDash([]);
  }
}

// Determine connection type from edge command or explicit type
function getConnectionType(edge) {
  // User can override the type
  if (edge.connectionType) return edge.connectionType;
  // Derive from command
  if (edge.command) {
    const direction = COMMAND_DIRECTIONS[edge.command.toLowerCase().trim()];
    if (direction && DIRECTION_TO_TYPE[direction]) return DIRECTION_TO_TYPE[direction];
  }
  return 'cardinal';
}

function drawArrow(x1, y1, x2, y2, color) {
  const angle = Math.atan2(y2 - y1, x2 - x1), length = 12;
  const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  if (dist < NODE_RADIUS * 2) return;
  const ratio = (dist - NODE_RADIUS - 5) / dist;
  const ax = x1 + (x2 - x1) * ratio, ay = y1 + (y2 - y1) * ratio;
  ctx.setLineDash([]);
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(ax, ay); ctx.lineTo(ax - length * Math.cos(angle - Math.PI / 6), ay - length * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(ax, ay); ctx.lineTo(ax - length * Math.cos(angle + Math.PI / 6), ay - length * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

function drawEdgePreview() {
  const startNode = mapState.nodes.get(mapState.edgeStartNode);
  if (!startNode || !mapState.currentPointer) return;
  const endPoint = screenToCanvas(mapState.currentPointer.x, mapState.currentPointer.y);
  ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.globalAlpha = 0.7;
  ctx.beginPath(); ctx.moveTo(startNode.x, startNode.y); ctx.lineTo(endPoint.x, endPoint.y); ctx.stroke();
  ctx.setLineDash([]); ctx.globalAlpha = 1;
}

// ============================================================================
// NODES
// ============================================================================

function drawNodes() {
  const currentLocationName = getLastLocationName();
  for (const node of mapState.nodes.values()) {
    const isSmall = node.isSmall === true;
    const radius = isSmall ? NODE_RADIUS_SMALL : NODE_RADIUS;

    // Small nodes fade out when zoomed out
    if (isSmall && mapState.viewport.scale < SMALL_NODE_FADE_SCALE) {
      const fadeStart = SMALL_NODE_FADE_SCALE;
      const fadeEnd = SMALL_NODE_FADE_SCALE * 0.5;
      const alpha = Math.max(0, (mapState.viewport.scale - fadeEnd) / (fadeStart - fadeEnd));
      if (alpha <= 0) continue; // Skip drawing completely faded nodes
      ctx.globalAlpha = alpha;
    }

    const isSelected = mapState.selectedNode === node.id;
    // Current location check:
    // - Primary node (id === name) is current if name matches
    // - Duplicate node is current if it's selected AND name matches (player just arrived there)
    const isPrimaryNode = node.id === node.name;
    const isPrimaryCurrent = currentLocationName && isPrimaryNode && node.name === currentLocationName;
    const isDuplicateCurrent = currentLocationName && node.isDuplicate && isSelected && node.name === currentLocationName;
    const isCurrent = isPrimaryCurrent || isDuplicateCurrent;
    const isEdgeStart = mapState.edgeStartNode === node.id;
    const hasMergeConflict = node.isDuplicate === true;
    const hasNotes = node.notes && node.notes.trim().length > 0;
    const isEdited = node.isEdited && !node.isManual;

    // ========================================
    // FILL = Provenance (who made it)
    // ========================================
    // Blue = auto-mapped, Purple = player-created
    // Never changes for current location, duplicates, or edits
    const fillColor = node.isManual ? NODE_COLORS.user : NODE_COLORS.auto;

    // Shadow & fill
    ctx.beginPath(); ctx.arc(node.x + 2, node.y + 2, radius, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
    ctx.beginPath(); ctx.arc(node.x, node.y, radius, 0, Math.PI * 2); ctx.fillStyle = fillColor; ctx.fill();

    // ========================================
    // HALO = Attention (where you are)
    // ========================================
    // Green glow = current location, White glow = selected/focus
    // Never used for metadata or warnings
    ctx.lineWidth = isSmall ? 1.5 : 2;
    if (isCurrent) {
      // Strong green halo for current location
      ctx.beginPath(); ctx.arc(node.x, node.y, radius + 4, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(34,197,94,0.6)'; ctx.stroke();
      ctx.beginPath(); ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = '#22c55e'; ctx.lineWidth = isSmall ? 2 : 3; ctx.stroke();
    } else if (isSelected || isEdgeStart) {
      // Weaker white halo for selection
      ctx.beginPath(); ctx.arc(node.x, node.y, radius + 4, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.stroke();
      ctx.beginPath(); ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = isSmall ? 1.5 : 2.5; ctx.stroke();
    } else {
      // Default subtle border
      ctx.beginPath(); ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = isSmall ? 1.5 : 2; ctx.stroke();
    }

    // Icon (only if node has an icon type with a non-empty value)
    const iconChar = NODE_ICONS[node.type];
    if (iconChar) {
      const iconSize = isSmall ? 12 : 18;
      ctx.fillStyle = '#ffffff'; ctx.font = `${iconSize}px Material Icons`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(iconChar, node.x, node.y);
    }

    // Label
    const fontSize = isSmall ? 9 : 11;
    ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`;
    let name = (node.name || '').trim() || 'Unknown';
    if (name.length > 20) name = name.substring(0, 17) + '...';
    const tw = ctx.measureText(name).width, ly = node.y + radius + (isSmall ? 6 : 8);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath(); ctx.roundRect(node.x - tw / 2 - 4, ly - (isSmall ? 5 : 6), tw + 8, isSmall ? 12 : 14, 4); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillText(name, node.x, ly);

    // ========================================
    // BADGE = Player-relevant info (one at a time)
    // ========================================
    // Priority: merge conflict > notes > edited
    // Badges scaled down for small nodes
    const badgeScale = isSmall ? 0.7 : 1;
    const badgeX = node.x + radius - 4 * badgeScale;
    const badgeY = node.y - radius + 4 * badgeScale;

    if (hasMergeConflict) {
      // Merge conflict badge - yellow with warning icon
      ctx.beginPath(); ctx.arc(badgeX, badgeY, 8 * badgeScale, 0, Math.PI * 2);
      ctx.fillStyle = '#fbbf24'; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5 * badgeScale; ctx.stroke();
      ctx.fillStyle = '#000000'; ctx.font = `bold ${12 * badgeScale}px sans-serif`;
      ctx.fillText('?', badgeX, badgeY + 1);
    } else if (hasNotes) {
      // Notes badge - blue with note icon
      ctx.beginPath(); ctx.arc(badgeX, badgeY, 7 * badgeScale, 0, Math.PI * 2);
      ctx.fillStyle = '#3b82f6'; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5 * badgeScale; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.font = `${10 * badgeScale}px Material Icons`;
      ctx.fillText('edit_note', badgeX, badgeY + 1);
    } else if (isEdited) {
      // Edited badge - purple with edit icon
      ctx.beginPath(); ctx.arc(badgeX, badgeY, 6 * badgeScale, 0, Math.PI * 2);
      ctx.fillStyle = '#a78bfa'; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5 * badgeScale; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.font = `${8 * badgeScale}px Material Icons`;
      ctx.fillText('edit', badgeX, badgeY + 1);
    }

    // Reset alpha if we changed it for small nodes
    ctx.globalAlpha = 1;
  }
}

// ============================================================================
// OVERLAYS
// ============================================================================

function drawAddModeCrosshair(width, height) {
  if (!mapState.currentPointer) return;
  const { x, y } = mapState.currentPointer;
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)'; ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
  ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, NODE_RADIUS, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
}

export function drawLongPressProgress() {
  if (!timers.longPressNode || timers.longPressProgress <= 0) return;
  const node = mapState.nodes.get(timers.longPressNode);
  if (!node) return;
  const width = canvas.width / window.devicePixelRatio, height = canvas.height / window.devicePixelRatio;
  ctx.save();
  ctx.translate(width / 2 + mapState.viewport.x, height / 2 + mapState.viewport.y);
  ctx.scale(mapState.viewport.scale, mapState.viewport.scale);
  const radius = NODE_RADIUS + 8, startAngle = -Math.PI / 2, endAngle = startAngle + Math.PI * 2 * timers.longPressProgress;
  ctx.beginPath(); ctx.arc(node.x, node.y, radius, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(251,191,36,0.2)'; ctx.lineWidth = 4; ctx.stroke();
  ctx.beginPath(); ctx.arc(node.x, node.y, radius, startAngle, endAngle); ctx.strokeStyle = '#fbbf24'; ctx.lineCap = 'round'; ctx.stroke();
  const pulse = 1 + Math.sin(Date.now() / 100) * 0.1 * timers.longPressProgress;
  ctx.beginPath(); ctx.arc(node.x, node.y, radius * pulse, 0, Math.PI * 2); ctx.strokeStyle = `rgba(251,191,36,${0.3 * timers.longPressProgress})`; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}

// ============================================================================
// VIEWPORT UTILITIES
// ============================================================================

export function screenToCanvas(sx, sy) {
  const w = canvas.width / window.devicePixelRatio, h = canvas.height / window.devicePixelRatio;
  return { x: (sx - w / 2 - mapState.viewport.x) / mapState.viewport.scale, y: (sy - h / 2 - mapState.viewport.y) / mapState.viewport.scale };
}

export function zoom(factor) {
  mapState.viewport.scale = Math.max(0.25, Math.min(4, mapState.viewport.scale * factor));
  render();
}
