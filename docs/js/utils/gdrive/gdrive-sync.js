/**
 * Google Drive Sync Logic Module
 *
 * Handles bidirectional manual sync and conflict resolution.
 */

import { APP_CONFIG } from '../../config.js';
import { state } from '../../core/state.js';
import { updateStatus } from '../status.js';
import { ensureAuthenticated, isSignedIn, silentRefresh } from './gdrive-auth.js';
import {
  uploadFile,
  downloadFile,
  listFiles,
  localStorageKeyToFilename,
  filenameToLocalStorageKey
} from './gdrive-api.js';
import { getDeviceInfo } from './gdrive-device.js';

/**
 * Return a human-readable label for a save localStorage key.
 * Strips the game name so only the save type / custom name is shown.
 * e.g. iftalk_autosave_anchorhead        → "Autosave"
 *      iftalk_quicksave_anchorhead        → "Quicksave"
 *      iftalk_customsave_anchorhead_slot1 → "slot1"
 */
function saveLabel(key, gameName) {
  const type = key.split('_')[1];
  if (type === 'autosave') return 'Autosave';
  if (type === 'quicksave') return 'Quicksave';
  if (type === 'customsave' && gameName) {
    const prefix = `iftalk_customsave_${gameName}_`;
    if (key.startsWith(prefix)) return key.slice(prefix.length) || 'Custom save';
  }
  return key.split('_').slice(3).join('_') || type || key;
}

/** Capitalize first letter of a game name for display. */
function displayGameName(gameName) {
  return gameName ? gameName.charAt(0).toUpperCase() + gameName.slice(1) : 'Game';
}

// Auto-sync: rate-limited upload queue (30s window)
// First save after 30s flushes immediately; saves within the window batch until the 30s mark.
const pendingSyncQueue = new Set();
let syncTimer = null;
let lastFlushTime = 0;
const SYNC_INTERVAL_MS = 30 * 1000;

/**
 * Sync saves to Google Drive (bidirectional manual sync)
 * @param {string} gameName - Optional game name to sync only that game's saves
 * @returns {Promise<number>} Number of files synced (uploaded + downloaded)
 */
