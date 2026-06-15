/**
 * VoxGlk Auto-Restore
 *
 * Dispatches the engine-format auto-restore on page load. The VM itself is restored
 * by the engine's do_autorestore during vm.start() (inside Glk.init); this module only
 * triggers the app-side reattachment (display HTML, narration, map) via save-manager,
 * then guards the first post-restore update so grid state doesn't overwrite restored HTML.
 *
 * The legacy Quetzal + bootstrap-kick mechanism (mid-aread resume, 'l' look-seed,
 * bufaddr carry-write, suppress-next-update echo) was retired in Phase 6b — see
 * reference/autorestore-migration-plan.md and .tome/bootstrap-restore-flow.md.
 *
 * State (module-scoped, single VoxGlk instance per page):
 *   justRestored — prevent grid state from overwriting restored HTML on the first update
 */

let justRestored = false;

/**
 * Reset bootstrap state (called from voxglk init for a new game)
 */
export function resetBootstrapState() {
  justRestored = false;
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
 * Checks window.shouldAutoRestore (set by game-loader.js before Glk.init()) and calls
 * the appropriate save-manager load function to reattach app-side state. The VM was
 * already restored by the engine at boot, so no bootstrap "wake" input is sent.
 *
 * @param {number}   generation       - VM generation at the time of the first update (expected 1)
 * @param {Function} getAcceptCallback - Returns the live acceptCallback from voxglk.js (unused)
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
      }
    } catch (error) {
      // Auto-restore failed silently
    }
  }, 100);
}
