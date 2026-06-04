---
title: Bent (non-reciprocal) connections — reverseCommand + curved rendering
tags: [map-canvas, auto-mapper, rendering, design]
created: 2026-06-04
updated: 2026-06-04
aliases: [reverseCommand, bent path, non-euclidean exit, curved edge, exits list, connection direction, Churchyard Behind the Church]
---

# Bent paths: one edge carries two headings, rendered as a curve

Some IF rooms connect non-reciprocally: the command to leave A isn't the opposite
of the command to leave B. Anchorhead's canonical case — **Churchyard → Behind the
Church via `se`, but the return is `sw`** (not the reciprocal `nw`). `se`/`sw` aren't
opposites, so a straight center-to-center line lies about both ends' real exits.

## Data model — a single edge, not two

A there-and-back is **one** edge carrying both headings, never two opposing edges:

- `edge.command` — the heading that leaves `from` (Churchyard's `se`). Always known
  (the edge was born from that move).
- `edge.reverseCommand` — the heading that leaves `to` (Behind the Church's `sw`).
  **Unknown until the player actually walks back**, then set by `recordReverseCommand`.
  Until then it's absent → the destination end shows `?` in the Exits list and the
  edge renders straight (reciprocal assumed for drawing, but not asserted as fact).

`recordReverseCommand(fromId, toId, command)` fires when a move retraces an existing
edge in the opposite orientation (it looks up `edges.get(`${toId}-${fromId}`)`), and
records the heading **only** for cardinal↔cardinal connections, and **only** if
`!edge.isEdited` (see [[automap-never-overrides-user-edits]]).

Wired in **both** build paths (the parity rule, [[automap-two-build-paths]]):
- live `handleLocationChange` — in the "edge already exists" else-branch, next to
  `tryUpgradePortalEdge`.
- replay `syncFromAutoMapper` — next to `tryUpgradePortalEdge`, **and** the edge-create
  guard was tightened to skip when the opposite-orientation edge exists
  (`!edges.has(edgeKey) && !edges.has(reverseKey)`). Without that, replay used to create
  a *second* reverse edge that live play never made — a latent parity gap that this
  feature exposed (two edges → two overlapping curves).

`reverseCommand` is persisted: full objects in the localStorage path
(`extractMapData`), and added to the compact save-file path (`optimizeMapData` /
`expandMapData`).

## "Bent" is derived, never stored

`edgeBentDirections(edge)` (map-render.js): an edge is bent iff both `command` and
`reverseCommand` resolve to **cardinal** headings that are **not** opposites. Reciprocal
or single-ended → returns null → straight line. No `isBent` flag to keep in sync.

## Rendering — cubic Bézier anchored at the rim

Cardinal-only (vertical/portal connections have no editable heading). The curve leaves
each node **at its rim along that node's own heading**, not the center:

- start `= from + unit(fromDir) · nodeRadius`, end `= to + unit(toDir) · nodeRadius`
  (radius respects `isSmall`). Anchoring at the center instead makes the curve squirt
  out already-bent from under the circle — the v1.5.475→476 fix.
- control points reach `min(dist·0.45, GRID_SIZE·0.6)` further along each heading →
  a gentle curve, each end tangent to its true exit direction.

## Editing — the Exits list (node sheet)

The old "Connections" list is now **Exits**. Each row gained a cardinal **direction
picker** beside the type picker. Direction shown from *this node's* perspective:
outgoing row → `edge.command`; incoming row → `edge.reverseCommand` (or `?` if unseen).
Editing writes the matching field, sets `isEdited`, and adds to `protectedEdges` — same
protection pattern as the type picker, so auto-mapping can't later clobber a hand-set
heading. Picker only renders for cardinal-type connections.

Shipped v1.5.476.
