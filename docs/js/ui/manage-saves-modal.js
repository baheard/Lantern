/**
 * Manage Saves Modal
 *
 * Lists all local saves for the current game with Save/Load actions.
 * Cloud sync status shown passively next to each timestamp.
 * ⋮ menu exposes cloud actions (upload/download), export, and delete.
 */

import { state } from '../core/state.js';
import { getJSON, removeItem } from '../utils/storage/storage-api.js';
import { confirmDialog } from './confirm-dialog.js';
import { updateStatus } from '../utils/status.js';
import { getGameDisplayName } from './settings/settings-panel.js';

let overlayEl = null;
let portalDropdown = null;
const expandedBackups = new Set();
const driveStatusCache = new Map(); // key → { hint, color }

document.addEventListener('iftalk:synccomplete', ({ detail }) => {
  refreshDriveStatusCache(detail.gameName);
});

async function refreshDriveStatusCache(gameName) {
  if (!state.gdriveSignedIn) return;
  try {
    const { compareSaves } = await import('../utils/gdrive/gdrive-sync-preview.js');
    // Export direction only: Newer=local is newer, Older=Drive is newer — consistent semantics
    const items = await compareSaves(gameName, 'export');
    driveStatusCache.clear();
    for (const item of items) {
      driveStatusCache.set(item.key, driveHint(item));
    }
  } catch { /* silent — Drive may not be available */ }
}

function driveHint(item) {
  if (!item.driveTimestamp) return { hint: 'not on Drive', color: '' };
  if (!item.localTimestamp) return { hint: 'Drive only', color: '' };
  switch (item.status) {
    case 'Synced':   return { hint: 'synced', color: '#4caf50' };
    case 'Newer':    return { hint: 'local newer', color: 'var(--accent-warm, #c4a35a)' };
    case 'Older':    return { hint: 'Drive newer', color: '#2196f3' };
    case 'Conflict': return { hint: 'conflict', color: '#f44336' };
    default:         return { hint: '', color: '' };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function relativeTime(isoString) {
  if (!isoString) return 'Unknown date';
  const d = new Date(isoString);
  const diffDays = Math.floor((new Date() - d) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getMoveCount(saveData) {
  try {
    const html = saveData?.displayHTML?.statusBar || '';
    const text = html.replace(/<[^>]+>/g, ' ');
    const m = text.match(/Moves[:\s]+(\d+)/i);
    return m ? parseInt(m[1]) : null;
  } catch { return null; }
}

// ─── Backup Helpers ──────────────────────────────────────────────────────────

function getBackupsForSave(save) {
  if (save.type !== 'autosave' && save.type !== 'quicksave') return [];
  const prefix = `iftalk_backup_${save.type}_${save.saveData.gameName || state.currentGameName}_`;
  const results = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix) || key.endsWith('_exempt')) continue;
    const ts = parseInt(key.replace(prefix, ''));
    if (isNaN(ts)) continue;
    const saveData = getJSON(key);
    if (saveData) results.push({ key, ts, saveData });
  }
  return results.sort((a, b) => b.ts - a.ts);
}

function relativeTimeMs(ms) {
  const diff = Math.floor((Date.now() - ms) / 60000);
  if (diff < 1) return 'Just now';
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return `${Math.floor(diff / 1440)}d ago`;
}

function renderBackupSection(save, backups) {
  const section = document.createElement('div');
  section.className = 'ms-backup-section';
  section.dataset.saveKey = save.key;

  backups.forEach(b => {
    const row = document.createElement('div');
    row.className = 'ms-backup-row';
    row.innerHTML = `
      <div class="ms-backup-tick"></div>
      <div class="ms-backup-info">
        <div class="ms-backup-time">${relativeTimeMs(b.ts)}</div>
      </div>
      <button class="ms-backup-load">Load</button>
    `;
    row.querySelector('.ms-backup-load').addEventListener('click', () => loadSave({ ...save, key: b.key, saveData: b.saveData }));
    section.appendChild(row);
  });

  return section;
}

function toggleBackups(save, backups, row) {
  const isExpanded = expandedBackups.has(save.key);
  if (isExpanded) {
    expandedBackups.delete(save.key);
    row.nextElementSibling?.classList.contains('ms-backup-section') && row.nextElementSibling.remove();
  } else {
    expandedBackups.add(save.key);
    const section = renderBackupSection(save, backups);
    row.after(section);
    // Animate open
    requestAnimationFrame(() => section.classList.add('open'));
  }
}

// ─── Cloud Status ─────────────────────────────────────────────────────────────
// Always returns an object — icon is always rendered (outline when not connected).

function getCloudStatus(save) {
  if (!state.gdriveSignedIn) {
    return { icon: 'cloud_outline', cls: 'cloud-unconnected', label: 'Tap to connect Drive' };
  }
  return {
    icon: 'cloud_upload',
    cls: 'cloud-upload',
    label: 'Tap to sync with Drive',
  };
}

// ─── Save Collection ─────────────────────────────────────────────────────────

function collectSaves(gameName) {
  const saves = [];

  const autosaveKey = `iftalk_autosave_${gameName}`;
  const autosaveData = getJSON(autosaveKey);
  if (autosaveData) {
    saves.push({ type: 'autosave', key: autosaveKey, name: 'Autosave', bar: 'ms-bar-auto', timestamp: autosaveData.timestamp, saveData: autosaveData });
  }

  const quicksaveKey = `iftalk_quicksave_${gameName}`;
  const quicksaveData = getJSON(quicksaveKey);
  if (quicksaveData) {
    saves.push({ type: 'quicksave', key: quicksaveKey, name: 'Quick Save', bar: 'ms-bar-quick', timestamp: quicksaveData.timestamp, saveData: quicksaveData });
  }

  const prefix = `iftalk_customsave_${gameName}_`;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix)) continue;
    const saveData = getJSON(key);
    if (!saveData) continue;
    saves.push({ type: 'customsave', key, name: key.substring(prefix.length), bar: 'ms-bar-none', timestamp: saveData.timestamp, saveData });
  }

  const typeOrder = { autosave: 0, quicksave: 1, customsave: 2 };
  saves.sort((a, b) =>
    typeOrder[a.type] !== typeOrder[b.type]
      ? typeOrder[a.type] - typeOrder[b.type]
      : new Date(b.timestamp) - new Date(a.timestamp)
  );

  return saves;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function saveToSlot(save) {
  const { autoSave, quickSave, customSave } = await import('../game/save-manager.js');
  let success = false;
  if (save.type === 'autosave') success = await autoSave();
  else if (save.type === 'quicksave') success = await quickSave();
  else success = await customSave(save.name);

  if (success) {
    const row = document.querySelector(`.ms-row[data-key="${CSS.escape(save.key)}"]`);
    if (row) row.querySelector('.ms-row-time').textContent = 'Just now';
  }
}

