/**
 * Google Drive Module - Main Export
 *
 * Re-exports all Google Drive functionality for backward compatibility.
 */

// Authentication
export {
  hasValidToken,
  ensureAuthenticated,
  initGDriveSync,
  signIn,
  signOut,
  isSignedIn,
  getAccessToken,
  setAccessToken
} from './gdrive-auth.js';

// Device Info
export {
  getDeviceId,
  getDeviceInfo
} from './gdrive-device.js';

// API Operations
export {
  clearAppFolderId,
  uploadFile,
  downloadFile,
  listFiles,
  deleteFile,
  localStorageKeyToFilename,
  filenameToLocalStorageKey,
  deleteGameDataFromDrive,
  deleteAllDataFromDrive
} from './gdrive-api.js';

// Sync Logic
export {
  syncAllNow,
  scheduleDriveSync
} from './gdrive-sync.js';
