---
title: artist-audition-design
tags: [location-art, art-direction, artview, audition, portfolio, roster]
created: 2026-06-18
aliases: [artist development, audition flow, per-game artist selection, portfolio]
---

# Artist development & audition (per-game artist selection)

Design agreed 2026-06-18 (user brainstorm). Builds on the three-layer model in
[[art-direction-model]] (`App ▸ Artist ▸ Aesthetic(per-game) ▸ Scene(per-room)`).

## Decisions (locked)
- **Artist signature stays GLOBAL.** Editing an artist's `style` in `artists.json`
  affects every game — preserves "one hand across games." A game that needs a
  different feel pushes that into its **Aesthetic** (already per-game, already
  editable), NOT into a per-game artist fork. "Artist development" = growing a
  **roster** of distinct personas, then picking the best per game.
- **Audition scenes: auto-suggest, user-overridable.** Pick 3 from `style.json
  scenes` — one **exterior** (weather/light), one **dim interior** (chiaroscuro /
  near-black darks), one **signature/atmospheric** room (the money shot). These
  three stress an artist's range.
- **Audition set: user-selected subset** of artists (not necessarily all roster).

## What already exists (don't rebuild)
- Per-game artist selection IS the data model already: `<game>/selected-artist.json
  = {id}`. "Different artists for different games" is solved — what was missing is a
  way to *decide*.
- Artist signature already editable in the artview Artist tab (`saveArtistStyle` →
  global `artists.json`). Selection via `selectArtist` (`review-server.cjs`).
- Each artist has `examples[]` (currently a fixed generic sampler hilltop/cell/alley
  in `_artists/`). Natural seed for portfolio.

## Audition flow (the new piece)
1. Artist tab: select a SUBSET of candidate artists to audition for the current game.
2. Auto-suggest 3 scenes from `style.json scenes` (exterior / dim interior /
   signature), each swappable.
3. Render `subset × 3 scenes` through the EXISTING compose path
   (`gen-room-images.cjs`, OpenAI-low default per [[feedback_openai_low_default_art]]),
   using the game's real Aesthetic + real Scene prompts → production-faithful, not a
   throwaway sampler.
4. Output to `docs/games/images/<game>/_audition/<artistId>-<scene>.png` (+ `.txt`
   prompt sidecars — matches existing per-candidate provenance convention).
5. Comparison grid (artists × 3 scenes) reusing the reviewer's image+prompt+notes cells.
6. "Make house artist" = existing `selectArtist` write to `selected-artist.json`.
   Optionally promote winning shots into that artist's `examples[]`.

## Why audition matters beyond one game
It's also the roster-building mechanism: a new persona gets proven by auditioning
across 2–3 games before becoming "house." Gives `examples[]` real provenance.

## BUILT 2026-06-18 (in the artview reviewer)
Lives in `tools/review-server.cjs` as a new **Audition** rail topic (per-game; the
middle pane lists games, pick one).

**Server**
- `composedFor(slug, artistId, sceneSlug)` — composes App ▸ Artist ▸ Aesthetic ▸ Scene
  for an ARBITRARY artist (not the game's selected one). Mirrors the client
  `composedPrompt()` incl. `cap()` on the aesthetic.
- `classifyRoom()` / `suggestScenes(slug)` — heuristic auto-suggest of one exterior +
  one dim-interior + one signature (longest-description) room. Keyword-based; best-effort.
- `auditionState(slug)` — `{scenes, allScenes, artists(+selected), houseArtist, images}`.
  Reads `<game>/audition.json` `{scenes:[≤3], artists:[]}` (empty/absent artists ⇒ all;
  empty/absent scenes ⇒ auto-suggest).
- `auditionGen(slug, scene, artist, provider, quality, model)` — same execFile/JOBS
  plumbing as `regen()`; writes to `<game>/_audition/<artistId>__<sceneSlug>__<tag>-rN.png`
  (+ `.txt` sidecar written by gen-room-images). Jobs carry `kind:'audition'`.
- Endpoints: `GET /api/audition`, `GET /img/audition`, `POST /api/audition-config`,
  `POST /api/audition-gen`. "Make house artist" reuses `POST /api/select-artist`.

**Client** — `detailAudition()`/`renderAudition()`: 3 scene `<select>` slots + artist
checkboxes (both auto-save cfg on change), genMode dropdown (default OpenAI-low),
"Generate all missing", and a grid (rows=artists × cols=scenes) with per-cell
Generate/Regenerate + lightbox zoom (`lbMode:'aud'`), per-row "Make house artist".
`pollGens` refreshes the grid on job completion.

**Filename convention** is load-bearing: `<artistId>__<sceneSlug>__<tag>-rN.png`. The
double-underscore separators let `listAuditionImages()` split artist/scene even though
both contain single hyphens. rN = successive takes of that one cell.

Decisions held: signature stays global (no per-game fork); auto-suggest overridable;
user-selected artist subset. Generation defaults to OpenAI-low per
[[feedback_openai_low_default_art]].
