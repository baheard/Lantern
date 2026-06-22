---
title: art-direction-model
tags: [location-art, prompts, art-direction, gemini, anchorhead, dreamhold, theatre]
created: 2026-06-16
updated: 2026-06-22
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

## Examine-miss hardening + cross-room landmarks + multi-level geometry (2026-06-22)
Worked out fixing the Theatre Lobby over several rejected passes (single-storey → wraparound →
imperial split; couch/skylight hallucinations; an invented portrait). Three durable changes, each
routed to the layer that owns the problem:

- **Walkthroughs examine for PUZZLE reasons, not visual ones**, so a room's visually load-bearing
  fixtures are routinely never examined — and the trimmed `.cmds.txt` drops even the observation
  verbs (`LOOK UP`, `EXAMINE STAIRCASE`) the source walkthrough *did* have. Two-part rule, both live:
  (1) `trace-walkthrough` now KEEPS source observation verbs unless they break `--strict`; (2)
  `gen-room-prompts.cjs` folds bare directional `LOOK UP/DOWN` (not just `examine`/`look at <obj>`).
  The Lobby being a two-storey atrium with a wraparound landing exists ONLY in `LOOK UP`.
- **Examine misses are fixed by degrade-safe + make-visible, NOT "examine everything."**
  - *Tier 1 (graceful) — App layer:* "render ONLY what the scene names (invent no furniture/figures/
    architecture); a named-but-undescribed surface — painting/poster/mural/sign/lettering — renders
    INDISTINCT, never invented specifics." A miss now degrades to vague, never *wrong*. This killed
    the couch + skylight and the random-girl posters in one global edit (`_app/app.json`).
  - *Tier 2 (visible) — `gen-room-prompts.cjs`:* per-room `unprobed: [...]` flags (fixture-lexicon
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

### RESOLVED 2026-06-22 — Gap A + Gap B + loud coverage report all shipped in `gen-room-prompts.cjs`
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
Composition: (10) **grounded vantage, don't enumerate every exit** (the junction-art note; exits are
mere THRESHOLDS), (11) **scale cues** (cramped vs vast), (12) layer discipline — Scene = literal
facts only, mood→Aesthetic, medium→Artist. Newly surfaced this round: 5, 8, 10, 11.
