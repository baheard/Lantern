---
title: art-direction-model
tags: [location-art, prompts, art-direction, gemini, anchorhead, dreamhold, theatre]
created: 2026-06-16
updated: 2026-06-24
aliases: [artist persona, style layers, art prompt structure, app layer]
---

# Art-direction model: App / Artist / Aesthetic / Scene

Location-art prompts compose **four independent layers** (App added 2026-06-18; was three).
Keeping them separate is what lets one art identity span every game without per-game restyling.

0. **App** (global, above Artist — same for every game AND every artist). Universal hard
   constraints that hold no matter who the artist is: `Portrait 3:4`, recessive backdrop /
   accompaniment to story text, `no people / text / lettering / UI`, and depict-only / no-invention.
   (The old THRESHOLDS exit-form rule was REMOVED 2026-06-23 — exit handling is now wholly the mold's
   job; see "Exits have no default form" below.) Lives in
   `docs/games/images/_app/app.json` (`{ "prompt": "…" }`). Prepended to every composed prompt.
1. **Artist** (universal — same for every game). Medium + technique + how that medium handles
   tone, light, colour and finish: line, wash, paper, edge treatment, tonal range, palette
   disposition, composition habits. **The artist's identity is SOVEREIGN** — when a game's mood
   and the artist's medium conflict, the medium wins: a colour-forward artist (storybook) stays
   colourful on a grim game; you don't get to desaturate it into gloom (you'd get an
   eerie-but-colourful take, which is correct). The artist names its own medium/technique, never
   the specific world or subject.
2. **Aesthetic** (per game). The world + the mood, in **feeling-words only**: era, materials,
   architecture, condition, recurring world-facts, and the emotional register. Anchorhead =
   gothic Lovecraftian dread, decay, stormy. Dreamhold = luminous wonder, serene, verdant marble.
   **Never names medium, palette, or contrast level** — those are rendering technique and belong
   to the artist. The aesthetic GUIDES mood; it never dictates how a medium renders it. (Reverses
   the earlier "the Aesthetic must spell out deep chiaroscuro / desaturated palette" rule — see
   Superseded below. Full authoring rules: "Authoring a game aesthetic".)
3. **Scene** (per room). Literal contents from the walkthrough-scraped room text. **Faithful and
   unwavering** — only what the prose says; nothing invented, *including* no invented light,
   colour cast, glow, or mood (no "eerie, dim red glow" on a room the source never lit that way).

Composed prompt — **order matters, the artist LEADS so the medium isn't drowned**:
`Artist + " " + ARTIST_LEAD + " Scene: …" + " Aesthetic: …" + " " + App`. The `ARTIST_LEAD` clause
tells the model the medium governs lighting/colour/finish over the atmospheric notes that follow —
that's artist-sovereignty in code. Defined identically in `gen-room-images.cjs`, `review-server.cjs`
server (`composedFor`) and client (`composedPrompt`); keep all three in sync. (Was `App ▸ Artist ▸
Aesthetic ▸ Scene` before 2026-06-22 — that order buried the artist and collapsed every medium into
one dark render; see the 2026-06-22 section.)

## Authoring a game aesthetic — the rules (codified 2026-06-22)
There was no rule for this before — aesthetics were typed ad-hoc into the artview "Style · this
game" box (`/api/style` → `style.json.aesthetic`), guided only by a one-line hint that encoded the
*wrong* model ("palette/mood/light/era"). That gap is what caused the collapse-everything-to-murk
problem. The rules:

**An aesthetic answers two questions, and only two: what is this world, and how does it feel.**
- **World** — era, materials, architecture, condition, recurring world-facts (e.g. "dry above,
  wet only in the cellars below"). What the place IS, stable across every artist.
- **Mood** — the emotional register in feeling-words: "gothic dread, faded grandeur, decay" /
  "luminous wonder, serene." A light touch — it guides, it never insists.

**Never put in an aesthetic** (these are the artist's job; each one steamrolls every medium into
one look): medium/technique ("ink", "oil", "photographic"); palette or named colours
("desaturated", "indigo/slate", "dusty crimson"); contrast/tone directives ("deep chiaroscuro",
"high contrast", "near-black darks"); blanket lighting specs ("dim, lit by weak grey light").
Per-room light belongs to the **Scene** (a named lamp, daylight from a window); tonal rendering
belongs to the **Artist**.

**The casting principle.** A game's tonal register is set by *which artist you cast*, not by
cranking the aesthetic. If a game looks wrong, **recast the artist first.** The audition bake-off
([[artist-audition-design]]) exists precisely to choose the register.

**Litmus test.** If a line would read as a contradiction under a deliberately off-register artist
(storybook on a horror game), it's reaching into the artist's territory — cut it. "Ruined Edwardian
theatre, gothic gloom" survives storybook (you get an eerie-but-colourful ruin). "Desaturated
near-black chiaroscuro" does not — it's fighting the medium.

## The chosen artist: **Aldous Quill** (validated 2026-06-16, Anchorhead + Dreamhold)
The house artist is named **Aldous Quill** (id stays `ink` in `artists.json` so nothing
breaks). Loose impressionistic hand-drawn **ink linework over watercolor wash**; visible
pen lines, granular paper texture, **soft ragged blotchy edges fading into a bare
cream/white-paper margin — an *unframed illustration plate***; **full tonal range with
rich near-black darks**; recessive backdrop; portrait 3:4; no people/text/UI. Ink chosen
over pixel as the universal style: it reads across genres (pixel screams "retro game" and
the model won't produce true pixels without a downscale pass), stays recessive, and
recolors per game via Aesthetic.

### Framing decision — RESOLVED 2026-06-16 (white paper, not dark fade)
This **reverses** the earlier "fade to near-black at the margins / dark-mode blend" call.
User review (Anchorhead) rejected renders with a **black outer frame** and a **smooth
rectangular inner border**, wanting the look of a drawing made *on* paper: bare cream/white
paper showing at irregular, ragged edges. The Artist style now carries explicit negatives:
*"NO hard rectangular border, no black frame, no smooth rectangular vignette or inner box —
bare white paper shows at the irregular edges."* This applies to ALL games (it resolves the
"bright games keep white paper" tension in favor of white paper universally).

## Hard-won lessons (the gotchas)
- **No motif as a hard rule.** A baked-in "single warm lantern/window glow" lit a window
  in *every* render — narratively wrong for an empty house. Recurring motifs fight the
  source; lighting must come from the Scene, not the Artist. (The app's empty-room
  placeholder glyph is UI chrome, not art — that lantern stays; the *picture* motif goes.)
- **Weather is Scene-level, not Aesthetic.** "rain streaks" in the Artist/Aesthetic would
  soak dry cellars too. Anchorhead is rainy *outdoors*; interiors aren't.
- **Contrast must be explicit — SUPERSEDED 2026-06-22.** This was the rule that caused the
  collapse: forcing "deep chiaroscuro / near-black / high contrast" into every game's Aesthetic
  flattened *every* artist into the same dark digital painting (oil, comic, riso, photo all came
  out identical). Tonal contrast is now the **artist's** job, not the aesthetic's. If a game needs
  menace, **cast a high-contrast artist** (drypoint, pastel-nocturne, pulp) — don't spell contrast
  into the aesthetic. See "Authoring a game aesthetic" above.
- **Dark-mode blend:** don't invert to light-on-black (reads as chalk/scratchboard). Keep
  natural painting but full-bleed with a dark ragged vignette fading to near-black. Bright
  games (Dreamhold) resist the dark fade and keep white paper — unresolved tension for
  luminous aesthetics.
- **Per-candidate prompt provenance:** `gen-room-images.cjs` writes a sidecar `<img>.txt`
  with the exact prompt; the reviewer shows the selected image's real prompt (not the
  stale frozen pack prompt). Essential once ad-hoc/regen prompts diverge from the pack.

