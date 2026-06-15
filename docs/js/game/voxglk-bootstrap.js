/**
 * VoxGlk Bootstrap & Auto-Restore
 *
 * Encapsulates the flag lifecycle and sequencing that wakes the Z-machine VM
 * after a save-file restore on page load. The mechanism is delicate — read
 * .tome/bootstrap-restore-flow.md before editing.
 *
 * State (module-scoped, single VoxGlk instance per page):
 *   skipNextUpdateAfterBootstrap — suppress the "I beg your pardon" echo from dummy input
 *   introInputType               — 'line' or 'char', captured at gen:1; used for bootstrap
 *   justRestored                 — prevent grid state from overwriting restored HTML
 */

let skipNextUpdateAfterBootstrap = false;
let introInputType = null;
let justRestored = false;
// The Z-machine memory address we seeded with 'l' for the char bootstrap.
// After restore, glkapi may use a different buffer address than the ZVM reads from.
// voxglk.js writes the player's first real command here to ensure the ZVM sees it.
let seededBufaddr = null;

/**
 * Reset all bootstrap state (called from voxglk init for a new game)
 */
export function resetBootstrapState() {
  skipNextUpdateAfterBootstrap = false;
  introInputType = null;
  justRestored = false;
  seededBufaddr = null;
}

/**
 * Record the Z-machine buffer address we seeded with 'l' for the char bootstrap.
 * Called by save-manager.js after seeding the buffer in performRestore.
 */
export function setSeededBufaddr(addr) {
  seededBufaddr = addr;
}

/**
 * Consume and return the seeded buffer address (one-shot — clears after read).
 * Called by voxglk.js sendInput() to also write the player's first command there.
 */
export function consumeSeededBufaddr() {
  const addr = seededBufaddr;
  seededBufaddr = null;
  return addr;
}

/**
 * Capture the input type from the VM's first request (gen:1).
 * Must be called on every input event in voxglk.update().
 *
 * @param {number} generation     - Current VM generation
 * @param {string} currentInputType - 'line' or 'char'
 */
export function captureIntroInputType(generation, currentInputType) {
  if (generation === 1 && introInputType === null) {
    introInputType = currentInputType;
  }
}

/**
 * Check whether the current update should be suppressed (bootstrap echo suppression).
 * Only clears the flag when suppressing an update that contains a new input request,
 * which indicates the bootstrap echo is fully done. This handles the case where
 * some games (e.g. Anchorhead Z8) fire a separate status-bar-only update before the
 * text-response update — both need to be suppressed.
 * Returns false for char-mode updates even when flagged (char UI must stay in sync).
 *
 * @param {string} currentInputType - 'line' or 'char'
 * @param {boolean} hasInput - true if this update includes a new input request
 * @returns {boolean} true if this update should be skipped
 */
export function checkSuppressUpdate(currentInputType, hasInput) {
  if (!skipNextUpdateAfterBootstrap) return false;
  // Clear the flag only when we suppress the update that requests new player input.
  // Status-bar-only intermediate updates (no input request) leave the flag set so
  // the following text-response update is also suppressed.
  if (hasInput) {
    skipNextUpdateAfterBootstrap = false;
  }
  return currentInputType !== 'char';
}

/**
 * Whether a bootstrap input is in flight (used to suppress watchdog during restore)
 */
export function isBootstrapping() {
  return skipNextUpdateAfterBootstrap;
}

/**
 * Set the suppress flag (used externally if needed)
 */
export function setSkipNextUpdateAfterBootstrap(skip) {
  skipNextUpdateAfterBootstrap = skip;
}

/**
 * Whether a restore just completed (grid state must not overwrite restored HTML)
 */
export function isJustRestored() {
  return justRestored;
}

/**
 * Clear the just-restored guard after the first post-restore update
 */
export function clearJustRestored() {
  justRestored = false;
}

/**
 * Orchestrate auto-restore on the first VM update.
 *
 * Checks window.shouldAutoRestore (set by game-loader.js before Glk.init()),
 * calls the appropriate save-manager function, then schedules a dummy bootstrap
 * input to wake the VM's pending input request. The response to that dummy input
 * is suppressed via skipNextUpdateAfterBootstrap.
 *
 * Ordering: flag → first update → restore-via-save-manager → capture intro type
 *           → send bootstrap → suppress next update.  Do not reorder.
 *
 * @param {number}   generation       - VM generation at the time of the first update (expected 1)
 * @param {Function} getAcceptCallback - Returns the live acceptCallback from voxglk.js
 */
export async function handleAutoRestore(generation, getAcceptCallback) {
  if (!window.shouldAutoRestore) return;

  window.shouldAutoRestore = false;
  const restoreType = window.pendingRestoreType || 'autosave';
  const restoreKey = window.pendingRestoreKey;
  window.pendingRestoreType = null;
  window.pendingRestoreKey = null;

  setTimeout(async () => {
    try {
      let restored;
      if (restoreType === 'quicksave') {
        const { quickLoad } = await import('./save-manager.js');
        restored = await quickLoad();
      } else if (restoreType === 'customsave') {
        const { customLoad } = await import('./save-manager.js');
        restored = await customLoad(restoreKey);
      } else {
        const { autoLoad } = await import('./save-manager.js');
        restored = await autoLoad();
      }

      if (restored) {
        justRestored = true;

        const isManualRestore = (restoreType === 'quicksave' || restoreType === 'customsave');
        // Engine-format autorestore (autorestore-migration-plan.md, Phase 3): the engine
        // already restored the VM during Glk.init and parked it at the correct glk_select.
        // Sending a bootstrap "wake" input here would EXECUTE an extra command against the
        // restored state — so skip the kick entirely for the engine path.
        const shouldSendBootstrap = !window.__engineAutorestoreActive
          && (isManualRestore || generation === 1);

        if (shouldSendBootstrap) {
          setTimeout(() => {
            // Always suppress the bootstrap response
            skipNextUpdateAfterBootstrap = true;

            // CRITICAL: Always send the intro's input type to satisfy glkapi's expectations.
            // After restore_file(), glkapi is still at gen:1 waiting for intro input.
            // We send that input type to "complete" the intro request, then the VM
            // resumes from the restored state and requests the next real input.
            //
            // WARNING: Do NOT send any real words here.  skipNextUpdateAfterBootstrap
            // suppresses the OUTPUT of this input, but the parser still EXECUTES it.
            // Any recognised verb will produce side effects even though the response
            // text is hidden.  "bootstrap wake" is safe because neither word appears
            // in any standard Z-machine dictionary.
            const bootstrapType = introInputType || 'line';
            const acceptCallback = getAcceptCallback();

            if (bootstrapType === 'char') {
              acceptCallback({
                type: 'char',
                gen: 1,
                window: 1,
                // '\x01' (char code 1): glkapi stores this in gli_selectref.field[2],
                // which the restored aread continuation reads as "1 char was entered."
                // save-manager seeds linebuf[0]='l' (look) before the bootstrap fires,
                // so the VM tokenizes "l" → executes "look" (safe, no state change).
                // This avoids the empty-input path that triggers "I beg your pardon?"
                // and puts some parsers (e.g. Anchorhead Z8) into disambiguation mode,
                // which caused the first real player command to always fail.
                value: '\x01'
              });
            } else {
              acceptCallback({
                type: 'line',
                gen: 1,
                window: 1,
                value: 'bootstrap wake',
                terminator: 'enter'
              });
            }
          }, 100);
        }
      }
    } catch (error) {
      // Auto-restore failed silently
    }
  }, 100);
}
