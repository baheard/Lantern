---
title: Room-facts fixture sweep — empirical detection, room-scoped storage, glossary collision fix (DESIGN)
tags: [room-facts, gen-room-facts, mold, fixtures, probe, design, art-pipeline]
created: 2026-06-26
updated: 2026-06-26
aliases: [fixture-lexicon-replacement, unprobed-rework, landmarks-collision, fixture-sweep]
---

# Room-facts fixture sweep (DESIGN — not built yet)

Goal: move the mechanical work of capturing fixture **appearance** down into `gen-room-facts.cjs`
so `mold` reads pre-probed text instead of live-probing via `play.cjs`. Mold keeps the *judgment*
(salience, phrasing, cross-room reconciliation); facts gather the *data*. Litmus (from
`location-framing.md`): a derivable fact belongs in the dossier (room-facts.json), a non-derivable
judgment belongs in framing. Fixture appearance is derivable → dossier. See
[[room-facts-pristine-examines]] and [[gen-room-facts-exploration-cost]].

## Three problems with the current state

1. **Fixtures are a hand-authored static lexicon.** `FIXTURE_LEXICON` (~38 nouns: painting,
   portrait, mural, statue, window, fireplace, chandelier, …) is a precision-over-recall constant
   carried in the tool (single git touch, a rename commit). It is NOT corpus-derived and is
   inherently incomplete — every game has bespoke fixtures it misses (Dreamhold: orrery, harp,
   copper sail, worktable, apparatus). Maintaining a global noun list across all games does not
   scale.

2. **`mold` does the fixture probing live.** Today `unprobed` (lexicon nouns named in prose but
   never `examine`d) is just a TODO list; mold shells out to
   `play.cjs --snapshot-at "## [<slug>]" --cmds "examine <fixture>"` to fill it. Works, but it's
   non-deterministic shelling inside a judgment skill.

3. **The `landmarks` glossary is keyed by NOUN ONLY → collision.** `landmarks[e.obj]` first-wins,
   so two different clocks in two rooms collapse to one entry; the second inherits the first's
   appearance. Latent today (glossary is sparse — only walkthrough-examined fixtures); becomes
   routine the moment we sweep every fixture.

## The design

### A. Detect fixtures empirically — parser as oracle, not a lexicon
For each room, from its **pristine first-entry snapshot** (the ones `exitProbe` already builds):
1. **Extract candidate nouns from the room's OWN description prose** (the game already named what's
   in the room). Over-extract (article/adjective-preceded noun-ish tokens) — precision not required.
2. **`examine` each candidate.** The parser self-filters: unknown word → "you can't see any such
   thing" (drop); real → appearance text (keep).
3. **Classify fixture vs prop via `take <noun>`:** take fails ("fixed in place"/"hardly portable")
   → fixture (keep); take succeeds → takeable, excluded by the persistence rule (drop, leave to
   room text). Takeables are already tracked via `takenHeads`.
The static lexicon shrinks from "the definition of a fixture" to at most a tiny noun-extraction
fallback/hint.

### B. Store room-SCOPED, not noun-deduped
Attach fixture appearance to the OWNING ROOM (e.g. a `fixtureFacts: [{ref, examine}]` array, same
shape as `exitFacts`), probed from that room's own snapshot. Room A's clock and Room B's clock are
stored separately → no collision. Identical objects just read alike (correct). Room-local probing
also self-handles visibility: `examine <fixture>` in a room that lacks it returns "you can see
little from here" (cf. the dome's `examine doorway`) → naturally no false detail.

### C. Glossary = cross-room SHARED landmarks only; fix the key
Keep the global `landmarks` glossary ONLY for one physical object visible from multiple rooms (a
chandelier seen from balcony AND floor below). Fix the collision: key by noun + owning-room, or
only promote to the glossary when a fixture is referenced cross-room. Per-room fixtures never go
through the glossary, so the "two clocks" case can't collide.

### C2. Reconcile shared-vs-distinct AFTER room-scoped probing (the "same clock from two rooms" case)
Room-scoped probing alone cannot tell whether two rooms' "clock" is ONE shared object or TWO
instances — it just stores each room's text. So add a reconciliation pass over any noun appearing
in >1 room:
- **Identical examine text in both rooms** → same physical object (one Z-machine object, multi-room
  scope) → SHARED landmark: one glossary entry tagged with every room that sees it.
- **Different text** → distinct fixtures → keep room-scoped (the two-clocks case).
- **One room real detail, other deflects** ("you can see little from here", cf. dome `examine
  doorway`) → deflecting room references but doesn't own it → pair to the owner (classic
  seen-from-afar → glossary).

Text-match is a HEURISTIC: two genuinely-identical clocks merge (low harm, they look alike); one
clock described differently from two vantages could split. **Ground-truth alternative:** hook
`play.cjs` to report the resolved Z-machine OBJECT ID for the examined noun → same id across rooms =
same object, different id = different objects, no heuristic. More work (parser hook) but exact.
Rule: room-scoped capture is the default; cross-room sameness decided by response-match (pragmatic)
or resolved-object-id (ideal); only genuine shared objects promote to the glossary.

### D. Discipline: glossary/fixtureFacts only — NEVER auto-fold into `scene`
Do NOT append fixture examines to the scene prose (that recreates the bloat/pollution that
[[room-facts-pristine-examines]] removed). Scene stays lean; mold curates fixture detail in from
the per-room facts by salience.

## Cost
- Generation: reuses existing per-room first-entry snapshots + the batched `--probe-exits` process;
  adds `examine`/`take` probes per candidate noun per room. Room-scoped (NOT deduped) so more probes
  than a naive global dedup — bounded by Σ(candidate nouns per room), still modest.
- room-facts.json: grows by per-room fixture facts (a sentence or two each). Scene unchanged.
- mold: reads a bit more JSON but does ZERO live probes → faster + fully deterministic. Net win.
- Real cost = over-probing fixtures mold later deems non-salient; cheap + degrades gracefully (app
  renders un-foregrounded fixtures indistinct).

## Build order (focused pass, separable)
1. Glossary key fix (C) — independent latent-bug fix, smallest.
2. Empirical fixture detection (A) replacing lexicon-driven `unprobed`.
3. Room-scoped `fixtureFacts` capture in `exitProbe` (B) + glossary-only discipline (D).
4. Cross-room reconciliation (C2): response-match first; resolved-object-id hook in `play.cjs`
   later if the heuristic proves lossy.
5. Update `mold` skill: read `fixtureFacts`/glossary instead of live-probing.
