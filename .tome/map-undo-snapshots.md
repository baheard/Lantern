---
title: Map Undo/Redo — Snapshot Model
tags: [map-canvas, undo, redo, design, architecture]
created: 2026-05-31
updated: 2026-05-31
aliases: [map undo, map redo, snapshotForUndo, undo stack, redo stack, map canvas undo]
---

# Map Undo/Redo — Snapshot Model

The interactive map canvas undo (the FAB undo button) uses **full-state snapshots**,
not per-operation inverse deltas. Replaced a typed-action system (`{type:'deleteNode',...}`
+ a big `switch` in `performUndo`) in v1.5.430.

## How it works

`snapshotForUndo()` (in `map-canvas.js`) clones the six mutable collections off
`mapState` — `nodes`, `edges`, `protectedNodes`, `protectedEdges`, `deletedNodes`,
`deletedEdges` — plus `selectedNode`, and pushes that onto `mapState.undoStack`
(capped at `MAX_UNDO = 50`). `performUndo()` pops the latest snapshot and swaps the
collections back in wholesale.

Every user edit calls `snapshotForUndo()` **once, before its first mutation**. Undo
is then operation-agnostic: new map operations are undoable for free, with no inverse
logic to write (and no gaps to forget — the old system silently lacked undo for merge,
manual-edge-create, "not a duplicate", and connection-type changes).

## Why snapshots, not deltas

Considered keeping deltas to save memory. Rejected: at real map sizes (~100 nodes /
200 edges) a snapshot is a few KB; 50 of them is well under ~1 MB of JS heap, and
snapshots are **memory-only** — `saveMapForGame`/`saveMapImmediately` serialize only
the named map fields, never `undoStack`, so saves/Drive are unaffected. A delta scheme
would just reinvent the per-operation capture logic we deleted.

## Two non-obvious correctness points

1. **Shallow clone per value is enough.** Node/edge objects have only primitive fields,
   so `new Map(Array.from(m, ([k,v]) => [k, {...v}]))` is sufficient. But it is *required*:
   the live objects are mutated in place (drag sets `node.x`, edit sets `node.name`,
   `promoteToPrimary` rewrites `node.id`), so a Map copy that shared value references
   would let those mutations bleed into the snapshot.

2. **Capture must be lazy-first-change, pushed immediately — never capture-early /
   commit-late.** The old edit undo captured node state at sheet *open* and pushed it at
   sheet *close*. With snapshots that breaks LIFO ordering: while the sheet is open you
   can delete an edge from the connections list, which snapshots at T1; if the edit
   snapshot (captured at T0) is pushed at close (T2), the stack ends up `[editSnap@T0,
   edgeSnap@T1]` with the *older* state on top — undo then bounces the map backward and
   forward incoherently. Fix: edits snapshot lazily on the **first field change** of a
   session (`captureEditSnapshot()` guarded by `editSnapshotTaken`, reset in
   `openNodeSheet`) and push right then; multiple field changes in one session fold into
   that single snapshot so one undo reverts them all. Node drags are similar but use a
   *deferred commit*: `map-handlers.js` captures a snapshot into `pendingMoveSnapshot` on
   the first movement past the 3px threshold (via the `captureUndoSnapshot` callback,
   which does **not** push or clear redo), then on pointer-up calls `commitUndoSnapshot`
   only if the node actually moved. A pure tap, or a drag that returns to its exact
   origin, commits nothing — so it leaves the undo/redo stacks untouched (no no-op entry,
   no spurious redo-clear). This deferred commit is safe from the LIFO problem because a
   drag is one gesture: nothing else snapshots between capture and commit.

## Redo (v1.5.431)

Redo falls out of the snapshot model almost for free via a symmetric `redoStack`,
using shared `captureSnapshot()` / `restoreSnapshot()` helpers:

- `snapshotForUndo()` (new user edit): push current pre-edit state to `undoStack`
  **and clear `redoStack`** — a new edit branches off, so any redo future is invalid.
- `performUndo()`: push current state to `redoStack`, then restore from `undoStack`.
- `performRedo()`: push current state to `undoStack`, then restore from `redoStack`.

Both stacks are capped at `MAX_UNDO` (50) and reset together in `loadMapForGame` /
the per-game reset. The redo FAB (`#mapRedoBtn`, `redo` icon) sits directly below the
undo FAB and shares its CSS (`.map-fab-undo, .map-fab-redo`); `updateUndoButton`
enables/disables both from their stack lengths.

**Auto-mapper is intentionally excluded** from undo/redo: gameplay-driven node/edge
creation never calls `snapshotForUndo`, so the stack only ever holds *manual* map edits.
Making auto-map additions undoable would flood the stack with gameplay entries and
fight the user's mental model. To remove an unwanted auto-mapped node, delete it
manually (which *is* undoable).

## The interleaving hazard (why auto-map must invalidate the stacks)

This is the sharp edge of full-state snapshots, and it is **not** solved by simply
keeping auto-map out of the undo stack. A snapshot freezes the *entire* map; restoring
it reverts everything that changed since — including changes the undo system never
tracked. Concrete bug (v1.5.431 had it):

1. Manual edit → `undoStack = [S0]`, where S0 is the state *before* the edit.
2. Player moves; auto-mapper adds rooms B and C straight into `mapState` (no snapshot).
   `undoStack` is untouched, so S0 still predates B and C.
3. Undo → restores S0 → **B and C silently vanish**, and the save persists the loss.

The undo stacks also persist across `showMap`/`hideMap` (only `loadMapForGame` and the
per-game reset clear them), so the edit-then-play-then-undo sequence is easy to hit.

Fix (v1.5.432): `invalidateUndoHistory()` drops both stacks whenever the auto-mapper
mutates the live map — wired into `handleLocationChange` (the `locationChanged` handler,
fires every move) and the node-add branch of `toggleAutoMap`. It no-ops when the stacks
are already empty, so normal play with no pending edits is free. `syncFromAutoMapper`
needs no call: it runs only inside `loadMapForGame`, after that function has already
reset the stacks. Net mental model: **undo/redo covers your map edits until the next
in-game move, then resets** — never loses auto-mapped rooms.

This is the general law for snapshot-based undo: it is only safe while the snapshotted
collections are the *sole* thing mutating them. Any out-of-band writer (here, the
auto-mapper) must either be snapshotted too or invalidate the history on write.

## Restore-time aliasing

`performUndo` reassigns `mapState.nodes = snapshot.nodes` (etc.) rather than
clear+repopulate. Safe because nothing aliases these containers — every consumer
(render, handlers, save, auto-mapper) reads `mapState.<collection>` by property each
time; no module holds a top-level reference to the Map/Set itself.
