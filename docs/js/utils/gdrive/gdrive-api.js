/**
 * Google Drive API Module
 *
 * Handles Drive API operations: folder management, upload, download, list, delete.
 */

import { APP_CONFIG } from '../../config.js';
import { getAccessToken, isSignedIn } from './gdrive-auth.js';
import { getDeviceInfo } from './gdrive-device.js';

// Cached app folder ID
let appFolderId = null;

/**
 * Clear app folder ID (called on sign out)
 */
export function clearAppFolderId() {
  appFolderId = null;
}

/**
 * Get configured Drive folder ID (from localStorage or null for default)
 * @returns {string|null} Folder ID or null to use default folder name
 */
export function getDriveFolderId() {
  return localStorage.getItem('iftalk_gdrive_folder_id');
}

/**
 * Get configured Drive folder name (from localStorage or default)
 * @returns {string} Folder name
 */
export function getDriveFolderName() {
  return localStorage.getItem('iftalk_gdrive_folder_name') || APP_CONFIG.driveFolderName;
}

/**
 * Set Drive folder (ID and name)
 * @param {string} folderId - Folder ID
 * @param {string} folderName - Folder name
 */
export function setDriveFolder(folderId, folderName) {
  localStorage.setItem('iftalk_gdrive_folder_id', folderId);
  localStorage.setItem('iftalk_gdrive_folder_name', folderName);
  // Clear cached folder ID so next sync uses new folder
  appFolderId = null;
}

/**
 * Clear Drive folder selection (revert to default)
 */
export function clearDriveFolder() {
  localStorage.removeItem('iftalk_gdrive_folder_id');
  localStorage.removeItem('iftalk_gdrive_folder_name');
  appFolderId = null;
}

/**
 * Find or create a folder by name in a parent folder
 * @param {string} folderName - Name of the folder
 * @param {string|null} parentId - Parent folder ID (null for root)
 * @returns {Promise<string>} Folder ID
 */
async function findOrCreateFolder(folderName, parentId = null) {
  const accessToken = getAccessToken();

  // Search for existing folder
  const parentQuery = parentId ? `'${parentId}' in parents` : "'root' in parents";
  const query = `name='${folderName}' and ${parentQuery} and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to search for folder: ${folderName}`);
  }

  const data = await response.json();

  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }

  // Create folder
  const folderMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder'
  };

  if (parentId) {
    folderMetadata.parents = [parentId];
  }

  const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(folderMetadata)
  });

  if (!createResponse.ok) {
    throw new Error(`Failed to create folder: ${folderName}`);
  }

  const folderData = await createResponse.json();
  return folderData.id;
}

/**
 * Ensure app folder exists in Google Drive (handles nested paths)
 * @returns {Promise<string>} Folder ID
 */
export async function ensureAppFolder() {
  if (appFolderId) {
    return appFolderId;
  }

  const accessToken = getAccessToken();
  const customFolderId = getDriveFolderId();

  // Check if it's a path-based folder (e.g., "path:Games/IF")
  if (customFolderId && customFolderId.startsWith('path:')) {
    const folderPath = customFolderId.substring(5); // Remove "path:" prefix
    const pathParts = folderPath.split('/').filter(part => part.trim());

    // Create nested folders one by one
    let currentParentId = null; // Start at root

    for (const folderName of pathParts) {
      currentParentId = await findOrCreateFolder(folderName, currentParentId);
    }

    appFolderId = currentParentId;
    return appFolderId;
  }

  // If user selected a custom folder via old picker (direct ID), use that
  if (customFolderId && customFolderId !== 'root') {
    appFolderId = customFolderId;
    return appFolderId;
  }

  // Otherwise, use default folder name (single folder at root)
  const folderName = getDriveFolderName();
  appFolderId = await findOrCreateFolder(folderName, null);

  return appFolderId;
}

/**
 * Upload file to Google Drive
 * @param {string} filename - File name
 * @param {object} data - File data
 * @returns {Promise<object>} Upload result
 */
export async function uploadFile(filename, data) {
  if (!isSignedIn()) {
    throw new Error('Not signed in to Google Drive');
  }

  const accessToken = getAccessToken();
  const folderId = await ensureAppFolder();

  // Check if file already exists
  const query = `name='${filename}' and '${folderId}' in parents and trashed=false`;
  const searchResponse = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!searchResponse.ok) {
    throw new Error('Failed to search for existing file');
  }

  const searchData = await searchResponse.json();
  const fileExists = searchData.files && searchData.files.length > 0;
  const existingFileId = fileExists ? searchData.files[0].id : null;

  // Prepare file content
  const boundary = '-------314159265358979323846';
  const delimiter = "\r\n--" + boundary + "\r\n";
  const close_delim = "\r\n--" + boundary + "--";

  const metadata = {
    name: filename,
    mimeType: 'application/json',
    parents: fileExists ? undefined : [folderId]
  };

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(data) +
    close_delim;

  const url = fileExists
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

  const method = fileExists ? 'PATCH' : 'POST';

  const response = await fetch(url, {
    method: method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary="${boundary}"`
    },
    body: multipartRequestBody
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload file: ${errorText}`);
  }

  const result = await response.json();

  return result;
}

