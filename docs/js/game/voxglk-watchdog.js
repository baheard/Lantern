/**
 * VoxGlk Watchdog & REPAIR Flow
 *
 * Detects when the Z-machine stops responding to input and surfaces an
 * in-game REPAIR prompt. See `.tome/watchdog-repair-flow.md` for the
 * full design rationale.
 *
 * State (module-scoped, single VoxGlk instance per page):
 *   watchdogTimer            — pending timeout handle (null when idle)
 *   lastInputGeneration      — VM generation captured when input was sent
 *   isAutoRepairInProgress   — guards re-entry into the prompt path
 *   currentRepairFlagKey     — game-specific sessionStorage key for retry-window check
 */

import { addGameText } from '../ui/game-output.js';
import { state } from '../core/state.js';
import { updateStatus } from '../utils/status.js';

let watchdogTimer = null;
let lastInputGeneration = null;
let isAutoRepairInProgress = false;
let currentRepairFlagKey = null;

const WATCHDOG_TIMEOUT_MS = 5000; // 5 seconds to wait for VM response
const REPAIR_RETRY_WINDOW_MS = 15000; // 15 seconds between repair attempts

/**
 * Clear watchdog timer when VM responds normally
 */
export function clearWatchdog() {
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
    lastInputGeneration = null;

    // Clear repair attempt flag since VM responded successfully
    if (currentRepairFlagKey) {
      sessionStorage.removeItem(currentRepairFlagKey);
      currentRepairFlagKey = null;
    }
  }
}

/**
 * Reset all watchdog state (called from voxglk init for a new game)
 */
export function resetWatchdogState() {
  clearWatchdog();
  isAutoRepairInProgress = false;
}

/**
 * Reset repair flag (called when user cancels repair)
 */
export function resetRepairFlag() {
  isAutoRepairInProgress = false;
}

/**
 * Show warning when VM state appears broken
 * Just displays a message - user must manually type REPAIR
 */
async function promptRepairVMState() {
  if (isAutoRepairInProgress) {
    return;
  }

  isAutoRepairInProgress = true;

  const errorMessage = '⚠️ Game not responding. Save may be corrupted.';
  updateStatus(errorMessage, 'error');

  addGameText('<div class="system-message">⚠️ <b>Game not responding</b><br>Save may be corrupted. Type REPAIR to attempt to fix.</div>', false);

  if (window.handleGameOutput) {
    window.handleGameOutput('Game not responding. Save may be corrupted. Type REPAIR to attempt to fix.');
  }

  // Don't enter system mode - let user manually type REPAIR when ready
  // Reset flag so REPAIR command can proceed
  isAutoRepairInProgress = false;
}

/**
 * Automatically trigger repair when VM state is broken
 * Called by watchdog timer when VM doesn't respond to input
 */
async function autoRepairVMState() {
  await promptRepairVMState();
}

/**
 * Start watchdog timer to detect broken VM state
 * If VM doesn't respond within timeout, trigger auto-repair
 *
 * @param {number} currentGeneration - VM generation at time of input dispatch
 * @param {Function} getCurrentGeneration - Reads the live VM generation when the timer fires
 * @param {boolean} isBootstrapping - True while suppressing the bootstrap-input echo; skip starting in that window
 */
export async function startWatchdog(currentGeneration, getCurrentGeneration, isBootstrapping) {
  // Don't start watchdog during restore or repair operations
  if (isAutoRepairInProgress || isBootstrapping) {
    return;
  }

  clearWatchdog();

  lastInputGeneration = currentGeneration;
  currentRepairFlagKey = `iftalk_last_repair_attempt_${state.currentGameName}`;

  watchdogTimer = setTimeout(async () => {
    if (getCurrentGeneration() !== lastInputGeneration) {
      return;
    }

    // Check if we recently attempted a repair using stored flag key
    const lastRepairAttempt = currentRepairFlagKey ? sessionStorage.getItem(currentRepairFlagKey) : null;

    if (lastRepairAttempt) {
      const timeSinceRepair = Date.now() - parseInt(lastRepairAttempt);
      if (timeSinceRepair < REPAIR_RETRY_WINDOW_MS) {
        const errorMsg = '❌ Auto-repair failed. The save file may be corrupted. Please restart the game from Settings.';
        updateStatus(errorMsg, 'error');
        addGameText(`<div class="system-message">${errorMsg}</div>`, false);

        if (window.handleGameOutput) {
          window.handleGameOutput('Auto-repair failed. The save file may be corrupted. Please restart the game from Settings.');
        }

        if (currentRepairFlagKey) {
          sessionStorage.removeItem(currentRepairFlagKey);
        }
        return;
      }
    }

    await autoRepairVMState();
  }, WATCHDOG_TIMEOUT_MS);
}

/**
 * Perform repair (save current state and reload)
 * Called from meta-command-handlers when user confirms repair
 */
export async function performRepair() {
  try {
    updateStatus('Repairing game state...', 'processing');

    // Step 1: Clean up unanswered commands from display before saving
    const lowerWindow = document.getElementById('lowerWindow');
    if (lowerWindow) {
      const commands = lowerWindow.querySelectorAll('.user-command');
      const gameTexts = lowerWindow.querySelectorAll('.game-text:not(.user-command)');

      // Remove commands that appear after the last game response
      if (commands.length > 0 && gameTexts.length > 0) {
        const lastGameText = gameTexts[gameTexts.length - 1];
        const commandsToRemove = [];

        for (const cmd of commands) {
          if (lastGameText.compareDocumentPosition(cmd) & Node.DOCUMENT_POSITION_FOLLOWING) {
            commandsToRemove.push(cmd);
          }
        }

        commandsToRemove.forEach(cmd => cmd.remove());
      }
    }

    // Step 2: Save current state (cleaned up, without broken commands)
    // Dynamic import to break the voxglk-watchdog → save-manager → voxglk → voxglk-watchdog cycle
    const { autoSave } = await import('./save-manager.js');
    const saved = await autoSave();

    if (!saved) {
      updateStatus('⚠️ Repair failed - could not save state', 'error');
      addGameText('<div class="system-message">⚠️ Repair failed. Please restart the game from Settings.</div>', false);

      isAutoRepairInProgress = false;
      return false;
    }

    // Step 3: Set up pending restore (same mechanism as manual RESTORE command)
    sessionStorage.setItem('iftalk_pending_restore', JSON.stringify({
      type: 'autosave',
      key: state.currentGameName,
      gameName: state.currentGameName
    }));

    // Step 4: Set flag to track repair attempt (prevents infinite loop)
    const repairFlagKey = `iftalk_last_repair_attempt_${state.currentGameName}`;
    sessionStorage.setItem(repairFlagKey, Date.now().toString());

    // Step 5: Reload page to restore
    setTimeout(() => {
      window.location.reload();
    }, 500);

    return true;

  } catch (error) {
    updateStatus('⚠️ Repair failed: ' + error.message, 'error');
    isAutoRepairInProgress = false;
    return false;
  }
}
