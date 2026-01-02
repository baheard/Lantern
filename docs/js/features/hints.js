/**
 * ChatGPT Hints Feature
 * Gathers game context and opens ChatGPT with a pre-filled hint request
 */

import { state } from '../core/state.js';
import { sendCommandToGame } from '../game/game-loader.js';
import { isInputEnabled, getInputType } from '../game/voxglk.js';
import { updateStatus } from '../utils/status.js';
import { getGameSetting, setGameSetting } from '../utils/game-settings.js';
import { confirmDialog } from '../ui/confirm-dialog.js';

/**
 * Store reference to ChatGPT window for reuse
 */
let chatGPTWindow = null;

/**
 * Check if game is ready for hint gathering
 * @returns {boolean} True if game is loaded and accepting line input
 */
function isGameReadyForHints() {
  // Check if game is loaded
  if (!state.currentGameName) {
    return false;
  }

  const inputEnabled = isInputEnabled();

  // Check if input is enabled
  if (!inputEnabled) {
    return false;
  }

  // Must be in line input mode (not char input)
  const inputType = getInputType();

  if (inputType !== 'line') {
    return false;
  }

  return true;
}

/**
 * Send a command and capture the response
 * @param {string} cmd - Command to send
 * @returns {Promise<string>} Captured game output
 */
function sendCommandAndCapture(cmd) {
  return new Promise((resolve, reject) => {
    // Store the current text element before sending command
    const beforeElement = state.currentGameTextElement;

    // Send the command
    sendCommandToGame(cmd);

    // Poll for new output
    const startTime = Date.now();
    const timeout = 5000; // 5 second timeout
    let pollCount = 0;

    const checkInterval = setInterval(() => {
      pollCount++;
      // Check if we got new output
      const afterElement = state.currentGameTextElement;

      if (afterElement && afterElement !== beforeElement) {
        // Got new output!
        clearInterval(checkInterval);

        // Extract text content from the element
        const text = afterElement.textContent || afterElement.innerText || '';
        resolve(text.trim());
        return;
      }

      // Check timeout
      if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval);
        reject(new Error('Command timed out after 5 seconds'));
      }
    }, 100); // Check every 100ms
  });
}

/**
 * Get current status bar text
 * @returns {string} Status bar text or empty string
 */
function getStatusBarText() {
  // Try multiple selectors for status bar
  let statusWindow = document.querySelector('.WindowRock_0');

  // Fallback: try #statusBar (might be used in some games)
  if (!statusWindow) {
    statusWindow = document.querySelector('#statusBar');
  }

  // Fallback: try #upperWindow (status content might be here)
  if (!statusWindow) {
    statusWindow = document.querySelector('#upperWindow');
  }

  if (statusWindow) {
    const statusText = (statusWindow.textContent || statusWindow.innerText || '').trim();
    return statusText;
  }

  return '';
}

/**
 * Gather game context: status bar + look + inventory
 * @param {Function} onProgress - Progress callback (step, total, description)
 * @returns {Promise<Object>} Context object with status, location, inventory
 */
async function gatherGameContext(onProgress) {
  const context = {
    status: '',
    location: '',
    inventory: '',
    gameName: state.currentGameName || 'Unknown Game'
  };

  try {
    // Step 1: Get status bar
    if (onProgress) onProgress(1, 3, 'Reading status bar...');
    context.status = getStatusBarText();

    // Step 2: Send "look" command
    if (onProgress) onProgress(2, 3, 'Getting location description...');
    try {
      context.location = await sendCommandAndCapture('look');
    } catch (err) {
      context.location = '(Unable to get location description)';
    }

    // Step 3: Send "i" (inventory) command
    if (onProgress) onProgress(3, 3, 'Checking inventory...');
    try {
      context.inventory = await sendCommandAndCapture('i');
    } catch (err) {
      context.inventory = '(Unable to get inventory)';
    }

    // Wait for game input to be re-enabled (poll until ready)
    const startTime = Date.now();
    const maxWait = 3000; // 3 second timeout
    let waitPollCount = 0;

    while (!isInputEnabled() && (Date.now() - startTime < maxWait)) {
      waitPollCount++;
      await new Promise(resolve => setTimeout(resolve, 100)); // Check every 100ms
    }

  } catch (err) {
    throw err;
  }

  return context;
}

