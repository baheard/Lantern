# Spider and Web — Puzzle Notes

Source commands: `docs/games/walkthroughs/spiderandweb.cmds.txt` (verified `--strict --seed 1`
clean, full replay-from-start, exit 0). Build: Release 4 / Serial 980226.

## ⚠ RANDOMIZED BETWEEN PLAYS

**Nothing in this trunk is randomized.** There is no `@random`-driven puzzle, no combination
lock, no per-play power word — the voice keywords ("tango"/"waltz") are fixed game text (read
via `read keywords` in `[annex-voice]`), not per-seed values. `--seed 1` is present in the
command list purely as the project's standard test-determinism convention; it has no bearing on
anything a hint should ever caveat. Timings (guard patrols, lockpick charge cycles) are also
fixed narrative delays, not RNG — see the individual sections below for exact counts.

## Core mechanic: the interrogation-flashback frame

The player character is imprisoned in an **Interrogation Chamber**, physically restrained in a
chair, and is narrating/reliving a break-in mission to an interrogator referred to as "the man"
or "with'" (his title). The player's typed commands are literally the character's *actions during
the flashback*. Two things can happen after any given action:

1. **Nothing special** — the game simply continues the flashback scene.
2. **A forced retry** — if the action reveals something the character wants to hide from the
   interrogator, the game teleports the player back to an earlier point in the SAME scene to
   relive it (sometimes preceded by the interrogator literally "executing" the character in the
   chair — this is **not a real death/ending**, just a retry transition; `--strict` does not flag
   these because they're valid parser responses, and `--stop-on-death` would falsely trigger on
   them if used carelessly — this game does NOT need `--stop-on-death` for the trunk in
   `.cmds.txt`).

This is why room names like "Interrogation Chamber", "White Junction", "Security Annex", etc.
recur multiple times in the transcript — each recurrence is a legitimate re-entry into that scene,
not a bug. The interrogator's yes/no questions after each scene are mostly answered per the
source `.sol`; a few (see `[annex-voice]`, `[outside-laboratory]`) encode a **deliberate lie**
that the game later corrects when the "true" version of events comes out in the interrogation
escape.

There are three endings: Failure (death), Fail to make a difference (leave the research papers
behind), and Made a difference (destroy the papers, or take them with you). `.cmds.txt` encodes
only **take-the-papers-with-you** (the best/"win" ending per the source .sol's own framing). The
destroy-papers branch and the failure/death branch are NOT encoded — see `[ending-take-papers]`
below for exactly where they'd diverge.

## [alley-door] The Door in the Alley

Straightforward: examine the door and plate, push the plate (no effect — it isn't the real lock
mechanism), go south twice to trigger the first flashback loop (answer `yes`).

## [alley-door-retry] The Door in the Alley (again)

On retry, knock on the door 4 times (`g` × 4) until the man produces a lockpick ("rod" internally
— the parser recognizes both `rod` and `lockpick`/`pick`).

## [alley-door-lockpick] The Door in the Alley (yet again)

`put rod on plate` then `wait` + one `g` charges the lockpick (status dot cycles yellow → green →
blue) and the door opens. **Build note:** in our build a single extra `wait`/`g` cycle beyond the
`.sol`'s literal "Wait. Again" was not needed — one `wait` + one `g` is sufficient before the two
`no` answers land you correctly at the next scene. The `.sol`'s literal `Wait. Again` (implying
possibly more repeats) is imprecise; the actual gate is exactly 2 time-passing turns.

## [white-junction]

**Build divergence — the `.sol`'s single "N" is two N's in our build.** After the alley-door
retry resolves (`no`/`no`), you land in the **Interrogation Chamber**, not directly at White
Junction; an `n` there is a harmless no-op ("You're not going anywhere") and `jump` is what
actually transitions the scene into "White Junction". From White Junction, you must go `n` again
to reach **Corner At Doors**, where the ceiling hole actually is — `look in hole` at White
Junction itself fails ("You can't see any such thing"). Once at Corner At Doors, the hole is
reached by `jump` (not `up`/`climb`) — `jump` here is a genuine climb-and-grab action, distinct
from the earlier no-op `jump` that just advanced the flashback. Sequence: `n` (interrogation,
no-op) → `jump` (transition) → `n` (into Corner At Doors) → `jump` (grab the hole edge) → `look in
hole` (reveals the package) → `get package` → `d` (drop down) → proceed `s`, `e`, `se` to cross
the metal-detector red line into the next flashback retry.

