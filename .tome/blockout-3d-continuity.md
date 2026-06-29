---
title: blockout-3d-continuity
tags: [location-art, blockout, 3d, continuity, mold, theatre, img2img, artview]
created: 2026-06-24
updated: 2026-06-24
aliases: [3d blockout, clay render, geometric continuity, scene blockout, volume blockout]
---

# 3D blockout → clay render → img2img restyle (true cross-room continuity)

The principled answer to "make adjacent rooms in a shared space agree geometrically"
(stage / aisles / balconies all showing the SAME stage, chandelier, boxes from their own
vantage). Complements — does NOT replace — the text-layer approach in
[[cross-room-consistency-image-ref]]. Text layer = *believable* consistency, free, default.
Blockout = *true geometric* continuity, real modelling cost, only where it's worth it.

## Why it works (and why plain image-refs don't)

[[cross-room-consistency-image-ref]] showed feeding a neighbour's photo as a ref fails:
the model has no 3D understanding, so it clones the ref's *composition* instead of
re-deriving the vantage. The fix is to give it geometry that's *already correct for this
camera*: build the volume ONCE in 3D, place a camera per room, render a grey "clay" view,
then img2img-restyle it. Now `--ref-mode edit`'s "preserve composition" — the thing that
HURT with a photo ref — is exactly what we want, because the composition is the true
geometry. Every view comes from one model, so the stage from the aisle and the stage from
the balcony are literally the same stage.

## Validated 2026-06-24 (spike on the theatre Auditorium)

Built a rough three.js blockout of the Auditorium volume from the `location-framing.md`
geometry + per-room **Vantage** lines, rendered the eastern-aisle clay view headless, and
restyled it with `gen-room-images.cjs --ref <clay> --ref-mode edit --provider openai
--quality low`. Result (`_review/eastern-theatre-aisle.CLAY3D-TEST2.png`): a faithful
auditorium with stage, curtain, balcony boxes, chandelier, raked seats — geometry placed
exactly per the clay. **The geometry transfer is the win; it's strong.**

### Gotchas learned (bake these into any future blockout authoring)
- **Empty/flat regions hallucinate.** A big featureless foreground (or the bare sunken pit)
  made gpt invent a brick crypt/catacombs below the seats. Fix: fill the frame with real
  geometry + steer "single ground level, NO basement/crypt/vaults."
- **Hard polygon edges → blocky objects.** Cube seats restyled as stone blocks. Fix: round
  the geometry (cylinder seat-backs) AND steer "plush upholstered, soft rounded, treat the
  image as a LAYOUT guide not a literal object."
- **Edit-mode preserves the ref's TONALITY.** Grey clay → desaturated/monochrome output,
  regardless of prompt. This is FINE for a monochrome artist (theatre's selected artist is
  `drypoint` / copperplate etching — the "sepia" was the artist rendering correctly, not a
  bug). For a SATURATED flat-colour artist it would fight you → then either colour the
  blockout materials roughly, or use ControlNet depth/canny on Stable Diffusion (not our
  Gemini/gpt-image providers) for structure-with-free-colour. Always check
  `selected-artist.json` before assuming the palette.
- **Cut the floor around the pit.** A sunken pit needs the floor *opened* (build floor as
  pieces around a hole); a pit box under a solid floor slab is invisible/buried.
- **Framing took 3-4 iterations.** Camera height/aim per vantage needed a render→look→adjust
  loop (overshot the aisle camera once). Autonomous authoring can run this loop headless but
  a human spot-check converges it faster.

## Detection: which spaces need a blockout = mold's Volume blocks

