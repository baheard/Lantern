---
title: Grid windows are persistent line buffers (status bar / upper window)
tags: [zvm, glkote, status-bar, grid, auto-mapper, rendering, curses, theatre]
created: 2026-06-24
updated: 2026-06-24
aliases: [status-bar-stale-chars, curses-phantom-room, force-clear-line0, in-meldrew-hall]
---

# Grid windows are persistent line buffers

A Glk **text-grid** window (the status bar / upper window) is a *persistent buffer of
lines*. Each game turn the VM marks only the line(s) it actually rewrote as dirty;
glkapi sends just those dirty lines; every other line keeps its previous content.
This is GlkOte's documented model — *"modify the given lines and leave the rest alone"*
(`docs/lib/glkote.js`, the grid branch of `accept_one`). Parchment renders this way;
we must too.

The trap: it is tempting to render the status bar from each update's **delta**
(`arg.content[].lines`) as if it were the whole window. That loses any line the game
didn't repaint this turn.

## The two games that pin the behavior (verified in our own ifvms stack)

- **Curses** — status window is **2 lines**: room name + score on line 0, region +
  turns + date on line 1 (`"(in Meldrew Hall)  Turns: N  June 3rd, 1993"`). On a turn
  that does **not** change rooms (a refused move, a `look`, …) Curses repaints **only
  line 1**. Line 0 is not dirty, so the delta carries no room name.
- **Theatre** — status window is **1 line**, written **full width and centered**
  (`32 spaces + "Manager's Office" + 32 spaces` = 80 cols) every turn. Because it
  overwrites every cell, stale characters are impossible. `gridheight === 1`.

(Parchment's *interpreter* is bocfel/WASM, not ifvms — see
[[parchment-vs-lantern-engine]] — but the GlkOte **display** layer is shared, and the
per-game grid shapes above were confirmed directly in our app via
`window.zvmInstance.statuswin.lines[i].chars`.)

## The bug this caused (fixed v1.5.637)

Symptom: in Curses, do `north, east, east` from the Attic. The third `east` is refused
("The only doorway is back west to the winery") — a normal in-game message, **no error**.
Yet the auto-mapper recorded a phantom room named **`(in Meldrew Hall)`** with a bogus
east edge, and the visible status bar lost the room name.

Chain:
1. `getCurrentLocation()` (auto-mapper.js) reads `statusBarText.split('\n')[0]` — line 0 —
   and strips `Score:`/`Turns:` suffixes.
2. On the no-move turn the renderer only had line 1, so line 0 *was* the region; after
   stripping `Turns: 4…` it returned `(in Meldrew Hall)`.
3. It was made worse by a **force-clear hack** in `voxglk.js sendInput()` that blanked
   line 0 of the status window before every line input (added v1.5.219 to scrub stale
   chars for Theatre). For Theatre that's harmless (it repaints line 0 full-width every
   turn); for Curses it actively erased the room line on every no-move turn.

## The proper fix (v1.5.637)

Make our renderer match GlkOte's persistent-buffer model. **Three files, no heuristics:**

- `docs/js/game/voxglk-grid.js` — `processGridUpdates` keeps a per-window
  `Map<lineNum, lineObj>` and reconstructs the full window in **both** line and char mode
  (was char-mode only). Bound the rebuild by the **highest non-blank line** so a window
  taller than its used content (or left tall by an earlier menu) doesn't render as empty
  rows. A 1-line status window reconstructs to exactly its one line, so ordinary games
  are unaffected.
- `docs/js/game/voxglk.js` — **removed** the force-clear hack. Redundant (the grid
  windows we see write full-width each turn) and harmful (it defeated line-0 retention).
- `tools/play.cjs` — `ingest()` mirrors the same persistent merge, so the headless
  harness / auto-mapper derive location from the full retained grid (it had been
  overwriting `statusRaw` with only the sent lines).

Verify: `node tools/play.cjs curses --status -- n e e` → the third turn stays
`[@ Storage Room ...]` (was `(in Meldrew Hall)`). Theatre / 9:05 / Anchorhead /
Wishbringer / Dreamhold still derive location + phase correctly (single-line status
unaffected).

## Rule of thumb

Never treat a grid-window update as the whole window. Merge it into retained per-line
state and render that. If you think you need to pre-clear a status line to avoid stale
characters, the game is almost certainly writing the full width anyway — confirm in
`zvmInstance.statuswin.lines[i].chars` before adding a workaround. See also
[[headless-replay-harness]], [[hints-system-design]] (location vocabulary),
[[automap-two-build-paths]].
