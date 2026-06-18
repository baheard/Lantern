---
title: art-direction-model
tags: [location-art, prompts, art-direction, gemini, anchorhead, dreamhold]
created: 2026-06-16
updated: 2026-06-16
aliases: [artist persona, style layers, art prompt structure]
---

# Art-direction model: Artist / Aesthetic / Scene

Location-art prompts compose **three independent layers**. Keeping them separate is
what lets one art identity span every game without per-game restyling.

1. **Artist** (universal — same for every game). Medium + technique + how they render:
   line, wash, paper texture, edge treatment, tonal range, composition habits,
   "recessive backdrop", portrait 3:4. **Never** names mood, palette, weather, or subject.
2. **Aesthetic** (per game). The lens: palette, light quality, mood, era, contrast level.
   Anchorhead = gothic Lovecraftian dread, deep chiaroscuro, indigo/violet/slate, stormy
   night. Dreamhold = luminous, serene, verdant/marble, bright. Same pen, different ink.
3. **Scene** (per room). Literal contents from the walkthrough-scraped room text.
   **Faithful and unwavering** — only what the prose says; nothing invented.

Composed prompt = `Artist + " Aesthetic: …" + " Scene: …"`.

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
3. **Add explicit negatives** for whatever the model tends to invent: `"no other doors,
   no ground-level doorway"`, `"cobblestone NOT dirt"`, `"no archway"`, `"no lightning"`.
   Negatives are doing the real work — they're the guardrails.
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
- **Proposed 4th layer — App (global, above Artist).** `"no people, no text, no UI"` is
  currently baked into each artist's `style` string (e.g. Aldous Quill/`ink`). The user
  wants these universal constraints lifted into an **App layer** that prepends to EVERY
  composed prompt regardless of artist, so they aren't duplicated per-artist (and a new
  artist can't forget them). Composed would become
  `App + Artist + "Aesthetic: …" + "Scene: …"`. NOT yet built — flagged for later. The
  cheap interim alternative is just to keep the phrase in every artist string.

## Negatives can SUMMON the noun — prefer positive phrasing (2026-06-17)
The Anchorhead alley kept growing a door at the dead-end on random regens, despite the
Scene saying "no other doors, no ground-level doorway." Two causes, both classic image-model
behavior (nanobanana / Gemini-flash-image):
- **Negation is weak in image models.** The tokens `door`/`doorway` are still in the prompt;
  the model attends to the noun and often drops the "no" ("don't think of a pink elephant").
  Repeating "door" in the negatives was partly *causing* the doors.
- **A dead-end "tall solid wooden fence" reads as a giant gate/door** — vertical planks,
  rectangular, blocking the passage. The composition primes "door"; on a stochastic roll the
  door-prior wins. That's why it was intermittent, not constant.

Fix that worked: **flip negative → positive.** Describe surfaces as unbroken instead of
naming the forbidden object, and recast the fence so it doesn't read as a gate:
- fence → "a tall barrier of weathered vertical wooden planks — a continuous, flat,
  featureless wall of close-set boards spanning the full width of the alley"
- walls → "the brick side walls are solid and unbroken"
- openings → "the only opening anywhere in the scene is that single high transom window"

CAUTION (caught in review): the first attempt wrote the fence as "...no hinges, no handle,
no frame" — that's the SAME trap one layer down. "hinges/handle/frame" name door hardware
and re-summon the door. Don't enumerate the parts something *lacks*; describe the surface as
"featureless / continuous / flat / unbroken". The positive adjective is the whole technique —
the moment you reach for "no <part>", you're back to naming the thing.

Rule of thumb: if the model keeps rendering an unwanted object, **stop naming it in a
negative** — describe what IS there (blank/unbroken/continuous) and remove the noun. Reserve
explicit negatives for things whose *token* isn't also the subject (e.g. "no lightning" works
because the scene isn't otherwise about lightning). This refines the earlier "negatives do the
real work" note: negatives work for absent flavor, but backfire when they name the very thing
the composition is already biased toward.
