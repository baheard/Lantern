/**
 * Map Canvas - Bottom Sheet and Node/Edge CRUD
 */

import {
  container, mapState, domRefs,
  NODE_ICONS, CONNECTION_TYPES,
  CARDINAL_DIRECTIONS, DIRECTION_SHORT_LABELS, DIRECTION_COMMAND_TOKENS,
  COMMAND_DIRECTIONS, DIRECTION_TO_TYPE
} from './map-config.js';
import { render } from './map-render.js';
import { escapeHtml } from '../utils/text-processing.js';
import { getLocationImageUrl } from './location-art.js';
import { ensureArtOverlay, openArtOverlay } from './art-overlay.js';

// Look up + show (or hide) the location image for a node in the open sheet.
// The `has-art` class on the sheet drives all visibility (inline image, header
// thumbnail) via CSS; the responsive layout (side-by-side vs. stacked) is pure CSS.
// Gated by the shared location-art setting (getLocationImageUrl returns null when off).
async function updateNodeImage(node) {
  const sheet = document.getElementById('nodeEditSheet');
  const img = document.getElementById('nodeLocationImage');
  const thumb = document.getElementById('nodeImageThumb');
  if (!sheet || !img) return;
  sheet.classList.remove('has-art');
  img.removeAttribute('src');
  if (thumb) thumb.removeAttribute('src');
  const url = await getLocationImageUrl(node.name);
  if (!url) return;
  // Guard against a slow fetch resolving after the user opened a different node.
  if (mapState.selectedNode !== node.id) return;
  // If the file is listed but missing/unloadable, show nothing (no broken-image icon).
  img.onerror = () => { sheet.classList.remove('has-art'); img.removeAttribute('src'); };
  img.src = url;
  img.alt = node.name;
  if (thumb) thumb.src = url;
  sheet.classList.add('has-art');
}

// Callbacks (set by map-canvas.js to avoid circular deps)
let callbacks = {
  showHint: () => {},
  saveMapForGame: () => {},
  startConnectionFromSheetCallback: () => {},
  startMergeFromSheetCallback: () => {},
  snapshotForUndo: () => {},
  shareNodeToMap: () => {},
  syncSharedNode: () => {},
  recomputeSharedIds: () => {}
};

// Whether the current edit session has already captured an undo snapshot.
// Reset when the sheet opens; the first field change of a session snapshots
// once (lazily), so an open/close with no change adds nothing to the stack.
let editSnapshotTaken = false;

export function setSheetCallbacks(cbs) {
  callbacks = { ...callbacks, ...cbs };
}

// Snapshot once per edit session, on the first field change. Subsequent changes
// in the same session fold into that one snapshot, so one undo reverts them all.
function captureEditSnapshot() {
  if (!editSnapshotTaken) {
    callbacks.snapshotForUndo();
    editSnapshotTaken = true;
  }
}

// ============================================================================
// UI CREATION
// ============================================================================

