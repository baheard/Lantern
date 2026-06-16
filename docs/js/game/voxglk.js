/**
 * VoxGlk - Voice-Enabled Glk Display Engine
 *
 * Custom Glk display layer for Lantern that renders beautiful frotz-style HTML
 * and integrates seamlessly with TTS/voice features.
 */

import { renderUpdate } from './voxglk-renderer.js';
import { processTextForTTS } from '../utils/text-processing.js';
import { addGameText, clearGameOutput } from '../ui/game-output.js';
import { state } from '../core/state.js';
import { checkLocationChange, setSceneBreak } from '../features/auto-mapper.js';
// Imported dynamically to break the cycle:
// voxglk → keyboard-core → commands/index → command-router → game-loader → voxglk
const updateInputVisibility = () => import('../input/keyboard/keyboard-core.js').then(m => m.updateInputVisibility());
import {
  startWatchdog,
  clearWatchdog,
  resetWatchdogState,
} from './voxglk-watchdog.js';
import { processGridUpdates, resetGridState } from './voxglk-grid.js';
import {
  resetBootstrapState,
  isJustRestored,
  clearJustRestored,
  handleAutoRestore,
} from './voxglk-bootstrap.js';

/**
 * Clean PAK/char-mode text for TTS — applies processTextForTTS symbol-stripping then
 * joins lines with periods so TTS pauses naturally between menu items/columns.
 */
function cleanCharModeText(text) {
  const result = text
    .split('\n')
    .map(l => {
      const trimmed = l.trim();
      // Replace large horizontal gaps (PAK column separators) with ". " BEFORE
      // processTextForTTS collapses \s+ → ' ', which would destroy the boundary.
      // Threshold ≥8: menu column gaps are 20+ spaces; article indent is ≤4.
      const withColumnBreaks = trimmed.replace(/ {8,}/g, '. ');
      return processTextForTTS(withColumnBreaks);
    })
    .filter(l => l.length > 0)
    .join('. ')
    .replace(/([.!?])\.\s*/g, '$1 ')
    .trim();
  console.log('[PAK clean] in:', JSON.stringify(text.slice(0, 120)), '→ out:', JSON.stringify(result.slice(0, 120)));
  return result;
}

/**
 * State
 */
const s = {
  // Glk protocol — reset in init()
  generation: 0,
  windows: new Map(),
  acceptCallback: null,

  // TTS callback — set once by createVoxGlk(), NOT reset in init()
  onTextOutput: null,

  // Input state — reset in init(), change per-turn
  inputEnabled: false,
  inputType: null,
  inputWindowId: null,
  previousInputType: null,
  justExitedCharMode: false,

  // Display state — reset in init(), updated per-turn
  lastStatusLine: '',
  lastContentGeneration: -1,
  lastCharModePlainText: '',

  // Autosave counters — reset in init()
  autosaveCounter: 0,
  skipFirstAutosave: false,

  // Browser infrastructure — NOT reset in init() (browser-level debounce)
  resizeTimeout: null,
};

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
  if (!s.acceptCallback) return;

  // Debounce resize events
  if (s.resizeTimeout) {
    clearTimeout(s.resizeTimeout);
  }

  s.resizeTimeout = setTimeout(() => {
    const metrics = calculateMetrics();

    s.acceptCallback({
      type: 'arrange',
      gen: s.generation,
      metrics: metrics
    });

    // Re-fit the upper window grid for the new viewport width
    fitUpperWindow();
  }, 250); // Wait 250ms after resize stops
}

/**
 * Scale multiline upper-window grids (compass, maps) down to fit the available
 * width, preserving their 2D monospace layout. Single-line status bars reflow via
 * CSS instead and are left alone. Deterministic: measures real grid width vs.
 * available width, so it works with any font/zoom without magic factors.
 * See .tome/upper-window-fit.md for the why.
 */
