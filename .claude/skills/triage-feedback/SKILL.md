---
name: triage-feedback
description: Process the GitHub feedback inbox — the app-wide, network-touching operation that drains feedback issues on baheard/Lantern. Classifies bug/enhancement, deletes garbage, consolidates [HINT]/[ART] feedback into the two _review-notes.json files and closes them, fast-paths obvious hint fixes, and (with --groom) closes the on-hold/wont-fix backlog. Modes: default (full inbox), --consolidate (only the [ART]/[HINT] fold-and-close; the inner step /review-notes calls), --groom. Triggered when the user says "/triage-feedback", "triage feedback", "triage the feedback", "process feedback issues", or "drain the feedback inbox".
---

# Triage Feedback Issues

Fetch open GitHub issues labelled `feedback` on `baheard/Lantern` and process them. This is the
**app-wide inbox processor** — the heavy, network-touching operation you run to drain feedback.
Its companion is `/review-notes` (survey all-games unresolved content notes, local).

See `.tome/hints-feedback-system.md` for the full design — especially the **shared
consolidate-then-close procedure** (referenced below) and the **inbox-hygiene fix** (`feedback` =
"not yet triaged"; the label is removed / the issue closed the moment it's classified, which is
why old issues stop re-surfacing every run).

## Modes

- **(default)** — full inbox: garbage, bug/enhancement, `[HINT]`/`[ART]` consolidation, fast-path
  fixes. Steps 1–8.
- **`--consolidate`** — run ONLY Step 2 (the `[ART]`/`[HINT]` consolidate-then-close), then stop.
  This is the inner step `/review-notes` invokes so it can stand alone.
- **`--groom`** — after the normal run, also close the `on-hold` / `wont-fix` backlog (Step 9).

## Steps

1. List the inbox:
   `gh issue list --repo baheard/Lantern --label feedback --state open --json number,title,body,labels --limit 100`

2. **Consolidate hint & art feedback first (also the entire `--consolidate` mode).** Any issue
   whose body begins with a `[HINT]` or `[ART]` header is content feedback, not ordinary feedback.
   Run the **shared consolidate-then-close procedure** from `.tome/hints-feedback-system.md` on
   each. In brief, per issue:

   - **Parse** the header. `[HINT]`: `game · section · q · hint=<n>/<total> · hintsVersion` + the
     quoted hint text + `Comment:`. `[ART]`: `game · location · image=<file> · hash · appVersion`
     + `Comment:`.
   - **Dedup defensively** — same target + same comment text + same device → one note.
   - **Write into the notes file** (committed to git; these ARE the system of record):
     - `[ART]` → `docs/games/images/_review-notes.json`, key `game:<g>:<slug>:<file>`. Resolve
       `<slug>` from the game's `room-facts.json`/manifest by `location`/`file`. Tag the note
       `[player]`; store the `hash`. Entry: `{ note:"[player] <comment>", status:"open",
       source:"player", hash:"<hash>" }`. **If the key already exists** (an authored note, often
       `resolved`), do NOT clobber it — append to a `playerFeedback: [{ comment, hash,
       status:"open", submitted, issue }]` array on that entry AND **set the entry's `status` back
       to `"open"`** (preserve the prior `appliedTo`/`resolved`/`detail` as history). New player
       feedback **reopens** a resolved render — it must show as unresolved in the reviewer UI and
       to `/review-notes`, not stay greyed-out.
     - `[HINT]` → `docs/games/hints/_review-notes.json`, key `game:<g>:<section>:<q>:<hintIndex>`.
       Entry: `{ note:"[player] <comment>", status:"open", source:"player",
       hintText:"<quoted text>" }`. Same reopen rule if the key already exists.
   - **Close the issue** (`gh issue close <n>`). Closing is the watermark — `--state open` won't
     return it again; re-runs and the two operations can't double-process.
   - **Fast-path fix (default mode only; skip under `--consolidate`).** If a `[HINT]` comment is
     specific and credible (wrong/mistyped command, factual error, stale combo, filler tail,
     spoiler), you MAY fix it on the spot: verify mechanics claims against `docs/games/hints/<g>.json`
     + probe with `tools/play.cjs` (generate-hints Step 3.5); surface the proposed fix one at a time
     via `AskUserQuestion` (fix / edit / skip / not-a-problem); on approval edit the hints JSON
     preserving every `id` and bump `meta.appVersion`; note the fix in the notes-file entry
     (`status:"resolved"`). Vague comments just stay `open` for `/review-notes`. Art fixes are NOT
     fast-pathed here — they belong in `/review-notes` (artview).

   Report: "Consolidated X hint + Y art notes (Z hint fixes applied)." Under `--consolidate`, stop
   here. Otherwise continue with the **remaining** (non-content) issues.

