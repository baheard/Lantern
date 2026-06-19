---
title: art-direction-model
tags: [location-art, prompts, art-direction, gemini, anchorhead, dreamhold]
created: 2026-06-16
updated: 2026-06-19
aliases: [artist persona, style layers, art prompt structure, app layer]
---

# Art-direction model: App / Artist / Aesthetic / Scene

Location-art prompts compose **four independent layers** (App added 2026-06-18; was three).
Keeping them separate is what lets one art identity span every game without per-game restyling.

0. **App** (global, above Artist — same for every game AND every artist). Universal hard
   constraints that hold no matter who the artist is: `Portrait 3:4`, recessive backdrop /
   accompaniment to story text, `no people / text / lettering / UI`, and the THRESHOLDS rule
   (exits are mere openings, never depict the room beyond). Lives in
   `docs/games/images/_app/app.json` (`{ "prompt": "…" }`). Prepended to every composed prompt.
1. **Artist** (universal — same for every game). Medium + technique + how they render:
   line, wash, paper texture, edge treatment, tonal range, composition habits,
   "recessive backdrop", portrait 3:4. **Never** names mood, palette, weather, or subject.
2. **Aesthetic** (per game). The lens: palette, light quality, mood, era, contrast level.
   Anchorhead = gothic Lovecraftian dread, deep chiaroscuro, indigo/violet/slate, stormy
   night. Dreamhold = luminous, serene, verdant/marble, bright. Same pen, different ink.
3. **Scene** (per room). Literal contents from the walkthrough-scraped room text.
   **Faithful and unwavering** — only what the prose says; nothing invented.

Composed prompt = `App + " " + Artist + " Aesthetic: …" + " Scene: …"`.

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
- **Contrast must be explicit.** "muted/desaturated" alone reads flat, bright, daytime —
  not horror. The Aesthetic must spell out deep chiaroscuro / near-black shadows / high
  contrast, or it comes out dreary-but-not-menacing.
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
+ Scene + optional spatial note), since `gen-room-prompts.cjs` can't infer adjacency
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

## Done 2026-06-16 (was "Still TODO")
Three-layer composition is formalized and live:
- Global `_artists/artists.json` (Aldous Quill, id `ink`), picked per game via
  `<game>/selected-artist.json`.
- Per-game `<game>/style.json` = `{ aesthetic, scenes{slug: override} }` — both the game
  Aesthetic and per-room Scene overrides live here (it's one file per game).
- `gen-room-images.cjs` batch mode now COMPOSES Artist + Aesthetic + Scene from those
  files (mirrors `review-server.cjs` `composedPrompt()`), discarding any stale baked
  preamble in `prompts.json`. `gen-room-prompts.cjs` now emits **scene-only** prompts
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
1. **Facts — `generate-location-prompts`** (`gen-room-prompts.cjs`, mechanical). Replays the
   walkthrough → `prompts.json`. Now also strips chrome + the "You can also see…here." takeable
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

### The molding checklist (12 factors — canonical copy in `.claude/skills/mold/SKILL.md`)
Fidelity: (1) examine-enrich fixtures, (2) persistence — fixtures in / takeables out, (3) strip
transient+chrome, (4) fence internal contradictions ("plank fence"=door). Spatial: (5) **exit↔
destination reconciliation** — don't paint "countryside to the NW" when `nw → Town Junction`;
sanity-check (the exit graph sometimes logs puzzle-movement, e.g. a climbed window as "nw"), (6)
puzzle geometry & reachability, (7) shared-landmark consistency across rooms. State: (8) **canonical
state** — paint the FIRST normal-exploration state, never post-puzzle, (9) light/time/occupancy.
Composition: (10) **grounded vantage, don't enumerate every exit** (the junction-art note; exits are
mere THRESHOLDS), (11) **scale cues** (cramped vs vast), (12) layer discipline — Scene = literal
facts only, mood→Aesthetic, medium→Artist. Newly surfaced this round: 5, 8, 10, 11.
