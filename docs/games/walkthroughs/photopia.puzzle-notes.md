# Photopia — puzzle-logic notes

Build: `docs/games/photopia.z5`, release 1, serial 120416 (in-game banner: "Photopia 1.30 is a
stripped-down version designed for online play"). Verified against `docs/games/walkthroughs/photopia.cmds.txt`
via `node tools/play.cjs photopia --strict --seed 1 --file docs/games/walkthroughs/photopia.cmds.txt` (exit 0,
zero parser failures end to end).

## ⚠ RANDOMIZED BETWEEN PLAYS

**Nothing is randomized.** Photopia has no `@random`-seeded content, no combination locks, no
per-play-varying puzzle values. `--seed 1` is included in the verification command purely as this
repo's convention, not because anything in the game depends on it. Every real playthrough that
follows the same command sequence sees the identical text. The only per-play "variance" is
player-chosen optional flavor at the TALK TO menus (see [garage-alley], [gym-spotlight],
[car-crash], [nursery-photopia]) — those branches do not affect what happens next or the ending;
they're pure characterization texture. Hints can safely reference exact wording.

## [opening] Car with Rob — pure flavor, no gate

Rob's rant is skippable; `wait` twice reaches the red-light collision that transitions into
[mars-greenhouse]. Talking to Rob is optional crude flavor text with no effect on progression.

## Core mechanic: no deaths, almost no puzzles, narrative told out of order

Photopia is told across ~9 vignettes that jump between different characters, times, and even a
"once upon a time" bedtime-story frame, converging on a single throughline: the babysitter Alley
Dawson dies in a car accident, and the story before/after that event is being narrated back to a
much younger Wendy (whom Alley used to sit for) as a bedtime story, and also flashes forward to
Alley's own infancy. There is no way to "lose" — every vignette has exactly one route through it,
and the handful of things that look like puzzles turn out to be either scripted set-pieces (the
game advances regardless of which valid command you give) or single-item fetch-quests. Getting
this "everything is on rails" fact right matters most for the hint author: never write a hint
implying there's a wrong choice to avoid.

## [mars-greenhouse] Red planet — NOT a branching maze

Despite the old CASA solution's warning to "keep your directions simple... you'll have to go back
with the opposite directions," the actual room graph is a **straight line**: Landing site → tread →
living quarters → power plant → bulldozer → greenhouse (get the container) → shallow crater
(dead end). Every room is reached by `n` and left by `s`; there is no branching. **The insight for
hints:** once you've picked up "the undamaged container" (parses as `container` too), any further
`n` attempt is refused with an oxygen/power-supply warning — the game itself stops you from
wandering past the objective, so a player can never strand themselves. The side-rooms (tread,
living quarters, power plant, bulldozer) are pure flavor text with no items or hazards; a player
can skip examining them entirely with zero cost.

## [pool-cpr] CPR sequence — literal command matching, but forgiving

Gabriel narrates each CPR step one at a time ("tilt her head back" → "breathe into her mouth" →
"press her chest") and the room description itself restates the pending instruction if you do
anything else (e.g. `look`), so a player who's paying attention to the text can never get stuck —
the game is effectively holding your hand through the parser phrasing. `get in pool` must precede
the CPR steps (not `dive in pool` or similar — untested alternate phrasings, so hints should quote
`get in pool` verbatim as the safe form).

## [castle-escape] Undersea castle — get pickaxe hides a shovel, direction words mostly don't matter

**The insight:** `get pickaxe` doesn't succeed on the first pull — its description explicitly
narrates a shovel clattering loose and the castle starting to rumble ("the shaking most pronounced
in the direction of the keep"), which is the walkthrough's only real clue: head toward the keep
once the rumbling starts. Castle navigation is a fixed *line* of rooms (keep — great hall — dining hall — throne room),
but NOT fully direction-agnostic: probe replays (2026-07-01 hint review) show at least one
genuinely refused move ("Solid stone blocks your path" at the keep's south end), and the same
direction word from the same room produced different outcomes across runs. There is still no
real branching to get lost in — at worst a doorway refuses you and you try the other way —
contrary to CASA's "the solution to this section is quite tricky and I only got it by accident."
The keep's spiral staircase (`up`) triggers the escape-to-surface cutscene (a rip current drags you
out to sea, ending in the "dark"/hospital-bed flash-forward) — this cutscene runs automatically
once you reach the keep with pickaxe+shovel in hand; there's no separate "climb stairs" command to
discover.

## [gold-beach] Golden beach — first action always fails, treasure needs no key item beyond the shovel

**The insight:** the very first action taken upon arriving on the golden beach *always* fails with
"Your head swims for a moment -- you still haven't fully recovered from your struggle against the
ocean," regardless of which command you issue. This is a fixed one-turn penalty, not a signal that
the specific command was wrong — a hint author should flag this explicitly so a player doesn't
waste time hunting for "the right first verb." After that dummy turn, get the seed pod (washed up
separately from its lost container), the shovel, and a coin; going `n` reaches a spot with a
wooden corner buried in the sand — `dig` there breaks the shovel but frees a treasure chest.
Continuing `n` then `nw` exits the beach — the coin from the beach (not the container, which was
lost with the spaceship) is the item that survives into the [forest-wolf] scene later.

## [garage-alley] TALK TO menu chain — Space Camp branch

`talk to alley` opens a numbered menu whose options change each re-issue — a stateful walk through
a fixed dialogue tree. The load-bearing choice is `ALLEY, COME INSIDE` (and its "...AND I MEAN IT
THIS TIME" follow-ups); the astronaut-selection/Space-Camp small talk is flavor that happens to be
the fastest way through the "get her to come inside" loop in this trunk, not a required topic.

## [gym-spotlight] Turn off the spotlight, then ask to the dance

`turn off spotlight` (not `turn off light` — that phrase is ambiguous here between "the spotlight
or the light switch," per the parser's own disambiguation prompt) triggers Alley climbing down;
`talk to alley` → `ASK ALLEY TO THE DANCE ON FRIDAY` is the load-bearing choice that advances the
scene into [car-crash]. Other menu options (orange small talk, "our lack of animosity," "possible
paramours") are flavor-only.

## [car-crash] Driving Alley home — fixed-turn fatal collision

Small talk here (`talk to alley` → babysitting-Thursday branch used in the trunk, or any other
menu option) does not affect timing. The collision at the Montgomery Boulevard intersection fires
on a fixed turn count of `wait`s after the driving scene begins, not in response to any dialogue
choice — the trunk needed exactly 6 waits after the "3" (babysit) reply to reach it in this build;
if a hint author retraces this by hand and lands on a different count, re-verify with `--status`
rather than assuming build drift, since off-by-one miscounts here are easy (see the trace-walkthrough
session note: the initial draft undercounted by one `wait` and the harness caught it immediately
via a scrambled subsequent transcript, not via `--strict` itself, since `wait`/menu number entries
don't trigger strict's parser-failure detection until several turns downstream).

## [forest-wolf] Petrified forest — item chain, not a maze

The "wolf" set-piece looks branchy (wandering `n`/`s`/etc. inside "the forest" always returns you
to the same clearing — again direction-agnostic filler, not a real maze) but the actual puzzle is
a short **fetch chain**: `examine wolf` reveals it's starving and needs feeding; `open chest`
(carried over from [gold-beach]) reveals dirt, not treasure — a deliberate subversion of player
expectance (gold is worthless here; dirt is the precious resource, since nothing here can grow
without soil); `drop dirt` then `plant seed pod` fails ("Nothing happens") but summons the weather
salesman NPC, whose `TALK TO` menu sells rain for the beach coin; giving him the coin triggers the
pod to sprout a berry bush that feeds the wolf. **Do not hint "get dirt is useless here" —** it's
the reveal that makes the sequence work; the misdirection (chest = gold expectation, actual
contents = dirt) is the game's intended aha-moment, not a design flaw to route around.

## [nursery-photopia] Finale — verb is "press white button," not "push"/generic "button"

Reaching Alley's nursery via the `talk to alley` (option 3, "ask Alley where she gets her ideas")
branch unlocks a long monologue from the dream-Queen persona (Alley's own childhood dreams,
revealed as the same barren-world settings Wendy/the player has been visiting — Mars, the
undersea castle, the crystal labyrinth, the petrified forest all belong to Alley's imagination).
The scene automatically resolves into "In your bedroom (in the bed)" then "Alley's nursery" with
no player input required for the transition. The only two commands needed there are `press white
button` (× 2, cycling the ceiling display through its "field of stars" then "RGB circles" modes —
this em is literally the "Photopia" of the title, a baby's colour-cycling nightlight) and `turn off
light`, which prints the true ending. **Parser gotcha:** `push button`, `press button` (without
"white"), and `push white button` (with "push" instead of "press") all fail with "[That is either
not in the area, or does not need to be referred to.]" in our build — the exact verb+object pair
is `press white button`.

## [crystal-labyrinth] Crystal labyrinth (sky-blue) — the "maze" is not navigational

The old CASA solution ("take off your spacesuit, go up twice and go down twice") turned out to be
exactly right once probed, but for a non-obvious reason: **every compass exit inside the labyrinth
is interchangeable** — picking `n` vs `s` vs `e` from any given junction produces the identical
next room in the identical order, so there is no wrong turn and no way to get lost (confirmed via
breadth-first probing: alternating directions and going all-one-direction hit the same closed loop
of ~6 room-signatures with no path ever leading out). The real gate is `take off spacesuit`, which
lets Wendy grow wings and fly; the first `up` shows the flight, the second `up` hits an invisible
crystal barrier arching over the whole planet (a visual/thematic capstone — the queen's realms are
bounded), and `down` is explicitly refused ("This feeling of freedom is too exhilarating to go
back to trudging through the labyrinth") rather than returning you to ground navigation. The way
onward is flying **`w`** — the same gap in the mountains a bird is shown using earlier in the
scene — which transitions directly into [gym-spotlight]. A hint for this section should emphasize
"take the suit off to fly," not "find the right path."

## Branch points not encoded in the trunk (report for the caller)

- Multiple TALK TO sub-branches (Mars-unrelated science trivia with young Alley in the garage;
  Rob's crude commentary in the opening car scene, intentionally skippable and skipped here;
  various small-talk options in the school-gym and driving-home scenes) are flavor-only. None of
  them were walked in `photopia.cmds.txt` beyond the minimum needed to progress — they don't
  affect the ending and are safe to skip in a speedrun-style trunk.
- The Queen/Alley dream-logic monologue triggered by `talk to alley` → 3 in
  [nursery-photopia] itself contains a nested `TALK TO QUEEN` menu with a single option ("ASK
  QUEEN HOW TO GET OUT"); the trunk answers `0` (say nothing) at that nested prompt, which is the
  narratively "correct" choice (a hint author should note this is not a real fork — saying nothing
  vs. asking both lead to the same place, since the scene resolves either way).
