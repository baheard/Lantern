---
title: Hints Feedback System (👍/👎 per hint)
tags: hints, feedback, github, triage, design, telemetry
created: 2026-06-14
updated: 2026-06-14
aliases: hint-rating, hint-feedback, thumbs-up-down, hint-dashboard
---

# Hints Feedback System

Per-hint 👍/👎 rating, added 2026-06-14. Lets us learn which hints land and which
don't, and surface bad hints as actionable issues. Builds on [[hints-system-design]].

## The pipeline reuses the existing feedback path — deliberately

The app is a static site (no server-side logic), so the browser **cannot** talk to GitHub
directly: a PAT would be a public credential leak, and a token-holding endpoint would violate
the no-server rule. The existing feedback flow already solved this: `feedback.js` does a silent
`no-cors` POST to a **Google Form**, and an external automation turns each form response into a
GitHub issue labelled `feedback`. The `/triage-feedback` command
(`.claude/commands/triage-feedback.md`) then classifies those issues.

Hint ratings ride the **same rails**: `submitHintRating()` in `feedback.js` just calls
`submitFeedback()` with a structured, machine-parseable body. No new infra, no new form, and the
device/console/recent-output context is attached for free (genuinely useful for "this hint is
wrong because the game changed").

## Payload format (the contract triage parses)

The form body begins with a tagged header line:

```
[HINT 👎] game=wishbringer · section=cellar · q=open-safe · hint=2/3 · hintsVersion=1.5.562
"<the exact hint text that was rated>"

Reason: <user text, or (none)>     ← only for 👎
```

`[HINT 👍]` for positives (no Reason line). Keys are `key=value` separated by ` · `. The
identity of a rated hint is **game · section · q · hintIndex** — see id-stability note below.

## Aggregation model: one dashboard issue per GAME (not per hint)

Decided with the user 2026-06-14. Per-(game,hint) issues would sprawl into dozens of
single-vote issues — useless for spotting patterns. Instead, `/triage-feedback` folds all
`[HINT …]` feedback issues into **one `hint-feedback`-labelled issue per game**:

- **Issue body** = a tally table (recomputed each triage run): `section | q | hint | 👍 | 👎 | last reason`.
- **Comments** = the raw append-only stream (each submission, with reason + version + device).
- **Both 👍 and 👎** go into the same table — you want the full picture of what works.
- **Immediately-actionable fast path** — gated on a real comment. A 👎 with **no comment**
  (`Reason: (none)`) is never fast-pathed; it only tallies. A *commented*, specific, credible 👎
  (filler/rule-14 tail, wrong command, factual error, stale combo, spoiler) is fixed on the spot —
  triage verifies it (probe via `tools/play.cjs` for mechanics claims), surfaces it to the user
  with a proposed fix, edits the hints JSON on approval (preserving ids, bumping `meta.appVersion`),
  and comments the resolution on the dashboard. A resolved-by-fix 👎 does **not** count toward
  auto-promote. Vague-or-uncommented 👎 feed the tally. This is why N=4 doesn't gate good fixes.
- **No re-vote spam**: the panel locks a hint's thumbs after one vote (rated → static "Thanks"
  state, no buttons; `resetAll` clears only `revealed`, not `hints_ratings`). So one device = at
  most one submission per hint — there's no uncheck/recheck toggle. Triage still dedups defensively
  on `game·q·hint·rating·reason·device` for the cleared-site-data / multi-device edge case.
- **Auto-promote**: when a single hint crosses N 👎 (currently 4, tune skill-side), triage spins
  it into its own `hint-feedback` + `bug` issue, linked from the dashboard row. The threshold
  lives in the command, so it's cheap to change without touching the app.

**Why this divides cleanly:** the client stays dumb (post one row); ALL intelligence — find-or-
create dashboard, recompute table, append comment, threshold-promote — lives in the command. You
can restructure the issue layout anytime without an app release.

**Idempotency:** triage folds a raw feedback issue in, then deletes it. Deletion *is* the
watermark — once folded, the raw issue is gone, so re-running triage can't double-count.

**Classification:** hint ratings are neither plain bug nor enhancement — the dedicated
`hint-feedback` label keeps them out of the normal triage stream. A 👎 whose reason says the hint
is *wrong/broken* (factual error, stale combo) earns a secondary `bug`; a 👎 that's just
"unhelpful/too vague" stays pure `hint-feedback`. Don't fold all 👎 into `bug` — the
unhelpful-vs-incorrect distinction is the whole point of learning.

## Hint id stability (the gotcha)

Per-hint aggregation is only as good as the hint key. A hint is identified by
`game · section · question.id · hintIndex`. Question/section `id`s are already stable across
regenerations (see [[hints-system-design]] "Question `id` stability").

**Reset-on-rewrite is authoritative via text comparison, NOT the version stamp.** The payload
quotes the exact hint text that was rated, and `/triage-feedback` runs in the repo — so it reads
the current hints JSON and, per row, compares the quoted text against the live hint at that
`q.id`+index. Differs → rewritten; missing → deleted; either way triage **archives the old
counts and starts fresh** rather than carrying them forward. This is precise (only the changed
hint resets; siblings keep their counts). The `hintsVersion` stamp (`meta.appVersion` →
`meta.generatedAt`) is kept only as an audit breadcrumb in comments — it's whole-file, so too
coarse to use as the reset key (any regen would nuke everything; a hand-edit bumps nothing).

## Local rating state

`getHintRating`/`setHintRating` in `hints-state.js` persist the user's own vote under game key
`hints_ratings` → `{ "<questionId>:<hintIndex>": "up"|"down" }`. Purpose: show the vote as
"registered" (highlight the chosen thumb, disable re-voting) and prevent duplicate submissions.
Local-only, like reveal state — **not** in the Drive sync whitelist (ephemeral, not save data).

## UX

Each *revealed* hint line grows a small thumb row. 👍 submits immediately. 👎 opens an inline
optional reason box (`Send` / `Cancel`); the vote is recorded only on `Send` (reason optional).
Reason-box open state is transient module state (`_openReasonKey`), never persisted, so a
re-render reads the textarea value before rebuilding.
</content>
</invoke>
