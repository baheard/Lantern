/**
 * Google Drive Sync Logic Module
 *
 * Handles bidirectional manual sync and conflict resolution.
 */

import { APP_CONFIG } from '../../config.js';
import { state } from '../../core/state.js';
import { updateStatus } from '../status.js';
import { ensureAuthenticated, isSignedIn } from './gdrive-auth.js';
import {
  uploadFile,
  downloadFile,
  listFiles,
  localStorageKeyToFilename,
  filenameToLocalStorageKey
} from './gdrive-api.js';
import { getDeviceInfo } from './gdrive-device.js';

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

        const filename = localStorageKeyToFilename(key);
        await uploadFile(filename, enrichedData);
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
