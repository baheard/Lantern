---
title: gen-room-prompts phase-less games + phantom location names
tags: [location-art, prompts, tooling, gotcha, theatre]
created: 2026-06-18
updated: 2026-06-18
aliases: [gen-room-prompts bug, prompts.json 0 rooms]
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
