---
name: mold
description: Author or review the per-room Scene OVERRIDES for a Lantern game's art (the editable Scene box in artview). Author mode molds each room's scraped facts into a finished, probed, considered scene override written to <game>/style.json so artview opens render-ready; review mode audits existing overrides against the molding checklist and reports (optionally fixes) violations. Triggered when the user says "/mold <game>", "mold scenes for <game>", "populate scene overrides", "mold review <game>", or "review scene overrides for <game>". Prerequisite: generate-room-facts (facts). Phase 2 of the art pipeline; phase 3 is the render skill.
---

# mold skill

**Phase 2 of the location-art pipeline.** It turns the scraped room *facts* into a finished,
**molded Scene override** per room — the editable Scene text you see in artview — written to
`docs/games/images/<game>/style.json` → `scenes[slug]`. After it runs, every location is
render-ready: App / Artist / Aesthetic / **Scene-override** all sit composed, so making pictures
(phase 3, the render skill) has nothing left to decide.

```
generate-room-facts → [ mold:  facts → framing → scene ] → render
   room-facts.json (FACTS)        location-framing.md   style.json     images
                               (JUDGMENT/why)        scenes{} (prose)
```

Mold has **two artifacts, in dependency order** (the "Distill" model):
1. **`docs/games/images/<game>/location-framing.md`** — the mold's *judgment*: per-room vantage,
   occlusion, exit handling, canonical state, plus the game's shared-volume geometry. This is the
   **load-bearing** output — the durable, inspectable record of every non-derivable decision.
   **MOLD-authored, regenerable, NEVER hand-edited.** Human feedback never lives here (it lives in
   `_review-notes.json`); framing is a *cache* reproduced by re-running the mold over the same
   inputs.
2. **`style.json` → `scenes[slug]`** — the imperative render-prose, **distilled FROM** the framing.
   This is what artview/the renderer read.

**Why two.** The pain this solves is *re-molding*. A scene-only flow bakes the reasoning into terse
prose where you can't see the *why*, so every review note re-derives the vantage/occlusion/state
from scratch. With framing.md the reasoning persists: a re-mold after a dossier bump is a
**delta-update + re-distill**, and a review note lands **surgically** on the specific decision it
contradicts. The hardest, most-repeated failures (multi-room shared volumes — atria, auditoria,
domes) get their geometry authored **once** in the cross-cutting section instead of re-derived per
room. (Architecture: `.tome/art-direction-model.md` "dossier → framing → scene".)

**The split, stated as a litmus:** framing holds the **decision + why**; the scene holds the
**imperative the model renders**. One explains, one commands. If a framing entry reads like finished
render-prose, it has drifted into the scene's job. If it merely restates a `room-facts.json` fact, it
belongs in the dossier (fix the engine, not here).

Authoring is **judgment** work (curate, probe, reconcile, constrain) — that's why it's a skill,
not a `.cjs`. The *why* behind the rules lives in `.tome/art-direction-model.md`; **read it first.**

**Mold is the ACCURACY layer — appeal/creativity is delegated, not mold's job.** By the four-layer
split, *medium/palette/contrast* belong to the Artist and *world/mood* to the Aesthetic. The Scene
mold writes is deliberately literal. So a render that is faithful but flat/grim/boring is fixed by
**recasting the artist** (the casting principle, [[art-direction-model]]), NOT by loosening mold —
loosening mold only makes renders *inaccurate*. Mold's own failure mode is the opposite: over-
constraining into empty/dead scenes. Apply the rules below at face value; don't pile on extra
negatives chasing a single bad render.

**Worked examples live in the tome, not here.** Every rule below is stated crisply; the rejected-pass
histories that justify it (Orchestra Pit, Theatre lobby/stage, the dusty-tag sweep) are in
`.tome/art-direction-model.md` (the "Mold-skill hardening", "Theatre recast", and "examine-miss"
sections). When a rule's intent is unclear, read the case study there rather than expecting it inline.

## Two modes (one checklist)

- **Author** (default — `/mold <game>` [optional `--only a,b,c`]): write/refresh overrides.
- **Review** (`mold <game> review` [`--fix`]): audit existing overrides against the checklist,
  report per-room which factors pass/fail, recommend fixes; `--fix` applies them. Re-run any time
  the philosophy evolves so old overrides get re-graded against new rules. Review is **analysis-
  first** — without `--fix` it changes nothing.

Both modes run the **same checklist below** — it is the single source of truth.

## Inputs (per room)

