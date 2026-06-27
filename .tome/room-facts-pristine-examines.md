---
title: Room-facts omits non-pristine examines (post-mutation views)
tags: [room-facts, art-pipeline, gen-room-facts, examines, gotcha]
created: 2026-06-26
updated: 2026-06-26
aliases: [spiralled-cone-bug, post-open-examine, dome-basket]
---

# Room-facts omits non-pristine examines

**Symptom (Dreamhold, 2026-06-26):** every Dark/Lit Dome Center image rendered a
silver spiral/basket sitting on the floor **beside** the metal pyramid. Wrong twice
over: on first entry the pyramid is *closed*, and even opened, the spiralled-cone
basket lives *inside* it — never beside it.

**Root cause:** `gen-room-facts.cjs::mergeExamines` folded **every** examine captured
for a room into the establishing `scene`, regardless of room state when the examine
ran. The walkthrough did `examine pyramid` (closed, fine) → `open pyramid` →
`examine wire` (the basket, now visible inside). That post-`open` `examine wire`
response ("a small construction of silver wire — a spiralled cone, mouth-up. The
basket is empty.") got merged into the first-entry scene → spiral on the floor.

**Fix:** per-location **pristine** tracking. A room starts `pristine: true`; the
first mutating verb issued there latches it `false` (`breaksPristine(verb)` =
not a MOVE and not in `PRISTINE_INERT` — look/examine/search/read/inventory/wait/
meta are inert, everything else open/push/pull/drop/put/take mutates). Each
captured examine is tagged with `pristine` at capture time; `mergeExamines` skips
any `pristine === false`. So the closed-pyramid examine survives, the post-open
basket examine is dropped. Result feeds clean facts to **mold** so it can judge the
true first-entry view.

**Why this layer, not a per-room override:** this is the engine, per the standing
"fix the engine, not individual prompts" rule. Any container-contents-after-open
case across any game is now handled the same way.

**Scope notes / not changed:**
- The exit-probe phase already restores a pristine first-entry snapshot, so it was
  never affected.
- The landmark glossary still iterates all examines (not pristine-filtered) — left
  alone for now; revisit if a post-mutation landmark detail ever leaks.
- State-variant rooms (e.g. "Lit Dome, Center") keep their `stateDelta` narration
  (the relight flare) — that's the legitimate transition, not a misplaced object.

Regenerate after engine changes: `node tools/gen-room-facts.cjs <game>`.
