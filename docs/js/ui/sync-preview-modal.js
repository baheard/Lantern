/**
 * Sync Preview Modal
 *
 * Shows a preview of files to be synced with Google Drive,
 * allows selective sync, displays progress, and shows summary.
 */

import { state } from '../core/state.js';
import { updateStatus } from '../utils/status.js';
import { getGameDisplayName } from './settings/settings-panel.js';

// Timestamp comparison thresholds
const SYNC_THRESHOLD_MS = 1000;      // Within 1 second = synced
const CONFLICT_THRESHOLD_MS = 60000; // Within 1 minute = potential conflict

// Modal state
let syncDirection = null; // 'import' or 'export'
let syncItems = [];
let selectedItems = new Set();
let isCancelled = false;

/**
 * Show sync preview modal
 * @param {string} direction - 'import' or 'export'
 * @param {Array} items - Array of sync items with comparison data
 */
export async function showSyncPreview(direction, items) {
  syncDirection = direction;
  syncItems = items;
  selectedItems = new Set(items.map(item => item.id));
  isCancelled = false;

  const overlay = document.getElementById('syncPreviewOverlay');
  const title = document.getElementById('syncPreviewTitle');
  const content = document.getElementById('syncPreviewContent');
  const progress = document.getElementById('syncProgressContent');
  const summary = document.getElementById('syncSummaryContent');

  // Set title based on direction
  const gameDisplayName = getGameDisplayName(state.currentGameName) || 'Game';
  title.textContent = direction === 'export'
    ? `Local Saves to Export to Cloud - ${gameDisplayName}`
    : `Cloud Saves to Import to Device - ${gameDisplayName}`;

  // Show preview content, hide others
  content.classList.remove('hidden');
  progress.classList.add('hidden');
  summary.classList.add('hidden');

  // Render items
  renderSyncItems(items);

  // Update button text
  updateConfirmButton();

  // Show overlay
  overlay.classList.remove('hidden');
}

/**
 * Get contextual status label based on sync direction
 */
function getContextualStatusLabel(status, direction) {
  if (status === 'New') {
    return direction === 'export' ? 'Not on Drive' : 'Not on Device';
  }

  if (status === 'Newer') {
    return direction === 'export' ? 'Update Drive' : 'Update Local';
  }

  if (status === 'Older') {
    return direction === 'export' ? 'Older than Drive' : 'Older than Local';
  }

  if (status === 'Conflict') {
    return 'Conflict';
  }

  if (status === 'Synced') {
    return 'Up to Date';
  }

  return status;
}

/**
 * Render sync items list
 */
function renderSyncItems(items) {
  const listContainer = document.getElementById('syncItemsList');
  const selectAllCheckbox = document.getElementById('syncSelectAll');

  if (items.length === 0) {
    listContainer.innerHTML = '<div class="sync-empty-state">No saves to sync</div>';
    selectAllCheckbox.disabled = true;
    return;
  }

  selectAllCheckbox.disabled = false;
  selectAllCheckbox.checked = selectedItems.size === items.length;

  listContainer.innerHTML = items.map(item => {
    const isChecked = selectedItems.has(item.id);
    const statusLabel = getContextualStatusLabel(item.status, syncDirection);
    const statusClass = `sync-status-${item.status.toLowerCase()}`;
    const directionIcon = syncDirection === 'export' ? 'cloud_upload' : 'cloud_download';
    const directionText = syncDirection === 'export' ? 'Local → Cloud' : 'Cloud → Local';

    return `
      <div class="sync-item ${isChecked ? 'selected' : ''}" data-item-id="${item.id}">
        <label class="sync-item-checkbox">
          <input type="checkbox" ${isChecked ? 'checked' : ''} data-item-id="${item.id}">
          <div class="sync-item-info">
            <div class="sync-item-header">
              <span class="sync-item-name">${item.name}</span>
              <span class="sync-status-badge ${statusClass}">${statusLabel}</span>
            </div>
            <div class="sync-item-details">
              <span class="sync-item-direction">
                <span class="material-icons">${directionIcon}</span>
                ${directionText}
              </span>
              ${getStatusDetails(item)}
            </div>
            ${getConflictWarning(item)}
          </div>
        </label>
      </div>
    `;
  }).join('');

  // Attach event listeners
  attachItemListeners();
}

/**
 * Get status details text
 */
