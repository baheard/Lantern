/**
 * Map Canvas - Rendering Functions
 */

import { getCurrentLocation } from './auto-mapper.js';
import {
  canvas, ctx, container, mapState,
  NODE_RADIUS, NODE_COLORS, NODE_ICONS,
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
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = isUser ? '#a78bfa' : '#60a5fa';
    ctx.setLineDash(isUser ? [8, 4] : []);
    ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
    drawArrow(from.x, from.y, to.x, to.y);
    ctx.globalAlpha = 1; ctx.setLineDash([]);
  }
}

function drawArrow(x1, y1, x2, y2) {
  const angle = Math.atan2(y2 - y1, x2 - x1), length = 12;
  const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  if (dist < NODE_RADIUS * 2) return;
  const ratio = (dist - NODE_RADIUS - 5) / dist;
  const ax = x1 + (x2 - x1) * ratio, ay = y1 + (y2 - y1) * ratio;
  ctx.setLineDash([]);
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
  const currentLocation = getCurrentLocation();
  for (const node of mapState.nodes.values()) {
    const isSelected = mapState.selectedNode === node.id;
    const isCurrent = currentLocation?.id === node.id;
    const isUser = node.isManual || node.isEdited;
    const isEdgeStart = mapState.edgeStartNode === node.id;
    const fillColor = isCurrent ? NODE_COLORS.current : isUser ? NODE_COLORS.user : NODE_COLORS.auto;

    // Shadow & fill
    ctx.beginPath(); ctx.arc(node.x + 2, node.y + 2, NODE_RADIUS, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
    ctx.beginPath(); ctx.arc(node.x, node.y, NODE_RADIUS, 0, Math.PI * 2); ctx.fillStyle = fillColor; ctx.fill();

    // Border
    ctx.lineWidth = isSelected || isEdgeStart ? 3 : 2;
    ctx.strokeStyle = isUser ? '#ffffff' : (isSelected || isEdgeStart ? '#ffffff' : 'rgba(255,255,255,0.4)');
    ctx.setLineDash(isUser ? [4, 3] : []);
    ctx.stroke(); ctx.setLineDash([]);

    // Glow
    if (isCurrent || isSelected || isEdgeStart) {
      ctx.beginPath(); ctx.arc(node.x, node.y, NODE_RADIUS + 4, 0, Math.PI * 2);
      ctx.strokeStyle = isCurrent ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 2; ctx.stroke();
    }

    // Icon
    ctx.fillStyle = '#ffffff'; ctx.font = '18px Material Icons'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(NODE_ICONS[node.type] || NODE_ICONS.room, node.x, node.y);

    // Label
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    let name = node.name || 'Unknown';
    if (name.length > 18) name = name.substring(0, 15) + '...';
    const tw = ctx.measureText(name).width, ly = node.y + NODE_RADIUS + 8;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.roundRect(node.x - tw / 2 - 4, ly - 6, tw + 8, 14, 4); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillText(name, node.x, ly);

    // User indicator
    if (isUser && !isCurrent) {
      ctx.beginPath(); ctx.arc(node.x + NODE_RADIUS - 4, node.y - NODE_RADIUS + 4, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#a78bfa'; ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
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