export function fitUpperWindow() {
  const upperEl = document.getElementById('upperWindow');
  if (!upperEl || upperEl.style.display === 'none') return;

  upperEl.querySelectorAll('.grid-status.multiline').forEach(grid => {
    grid.style.fontSize = '';            // reset to natural size before measuring
    const available = grid.clientWidth;  // content width we must fit into
    if (!available) return;
    const natural = grid.scrollWidth;    // intrinsic grid width (cols * 1ch)
    if (natural > available + 1) {
      const base = parseFloat(getComputedStyle(grid).fontSize);
      // Font scaling shrinks 1ch proportionally, so one pass fits exactly.
      grid.style.fontSize = (base * available / natural) + 'px';
    }
  });
}

/**
 * Create VoxGlk display interface
 * This is what Glk will use (passed as options.GlkOte)
 *
 * @param {Function} textOutputCallback - Callback for TTS (receives plain text)
 * @returns {Object} - VoxGlk interface with init(), update(), error() methods
 */
export function createVoxGlk(textOutputCallback) {
  s.onTextOutput = textOutputCallback;

  const voxglk = {
    /**
     * Called by Glk.init() when it's ready
     * Setup display, then call options.accept({type: 'init'}) to start the game
     */
    init: function(options) {
      s.generation = 0;
      s.windows.clear();
      resetGridState(); // Clear grid states for new game
      s.lastStatusLine = '';
      s.lastContentGeneration = -1; // Reset content generation tracker
      s.inputEnabled = false;
      s.inputType = 'line';
      s.inputWindowId = null;
      s.autosaveCounter = 0; // Reset counter for new game session
      s.lastCharModePlainText = '';
      s.previousInputType = null;
      s.justExitedCharMode = false;
      resetBootstrapState(); // Clear bootstrap flags for new game session
      resetWatchdogState(); // Clear any stale watchdog timer + repair flag

      // Update input UI immediately
      updateInputVisibility();

      // Store the accept callback - we'll use it to send input later
      s.acceptCallback = options.accept;

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

      // Re-fit the upper window once the monospace font loads — initial measurement
      // may use a fallback font with a different character width.
      if (document.fonts?.ready) {
        document.fonts.ready.then(fitUpperWindow);
      }

      // Tell Glk we're ready - this will trigger VM.start()
      if (s.acceptCallback) {
        const metricsObj = calculateMetrics();

        s.acceptCallback({
          type: 'init',
          gen: s.generation,
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
          s.generation = arg.gen;
          // CRITICAL: Update lastContentGeneration IMMEDIATELY to prevent clearing on rapid updates (resize)
          // This must happen BEFORE the clearing check below, not after rendering
          s.lastContentGeneration = s.generation;
          // Clear watchdog since VM responded with a new generation
          clearWatchdog();

          // Location check moved to after render (needs statusBarText)
        }

        // Determine input mode early (needed for grid state processing)
        if (arg.input) {
          const inputTypes = arg.input.map(i => i.type);
          s.inputType = inputTypes.includes('char') ? 'char' : 'line';
          state.isCharMode = (s.inputType === 'char');
          s.inputEnabled = true;
          if (arg.input.length > 0 && arg.input[0].id !== undefined) {
            s.inputWindowId = arg.input[0].id;
          }

          // Update input UI immediately (don't wait for 500ms interval)
          updateInputVisibility();
        }

        // Process window definitions
        if (arg.windows) {
          arg.windows.forEach(win => {
            s.windows.set(win.id, win);
          });
        }

        // Auto-restore AFTER first update completes (VM is fully running)
        await handleAutoRestore(s.generation, () => s.acceptCallback);

        // Use VoxGlk renderer to convert to frotz HTML
        if (arg.content) {
          processGridUpdates(arg.content, s.windows, s.inputType, isJustRestored());

          const { statusBarHTML, statusBarText, upperWindowHTML, upperWindowText, mainWindowHTML, plainText } = renderUpdate(arg, s.windows);

          // Check if upper window was explicitly mentioned in this update
          const hasUpperWindowContent = arg.content.some(c => {
            const win = s.windows.get(c.id);
            return win && win.type === 'grid' && c.lines && c.lines.length > 1;
          });


          // Track status bar changes for TTS (but don't auto-clear screen)
          // Compare plain text so whitespace/attribute changes don't trigger false re-narration
          const statusBarChanged = statusBarText !== s.lastStatusLine;

          // Only clear screen when game explicitly requests it
          const shouldClearScreen = arg.content.some(c => c.clear);

          if (shouldClearScreen) {
            clearGameOutput();
            setSceneBreak(); // Next location change is a scene transition, not directional travel
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
            s.lastStatusLine = statusBarText;
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
            const win = s.windows.get(c.id);
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
              fitUpperWindow();                 // Scale grid to fit current width

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
          const generationChanged = s.generation !== s.lastContentGeneration;

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
          if (plainText.trim()) {
            textForTTS += plainText;
          }


          if (textForTTS.trim() && s.onTextOutput) {
            // In char mode (press any key screens), only narrate changed content
            // This prevents re-reading entire menus/pages when only a small part changes
            let finalTextForTTS = textForTTS;

            if (s.inputType === 'char') {
              // Diff against previous text to find what changed.
              // Goal: only narrate what the user needs to hear after a keypress —
              // typically the item the cursor just moved TO, not the one it left.
              const newLines = textForTTS.split('\n');
              const oldLines = s.lastCharModePlainText.split('\n');

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

              if (firstDiff <= lastDiffNew) {
                const changedNew = newLines.slice(firstDiff, lastDiffNew + 1);
                const changedOld = oldLines.slice(firstDiff, lastDiffOld + 1);

                // "Line grew" heuristic — works for any cursor character, not just '>'.
                //
                // When a PAK menu cursor moves:
                //   • The line that GAINED the cursor got longer  → this is where we moved TO
                //   • The line that LOST the cursor got shorter   → this is where we came FROM
                //
                // If both the "from" and "to" sets are present AND we have a 1-for-1 line
                // mapping (same count of changed lines on each side — i.e. the screen layout
                // didn't change, only the cursor position did), narrate only the grown lines.
                //
                // Fall back to narrating everything when:
                //   • The number of changed lines differs (content was added/removed)
                //   • No lines shrank (the change isn't a simple cursor move)
                //   • No lines grew (shouldn't happen, but be safe)
                let toNarrate = changedNew;

                if (changedNew.length === changedOld.length) {
                  const grownLines  = changedNew.filter((l, i) => l.length >  changedOld[i].length);
                  const shrunkLines = changedNew.filter((l, i) => l.length <  changedOld[i].length);

                  // Only apply the filter when we can clearly see a cursor transfer
                  // (some lines grew, some shrank). Otherwise narrate all changed lines.
                  if (grownLines.length > 0 && shrunkLines.length > 0) {
                    toNarrate = grownLines;
                  }
                }

                finalTextForTTS = toNarrate.join('\n');
              } else {
                // No changes detected — don't narrate anything
                finalTextForTTS = '';
              }

              // Store current text for next comparison
              s.lastCharModePlainText = textForTTS;
            } else {
              // Line mode - reset tracking
              // Also clear when transitioning away from char mode to prevent stale diffs
              s.lastCharModePlainText = '';
            }

            if (finalTextForTTS.trim()) {
              if (s.inputType === 'char') {
                const cleaned = cleanCharModeText(finalTextForTTS);
                if (cleaned.trim()) s.onTextOutput(cleaned);
              } else {
                s.onTextOutput(finalTextForTTS);
              }
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
          // Fall back to upperWindowText for games with multi-line upper windows (e.g. Bronze)
          // where the status content renders as a grid instead of the single-line status bar.
          checkLocationChange(statusBarText || upperWindowText, s.generation, currentTurnInputType);
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
              if (s.acceptCallback) {
                s.acceptCallback({
                  type: 'specialresponse',
                  gen: s.generation,
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
          if (s.previousInputType === 'char' && s.inputType === 'line') {
            s.justExitedCharMode = true;
          } else if (s.inputType === 'line' && s.justExitedCharMode) {
            // Clear flag after one line input is processed
            s.justExitedCharMode = false;
          }
          s.previousInputType = s.inputType;

          // Note: Command line visibility is handled automatically by keyboard.js polling

          // Only autosave on line input (not char input)
          const shouldAutosaveThisTurn = s.inputType === 'line';

          // Skip first 3 autosaves (title screen interactions)
          // This counter resets on every page load (including restore)
          const shouldSkipFirstN = s.autosaveCounter < 3;
          if (shouldSkipFirstN && shouldAutosaveThisTurn) {
            s.autosaveCounter++;
          }

          // Auto-save after each turn (only on line input, skip first 3)
          // Skip autosave if we just exited char mode (VM state needs to settle)
          // Check global auto-save setting
          const autosaveEnabled = localStorage.getItem('lantern_autosaveEnabled') !== 'false';
          if (autosaveEnabled && !s.skipFirstAutosave && shouldAutosaveThisTurn && !shouldSkipFirstN && !s.justExitedCharMode) {
            setTimeout(async () => {
              try {
                const { autoSave } = await import('./save-manager.js');
                await autoSave();
              } catch (error) {
                // Auto-save failed silently
              }
            }, 100);
          } else if (s.skipFirstAutosave) {
            s.skipFirstAutosave = false; // Only skip once
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
        generation: s.generation,
        inputWindowId: s.inputWindowId,
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
      s.generation = savedGeneration;
      s.inputWindowId = savedInputWindowId;
      s.inputEnabled = true;
      s.inputType = 'line';

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
  if (!s.acceptCallback) {
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
      gen: s.generation,
      window: s.inputWindowId,
      value: charValue
    };
  } else {
    // Line input: send text string
    inputEvent = {
      type: 'line',
      gen: s.generation,
      window: s.inputWindowId,
      value: text,
      terminator: 'enter'
    };
  }


  // Store generation before sending (to detect synchronous game response)
  const beforeGeneration = s.generation;

  // Start watchdog BEFORE sending input (Glk may call update synchronously)
  // Don't await - we want the watchdog to start immediately without blocking
  startWatchdog(s.generation, () => s.generation, false).catch(err => {
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
  if (!s.acceptCallback) return;
  s.acceptCallback(inputEvent);

  // Only disable input if the game hasn't already responded synchronously
  // If generation advanced, the game already re-enabled input in update()
  if (s.generation === beforeGeneration) {
    s.inputEnabled = false;
  }
}


/**
 * Get current generation (for debugging)
 */
export function getGeneration() {
  return s.generation;
}

/**
 * Check if input is currently enabled
 */
export function isInputEnabled() {
  return s.inputEnabled;
}

/**
 * Get current input type ('line' or 'char')
 */
export function getInputType() {
  return s.inputType;
}

/**
 * Get current input window ID
 */
export function getInputWindowId() {
  return s.inputWindowId;
}

/**
 * Check if it's safe to save (VM state has settled after mode transitions)
 * Returns false if we just exited char mode and VM needs one command to settle
 */
export function isSafeToSave() {
  return !s.justExitedCharMode;
}

/**
 * Set flag to skip first autosave (when restoring from saved state)
 */
export function setSkipFirstAutosave(skip) {
  s.skipFirstAutosave = skip;
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
  s.lastStatusLine = tmp.textContent;
}

/**
 * Return the full current PAK/char-mode screen text, cleaned for TTS.
 * Empty string when not in char mode or no text has been received yet.
 */
export function getCharModeText() {
  return cleanCharModeText(s.lastCharModePlainText);
}

/**
 * Re-narrate the full PAK screen on demand ("read page"/"read all" voice command).
 * Routes the text through onTextOutput (handleGameOutput) to build the split char-mode
 * chunks, then forces playback regardless of autoplay — an explicit read request should
 * always speak, even when autoplay is off.
 */
export async function triggerCharModeNarration(text) {
  if (!s.onTextOutput || !text.trim()) return;
  await s.onTextOutput(text);  // builds split per-line/per-column chunks (char mode)
  state.narrationEnabled = true;
  state.isPaused = false;
  const { speakTextChunked } = await import('../narration/tts-player.js');
  speakTextChunked(null, 0);
}
