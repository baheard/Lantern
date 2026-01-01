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
  startConnectionFromSheetCallback: () => {}
};

export function setSheetCallbacks(cbs) {
  callbacks = { ...callbacks, ...cbs };
}

// ============================================================================
// UI CREATION
// ============================================================================

export function createNodeEditSheet() {
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
            ${['room', 'outdoor', 'shop', 'danger', 'npc', 'item', 'locked'].map(t =>
              `<button class="type-btn" data-type="${t}" aria-label="${t}" role="radio">
                <span class="material-icons">${NODE_ICONS[t]}</span>
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
          <p class="merge-hint">If this is the same location as the original, merge them.</p>
          <button class="sheet-btn sheet-btn-merge" id="nodeMergeBtn">
            <span class="material-icons">merge</span> Merge with Original
          </button>
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

export function createContextMenu() {
  const menu = document.createElement('div');
  menu.id = 'mapContextMenu';
  menu.className = 'map-context-menu hidden';
  menu.innerHTML = `
    <button class="context-menu-item" id="ctxAddNode">
      <span class="material-icons">add_location</span><span>Add location here</span>
    </button>
    <button class="context-menu-item" id="ctxCenterView">
      <span class="material-icons">center_focus_strong</span><span>Center view here</span>
    </button>
  `;
  container.appendChild(menu);
}

// ============================================================================
// SHEET OPERATIONS
// ============================================================================

export function openNodeSheet(node) {
  mapState.selectedNode = node.id;
  const isUser = node.isManual || node.isEdited;
  const isDuplicate = node.isDuplicate || node.hasDuplicates;
  const badge = document.getElementById('sheetNodeBadge');

  // Set badge based on node type
  if (isDuplicate) {
    badge.textContent = 'Possible duplicate';
    badge.className = 'sheet-node-badge duplicate';
  } else if (isUser) {
    badge.textContent = 'Your edit';
    badge.className = 'sheet-node-badge user';
  } else {
    badge.textContent = 'Auto-mapped';
    badge.className = 'sheet-node-badge auto';
  }

  document.getElementById('sheetNodeName').textContent = node.name || 'Edit Location';
  document.getElementById('nodeNameInput').value = node.name || '';
  document.getElementById('nodeNotesInput').value = node.notes || '';
  document.querySelectorAll('#nodeTypePicker .type-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === node.type);
    btn.setAttribute('aria-checked', btn.dataset.type === node.type);
  });
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

  document.getElementById('nodeEditSheet').classList.remove('hidden');
  render();
  setTimeout(() => { document.getElementById('nodeNameInput').focus(); document.getElementById('nodeNameInput').select(); }, 100);
}

export function closeNodeSheet() {
  document.getElementById('nodeEditSheet').classList.add('hidden');
  callbacks.saveMapForGame();
}

function populateConnectionsList(node) {
  const list = document.getElementById('nodeConnectionsList');
  const conns = [];
  for (const [key, edge] of mapState.edges) {
    if (edge.from === node.id) { const n = mapState.nodes.get(edge.to); if (n) conns.push({ dir: '→', node: n, edge, key }); }
    else if (edge.to === node.id) { const n = mapState.nodes.get(edge.from); if (n) conns.push({ dir: '←', node: n, edge, key }); }
  }
  if (!conns.length) { list.innerHTML = '<div class="no-connections">No connections yet</div>'; return; }

  const typeIcons = { cardinal: 'straight', vertical: 'stairs', portal: 'door_front' };
  const typeLabels = { cardinal: 'Cardinal', vertical: 'Vertical', portal: 'Portal' };

  list.innerHTML = conns.map(c => {
    const currentType = c.edge.connectionType || 'cardinal';
    return `
      <div class="connection-item ${c.edge.isManual || c.edge.isEdited ? 'user' : 'auto'}">
        <span class="connection-direction">${c.dir}</span>
        <span class="connection-name">${c.node.name}</span>
        ${c.edge.command ? `<span class="connection-cmd">${c.edge.command}</span>` : ''}
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
  list.querySelectorAll('.connection-delete').forEach(btn => btn.addEventListener('click', () => { deleteEdge(btn.dataset.edge); populateConnectionsList(node); }));

  // Type change handlers
  list.querySelectorAll('.connection-type-picker').forEach(sel => sel.addEventListener('change', (e) => {
    const edge = mapState.edges.get(e.target.dataset.edge);
    if (edge) {
      edge.connectionType = e.target.value;
      edge.isEdited = true;
      mapState.protectedEdges.add(e.target.dataset.edge);
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

// ============================================================================
// SHEET EVENT HANDLERS
// ============================================================================

export function handleNodeNameChange(e) {
  const node = mapState.nodes.get(mapState.selectedNode);
  if (!node) return;
  node.name = e.target.value; node.isEdited = true;
  mapState.protectedNodes.add(node.id);
  document.getElementById('sheetNodeName').textContent = e.target.value || 'Edit Location';
  document.getElementById('sheetNodeBadge').textContent = 'Your edit';
  document.getElementById('sheetNodeBadge').className = 'sheet-node-badge user';
  render();
}

export function handleNodeNotesChange(e) {
  const node = mapState.nodes.get(mapState.selectedNode);
  if (node) { node.notes = e.target.value; node.isEdited = true; mapState.protectedNodes.add(node.id); }
}

export function handleNodeTypeChange(type) {
  const node = mapState.nodes.get(mapState.selectedNode);
  if (!node) return;
  node.type = type; node.isEdited = true;
  mapState.protectedNodes.add(node.id);
  document.querySelectorAll('#nodeTypePicker .type-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
    btn.setAttribute('aria-checked', btn.dataset.type === type);
  });
  document.getElementById('sheetNodeBadge').textContent = 'Your edit';
  document.getElementById('sheetNodeBadge').className = 'sheet-node-badge user';
  render();
}

export function handleNodeDelete() {
  const nodeId = mapState.selectedNode, node = mapState.nodes.get(nodeId);
  if (!nodeId) return;
  mapState.nodes.delete(nodeId);
  mapState.deletedNodes.add(nodeId);
  for (const [key, edge] of mapState.edges) {
    if (edge.from === nodeId || edge.to === nodeId) { mapState.edges.delete(key); mapState.deletedEdges.add(key); }
  }
  mapState.selectedNode = null;
  closeNodeSheet();
  callbacks.showHint(`Deleted "${node?.name}"`);
}

// ============================================================================
// EDGE CRUD
// ============================================================================

export function createManualEdge(fromId, toId) {
  const key = `${fromId}-${toId}`;
  if (mapState.edges.has(key)) { callbacks.showHint('Connection already exists'); return; }
  mapState.edges.set(key, { from: fromId, to: toId, command: '', isManual: true, isEdited: false });
  mapState.protectedEdges.add(key);
  callbacks.showHint(`Connected "${mapState.nodes.get(fromId)?.name}" to "${mapState.nodes.get(toId)?.name}"`);
  render(); callbacks.saveMapForGame();
}

export function deleteEdge(key) {
  mapState.edges.delete(key);
  mapState.deletedEdges.add(key);
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

  closeNodeSheet();
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

  closeNodeSheet();
  callbacks.showHint(`"${node.name}" is now the primary location`);
  callbacks.saveMapForGame();
}
