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

## Mode A — Goal menu

Show when no game is named:

```
What do you want to make?

  ── Hints ───────────────────────────────────────────────
  1  Generate hints               needs: walkthrough

  ── Build art config ────────────────────────────────────
  2  Create image prompts         needs: walkthrough, hints
  3  Author scene overrides       needs: image prompts
  4  Recommend an artist          (audition in Artview yourself)
  5  Author aesthetic styling

  ── Prototype & render ──────────────────────────────────
  6  Prototype in Artview         → /artview (browser app)
  7  Render images                needs: prompts + overrides

  ── Maintenance ─────────────────────────────────────────
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

Read these files for `<game>` and report status. Use the room count from `prompts.json` as `roomCount` for the downstream rows.

| Row | File to check | ✓ condition | Display |
|---|---|---|---|
| Walkthrough | `docs/games/walkthroughs/<game>.cmds.txt` | exists | "theatre.cmds.txt" |
| Hints | `docs/games/hints/<game>.json` | exists | "theatre.json (N questions)" — top-level key count |
| Image prompts | `docs/games/images/<game>/prompts.json` | exists | "prompts.json (N rooms)" — top-level key count = roomCount |
| Artist | `docs/games/images/<game>/selected-artist.json` | exists, has `id` | show id value |
| Aesthetic | `docs/games/images/<game>/style.json` → `aesthetic` | field non-empty | ✓ |
| Scene overrides | `style.json` → `scenes` key count | compare to roomCount | "14 / 18 rooms" |
| Images | `.png` files in `docs/games/images/<game>/` (exclude `_review/` subdir) | compare to roomCount | "9 / 18 rooms" |

**Format:**
```
Theatre — content status
──────────────────────────────────────────────────
  Walkthrough    ✓   theatre.cmds.txt
  Hints          ✓   theatre.json (38 questions)
  Image prompts  ✓   prompts.json (18 rooms)
  Artist         ✓   illustration-plate
  Aesthetic      ✓
  Scene overrides ~ 14 / 18 rooms
  Images         ✗   0 / 18 rendered

What's next: 4 rooms unmolded — /mold theatre
```

**"What's next" rule:** find the first ✗ or incomplete row and suggest the skill to run. If all rows are ✓ / complete: "All phases done — `/artview <game>` to review or `/render-rooms <game>` to re-render."

**Filtered mode** (goal was specified): show all rows, annotate the relevant ones with `← goal`, and narrow "What's next" to just that goal.

---

## Goal → skill mapping

| # | Goal | Action |
|---|---|---|
| 1 | Generate hints | invoke `generate-hints` skill |
| 2 | Create image prompts | invoke `generate-location-prompts` skill |
| 3 | Author scene overrides | invoke `mold` skill |
| 4 | Recommend an artist | run inline — see below |
| 5 | Author aesthetic styling | run inline — see below |
| 6 | Prototype in Artview | invoke `/artview` skill |
| 7 | Render images | invoke `render-rooms` skill |
| 8 | Review feedback | invoke `review-notes` skill |
| 9 | Jump to a game location | invoke `go-to` skill |

---

## Goal 4 — Recommend an artist

Read `.tome/artist-audition-design.md` for the full audition framework before proceeding.

1. Read `docs/games/images/_artists/artists.json`. Use only artists whose `id` does **not** start with `"old-"` (those are retired and have empty `goodFor`).
2. Read the game's `style.json` → `aesthetic` (if it exists) and 3–5 entries from `prompts.json` to understand the world and mood.
3. Recommend 2–3 artists from the current roster. For each show:
   - `id`, `name`, `summary`
   - Which `goodFor` tags match this game's tone
   - One sentence of reasoning tied to the game's actual content
4. Tell the user to audition the candidates in Artview (`/artview <game>`): switch artists in the Artist selector and regenerate single rooms cheaply before committing.
5. When the user picks one, write `docs/games/images/<game>/selected-artist.json`:
   ```json
   { "id": "<chosen-id>" }
   ```

---

## Goal 5 — Author aesthetic styling

Read `.tome/art-direction-model.md` (especially the "Layer discipline" factor) before writing.

The `aesthetic` field captures **world + mood in feeling-words only** — no medium, no color words, no technique (those belong to Artist). It should evoke setting, atmosphere, and tone.

1. Read 5–10 entries from `prompts.json` to feel the world.
2. Draft an `aesthetic` string: 20–40 words, feeling-words and world nouns. No color words, no medium words (not "sepia", "watercolor", "dark palette"). Good examples: `"damp Victorian cobblestones, salt air, paranoia under grey sky"` or `"vast halls of polished stone echoing with bureaucratic silence"`.
3. Propose the draft. On approval, write it to `docs/games/images/<game>/style.json` → `aesthetic`. If `style.json` doesn't exist yet, create `{ "aesthetic": "..." }`.

---

## Notes

- Dev-only data changes (walkthroughs, prompts, style.json, images) — do **not** bump the app version.
- Full pipeline order: `trace-walkthrough` → `generate-hints` → `generate-location-prompts` → `mold` + artist + aesthetic → Artview prototype → `render-rooms`.
