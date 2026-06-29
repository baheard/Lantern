---
title: Title Images — a topic that reuses the location detail machinery
tags: [artview, review-server, title-images, location-art, reuse, manifest]
created: 2026-06-28
updated: 2026-06-29
aliases: [app hero, mobile hero, manifest.title, title art]
---

# Title Images (artview)

A top-level **"Title Images"** rail topic in artview. Items = one title slot per game
(its cover) + two app-level heroes (**App Hero** = welcome banner, 16:9; **Mobile Hero** =
PWA splash, 9:16).

## Two distinct flows (redesigned 2026-06-29)

The original design rode the full `detailLocation` UI for every slot (generate a dedicated
title with the game's artist). That was scrapped: a game's cover is better chosen FROM its
finished room art than generated separately. So title slots now split into two renderers in
`client.js`, dispatched by `detailTitle(id)` on `t.game`:

- **Game title → pick-an-existing-image (`renderGameTitle`).** View-only: shows the current
  `manifest.title` (or "No title set") + **Unselect title** + a "Pick from <game> locations ▸"
  jump. The actual choice happens on the **location detail page** via a **★ Set as title**
  button (next to Promote/Delete) → `POST /api/set-title {game, candidate}` → `setGameTitle()`
  copies the selected image to `<game>/title.png` and records **`manifest.title`** (the field
  the home game-card eye reads — see [[location-art-system]] / `getTitleImageUrl`). No title
  generation, no per-title artist.
- **App hero → mini-generator (`renderHeroSlot`).** "A prompt and an artist, nothing more":
  a candidate strip, an **artist dropdown** (`#heroArtist` → `setTitleArtist` → per-slot
  override in `_app/app.json` `titleArtists[id]`), a **Prompt** textarea (stored in
  `_app/style.json` `scenes[heroSlug]` via the normal `/api/scene`), a Composed box, and
  Generate. `composeHero()` sends ONLY `artist.style + ARTIST_LEAD + "Scene: "+prompt` — no
  App/Aesthetic layers. Generate posts `/api/regen {game:'_app', slug:heroId, aspect}`;
  **Set as hero** posts `/api/promote {game:'_app', slug:heroId, candidate}` → `promote()`'s
  `TITLE_HEROES` branch writes `_app/app.json` `heroes[heroKey]`. `_app` is still a
  *pseudo-game* (`gamePaths('_app')` → `_app/_review`), so candidate/img/regen routes work via
  the normal per-game plumbing.

`pollGens` has a `topic==='titles'` branch so a finished hero render reloads the slot
(hero gen jobs are `kind:'regen'` with `game==='_app'`, which the game-refresh branch would
otherwise drop since `titles` isn't `isGame`).

## Title-artist resolution (`titleArtistFor`)

`app.json titleArtists[id]` override → else (game title) the game's `selected-artist.json` →
else (hero) `arts[0]`. Only heroes actually expose the dropdown now, but the resolver still
serves both via `/api/title` (`artist` + `artists[]`).

## Open follow-ups

- Heroes promote to `_app/`, NOT the real welcome assets `docs/images/lantern-hero.png` /
  `lantern-hero-mobile.jpg` (what the app/SW serve). Wiring promote to copy there (or pointing
  the app at `_app/`) is still open.
- Item-list marks are always `·` for title slots (committed state isn't computed per slot) —
  cosmetic only.
- No actual title/hero image has been rendered yet (generate path smoke-tested; not spent on a
  render).
