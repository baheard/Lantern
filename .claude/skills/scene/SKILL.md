---
name: scene
description: Phase 2b of the location-art pipeline — distil per-room framing JUDGMENT (location-framing.md) into the imperative Scene override the renderer reads, written to docs/games/images/<game>/style.json scenes[slug]. Pairs with /frame (phase 2a). Mechanical-ish, re-run often. Author mode (default) writes/refreshes; `scene <game> review` audits the distillation.
---

# scene skill

**Phase 2b of the location-art pipeline** (the PROSE half; `/frame` is phase 2a, the JUDGMENT half).
Scene distils the framing decisions in `docs/games/images/<game>/location-framing.md` into the
imperative **Scene override** — `style.json` → `scenes[slug]` — the editable Scene text artview and
the renderer read. After it runs, every location is render-ready.

```
generate-room-facts ─▶ [ frame: facts → JUDGMENT ] ─▶ [ scene: framing → PROSE ] ─▶ render
   room-facts.json          location-framing.md            style.json scenes{}        images
   (FACTS)                  (decisions + WHY)               (imperative prose)  ← THIS SKILL
```

**Why scene is its own skill.** It is downstream of `/frame` and deliberately *low-judgment*: it
renders decisions already made, it does not make them. It gets re-run constantly — every facts regen,
every review note, every framing tweak — so it stays small and fast. **If you find yourself DECIDING
something here** (which way the camera faces, whether a feature is occluded, which state to paint) —
stop: that decision belongs up in `/frame`. Go fix the framing bullet, then come back and distil.

**The litmus:** the scene says nothing the framing + facts don't already justify, and adds no new
judgment. It is the *imperative the model renders*; framing is the *decision + why*.

## Two modes

- **Author** (default — `/scene <game>` [optional `--only a,b,c`]): write/refresh scene overrides from
  the framing.
- **Review** (`scene <game> review` [`--fix`]): audit existing overrides against the distillation rules
  + lint below; report per-room pass/fail, recommend fixes; `--fix` applies them. Analysis-first.

## Inputs (per room)

- **`location-framing.md`** → the room's `### <slug>` entry: the vantage, facing→frame map, occlusion,
  exit handling, state — the decisions you distil. **This is the primary input.** A room with a scene
  but no framing entry is "scene un-backed" — flag it; do NOT invent the framing here, run `/frame`.
- **`room-facts.json`** → the room's `scene` (the scrape-cleaned, examine/look-enriched source prose
  whose concrete NOUNS you preserve verbatim) and `sceneExtras` (which detail came from a probe).
- **`_review-notes.json`** → open notes that should already be answered in the framing; if a note
  contradicts the current scene, re-distil.

## The distillation rules

### 1. REDACT + RE-ANCHOR, never rewrite (noun-preservation)

Distillation keeps the source's **concrete visual nouns and spatial grades VERBATIM** — "mossy
boulders", "down a grassy slope and up", "knotted paths", "split soundbox", "iron-strapped door".
These are the exact tokens the image model renders; paraphrasing them into a generic category ("garden
paths", "old door") throws away the only information that makes the picture specific, and silently
drops detail (spike 2026-06-26: "a wider path curves west, down a grassy slope, and up to the east"
collapsed to "knotted paths curve off" — the whole west arm vanished from every render; the raw text
rendered it faithfully). So distillation only ever:
- **(a) transforms compass facings** to image-relative position (rule 2 below);
- **(b) drops** behind-vantage / takeable / lore / narration / state-wrong material (per the framing);
- **(c) adds the scale/distance anchor a bare noun lacks** that the framing decided ("small, distant
  white dome", not "a white dome", which renders huge).

It does NOT swap source nouns for synonyms or summaries. When in doubt, quote the source clause and
re-anchor it in place. A scene may — and often SHOULD — closely echo the scraped facts almost
word-for-word: the win is not fresh prose but a *considered, render-ready* scene whose only edits to the
source are the three sanctioned ones, each backed by a recorded *why* in the framing. See
[[mold-redact-dont-rewrite]] and [[shot-type-establishing-vs-first-person]].

### 2. Compass→frame: write image-relative, place everything, ZERO compass words (factor 10b)

The framing already pinned the facing and gave you the map (facing east ⇒ N=left, S=right, W=behind…).
Your job at emit time:
- **Every locatable feature gets an explicit image-relative position** — "on the right", "in the
  foreground", "overhead", "behind the viewpoint, out of frame". **Do NOT hedge with vague placement**
  ("in one wall", "in another", "in two more", "on two others"). Vague placement is the failure mode
  that passes the compass-*ban* while skipping the *translation* — the exact `curtained-room` bug. If a
  feature truly isn't placeable, that means the framing didn't pin a facing — go fix `/frame`, don't
  paper over it with "one wall".
- **The finished scene contains ZERO compass terms** — no north/south/east/west/northeast/…/"western
  wall". Reason in compass internally (via the framing's map), emit image-relative only.

### 3. Conservative surface defaults (floors / walls / materials)

A few surfaces ALWAYS render even when the prose omits them — chiefly the FLOOR; unnamed it degrades to
dirt/void. For these ONLY you MAY name a plain, period-plausible material — UNDERSTATED and muted, never
bold/ornate. Name it PER ZONE so one surface doesn't bleed across distinct areas (stage boards vs worn-
carpet aisles). **Pick from the room's CONTEXT/zone, never by keyword analogy** (a front-of-house
orchestra *pit* → theatre wood+plaster, NOT "stone" from the word "pit"). This is the ONE sanctioned
exception to "depict only what's named" — a surface default, NOT new furniture/objects/figures.

