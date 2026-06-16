---
title: Upper-window grid fit — scale monospace to width, don't reflow
tags: [rendering, mobile, css, voxglk, status-bar, design]
created: 2026-06-06
updated: 2026-06-06
aliases: [compass, upper window, grid-status, fitUpperWindow, grid-cols, horizontal scrollbar, Bronze compass, status bar, multiline grid]
---

# Upper-window grid: scale to fit, never reflow

The Z-machine upper window (a TEXT_GRID with height > 1) renders as a CSS grid of
character cells — `.grid-status.multiline`, one `.grid-line` per row, each cell placed
by an inline `grid-column: start/end`. This is a **2D monospace canvas**: Bronze's
status area puts the room name on the left and a compass rose on the right, aligned by
column. The single-line status bar (location/score) is the same machinery with the
`.single-line` class.

## The two failure modes this fixed (issue #117, v1.5.484–485)

1. **Fixed 100ch width → horizontal scrollbar.** The grid used a hardcoded
   `grid-template-columns: repeat(100, 1ch)` ≈ 800px regardless of real content,
   overflowing any viewport < ~800px (e.g. 767px).
2. **Mobile reflow destroyed the compass.** Below the 600px breakpoint the mobile CSS
   collapsed the grid to inline flow (`grid-column: unset; display: inline`) and hid
   whitespace-only spans. For left-aligned text (quotes) that reads fine; for a compass
   the right-side cells lose their column placement and mash into the room name —
   effectively invisible.

## The fix — two layers, applied in order

The squeeze is handled in two stages so **text shrinks only as a last resort**:

**Layer 1 — shrink the empty gaps (CSS grid, the primary mechanism).** A status/compass
line is *left content · big empty gap · right content*. The renderer
(`renderGridWindow`) computes **per-character occupancy** across all lines: a column is
occupied if any line has a non-space char there. It RLE-encodes this into a
`--grid-template` of `repeat(k, 1ch)` (occupied → fixed) and `repeat(k, minmax(0, 1ch))`
(empty → shrinkable) segments — one track per column so the spans' inline `grid-column`
indices still map. CSS grid track sizing then grows the `minmax(0,1ch)` tracks from base
0 up to 1ch as space allows: wide screen → all gaps full 1ch (identical to before),
narrow screen → gaps collapse toward 0 while **every character cell stays 1ch**. Shared
template across all lines ⇒ the compass rose stays vertically aligned.

**THE crucial detail — split the run, don't trust whitespace runs.** ifvms sends a whole
upper-window line as **ONE run** (`["normal", " Central Courtyard … N "]`) — room name,
the entire gap, and compass all in a single styled span at `grid-column: 1 / 81`. That
one span's text has an 80ch min-content that **forces every track open**, so the template
alone does nothing. The fix is in the span-emission loop: walk each run and **split it at
columns whose global occupancy flips**. Occupied segments emit a span with their text
(holding their 1ch tracks); globally-empty segments emit **no text** (just nothing, or an
empty span if reverse-video) so the gap tracks can collapse. This is why splitting on
"whitespace-only runs" (an earlier attempt) failed — the gap isn't its own run.

Validated live (v1.5.488, Bronze @ 436px): one line → 9 spans, template
`repeat(20,1ch) repeat(51,minmax(0,1ch)) …`, and `scrollWidth === clientWidth` at full
font (no scaling) — gaps absorbed the squeeze. Earlier the same content force-scaled to
8.75px. Tradeoff: cols empty in *every* line shrink, so a compass-internal column that
happens to be blank on all rows (e.g. the 2-col gap between center `·` and `E`) also
compresses at very narrow widths — letters stay visible, just closer.

Supporting pieces for Layer 1:
- **`--grid-cols`** = actual content width (`Math.max(maxWidth, 1)`); used as the
  fallback grid `repeat(var(--grid-cols,100),1ch)` if `--grid-template` is absent.
- **Keep the grid on mobile for multiline.** Mobile collapse rules (in BOTH `mobile.css`
  `@media` and `game-output.css` `body.force-mobile`) are scoped to
  `.grid-status.single-line` only. Single-line bars reflow to centered text; multiline
  grids keep their 2D layout at every width. `grid-column` is an **inline** style, so the
  only thing that unsets it is a stylesheet `!important` — exactly what the old collapse
  rules did. Scoping them off multiline lets the inline placement reassert.
  **Don't reintroduce an unscoped `grid-column: unset`.**

**Layer 2 — scale the font (`fitUpperWindow()` in voxglk.js, last resort).** Only fires
when even fully-collapsed gaps can't fit the actual characters (occupied width >
container). Deterministic: resets font, reads `grid.clientWidth` (available) vs
`grid.scrollWidth` (overflow extent); if it overflows, sets
`fontSize = base · available/scrollWidth`. With Layer 1 doing the gap collapse,
`scrollWidth == clientWidth` whenever the line fits by shrinking gaps, so Layer 2 stays
dormant until genuinely needed — which is what fixed "text too small at certain widths"
while still guaranteeing **no horizontal scroll**.

## Why JS for layer 2, not pure CSS

`1ch` depends on font-size, and the fit we'd want is "font-size such that cols·1ch =
container width" — circular in CSS, only resolvable with a hardcoded ~0.6 char-width
ratio (fragile, and wrong if Iosevka fails to load → fallback font). Measuring real
`scrollWidth` sidesteps the ratio entirely.

## Call sites — keep all three

`fitUpperWindow()` runs on: (1) each upper-window render (after `innerHTML` is set in
`update()`), (2) `handleResize`'s debounced callback, (3) `document.fonts.ready` (initial
measure can use the fallback font before Iosevka loads), (4) after restore re-injects
saved upper HTML (`save-manager.js`). Drop any one and you get a stale scale after that
event.

**Restore re-injects saved HTML, not saved state.** The autosave captures
`upperWindow.innerHTML` and restore sets it back verbatim (`save-manager.js` ~575). So a
save made *before* this feature replays its OLD single-span HTML, which can't gap-shrink
(only the font-scale fallback applies) — until the next in-game status redraw regenerates
it through the new renderer, after which the autosave stores new-format HTML and reloads
are correct. Self-heals after one status change; no migration needed. Note Bronze's
status only redraws on area change / rooms-searched change, not every `look`/move.

## Don't reflow quotes either

Other games put quote boxes / titles in a multiline upper window. They now render as a
scaled monospace grid instead of reflowed inline text — slightly smaller on narrow
screens but faithful to the original presentation. This was a deliberate tradeoff: a
reliable rule (never reflow a grid) beat trying to auto-distinguish "compass" from
"quote." See also [[parchment-vs-lantern-engine]] for how the engine models windows.
