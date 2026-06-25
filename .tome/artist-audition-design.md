---
title: artist-audition-design
tags: [location-art, art-direction, artview, audition, portfolio, roster]
created: 2026-06-18
updated: 2026-06-22
aliases: [artist development, audition flow, per-game artist selection, portfolio, finalists, shortlist]
---

# Artist development & audition (per-game artist selection)

Design agreed 2026-06-18 (user brainstorm). Builds on the three-layer model in
[[art-direction-model]] (`App ▸ Artist ▸ Aesthetic(per-game) ▸ Scene(per-room)`).

## Borrowed images: audition cells reuse art made elsewhere (2026-06-19)
An empty audition cell (artist × scene) now falls back to showing a **tagged image already
made for that artist+location elsewhere** — so work done in the Sandbox or on a location page
shows up in the grid without re-rendering. Native audition image **always wins**; only empty
cells borrow. Latest-by-file-mtime across sources. Borrowed thumbs get a `sandbox`/`location`
badge + dashed outline and open in a one-off lightbox (`lbMode:'one'`, since they live outside
the audition list/dir).

**Foundation: tag the artist on EVERY generated image.** Each gen path records which artist
made the image so cross-source matching is reliable, not guessed:
- **Audition** — artist is already in the filename (`<artistId>__<scene>__…`).
- **Sandbox** — `_sandbox/*.json` sidecar carries `artistId`+`locSlug` (see [[art-sandbox]]).
- **Location `_review/` regen** — `regen()` now writes `<img>.json` `{artistId, artistName,
  locSlug}` (the game's selected artist at gen time, passed from the client).
Server `scanTaggedImages(slug)` reads the sandbox+review sidecars, groups by
`artistId__locSlug`, keeps the latest mtime; `auditionState` exposes it as `borrowed` (minus
keys that already have a native audition take). **Gotcha:** images generated *before* this
change have no sidecar → unmatchable. We deliberately do NOT try to infer artist from history
(a `_review` candidate never recorded its artist). `_review`/committed images stay untagged
unless regenerated.

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

## Iteration 2026-06-18 (session 2) — bridging, terminology, fixes

- **"House artist" → "Game artist"** everywhere user-facing (button/badge/toast/subtitle).
  "House artist" was vestigial from the abandoned one-artist-for-the-whole-app idea.
  Internal CSS class / `data-house` attr names left as `house` (invisible; tight diff).
- **Audition scenes 3 → 4.** All clamps now 4: `suggestScenes` slice, `auditionState`
  slice, `saveAuditionCfg` slice, client scene-slot array `[0,1,2,3]`.
- **Per-artist "Audition ▸" button** (row header) renders that artist across ALL selected
  scenes in one click at the current genMode — `audArtistGen(artist)`. Always a fresh take
  per scene (not fill-gaps). Confirms count + per-model cost.
- **+ New artist** from the Artist rail topic: `POST /api/artist-create` → `createArtist()`
  slugifies id from name, dedups, appends to global `artists.json` with empty `examples[]`.
- **genMode dropdown reordered by cost** (low → Gemini → Nano Pro → OpenAI-high) and
  **OpenAI-high now gets a cost confirm** (~$0.21) like Nano Pro, on every gen path.

### Audition pieces bridged onto the location page (the non-obvious bit)
Audition images now appear as candidates on the matching **location** page (scene slug ==
location slug), tagged + artist-attributed, deletable + promotable from there. Artist
*switching* still lives ONLY on the audition page (per user: audition = experiment across
artists; location = refine the chosen one). Per-image artist attribution shows **only** on
audition pieces (native candidates aren't tagged with who made them).

**Load-bearing scheme: the `aud:` candidate-id prefix.** A "candidate" in this tool is a
bare filename string used in ~8 places, and audition images live in a *different* dir
(`_audition/`) served by a *different* endpoint (`/img/audition` vs `/img/review`). To
surface them as candidates without a data-model rewrite, audition candidate ids carry an
`aud:` prefix (`aud:<artist>__<scene>__<tag>-rN.png`). Touchpoints that decode it:
- `locationsFor` — appends `aud:`-prefixed ids for the room's slug; builds `auditions`
  map `{id:{artist,artistName}}`; `candPath()` resolves id→disk path (audition vs review).
- `promote` / `reject` — branch on the `aud:` prefix to read/delete from `_audition/`.
- Client `candImg(f)` / `candUrl(f)` — `aud:` → `/img/audition` (no committed fallback);
  native → `/img/review` with `/img/committed` onerror fallback. Used by the strip, big
  preview, and lightbox 'loc' mode.
- Strip shows a blue `audition` corner pill (`.cand.aud`) + an `m-aud` chip "audition ·
  <artistName>"; promoting one flips the pill to "★ in game" (byte-compare matches).
- Prompt sidecar already written by `gen-room-images.cjs` next to `--out`, so the
  location page's "Actual prompt" panel works for bridged pieces with no extra work.

### Bug fixed: unclickable bottom-right Generate button
`#status` (the toast) is `position:fixed; bottom:14px; right:18px; opacity:0` but had no
`pointer-events:none` — so the invisible toast sat in the bottom-right corner eating clicks
(text/I-beam cursor, no effect) over whatever was under it, e.g. the last audition-grid
row's Generate button. Fix: added `pointer-events:none` to `#status`. Watch for the same
trap on any other always-present `opacity:0` fixed overlay.

Delete uses the native browser `confirm()` (a custom Enter/Space/X modal was built then
reverted per user — "browser dialog for now is fine").

## Iteration 2026-06-22 — finalists (the shortlist stage) + select all/none

Adds a middle rung to the funnel: **roster → checked into the grid (cfg.artists) → finalists
(cfg.finalists) → game artist (selected-artist.json)**.

**Design fork (decided with user):** "finalist" is a **separate flag from the grid checkbox**,
NOT a reuse of it. The checkbox is *grid membership* — unchecking deletes the row and hides
that artist's images, which is destructive to a comparison task. The finalist ★ is
non-destructive: a culled artist stays visible, just unstarred, so you can reconsider. The
rejected alternative was "F in the lightbox just unchecks the artist" (simpler, but removing
hides the images). Funnel narrows 18→3 by **promoting keepers** (finalists start empty) rather
than eliminating losers — fewer keypresses.

- **Server:** `auditionState` reads `cfg.finalists` (empty default) and adds `finalist:bool`
  per artist. `toggleFinalist(slug, artistId, on)` (single-artist, lightweight — not a full
  grid scrape) persists `audition.json` `finalists[]`. Endpoint `POST /api/audition-finalist`.
  `saveAuditionCfg` unchanged (only touches `scenes`/`artists` arrays it's passed, so a
  finalist toggle and a select-all post never clobber each other).
- **Client:** row header ☆/★ **Finalist** toggle (`.finbtn`, gold when on) + ★ next to the
  name + gold inset row stripe (`.aud-rowhead.finalist`; stacks with the green `.house`
  stripe). A `.aud-tools` bar under the checkboxes: **Select all** / **Select none**
  (`audSelectAll(on)` posts the full/empty `artists` list) + a **Finalists only** filter
  (`audFinalistsOnly`, client-only state) that narrows the grid rows to starred artists.
- **Lightbox (aud mode only):** top-centre ☆/★ button (`.lbfin`) + **F** hotkey toggle the
  finalist for the image's artist. Artist id is parsed from the filename (`audArtistOf` =
  `f.split('__')[0]` — relies on the load-bearing `__` convention above). Caption now shows
  the **artist name** instead of the raw filename. Toggling re-renders the grid behind the
  lightbox and re-paints the LB; `renderLB` clamps `lbIndex` because the "finalists only"
  filter can shrink the list under an open lightbox.

Dev-tool change (`tools/review-server.cjs` only) — no app version bump (consistent with other
tools/skills-only commits).
