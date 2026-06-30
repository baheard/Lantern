---
title: Multi-map + shared nodes — REMOVED (v1.5.719)
tags: [map-canvas, multi-map, shared-nodes, portals, sharedId, design, removed]
created: 2026-06-29
updated: 2026-06-29
aliases: [portals, share to map, move to map, sharedId, cross-map nodes, multi-map]
---

# Multi-map + shared nodes — REMOVED in v1.5.719

> **STATUS (v1.5.719): the entire multi-map feature is RIPPED OUT.** Not just
> portals (#144) — the whole multi-map layer that predated it back to **v1.5.450**
> (map picker, add/switch/delete maps, the v2 `{maps:{…}}` save wrapper, shared
> nodes, `sharedId`, portals). The map canvas is now **single-map only**. Everything
> below the line is **historical** — recoverable from git before v1.5.719 if ever
> wanted; do not treat it as a description of current code.

## Why removed (the reasoning that settled it)

The decision chain, from the user:
1. **Portals (auto-switch on traversal) were the only non-jarring way to move
   between maps — and they were jarring anyway.** The map changing under your feet
   as you walked through a seam room felt wrong. That's why portals went on hold in
   v1.5.718 (`PORTALS_ENABLED=false`).
2. **Without acceptable auto-traversal, multiple maps can't model a connected
   world** — you're left flipping canvases by hand, which is strictly worse friction
   than one canvas.
3. **The canvas is infinite** — clutter is solved by spreading out + zoom, so
   "map-as-organization" is beaten by the single canvas too.
4. → No surviving sweet spot. Multi-map's whole value proposition collapses, so it
   goes entirely, not just the portal layer.

## What "rip it out" touched (v1.5.719)

- **map-config.js** — dropped `PORTALS_ENABLED`, and `activeMapId`/`mapOrder` from `mapState`.
- **map-canvas.js** — deleted the whole MAP MANAGEMENT + MAP PICKER block
  (`switchMap`/`addMap`/`deleteMap`/`renameCurrentMap`/`generateMapId`/picker UI),
  all shared-node/portal fns (`shareNodeToMap`, `syncSharedNode`, `recomputeSharedIds`,
  `computePortalExits`, `findPortalTargetMap`, `switchToSharedNodeMap`,
  `handleSendSelectionToNewMap`, `generateSharedId`), the new-area-hint buffering
  (`showNewAreaHint`/`_pendingNewAreaHint`), and the portal auto-switch block in
  `handleLocationChange`. The map title is now a static `#mapNameText` label ("Game Map").
- **map-sheet.js** — removed "Share to map"/"Go to other map" buttons, the share
  submenu, `toggleShareMapMenu`, the `syncSharedNode` calls in edit handlers, and the
  `wasShared`/`recomputeSharedIds` branch in delete (now a plain delete).
- **map-render.js** — removed the amber shared-node ring + cross-map exit spokes.
- **CSS** — removed `.map-name-btn`/`.map-chevron`/`.map-picker-*`, added `.map-name-label`.
- **Kept:** the "portal" *edge type* (`getConnectionTypeFromCommand` → dotted edges for
  `in`/`out`/`enter`/`exit`/`go to`, `tryUpgradePortalEdge`, the "Portal" legend item).
  That's core single-map auto-mapping, unrelated to multi-map. Don't confuse the two.

## Save-format compatibility (the one real gotcha of the removal)

Existing saves (localStorage + Drive-embedded) store the **v2 `{v:2, activeMapId,
mapOrder, maps:{…}}`** wrapper. The removal keeps the **read** path: `loadMapForGame`,
`exportMapState`, `importMapState`, and the standalone `syncMapFromAutoMapper` all
**collapse v2 → the active (or first) map** and otherwise treat data as flat. New
writes are **flat single-map** (`saveMapImmediately` just stores `extractMapData()`),
so a v2 save migrates to flat in passing. **Extra maps in an old v2 save are silently
dropped** on load — acceptable given the feature is gone. `save-manager.js` already
read both shapes (`mc.v===2 ? mc.maps[…].currentNodeId : mc.currentNodeId`), so it
needed no change.

---

# Historical: how multi-map + shared nodes worked (pre-v1.5.719)

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