export async function syncAllNow(gameName = null) {
  // Ensure authenticated (will prompt if needed)
  const authenticated = await ensureAuthenticated();
  if (!authenticated) {
    updateStatus('Sync cancelled - not signed in');
    return null;
  }

  updateStatus('Syncing with Google Drive…', 'processing');

  try {
    const deviceInfo = getDeviceInfo(); // Get once, reuse
    let uploadCount = 0;
    let downloadCount = 0;

    // Step 1: Get all Drive files and build a map for quick lookup
    const driveFiles = await listFiles();
    const driveFileMap = new Map();

    for (const file of driveFiles) {
      const localKey = filenameToLocalStorageKey(file.name);
      driveFileMap.set(localKey, file);
    }

    // Step 2: Scan localStorage for saves to sync
    const filesToDownload = [];
    const filesToUpload = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);

      // Filter: only process save files
      if (!key || !(
        key.startsWith(`${APP_CONFIG.storagePrefix}_autosave_`) ||
        key.startsWith(`${APP_CONFIG.storagePrefix}_quicksave_`) ||
        key.startsWith(`${APP_CONFIG.storagePrefix}_customsave_`)
      )) {
        continue;
      }

      // Filter: game-specific sync if requested
      if (gameName) {
        // More precise matching: key must end with _{gameName}
        const parts = key.split('_');
        const saveGameName = parts.slice(2).join('_'); // After "iftalk_type_"
        if (saveGameName !== gameName) {
          continue;
        }
      }

      const localData = JSON.parse(localStorage.getItem(key));
      const localTime = new Date(localData.timestamp).getTime();
      const driveFile = driveFileMap.get(key);

      if (!driveFile) {
        // No Drive version - upload local
        filesToUpload.push(key);
      } else {
        // Both exist - compare timestamps using Drive API metadata
        const driveModifiedTime = new Date(driveFile.modifiedTime).getTime();

        if (driveModifiedTime > localTime) {
          // Drive is newer - download (with confirmation)
          filesToDownload.push({
            key: key,
            driveFileId: driveFile.id,
            driveFileName: driveFile.name
          });
        } else if (localTime > driveModifiedTime) {
          // Local is newer - upload
          filesToUpload.push(key);
        }
        // If equal timestamps, skip (already in sync)
      }
    }

    // Step 3: Check for Drive files not in localStorage (download without confirmation)
    for (const file of driveFiles) {
      const localKey = filenameToLocalStorageKey(file.name);

      // Filter by game name if specified
      if (gameName) {
        const parts = localKey.split('_');
        const saveGameName = parts.slice(2).join('_');
        if (saveGameName !== gameName) {
          continue;
        }
      }

      if (!localStorage.getItem(localKey)) {
        // Drive file exists but not local - download it
        try {
          const driveData = await downloadFile(file.name);
          localStorage.setItem(localKey, JSON.stringify(driveData));
          downloadCount++;
        } catch (error) {
          // Failed to download, skip
        }
      }
    }

    // Step 4: If any local files would be overwritten, ask for confirmation
    if (filesToDownload.length > 0) {
      // Download one file to get device info for the prompt
      const firstFile = filesToDownload[0];
      const sampleData = await downloadFile(firstFile.driveFileName);
      const device = sampleData.device || { type: 'Unknown', browser: 'Unknown' };
      const deviceInfoStr = `${device.type} (${device.browser})`;

      const { confirmDialog } = await import('../../ui/confirm-dialog.js');
      const confirmed = await confirmDialog(
        `${filesToDownload.length} save(s) on Google Drive are newer than your local saves.\n\n` +
        `From: ${deviceInfoStr}\n\n` +
        `Download and overwrite local saves?`,
        { title: 'Download Newer Saves?' }
      );

      if (!confirmed) {
        // User cancelled download, proceed with upload only
      } else {
        // User confirmed - download and overwrite with backups
        for (const item of filesToDownload) {
          try {
            // Download Drive version
            const driveData = await downloadFile(item.driveFileName);

            // Create conflict backup before overwriting (use localStorage key directly)
            const localData = JSON.parse(localStorage.getItem(item.key));
            createConflictBackup(item.key, localData);

            // Overwrite with Drive version
            localStorage.setItem(item.key, JSON.stringify(driveData));
            downloadCount++;
          } catch (error) {
            // Failed to download, skip
          }
        }
      }
    }

    // Step 5: Upload local saves that are newer or don't exist on Drive
    for (const key of filesToUpload) {
      try {
        const saveData = JSON.parse(localStorage.getItem(key));

        // Add device info
        const enrichedData = {
          ...saveData,
          device: deviceInfo
        };

        // Include appProperties so checkDriveForNewerAutosave can use saveTimestamp
        // instead of falling back to modifiedTime (server upload time), which causes
        // false "conflict" dialogs on the next page load.
        const localMoves = saveData.appMoveCount ?? null;
        const appProperties = { saveTimestamp: saveData.timestamp || '' };
        if (localMoves !== null) appProperties.moveCount = String(localMoves);

        const filename = localStorageKeyToFilename(key);
        await uploadFile(filename, enrichedData, appProperties);
        uploadCount++;
      } catch (error) {
        // Failed to upload, skip
      }
    }

    const syncTime = new Date().toISOString();
    state.gdriveLastSyncTime = syncTime;
    localStorage.setItem('iftalk_lastSyncTime', syncTime);
    state.gdriveError = null;

    const total = uploadCount + downloadCount;
    if (total === 0) {
      updateStatus('All saves already synced with Drive', 'success');
    } else {
      const parts = [];
      if (uploadCount > 0) parts.push(`${uploadCount} uploaded`);
      if (downloadCount > 0) parts.push(`${downloadCount} downloaded`);
      updateStatus(`Synced: ${parts.join(', ')}`, 'success');
    }
    window.dispatchEvent(new CustomEvent('iftalk:synccomplete', { detail: { gameName } }));

    return total;
  } catch (error) {
    state.gdriveError = error.message;
    throw error;
  }
}

/**
 * Queue a save key for auto-sync upload.
 * Flushes immediately if 30s have elapsed since the last flush;
 * otherwise schedules a flush at the 30s mark so saves batch within the window.
 * Errors are NEVER silent — failures show prominently in the status bar.
 */
export function scheduleDriveSync(saveKey) {
  if (!state.gdriveSyncEnabled) return;

  pendingSyncQueue.add(saveKey);

  if (syncTimer) return; // Already scheduled for this window

  const elapsed = Date.now() - lastFlushTime;
  const delay = elapsed >= SYNC_INTERVAL_MS ? 0 : SYNC_INTERVAL_MS - elapsed;

  syncTimer = setTimeout(async () => {
    syncTimer = null;
    lastFlushTime = Date.now();
    await flushSyncQueue();
  }, delay);
}

