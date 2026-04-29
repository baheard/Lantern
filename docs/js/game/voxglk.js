/**
 * VoxGlk - Voice-Enabled Glk Display Engine
 *
 * Custom Glk display layer for IFTalk that renders beautiful frotz-style HTML
 * and integrates seamlessly with TTS/voice features.
 */

import { renderUpdate } from './voxglk-renderer.js';
import { addGameText, clearGameOutput } from '../ui/game-output.js';
import { state } from '../core/state.js';
import { checkLocationChange } from '../features/auto-mapper.js';
import { updateInputVisibility } from '../input/keyboard/keyboard-core.js';
import {
  startWatchdog,
  clearWatchdog,
  resetWatchdogState,
} from './voxglk-watchdog.js';
import { processGridUpdates, resetGridState } from './voxglk-grid.js';
import {
  resetBootstrapState,
  captureIntroInputType,
  checkSuppressUpdate,
  isBootstrapping,
  isJustRestored,
  clearJustRestored,
  handleAutoRestore,
} from './voxglk-bootstrap.js';

/**
 * State
 */
let generation = 0;
let windows = new Map();
let onTextOutput = null; // Callback for TTS
let acceptCallback = null; // Callback to send input back to Glk
let inputEnabled = false; // Is input currently enabled?
let inputType = null; // Type of input requested: 'line' or 'char' (null until game requests)
let inputWindowId = null; // Window ID for the current input request
let lastStatusLine = ''; // Track status line for scene change detection
let lastContentGeneration = -1; // Track generation when content was last rendered (prevents clearing on resize)
let lastCharModePlainText = ''; // Track previous plain text in char mode for diffing
let resizeTimeout = null; // Debounce resize events
let skipFirstAutosave = false; // Skip first autosave if we're about to restore
let autosaveCounter = 0; // Count autosaves to skip the first N
let previousInputType = null; // Track previous input type to detect transitions
let justExitedCharMode = false; // True when we just transitioned from char to line (VM state needs to settle)

/**
 * Calculate metrics based on actual window dimensions
 * @returns {Object} Metrics object for Glk
 */
function calculateMetrics() {
  // Get game output container
  const gameOutput = document.getElementById('gameOutput');
  if (!gameOutput) {
    // Fallback to hardcoded values
    return {
      width: 800,
      height: 600,
      outspacingx: 0,
      outspacingy: 0,
      inspacingx: 0,
      inspacingy: 0,
      buffercharwidth: 8,
      buffercharheight: 16,
      buffermarginx: 0,
      buffermarginy: 0,
      gridcharwidth: 8,
      gridcharheight: 16,
      gridmarginx: 0,
      gridmarginy: 0,
      graphicsmarginx: 0,
      graphicsmarginy: 0
    };
  }

  // Get actual dimensions
  const rect = gameOutput.getBoundingClientRect();
  const actualWidth = Math.floor(rect.width) || 800;
  const height = Math.floor(rect.height) || 600;

  // Measure character dimensions using a temporary element
  const testDiv = document.createElement('div');
  testDiv.style.cssText = 'position: absolute; visibility: hidden; font-family: var(--font-mono); font-size: 16px; line-height: 1.4; white-space: pre;';
  testDiv.textContent = 'M'.repeat(10); // Use 10 characters to get average
  document.body.appendChild(testDiv);

  const testRect = testDiv.getBoundingClientRect();
  const charWidth = Math.ceil(testRect.width / 10) || 8;
  const charHeight = Math.ceil(testRect.height) || 16;

  document.body.removeChild(testDiv);

  // IMPORTANT: Enforce minimum width for VM to prevent mid-word line breaks
  // Z-machine wraps text at character boundaries based on reported width.
  // On narrow mobile screens, this causes ugly mid-word breaks.
  // By reporting a minimum of 80 columns, we get proper text formatting.
  // CSS handles the actual display/wrapping.
  const MIN_COLUMNS = 80;
  const minWidth = MIN_COLUMNS * charWidth;
  const width = Math.max(actualWidth, minWidth);

  return {
    width: width,
    height: height,
    outspacingx: 0,
    outspacingy: 0,
    inspacingx: 0,
    inspacingy: 0,
    buffercharwidth: charWidth,
    buffercharheight: charHeight,
    buffermarginx: 0,
    buffermarginy: 0,
    gridcharwidth: charWidth,
    gridcharheight: charHeight,
    gridmarginx: 0,
    gridmarginy: 0,
    graphicsmarginx: 0,
    graphicsmarginy: 0
  };
}

