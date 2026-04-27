---
title: VM Watchdog & REPAIR Flow
tags: [zvm, watchdog, recovery]
created: 2026-04-26
updated: 2026-04-26
aliases: [watchdog, repair command, vm hang, broken state]
---

# VM Watchdog & REPAIR Flow

The Z-machine occasionally enters a stuck state where it stops responding to input. IFTalk has a watchdog that detects this and offers in-game recovery via a manual `REPAIR` command. The flow lives in `docs/js/game/voxglk-watchdog.js` (detection + state + repair execution) with two trigger points in `voxglk.js` (call `startWatchdog` from `sendInput`, `clearWatchdog` from `update`) and the user-facing REPAIR command in `commands/meta-command-handlers.js`.

## Detection

Defined in `docs/js/game/voxglk-watchdog.js`:

- **`WATCHDOG_TIMEOUT_MS = 5000`** — how long to wait after sending input before assuming the VM is hung.
- **`REPAIR_RETRY_WINDOW_MS = 15000`** — minimum gap between repair attempts (prevents repair-loops).
- **`startWatchdog(currentGeneration, getCurrentGeneration, isBootstrapping)`** — called from `voxglk.sendInput()` after every input dispatch. Schedules a check at +5s. The two function/flag parameters are injected by voxglk.js to avoid a `voxglk-watchdog` ↔ `voxglk` import cycle (the timer needs to read the live `generation` and the bootstrap-suppress flag, both owned by voxglk.js).
- **`clearWatchdog()`** — called when the VM responds (next `update()` event in voxglk.js clears it on the gen-advance branch).
- **`resetWatchdogState()`** — called from `voxglk.init()` for a new game; clears any stale timer + the repair-in-progress flag in one call.
- **State variables (module-scoped, single instance):** `watchdogTimer`, `lastInputGeneration`, `isAutoRepairInProgress`, `currentRepairFlagKey`.

## Recovery flow

1. **Timeout fires** — VM hasn't called `update()` within 5s of an input.
2. **Warning shown in-game** — `promptRepairVMState()` injects a system message asking the user to type `REPAIR`. The dynamic import on this path was flagged in Tier 1 as a known low-priority issue.
3. **User types `REPAIR`** — handled by `commands/meta-command-handlers.js`. Saves current state, sets `iftalk_pending_restore` in sessionStorage, reloads the page.
4. **On reload** — the auto-restore path (see tome `bootstrap-restore-flow`) picks up the pending restore key and brings the user back to where the watchdog fired.

## Why manual, not automatic

The watchdog *could* call `performRepair()` automatically, but the design is intentionally manual. Auto-repair on every 5s timeout would mask real problems (slow games, intentional VM pauses, debugger breakpoints). Requiring the user to type `REPAIR` keeps recovery deliberate and visible — and the warning surfaces the timeout in case it's a real bug worth investigating rather than papering over.

## Per-game repair flag

`currentRepairFlagKey` (line 41) is game-specific. When a repair is in progress, the flag is set in localStorage so a subsequent watchdog timeout within `REPAIR_RETRY_WINDOW_MS` (15s) on the same game knows not to fire again. After 15s without another timeout, the flag is cleared.

## What's likely wrong if you see issues

- Watchdog firing too often: a game is genuinely slow, or input dispatch is firing duplicate inputs (check `sendInput()`'s acceptCallback null-guarding).
- Watchdog never firing on a real hang: `clearWatchdog()` is being called when it shouldn't (e.g., during bootstrap-suppress at line 445 — verify that path doesn't accidentally clear).
- Repair-loop: `REPAIR_RETRY_WINDOW_MS` not being respected, or `currentRepairFlagKey` cleared too eagerly.
