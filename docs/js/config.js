/**
 * Application Configuration
 * Central place for app constants
 */

export const APP_CONFIG = {
  // App identity
  name: 'Lantern',
  displayName: 'Lantern',
  version: '1.5.574',

  // Storage prefixes (used in localStorage keys)
  storagePrefix: 'lantern',

  // Google Drive folder name
  driveFolderName: 'Lantern',

  // OAuth (configure in Google Cloud Console)
  googleClientId: '159814585278-bgntpcpcpa4pcmc77vimbr9t3e0ogfta.apps.googleusercontent.com',

  // Backup settings
  maxBackupVersions: 10, // Keep last 10 versions per save

  // Device tracking
  deviceIdKey: 'lantern_device_id',

  // Save/restore migration (autorestore-migration-plan.md).
  // When true, autosave/resume uses the ZVM engine's built-in full-state
  // do_autosave/do_autorestore (with a GiDispa shim) instead of the custom
  // Quetzal+bootstrap path. Default false until proven in-browser, then flipped.
  useEngineAutorestore: false,
};
