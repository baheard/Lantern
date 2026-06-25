---
name: render-rooms
description: Make and commit the location art for a Lantern game. Batch-renders rooms (or a named subset) — the same as clicking "Generate" in artview, since by this phase the prompts are already built — and PROMOTES chosen candidates into the committed game image (the app's lookup). Triggered when the user says "/render-rooms <game>", "render all images for <game>", "generate the art for <game>", "render <room> [and <room>]", "render the missing rooms", "promote <room> for <game>", or "commit the art for <game>". Phase 3 of the art pipeline (after generate-room-facts → mold).
---

# render-rooms skill

**Phase 3 — make the pictures.** By now `generate-room-facts` (facts) and `mold` (scene
overrides) have done all the thinking; every room's prompt is composed and ready. This skill just
**batch-runs the renderer** — identical to clicking artview's **Generate** on those rooms (both use
the same compose path: App ▸ Artist ▸ Aesthetic ▸ Scene-override from the same files).

```
generate-room-facts → mold → [render-rooms]
                                     images into _review/
```

## Procedure

1. Resolve `<game>`. Confirm `docs/games/images/<game>/room-facts.json` exists (run the upstream
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

## Action: Promote (commit a render as the game's image)

Rendering lands candidates in `_review/`. **Promote** is what makes a candidate *the* image the
app shows for a room: it copies the chosen file to the committed `<game>/<slug>.png` and updates
`manifest.json` (keyed by the exact `locationName`, the app's lookup key). Usually you eyeball
candidates in artview first, then promote the winners.

- Whole rooms / a subset: `node tools/promote-room-images.cjs <game> <slug> [<slug>...]`
- Reject (drop a candidate from staging): `node tools/promote-room-images.cjs <game> --reject <slug>...`
- Or use the reviewer's **Promote** button per image (`/api/promote`), which does the same copy +
  manifest update.

Promote only commits an existing `_review/` candidate — it never generates. If a room has no
candidate yet, render it first (above).

## Notes
- This skill owns the committed room **images**: generate candidates into `_review/`, then promote
  the winners. (Promote moved here from the retired `location-art` skill.)
- If a room looks wrong, the fix belongs upstream: scene/geometry → `mold`; palette/mood →
  Aesthetic; medium/edges → Artist. Re-render, then re-promote.
- Dev-only output — do NOT bump the app version.
- If a room looks wrong, the fix belongs upstream: scene/geometry → `mold`; palette/mood →
  Aesthetic; medium/edges → Artist. Re-render after. Don't hand-tweak prompts here.
