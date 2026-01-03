/**
 * App Commands Module
 *
 * Centralized list of all commands that interact with the app (not the game).
 * Used for styling and routing commands appropriately.
 */

/**
 * All app commands organized by category
 */
export const APP_COMMANDS = {
  // Navigation commands
  REPEAT: ['repeat'],
  BACK: ['back'],
  PAUSE: ['pause', 'stop'],
  PLAY: ['play', 'resume'],
  SKIP: ['skip'],
  SKIP_ALL: ['skip all', 'skip to end', 'skip to the end', 'end'],

  // Audio control
  MUTE: ['mute'],
  UNMUTE: ['unmute', 'on mute', 'un mute'],
  STATUS: ['status'],

  // Quick save/load (voice commands)
  QUICK_SAVE: ['quick save', 'quicksave'],
  QUICK_LOAD: ['quick load', 'quickload', 'quick restore', 'quickrestore'],

  // Restore (voice command - specific phrases)
  RESTORE_LATEST: ['load game', 'restore game'],

  // Meta-commands (typed commands that interact with save system)
  HELP: ['help', 'commands'],
  SAVE: ['save'],
  RESTORE_META: ['restore', 'load'],
  DELETE: ['delete save', 'delete'],
  QUIT: ['quit']
};

// Flatten all commands into a single array for easy checking
export const ALL_APP_COMMANDS = Object.values(APP_COMMANDS).flat();

/**
 * Check if a command is an app command
 * @param {string} cmd - Command to check
 * @returns {boolean} True if this is an app command
 */
export function isAppCommand(cmd) {
  if (!cmd) return false;

  const lower = cmd.toLowerCase().trim();

  // IMPORTANT: Only exact matches count as app commands for styling
  // This prevents "enter house" or "restore lamp" from being styled as app commands

  // Check against known commands (exact match only)
  if (ALL_APP_COMMANDS.includes(lower)) {
    return true;
  }

  // Check pattern-based commands (e.g., "load slot 3", "restore slot 2")
  if (/^(?:load|restore)\s+slot\s+\d+$/.test(lower)) {
    return true;
  }

  // Check for "skip N" or "skip forward N"
  if (/^skip(?:\s+forward)?\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)$/.test(lower)) {
    return true;
  }

  // Check for "back N" or "go back N"
  if (/^(?:back|go\s+back)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)$/.test(lower)) {
    return true;
  }

  return false;
}
