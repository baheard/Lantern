/**
 * Two-column sync modal
 * Left: local saves | center: directional arrow | Right: Drive saves
 * Arrow cycles: upload (→, gold) → download (←, blue) → skip (⊖, gold)
 */

import { state } from '../core/state.js';
import { compareSaves, syncSaveFile } from '../utils/gdrive/gdrive-sync-preview.js';
import { updateStatus } from '../utils/status.js';
import { deleteFile } from '../utils/gdrive/gdrive-api.js';
import { getGameDisplayName } from './settings/settings-panel.js';

// Returns a display label for a raw game name, handling hex fingerprints gracefully
function getGameLabel(gn) {
  if (!gn) return 'Unknown Game';
  // Hex fingerprint: long lowercase hex string (game loaded without a proper filename)
  if (/^[0-9a-f]{20,}$/.test(gn)) return `Unknown Game (${gn.slice(0, 8)}…)`;
  return getGameDisplayName(gn) || gn;
}

let overlayEl = null;
let currentGameName = null;
let selectAllState = 'skip';
let selectAllBtn = null;
let syncDone = false;

const ARROW_CYCLE = ['upload', 'download', 'skip'];

function relTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const diff = Math.floor((Date.now() - d) / 86400000);
  if (diff === 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getMoveCount(key) {
  try {
    const data = JSON.parse(localStorage.getItem(key));
    const html = data?.displayHTML?.statusBar || '';
    const text = html.replace(/<[^>]+>/g, ' ');
    const m = text.match(/Moves[:\s]+(\d+)/i);
    return m ? parseInt(m[1]) : null;
  } catch { return null; }
}

function typeOrder(key) {
  if (key.includes('_autosave_')) return 0;
  if (key.includes('_quicksave_')) return 1;
  return 2;
}

function defaultArrow(item) {
  if (!item.localTimestamp) return 'download';
  if (!item.driveTimestamp) return 'upload';
  if (item.status === 'Synced') return 'skip';
  if (item.status === 'Conflict') return 'skip';
  if (item.status === 'Newer') return 'upload';
  if (item.status === 'Older') return 'download';
  return 'skip';
}

function arrowIcon(a)  { return a === 'upload' ? 'arrow_forward' : a === 'download' ? 'arrow_back' : 'do_not_disturb_on'; }
function arrowColor(a) { return a === 'download' ? '#2196f3' : 'var(--accent-warm, #c4a35a)'; }

function cellHtml(timestamp, name, side, localKey, driveMoves) {
  if (!timestamp) {
    return `<div class="sm-cell sm-cell-empty" data-side="${side}">
      <div class="sm-cell-absent">${side === 'local' ? 'Not on device' : 'Not on Drive'}</div>
    </div>`;
  }
  const moves = side === 'local' && localKey ? getMoveCount(localKey) : (side === 'drive' ? driveMoves : null);
  const movesHtml = moves !== null ? `<div class="sm-cell-moves">${moves} moves</div>` : '';
  return `<div class="sm-cell" data-side="${side}">
    <div class="sm-cell-name">${name}</div>
    <div class="sm-cell-time">${relTime(timestamp)}</div>
    ${movesHtml}
  </div>`;
}

async function deleteSyncRow(item, rowEl) {
  const hasLocal = !!item.localTimestamp;
  const hasDrive = !!item.driveFile;
  const where = hasLocal && hasDrive ? 'from this device and Google Drive'
    : hasLocal ? 'from this device'
    : 'from Google Drive';
  const { confirmDialog } = await import('./confirm-dialog.js');
  const ok = await confirmDialog(
    `Delete "${item.name}" ${where}?\n\nThis cannot be undone.`,
    { title: 'Delete Save?' }
  );
  if (!ok) return;

  if (hasLocal) localStorage.removeItem(item.key);
  if (hasDrive) {
    try { await deleteFile(item.driveFile.id); } catch { /* silent */ }
  }

  rowEl.style.transition = 'opacity 0.2s';
  rowEl.style.opacity = '0';
  setTimeout(() => {
    const prevEl = rowEl.previousElementSibling;
    rowEl.remove();
    // Remove game header if it's now orphaned (no rows follow it before the next header)
    if (prevEl && prevEl.classList.contains('sm-game-header')) {
      const nextEl = prevEl.nextElementSibling;
      if (!nextEl || nextEl.classList.contains('sm-game-header')) {
        prevEl.remove();
      }
    }
    const body = document.getElementById('smBody');
    if (body && !body.querySelector('.sm-row')) {
      body.innerHTML = '<div class="sm-empty">No saves to show.</div>';
      overlayEl.querySelector('.sm-sync-btn').disabled = true;
    }
    updateSelectAllIcon();
  }, 200);
}

function makeRow(item) {
  const arrow = defaultArrow(item);
  const isConflict = item.status === 'Conflict';
  const isSynced = item.status === 'Synced';
  const localMoves = item.localTimestamp ? (getMoveCount(item.key) ?? 0) : 0;
  const driveMoves = item.driveMoveCount ?? 0;

  const hasLocal = !!item.localTimestamp;
  const hasDrive = !!item.driveTimestamp;
  // Allowed directions: only upload if local exists, only download if drive exists
  const allowedCycle = ARROW_CYCLE.filter(a =>
    a === 'skip' || (a === 'upload' && hasLocal) || (a === 'download' && hasDrive)
  );

  const row = document.createElement('div');
  row.className = `sm-row${isConflict ? ' sm-conflict' : ''}${isSynced ? ' sm-synced' : ''}`;
  row.dataset.key = item.key;
  row.dataset.type = item.key.includes('_autosave_') ? 'autosave' : item.key.includes('_quicksave_') ? 'quicksave' : 'customsave';
  if (item.gameName) row.dataset.gameName = item.gameName;
  row.dataset.arrow = arrow;
  row.dataset.localMoves = localMoves;
  row.dataset.driveMoves = driveMoves;

  const showBtn = allowedCycle.length > 1;
  row.innerHTML = `
    ${cellHtml(item.localTimestamp, item.name, 'local', item.key)}
    <div class="sm-arrow-col">
      ${isConflict ? '<div class="sm-conflict-badge">!</div>' : ''}
      <button class="sm-arrow-btn" title="Change direction" ${showBtn ? '' : 'disabled style="pointer-events:none"'}>
        <span class="material-icons" style="color:${arrowColor(arrow)}">${arrowIcon(arrow)}</span>
      </button>
    </div>
    ${cellHtml(item.driveTimestamp, item.name, 'drive', null, item.driveMoveCount ?? null)}
    <div class="sm-delete-col">
      <button class="sm-delete-btn" title="Delete save">
        <span class="material-icons">delete_outline</span>
      </button>
    </div>
  `;

  row.querySelector('.sm-delete-btn').addEventListener('click', e => {
    e.stopPropagation();
    deleteSyncRow(item, row);
  });

  const btn = row.querySelector('.sm-arrow-btn');
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const cur = allowedCycle.indexOf(row.dataset.arrow);
    const next = allowedCycle[(cur + 1) % allowedCycle.length];
    setArrow(row, next);
  });

  // Clicking a cell aims sync toward that side (only if that direction is allowed)
  row.querySelectorAll('.sm-cell:not(.sm-cell-empty)').forEach(cell => {
    cell.addEventListener('click', () => {
      const side = cell.dataset.side;
      const aimed = side === 'local' ? 'upload' : 'download';
      if (!allowedCycle.includes(aimed)) return;
      setArrow(row, row.dataset.arrow === aimed ? (allowedCycle.includes('skip') ? 'skip' : aimed) : aimed);
    });
  });

  return row;
}