## Spatial / narrative fidelity (standing rule)
The scraped room description gives *contents* but not the **geometry that the
puzzles/map depend on**. Before generating, cross-check against adjacent rooms and
puzzles and bake the needed spatial facts into the Scene (subtly — plausible, not
blatant):
- **Anchorhead Alley window** — alley says "window high on the **north** wall"; the
  **File Room** says "window high on the **south** wall." Same window. The puzzle is to
  climb the stacked garbage cans/boxes and through it into the file room — so the window
  must sit on the correct wall *just above the cans*, reachable. Several earlier renders
  put it where the climb made no sense.
- General: honor relative exit directions, which rooms are adjacent/visible from where,
  light sources that imply time/occupancy, and any object a puzzle interacts with.
This wants a **per-room "art note" override** in the composable pack (Artist + Aesthetic
+ Scene + optional spatial note), since `gen-room-facts.cjs` can't infer adjacency
from prose alone.

## How to craft a Scene prompt (the recipe)
**Claude constrains; nanobanana renders.** Every review reject so far was the model
*juicing on its own* — inventing a doorway, an archway, dramatic lightning, heaping on
trash. So the Scene layer's job is the OPPOSITE of embellishment: pin down the literal
facts and fence off the hallucinations. The artistic juice comes from Aldous Quill +
the Aesthetic, not from the Scene text.

When writing/editing a `scenes[slug]` override:
1. **Read the in-game prose** (shown in the reviewer as "In-game description"). Extract
   only concrete, visible facts: materials, layout, sightlines, the one or two objects
   that matter, the light source.
2. **State geometry explicitly** — which wall a feature is on, what the space dead-ends
   at, relative directions a puzzle/map depends on (see Spatial fidelity below).
3. **Constrain what the model tends to invent** — pin the literal facts and rule out the
   usual hallucinations (`"cobblestone NOT dirt"`, `"no archway"`). Phrase it however reads
   naturally; recurring junk is usually a contradiction in the Scene's own content (see below).
4. **Strip transient/randomized flavor**: NPC movement ("Michael follows you"), dialogue,
   coughing, and *randomized weather* (e.g. Anchorhead's sheet-lightning line is randomized
   flavor in the room text, not the permanent scene) — keep these OUT of the Scene.
5. Keep it tight and literal; the prose's purple adjectives are the Aesthetic's job.

## 2026-06-22 — artist-first compose order + realism personas + gotchas
**Symptom (user, theatre audition grid):** every artist looked the same — oil, comic, riso, sumi
all rendered as one dark moody digital painting. Confirmed by eye across the witch's-lair row.

**Cause:** the one-sentence artist clause sat buried mid-prompt (App ▸ Artist ▸ Aesthetic ▸ Scene)
and lost to the long App + Aesthetic + Scene text, AND the theatre Aesthetic dictated rendering
technique (chiaroscuro / near-black / desaturated) that overrode every medium. OpenAI-low especially
collapses to a default digital-painting look.

**Fix — both levers together:** (1) reorder so the **artist leads** + the `ARTIST_LEAD` clause says
the medium governs lighting/colour/finish over the notes that follow; (2) strip rendering-technique
words out of the aesthetic (now world + mood only — see "Authoring a game aesthetic"). Proven on
witch's-lair at **OpenAI-low** (no model upgrade): plein-air → real impasto oil, risograph → flat
misregistered ink layers, silver-plate → a sepia photograph. comic-panel improved but stays the
weakest (flat-ink comic is hardest for gpt-image-low).

**New personas** (`_artists/artists.json`): `film-still`, `available-light`, `silver-plate`
(photographic), `cg-render` (3D). Photoreal is the ONE thing OpenAI-low does well — it's the
collapse default — so these survive low quality where painted styles needed the reorder.

**GOTCHA — photoreal + figurative nudity trips OpenAI output moderation.** `film-still` and
`available-light` HARD-FAILED on witch's-lair (`safety_violations=[sexual]`): the bare-breasted
four-armed goddess statue, rendered photorealistically, reads as a nude. Stylized / painted / CG /
sepia passed; pure photorealism didn't. Fix at the SOURCE — drape such figures in the Scene override
("draped in flowing bronze robes"), faithful (the prose never said nude) and it unblocks photoreal.
Or render those rooms on Gemini.

**Don't invent light/mood in a Scene override.** "eerie, dim red glow" had been molded onto
witch's-lair though the source says only "red BRICK" + a "bubbling" (unlit) cauldron. Removed. Scene
= source-grounded facts only; tonal mood is the artist's. (Mold factor 9/12 tightened.)

**Lobby poster over-tiling.** The theatre-lobby override said "rows of posters … cover the lower
walls … worn and indistinct" → the model tiled many small messy posters. "A few large, bold posters
… faded but still striking" gives the prestigious look. Over-specified quantity + "indistinct" =
clutter.

## App layer trimmed; INDISTINCT-surface rule pulled (2026-06-23)
Trimmed `_app/app.json` ~230→~95 words — same rules, tighter prose (the verbose App tail is
exactly what drowns the artist; see 2026-06-22). Cut: "taller than wide" (redundant with
Portrait 3:4) and the invention example-list shortened to categories (`furniture, figures,
windows, architecture` — trust the categories, drop the named seating/skylight/archway cues).
**Removed for now (user call): the Tier-1 named-but-undescribed-surface → INDISTINCT clause** —
the one that killed the Lobby's random-girl posters + invented portrait (see 2026-06-22
examine-miss hardening). The no-lettering half survives via "no text, lettering" in the negatives,
but a *named but unexamined* surface (painting/poster/mural/sign) is no longer fenced by App — the
model may again invent specific imagery on it. If invented wall-art reappears, this is why; restore
the clause.

## Done 2026-06-16 (was "Still TODO")
Three-layer composition is formalized and live:
- Global `_artists/artists.json` (Aldous Quill, id `ink`), picked per game via
  `<game>/selected-artist.json`.