function getStatusDetails(item) {
  if (item.status === 'New') {
    return `<span class="sync-item-timestamp">Not on ${syncDirection === 'export' ? 'Drive' : 'device'} yet</span>`;
  }

  if (item.status === 'Synced') {
    // If timestamps are the same, just show one timestamp
    const timestamp = item.localTimestamp || item.driveTimestamp;
    return `<span class="sync-item-timestamp">${formatTimestampCompact(timestamp)}</span>`;
  }

  // For Newer, Older, and Conflict: show both timestamps for comparison
  // Bold the one being synced (Cloud for import, Local for export)
  // Color code: green if newer, red if older
  const isSyncing = (side) => {
    return (side === 'local' && syncDirection === 'export') ||
           (side === 'cloud' && syncDirection === 'import');
  };

  const getStatusClass = (side) => {
    if (!isSyncing(side)) return '';
    if (item.status === 'Newer') return 'syncing newer';
    if (item.status === 'Older') return 'syncing older';
    if (item.status === 'Conflict') return 'syncing conflict';
    return 'syncing';
  };

  const getStatusBadge = (side) => {
    if (!isSyncing(side)) return '';
    if (item.status === 'Newer') return ' <span class="sync-status-indicator newer">newer</span>';
    if (item.status === 'Older') return ' <span class="sync-status-indicator older">older</span>';
    if (item.status === 'Conflict') return ' <span class="sync-status-indicator conflict">conflict</span>';
    return '';
  };

  return `
    <div class="sync-item-timestamps">
      <div class="sync-timestamp-row">
        <span class="sync-timestamp-label ${getStatusClass('local')}">Local:</span>
        <span class="sync-timestamp-value ${getStatusClass('local')}">${formatTimestampCompact(item.localTimestamp)}${getStatusBadge('local')}</span>
      </div>
      <div class="sync-timestamp-row">
        <span class="sync-timestamp-label ${getStatusClass('cloud')}">Cloud:</span>
        <span class="sync-timestamp-value ${getStatusClass('cloud')}">${formatTimestampCompact(item.driveTimestamp)}${getStatusBadge('cloud')}</span>
      </div>
    </div>
  `;
}

/**
 * Get conflict warning if applicable
 */
function getConflictWarning(item) {
  if (item.status === 'Conflict') {
    return `
      <div class="sync-item-warning">
        <span class="material-icons">warning</span>
        <span>Both versions have been modified. Choose carefully!</span>
      </div>
    `;
  }

  if (item.status === 'Newer' && syncDirection === 'import') {
    return `
      <div class="sync-item-warning minor">
        <span class="material-icons">info</span>
        <span>Will overwrite local version</span>
      </div>
    `;
  }

  if (item.status === 'Older' && syncDirection === 'import') {
    return `
      <div class="sync-item-warning">
        <span class="material-icons">warning</span>
        <span>Will overwrite newer local version with older cloud version</span>
      </div>
    `;
  }

  if (item.status === 'Older' && syncDirection === 'export') {
    return `
      <div class="sync-item-warning">
        <span class="material-icons">warning</span>
        <span>Will overwrite newer cloud version with older local version</span>
      </div>
    `;
  }

  return '';
}

/**
 * Format timestamp with actual time and relative time
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return 'Unknown';

  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  // Format actual timestamp
  const dateStr = date.toLocaleDateString();
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const actualTime = `${dateStr} ${timeStr}`;

  // Format relative time
  let relativeTime;
  if (days > 0) relativeTime = `${days} day${days > 1 ? 's' : ''} ago`;
  else if (hours > 0) relativeTime = `${hours} hour${hours > 1 ? 's' : ''} ago`;
  else if (minutes > 0) relativeTime = `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  else relativeTime = 'just now';

  return `${actualTime} (${relativeTime})`;
}

/**
 * Format timestamp in compact format (date/time + relative)
 */
