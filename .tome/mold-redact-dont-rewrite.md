---
title: Mold distillation = redact + re-anchor, not rewrite (noun-preservation rule)
tags: [location-art, mold, distillation, scene-prose, dreamhold, engine]
created: 2026-06-26
updated: 2026-06-26
aliases: [noun preservation, dont paraphrase scene detail, redact and re-anchor, verbatim concrete nouns]
---

# Mold distillation = redact + re-anchor, not rewrite

Spike 2026-06-26 (Dreamhold `mountain-garden`). The mold skill's "Distill facts →
scene prose" step was paraphrasing the source's concrete visual detail into
generic categories, and that paraphrase silently destroyed renderable information.

## The failure

Source scene: *"A tidy path runs north between mossy boulders. A wider path curves
west, down a grassy slope, and up to the east."* The molded override collapsed this
to *"knotted paths curve off"* — and **the whole west (down-slope) arm disappeared
from every render**, across many attempts and prompt tweaks. Feeding the **raw
scene text** rendered the boulders, the three paths, and the up/down grade
faithfully. So the loss was the mold's paraphrase, not the image model.

A second, opposite failure proved the mold still earns its keep: rendering the
**fully verbatim** text ballooned *"a featureless white dome"* into a giant sphere,
because the bare noun has no scale. The molded versions said *"small, distant white
dome"* (a framing judgment) and got it right.

## The rule (now in the mold SKILL, step 3/4)

Distillation is **REDACT + RE-ANCHOR, never rewrite.** Keep the source's **concrete
visual nouns and spatial grades VERBATIM** — they are the exact tokens the image
model renders. The ONLY sanctioned edits to the source clause:

1. **Transform compass facings** → image-relative position (factor 10b; the
   generator can't use "north"). Facing-north map: ahead=background, behind=off-frame,
   E=right, W=left, up=above, down=below.
2. **Drop** behind-vantage / takeable / lore / narration / state-wrong material.
3. **Add a scale/distance anchor** a bare noun lacks, when the framing decided one
   — but use the LIGHTEST anchor that holds, and **first check whether the source
   already implies scale.** ("high on its face you see a dome" already implies
   seen-from-below-and-far → the model SHOULD render it small; the verbatim balloon
   was the model ignoring that cue, not the text lacking it. So prefer keeping/
   sharpening the source's own cue — "high on its distant face" — over bolting on
   "small, distant", which the user flagged 2026-06-26 as an unfaithful over-add.)

Never swap a source noun for a synonym or a summary ("garden paths", "old door").
When unsure, quote the source clause and re-anchor it in place.

## Why "north" sometimes *looks* like it worked

In the good renders the path pointed toward the dome even though the model can't
read "north." That came from the **non-compass** cues sitting beside it ("the
mountain **towers above**… **high on its face** a dome"; "a path runs **between
mossy boulders**" toward it) — elevation + "towers/high/between" did the work. A
room whose only cue is a compass word with no spatial/elevation language would
still scatter. Hence: compass transform is still mandatory; don't trust literal
compass text.

## Companion finding

Shot type — first-person is the default, establishing is rare and hallucination-
prone — see [[shot-type-establishing-vs-first-person]]. Together these two notes
are the 2026-06-26 mold-philosophy update. See also [[art-direction-model]].