- Per-game `<game>/style.json` = `{ aesthetic, scenes{slug: override} }` — both the game
  Aesthetic and per-room Scene overrides live here (it's one file per game).
- `gen-room-images.cjs` batch mode now COMPOSES Artist + Aesthetic + Scene from those
  files (mirrors `review-server.cjs` `composedPrompt()`), discarding any stale baked
  preamble in `room-facts.json`. `gen-room-facts.cjs` now emits **scene-only** prompts
  (no baked style). See [[location-art-system]].

## Don't chase marginal FRAMING nitpicks by editing the global Artist text (2026-06-16)
Hard-won the painful way on the Anchorhead alley. A review note said the white paper
border was "a little too big/wide." Trying to encode "slightly smaller margin" into the
global `ink` (Aldous Quill) artist style backfired every regen:
- "slim margin / fills most of the frame / bleeds close to the edges" → a *too-perfect
  rectangle* (clean square frame, the opposite of the loose deckle edge).
- "modest margin / irregular, splotchy, ragged bays / NOT a clean rectangle" → an even
  WORSE prominent border-drawn-then-blotched-over, plus the model started adding green
  moss it hadn't before.

Lessons:
- **The model can't reliably dial margin WIDTH up/down via prose** — small wording nudges
  cause large, wrong, stochastic swings, and "fix the edge" easily trades away the ragged
  quality that made the original good. Framing/edge feel is emergent, not a knob.
- **The original artist text already produced the best take (`alley-painter`).** When a
  generated image is good, KEEP it; a marginal framing nitpick is not worth editing the
  GLOBAL artist (which then degrades every game's next regen).
- Routing was correct (border = Artist layer), but the right *resolution* of a minor
  framing note is often **"won't fix / keep the good render"**, not a prompt edit.
- Reverted the artist text to the original; kept the committed `alley-painter`.
- Contrast: the SAME note's *window-too-high* half was a real, fixable SCENE/geometry
  issue — verified against the in-game prose + puzzle and corrected cleanly. Geometry/
  content notes are encodable; subjective framing-feel notes mostly are not.

## No-people rule has an exception; "no people/text/UI" may want an App layer (2026-06-17)
- **No-people is the default, NOT absolute.** Follow the Artist's `no people` guideline
  *unless the scene pivots on the people* — i.e. a figure is the literal subject the room
  exists for. Anchorhead Master Bedroom: "Michael is curled up in bed, sound asleep" —
  Michael is the protagonist's **husband (adult)**, not a child; he's incidental to the
  *room*, so he stays out and the bed just reads "bedclothes rumpled." A room that only
  makes sense *with* its occupant would be the exception.
- **App layer — BUILT (2026-06-18).** The proposed 4th layer is live: `docs/games/images/_app/app.json`,
  read by both `review-server.cjs` (`appPrompt()`) and `gen-room-images.cjs` (`appPromptText()`),
  prepended to every composed prompt. Editable in the reviewer (`/api/app-prompt`, global across games).
  On 2026-06-18 the constraints that were duplicated **verbatim across all four artists** were
  promoted into it: `Portrait 3:4`, recessive backdrop / accompaniment to story text, and
  `no people / text / lettering / UI`. Each artist `style` was trimmed to only its own medium
  (palette, light, contrast, edge treatment) — net composed prompt is unchanged, just deduplicated.
  - **Promote only what's common to ALL artists.** Left per-artist on purpose: the
    "no hard border / bare-paper margin" rule (only ink + storybook, the paper media) and the
    contrast/tonal treatment — gouache/pixel are *low-contrast*, ink/storybook are *full-range*;
    these **conflict**, so they can't live in App. Rule: a constraint goes to App only if it's
    universal AND non-conflicting across every artist.

## Editing artist styles in the reviewer (Artist topic page) — 2026-06-18
The Artist topic page (`detailArtist`) Style-signature box is now inline-editable via a
`✎ Edit` button (`artistEditStyle(id)` → `/api/artist-style-by-id`). Edits **by id**, so any
artist can be tuned there, not just the game's currently-selected one — important for a freshly
**created** artist (e.g. "Comic book style") that isn't anyone's house artist yet. Saves are
GLOBAL (writes back to the shared `_artists/artists.json`, affects every game using that artist).
Mirrors the existing audition-grid `audEditArtist()` and the location-page `beginEdit('artist')`
(which only edits the *selected* artist via `/api/artist-style`).

## When something unwanted keeps rendering, it's a contradiction — not the word "no" (2026-06-18)
Don't give the scene-writer prompt-craft guidance about negative-vs-positive phrasing — our
models (Gemini 2.5/3 Image, GPT-image-2) follow instructions well, so it's just noise. (An
earlier note here claimed "negation summons the noun, flip everything positive" — a
CLIP-diffusion-era artifact, wrong for these models; deleted.) The real lesson: the Anchorhead
alley kept growing a door because the Scene *described* "a tall solid plank fence spanning the
alley" — which visually IS a gate/door — while also saying "no door". The fix was changing the
description (→ "a continuous, flat, featureless wall of close-set boards"), not the phrasing. So
when something unwanted recurs, look for the contradiction in the Scene's own content.

## Enrich from `examine`, but never DROP a base-description fact (2026-06-19)
Two-sided lesson from the Theatre Witch's-Lair statue.
- **Good:** the richest visual facts live in `EXAMINE <object>`, not the room summary. The statue's
  *four eye-sockets in a diamond* exist ONLY in `examine statue` output (replay via
  `tools/play.cjs … --cmds "examine statue"`); mining that gave the render real fidelity. Scene
  crafting SHOULD examine the salient props, not just read the room description.
- **Bad:** elaborating from `examine` silently **dropped the jewelled dagger** that was right in
  the base room description ("The statue is holding a jewelled dagger") — a puzzle-salient object.
  Enriching from a deeper source must ADD to the base facts, never replace them.
- **The fix = a canon-coverage pass** (now in `location-art` scene recipe step 6 + proactive in the
  `/art-notes` sweep): before finalizing a Scene, diff the concrete nouns in canon (base desc +
  examines) against the Scene text; each must be KEPT or deliberately DROPPED.

### The KEEP/DROP axis is PERSISTENCE, not puzzle-salience (refined 2026-06-19, user call)
The art is a **fixed mood backdrop of the room as first encountered — never a live mirror of world
state**, so it must show only what stays put regardless of player action.
- **KEEP = fixtures.** Architecture, sculpture, anything *firmly attached / not takeable at the
  establishing view*: walls, windows, cauldron, the statue — and the statue's jewelled dagger
  (`take dagger` → *"firmly attached to the statue"*; only frees after the pearl ceremony, so it's
  a fixture at first view).
- **DROP = removables, even if puzzle-critical.** Anything pocketable from the establishing view (the
  same lair's *loose page*, a key, a gettable gem) — once `GET`-ed it's gone but the static image
  still shows it = incongruity. The player reads the room text for takeable detail. Also drop
  transient/randomized flavor and parser/score chrome.
- **Mechanical test:** `take <noun>` in the harness — *"firmly attached"/"can't take that"* ⇒ KEEP,
  pockets ⇒ DROP. Judge the INITIAL state (puzzle-gated takeables like the dagger are fixtures at
  first view). This *replaces* the earlier "puzzle-salient ⇒ KEEP" rule, which wrongly argued to
  paint the loose page.

## The pipeline is THREE phases, split by decision type (2026-06-19)
The art pipeline separates *facts → molded text → pictures*, each its own skill, because building a
prompt and spending money on a render are different decisions:
1. **Facts — `generate-room-facts`** (`gen-room-facts.cjs`, mechanical). Replays the
   walkthrough → `room-facts.json`. Now also strips chrome + the "You can also see…here." takeable
   listing, and CAPTURES the walkthrough's own `examine` outputs, folding fixture detail in while
   skipping things the walkthrough TAKES. Deterministic baseline only.
2. **Mold — `mold` skill** (judgment, phase 2). Turns facts into a finished Scene OVERRIDE per room
   in `<game>/style.json` → `scenes[slug]` — the editable Scene box in artview — so artview opens
   render-ready. Two modes off one checklist: **author** (write overrides) and **review [`--fix`]**
   (audit existing overrides against the rules). `build-scenes` wraps phases 1+2 as one "do that".
3. **Render — `render-rooms` skill** (phase 3). Batch "Generate" over all rooms / a `--only a,b,c`
   subset; nothing to decide because the prompts are already molded. `gen-room-images.cjs --only`
   now accepts a comma-list.
`location-art` keeps audition / promote / open-reviewer. `/art-notes` reviews rendered *images* +
human notes; `mold review` audits the scene *text* — two review surfaces, different artifacts.

## Mold splits into framing → scene (the "Distill" model, 2026-06-24)
Phase 2 (mold) now produces **two artifacts in dependency order**, not one:
- **`docs/games/images/<game>/location-framing.md`** — the mold's *judgment*: the 12-factor checklist
  **answered per room** (vantage, occlusion, exit screen-vs-show, canonical state, surfaces) plus a
  game-wide `## Cross-cutting` part holding each multi-room shared **volume**'s assembled geometry +
  members + designated img2img **anchor** + shared landmarks. MOLD-authored, **regenerable cache,
  NEVER hand-edited.** Worked reference: `theatre/location-framing.md`.
- **`style.json` → `scenes[slug]`** — the imperative render-prose, **distilled FROM** the framing.

**Why (the problem it kills):** the pain was *re-molding*. A scene-only flow bakes the reasoning into
terse prose where the *why* is invisible, so every review note re-derives vantage/occlusion/state from
scratch and shared-volume geometry is re-derived (badly) per room. With framing persisted, a re-mold
after a dossier bump is a **delta-update + re-distill**, a review note lands **surgically** on the one
decision it contradicts, and each volume's geometry is authored **once**. (Directly serves the user's
standing "fix the engine, not individual prompts" rule — `feedback_fix_engine_not_individual_prompts`.)

**The three-artifact split & its litmus** — `dossier → framing → scene`:
- **Dossier** (`room-facts.json`, mechanical) = *derivable facts*. If something here is wrong/missing
  and it's derivable, **fix the engine, not framing.**
- **`_review-notes.json`** = the ONLY home for **human feedback**. It is an *input* to re-molding;
  framing never stores it (that's what keeps framing a reproducible cache — same inputs reproduce it).
- **framing.md** = *non-derivable mold judgment* (decision **+ why**). 
- **scene** = the *imperative the model renders*. Says nothing framing+facts don't justify.
- **Litmus:** restates a dossier fact → wrong file (dossier). Reads like finished render-prose →
  drifted into the scene's job. Holds human feedback → belongs in review-notes. One explains, one
  commands. The cross-cutting `Volume` block is finally the authored home for the `sightlineGroup`
  primitive the 2026-06-22 shared-volume spike wanted (was re-derived per room, badly).

## Examine-miss hardening + cross-room landmarks + multi-level geometry (2026-06-22)
Worked out fixing the Theatre Lobby over several rejected passes (single-storey → wraparound →
imperial split; couch/skylight hallucinations; an invented portrait). Three durable changes, each
routed to the layer that owns the problem:

- **Walkthroughs examine for PUZZLE reasons, not visual ones**, so a room's visually load-bearing
  fixtures are routinely never examined — and the trimmed `.cmds.txt` drops even the observation
  verbs (`LOOK UP`, `EXAMINE STAIRCASE`) the source walkthrough *did* have. Two-part rule, both live:
  (1) `trace-walkthrough` now KEEPS source observation verbs unless they break `--strict`; (2)
  `gen-room-facts.cjs` folds bare directional `LOOK UP/DOWN` (not just `examine`/`look at <obj>`).
  The Lobby being a two-storey atrium with a wraparound landing exists ONLY in `LOOK UP`.
- **Examine misses are fixed by degrade-safe + make-visible, NOT "examine everything."**
  - *Tier 1 (graceful) — App layer:* "render ONLY what the scene names (invent no furniture/figures/
    architecture); a named-but-undescribed surface — painting/poster/mural/sign/lettering — renders
    INDISTINCT, never invented specifics." A miss now degrades to vague, never *wrong*. This killed
    the couch + skylight and the random-girl posters in one global edit (`_app/app.json`).
  - *Tier 2 (visible) — `gen-room-facts.cjs`:* per-room `unprobed: [...]` flags (fixture-lexicon
    nouns named but never examined) + a top-level `landmarks: {noun:{room,detail}}` glossary (every
    examined fixture, game-wide). mold works the `unprobed` list; un-probed → indistinct by default.
  - *Tier 3 (auto-examine sweep) deliberately NOT built* — once Tier 1 makes misses harmless, the
    per-room VM-fork + noun-extraction + per-game null-response filtering isn't worth it.
- **Cross-room landmarks: the data must travel.** A fixture is examined where it's *owned* (the
  portrait on the Staircase Landing), but is *seen* from elsewhere (the Lobby establishing shot
  looks up at it). Per-room facts never give the Lobby the portrait — it doesn't name one. The
  `landmarks` glossary solves it without needing adjacency (the exit graph is unreliable anyway):
  mold pulls `landmarks.portrait.detail` for any room that sees it. Validated end-to-end — the Lobby
  now renders the actual full-length gentleman, not an invented figure.
