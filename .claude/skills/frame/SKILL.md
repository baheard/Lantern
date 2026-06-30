---
name: frame
description: Phase 2a of the location-art pipeline — turn scraped room FACTS into per-room framing JUDGMENT (vantage, occlusion, exits, state, shared-volume geometry), written to docs/games/images/<game>/location-framing.md. Pairs with /scene (phase 2b), which distils this into render prose. Author mode (default) writes/refreshes; `frame <game> review` audits.
---

# frame skill

**Phase 2a of the location-art pipeline** (the JUDGMENT half; `/scene` is phase 2b, the PROSE half).
Frame turns the scraped room *facts* into a per-room **framing decision record** —
`docs/games/images/<game>/location-framing.md` — naming, for every room, the camera vantage, what is
occluded, how each exit is handled, the canonical state, and the game's shared-volume geometry.
`/scene` then distils that record into the imperative Scene override (`style.json` → `scenes[slug]`)
that the renderer reads.

```
generate-room-facts ─▶ [ frame: facts → JUDGMENT ] ─▶ [ scene: framing → PROSE ] ─▶ render
   room-facts.json          location-framing.md            style.json scenes{}        images
   (FACTS)                  (decisions + WHY)               (imperative prose)
```

**Why frame is its own skill.** Framing is expensive, irreversible *judgment* (which way the camera
points, what's hidden, which moment to paint) and it's what you review hardest. Once right it stays
stable. Distillation (`/scene`) is mechanical-ish and gets re-run constantly — every facts regen,
every note. Splitting lets you re-distil cheaply without re-opening judgment. The cost they share —
the 12-factor checklist — lives HERE, in one place; `/scene` references only the few factors it
enforces at emit time. Architecture: `.tome/art-direction-model.md` "dossier → framing → scene".

**The litmus that keeps the two skills honest:** framing holds the **decision + why**; the scene holds
the **imperative the model renders**. One explains, one commands. If a framing entry reads like
finished render-prose, it has drifted into `/scene`'s job. If it merely restates a `room-facts.json`
fact, it belongs in the dossier (fix the engine, not here). And if `/scene` finds itself *deciding*
something (a facing, an occlusion call) rather than rendering a decision already here — that decision
belongs back up here.

**Frame is the ACCURACY layer — appeal/creativity is delegated.** Medium/palette/contrast belong to
the Artist; world/mood to the Aesthetic. Framing decisions are deliberately literal. A render that is
faithful but flat is fixed by recasting the artist, NOT by loosening framing — loosening only makes
renders *inaccurate*. Framing's own failure mode is the opposite: over-constraining into empty/dead
scenes. Apply the rules at face value; don't pile on negatives chasing one bad render.

**Worked examples live in the tome, not here.** The rejected-pass histories that justify each rule are
in `.tome/art-direction-model.md` ("Mold-skill hardening", "Theatre recast", "examine-miss"). Read it
first when a rule's intent is unclear.

## Two modes

- **Author** (default — `/frame <game>` [optional `--only a,b,c`]): write/refresh framing entries.
- **Review** (`frame <game> review` [`--fix`]): audit existing framing against the 12-factor
  checklist, report per-room which factors pass/fail, recommend fixes; `--fix` applies them. Re-run
  any time the philosophy evolves so old entries get re-graded. Review is **analysis-first** — without
  `--fix` it changes nothing.

## Inputs (per room)

- **Facts** — `room-facts.json` → the room's `scene` (scrape-cleaned + walkthrough-`examine`/`look`
  enriched by phase 1) and `description`.
- **Exit graph** — the room's `exits` (`dir → DestinationRoom`); the recorded *destination* is the
  spatial sanity-check (factor 5).
- **Entry facing** — the room's **`defaultFacing`** (the compass direction the player travels to ENTER
  the room — phase 1 computes it from the inbound edge) and **`enteredBy`** (all inbound `dir ← Room`).
  This is the load-bearing input for factor 10a: it hands you the camera facing so you never re-derive
  it by hand. Use `defaultFacing` unless you depart from it for a stated reason.
