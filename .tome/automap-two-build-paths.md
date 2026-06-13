---
title: Auto-map has two build paths that must stay in parity
tags: [map-canvas, auto-mapper, architecture, gotcha]
created: 2026-06-03
updated: 2026-06-03
aliases: [syncFromAutoMapper, handleLocationChange, portal upgrade, tryUpgradePortalEdge, map parity, replay vs live]
---

# Auto-map builds the map through two independent code paths

The interactive map is populated by **two** separate pieces of code, and any
behavior added to one must be mirrored in the other or you get
"works-only-sometimes" bugs that depend on *when the user opened the map*.

1. **Live path — `handleLocationChange`** (the `locationChanged` listener).
   Processes one move at a time and mutates `mapState` directly. **It is only
   registered after the map UI is first opened**, because `map-canvas.js` is
   lazy-loaded on the first `#mapBtn` click (`app.js`). `initMapCanvas` wires the
   listener at that point.
2. **Replay path — `syncFromAutoMapper`** (runs inside `loadMapForGame`, i.e. on
   game load and on first map open). Replays the entire `auto-mapper` journey
   buffer (`getMapData().journey`) to rebuild nodes/edges from scratch.

**Before the map is ever opened in a session there is no live mapping at all** —
only `auto-mapper.js` (always active) records the journey. So every move made
before the first open is built by the replay path; moves after it go through the
live path. This is why a bug can reproduce only when "both moves happen before
opening the map."

## The bug this caused (v1.5.471)

Reverse-portal-edge upgrade existed only in the live path. Repro: `enter gate`
(Riverwalk → Under the Bridge, a **portal** edge), then `se` (Under the Bridge →
Riverwalk). The `se` move reveals that the bridge is **NW** of Riverwalk, so the
portal edge should upgrade to a cardinal NW edge and the node should reposition.

- Live path: `handleLocationChange` reaches the `existingNode && !hasNoDirectEdge`
  branch and calls `tryUpgradePortalEdge(from, to, cmd)`, which upgrades **both**
  the forward and the **reverse** portal edge (and repositions the node). Works.
- Replay path: `syncFromAutoMapper` only called `tryUpgradePortalEdge` when the
  *forward* edge key already existed. When the `se` move created a **brand-new**
  edge, it never checked the reverse portal edge → portal stayed dotted, node
  stayed at its fallback (east) position.

Fix: in `syncFromAutoMapper`, call `tryUpgradePortalEdge(prev, cur, cmd)`
**unconditionally** before the forward-edge existence check, then create the
forward edge only if it doesn't exist. `tryUpgradePortalEdge` already no-ops
harmlessly when there's nothing to upgrade.

## Related gotchas in this area

- **Portal commands aren't matched uniformly.** `syncFromAutoMapper`'s *placement*
  branch uses `portalCommands.includes(cmd)` — an **exact full-string** match
  against `['in','out','enter','exit']` — so a multi-word command like
  `"enter gate"` misses it and falls through to the "unknown command → last
  cardinal direction" branch. Edge *typing* is fine because
  `getConnectionTypeFromCommand` → `getDirectionFromCommand` checks the first word.
  The mismatched placement is masked once the reverse-edge upgrade repositions the
  node, but it's a latent inconsistency if you touch placement logic.
- **`DIRECTION_OFFSETS` has no `enter/exit/in/out` keys** (by design — portals use
  the last cardinal direction). This bit hard (FIXED v1.5.472): `handleLocationChange`'s
  portal fallback read `DIRECTION_OFFSETS['enter']` (= `undefined`) as its last resort and
  did `offset.x` on it → **TypeError that aborted the whole handler**. Symptom: typing a
  portal command (`enter gate`) with the map open added *no node*, saved nothing, and left
  `currentNodeId` stale (so reopening the map showed nothing but highlighted the old start
  node). It only fired when `getLastDirectionFromHistory()` found no cardinal — e.g. right
  after a quick-restore, whose screen-clear wipes the journey buffer. Fix: fallback is now
  `(lastDir && DIRECTION_OFFSETS[lastDir]) || DIRECTION_OFFSETS['up']`, and
  `getLastDirectionFromHistory` skips offset-less portal pseudo-directions (so it returns a
  *placeable* direction or null) — matching `syncFromAutoMapper`'s `'up'` default.

## Retained heading across journey clears (v1.5.473)

Portal/unknown moves position by the *last placeable direction traveled*. The journey
buffer used to be the only source for that — but the journey is **cleared** on scene
breaks and when the map is opened (`syncFromAutoMapper` transfers it to the canvas, then
`clearJourney()`). So a portal move made right after opening the map (or after a restore's
screen-clear) had no heading to use and fell back to `'up'`.

Fix: `mapState.recentDirections` — a persistent ring buffer (cap 10) of placeable
directions that **survives journey clears**:
- `rememberDirection(dir)` (called at the top of `handleLocationChange`) pushes a move's
  direction if it has a `DIRECTION_OFFSETS` entry (portals/unknowns are skipped).
- `syncFromAutoMapper` seeds `mapState.recentDirections` from the directions it gathered
  during replay, **before** clearing the journey — so the heading outlives the clear.
- `getLastDirectionFromHistory` checks the live journey first, then falls back to
  `mapState.recentDirections`.
- Reset per game in `loadMapForGame` (then immediately re-seeded by the sync that follows).

Net: after opening the map mid-exploration, a `enter gate` places the new room along the
last cardinal you walked, not straight up.

## Unconfirmed: "bad connections on map open" (feedback #149, open)

Report (anchorhead, v1.5.535): spurious edges appear, "related to when the map opens —
like the location where you were when you opened it last connecting to the location you
are when you open it now." Not reproduced by reporter or in code review; this is the
leading hypothesis, not a confirmed cause.

Chain: a scene break into an **unmapped** area **while the map is hidden** sets
`_pendingNewAreaHint = true` + `suppressJourneyClear = true` and then early-returns from
`handleLocationChange` on *every* later move until the user opens the map and resolves the
hint (`map-canvas.js` ~683). While suppressed, further scene breaks **don't clear the
journey** (`auto-mapper.js` ~126), so multiple disconnected areas pile into one journey
buffer. On the next open, dismissing the hint runs `syncFromAutoMapper()`, replaying the
whole buffer into the **current** map. Replay skips null-command entries, so a *correctly*
tagged scene break is safe — but any teleport/cutscene whose screen-clear was **missed**
(so `setSceneBreak()` never fired) carries `lastCommand` as a real command and becomes a
spurious cross-area edge. The replay-at-open timing is why it feels tied to opening the map.

Deferred rather than blind-fixed: can't reproduce, and this machinery has a history of
regressions (see the v1.5.471/472/473 notes above). Next step when it recurs: capture the
offending `from→to` edge plus `suppressJourneyClear`/`_pendingNewAreaHint`/`pendingSceneBreak`
state via debug logging at edge-creation time.

## Rule of thumb

Any change to how nodes/edges are created, positioned, or upgraded must be applied to
*both* `handleLocationChange` and `syncFromAutoMapper`. See also [[map-undo-snapshots]]
for the related "auto-mapper mutates outside the snapshot system" hazard.