export function createNodeEditSheet() {
  // Create backdrop for tap-to-close
  const backdrop = document.createElement('div');
  backdrop.id = 'nodeEditBackdrop';
  backdrop.className = 'node-edit-backdrop hidden';
  // Append to body so it can appear above controls
  document.body.appendChild(backdrop);

  const sheet = document.createElement('div');
  sheet.id = 'nodeEditSheet';
  sheet.className = 'node-edit-sheet hidden';
  sheet.innerHTML = `
    <div class="sheet-handle-area" id="sheetHandleArea">
      <div class="sheet-handle" aria-hidden="true"></div>
    </div>
    <div class="sheet-content">
      <div class="sheet-header">
        <div class="sheet-header-left">
          <span class="sheet-node-badge" id="sheetNodeBadge">Auto</span>
          <h3 id="sheetNodeName">Edit Location</h3>
          <img id="nodeImageThumb" class="node-art-thumb" alt="" title="View location art">
        </div>
        <button class="sheet-close-btn" id="sheetCloseBtn" aria-label="Close">
          <span class="material-icons">close</span>
        </button>
      </div>
      <div class="sheet-body">
        <div class="sheet-body-main">
        <div class="sheet-body-art" id="nodeImageField">
          <img id="nodeLocationImage" class="node-location-image" alt="" loading="lazy">
        </div>
        <div class="sheet-field sheet-field-inline">
          <div class="field-primary">
            <label for="nodeNameInput">Name <span class="field-hint">(max 100 characters)</span></label>
            <input type="text" id="nodeNameInput" placeholder="Location name" autocomplete="off" maxlength="100">
          </div>
          <div class="field-secondary">
            <label for="nodeSmallToggle">Small</label>
            <button class="toggle-btn" id="nodeSmallToggle" role="switch" aria-checked="false">
              <span class="toggle-track"><span class="toggle-thumb"></span></span>
            </button>
          </div>
        </div>
        <div class="sheet-field">
          <label for="nodeNotesInput">Notes <span class="field-hint">(max 500 characters)</span></label>
          <textarea id="nodeNotesInput" placeholder="Add notes about this location..." rows="3" maxlength="500"></textarea>
        </div>
        <div class="sheet-field">
          <label>Icon</label>
          <div class="node-type-picker" id="nodeTypePicker" role="radiogroup" aria-label="Location icon">
            ${[
              { type: 'location', label: 'None', icon: '' },
              { type: 'person', label: 'Person', icon: 'person' },
              { type: 'door', label: 'Door', icon: 'door_front' },
              { type: 'puzzle', label: 'Puzzle', icon: 'extension' },
              { type: 'star', label: 'Hand', icon: 'back_hand' },
              { type: 'question', label: 'Question', icon: 'question_mark' }
            ].map(t =>
              `<button class="type-btn" data-type="${t.type}" aria-label="${t.label}" role="radio" title="${t.label}">
                ${t.icon ? `<span class="material-icons">${t.icon}</span>` : '<span class="no-icon">—</span>'}
              </button>`
            ).join('')}
          </div>
        </div>
        <div class="sheet-field" id="nodeConnectionsField">
          <label>Exits</label>
          <div class="node-connections-list" id="nodeConnectionsList"></div>
        </div>
        <div class="sheet-merge-section hidden" id="nodeMergeSection">
          <label>This may be a duplicate</label>
          <p class="merge-hint">If this is the same location as the original, merge them. Or mark as not a duplicate.</p>
          <div class="merge-buttons">
            <button class="sheet-btn sheet-btn-merge" id="nodeMergeBtn">
              <span class="material-icons">merge</span> Merge
            </button>
            <button class="sheet-btn sheet-btn-secondary" id="nodeNotDuplicateBtn">
              <span class="material-icons">link_off</span> Not a Duplicate
            </button>
          </div>
        </div>
        <div class="sheet-actions">
          <button class="sheet-btn sheet-btn-secondary" id="nodeConnectBtn">
            <span class="material-icons">add_link</span> Add Connection
          </button>
          <button class="sheet-btn sheet-btn-secondary" id="nodeMergeWithBtn">
            <span class="material-icons">merge</span> Merge with...
          </button>
          <button class="sheet-btn sheet-btn-secondary" id="nodeShareMapBtn">
            <span class="material-icons">link</span> Share to map
          </button>
          <button class="sheet-btn sheet-btn-danger" id="nodeDeleteBtn">
            <span class="material-icons">delete</span> Delete
          </button>
        </div>
        <div class="sheet-actions share-map-menu hidden" id="nodeShareMapMenu"></div>
        </div>
      </div>
    </div>
  `;
  // Append to body so it can appear above controls
  document.body.appendChild(sheet);

  // Full-screen art lightbox is shared (art-overlay.js) — ensure it exists.
  ensureArtOverlay();
  // Tapping the inline image or the header thumbnail opens the overlay on the
  // sheet's current image, captioned with the location name.
  const openFromSheet = () => {
    const img = document.getElementById('nodeLocationImage');
    const nameInput = document.getElementById('nodeNameInput');
    if (img && img.getAttribute('src')) openArtOverlay(img.src, nameInput ? nameInput.value : '', { pinned: true });
  };
  sheet.querySelector('#nodeLocationImage').addEventListener('click', openFromSheet);
  sheet.querySelector('#nodeImageThumb').addEventListener('click', openFromSheet);
}

// ============================================================================
// SHEET OPERATIONS
// ============================================================================