- **`unprobed` gap flags** — fixture-class nouns the prose NAMES but no `examine` captured. Factor-1
  probe candidates: examine each salient one (live-probe or pull from the glossary) or consciously let
  it render indistinct (the app default renders un-described surfaces vague).
- **`landmarks` glossary** — top-level `landmarks: { noun: {room, detail} }`: every fixture examined
  ANYWHERE in the game. Use it for shared landmarks visible across rooms (factor 7).
- **`sceneExtras`** — `[{cmd, text}]`: the examine/look reveals folded into this room's scene beyond
  the first-visit description. Tells you WHAT in the scene came from a probe vs the room text (factor 1).
- **Live probe** (a salient `unprobed` fixture not in the glossary) — jump the VM and examine:
  `node tools/play.cjs <game> --file docs/games/walkthroughs/<game>.cmds.txt --snapshot-at "## [<slug>]" --cmds "examine <fixture>"`
  (probe from a snapshot, never by injecting into the live walkthrough — a few games tick daemons on
  examine). If broadly useful, add the `examine` to `<game>.cmds.txt` and re-run phase 1.
- **Neighbors / vertical structure** — adjacent rooms' facts, ESPECIALLY `up`/`down`. A room's 3-D
  volume is often described by its neighbors, not itself. Read connected rooms before molding any
  multi-level space (factors 7 & 10g).
- **`_review-notes.json`** — the ONLY home for human feedback, and an input: open notes pin known
  failures the framing must answer.
- **The existing framing** (review/re-mold) — the cache you delta-update, not re-derive.

## The 12-factor checklist (single source of truth — owned here)

For each room, the framing must answer all 12 (and the distilled scene, downstream, must honour them).
Review mode grades each. Grouped:

**Fidelity — get the facts right**
1. **Examine-enrichment.** Salient *fixtures* carry their examined detail (sockets, carvings,
   inscriptions). Work the `unprobed` list: take content from the `landmarks` glossary if present,
   else live-probe; a fixture left un-probed renders indistinct by the app default — fine for
   background, not for a focal landmark.
   **Multi-part fixtures — enumerate the FULL `sceneExtras` component set; never collapse to a
   generic noun.** When a focal fixture/mechanism has several examined parts in `sceneExtras` (a wheel
   with named sub-wheels, a machine with distinct components, a panel of distinct controls), the
   framing must name EVERY part and its distinguishing attributes (count, colour, material, motion) —
   not summarise to "a vast brass machine" or "smaller wheels bearing globes". `sceneExtras` is the
   ONLY pull point for this detail (by design it is never auto-folded into the scene field, and `/scene`
   inherits whatever framing decided) — so collapsing it HERE silently strips the detail from every
   downstream render and every member room that sees the fixture. If a part is in `sceneExtras`, it is
   in the framing.
2. **Persistence — fixtures IN, takeables OUT.** Depict only what stays put at the establishing view.
   Anything pocketable (`take <noun>` succeeds) is dropped. Puzzle-gated takeables (firmly-attached-
   until-solved, like the dagger) are fixtures at first view.
3. **Strip transient/chrome.** No weather-flicker, NPC movement, dialogue, score/parser text.
4. **Internal-contradiction fencing.** If prose names a thing that visually *is* something unwanted
   ("a tall plank fence" reads as a gate/door), restate it ("a continuous featureless board wall").

**Spatial / relational**
5. **Exit↔destination reconciliation.** Don't depict what flowery prose implies if the world
   contradicts it: "the lane opens NW into countryside" but `nw → Town Junction` ⇒ render an urban
   opening. Sanity-check, don't blindly trust either side — the exit graph sometimes logs *puzzle*-
   movement (a climbed window logged "nw").
