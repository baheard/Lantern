/**
 * Application Configuration
 * Central place for app constants
 */

export const APP_CONFIG = {
  // App identity
  name: 'IFTalk',
  displayName: 'IFTalk',
  version: '1.5.213',

  // Storage prefixes (used in localStorage keys)
  storagePrefix: 'iftalk',

  // Google Drive folder name
  driveFolderName: 'IFTalk',

  // OAuth (configure in Google Cloud Console)
  googleClientId: '159814585278-bgntpcpcpa4pcmc77vimbr9t3e0ogfta.apps.googleusercontent.com',

  // Backup settings
  maxBackupVersions: 10, // Keep last 10 versions per save

  // Device tracking
  deviceIdKey: 'iftalk_device_id',
};
