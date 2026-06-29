# Mold split into /frame + /scene; facing engine; compass→vantage lint

## What changed (2026-06-29)
The single 346-line `mold` skill (phase 2 of the location-art pipeline) was split into two focused
skills, and the facts engine + skill rules were hardened to close the "vague placement" bug.

- **`/frame`** (phase 2a) — facts → `location-framing.md` (JUDGMENT: vantage, occlusion, exits, state,
  shared-volume geometry). Owns the **12-factor checklist** (single source of truth).
- **`/scene`** (phase 2b) — `location-framing.md` → `style.json` scenes (PROSE: REDACT+RE-ANCHOR,
  compass→frame emit, the lint, layer discipline). Re-run often; deliberately low-judgment.
- **`mold`** → deprecation stub (dir kept for the user to delete).
- **`studio`** rewired: step 4 is "frame → scene"; menu / pipeline-order / next-action lines updated.

## The non-obvious decisions

**Why split.** Not tidiness — **cadence mismatch.** Framing is expensive, heavily-reviewed judgment
that stays stable once right; distillation is mechanical-ish and re-runs on every facts regen / note.
One skill forced reloading all the judgment context just to re-emit prose. Two skills let you
re-distil cheaply and review each layer independently. (User confirmed: "two dedicated, focused skills
will be more effective than one two-part skill that is long.")

**The shared-checklist trap, and the fix.** The 12-factor checklist must NOT fork into two drifting
copies. It lives in ONE place — `/frame` owns it (the factors ARE framing decisions) — and `/scene`
references only the ~3 it enforces at emit time (10b translate, 12 layers, the lint).

**Pipeline step stays named `mold`.** `stamp-pipeline.cjs` STEPS and `studio`'s staleness/dependency
logic key on `mold`. Rather than rewire them, the terminal artifact (`/scene`) stamps `mold` on
completion; `/frame` stamps nothing. So "mold" now means "phase-2 framing+scene complete."

## The bug this closes — compass-BAN passed, compass→vantage TRANSLATION skipped
A scene like curtained-room read "...a door in one wall; openings lead out on two others." Zero compass
words (passes factor 10b's letter) but **vague placement** — it never said left/right/ahead/behind. Root
cause: the framing never pinned a **camera facing**, so there was nothing to translate against, and an
early mold pass just hedged. 18/96 Dreamhold scenes had this.

Two-layer fix:
1. **Engine (`gen-room-facts.cjs`):** new inbound-facing pass emits per-room **`defaultFacing`** (the
   compass dir the player travels to ENTER the room, from the inbound edge) + **`enteredBy`** (all
   inbound `dir ← Room`). 74/96 rooms get a facing. This HANDS the mold the facing instead of making it
   re-derive by hand — removing the friction that caused the skip. (Sub-states entered via sit/"inside"
   get no facing — they face the signature, like the seated chair.)
2. **`/frame` rule:** pinning the facing (10a) is MANDATORY — "a multi-exit room with no pinned facing
   is a factor-10a FAIL." 10b is now a *decision* (state the facing→frame map: facing east ⇒ N=left,
   S=right, W=behind) made in framing.
3. **`/scene` lint:** before saving, scan for (a) compass words (hard fail) and (b) vague-placement
   hedges ("in one wall / on one side / leads off / somewhere…"). A hedge is OK ONLY when the framing
   consciously SCREENS that exit (10d, e.g. a curving corridor). Else place it or kick back to `/frame`.

**Acceptable-hedge boundary:** "on one side" on exterior promontories/shadow-paths and "leads off /
somewhere" for screened exits are fine — they're conscious 10d screening, not unplaced features. After
fixing the 4 genuine defects (crowded-study, sitting-room, dim-shed, sitting-room-on-the-settee),
Dreamhold went 18→10 hedges, all 10 in the acceptable category; 0 compass leaks.

See [[mold-redact-dont-rewrite]], [[shot-type-establishing-vs-first-person]],
[[room-facts-look-factor-scene-extras]].
