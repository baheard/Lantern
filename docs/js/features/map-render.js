/**
 * Map Canvas - Rendering Functions
 */

import {
  canvas, ctx, container, mapState,
  GRID_SIZE, NODE_RADIUS, NODE_RADIUS_SMALL, SMALL_NODE_FADE_SCALE,
  NODE_COLORS, NODE_ICONS,
  CONNECTION_STYLES, DIRECTION_TO_TYPE, COMMAND_DIRECTIONS,
  DIRECTION_OFFSETS, DIRECTION_OPPOSITES,
  timers
} from './map-config.js';

// If an edge is a "bent" cardinal connection — both ends have a known cardinal heading and
// they are NOT opposites (e.g. Anchorhead: leave SE, return SW) — return the two end
// headings so it can be drawn as a curve. Reciprocal or single-ended connections → null (straight).
function edgeBentDirections(edge) {
  const fwd = COMMAND_DIRECTIONS[(edge.command || '').toLowerCase().trim()];
  const rev = COMMAND_DIRECTIONS[(edge.reverseCommand || '').toLowerCase().trim()];
  if (!fwd || !rev) return null;
  if (DIRECTION_TO_TYPE[fwd] !== 'cardinal' || DIRECTION_TO_TYPE[rev] !== 'cardinal') return null;
  if (rev === DIRECTION_OPPOSITES[fwd]) return null;
  return { fromDir: fwd, toDir: rev };
}

// Unit vector for a canonical direction, derived from its grid offset.
function dirUnit(dir) {
  const o = DIRECTION_OFFSETS[dir];
  if (!o) return { x: 0, y: 0 };
  const len = Math.hypot(o.x, o.y) || 1;
  return { x: o.x / len, y: o.y / len };
}

// Split a node label into 1 or 2 lines at a word boundary.
// Each line is limited to maxChars; the second line is truncated with "…" if needed.
function splitNodeLabel(name, maxChars) {
  if (name.length <= maxChars) return [name];
  const splitAt = name.lastIndexOf(' ', maxChars);
  if (splitAt <= 0) return [name.substring(0, maxChars - 1) + '…'];
  const line1 = name.substring(0, splitAt).trim();
  let line2 = name.substring(splitAt + 1).trim();
  if (line2.length > maxChars) line2 = line2.substring(0, maxChars - 1) + '…';
  return [line1, line2];
}

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
  if (mapState.isRectSelecting && mapState.rectSelectStart && mapState.rectSelectEnd) drawRectSelect(width, height);
}

// ============================================================================
// GRID
// ============================================================================

function drawGrid(width, height) {
  const gridSize = GRID_SIZE * mapState.viewport.scale;
  const offsetX = ((mapState.viewport.x + width / 2) % gridSize + gridSize) % gridSize;
  const offsetY = ((mapState.viewport.y + height / 2) % gridSize + gridSize) % gridSize;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  for (let x = offsetX; x < width; x += gridSize) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  for (let y = offsetY; y < height; y += gridSize) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
}

// ============================================================================
// EDGES
// ============================================================================