export function openNodeSheet(node) {
  mapState.selectedNode = node.id;

  // Start a fresh edit session; first field change will snapshot for undo.
  editSnapshotTaken = false;

  // Collapse the "Share to map" submenu from any previous open.
  document.getElementById('nodeShareMapMenu')?.classList.add('hidden');

  const isDuplicate = node.isDuplicate || node.hasDuplicates;
  const badge = document.getElementById('sheetNodeBadge');

  // Set badge - only distinguish duplicates (user edits shown by dashed border on node)
  if (isDuplicate) {
    badge.textContent = 'Possible duplicate';
    badge.className = 'sheet-node-badge duplicate';
  } else if (node.isManual) {
    badge.textContent = 'Your location';
    badge.className = 'sheet-node-badge user';
  } else {
    badge.textContent = '';
    badge.className = 'sheet-node-badge auto';
  }

  const isCurrent = node.id === mapState.currentNodeId;
  const nameEl = document.getElementById('sheetNodeName');
  nameEl.textContent = node.name || 'Edit Location';
  const existingTag = nameEl.querySelector('.sheet-current-tag');
  if (existingTag) existingTag.remove();
  if (isCurrent) {
    const tag = document.createElement('span');
    tag.className = 'sheet-current-tag';
    tag.textContent = 'Current';
    nameEl.appendChild(tag);
  }
  document.getElementById('nodeNameInput').value = node.name || '';
  document.getElementById('nodeNotesInput').value = node.notes || '';

  // Show the generated location art for this room, if we have any (async; self-guards).
  updateNodeImage(node);

  // Update type picker - default to 'location' if no type set
  const nodeType = node.type || 'location';
  document.querySelectorAll('#nodeTypePicker .type-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === nodeType);
    btn.setAttribute('aria-checked', btn.dataset.type === nodeType);
  });

  // Update small toggle
  const smallToggle = document.getElementById('nodeSmallToggle');
  smallToggle.classList.toggle('active', node.isSmall === true);
  smallToggle.setAttribute('aria-checked', node.isSmall === true);

  populateConnectionsList(node);

  // Show/hide merge section for duplicates
  const mergeSection = document.getElementById('nodeMergeSection');
  const mergeBtn = document.getElementById('nodeMergeBtn');
  if (node.isDuplicate && node.originalNodeId) {
    const originalNode = mapState.nodes.get(node.originalNodeId);
    if (originalNode) {
      // Original exists - allow merge
      mergeSection.classList.remove('hidden');
      mergeSection.querySelector('.merge-hint').textContent =
        `If this is the same as "${originalNode.name}", merge to combine their connections.`;
      mergeBtn.disabled = false;
      mergeBtn.innerHTML = '<span class="material-icons">merge</span> Merge with Original';
    } else {
      // Original was deleted - offer to promote this to primary
      mergeSection.classList.remove('hidden');
      mergeSection.querySelector('.merge-hint').textContent =
        `The original "${node.name}" was deleted. Make this the primary location?`;
      mergeBtn.disabled = false;
      mergeBtn.innerHTML = '<span class="material-icons">check_circle</span> Make Primary';
    }
  } else {
    mergeSection.classList.add('hidden');
  }

  const sheet = document.getElementById('nodeEditSheet');
  document.getElementById('nodeEditBackdrop').classList.remove('hidden');
  sheet.classList.remove('hidden');

  // Restore saved height preference, constrained to visible viewport
  const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  sheet.style.top = `${getSheetTopForViewport(viewportHeight)}px`;

  render();
}

export function dismissNodeSheet() {
  const sheet = document.getElementById('nodeEditSheet');
  if (!sheet || sheet.classList.contains('hidden')) return;
  sheet.style.transition = 'transform 0.15s ease-out';
  sheet.style.transform = 'translateY(100%)';
  setTimeout(() => {
    sheet.style.transition = '';
    sheet.style.transform = '';
    closeNodeSheet();
  }, 150);
}

export function closeNodeSheet() {
  const sheet = document.getElementById('nodeEditSheet');
  sheet.classList.add('hidden');
  document.getElementById('nodeEditBackdrop').classList.add('hidden');

  // Prevent viewport resize re-center while keyboard is dismissing from this sheet close
  mapState.sheetClosing = true;
  setTimeout(() => { mapState.sheetClosing = false; }, 500);

  mapState.selectedNode = null;
  render();

  // Undo for edits is captured lazily on the first field change (see edit
  // handlers below), so there is nothing to push on close.
  callbacks.saveMapForGame();
}

