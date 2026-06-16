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

## The chosen artist (validated 2026-06-16, Anchorhead + Dreamhold)
Loose impressionistic hand-drawn **ink linework over watercolor wash**; visible pen
lines, granular paper texture, **soft blotchy ragged edges that fade to near-black at
the margins** (no clean rectangular border — blends into the dark-mode app *and* gives
the "arty edges"); **full tonal range with rich near-black darks**; recessive backdrop;
portrait 3:4; no people/text/UI. Ink chosen over pixel as the universal style: it reads
across genres (pixel screams "retro game" and the model won't actually produce true
pixels without a downscale pass), stays recessive, and recolors per game via Aesthetic.

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

## Still TODO
- Formalize: global `artist.json` (signature) + per-game `aesthetic`; teach
  `gen-room-prompts.cjs` to compose the three layers; regenerate packs so stored Style
  stops being the old painted-illustration/green/16:9 preamble. See [[location-art-system]].
