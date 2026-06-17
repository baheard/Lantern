---
name: go-to
description: Jump a Lantern game to a location, turn, or scenario by replaying its verified walkthrough in the CLI, then save a single reusable "go-to" slot and load it in the browser if a live tab is available. Triggered when the user says "/go-to <target> in <game>", "go to <location/turn/scenario>", "jump to <X>", or "set up <game> at <X>".
---

# go-to skill

Get a game to an arbitrary point — **a location, a turn, or a scenario** — by replaying its
verified walkthrough headlessly to the shortest point that reaches the target, saving the VM
state into a single fixed **`go-to`** save slot, and loading it in the live browser when one is
available.

This is the productized version of the "get me to X" workflow. The `go-to` slot is special:
it **always overwrites** the previous `go-to` save and is **exempt from the app's save limit**
(`MAX_SAVES = 10`) — it never counts toward the cap and can't be created via the in-game SAVE
command (the name is reserved). See `docs/js/game/commands/meta-command-handlers.js`.

## Inputs

- **game** — a Lantern game name (e.g. `anchorhead`, `wishbringer`). Must have a game file in
  `docs/games/` and a walkthrough at `docs/games/walkthroughs/<game>.cmds.txt`.
- **target** — one of:
  - **location** — a room name (e.g. "the Library", "Catwalk South"). Find the shortest prefix
    of the walkthrough that first reaches it.
  - **turn** — a move count (e.g. "turn 40").
  - **scenario** — a described moment (e.g. "after meeting Michael", "the safe puzzle", "day two").

## Workflow

### 1. Resolve game + walkthrough
Confirm `docs/games/<game>.(z8|z5|z3|…)` and `docs/games/walkthroughs/<game>.cmds.txt` exist.
If the walkthrough is missing, invoke the **trace-walkthrough** skill first (a verified,
`--strict`-clean cmds file is the feedstock) — don't hand-roll a path.

### 2. Find the shortest point that reaches the target
List the walkthrough's anchors: `node tools/jump-to.cjs <game>` prints every `## [slug] label`
marker. Then map the target to a snapshot point:

- **Scenario / location with a matching marker** → pick the marker slug. Markers are authored
  act/scenario anchors; their labels describe what happens there. Choose the *earliest* marker
  that satisfies the target (shortest path).
- **Location with no obvious marker** → find where the walkthrough first arrives at that room.
  Replay with `node tools/play.cjs <game> --seed 1 --status --file docs/games/walkthroughs/<game>.cmds.txt`
  and read the `[@ location]` tags to find the first turn whose location matches. Use that turn
  number (or a nearby marker just before it) as the target.
- **Turn N** → use the move count directly.

Prefer the **earliest** point that satisfies the request — "shortest path" means fewest moves to
first reach the target, not the last time the walkthrough passes through it.

### 3. Build the `go-to` save
Always seed 1 (matches the verified walkthrough). Two equivalent ways to target:

```bash
# By marker slug (locations/scenarios authored as ## [slug]):
node tools/jump-to.cjs <game> <markerSlug> --name go-to

# By turn count or prose substring (anything without a marker):
node tools/jump-to.cjs <game> --at <N|substr> --name go-to
```

`--name go-to` writes the fixed slot `lantern_customsave_<game>_go-to` and the single reusable
asset `docs/assets/<game>-go-to.snapshot.json` (overwriting any previous one). It prints a
browser-console injection one-liner — capture it for step 4.

### 4. Load in the browser if a tab is available; otherwise report
Check for a live browser via the webagent MCP (`connect_to_live_browser` → `list_tabs`):

- **Live tab with the game already loaded** (or one you can load): run the injection one-liner
  from step 3 via `mcp__web-agent-mcp__execute_console` (`force: true`). Confirm with
  `window.__jumpInjectDone === 'go-to'`, then tell the user:
  *"`go-to` save injected — open the Saves panel and load 'go-to'."* If the game isn't loaded in
  any tab, load it first (Home → game), then inject.
- **No live browser available**: don't fail. The save asset and injection one-liner are still
  written. Report: *"`go-to` save built for <game> at <target> (docs/assets/<game>-go-to.snapshot.json).
  No live browser tab found — start the app and I'll inject it, or paste the one-liner yourself."*

Do **not** hand the user a console one-liner to paste when a tab is available — inject it
yourself end-to-end. The paste path is the no-browser fallback only.

## Notes & gotchas

- **One slot, always overwritten.** Every `/go-to` invocation replaces the prior `go-to` save for
  that game. There is no history; that's intentional.
- **Exempt from the limit.** The app caps custom saves at 10, but `go-to` neither counts nor
  consumes a slot. The exemption lives in `meta-command-handlers.js` (`GO_TO_SAVE_NAME`).
- **Seed 1, randomized puzzles.** Snapshots are seed-/build-specific. Seed 1 matches the verified
  walkthroughs; randomized-flavor games (e.g. Anchorhead's safe combo) round-trip only at that seed.
- **The status-bar label in the save is cosmetic** — the real status bar comes from the restored
  VM on the first turn. (Phase-scoped hints rehydrate on resume as of v1.5.607.)
- **Underlying tool:** `tools/jump-to.cjs` (which wraps `tools/play.cjs --snapshot-at`). Full
  harness design in `.tome/headless-replay-harness.md`.
