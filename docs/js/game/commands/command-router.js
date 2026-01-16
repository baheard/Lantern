/**
 * Command Router Module
 *
 * Main entry point for command processing, routing, and meta-command interception.
 */

import { state } from '../../core/state.js';
import { dom } from '../../core/dom.js';
import { updateStatus } from '../../utils/status.js';
import { addToCommandHistory } from '../../ui/history.js';
import { addGameText } from '../../ui/game-output.js';
import { sendCommandToGame } from '../game-loader.js';
import { isSystemEntryMode } from '../../input/keyboard/index.js';
import { getInputType, sendInput, isInputEnabled } from '../voxglk.js';
import { isAppCommand } from '../../core/app-commands.js';
import { LOW_CONFIDENCE_THRESHOLD, playAppCommand } from '../../utils/audio-feedback.js';
import { setLastCommand } from '../../features/auto-mapper.js';
import {
  handleSaveCommand,
  handleRestoreCommand,
  handleDeleteCommand,
  handleQuitCommand,
  handleRepairCommand,
  handleMetaResponse,
  isAwaitingMetaInput,
  setAwaitingMetaInput
} from './meta-command-handlers.js';
import { getCustomSaves, getUnifiedSavesList } from './save-list-formatter.js';

// Import voice command handlers so typed commands can use them too
let voiceCommandHandlers = null;
async function getVoiceCommandHandlers() {
  if (!voiceCommandHandlers) {
    const appModule = await import('../../app.js');
    voiceCommandHandlers = appModule.voiceCommandHandlers;
  }
  return voiceCommandHandlers;
}

/**
 * Parse number word to integer (e.g., "three" -> 3)
 * @param {string} word - Number word or digit string
 * @returns {number} Parsed number
 */
function parseNumberWord(word) {
  const numberMap = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
  };
  return numberMap[word] || parseInt(word, 10);
}

/**
 * Intercept meta-commands and respond without sending to game
 * @param {string} cmd - Normalized command (lowercase, trimmed)
 * @param {string} displayCmd - Original command for display (optional)
 * @returns {boolean} - True if command was intercepted
 */
