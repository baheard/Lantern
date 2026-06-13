---
title: Hints System Design
tags: hints, uhs, design, auto-mapper, location
created: 2026-06-12
updated: 2026-06-13
aliases: hints, uhs-hints, hint-panel, hint-philosophy, generate-hints, invisiclues
---

# Hints System Design

UHS-style progressive hint panel added in v1.5.538. Key non-obvious decisions below.

## App-observed location vocabulary (the core insight)

Hint `locations` arrays must only contain room names the app's own auto-mapper has seen — not room names from a walkthrough or the game source. This is the fix for the failure documented in `reference/ai-hints-system.md`: earlier AI-based hints tried to infer location from raw text, which broke on disambiguation text, status-line names, and abbreviation variants. By keying off the same `locationName` strings the auto-mapper records (which come from the exact same game output parsing), location matching is always exact.

Practical consequence: when writing a hints JSON, populate `locations` by observing the room names that appear in the `iftalk_map_*` localStorage key's journey, not by reading a walkthrough.

## `getLastLocationName()` — NOT `getMapData().journey`

`findCurrentTopics` uses `getLastLocationName()` (module import from `auto-mapper.js`) as the match source. Reason: opening the Map canvas calls `clearJourney()`, which wipes the journey buffer. `getLastLocationName()` is cached separately in the auto-mapper module and survives `clearJourney()`. If we used only the journey, the 📍 badge would vanish whenever the player opened the map.

**Discrepancy found 2026-06-13:** the function's doc comment claims it "falls back to the last ~10 journey entries for recency," but the code does **not** — it does `const lastName = getLastLocationName(); if (!lastName) return {empty};`. There is no journey fallback. In practice `getLastLocationName()` is reliably populated (even after RESTORE, from the last journey entry), so the early-return rarely bites — but the comment is misleading and a real journey-fallback was never wired up. If badge-matching ever fails right after a state restore, this is the suspect.

**Critical:** `window.getLastLocationName` does NOT exist. It's module-scoped. Access via `import('/js/features/auto-mapper.js').then(m => m.getLastLocationName())`.

## `verified: true` controls badge/expand behaviour

Only sections with `verified: true` are eligible for the 📍 badge and auto-expand. Unverified sections render with an "unverified" tag and are never auto-expanded. This prevents auto-expanding spoiler-heavy later-game sections based on location guesses from an AI that hasn't actually played through.

As of 2026-06-13, Theatre has 7 of 8 sections `verified: true` (all but The Endgame). Only Witch's Lair in the Endgame is confirmed; the four rooms past the pearl-socket puzzle (Old Hallway, Ceremony Room, Smoky Hall, Wine Cellar) couldn't be reached because the walkthrough redacts the socket directions and placement is randomized per game.

### Walkthrough names ≠ the game's `location.name` (verify, don't trust the walkthrough)

The whole reason `verified: false` exists: walkthrough parenthetical room names are the *author's* labels and routinely differ from what the game actually prints. Confirmed drift in Theatre (all silently broke the 📍 badge): "Narrow Hall"→**Narrow Hallway**, "Storage Cupboards"→**Pit Cupboards**, "Backstage"→**Back Stage** (two words), "Center of Sewer"→**Centre** (British spelling), "Deep In Mines"→**Deep in the Mines**, "Above Pit"→**Above the Pit**, "Under The Stage"→**Under the Stage** (lowercase "the"). Plus whole transit rooms the walkthrough glosses as bare directions never appeared in any section: the Long Corridor spine (Tight Stairway, Centre/South/North End of Long Corridor), Eastern Landing, Eastern Stairway, Sealed-Off Office, Southern End of the Library, Wall with Large Hole, Up the Ropes, Dark Place, Metal Platform, Sealed Up Ticket Booth. Lesson: a `verified:false` section's `locations` is a guess until a live playthrough replaces it.

### Bulk name-harvest technique (the fast way to do Step 3)

Don't manually walk room by room. Replay the walkthrough programmatically and harvest in one pass:
1. Connect to the live browser, `import('/js/game/game-loader.js')`, get `sendCommandToGame`.
2. RESTART the game (`sendCommandToGame('restart')` then `sendCommandToGame('yes')`).
3. Run a self-driving async loop on `window` that sends each walkthrough command with a ~260ms delay and pushes `{cmd, room: getLastLocationName()}` to a `window.__trace` array. (`execute_console` does NOT await long promises — kick the loop off fire-and-forget, store results on `window`, and poll `window.__trace.length` / `window.__driveDone` between calls.)
4. **Never open the in-app map mid-run** — `clearJourney()` wipes everything.
5. `[...new Set(trace.map(t=>t.room))]` is the authoritative room list. Map each to its section.

Gotchas: the auto-mapper occasionally captures a cutscene text line as a "room" (e.g. "He who defiles the tombs of", "Don't rejoice in his defeat") — filter these out. A verbatim walkthrough replay works for everything except puzzles the walkthrough itself redacts (randomized pearl sockets), so endgame-past-the-gate stays unverified.

## Reveal state is local-only

