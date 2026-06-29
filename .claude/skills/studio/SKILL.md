---
name: studio
description: Master pipeline navigator for all Lantern content work — hints, images, art direction, artview, feedback. Triggered by "/studio", "/studio <game>", "what can I make", "how do I generate images for <game>", "what's next for <game>", "pipeline", "build scenes", "generate art for <game>", "craft a scene prompt", "recommend an artist", "author aesthetic", "get <game> ready to render", or any broad content-generation request that spans multiple skills.
---

# studio skill

Single entry point for all Lantern content work. Replaces `/location-art` and `/build-scenes` (both retired).

| What you type | Result |
|---|---|
| `/studio` | Goal menu (Mode A) |
| `/studio <game>` | Full dashboard for that game (Mode B) |
| `/studio <goal-number>` | Locks goal, asks for game, then filtered Mode B |
| `/studio <game> <goal>` | Filtered dashboard directly |

---

## The pipeline (the canonical order)

Everything runs **top → bottom**; each step needs the ones above it. The three art-making
phases — **frame**, **choose**, **make** — are deliberately distinct (different decisions, run by
different skills):

```
1  trace-walkthrough    →  walkthrough          verified --strict-clean command list
2  generate-hints       →  hints
3  generate-room-facts  →  room-facts pack       replays walkthrough → per-room facts

   ── FRAME (judgment only — no images generated) ──
4  author aesthetic     →  style.json.aesthetic  world + mood, feeling-words only
5  frame → scene        →  style.json.scenes     /frame pins vantage+occlusion (location-framing.md),
                                                  /scene distils it to render prose (stamps `mold`)

   ── CHOOSE (cheap throwaway renders) ──
6  audition → artist    →  selected-artist.json  bake-off to CAST the artist

   ── MAKE (the real spend) ──
7  render-rooms         →  committed .png art
```

**The dependency that's easy to get wrong:** the audition (step 6) renders the *molded* scene
through a candidate artist, so **mold (5) and aesthetic (4) must both be done before you audition.**
Auditioning on un-molded rooms tests the artist against raw, unframed facts — a misleading
comparison. Mold is **artist-independent** (it's framing + literal facts; palette/medium is the
artist's job, mood is the aesthetic's), so you mold once and it stays valid for whichever artist
wins. Aesthetic and mold are independent of each other (both only need room-facts) — do them in
either order, but both gate the audition, and the audition gates render.

---

## Mode A — Goal menu

Show when no game is named (numbers follow the pipeline order above):

```
What do you want to make?   (the pipeline runs top → bottom)

  ── Words ────────────────────────────────────────────────
  1  Generate hints            needs: walkthrough
  2  Create image prompts      needs: walkthrough          → room-facts pack

  ── Frame the art  (judgment only, no images) ────────────
  3  Author aesthetic          needs: room-facts           world + mood
  4  Mold scenes               needs: room-facts           frames every room

  ── Choose the artist  (cheap throwaway renders) ─────────
  5  Audition & choose artist  needs: aesthetic + mold     bake-off → cast the artist

  ── Make the art  (the real spend) ───────────────────────
  6  Render images             needs: aesthetic + mold + artist

  ── Anytime ──────────────────────────────────────────────
  7  Prototype in Artview      → /artview (browser app)
  8  Review feedback (art + hints)
  9  Jump to a game location

Pick a number — or name a game to see its full status.
```

After the user picks a goal number, ask which game. List available games by scanning (deduplicate, sort alphabetically):
- `docs/games/images/` — subdirs not starting with `_`
- `docs/games/hints/` — `.json` filenames (strip extension)
- `docs/games/walkthroughs/` — `.cmds.txt` filenames (strip `.cmds.txt`)

Then show Mode B filtered to the chosen goal.

---

## Mode B — Game dashboard

Read these files for `<game>` and report status. Use the room count from `room-facts.json` as
`roomCount` for the downstream rows. **Rows are listed in pipeline order** — so the first
incomplete row from the top IS the next step.

