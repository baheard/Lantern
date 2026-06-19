---
name: art-notes
description: Sweep ALL games' UNRESOLVED location-art review notes and produce a per-note analysis (the situation, the owning layer, a recommended action) — analysis-only, applies nothing. Triggered when the user says "/art-notes", "art notes", "analyze art notes", "review all art notes", or "what's unresolved in the art notes". This is the cross-game, analysis-first companion to the location-art skill's per-game "review art notes for <game>" action.
---

# art-notes skill

A **cross-game, analysis-first sweep** of unresolved location-art review notes. Where the
`location-art` skill's "Review notes" action is per-game and route-and-apply, this skill mirrors
how the reviewer (`artview`) is now a single multi-game nav: it sweeps **every** game's
unresolved notes and, for each, looks at the full situation and writes an **analysis**.

**Applies nothing.** No layer edits, no resolving, no regeneration. The output is a verdict per
note (problem · owning layer · recommended action). Acting on the analysis is a separate,
explicit step — hand off to `location-art` ("apply these" / "review art notes for <game>") which
owns the draft-diff / route / flag-resolved machinery and the layer vocabulary.

The *why* behind layer routing lives in the tome — **read `.tome/art-direction-model.md`** before
judging which layer owns a note (especially the marginal-framing warning and the four-layer model:
App ▸ Artist ▸ Aesthetic ▸ Scene). Also relevant: `.tome/location-art-system.md`.

## Step 1 — Collect the unresolved set (all games)

Read `docs/games/images/_review-notes.json`. Each entry's value is either a plain string
(**open**) or an object `{ note, status, appliedTo?, resolved? }`. A note is **unresolved** when
the value is a string OR `status` is missing/`"open"`. Skip `status: "resolved"` and
`status: "wontfix"`. (Same convention as `noteText`/`noteStatus` in `tools/review-server.cjs`.)

Report the count up front (e.g. "4 unresolved notes across 2 games").

## Step 2 — Resolve each key to its situation

Keys are `game:<game>:<slug>` with an optional file/aud suffix. Parse and gather, per note:

| Key shape | What the note is about | Where the image lives |
|---|---|---|
| `game:<g>:<slug>` | location-level (no specific render) | committed `docs/games/images/<g>/<slug>.png`, else newest `_review/<slug>-*.png` candidate |
| `game:<g>:<slug>:<file>` | a specific review/committed render | `<g>/<file>` or `<g>/_review/<file>` |
| `game:<g>:<slug>:aud:<file>` | an **audition** piece | `<g>/_audition/<file>` |

For each note pull **all three context sources** — the note can be about any of them:
1. **The image** — Read the PNG directly (usually the subject, but not always).
2. **The composed prompt** — the sidecar `.txt` next to the image (`<file>.txt`). This is what was
   actually sent to the generator. *Critiques of the prompt itself land here* — e.g. the
   witchs-lair note ("the canonical text says the statue holds a jewelled dagger — why did the
   skill miss this?") is a **prompt** failure, not an image failure: the Scene text omitted a
   canonical object.
3. **The canon** — the in-game prose: `docs/games/images/<g>/prompts.json` → the room's
   `description` (and, for positioning/quantity claims, the walkthrough
   `docs/games/walkthroughs/<g>.cmds.txt` and adjacent rooms). The game is the source of truth;
   the note is a symptom. **Verify spatial/quantity/object claims against canon — don't eyeball
   the picture** (location-art SKILL.md step 5).

## Step 3 — Analyze each note (the deliverable)

Output one entry per unresolved note. Keep it tight:

- **Note** — game · room (· file if specific), and the note text.
- **What I checked** — image / prompt / canon (whichever the note actually concerns).
- **Diagnosis** — what's really wrong and *where the failure is*: the rendered image, the composed
  prompt (a missing/wrong Scene fact), the Aesthetic, the Artist signature, or "render is fine,
  note is a marginal nitpick."
- **Owning layer** — App / Artist / Aesthetic / Scene / none (won't-fix). Use the routing rules in
  location-art SKILL.md steps 2–3 and the tome's marginal-framing caution: a recurring complaint
  across ≥3 rooms points one layer UP; a marginal framing nitpick on an already-good render is
  usually **won't-fix**, not a global Artist edit.
- **Recommended action** — concrete and one line (e.g. "add `jewelled dagger in the statue's hand`
  to Scene override", "won't-fix — keep render", "Aesthetic: add `evenly lit`").

After the per-note entries, add a **clusters** line: any complaint recurring across multiple rooms
(candidate for an Aesthetic/Artist-level fix rather than N Scene fixes).

### Proactive canon-coverage scan (no human note required)

The sweep doesn't only react to human notes — it also catches **salient canon objects missing from
a render's scene prompt**, the failure that produced the Witch's-Lair jewelled-dagger miss. For each
committed render (or any note's room), diff the **base room description** (`prompts.json` →
`description`) against the **composed Scene** in the sidecar `.txt`. Flag any concrete noun present
in canon but absent from the Scene, applying the KEEP/DROP axis from `location-art` SKILL.md
"Craft / edit a scene" step 6: **persistence at the establishing view, not puzzle-salience** —
KEEP fixtures (firmly-attached / not-takeable things: the statue and its attached dagger); DROP
removables even if puzzle-critical (a loose page, a gettable gem → vanish when `GET`-ed, leaving
the static art incongruent), plus transient flavor and parser/score chrome. The mechanical test is
`take <noun>` in the harness ("firmly attached" ⇒ KEEP, pockets ⇒ DROP). Report these as their own
findings ("coverage gap, no note filed") so the user sees omitted fixtures before they have to
notice them in the picture.

## Step 4 — Stop. Offer the handoff.

The analysis pass itself **changes nothing** — no layer edits, no regeneration, and (because no
action has been taken yet) **no notes resolved**. Retrieval/analysis never auto-flags. End with a
short offer: "Want me to apply any of these? I'll draft the before→after diffs (via location-art),
and flag each acted-on note resolved." Applying is gated on explicit approval.

## Step 5 — When a note IS acted on, mark it resolved

Resolution is coupled to **action**, never to merely having looked at the note. The moment a fix
is applied for a note (whether you do it here after approval, or hand off to `location-art`),
flag that note resolved in `docs/games/images/_review-notes.json` so future sweeps skip it and the
history survives. Convert the entry to the object form:

```json
{ "note": "<original text, unchanged>", "status": "resolved",
  "appliedTo": "scene|aesthetic|artist|app", "resolved": "<YYYY-MM-DD>" }
```

- `appliedTo` = the layer you changed (matches the diagnosis's owning layer).
- A note you consciously decide NOT to act on → `"status": "wontfix"` (same shape, no `appliedTo`
  needed) — e.g. a marginal framing nitpick on an already-good render.
- **Never delete** a note; the user re-opens by editing its text or unchecking the reviewer's
  Resolved box. One resolved-flag per note acted on — don't batch-resolve notes you didn't touch.
- This is the identical convention `tools/review-server.cjs` (`setNoteStatus`) and the
  `location-art` skill use; the reviewer UI greys out flagged notes and shows the Resolved chip.
