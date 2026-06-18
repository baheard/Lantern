---
name: generate-location-prompts
description: Build the per-location scene prompt pack (prompts.json) for a Lantern game's art pipeline by replaying its verified walkthrough. Triggered when the user says "generate location prompts for <game>", "build the prompt pack for <game>", "/generate-location-prompts <game>", or "make room prompts for <game>". Prerequisite: generate-hints (which produces the verified walkthrough the pack is built from).
---

# generate-location-prompts skill

Produces the **scene prompt pack** for a game — `docs/games/images/<game>/prompts.json`
(machine) + `prompts.md` (human) — by replaying the game's verified walkthrough once and
capturing, per distinct room: the canonical `locationName` (the same string the auto-mapper
records, so images bind to map nodes by name), the room's description prose, and its real
exits derived from the walkthrough's movement edges.

This is the **bridge artifact** in the location-art pipeline: it sits between the
walkthrough/hints work and image generation. It emits **scene-only** prompts — the
Artist/Aesthetic layers are composed in later by `location-art`, NOT baked here.

```
trace-walkthrough → generate-hints → [generate-location-prompts] → location-art (images)
        (.cmds.txt)     (hints.json)        (prompts.json)            (_review/*.png)
```

## Prerequisite: generate-hints

This skill builds the pack from `docs/games/walkthroughs/<game>.cmds.txt` — the
`--strict`-verified command list that `generate-hints` (via `trace-walkthrough`) produces. By
convention, **`generate-hints` is the upstream step**: a game that's had hints generated has a
verified walkthrough and puzzle notes, which is exactly the feedstock the prompt pack needs.

The **corresponding artifact** that signals hints have been run is
`docs/games/hints/<game>.json`. Gate on it:

1. **Resolve `<game>`** — the game filename minus extension, lowercased (matches
   `game-loader.js` normalisation). If no game was named, list the games under
   `docs/games/images/` and `docs/games/walkthroughs/` and ask which one.
2. **Check the hints artifact** `docs/games/hints/<game>.json`:
   - **Exists** → the prerequisite is satisfied. Proceed straight to "Generate the pack".
   - **Missing** → do NOT silently generate from a bare walkthrough. Tell the user that
     `generate-hints` is the prerequisite and hasn't been run for this game, and **ask whether
     to run `/generate-hints <game>` first** (use `AskUserQuestion`). On yes, invoke the
     `generate-hints` skill, let it complete (it will produce/verify `<game>.cmds.txt`,
     `<game>.notes.md`, and `<game>.json`), then return here and proceed. On no, fall through to
     the walkthrough check and proceed only if the user explicitly opts to build prompts without
     hints.
3. **Check the technical input** `docs/games/walkthroughs/<game>.cmds.txt` (the file
   `gen-room-prompts.cjs` actually reads):
   - **Exists** → ready to generate.
   - **Missing** → the pack can't be built. This means even the walkthrough hasn't been traced;
     invoke the `trace-walkthrough` skill (or `generate-hints`, which calls it) to produce it
     first. Never hand-author a cmds file here.

So: **hints + cmds present → just generate.** Otherwise confirm running the upstream skill(s)
first, then generate.

## Generate the pack

Run the builder (creates `docs/games/images/<game>/` if needed):

```bash
node tools/gen-room-prompts.cjs <game>
```

Useful flags (match the verified walkthrough's seed if it isn't the default):
- `--seed <n>` — replay seed; use the same one noted at the top of `<game>.cmds.txt`
  (default `1`) so a randomized gate doesn't wedge the replay.
- `--out <path>` — override the output location (default `docs/games/images/<game>/prompts.json`).

It writes:
- `docs/games/images/<game>/prompts.json` — machine pack consumed by `tools/gen-room-images.cjs`.
- `docs/games/images/<game>/prompts.md` — human-readable companion.

## After generating

1. **Sanity-check the pack.** Confirm the room count looks right and spot-check a couple of
   entries: the `locationName` matches what the auto-mapper records (byte-for-byte, incl.
   British spellings / state suffixes), the scene prose is the static scenery (not dialogue or
   NPC movement — the builder strips most of that, but verify), and exits read sensibly.
   `node tools/_check_walkthrough_map.cjs <game>` upstream should already be clean.
   - A `(skipped N scene-less phantom location(s): …)` line is **normal**: `getCurrentLocation()`
     sometimes reports a status-line flash (e.g. Theatre's Boiler-Room Latin curse) as a room
     name; those have no scene and are dropped so they don't become junk image slots. Glance at
     the skipped names to confirm they're flavor text, not a real room the parser missed.
2. **Don't bump the app version.** This is dev-only tooling/data (no service-worker change) —
   bumping `CACHE_VERSION` would force a pointless re-download for users. (Same rule as
   `location-art`.)
3. **Hand off to `location-art`.** The pack is scene-only; turning it into images
   (composing Artist ▸ Aesthetic ▸ Scene, generating into `_review/`, reviewing, promoting) is
   the `location-art` skill's job. Tell the user the pack is ready and that the next step is
   `/location-art <game>` → Generate.

## Notes
- The pack is **scene-only by design** — do not edit `prompts.json` to bake in palette/mood/
  artist style. Per-room literal fixes, per-game aesthetic, and global artist style all live in
  the three-layer files `location-art` owns (`<game>/style.json`, `_artists/artists.json`). See
  `.tome/art-direction-model.md`.
- Regenerating the pack later (e.g. after the walkthrough changes) overwrites `prompts.json`.
  Any per-room art direction the user added lives in `style.json` → `scenes[slug]` overrides,
  which are separate and survive a pack regen.
- Headless replay mechanics (seeds, snapshots): `.tome/headless-replay-harness.md`.