| Row | File to check | ✓ condition | Display |
|---|---|---|---|
| Walkthrough | `docs/games/walkthroughs/<game>.cmds.txt` | exists | "theatre.cmds.txt" |
| Hints | `docs/games/hints/<game>.json` | exists | "theatre.json (N questions)" — top-level key count |
| Image prompts | `docs/games/images/<game>/room-facts.json` | exists | "room-facts.json (N rooms)" — top-level key count = roomCount |
| Aesthetic | `docs/games/images/<game>/style.json` → `aesthetic` | field non-empty | ✓ |
| Scene overrides (mold) | `style.json` → `scenes` key count | compare to roomCount | "14 / 18 rooms" |
| Artist (audition) | `docs/games/images/<game>/selected-artist.json` | exists, has `id` | show the artist **name** (look the `id` up in `_artists/artists.json` → `name`); never show the raw id/slug |
| Images (render) | `.png` files in `docs/games/images/<game>/` (exclude `_review/` subdir) | compare to roomCount | "9 / 18 rooms" |

**Format:**
```
Theatre — content status
──────────────────────────────────────────────────
  Walkthrough     ✓   theatre.cmds.txt
  Hints           ✓   theatre.json (38 questions)
  Image prompts   ✓   room-facts.json (18 rooms)
  Aesthetic       ✓
  Scene overrides ~   14 / 18 rooms        (mold)
  Artist          ✓   Pulp Magazine        (audition)
  Images          ✗   0 / 18 rendered      (render)

What's next: 4 rooms unmolded — /frame theatre then /scene theatre
```

**"What's next" rule:** the rows are in dependency order, so walk top-down and suggest the skill
for the **first ✗ or incomplete row** (per the Goal → skill mapping). If all rows are ✓ / complete:
"All phases done — `/artview <game>` to review or `/render-rooms <game>` to re-render."

### Provenance & staleness — read `pipeline.json`

Each completed step is stamped in `docs/games/images/<game>/pipeline.json`:
`{ "<step>": { "at": <ISO>, "version": <app version>, "commit": <git short hash> } }`
(written by `tools/stamp-pipeline.cjs <game> <step>`, which the pipeline skills call on completion).
Step keys: `walkthrough · hints · room-facts · aesthetic · mold · artist · render`.

The **files** remain the source of truth for "is it done"; `pipeline.json` only adds *when / at what
version*. After computing each row's ✓/✗, overlay the stamp and **flag staleness** two ways:

1. **Out-of-order (the important one).** A step done *before* something it depends on was last
   (re)done is stale — re-run it. Dependencies = the steps above it: `room-facts` depends on
   `walkthrough`; `aesthetic` and `mold` each depend on `room-facts`; `artist` depends on `mold` +
   `aesthetic`; `render` depends on `mold` + `aesthetic` + `artist`. A step is **⚠ stale** if its
   `at` is earlier than any dependency's `at`. (This is the exact bug that bit Dreamhold — mold on a
   pre-regen pack.)
2. **Pre-major-change.** If a step's `version` is behind the current `docs/js/config.js` version by a
   **major or minor** bump (e.g. step done at `1.5.x`, current is `1.6.0`), flag it `⚠ pre-1.6` —
   a pipeline-engine change may have shipped since. A patch-level gap (`1.5.680` → `1.5.682`) is
   normal and NOT flagged (art-data work doesn't bump the version).

Annotate each ✓ row with a terse stamp, e.g. `✓  mold  96/96  (v1.5.682, 2h ago)` and append
`⚠ stale — re-run (older than room-facts)` or `⚠ pre-1.6` when a flag fires. A missing
`pipeline.json` or absent step key = no stamp shown (older games predate stamping; don't treat
absence as stale). When any ⚠ stale fires, "What's next" should suggest re-running the *earliest*
stale step, not just the first ✗.

**Filtered mode** (goal was specified): show all rows, annotate the relevant ones with `← goal`, and narrow "What's next" to just that goal.

---

## Goal → skill mapping

| # | Goal | Action |
|---|---|---|
| 1 | Generate hints | invoke `generate-hints` skill |
| 2 | Create image prompts | invoke `generate-room-facts` skill |
| 3 | Author aesthetic styling | run inline — see below |
| 4 | Frame + distil scenes | invoke `frame` then `scene` skill |
| 5 | Audition & choose artist | run inline — see below |
| 6 | Render images | invoke `render-rooms` skill |
| 7 | Prototype in Artview | invoke `/artview` skill |
| 8 | Review feedback | invoke `review-notes` skill |
| 9 | Jump to a game location | invoke `go-to` skill |

---

## Goal 3 — Author aesthetic styling

Read `.tome/art-direction-model.md` (especially "Authoring a game aesthetic" + the layer-discipline
factor) before writing.

The `aesthetic` field captures **world + mood in feeling-words only** — it answers two questions and
only two: *what is this world, and how does it feel.* **No medium, no color/palette words, no
contrast/lighting directives** — those are the Artist's job (color especially: you make a game
colorful by *casting a colorful artist*, never by writing "colorful" into the aesthetic).

