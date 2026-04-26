---
title: App Init Phases
tags: [app, init, architecture, refactoring]
created: 2026-04-26
updated: 2026-04-26
aliases: [initApp, app.js phases, init order]
---

# App Init Phases

`initApp()` in `docs/js/app.js` was phase-split in v1.5.230 into 7 private functions called from a thin 9-line coordinator.

## Phase order (ordering is load-bearing)

1. **`initViewport()`** — Sets CSS `--vh` custom property; installs resize + visualViewport + orientationchange listeners.
2. **`initDOMandValidation()`** — Calls `initDOM()` (populates the `dom` cache). Must come before anything that reads `dom.*`.
3. **`initVoice()`** — Sets `state.browserVoiceConfig` from localStorage; fires voice recognition init in a 100ms setTimeout. Must come before `initAllSettings()` because settings reads `state.browserVoiceConfig`.
4. **`initUIComponents()`** — Calls all module `init*()` functions, wires toggle handlers, sets up lazy-loaded map button, initializes game selection. Depends on `dom` being populated and voice config being loaded.
5. **`wireEventListeners()`** — Navigation buttons (skip/prev/pause/next/end) and mute button (click + push-to-talk mouse/touch/keyboard events).
6. **`wireKeyboardShortcuts()`** — Single `document.addEventListener('keydown', ...)` handler for Ctrl+M/S/R/X, Escape, arrow keys.
7. **`wireLifecycle()`** — Page hide/show, visibility change, window focus, beforeunload, and the smart-scroll resize handler.

## Why phases stayed in app.js (not extracted to modules)

No phase was large enough to justify a new module file, and extracting would have required either:
- adding exports that don't need to be public, or
- accepting upward-layer imports (e.g. a `voice-init.js` importing from `ui/`)

All 7 functions are private to the module and only called by `initApp()`.

## Critical ordering dependency

`initVoice()` → `initUIComponents()` ordering: `initVoice()` primes `state.browserVoiceConfig` from localStorage. `initAllSettings()` (called inside `initUIComponents`) reads that config to populate the voice settings panel. Swapping these two causes the panel to open with stale/default values.