/**
 * Handle window resize - send arrange event to Glk
 */
function handleResize() {
  if (!acceptCallback) return;

  // Debounce resize events
  if (resizeTimeout) {
    clearTimeout(resizeTimeout);
  }

  resizeTimeout = setTimeout(() => {
    const metrics = calculateMetrics();

    acceptCallback({
      type: 'arrange',
      gen: generation,
      metrics: metrics
    });
  }, 250); // Wait 250ms after resize stops
}

/**
 * Create VoxGlk display interface
 * This is what Glk will use (passed as options.GlkOte)
 *
 * @param {Function} textOutputCallback - Callback for TTS (receives plain text)
 * @returns {Object} - VoxGlk interface with init(), update(), error() methods
 */
export function createVoxGlk(textOutputCallback) {
  onTextOutput = textOutputCallback;

  const voxglk = {
    /**
     * Called by Glk.init() when it's ready
     * Setup display, then call options.accept({type: 'init'}) to start the game
     */
    init: function(options) {
      generation = 0;
      windows.clear();
      resetGridState(); // Clear grid states for new game
      lastStatusLine = '';
      lastContentGeneration = -1; // Reset content generation tracker
      inputEnabled = false;
      inputType = 'line';
      inputWindowId = null;
      autosaveCounter = 0; // Reset counter for new game session
      lastCharModePlainText = '';
      previousInputType = null;
      justExitedCharMode = false;
      resetBootstrapState(); // Clear bootstrap flags for new game session
      resetWatchdogState(); // Clear any stale watchdog timer + repair flag

      // Update input UI immediately
      updateInputVisibility();

      // Store the accept callback - we'll use it to send input later
      acceptCallback = options.accept;

      // Clear display and hide windows initially
      const statusBar = document.getElementById('statusBar');
      const upperWindow = document.getElementById('upperWindow');
      const lowerWindow = document.getElementById('lowerWindow');

      if (statusBar) {
        statusBar.innerHTML = '';
        statusBar.style.display = 'none'; // Start hidden
      }
      if (upperWindow) {
        upperWindow.innerHTML = '';
        upperWindow.style.display = 'none'; // Start hidden
      }
      if (lowerWindow) {
        // Extract command line first (it might be nested)
        const commandLine = document.getElementById('commandLine');

        // Clear everything
        lowerWindow.innerHTML = '';

        // Re-append command line
        if (commandLine) {
          lowerWindow.appendChild(commandLine);
        }
      }

      // Set up window resize listener
      window.addEventListener('resize', handleResize);

      // Tell Glk we're ready - this will trigger VM.start()
      if (acceptCallback) {
        const metricsObj = calculateMetrics();

        acceptCallback({
          type: 'init',
          gen: generation,
          metrics: metricsObj
        });
      }
    },

    /**
     * Called by Glk when the game has output
     * This is where VoxGlk renders the game data to beautiful HTML
     */
    update: async function(arg) {
      try {
        // Track generation (Glk uses this to prevent old input)
        // Always update generation from Glk - this is the current turn number
        if (arg.gen !== undefined) {
          generation = arg.gen;
          // CRITICAL: Update lastContentGeneration IMMEDIATELY to prevent clearing on rapid updates (resize)
          // This must happen BEFORE the clearing check below, not after rendering
          lastContentGeneration = generation;
          // Clear watchdog since VM responded with a new generation
          clearWatchdog();

          // Location check moved to after render (needs statusBarText)
        }

        // Determine input mode early (needed for grid state processing)
        if (arg.input) {
          const inputTypes = arg.input.map(i => i.type);
          inputType = inputTypes.includes('char') ? 'char' : 'line';
          inputEnabled = true;
          if (arg.input.length > 0 && arg.input[0].id !== undefined) {
            inputWindowId = arg.input[0].id;
          }

          // Update input UI immediately (don't wait for 500ms interval)
          updateInputVisibility();
        }

        // Suppress output after bootstrap input (the "I beg your pardon" response)
        if (checkSuppressUpdate(inputType)) return;

        // Process window definitions
        if (arg.windows) {
          arg.windows.forEach(win => {
            windows.set(win.id, win);
          });
        }

        // Auto-restore AFTER first update completes (VM is fully running)
        await handleAutoRestore(generation, () => acceptCallback);

        // Use VoxGlk renderer to convert to frotz HTML
        if (arg.content) {
          processGridUpdates(arg.content, windows, inputType, isJustRestored());

          const { statusBarHTML, statusBarText, upperWindowHTML, upperWindowText, mainWindowHTML, plainText } = renderUpdate(arg, windows);

          // Check if upper window was explicitly mentioned in this update
          const hasUpperWindowContent = arg.content.some(c => {
            const win = windows.get(c.id);
            return win && win.type === 'grid' && c.lines && c.lines.length > 1;
          });


          // Track status bar changes for TTS (but don't auto-clear screen)
          // Compare plain text so whitespace/attribute changes don't trigger false re-narration
          const statusBarChanged = statusBarText !== lastStatusLine;

          // Only clear screen when game explicitly requests it
          const shouldClearScreen = arg.content.some(c => c.clear);

          if (shouldClearScreen) {
            clearGameOutput();
          }

          // Render status bar (1 line only)
          const statusBarEl = document.getElementById('statusBar');
          if (statusBarHTML) {
            if (statusBarEl) {
              statusBarEl.innerHTML = statusBarHTML;
              statusBarEl.style.display = ''; // Show status bar
              // Store reference for chunking
              window.currentStatusBarElement = statusBarEl;
            }
            lastStatusLine = statusBarText;
          }
          // NOTE: Don't clear status bar if not in update - preserve it
          // The game doesn't send status bar on every update

          // Render upper window (multi-line quotes, maps, etc.)
          const upperWindowEl = document.getElementById('upperWindow');

          // Check for meaningful main content (not just blank-line-spacer divs)
          let hasMainContent = false;
          if (mainWindowHTML && mainWindowHTML.trim()) {
            // Extract text content to see if there's actual text (not just blank spacers)
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = mainWindowHTML;
            const textContent = tempDiv.textContent.trim();
            hasMainContent = textContent.length > 0;
          }

          // Check if grid window specifically requested a clear
          const upperWindowClear = arg.content.some(c => {
            const win = windows.get(c.id);
            return win && win.type === 'grid' && c.lines && c.lines.length > 1 && c.clear;
          });

          if (hasUpperWindowContent) {
            // Upper window was mentioned in this update
            if (upperWindowHTML && upperWindowEl) {
              // Only update if content changed OR if clear was requested
              const existingContent = upperWindowEl.getAttribute('data-last-content') || '';
              const contentChanged = existingContent !== upperWindowHTML;

              if (upperWindowClear || contentChanged) {
                upperWindowEl.innerHTML = upperWindowHTML;
                upperWindowEl.setAttribute('data-last-content', upperWindowHTML);
              }
              upperWindowEl.style.display = ''; // Show upper window

            } else if (upperWindowEl) {
              // Explicitly clear upper window only if clear flag set or content is explicitly empty
              if (upperWindowClear || !upperWindowHTML) {
                upperWindowEl.innerHTML = '';
                upperWindowEl.removeAttribute('data-last-content');
                upperWindowEl.style.display = 'none';
              }
            }
          } else if (shouldClearScreen && upperWindowEl) {
            // Game requested screen clear - clear upper window too
            upperWindowEl.innerHTML = '';
            upperWindowEl.removeAttribute('data-last-content');
            upperWindowEl.style.display = 'none';
          } else if (hasMainContent && upperWindowEl && !hasUpperWindowContent) {
            // New main content arrived without upper window update - clear stale upper window
            upperWindowEl.innerHTML = '';
            upperWindowEl.removeAttribute('data-last-content');
            upperWindowEl.style.display = 'none';
          }
          // NOTE: If no main content and upper window wasn't mentioned, preserve existing content (resize responses)

          // Clear stale lower window content when upper window updates without main content
          // This prevents old transcript from being re-narrated when switching to upper-window-only scenes
          // IMPORTANT: Only clear if generation changed (new turn) - prevents clearing during resize/arrange
          const generationChanged = generation !== lastContentGeneration;

          if (hasUpperWindowContent && !hasMainContent && generationChanged) {
            const lowerWindowEl = document.getElementById('lowerWindow');
            if (lowerWindowEl) {
              // Remove all game-text elements (but preserve command line)
              const gameTexts = lowerWindowEl.querySelectorAll('.game-text');
              gameTexts.forEach(el => el.remove());
              // Clear currentGameTextElement so ensureChunksReady won't use stale content
              state.currentGameTextElement = null;
              // CRITICAL: Invalidate old chunks so they don't get re-narrated
              state.chunksValid = false;
              state.narrationChunks = [];
              state.currentChunkIndex = 0;
            }
          }

          // Render lower window (main scrolling text)
          if (mainWindowHTML && mainWindowHTML.trim()) {
            addGameText(mainWindowHTML, false); // false = not a command
          }

          // Send plain text to TTS callback
          // IMPORTANT: Only include status bar if it CHANGED (don't re-read same status)
          let textForTTS = '';

          // EXPERIMENT: Skip reading status bar automatically
          // Set to true to include status bar in narration, false to skip
          const READ_STATUS_BAR = false;

          if (READ_STATUS_BAR && statusBarText && statusBarText.trim() && statusBarChanged) {
            textForTTS = statusBarText + '\n\n';
            // Mark that status bar should be included in chunks
            window.includeStatusBarInChunks = true;
          } else {
            // Don't include status bar in chunks
            window.includeStatusBarInChunks = false;
          }
          // Add upper window text if present
          if (upperWindowText && upperWindowText.trim()) {
            textForTTS += upperWindowText + '\n\n';
          }
          if (plainText.trim()) {
            textForTTS += plainText;
          }


          if (textForTTS.trim() && onTextOutput) {
            // In char mode (press any key screens), only narrate changed content
            // This prevents re-reading entire menus/pages when only a small part changes
            let finalTextForTTS = textForTTS;

            if (inputType === 'char') {
              // Diff against previous text to find what changed
              const newLines = textForTTS.split('\n');
              const oldLines = lastCharModePlainText.split('\n');

              // Find the first line that differs
              let firstDiff = 0;
              while (firstDiff < Math.min(newLines.length, oldLines.length) &&
                     newLines[firstDiff] === oldLines[firstDiff]) {
                firstDiff++;
              }

              // Find the last line that differs (working backwards)
              let lastDiffNew = newLines.length - 1;
              let lastDiffOld = oldLines.length - 1;
              while (lastDiffNew >= firstDiff && lastDiffOld >= firstDiff &&
                     newLines[lastDiffNew] === oldLines[lastDiffOld]) {
                lastDiffNew--;
                lastDiffOld--;
              }

              // Extract only the changed portion
              if (firstDiff <= lastDiffNew) {
                const changedLines = newLines.slice(firstDiff, lastDiffNew + 1);
                finalTextForTTS = changedLines.join('\n');
              } else {
                // No changes detected - don't narrate anything
                finalTextForTTS = '';
              }

              // Store current text for next comparison
              lastCharModePlainText = textForTTS;
            } else {
              // Line mode - reset tracking
              // Also clear when transitioning away from char mode to prevent stale diffs
              lastCharModePlainText = '';
            }

            if (finalTextForTTS.trim()) {
              onTextOutput(finalTextForTTS);
            }
          }

          // Determine current turn's input type BEFORE checking location
          // (checkLocationChange needs the NEW input type, not the old one)
          let currentTurnInputType = null;
          if (arg.input) {
            const inputTypes = arg.input.map(i => i.type);
            currentTurnInputType = inputTypes.includes('char') ? 'char' : 'line';
          }

          // Check for location change (for auto-mapping)
          // Pass status bar text for name-based location tracking
          // Pass current turn's input type (not previous turn's)
          checkLocationChange(statusBarText, generation, currentTurnInputType);
        }

        // Handle special input requests (file dialogs for save/restore)
        if (arg.specialinput) {

          if (arg.specialinput.type === 'fileref_prompt') {
            const isRestore = arg.specialinput.filemode === 'read';
            const isSave = arg.specialinput.filemode === 'write';
            const gameid = arg.specialinput.gameid;


            // For now, use Dialog.open which will show our file picker
            // Dialog.open(tosave, usage, gameid, callback)
            const writable = !isRestore; // false for restore (read), true for save (write)

            Dialog.open(writable, arg.specialinput.filetype, gameid, (fileref) => {
              // Send response back to Glk
              if (acceptCallback) {
                acceptCallback({
                  type: 'specialresponse',
                  gen: generation,
                  response: 'fileref_prompt',
                  value: fileref
                });
              }
            });

            // Return early - don't process other input until dialog is resolved
            return;
          }
        }

        // Handle input requests
        if (arg.input) {
          // Detect transition from char to line mode (exiting menus/press-any-key screens)
          // VM state needs to settle - one line command must be processed before saving
          if (previousInputType === 'char' && inputType === 'line') {
            justExitedCharMode = true;
          } else if (inputType === 'line' && justExitedCharMode) {
            // Clear flag after one line input is processed
            justExitedCharMode = false;
          }
          previousInputType = inputType;

          // Capture the intro input type (first request at gen 1) for bootstrap after restore
          captureIntroInputType(generation, inputType);


          // Note: Command line visibility is handled automatically by keyboard.js polling

          // Only autosave on line input (not char input)
          const shouldAutosaveThisTurn = inputType === 'line';

          // Skip first 3 autosaves (title screen interactions)
          // This counter resets on every page load (including restore)
          const shouldSkipFirstN = autosaveCounter < 3;
          if (shouldSkipFirstN && shouldAutosaveThisTurn) {
            autosaveCounter++;
          }

          // Auto-save after each turn (only on line input, skip first 3)
          // Skip autosave if we just exited char mode (VM state needs to settle)
          // Check global auto-save setting
          const autosaveEnabled = localStorage.getItem('iftalk_autosaveEnabled') !== 'false';
          if (autosaveEnabled && !skipFirstAutosave && shouldAutosaveThisTurn && !shouldSkipFirstN && !justExitedCharMode) {
            setTimeout(async () => {
              try {
                const { autoSave } = await import('./save-manager.js');
                await autoSave();
              } catch (error) {
                // Auto-save failed silently
              }
            }, 100);
          } else if (skipFirstAutosave) {
            skipFirstAutosave = false; // Only skip once
          }
        } else {
        }

        // Clear justRestored flag after processing first update
        clearJustRestored();

      } catch (error) {
        // Error in update() - silently ignored
      }
    },

    /**
     * Called by ZVM on fatal errors
     */
    error: function(msg) {
      alert('Game Error: ' + msg);
    },

    /**
     * Optional logging
     */
    log: function(msg) {
      // Silent logging - can be enabled for debugging if needed
    },

    /**
     * Get reference to a library (Dialog, etc.)
     */
    getlibrary: function(name) {
      if (name === 'Dialog') {
        return window.Dialog;
      }
      return null;
    },

    /**
     * Save display state (for autosave)
     */
    save_allstate: function() {
      // Save the current display content so it can be restored
      const statusBarEl = document.getElementById('statusBar');
      const upperWindowEl = document.getElementById('upperWindow');
      const lowerWindowEl = document.getElementById('lowerWindow');

      return {
        generation: generation,
        inputWindowId: inputWindowId,
        displayState: {
          statusBarHTML: statusBarEl?.innerHTML || '',
          upperWindowHTML: upperWindowEl?.innerHTML || '',
          lowerWindowHTML: lowerWindowEl?.innerHTML || ''
        }
      };
    },

    /**
     * Restore VoxGlk state after VM restore
     */
    restore_state: function(savedGeneration, savedInputWindowId) {
      generation = savedGeneration;
      inputWindowId = savedInputWindowId;
      inputEnabled = true;
      inputType = 'line';

      // Update input UI immediately
      updateInputVisibility();
    },

    /**
     * Display a warning message
     */
    warning: function(msg) {
      // Warning silently ignored
    }
  };

  // Store instance globally for access from save-manager
  window._voxglkInstance = voxglk;

  // Store module functions globally for access from auto-mapper
  window._voxglkModule = {
    getInputType,
    isInputEnabled,
    getGeneration
  };

  return voxglk;
}

