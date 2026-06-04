---
title: Automap must never override a user edit
tags: [map-canvas, auto-mapper, invariant, architecture]
created: 2026-06-03
updated: 2026-06-03
aliases: [isEdited, protectedEdges, deletedEdges, user-edit protection, manual override, map edit invariant]
---

# Hard invariant: auto-mapping can do anything *except* override a user edit

Once the user has touched a node or edge — moved it, renamed it, changed its
connection type/direction, deleted it — future navigation must **never** undo or
re-tweak that change via auto-mapping. The auto-mapper is free to add new
nodes/edges and adjust *untouched* ones; it is not free to fight the user.

This is a first-class design rule, not an incidental behavior. Treat any
auto-map code path that writes to an existing node/edge as suspect until it
proves it is guarding against user edits.

## The mechanism (already in place — extend it, don't reinvent)

Three pieces of state on `mapState` encode "the user touched this":

- **`edge.isEdited` / `node.isEdited`** — set `true` whenever the user changes a
  property (type picker handler in `map-sheet.js` sets `edge.isEdited = true`;
  same for direction edits going forward). `node.isManual` plays the same role
  for nodes the user created/positioned.
- **`mapState.protectedEdges` / `protectedNodes`** (Sets of keys) — "do not
  recreate or auto-modify." Edge creation is skipped when the key is in
  `protectedEdges` (`handleLocationChange` ~map-canvas.js:817). Auto-created
  edges are added to it immediately on creation.
- **`mapState.deletedEdges` / `deletedNodes`** — "the user deleted this; do not
  resurrect it." Creation paths check these before re-adding.

Both serialize (see `loadMapForGame`/save) so the protection survives reload.

## Where it's enforced today

- `tryUpgradePortalEdge` guards **every** mutation behind `!edge.isEdited`
  (portal→cardinal upgrade and the reverse-edge upgrade both check it).
- Node repositioning in the same function is guarded by `!toNode.isManual` /
  `!fromNode.isManual`.
- Edge creation skips on `protectedEdges` / `deletedEdges` / already-exists.

## Where new code must honor it

Any new auto-map step that writes to existing state has to add the same guard.
Concretely for the **bent-path** feature (non-reciprocal back-and-forth, e.g.
Anchorhead Churchyard `se` ↔ Behind the Church `sw`): the detection step that
writes `edge.reverseCommand` must check `!edge.isEdited` first, and a manual
direction edit in the connections list must set `isEdited = true` +
`protectedEdges.add(key)` — exactly like the existing type-picker handler.

And remember [[automap-two-build-paths]]: the guard has to exist in **both**
`handleLocationChange` (live) and `syncFromAutoMapper` (replay), or it'll hold
only depending on when the user opened the map.

See also [[map-undo-snapshots]] (auto-mapper intentionally sits outside the
undo-snapshot system, a related "auto-mapper mutates state others don't expect"
hazard).
