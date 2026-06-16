---
title: location-art-system
tags: [location-art, images, map-canvas, settings, ui, gemini]
created: 2026-06-15
updated: 2026-06-15
aliases: [location images, room art, location thumbnail]
---

# Location Art system

Per-location generated images (Nano Banana / Gemini 2.5 Flash Image). Generation
pipeline lives in `tools/gen-room-*.cjs` + `promote-room-images.cjs`; the runtime
display side is what this note covers.

## Data shape
- Images committed under `docs/games/images/<game>/` with a `manifest.json`
  **keyed by the exact `locationName` the auto-mapper records** (so the app needs
  no slug logic). `manifest.images[locationName] = "<file>.png"`.
- `<game>` is the filename stem, lowercased — resolved from
  `localStorage('lantern_last_game')` (NOT `state.currentGameName`, which can be
  null at the moment the map sheet opens).

## Runtime modules (added v1.5.584)
- `docs/js/features/location-art.js` — single source of truth for lookups:
  `loadLocationManifest()` (per-game cache, 404→null), `currentGameName()`,
  `isLocationArtEnabled()`, `getLocationImageUrl(name)` (returns null when art is
  off OR no image), plus the **content-area thumbnail** (`#locationArtThumb` in
  `#gameHeader`) driven by the `locationChanged` window event from the auto-mapper.
- `docs/js/features/art-overlay.js` — the shared full-screen lightbox
  (`#nodeArtOverlay`). Built lazily by `ensureArtOverlay()` so it exists even if
  the map subsystem was never opened. `openArtOverlay(src, caption)` is the single
  entry point; both the map node sheet and the content thumbnail call it.
- `map-sheet.js` imports both — it no longer owns the manifest loader or the
  overlay (those were duplicated/local before the v1.5.584 refactor).

## The enable setting — ON by default, opt-out
One key, `locationArt`, resolved through the existing `game-settings.js` hierarchy:
per-game override → app default (`lantern_app_defaults`) → hardcoded `true`.
Gate is `!== false` (not `=== true`) so an unset value stays ON.
- **Welcome screen** toggle `locationArtByDefaultToggle` writes the app default
  (`setAppDefault('locationArt', …)`). Default ON → art shows for all games unless
  the user turns it off globally or per game.
- **In-game** toggle `locationArtToggle` (`game-section-item`) writes the per-game
  value. Its checkbox is synced on panel open in `updateSettingsContext()` (not at
  init) because it depends on the current game.
- The gate applies to BOTH surfaces: the node-sheet image and the content
  thumbnail go through `getLocationImageUrl()`, which returns null when disabled.
- Toggling in-game calls `refreshLocationArt()` to re-evaluate the thumbnail live.

## Side panel + placeholder + collapse (added v1.5.59x)
- Wide screens (`@media min-width:1000px`) get a persistent **side panel** (`aside#locationArtPanel`,
  sibling of `#gameOutput`) showing the current room's art, with a **caption** (location
  name, quiet `--text-secondary`, left-aligned, no box) on a footer row below the image.
- When a game HAS art but the current room doesn't, a faint **lantern glyph placeholder**
  fills the reserved column instead of an empty box. Glyphs live in `docs/assets/glyphs/`
  (`*.svg` + `selected.json` naming the app-wide choice); the review tool's "Placeholders"
  topic picks one. App loads the chosen SVG inline so `currentColor` tints it.
- **Collapse:** `#locationArtCollapse` (in-panel `›`, caption row) hides the panel; a
  separate edge tab re-opens it. Column reservation is `.art-has-art` on `.container`,
  minus `.art-panel-collapsed`; both toggled in JS, persisted in `lantern_art_panel_collapsed`.
  Panel animates via `flex-basis`/`max-width`/`transform`, not `display`.

## Gotchas
- **ID collision trap:** the in-game settings checkbox uses `id="locationArtToggle"`.
  Do NOT reuse `locationArt*` IDs for elements `location-art.js` creates dynamically —
  its create-guards are `if (!getElementById(id))`, so a collision silently skips
  creation. The reopen edge tab had this exact bug (v1.5.598) and was renamed
  `#locationArtReopen` (v1.5.599). Reserved settings IDs: `locationArtToggle`,
  `locationArtByDefaultToggle`.
- The panel image is **display-only** (not clickable); only the header status-icon
  thumbnail opens the lightbox (hover/press-and-hold). Lightbox caption sits OUTSIDE
  the image, above it, in a pill; panel caption is plain text below the image.
- The content thumbnail is a **`.location-art-bar`** (thumb + location-name label)
  appended as its OWN row at the bottom of the sticky `.game-header`, in normal
  flow AFTER the status bar + upper window. Earlier (v1.5.584) it was absolute
  top-right and overlapped the status bar. In-flow placement is layout-independent:
  the status line is VM-owned and varies (Bronze's compass is a multi-row upper
  window), so there's no stable slot to tuck an icon *into* — put it below instead.
  The name label comes from the `locationChanged` event, not the VM status text.
  The bar hides itself (`.hidden`) when art is off or the room has no image.
- Overlay caption (`.node-art-caption`) is top-left, styled like a location title.
- New modules must be added to the SW precache list in `service-worker.js` for
  offline use (done v1.5.584).
- See also [[automap-two-build-paths]] (where `locationChanged` originates) and
  [[map-undo-snapshots]].
