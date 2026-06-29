---
title: Room-facts recovers posture sub-state nodes as vantage-anchored variants
tags: [room-facts, art-pipeline, gen-room-facts, gen-room-images, examines, posture, anchor, img2img]
created: 2026-06-28
updated: 2026-06-29
aliases: [curtained-room-on-the-chair, seated-mirror-vision, vantage-anchor, on-the-chair-dropped, sitting-room-on-the-settee, posture-recapture, base-pristine-recapture]
---

# Posture sub-state nodes (the seated mirror vision) — recovery + vantage anchor

**Symptom (Dreamhold, 2026-06-28):** `Curtained Room (on the chair)` — the node you're in
while *seated*, where `examine mirror` shows the faceless-blank reflection with seven coloured
shadow-masks flitting around you — was flagged **NEEDS-HUMAN** ("real node, no usable prose")
and dropped from the pack. That's the single most striking image in the game.

**Two root causes, both in `tools/gen-room-facts.cjs`:**

1. **The entry verb tainted the node's own pristine view.** `sit on chair` *creates* the
   `(on the chair)` node, but `sit` counted as a room mutation (`breaksPristine`), so the
   seated `examine mirror` captured right after was tagged `pristine:false` and dropped by
   `mergeExamines`. The seated view was gone before it could become the scene.
   → Fix: `POSTURE_VERBS` (sit/stand/lie/recline/kneel/mount/board/perch/sprawl/lean) are now
   inert for pristine. A *real* mutation made while seated (`put mask on mirror`) still breaks
   pristine, so the post-mask "patchwork" examine is correctly dropped — you get the clean
   first-sit vision, not the puzzle-solved state.

2. **No anchor.** Even recovered, a `(on the chair)` view is the SAME physical space as its
   base room from a new camera. It must render off the base room's committed image, not blind
   text-to-image. → New **posture-anchor pass** (runs after Gap A/Gap B): any node whose name
   is a positional sub-state (`postureBase()` mirrors auto-mapper `mapNodeName()` EXACTLY — same
   preposition/gerund set) gets `anchorRoom` = base slug, `stateLabel` = the bracketed phrase
   ("on the chair"), and `anchorMode: 'vantage'`.

**Render side (`tools/gen-room-images.cjs`):** `anchorMode` distinguishes `'relight'` (Gap B:
keep camera, change light/water state — renders img2img off the base image) vs `'vantage'`
(posture: *re-frame the camera* within the same geometry/identity).

**CORRECTION (2026-06-29): vantage sub-states render FREE (text2img), NOT img2img off the base.**
An A/B test on the seated Curtained Room proved img2img drags the base's empty-chair composition
and cool palette in, and the reflected figure will NOT reappear (the from-base edit lost the
figure entirely); the winning render — and the user's favorite — was a free text2img in oil. So
gen-room-images.cjs gates the relight/edit path on `anchorMode !== 'vantage'`; vantage renders
free. img2img anchoring is reserved for `'relight'` only. Rule of thumb: anchoring helps relights
and small reframes, hurts radical re-vantages.

**Why this is the right fix, not a per-room `style.json` override:** the display path was
already built for it — auto-mapper deliberately keeps the FULL name on `getCurrentLocation`/
`locationChanged` so location-art can key the seated image, while collapsing only the *map*
node (see [[automap-substate-node-collapse]]). The only gap was the facts builder; fixing the
engine recovered three Dreamhold posture nodes at once (chair, `Sitting Room (on the settee)`,
`Cistern, East (on the glass platform)`) and generalises to any game.

## UPDATE 2026-06-29 — pristine-latch isn't enough; posture nodes need RE-CAPTURE from base-pristine

**Symptom (player art feedback, `Sitting Room (on the settee)`):** the rendered image showed a
puzzle-SOLVED room — empty hook (the desert painting gone) and the east door open. The base
`Sitting Room` node was fine (painting up, fire lit, door closed). Empirically (replay harness)
you *can* sit on the settee early and the node is pristine then — so a clean state exists; we just
weren't capturing it.

**Root cause — a capture-TIMING bug the original pristine-latch fix doesn't cover.** Room-facts
captures a sub-state at the turn the walkthrough FIRST reaches it (`firstVisitIdx`). For the
settee that's the **post-dream `enter rent` return, ~turn 119** — ~90 turns after `take painting`
(line 32-33). The POSTURE_VERBS-inert latch only stops the *entry verb* from tainting the node;
it can NOT rewind global mutations (the painting) that happened turns earlier. And note: the
settee's first arrival verb is `enter` (the dream return), **not** `sit` — so you can't classify
posture-vs-movement by the entry verb either.

**Fix — posture-recapture pass (`gen-room-facts.cjs`, after the vantage-anchor tagging).** For each
name-classified posture node, derive candidate commands from the bracket label
(`postureProbeCmds("on the settee")` → `sit on settee`, then stand/lie/kneel), build the BASE
room's pristine first-visit snapshot (`buildSnapshotsIncremental`), and replay
`<posture cmd> ; look ; <the node's examines> ; examine <exit-fact nouns>` off it. Rebuild
description / scene / sceneExtras / unprobed from THAT, and refresh noun `exitFacts` (the white
door now reads *closed*). Tag `recapturedFrom: 'base-pristine'`.

**This also fixes the posture-vs-movement conflation.** `POSTURE_PAREN_RE` over-matches by NAME:
`Cistern, East (on the glass platform)` looks like a posture node but is a **climbed camera
position** (entered by `up`/`down`), already captured pristine by ordinary movement discovery. No
`sit/stand on platform` candidate re-reaches it, so recapture fails for it and it correctly keeps
its incidental (pristine) capture — now reported as `kind: 'movement-vantage'` instead of being
treated as a posture state. So among Dreamhold's three "(on the X)" nodes: chair + settee = true
posture (recaptured from base-pristine), glass platform = movement vantage (left alone).

**Design note (route-by-consumer, confirmed with user):** the *probe-a-posture-verb-from-base*
framing is the spine; "capture off the base-pristine snapshot" is what falls out of running it.
The earlier idea of synthesising the scene was the symptom; the probe is the cause. Keyed on the
walkthrough's own posture command would be wrong (it may never sit, or sit late) — keyed on the
LABEL noun + a small posture-verb ladder is general. Flags: `--no-posture-recapture` to skip;
shares the `--no-exit-probe` gate (snapshot-based).

**Related:** [[room-facts-pristine-examines]] (the pristine latch this extends),
[[automap-substate-node-collapse]] (the map/art route-by-consumer split that makes the seated
image addressable), [[blockout-3d-continuity]] (Cistern's glass-platform vantage is now an
anchored sub-state of a strong blockout room).
