/**
 * Map Canvas - Bottom Sheet and Node/Edge CRUD
 */

import {
  container, mapState, domRefs,
  NODE_ICONS, CONNECTION_TYPES
} from './map-config.js';
import { render } from './map-render.js';

// Callbacks (set by map-canvas.js to avoid circular deps)
let callbacks = {
  showHint: () => {},
  saveMapForGame: () => {},
  startConnectionFromSheetCallback: () => {},
  startMergeFromSheetCallback: () => {},
  pushUndo: () => {}
};

export function setSheetCallbacks(cbs) {
  callbacks = { ...callbacks, ...cbs };
}

// ============================================================================
// UI CREATION
// ============================================================================

export function createNodeEditSheet() {
  // Create backdrop for tap-to-close
  const backdrop = document.createElement('div');
  backdrop.id = 'nodeEditBackdrop';
  backdrop.className = 'node-edit-backdrop hidden';
  container.appendChild(backdrop);

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
        </div>
        <button class="sheet-close-btn" id="sheetCloseBtn" aria-label="Close">
          <span class="material-icons">close</span>
        </button>
      </div>
      <div class="sheet-body">
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
              { type: 'star', label: 'Star', icon: 'star' },
              { type: 'question', label: 'Question', icon: 'help' }
            ].map(t =>
              `<button class="type-btn" data-type="${t.type}" aria-label="${t.label}" role="radio" title="${t.label}">
                ${t.icon ? `<span class="material-icons">${t.icon}</span>` : '<span class="no-icon">—</span>'}
              </button>`
            ).join('')}
          </div>
        </div>
        <div class="sheet-field" id="nodeConnectionsField">
          <label>Connections</label>
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
          <button class="sheet-btn sheet-btn-danger" id="nodeDeleteBtn">
            <span class="material-icons">delete</span> Delete
          </button>
        </div>
      </div>
    </div>
  `;
  container.appendChild(sheet);
}

// ============================================================================
// SHEET OPERATIONS
// ============================================================================

export function openNodeSheet(node) {
  mapState.selectedNode = node.id;
  const isDuplicate = node.isDuplicate || node.hasDuplicates;
  const badge = document.getElementById('sheetNodeBadge');

  // Set badge - only distinguish duplicates (user edits shown by dashed border on node)
  if (isDuplicate) {
    badge.textContent = 'Possible duplicate';
    badge.className = 'sheet-node-badge duplicate';
  } else {
    badge.textContent = 'Auto-mapped';
    badge.className = 'sheet-node-badge auto';
  }

  document.getElementById('sheetNodeName').textContent = node.name || 'Edit Location';
  document.getElementById('nodeNameInput').value = node.name || '';
  document.getElementById('nodeNotesInput').value = node.notes || '';

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

  // Reset sheet height to default when opening
  sheet.style.maxHeight = '';
  const sheetContent = sheet.querySelector('.sheet-content');
  if (sheetContent) {
    sheetContent.style.maxHeight = '';
  }

  // Immediately adjust height if visual viewport is constrained (keyboard already open)
  if (window.visualViewport) {
    const currentHeight = window.visualViewport.height;
    const maxSheetHeight = Math.max(currentHeight - 20, 300);
    sheet.style.maxHeight = `${maxSheetHeight}px`;
    if (sheetContent) {
      const headerHeight = 80;
      sheetContent.style.maxHeight = `${maxSheetHeight - headerHeight}px`;
    }
  }

  render();
}

export function closeNodeSheet() {
  const sheet = document.getElementById('nodeEditSheet');
  sheet.classList.add('hidden');
  document.getElementById('nodeEditBackdrop').classList.add('hidden');

  // Reset sheet height to default when closing
  sheet.style.maxHeight = '';
  const sheetContent = sheet.querySelector('.sheet-content');
  if (sheetContent) {
    sheetContent.style.maxHeight = '';
  }

  callbacks.saveMapForGame();
}

// ============================================================================
// SHEET DRAG-TO-DISMISS
// ============================================================================

let sheetDragState = { isDragging: false, startY: 0, currentY: 0 };

export function setupSheetDragHandlers() {
  const sheet = document.getElementById('nodeEditSheet');
  const handleArea = document.getElementById('sheetHandleArea');
  const backdrop = document.getElementById('nodeEditBackdrop');

  // Tap backdrop to close (stop propagation to prevent map overlay from also closing)
  backdrop.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent map overlay backdrop from receiving this click
    closeNodeSheet();
  });

  // Drag to dismiss
  handleArea.addEventListener('touchstart', onSheetDragStart, { passive: true });
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
  sheetDragState.currentY = 0;
  sheet.style.transition = 'none';
}

function onSheetDragMove(e) {
  if (!sheetDragState.isDragging) return;

  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const deltaY = clientY - sheetDragState.startY;

  // Only allow dragging down
  if (deltaY > 0) {
    sheetDragState.currentY = deltaY;
    const sheet = document.getElementById('nodeEditSheet');
    sheet.style.transform = `translateY(${deltaY}px)`;
    e.preventDefault();
  }
}

function onSheetDragEnd() {
  if (!sheetDragState.isDragging) return;

  sheetDragState.isDragging = false;
  const sheet = document.getElementById('nodeEditSheet');
  sheet.style.transition = 'transform 0.2s ease-out';

  // If dragged more than 100px, close the sheet
  if (sheetDragState.currentY > 100) {
    sheet.style.transform = 'translateY(100%)';
    setTimeout(() => {
      sheet.style.transform = '';
      sheet.style.transition = '';
      closeNodeSheet();
    }, 200);
  } else {
    // Snap back
    sheet.style.transform = '';
    setTimeout(() => { sheet.style.transition = ''; }, 200);
  }
}

function populateConnectionsList(node) {
  const list = document.getElementById('nodeConnectionsList');
  const conns = [];
  for (const [key, edge] of mapState.edges) {
    if (edge.from === node.id) { const n = mapState.nodes.get(edge.to); if (n) conns.push({ dir: '→', node: n, edge, key }); }
    else if (edge.to === node.id) { const n = mapState.nodes.get(edge.from); if (n) conns.push({ dir: '←', node: n, edge, key }); }
  }
  if (!conns.length) { list.innerHTML = '<div class="no-connections">No connections yet</div>'; return; }

  const typeLabels = { cardinal: 'Solid', vertical: 'Dashed', portal: 'Dotted' };

  list.innerHTML = conns.map(c => {
    const currentType = c.edge.connectionType || 'cardinal';
    return `
      <div class="connection-item ${c.edge.isManual || c.edge.isEdited ? 'user' : 'auto'}">
        <span class="connection-name">${c.node.name}</span>
        <select class="connection-type-picker" data-edge="${c.key}" title="Connection type">
          ${Object.keys(CONNECTION_TYPES).map(t =>
            `<option value="${t}" ${currentType === t ? 'selected' : ''}>${typeLabels[t]}</option>`
          ).join('')}
        </select>
        <button class="connection-delete" data-edge="${c.key}" aria-label="Delete connection"><span class="material-icons">close</span></button>
      </div>
    `;
  }).join('');

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
      edge.connectionType = e.target.value;
      edge.isEdited = true;
      mapState.protectedEdges.add(e.target.dataset.edge);
      mapState.hasUnsavedChanges = true; // Trigger full autosave on map close
      render();
      callbacks.saveMapForGame();
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
  node.name = e.target.value; node.isEdited = true;
  mapState.protectedNodes.add(node.id);
  mapState.hasUnsavedChanges = true; // Trigger full autosave on map close
  document.getElementById('sheetNodeName').textContent = e.target.value || 'Edit Location';
  document.getElementById('sheetNodeBadge').textContent = 'Your edit';
  document.getElementById('sheetNodeBadge').className = 'sheet-node-badge user';
  render();
}

export function handleNodeNotesChange(e) {
  const node = mapState.nodes.get(mapState.selectedNode);
  if (node) {
    node.notes = e.target.value;
    node.isEdited = true;
    mapState.protectedNodes.add(node.id);
    mapState.hasUnsavedChanges = true; // Trigger full autosave on map close
  }
}

export function handleNodeTypeChange(type) {
  const node = mapState.nodes.get(mapState.selectedNode);
  if (!node) return;
  node.type = type; node.isEdited = true;
  mapState.protectedNodes.add(node.id);
  mapState.hasUnsavedChanges = true; // Trigger full autosave on map close
  document.querySelectorAll('#nodeTypePicker .type-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
    btn.setAttribute('aria-checked', btn.dataset.type === type);
  });
  document.getElementById('sheetNodeBadge').textContent = 'Your edit';
  document.getElementById('sheetNodeBadge').className = 'sheet-node-badge user';
  render();
  callbacks.saveMapForGame();
}

export function handleNodeSmallToggle() {
  const node = mapState.nodes.get(mapState.selectedNode);
  if (!node) return;
  node.isSmall = !node.isSmall;
  node.isEdited = true;
  mapState.protectedNodes.add(node.id);
  mapState.hasUnsavedChanges = true; // Trigger full autosave on map close
  const smallToggle = document.getElementById('nodeSmallToggle');
  smallToggle.classList.toggle('active', node.isSmall);
  smallToggle.setAttribute('aria-checked', node.isSmall);
  document.getElementById('sheetNodeBadge').textContent = 'Your edit';
  document.getElementById('sheetNodeBadge').className = 'sheet-node-badge user';
  render();
  callbacks.saveMapForGame();
}

export function handleNodeDelete() {
  const nodeId = mapState.selectedNode, node = mapState.nodes.get(nodeId);
  if (!nodeId || !node) return;

  // Collect edges for undo
  const deletedEdges = [];
  for (const [key, edge] of mapState.edges) {
    if (edge.from === nodeId || edge.to === nodeId) {
      deletedEdges.push({ key, data: { ...edge }, wasProtected: mapState.protectedEdges.has(key) });
      mapState.edges.delete(key);
      mapState.deletedEdges.add(key);
    }
  }

  // Push undo before deleting
  callbacks.pushUndo({
    type: 'deleteNode',
    node: { ...node },
    wasProtected: mapState.protectedNodes.has(nodeId),
    edges: deletedEdges
  });

  mapState.nodes.delete(nodeId);
  mapState.deletedNodes.add(nodeId);
  mapState.selectedNode = null;
  mapState.hasUnsavedChanges = true; // Trigger full autosave on map close
  closeNodeSheet();
  render();
  callbacks.showHint(`Deleted "${node?.name}"`);
  callbacks.saveMapForGame();
}

// ============================================================================
// EDGE CRUD
// ============================================================================

export function createManualEdge(fromId, toId) {
  const key = `${fromId}-${toId}`;
  if (mapState.edges.has(key)) { callbacks.showHint('Connection already exists'); return; }
  mapState.edges.set(key, { from: fromId, to: toId, command: '', isManual: true, isEdited: false });
  mapState.protectedEdges.add(key);
  mapState.hasUnsavedChanges = true; // Trigger full autosave on map close
  callbacks.showHint(`Connected "${mapState.nodes.get(fromId)?.name}" to "${mapState.nodes.get(toId)?.name}"`);
  render(); callbacks.saveMapForGame();
}

export function deleteEdge(key) {
  const edge = mapState.edges.get(key);
  if (edge) {
    callbacks.pushUndo({
      type: 'deleteEdge',
      key,
      edge: { ...edge },
      wasProtected: mapState.protectedEdges.has(key)
    });
  }
  mapState.edges.delete(key);
  mapState.deletedEdges.add(key);
  mapState.hasUnsavedChanges = true; // Trigger full autosave on map close
  callbacks.saveMapForGame(); render();
  callbacks.showHint('Connection removed');
}

// ============================================================================
// MERGE DUPLICATES
// ============================================================================

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

  // Transfer all connections from duplicate to original
  const edgesToAdd = [];
  const edgesToDelete = [];

  for (const [key, edge] of mapState.edges) {
    if (edge.from === nodeId) {
      // Outgoing edge from duplicate -> redirect to original
      const newKey = `${originalId}-${edge.to}`;
      if (!mapState.edges.has(newKey) && edge.to !== originalId) {
        edgesToAdd.push([newKey, { ...edge, from: originalId }]);
      }
      edgesToDelete.push(key);
    } else if (edge.to === nodeId) {
      // Incoming edge to duplicate -> redirect to original
      const newKey = `${edge.from}-${originalId}`;
      if (!mapState.edges.has(newKey) && edge.from !== originalId) {
        edgesToAdd.push([newKey, { ...edge, to: originalId }]);
      }
      edgesToDelete.push(key);
    }
  }

  // Apply edge changes
  for (const key of edgesToDelete) {
    mapState.edges.delete(key);
  }
  for (const [key, edge] of edgesToAdd) {
    mapState.edges.set(key, edge);
    mapState.protectedEdges.add(key);
  }

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

  // Transfer all connections from source to target
  const edgesToAdd = [];
  const edgesToDelete = [];

  for (const [key, edge] of mapState.edges) {
    if (edge.from === sourceId) {
      // Outgoing edge from source -> redirect to target
      const newKey = `${targetId}-${edge.to}`;
      if (!mapState.edges.has(newKey) && edge.to !== targetId) {
        edgesToAdd.push([newKey, { ...edge, from: targetId }]);
      }
      edgesToDelete.push(key);
    } else if (edge.to === sourceId) {
      // Incoming edge to source -> redirect to target
      const newKey = `${edge.from}-${targetId}`;
      if (!mapState.edges.has(newKey) && edge.from !== targetId) {
        edgesToAdd.push([newKey, { ...edge, to: targetId }]);
      }
      edgesToDelete.push(key);
    }
  }

  // Apply edge changes
  for (const key of edgesToDelete) {
    mapState.edges.delete(key);
  }
  for (const [key, edge] of edgesToAdd) {
    mapState.edges.set(key, edge);
    mapState.protectedEdges.add(key);
  }

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
