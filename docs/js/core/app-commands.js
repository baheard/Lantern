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
  PAUSE: ['pause'],
  STOP: ['stop'],
  PLAY: ['play', 'resume'],
  SKIP: ['skip'],
  SKIP_ALL: ['skip all', 'skip to end', 'skip to the end', 'end'],

  // Audio control
  MUTE: ['mute'],
  UNMUTE: [], // Voice unmute disabled - mic fully off when muted (click button to unmute)
  STATUS: ['status'],
  READ_LAST_COMMAND: ['read last command', 'last command', 'what did i say'],
  LOCK_MIC: ['freeze'],
  UNLOCK_MIC: ['unfreeze'],
  LOCK_SCREEN: ['lock screen'],
  UNLOCK_SCREEN: ['unlock screen'],

  // Quick save/load (voice commands)
  QUICK_SAVE: ['quick save', 'quicksave'],
  QUICK_LOAD: ['quick load', 'quickload', 'quick restore', 'quickrestore'],

  // Restore (voice command - specific phrases)
  RESTORE_LATEST: ['load game', 'restore game'],

  // AI Hints (voice commands)
  GET_HINT: ['get hint'],
  GET_GEMINI_HINT: ['get gemini hint'],

  // Meta-commands (typed commands that interact with save system)
  HELP: [], // Disabled to allow game's help command (use "app help" for app commands)
  APP_HELP: ['app help'],
  SAVE: ['save'],
  RESTORE_META: ['restore', 'load'],
  DELETE: ['delete save', 'delete'],
  QUIT: ['quit'],
  FEEDBACK: ['feedback']
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

  // Check for "back N"
  if (/^back\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)$/.test(lower)) {
    return true;
  }

  return false;
}

/**
 * Get the canonical (normalized) form of an app command
 * Maps variations to canonical form (e.g., "quicksave" to "quick save")
 * @param {string} cmd - Command to normalize
 * @returns {string|null} Canonical form of the command, or null if not an app command
 */
export function getCanonicalAppCommand(cmd) {
  if (!cmd) return null;

  const lower = cmd.toLowerCase().trim();

  // Check each command category for a match
  for (const [category, commands] of Object.entries(APP_COMMANDS)) {
    if (commands.includes(lower)) {
      // Return the first (canonical) form
      return commands[0];
    }
  }

  // Check pattern-based commands (return as-is if they match)
  if (/^(?:load|restore)\s+slot\s+\d+$/.test(lower)) {
    return lower;
  }

  if (/^skip(?:\s+forward)?\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)$/.test(lower)) {
    return lower;
  }

  if (/^(?:back|go\s+back)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)$/.test(lower)) {
    return lower;
  }

  return null;
}
