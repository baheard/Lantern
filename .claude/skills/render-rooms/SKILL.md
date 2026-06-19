---
name: render-rooms
description: Batch-render the location art for a Lantern game (or a named subset of rooms) — the same thing as clicking "Generate" on a series of rooms in artview. By this phase the prompts are already built (App/Artist/Aesthetic/Scene-override all composed), so there is nothing to decide — it just composes and calls the image model. Triggered when the user says "/render-rooms <game>", "render all images for <game>", "generate the art for <game>", "render <room> [and <room>]", or "render the missing rooms". Phase 3 of the art pipeline (after generate-location-prompts → mold).
---

# render-rooms skill

**Phase 3 — make the pictures.** By now `generate-location-prompts` (facts) and `mold` (scene
overrides) have done all the thinking; every room's prompt is composed and ready. This skill just
**batch-runs the renderer** — identical to clicking artview's **Generate** on those rooms (both use
the same compose path: App ▸ Artist ▸ Aesthetic ▸ Scene-override from the same files).

```
generate-location-prompts → mold → [render-rooms]
                                     images into _review/
```

## Procedure

1. Resolve `<game>`. Confirm `docs/games/images/<game>/prompts.json` exists (run the upstream
   skills first if not).
2. Decide the **subset**:
   - all rooms: `node tools/gen-room-images.cjs <game>`
   - a named subset (comma-separated slugs): `node tools/gen-room-images.cjs <game> --only a,b,c`
   - The renderer **skips rooms that already have a `_review/<slug>.png`** unless `--force`/`--regen`,
     so "render the missing ones" is just the plain all-rooms call.
3. Pick the provider (cost — see `.tome/art-generation-providers.md`):
   - default/cheap prototyping: `--provider openai --quality low` (~$0.006/img) — the art default.
   - finals: `--provider gemini` (Nano Banana, native 3:4) or `--quality high` (OpenAI, ~$0.21).
   - Confirm before a large/expensive batch (count × rate); for finals on a whole game, say the
     estimated cost and get the go-ahead.
4. Re-roll an existing take instead of skipping: add `--regen` (keeps the prior as `<slug>.prev.png`
   for A/B). One-off nudge without editing the scene: `--steer "..."` (if a fix should stick, send
   it back to `mold`, not here).
5. Report ok/skip/fail counts and point the user at artview (`/artview <game>`) to review/promote.

## Notes
- Renders land in `_review/` (staging); promoting the winners into the game is `location-art`'s
  Promote action (or the reviewer's Promote button). This skill only generates.
- Dev-only output — do NOT bump the app version.
- If a room looks wrong, the fix belongs upstream: scene/geometry → `mold`; palette/mood →
  Aesthetic; medium/edges → Artist. Re-render after. Don't hand-tweak prompts here.