async function flushSyncQueue() {
  if (!state.gdriveSyncEnabled) {
    pendingSyncQueue.clear();
    return;
  }

  if (!state.gdriveSignedIn) {
    // Token may have expired — try silent refresh before giving up
    const refreshed = await silentRefresh();
    if (!refreshed) {
      pendingSyncQueue.clear();
      const msg = 'Auto-sync failed: sign in to Drive to sync saves';
      state.gdriveError = msg;
      updateStatus(msg, 'error');
      window.dispatchEvent(new CustomEvent('gdriveAutoSyncError', { detail: { error: msg } }));
      return;
    }
    // Silent refresh succeeded — update state and continue
    state.gdriveSignedIn = true;
  }

  const keys = Array.from(pendingSyncQueue);
  pendingSyncQueue.clear();
  if (keys.length === 0) return;

  const authenticated = await ensureAuthenticated(true);
  if (!authenticated) {
    updateStatus('Auto-sync failed: not signed in to Google Drive', 'error');
    state.gdriveError = 'Auto-sync failed: not signed in';
    window.dispatchEvent(new CustomEvent('gdriveAutoSyncError', { detail: { error: state.gdriveError } }));
    return;
  }

  // Fetch current Drive state once to check for newer versions before uploading
  let driveFileMap = new Map();
  try {
    const driveFiles = await listFiles();
    for (const f of driveFiles) {
      driveFileMap.set(filenameToLocalStorageKey(f.name), f);
    }
  } catch { /* If we can't list, proceed without the guard — upload errors caught below */ }

  let uploadCount = 0;
  const failures = [];
  const skipped = []; // Drive is newer — would overwrite progress from another device

  for (const key of keys) {
    try {
      const currentData = localStorage.getItem(key);
      if (!currentData) continue;

      const saveData = JSON.parse(currentData);
      const localTime = new Date(saveData.timestamp).getTime();

      // Guard: if Drive already has a newer version, don't overwrite it.
      // Use move count as the primary signal (more reliable than wall-clock time
      // across devices). Fall back to timestamp comparison.
      const driveFile = driveFileMap.get(key);
      if (driveFile) {
        const driveMoves = driveFile.appProperties?.moveCount != null
          ? (n => isNaN(n) ? null : n)(parseInt(driveFile.appProperties.moveCount, 10)) : null;
        const localMoves = saveData.appMoveCount ?? null;

        const driveCompareTime = driveFile.appProperties?.saveTimestamp
          ? new Date(driveFile.appProperties.saveTimestamp).getTime()
          : new Date(driveFile.modifiedTime).getTime();

        // Skip upload if Drive is ahead on moves OR on timestamp — either signal is enough
        const driveIsNewer =
          (driveMoves != null && localMoves != null && driveMoves > localMoves) ||
          (driveCompareTime > localTime + 1000);

        if (driveIsNewer) {
          skipped.push({ key, localTime, driveTime: driveCompareTime });
          continue;
        }
      }

      const enrichedData = { ...saveData, device: getDeviceInfo() };
      const localMoves = saveData.appMoveCount ?? null;
      const appProperties = { saveTimestamp: saveData.timestamp || '' };
      if (localMoves !== null) appProperties.moveCount = String(localMoves);

      const filename = localStorageKeyToFilename(key);
      await uploadFile(filename, enrichedData, appProperties);
      uploadCount++;
    } catch (error) {
      failures.push({ key, error: error.message });
    }
  }

  const syncTime = new Date().toISOString();
  state.gdriveLastSyncTime = syncTime;
  localStorage.setItem('iftalk_lastSyncTime', syncTime);

  if (skipped.length > 0) {
    const skippedGameName = state.currentGameName || skipped[0]?.key?.split('_')[2] || '';

    // Still surface the status-bar error every run, but only show the blocking
    // dialog for conflicts the user hasn't already dismissed this session (or
    // across reloads, until the underlying timestamps change). Otherwise the
    // dialog re-fires on every auto-sync while Drive stays newer.
    const msg = `Auto-sync skipped (Drive is newer) — open Save Sync to resolve`;
    state.gdriveError = msg;
    updateStatus(msg, 'error');
    window.dispatchEvent(new CustomEvent('gdriveAutoSyncError', { detail: { skipped } }));

    // Suppression is keyed on the DRIVE version only (driveTime), not localTime.
    // Autosave bumps localTime after every move, so including it here would make
    // the ack never match and the dialog re-fire on every sync. The conflict the
    // user dismissed is "Drive has this newer version" — re-surface only when the
    // Drive side actually changes. Session suppression is per-save-key so a single
    // dismissal silences that save for the rest of the session unconditionally.
    const unacked = skipped.filter(s => {
      if (sessionAckedConflicts.has(`autosync_skip_${s.key}`)) return false;
      const ackKey = `iftalk_conflict_ack_${s.key}`;
      const ack = (() => { try { return JSON.parse(localStorage.getItem(ackKey)); } catch { return null; } })();
      if (ack && ack.driveTime === s.driveTime) return false;
      return true;
    });

    if (unacked.length > 0) {
      const bullet = unacked.map(s => `• ${saveLabel(s.key, skippedGameName)}`).join('\n');
      const { confirmDialog } = await import('../../ui/confirm-dialog.js');
      const openSync = await confirmDialog(
        `Drive has a newer version than your local save for:\n\n${bullet}\n\nOpen Save Sync to review and resolve.`,
        { title: `${displayGameName(skippedGameName)} Save Conflict`, okText: 'Dismiss', cancelText: 'Open Save Sync' }
      );
      if (openSync === false) {
        const { showSyncModal } = await import('../../ui/sync-modal.js');
        showSyncModal(skippedGameName || null);
      } else {
        // User dismissed — silence this save for the session, and across reloads
        // until the Drive version changes.
        for (const s of unacked) {
          sessionAckedConflicts.add(`autosync_skip_${s.key}`);
          localStorage.setItem(`iftalk_conflict_ack_${s.key}`, JSON.stringify({ driveTime: s.driveTime }));
        }
      }
    }
  } else if (failures.length > 0) {
    const names = failures.map(f => f.key.split('_').slice(2).join('_') || f.key).join(', ');
    const msg = `Auto-sync failed for: ${names}`;
    state.gdriveError = msg;
    updateStatus(msg, 'error');
    window.dispatchEvent(new CustomEvent('gdriveAutoSyncError', { detail: { failures } }));
  } else {
    state.gdriveError = null;
    if (uploadCount > 0) {
      updateStatus(`Auto-synced ${uploadCount} save${uploadCount !== 1 ? 's' : ''} to Drive`, 'success');
    }
    window.dispatchEvent(new CustomEvent('gdriveSyncComplete'));
  }
}