- **Multi-level geometry = assemble from the connected rooms (mold factor 10b).** A room's 3-D volume
  is described by its `up`/`down` neighbors, not itself: the Lobby is flat in its own text; the
  *Landing* says it "circles around the upper level… see down into it," and the landing "splits east
  and west." Rule: build the whole vertical volume from the neighbor rooms, then keep it
  self-consistent — **if a feature is visible, whatever reaches it must be too** (gallery visible ⇒
  the imperial split that climbs to it must be visible). State the level count ("two storeys, one
  gallery, no higher tiers") so the model neither flattens nor stacks. Pick a vantage that puts
  unwanted features *behind the camera* rather than fighting to exclude them in-frame.

## Shared-volume consistency = anchor + img2img, NOT prose (spike-validated 2026-06-22)
Many games author ONE space sliced into compass "stations" + state-variants: Dreamhold's Dark
Dome (East/N/W/S/Center, then Lit/Starry/Translucent = same dome re-lit), the Cistern + its
glass catwalk (~13 stacked stations), the outer mountain Catwalk (N/S/E/W + Night/Unearthly).
The sightlines are NOT hidden — each room's own prose names them (Cistern Bottom enumerates the
whole vertical stack: floor→glass platform→catwalk→ceiling). So the problem is NOT "make data
travel." It's **geometric consistency across N renders of one volume**, which text-to-image
CANNOT hold: render the 5 Dark Dome facings independently and you get 5 different domes
(proportions/floor/illumination drift; the east doorway swings from monstrous foreground arch
to tiny distant door; the central pyramid — named only in Center's prose — vanishes from all 4
edge views).

