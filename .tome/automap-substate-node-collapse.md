---
title: Auto-map collapses sub-state locations ("(on the chair)") to one node; art keeps them distinct
tags: [map-canvas, auto-mapper, location-art, route-by-consumer, dreamhold]
created: 2026-06-26
updated: 2026-06-26
aliases: [phantom node sitting, on the chair map node, sub-state stripping, mapNodeName]
---

# Sub-state locations: map collapses, art keeps distinct

v1.5.686. Some games change the **status-bar room name** when the player merely
sits/lies/mounts — Dreamhold: `sit on chair` flips the status line from
`Curtained Room` to `Curtained Room (on the chair)` (verified via `play.cjs --status`).
`getCurrentLocation()` returns that full distinct string, and **both** the auto-mapper
and location-art consume it.

## The conflict (route-by-consumer)

The same string is wanted *differently* by the two consumers:

- **Location art** wants it DISTINCT — the seated view is a genuinely different
  picture (the mirror-reflection image). Art keys `manifest.images[locationName]`
  on the full name (it listens to the `locationChanged` event's `locationName`).
- **The map** wants it MERGED — physically you're still in the Curtained Room;
  a `sit` should not spawn a phantom map node + a `sit on chair` edge.

## The fix — strip at map-node identity ONLY

New `mapNodeName(name)` in `auto-mapper.js` strips a **trailing parenthetical
sub-state** (conservative: only when the paren opens with a positional
preposition/gerund — `on|in|at|atop|under|astride|aboard|sitting|seated|lying|
riding|standing|…`). It is applied **only where the map forms a node identity**, so
the full name still rides `getCurrentLocation()` + the `locationChanged` event for art:

- `handleLocationChange` (live path) — strips both `locationName` and
  `previousLocationId`; if they're equal after stripping (a same-room sub-state
  transition), it early-returns: keep the current node selected, no node, no edge.
- `syncFromAutoMapper` (replay path) — strips each journey entry's `locationName`
  (and the look-ahead `next.locationName`, and the final `getLastLocationName()`),
  so a seated entry becomes a revisit; the existing `previousNode.id !== locationName`
  edge guard then prevents a self-edge.
- `seedCurrentLocation` — strips before seeding the origin node.

Both map build paths use the SAME helper, so they stay in parity (see
[[automap-two-build-paths]]). The strip deliberately does NOT touch
`getCurrentLocation`, the event payload, or `getLastLocationName` itself — only the
map's use of them — keeping art independent.

## Why not strip in getCurrentLocation

Because location-art is downstream of it (event → `manifest.images[name]`). Stripping
there would make the seated state show the *base* room image instead of its distinct
seated view — breaking the very art the pipeline builds for these sub-states. Same
route-by-consumer logic as lore-vs-tome: the consumer decides the representation.

## Adjacent

This is the gameplay-map sibling of the art-side fix where the *occupied furniture is
the vantage* and must be dropped from the seated image (mold factor 10a — the empty-chair
defect). Different system, same root game behavior. See [[mold-redact-dont-rewrite]].
Not browser-confirmed that the phantom node visibly rendered pre-fix — the distinct
name + unstripped node identity made it a logical certainty; verify in-app if doubted.
