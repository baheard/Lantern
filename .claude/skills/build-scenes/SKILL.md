---
name: build-scenes
description: One "do that" call that builds a Lantern game's scene prompts end-to-end — runs generate-location-prompts (scrape + probe the facts) THEN mold (author the considered Scene overrides into style.json) — so artview opens fully render-ready. Triggered when the user says "/build-scenes <game>", "build the scene prompts for <game>", "do facts and mold for <game>", or "get <game> ready to render". Wrapper over generate-location-prompts (phase 1) + mold author (phase 2); does NOT render images (that's render-rooms, phase 3).
---

# build-scenes skill

A convenience wrapper that runs the two text-building phases back-to-back so the user can say
"build the scenes for `<game>`" once and get a fully-populated, render-ready set of Scene overrides.

```
[build-scenes] = generate-location-prompts (facts) → mold author (molded overrides)
                                                       …then render-rooms when ready (phase 3)
```

## Procedure

1. Resolve `<game>`.
2. **Phase 1 — facts.** Invoke the `generate-location-prompts` skill (it gates on the
   `generate-hints` prerequisite and replays the walkthrough to scrape + `examine`-enrich
   `prompts.json`). Let it complete.
3. **Phase 2 — mold.** Invoke the `mold` skill in **author** mode for the same game (molds each
   room's facts into a finished `style.json` Scene override, per the molding checklist). Let it
   complete.
4. Report: pack room count + how many overrides were written, note any rooms that needed a
   live-probe or an exit reconciliation, and tell the user the next step is `/render-rooms <game>`
   (or open `/artview <game>` to eyeball the molded prompts first).

## Notes
- Each sub-skill stays independently invocable — re-run `generate-location-prompts` alone after a
  walkthrough change, or `mold <game>` / `mold <game> review` alone without re-scraping.
- This wrapper builds TEXT only. Rendering images is `render-rooms` (phase 3), kept separate on
  purpose: building prompts and spending money on pictures are different decisions.
- Dev-only data changes — do NOT bump the app version.
