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

## Deferred — full portal behavior

Still not built (the *automatic* version of the switch above):
2. Traversing a connection whose far node lives on **another** map → **auto-switch maps**
   (today it's a manual button, not triggered by in-game movement).
3. Traversing toward a connection that doesn't exist → create it on the **current** map
   (already today's auto-mapper behavior, preserved).
4. When you create a portal, **that location's map becomes the default** that new nodes
   get added to as you move (resolves the "which map am I on?" ambiguity).

See also [[automap-two-build-paths]], [[automap-substate-node-collapse]],
[[map-undo-snapshots]].