**Spike result (gpt-image-2 low, 9 renders, ~$0.15):** render one approved anchor (Dark Dome
Center), then generate the four facings with `gen-room-images.cjs --ref <anchor> --ref-mode
edit`. img2img-edit produced unmistakably THE SAME dome every time, AND carried the pyramid the
per-room prose dropped, AND tamed the threshold over-domination — two fidelity wins for free
from the reference. `edit_north` even re-staged correctly (ladder to foreground, floor hole
opened per its prose) while keeping dome/walls/pyramid identical. So edit-mode = the middle path
between "one shared image" and "N independent renders": **one anchor + controlled per-station
deltas.**

Caveats (both real):
- **Edit-mode preserves the anchor's VANTAGE; it does not truly rotate the camera.** Fine — even
  desirable — for a symmetric round dome (5 near-identical views read as one room). UNTESTED and
  likely problematic for an ASYMMETRIC volume (the Cistern: glass platform on the east wall,
  catwalk overhead, cracks in named arcs) where you WANT the viewpoint to swing — edit-mode may
  over-preserve the anchor and refuse to re-orient. That cistern test is what actually decides
  whether the design generalizes; the dome is the gentle case.
- **Two-pass ordering:** consistency needs a human-approved anchor first, so a volume renders
  anchor → approve → siblings, not one batch. Every `--ref` image bills at the high-fidelity
  input rate, so siblings cost more than the $0.006 ref-free floor.

Design implication: a `volume`/`sightlineGroup` primitive = {member slugs, designated anchor
room, render policy}, consumed by the render layer (wire `--ref` anchoring into batch) and ideally
sharing the auto-mapper's existing "these stations are one space" grouping (see the catwalk-south
merge work). The `landmarks` glossary does NOT scale here — it keys nouns globally, so generic
recurring nouns (dome/ladder/catwalk) collide across unrelated volumes; grouping must be
group-scoped, not a flat global map. Also: Dreamhold's pack is PRE-hardening (baked pixel
preamble, `landmarks:[]`, several transient-state rooms with empty/garbage scene text) — a clean
regen is a prerequisite before any volume work there.

## Scrape-coverage gaps: in-place state transitions get silently dropped (2026-06-22)
Regenerating Dreamhold's pack clean (the stale pack predated chrome-stripping) fixed the garbage
(bracketed `[score]`/`[undone]` notes stripped, `landmarks` populated) — but exposed a worse,
SILENT problem: 13 REAL rooms skipped as "scene-less phantoms" (Lit Dome, Starry Dome ×5, Cistern
Rising, Night/Unearthly catwalks, Curtained Room on-chair). 95→82 rooms. Root cause is NOT
stripping — it's that `extractDescription` needs a printed room-heading line + prose, and these
rooms are entered by a STATE CHANGE IN PLACE, not movement:
- **Gap A — no base description but rich examines.** Moving into Starry Dome East prints the
  heading then `>` with no description (Dreamhold prints name-only for the dark dome), yet
  `examine galley` etc. carry gorgeous visual content. But `scene = L.description ?
  mergeExamines(...) : ''` only folds examines when a base description exists, so a
  description-less room discards its examines too and is skipped. Fix: build the scene FROM the
  examines when description is null.
- **Gap B — in-place transition prints only action text.** `put sphere in wire` → "Lit Dome,
  Center" but the body is just "the dome is flooded with light"; `wait` → "Cistern, Rising" body
  is "the black tide rises…". The name flips (status/getCurrentLocation) but no description ever
  prints. Fix: when a location name first appears via a NON-movement command (or `wait`), capture
  that turn's response as a STATE DELTA linked to the base room (Dark Dome→Lit/Starry,
  Catwalk→Night); scene = base scene + delta. These are precisely the img2img-from-anchor volume
  case — same room, relit.

Implication: a clean regen ALONE is a coverage regression — never blindly overwrite a pack with a
lower room count. A **capture-review step** is warranted: after regen, surface every skipped/thin
room LOUDLY (not one buried stderr line) with its reason + triggering response, classified
auto-recoverable (A/B) / genuine-phantom (status-line flavor like Theatre's Boiler-Room Latin
curse, correctly dropped) / needs-human. The silent `skipped[]` → stderr is the bug to kill.

### RESOLVED 2026-06-22 — Gap A + Gap B + loud coverage report all shipped in `gen-room-facts.cjs`
Dreamhold went 82→95 in pack, 0 needs-human, 0 phantom. What was built (and the non-obvious bits):
- **Gap A** — `scene = L.description ? merge(...) : merge('', examines, taken)`. A description-less
  room now rebuilds its scene from captured examines/LOOK-dir responses. Tag `recoveredFrom:'examines'`
  so mold scrutinizes them — these can be LORE-HEAVY (Starry Dome constellations carry myth narration,
  not just visuals); `visualCore` won't strip that (it's not dialogue), so mold must.
- **Gap B** — two-pass compose: prose-bearing rooms first (also indexed by `roomStem(name)`), then a
  deferred pass resolves each prose-less state-variant to a base room sharing its stem and sets
  `scene = base.scene + transitionDelta`, `anchorRoom`, `stateLabel`, `stateDelta`. `roomStem` strips
  `"; Night/Unearthly"`, `", Rising"`, and the leading dome adjective (`Lit/Dark/Starry Dome`→`Dome`).
  Anchor preference: a true base (own stem) > a description-sourced sibling (so Lit Dome→Dark Dome, not
  the examine-recovered Starry Dome; Shadow Path Unearthly→its Night sibling since no unqualified base
  exists). A variant with no base but strong self-contained delta (Cistern, Rising — the flooding
  prose) builds scene from the delta alone.
- **The delta lives in PRE-heading narration**, captured by `extractTransition` (echoed-cmd → up to
  the room-name heading or `>`). Gotcha that bit us: `extractDescription` was latching onto a
  standalone `[…score…]` status note printed AFTER the heading, which `visualCore` strips to empty
  AND blocked transition capture — so the delta vanished. Fix: `extractDescription` skips standalone
  `^\[…\]$` lines and returns null if only chrome remains, letting the transition branch fire.
- **Render side** (`gen-room-images.cjs`): a room with `anchorRoom` and no explicit `--ref` renders
  as an img2img **relight** — edits the anchor's committed (`<slug>.png`) or staged (`_review/<slug>.png`)
  image in `--ref-mode edit`, sending only the LEAN `stateDelta` (not the whole base scene) as the
  change. Batch sorts anchored rooms LAST so a single full run renders bases first; missing anchor →
  graceful skip with "render it first". This is the spike-validated shared-volume approach wired in.
- **Coverage report** replaces the silent `skipped[]`: buckets ok / recovered (A) / state-recov (B) /
  thin / needs-human / phantom, each listed with a scene preview + reason. The needsHuman-vs-phantom
  split uses an `exitTargets` set — a prose-less node referenced as someone's exit is REAL (never
  written off as expected phantom). The 2 genuine graph-orphans (Lit Dome Center, Cistern Rising)
  were the only ones Gap B caught by stem, not graph.