1. Read 5–10 entries from `room-facts.json` to feel the world.
2. Draft an `aesthetic` string: 20–40 words, feeling-words and world nouns. No color words, no medium
   words (not "sepia", "watercolor", "dark palette", "high contrast"). Good examples: `"damp Victorian
   cobblestones, salt air, paranoia under grey sky"` / `"luminous wonder, serene and dreamlike, sunlit
   gardens above the vast hush of caverns below"`.
3. **Litmus test:** would the line read as a contradiction under a deliberately off-register artist
   (storybook on a horror game)? If yes, it's reaching into the artist's territory — cut it.
4. Propose the draft. On approval, write it to `docs/games/images/<game>/style.json` → `aesthetic`.
   If `style.json` doesn't exist yet, create `{ "aesthetic": "..." }`.
5. **Stamp provenance:** `node tools/stamp-pipeline.cjs <game> aesthetic` (dev-only, no version bump).

---

## Goal 5 — Audition & choose artist

Read `.tome/artist-audition-design.md` for the full audition framework before proceeding.

**Prerequisite check first:** the audition renders the *molded* scene through each candidate artist,
so **the audition rooms must already be molded (Goal 4) and the aesthetic authored (Goal 3).** If
either is missing, say so and point the user back up the pipeline — don't audition on raw,
unframed facts (it produces a misleading comparison). You don't need all rooms molded, just the
handful you'll audition on.

1. Read `docs/games/images/_artists/artists.json`. Use only artists whose `id` does **not** start
   with `"old-"` (those are retired and have empty `goodFor`).
2. Read the game's `style.json` → `aesthetic` and 3–5 entries from `room-facts.json` to understand
   the world and mood. Remember the **casting principle**: the artist sets the tonal/colour register,
   not the aesthetic — recommend by tone fit.
3. Recommend 2–4 artists from the current roster. For each show:
   - `name` (lead with it), `id`, `summary`
   - Which `goodFor` tags match this game's tone
   - One sentence of reasoning tied to the game's actual content
4. **Suggest audition rooms** — pick ~4 that stress range: one bright exterior, one near-black
   interior, one signature/atmospheric "money shot", and one more. Let the user swap them.
5. Audition in Artview (`/artview <game>` → Audition rail): check the candidates into the grid,
   regenerate the rooms cheaply (OpenAI-low default), and compare side by side. Always refer to
   artists by **name**, not id/slug.
6. When the user picks one, write `docs/games/images/<game>/selected-artist.json`:
   ```json
   { "id": "<chosen-id>" }
   ```
7. **Stamp provenance:** `node tools/stamp-pipeline.cjs <game> artist` (dev-only, no version bump).
   **Note — auditioning happens manually in Artview, not via this skill.** When the user tells you
   they've picked the game artist (or you write `selected-artist.json` for them), stamp `artist`
   then. The tool's own "Make game artist" button writes the file but does NOT stamp, so the stamp
   is your responsibility on the user's say-so.

---

## Notes

- Dev-only data changes (walkthroughs, prompts, style.json, images) — do **not** bump the app version.
- Full pipeline order: `trace-walkthrough` → `generate-hints` → `generate-room-facts` → **aesthetic** +
  (**`frame` → `scene`**) (the FRAME-judgment steps; aesthetic is order-independent of frame/scene, but
  `scene` follows `frame`) → **audition → artist** (CHOOSE) → `render-rooms` (MAKE). The pipeline step
  is stamped `mold` by `scene`. Artview is the prototyping surface used during the frame/choose steps.
</content>