// Conflicts acknowledged this session (not persisted — cleared on page reload)
const sessionAckedConflicts = new Set();

/**
 * Before game load, check Drive for newer saves (all types) and pull them down.
 * Requires BOTH a newer timestamp AND a higher move count to overwrite an existing local save.
 * If there is no local version of a save, downloads unconditionally (first time on a new device).
 * Warns via dialog when the two signals conflict.
 * Silently no-ops on any network/auth failure — never blocks the game load.
 */
export async function checkDriveForNewerAutosave(gameName) {
  if (!state.gdriveSyncEnabled || !gameName) return;

  if (!state.gdriveSignedIn) {
    const refreshed = await silentRefresh();
    if (!refreshed) return;
    state.gdriveSignedIn = true;
  }

  try {
    updateStatus('Checking Drive for newer saves…', 'processing');

    const driveFiles = await listFiles();

    // All saves belonging to this game across all save types
    const gameFiles = driveFiles.filter(f => {
      const key = filenameToLocalStorageKey(f.name);
      return key === `iftalk_autosave_${gameName}` ||
             key === `iftalk_quicksave_${gameName}` ||
             key.startsWith(`iftalk_customsave_${gameName}_`);
    });

    if (gameFiles.length === 0) return;

    let downloadCount = 0;
    const conflicts = [];

    for (const driveFile of gameFiles) {
      const localKey = filenameToLocalStorageKey(driveFile.name);
      const localDataStr = localStorage.getItem(localKey);

      if (!localDataStr) {
        // No local version — download from Drive unconditionally
        const driveData = await downloadFile(driveFile.name);
        localStorage.setItem(localKey, JSON.stringify(driveData));
        downloadCount++;
        continue;
      }

      // Both exist — require Drive to win on BOTH signals to overwrite
      const localData = JSON.parse(localDataStr);
      const localTime = new Date(localData.timestamp).getTime();

      const driveTime = driveFile.appProperties?.saveTimestamp
        ? new Date(driveFile.appProperties.saveTimestamp).getTime()
        : new Date(driveFile.modifiedTime).getTime();

      const driveMoves = driveFile.appProperties?.moveCount != null
        ? (n => isNaN(n) ? null : n)(parseInt(driveFile.appProperties.moveCount, 10))
        : null;

      const localMoves = localData.appMoveCount ?? null;

      const movesComparable = driveMoves != null && localMoves != null;
      const driveMoveCountHigher = movesComparable && driveMoves > localMoves;
      const driveTimestampNewer = driveTime > localTime + 1000;

      if (driveTimestampNewer && driveMoveCountHigher) {
        // Both signals agree Drive is newer — download
        const driveData = await downloadFile(driveFile.name);
        localStorage.setItem(localKey, JSON.stringify(driveData));
        downloadCount++;
      } else if (driveTimestampNewer && !movesComparable) {
        // Can't compare moves (old save, no appMoveCount yet).
        // Require >60s gap to distinguish genuine cross-device progress from upload lag (~5s).
        if (driveTime > localTime + 60000) {
          const driveData = await downloadFile(driveFile.name);
          localStorage.setItem(localKey, JSON.stringify(driveData));
          downloadCount++;
        }
        // else: gap is just upload lag — treat as in sync, skip silently
      } else if (movesComparable && driveTimestampNewer !== driveMoveCountHigher) {
        // Both signals available but disagree — genuine conflict, ask user
        const ackKey = `iftalk_conflict_ack_${localKey}`;
        const sessionKey = `${localKey}_${localTime}_${driveTime}`;
        const ack = (() => { try { return JSON.parse(localStorage.getItem(ackKey)); } catch { return null; } })();
        if (sessionAckedConflicts.has(sessionKey)) continue;
        if (ack && ack.localTime === localTime && ack.driveTime === driveTime) continue;
        conflicts.push({ label: saveLabel(localKey, gameName), ackKey, sessionKey, localTime, driveTime });
      }
      // else: local wins or same — skip silently
    }

    if (conflicts.length > 0) {
      const bullet = conflicts.map(c => `• ${c.label}`).join('\n');
      const { confirmDialog } = await import('../../ui/confirm-dialog.js');
      const openSync = await confirmDialog(
        `Drive has a newer date but fewer moves (or vice versa) for:\n\n${bullet}\n\nOpen Save Sync to resolve manually.`,
        { title: `${displayGameName(gameName)} Save Conflict`, okText: 'Dismiss', cancelText: 'Open Save Sync' }
      );
      if (openSync === false) {
        const { showSyncModal } = await import('../../ui/sync-modal.js');
        showSyncModal(gameName || null);
      } else {
        // User dismissed — suppress for this session and across reloads (until data changes)
        for (const c of conflicts) {
          sessionAckedConflicts.add(c.sessionKey);
          localStorage.setItem(c.ackKey, JSON.stringify({ localTime: c.localTime, driveTime: c.driveTime }));
        }
      }
    }

    if (downloadCount > 0) {
      updateStatus(`Downloaded ${downloadCount} newer save${downloadCount !== 1 ? 's' : ''} from Drive`, 'success');
    } else if (conflicts.length === 0) {
      updateStatus('Local saves are up to date');
    }

  } catch {
    // Never block game load on Drive check failure
  }
}