### The molding checklist (12 factors — canonical copy in `.claude/skills/mold/SKILL.md`)
Fidelity: (1) examine-enrich fixtures, (2) persistence — fixtures in / takeables out, (3) strip
transient+chrome, (4) fence internal contradictions ("plank fence"=door). Spatial: (5) **exit↔
destination reconciliation** — don't paint "countryside to the NW" when `nw → Town Junction`;
sanity-check (the exit graph sometimes logs puzzle-movement, e.g. a climbed window as "nw"), (6)
puzzle geometry & reachability, (7) shared-landmark consistency across rooms. State: (8) **canonical
state** — paint the FIRST normal-exploration state, never post-puzzle, (9) light/time/occupancy.
Composition: (10) **grounded vantage, don't enumerate every exit; exits have NO default form — screen
or show-minimal, the mold's call** (the junction-art note), (11) **scale cues** (cramped vs vast),
(12) layer discipline — Scene = literal
facts only, mood→Aesthetic, medium→Artist. Newly surfaced this round: 5, 8, 10, 11.

## Theatre recast to a lurid-pulp register + two medium gotchas (2026-06-23)
User found Theatre's `illustration-plate` (house ink+wash) look "too unpleasant" and wanted "lurid
pulp horror" — the decay/dread reading as oppressive. Two levers moved in OPPOSITE directions (the
casting principle in action): **recast the artist** to carry the lurid charge, **soften the aesthetic**
to pull back the grimness.
- **Cast: `pulp-press` ("Pulp Magazine").** Sensational *Weird Tales* register without depression;
  also renders STRONGLY at OpenAI-low (photoreal-adjacent two-tone survives where flat-ink comic
  collapses). Witch's-lair + lobby nailed it; the stage came out grimmer (its own scene tail still
  said "ruined, dim, cobwebbed" — the global aesthetic softened, but per-room scene mood tails carry
  their own gloom, so a full de-grim needs a scene-tail sweep too).
- **Aesthetic softened:** "decaying… gone to ruin… steeped in gothic dread" → "long shut up and faded…
  atmospheric, theatrical and a touch spooky — sensational and melodramatic rather than grim." Kept
  "pulp" OUT of the aesthetic (layer discipline — the lurid charge is the artist's, not the world's).

**GOTCHA — pulp-press is inherently near-monochrome warm two-tone.** The medium is black ink + *one*
warm press colour (rust/ochre/brick-red) + halftone. "Why is it so red" is the MEDIUM, not the scene —
you cannot de-red pulp without abandoning it. The only fuller-palette lurid alternative is `comic-panel`
("Comic Book"), which is harder at low-q. On red-walled rooms (witch's-lair red brick) the rust doubles.

**GOTCHA — a "playbill" can never render as a lettered bill** (App "no lettering" rule), only as a bold
*pictorial* poster. The model also tends to render wall posters as framed fine-art portraits; say
**"pasted flat to the wall, bold pictorial imagery"** to separate playbills from framed portraits.

**Lobby = the multi-level-atrium hard case again** (cf. 2026-06-22 examine-miss section). Stating the
wraparound gallery wasn't enough — the render only sold scale + the stairs→gallery connection once the
scene led with VAST/cavernous/"wider than deep" (factor 11) and said the split flights "rise to land
directly on" a gallery that "rings all four walls… runs back along both side walls and across the
entrance wall." Geometry needs the connection made vivid, not just asserted.

## Artist roster cleanup (2026-06-23)
- **Renamed all display names to plain medium labels** (`name` field only; `id` keys unchanged so
  `selected-artist.json` references still resolve). E.g. "The Drypoint"→"Copperplate Etching", "The
  Broadsheet"→"Victorian Wood Engraving", "The Spirit Copy"→"Mimeograph Zine", "The Render"→"3D Render".
  Rationale: the personas were oblique; clarity > flavour now that the one true persona (Aldous Quill)
  is gone. `summary`/`goodFor` already carried the detail.
- **Removed the dead `old-ink` ("OLD — Aldous Quill") row** — it was a duplicate of `illustration-plate`
  (the live house style). Left `old-gouache`/`old-pixel` for now (user scoped removal to Aldous Quill).
- **Flattened `comic-panel`** to render cleaner at OpenAI-low: hammered FLAT solid colour + explicit
  negatives (no gradients/soft shading/blending/painterly/3D look), "printed flat like a vintage comic
  page". gpt-image-low defaults to *rendering*; the fix is forbidding the rendered look outright.

## Mold skill de-bloated — case studies live HERE now, not inline (2026-06-25)
The SKILL.md had accreted one game's rejected-pass war stories inline (Orchestra Pit ~10×, Theatre
lobby/stage), bloating factor 10 to ~90 lines and biasing the checklist toward theatre-shaped rooms.
Refactored 2026-06-25 (373→~312 lines): every rule kept at face value, but the narrated histories
were stripped out and now point HERE (the "Mold-skill hardening", "Theatre recast", "examine-miss"
sections below/above are the canonical worked examples). Two structural changes: **factor 10 split
into named sub-factors 10a–10g** (Vantage / Compass-ban / Depth-occlusion / Exits / Geometry /
Props / Multi-level-coherence) so each is applied and graded independently; **factor 12's adjective
rule retuned** from a verbatim-only gate ("only if the source uses that exact word") to intent
("don't *re-tag* the global condition per room") — the exact-word gate was an over-broad blunt
instrument. Added a top note: **mold is the ACCURACY layer; appeal is delegated to Artist/Aesthetic**
— a flat/grim render is fixed by recasting the artist, never by loosening mold. When editing the
checklist, resist re-inlining case studies — add them as dated sections here and leave a pointer.

## Mold-skill hardening from the Theatre lobby/stage pass (2026-06-23)
Four recurring scene-craft failures surfaced reviewing Theatre renders; all codified into
`.claude/skills/mold/SKILL.md` (factors 10 + 12 + a new "conservative defaults" paragraph):
- **No unsourced condition adjectives** (factor 12). "dusty"/"bare"/"faded"/"neglected"/"cobwebbed"
  SOUND physical but are atmosphere — the molder appended a "Dusty."/"Bare, dusty." tail to **31 of 60**
  Theatre rooms whose source never said it, so everything rendered uniformly "dusty and bare". Rule:
  never add them unless the SOURCE room text uses that exact word (the Aesthetic states the global
  condition ONCE). Specific physical uses stay fine ("bare bulbs/crossbeams" = exposed). Stripped 26
  rooms via script that checks each word against the room's `room-facts.json` description.
- **"Bare" is mostly a PIPELINE artifact, not source fidelity.** Rooms read empty because the App layer
  forbids inventing furniture AND the molded text is terse — anything unnamed is absent. Same root cause
  as floors degrading to dirt: unspecified → generic/void.
- **Conservative defaults for unavoidable surfaces** (new rule). The FLOOR always renders; unnamed it
  degrades to dirt. You MAY name a plain, period-plausible, UNDERSTATED material — never bold/decorative
  (the lobby's "grand geometric mosaic-tile" went garish under comic; "plain worn marble" is the call).
  Name it PER ZONE so materials don't bleed (the wooden stage flowed into the seating — aisles must read
  as worn CARPET, separate from the stage boards). This is the ONLY sanctioned exception to "depict only
  what's named"; it's a surface default, NOT new objects.