- **Facts** — `room-facts.json` → the room's `scene` (already scrape-cleaned + walkthrough-`examine`
  enriched by phase 1: chrome/takeables stripped, fixture detail like the statue's sockets folded in).
- **Exit graph** — `room-facts.json` → the room's `exits` (`dir → DestinationRoom`). The recorded
  *destination* is the spatial sanity-check (factor 5).
- **`unprobed` gap flags** — `room-facts.json` → the room's `unprobed: [...]` list (phase 1 fills it):
  fixture-class nouns the prose NAMES but no `examine` ever captured (a "portrait"/"chandelier"/
  "window" with no recorded appearance). These are the factor-1 probe candidates — examine each
  salient one, or consciously let it render indistinct (the app layer now renders un-described
  surfaces as vague/illegible by default, so an un-probed fixture degrades gracefully rather than
  rendering wrong).
- **`landmarks` glossary** — `room-facts.json` → top-level `landmarks: { noun: {room, detail} }`: every
  fixture examined ANYWHERE in the game, with its content + owning room. Use it for **shared
  landmarks visible across rooms** (factor 7): a portrait examined in the Staircase Landing is in
  the glossary, so when you mold the Lobby below — whose own facts never name the portrait but whose
  establishing shot includes it — you pull `landmarks.portrait.detail` and render it consistently
  instead of letting the model invent a different painting.
- **Live probe (when a salient `unprobed` fixture isn't in the glossary)** — jump the VM to the room
  and `examine` the fixture(s):
  `node tools/play.cjs <game> --file docs/games/walkthroughs/<game>.cmds.txt --snapshot-at "## [<slug>]" --cmds "examine <fixture>"`
  (if the walkthrough has `## [slug]` anchors — see `.tome/walkthrough-anchor-map.md`; else replay
  with `--file` and append `--cmds`). `examine` is read-only in most games, but probe from a
  snapshot, never by injecting into the live walkthrough (a few games tick daemons on examine).
  If the fixture is broadly useful, add the `examine` to `<game>.cmds.txt` (keep-observation-verbs
  rule) and re-run phase 1 so the glossary carries it for good.
- **Neighbors / vertical structure** — adjacent rooms' facts, ESPECIALLY rooms reached by `up`/`down`.
  A room's 3-D volume is often described by its neighbors, not itself (the Lobby is a flat room in
  its own text; the *Landing* above says it "circles around the upper level… see down into it"). Read
  the connected rooms before molding any multi-level space (factors 7 & 10).
