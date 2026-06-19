---
title: art-notes-skill
tags: [location-art, review-notes, skill, tooling, triage]
created: 2026-06-19
updated: 2026-06-19
aliases: [art notes, /art-notes, unresolved art notes, review notes sweep]
---

# /art-notes skill — cross-game unresolved-notes analysis sweep

> **Renamed/superseded by `/review-notes`** (`.claude/skills/review-notes/`, v1.5.618). The
> art-notes skill was deleted. `/review-notes` does the same analysis-first sweep but widened to
> THREE sources — saved artview notes + player `[ART]` feedback + player `[HINT]` feedback — and
> pulls fresh feedback from GitHub itself. The resolution-coupled-to-action rule below still holds.
> See [[hints-feedback-system]] for the full feedback pipeline.

`/review-notes` sweeps **every** game's UNRESOLVED notes in `docs/games/images/_review-notes.json`
(art) and `docs/games/hints/_review-notes.json` (hints) and writes a per-note **analysis** (problem
· owning layer · recommended action). The analysis pass itself changes nothing.

**Resolution is coupled to ACTION, not to analysis.** The sweep never auto-flags from merely
looking. But once a fix is applied for a note (after approval, or via the location-art handoff),
the skill flags THAT note resolved in `_review-notes.json` —
`{ note, status:"resolved", appliedTo, resolved:"YYYY-MM-DD" }` (or `"wontfix"` for a deliberate
no-op like a marginal framing nitpick). Same `setNoteStatus` shape the reviewer UI and
location-art use. Never delete; one resolve-flag per note actually touched.

## Why it exists separately from location-art

`location-art`'s "Review notes" action is **per-game and route-and-apply** ("review art notes
for anchorhead"). When `artview` became a single multi-game nav that starts wherever you left
off, the matching need was a **cross-game, analysis-first** pass. Rather than overload
location-art (whose "no game named → ask" flow would have to fork), `/art-notes` is a thin
sweep skill that reuses location-art's layer-routing vocabulary and the tome's
`art-direction-model.md`, then **hands off** to location-art for the actual draft-diff / apply /
flag-resolved work. Division of labor: art-notes diagnoses, location-art edits.

## The non-obvious bit: a note isn't always about the image

The note's *subject* can be the rendered image, the **composed prompt**, or a mismatch against
canon. Example that drove the design (theatre witchs-lair): "the canonical text says the statue
holds a jewelled dagger — why did the skill miss this?" — that's a **prompt** failure (Scene text
omitted a canonical object), not an image failure. So every note's analysis pulls all three
context sources: the PNG, its sidecar `.txt` (the exact composed prompt sent to the generator),
and the in-game canon (`prompts.json` → room `description`, + walkthrough for spatial/quantity
claims). Verify spatial/object claims against canon, never eyeball the picture.

## Key → situation resolution

Keys are `game:<g>:<slug>` (+ optional suffix):
- `game:<g>:<slug>` → location-level; image = committed `<g>/<slug>.png` else newest `_review/<slug>-*.png`.
- `game:<g>:<slug>:<file>` → specific render in `<g>/` or `<g>/_review/`.
- `game:<g>:<slug>:aud:<file>` → audition piece in `<g>/_audition/`.

Unresolved = value is a string OR `status` missing/`"open"`; skip `resolved`/`wontfix` (same
convention as `noteText`/`noteStatus` in `tools/review-server.cjs`).

## Proactive canon-coverage scan (added 2026-06-19)

Beyond human notes, the sweep also diffs each render's composed Scene (sidecar `.txt`) against the
base room description (`prompts.json`) and flags **salient canon nouns missing from the Scene** —
the failure mode behind the Witch's-Lair jewelled-dagger miss. KEEP/DROP buckets come from
`location-art` scene-recipe step 6. The authoring-time prevention lives there + in
[[art-direction-model]] ("Enrich from examine, but never DROP a base-description fact").