// ============================================================================
// SHEET DRAG-TO-DISMISS
// ============================================================================

const SHEET_TOP_KEY = 'lantern_map_sheet_top_percent';
let sheetDragState = { isDragging: false, startY: 0, startTop: 0 };

export function setupSheetDragHandlers() {
  const sheet = document.getElementById('nodeEditSheet');
  const handleArea = document.getElementById('sheetHandleArea');
  const backdrop = document.getElementById('nodeEditBackdrop');

  // Tap backdrop to close (stop propagation to prevent map overlay from also closing)
  backdrop.addEventListener('click', (e) => {
    e.stopPropagation();
    dismissNodeSheet();
  });

  // Stop handle clicks/touches from bubbling to the map backdrop
  handleArea.addEventListener('click', (e) => e.stopPropagation());

  handleArea.addEventListener('touchstart', onSheetDragStart, { passive: false });
  handleArea.addEventListener('mousedown', onSheetDragStart);

  document.addEventListener('touchmove', onSheetDragMove, { passive: false });
  document.addEventListener('mousemove', onSheetDragMove);

  document.addEventListener('touchend', onSheetDragEnd);
  document.addEventListener('mouseup', onSheetDragEnd);
}

function onSheetDragStart(e) {
  const sheet = document.getElementById('nodeEditSheet');
  if (sheet.classList.contains('hidden')) return;

  sheetDragState.isDragging = true;
  sheetDragState.startY = e.touches ? e.touches[0].clientY : e.clientY;
  sheetDragState.startTop = sheet.getBoundingClientRect().top;
  sheet.style.transition = 'none';
  e.stopPropagation();
  e.preventDefault();
}

function onSheetDragMove(e) {
  if (!sheetDragState.isDragging) return;

  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const deltaY = clientY - sheetDragState.startY;
  const newTop = Math.max(80, sheetDragState.startTop + deltaY);
  const sheet = document.getElementById('nodeEditSheet');
  sheet.style.top = `${newTop}px`;
  e.preventDefault();
}

function onSheetDragEnd() {
  if (!sheetDragState.isDragging) return;

  sheetDragState.isDragging = false;
  const sheet = document.getElementById('nodeEditSheet');
  sheet.style.transition = '';

  const viewportHeight = window.innerHeight;
  const currentTop = parseFloat(sheet.style.top) || sheetDragState.startTop;

  // Dismiss if sheet covers less than 20% of screen height
  if (currentTop > viewportHeight * 0.8) {
    sheet.style.top = '';
    dismissNodeSheet();
  } else {
    // Save height preference as % of screen
    try {
      localStorage.setItem(SHEET_TOP_KEY, ((currentTop / viewportHeight) * 100).toString());
    } catch (err) {}
  }
}

export function getSheetTopForViewport(viewportHeight) {
  const topGap = 80;
  const minTopForKeyboard = window.innerHeight - viewportHeight + topGap;
  try {
    const saved = parseFloat(localStorage.getItem(SHEET_TOP_KEY) || '');
    if (!isNaN(saved)) {
      const savedPx = (saved / 100) * window.innerHeight;
      return Math.max(savedPx, minTopForKeyboard, topGap);
    }
  } catch (err) {}
  return Math.max(minTopForKeyboard, topGap);
}