- **Cap & place visible doors; they multiply** (factor 10). Loose "doorways open off the hall" / "doors
  around the gallery" studs every wall with doors (lobby got 3+ up top; comic stage invented a central
  rear exit absent from the game). Name the EXACT doors, on which walls, + "no other doors/openings".
- **Anchor directional features in DEPTH, not just compass** (factor 10). "the orchestra pit drops away
  below to the south" rendered as a HOLE in the stage floor. Truth: camera at the back of stage looking
  south; stage floor SOLID to its front lip; pit is a separate sunken trench BEYOND+below the lip,
  between stage and seats; auditorium rises past it. State foreground/midground/background ordering.
- **Shared OPEN VOLUME miss (the deep one):** the stage's establishing shot sees across the whole
  auditorium, but molding used only the stage's own facts — so it missed the rear double-doors (in the
  *Eastern Aisle*'s exits), the balcony boxes (their own rooms) and the chandelier (named in those rooms'
  PROSE — NOT the `landmarks` glossary; it was never examined). Fix = assemble a hall from every room
  that opens onto it (horizontal extension of factor 10b). Also: the pit is "down" from the stage ⇒ the
  stage is elevated ⇒ the pit is occluded from the stage vantage (don't show it) — elevation was
  inferable from the up/down exits. **Boundary worth stating:** include features because they're VISIBLE
  in the volume, NOT by reverse-engineering puzzles (the box seats are correct because the auditorium HAS
  boxes, even though a chandelier-swing puzzle also depends on them — the art is a backdrop, not a puzzle
  map).

## Walkthrough-replay misses optional rooms + captures post-puzzle state (2026-06-23)
Phase-1 (`generate-room-facts`) builds the room set by REPLAYING THE WALKTHROUGH. Two gaps,
both proven on Theatre:
- **Coverage:** rooms the walkthrough never needs are missed entirely. The **Western Theatre Aisle**
  is a real, full room — probe: from the Stage `sw` → *"Western Theatre Aisle… another aisle to the
  east, the stage to the north, double doors lead south"* (a mirror of the eastern aisle) — but it's
  absent from `room-facts.json` because the walkthrough only ever takes the SE aisle.
- **First-appearance / state timing:** a room is scraped in whatever state it's in WHEN the walkthrough
  passes through — often POST-puzzle. Probing the aisle at command #192 shows *"the chandelier has been
  lowered to ground level"* (the attic-winch puzzle is already done); the canonical first-look state is
  the chandelier hanging HIGH. We caught this one by hand (the eastern-aisle override forces "raised,
  not lowered"), but the pipeline fed the post-puzzle state.

### SHIPPED 2026-06-24 — Unified chronological BFS in `gen-room-facts.cjs`
One function, `exploreChronological()`, replaces the earlier two-pass design (a separate
game-start BFS + a separate spine branch-probe — both retired). It captures every reachable room
in the EARLIEST (most pre-puzzle) state we can navigate to it.

**How it works (the priority-queue model):**
1. **Two kinds of seed** go into a priority queue, each tagged with a timestamp (a parseTurns
   index):
   - the **game-start snapshot** (parseTurns[0], no commands → ts 0), and
   - **every spine room's first-visit snapshot** (ts = that room's `firstVisitIdx`), built by
     `buildSnapshotsIncremental` (delta-only snapshots, so total replay ≈ walkthrough length).
   Both seed kinds are needed: game-start reaches only freely-accessible rooms; puzzle-locked
   areas open only after the walkthrough's unlocking steps, so each spine room deep inside such an
   area contributes its own already-unlocked seed.
2. The queue is always processed **lowest-timestamp-first** (re-sorted each iteration). When two
   paths can reach the same room, the **earliest (most pristine) one wins.**
3. Probing a snapshot tries all 12 `PROBE_DIRS`; each landing room that beats the current best
   timestamp (`bestTs` map; spine rooms initialised to their `firstVisitIdx`) is captured. A
   BFS-path snapshot is built for it (`--snapshot-in parent --cmds dir --snapshot-out new`),
   **inheriting the parent's timestamp**, and pushed back on the queue so BFS continues THROUGH it.
4. **Exploration is keyed by `room@ts`, NOT by room** (the critical upgrade — see below). `explored`
   and `queued` sets use `${room}@${ts}` keys; `bestTs` (earliest description) is separate.
5. New rooms → `bfsDiscovered`. Spine rooms reached earlier than the walkthrough saw them →
   description refreshed in place (`bfsRefreshed`). Both report buckets: `discovered`, `refreshed`.

**Why chronological ordering is the whole trick:** a spine room's `firstVisitIdx` snapshot is the
state the instant the walkthrough STEPS INTO it — always before any command (and any puzzle) fires
inside it. So processing seeds in timestamp order is equivalent to "replay the world up to but not
including each puzzle, then look around." No puzzle-specific knowledge required.

### The `room@ts` upgrade — why room-level dedup was wrong (2026-06-24)
The FIRST cut used room-level `exploredFrom` (each room probed-outward-from once). That captured the
Theatre aisles only POST-winch (chandelier-down), and I wrongly concluded it was *impossible* to do
better with this walkthrough. **That conclusion was false — and the empirical sweep that disproved
it is the lesson.** A turn-by-turn reachability sweep (`scratchpad/aisle-reach.cjs`-style) showed the
Eastern Theatre Aisle IS reachable at **turn 24 — pre-winch, chandelier UP** — from "Cramped Hallway"
in 5 hops. The auditorium is ALWAYS open, but the path OUT of the start area (lobby/office/basement,
only ~4–5 rooms reachable at turns 1–8) is blocked by a **thug** who clears after you `examine thug`
+ `wait`×3 (~turn 22); the winch (`turn handle`) lowers the chandelier at command 41. So there is a
genuine MIDDLE window (thug-clears ~22 < t < 41) where the aisle is both reachable AND pristine.

Room-level dedup missed it because the pre-winch path threads THROUGH connecting rooms that other
paths had already explored — and room-level `visited` pruned traversal at them. The fix: explore each
room once **per distinct timestamp** (`room@ts`), and traverse THROUGH already-known rooms (build the
snapshot, continue) rather than dead-ending. A room's reachable EXITS change over the game (a puzzle
opens a door), so the same room genuinely must be re-explored at each game-state that reaches it.
Capture (`bestTs`) still takes the earliest ts → most pristine prose.

**Result with `room@ts` (2026-06-24): both aisles captured chandelier-UP at turn 24.** 63 in pack,
3 discovered + 9 refreshed (Basement, Prop Room, both aisles, Eastern Balcony, Theatre Roof, Boiler
Room, Cloakroom, Inside Pit, Metal Platform). 0 needs-human, 0 regressions. **No manual override
needed for the aisles anymore.** A `MAX_EXPLORATIONS=4000` safety cap guards runaway (logged if hit).

