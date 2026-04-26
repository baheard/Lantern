---
title: Home Screen & App Quirks
tags: [ui, gotchas]
created: 2026-04-26
updated: 2026-04-26
aliases: [welcome screen, game selection, F5]
---

# Home Screen & App Quirks

## Game selection screen
- URL: `http://localhost:<port>/` — port comes from `config.json` (`config.port`, default `3000` if missing). Currently configured at `3002`.
- Games are grouped: "Your First Adventure", "Ready for More", "IF Masterpieces", "Classics & Other Favorites".
- A bullet (•) next to a game title means an autosave exists for that game.
- Clicking a game with a save shows a dialog: **Resume Game** (loads autosave) vs **Start Over** (clears state).
- Settings: ⚙ gear icon (top-right) on the home screen — `#welcomeSettingsBtn` — opens the same panel as in-game.

## Surprising quirks

**F5 reloads the page; it doesn't quick-save.** With the service worker active for offline support, F5 is a browser reload that hits SW cache, not a hotkey. People coming from desktop IF interpreters expect F5 = quicksave — wrong here. Use `#quickSaveBtn` or its keyboard binding.

**Resume Game restores autosave, not quicksave.** See `save-system.md` — they're independent save slots and the home-screen dialog only knows about autosave.

**Port is configurable.** `server/index.js` reads `config.port` from `config.json` (falls back to `3000` if the field is missing). Currently set to `3002`. Don't hardcode the port in tools or scripts — read it from `config.json`. Some old docs still say `3000`; trust `config.json`.