## [tee-junction]

`put rod on plate` at Dead End South is a **deliberate dead no-op** ("isn't important") — kept
from the `.sol`'s parenthetical hint line, pruned to just `e`/`w` since the plate action itself
never succeeds here (there is no real lock puzzle at this door in the flashback framing). The
timing gate: `wait` once, then exactly one more `g` — the guards' footsteps grow audible on the
first `wait`, then round the corner on the `g`. `throw rod east` immediately after draws them into
the dead end, letting you slip north unseen.

## [outside-laboratory]

**The trickiest timing gate in the game — and the one genuine "make a mistake" moment.** At Lab
Junction, `listen` reports on distant guards; the `.sol`'s "Listen. Again (wait for guards to
leave)" undersells how narrow the window is:

- **`g` count 0–1** (crossing too early): guards spot you crossing, forced retry ("Lies again").
- **`g` count 2–4** (the guard "Yes, with'" line has been heard, guards are mid-conversation):
  crossing succeeds cleanly — no retry, no "Lies again" banter.
- **`g` count 5–13**: crossing *always* triggers the "Lies again" retry regardless of how long you
  wait — the guards' patrol never actually clears this junction on its own; the retry is
  effectively mandatory once you overshoot the 2–4 window, and after that retry the game just
  places you back at Outside Laboratory to try again (still requires re-entering Lab Junction).
- **`g` count ~14+**: the guards go through the far door and briefly vanish, letting you cross,
  but this passes through ANOTHER forced retry cycle first ("The guards from Station Two did not
  know you were there") that is purely narrative, not a failure — answering the interrogator's
  `no` after it just sends you back to Outside Laboratory to redo the crossing, at which point
  `.cmds.txt`'s exact recipe (`listen`, `g`, `g`, `e`) succeeds cleanly the second time through.

**`.cmds.txt` encodes the clean 2-wait crossing** (`listen`, `g`, `g`, `e`) which succeeds on the
first attempt with no retry needed — verified empirically, not asserted from the `.sol`. If a
future replay against a different build sees the guards positioned differently, re-probe this
window with `--snapshot-at "## [outside-laboratory]"` and vary the `g` count before `e`.

After the crossing, the interrogator's Q&A (`yes`, `z`, `no`, `no`) is a long philosophical
dialogue about the ethics of the mission — the `z` (wait) is a deliberate silence in response to a
pointed question, not a mistake or filler.

## [annex-voice]

Introduces the game's core interaction verbs: `connect <module> to scan`, `say <keyword>` (tango
= on, waltz = off), and the scan/timer/voice puzzle-room-entry mechanic described in the source
`.sol`'s header comment (scan + voice, or scan + timer, both work; voice is simpler and is what
this section uses). The **south room** (Security Storage Room) has a drugged pen.

## [annex-chair-lie] Security Annex "north room" (the interrogation-chamber duplicate)