function populateConnectionsList(node) {
  const list = document.getElementById('nodeConnectionsList');
  const conns = [];
  for (const [key, edge] of mapState.edges) {
    if (edge.from === node.id) { const n = mapState.nodes.get(edge.to); if (n) conns.push({ dir: '→', node: n, edge, key }); }
    else if (edge.to === node.id) { const n = mapState.nodes.get(edge.from); if (n) conns.push({ dir: '←', node: n, edge, key }); }
  }
  if (!conns.length) { list.innerHTML = '<div class="no-connections">No exits yet</div>'; return; }

  const typeLabels = { cardinal: 'Solid', vertical: 'Dashed', portal: 'Dotted' };

  // The cardinal heading of this connection from THIS node's perspective: the forward
  // command for an outgoing edge, the reverse command for an incoming one. '' = unknown
  // (the return move hasn't been observed yet) → shown as '?'.
  const dirTokenForNode = (edge) => {
    const cmd = edge.from === node.id ? edge.command : edge.reverseCommand;
    const canonical = cmd ? COMMAND_DIRECTIONS[cmd.toLowerCase().trim()] : null;
    if (!canonical || DIRECTION_TO_TYPE[canonical] !== 'cardinal') return '';
    return DIRECTION_COMMAND_TOKENS[canonical] || '';
  };
  const dirOptions = (selected) => ['<option value="" ' + (selected ? '' : 'selected') + '>?</option>']
    .concat(CARDINAL_DIRECTIONS.map(dir => {
      const tok = DIRECTION_COMMAND_TOKENS[dir];
      return `<option value="${tok}" ${selected === tok ? 'selected' : ''}>${DIRECTION_SHORT_LABELS[dir]}</option>`;
    })).join('');

  list.innerHTML = conns.map(c => {
    const currentType = c.edge.connectionType || 'cardinal';
    // Direction is only meaningful for cardinal connections (vertical/portal have no heading).
    const dirPicker = currentType === 'cardinal'
      ? `<select class="connection-dir-picker" data-edge="${c.key}" data-side="${c.dir === '→' ? 'from' : 'to'}" title="Direction">${dirOptions(dirTokenForNode(c.edge))}</select>`
      : '';
    return `
      <div class="connection-item ${c.edge.isManual || c.edge.isEdited ? 'user' : 'auto'}">
        <span class="connection-name">${escapeHtml(c.node.name)}</span>
        ${dirPicker}
        <select class="connection-type-picker" data-edge="${c.key}" title="Connection type">
          ${Object.keys(CONNECTION_TYPES).map(t =>
            `<option value="${t}" ${currentType === t ? 'selected' : ''}>${typeLabels[t]}</option>`
          ).join('')}
        </select>
        <button class="connection-delete" data-edge="${c.key}" aria-label="Delete connection"><span class="material-icons">close</span></button>
      </div>
    `;
  }).join('');

  // Direction change handlers — write the heading for this node's end of the connection.
  // Outgoing edits set edge.command; incoming edits set edge.reverseCommand (or clear it).
  list.querySelectorAll('.connection-dir-picker').forEach(sel => sel.addEventListener('change', (e) => {
    const edge = mapState.edges.get(e.target.dataset.edge);
    if (!edge) return;
    callbacks.snapshotForUndo();
    const token = e.target.value;
    if (e.target.dataset.side === 'from') {
      if (token) edge.command = token;
    } else if (token) {
      edge.reverseCommand = token;
    } else {
      delete edge.reverseCommand;
    }
    edge.isEdited = true;
    mapState.protectedEdges.add(e.target.dataset.edge);
    mapState.hasUnsavedChanges = true;
    render();
    callbacks.saveMapForGame();
  }));

  // Delete handlers
  list.querySelectorAll('.connection-delete').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent click from bubbling up to map container
    deleteEdge(btn.dataset.edge);
    populateConnectionsList(node);
  }));

  // Type change handlers
  list.querySelectorAll('.connection-type-picker').forEach(sel => sel.addEventListener('change', (e) => {
    const edge = mapState.edges.get(e.target.dataset.edge);
    if (edge) {
      callbacks.snapshotForUndo();
      edge.connectionType = e.target.value;
      edge.isEdited = true;
      mapState.protectedEdges.add(e.target.dataset.edge);
      mapState.hasUnsavedChanges = true; // Trigger full autosave on map close
      render();
      callbacks.saveMapForGame();
      populateConnectionsList(node); // refresh so the direction picker shows/hides for the new type
    }
  }));
}

export function startConnectionFromSheet() {
  const nodeId = mapState.selectedNode;
  if (!nodeId) return;
  closeNodeSheet();
  callbacks.startConnectionFromSheetCallback(nodeId);
}

export function startMergeFromSheet() {
  const nodeId = mapState.selectedNode;
  if (!nodeId) return;
  closeNodeSheet();
  callbacks.startMergeFromSheetCallback(nodeId);
}

// ============================================================================
// SHEET EVENT HANDLERS
// ============================================================================

