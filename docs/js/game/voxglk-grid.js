/**
 * VoxGlk Grid State
 *
 * Reconstructs full grid-window content from partial Glk updates.
 * Only active in char-mode (press-any-key / menu screens) — in line
 * mode the VM always sends complete status-bar updates so this is
 * unnecessary and would actually break rendering.
 *
 * State (module-scoped, single VoxGlk instance per page):
 *   gridStates — Map<windowId, Map<lineNum, lineObj>> tracking the
 *                full grid state for each window to handle partial updates
 */

let gridStates = new Map();

/**
 * Reset grid state (called from voxglk init for a new game)
 */
export function resetGridState() {
  gridStates.clear();
}

/**
 * Process grid window updates and maintain full state for partial updates.
 *
 * Mutates each matching content entry's `c.lines` in place to replace the
 * partial update with a fully-reconstructed list covering all lines seen
 * so far. Skips processing unless inputType === 'char'.
 *
 * @param {Array}   content       - arg.content array from the Glk update
 * @param {Map}     windows       - Map<id, windowObj> from voxglk state
 * @param {string}  inputType     - current input type ('line', 'char', or null)
 * @param {boolean} justRestored  - true immediately after a save restore
 */
export function processGridUpdates(content, windows, inputType, justRestored) {
  if (inputType !== 'char') return;

  content.forEach(c => {
    const win = windows.get(c.id);
    if (!win || win.type !== 'grid' || !c.lines) return;

    // If we just restored, skip grid state processing entirely —
    // the restored HTML already has the content; preserve it for this update.
    if (justRestored && !c.clear) return;

    // Get or create grid state for this window
    let gridState = gridStates.get(c.id);

    if (c.clear || !gridState) {
      gridState = new Map();
      gridStates.set(c.id, gridState);
    }

    // Apply line updates to grid state
    c.lines.forEach(lineObj => {
      const lineNum = lineObj.line !== undefined ? lineObj.line : 0;
      gridState.set(lineNum, lineObj);
    });

    // Rebuild full content with all lines in order
    const maxLine = Math.max(...Array.from(gridState.keys()));
    const fullLines = [];
    for (let i = 0; i <= maxLine; i++) {
      fullLines.push(gridState.has(i) ? gridState.get(i) : { line: i, content: ['normal', ''] });
    }

    c.lines = fullLines;
  });
}