6. **Puzzle geometry & reachability.** Which wall a feature is on, whether it's reachable, the
   sightlines a puzzle depends on (the alley window: north wall, above the cans, climbable).
7. **Shared-landmark consistency.** A feature visible from several rooms (obelisk, lighthouse, a
   portrait on a landing seen from the hall below) is described consistently — pull its content from
   the `landmarks` glossary so every room that sees it renders the same thing.

**State — which moment do we paint?**
8. **Canonical state.** Paint the FIRST normal-exploration state and state it explicitly; never a
   post-puzzle state.
9. **Light / time / occupancy — source-grounded ONLY; never invent mood lighting.** Depict only light
   the source establishes: a named lamp/fire, daylight through a described window, or plain darkness
   where a space is simply unlit. Do NOT invent glows, colour casts, or emotional mood. Tonal register
   is the ARTIST's job — keep it out of framing. Stay consistent with time-of-day and neighbors.

**Composition** — factor 10 is the big one; six named sub-factors, each graded independently.
10. **Composition (state the frame; don't leave it to the model).** Every room names one plausible
    camera and places everything relative to it.
    - **10a Vantage — INSIDE the room, first-person, eye-level — and PIN THE FACING (mandatory).** The
      player *is* here; the camera is where they stand, looking out/across/up from within. Never step
      outside to look *at* the room. **Default facing = the room's `defaultFacing`** (the travel-into
      direction, handed to you by the facts). State the facing explicitly in the framing bullet; a
      multi-exit room with no pinned facing is a FACTOR-10a FAIL (it's what produces vague "in one
      wall" placement downstream). Departing from `defaultFacing` is allowed but needs a stated reason
      (usually: to face the signature feature — note when travel-in and the signature coincide). Frame
      the signature feature; put unwanted features behind the camera and *state* that ("main entrance
      behind the viewpoint, out of frame").
      **Furniture the player OCCUPIES is the vantage, not a prop — OMIT it.** A *seated/lying/riding-on-
      X* state room puts X beneath/behind the camera: drop it and say so. Naming occupied furniture as
      an in-frame object makes the model render it EMPTY (no-people rule) — the "why is there an empty
      chair?" defect. Only its reflection/shadow may appear (Dreamhold `curtained-room-on-the-chair`).
    - **10b Facing→frame map (decide it here; `/scene` emits it).** Having pinned the facing, state the
      compass→image-relative map for THIS room so the scene can write image-relative prose with zero
      compass words: facing a direction, ahead = background, behind = out of frame, and (facing north)
      **E=right, W=left** — rotate for other facings (facing east ⇒ N=left, S=right, W=behind; etc.);
      up=above, down=below. Then locate each feature in the framing as left/right/ahead/behind. The
      generator has no idea which way is south, so a surviving compass word mislocates or mirror-flips —
      but the *fix* is this decision here, not just word-scrubbing in the scene.
    - **10c Depth + occlusion — can the camera even SEE it?** Place each feature foreground/midground/
      background, use up/down as elevation, and DROP whatever is occluded (a raised stage hides the pit
      below its front lip — omit it).
    - **10d Exits — screen or show, never a reflexive doorway.** An exit has NO default form. Don't cram
      every exit in (the junction-art note). Per exit: **screen it** (off-frame/behind/lost in shadow —
      the conservative default) or **show it minimally in its true form**, from the room's own prose
      first, destination second (split stair → flights rising off-frame, not doorways; arch → arch).
      **A SHOWN exit MUST carry a frame position** (ahead/left/right/overhead/foreground+background),
      derived from the pinned facing — a shown exit with no position is what produces the floating
      "an archway reveals stairs" miss downstream (`north-alcove`). If you can't place it, you haven't
      pinned the facing — fix 10a first.
      **Opposite-wall / pass-through rule.** Two openings on OPPOSING walls cannot both be in-frame: the
      camera faces one, so the other is to the side or behind. A pass-through space — an alcove with the
      chamber-mouth on one wall and an exit archway on the opposite wall — must STATE which opening is
      the subject (ahead/foreground) and where the other lands (a curved alcove swings its far opening to
      a SIDE; a straight one puts it behind-camera → screen it). Never write framing that shows a feature
      ahead AND a second feature on the wall behind it as both visible (the `north-alcove` orrery-ahead
      vs archway-behind contradiction).
      **Cap & place doors** — loose wording studs every wall; name the EXACT doors on which walls +
      "no other doors/openings".
    - **10e Canonical geometry — give a named real-world feature its true shape, stated.** Spell out
      proportion; a sunken/recessed space has LOW walls + OPEN space above the rim, never full-height
      room walls. Fix narrowness by opening the volume ABOVE, not widening the recess.
    - **10f No invented props — empty is faithful.** Add furniture only if the source describes it; a
      bare room renders EMPTY, identity carried by shape. Never quantify ("a sea of", "rows and rows").
10g. **Multi-level & shared-volume coherence — assemble the whole volume from connected rooms.** Read
    the `up`/`down` neighbors and build the full structure first: if a feature is visible, whatever
    reaches it must be too. Distinguish OWN vs SHARED overheads via `look up` text across siblings
    (identical = shared volume above, render far; divergent = own ceiling, render close). State the
    level count ("two storeys, one upper gallery, no higher tiers"). Horizontal volumes too — a hall
    spanning several rooms is seen ACROSS in any room's establishing shot; pull visible far features
    from sibling rooms' prose. Boundary: include a feature because it's genuinely VISIBLE, never by
    reverse-engineering a puzzle.
11. **Scale cues.** "cramped" / "vast" so the model doesn't render a cathedral for a closet.
12. **Layer discipline.** Framing decisions = literal, source-grounded facts ONLY. World+mood →
    Aesthetic; medium/palette/contrast → Artist. Don't bake style/palette/mood into a framing bullet. A
    room's *physical* light situation (a named lamp; darkness because unlit) is fine; its *tonal mood*
    is not. Don't re-tag the global condition per room (the Aesthetic states "abandoned, dusty" once —
    appending "dusty" to every room over-hammers it).

(Conservative floor/wall surface defaults — the one sanctioned "depict what isn't named" exception —
are an *emit-time* concern; they live in `/scene`, not here.)

**Out of scope:** weather/season beyond what the prose states; implied sound/motion (it's a still).

## `location-framing.md` — the format (the checklist factors, *answered*)

Markdown, two parts (worked reference: `docs/games/images/theatre/location-framing.md`). Open with the
standing header: FRAME-authored / regenerable / never-hand-edit, the inputs reasoned over, and the
litmus.

**Part 1 — `## Cross-cutting`** (game-wide, authored once):
- **`### Register`** — global operational notes: the cast artist (+ a one-line reminder of its medium
  quirk so per-room framing doesn't fight it) and the global condition the aesthetic states once.
- **`### Volume: <Name> — anchor <slug>`** — one block per multi-room shared space (factors 7 & 10g):
  **Members**, **Geometry** (assembled structure + level count), **Shared landmarks** (owned vs seen),
  **Canonical state** (+ post-puzzle-contamination warning), and a **Vantage convention** if the
  volume has a recurring framing trap. The `anchor` is the designated img2img-relight reference room.

**Part 2 — `## Rooms`** (one `### <slug>` per room, tagged `— member: <Volume>` when applicable). Each
carries only the bullets that apply — most rooms are 2–3 lines:
- **Vantage** (10a) — where the camera stands (cite the pinned facing + its source: `defaultFacing` or
  the stated reason for departing), what it looks toward, what's behind it.
- **Facing→frame** (10b) — the compass→left/right/ahead/behind map for this room's facing, and where
  each locatable feature lands.
- **Occlusion / depth** (10c) — what's hidden + why, therefore omitted.
- **Exits** (10d) — per exit: screen or show (+ form), reasoned from the exit graph.
- **Shared volume** (7, 10g) — which volume features this room sees and must pull in.
- **State** (8) — which moment; **Provenance** flags a dossier-captured post-puzzle state.
- **Persistence / strip** (2, 3) — only the non-mechanical KEEP/DROP calls worth recording.

A factor with nothing non-obvious to decide gets no bullet — framing records *decisions*, not their
absence.

## Author mode — procedure

1. Resolve `<game>`; require `room-facts.json` (run `generate-room-facts` first if missing). `--only
   a,b,c` restricts the subset; else all rooms.
2. **Cross-cutting first.** Scan for multi-room shared volumes; author each `### Volume` block + the
   `### Register`. Read `_review-notes.json` now — open notes often pin a volume's known failure.
3. **Per room:** gather facts + exits + `defaultFacing`/`enteredBy` + `unprobed`/`sceneExtras` +
   neighbors; live-probe a salient `unprobed` fixture only if factor 1 needs it. Apply the 12 factors
   as *decisions* and write the room's `### <slug>` bullets (only the factors with something non-obvious
   to decide). **Always pin the facing (10a) and state the facing→frame map (10b)** for any room with
   more than one exit or any off-centre feature.
4. Report a one-line summary per room (flag rooms where you live-probed, reconciled an exit, departed
   from `defaultFacing`, or forced a state), and list the volumes authored. **Then point the user at
   `/scene <game>` to distil** — frame writes no scene prose.

**Re-mold (after a dossier regen or a new review note) — the cheap path:** don't re-derive. Read the
existing framing, diff the changed facts (or the new note) against it, update only the affected
bullets. A note that contradicts a specific decision edits that one bullet; a volume-wide note edits
the `### Volume` block. Then run `/scene --only <those rooms>`.

## Review mode — procedure

1. Read `location-framing.md`. **Coverage check — parse headers correctly or you WILL false-flag:**
   a `### <slug>` header may be (a) a single slug, (b) a parenthetical-tagged slug
   (`### laboratory (mural landmark)`), (c) a **combined slash-list** with `-suffix` shorthand
   (`### starry-dome-center / -east / -south / -west / -north` covers all five), or (d) a **glob**
   (`### catwalk-*-night` covers every `catwalk-<dir>-night`). Expand all four forms before deciding a
   room "has no entry" — a naïve first-slug regex reports dozens of phantom gaps (it did, 2026-06-29:
   the fully-framed Dome/Catwalk/Cistern volumes looked like 20 un-framed rooms). Only flag a slug
   matched by NONE of the expanded headers.
2. **Grade the framing** against all 12 factors; per room output the factors it FAILS (with specific
   evidence — "10a: no facing pinned, 4 exits"; "5: depicts countryside, but nw → Town Junction") and a
   one-line fix.
3. Add a **clusters** line for a rule violated across many rooms, and check each `### Volume` block for
   internal consistency.
4. Without `--fix`: stop, offer to apply. With `--fix`: edit the affected bullets; report what changed.
   (Re-distilling the scenes is `/scene`'s job — hand off the changed slugs.)

## Notes
- Dev-only data (`room-facts.json`, `location-framing.md`) — do NOT bump the app version.
- Don't touch `room-facts.json` (phase 1's artifact) or `style.json` scenes (that's `/scene`). Frame
  writes ONLY `location-framing.md`.
- `location-framing.md` is the regenerable cache; `_review-notes.json` is the human record. Never store
  feedback in framing.md, never hand-edit it — change the inputs and re-run.
- The pipeline STEP is stamped by `/scene` (the terminal phase-2 artifact) as `mold`, for `/studio`
  staleness detection — frame stamps nothing.
- Sibling skills: `generate-room-facts` (phase 1), **`scene` (phase 2b — distils this into prose)**,
  the render skill (phase 3), `/studio` (orchestrator), `/review-notes` (reviews rendered images).