export function handleNodeNameChange(e) {
  const node = mapState.nodes.get(mapState.selectedNode);
  if (!node) return;
  captureEditSnapshot();
  node.name = e.target.value; node.isEdited = true;
  mapState.protectedNodes.add(node.id);
  mapState.hasUnsavedChanges = true; // Trigger full autosave on map close
  document.getElementById('sheetNodeName').textContent = e.target.value || 'Edit Location';
  document.getElementById('sheetNodeBadge').textContent = 'Your edit';
  document.getElementById('sheetNodeBadge').className = 'sheet-node-badge user';
  callbacks.syncSharedNode(node.id);
  render();
}

export function handleNodeNotesChange(e) {
  const node = mapState.nodes.get(mapState.selectedNode);
  if (node) {
    captureEditSnapshot();
    node.notes = e.target.value;
    node.isEdited = true;
    mapState.protectedNodes.add(node.id);
    mapState.hasUnsavedChanges = true; // Trigger full autosave on map close
    callbacks.syncSharedNode(node.id);
  }
}

export function handleNodeTypeChange(type) {
  const node = mapState.nodes.get(mapState.selectedNode);
  if (!node) return;
  captureEditSnapshot();
  node.type = type; node.isEdited = true;
  mapState.protectedNodes.add(node.id);
  mapState.hasUnsavedChanges = true; // Trigger full autosave on map close
  document.querySelectorAll('#nodeTypePicker .type-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
    btn.setAttribute('aria-checked', btn.dataset.type === type);
  });
  document.getElementById('sheetNodeBadge').textContent = 'Your edit';
  document.getElementById('sheetNodeBadge').className = 'sheet-node-badge user';
  callbacks.syncSharedNode(node.id);
  render();
  callbacks.saveMapForGame();
}

export function handleNodeSmallToggle() {
  const node = mapState.nodes.get(mapState.selectedNode);
  if (!node) return;
  captureEditSnapshot();
  node.isSmall = !node.isSmall;
  node.isEdited = true;
  mapState.protectedNodes.add(node.id);
  mapState.hasUnsavedChanges = true; // Trigger full autosave on map close
  const smallToggle = document.getElementById('nodeSmallToggle');
  smallToggle.classList.toggle('active', node.isSmall);
  smallToggle.setAttribute('aria-checked', node.isSmall);
  document.getElementById('sheetNodeBadge').textContent = 'Your edit';
  document.getElementById('sheetNodeBadge').className = 'sheet-node-badge user';
  callbacks.syncSharedNode(node.id);
  render();
  callbacks.saveMapForGame();
}

export function handleNodeDelete() {
  const nodeId = mapState.selectedNode, node = mapState.nodes.get(nodeId);
  if (!nodeId || !node) return;

  // Snapshot before deleting the node and its connected edges
  callbacks.snapshotForUndo();

  // Map-aware delete (#144): deleting only ever touches the active map's
  // collections, so a node shared onto other maps survives there — we just
  // word the confirmation differently and refresh the shared-node set after.
  const wasShared = !!(node.sharedId && mapState.sharedNodeIds && mapState.sharedNodeIds.has(node.sharedId));

  for (const [key, edge] of mapState.edges) {
    if (edge.from === nodeId || edge.to === nodeId) {
      mapState.edges.delete(key);
      mapState.deletedEdges.add(key);
    }
  }

  mapState.nodes.delete(nodeId);
  mapState.deletedNodes.add(nodeId);
  mapState.selectedNode = null;
  mapState.hasUnsavedChanges = true; // Trigger full autosave on map close
  callbacks.recomputeSharedIds();
  closeNodeSheet();
  render();
  callbacks.showHint(wasShared ? `Removed "${node?.name}" from this map (still on other maps)` : `Deleted "${node?.name}"`);
  callbacks.saveMapForGame();
}

// Multi-map (#144): "Share to map" expands an inline submenu listing the other
// maps; picking one hands off to the shareNodeToMap callback in map-canvas.js,
// which keeps the node here AND adds a linked copy on the chosen map.
export function toggleShareMapMenu() {
  const menu = document.getElementById('nodeShareMapMenu');
  if (!menu) return;
  if (!menu.classList.contains('hidden')) { menu.classList.add('hidden'); return; }

  const others = mapState.mapOrder.filter(m => m.id !== mapState.activeMapId);
  if (others.length === 0) {
    callbacks.showHint('No other maps yet — add one from the map picker first');
    return;
  }

  menu.innerHTML = others.map(m =>
    `<button class="sheet-btn sheet-btn-secondary share-map-target" data-map-id="${escapeHtml(m.id)}">` +
    `<span class="material-icons">link</span> ${escapeHtml(m.name)}</button>`
  ).join('');
  menu.querySelectorAll('.share-map-target').forEach(btn => {
    btn.addEventListener('click', () => {
      const nodeId = mapState.selectedNode;
      menu.classList.add('hidden');
      closeNodeSheet();
      callbacks.shareNodeToMap(nodeId, btn.dataset.mapId);
    });
  });
  menu.classList.remove('hidden');
}

