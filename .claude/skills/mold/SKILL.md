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

**Composition**
10. **State the camera/vantage explicitly — don't leave the angle to the model.** Every override
    names one plausible camera: where the viewer stands and what they look toward ("viewed from the
    doorway, looking across the room toward the far hearth").
    - **The camera stands INSIDE the location, first-person, at standing eye-level — almost always.**
      The player *is* in this room; the vantage is the place they're standing, looking out / across /
      up from within it. Do NOT step the camera outside the room to look *at* it as an object — that
      turns the location into a thing seen from elsewhere and the model renders it as a feature, not a
      space you occupy. (Orchestra Pit: an earlier pass framed it "from the auditorium side looking
      north, the sunken well in the foreground" — so the model drew a hole in the floor seen from
      outside. The player is standing *down in the pit*; the correct vantage is on the pit floor
      looking up at the stage lip looming above, music stands around, the rail overhead.) Break this
      only with a strong, stated reason, and even then keep the camera *within* the room's footprint.
    - **Entry-facing heuristic — the default vantage when the prose covers multiple directions.**
      The player arrives in a room looking the direction they traveled. **Camera facing = direction of
      travel into the room.** The entry side is then naturally behind the camera. Find the primary
      entry by scanning neighboring rooms' exits for one that leads here: the neighbor's exit direction
      is the travel direction → camera faces that way. Example: if the eastern auditorium has exit
      `west → Western Balcony`, the player traveled west, so the camera faces west — the western wall
      (bricked doorway + crawl hole) is in frame; the auditorium void is behind the camera.
      **This is the conservative default, not an override trigger.** You need a stated reason to
      depart from it — e.g. "the entry wall is blank; the panoramic east view is the room's identity"
      — and that reason goes in the framing bullet. When a feature on the entry-facing wall is
      interesting, the heuristic and the content align naturally; only override when they don't.
      (This also explains when to screen the entry passage: it is behind the camera by default.)
    Choose the vantage that frames the
    room's signature feature and puts unwanted features *behind the camera* — state it ("the main
    entrance is behind the viewpoint, out of frame") rather than fighting to exclude them in-frame.
    Don't cram every exit in (unnatural layouts — the junction-art note). **An exit has NO default
    form** — it's *movement to another place*, not inherently a door. For each exit the vantage would
    include, decide deliberately: **screen it** (off-frame / behind the camera / lost in shadow — the
    conservative default; a recessive backdrop needn't advertise its exits), or **show it minimally in
    its true form**, taken from the room's *own prose first* and its destination second (the grand
    staircase that "splits east and west" → flights rising off-frame, *not* doorways; an arch → an arch;
    a passage → a dim opening). Never a reflexive dark doorway, and never the room beyond. (The old
    global "exits are mere THRESHOLDS / dim doorway" rule was REMOVED from App 2026-06-23 — it stamped
    literal doorways onto exits that were really stairs; form is now wholly the mold's call.)
    - **HARD RULE: the finished SCENE prose contains ZERO compass terms.** Not "prefer" — *zero*.
      No "north/south/east/west", no "northeast", no "to the west", no "western wall". The image
      generator (and the 3D-blockout pipeline that may render this scene — see
      `.tome/blockout-3d-continuity.md`) has NO idea which way is south; a compass word is noise it
      mis-applies, which mislocates features and even mirror-flips the frame. Compass lives ONLY in the
      framing dossier (the facts you reason over), never in the scene the model reads.
    - **Describe the scene the way a person describes a view: vantage first, then everything relative
      to it.** Lead with where the camera stands and what it looks at, then place each thing by IMAGE
      POSITION — "on the right", "in the foreground", "overhead", "off to the left", "ahead and above".
      To get there, fix the camera + facing and build a quick facing→frame map: facing **north**, N =
      ahead/background, S = behind (out of frame), **E = right, W = left**, up = above, down = below
      (rotate for any other facing). Apply it to fixtures, walls, light sources, AND exits — anything
      with a direction. (Orchestra Pit: "door in the *east* side wall" rendered on the LEFT; facing
      north, east is the RIGHT wall — "right-hand wall" fixed it.)
    - **Check before you write the override: scan your draft for any compass word and replace it with
      its frame-relative equivalent. A compass word surviving into a scene is a defect.**
    - **Then reason about DEPTH + OCCLUSION — can the camera even SEE it?** Place each feature in
      foreground/midground/background, use up/down as ELEVATION cues, and DROP whatever is occluded.
      (Theatre Stage: the exit graph shows the orchestra pit is "down" from the stage ⇒ the stage is
      RAISED ⇒ from a vantage on the elevated stage the pit, below and in front, is hidden behind the
      stage lip — so omit it. An earlier pass forced it into frame as a trench and it read as a hole cut
      in the stage; the correct call was not to show it.)
    - **Cap and place visible exits (doors especially multiply).** Loose wording ("doorways open off
      the hall", "doors around the gallery") studs every wall with doors. Name the EXACT doors, on
      which walls, and add "no other doors/openings". (Theatre Lobby: "doors open off the gallery"
      produced 3+; truth = two small private doors at ground level + ONE set of double doors visible up
      on the gallery.)
    - **Render a named real-world feature with its CANONICAL geometry/orientation — state it.** When
      a thing has a real-world shape and placement, the model will otherwise default to a generic box;
      spell out the true geometry — including PROPORTION (wide vs narrow vs deep) and, for a recessed
      space, how the SURROUNDING volume relates to it. Likewise: a staircase landing turns, a corridor
      is long and narrow, a well is round and deep. Don't let a distinctive shape collapse into "a
      room".
      **A SUNKEN/RECESSED space (pit, trench, sunken garden, foxhole) has LOW walls + an OPEN space
      above the rim — never full-height room walls.** Standing down in a recess, the walls around you
      are only as tall as the recess is DEEP (a low parapet at chest/shoulder height); ABOVE that rim
      the larger space opens up and is visible. Render that contrast — close+low below, open+wide above
      — or "standing in a pit" collapses into "standing in a small enclosed room with tall walls".
      (Orchestra Pit, learned over MANY rejected passes: it's a NARROW sunken depression with LOW pit
      walls on the sides and behind, while the WIDE TALL theatre opens up over the rim — the broad
      stage rising directly ahead, the auditorium beyond the rear rim. Mistakes made along the way:
      tall side walls → "a small room with a stage"; a wide trough with distant walls → lost the
      sunken feel; the floor receding away from the stage → a generic box. The narrow-floor /
      open-theatre-above contrast is the whole identity. Note "small/too small" described the PIT, not
      the theatre — don't widen the pit itself to fix narrowness; open up the theatre ABOVE it.)
    - **Don't invent props the prose never names — empty is a faithful render.** Check the source
      actually describes furniture before adding it; a derelict / "empty" / bare room should be
      rendered EMPTY, not dressed from the room's NAME. And never quantify ("crowding the space", "a
      sea of", "rows and rows of") — that multiplies the prop into a cluttered forest. (Orchestra Pit:
      the LOOK text names NO furniture, yet two passes invented music stands from the word "orchestra"
      — first a forest, then a couple; the faithful answer was an empty pit, identity carried by the
      shape, not props.)
10b. **Multi-level coherence (assemble vertical spaces from the connected rooms).** For a room that
    is part of a vertical volume — an atrium with a wraparound gallery, an auditorium with balconies,
    a pit — read the `up`/`down` neighbor rooms and build the WHOLE structure before you write, then
    keep it physically self-consistent: **if a feature is visible, whatever reaches it must be too.**
    - **Cross-check `look up`/directional probe text across sibling rooms to tell OWN features from
      SHARED ones.** If the *same* look-up sentence appears in several rooms, that overhead belongs to
      a shared volume they all sit under — render it as a DISTANT, shared structure ("far above"), not
      as each room's own ceiling. Divergent text = the room's own ceiling, render it close. (Theatre:
      the identical "far above… endless rows of lighting and girders" appears in BOTH `stage` and
      `orchestra-pit` ⇒ it's the stage's tall FLY TOWER they share at the front, drawn far/high/small;
      the auditorium rooms instead report a "finely-sculptured plaster ceiling" — their own, drawn
      close. An early pit pass drew the girders as a low grid pressing down on the pit — wrong owner.)
    (Theatre Lobby, learned over several rejected passes: the grand staircase rises to a *mid-landing*
    then SPLITS east/west up to a *single continuous* encircling gallery — an imperial/double-return
    stair. Rendering the gallery without the split, or two galleries, or a couch the prose never
    names, were all failures. State the level count explicitly — "two storeys, one upper gallery, no
    higher tiers" — so the model neither flattens nor stacks extra levels.)
    **Horizontal shared volumes too — assemble a hall from the rooms that open onto it.** A single
    auditorium / great hall / cavern is often ONE open volume spanning several rooms, and any room's
    establishing shot sees ACROSS all of it. Pull the visible far features — rear exits, side
    balconies/boxes, a hanging chandelier — from the sibling rooms' prose + exits, not just this room's
    own facts. (Theatre Stage looks out over the auditorium: the rear double-doors are in the *Eastern
    Aisle*'s exits; the balcony boxes are their own rooms; the chandelier is named in those rooms' PROSE
    — NOT the `landmarks` glossary, since it was never examined. A stage scene built from the stage's
    facts alone missed all three.) **Boundary:** include such features because they are genuinely VISIBLE
    parts of the shared volume — NOT by reverse-engineering puzzles. The art is a recessive mood backdrop,
    not a puzzle diagram; a fixture earns its place by being seen from the vantage, not by being
    puzzle-load-bearing (the box seats belong because the auditorium HAS boxes, not because a
    chandelier-swing puzzle needs them).
11. **Scale cues.** "cramped" / "vast" so the model doesn't render a cathedral for a closet.
12. **Layer discipline (per [[art-direction-model]]'s split).** Scene = literal, source-grounded
    facts ONLY. The **world + mood** belong to the Aesthetic; **medium, palette, contrast and tonal
    rendering** belong to the Artist (whose identity is sovereign — a colour-forward artist won't be
    forced grim by a game). Don't bake style, palette, contrast, or invented mood adjectives into the
    Scene — and a trailing "Dim, dusty, eerie" mood tag is exactly that. A room's *physical* light
    situation (a named lamp; darkness because it's unlit) is fine; its *tonal mood* is not.
    **This also bans condition/atmosphere adjectives that merely SOUND physical — "dusty", "bare",
    "faded", "neglected", "grimy", "cobwebbed", "decaying".** Do NOT append them unless the SOURCE room
    text uses that exact word. The game Aesthetic already establishes the global condition (an abandoned,
    dusty theatre) ONCE; restating it in every room's tail over-hammers it. (Theatre: the molder appended
    a "Dusty."/"Bare, dusty." tail to 31 of 60 rooms whose source never said it — renders came out
    uniformly "dusty and bare".) Specific physical uses stay fine ("bare bulbs", "bare crossbeams" =
    exposed, a real visible thing); blanket condition tags do not.

**Conservative defaults for unavoidable surfaces (floors / walls / materials).** A few surfaces ALWAYS
render even when the prose omits them — chiefly the FLOOR. Left unnamed they degrade to dirt/void (the
App "invent nothing" rule makes unspecified = generic/absent). For these unavoidable surfaces ONLY you
MAY name a plain, period-plausible material so the render has substance — but keep it UNDERSTATED and
muted, never bold, ornate or decorative (Theatre Lobby: a "grand geometric mosaic-tile" floor rendered
garish under a colour-forward artist; a plain worn-marble/stone floor is the conservative call). Name
the material PER ZONE so one surface doesn't bleed across distinct areas (Theatre Stage: the wooden
stage flowed straight into the seating — the aisles should read as worn CARPET, separate from the stage
boards). This is the ONE sanctioned exception to "depict only what's named": it picks a default for a
surface that cannot be absent, NOT new furniture/objects/figures, which stay forbidden.
**Pick the default from the room's CONTEXT, never by keyword analogy.** The plausible material follows
the room's *zone* (theatre interior, cellar, sewer), not a noun in its name. (Theatre: the *orchestra
pit* is a front-of-house theatre feature → plain WOOD + plaster like the stage; rendering it "stone"
wrongly conflated it with the *underground* pits — `above-the-pit`/`inside-pit`, genuinely rough-stone
caverns. Same word "pit", opposite material — the zone decides, not the word.)

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
  auditorium, dome, cistern — factors 7 & 10b). Holds: **Members** (slugs), **Geometry** (the whole
  assembled structure + level count), **Shared landmarks** visible across it (with where each is
  *owned* vs *seen*), **Canonical state** (+ any post-puzzle-contamination warning), and a
  **Vantage convention** if the volume has a recurring framing trap. The `anchor` is the designated
  img2img-relight reference room for the volume (the spike-validated shared-volume approach).

**Part 2 — `## Rooms`** (one `### <slug>` per room, tagged `— member: <Volume>` when it belongs to
one). Each carries only the bullets that apply — most rooms are short; a plain room is 2–3 lines:
- **Vantage** (factor 10) — where the camera stands, what it looks toward, what's behind it.
- **Occlusion / depth** (factor 10) — what's hidden by elevation/walls **+ why**, therefore omitted.
- **Exits** (factor 10) — per exit: **screen** or **show** (+ the form), reasoned from exitFacts.
- **Shared volume** (factors 7, 10b) — which volume features this room sees and must pull in.
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
