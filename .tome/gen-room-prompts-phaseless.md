---
title: gen-room-prompts phase-less games + phantom location names
tags: [location-art, prompts, tooling, gotcha, theatre]
created: 2026-06-18
updated: 2026-06-22
aliases: [gen-room-prompts bug, prompts.json 0 rooms, exit tracking bug]
---

# gen-room-prompts.cjs: phase-less games and phantom locations

Two gotchas surfaced building the **Theatre** prompt pack (the first phase-LESS game to get
location art; Anchorhead and Dreamhold both emit a `phase:` status segment).

## 1. The `[@ … | phase: …]` header regex silently dropped phase-less games

`gen-room-prompts.cjs` parses the `play.cjs --status` transcript by matching a per-turn
header. The original regex **required** the phase segment:

```js
/^\[@ (.+?)\s+\|\s+phase:.*\]$/   // matches "[@ Room  |  phase: x]" ONLY
```

A phase-less game (Theatre) prints `[@ Theatre Lobby]` with no `| phase:` part, so **zero
turns parsed → "Wrote 0 room prompts"** with no error. Fixed by making the segment optional:

```js
/^\[@ (.+?)(?:\s+\|\s+phase:.*)?\]$/
```

Lesson: any consumer of the `--status` header must treat the `| phase:` tail as optional —
only games that reuse geography across acts carry it (see [[hints-system-design]]).

## 2. Status-line flavor leaks in as phantom "locations"

Theatre flashes a two-line Latin curse in the status/location region when you enter the
**Boiler Room**. `getCurrentLocation()` reports those lines verbatim, so the pack gained two
junk rooms with no scene: *"He who defiles the tombs of"* / *"Don't rejoice in his defeat"*.
This is the same `getCurrentLocation()` the auto-mapper uses, so the live map would briefly
node them too — an app-level quirk, not introduced by the builder. For the prompt pack they're
harmless empty-scene entries; drop them (or filter empty-scene rooms) before generating images.

Pipeline ordering and the prerequisite gate live in the `generate-location-prompts` skill.

## 3. Exit tracking was off-by-one: attributed arrival direction to wrong location

`--status` mode re-echoes the movement command as the **first body line of the destination
turn**, not the source turn. The original exit-recording code read:

```js
// WRONG: t.command is the arrival command; next.location is where we go AFTER settling here.
if (next && next.location !== t.location && MOVES.has(cmd)) {
  L.exits.set(DIR_LABEL[cmd], next.location);  // attributes cmd to t.location → wrong room
}
```

Concretely, going `nw` from Theatre Lobby → Manager's Office produced a `[@ Manager's
Office]` turn with `t.command = "nw"`. The next move from Manager's Office was `d` to
Basement, so the code recorded **"northwest → Basement"** on Manager's Office — completely
wrong. And for Theatre Lobby, a blocked `n` (failed, stays put) followed by a successful `nw`
recorded **"north → Manager's Office"** — the failed command got credited for the next
location change.

**Fix (2026-06-22):** attribute the arrival command to the *previous* location instead:

```js
// CORRECT: t.command is the departure from prev.location that landed us at t.location.
if (i > 0 && MOVES.has(cmd)) {
  const prev = turns[i - 1];
  if (prev.location !== t.location) {
    const prevL = ensure(prev.location);
    if (!prevL.exits.has(dir)) prevL.exits.set(dir, t.location);
  }
}
```

After the fix, Theatre Lobby exits are: `northwest → Manager's Office`, `northeast →
Cloakroom`, `south → Outside The Theatre`, `up → Staircase Landing` — matching the game's
actual geometry. Re-run `gen-room-prompts.cjs` for any game to get corrected exit data.
