---
title: walkthrough-anchor-map
tags: [walkthrough, hints, trace, tooling, validator, probing]
created: 2026-06-14
updated: 2026-06-14
aliases: [slug anchors, cmds-notes mapping, _check_walkthrough_map]
---

# Walkthrough cmds ↔ notes anchor mapping (slug standard)

**Problem it solves.** A game's three walkthrough artifacts —
`docs/games/walkthroughs/<game>.{txt,cmds.txt,notes.md}` — are the feedstock for `generate-hints`.
The hint author constantly needs to jump from "this puzzle in the notes" to "the VM state right
before it" to branch-probe a mechanic. That jump uses `tools/play.cjs --snapshot-at "## [slug]"`.
For it to work, the cmds file and the notes file must agree on **where each puzzle is**, and that
agreement must not silently drift.

**The contract (stable slug anchor).**
- `cmds.txt`: each probe-worthy puzzle starts with a marker line `## [slug] Human label`. The
  `slug` is lowercase-kebab, unique in the file, and sits **immediately after `##`** in brackets.
- `notes.md`: the matching puzzle heading carries the **same `[slug]`** as its first token
  (`## [slug] …` or `### [slug] …`).
- The slug — not the free-text label — is the canonical link. Rename a label freely; the slug
  binds. Because the slug is bracketed, `--snapshot-at "## [slug]"` is prefix-safe (the closing `]`
  means `[safe]` never matches `[safe-combo]`).
- Cross-cutting notes sections that map to **no single command span** (the required
  `⚠ RANDOMIZED BETWEEN PLAYS` section, reader-gate overviews, a crosscutting gotcha like
  Anchorhead's lantern-in-pocket, score-ceiling notes) carry **no slug** and are ignored by the
  validator — reference the relevant puzzle slugs inline (`see [d3-mirror]`).

**Why slug-first, not "first bracket anywhere."** The validator only treats a `[slug]` as an
anchor when it's the first token after the `#`s. That's deliberate: a meta heading that *mentions*
a slug in prose — `## Lantern divergence (affects [d3-church], [d3-valve])` — must NOT be mistaken
for that section's own anchor (it caused a spurious duplicate-slug error before the rule was
tightened).

**Validator.** `node tools/_check_walkthrough_map.cjs <game> [--strict]`:
- E1 duplicate slug; E2 cmds slug with no notes heading (probe dead-ends); E3 notes slug with no
  cmds marker (note points at non-existent commands) → exit 1.
- W1 unmarked command span > 30 lines (incl. the **leading** span before the first marker — the
  "back-half-only marking" failure); W2 no markers at all → exit 0 unless `--strict`.
- W1 is a judgment call: one coherent long puzzle (Anchorhead's bum-dialogue chain, the church
  descent) is fine; a buried sub-puzzle you'd want to probe separately is not.

**Reference examples.** `anchorhead.{cmds,notes}` is the canonical clean 1:1 (29 slugs, validates
green). `wishbringer` was retrofitted but its **pre-pelican front half is still unmarked** (W1
leading-span warning) — only the post-pelican endgame carries anchors.

**History.** The mapping originally used free-text `## label (notes: "section")` pointers
(Wishbringer's first form), which couple by eyeball and drift silently. Replaced 2026-06-14 with
slug anchors + the validator; both skills (`trace-walkthrough` Step 3/5, `generate-hints`
Step 3/3.5) updated to specify it. See also [[headless-replay-harness]] (the `--snapshot-at`
mechanism) and [[hints-system-design]].