function isOverwrite(row, state) {
  if (state === 'skip') return false;
  const lm = parseInt(row.dataset.localMoves || '0');
  const dm = parseInt(row.dataset.driveMoves || '0');
  if (!lm && !dm) return false;
  if (state === 'upload' && dm > lm) return true;   // drive has more moves, overwriting it
  if (state === 'download' && lm > dm) return true;  // local has more moves, overwriting it
  return false;
}

function updateSelectAllIcon() {
  if (!selectAllBtn || selectAllBtn.classList.contains('hidden')) return;
  const rows = [...document.querySelectorAll('#smBody .sm-row[data-key]')];
  if (!rows.length) return;
  const allSame = rows.every(r => r.dataset.arrow === rows[0].dataset.arrow);
  const icon = selectAllBtn.querySelector('.sm-all-icon');
  if (allSame) {
    selectAllState = rows[0].dataset.arrow;
    icon.textContent = arrowIcon(selectAllState);
    icon.style.color = arrowColor(selectAllState);
  } else {
    icon.textContent = '';
  }
}

function setArrow(row, state) {
  row.dataset.arrow = state;
  const btn = row.querySelector('.sm-arrow-btn');
  const icon = btn.querySelector('.material-icons');
  let warn = row.querySelector('.sm-warn-badge');

  if (isOverwrite(row, state)) {
    icon.textContent = arrowIcon(state);
    icon.style.color = '#f44336';
    if (!warn) {
      warn = document.createElement('div');
      warn.className = 'sm-warn-badge';
      warn.textContent = '!';
      btn.appendChild(warn);
    }
  } else {
    icon.textContent = arrowIcon(state);
    icon.style.color = arrowColor(state);
    warn?.remove();
  }
  updateSelectAllIcon();
}