/**
 * Download file from Google Drive
 * @param {string} filename - File name
 * @returns {Promise<object|null>} File data or null if not found
 */
export async function downloadFile(filename) {
  if (!isSignedIn()) {
    throw new Error('Not signed in to Google Drive');
  }

  const accessToken = getAccessToken();
  const folderId = await ensureAppFolder();

  // Search for file
  const query = `name='${filename}' and '${folderId}' in parents and trashed=false`;
  const searchResponse = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!searchResponse.ok) {
    throw new Error('Failed to search for file');
  }

  const searchData = await searchResponse.json();

  if (!searchData.files || searchData.files.length === 0) {
    return null; // File doesn't exist
  }

  const fileId = searchData.files[0].id;

  // Download file content
  const downloadResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!downloadResponse.ok) {
    throw new Error('Failed to download file');
  }

  const data = await downloadResponse.json();

  return data;
}

/**
 * List all files in app folder
 * Returns file metadata including id, name, and modifiedTime
 * @returns {Promise<Array>} Array of file objects
 */
export async function listFiles() {
  if (!isSignedIn()) {
    throw new Error('Not signed in to Google Drive');
  }

  const accessToken = getAccessToken();
  const folderId = await ensureAppFolder();

  const query = `'${folderId}' in parents and trashed=false`;
  const fields = 'files(id,name,modifiedTime)'; // Request specific fields including modifiedTime
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${fields}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }
  );

  if (!response.ok) {
    throw new Error('Failed to list files');
  }

  const data = await response.json();

  return data.files || [];
}

/**
 * Delete file from Drive
 * @param {string} fileId - File ID to delete
 */
export async function deleteFile(fileId) {
  const accessToken = getAccessToken();
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to delete file');
  }
}

/**
 * Convert localStorage key to Drive filename
 * @param {string} key - localStorage key
 * @returns {string} Drive filename
 */
export function localStorageKeyToFilename(key) {
  // Remove prefix and add .json extension
  // iftalk_autosave_lostpig -> lostpig_autosave.json
  const prefix = APP_CONFIG.storagePrefix + '_';
  if (key.startsWith(prefix)) {
    const rest = key.substring(prefix.length);
    const parts = rest.split('_');
    if (parts.length >= 2) {
      const type = parts[0]; // autosave, quicksave, customsave
      const gameName = parts.slice(1).join('_');
      return `${gameName}_${type}.json`;
    }
  }
  return key + '.json';
}

/**
 * Convert Drive filename to localStorage key
 * @param {string} filename - Drive filename
 * @returns {string} localStorage key
 */
export function filenameToLocalStorageKey(filename) {
  // lostpig_autosave.json -> iftalk_autosave_lostpig
  const name = filename.replace('.json', '');
  const parts = name.split('_');
  if (parts.length >= 2) {
    const gameName = parts.slice(0, -1).join('_');
    const type = parts[parts.length - 1];
    return `${APP_CONFIG.storagePrefix}_${type}_${gameName}`;
  }
  return name;
}

/**
 * Delete all save files for a specific game from Google Drive
 * @param {string} gameName - The game name (e.g., 'lostpig')
 * @returns {Promise<number>} Number of files deleted
 */
export async function deleteGameDataFromDrive(gameName) {
  const { ensureAuthenticated } = await import('./gdrive-auth.js');

  // Ensure authenticated (will prompt if needed)
  const authenticated = await ensureAuthenticated(false);
  if (!authenticated) {
    return 0;
  }

  try {
    const files = await listFiles();
    let deleteCount = 0;

    // Find all files for this game
    const gameFiles = files.filter(file => {
      const name = file.name.toLowerCase();
      return name.startsWith(gameName.toLowerCase() + '_');
    });

    // Delete each file
    for (const file of gameFiles) {
      try {
        await deleteFile(file.id);
        deleteCount++;
      } catch (error) {
        // Failed to delete, skip
      }
    }

    return deleteCount;
  } catch (error) {
    throw error;
  }
}

/**
 * Delete ALL data from Google Drive (entire IFTalk folder)
 */
export async function deleteAllDataFromDrive() {
  const { ensureAuthenticated } = await import('./gdrive-auth.js');

  // Ensure authenticated (will prompt if needed)
  const authenticated = await ensureAuthenticated(false);
  if (!authenticated) {
    return;
  }

  try {
    // Get app folder ID
    const folderId = await ensureAppFolder();

    // Delete the entire folder
    await deleteFile(folderId);

    // Clear cached folder ID
    appFolderId = null;
  } catch (error) {
    throw error;
  }
}
