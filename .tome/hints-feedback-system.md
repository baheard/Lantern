---
title: Feedback System (hints + art + general) — text-only model
tags: hints, art, feedback, github, triage, review-notes, design
created: 2026-06-14
updated: 2026-06-19
aliases: hint-feedback, art-feedback, feedback-pipeline, leave-feedback, review-notes, consolidate
---

# Feedback System

How player feedback gets from a button tap to a fix. Covers three feedback families
(general, hints, art), the two operations that process them, and the shared
consolidate-then-close procedure both operations use. Supersedes the old per-hint
👍/👎 rating model (removed v1.5.618 — see "What changed" below).

## The rails (unchanged): browser → Google Form → GitHub issue

The app is a static site (no server-side logic), so the browser **cannot** talk to GitHub
directly (a PAT would be a public credential leak). `feedback.js` does a silent `no-cors` POST
to a **Google Form**; an external automation files each response as a `feedback`-labelled GitHub
issue on `baheard/Lantern`. Every feedback family rides these same rails — no new infra per
family. The device/console/recent-output context rides along for free.

Three submit functions in `feedback.js`, all calling `submitFeedback()` with a structured body:

- **General** — `submitFeedback(text, game)`. No header; freeform.
- **Hint** — `submitHintFeedback({...})` → `[HINT]` header. Text-only, **no rating**, unlocked
  (a player can comment on the same hint as many times as they like).
- **Art** — `submitArtFeedback({...})` → `[ART]` header. Carries the exact image filename **and a
  content hash** (`hashImage()` = SHA-256 of the displayed bytes, first 12 hex) so a note can be
  flagged stale if the committed picture was regenerated since.

### Payload formats (the contract the skills parse)

```
[HINT] game=<g> · section=<s> · q=<q> · hint=<n>/<total> · hintsVersion=<v>
"<the exact hint text being commented on>"

Comment: <player text>
```

```
[ART] game=<g> · location=<loc> · image=<file> · hash=<short> · appVersion=<v>

Comment: <player text>
```

Keys are `key=value` separated by ` · `. Identity: a hint is `game · section · q · hintIndex`
(see id-stability below); an image is `game · location · file` keyed exactly, with `hash` as the
staleness check.

## UX

Both surfaces use **one shared modal** (`feedback-modal.js` / `#feedbackModalOverlay`). It takes
an optional `{subject, placeholder, onSubmit}` — `onSubmit` swaps in the structured hint/art
payload; omitted → the default general-feedback POST. The modal is its own element, so it isn't
disturbed by the art lightbox's hover-close.

- **Hints**: each *revealed* hint line grows a single `chat_bubble_outline` "Leave feedback"
  bubble (`renderFeedbackBtn` in `hints-panel.js`). No lock, re-openable.
- **Art**: the shared art lightbox (`art-overlay.js`, `#nodeArtOverlay`) has a bubble pinned to
  the picture's top-right corner. It hashes the displayed image on submit. Game = current game;
  location/file come from the `meta` passed to `openArtOverlay(src, caption, meta)`.

## The two operations

| Operation | Scope | Touches GitHub? | What it does |
|---|---|---|---|
| **`/triage-feedback`** | app-wide inbox | yes (heavy) | drains ALL raw `feedback` issues |
| **`/review-notes`** | all games, content notes | yes (one list call) | survey + work through unresolved notes |

They are complementary: **triage processes what just came in**; **review-notes surveys everything
still unresolved**. Both pull `[ART]`/`[HINT]` issues and run the same consolidate-then-close
procedure (below) — safe to run either, just not simultaneously.

### `/triage-feedback` — the full inbox processor

For each open `feedback` issue:
- **garbage** (test/empty) → delete
- **bug / enhancement** → label it **and remove the `feedback` label** ← *the inbox-hygiene fix*
- **`[HINT]` / `[ART]`** → run the consolidate-then-close procedure
- keeps its **on-the-spot fast-path fixes** for clearly-actionable items
- **`--consolidate`** mode → run ONLY the `[ART]`/`[HINT]` consolidate-then-close step (skip
  general classification, fixes, groom). This is the inner step `/review-notes` invokes.
- **`--groom`** mode → also close the `on-hold` / `wont-fix` backlog.

