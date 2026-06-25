---
title: blockout-3d-continuity
tags: [location-art, blockout, 3d, continuity, mold, theatre, img2img, artview]
created: 2026-06-24
updated: 2026-06-24
aliases: [3d blockout, clay render, geometric continuity, scene blockout, volume blockout]
---

# 3D blockout → clay render → img2img restyle (true cross-room continuity)

The principled answer to "make adjacent rooms in a shared space agree geometrically"
(stage / aisles / balconies all showing the SAME stage, chandelier, boxes from their own
vantage). Complements — does NOT replace — the text-layer approach in
[[cross-room-consistency-image-ref]]. Text layer = *believable* consistency, free, default.
Blockout = *true geometric* continuity, real modelling cost, only where it's worth it.

## Why it works (and why plain image-refs don't)

[[cross-room-consistency-image-ref]] showed feeding a neighbour's photo as a ref fails:
the model has no 3D understanding, so it clones the ref's *composition* instead of
re-deriving the vantage. The fix is to give it geometry that's *already correct for this
camera*: build the volume ONCE in 3D, place a camera per room, render a grey "clay" view,
then img2img-restyle it. Now `--ref-mode edit`'s "preserve composition" — the thing that
HURT with a photo ref — is exactly what we want, because the composition is the true
geometry. Every view comes from one model, so the stage from the aisle and the stage from
the balcony are literally the same stage.

## Validated 2026-06-24 (spike on the theatre Auditorium)

Built a rough three.js blockout of the Auditorium volume from the `location-framing.md`
geometry + per-room **Vantage** lines, rendered the eastern-aisle clay view headless, and
restyled it with `gen-room-images.cjs --ref <clay> --ref-mode edit --provider openai
--quality low`. Result (`_review/eastern-theatre-aisle.CLAY3D-TEST2.png`): a faithful
auditorium with stage, curtain, balcony boxes, chandelier, raked seats — geometry placed
exactly per the clay. **The geometry transfer is the win; it's strong.**

### Gotchas learned (bake these into any future blockout authoring)
- **Empty/flat regions hallucinate.** A big featureless foreground (or the bare sunken pit)
  made gpt invent a brick crypt/catacombs below the seats. Fix: fill the frame with real
  geometry + steer "single ground level, NO basement/crypt/vaults."
- **Hard polygon edges → blocky objects.** Cube seats restyled as stone blocks. Fix: round
  the geometry (cylinder seat-backs) AND steer "plush upholstered, soft rounded, treat the
  image as a LAYOUT guide not a literal object."
- **Edit-mode preserves the ref's TONALITY.** Grey clay → desaturated/monochrome output,
  regardless of prompt. This is FINE for a monochrome artist (theatre's selected artist is
  `drypoint` / copperplate etching — the "sepia" was the artist rendering correctly, not a
  bug). For a SATURATED flat-colour artist it would fight you → then either colour the
  blockout materials roughly, or use ControlNet depth/canny on Stable Diffusion (not our
  Gemini/gpt-image providers) for structure-with-free-colour. Always check
  `selected-artist.json` before assuming the palette.
- **Cut the floor around the pit.** A sunken pit needs the floor *opened* (build floor as
  pieces around a hole); a pit box under a solid floor slab is invisible/buried.
- **Framing took 3-4 iterations.** Camera height/aim per vantage needed a render→look→adjust
  loop (overshot the aisle camera once). Autonomous authoring can run this loop headless but
  a human spot-check converges it faster.

## Detection: which spaces need a blockout = mold's Volume blocks

No new judgment needed. `location-framing.md` already lists them as `### Volume:` blocks
(2+ members looking across one shared space). Theatre has three: Auditorium, Lobby Atrium,
Sewer. Mold even flags failures explicitly (staircase-landing: "likely needs an img2img
anchor"). So a future skill scans framing for Volumes + those "needs an anchor" canaries to
get the work-list for free.

## Shape (minimal build DONE 2026-06-24)

- **Generic renderer** ✅ `docs/games/images/_blockout/renderer.html` — three.js app that
  loads a saved **scene-def** and renders it; fly-through nav (right-drag look, WASD move,
  Q/E up/down, scroll dolly), per-room camera buttons, `?lock=1` for clean 3:4 screenshots.
  Part vocabulary: `box`, `cyl{r,len,axis,half}`, `sphere`, `grid{x,z,rakePerRow}+of[]`
  (grid repeats sub-parts — used for seating/balconies). Args: `?game=&volume=` or `?src=`.
- **Scene-def** ✅ `docs/games/images/<game>/_blockout/<volume>.scene.json` — the "3d file":
  `{game,volume,title,members,parts[],cameras{room:{pos,look,fov}}}`. First one:
  `theatre/_blockout/auditorium.scene.json` (24 parts, 6 cameras, from the framing).
- **artview integration** ✅ `tools/review-server.cjs`: `blockoutsFor()` scans
  `_blockout/*.scene.json`; routes `/blockout` (serves renderer from disk, self-contained on
  :3009), `/api/blockout?game=&volume=` (scene-def), `/api/blockouts` (all, for the rail).
  Top-level **Blockout 3D** rail topic → subnav of all volumes grouped by game → detail
  embeds the renderer in an iframe with camera buttons. Member locations also get a 📦
  button that navigates in-app to the volume at that room's camera. A blockout is NOT a
  "location" — it's its own game-grouped section.
- **Still TODO**: node batch driver (render all views → gpt edit-mode in one command);
  prove cross-room continuity by restyling all 5 views; param-slider/gizmo editing in the
  renderer (dropped to ship); standalone auto-author from framing.
- **Skill home (open question)**: likely its OWN skill (`/blockout`-ish) that `studio`
  orchestrates as an optional phase for volumes needing continuity — mirrors how
  generate-location-prompts / mold / render-rooms are discrete skills under studio. Decide
  when building; don't fold it inline into studio.

## When NOT to use it

Most rooms: skip. Players see one room at a time; text-layer consistency is enough. Reserve
blockouts for volumes where multi-vantage continuity is actually visible/complained about.
Authoring geometry per volume is the real ongoing cost.