function exportSave(save) {
  try {
    const blob = new Blob([JSON.stringify(save.saveData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const game = (save.saveData.gameName || 'game').replace(/\.[^.]+$/, '');
    const safeName = save.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `${game}_${safeName}_${ts}.sav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    updateStatus('Save exported to file');
  } catch (err) {
    updateStatus('Export failed: ' + err.message);
  }
}

async function loadSave(save) {
  closeManageSavesModal();
  if (save.type === 'autosave') {
    window.location.reload();
    return;
  }
  const gameName = state.currentGameName;
  if (!gameName) return;
  localStorage.setItem(`iftalk_autosave_${gameName}`, JSON.stringify(save.saveData));
  sessionStorage.setItem('iftalk_manage_saves_restore', save.name);
  window.location.reload();
}

async function deleteSave(save, rowEl) {
  const confirmed = await confirmDialog(
    `Delete "${escapeHtml(save.name)}"?\n\nThis action cannot be undone.`,
    { title: 'Delete Save?' }
  );
  if (!confirmed) return;

  removeItem(save.key);
  updateStatus(`Deleted: ${save.name}`);

  if (state.gdriveSignedIn) {
    (async () => {
      try {
        const { listFiles, localStorageKeyToFilename, deleteFile } = await import('../utils/gdrive/index.js');
        const filename = localStorageKeyToFilename(save.key);
        const files = await listFiles();
        const match = files.find(f => f.name === filename);
        if (match) await deleteFile(match.id);
      } catch { /* silent — local delete already done */ }
    })();
  }

  rowEl.style.transition = 'opacity 0.2s';
  rowEl.style.opacity = '0';
  setTimeout(() => {
    rowEl.remove();
    const list = document.getElementById('manageSavesList');
    if (list && !list.querySelector('.ms-row')) {
      list.innerHTML = '<div class="manage-saves-empty">No saves yet — use Save to create one.</div>';
    }
  }, 200);
}

// ─── Sync Modal ──────────────────────────────────────────────────────────────

async function openSyncModal() {
  const { showSyncModal } = await import('./sync-modal.js');
  showSyncModal(state.currentGameName);
}

async function handleCloudClick(save, btn) {
  if (!state.gdriveSignedIn) {
    const { signIn } = await import('../utils/gdrive/index.js');
    try {
      await signIn();
      updateStatus('Connected to Google Drive', 'success');
      btn.className = 'ms-cloud-pill cloud-upload';
      btn.querySelector('.material-icons').textContent = 'cloud_upload';
      btn.title = 'Tap to sync with Drive';
    } catch (err) {
      updateStatus('Connection failed: ' + err.message, 'error');
    }
    return;
  }
  openSyncModal();
}

// ─── Upload All ──────────────────────────────────────────────────────────────

function setRowCloudState(key, icon, cls) {
  const row = document.querySelector(`.ms-row[data-key="${CSS.escape(key)}"]`);
  if (!row) return;
  const btn = row.querySelector('.ms-cloud-pill');
  if (!btn) return;
  btn.className = `ms-cloud-pill ${cls}`;
  btn.querySelector('.material-icons').textContent = icon;
}

async function uploadAllToDrive() {
  if (!state.currentGameName) return;

  try {
    const { compareSaves, syncSaveFile } = await import('../utils/gdrive/gdrive-sync-preview.js');

    updateStatus('Uploading saves to Drive...', 'processing');
    const items = await compareSaves(state.currentGameName, 'export');

    if (items.length === 0) {
      updateStatus('All saves already synced', 'success');
      return;
    }

    // Spin all cloud icons for saves being uploaded
    items.forEach(item => setRowCloudState(item.key, 'sync', 'cloud-upload syncing'));

    let succeeded = 0;
    for (const item of items) {
      try {
        await syncSaveFile(item, 'export');
        setRowCloudState(item.key, 'cloud_done', 'cloud-synced');
        succeeded++;
      } catch {
        setRowCloudState(item.key, 'cloud_upload', 'cloud-upload');
      }
    }

    updateStatus(
      succeeded === items.length ? 'All saves uploaded to Drive' : `${succeeded}/${items.length} saves uploaded`,
      succeeded > 0 ? 'success' : 'error'
    );
  } catch (err) {
    updateStatus('Upload failed: ' + err.message, 'error');
  }
}

// ─── Portal Dropdown ──────────────────────────────────────────────────────────

let lastMoreBtn = null;

function getPortalDropdown() {
  if (!portalDropdown) {
    portalDropdown = document.createElement('div');
    portalDropdown.className = 'ms-dropdown';
    document.body.appendChild(portalDropdown);
    document.addEventListener('click', () => {
      portalDropdown?.classList.remove('open');
      lastMoreBtn = null;
    });
  }
  return portalDropdown;
}

function openDropdown(moreBtn, save, row, cloudStatus) {
  const dd = getPortalDropdown();

  // Toggle closed if already open for this button
  if (dd.classList.contains('open') && lastMoreBtn === moreBtn) {
    dd.classList.remove('open');
    lastMoreBtn = null;
    return;
  }
  lastMoreBtn = moreBtn;

  const backups = getBackupsForSave(save);
  const backupsExpanded = expandedBackups.has(save.key);
  const backupsItem = backups.length > 0 ? `
    <button class="ms-dropdown-item ms-backups-action">
      <span class="material-icons">history</span>${backupsExpanded ? 'Hide backups' : 'Show backups'}
    </button>
    <div class="ms-dropdown-divider"></div>
  ` : '';

  const googleG = `<svg width="13" height="13" viewBox="0 0 18 18" style="flex-shrink:0"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.703-1.567 2.684-3.874 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/></svg>`;

  const cached = driveStatusCache.get(save.key);
  const hintHtml = cached?.hint
    ? `<span class="ms-drive-hint" style="${cached.color ? `color:${cached.color}` : ''}">${cached.hint}</span>`
    : '';
  const driveItem = state.gdriveSignedIn
    ? `<button class="ms-dropdown-item ms-drive-sync-action">${googleG}Drive sync${hintHtml}</button>
       <div class="ms-dropdown-divider"></div>`
    : `<button class="ms-dropdown-item ms-connect-drive-action">${googleG}Connect Drive</button>
       <div class="ms-dropdown-divider"></div>`;

  dd.innerHTML = `
    ${driveItem}
    ${backupsItem}
    <button class="ms-dropdown-item ms-export-action">
      <span class="material-icons">upload</span>Export to file
    </button>
    <div class="ms-dropdown-divider"></div>
    <button class="ms-dropdown-item danger ms-delete-action">
      <span class="material-icons">delete_outline</span>Delete save
    </button>
  `;

  dd.querySelector('.ms-drive-sync-action')?.addEventListener('click', async () => {
    dd.classList.remove('open');
    const { showSyncModal } = await import('./sync-modal.js');
    showSyncModal(state.currentGameName, save.key);
  });

  dd.querySelector('.ms-connect-drive-action')?.addEventListener('click', async () => {
    dd.classList.remove('open');
    const { signIn } = await import('../utils/gdrive/index.js');
    try {
      await signIn();
      updateStatus('Connected to Google Drive', 'success');
    } catch (err) {
      updateStatus('Connection failed: ' + err.message, 'error');
    }
  });

  dd.querySelector('.ms-backups-action')?.addEventListener('click', () => {
    dd.classList.remove('open');
    lastMoreBtn = null;
    toggleBackups(save, backups, row);
  });

  dd.querySelector('.ms-export-action').addEventListener('click', () => {
    dd.classList.remove('open');
    exportSave(save);
  });
  dd.querySelector('.ms-delete-action').addEventListener('click', () => {
    dd.classList.remove('open');
    deleteSave(save, row);
  });

  const rect = moreBtn.getBoundingClientRect();
  const ddW = 210, ddH = 150;
  const top = window.innerHeight - rect.bottom < ddH + 8 ? rect.top - ddH - 4 : rect.bottom + 4;
  dd.style.cssText = `position:fixed; min-width:${ddW}px; top:${top}px; left:${rect.right - ddW}px;`;
  dd.classList.add('open');
}

// ─── Rendering ───────────────────────────────────────────────────────────────

function renderRow(save) {
  const cloudStatus = getCloudStatus(save);
  const moves = getMoveCount(save.saveData);
  const movesHtml = moves !== null ? `<span class="ms-row-moves">${moves} moves</span>` : '';
  const row = document.createElement('div');
  row.className = 'ms-row';
  row.dataset.key = save.key;

  row.innerHTML = `
    <div class="ms-type-bar ${save.bar}"></div>
    <div class="ms-row-info">
      <div class="ms-row-name">${escapeHtml(save.name)}</div>
      <div class="ms-row-time">${relativeTime(save.timestamp)}</div>
      ${movesHtml}
    </div>
    <div class="ms-row-actions">
      <button class="ms-more-btn" title="More options">
        <span class="material-icons">more_vert</span>
      </button>
      <button class="ms-load-btn">Load</button>
      <button class="ms-save-btn">Save</button>
    </div>
  `;

  row.querySelector('.ms-more-btn').addEventListener('click', e => {
    e.stopPropagation();
    openDropdown(e.currentTarget, save, row, cloudStatus);
  });
  row.querySelector('.ms-load-btn').addEventListener('click', () => loadSave(save));
  row.querySelector('.ms-save-btn').addEventListener('click', () => saveToSlot(save));

  return row;
}

// ─── Bottom ⋮ Dropdown ────────────────────────────────────────────────────────

function openBottomDropdown(moreBtn) {
  const dd = getPortalDropdown();

  // Toggle closed if already open for this button
  if (dd.classList.contains('open') && lastMoreBtn === moreBtn) {
    dd.classList.remove('open');
    lastMoreBtn = null;
    return;
  }
  lastMoreBtn = moreBtn;

  const googleG = `<svg width="13" height="13" viewBox="0 0 18 18" style="flex-shrink:0;margin-right:1px"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.703-1.567 2.684-3.874 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/></svg>`;

  const driveItems = state.gdriveSignedIn
    ? `<div class="ms-dropdown-divider"></div>
       <div class="ms-dropdown-section-header">${googleG}Drive options</div>
       <button class="ms-dropdown-item ms-sync-action">
         <span class="material-icons">sync</span>Sync Drive
       </button>
       <button class="ms-dropdown-item ms-folder-action">
         <span class="material-icons">folder_open</span>Change Drive folder
       </button>
       <div class="ms-dropdown-divider"></div>
       <button class="ms-dropdown-item ms-disconnect-action" style="color:var(--text-secondary,#a8a5a0)">
         <span class="material-icons" style="color:var(--text-secondary,#a8a5a0)">cloud_off</span>Disconnect Drive
       </button>`
    : `<div class="ms-dropdown-divider"></div>
       <button class="ms-dropdown-item ms-connect-action">
         ${googleG}Connect Drive
       </button>`;

  dd.innerHTML = `
    <button class="ms-dropdown-item ms-import-action">
      <span class="material-icons">download</span>Import save file
    </button>
    ${driveItems}
  `;

  dd.querySelector('.ms-import-action').addEventListener('click', async () => {
    dd.classList.remove('open');
    closeManageSavesModal();
    const { importSaveFromFile } = await import('../game/save-manager.js');
    importSaveFromFile();
  });

  if (state.gdriveSignedIn) {
    const openSyncPreview = async (direction) => {
      const { showSyncPreview } = await import('./sync-preview-modal.js');
      const { compareSaves } = await import('../utils/gdrive/gdrive-sync-preview.js');
      updateStatus('Loading saves...', 'processing');
      try {
        const items = await compareSaves(state.currentGameName, direction);
        updateStatus('');
        if (items.length === 0) {
          const { confirmDialog } = await import('./confirm-dialog.js');
          await confirmDialog('No saves to sync for this game.', { title: 'Nothing to sync', okOnly: true });
          return;
        }
        dd.classList.remove('open');
        showSyncPreview(direction, items);
      } catch (err) { updateStatus('Sync failed: ' + err.message, 'error'); }
    };

    dd.querySelector('.ms-sync-action').addEventListener('click', () => {
      dd.classList.remove('open');
      openSyncModal();
    });

    dd.querySelector('.ms-folder-action').addEventListener('click', async () => {
      dd.classList.remove('open');
      const { openFolderPicker } = await import('./settings/gdrive-ui.js');
      openFolderPicker();
    });

    dd.querySelector('.ms-disconnect-action').addEventListener('click', async () => {
      dd.classList.remove('open');
      const { signOut } = await import('../utils/gdrive/index.js');
      try { await signOut(); updateStatus('Disconnected from Google Drive'); }
      catch (err) { updateStatus('Disconnect failed: ' + err.message, 'error'); }
    });
  } else {
    dd.querySelector('.ms-connect-action').addEventListener('click', async () => {
      const { signIn } = await import('../utils/gdrive/index.js');
      try {
        await signIn();
        updateStatus('Connected to Google Drive', 'success');
        dd.classList.remove('open');
      } catch (err) { updateStatus('Connection failed: ' + err.message, 'error'); }
    });
  }

  const rect = moreBtn.getBoundingClientRect();
  const ddW = 190, ddH = 90;
  const top = window.innerHeight - rect.bottom < ddH + 8 ? rect.top - ddH - 4 : rect.bottom + 4;
  dd.style.cssText = `position:fixed; min-width:${ddW}px; top:${top}px; left:${rect.right - ddW}px;`;
  dd.classList.add('open');
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function renderFooter(footerEl) {
  footerEl.innerHTML = '';

  const importBtn = document.createElement('button');
  importBtn.className = 'manage-saves-import-btn';
  importBtn.innerHTML = '<span class="material-icons">download</span>Import Save File';
  importBtn.addEventListener('click', async () => {
    closeManageSavesModal();
    const { importSaveFromFile } = await import('../game/save-manager.js');
    importSaveFromFile();
  });
  footerEl.appendChild(importBtn);

  const googleG = `<svg width="14" height="14" viewBox="0 0 18 18" style="flex-shrink:0"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.703-1.567 2.684-3.874 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/></svg>`;

  const driveBtn = document.createElement('button');
  driveBtn.className = 'ms-connect-drive';
  driveBtn.innerHTML = `${googleG}Sync Drive`;

  driveBtn.addEventListener('click', async () => {
    try {
      const { syncAllNow } = await import('../utils/gdrive/gdrive-sync.js');
      await syncAllNow();
    } catch (err) {
      updateStatus('Sync failed: ' + err.message, 'error');
    }
  });

  footerEl.appendChild(driveBtn);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function openManageSavesModal() {
  if (!state.currentGameName) {
    updateStatus('No game loaded');
    return;
  }

  overlayEl = document.getElementById('manageSavesOverlay');
  if (!overlayEl) return;

  const titleEl = document.getElementById('manageSavesTitle');
  if (titleEl) titleEl.textContent = `Saves — ${getGameDisplayName(state.currentGameName)}`;

  refreshDriveStatusCache(state.currentGameName);

  const listEl = document.getElementById('manageSavesList');
  if (listEl) {
    listEl.innerHTML = '';

    const saves = collectSaves(state.currentGameName);
    if (saves.length === 0) {
      listEl.innerHTML = '<div class="manage-saves-empty">No saves yet — use Save to create one.</div>';
    } else {
      saves.forEach(save => listEl.appendChild(renderRow(save)));
    }

    const bottomRow = document.createElement('div');
    bottomRow.className = 'ms-bottom-row';

    const newBtn = document.createElement('button');
    newBtn.className = 'ms-new-row';
    newBtn.innerHTML = '<span class="material-icons">add</span> Save Game';
    newBtn.addEventListener('click', () => {
      const form = document.createElement('div');
      form.className = 'ms-new-row-form';
      form.innerHTML = `
        <input class="ms-new-input" type="text" placeholder="Save name…" maxlength="40">
        <button class="ms-new-confirm">Save</button>
        <button class="ms-new-cancel"><span class="material-icons">close</span></button>
      `;
      newBtn.replaceWith(form);
      const input = form.querySelector('.ms-new-input');
      input.focus();

      const doSave = async () => {
        const name = input.value.trim();
        if (!name) return;
        closeManageSavesModal();
        const { customSave } = await import('../game/save-manager.js');
        await customSave(name);
      };
      const doCancel = () => form.replaceWith(newBtn);

      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') doSave();
        if (e.key === 'Escape') doCancel();
      });
      form.querySelector('.ms-new-confirm').addEventListener('click', doSave);
      form.querySelector('.ms-new-cancel').addEventListener('click', doCancel);
    });

    const moreBtn = document.createElement('button');
    moreBtn.className = 'ms-bottom-more-btn';
    moreBtn.innerHTML = '<span class="material-icons">more_vert</span>';
    moreBtn.addEventListener('click', e => {
      e.stopPropagation();
      openBottomDropdown(moreBtn);
    });

    bottomRow.appendChild(newBtn);
    bottomRow.appendChild(moreBtn);
    listEl.appendChild(bottomRow);
  }

  overlayEl.classList.remove('hidden');
}

export function closeManageSavesModal() {
  overlayEl?.classList.add('hidden');
  portalDropdown?.classList.remove('open');
  expandedBackups.clear();
  lastMoreBtn = null;
}

export function initManageSavesModal() {
  overlayEl = document.getElementById('manageSavesOverlay');
  if (!overlayEl) return;

  document.getElementById('manageSavesClose')
    ?.addEventListener('click', closeManageSavesModal);

  overlayEl.addEventListener('click', e => {
    if (e.target === overlayEl) closeManageSavesModal();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !overlayEl.classList.contains('hidden')) closeManageSavesModal();
  });

  const restoreName = sessionStorage.getItem('iftalk_manage_saves_restore');
  if (restoreName) {
    sessionStorage.removeItem('iftalk_manage_saves_restore');
    updateStatus(`Restoring: ${restoreName}...`);
  }
}
