/**
 * Map Canvas - Rendering Functions
 */

import { getLastLocationName } from './auto-mapper.js';
import {
  canvas, ctx, container, mapState,
  NODE_RADIUS, NODE_COLORS, NODE_ICONS,
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

    const isUser = edge.isManual || edge.isEdited;
    const connectionType = getConnectionType(edge);
    const style = CONNECTION_STYLES[connectionType] || CONNECTION_STYLES.cardinal;

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = style.color;
    ctx.setLineDash(style.dash);
    ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
    // Only draw arrows on user-created edges (to indicate one-way paths)
    // Auto-mapped edges don't have arrows since most IF rooms are bidirectional
    if (isUser) {
      drawArrow(from.x, from.y, to.x, to.y, style.color);
    }
    ctx.globalAlpha = 1; ctx.setLineDash([]);

    // User edit indicator - small dot at midpoint
    if (isUser) {
      const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
      ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#a78bfa'; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
    }
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
    const isSelected = mapState.selectedNode === node.id;
    // Current location check: only mark the PRIMARY node as current (not duplicates)
    // Primary node has id === name, duplicates have id like "Kitchen (2)"
    const isPrimaryNode = node.id === node.name;
    const isCurrent = currentLocationName && isPrimaryNode && node.name === currentLocationName;
    const isUser = node.isManual || node.isEdited;
    const isEdgeStart = mapState.edgeStartNode === node.id;
    // Only actual duplicates get special styling, not originals that have duplicates
    const isDuplicateNode = node.isDuplicate === true;

    // Determine fill color:
    // - Duplicates get orange
    // - Current location gets green
    // - Manually created nodes get purple
    // - Auto-mapped nodes stay blue even if edited (dashed border shows edits)
    let fillColor;
    if (isDuplicateNode) {
      fillColor = '#f97316';  // Orange for potential duplicates
    } else if (isCurrent) {
      fillColor = NODE_COLORS.current;
    } else if (node.isManual) {
      fillColor = NODE_COLORS.user;  // Purple only for manually created nodes
    } else {
      fillColor = NODE_COLORS.auto;  // Blue for auto-mapped (even if edited)
    }

    // Shadow & fill
    ctx.beginPath(); ctx.arc(node.x + 2, node.y + 2, NODE_RADIUS, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
    ctx.beginPath(); ctx.arc(node.x, node.y, NODE_RADIUS, 0, Math.PI * 2); ctx.fillStyle = fillColor; ctx.fill();

    // Border - user edits get dashed white, duplicates get dashed yellow
    ctx.lineWidth = isSelected || isEdgeStart ? 3 : 2;
    if (isDuplicateNode) {
      ctx.strokeStyle = '#fbbf24';  // Yellow border for duplicates
      ctx.setLineDash([4, 3]);
    } else if (isUser) {
      ctx.strokeStyle = '#ffffff';  // White dashed for user edits
      ctx.setLineDash([4, 3]);
    } else {
      ctx.strokeStyle = isSelected || isEdgeStart ? '#ffffff' : 'rgba(255,255,255,0.4)';
      ctx.setLineDash([]);
    }
    ctx.stroke(); ctx.setLineDash([]);

    // Glow
    if (isCurrent || isSelected || isEdgeStart) {
      ctx.beginPath(); ctx.arc(node.x, node.y, NODE_RADIUS + 4, 0, Math.PI * 2);
      ctx.strokeStyle = isCurrent ? 'rgba(34,197,94,0.5)' : isDuplicate ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 2; ctx.stroke();
    }

    // Icon
    ctx.fillStyle = '#ffffff'; ctx.font = '18px Material Icons'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(NODE_ICONS[node.type] || NODE_ICONS.room, node.x, node.y);

    // Label - show (2), (3), etc. for duplicates
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    let name = node.name || 'Unknown';
    // If this is a duplicate node, the ID contains the number like "Kitchen (2)"
    // but we show just the name. Add a small indicator.
    if (node.isDuplicate) {
      const match = node.id.match(/\((\d+)\)$/);
      if (match) name = `${name} ?${match[1]}`;
    } else if (node.hasDuplicates) {
      name = `${name} ?`;
    }
    if (name.length > 20) name = name.substring(0, 17) + '...';
    const tw = ctx.measureText(name).width, ly = node.y + NODE_RADIUS + 8;
    // Duplicates get orange background label
    ctx.fillStyle = isDuplicate ? 'rgba(249,115,22,0.8)' : 'rgba(0,0,0,0.6)';
    ctx.beginPath(); ctx.roundRect(node.x - tw / 2 - 4, ly - 6, tw + 8, 14, 4); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillText(name, node.x, ly);

    // User indicator (but not for duplicates - they have their own indicator)
    if (isUser && !isCurrent && !isDuplicate) {
      ctx.beginPath(); ctx.arc(node.x + NODE_RADIUS - 4, node.y - NODE_RADIUS + 4, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#a78bfa'; ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
    }

    // Duplicate indicator - question mark badge
    if (isDuplicate) {
      ctx.beginPath(); ctx.arc(node.x + NODE_RADIUS - 4, node.y - NODE_RADIUS + 4, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#fbbf24'; ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#000000'; ctx.font = 'bold 10px sans-serif';
      ctx.fillText('?', node.x + NODE_RADIUS - 4, node.y - NODE_RADIUS + 5);
    }
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