### Cost + the bucketing dead-end (measured, rejected 2026-06-24)
`room@ts` cost: theatre went ~90s → **~12 min** (724s). Each seed has a unique ts, so seeds never
share a dedup key — every seed re-explores its whole reachable component. Cost ≈ Σ(reachable per
seed), not the seed count.

We measured two ways to cut it and **rejected both** (record so we don't re-explore the avenue):
- **Action-burst seeding** (seed start + first room after each non-look/examine action): theatre
  62 → 54 seeds (~13%). Marginal — theatre is action-dense (120 of 271 commands are actions). Worth
  adopting only as a *scalability* policy for movement-heavy/puzzle-sparse games (where it collapses
  hard); it does NOT dent theatre. NOT yet implemented.
- **World-state epoch bucketing** (dedup exploration by full dynamic-memory state, masking
  position/turn-counter): measured **246 distinct states out of 270 turns** — essentially no
  reduction. Why: full RAM churns nearly every turn (inventory — ~25 `get page`s — score, NPC/daemon
  counters), but *reachability* (door-open flags) changes only ~26 times. There is no cheap,
  game-agnostic way to isolate the reachability bytes from the churn, so full-state bucketing is
  meaningless. DEAD END. (Measurement: `scratchpad/distinct-states.cjs`.)

**Two perf levers, one tested:**

1. **Aggressive action-boundary seeding (`--aggressive-seeds`, flag-gated, default OFF) — TESTED, 2.1×.**
   Instead of one seed per room (62), seed only the first room entered after each state-changing
   action, treating ALL inventory verbs (get/take/drop/put/wear/show/give/…) as inert → 20 seeds.
   Fewer seeds = fewer distinct timestamps = less `room@ts` overlap. **Theatre result: byte-identical
   pack (63 rooms, both aisles chandelier-UP, 0 scene diffs vs per-room) in 341s vs 724s.** Why
   ignoring `get` didn't lose the chandelier here: theatre's gate into the main building is a `wait`
   (waiting out a blocking thug, ~turn 22), NOT a `get` — and `wait` is a non-inventory action that
   still arms a seed, so the pristine window (turn 22–41) is covered (aisle captured turn 22 vs 24).
   **Residual risk (why it's not the default):** aggressive is only safe when SOME non-inventory
   action lands a seed in each pristine window. A game where the *only* action opening a window is a
   `get`/`take`, with nothing else firing before it closes, would silently lose that window. Per-room
   seeding (the default) has no such blind spot. Implementation: `seedIdxOverride` param on
   `exploreChronological`; bestTs still uses real per-room first-visit so description capture is
   unchanged. Verb-classification + safe/aggressive seed counts: 62 (per-room) → 54 (all actions arm)
   → 44 (ignore drop/put/wear/show/give, KEEP get — the safe set, untested) → 26/20 (ignore get too).
2. **In-process multi-direction probe in `play.cjs` (NOT built) — ~10×, accuracy-free but risky.**
   Each of the ~30k direction-probes boots a fresh Node + reloads `zvm.js` + `do_autorestore`.
   Restoring once and branch/reverting 12× in one process would be the big win, but it's careful
   surgery on the harness's most delicate (snapshot) path and must be bit-exact-validated. Deferred.

For now per-room (~12 min) is the safe default; `--aggressive-seeds` (~6 min) when you want speed and
can eyeball the pack.

**General takeaway for unknown games:** trust the `discovered`/`refreshed` report and the per-room
`turn N` annotation. A room captured at a high turn number, in a game with mid-game state changes, is
the one to eyeball for post-puzzle contamination — that's where a manual override may still be needed.

## Exits have no default form — THRESHOLDS rule REMOVED from App, moved to the mold (2026-06-23)
The App-layer rule — *"Exits, doorways, passages and stairwells are mere THRESHOLDS — a plain opening
or dim doorway in a wall, the view beyond defaulting to darkness, never the room past it, and never
dominating the composition"* — was MISLEADING and is gone. It prescribed a *visual form* (a dark
doorway) for every exit, globally. But an exit isn't a thing — it's **movement to another spot**, with
no inherent form. The rule stamped literal dark doorways onto exits that were really something else:
the Theatre **staircase-landing** put doorways flanking the portrait in 5 of 8 audition renders, where
the grand staircase "splits east and west" should rise off-frame as flights.

Decomposed, that one sentence did three jobs: (1) never paint the space *beyond* an exit, (2) exits
never dominate, (3) render every exit *as* a dim doorway. **Job 3 was the culprit.** Jobs 1–2 are
either redundant with the standing depict-only sentence (`"invent no … architecture it does not
mention"` already forbids the unnamed room-beyond) or are per-room composition (the mold's factors
10/11).

**Change applied (Option B — full drop):** the dedicated exit sentence was DELETED from
`_app/app.json` outright. Anti-invention now rides on the existing depict-only clause + the "the
room's own permanent contents are the subject" tail. **Exit handling is now wholly the mold's job**
(factor 10): for each exit the vantage includes, decide deliberately — **screen it**
(off-frame / behind camera / shadow — the conservative default; a recessive backdrop needn't advertise
its exits) or **show it minimally in its true form**, from the room's *own prose first*, destination
second (stairs → flights off-frame; arch → arch; passage → dim opening). Never a reflexive doorway.

**Fallback kept in pocket (Option A):** the lit-room-through-a-doorway / invented-archway reject was
historically the **#1 reject even WITH depict-only already present** — the model treats "what's
glimpsed through this opening" as fair game rather than as inventing architecture. If it returns,
restore a SLIM App invariant (keep form in the mold, re-add only the sliver): *"Never paint the room
or space beyond an exit, doorway or passage — what shows through stays dark or indistinct, never the
subject."* So: **watch the next render passes for invented archways / painted-beyond before treating
the full drop as settled.** The 8 staircase-landing audition notes (`_review-notes.json`) stay OPEN as
the canary — resolve them only once that room gets the screen-or-show treatment and renders clean.

**First test (2026-06-23, staircase-landing re-mold + Gemini render).** Two separable axes, one
passed and one didn't:
- ✅ **Exit form / phantom doorways — PASS.** The re-rendered landing has NO dark doorways flanking
  the portrait (the auditions had them in 5/8). The Scene-level line *"the only ways out are the
  stairs themselves: no doorways, arches, or dark openings cut into the walls"* carried the job the
  dropped App rule used to do. Option B validated on its own axis; A stays in pocket.
- ⚠️ **Split/descent geometry — still wrong, and SEPARATE.** The model drew one central flight
  ascending toward the portrait (the *lobby's* look-up-at-the-landing view), not the east/west split
  rising off-frame + foreground descent of "standing on the landing." This is the pre-existing
  multi-level-geometry hard case, untouched by the exit change. **Gotcha surfaced:** an over-specified
  "standing at the top of the steps looking north toward the north wall" vantage can COLLAPSE the
  desired split into a single grand ascending staircase — pulling the camera frontal/back into the
  up-view. The comic-panel *audition* actually showed the split better than this re-mold. Likely needs
  a vantage reword that leads with the split (flights leaving up-left and up-right as the subject) or
  an img2img anchor — text-to-image resists the three-way "up off both sides + down in front" framing.
