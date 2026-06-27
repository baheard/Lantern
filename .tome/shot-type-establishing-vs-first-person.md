---
title: Shot type — establishing vs first-person (a missing mold axis)
tags: [location-art, mold, framing, composition, vantage, dreamhold]
created: 2026-06-26
updated: 2026-06-26
aliases: [vantage shot type, location-as-a-whole shot, establishing shot, first-person framing]
---

# Shot type — establishing vs first-person

Surfaced 2026-06-26 debugging Dreamhold `mountain-garden`: images scattered the
dome, statue, and paths "all over the place." Root cause was NOT a bad prompt —
it was a **framing axis the mold engine doesn't have**.

## The gap

Every room's framing block in `location-framing.md` is authored as
**"Vantage: standing in…"** — i.e. always **first-person / eye-level**. There is
no vocabulary for choosing a **"location as a whole" establishing shot**. So a
room that genuinely wants the establishing treatment gets an eye-level vantage
that physically can't hold its landmarks, and the scene prose degenerates into a
flat feature list with no consistent camera → the renderer scatters the features.

## The two shot types

- **First-person / eye-level** — camera is *inside* the space; it faces ONE way;
  anything behind the camera is dropped. Correct default for most rooms
  (corridors, cells, bowers, the dome stations, the cistern arc).
- **Establishing / "location as a whole"** — elevated, oblique, clearly NOT a
  character's eye view. The place is laid out as a whole from above its geometry.
  **Opposite-facing landmarks can legitimately coexist** because the camera is
  above the layout, not inside it facing one direction.

## Why it resolves the mountain-garden conflict

`mountain-garden` has the dome to the **north** (high on the mountain face, far)
and the statue/balcony to the **south** (down marble steps, near). At eye level
from the garden these are 180° apart — genuinely one-or-the-other. But an
**elevated establishing shot from south of the balcony, looking north** holds all
four directions honestly:

```
fore/bottom → marble balcony + tall statue, looking out over the valley   (S, nearest)
mid         → sculpted garden: hillocks, statuary, marble pillars, paths
left/right  → the two paths curving off                                   (E/W)
back/top    → mountain rising, small white dome high on its face, blue sky (N, farthest)
```

The cheat I *first* tried (silently moving the camera above the balcony while
still calling it the garden's eye-level vantage) is wrong — that's an
establishing shot pretending to be first-person. The fix is to **declare** it an
establishing shot, not to smuggle the elevation into a first-person frame.

## How to apply (engine fix, not a per-room override)

- Add **shot type** to the mold framing vocabulary: each room's framing block
  declares first-person (default) vs establishing, and establishing blocks pin
  each landmark to a frame position (fore/mid/back, left/right) relative to the
  elevated camera rather than to a compass-facing.
- Reserve establishing for rooms whose load-bearing landmarks are
  multi-directional and would otherwise force a one-or-the-other drop — and where
  no *other* room already serves the dropped landmark as its hero shot. (For
  mountain-garden the statue also has `marble-balcony` as its dedicated hero, so
  even committing to a north-facing first-person shot was defensible; the user
  chose establishing to show both.)
- This is an `art-direction-model` / `mold` change, not a `style.json` hand-edit
  (`location-framing.md` is a regenerable never-hand-edit cache). See
  [[art-direction-model]].