/**
 * Create conflict backup when local save is about to be overwritten
 * Stores backup in localStorage with timestamped key
 * Backup limits: Autosaves (5 backups), Other saves (2 backups)
 * @param {string} localStorageKey - The localStorage key (e.g., "iftalk_autosave_lostpig")
 * @param {object} localData - The save data to backup
 */
function createConflictBackup(localStorageKey, localData) {
  // Create backup key with timestamp: iftalk_backup_autosave_lostpig_1703435022000
  const timestamp = Date.now();
  const backupKey = `${localStorageKey.replace('iftalk_', 'iftalk_backup_')}_${timestamp}`;

  // Store backup
  localStorage.setItem(backupKey, JSON.stringify(localData));

  // Determine save type from key
  const isAutosave = localStorageKey.includes('_autosave_');
  const maxBackups = isAutosave ? 5 : 2;

  // Find all backups for this save (same prefix without timestamp, exclude exempt)
  const backupPrefix = backupKey.substring(0, backupKey.lastIndexOf('_'));
  const allBackups = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(backupPrefix + '_') && !key.endsWith('_exempt')) {
      // Extract timestamp from key
      const parts = key.split('_');
      const ts = parseInt(parts[parts.length - 1]);
      allBackups.push({ key: key, timestamp: ts });
    }
  }

  // Sort by timestamp (newest first)
  allBackups.sort((a, b) => b.timestamp - a.timestamp);

  // Keep only the most recent backups based on save type
  // Autosaves: 5 backups, Other types: 2 backups
  if (allBackups.length > maxBackups) {
    const toRemove = allBackups.slice(maxBackups);
    toRemove.forEach(({ key }) => {
      localStorage.removeItem(key);
    });
  }
}