async function interceptMetaCommand(cmd, displayCmd = null) {
  const originalCmd = displayCmd || cmd; // Keep original for save names (case-sensitive)
  cmd = cmd.toLowerCase().trim();

  // Handle interactive responses (when awaiting input)
  if (isAwaitingMetaInput()) {
    // Input already displayed by sendCommandDirect with proper styling
    return await handleMetaResponse(originalCmd);
  }

  // Handle "print [text]" command - send literal text to game
  const printMatch = originalCmd.match(/^print\s+(.+)$/i);
  if (printMatch) {
    const actualCommand = printMatch[1];
    sendCommandToGame(actualCommand);
    return true; // Intercepted - don't send the "print" prefix to game
  }

  // Check for commands with arguments first (before exact matches)
  // Match "save [name]", "restore [name]", "load [name]"
  // Use originalCmd to preserve case of save names
  const saveMatch = originalCmd.match(/^save\s+(.+)$/i);
  if (saveMatch) {
    const saveName = saveMatch[1].trim();
    const customSaves = getCustomSaves();
    return await handleSaveResponse(saveName, customSaves);
  }

  const restoreMatch = originalCmd.match(/^(?:restore|load)\s+(.+)$/i);
  if (restoreMatch) {
    const saveName = restoreMatch[1].trim();
    const allSaves = getUnifiedSavesList();
    return await handleRestoreResponse(saveName, allSaves);
  }

  const deleteMatch = originalCmd.match(/^delete(?:\s+save)?\s+(.+)$/i);
  if (deleteMatch) {
    const saveName = deleteMatch[1].trim();
    const allSaves = getUnifiedSavesList();
    return await handleDeleteResponse(saveName, allSaves);
  }

  // Match "skip N" or "skip forward N"
  const skipNMatch = cmd.match(/^skip(?:\s+forward)?\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)$/i);
  if (skipNMatch) {
    const countStr = skipNMatch[1].toLowerCase();
    const count = parseNumberWord(countStr);
    playAppCommand();
    const handlers = await getVoiceCommandHandlers();
    handlers.skipN(count);
    return true;
  }

  // Match "back N"
  const backNMatch = cmd.match(/^back\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)$/i);
  if (backNMatch) {
    const countStr = backNMatch[1].toLowerCase();
    const count = parseNumberWord(countStr);
    playAppCommand();
    const handlers = await getVoiceCommandHandlers();
    handlers.backN(count);
    return true;
  }

  // Check for meta-commands
  // Note: Commands are already displayed by sendCommandDirect(), so we don't display them again here
  switch (cmd) {
    case 'app help':
      respondAsGame(`
<div class="system-message">
<b>IFTalk App Commands</b><br>
<br>
These commands work whether typed or spoken:<br>
<br>
<b>Narration Control:</b><br>
• PLAY, PAUSE, REPEAT - Control TTS playback<br>
• SKIP, BACK - Move forward/backward one sentence<br>
• SKIP N, BACK N - Move N sentences (e.g., SKIP 3, BACK 2)<br>
• SKIP ALL, END - Skip to end of current narration<br>
<br>
<b>Save/Load:</b><br>
• SAVE [name], RESTORE [name], DELETE [name]<br>
• QUICK SAVE, QUICK LOAD - Use default autosave slot<br>
<br>
<b>Audio:</b><br>
• MUTE, UNMUTE - Toggle voice recognition<br>
• STATUS - Read current game status<br>
• READ LAST COMMAND - Repeat last command output<br>
<br>
<b>AI Hints:</b><br>
• GET HINT - ChatGPT assistance<br>
• GET GEMINI HINT - UHS-style progressive hints<br>
<br>
<b>Game Management:</b><br>
• QUIT - Auto-save and return to game selection<br>
• REPAIR - Fix broken game state (if not responding)<br>
<br>
<b>Special:</b><br>
• PRINT [text] - Send literal text (bypass parsing)<br>
<br>
For standard game commands (NORTH, LOOK, TAKE, etc.),<br>
just speak or type them naturally.<br>
<br>
See Settings → Voice Commands for complete reference.
</div>
      `);
      return true;

    case 'help':
    case 'commands':
      // Show brief message about app help, then pass through to game
      respondAsGame('<div class="system-message">For app help, type <b>App Help</b></div>');
      // Don't return true - let it pass through to game below
      return false;

    case 'save':
      playAppCommand();
      return await handleSaveCommand();

    case 'restore':
    case 'load':
      playAppCommand();
      return await handleRestoreCommand();

    case 'delete save':
    case 'delete':
      playAppCommand();
      return await handleDeleteCommand();

    // Navigation commands - work whether typed or spoken
    case 'repeat':
      playAppCommand();
      const handlers = await getVoiceCommandHandlers();
      handlers.restart();
      return true;

    case 'back':
      playAppCommand();
      (await getVoiceCommandHandlers()).back();
      return true;

    case 'stop':
      playAppCommand();
      (await getVoiceCommandHandlers()).skipToEnd();
      return true;

    case 'pause':
      playAppCommand();
      (await getVoiceCommandHandlers()).pause();
      return true;

    case 'play':
    case 'resume':
      playAppCommand();
      (await getVoiceCommandHandlers()).play();
      return true;

    case 'skip':
      playAppCommand();
      (await getVoiceCommandHandlers()).skip();
      return true;

    case 'skip all':
    case 'skip to end':
    case 'skip to the end':
    case 'end':
      playAppCommand();
      (await getVoiceCommandHandlers()).skipToEnd();
      return true;

    case 'mute':
      playAppCommand();
      (await getVoiceCommandHandlers()).mute();
      return true;

    case 'unmute':
    case 'on mute':
    case 'un mute':
      playAppCommand();
      (await getVoiceCommandHandlers()).unmute();
      return true;

    case 'lock mic':
    case 'lock mike':
    case 'lockmic':
      playAppCommand();
      (await getVoiceCommandHandlers()).holdMic();
      return true;

    case 'unlock mic':
    case 'unlock mike':
    case 'unlockmic':
      playAppCommand();
      (await getVoiceCommandHandlers()).openMic();
      return true;

    case 'lock screen':
    case 'lockscreen':
      playAppCommand();
      const { lockScreen } = await import('../../utils/lock-screen.js');
      lockScreen();
      return true;

    case 'unlock screen':
    case 'unlockscreen':
      playAppCommand();
      const { unlockScreen } = await import('../../utils/lock-screen.js');
      unlockScreen();
      return true;

    case 'status':
      playAppCommand();
      (await getVoiceCommandHandlers()).status();
      return true;

    case 'read last command':
    case 'last command':
    case 'what did i say':
      playAppCommand();
      // Find the last command that isn't "read last command" or "stop"
      let lastCmd = null;
      const skipCommands = ['read last command', 'last command', 'what did i say', 'stop', 'pause'];
      for (let i = 0; i < state.commandHistoryItems.length; i++) {
        const cmdLower = state.commandHistoryItems[i].original.toLowerCase().trim();
        if (!skipCommands.includes(cmdLower)) {
          lastCmd = state.commandHistoryItems[i];
          break;
        }
      }

      if (!lastCmd) {
        respondAsGame('<div class="system-message">No previous command yet.</div>');
      } else {
        const confidence = lastCmd.confidence !== null ? ` (${Math.round(lastCmd.confidence * 100)}%)` : '';
        respondAsGame(`<div class="system-message"><b>Last command:</b><br>${lastCmd.original}${confidence}</div>`);
      }
      return true;

    case 'quick save':
    case 'quicksave':
      playAppCommand();
      (await getVoiceCommandHandlers()).quickSave();
      return true;

    case 'quick load':
    case 'quickload':
    case 'quick restore':
    case 'quickrestore':
      playAppCommand();
      (await getVoiceCommandHandlers()).quickLoad();
      return true;

    case 'load game':
    case 'restore game':
      playAppCommand();
      const h = await getVoiceCommandHandlers();
      if (h.restoreLatest) h.restoreLatest();
      return true;

    case 'get hint':
      playAppCommand();
      (await getVoiceCommandHandlers()).getHint();
      return true;

    case 'get gemini hint':
      playAppCommand();
      (await getVoiceCommandHandlers()).getGeminiHint();
      return true;

    case 'quit':
      return await handleQuitCommand();

    case 'repair':
      return await handleRepairCommand();

    default:
      // Check for "load slot X" or "restore slot X" pattern
      const slotMatch = cmd.match(/^(?:load|restore)\s+slot\s+(\d+)$/);
      if (slotMatch) {
        const slot = parseInt(slotMatch[1]);
        const h = await getVoiceCommandHandlers();
        if (h.restoreSlot) h.restoreSlot(slot);
        return true;
      }

      return false; // Not intercepted, send to game normally
  }
}