The **"north room"** is revealed to actually be a duplicate of the **Interrogation Chamber
itself** — a major "something important happened here" beat. Sitting in the chair and looking
repeatedly (exactly 4 `look`s) causes a ghost-image of "the man" to fade into view; `x man`
describes it; 3 more `look`s make the ghost dissipate on the 3rd. **This entire visit to the chair
is itself a lie** — the interrogator catches it at the end (`sw` back out triggers "Was that a
true memory? ...were you truly in here?") and the correct answer is `no`, sending you back to redo
the Annex with the **timer** instead of voice (`[annex-timer-retry]`), which is the version that
"really" happened.

## [annex-timer-retry]

Sets the scan scrambler to cycle on 1-second green/blue dial timings (`turn green to 1`, `turn
blue to 1`, then `push green`/`push blue` to start the cycle) instead of manually saying
tango/waltz. This lets you walk into the storage room and office without narrating voice commands
— matching the "true" memory where you didn't actually go back into the interrogation-chamber
duplicate room. `x plays` in the Security Office is a harmless flavor examine (the bookshelf) with
a fourth-wall joke in the game text; kept per the "preserve observation verbs" rule. After
returning and exiting the Annex, the interrogator's `yes`/`yes` responses close out a long
extended monologue about mutual respect between captor and captive — no hidden gate here.

## [diagonal-branch-capture]

A guard bursts in from the Dead End's north door on the first `wait`; `stab guard with pen` uses
the drugged pen from `[annex-voice]`/`[annex-timer-retry]` to knock him out silently. `climb
cabinet` lets you reach a vent near the ceiling; `put all in vent` hides your entire toolcase,
scrambler, pen, and package there (this matters later — you retrieve the gun-equivalent items from
THIS SAME vent in `[lab-entry]`, not a different one — see the game's own closing note "found two
identical vents?"). Taking the fallen guard's gun and shooting the pursuing guard squad
(`shoot guards with gun` × 2) results in **deliberate capture** — this is the story's intended
turn, not a failure state; the interrogator openly muses about how the ventilation duct betrayed
you next.

## [interrogation-escape]

**The best puzzle in the game** (the `.sol` calls this out explicitly). After capture, your
confiscated items are laid out on the interrogator's desk (`x items` lists them) — noticeably
**missing**: the gun, the pen, the acid pack, the blast tab, and the radio module (all left behind
in the vent or the wiring closet). The correct move is `say tango` — this activates the **acid
pack** that was secretly wired into the interrogation chair itself (established as backstory only
after the fact: "you rigged an escape mechanism to the metal interrogation chair" — foreshadowing
you could not have known from earlier play, it's a retroactive reveal). The acid dissolves the
chair's restraint bands, freeing you; `hit man` knocks him out, `search man` finds nothing useful
(he's too careful to carry a gun), and `get all from desk` recovers your equipment before escaping
south through the now-unguarded scan-web band (`s`, `sw`).

## [wiring-blast]

The Wiring Closet holds a blast tab pre-connected to a jammed radio module (again, retroactive
"this is what you actually did" reveal) — `disconnect radio` frees the blast tab, `connect button
to blast` rewires it to the manual pushbutton trigger instead, and `push button` detonates it,
cutting power to the whole complex (subsequent room descriptions gain "(in dimness)"/"(in
darkness)" suffixes for the remainder of the game — cosmetic, not a bug). The door-charge timing
before entering (`put rod on plate`, `wait`, `g`, `g`) mirrors the alley-door lockpick gate:
2 time-passing turns to go yellow → green → blue.

## [lab-entry]

Retraces the entire map back to the **Corner At Doors** vent (the SAME vent from
`[diagonal-branch-capture]` — confirmed by the game's own closing trivia question about "two
identical vents") to retrieve your gun, then fights past two waves of guards
(`shoot guards` × 3 across `[Corridor Boundary]` and `[Sharp Corner]`) before reaching the lab door
a second time. The lab door lockpick-charge gate is again exactly 2 `wait`/`g` turns. Once inside,
`open panel` + `shoot layer` destroys the door's control circuitry from the inside, permanently
sealing the guards out — this is what buys the time needed for the ending sequence. `search
table` reveals a **logic plate** hidden under scattered papers (not visible via plain `x table`;
this is why the `.sol`'s "what items are missing" framing in the interrogation section matters —
`search`, not just `x`, surfaces hidden objects throughout the game).

## [ending-take-papers]

The teleporter console requires: `push upper` (power it on), `push oval` (set an untuned random
destination — deliberately not "home", since a return-to-lab teleport would be useless/dangerous;
the game explicitly narrates you don't want to return here), `open flap`, `push lower` (starts a
4-turn accumulator countdown visible in the console readout), `enter platform`, `close flap`, then
wait out the remaining countdown (`read papers` + `wait` + `g` cover the last 3 of the 4 "pulse in
N" ticks). Guards breach the door just as the pulse fires — you vanish with the papers,
triggering **"You have made a difference."**

**Branch point (not encoded):** the "destroy" ending shares everything through `read papers` in
`[lab-entry]`, then diverges — instead of the cabinet/console sequence above, it examines a
coffee-maker-like "device," burns the papers in an alcove, and destroys your own equipment on the
table before doing the same console/platform sequence, ending in "Made a difference" via
destruction instead of extraction. The failure/death ending results from *not* reaching the
platform in time (e.g. answering the interrogator's questions in ways that don't lead to escape,
or letting the guards breach before the pulse fires) and was not probed.
