---
title: pipeline-provenance-stamps
tags: [studio, art-pipeline, provenance, staleness, tooling]
created: 2026-06-26
updated: 2026-06-26
aliases: [pipeline.json, stamp-pipeline, staleness flags, step provenance]
---

# Per-game pipeline provenance & staleness (`pipeline.json`)

`/studio`'s Mode B dashboard **derives** "is this step done" from the real files (walkthrough,
hints, room-facts.json, style.json, selected-artist.json, .pngs) — that stays the source of truth.
What it could NOT know was *when* or *at what version* each step was done, so a **stale** step went
undetected. This bit Dreamhold (2026-06-26): the old `room-facts.json` was pre-hardening, and mold
would have run on garbage — caught only by eyeballing the file mtime.

## The fix — a thin provenance overlay
`tools/stamp-pipeline.cjs <game> <step>` writes/updates
`docs/games/images/<game>/pipeline.json`:
```json
{ "<step>": { "at": <ISO>, "version": <docs/js/config.js version>, "commit": <git short hash> } }
```
Step keys (pipeline order): `walkthrough · hints · room-facts · aesthetic · mold · artist · render`.
Each pipeline skill calls it on completion. Dev-only — does **not** bump the app version.

## Staleness rules (studio overlays these on the derived ✓/✗)
1. **Out-of-order (the load-bearing one).** A step is `⚠ stale` if its `at` is earlier than any
   dependency's `at`. Deps = steps above it: room-facts←walkthrough; aesthetic←room-facts;
   mold←room-facts; artist←mold+aesthetic; render←mold+aesthetic+artist. This is precisely the
   "mold ran on a pre-regen pack" bug.
2. **Pre-major-change.** Step `version` behind current by a **major/minor** bump → `⚠ pre-1.6`.
   A patch gap (1.5.680→1.5.682) is normal and NOT flagged — art-data work doesn't bump the version,
   so `at`/`commit` are the reliable signals; `version` answers only "before a major change".

Missing `pipeline.json` or absent step key ⇒ no stamp, NOT stale (older games predate stamping).

## Why not just file mtimes?
mtimes ARE the out-of-order signal in principle, but they're fragile across git clone/checkout
(every file gets the checkout time). A recorded `at` survives that. `version`/`commit` add the
"done before a major change" axis mtimes can't give.

## Rollout status (2026-06-26)
Helper + studio read-logic built; Dreamhold backfilled from mtimes (so its early steps read
`version 1.5.682` — a one-time backfill artifact; `at` is accurate). **The stamp call is now wired
into all 7 steps:** trace-walkthrough, generate-hints, generate-room-facts, mold, render-rooms (each
has an "On completion — stamp provenance" section), plus studio's two inline goals (aesthetic = Goal
3, artist = Goal 5). **Auditioning is manual in Artview** — the "Make game artist" button writes
`selected-artist.json` but does NOT stamp, so studio/Claude stamps `artist` on the user's say-so.
See [[art-direction-model]] for the pipeline phases this stamps.
