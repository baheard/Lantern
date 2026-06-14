---
name: trace-walkthrough
description: Find authoritative walkthrough(s) for an IFTalk game and produce a --strict-clean, replayable command list verified against our EXACT build. Triggered when the user says "trace walkthrough for <game>", "trace <game>", "build/verify a walkthrough for <game>" — and invoked by other skills (e.g. generate-hints) when they need a verified command list that doesn't exist yet.
---

# trace-walkthrough skill

Turns "I want to drive `<game>` reliably" into up to three repo-persistent artifacts:

- `docs/games/walkthroughs/<game>.txt` — the raw authoritative walkthrough(s), with a header block (source URLs, author, the build it targets, retrieval date). Never served to the browser. **Keep more than one source if they disagree** — cross-referencing them is how you catch a bad command (e.g. Wishbringer's Misty Island exit: one source's `e, blow whistle` strands you; another's `wait, blow whistle` works).
- `docs/games/walkthroughs/<game>.cmds.txt` — a **verified** command list (one command per line; `#` comments allowed) that replays cleanly against our exact interpreter via `tools/play.cjs --strict`.
- `docs/games/walkthroughs/<game>.notes.md` *(required for any non-trivial game — see Step 5)* — **your** puzzle-logic analysis: the *why* behind non-obvious command orderings, timing/patrol mechanics, build-specific divergences from the published walkthrough, per-run-random gates, and the game's core mechanics. This is what survives when the raw walkthrough is wrong or terse, and it's the **primary feedstock** for `generate-hints` (which teaches method, not commands). **Write it whenever the *game* is non-obvious — not only when *deriving the commands* was hard.** A clean first-try `--strict` replay says the command list is right; it says nothing about whether the puzzles are simple. (Bronze replayed clean yet needed full notes.)

`<game>` is the game filename minus extension, lowercased (matches `game-loader.js` normalisation).

These artifacts are reusable well beyond hints: harness/regression testing, "does X work in our build?", auto-mapper validation. The `generate-hints` skill calls this skill in its Step 1 and then *consumes* `<game>.cmds.txt`; it does **not** re-derive the command list.

**Scope boundary:** this skill produces a verified *linear* command list + a report. It does **not** segment by act/section or harvest per-section locations — that's hint-specific and belongs to the caller (generate-hints Step 3).

The harness is a self-contained Node CLI — **no server, no browser** (it reads `docs/lib/*.js` + the game file from disk and evals them in a `vm` context). Full design/gotchas: `.tome/headless-replay-harness.md`.

---

## Step 0 — Idempotency check (confirm before doing anything to an existing file)

First look for `docs/games/walkthroughs/<game>.cmds.txt`.

**If it already exists, confirm with the user before touching it** — it may be hand-edited or carry deliberate residual-gate trimming, so never silently reuse *or* regenerate it. Ask which they want:
- **Test the existing list** — re-run `--strict` and report (default if they just want a quick check):
  ```bash
  node tools/play.cjs <game> --strict --file docs/games/walkthroughs/<game>.cmds.txt; echo "exit=$?"
  ```
  `exit=0` → artifacts are present and valid; report and stop. A failure → show it to the user and ask whether to fix in place or regenerate (don't assume).
- **Regenerate from scratch** — proceed through Steps 1–5, overwriting.

Only skip this confirmation when another skill invoked `trace-walkthrough` *because the file was already missing* (nothing to confirm) — then go straight to Step 1.

---

## Step 1 — Identify our build (so the walkthrough version matches)

Different releases of the same game diverge (the classic trap: original *Anchorhead* 1998 vs the 2018 Illustrated edition). Read the Z-machine header so you can match a walkthrough to **our** file:

```bash
node -e 'const f=require("fs").readdirSync("docs/games").find(n=>n.toLowerCase().startsWith("<game>")); const b=require("fs").readFileSync("docs/games/"+f); console.log(f,"| z-version",b[0],"| release",b.readUInt16BE(2),"| serial",b.slice(0x12,0x18).toString("ascii"))'
```

(`.zblorb`/`.blorb` files wrap the z-code; the header offsets differ — if the read looks wrong, note it and rely on the in-game banner instead: the first `--status` replay prints the game's own "Release N / Serial number …" line.) Record release + serial; you'll match the walkthrough to it and cite it in the saved file's header.

---

## Step 2 — Research & save the raw walkthrough

Find an authoritative walkthrough, preferring sources that state the version:

1. **CASA** (solutionarchive.com) — primary; note file ID + URL.
2. **IFDB** (ifdb.org) — game page for author/year + linked solutions/maps.
3. **uhs-hints.com** — UHS file if one exists.
4. **ClubFloyd transcripts** (allthingsjacq.com etc.) — real sessions that often print the exact release/serial, great for confirming the build *and* showing room names verbatim.
5. **Author's own site** (e.g. Emily Short's blog; the Inform 7 examples repo for I7 games).

**Match the build.** If a source clearly targets a different release than ours, keep looking or note the risk. Confirm via the release/serial from Step 1 or the in-game banner.

Save the **full raw text** (don't summarise) to `docs/games/walkthroughs/<game>.txt` with a header block: source URL(s) + any CASA file ID, author attribution, the targeted version, and `retrieved <today>`. Keep every source URL — the caller needs them for `meta.sources`.

---

## Step 3 — Translate to a command list

Write `docs/games/walkthroughs/<game>.cmds.txt`: one parser command per line.

- **Expand compressed notation**: `Se.` → `se`; `Push can against wall.` → `push can against wall`; strip annotations like `(2p)` / `... comment`. (`#`-prefixed lines and blanks are ignored by the harness — use them for your own section markers.)
- **Include forced opening answers**: games that open with a prompt need it as the first command — e.g. Bronze's "Have you played interactive fiction before?" → first line `yes`. (Char-mode "press any key" intros are auto-dismissed by the harness; don't add keys for those.)
- **Meta-commands are fine**: many games support `GO TO <place>` navigation (Bronze) — keep them.
- **Branching endgames**: pick one **linear trunk** (usually the shortest completion), stop the cmds at or just past the final progress gate, and note the branches in the report. Don't try to encode every branch.
- **Map sections to the notes file with SLUG ANCHORS — cover the WHOLE list, not just the hard parts** *(do this so a "why does this command do X?" question is one grep away, and so any puzzle is one `--snapshot-at "## [slug]"` from a probe point)*: group the list into acts/puzzles with marker lines of the exact form `## [slug] Human label`, **front to back**. The `slug` is lowercase-kebab (`[a-z0-9-]+`), unique in the file, and is placed **immediately after the `##`** in square brackets — it is the **canonical, drift-proof link** to the matching `## [slug]` (or `### [slug]`) heading in `<game>.notes.md`. Because the slug is bracketed, `--snapshot-at "## [slug]"` resolves unambiguously (the closing `]` means one slug is never a prefix of another). Every puzzle/act in the trunk gets a marker — not only the segments where *deriving* the commands was tricky. A partially-marked list (markers only on the back half, as Wishbringer originally shipped) leaves the unmarked span un-grep-able and un-snapshot-addressable for the hint author, which is exactly when probing is most needed. Day/act banner comments (`# ==== DAY 2 ====`) are fine for orientation but are **not** anchors — only `## [slug]` lines are. See `anchorhead.cmds.txt` for the canonical pattern. **Validate the mapping after writing both files** (Step 5):
  ```bash
  node tools/_check_walkthrough_map.cjs <game>      # errors → exit 1; add --strict to fail on warnings too
  ```
  It asserts every cmds `## [slug]` has a matching notes `[slug]` heading and vice-versa (so no probe path dead-ends), flags duplicate slugs, and warns on long unmarked command spans (the "back-half-only" failure). Errors must be fixed; the unmarked-span warnings are a judgment call (a single coherent long puzzle is fine — a buried sub-puzzle that you'd want to probe is not).
- **Seeded randomized values are allowed in the trunk, but flag them in the header**: if a step needs an `@random` value (a power word, safe combo), the harness seeds RNG (`--seed 1`) so the fixed value replays clean — hard-code it, but add a header note that it's a *test-determinism artifact, not a player value*, and point to the notes.md randomization section. Verify the whole list with `--strict --seed 1`.

---

## Step 4 — Verify with `--strict`, iterate

```bash
node tools/play.cjs <game> --strict --file docs/games/walkthroughs/<game>.cmds.txt; echo "exit=$?"
```

`--strict` halts on the first failure: a **parser-level** failure (command didn't parse/apply: "You can't go that way", "can't see any such thing", "not a verb I recognize", …) **or** a `[no line-input prompt]` wedge (the game stopped accepting line commands — see interactive readers below). It prints turn number + command + triggering line. It deliberately does **not** flag game-level "no effect" responses (those are routinely intended flavor — e.g. turning on a deliberately-broken switch). Each hit is a flag to **judge, not auto-fail** — causes:

- **Build drift** — the command genuinely doesn't work on our build. The real signal: fix the command to what *our* game accepts (this is why we verify against our exact file).
- **Walkthrough artifact** — the author left a dead command that fails gracefully then self-corrects (Bronze: `LOOK UP IVORY IN NOTES` fails because the notes aren't in hand yet; the next lines `GO TO THE NOTES` / `GET NOTES` recover). Prune the dead line.
- **Missing prerequisite** — an earlier action was required first (e.g. `examine plans` before `kick south wall`). Insert it.
- **Interactive reader/pager** — a command opens a char-input reader that eats subsequent line commands and never returns to a line prompt (Anchorhead `read clippings`, Theatre `read pages`). Symptom: `[no line-input prompt]` from the *next* command onward. **Drive it with `@char` directives** in the cmds file — `@char <key> [count]` sends raw char input (`return`, `space`, `q`, …):
  ```
  read clippings
  @char return 40   # page the cyclic reader
  @char q           # quit back to the line prompt
  ```
  **Don't just drop the reader** assuming it's lore — it may set game state: Anchorhead's clippings teach the family names the parser later gates `look up X in record` on, so quitting too early (only page 1) breaks later turns. Page far enough to display the content, then quit. (Probe the exit key with `--key q` vs `--key return` on a short prefix run.)

**Randomized puzzles are reproducible via the seed — verify them, don't skip them.** ZVM's RNG falls back to `Math.random`, which the harness seeds deterministically (`--seed`, default 1). So Anchorhead's safe combination is a fixed value per seed (seed 1 → `1-32-59`): read it from the journal in a seeded run, bake `turn the dial to 1/32/59` into the cmds, and it verifies with `--strict --seed 1` forever. Note the seed at the top of the `.cmds.txt`. (Same for flute attunement / mirror measurement.) The one genuine residual gate is anything that needs *char* input the static line-replay can't express — record those in the report. **Never let the seeded value leak into hint content** — a real player's value differs; hints teach the method.

Iterate until `exit=0` (or only documented char-input residual gates remain).

**Probing flags that cut iteration cost (use these while branch-probing a long game):**
- `--summary` — appends one machine-readable line (`[SUMMARY] turns=N location=… status=alive|dead score=S last="…"`) so you can read *where a run ended* without scrolling the transcript. Pipe to `Select-String '\[SUMMARY\]'` (PowerShell) to see just that line.
- `--stop-on-death` — halts the moment the game prints a death/win screen (the "RESTART, RESTORE or QUIT" prompt) and prints `[DEATH] Turn N` to stderr, instead of echoing `[game has ended]` for every remaining command. Pairs with `--strict`.
- **Snapshot the verified prefix once, then probe tails against it** (the real fix for O(n²) probing). Replay the verified prefix to a `--snapshot-out` file, then `--snapshot-in` that file with only the short new tail — no prefix re-replay. The restored run behaves identically to a full replay (`--strict`/`--stop-on-death`/`--summary`/`--status` all apply), validated bit-exact:
  ```bash
  # 1. Snapshot a verified point in ONE pass (no hand-built prefix file) — by section marker,
  #    command substring, or 1-based count:
  node tools/play.cjs <game> --seed 1 --file <game>.cmds.txt --snapshot-at "## [enter-tower]" --snapshot-out snap.json --quiet
  # 2. Probe a new tail cheaply (--cmds avoids PowerShell array/quoting pain):
  node tools/play.cjs <game> --seed 1 --snapshot-in snap.json --status --strict --cmds "new ; tail ; cmds"
  ```
  Re-snapshot with the **same `--seed` and game file** (snapshots are seed-/build-specific). Once a tail verifies, append it to `<game>.cmds.txt` and re-snapshot at a later `## marker`. Write `snap.json` to a temp/throwaway path — don't commit it. Design + validation: `.tome/headless-replay-harness.md`.
- Without snapshots, the harness is **replay-from-start**, so each probe re-runs the whole prefix. Either way, **append each verified segment to `<game>.cmds.txt` as you go** rather than holding a growing command array in your working context.

---

## Step 5 — Write the analysis notes (required for any non-trivial game)

**Trigger on the *game's* complexity, not on how hard the commands were to derive.** Write
`docs/games/walkthroughs/<game>.notes.md` for any game with more than a couple of real puzzles
— *even if the published commands replayed `--strict`-clean on the first try*. A clean replay
proves the command list is correct; it tells you nothing about whether the puzzles are obvious.
The deliverable is a puzzle-logic analysis: the game's **core mechanic(s)**, the *why* behind
non-obvious orderings, timing/patrol mechanics, prerequisites the walkthrough omitted,
build-specific divergences, per-run-random gates, and red herrings. This is the one artifact
that pays off later: it's the **primary feedstock** for `generate-hints` (which teaches *method*
and must never leak commands or random values), and a future trace session shouldn't have to
re-derive what you already learned.

Capturing it cheaply: one `--status` replay pass simultaneously (a) re-verifies `--strict`,
(b) emits the per-turn locations the hint author harvests, and (c) gives you the full transcript
to mine for mechanics. Dump it once (`node tools/play.cjs <game> --status --seed 1 --file
<game>.cmds.txt > /tmp-path`) and read the puzzle beats out of it rather than replaying per
section.

Skip notes **only** for genuinely trivial games (a handful of obvious actions, no real puzzles)
— and even then, still state randomization status (below).

Write it as puzzle-keyed notes, not a transcript. Give each puzzle a heading carrying the **same
`[slug]`** as its `## [slug]` marker in `<game>.cmds.txt` — `## [slug] Label` or `### [slug] Label`
(the slug must be the **first token** after the `#`s; a slug merely *mentioned* in prose inside
another heading is correctly ignored). Cross-cutting sections that don't map to one command span —
the required **⚠ RANDOMIZED BETWEEN PLAYS** section, reader-gate overviews, lantern-style
crosscutting gotchas, score-ceiling notes — carry **no `[slug]`** and are skipped by the validator;
reference the relevant puzzle slugs inline (`see [d3-mirror]`) instead. This keying is what makes
probing during hint generation cheap: from a note section the hint author has the slug, so
`--snapshot-at "## [slug]"` jumps the VM to exactly that puzzle to branch-probe a mechanic — no
grep, no hand-built prefix. **Run `node tools/_check_walkthrough_map.cjs <game>` and fix every
error** — a cmds slug with no note (or a note slug with no commands) breaks that probe path. For the
hint author, bold the *insight* (the hintable nugget) in each section and tag build divergences
(✗ published / ✓ our build). Good entries:
- **"Why this ordering / why not the published one"** — e.g. *Misty Island exit: the King
  transports you only on `blow whistle` from inside the Throne Room; the published `e, blow
  whistle` strands you on the beach. Correct: `…get hat, wait, blow whistle`.*
- **Timing / NPC patrols** — e.g. *Boot Patrol reaches Rotary East ~1 turn after you; do the
  fountain-token + cinema detour while it's still early (~6:40 PM), and a single `wait` at the
  Park before stepping east shifts the cycle so you slip into the theater.*
- **`OPEN PUZZLE` blocks** — for any step you could NOT verify, write a blockquote saying so, so
  `generate-hints` knows not to author a hint for it yet.

**Required: a "⚠ RANDOMIZED BETWEEN PLAYS" section at the top.** List every element that differs
per real play (power words, safe combos, randomized layouts) — what it is, where the game prints
the real value, and an explicit reminder that hints teach the method and never the literal value
(the `--seed`-fixed value in `<game>.cmds.txt` is a test artifact). If nothing is randomized, say
so explicitly — the hint author shouldn't have to infer it from absence. This is the single most
important section for hint safety.

Skip the rest only for genuinely trivial games (no real puzzles) — *not* merely because the
commands replayed clean with no judgement calls (a complex game can replay clean and still need
full notes). But still state randomization status.

These three files together are the `generate-hints` feedstock: the **sourced walkthrough**
(`.txt`, with retrieval URLs + build + corrections), the **verified command list** (`.cmds.txt`,
slug-anchored), and the **mapped analysis** (`.notes.md`). The mapping (shared `[slug]` anchors,
enforced by `tools/_check_walkthrough_map.cjs`) lets a hint author jump from any command to the
reasoning behind it and back, and `--snapshot-at "## [slug]"` straight to the VM state for probing.

## Step 6 — Report

Output to the caller / user:
- Build match: our release/serial vs the walkthrough's targeted version (confident / risk noted).
- `<game>.cmds.txt`: command count, and whether it passes `--strict` clean (or where it stops + why).
- `<game>.notes.md`: written (and what it covers) or skipped-as-trivial.
- Anchor-map lint: `node tools/_check_walkthrough_map.cjs <game>` result (paired count; any warnings).
- Residual unverified gates (randomized puzzles, branch points) the caller must handle.
- All source URLs used (for the caller's `meta.sources`), each with the local `"file"` path.

Optionally also save the full `--status` trace (`node tools/play.cjs <game> --status --file …`) if the caller wants per-turn locations — but generate-hints re-runs that itself during harvesting, so it's not required.
