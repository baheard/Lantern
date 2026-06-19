---
title: art-sandbox
tags: [location-art, sandbox, reviewer, tooling, prompts]
created: 2026-06-19
updated: 2026-06-19
aliases: [sandbox, prompt sandbox, art playground]
---

# Art Sandbox (reviewer free-play workbench)

A **Sandbox** topic in the location-art reviewer (`tools/review-server.cjs`) for playing with
prompts/artists **without committing**. Built 2026-06-19. Peer of the Audition topic.

## What it is
A location-page-shaped workbench where **all four layers are editable** (App / Artist /
Aesthetic / Scene) — unlike the real location page where only Scene is editable and the rest
are read-only ✎-Edit fields. Three dropdowns up top: **Game** (drives location list + loads
its Aesthetic/App), **Location** (loads that scene's resolved text), **Artist** (loads that
artist's style, or "— custom (unsaved) —"). A read-only **Composed prompt** at the bottom
live-updates as you type. Generate piles renders into a gallery; each render carries an
**artist chip** (`artistName` + ` · edited` when the Artist text diverged from the roster).
Clicking a render **restores every field** it was made with.

## Key design decisions
- **Nothing touches `artists.json` until you explicitly commit.** Two off-ramps by the Artist
  field: **Save as new artist** (`/api/artist-create`) and **Overwrite \<artist\>**
  (`/api/artist-style-by-id`, global). The roster is otherwise untouched.
- **Renders persist per game** in `<game>/_sandbox/`, named `sbx-rN.png`. Each render writes
  THREE files: `.png`, `.txt` (flat prompt, written by `gen-room-images.cjs` like every gen),
  and a **`.json` sidecar** holding the structured field values
  (`app, artist, aesthetic, scene, artistId, artistName, edited, locSlug, locName, prompt`).
  The `.json` is what makes "click a render → repopulate all editable fields" possible — the
  `.txt` alone only has the flat composed string.
- **Reuses the audition plumbing almost entirely.** `sandboxGen()` mirrors `auditionGen()`
  (same execFile → `gen-room-images.cjs` → JOBS → `/api/jobs` poll). New compose helper
  `composeInline({app,artist,aesthetic,scene})` joins the four layers in hierarchy order
  (App ▸ Artist ▸ Aesthetic ▸ Scene) — same order as the client `composedPrompt()` and
  `composedFor()`. Sandbox sends the raw field values; the server composes (single source of
  truth) and stamps the result into both sidecars.
- **"⚗ Sandbox!" entry points** on (1) the location-page button row and (2) every audition
  cell. They set a module-global `SANDBOX_PREFILL` then `selectTopic('sandbox', game)`;
  `detailSandbox()` applies the prefill over fresh defaults, then clears it. Audition prefill
  carries only `artistId`/`artist`/`locSlug` and lets `detailSandbox` resolve the scene text
  from the loaded game (App/Aesthetic come from the loaded game defaults).
- **"edited" marker** = `SBXW.artist !== rosterStyle(artistId)`. Computed at render for the
  field label `Artist · <name> (edited)` and stamped into each render's sidecar so the chip
  is truthful about whether that image used the committed style or a tweak.

## Refinements (2026-06-19)
- **Field order + label colours mirror the location page.** Layers render in reverse hierarchy
  (closest-to-room first, **App last**): Scene → Game → Artist → App. Each label uses the same
  `scope-*` class as the location page so the tag colours match (Scene purple `scope-scene`,
  Game/Artist blue `scope-global`, App pink `scope-app`). **Gotcha:** do NOT also add
  `scope-editable` to the field — its `.tag` rule is defined last in the CSS and would override
  every tag to gold. All four textareas keep the normal editable (`class="edit"`) styling.
- **"Sandbox!" carries the selected picture in** (`/api/sandbox-adopt` → `sandboxAdopt()`):
  copies the source PNG into `_sandbox/` as a new `sbx-rN`, writes a `.json` sidecar from the
  resolved layer fields and a `.txt` = the source's own recorded prompt (its true provenance,
  not the recomposed one), then selects it. The adopt runs **inside `detailSandbox`** after the
  prefill resolves all four fields — so both entry points (location page + audition cells) share
  one path. `SANDBOX_PREFILL.adopt = {srcKind, srcFile}`; srcKind resolves: `audition`→_audition,
  `sandbox`→_sandbox, else `review`→_review with a committed (`<game>/`) fallback.

## Endpoints / state
- `GET /api/sandbox?game=` → `{slug, images:[{file, ...sidecar, prompt}]}` (newest last).
- `GET /img/sandbox?game=&f=`.
- `POST /api/sandbox-gen {game, fields, meta, provider, quality, model}`.
- `POST /api/sandbox-reject {game, file}` (removes png+txt+json).
- `POST /api/sandbox-adopt {game, srcKind, srcFile, fields, meta}` → copies an existing image in.
- Client working state = `SBXW` (one live object, `_game`-keyed; rebuilt on game switch).
  The Sandbox topic's left item-list is the **games** (like Audition); the game dropdown in
  the workbench just calls `openItem(game)`.

See [[art-direction-model]] for the four-layer model and [[artist-audition-design]] for the
audition pipeline this reuses.