function drawEdges() {
  const portalEdgesToMark = [];

  for (const edge of mapState.edges.values()) {
    const from = mapState.nodes.get(edge.from), to = mapState.nodes.get(edge.to);
    if (!from || !to) continue;

    const isUser = edge.isManual;
    const connectionType = getConnectionType(edge);
    const style = CONNECTION_STYLES[connectionType] || CONNECTION_STYLES.cardinal;

    // Player-created: purple with type dash pattern. Auto-mapped: blue with type dash pattern
    const edgeColor = isUser ? '#8b5cf6' : style.color;
    // Scale dash values by 1/viewport.scale so dashes are constant size on screen
    const s = mapState.viewport.scale;
    const edgeDash = style.dash.length ? style.dash.map(v => v / s) : [];

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = edgeColor;
    ctx.setLineDash(edgeDash);
    ctx.globalAlpha = 0.8;
    // Bent cardinal connections (e.g. leave SE, return SW) curve so each end leaves its node
    // along its own heading; everything else draws as a straight line.
    const bent = edgeBentDirections(edge);
    ctx.beginPath();
    if (bent) {
      const u1 = dirUnit(bent.fromDir), u2 = dirUnit(bent.toDir);
      const r1 = from.isSmall ? NODE_RADIUS_SMALL : NODE_RADIUS;
      const r2 = to.isSmall ? NODE_RADIUS_SMALL : NODE_RADIUS;
      // Anchor each end at the node's rim along its own heading, so the curve visibly leaves
      // the edge of the circle in that direction — not from the hidden, distorted center.
      const sx = from.x + u1.x * r1, sy = from.y + u1.y * r1;
      const ex = to.x + u2.x * r2, ey = to.y + u2.y * r2;
      const dist = Math.hypot(ex - sx, ey - sy);
      const k = Math.min(dist * 0.45, GRID_SIZE * 0.6); // gentle control-point reach
      ctx.moveTo(sx, sy);
      ctx.bezierCurveTo(sx + u1.x * k, sy + u1.y * k, ex + u2.x * k, ey + u2.y * k, ex, ey);
    } else {
      ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1; ctx.setLineDash([]);

    // Track portal edges where neither node has been edited
    if (connectionType === 'portal' && !isUser && !edge.isEdited && !from.isEdited && !to.isEdited) {
      portalEdgesToMark.push({ from, to });
    }
  }

  // Draw question marks on unverified portal edges
  for (const { from, to } of portalEdgesToMark) {
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;

    // Draw background circle
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(midX, midY, 10, 0, Math.PI * 2);
    ctx.fill();

    // Draw question mark
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', midX, midY);
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
  for (const node of mapState.nodes.values()) {
    const isSmall = node.isSmall === true;
    const radius = isSmall ? NODE_RADIUS_SMALL : NODE_RADIUS;

    const isSelected = mapState.selectedNode === node.id;
    const isInSelection = mapState.selectedNodes.has(node.id);
    // Current location check - use explicit currentNodeId for precise tracking
    // This handles duplicates correctly: the specific node the player is at is marked current
    const isCurrent = mapState.currentNodeId === node.id;
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

    // Amber dashed ring for multi-selected nodes — drawn before fill so it sits under halos
    if (isInSelection) {
      ctx.beginPath(); ctx.arc(node.x, node.y, radius + 7, 0, Math.PI * 2);
      ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = isSmall ? 1.5 : 2;
      ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
    }

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
      // White outer halo when also selected, then green ring on top
      if (isSelected) {
        ctx.beginPath(); ctx.arc(node.x, node.y, radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = isSmall ? 1.5 : 2; ctx.stroke();
      }
      // Strong green ring for current location
      ctx.beginPath(); ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = '#22c55e'; ctx.lineWidth = isSmall ? 2.5 : 3.5; ctx.stroke();
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

    // Label — up to 2 lines, same width limit per line as before
    const fontSize = isSmall ? 9 : 11;
    ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const rawName = (node.name || '').trim() || 'Unknown';
    const maxChars = isSmall ? 13 : 20;
    const lines = splitNodeLabel(rawName, maxChars);
    const lineH = isSmall ? 12 : 14;
    const lineGap = 2;
    const boxPadH = 4;
    const boxPadV = 4;
    const maxLineW = Math.max(...lines.map(l => ctx.measureText(l).width));
    const totalTextH = lines.length * lineH + (lines.length - 1) * lineGap;
    const boxH = totalTextH + boxPadV;
    const topY = node.y + radius + (isSmall ? 6 : 8);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath(); ctx.roundRect(node.x - maxLineW / 2 - boxPadH, topY, maxLineW + boxPadH * 2, boxH, 4); ctx.fill();
    ctx.fillStyle = '#ffffff';
    lines.forEach((line, i) => {
      ctx.fillText(line, node.x, topY + boxPadV / 2 + i * (lineH + lineGap) + lineH / 2);
    });

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
      // Edited badge - small subtle purple dot (manually repositioned nodes)
      ctx.beginPath(); ctx.arc(badgeX, badgeY, 3.5 * badgeScale, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(167, 139, 250, 0.9)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'; ctx.lineWidth = 1 * badgeScale; ctx.stroke();
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

function drawRectSelect(width, height) {
  const start = mapState.rectSelectStart, end = mapState.rectSelectEnd;
  if (!start || !end) return;
  const s = mapState.viewport.scale;
  const cx = width / 2 + mapState.viewport.x, cy = height / 2 + mapState.viewport.y;
  const x1 = start.x * s + cx, y1 = start.y * s + cy;
  const x2 = end.x * s + cx, y2 = end.y * s + cy;
  const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
  const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
  ctx.fillStyle = 'rgba(251,191,36,0.08)';
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.beginPath(); ctx.rect(rx, ry, rw, rh);
  ctx.fill(); ctx.stroke();
  ctx.setLineDash([]);
}

// ============================================================================
// VIEWPORT UTILITIES
// ============================================================================

export function screenToCanvas(sx, sy) {
  const w = canvas.width / window.devicePixelRatio, h = canvas.height / window.devicePixelRatio;
  return { x: (sx - w / 2 - mapState.viewport.x) / mapState.viewport.scale, y: (sy - h / 2 - mapState.viewport.y) / mapState.viewport.scale };
}

export function zoom(factor, mouseX, mouseY) {
  const oldScale = mapState.viewport.scale;
  const newScale = Math.max(0.25, Math.min(4, oldScale * factor));

  // Zoom toward cursor position (if provided)
  if (mouseX !== undefined && mouseY !== undefined) {
    const w = canvas.width / window.devicePixelRatio;
    const h = canvas.height / window.devicePixelRatio;

    // Get canvas coordinates of mouse position before zoom
    const canvasX = (mouseX - w / 2 - mapState.viewport.x) / oldScale;
    const canvasY = (mouseY - h / 2 - mapState.viewport.y) / oldScale;

    // Adjust viewport so the canvas point stays under the cursor
    mapState.viewport.x = mouseX - w / 2 - canvasX * newScale;
    mapState.viewport.y = mouseY - h / 2 - canvasY * newScale;
  }

  mapState.viewport.scale = newScale;
  render();
}