/**
 * Send input to the game
 * Call this when the user submits a command
 *
 * @param {string} text - User input text
 * @param {string} type - Input type ('line' or 'char')
 */
export function sendInput(text, type = 'line') {
  if (!acceptCallback) {
    return;
  }

  // Build input event based on type
  let inputEvent;

  if (type === 'char') {
    // Character input: send character as string (matching GlkOte format)
    // GlkOte sends value as string: "R" for regular chars, "left"/"return"/etc for special keys
    // text can be either a string (regular character) or a special key name
    let charValue;
    if (typeof text === 'string' && text.length === 1) {
      // Regular single character - send as-is
      charValue = text;
    } else if (typeof text === 'string') {
      // Special key name like "left", "return", "escape" - send as-is
      charValue = text;
    } else {
      // Number passed - convert to character (for backwards compatibility)
      charValue = String.fromCharCode(text);
    }
    inputEvent = {
      type: 'char',
      gen: generation,
      window: inputWindowId,
      value: charValue
    };
  } else {
    // Line input: send text string
    inputEvent = {
      type: 'line',
      gen: generation,
      window: inputWindowId,
      value: text,
      terminator: 'enter'
    };
  }


  // Store generation before sending (to detect synchronous game response)
  const beforeGeneration = generation;

  // Start watchdog BEFORE sending input (Glk may call update synchronously)
  // Don't await - we want the watchdog to start immediately without blocking
  startWatchdog(generation, () => generation, isBootstrapping()).catch(err => {
    // Watchdog start failed silently
  });

  // Clear line 0 of the status bar window before sending input.
  // Some games (e.g. Theatre) reuse a multi-line TextGrid as a 1-line status
  // bar and never call erase_window(1), so stale characters from previous
  // longer location names persist in glkapi's char array.  We cannot use
  // glk_window_clear here because (a) it clears ALL lines of the window and
  // (b) it throws if a line_request is pending.  Clearing only line 0 and
  // marking it dirty is sufficient: glkapi sends the full char array for every
  // dirty line, so the renderer will see a clean slate.
  if (type === 'line') {
    try {
      const win = window.zvmInstance?.statuswin || window.zvmInstance?.upperwin;
      if (win && win.lines && win.lines[0]) {
        const lineobj = win.lines[0];
        lineobj.dirty = true;
        for (let cx = 0; cx < win.gridwidth; cx++) {
          lineobj.chars[cx] = ' ';
        }
      }
    } catch (e) { /* ignore — e.g. window not yet created */ }
  }

  // Send the input event to Glk
  if (!acceptCallback) return;
  acceptCallback(inputEvent);

  // Only disable input if the game hasn't already responded synchronously
  // If generation advanced, the game already re-enabled input in update()
  if (generation === beforeGeneration) {
    inputEnabled = false;
  }
}


/**
 * Get current generation (for debugging)
 */
export function getGeneration() {
  return generation;
}

/**
 * Check if input is currently enabled
 */
export function isInputEnabled() {
  return inputEnabled;
}

/**
 * Get current input type ('line' or 'char')
 */
export function getInputType() {
  return inputType;
}

/**
 * Get current input window ID
 */
export function getInputWindowId() {
  return inputWindowId;
}

/**
 * Check if it's safe to save (VM state has settled after mode transitions)
 * Returns false if we just exited char mode and VM needs one command to settle
 */
export function isSafeToSave() {
  return !justExitedCharMode;
}

/**
 * Set flag to skip first autosave (when restoring from saved state)
 */
export function setSkipFirstAutosave(skip) {
  skipFirstAutosave = skip;
}

/**
 * Get VoxGlk interface for calling restore_state
 */
export function getVoxGlk() {
  return window._voxglkInstance;
}

/**
 * Update lastStatusLine after a manual restore
 * This ensures voxglk tracks the restored status bar correctly
 * @param {string} statusHTML - The restored status bar HTML
 */
export function updateLastStatusLine(statusHTML) {
  const tmp = document.createElement('div');
  tmp.innerHTML = statusHTML;
  lastStatusLine = tmp.textContent;
}