/**
 * Respond as if the game sent output
 * @param {string} html - HTML content to display
 */
function respondAsGame(html) {
  // Add game text with isCommand=false (this is game output, not user command)
  addGameText(html, false);

  // Trigger TTS narration if enabled
  // Extract plain text from HTML for TTS
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  const plainText = tempDiv.textContent.trim();

  if (state.autoplayEnabled && window.handleGameOutput) {
    window.handleGameOutput(plainText);
  }
}

// Response handlers for save/restore/delete with arguments (e.g., "restore mysave")
async function handleSaveResponse(saveName, saves) {
  // Simulate entering save mode and immediately providing the name
  setAwaitingMetaInput('save');
  return await handleMetaResponse(saveName);
}

async function handleRestoreResponse(saveName, saves) {
  // Simulate entering restore mode and immediately providing the name
  setAwaitingMetaInput('restore');
  return await handleMetaResponse(saveName);
}

async function handleDeleteResponse(saveName, saves) {
  // Simulate entering delete mode and immediately providing the name
  setAwaitingMetaInput('delete');
  return await handleMetaResponse(saveName);
}

/**
 * Send command directly to game (no AI translation)
 * @param {string} cmd - Command to send
 * @param {boolean} isVoiceCommand - Whether this is a voice command (optional, auto-detected if not provided)
 * @param {number} confidence - Voice recognition confidence (0.0-1.0), null for keyboard input
 */
