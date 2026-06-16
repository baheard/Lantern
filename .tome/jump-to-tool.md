---
title: jump-to tool
tags: [tooling, walkthrough, save, dev, snapshot]
created: 2026-06-16
updated: 2026-06-16
aliases: [jump-to.cjs, walkthrough jump, app save injection]
---

# jump-to tool

`tools/jump-to.cjs` — replays a game walkthrough to a named `## [marker]` slug and injects the resulting VM state into the web app as a loadable custom save.

## Usage

```bash
node tools/jump-to.cjs anchorhead              # list markers
node tools/jump-to.cjs anchorhead d3-mirror    # replay to marker
```

Markers come from the `## [slug]` lines in `docs/games/walkthroughs/<game>.cmds.txt`. Replay uses `--seed 1` for determinism (same RNG as the verified walkthrough).

## Output

1. Writes `docs/assets/<game>-<marker>.snapshot.json` — the raw VM state (≈150KB for Anchorhead).
2. Prints a one-liner for the browser console that fetches that file and writes the full app-format save entry to `localStorage` under `lantern_customsave_<game>_jump-<marker>`.
3. The save appears in the Saves panel immediately — load it like any custom save.

## Critical requirement: dev server must be running

**`npm start` must be running** before you paste the injection snippet. The snippet does `fetch('/assets/<file>')` — which only resolves if the server is live at port 3002. The app may be cached by the service worker but new assets (snapshot files) are never in the SW cache, so fetch will 404 if the server is down.

## Save format

Wraps the snapshot in the engine-format save structure used by `performSave()` in `save-manager.js`:
- `saveFormat: 'engine'`
- `engineSnapshot`: stringified VM state (same object as `do_autosave` produces)
- `gameSignature`: computed directly from the first 30 bytes of the game file (matches ZVM's `this.signature`)
- `displayHTML`: minimal status bar label from the marker title; empty lowerWindow (game text starts fresh on first command after load)

## Snapshot files

Generated artifacts in `docs/assets/` — not committed to git. Ephemeral: re-run the tool if you need a fresh one.