`iftalk_hints_<game>` in localStorage — not included in Drive sync. The Drive sync whitelist in `gdrive-sync.js` covers only save-type keys. Hints reveal state is ephemeral progress, not save data; intentional.

## Lazy-load + race condition (fixed)

The hints module (`hints-panel.js`) is lazily imported on first click of `#hintsBtn`. `initHintsPanel()` starts an async fetch for the hints JSON, then `showHints()` runs immediately — before the fetch resolves. Fix: the `loadHints` callback in `initHintsPanel` calls `renderHintsContent()` if `_isVisible` is true (same pattern as `handleGameLoaded`). Without this, the first open always shows "No hints available."

Also: `app.js` must call `toggleHints()` (not `showHints()`) so the menu item acts as a toggle when the panel is already open.

## Hint-authoring philosophy — lives in the versioned skill

The *content* rules for writing hints (distinct from the runtime system above) live in `.claude/skills/generate-hints/SKILL.md`, which is **source-controlled** — `.gitignore` ignores `.claude/*` but has a `!.claude/skills/` exception. That file is the single source of truth; don't duplicate it here. Read it before authoring or editing any hint.

The governing idea (v1.5.553, the "stance"): **a hint changes the player's *option space*, not their *answer*.** It widens (opens an approach they hadn't considered) or narrows (rules out a wrong one) — never names the move. Be perfectly clear about the *framing* (wrong-theory / property / area), silent about the *instance and the command*. Only the final "Answer:" rung uses literal parser commands; every rung above it is prose. **The category trap** (v1.5.554): naming a one-member solution-category ("something sticky" = the glue) is the answer in disguise — nudge at the *problem* (the floor) not the *solution-shape*. This philosophy is a deliberate corrective to a model's natural pull toward clear/complete explanation, which produces walkthroughs.

## Invisiclues research — question phrasing principles (2026-06-13)

Researched from Wikipedia/InvisiClues, IFWiki Hint system, intfiction.org threads, and the dfabulich Infocom hints archive. Key findings for question phrasing:

### The "spoil forward" failure mode

A hint question spoils forward when its text — before the player reveals any answer rung — teaches them something they haven't discovered yet. Example: "How do I unlock the brass door?" followed by "The key is behind the secret door in the library" reveals the library's existence. The question itself is the spoiler.

Infocom noted this in booklet prefaces, warning players not to use the *presence or absence* of a question as an indication of importance.

### Infocom's observed question-phrasing patterns

From the dfabulich Infocom hints archive (https://dfabulich.github.io/infocom-hints-html/index.html):

1. **Voice the obstacle as player experience** — describe what the player has *observed*, not what lies ahead:
   - "Why am I having trouble picking things up?"
   - "Why won't the poodle let me near the cottage?"
   - "The movie theater is closed! How do I get inside?"

2. **"What do I do with X?" for found objects** — presupposes only that the player has the object:
   - "What do I do with the seahorse?"
   - "Are the leaves useful for anything?"

3. **"How do I get past X?" where X is a visible blocker** — safe because the player has already encountered it.

4. **"When X happens, what do I do?"** — the "when" construction confirms the event has already happened.

### The dummy-question technique

Infocom deliberately included impossible-premise questions ("Where do I find a machete?" — answer: there is no machete) to prevent the question list's *shape* from revealing the puzzle space. A player reading through can't infer "there must be an alligator" from the absence of alligator questions. Consider this for any hint set where the question list itself is browsable.

> "To prevent players from finding out too much about the plot just by perusing the questions, Invisiclues frequently included humorous fake spoilers." — Wikipedia/InvisiClues

### The one-sentence test

A well-authored question should be **readable by a player stuck on exactly that puzzle and no one else** — they immediately recognise their situation, but a player who hasn't reached that puzzle learns nothing (or is misdirected). Show the question to someone stuck on the puzzle: does it describe their current experience? Show it to someone who hasn't reached it: does it teach them anything? Yes/No respectively = good question.

### Every noun is a potential spoiler

Every location, object, NPC, or mechanism named in the question must already be known to the player. Ask: "Could a player who hasn't found X yet read this question and learn X exists?" If yes, reframe from the player's observable obstacle instead.

### Gate by player state > good phrasing

IFWiki notes: "The list-of-questions method may also be context sensitive, presenting only questions and hints which are relevant to the current situation; this helps avoid the possibility of premature spoilers." State-gating is the strongest protection; good phrasing is a fallback for ungated question lists.

Sources: https://en.wikipedia.org/wiki/InvisiClues · https://www.ifwiki.org/Hint_system · https://intfiction.org/t/making-invisiclues/64615 · https://intfiction.org/t/hint-systems-good-and-bad/59082

## Question `id` stability (reveal state is keyed by it)

Reveal state in `iftalk_hints_<game>` is keyed by question `id`. **Never change an `id` on regeneration** — it silently resets that question's reveals for every user. The `q` *text* can be reworded freely (and a section can be moved between sections) as long as the `id` is preserved. Section `id`s are likewise stable; only titles/wording are safe to change.
