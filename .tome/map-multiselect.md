---
name: map-multiselect
description: Multi-select design — selectedNodes vs selectedNode, select mode, rect-select, group drag interaction model
metadata:
  type: project
---

## Two separate selection concepts

`mapState.selectedNode` (single string ID) is owned by the auto-mapper and node-sheet system — it tracks which node's sheet is open / which location the player is at. Heavy usage across map-canvas.js and map-sheet.js. **Do not conflate with multi-select.**

`mapState.selectedNodes` (Set of IDs) is the multi-select set. Amber halos. Entirely orthogonal to `selectedNode`.

## Interaction model

**Desktop**: Shift-click toggles a node in/out of `selectedNodes`. Shift-drag on empty canvas draws a rect. Normal drag of a node that's in `selectedNodes` moves the whole group.

**Mobile**: "Select" FAB button (amber when active) enters `isSelectMode`. In select mode, taps toggle nodes, canvas-drag draws a rect. Exiting select mode (Cancel/Escape) leaves `selectedNodes` intact — user can then drag any selected node to move the group without re-entering select mode.

## wasSelectAction flag

Module-level boolean in `map-handlers.js`. Set `true` when pointer-down enters the select path (shift/select-mode). Checked in pointer-up to skip opening the node sheet (a shift-click shouldn't open the sheet; it just toggles). Reset to `false` at the end of pointer-up (and always set fresh at pointer-down).

## Group drag threshold

In `handlePointerMove`: group drag fires when `selectedNodes.size > 1 && selectedNodes.has(dragNode.id)`. If only 1 node is selected, single-node drag applies. The `pendingMoveSnapshot` / `commitUndoSnapshot` pattern captures a single undo snapshot for the whole group move.

## exitAddMode vs Escape

`exitAddMode()` clears `isSelectMode` but does NOT clear `selectedNodes` — allows select-then-cancel-then-drag workflow.

Escape key (`handleKeyDown`) clears both `isSelectMode` and `selectedNodes.clear()` — full cancel.

## Rect-select cursor handling

When `isSelectMode` is active, cursor is `'default'` (not `'grab'`). On pointer-up after rect-select, cursor restores to `'default'` if still in select mode, else `'grab'`.

## Panning in select mode — two-finger drag (v1.5.557, feedback #148)

In select mode on touch, **single-finger is fully consumed**: a tap on empty canvas starts a rect-select and a tap on a node selects/moves it — neither pans. So there was no way to pan the map on a phone while in select mode (you could only pinch-zoom).

Fix: the two-finger `handleTouchMove` branch now pans the viewport by the pinch-center delta (`center − lastTouchCenter`) in addition to pinch-zoom. Two fingers are never used for selection, so this works in every mode (select, add-node, normal) without conflict and gives the standard mobile map gesture (simultaneous pinch+pan). Viewport x/y are screen-px, same units as the single-finger pan path, so the delta applies directly.