function formatTimestampCompact(timestamp) {
  if (!timestamp) return 'Unknown';

  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  // Check if today
  const isToday = date.toDateString() === now.toDateString();

  // Format time
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Format date part
  let dateStr;
  if (isToday) {
    dateStr = 'Today';
  } else if (days === 1) {
    dateStr = 'Yesterday';
  } else if (days < 7) {
    dateStr = date.toLocaleDateString([], { weekday: 'short' });
  } else {
    dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  // Format relative time
  let relativeTime;
  if (days > 0) relativeTime = `${days}d ago`;
  else if (hours > 0) relativeTime = `${hours}h ago`;
  else if (minutes > 0) relativeTime = `${minutes}m ago`;
  else relativeTime = 'now';

  return `${dateStr} ${timeStr} (${relativeTime})`;
}

/**
 * Attach event listeners to items
 */
function attachItemListeners() {
  const checkboxes = document.querySelectorAll('#syncItemsList input[type="checkbox"]');
  checkboxes.forEach(checkbox => {
    checkbox.addEventListener('change', handleItemToggle);
  });

  const selectAllCheckbox = document.getElementById('syncSelectAll');
  selectAllCheckbox.addEventListener('change', handleSelectAll);
}

/**
 * Handle item checkbox toggle
 */
function handleItemToggle(e) {
  const itemId = e.target.dataset.itemId;
  const item = document.querySelector(`.sync-item[data-item-id="${itemId}"]`);

  if (e.target.checked) {
    selectedItems.add(itemId);
    item.classList.add('selected');
  } else {
    selectedItems.delete(itemId);
    item.classList.remove('selected');
  }

  // Update select all checkbox
  const selectAllCheckbox = document.getElementById('syncSelectAll');
  selectAllCheckbox.checked = selectedItems.size === syncItems.length;

  updateConfirmButton();
}

/**
 * Handle select all toggle
 */
function handleSelectAll(e) {
  const checkboxes = document.querySelectorAll('#syncItemsList input[type="checkbox"]');

  if (e.target.checked) {
    selectedItems = new Set(syncItems.map(item => item.id));
    checkboxes.forEach(cb => cb.checked = true);
    document.querySelectorAll('.sync-item').forEach(item => item.classList.add('selected'));
  } else {
    selectedItems.clear();
    checkboxes.forEach(cb => cb.checked = false);
    document.querySelectorAll('.sync-item').forEach(item => item.classList.remove('selected'));
  }

  updateConfirmButton();
}

/**
 * Update confirm button text
 */
function updateConfirmButton() {
  const confirmBtn = document.getElementById('syncConfirmBtn');
  const count = selectedItems.size;
  const action = syncDirection === 'export' ? 'Export' : 'Import';

  if (count === 0) {
    confirmBtn.textContent = action;
    confirmBtn.disabled = true;
  } else {
    confirmBtn.textContent = `${action} ${count} save${count > 1 ? 's' : ''}`;
    confirmBtn.disabled = false;
  }
}

/**
 * Show progress state
 */
function showProgress() {
  const content = document.getElementById('syncPreviewContent');
  const progress = document.getElementById('syncProgressContent');
  const cancelBtn = document.getElementById('syncCancelBtn');
  const confirmBtn = document.getElementById('syncConfirmBtn');

  content.classList.add('hidden');
  progress.classList.remove('hidden');

  // Update buttons
  cancelBtn.textContent = 'Cancel';
  confirmBtn.classList.add('hidden');
}

/**
 * Update progress
 */
function updateProgress(completed, total, currentItem) {
  const progressFill = document.getElementById('syncProgressFill');
  const progressText = document.getElementById('syncProgressText');
  const progressItems = document.getElementById('syncProgressItems');

  const percentage = (completed / total) * 100;
  progressFill.style.width = `${percentage}%`;
  progressText.textContent = `${completed} of ${total}`;

  // Update progress items
  if (currentItem) {
    const itemHtml = `
      <div class="sync-progress-item ${currentItem.status}">
        <span class="material-icons">${getProgressIcon(currentItem.status)}</span>
        <span>${currentItem.name} - ${currentItem.statusText}</span>
      </div>
    `;
    progressItems.insertAdjacentHTML('beforeend', itemHtml);
    progressItems.scrollTop = progressItems.scrollHeight;
  }
}

/**
 * Get progress icon based on status
 */
function getProgressIcon(status) {
  switch (status) {
    case 'success': return 'check_circle';
    case 'error': return 'error';
    case 'uploading': return 'cloud_upload';
    case 'downloading': return 'cloud_download';
    case 'waiting': return 'schedule';
    default: return 'pending';
  }
}

/**
 * Show summary state
 */
function showSummary(results, autosaveImported = false) {
  const progress = document.getElementById('syncProgressContent');
  const summary = document.getElementById('syncSummaryContent');
  const summaryIcon = document.getElementById('syncSummaryIcon');
  const summaryMessage = document.getElementById('syncSummaryMessage');
  const cancelBtn = document.getElementById('syncCancelBtn');
  const confirmBtn = document.getElementById('syncConfirmBtn');

  progress.classList.add('hidden');
  summary.classList.remove('hidden');

  const success = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'error').length;
  const skipped = syncItems.length - selectedItems.size;

  // Update icon
  if (failed === 0 && !isCancelled) {
    summaryIcon.innerHTML = '<span class="material-icons success">check_circle</span>';
  } else if (isCancelled) {
    summaryIcon.innerHTML = '<span class="material-icons warning">cancel</span>';
  } else {
    summaryIcon.innerHTML = '<span class="material-icons error">error</span>';
  }

  // Update message
  const messages = [];
  if (isCancelled) {
    messages.push(`<div class="sync-summary-line">Sync cancelled</div>`);
  }
  if (success > 0) {
    messages.push(`<div class="sync-summary-line success">✓ ${success} save${success > 1 ? 's' : ''} synced successfully</div>`);
  }
  if (failed > 0) {
    messages.push(`<div class="sync-summary-line error">✗ ${failed} save${failed > 1 ? 's' : ''} failed</div>`);
  }
  if (skipped > 0) {
    messages.push(`<div class="sync-summary-line muted">⊘ ${skipped} save${skipped > 1 ? 's' : ''} skipped</div>`);
  }

  if (autosaveImported) {
    messages.push(`<div class="sync-summary-line success">↻ Reloading game to apply imported autosave...</div>`);
  }

  summaryMessage.innerHTML = messages.join('');

  // Update buttons
  cancelBtn.classList.add('hidden');
  confirmBtn.classList.remove('hidden');
  confirmBtn.textContent = 'Done';
  confirmBtn.disabled = false;
  confirmBtn.onclick = closeSyncPreview;

  // Reload game if autosave was imported so it takes effect
  if (autosaveImported) {
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  }
}

