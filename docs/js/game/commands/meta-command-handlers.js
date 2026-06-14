/**
 * Meta-Command Handlers Module
 *
 * Handles all meta-commands (SAVE, RESTORE, DELETE, QUIT, REPAIR) and game dialog intercepts.
 */

import { state } from '../../core/state.js';
import { respondAsGame } from '../../ui/respond-as-game.js';
import { enterSystemEntryMode, exitSystemEntryMode } from '../../input/keyboard/index.js';
import { getCustomSaves, getUnifiedSavesList, getRestoreList, formatSavesList } from './save-list-formatter.js';

const MAX_SAVES = 5;

const WORD_DIGITS = { one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9',ten:'10' };
function normalizeInput(input) {
  const trimmed = input.trim();
  return WORD_DIGITS[trimmed.toLowerCase()] ?? trimmed;
}

// State tracking for interactive meta-commands
let awaitingMetaInput = null; // 'save', 'restore', 'delete', 'game-save', 'game-restore', 'repair', 'save-confirm', 'feedback', 'feedback-confirm', or null
let gameDialogCallback = null; // Callback for in-game save/restore dialogs
let gameDialogRef = null; // File reference for in-game dialogs
let pendingSaveTarget = null; // Save name pending confirmation when overwriting by slot
let pendingFeedbackText = null; // Feedback text pending read-back confirmation

/**
 * Handle SAVE command
 */
export async function handleSaveCommand() {
  const allSaves = getUnifiedSavesList();

  let message = '<div class="system-message"><b>Enter a file name for your save.</b>';

  if (allSaves.length > 0) {
    message += '<br>Existing saves:<br>';
    message += formatSavesList(allSaves);
  }

  message += '</div>';

  respondAsGame(message);
  awaitingMetaInput = 'save';

  // Enter system entry mode with prompt
  enterSystemEntryMode('Enter save name');

  return true;
}

/**
 * Handle RESTORE command (typed by user)
 */
export async function handleRestoreCommand() {
  const allSaves = getRestoreList();

  if (allSaves.length === 0) {
    respondAsGame('<div class="system-message">No saved games found. Use SAVE to create one.</div>');
    return true;
  }

  let message = '<div class="system-message"><b>Choose a file to restore. (# or name)</b><br>';
  message += formatSavesList(allSaves);
  message += '</div>';

  respondAsGame(message);
  awaitingMetaInput = 'restore';

  // Enter system entry mode with prompt
  enterSystemEntryMode('Enter save name to restore');

  return true;
}

/**
 * Handle DELETE command
 */
export async function handleDeleteCommand() {
  const allSaves = getRestoreList();

  if (allSaves.length === 0) {
    respondAsGame('<div class="system-message">No save games currently exist. Use "Save" to save one.</div>');
    return true;
  }

  let message = '<div class="system-message"><b>Delete which save?</b><br>';
  message += formatSavesList(allSaves);
  message += '</div>';

  respondAsGame(message);
  awaitingMetaInput = 'delete';

  // Enter system entry mode with prompt
  enterSystemEntryMode('Enter save name to delete');

  return true;
}

/**
 * Handle FEEDBACK command
 */
export async function handleFeedbackCommand() {
  respondAsGame('<div class="system-message"><b>Listening for feedback — say or type your message, or say "cancel".</b></div>');
  awaitingMetaInput = 'feedback';
  enterSystemEntryMode('Enter your feedback');
  return true;
}

/**
 * Handle QUIT command - auto-save and return to game selection
 */
export async function handleQuitCommand() {
  // Auto-save current progress
  const { autoSave } = await import('../save-manager.js');
  await autoSave();

  // Show confirmation message
  respondAsGame('<div class="system-message">Game saved. Returning to game selection...</div>');

  // Return to game selection after brief delay
  setTimeout(() => {
    // Clear last game so it doesn't auto-resume
    localStorage.removeItem('lantern_last_game');

    // Reload to return to welcome screen
    window.location.reload();
  }, 1000);

  return true;
}

/**
 * Handle REPAIR command
 */
export async function handleRepairCommand() {
  respondAsGame(`
<div class="system-message">
<b>⚠️ Repair Game</b><br>
<br>
This will save and reload to fix broken state.<br>
<br>
Type CONFIRM to proceed, or press Enter to cancel.
</div>
  `);
  awaitingMetaInput = 'repair';

  // Enter system entry mode with prompt
  enterSystemEntryMode('Type CONFIRM to repair');

  return true;
}

/**
 * Handle user response to meta-command prompts
 * @param {string} input - User's input
 * @returns {Promise<boolean>} True if handled
 */
export async function handleMetaResponse(input) {
  const mode = awaitingMetaInput;
  awaitingMetaInput = null; // Reset state

  const trimmedLower = input?.trim().toLowerCase() ?? '';
  const isCancelPhrase = trimmedLower === 'cancel' || trimmedLower === 'never mind' || trimmedLower === 'nevermind';
  if (!input || trimmedLower === '' || isCancelPhrase) {
    // User cancelled - exit system entry mode
    exitSystemEntryMode();

    // If this was a game dialog (save/restore from in-game), clear system messages and return null
    if ((mode === 'game-save' || mode === 'game-restore') && gameDialogCallback) {
      // Clear all system messages before showing game's response
      const systemMessages = document.querySelectorAll('.system-message');
      systemMessages.forEach(msg => msg.remove());

      setTimeout(() => {
        gameDialogCallback(null);
        gameDialogCallback = null;
        gameDialogRef = null;
      }, 0);
    } else if (mode === 'save-confirm') {
      pendingSaveTarget = null;
      respondAsGame('<div class="system-message"><i>Cancelled.</i></div>');
    } else if (mode === 'repair') {
      // For repair cancellation, reset the repair flag and show helpful message
      const { resetRepairFlag } = await import('../voxglk-watchdog.js');
      resetRepairFlag();
      respondAsGame('<div class="system-message">Repair cancelled. You can type REPAIR later if needed, or restart from Settings.</div>');
    } else {
      // For typed commands, show cancellation message
      respondAsGame('<div class="system-message"><i>Cancelled.</i></div>');
    }

    return true;
  }

  // For non-cancel paths, exit system entry mode now
  exitSystemEntryMode();

  // For save, only count custom saves toward the limit
  const customSaves = getCustomSaves();
  // For restore/delete, use the full list including autosave (same order as displayed)
  const allSaves = getRestoreList();

  const normalizedInput = normalizeInput(input);

  switch (mode) {
    case 'save':
      return await handleSaveResponse(normalizedInput, customSaves);

    case 'restore':
      return await handleRestoreResponse(normalizedInput, allSaves);

    case 'delete':
      return await handleDeleteResponse(normalizedInput, allSaves);

    case 'game-save':
      return await handleGameSaveResponse(normalizedInput, customSaves);

    case 'game-restore':
      return await handleGameRestoreResponse(normalizedInput, allSaves);

    case 'save-confirm': {
      const saveName = pendingSaveTarget;
      pendingSaveTarget = null;
      const yes = ['yes', 'y'].includes(normalizedInput.toLowerCase());
      if (!yes) {
        respondAsGame('<div class="system-message"><i>Cancelled.</i></div>');
        return true;
      }
      const { customSave } = await import('../save-manager.js');
      const success = await customSave(saveName);
      if (!success) respondAsGame('<div class="system-message">Save failed. Please try again.</div>');
      return true;
    }

    case 'repair':
      return await handleRepairResponse(input.trim());

    case 'feedback':
      return await handleFeedbackResponse(input.trim());

    case 'feedback-confirm': {
      const feedbackText = pendingFeedbackText;
      pendingFeedbackText = null;
      const yes = ['yes', 'y', 'send', 'confirm', 'ok'].includes(normalizedInput.toLowerCase());
      if (!yes) {
        respondAsGame('<div class="system-message"><i>Cancelled.</i></div>');
        return true;
      }
      const { submitFeedback } = await import('../../features/feedback.js');
      const gameName = state.currentGameName || 'None';
      await submitFeedback(feedbackText, gameName);
      respondAsGame('<div class="system-message">Thanks for your feedback!</div>');
      return true;
    }

    default:
      return false;
  }
}

/**
 * Validate a save name and resolve number references to actual save names.
 * Returns {valid: true, targetSaveName} or {valid: false, errorMessage}.
 */
function validateSaveName(input) {
  const num = parseInt(input);
  let targetSaveName = input;
  const allSaves = getUnifiedSavesList();

  if (!isNaN(num)) {
    if (num >= 1 && num <= allSaves.length) {
      const save = allSaves[num - 1];
      if (save.type === 'quicksave') {
        return { valid: false, errorMessage: 'Cannot overwrite quicksave. Use Quick Save button or choose a different name.' };
      }
      if (save.type === 'autosave') {
        return { valid: false, errorMessage: 'Cannot overwrite autosave. Choose a different name.' };
      }
      targetSaveName = save.name;
      return { valid: true, targetSaveName, slotNum: num };
    } else {
      return { valid: false, errorMessage: `No save in slot ${num}. Enter a name for a new save.` };
    }
  }

  if (!/^[a-zA-Z0-9_ -]+$/.test(targetSaveName)) {
    return { valid: false, errorMessage: 'Invalid save name. Use only letters, numbers, spaces, dashes, and underscores.' };
  }

  if (['quicksave', 'autosave'].includes(targetSaveName.toLowerCase())) {
    return { valid: false, errorMessage: 'That name is reserved. Please choose a different name.' };
  }

  const existingSave = getCustomSaves().find(s => s.name.toLowerCase() === targetSaveName.toLowerCase());
  if (existingSave) targetSaveName = existingSave.name; // preserve original case
  if (!existingSave && getCustomSaves().length >= MAX_SAVES) {
    return { valid: false, errorMessage: `Save limit reached (${MAX_SAVES}). Delete or overwrite an existing save first.` };
  }

  return { valid: true, targetSaveName };
}

/**
 * Handle save name input
 */
async function handleSaveResponse(input, saves) {
  const result = validateSaveName(input);
  if (!result.valid) {
    respondAsGame(`<div class="system-message">${result.errorMessage}</div>`);
    return true;
  }

  if (result.slotNum) {
    pendingSaveTarget = result.targetSaveName;
    awaitingMetaInput = 'save-confirm';
    respondAsGame(`<div class="system-message">Overwrite save ${result.slotNum}: <b>${result.targetSaveName}</b>? (yes / no)</div>`);
    enterSystemEntryMode('yes or no');
    return true;
  }

  const { customSave } = await import('../save-manager.js');
  const success = await customSave(result.targetSaveName);
  if (!success) {
    respondAsGame('<div class="system-message">Save failed. Please try again.</div>');
  }
  // Success message is shown by customSave() itself

  return true;
}

/**
 * Handle restore selection
 */
async function handleRestoreResponse(input, saves) {
  // Check if input is a number
  const num = parseInt(input);
  let save = null;

  if (!isNaN(num) && num >= 1 && num <= saves.length) {
    save = saves[num - 1];
  } else {
    // Try to find by name (case-insensitive)
    save = saves.find(s => s.name.toLowerCase() === input.toLowerCase());
  }

  if (!save) {
    respondAsGame('<div class="system-message">Save not found. Please try again.</div>');
    return true;
  }

  // Manual restore requires page reload to reset glkapi.js state
  // Set pending restore flag and reload
  if (save.type === 'quicksave') {
    sessionStorage.setItem('lantern_pending_restore', JSON.stringify({
      type: 'quicksave',
      key: save.gameSignature || state.currentGameName,
      gameName: state.currentGameName
    }));
  } else if (save.type === 'customsave') {
    sessionStorage.setItem('lantern_pending_restore', JSON.stringify({
      type: 'customsave',
      key: save.name,  // Just the save name
      gameName: state.currentGameName
    }));
  } else {
    // Autosave - shouldn't normally be selected via RESTORE command, but handle it
    sessionStorage.setItem('lantern_pending_restore', JSON.stringify({
      type: 'autosave',
      key: state.currentGameName,
      gameName: state.currentGameName
    }));
  }

  // Preserve player/mic state across the reload
  sessionStorage.setItem('lantern_restore_ui_state', JSON.stringify({
    autoplayEnabled: state.autoplayEnabled,
    micUnmuted: !state.isMuted,
  }));

  // Reload page to trigger autorestore
  window.location.reload();

  return true;
}

/**
 * Handle delete selection
 */
async function handleDeleteResponse(input, saves) {
  // Check if input is a number
  const num = parseInt(input);
  let save = null;

  if (!isNaN(num) && num >= 1 && num <= saves.length) {
    save = saves[num - 1];
  } else {
    // Try to find by name (case-insensitive)
    save = saves.find(s => s.name.toLowerCase() === input.toLowerCase());
  }

  if (!save) {
    respondAsGame('<div class="system-message">Save not found. Please try again.</div>');
    return true;
  }

  // Handle autosave specially - can't delete directly
  if (save.type === 'autosave') {
    respondAsGame('<div class="system-message">The autosave cannot be deleted directly. Use "Restart Game" in Settings to start fresh.</div>');
    return true;
  }

  // Delete the save
  localStorage.removeItem(save.key);
  respondAsGame(`<div class="system-message">Deleted save "${save.name}".</div>`);

  return true;
}

/**
 * Handle repair confirmation response
 */
async function handleRepairResponse(input) {
  if (input.toLowerCase() !== 'confirm') {
    const { resetRepairFlag } = await import('../voxglk-watchdog.js');
    resetRepairFlag();
    respondAsGame('<div class="system-message">Repair cancelled. Type REPAIR to try again, or restart from Settings.</div>');
    return true;
  }

  // User confirmed - trigger repair
  respondAsGame('<div class="system-message">Repairing game state...</div>');

  const { performRepair } = await import('../voxglk-watchdog.js');
  await performRepair();

  return true;
}

/**
 * Handle feedback text — read it back via TTS and ask for confirmation before submitting.
 */
async function handleFeedbackResponse(notes) {
  pendingFeedbackText = notes;
  awaitingMetaInput = 'feedback-confirm';

  respondAsGame(`<div class="system-message">Your feedback: "<b>${notes}</b>"<br>Send it? (yes / cancel)</div>`);
  enterSystemEntryMode('yes or cancel');

  const { speakAppMessage } = await import('../../narration/tts-player.js');
  speakAppMessage(`Your feedback: ${notes}. Send it?`);

  return true;
}

/**
 * Handle game-initiated save dialog (when game asks to save)
 */
async function handleGameSaveResponse(input, saves) {
  const result = validateSaveName(input);
  if (!result.valid) {
    respondAsGame(`<div class="system-message">${result.errorMessage}</div>`);
    // IMPORTANT: Restore awaitingMetaInput flag so ESC/Enter cancellation works
    awaitingMetaInput = 'game-save';
    setTimeout(() => enterSystemEntryMode('Enter save name'), 100);
    return true;
  }

  // Set flag so Dialog.file_write() knows to use custom save format
  window._customSaveFilename = result.targetSaveName;

  // Return file reference to callback - VM will save through Dialog.file_write()
  // Dialog.file_write() will show "Game saved - {name}" message
  if (gameDialogCallback && gameDialogRef) {
    setTimeout(() => {
      gameDialogCallback(gameDialogRef);
      gameDialogCallback = null;
      gameDialogRef = null;
    }, 0);
  }

  return true;
}

/**
 * Handle game-initiated restore dialog (when game asks to restore)
 */
async function handleGameRestoreResponse(input, saves) {
  // Check if input is a number
  const num = parseInt(input);
  let save = null;

  if (!isNaN(num) && num >= 1 && num <= saves.length) {
    save = saves[num - 1];
  } else {
    // Try to find by name (case-insensitive)
    save = saves.find(s => s.name.toLowerCase() === input.toLowerCase());
  }

  if (!save) {
    respondAsGame('<div class="system-message">Save not found. Please try again.</div>');

    // Re-prompt by re-entering system entry mode
    // IMPORTANT: Restore awaitingMetaInput flag so ESC/Enter cancellation works
    awaitingMetaInput = 'game-restore';
    setTimeout(() => {
      enterSystemEntryMode('Enter save name to restore');
    }, 100);
    return true;
  }

  // Quicksave cannot be restored via in-game dialog
  if (save.type === 'quicksave') {
    respondAsGame('<div class="system-message">Use the Quick Load button to restore a quicksave.</div>');

    // Re-prompt
    // IMPORTANT: Restore awaitingMetaInput flag so ESC/Enter cancellation works
    awaitingMetaInput = 'game-restore';
    setTimeout(() => {
      enterSystemEntryMode('Enter save name to restore');
    }, 100);
    return true;
  }

  // Use page reload approach (same as Quick Load and typed RESTORE command)
  // This avoids the crash from calling restore_file() and then returning to dialog callback
  const pendingRestore = save.type === 'autosave'
    ? { type: 'autosave', key: state.currentGameName, gameName: state.currentGameName }
    : { type: 'customsave', key: save.name, gameName: state.currentGameName };
  sessionStorage.setItem('lantern_pending_restore', JSON.stringify(pendingRestore));

  respondAsGame(`<div class="system-message">Restoring from "${save.name}"...</div>`);

  // Preserve player/mic state across the reload
  sessionStorage.setItem('lantern_restore_ui_state', JSON.stringify({
    autoplayEnabled: state.autoplayEnabled,
    micUnmuted: !state.isMuted,
  }));

  // Reload page - autorestore will handle the restore during startup
  // Dialog callback will never be called (page is reloading anyway)
  setTimeout(() => {
    window.location.reload();
  }, 500);

  return true;
}

/**
 * Initialize dialog event listener
 * Handles in-game save/restore prompts (like "press r to restore" in Anchorhead)
 */
export function initDialogInterceptor() {
  window.addEventListener('lantern-dialog-open', (e) => {
    const { tosave, usage, gameid, callback } = e.detail;

    // Check if this is a save/restore request
    if (usage === 'save') {
      if (!tosave) {
        // RESTORE request from game
        const allSaves = getRestoreList();

        if (allSaves.length === 0) {
          respondAsGame('<div class="system-message">No saved games found. Use SAVE command first.</div>');

          // Return null to indicate no save available
          if (callback) {
            setTimeout(() => {
              callback(null);
            }, 0);
          }
          return;
        }

        // Show restore prompt
        let message = '<div class="system-message"><b>Restore - Choose a file to restore. (# or name)</b><br>';
        message += formatSavesList(allSaves);
        message += '</div>';

        respondAsGame(message);

        // Store callback and file reference
        gameDialogCallback = callback;
        gameDialogRef = Dialog.file_construct_ref('temp', usage, gameid);
        awaitingMetaInput = 'game-restore';

        // Enter system entry mode with prompt
        enterSystemEntryMode('Enter save name to restore');

      } else {
        // SAVE request from game
        const allSaves = getUnifiedSavesList();

        let message = '<div class="system-message"><b>Save - Enter a file name for your save.</b>';

        if (allSaves.length > 0) {
          message += '<br>Existing saves:<br>';
          message += formatSavesList(allSaves);
        }

        message += '</div>';

        respondAsGame(message);

        // Store callback and file reference
        gameDialogCallback = callback;
        gameDialogRef = Dialog.file_construct_ref('temp', usage, gameid);
        awaitingMetaInput = 'game-save';

        // Enter system entry mode with prompt
        enterSystemEntryMode('Enter save name');
      }
    } else {
      // Unsupported dialog type - return null
      if (callback) {
        setTimeout(() => {
          callback(null);
        }, 0);
      }
    }
  });
}

/**
 * Cancel system entry mode (called when Escape is pressed)
 */
export function cancelMetaInput() {
  if (awaitingMetaInput) {
    const mode = awaitingMetaInput;
    awaitingMetaInput = null;
    exitSystemEntryMode();

    // If this was a game dialog (save/restore from in-game), clear system messages and return null
    if ((mode === 'game-save' || mode === 'game-restore') && gameDialogCallback) {
      // Clear all system messages before showing game's response
      const systemMessages = document.querySelectorAll('.system-message');
      systemMessages.forEach(msg => msg.remove());

      setTimeout(() => {
        gameDialogCallback(null);
        gameDialogCallback = null;
        gameDialogRef = null;
      }, 0);
    } else {
      // For typed commands, show cancellation message
      respondAsGame('<div class="system-message"><i>Cancelled.</i></div>');
    }
  }
}

/**
 * Check if awaiting meta input
 * @returns {boolean} True if awaiting input
 */
export function isAwaitingMetaInput() {
  return awaitingMetaInput !== null;
}

/**
 * Set awaiting meta input mode (for direct command syntax like "restore mysave")
 * @param {string} mode - Mode to set ('save', 'restore', 'delete', etc.)
 */
export function setAwaitingMetaInput(mode) {
  awaitingMetaInput = mode;
}