function buildOverlay() {
  overlayEl = document.createElement('div');
  overlayEl.className = 'sm-overlay hidden';
  overlayEl.innerHTML = `
    <div class="sm-modal">
      <div class="sm-header">
        <span class="sm-col-label">This Device</span>
        <button class="sm-all-btn sm-select-all-btn hidden" title="Set direction for all saves">
          <span class="sm-all-label">Sync all</span>
          <span class="material-icons sm-all-icon" style="color:${arrowColor('skip')}">${arrowIcon('skip')}</span>
        </button>
        <span class="sm-col-label sm-col-right">Google Drive</span>
      </div>
      <div class="sm-body" id="smBody"></div>
      <div class="sm-footer">
        <button class="sm-cancel-btn">Cancel</button>
        <button class="sm-sync-btn">Sync</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlayEl);

  selectAllBtn = overlayEl.querySelector('.sm-select-all-btn');
  selectAllBtn.addEventListener('click', () => {
    selectAllState = ARROW_CYCLE[(ARROW_CYCLE.indexOf(selectAllState) + 1) % ARROW_CYCLE.length];
    document.querySelectorAll('#smBody .sm-row[data-key]').forEach(r => setArrow(r, selectAllState));
  });

  overlayEl.querySelector('.sm-cancel-btn').addEventListener('click', closeSyncModal);
  overlayEl.addEventListener('click', e => { if (e.target === overlayEl) closeSyncModal(); });
  overlayEl.querySelector('.sm-sync-btn').addEventListener('click', () => {
    if (syncDone) closeSyncModal();
    else executeSync();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !overlayEl.classList.contains('hidden')) closeSyncModal();
  });
}

async function loadItems(gameName) {
  // Merge export (local-first) + import (drive-only) items
  const [exportItems, importItems] = await Promise.all([
    compareSaves(gameName, 'export'),
    compareSaves(gameName, 'import'),
  ]);
  const seen = new Set(exportItems.map(i => i.key));
  const combined = [...exportItems];
  for (const item of importItems) {
    if (!seen.has(item.key)) combined.push(item);
  }
  // Sort: by game name (when all-games), then autosave/quicksave/customsave, then newest first
  combined.sort((a, b) => {
    const ga = a.gameName || '', gb = b.gameName || '';
    if (ga !== gb) return ga.localeCompare(gb);
    const ta = typeOrder(a.key), tb = typeOrder(b.key);
    if (ta !== tb) return ta - tb;
    const da = a.localTimestamp || a.driveTimestamp;
    const db = b.localTimestamp || b.driveTimestamp;
    return new Date(db) - new Date(da);
  });
  return combined;
}

async function executeSync() {
  const rows = overlayEl.querySelectorAll('.sm-row[data-key]');
  const todo = [];
  rows.forEach(row => {
    if (row.dataset.arrow !== 'skip') {
      todo.push({ key: row.dataset.key, direction: row.dataset.arrow === 'upload' ? 'export' : 'import', gameName: row.dataset.gameName || '' });
    }
  });

  if (todo.length === 0) { closeSyncModal(); return; }

  const overwrites = [...rows].filter(r => r.dataset.arrow !== 'skip' && isOverwrite(r, r.dataset.arrow));
  if (overwrites.length > 0) {
    const { confirmDialog } = await import('./confirm-dialog.js');
    const names = overwrites.map(r => {
      const lm = r.dataset.localMoves, dm = r.dataset.driveMoves;
      const dir = r.dataset.arrow === 'upload' ? `local (${lm} moves) → Drive (${dm} moves)` : `Drive (${dm} moves) → local (${lm} moves)`;
      const saveName = r.querySelector('.sm-cell-name')?.textContent;
      const gameLabel = !currentGameName && r.dataset.gameName ? getGameLabel(r.dataset.gameName) : null;
      const label = gameLabel ? `${gameLabel} — ${saveName}` : saveName;
      return `• ${label}: ${dir}`;
    }).join('\n');
    const ok = await confirmDialog(`This will overwrite saves with more progress:\n\n${names}\n\nContinue?`, { title: 'Overwrite warning' });
    if (!ok) return;
  }

  // Switch to progress view
  const body = document.getElementById('smBody');
  const cancelBtn = overlayEl.querySelector('.sm-cancel-btn');
  const syncBtn = overlayEl.querySelector('.sm-sync-btn');
  const header = overlayEl.querySelector('.sm-header');

  cancelBtn.classList.add('hidden');
  syncBtn.disabled = true;
  syncBtn.textContent = 'Syncing…';
  header.classList.add('hidden');

  body.innerHTML = '<div class="sm-progress-list"></div>';
  const progressList = body.querySelector('.sm-progress-list');

  updateStatus('Syncing…', 'processing');

  try {
    const items = await loadItems(currentGameName);
    const keyMap = new Map(items.map(i => [i.key, i]));
    let ok = 0, failed = 0;

    for (const { key, direction, gameName } of todo) {
      const item = keyMap.get(key);
      const saveName = item?.name || key;
      const gameLabel = !currentGameName && gameName ? getGameLabel(gameName) : null;
      const label = gameLabel ? `${gameLabel} — ${saveName}` : saveName;
      const dirIcon = direction === 'export' ? 'cloud_upload' : 'cloud_download';

      const progressRow = document.createElement('div');
      progressRow.className = 'sm-progress-item sm-progress-pending';
      progressRow.innerHTML = `<span class="material-icons sm-spin">${dirIcon}</span><span class="sm-progress-label">${label}</span>`;
      progressList.appendChild(progressRow);
      progressList.scrollTop = progressList.scrollHeight;

      try {
        if (item) {
          await syncSaveFile(item, direction);
          progressRow.className = 'sm-progress-item sm-progress-ok';
          progressRow.innerHTML = `<span class="material-icons">check_circle</span><span class="sm-progress-label">${label}</span>`;
          ok++;
        } else {
          progressRow.className = 'sm-progress-item sm-progress-err';
          progressRow.innerHTML = `<span class="material-icons">error</span><span class="sm-progress-label">${label}<br><small>Save not found</small></span>`;
          failed++;
        }
      } catch (err) {
        progressRow.className = 'sm-progress-item sm-progress-err';
        progressRow.innerHTML = `<span class="material-icons">error</span><span class="sm-progress-label">${label}<br><small>${err.message}</small></span>`;
        failed++;
      }
    }

    const summaryText = failed > 0
      ? `${ok} synced, ${failed} failed`
      : `${ok} save${ok !== 1 ? 's' : ''} synced`;
    const summaryIcon = failed > 0 ? 'error' : 'check_circle';
    const summaryClass = failed > 0 ? 'sm-progress-err' : 'sm-progress-ok';

    const summaryEl = document.createElement('div');
    summaryEl.className = `sm-progress-summary ${summaryClass}`;
    summaryEl.innerHTML = `<span class="material-icons">${summaryIcon}</span><span>${summaryText}</span>`;
    body.insertBefore(summaryEl, progressList);

    updateStatus(summaryText, failed > 0 ? 'error' : 'success');
    document.dispatchEvent(new CustomEvent('iftalk:synccomplete', { detail: { gameName: currentGameName } }));
  } catch (err) {
    const errEl = document.createElement('div');
    errEl.className = 'sm-progress-summary sm-progress-err';
    errEl.innerHTML = `<span class="material-icons">error</span><span>Sync failed: ${err.message}</span>`;
    body.insertBefore(errEl, progressList);
    updateStatus('Sync failed: ' + err.message, 'error');
  }

  syncDone = true;
  syncBtn.textContent = 'Done';
  syncBtn.disabled = false;
}

export async function showSyncModal(gameName, filterKey = null) {
  currentGameName = gameName;
  if (!overlayEl) buildOverlay();

  const body = document.getElementById('smBody');
  body.innerHTML = '<div class="sm-loading"><span class="material-icons sm-spin">sync</span></div>';
  overlayEl.classList.remove('hidden');

  try {
    let items = await loadItems(gameName);
    if (filterKey) items = items.filter(i => i.key === filterKey);
    body.innerHTML = '';

    if (items.length === 0) {
      body.innerHTML = '<div class="sm-empty">All saves are synced with Drive.</div>';
      overlayEl.querySelector('.sm-sync-btn').disabled = true;
      return;
    }

    selectAllBtn.classList.toggle('hidden', items.length <= 1);

    selectAllState = 'skip';

    if (!gameName) {
      // Group by game with separator headers
      const groups = new Map();
      for (const item of items) {
        const gn = item.gameName || '';
        if (!groups.has(gn)) groups.set(gn, []);
        groups.get(gn).push(item);
      }
      for (const [gn, groupItems] of groups) {
        const header = document.createElement('div');
        header.className = 'sm-game-header';
        header.textContent = getGameLabel(gn);
        body.appendChild(header);
        groupItems.forEach(item => body.appendChild(makeRow(item)));
      }
    } else {
      items.forEach(item => body.appendChild(makeRow(item)));
    }
    updateSelectAllIcon();
  } catch (err) {
    body.innerHTML = `<div class="sm-empty sm-error">Could not load Drive saves.<br><small>${err.message}</small></div>`;
  }
}

export function closeSyncModal() {
  overlayEl?.classList.add('hidden');
  // Reset progress state so next open starts fresh
  syncDone = false;
  const cancelBtn = overlayEl?.querySelector('.sm-cancel-btn');
  const syncBtn = overlayEl?.querySelector('.sm-sync-btn');
  const header = overlayEl?.querySelector('.sm-header');
  if (cancelBtn) cancelBtn.classList.remove('hidden');
  if (syncBtn) { syncBtn.textContent = 'Sync'; syncBtn.disabled = false; }
  if (header) header.classList.remove('hidden');
}
