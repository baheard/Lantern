---
name: mold
description: Author or review the per-room Scene OVERRIDES for a Lantern game's art (the editable Scene box in artview). Author mode molds each room's scraped facts into a finished, probed, considered scene override written to <game>/style.json so artview opens render-ready; review mode audits existing overrides against the molding checklist and reports (optionally fixes) violations. Triggered when the user says "/mold <game>", "mold scenes for <game>", "populate scene overrides", "mold review <game>", or "review scene overrides for <game>". Prerequisite: generate-location-prompts (facts). Phase 2 of the art pipeline; phase 3 is the render skill.
---

# mold skill

**Phase 2 of the location-art pipeline.** It turns the scraped room *facts* into a finished,
**molded Scene override** per room — the editable Scene text you see in artview — written to
`docs/games/images/<game>/style.json` → `scenes[slug]`. After it runs, every location is
render-ready: App / Artist / Aesthetic / **Scene-override** all sit composed, so making pictures
(phase 3, the render skill) has nothing left to decide.

```
generate-location-prompts → [mold] → render
   prompts.json (FACTS)      style.json scenes{} (MOLDED TEXT)     images
```

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

- **Facts** — `prompts.json` → the room's `scene` (already scrape-cleaned + walkthrough-`examine`
  enriched by phase 1: chrome/takeables stripped, fixture detail like the statue's sockets folded in).
- **Exit graph** — `prompts.json` → the room's `exits` (`dir → DestinationRoom`). The recorded
  *destination* is the spatial sanity-check (factor 5).
- **Live probe (optional, for salient fixtures the walkthrough never examined)** — jump the VM to
  the room and `examine` the key fixture(s):
  `node tools/play.cjs <game> --file docs/games/walkthroughs/<game>.cmds.txt --snapshot-at "## [<slug>]" --cmds "examine <fixture>"`
  (if the walkthrough has `## [slug]` anchors — see `.tome/walkthrough-anchor-map.md`; else replay
  with `--file` and append `--cmds`). `examine` is read-only in most games, but probe from a
  snapshot, never by injecting into the live walkthrough (a few games tick daemons on examine).
- **Neighbors** — adjacent rooms' facts (for shared-landmark consistency, factor 7).
- **The existing override** (review mode) — `style.json` → `scenes[slug]`.

## The molding checklist (single source of truth)

For each room, the molded Scene must satisfy all 12. (Review mode grades each; author mode applies
each as it writes.) Grouped:

**Fidelity — get the facts right**
1. **Examine-enrichment.** Salient *fixtures* carry their examined detail (sockets, carvings,
   inscriptions). Probe one if the facts feel thin and the walkthrough never examined it.
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
   window shared by two rooms) is described consistently across them.

**State — which moment do we paint?**
8. **Canonical state.** Rooms change (dark→lit, dry→flooded, before→after a puzzle). Paint the
   FIRST normal-exploration state and state it explicitly; never a post-puzzle state.
9. **Light / time / occupancy.** Honor the light source the prose implies; keep it consistent with
   the game's time-of-day and with neighbors (e.g. stormy night outdoors, dry interiors).

**Composition**
10. **Grounded vantage; don't enumerate every exit.** One plausible camera looking at the room's
    signature feature. Cramming all exits in produces unnatural layouts (the junction-art note).
    Exits are mere THRESHOLDS (plain openings; never depict the room beyond).
11. **Scale cues.** "cramped" / "vast" so the model doesn't render a cathedral for a closet.
12. **Layer discipline.** Scene = literal facts ONLY. Mood/palette/era belong to the Aesthetic
    layer, medium to the Artist layer — don't bake adjectives or style into the Scene.

**Out of scope (don't over-think):** weather/season beyond what the prose states; implied
sound/motion (it's a still).

## Author mode — procedure

1. Resolve `<game>`; require `prompts.json` (run `generate-location-prompts` first if missing). With
   `--only a,b,c`, restrict to that subset; else all rooms.
2. For each room: gather facts + exits + neighbors; live-probe a salient fixture only if factor 1
   needs it; apply the checklist; write the result to `style.json` → `scenes[slug]` (edit the file
   directly — the review server re-reads it; or POST `/api/scene` if the server is running).
3. Keep overrides tight and literal (factor 12). An override may closely resemble the scraped
   scene — that's fine; the point is every room ends up with a *considered, render-ready* Scene.
4. Report a one-line summary per room (and note any room where you live-probed or reconciled an
   exit, so the user can spot-check).

## Review mode — procedure

1. Read `style.json` → `scenes{}` (and fall back to the scraped `scene` for rooms lacking an
   override — flag those as "no override yet").
2. Grade each room against all 12 factors; output per room: the factors it FAILS (with the specific
   evidence — e.g. "factor 5: depicts countryside, but nw → Town Junction") and a one-line fix.
3. Add a **clusters** line for a rule violated across many rooms (a systemic molding gap).
4. Without `--fix`: stop, offer to apply. With `--fix`: apply the fixes to `style.json` and report
   what changed. Never delete a human-tuned override without showing the before→after.

## Notes
- Dev-only data (`style.json`, `prompts.json`) — do NOT bump the app version.
- Don't touch `prompts.json` here (that's phase 1's artifact); mold writes only `style.json` scenes{}.
- Sibling skills: `generate-location-prompts` (facts, phase 1), the render skill (phase 3),
  `build-scenes` (wrapper = facts + mold author in one call), `/art-notes` (reviews rendered
  *images*; mold-review audits the scene *text*). `location-art` still owns audition / promote /
  open-reviewer.
