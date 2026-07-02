# Trinity — puzzle-logic analysis

Sources: `trinity.txt` (Scorpia 1986 walkthrough, Walkthrough King, David Welbourn/Key
& Compass). Verified command list: `trinity.cmds.txt` (`--strict --seed 1`, ends with
"You've completed the story of Trinity," score 100/100, rank "Tourist").

## [prologue] Structure at a glance

Trinity is **hub-and-spoke**, not a linear crawl. The Prologue (Kensington Gardens,
London) funnels you through a short forced sequence into **the Wabe** — a surreal
garden built around a giant sundial — which is the **hub**. From the Wabe's Vertex
(the sundial platform), a rotating gnomon-shadow selects one of six toadstool doors,
each leading to a self-contained **vignette** set at a real atomic-bomb site/moment
in history (Bikini/Mesa, Ossuary/Nevada-underground-test analog, Waterfall/Earth
Orbit, Herb Garden/Soviet Russia tundra, Moor/Nagasaki, Islet/River-Styx-into-New-
Mexico). Each vignette is entered and exited through the *same* toadstool door, and
each imposes its own tight, self-contained "race the local apocalypse" timer — get
in, get the objects/effect you need, get out before the historical explosion. You
return to the Wabe after every vignette to stash/fetch inventory and reset the dial
for the next one. The seventh symbol (Alpha, the River Styx) is the hub's *exit*
gate, not another self-contained vignette — it dumps you into New Mexico 1945,
which is the endgame proper (not a return trip).

This hub structure is why the walkthrough is organized as: prologue → hub setup →
hub mapping/prep → six vignette round-trips (order mostly free, with prerequisites
noted below) → River Styx crossing (hard gate) → New Mexico endgame → epilogue
(prologue replayed with small variations, ending the game).

## ⚠ RANDOMIZED BETWEEN PLAYS

Two elements are genuinely randomized per playthrough (confirmed by both Walkthrough
King and Welbourn's walkthrough, and independently reproduced by us under
`--seed 1`). **Neither should ever be hinted as a literal value** — hints must teach
the method (how to find/derive the value in *your* game), never the number/word
itself:

1. **Jeep radio dial number** ([jeep-dial]). At the abandoned jeep in the New Mexico
   desert, `examine dial` shows a number between 20 and 80. The walkie-talkie must be
   tuned to this exact number (`set slider to <N>`) to pick up the tower/ranch radio
   chatter later — without it, the wire-function reveal at the breaker (see
   [breaker-listen]) never plays and the endgame is unwinnable blind. Our `--seed 1`
   run showed 32; a real player's value will differ every game.
2. **Wire color/function legend** ([tower-platform] + [breaker-listen] +
   [cut-wire]). The cardboard slip found in the paperback book at the Tower Platform
   has a legend on the back mapping four wire *colors* (red/blue/striped/white) to
   four wire *functions* (detonator/ground/informer/positive), randomized per game
   (our seed-1 run: `RD=INF BL=POS ST=GND WH=DET`). Separately, pulling the breaker
   at Base of Tower triggers radio chatter naming which *function* ("line") just
   glitched — cross-referencing that function against the slip's legend gives the
   wire *color* that's safe to cut at the finale. Getting either half wrong (or
   guessing a color outright) is fatal. Hints must teach "read the slip, then listen
   at the breaker, then cross-reference" — never a color.

## Timing model — the single most important thing to understand about this game

**Each of the six sub-vignettes has its own short, self-contained countdown** that
starts the moment you step through its toadstool door and resets/ends when you leave
back through the same door. These are forgiving relative to the hub (tens of turns).

**The New Mexico endgame is different: it runs on ONE continuous, unforgiving clock
that we believe is pegged to absolute elapsed game-turns from the very start of the
session (or very close to it), not to time-since-entering-the-desert.** Concretely,
we found that a full, faithful, "keep every observation verb" replay of the six
vignettes plus hub mapping (~467 turns to reach the New Mexico door) **arrives too
late** — the rich walkie-talkie countdown dialogue ("Zero minus N minutes," the
breaker-pull wire-function reveal, "Commence auto-sequence") **simply never fires**,
and cutting any wire at any wait-count fails instantly with the "headlights
converging on the tower" MP-capture death. Trimming roughly 30–35 turns out of the
hub-exploration phase (see the "OPEN PUZZLE" note below) was enough to land inside
the valid window and get the full richly-scripted endgame, ending in a genuine
100/100 "You've completed the story of Trinity" victory.

