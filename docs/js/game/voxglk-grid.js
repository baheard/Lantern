/**
 * VoxGlk Grid State
 *
 * Reconstructs full grid-window content from partial Glk updates, mirroring
 * GlkOte/Parchment's grid model: "modify the given lines and leave the rest
 * alone". A grid window is a persistent buffer of lines; each update touches
 * only the line(s) the game actually rewrote, and every other line keeps its
 * previous content.
 *
 * Without this, rendering the raw delta loses lines the game didn't repaint
 * this turn. The motivating case is Curses, whose status window is two lines
 * (room name on line 0, region/turns/date on line 1): on a turn that doesn't
 * change rooms (a refused move, a `look`, …) it repaints ONLY line 1, so the
 * delta carries no line 0 and the room name would vanish — getCurrentLocation()
 * then fell through to the region string "(in Meldrew Hall)" and the
 * auto-mapper recorded a phantom room. See .tome/grid-window-persistent-state.md
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
 * True if a grid line object carries no visible text. Handles both the flat
 * [style, text, style, text, …] encoding and arrays of run objects/strings.
 */
function isBlankLine(lineObj) {
  if (!lineObj || !Array.isArray(lineObj.content)) return true;
  const runs = lineObj.content;
  let text = '';
  if (typeof runs[0] === 'string') {
    for (let i = 1; i < runs.length; i += 2) text += runs[i] || '';
  } else {
    runs.forEach(r => {
      if (typeof r === 'string') text += r;
      else if (Array.isArray(r)) text += r[1] || '';
      else if (r && r.text) text += r.text;
    });
  }
  return text.trim() === '';
}

/**
 * Process grid window updates and maintain full state for partial updates.
 *
 * Mutates each matching content entry's `c.lines` in place to replace the
 * partial update with a fully-reconstructed list covering every line up to
 * the highest non-blank one. Applies in both line and char mode.
 *
 * @param {Array}   content       - arg.content array from the Glk update
 * @param {Map}     windows       - Map<id, windowObj> from voxglk state
 * @param {string}  inputType     - current input type ('line', 'char', or null); unused
 * @param {boolean} justRestored  - true immediately after a save restore
 */
export function processGridUpdates(content, windows, inputType, justRestored) {
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

    // Merge this update's (possibly partial) lines into the retained state.
    c.lines.forEach(lineObj => {
      const lineNum = lineObj.line !== undefined ? lineObj.line : 0;
      gridState.set(lineNum, lineObj);
    });

    // Rebuild the full window from retained state, in BOTH line and char mode,
    // so a partial status redraw keeps its untouched lines (the Curses case).
    // Bound by the highest NON-BLANK line so a window taller than its used
    // content — or one left tall by an earlier menu — doesn't render as a stack
    // of empty rows. A single-line status window reconstructs to exactly the
    // one line it sent, so ordinary games are unaffected.
    let maxLine = -1;
    for (const [lineNum, lineObj] of gridState) {
      if (lineNum > maxLine && !isBlankLine(lineObj)) maxLine = lineNum;
    }
    if (maxLine < 0) return; // nothing visible — leave the delta untouched

    const fullLines = [];
    for (let i = 0; i <= maxLine; i++) {
      fullLines.push(gridState.has(i) ? gridState.get(i) : { line: i, content: ['normal', ''] });
    }

    c.lines = fullLines;
  });
}