**The inbox-hygiene fix (the whole reason old issues stopped re-surfacing):** `feedback` means
"not yet triaged." The moment an issue is classified, the `feedback` label is **removed** (or, for
hint/art, the issue is **closed**). Triage therefore only ever sees genuinely-new raw feedback —
classified-but-unfixed bugs no longer reappear every run. Backlog grooming (`on-hold`/`wont-fix` →
close) is a separate, deliberate `--groom` pass, not part of every run.

### `/review-notes` — the local working surface

Replaces the old `art-notes` skill, widened to art **and** hints. Steps:
1. Invoke `/triage-feedback --consolidate` (one `gh issue list`, ~1–3s) to pull any new
   `[ART]`/`[HINT]` feedback into the notes files and close those issues.
2. Survey **all unresolved** items across all games from the two local notes files:
   - **Art** → `docs/games/images/_review-notes.json` — surfaced into artview by location, with a
     `[stale — picture changed]` flag when the note's `hash` ≠ the current committed image's hash.
   - **Hints** → `docs/games/hints/_review-notes.json` — listed in the conversation; fix one by
     one in the hints JSON (route content fixes through `generate-hints` philosophy).
3. You fix them; it marks resolved / grooms.

## The shared consolidate-then-close procedure (single source of truth)

Both operations use this; it lives here so it can't drift. Given an open `[ART]`/`[HINT]` issue:

1. **Parse** the header into the identity keys + the `Comment:` text.
2. **Write into the notes file** (these files ARE the system of record — they're committed to git):
   - **Art** → `docs/games/images/_review-notes.json`, key `game:<g>:<slug>:<file>` (file-specific,
     so a later regen doesn't blur which picture the note was about). Resolve `<slug>` from the
     game's manifest/`prompts.json` by `location`/`file`. Tag the note text `[player]` so authored
     direction and incoming feedback stay distinguishable. Store the `hash` on the entry for the
     staleness check.
   - **Hint** → `docs/games/hints/_review-notes.json`, key `game:<g>:<section>:<q>:<hintIndex>`,
     with the quoted hint text + the `[player]` comment.
   - Entry shape mirrors the existing art convention:
     `{ note, status:"open", source:"player", hash?, hintText? }`.
   - **Key collision (art):** an image often already has an *authored* note (you typed it in
     artview), possibly `resolved`. Do NOT clobber it. Append the player comment to a
     `playerFeedback: [ { comment, hash, status:"open", submitted, issue } ]` array on the existing
     entry — the authored `note`/`status` stay untouched. `/review-notes` treats an entry as
     UNRESOLVED if its own `status` is open **OR** it has any `playerFeedback` item with
     `status:"open"` (so new player feedback resurfaces an already-resolved render). Validated by
     the v1.5.618 pipeline test (junk `[ART]` #159 → appended to the resolved `alley` note).
3. **Close the GitHub issue** (`gh issue close <n>`). **Closing IS the watermark** — `--state open`
   never returns it again, so re-runs can't double-process, and the two operations can't race
   (whichever runs first closes it; the other never sees it). If the notes file is ever lost, that
   feedback is gone — accepted tradeoff; someone re-files it.

**Idempotency = closing.** (The old model deleted the raw issue; we close instead, so history
survives and a re-report can reopen.)

## Hint id stability (the gotcha — unchanged)

A hint is identified by `game · section · q.id · hintIndex`. Question/section ids are stable
across regenerations (see [[hints-system-design]]). The `[HINT]` payload quotes the **exact hint
text** commented on, so when a note is processed the skill can compare the quoted text against the
live hint at that `q.id`+index: differs → rewritten, missing → deleted; either way the note is
stale (note it, don't act blindly). Same principle the art `hash` provides for images.

## What changed (v1.5.618) — removed the 👍/👎 rating model

Dropping ratings collapsed a lot. **Removed:** `submitHintRating`, the `hints_ratings` localStorage
store + `getHintRating`/`setHintRating`/`hintFingerprint` (hints-state.js), the per-hint vote lock,
the per-game `hint-feedback` GitHub *dashboard* issue with its tally table, the N-👎 auto-promote
threshold, and vote-dedup. **Why:** the user wanted a single neutral "Leave feedback" channel, not
a verdict; text feedback is richer and the dashboards/tallies only existed to aggregate votes.
The `[HINT]`/`[ART]` headers are still structured identically, so a future GitHub rollup or hints
UI is trivial to add — but none exists now; feedback flows issue → notes file → fix.