- **`_review-notes.json`** — the ONLY home for human feedback, and an **input** to (re-)molding:
  open notes pin known failures (a volume's bad geometry, "too red") that the framing must answer.
- **The existing framing + override** (review/re-mold) — `location-framing.md` and `style.json` →
  `scenes[slug]`. On a re-mold these are the cache you delta-update, not re-derive.

## The molding checklist (single source of truth)

For each room, the molded Scene must satisfy all 12. (Review mode grades each; author mode applies
each as it writes.) Grouped:

**Fidelity — get the facts right**
1. **Examine-enrichment.** Salient *fixtures* carry their examined detail (sockets, carvings,
   inscriptions). Work the room's **`unprobed` list**: for each salient fixture, take its content from
   the **`landmarks` glossary** if present, else live-probe it (`examine <fixture>`); a fixture you
   deliberately leave un-probed will render indistinct by the app default — fine for background, not
   for a focal landmark.
2. **Persistence — fixtures IN, takeables OUT.** Depict only what stays put at the establishing
   view. Anything pocketable (`take <noun>` succeeds) is dropped — the player reads the text for it.
   Puzzle-gated takeables (firmly-attached-until-solved, like the dagger) are fixtures at first view.
3. **Strip transient/chrome.** No weather-flicker lines, NPC movement, dialogue, score/parser text.
4. **Internal-contradiction fencing.** If prose names a thing that visually *is* something unwanted
   ("a tall plank fence" reads as a gate/door), restate it ("a continuous featureless board wall").

**Spatial / relational**
5. **Exit↔destination reconciliation.** Don't depict what the flowery prose implies if the world
   contradicts it: "the lane opens NW into countryside" but `nw → Town Junction` ⇒ render an urban
   opening, not open country. Sanity-check, don't blindly trust either side — the exit graph
   sometimes logs *puzzle*-movement (a climbed window logged as "nw"), so reconcile with judgment.
6. **Puzzle geometry & reachability.** Which wall a feature is on, whether it's reachable, sightlines
   a puzzle depends on (the alley window: north wall, above the cans, climbable).
7. **Shared-landmark consistency.** A feature visible from several rooms (obelisk, lighthouse, a
   window shared by two rooms, a portrait on a landing seen from the hall below) is described
   consistently across them — pull its content from the **`landmarks` glossary** so every room that
   sees it renders the same thing, even rooms whose own facts never name it.

**State — which moment do we paint?**
8. **Canonical state.** Rooms change (dark→lit, dry→flooded, before→after a puzzle). Paint the
   FIRST normal-exploration state and state it explicitly; never a post-puzzle state.
9. **Light / time / occupancy — source-grounded ONLY; never invent mood lighting.** Depict only
   light the source establishes: a named lamp or fire, daylight through a described window, or plain
   darkness where a space is simply unlit (an abandoned cellar is dark because it has no power — not
   because you added "gloom"). **Do NOT invent glows, colour casts, or emotional mood** — no "eerie,
   dim red glow" on a room whose prose says only "red brick" and a "bubbling" (unlit) cauldron. The
   tonal register (how dark, how moody, what palette) is the ARTIST's job, set by *casting* the
   artist — keep it out of the Scene. Stay consistent with time-of-day and neighbors (stormy night
   outdoors, dry interiors).

**Composition** — factor 10 is the big one; it has six named sub-factors, each graded independently.
Worked examples for all of them: tome "Mold-skill hardening" + "examine-miss" sections.

10. **Composition (state the frame; don't leave it to the model).** Every override names one plausible
    camera and places everything relative to it. Six sub-factors:
    - **10a Vantage — INSIDE the room, first-person, eye-level.** The player *is* here; the camera is
      where they stand, looking out/across/up from within. Never step outside to look *at* the room (it
      renders as an object, not a space you occupy). Default facing = **direction of travel into the
      room** (find it from a neighbor's exit that leads here); the entry side is then behind the camera.
      Departing from entry-facing needs a stated reason in the framing bullet. Frame the signature
      feature; put unwanted features behind the camera and *state* that ("main entrance behind the
      viewpoint, out of frame") rather than fighting to exclude them in-frame.
    - **10b Compass-ban — the finished SCENE prose contains ZERO compass terms.** Not "prefer" — zero.
      No "north/west/northeast/to the west/western wall". The generator (and the 3D-blockout pipeline,
      `.tome/blockout-3d-continuity.md`) has no idea which way is south; a compass word mislocates
      features and can mirror-flip the frame. Reason in compass internally, then convert via a
      facing→frame map (facing a direction: ahead = background, behind = out of frame, **E=right,
      W=left** when facing north — rotate for other facings; up=above, down=below) and write
      image-relative position only ("on the right", "in the foreground", "overhead"). **Scan the draft
      for any compass word before saving — one surviving is a defect.**
    - **10c Depth + occlusion — can the camera even SEE it?** Place each feature foreground/midground/
      background, use up/down as elevation, and DROP whatever is occluded (a raised stage hides the pit
      below its front lip — omit it, don't force it in as a trench).
    - **10d Exits — screen or show, never a reflexive doorway.** An exit has NO default form; it's
      movement to another place. Don't cram every exit in (the junction-art note). Per exit, decide:
      **screen it** (off-frame/behind camera/lost in shadow — the conservative default) or **show it
      minimally in its true form**, from the room's own prose first, destination second (split stair →
      flights rising off-frame, not doorways; arch → arch; passage → dim opening). **Cap & place doors —
      they multiply:** loose wording ("doors open off the gallery") studs every wall; name the EXACT
      doors on which walls + "no other doors/openings". (Old App THRESHOLDS rule removed 2026-06-23 —
      form is wholly the mold's call now.)
    - **10e Canonical geometry — give a named real-world feature its true shape, stated.** Otherwise the
      model defaults to a generic box. Spell out PROPORTION (wide/narrow/deep) and, for a recessed space,
      how the surrounding volume relates to it. A **sunken/recessed space** (pit, trench, sunken garden)
      has LOW walls + OPEN space above the rim — never full-height room walls: close+low below,
      open+wide above. Fix narrowness by opening the volume ABOVE, not by widening the recess itself.
    - **10f No invented props — empty is faithful.** Add furniture only if the source describes it; a
      derelict/"empty"/bare room renders EMPTY, identity carried by shape, not props dressed from the
      room's NAME. Never quantify ("a sea of", "rows and rows of") — it multiplies into a cluttered
      forest.

10g. **Multi-level & shared-volume coherence — assemble the whole volume from connected rooms.** For a
    room in a vertical volume (atrium+gallery, auditorium+balconies, pit) read the `up`/`down` neighbors
    and build the full structure first, kept self-consistent: **if a feature is visible, whatever
    reaches it must be too.** Distinguish OWN vs SHARED overheads by cross-checking `look up` text across
    siblings — identical text = a shared volume above (render far/distant); divergent = the room's own
    ceiling (render close). State the level count explicitly ("two storeys, one upper gallery, no higher
    tiers") so the model neither flattens nor stacks extra levels. **Horizontal volumes too:** a single
    hall/auditorium/cavern spanning several rooms is seen ACROSS in any room's establishing shot — pull
    visible far features (rear exits, side boxes, a chandelier) from the *sibling rooms'* prose+exits,
    not just this room's facts. **Boundary:** include a feature because it's genuinely VISIBLE in the
    volume, never by reverse-engineering a puzzle — the art is a recessive backdrop, not a puzzle map.
11. **Scale cues.** "cramped" / "vast" so the model doesn't render a cathedral for a closet.
12. **Layer discipline (per [[art-direction-model]]'s split).** Scene = literal, source-grounded
    facts ONLY. World+mood → Aesthetic; medium/palette/contrast/tonal rendering → Artist (sovereign —
    a colour-forward artist won't be forced grim). Don't bake style, palette, contrast, or invented mood
    into the Scene — a trailing "Dim, dusty, eerie" tag is exactly that. A room's *physical* light
    situation (a named lamp; darkness because unlit) is fine; its *tonal mood* is not.
    **Don't re-tag the global condition per room.** The Aesthetic states the world's condition (an
    abandoned, dusty theatre) ONCE; appending "dusty/bare/faded/neglected/grimy/cobwebbed" to every
    room's tail over-hammers it into a uniform render (Theatre: 31/60 rooms got an unsourced "Dusty."
    tail). Use such a word only when the room is *specifically* that way beyond the global condition —
    not as a reflexive atmosphere tag. Specific physical uses stay fine ("bare bulbs/crossbeams" =
    exposed, a real visible thing).

**Conservative defaults for unavoidable surfaces (floors / walls / materials).** A few surfaces ALWAYS
render even when the prose omits them — chiefly the FLOOR; unnamed it degrades to dirt/void (the App
"invent nothing" rule makes unspecified = generic/absent). For these ONLY you MAY name a plain,
period-plausible material — but UNDERSTATED and muted, never bold/ornate/decorative (a "grand mosaic-
tile" floor goes garish; plain worn marble/stone is the call). Name it PER ZONE so one surface doesn't
bleed across distinct areas (stage boards vs worn-carpet aisles). **Pick the default from the room's
CONTEXT/zone, never by keyword analogy** (a front-of-house orchestra *pit* → theatre wood+plaster, NOT
"stone" from the word "pit" — the underground pits are the rough-stone ones). This is the ONE sanctioned
exception to "depict only what's named": a surface default, NOT new furniture/objects/figures.

**Out of scope (don't over-think):** weather/season beyond what the prose states; implied
sound/motion (it's a still).

## `location-framing.md` — the format (the checklist factors, *answered*)

framing.md is the 12 judgment factors **answered per room**, plus the shared-volume geometry
hoisted out so it's authored once. Markdown, two parts (see `docs/games/images/theatre/location-framing.md`
for the worked reference). Open with the standing header: MOLD-authored / regenerable / never-hand-edit,
the inputs reasoned over, and the litmus.

**Part 1 — `## Cross-cutting`** (game-wide, authored once):
- **`### Register`** — operational notes the mold applies globally: the cast artist (+ the one-line
  reminder of its medium quirk, so per-room scenes don't fight it) and the global condition the
  aesthetic already states once (so you don't re-tag it per room — factor 12).
- **`### Volume: <Name> — anchor <slug>`** — one block per multi-room shared space (atrium,
  auditorium, dome, cistern — factors 7 & 10g). Holds: **Members** (slugs), **Geometry** (the whole
  assembled structure + level count), **Shared landmarks** visible across it (with where each is
  *owned* vs *seen*), **Canonical state** (+ any post-puzzle-contamination warning), and a
  **Vantage convention** if the volume has a recurring framing trap. The `anchor` is the designated
  img2img-relight reference room for the volume (the spike-validated shared-volume approach).

**Part 2 — `## Rooms`** (one `### <slug>` per room, tagged `— member: <Volume>` when it belongs to
one). Each carries only the bullets that apply — most rooms are short; a plain room is 2–3 lines:
- **Vantage** (factor 10a) — where the camera stands, what it looks toward, what's behind it.
- **Occlusion / depth** (factor 10c) — what's hidden by elevation/walls **+ why**, therefore omitted.
- **Exits** (factor 10d) — per exit: **screen** or **show** (+ the form), reasoned from exitFacts.
- **Shared volume** (factors 7, 10g) — which volume features this room sees and must pull in.
- **State** (factor 8) — which moment we paint; **Provenance** flags a dossier-captured post-puzzle
  state the override had to force (the "discovered at high turn → eyeball" case).
- **Surfaces** — any conservative floor/wall default chosen + why (per-zone so it doesn't bleed).
- **Persistence / strip** (factors 2, 3) — only the *non-mechanical* KEEP/DROP calls worth recording.

A factor with nothing non-obvious to decide gets no bullet — framing records *decisions*, not the
absence of them.

## Author mode — procedure

1. Resolve `<game>`; require `room-facts.json` (run `generate-room-facts` first if missing). With
   `--only a,b,c`, restrict to that subset; else all rooms.
2. **Cross-cutting first.** Scan the pack for multi-room shared volumes (rooms whose prose/`up`/`down`
   exits describe one open space — atrium, auditorium, dome). Author each `## Cross-cutting` →
   `### Volume` block once, plus `### Register`. Read `_review-notes.json` now — it's an input, and
   open notes often pin a volume's known failure (the staircase split).
3. **Per room: author the framing, then distill the scene.**
   - Gather facts + exits + exitFacts/lookFacts + neighbors; live-probe a salient `unprobed` fixture
     only if factor 1 needs it. Apply the checklist as *decisions* and write the room's `### <slug>`
     framing bullets (only the factors with something non-obvious to decide).
   - **Distill** those decisions + the dossier facts into the imperative `style.json` → `scenes[slug]`
     (edit the file directly — the review server re-reads it; or POST `/api/scene` if running). The
     scene is downstream of the framing: it says nothing the framing+facts don't justify, and adds
     no new judgment (if you find yourself deciding something while writing the scene, that decision
     belongs back up in the framing).
4. Keep scenes tight and literal (factor 12). A scene may closely resemble the scraped facts — fine;
   the point is every room ends up with a *considered, render-ready* Scene backed by a recorded *why*.
5. Report a one-line summary per room (flag rooms where you live-probed, reconciled an exit, or
   forced a state, so the user can spot-check), and list the volumes authored.

**Re-mold (after a dossier regen or a new review note) — the cheap path the whole design exists for:**
don't re-derive from scratch. Read the existing framing.md, diff the changed dossier facts (or the
new review note) against it, update only the affected framing bullets, then re-distill only those
rooms' scenes. A note that contradicts a specific decision edits that one bullet; a volume-wide note
edits the `### Volume` block and all its members re-distill.

## Review mode — procedure

Review grades **two surfaces**: the framing decisions, and whether the scene faithfully distils them.

1. Read `location-framing.md` and `style.json` → `scenes{}` (fall back to the scraped `scene` for
   rooms lacking an override — flag as "no override yet"; flag rooms with a scene but **no framing
   entry** as "scene un-backed" — a pre-Distill or hand-edited override whose reasoning was never
   recorded).
2. **Grade the framing** against all 12 factors; per room output the factors it FAILS (with specific
   evidence — "factor 5: depicts countryside, but nw → Town Junction") and a one-line fix.
3. **Grade the distillation:** does the scene say anything the framing+facts don't justify (smuggled
   judgment → hoist it up to framing), or contradict the framing (drift → re-distill)?
4. Add a **clusters** line for a rule violated across many rooms (a systemic molding gap), and check
   each `### Volume` block for internal consistency (if a feature is visible, whatever reaches it
   must be too).
5. Without `--fix`: stop, offer to apply. With `--fix`: edit the framing bullet first, then
   re-distill the affected scene(s); report what changed. Never delete a human-tuned override
   without showing the before→after.

## Notes
- Dev-only data (`style.json`, `room-facts.json`, `location-framing.md`) — do NOT bump the app version.
- Don't touch `room-facts.json` here (that's phase 1's artifact); mold writes `location-framing.md`
  (judgment) and `style.json` scenes{} (distilled prose) — nothing else.
- `location-framing.md` is the regenerable cache; `_review-notes.json` is the human record. Never
  store feedback in framing.md, and never hand-edit framing.md — change the inputs and re-mold.
- Sibling skills: `generate-room-facts` (facts, phase 1), the render skill (phase 3),
  `build-scenes` (wrapper = facts + mold author in one call), `/review-notes` (reviews rendered
  *images*; mold-review audits the scene *text*). `location-art` still owns audition / promote /
  open-reviewer.