/**
 * Build ChatGPT prompt from game context
 * @param {Object} context - Game context object
 * @param {string} hintType - Type of hint (general, puzzle, location)
 * @returns {string} Formatted prompt for ChatGPT
 */
function buildChatGPTPrompt(context, hintType = 'general') {
  const { gameName, status, location, inventory } = context;

  // Build base prompt
  let prompt = `I'm playing the interactive fiction game "${gameName}" and need help.\n\n`;

  // Add status if available
  if (status && status.trim()) {
    prompt += `**Current Status:**\n${status.trim()}\n\n`;
  }

  // Add location
  prompt += `**Current Location:**\n${location.trim()}\n\n`;

  // Add inventory
  prompt += `**Inventory:**\n${inventory.trim()}\n\n`;

  // Add hint type-specific request
  switch (hintType) {
    case 'puzzle':
      prompt += `I'm stuck on a puzzle. Can you give me a hint about how to solve it? Please don't spoil the solution - just point me in the right direction.`;
      break;
    case 'location':
      prompt += `I'm not sure where to go or what area to explore next. Can you give me a hint about navigation? Please don't spoil anything - just suggest a direction.`;
      break;
    case 'general':
    default:
      prompt += `Can you give me a hint about what I should do next? Please don't spoil the solution - just point me in the right direction.`;
      break;
  }

  return prompt;
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<void>}
 */
async function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

/**
 * Open ChatGPT with the prompt - Always shows dialog for better UX
 * @param {string} prompt - The prompt to send to ChatGPT
 */
async function openChatGPT(prompt) {
  // Always show prompt dialog for better UX - user can review prompt and choose to copy
  showHintPromptDialog(prompt);

  updateStatus('Review hint prompt in dialog');
}

/**
 * Show hint prompt in a styled dialog (main UX flow)
 * @param {string} prompt - The prompt text
 */
