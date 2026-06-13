---
title: Hints System Design
tags: hints, uhs, design, auto-mapper, location
created: 2026-06-12
updated: 2026-06-13
aliases: hints, uhs-hints, hint-panel, hint-philosophy, generate-hints
---

# Hints System Design

UHS-style progressive hint panel added in v1.5.538. Key non-obvious decisions below.

## App-observed location vocabulary (the core insight)

Hint `locations` arrays must only contain room names the app's own auto-mapper has seen — not room names from a walkthrough or the game source. This is the fix for the failure documented in `reference/ai-hints-system.md`: earlier AI-based hints tried to infer location from raw text, which broke on disambiguation text, status-line names, and abbreviation variants. By keying off the same `locationName` strings the auto-mapper records (which come from the exact same game output parsing), location matching is always exact.

Practical consequence: when writing a hints JSON, populate `locations` by observing the room names that appear in the `iftalk_map_*` localStorage key's journey, not by reading a walkthrough.

## `getLastLocationName()` — NOT `getMapData().journey`

`findCurrentTopics` uses `getLastLocationName()` (module import from `auto-mapper.js`) as the primary match source, with `getMapData().journey` (last 10 entries) as a fallback. Reason: opening the Map canvas calls `clearJourney()`, which wipes the journey buffer. `getLastLocationName()` is cached separately in the auto-mapper module and survives `clearJourney()`. If we used only the journey, the 📍 badge would vanish whenever the player opened the map.

**Critical:** `window.getLastLocationName` does NOT exist. It's module-scoped. Access via `import('/js/features/auto-mapper.js').then(m => m.getLastLocationName())`.

## `verified: true` controls badge/expand behaviour

Only sections with `verified: true` are eligible for the 📍 badge and auto-expand. Unverified sections render with an "unverified" tag and are never auto-expanded. This prevents auto-expanding spoiler-heavy later-game sections based on location guesses from an AI that hasn't actually played through.

Theatre's Act I is the only `verified: true` section — its room names were confirmed by live playthrough.

## Reveal state is local-only

`iftalk_hints_<game>` in localStorage — not included in Drive sync. The Drive sync whitelist in `gdrive-sync.js` covers only save-type keys. Hints reveal state is ephemeral progress, not save data; intentional.

## Lazy-load + race condition (fixed)

The hints module (`hints-panel.js`) is lazily imported on first click of `#hintsBtn`. `initHintsPanel()` starts an async fetch for the hints JSON, then `showHints()` runs immediately — before the fetch resolves. Fix: the `loadHints` callback in `initHintsPanel` calls `renderHintsContent()` if `_isVisible` is true (same pattern as `handleGameLoaded`). Without this, the first open always shows "No hints available."

Also: `app.js` must call `toggleHints()` (not `showHints()`) so the menu item acts as a toggle when the panel is already open.

## Hint-authoring philosophy — lives in the versioned skill

The *content* rules for writing hints (distinct from the runtime system above) live in `.claude/skills/generate-hints/SKILL.md`, which is **source-controlled** — `.gitignore` ignores `.claude/*` but has a `!.claude/skills/` exception. That file is the single source of truth; don't duplicate it here. Read it before authoring or editing any hint.

The governing idea (v1.5.553, the "stance"): **a hint changes the player's *option space*, not their *answer*.** It widens (opens an approach they hadn't considered) or narrows (rules out a wrong one) — never names the move. Be perfectly clear about the *framing* (wrong-theory / property / area), silent about the *instance and the command*. Only the final "Answer:" rung uses literal parser commands; every rung above it is prose. **The category trap** (v1.5.554): naming a one-member solution-category ("something sticky" = the glue) is the answer in disguise — nudge at the *problem* (the floor) not the *solution-shape*. This philosophy is a deliberate corrective to a model's natural pull toward clear/complete explanation, which produces walkthroughs.

## Question `id` stability (reveal state is keyed by it)

Reveal state in `iftalk_hints_<game>` is keyed by question `id`. **Never change an `id` on regeneration** — it silently resets that question's reveals for every user. The `q` *text* can be reworded freely (and a section can be moved between sections) as long as the `id` is preserved. Section `id`s are likewise stable; only titles/wording are safe to change.