// ============================================================================
// EDGE CRUD
// ============================================================================

export function createManualEdge(fromId, toId) {
  const key = `${fromId}-${toId}`;
  if (mapState.edges.has(key)) { callbacks.showHint('Connection already exists'); return; }
  callbacks.snapshotForUndo();
  mapState.edges.set(key, { from: fromId, to: toId, command: '', isManual: true, isEdited: false });
  mapState.protectedEdges.add(key);
  mapState.hasUnsavedChanges = true; // Trigger full autosave on map close
  callbacks.showHint(`Connected "${mapState.nodes.get(fromId)?.name}" to "${mapState.nodes.get(toId)?.name}"`);
  render(); callbacks.saveMapForGame();
}

export function deleteEdge(key) {
  const edge = mapState.edges.get(key);
  if (!edge) return;
  callbacks.snapshotForUndo();
  mapState.edges.delete(key);
  mapState.deletedEdges.add(key);
  mapState.hasUnsavedChanges = true; // Trigger full autosave on map close
  callbacks.saveMapForGame(); render();
  callbacks.showHint('Connection removed');
}

// ============================================================================
// MERGE DUPLICATES
// ============================================================================

function transferEdges(sourceId, targetId) {
  const edgesToAdd = [];
  const edgesToDelete = [];

  for (const [key, edge] of mapState.edges) {
    if (edge.from === sourceId) {
      const newKey = `${targetId}-${edge.to}`;
      if (!mapState.edges.has(newKey) && edge.to !== targetId) {
        edgesToAdd.push([newKey, { ...edge, from: targetId }]);
      }
      edgesToDelete.push(key);
    } else if (edge.to === sourceId) {
      const newKey = `${edge.from}-${targetId}`;
      if (!mapState.edges.has(newKey) && edge.from !== targetId) {
        edgesToAdd.push([newKey, { ...edge, to: targetId }]);
      }
      edgesToDelete.push(key);
    }
  }

  for (const key of edgesToDelete) {
    mapState.edges.delete(key);
  }
  for (const [key, edge] of edgesToAdd) {
    mapState.edges.set(key, edge);
    mapState.protectedEdges.add(key);
  }
}

/**
 * Merge a duplicate node with its original
 * Transfers all connections from duplicate to original, then deletes duplicate
 */
export function handleNodeMerge() {
  const nodeId = mapState.selectedNode;
  const node = mapState.nodes.get(nodeId);
  if (!node || !node.isDuplicate || !node.originalNodeId) {
    callbacks.showHint('Cannot merge this node');
    return;
  }

  const originalId = node.originalNodeId;
  const originalNode = mapState.nodes.get(originalId);

  // If original was deleted, promote this duplicate to primary
  if (!originalNode) {
    promoteToPrimary(node);
    return;
  }

  // Snapshot before any mutations
  callbacks.snapshotForUndo();

  // Transfer all connections from duplicate to original
  transferEdges(nodeId, originalId);

  // Delete the duplicate node
  mapState.nodes.delete(nodeId);
  mapState.deletedNodes.add(nodeId);

  // Clear hasDuplicates flag if no more duplicates exist
  const remainingDuplicates = [...mapState.nodes.values()].filter(
    n => n.isDuplicate && n.originalNodeId === originalId
  );
  if (remainingDuplicates.length === 0) {
    originalNode.hasDuplicates = false;
    delete originalNode.duplicateGroup;
  }

  // Select the original node
  mapState.selectedNode = originalId;
  mapState.hasUnsavedChanges = true; // Trigger full autosave on map close

  closeNodeSheet();
  render();  // Force re-render to show merged state
  callbacks.showHint(`Merged with "${originalNode.name}"`);
  callbacks.saveMapForGame();
}