function showHintPromptDialog(prompt) {
  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.className = 'hint-dialog-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';

  // Create dialog
  const dialog = document.createElement('div');
  dialog.className = 'hint-dialog';
  dialog.style.cssText = 'background:var(--bg-elevated,#2a2a2a);color:var(--text-primary,#e0e0e0);padding:0;border-radius:12px;max-width:700px;width:100%;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.4);';

  // Get saved hint type preference
  const savedHintType = localStorage.getItem('iftalk_hintType') || 'general';

  // Add content with improved styling
  dialog.innerHTML = `
    <div class="hint-dialog-header" style="padding:20px;border-bottom:1px solid var(--border-subtle,#3a3a3a);display:flex;justify-content:space-between;align-items:center;">
      <h3 style="margin:0;font-size:18px;font-weight:600;">
        <span class="material-icons" style="vertical-align:middle;margin-right:8px;color:var(--accent-primary,#4CAF50);">lightbulb</span>
        ChatGPT Hint Prompt
      </h3>
      <button class="close-dialog-btn" style="background:none;border:none;color:var(--text-secondary,#999);font-size:24px;cursor:pointer;padding:0;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:4px;">✕</button>
    </div>
    <div class="hint-dialog-body" style="padding:20px;flex:1;overflow:auto;">
      <p class="hint-dialog-instructions" style="margin:0 0 12px 0;color:var(--text-secondary,#b0b0b0);font-size:14px;">
        Review the prompt below. Clicking the button will copy it and open ChatGPT with the prompt pre-filled:
      </p>
      <textarea readonly class="hint-prompt-textarea" style="width:100%;height:250px;font-family:monospace;font-size:13px;padding:12px;border:1px solid var(--border-subtle,#3a3a3a);border-radius:6px;background:var(--bg-primary,#1e1e1e);color:var(--text-primary,#e0e0e0);resize:vertical;min-height:200px;">${prompt}</textarea>
    </div>
    <div class="hint-dialog-footer" style="padding:20px;border-top:1px solid var(--border-subtle,#3a3a3a);display:flex;flex-direction:column;gap:10px;">
      <button id="copyAndOpenBtn" class="btn btn-primary btn-full-width" style="padding:12px 24px;background:var(--accent-primary,#4CAF50);color:white;border:none;border-radius:6px;cursor:pointer;font-size:15px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:8px;transition:background 0.2s;">
        <span class="material-icons" style="font-size:20px;">content_copy</span>
        Copy & Open ChatGPT
      </button>
      <div class="hint-dialog-secondary-actions" style="display:flex;gap:10px;">
        <button id="copyOnlyBtn" class="btn btn-secondary" style="flex:1;padding:10px 20px;background:var(--bg-secondary,#333);color:var(--text-primary,#e0e0e0);border:1px solid var(--border-subtle,#3a3a3a);border-radius:6px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;gap:6px;">
          <span class="material-icons" style="font-size:18px;">content_copy</span>
          Copy Only
        </button>
        <button id="closePromptBtn" class="btn btn-secondary" style="flex:1;padding:10px 20px;background:var(--bg-secondary,#333);color:var(--text-primary,#e0e0e0);border:1px solid var(--border-subtle,#3a3a3a);border-radius:6px;cursor:pointer;font-size:14px;">
          Close
        </button>
      </div>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Select all text for easy copying
  const textarea = dialog.querySelector('.hint-prompt-textarea');
  textarea.select();

  // Copy & Open ChatGPT button (primary action)
  const copyAndOpenBtn = dialog.querySelector('#copyAndOpenBtn');

  // Ensure button is clickable (fix potential CSS issues)
  if (copyAndOpenBtn) {
    copyAndOpenBtn.style.pointerEvents = 'auto';
    copyAndOpenBtn.style.touchAction = 'manipulation';
  }

  const handleCopyAndOpen = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Visual feedback immediately (so user knows button was tapped)
    const btn = dialog.querySelector('#copyAndOpenBtn');
    btn.innerHTML = '<span class="material-icons">check_circle</span> Copying...';
    btn.style.background = 'var(--success,#66BB6A)';

    // Try to copy to clipboard using modern API (better for iOS)
    let copySuccess = false;
    const promptText = textarea.value;

    // Try modern Clipboard API first (iOS 13.4+)
    // IMPORTANT: Await the promise so clipboard operation completes before opening window
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(promptText);
        copySuccess = true;
      } catch (err) {
        // Fall through to legacy method
      }
    }

    // Fallback to legacy method if modern API not available or failed
    if (!copySuccess) {
      textarea.select();
      try {
        copySuccess = document.execCommand('copy');
      } catch (err) {
        // Ignore legacy copy errors
      }
    }

    // Both mobile and desktop: Use URL parameter with hints mode
    // Format: https://chatgpt.com/?hints=research&q=<prompt>
    const maxUrlLength = 8000;
    let chatGPTUrl;

    try {
      const encodedPrompt = encodeURIComponent(promptText);
      const urlWithPrompt = `https://chatgpt.com/?hints=research&q=${encodedPrompt}`;

      if (urlWithPrompt.length <= maxUrlLength) {
        chatGPTUrl = urlWithPrompt;
      } else {
        chatGPTUrl = 'https://chat.openai.com/';
      }
    } catch (err) {
      chatGPTUrl = 'https://chat.openai.com/';
    }

    const newWindow = window.open(chatGPTUrl, '_blank');

    // If window.open was blocked, use location.href
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      window.location.href = chatGPTUrl;
      return;
    }

    btn.innerHTML = '<span class="material-icons">check_circle</span> Opened!';

    // Show appropriate status based on whether URL parameter was used
    const usedUrlParam = chatGPTUrl.includes('?hints=');
    if (usedUrlParam) {
      updateStatus('✓ ChatGPT opened with prompt pre-filled!');
    } else if (copySuccess) {
      updateStatus('✓ Copied! Paste in ChatGPT (prompt too long for URL)');
    } else {
      updateStatus('Paste prompt in ChatGPT');
    }

    // Close dialog after brief delay
    setTimeout(() => {
      document.body.removeChild(overlay);

      // Resume narration if it was paused by hint
      if (state.pausedByHint) {
        state.pausedByHint = false;
        state.isPaused = false;
      }
    }, 600);
  };

  // Register event listeners - use both click and touchend for iOS compatibility
  copyAndOpenBtn.addEventListener('click', handleCopyAndOpen);
  copyAndOpenBtn.addEventListener('touchend', handleCopyAndOpen);

  // Copy Only button (secondary action)
  dialog.querySelector('#copyOnlyBtn').onclick = () => {
    textarea.select();
    try {
      document.execCommand('copy');
      updateStatus('✓ Prompt copied to clipboard');

      // Visual feedback
      const btn = dialog.querySelector('#copyOnlyBtn');
      const originalHTML = btn.innerHTML;
      btn.innerHTML = '<span class="material-icons">check</span> Copied!';
      setTimeout(() => {
        btn.innerHTML = originalHTML;
      }, 2000);

    } catch (e) {
      updateStatus('Press Ctrl+C to copy the selected text');
    }
  };

  // Close button
  const closeDialog = () => {
    document.body.removeChild(overlay);

    // Resume narration if it was paused by hint
    if (state.pausedByHint) {
      state.pausedByHint = false;
      state.isPaused = false;
    }

    updateStatus('Hint request canceled');
  };

  dialog.querySelector('#closePromptBtn').onclick = closeDialog;
  dialog.querySelector('.close-dialog-btn').onclick = closeDialog;

  // Close on overlay click (but not dialog click)
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      closeDialog();
    }
  };

  // Close on Escape key
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeDialog();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