export async function sendCommandDirect(cmd, isVoiceCommand = null, confidence = null) {
  const input = cmd !== undefined ? cmd : '';

  // Detect if this is a voice command (not manually typed)
  // Use provided value if given, otherwise auto-detect
  if (isVoiceCommand === null) {
    isVoiceCommand = !state.hasManualTyping;
  }

  // Block ALL voice commands when muted (mic should be fully off)
  if (state.isMuted && isVoiceCommand) {
    // Silently ignore all voice commands when muted
    return;
  }

  // Mark that a command is being processed
  state.pendingCommandProcessed = true;
  state.pausedForSound = false;

  state.hasManualTyping = false;

  updateStatus('Sending...', 'processing');

  // Determine if this is a low confidence command
  const isLowConfidence = confidence !== null && confidence < LOW_CONFIDENCE_THRESHOLD;

  // Add to command history (show [ENTER] for empty commands)
  // History params: original, translated, confidence, isVoiceCommand
  addToCommandHistory(input || '[ENTER]', null, confidence, isVoiceCommand);

  // Check if we're in char mode (press any key) - don't display commands in char mode
  const inputType = getInputType();
  const isCharMode = inputType === 'char';

  // Only display commands in line mode, not in char mode (press any key screens)
  if (!isCharMode) {
    // Check for "print [text]" command - special display formatting
    const printMatch = input.match(/^print\s+(.+)$/i);
    if (printMatch) {
      // Display as: >[print] actual command
      // where [print] is in system color
      const actualCommand = printMatch[1];
      const formattedDisplay = `<span style="color: var(--color-app-system)">[print]</span> ${actualCommand}`;

      // Create custom command display
      const div = document.createElement('div');
      div.className = 'user-command';
      if (isVoiceCommand) div.classList.add('voice-command');
      div.innerHTML = `<span class="command-label">&gt;</span><span class="command-text">${formattedDisplay}</span>`;

      if (dom.lowerWindow) {
        const commandLine = document.getElementById('commandLine');
        if (commandLine && commandLine.parentElement === dom.lowerWindow) {
          dom.lowerWindow.insertBefore(div, commandLine);
        } else {
          dom.lowerWindow.appendChild(div);
        }
      }
    } else {
      // Normal command display
      // Always display the command with proper styling (voice/typed, confidence)
      // The game will also echo it, but we'll filter that out of narration
      // Use app-command styling for app/meta-commands or when in system entry mode
      const isAppCmd = isSystemEntryMode() || isAppCommand(input);
      addGameText(input || '[ENTER]', true, isVoiceCommand, isAppCmd, confidence);
    }
  }

  // Track for echo detection (so we can skip the game's glk-input echo)
  window.lastCommandWasVoice = isVoiceCommand;
  window.lastCommandConfidence = confidence;

  // Intercept meta-commands before sending to game
  const intercepted = await interceptMetaCommand(input.toLowerCase().trim(), input);
  if (intercepted) {
    // Command was handled by interceptor, don't send to game
    setTimeout(() => {
      updateStatus('Ready');
    }, 100);
    return;
  }

  // Track command for auto-mapper (before sending to VM)
  setLastCommand(input);

  // Send to ZVM
  sendCommandToGame(input);

  // Reset status after a brief delay
  setTimeout(() => {
    updateStatus('Ready');
  }, 100);
}

/**
 * Send command (legacy function - no longer used with inline keyboard input)
 */
export async function sendCommand() {
  // This function is kept for compatibility but is no longer used
  // Commands are now sent directly from keyboard.js via sendCommandDirect
}

/**
 * Wait for game to enable input, then send Enter to continue
 * Polls every 50ms for up to 1 second
 */
function waitForInputAndContinue(attempts = 0) {
  const maxAttempts = 20; // 20 * 50ms = 1 second max wait

  if (attempts >= maxAttempts) {
    return;
  }

  const inputReady = isInputEnabled();
  const currentType = getInputType();

  if (inputReady && currentType === 'char') {
    sendInput('return', 'char');
  } else if (!inputReady) {
    // Keep waiting
    setTimeout(() => waitForInputAndContinue(attempts + 1), 50);
  }
  // If inputReady but type is 'line', don't send anything - user can type
}
