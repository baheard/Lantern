---
title: Voice Hint Navigation (eyes-free hint steering)
tags: [hints, voice, accessibility, design, uhs]
created: 2026-06-24
updated: 2026-06-24
aliases: [get hint voice, voice hint system, hint voice commands]
---

# Voice Hint Navigation

**Status:** DESIGN ONLY (brainstorm 2026-06-24) — not yet built.

Goal: make the existing hint system (see [[hints-system-design]]) fully usable
**eyes-free by voice**. The voice layer does NOT invent hints or scoring — it
narrates and steers the hint engine that already exists. Hints already:
- carry a **location** and **unlock when the player reaches that location**,
- are organized as a **header + a UHS-style ladder of rungs** (gentle → spoiler),
- track how far down each ladder the player has revealed.

There is already a Hint **button**; voice adds a reserved command path that the
voice layer intercepts BEFORE the Z-machine parser (so "hint" never reaches the game).

## Design principle: location is the implicit target
A stuck eyes-free player can't scan a puzzle menu. Use **current location** as the
implicit selector — the room you're standing in is almost always the room you're
stuck in. No proximity/spatial scoring; "unlocked + tied to current location" is
enough. ("what else" widens to all unlocked, see below.)

## The two levels (this resolves the "which more?" ambiguity)
"more" was overloaded. Split into **wider** (more puzzles) vs **deeper** (more rungs):

- **list level** — hearing the headers of the room's hints.
- **puzzle level** — drilled into one hint, climbing its ladder.

`give hint` always returns you to the **list** (front door, no guessing).
`next hint` goes **deeper** on the active puzzle.

## Canonical flow
1. **"give hint" / "get hint"** in a room with hints:
   - **Single unlocked hint** → act as if selected: read its **latest revealed
     rung**, or reveal **rung 1** if none revealed yet. (Don't make them say a number.)
   - **Multiple unlocked hints** → read the **header of each, numbered**
     (*"Two hints here. One: the locked door. Two: the brass machine."*) and
     **require a number** — never guess which one.
2. **"hint for N" / "N"** → enter hint N; read its **latest revealed rung**, or
   reveal **rung 1** if none revealed.
3. **"next hint"** (while in a hint) → reveal + read the **next rung**. Bottom of
   ladder → *"That's the last hint for this one."*
4. **"more hints" / "what else"** → widen scope to **all unlocked hints anywhere**
   you've been (numbered list again), for the case where the answer lives elsewhere.
5. **"stop"** → exit.
6. **Empty room** → *"No hints unlocked here. Say 'what else' for hints from places
   you've been."*

## Spoken vocabulary (final)
`give hint` / `get hint` · `hint for N` (or bare number) · `next hint` · `more hints`
/ `what else` · `repeat` (re-read last rung, no advance) · `cancel` / `stop`. All backed
by behavior the hint engine already has.

## Listening context is TRANSIENT, not captive (important)
The hint flow is **app-mode context listening** but must NOT trap the player (the dead-end
we avoid everywhere for eyes-free use). After reading a rung it listens briefly:
- utterance **matches a hint verb / bare number** → handled in hint context;
- **`cancel` / `stop`** → explicit exit;
- **anything else** → **exit hint context and pass the utterance to the game as a normal
  parsed command.** Speaking a real command ("examine telescope") IS the exit — no magic
  word required, no "I didn't get that."

Bare-number scope: a lone numeral is a hint action **only while hint context is live**.
Once you've fallen through to the game, "two" goes to the parser like any other input.

## Switching to a different hint mid-hint
While drilled into one hint, **`give hint` pops back to the front-door list** so the player
can pick a different one (single-hint room → nothing to switch to, stays put). This is why
`give hint` (= list / front door) and `next hint` (= deeper) are deliberately different verbs.

## Cap & truncation rule
List ≤ 3 headers at a time (numbered). If a room has more unlocked than shown, the
prompt MUST announce the overflow and offer "what else" — never silently drop hints
(an eyes-free player will assume the system is broken if a hint they know exists
isn't read).

## Open / deferred
- First-run spoken help so a new voice user discovers the verbs (a one-time preamble
  gated by a `seen` flag).
