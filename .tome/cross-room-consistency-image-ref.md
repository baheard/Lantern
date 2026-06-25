---
title: cross-room-consistency-image-ref
tags: [location-art, gemini, consistency, mold, theatre, negative-result]
created: 2026-06-24
updated: 2026-06-24
aliases: [neighbor reference, shared periphery, volume image ref, adjacent room consistency]
---

# Cross-room visual consistency lives in TEXT, not image-refs

**Goal that prompts this:** make adjacent rooms in a shared space (e.g. the theatre
Auditorium volume — stage, aisles, balconies) look consistent in their periphery, so a
room's view toward the stage matches what the neighbor sees. The bar is *believable*
consistency (shared palette / curtain-red / gloom), NOT geometric pixel-continuity —
players see one room at a time and never compare edges side by side.

## Negative result (2026-06-24): do NOT feed a neighbor's image as a style-ref

Tested by hand using the existing `gen-room-images.cjs --ref <img> --ref-mode style`
path: rendered `eastern-theatre-aisle` with `stage.png` as the style reference, vs. the
plain version. (Test outputs preserved as `eastern-theatre-aisle.STYLEREF-TEST.png` /
`.NOREF.png` in theatre `_review/`.)

**Finding:** on Gemini 2.5 Flash Image, `--ref-mode style` is a STRONG influence — it
pulled the anchor's whole **composition**, not just palette. The ref'd aisle lost its own
vantage (red curtain + orchestra pit + receding aisle carpet) and became a near-duplicate
of the stage view, just warmer. Two adjacent rooms collapsing into the same picture is
*worse* than no consistency at all — it breaks sense of place. Gemini inline refs expose
no strength/weight knob to dial this down.

So the planned "style volume" engine change (a `volumes` block in style.json →
auto-feed the anchor image as a style-ref to each member) was **abandoned before
implementation** — the test showed it would degrade the art.

## What to do instead

Keep cross-room consistency at the **text layer**, which `mold` already authors:
- `location-framing.md` **Volume** blocks (geometry + shared landmarks authored once per
  multi-room space) and the **landmarks glossary** make rooms *agree on what's there*
  without touching pixels — each room keeps its own vantage prose. This is the safe,
  already-built mechanism. See [[art-direction-model]] and the mold skill.

## Still-open micro-idea (untested)

Palette-only ref: feed a tiny **blurred swatch** (~32×32, no recoverable composition) of
the anchor so the model can borrow *colour* but has no layout to copy. Might give palette
cohesion without the duplication failure. ~2-min test if cohesion ever becomes a real
complaint; not worth building speculatively.

## Update (2026-06-24): for TRUE geometric continuity, see the blockout approach

If *believable* text-layer consistency isn't enough and you need adjacent rooms to share
real geometry (the same stage from every vantage), the validated path is a 3D blockout →
clay render → img2img restyle — see [[blockout-3d-continuity]]. That turns edit-mode's
"preserve composition" (the thing that broke here with a photo ref) into the feature,
because the ref is now correct geometry rather than a wrong-vantage neighbour photo.

## Note on the existing `anchorRoom` path

Don't confuse this with the `anchorRoom` / Gap-B relight in `gen-room-images.cjs`. That
uses `--ref-mode edit` (preserve composition, change only lighting) and is CORRECT for its
job: *same room, different state* (chandelier up/down, lit/dark). The over-borrowing above
is specific to using `style` mode across *different* rooms.
