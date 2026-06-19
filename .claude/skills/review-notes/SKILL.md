---
name: review-notes
description: Survey ALL games' UNRESOLVED content notes — your saved artview notes PLUS player art feedback PLUS player hint feedback — and work through them one by one. Self-contained: pulls fresh feedback from GitHub itself (no separate triage run needed), then surveys the local notes files. Triggered when the user says "/review-notes", "review notes", "review my notes", "what feedback came in", or "work through the notes".
---

# review-notes skill

The **local working surface** for content feedback — where you survey everything outstanding and
fix it. Companion to `/triage-feedback` (the app-wide inbox processor). Where triage *processes
what just came in*, review-notes *surveys everything still unresolved*, across all games, from
three sources at once:

1. Your own **artview notes** — `docs/games/images/_review-notes.json` (entries you typed in the reviewer).
2. **Player art feedback** — `[ART]` issues, folded into that same file (tagged `[player]`).
3. **Player hint feedback** — `[HINT]` issues, folded into `docs/games/hints/_review-notes.json`.

Read `.tome/hints-feedback-system.md` (the feedback system + the shared consolidate-then-close
procedure) and `.tome/art-direction-model.md` (which layer owns an art note — App ▸ Artist ▸
Aesthetic ▸ Scene) before judging anything. Also relevant: `.tome/location-art-system.md`.

## Step 0 — Pull fresh feedback (self-contained)

Invoke **`/triage-feedback --consolidate`** first. That runs the shared consolidate-then-close
procedure: one `gh issue list` (~1–3s), folds any new `[ART]`/`[HINT]` issues into the two notes
files, and closes them. This is why review-notes stands alone — you don't have to run a full
triage first. (Idempotent via close-as-watermark; just don't run a full `/triage-feedback` at the
exact same time.)

## Step 1 — Collect the unresolved set (all games, both files)

Read both `_review-notes.json` files. An entry is **unresolved** when its value is a plain string,
or `status` is missing/`"open"`. Skip `status:"resolved"` and `status:"wontfix"`. Note each
entry's `source` (`"player"` = came from feedback; absent = your own artview note) and, for art,
its `hash`.

Report the count up front, e.g. "6 unresolved: 4 art (2 player) across 2 games, 2 hint (player)."

## Step 2 — Resolve each note to its situation

**Art notes** — keys are `game:<g>:<slug>[:<file>]`:

| Key shape | About | Image lives |
|---|---|---|
| `game:<g>:<slug>` | location-level | committed `docs/games/images/<g>/<slug>.png`, else newest `_review/<slug>-*.png` |
| `game:<g>:<slug>:<file>` | a specific render | `<g>/<file>` or `<g>/_review/<file>` |
| `game:<g>:<slug>:aud:<file>` | an audition piece | `<g>/_audition/<file>` |

Pull all three context sources (the note can be about any): **the image** (Read the PNG), **the
composed prompt** (sidecar `.txt`), and **the canon** (`prompts.json` → room `description`, plus
the walkthrough for spatial/quantity/object claims). Verify spatial/quantity claims against canon —
don't eyeball the picture (location-art SKILL.md step 5).

**Staleness check (player art notes with a `hash`):** hash the *current* committed image and
compare to the note's `hash`. If they differ, the picture was regenerated since the player
commented — flag the note **`[stale — picture changed since this feedback]`** and weigh it
accordingly (often already addressed; confirm before acting).

**Hint notes** — keys are `game:<g>:<section>:<q>:<hintIndex>`. The entry quotes the `hintText`
the player saw. Read the live hint at that `q.id`+index in `docs/games/hints/<g>.json`; if the live
text differs (rewritten) or the q/index is gone (deleted), the note is stale — note it, don't act
blindly. Judge content fixes through the `generate-hints` philosophy (it's the rule-keeper).

## Step 3 — Analyze each note (the deliverable, analysis-first)

One tight entry per unresolved note:

- **Note** — game · room-or-hint (· file if specific), the note text, and `[player]`/stale flags.
- **What I checked** — image / prompt / canon (art), or live hint vs quoted (hints).
- **Diagnosis** — what's really wrong and *where the failure is*: rendered image, composed prompt
  (missing/wrong Scene fact), Aesthetic, Artist signature, the hint text itself, or "fine — note
  is a marginal nitpick / already fixed (stale)."
- **Owning layer / target** — for art: App / Artist / Aesthetic / Scene / none (won't-fix), per
  location-art SKILL.md and the tome's marginal-framing caution (a recurring complaint across ≥3
  rooms points one layer UP; a marginal nitpick on a good render is usually won't-fix). For hints:
  the specific hint edit.
- **Recommended action** — concrete, one line.

After the entries, a **clusters** line: any complaint recurring across rooms (candidate for an
Aesthetic/Artist-level fix rather than N Scene fixes).

### Proactive canon-coverage scan (art, no human note required)

For each committed render (or any note's room), diff the base room `description` against the
composed Scene in the sidecar `.txt`. Flag concrete nouns present in canon but absent from the
Scene, applying the KEEP/DROP axis (location-art SKILL.md step 6: **persistence at the
establishing view, not puzzle-salience** — KEEP firmly-attached fixtures, DROP removables/transient/
chrome; mechanical test = `take <noun>` in the harness). Report these as their own findings
("coverage gap, no note filed").

## Step 4 — Stop. Offer the handoff.

Analysis changes nothing — no layer edits, no regeneration, nothing resolved. End with a short
offer: "Want me to apply any of these? Art → I'll draft before→after diffs via location-art;
hints → edit the hints JSON via generate-hints. I'll flag each acted-on note resolved." Applying
is gated on explicit approval.

## Step 5 — When a note IS acted on, mark it resolved

Resolution is coupled to **action**, never to merely looking. The moment a fix is applied, flag
that note in the appropriate `_review-notes.json`:

```json
{ "note": "<original text, unchanged>", "status": "resolved",
  "appliedTo": "scene|aesthetic|artist|app|hint", "resolved": "<YYYY-MM-DD>",
  "source": "player|<omit for own notes>" }
```

- `appliedTo` = the layer/target changed (matches the diagnosis).
- Consciously NOT acting → `"status": "wontfix"` (no `appliedTo` needed) — e.g. a marginal framing
  nitpick on an already-good render, or a stale note already addressed.
- **Never delete** a note (per the user's standing rule); the user re-opens by editing text or
  unchecking the reviewer's Resolved box. One resolved-flag per note acted on — don't batch-resolve
  untouched notes.
- This is the convention `tools/review-server.cjs` (`setNoteStatus`) and the `location-art` skill
  use; the reviewer UI greys flagged notes and shows the Resolved chip.

> This skill supersedes `art-notes` (which covered only art notes, not feedback). Same analysis-first
> character, widened to all three sources.