No new judgment needed. `location-framing.md` already lists them as `### Volume:` blocks
(2+ members looking across one shared space). Theatre has three: Auditorium, Lobby Atrium,
Sewer. Mold even flags failures explicitly (staircase-landing: "likely needs an img2img
anchor"). So a future skill scans framing for Volumes + those "needs an anchor" canaries to
get the work-list for free.

## Shape (minimal build DONE 2026-06-24)

- **Generic renderer** ✅ `docs/games/images/_blockout/renderer.html` — three.js app that
  loads a saved **scene-def** and renders it; fly-through nav (right-drag look, WASD move,
  Q/E up/down, scroll dolly), per-room camera buttons, `?lock=1` for clean 3:4 screenshots.
  Part vocabulary: `box`, `cyl{r,len,axis,half}`, `sphere`, `grid{x,z,rakePerRow}+of[]`
  (grid repeats sub-parts — used for seating/balconies). Args: `?game=&volume=` or `?src=`.
- **Scene-def** ✅ `docs/games/images/<game>/_blockout/<volume>.scene.json` — the "3d file":
  `{game,volume,title,members,parts[],cameras{room:{pos,look,fov}}}`. First one:
  `theatre/_blockout/auditorium.scene.json` (24 parts, 6 cameras, from the framing).
- **artview integration** ✅ `tools/review-server.cjs`: `blockoutsFor()` scans
  `_blockout/*.scene.json`; routes `/blockout` (serves renderer from disk, self-contained on
  :3009), `/api/blockout?game=&volume=` (scene-def), `/api/blockouts` (all, for the rail).
  Top-level **Blockout 3D** rail topic → subnav of all volumes grouped by game → detail
  embeds the renderer in an iframe with camera buttons. Member locations also get a 📦
  button that navigates in-app to the volume at that room's camera. A blockout is NOT a
  "location" — it's its own game-grouped section.
- **Still TODO**: node batch driver (render all views → gpt edit-mode in one command);
  prove cross-room continuity by restyling all 5 views; param-slider/gizmo editing in the
  renderer (dropped to ship); standalone auto-author from framing.
- **Skill home (open question)**: likely its OWN skill (`/blockout`-ish) that `studio`
  orchestrates as an optional phase for volumes needing continuity — mirrors how
  generate-room-facts / mold / render-rooms are discrete skills under studio. Decide
  when building; don't fold it inline into studio.

## Compass is the enemy; the image is the spatial authority (2026-06-24)

Image models CANNOT reason about compass ("the hole in the west wall") — they have no idea
which way is south, so compass words in the prose fight the blockout and cause mis-placement
and mirror flips. Hard-won rules:
- **Generation prompt tells the model to IGNORE compass words** and treat the blockout image
  as the SOLE authority for placement/sides (enforced in `gen-room-images.cjs` `guide` mode +
  an explicit "never mirror/flip" line). We also STOPPED sending the camera's compass facing —
  it fought the image. A separate orientation sentence asserting "X is on the right" caused a
  left-right flip; don't reintroduce it.
- **Placement-critical features must be BLOCKED OUT, not described by compass.** If a feature's
  position matters (a crawl-hole, a bricked-up doorway, a specific door), model it as a small
  mass on the correct wall with its own role/colour/legend (`brick`, `hole`, …). Then the image
  carries it and it renders in the right place. Compass-only prose features get lost once the
  model is told to ignore compass — by design. The blockout is the spec.
- **A grazing/flat clay → the model freelances.** If a vantage looks at a wall edge-on (mostly
  one flat colour), there's nothing to anchor and the model paints the described scene from
  scratch. The vantage must actually FRAME its subject head-on enough to read.

## Pipeline direction (decided 2026-06-24, not yet built): frame-relative mold + a blockout skill

The root fix for the compass problem is upstream: **`mold` should author the per-room SCENE
prose in VANTAGE-RELATIVE terms, not compass** — "you are looking at the stage; a balcony box
is on the left, a bricked doorway on the right," NOT "a doorway to the northwest." That's how
you describe a view, and it makes prose + image agree with nothing to translate. Compass stays
in the framing *dossier* (the spatial facts the mold reasons over); the *scene the model reads*
is frame-relative. mold already records the **Vantage** per room (`location-framing.md`) — it
should lead the scene with that vantage and place everything relative to it.

And the blockout itself should become its **own skill** (doesn't exist yet — hand-driven so
far): read the framing, build the volume from the major masses PLUS any placement-critical
named features (holes, doorways, fixtures), and set each member's camera from the recorded
**Vantage**. It is the deterministic spec that the frame-relative scene prose then describes.

### `/blockout <game>` skill — scope decided 2026-06-25 (autonomous, self-reviewing)

Settled the autonomy fork: the skill is **fully autonomous through generation + a self-review
pass, with human review as the final gate** — NOT a hard stop at scene.json. Flow:
1. **Detect** volumes from `location-framing.md` (`### Volume:` blocks + mold "needs an anchor"
   canaries) → work-list.
2. **Build geometry maximally from framing** — extract every scene detail it can: major masses
   as roled blocks, each placement-critical named feature (hole/brick/door/fixture) as its own
   roled block, one camera per member from its **Vantage**. Apply the baked gotchas up front
   (fill the frame, round geometry, cut floor around pits, head-on framing). Write
   `<game>/_blockout/<volume>.scene.json`.
3. **Take the shots** — headless-generate clay render + img2img restyle per member vantage.
4. **Self-review for accuracy** — vision pass comparing each shot against the framing facts:
   named features present and on the correct side? hallucinations (crypt-under-seats)? blocky
   artifacts? grazing/flat vantages? Auto-fix where it can (nudge a block, add fill geometry,
   steer the prompt) and re-shoot; otherwise flag.
5. **Hand to user** — present shots + accuracy report; human review decides whether manual
   editing in the renderer (gizmo / Save all / model-aware viewport, all shipped v1.5.679) is
   needed.

Studio orchestrates it as an optional phase. Renderer now has the interactive editor that makes
the human-review touch-up step cheap — see renderer.html (gizmo, Save all, model-aware viewport).

### BUILT 2026-06-29 as `/generate-blockout` (`.claude/skills/generate-blockout/SKILL.md`)
Scope landed = author + handoff + web-agent review (NOT fully headless). User's call: "1 but then
a step for review using 2" — i.e. the skill authors `<volume>.scene.json` deterministically
(geometry from the framing Geometry block + one camera per member from its Vantage line, gotchas
baked), HANDS OFF clay-capture+restyle to the browser renderer (you click Generate in artview —
clay is browser-only, see below), then drives a **web-agent self-review** over the resulting shots.
First two volumes authored: `dreamhold/_blockout/outer-catwalk.scene.json` (4 day stations) and
`orrery.scene.json` (3 members, hero brass disk through 2 alcove archways). Validated in the
locked renderer: dome+walkway+opening+valley and the brass disk+globe all build and frame sanely.

**Gotchas hit while building (bake these in):**
- **Role legend must be EXTENDED for new games, in TWO places kept in sync.** `ROLE_LEGEND`
  (core.cjs) + `ROLE_COLORS` (renderer.html) only knew theatre's vocabulary. A role with no
  legend entry renders as an unnamed coloured blob — the model can't read it. Added a reusable
  generic-Dreamhold set: `dome, rock, valley, machine, ladder, steps, opening`. Per-part `detail`
  is human-only (inspect panel) — it is NOT sent to the model; only the role legend + scene prose
  + notes reach the model. So SHAPE comes from the blockout, IDENTITY from the scene prose, and
  the legend is the bridge.
- **The renderer's default static src path 404s on :3009.** `renderer.html` falls back to
  `/games/images/<g>/_blockout/<v>.scene.json`, which the review-server does NOT serve statically.
  artview (client.js ~L284) always loads it as `/blockout?src=<URL-encoded /api/blockout?game=&volume=>&game=&volume=`.
  To open the renderer standalone (e.g. web-agent screenshots), pass that `?src=` form, not the
  bare `?game=&volume=`.
- **Lighting/sky states are NOT separate blockouts** — one geometry serves day/night/unearthly
  (catwalk) and dark/lit/starry (dome); the state is a restyle prompt delta on the same clay.
- First-pass cameras are deliberately rough; the render→look→adjust loop (renderer "Update
  vantage") is the human refine phase, exactly as the theatre took 3–4 iterations.

**Still TODO** (unchanged): the true headless node renderer (puppeteer/WebGL) that would collapse
Steps 3–4 into one CLI command and make the skill fully autonomous. Until then clay-capture needs
the browser in the loop.

**Above the skill: a studio-level "get all the pictures for `<game>`" orchestrator** (decided
2026-06-25, not built). A completeness sweep that guarantees EVERY location ends with committed
art: route volume members → `/blockout`, standalone rooms → render-rooms, self-review, then
report a coverage map (X/Y have art, N from blockouts, M need review). Completeness, NOT a
quality gate — rough shots are acceptable and get fixed later via review-notes + the renderer
editor. This is why blockout shots needed in-renderer **promotion** (below): the sweep promotes
a chosen blockout shot into the committed game image just like render-rooms does for normal rooms.

### Renderer capabilities shipped (v1.5.679–680, 2026-06-25)

- **Model-aware viewport aspect** — clay capture + viewport track the SELECTED model's true
  output aspect (OpenAI→2:3, Gemini→3:4) so framing translates 1:1. (verified in browser)
- **Save all** — top-bar button flushes all pending block edits in one pass, rename-safe.
- **Blockout image promotion** — `/api/blockout-promote` (review-server `promoteBlockout()`)
  copies a chosen `_gen/<volume>/<file>.png` to the committed `<slug>.png` + updates the manifest
  by room name, exactly like the normal `promote()`. Renderer: "★ Promote → in game" button next
  to Delete on the selected shot. The blockout `view` IS the member's location slug.
- **Gallery scrollbar fix** — `#gallery` height bumped so the horizontal scrollbar no longer
  clips the thumbnail bottoms.

## When NOT to use it

Most rooms: skip. Players see one room at a time; text-layer consistency is enough. Reserve
blockouts for volumes where multi-vantage continuity is actually visible/complained about.
Authoring geometry per volume is the real ongoing cost.
