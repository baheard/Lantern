---
title: App Icons & Favicon Pipeline
tags: [icons, favicon, pwa, branding, tooling, gotcha]
created: 2026-06-19
updated: 2026-06-19
aliases: [favicon, app icon, pwa icon, gen-icons, lantern glyph, home screen icon]
---

# App Icons & Favicon Pipeline

## The split: favicon ≠ app icon (intentional)

Two different marks ship, on purpose:

- **Favicon (browser tab):** the "glow" concept — a lantern silhouette on an amber disc.
  - `docs/favicon.svg` (primary, modern browsers) + `docs/favicon.png` (48px fallback).
  - Source art: `docs/assets/glyphs/lantern-circle-glow.svg`.
  - `index.html` links SVG first, PNG second: `<link rel="icon" type="image/svg+xml" href="favicon.svg">` then the PNG.
- **PWA app icons (home screen / launcher / splash):** the placeholder **hurricane lantern** (`lantern-a`),
  white strokes on a black rounded square. `docs/icons/icon-{72,96,128,144,152,192,512}.png`, declared in `manifest.json`.
  `apple-touch-icon` = `icons/icon-192.png`.

**Why split:** the glow looks good tiny (favicon) but goes mushy at large/home-screen sizes;
the line-art lantern reads better large but the thin chrome blurs at 16px. So each context gets the
mark that survives at its size. The two don't need to match.

## Regenerating icons — the clean way

`node tools/gen-icons.cjs` rasterizes every PNG (all `icons/*` + `favicon.png`) from inline SVGs via **sharp**.
Edit the SVG markup in that script and re-run. One command, deterministic, bit-clean.

## Gotcha: don't rasterize through the headless browser by hand

The tempting-but-wrong path: render the SVG to a canvas in the headless browser, read
`canvas.toDataURL()` base64 out via `execute_console`, and paste it into files. **This fails** —
the base64 blobs are 5–30KB and transcribing them by hand corrupts them (silent garbage / hallucinated
filler). If you must validate a PNG, decode and check the IHDR width/height
(`buf.readUInt32BE(16)`/`(20)`) rather than trusting the bytes. Just use sharp.

## sharp is a dev-only dep

Installed with `npm install --no-save sharp`, so it's in `node_modules` but **not** in `package.json` —
a clean `npm install` won't have it. If `gen-icons.cjs` is meant to be reproducible, promote sharp to a
`devDependency`. (As of this writing it's unsaved by choice.)

## Reverting to the old `>L` mark

Backups of the previous favicon/icon set are kept at `docs/favicon-prev-promptL.png` and
`docs/icons-prev-promptL/`. Delete once the new branding is settled.
