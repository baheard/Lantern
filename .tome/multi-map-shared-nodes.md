---
title: Multi-map shared nodes (portal groundwork)
tags: [map-canvas, multi-map, shared-nodes, portals, sharedId, design]
created: 2026-06-29
updated: 2026-06-29
aliases: [portals, share to map, move to map, sharedId, cross-map nodes]
---

# Multi-map shared nodes (portal groundwork)

Issue #144. The auto-mapper supports multiple maps per game, but they were fully
**siloed** — independent blobs in `_allMapsData[mapId]` (each its own `nodes`/`edges`
arrays), node identity per-map, no cross-map anything. This entry covers the
share/portal model layered on top in v1.5.706–710.

## Core architecture decision: additive `sharedId`, NOT a global node store

The clean conceptual model is "a node's **identity/content** is global; its
**placement** (x/y, edges) is per-map." The *pure* implementation would be one
global node table + per-map placement rows — but that's a full rewrite of the v2
save format. **Rejected.** Instead, implemented additively to respect the existing
siloed-blob persistence:

- A shared node keeps a **separate node object in each map it lives on** (so per-map
  x/y and per-map edges keep working unchanged), and the copies are **linked by a
  generated `node.sharedId`** (`shared_<ts>_<rand>`).
- **Content** (`SHARED_SYNC_FIELDS = name, type, notes, isSmall, isEdited`) is kept in
  lockstep by `syncSharedNode()`, called from the sheet's edit handlers — it reaches
  into the *other* maps' stashed arrays and copies those fields. **x/y and edges are
  deliberately never synced** (placement is per-map).

A "portal" is therefore **not a node type — it's a shared node with a flag** (the flag
+ auto-switch behavior is phase 3, not built yet).

## The model the user landed on: Share + smart-delete (no Move)

v1.5.707 briefly shipped "Move to map"; it was **dropped** because move ≡
share-then-delete-here, so the two ops collapse to two primitives:

- **Share to map** (`shareNodeToMap`): node stays on source AND gains a linked copy on
  target. If the target already has the location, **link** (set matching sharedId)
  instead of duplicating — the "merge warning" case collapses to a no-op when ids match.
- **Smart delete** (`handleNodeDelete`): delete only ever touches the *active* map's
  collections, so a shared node automatically survives on the other maps. The only
  additions were (a) hint wording ("Removed … from this map (still on other maps)" vs
  "Deleted …") keyed off `wasShared`, and (b) a `recomputeSharedIds()` call after.

## `mapState.sharedNodeIds` drives both the indicator and "shared-ness"

`recomputeSharedIds()` counts every `sharedId` across the live active map +
`_allMapsData` (skipping the active map's stale stashed copy, counting it live) and
stores the set of ids present on **≥2 maps**. This is the single source of truth for:
- the **dashed amber ring** in `map-render.drawNodes` (a node only reads as shared while
  ≥2 maps carry its sharedId), and
- **demotion**: deleting the second-to-last copy drops the count below 2, so the
  survivor silently becomes an ordinary node again.

Recomputed in `applyMapData` (covers switch/add/load) and after share/delete.

## Gotcha: `sharedId` must survive the save-file round-trip

localStorage (`saveMapImmediately`) stores the **full** node objects, so sharedId
persists there for free. But the **game-save embedding** path (Drive sync / export)
runs nodes through `optimizeMapData` → `expandMapData`, which **whitelist** fields and
would silently drop `sharedId` — breaking every shared link on a cross-device restore.
Both functions were patched to carry `sharedId`. Any future per-node field needs the
same treatment in BOTH spots.

## Send selection to new map — the unifying gesture (v1.5.715)

The feature that makes multi-map worth having, and the one that dissolved the
move-vs-share dilemma: **the user never chooses per node; the geometry of the
selection decides.** In select mode, `#mapSendToMapBtn` (`handleSendSelectionToNewMap`)
sends `mapState.selectedNodes` to a fresh map:
- **Boundary node** = a selected node with an edge to a node *not* in the selection.
  It stays on the source AND the new map (linked by `sharedId`) — i.e. it auto-becomes
  the **portal** between old and new. Interior (non-boundary) selected nodes are removed
  from the source.
- New map gets copies of all selected nodes + the edges among them; the crossing edge
  (boundary↔remaining) stays on the source. Then it switches into the new map.
- Boundary-to-boundary within-selection edges can land on both maps (harmless per-map
  dup) — deliberately not special-cased.
- `snapshotForUndo()` is taken but `switchMap` clears the undo stack, so a send isn't
  undoable — acceptable, reverse manually.

**Portal switch button** (`#nodeSwitchToMapBtn`, `switchToSharedNodeMap`): the node
sheet shows "Go to other map" only for a shared node; jumps the active map to another
map holding it and selects+centers it (cycles when on >2 maps). The amber ring is the
indicator; this button is the navigation.

## Auto-switch on traversal — DONE (v1.5.717)

`handleLocationChange`: when leaving a **portal** node toward a room that isn't on
this map but already exists + is connected on another map the portal spans,
`switchMap` to that map instead of duplicating the room/edge here
(`findPortalTargetMap`). Bidirectional. **Critical ordering gotcha:** this check
runs BEFORE the `deletedNodes` guard — a room sent to another map is marked
`deleted` on the source, so if the guard ran first it would `return` and the
auto-switch never fires. (That was the bug in the first cut.)

**Cross-map exit indicator** (`computePortalExits`, folded into
`recomputeSharedIds`): for each active-map portal, finds headings that have an
edge on another map but not here, stashes them transiently on the node as
`_portalExits`; `map-render` draws dashed-amber spokes so the jump is predictable.

This effectively also satisfies the old "which map am I on?" rule — after crossing
a portal you're on the destination map, so newly-discovered rooms attach there.
#144 phases 1–3 are complete; the only thing not built is a portal *toggle* to
manually designate/undesignate a shared node as a portal (portals are currently
implicit = any shared node).

See also [[automap-two-build-paths]], [[automap-substate-node-collapse]],
[[map-undo-snapshots]].