/**
 * Show confirmation dialog before gathering context
 * @returns {Promise<boolean>} True if user confirms, false if canceled
 */
function showConfirmationDialog() {
  const message =
    'This will send "look" and "i" commands to the game to gather context. These commands may advance the game state or be visible in your game history.';

  return confirmDialog(message, { title: 'Get Hint?' });
}

/**
 * Main function: Get hint from ChatGPT
 * @param {string} hintType - Type of hint to request (general, puzzle, location)
 */
export async function getHint(hintType = 'general') {
  try {
    // Check if game is ready
    if (!isGameReadyForHints()) {
      const inputType = getInputType();
      if (inputType === 'char') {
        updateStatus('Hints not available in character input mode');
      } else if (!state.currentGameName) {
        updateStatus('Please load a game first');
      } else {
        updateStatus('Game is not ready for hints');
      }
      return;
    }

    // Pause narration if currently playing
    if (state.isNarrating && !state.isPaused) {
      state.isPaused = true;
      state.pausedByHint = true; // Track that we paused for hint
    }

    // Show confirmation dialog
    const confirmed = await showConfirmationDialog();
    if (!confirmed) {
      // Resume narration if user cancels
      if (state.pausedByHint) {
        state.pausedByHint = false;
        state.isPaused = false;
      }
      updateStatus('Hint request canceled');
      return;
    }

    // Gather context with progress updates
    updateStatus('Gathering game context...');

    const context = await gatherGameContext((step, total, description) => {
      updateStatus(`Gathering context (${step}/${total}): ${description}`);
    });

    // Build prompt
    updateStatus('Building ChatGPT prompt...');
    const prompt = buildChatGPTPrompt(context, hintType);

    // Open ChatGPT with prompt
    await openChatGPT(prompt);

  } catch (err) {
    updateStatus(`Error getting hint: ${err.message}`);
  }
}