**Corollary — do not add or remove ANY commands anywhere before the New Mexico
door**, including "harmless" extra examines, without re-deriving the entire desert
section from scratch. Two independent effects compound:
- The desert's own room-to-room exits are **direction/state-dependent and
  effectively re-randomized whenever the turn-count feeding into the seeded RNG
  shifts** (confirmed empirically: identical high-level command lists produced
  different room graphs, e.g. `nw nw nw` from the jeep sometimes reaches Paved Road
  in 2 hops, sometimes 3, and `sw` chains from the tower to Outside Blockhouse
  varied between 2 and 4 repetitions across our two verified turn-counts). The
  manual itself warns about this: desert/foothills exits are "unreliable" and can
  differ depending on the direction you entered from.
- The **jeep dial number and wire-legend values themselves shift** when the turn
  count changes (we observed dial 53→31→32 and legend `RD=INF BL=DET…`→`RD=INF
  BL=POS…`→`RD=INF BL=POS ST=GND WH=DET` across three different turn-count
  variants of otherwise-similar command lists, all under the same `--seed 1`).

  This means the "randomized-between-plays" values in the ⚠ section above are also,
  in effect, **randomized by how many turns you personally take to get there** —
  which is exactly what a real, unscripted player experiences too (their real dial
  number and legend depend on their own play, not a fixed per-game constant chosen
  once). For hint-writing this reinforces: never hardcode the color/number, always
  point at "go examine the dial / listen at the breaker / read the slip" as the
  *live, must-check-in-your-own-game* source of truth.

- **Snapshot/restore fidelity caveat**: while deriving this walkthrough we found
  that `--snapshot-out`/`--snapshot-in` did **not** always reproduce bit-identical
  RNG-derived values (dial 31 via a snapshot-restored path vs. 32 replaying the
  identical prefix via `--file` from a cold boot, same seed, same command text).
  For any RNG-sensitive New-Mexico-adjacent probing, prefer full `--file` replays
  from turn 0 over snapshot-restored probes, or treat snapshot-derived values as
  provisional until cross-checked against a full replay.

### OPEN PUZZLE: exact minimum hub turn-budget

We have **one** verified turn-budget that lands inside the New Mexico timing window
(the committed `trinity.cmds.txt`, ~532 turns to reach the wire panel, dial 32,
legend `RD=INF BL=POS ST=GND WH=DET`, cut white). We have **not** mapped the actual
turn deadline precisely (only that ~467 turns-to-shack is too slow and ~434–459
turns-to-shack is fast enough for at least one path). If future work needs to trim
the hub further (e.g. for a shorter hint-testing prefix), re-verify the *entire*
desert section from scratch per playthrough — do not assume the current desert
commands transfer to a different turn count.

## Hub puzzles

### [wabe-setup] Flip-world puzzle and the sundial's dual role

