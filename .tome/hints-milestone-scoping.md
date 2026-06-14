# Hints: milestone (act-window) scoping for recurring rooms

**Problem.** The hints panel badges a section when the player's current room matches the
section's `locations`. Games that **reuse the same rooms across acts** then badge the wrong
act. The existing `phase` field handles this *only when the status bar names the act*
(Anchorhead: `phase: "day two"`). It fails when the status bar is a **clock or compass** —
e.g. Wishbringer's `Time: 6:01 PM`, where Festeron and Witchville are the same rooms at
different times and no substring names the act.

**Key discovery.** The hint system derives location **only from the status bar**
(`getCurrentLocation(statusBarText)` in auto-mapper.js). The `Festeron`/`Witchville`
discriminator the player actually sees lives in the **room-description prose** (main window) —
"the Witchville Cemetery" — which the location parser discards. So location-name alone can
*never* distinguish shared rooms; the signal is in the prose.

**Why `phase` is the wrong tool here.** `phase` reads the *volatile* status bar (what's true
*now*). Disambiguating acts needs *act progress* (how far you've gotten), which the clock
doesn't provide in a matchable form.

## Solution — milestones (added 2026-06-14)

A milestone = an **act**. The player's current act index is remembered per-game and travels
with each save. Schema (root of the hints JSON):

```json
"milestones": [
  { "id": "festeron",  "start": true, "textMatch": "Festeron", "enterLocations": ["Post Office"] },
  { "id": "witchville", "textMatch": "Witchville", "enterLocations": ["Fog", "Underground"] },
  { "id": "tower",  "enterLocations": ["Vestibule", "Torture Chamber"] },
  { "id": "endgame", "textMatch": "hellhound", "enterLocations": ["Circulation Desk", "Museum"] }
]
```

Order = progression; **index 0 is the start act**. Sections scope with `afterMilestone` /
`untilMilestone` (either, both = `[X,Y)`, or neither = always). Questions inherit the
section's window.

**Triggers fire any-of:**
- `enterLocations` — act-exclusive **room names** (status-bar). Proxy; works only when an act
  introduces a uniquely-named room.
- `textMatch` — a **prose signature** scanned from the current turn's output (the last
  `#lowerWindow .game-text` block). The robust trigger: recovers the discriminator the status
  bar drops, fires regardless of path, fires even on in-place transitions. Need NOT be
  act-exclusive — forward-only latch means a recurring word ("Witchville") only raises the
  floor; a later act mentioning it can't pull the player back.

**Latch directionality (the subtle part):**
- Non-start milestones latch **forward only** (advance to the highest fired index).
- The `start: true` milestone **forces a reset to index 0** when its trigger fires — this is
  how an in-game `RESTART` self-heals with no VM event to hook: re-seeing the start act
  (room `Post Office` / prose "Festeron", both act-1-exclusive) resets. The boot room
  (`Hilltop`) recurs across acts so it's a bad anchor; use the first act-exclusive room/prose.
  A 1–2 turn cosmetic badge lag after RESTART is fine (badges never reveal hint text).

**Save-coupling** (the other reset path): `hintsMilestone` (act index) is written into every
save slot (`performSave`) and restored **exactly** on load (`performRestore`, allows a
down-move so loading an earlier save drops the act correctly). Pre-feature saves omit it →
the current latch is left untouched and self-corrects on the next trigger.

## Implementation

- `hints-state.js`: `getReachedMilestone` / `setReachedMilestone` (set-exact; 0-based act index).
- `hints-data.js`: `updateMilestone(hintsData, gameName, outputText)` — start-reset (force) vs
  forward-latch (max); `findCurrentTopics(hintsData, gameName)` gained `milestoneMatches`
  gating alongside `phaseMatches`.
- `hints-panel.js`: `locationChanged` reads the latest game-text (`getLatestGameText`, last
  block only — not scrollback, so stale prose can't force a spurious reset) and calls
  `updateMilestone` **before** `findCurrentTopics`.
- `save-manager.js`: `hintsMilestone` saved + restored (exact).
- Fully backward-compatible: no `milestones` → always-active (Theatre, Anchorhead untouched).

**Companion guidance — tighten `locations`.** For recurring-geography games, list a room under
a section **only if that section's puzzle happens there**, not every room traversed — otherwise
a later section gets un-blurred early by a shared room (mild title exposure, not an answer leak;
badges never reveal hint text).

**phase vs milestones — keep both** (complementary signals): status bar *names* the act →
`phase` (stateless, self-resetting; Anchorhead). Status bar is junk but acts have unique
rooms/prose → milestones (sticky, save-coupled; Wishbringer). Neither subsumes the other.

Skill guidance: `generate-hints/SKILL.md` (Step 2 Section rules + Step 4 checklist).

## Why milestones can't cleanly replace `phase` for Anchorhead (decided 2026-06-14)

When authoring `anchorhead.json` (phase's **first shipped consumer** — it was dead code until
then, zero `.json` files used it), we re-examined whether to express the 5 days as milestones
and delete `phase`. Verdict: **milestones are strictly harder *and* more fragile here**, two
concrete reasons:

1. **No act-exclusive room exists for the Day1→Day2 boundary.** Days 1 and 2 share the entire
   house + town map, and Day 2's *first* puzzles (journal, safe, pages, skull) all happen in
   house rooms that are also Day-1 rooms. A milestone can only latch on entering an
   act-exclusive room — but the player doesn't reach one (Courthouse / Local Pub / Wharf) until
   much later in Day 2. So those early-Day-2 house puzzles would badge under Day One until the
   player wandered into town. (Days 3 / Last Night / epilogue *do* have exclusive rooms — only
   the early-day boundary breaks.)
2. **The day-change prose has no per-day signature.** Every transition is a generic "You wake
   up…" with no day name, so there's no reliable `textMatch` to recover the boundary either.

`phase` sidesteps both: Anchorhead's status bar flips `day one`→`day two`→… exactly at each
boundary regardless of location, and (being stateless) self-corrects on RESTART/load for free
with zero persistence. This is the textbook case the field was built for — keep it.