### 4. Layer discipline (factor 12)

Scene = literal, source-grounded facts ONLY. World+mood → Aesthetic; medium/palette/contrast/tonal
rendering → Artist (sovereign). Don't bake style, palette, contrast, or invented mood into the scene — a
trailing "Dim, dusty, eerie" tag is exactly that. A room's *physical* light situation (a named lamp;
darkness because unlit) is fine; its *tonal mood* is not. Don't re-tag the global condition per room.

## The lint — run on EVERY scene before saving

Two scans, both must pass (this is what would have caught the `curtained-room` "one wall" miss):

- **Compass scan** — the scene contains none of:
  `north south east west northeast northwest southeast southwest northern southern eastern western
  northward southward eastward westward` (case-insensitive). One survivor = defect.
- **Vague-placement scan** — flag (don't hard-fail; judge each) these hedges:
  `in one wall · on one wall · in another · in two more · on two others · the other walls · one of the
  walls · on (one|each) side · leads off · opens off · exits lead · openings lead · somewhere ·
  elsewhere`. A hedge is acceptable ONLY when the framing consciously SCREENS that exit (10d) — e.g. a
  curving corridor that hides exits round the bend. Otherwise it's an un-placed locatable feature: place
  it from the framing's facing→frame map, or if the framing never pinned a facing, kick it back to
  `/frame`.

Quick check across a whole game: `node -e "const s=require('./docs/games/images/<game>/style.json').scenes; …"`
(scan each scene string for the two regexes; report slugs that hit).

## Author mode — procedure

1. Resolve `<game>`; require `location-framing.md` (run `/frame` first if missing). `--only a,b,c`
   restricts; else all rooms with a framing entry.
2. **Per room:** read the framing entry + the source facts. Distil per rules 1–4: keep source nouns
   verbatim, translate the framing's facing→frame map into placed image-relative prose, apply surface
   defaults only where a bare surface would render wrong, hold layer discipline. Write directly to
   `style.json` → `scenes[slug]` (the review server re-reads it; or POST `/api/scene` if running).
3. **Run the lint** on each scene before saving. Fix compass survivors; place any flagged hedge or kick
   it back to `/frame`.
4. Report a one-line summary per room (flag any room you bounced back to `/frame` for a missing facing).

## Review mode — procedure

1. Read `style.json` scenes{} and `location-framing.md`. Flag rooms with a scene but no framing entry
   ("scene un-backed" — a hand-edit whose reasoning was never recorded; send to `/frame`), and rooms
   with framing but no scene ("not distilled yet").
2. **Grade the distillation:** does the scene (a) preserve source nouns or paraphrase them away
   (rule 1)? (b) place every feature image-relative with zero compass words and no vague hedges
   (rule 2 + lint)? (c) keep surface defaults conservative + per-zone (rule 3)? (d) hold layer
   discipline (rule 4)? (e) say anything the framing+facts don't justify, or contradict the framing
   (drift)? Per room, output the rules it fails + a one-line fix.
3. Add a **clusters** line for a rule violated across many rooms (e.g. "12 rooms hedge placement → the
   compass→frame translation was skipped game-wide; their framing likely lacks pinned facings").
4. Without `--fix`: stop, offer to apply. With `--fix`: re-distil the affected scenes; report
   before→after. Never silently overwrite a human-tuned override — show the change.

## On completion — stamp provenance
Scene is the terminal phase-2 artifact, so it stamps the pipeline step (still named `mold` for
`/studio`'s staleness/dependency logic — `/frame` + `/scene` together ARE phase-2 "mold"):
```
node tools/stamp-pipeline.cjs <game> mold
```
(Author mode after writing overrides; review `--fix` that materially rewrites overrides should also
re-stamp; a no-change audit need not. Writes `pipeline.json`, dev-only — no app version bump. See
`.tome/pipeline-provenance-stamps.md`.)

## Notes
- Dev-only data (`style.json`) — do NOT bump the app version.
- Scene writes ONLY `style.json` scenes{}. Don't touch `room-facts.json` (phase 1) or
  `location-framing.md` (phase 2a / `/frame`).
- Sibling skills: `generate-room-facts` (phase 1), **`frame` (phase 2a — the judgment this distils)**,
  the render skill (phase 3), `/studio` (orchestrator), `/review-notes` (reviews rendered images; this
  skill's review audits the scene *text*).