/**
 * Promote a duplicate node to be the primary when original was deleted
 * Clears duplicate flags and renames to the original name
 */
function promoteToPrimary(node) {
  const oldId = node.id;
  const newId = node.name;  // Use the location name as the new ID

  // Snapshot before any mutations
  callbacks.snapshotForUndo();

  // Update the node
  node.id = newId;
  node.isDuplicate = false;
  delete node.duplicateGroup;
  delete node.originalNodeId;
  node.notes = '';  // Clear the "possible duplicate" note

  // Re-add with new ID
  mapState.nodes.delete(oldId);
  mapState.nodes.set(newId, node);
  mapState.protectedNodes.delete(oldId);
  mapState.protectedNodes.add(newId);
  mapState.deletedNodes.add(oldId);

  // Update all edges that reference the old ID
  const edgesToUpdate = [];
  for (const [key, edge] of mapState.edges) {
    if (edge.from === oldId || edge.to === oldId) {
      edgesToUpdate.push([key, edge]);
    }
  }

  for (const [oldKey, edge] of edgesToUpdate) {
    mapState.edges.delete(oldKey);
    mapState.protectedEdges.delete(oldKey);

    const newFrom = edge.from === oldId ? newId : edge.from;
    const newTo = edge.to === oldId ? newId : edge.to;
    const newKey = `${newFrom}-${newTo}`;

    mapState.edges.set(newKey, { ...edge, from: newFrom, to: newTo });
    mapState.protectedEdges.add(newKey);
  }

  mapState.selectedNode = newId;
  mapState.hasUnsavedChanges = true; // Trigger full autosave on map close

  closeNodeSheet();
  callbacks.showHint(`"${node.name}" is now the primary location`);
  callbacks.saveMapForGame();
}

/**
 * Mark a suspected duplicate as NOT a duplicate - it's a separate location with the same name
 * Keeps the node but removes duplicate styling and link to original
 */
export function handleNodeNotDuplicate() {
  const nodeId = mapState.selectedNode;
  const node = mapState.nodes.get(nodeId);
  if (!node || !node.isDuplicate) {
    callbacks.showHint('This node is not marked as a duplicate');
    return;
  }

  // Snapshot before any mutations
  callbacks.snapshotForUndo();

  const originalId = node.originalNodeId;
  const originalNode = mapState.nodes.get(originalId);

  // Clear duplicate flags from this node
  node.isDuplicate = false;
  delete node.duplicateGroup;
  delete node.originalNodeId;
  node.notes = '';  // Clear the "possible duplicate" note
  node.isEdited = true;  // Mark as user-edited since they made a decision

  // Clear hasDuplicates from original if no more duplicates exist
  if (originalNode) {
    const remainingDuplicates = [...mapState.nodes.values()].filter(
      n => n.isDuplicate && n.originalNodeId === originalId
    );
    if (remainingDuplicates.length === 0) {
      originalNode.hasDuplicates = false;
      delete originalNode.duplicateGroup;
    }
  }

  mapState.hasUnsavedChanges = true; // Trigger full autosave on map close

  closeNodeSheet();
  callbacks.showHint(`"${node.name}" marked as separate location`);
  callbacks.saveMapForGame();
  render();
}

/**
 * Merge one node into another (manual merge from UI)
 * Transfers all connections from source to target, then deletes source
 * @param {string} sourceId - Node to merge FROM (will be deleted)
 * @param {string} targetId - Node to merge INTO (will receive connections)
 */
export function performManualMerge(sourceId, targetId) {
  const sourceNode = mapState.nodes.get(sourceId);
  const targetNode = mapState.nodes.get(targetId);

  if (!sourceNode || !targetNode) {
    callbacks.showHint('Cannot merge - node not found');
    return;
  }

  // Snapshot before any mutations
  callbacks.snapshotForUndo();

  // Transfer all connections from source to target
  transferEdges(sourceId, targetId);

  // Delete the source node
  mapState.nodes.delete(sourceId);
  mapState.deletedNodes.add(sourceId);

  // Select the target node
  mapState.selectedNode = targetId;
  mapState.hasUnsavedChanges = true; // Trigger full autosave on map close

  render();
  callbacks.showHint(`Merged "${sourceNode.name}" into "${targetNode.name}"`);
  callbacks.saveMapForGame();
}