/**
 * Perform sync
 */
export async function performSync() {
  if (selectedItems.size === 0) return;

  showProgress();
  isCancelled = false;

  const itemsToSync = syncItems.filter(item => selectedItems.has(item.id));
  const results = [];
  let completed = 0;

  // Clear progress items
  document.getElementById('syncProgressItems').innerHTML = '';

  for (const item of itemsToSync) {
    if (isCancelled) break;

    updateProgress(completed, itemsToSync.length, {
      name: item.name,
      status: syncDirection === 'export' ? 'uploading' : 'downloading',
      statusText: syncDirection === 'export' ? 'Uploading...' : 'Downloading...'
    });

    try {
      // Perform actual sync operation
      await syncItem(item);

      results.push({ id: item.id, status: 'success' });
      updateProgress(completed + 1, itemsToSync.length, {
        name: item.name,
        status: 'success',
        statusText: 'Complete'
      });
    } catch (error) {
      results.push({ id: item.id, status: 'error', error: error.message });
      updateProgress(completed + 1, itemsToSync.length, {
        name: item.name,
        status: 'error',
        statusText: `Failed: ${error.message}`
      });
    }

    completed++;
  }

  // Check if autosave was successfully imported (needs game reload)
  const autosaveImported = syncDirection === 'import' &&
    results.some(r => r.status === 'success' && r.id.includes('_autosave_'));

  // Show summary
  setTimeout(() => showSummary(results, autosaveImported), 500);
}

/**
 * Sync individual item
 */
async function syncItem(item) {
  const { syncSaveFile } = await import('../utils/gdrive/gdrive-sync-preview.js');
  await syncSaveFile(item, syncDirection);
}

/**
 * Cancel sync
 */
function cancelSync() {
  isCancelled = true;
  const cancelBtn = document.getElementById('syncCancelBtn');
  cancelBtn.disabled = true;
  cancelBtn.textContent = 'Cancelling...';
}

/**
 * Close sync preview modal
 */
export function closeSyncPreview() {
  const overlay = document.getElementById('syncPreviewOverlay');
  overlay.classList.add('hidden');
  syncItems = [];
  selectedItems.clear();
  isCancelled = false;
}

/**
 * Initialize sync preview modal
 */
export function initSyncPreview() {
  const closeBtn = document.getElementById('syncPreviewClose');
  const cancelBtn = document.getElementById('syncCancelBtn');
  const confirmBtn = document.getElementById('syncConfirmBtn');

  closeBtn.addEventListener('click', closeSyncPreview);

  cancelBtn.addEventListener('click', () => {
    const progress = document.getElementById('syncProgressContent');
    if (!progress.classList.contains('hidden')) {
      cancelSync();
    } else {
      closeSyncPreview();
    }
  });

  confirmBtn.addEventListener('click', () => {
    const summary = document.getElementById('syncSummaryContent');
    if (!summary.classList.contains('hidden')) {
      closeSyncPreview();
    } else {
      performSync();
    }
  });

  // Close on overlay click
  const overlay = document.getElementById('syncPreviewOverlay');
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeSyncPreview();
    }
  });
}
