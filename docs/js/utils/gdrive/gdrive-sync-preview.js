/**
 * Google Drive Sync Preview Functions
 *
 * Functions for comparing saves and syncing individual files for the preview modal
 */

import { APP_CONFIG } from '../../config.js';
import { state } from '../../core/state.js';
import { ensureAuthenticated } from './gdrive-auth.js';
import {
  uploadFile,
  downloadFile,
  listFiles,
  localStorageKeyToFilename,
  filenameToLocalStorageKey
} from './gdrive-api.js';
import { getDeviceInfo } from './gdrive-device.js';

// Timestamp comparison thresholds
const SYNC_THRESHOLD_MS = 1000;      // Within 1 second = synced
const CONFLICT_THRESHOLD_MS = 60000; // Within 1 minute = potential conflict

/**
 * Compare local and Drive saves for preview
 * @param {string} gameName - Game name to compare saves for
 * @param {string} direction - 'import' or 'export'
 * @returns {Promise<Array>} Array of save items with comparison data
 */
export async function compareSaves(gameName, direction) {
  const authenticated = await ensureAuthenticated(false);
  if (!authenticated) {
    throw new Error('Not signed in to Google Drive');
  }


  const items = [];
  const driveFiles = await listFiles();
  const driveFileMap = new Map();

  // Build map of Drive files
  for (const file of driveFiles) {
    const localKey = filenameToLocalStorageKey(file.name);
    driveFileMap.set(localKey, file);
  }

  // Scan localStorage for saves
  const localSaves = new Set();

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);

    // Filter: only save files
    if (!key || !(
      key.startsWith(`${APP_CONFIG.storagePrefix}_autosave_`) ||
      key.startsWith(`${APP_CONFIG.storagePrefix}_quicksave_`) ||
      key.startsWith(`${APP_CONFIG.storagePrefix}_customsave_`)
    )) {
      continue;
    }

    // Filter: current game only
    if (gameName) {
      // Extract game name based on save type (handles underscores in save names)
      let saveGameName;
      if (key.startsWith(`${APP_CONFIG.storagePrefix}_autosave_`)) {
        saveGameName = key.substring(`${APP_CONFIG.storagePrefix}_autosave_`.length);
      } else if (key.startsWith(`${APP_CONFIG.storagePrefix}_quicksave_`)) {
        saveGameName = key.substring(`${APP_CONFIG.storagePrefix}_quicksave_`.length);
      } else if (key.startsWith(`${APP_CONFIG.storagePrefix}_customsave_`)) {
        // Custom save: iftalk_customsave_GAMENAME_savename
        const afterPrefix = key.substring(`${APP_CONFIG.storagePrefix}_customsave_`.length);
        const firstUnderscore = afterPrefix.indexOf('_');
        saveGameName = firstUnderscore > 0
          ? afterPrefix.substring(0, firstUnderscore)
          : afterPrefix;
      }

      if (saveGameName !== gameName) {
        continue;
      }
    }

    localSaves.add(key);

    const localData = JSON.parse(localStorage.getItem(key));
    const localTime = new Date(localData.timestamp).getTime();
    const driveFile = driveFileMap.get(key);

    // Get save name from key
    const saveName = getSaveNameFromKey(key, gameName);

    if (!driveFile) {
      // Only exists locally
      items.push({
        id: key,
        name: saveName,
        status: 'New',
        localTimestamp: localData.timestamp,
        driveTimestamp: null,
        key: key,
        driveFile: null
      });
    } else {
      // Exists in both places - compare timestamps.
      // Prefer saveTimestamp appProperty (actual save creation time) over modifiedTime
      // (upload time), which can be minutes later and cause false "Newer" flags.
      const driveCompareTime = driveFile.appProperties?.saveTimestamp
        ? new Date(driveFile.appProperties.saveTimestamp).getTime()
        : new Date(driveFile.modifiedTime).getTime();

      let status;
      const timeDiff = Math.abs(driveCompareTime - localTime);

      if (timeDiff < SYNC_THRESHOLD_MS) {
        // Timestamps within 1 second - consider them equal
        status = 'Synced';
      } else if (timeDiff < CONFLICT_THRESHOLD_MS) {
        // Modified within 1 minute of each other - potential conflict
        status = 'Conflict';
      } else {
        // Clear difference - determine which is newer
        // For IMPORT (showing Drive): Drive > Local means "Newer"
        // For EXPORT (showing Local): Local > Drive means "Newer"
        if (direction === 'import') {
          status = driveCompareTime > localTime ? 'Newer' : 'Older';
        } else {
          status = localTime > driveCompareTime ? 'Newer' : 'Older';
        }
      }

      items.push({
        id: key,
        name: saveName,
        status: status,
        localTimestamp: localData.timestamp,
        driveTimestamp: driveFile.appProperties?.saveTimestamp || driveFile.modifiedTime,
        driveMoveCount: driveFile.appProperties?.moveCount != null ? parseInt(driveFile.appProperties.moveCount) : null,
        key: key,
        driveFile: driveFile
      });
    }
  }

  // Check for Drive files not in localStorage
  for (const file of driveFiles) {
    const localKey = filenameToLocalStorageKey(file.name);

    // Filter by game name (same extraction logic as local scan above)
    if (gameName) {
      let saveGameName;
      if (localKey.startsWith(`${APP_CONFIG.storagePrefix}_autosave_`)) {
        saveGameName = localKey.substring(`${APP_CONFIG.storagePrefix}_autosave_`.length);
      } else if (localKey.startsWith(`${APP_CONFIG.storagePrefix}_quicksave_`)) {
        saveGameName = localKey.substring(`${APP_CONFIG.storagePrefix}_quicksave_`.length);
      } else if (localKey.startsWith(`${APP_CONFIG.storagePrefix}_customsave_`)) {
        const afterPrefix = localKey.substring(`${APP_CONFIG.storagePrefix}_customsave_`.length);
        const firstUnderscore = afterPrefix.indexOf('_');
        saveGameName = firstUnderscore > 0 ? afterPrefix.substring(0, firstUnderscore) : afterPrefix;
      }
      if (saveGameName !== gameName) {
        continue;
      }
    }

    if (!localSaves.has(localKey)) {
      // Only exists on Drive
      const saveName = getSaveNameFromKey(localKey, gameName);

      items.push({
        id: localKey,
        name: saveName,
        status: 'New',
        localTimestamp: null,
        driveTimestamp: file.appProperties?.saveTimestamp || file.modifiedTime,
        driveMoveCount: file.appProperties?.moveCount != null ? parseInt(file.appProperties.moveCount) : null,
        key: localKey,
        driveFile: file
      });
    }
  }

  // Filter based on direction
  if (direction === 'export') {
    // For export, only show items that exist locally or are newer locally
    return items.filter(item => item.localTimestamp !== null);
  } else {
    // For import, only show items that exist on Drive or are newer on Drive
    return items.filter(item => item.driveTimestamp !== null);
  }
}