3. For each remaining issue, classify on title + body. **Whatever the verdict, remove the
   `feedback` label** (`gh issue edit <n> --remove-label feedback`) so it leaves the inbox:

   **Auto-delete as garbage** — test/empty/meaningless ("test", "asdf", etc.):
   `gh issue delete <n> --repo baheard/Lantern --yes`

   **Auto-label as bug** — broken/crashing/wrong behavior, esp. with corroborating console/error
   output: add `bug`, remove `enhancement` if wrong, remove `feedback`.

   **Auto-label as enhancement** — suggestion / "would be nice" / missing capability: add
   `enhancement`, remove `bug` if present, remove `feedback`.

   **Queue for manual review** — ambiguous or doesn't fit cleanly. (Leaves `feedback` until you
   classify it in Step 6, then it's removed.)

4. **Duplicate detection** — for each non-garbage issue, search before acting:
   `gh issue list --repo baheard/Lantern --state all --search "<2-4 distinctive keywords>" --json number,title,state,labels --limit 10`
   - Existing **open** match → delete the new issue as a duplicate (original already tracks it).
   - Existing **closed** match → queue for manual review, noting the prior issue was closed (may reopen).

5. Process auto-deletable issues and duplicates first without asking. Report what was done
   (including which existing issue each duplicate matched).

6. For the manual review queue, present each issue **one at a time**:

   ```
   Issue #NNN — [game] title
   Version: X.X.XXX | Device: ...

   "[feedback text]"

   [console/output excerpt if present]
   [Possible duplicate of #NNN — "title"  ← only if flagged]

   → bug / enhancement / delete / skip / edit
   ```

7. Apply the choice immediately, then move on (always also `--remove-label feedback` except on skip):
   - `bug` → add `bug`, remove `enhancement`, remove `feedback`
   - `enhancement` → add `enhancement`, remove `bug`, remove `feedback`
   - `delete` → `gh issue delete <n> --yes`
   - `skip` → leave as-is (keeps `feedback` so it returns next run)
   - `edit` → ask for new title/body, apply with `gh issue edit`, then re-present for classification

8. Print a one-line summary: X consolidated (hint/art), X deleted (Y duplicates), X bug, X
   enhancement, X skipped.

8a. **Offer to review notes (default & `--groom` modes; skip under `--consolidate`).** If Step 2
   consolidated any `[HINT]`/`[ART]` notes (or there are pre-existing unresolved notes), offer to
   run `/review-notes` now to work through the freshly-folded content notes one by one. Ask once
   (e.g. "N notes consolidated — want me to run /review-notes to work through them?"); on yes,
   invoke the `review-notes` skill. Don't offer if nothing was consolidated and you have no reason
   to think notes are pending.

9. **`--groom` only** — backlog grooming (deliberate, not every run). List the open
   bug/enhancement backlog; for anything you've decided not to pursue, apply `on-hold` or
   `wont-fix` and **close** it (`gh issue close <n>` — closed ≠ deleted; reopenable, and the
   Step-1 `--state open` filter drops it automatically). Report counts.