The Vertex sundial has two jobs: (1) once the gnomon is screwed into its hole, a
lever appears that starts/stops the shadow's crawl around the dial, and a ring lets
you pre-select which of the 7 symbols the shadow should stop on — reaching that
symbol opens the matching toadstool's door; (2) the gnomon's screw threads
initially **don't match** the Vertex hole. The fix is the Arboretum/Arbor-vitaes
loop: passing through the Top of Arbor from North Arbor to South (or the reverse) is
a **Klein-bottle mirror flip** — everything including screw handedness reverses.
Drop the gnomon before the *second* crossing (so it isn't itself flipped back), pick
it up, and the threads now match. **Insight for hints:** the flip is diagnosed by
noticing the inscription on the Arboretum's glass sculpture reads backwards after
one crossing — that's the tell that a second crossing is needed, not a random fix.

### [wabe-explore] Icicle relay and light-source chain

The lump of magnetic metal in the Crater needs to be cooled to be picked up
bare-handed. An icicle carried from the Ice Cavern melts before reaching the Crater
directly — but detouring **via the Vertex** (cold high ground) rehardens it, letting
you complete the trip. This is a "the hub itself is a resource, not just a menu"
puzzle: knowing the Vertex is cold is what makes the relay solvable.

The splinter (light source, from the rotting log at South Bog) is required reading
for the Barrow — no light there is fatal (a "grue"-style barrow wight). The lantern
obtained inside the Ossuary vignette [ossuary-underground] is the upgrade, but you
must survive the *first* Barrow visit (splinter-lit) to fetch the vignette's key in
the first place.

### [emerald-recipe] The magpie's recipe

The cottage's magpie recites, over several turns of `z`, the recipe for the potion
that becomes the emerald: "Milk and honey, fresh whole lizard / killed in the light
of a crescent moon / mix 'em with a pinch of garlic / then stand back — 'cause it go
BOOM." **You do not need to hear the full recitation to progress** — opening/taking
the cage works regardless of how much of the recipe you've heard — but the recipe
is the *only* source in-fiction for the correct cauldron sequence (milk, honeyed
hand, dead skink, garlic). Ingredients are gathered across three separate vignette
trips (coconut/milk from Mesa-Pacific, honey from the Under-Cliff hive, dead skink
from Waterfall-Orbit) and only combined back at the Wabe's cottage.

## Vignette puzzles

### [moor-nagasaki] Nagasaki playground — bootstrap loop, not a fetch quest

This vignette is built entirely around a closed time loop: you give the umbrella
(carried from the Prologue) to a young girl, who is implied to grow up into the
scarred old woman who loses that same umbrella back in Kensington Gardens at the
start of the game. In exchange she gives you a spade (needed for [river-styx]'s
crypt) and — critically — turns your paper "crane" note back into an actual paper
crane (its origami folds match hers), which then grows and carries you back up
through the door. **Insight for hints:** the exchange order matters — give the
umbrella first (she needs a reason to trust you), then the paper; giving paper
first has no effect.

### [ossuary-underground] The skink chase (light-and-shadow puzzle)

The skink (lizard) can't be caught by chasing. The trick: `turn on lantern` and
`drop` it in one room, then go to the next room and jam the splinter into the
crevice where the skink is hiding. The skink bolts toward the *lit* lantern in the
room you just left, gets confused, and runs back into your feet — only then can you
pick it up. This is a decoy/bait puzzle disguised as a fetch puzzle.

### [waterfall-orbit] Earth Orbit — the one truly unavoidable "evil" act

Killing the skink here is mandatory and has no workaround — the game explicitly
denies you any other path to finishing. This is thematically the point (the whole
game is about complicity in destructive-but-"necessary" acts), not a bug or missed
alternative; don't hint around it as if there's a kinder solution.

### [mesa-pacific] Coconut tide timing

`point at coconut` fails until the tide comes in — two `wait` turns pass before the
coconut floats free of the islet and the dolphin will toss it to you. This vignette
also has its own local 7-minute countdown (from `push button` at the scaffold box)
independent of the New Mexico master clock discussed above.

### [tundra-lemming] Lemmings run themselves off a cliff

No trick needed beyond following the rodent stampede to the Cliff Edge fissure and
caging the one that's stuck — but note the cage cannot hold the skink (from a
different vignette) simultaneously; each vignette's "cargo" item occupies the cage
in sequence, not concurrently.

### [river-styx] The dory only accepts the "dead"

