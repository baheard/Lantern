---
title: Browser Testing — Game Selection
tags: [testing, games, webagent]
created: 2026-04-26
updated: 2026-04-26
aliases: [test games, which game to test, webagent testing]
---

# Browser Testing — Game Selection

## Status bar / room-change testing

**Use 9:05** — allows free movement between Bedroom, Bathroom, and Living Room from the start. Good for verifying status bar updates when the room name changes.

**Avoid Lost Pig** — blocks almost all movement at the start of the game (Grunk refuses to enter the forest, can't go most directions). Status bar stays on "Outside" no matter what you try. Useless for testing location-change behavior.

## Autosave / restore testing

**9:05** works well — short game, autosave triggers quickly, restoring is easy to verify.