/**
 * Get human-readable save name from localStorage key
 */
function getSaveNameFromKey(key, gameName) {
  const parts = key.split('_');
  const type = parts[1]; // autosave, quicksave, customsave

  if (type === 'autosave') {
    return 'Autosave';
  } else if (type === 'quicksave') {
    return 'Quick Save';
  } else if (type === 'customsave') {
    const prefix = `${APP_CONFIG.storagePrefix}_customsave_${gameName}_`;
    const name = gameName && key.startsWith(prefix)
      ? key.substring(prefix.length)
      : parts.slice(3).join('_');
    return name || 'Manual Save';
  }

  return 'Save';
}

/**
 * Create conflict backup when local save is about to be overwritten
 */
function createConflictBackup(localStorageKey, localData) {
  const timestamp = Date.now();
  const backupKey = `${localStorageKey.replace('iftalk_', 'iftalk_backup_')}_${timestamp}`;
  localStorage.setItem(backupKey, JSON.stringify(localData));

  const isAutosave = localStorageKey.includes('_autosave_');
  const maxBackups = isAutosave ? 5 : 2;

  const backupPrefix = backupKey.substring(0, backupKey.lastIndexOf('_'));
  const allBackups = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(backupPrefix + '_') && !key.endsWith('_exempt')) {
      const parts = key.split('_');
      const ts = parseInt(parts[parts.length - 1]);
      allBackups.push({ key: key, timestamp: ts });
    }
  }

  allBackups.sort((a, b) => b.timestamp - a.timestamp);

  if (allBackups.length > maxBackups) {
    const toRemove = allBackups.slice(maxBackups);
    toRemove.forEach(({ key }) => {
      localStorage.removeItem(key);
    });
  }
}

/**
 * Sync a single save file
 * @param {object} item - Save item from compareSaves()
 * @param {string} direction - 'import' or 'export'
 */
export async function syncSaveFile(item, direction) {
  const deviceInfo = getDeviceInfo();

  if (direction === 'export') {
    // Upload to Drive
    const saveData = JSON.parse(localStorage.getItem(item.key));
    const enrichedData = {
      ...saveData,
      device: deviceInfo
    };

    // Store save metadata as appProperties so it can be read without downloading the file
    const moveCount = (() => {
      try {
        const html = saveData?.displayHTML?.statusBar || '';
        const m = html.replace(/<[^>]+>/g, ' ').match(/Moves[:\s]+(\d+)/i);
        return m ? m[1] : null;
      } catch { return null; }
    })();
    const appProperties = { saveTimestamp: saveData.timestamp || '' };
    if (moveCount !== null) appProperties.moveCount = moveCount;

    const filename = localStorageKeyToFilename(item.key);
    await uploadFile(filename, enrichedData, appProperties);
  } else {
    // Download from Drive
    if (!item.driveFile) {
      throw new Error('No Drive file to import');
    }

    const driveData = await downloadFile(item.driveFile.name);

    // Create backup if local version exists
    const localData = localStorage.getItem(item.key);
    if (localData) {
      createConflictBackup(item.key, JSON.parse(localData));
    }

    // Save to localStorage
    localStorage.setItem(item.key, JSON.stringify(driveData));
  }

  // Update last sync time
  const syncTime = new Date().toISOString();
  state.gdriveLastSyncTime = syncTime;
  localStorage.setItem('iftalk_lastSyncTime', syncTime);
}