The oarsman won't let you board unless you look like a corpse: worn burial shroud
plus paying a silver coin (both looted from your own crypt in [moor-nagasaki]'s
follow-up Cemetery visit — see the walkthrough's mid-vignette detour). This is
another bootstrap-paradox beat: you rob your own future grave to get the props that
let you "die" convincingly enough to cross. **Timing: needs exactly 2 `wait` turns**
after arriving at The River before `enter dory` succeeds — entering too early ("You
couldn't do that from where you're standing") or waiting too long both fail
silently without killing you, so it just costs turns, not a life — but see the
overall New Mexico timing warning above: those turns are not free against the
master clock.

## New Mexico endgame ([tower-platform] through [cut-wire])

### [tower-platform] The cardboard slip and the ruby's new home

The paperback book at the Tower Platform hides the cardboard slip carrying the
wire-color/function legend (see the ⚠ RANDOMIZED section). The roadrunner — a
recurring helper first seen blowing bubbles as a boy at Inverness Terrace, later at
the Wabe's Promontory — reappears here holding the ruby; putting the ruby in the
**red boot** (the one *without* the emerald from [emerald-recipe]) gives the boots
their matching pair of magic speed, which the desert's rapid, sprint-like exit
descriptions ("You zoom over the landscape," "The desert streaks past") depend on
for surviving several later timing gates.

### [jeep-dial] Tuning the walkie-talkie

See the ⚠ RANDOMIZED section — `examine dial` at the jeep shows the number to
`set slider to`. This must happen before leaving the jeep; the walkie only starts
receiving the tower/ranch chatter once tuned and powered on (`pull antenna`,
`turn on walkie`).

### [ranch-snake] The rattlesnake needs a sacrifice, not a fight

Entering the Assembly Room finds a rattlesnake that's instantly fatal if you
linger. Retreating into the adjoining closet is safe but doesn't clear the snake —
opening the caged lemming *inside* the closet, then opening the closet door, sends
the lemming out to be killed in your place. This reuses the lemming caught back in
[tundra-lemming]; carrying it this far is the entire reason to have caught it.

### [reservoir-binoculars] The forced dunking is the only way to the binoculars

Climbing the Windmill's ladder to reach the binoculars **always** dumps you into
the Reservoir — there is no way to simply climb up and take them. The actual
solution is to let the fall happen, then separately fetch the lantern, dive back in
lit, and retrieve the binoculars underwater. Water-sensitive items (walkie-talkie,
bag of crumbs, anything electrical) must be dropped at the Edge of Reservoir
*before* going up to the Windmill, or they're ruined by the dunking.

### [shed-key] Binoculars are the only way to spot the key; the roadrunner is the only way to fetch it

You cannot approach the shelter directly (guarded). `look through binoculars at
shelter` (from Behind the Shed) reveals the key sitting in a padlock inside; you
then need one more turn (`z`) before `point to key` succeeds in sending the
roadrunner in to steal it. Pointing immediately (0 turns) fails silently ("nothing
extraordinary happens") — this costs a turn but not a life, unlike most other
New-Mexico timing failures.

### [breaker-listen] The breaker step is the crux and is genuinely one-shot

At Base of Tower, `pull breaker` triggers a **single, one-time-only** radio
exchange revealing which wire *function* just glitched. You **must** `close
breaker` on the very next turn — leaving it open, or pulling it a second time after
closing, both trigger the fatal "headlights converging" MP-capture ending. There is
no retry. If the reveal message doesn't play (see the timing-window warning above),
the run cannot be won — the game will still let you *guess* a wire at the end, but
guessing is a 1-in-4 gamble the hint system must never suggest.

### [searchlight-diversion] A second one-shot timing gate

At Outside Blockhouse, `drop bag` (of crumbs) lures the roadrunner away from a
sleeping guard dog and toward the crumbs, which pulls the tower's searchlight beam
away long enough to sprint back and climb unseen. Waiting even one extra turn once
the beam returns risks detection on the way up (`u u` from Base of Tower must happen
promptly after the beam sweeps away).

### [cut-wire] Wait for "Commence auto-sequence," not just any pause

Cutting a wire (even the *correct* one) too early — before the walkie-talkie
announces the auto-sequencer has taken over — causes a startled fall and the same
fatal "headlights" MP-capture ending as the wrong-wire cut. Cutting too late (after
the sequencer completes its countdown) detonates the bomb for real. There is a
narrow correct window signaled by the escalating "Zero minus N minutes" call-outs
culminating in "Zero minus forty-five seconds. Commence auto-sequence" — cut
immediately once you see that line (in our verified run, 15 `z` waits after the
panel is opened and lit).

### [epilogue] The prologue replays itself, now with foreknowledge

After the wire cut, you're returned to Palace Gate in Kensington Gardens at the
very start of the game's timeline again — the paradox the mysterious voice warned
about. The epilogue repeats the prologue's actions (get ball, gnomon, feed the
birds, chase the ruby, etc.) essentially unchanged; the game ends the moment you
`examine woman` at Lancaster Gate a second time, printing "The End" rather than
looping again. No new puzzle content here — it's a deliberate narrative echo, not a
second playable act.

## Score ceiling

The verified command list scores a perfect 100/100 ("rank: Tourist") ending in
"You've completed the story of Trinity." No further optional points are known to be
missing from this trunk.
