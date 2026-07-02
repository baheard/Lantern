# Curses — puzzle-logic analysis

Sources: `curses.txt` (Marc Leduc "The Solution to Curses 1.6" — primary terse trunk;
Russ Bryan's 554-point prose walkthrough — reasoning/cluing cross-check). Verified
command list: `curses.cmds.txt` (`--strict --seed 1`, ends "*** You have won ***",
541/550, rank "master Druid", 1544 turns). Build: Release 16 / Serial 951024.

## Structure at a glance

Curses is a sprawling **time-travel treasure hunt** anchored to one house: Meldrew
Hall. You start in the attic looking for a tourist map of Paris for the family
holiday; sixty generations of a family curse stand in the way. The game layers:
(1) the **present-day attic/cellars** hub; (2) **dream/vision excursions** entered
through books, Tarot-fed slide projections, and artworks (Belle Epoque Paris, ancient
Alexandria, Hamburg, druidic Britain); (3) the **lagach artwork network** — saying
`<artwork>, lagach` at any of a fixed cycle of artworks (painting → frieze → mosaic
→ mural → mural → still life → writings → …) hops you between eras, and is the main
mid/late-game transport; (4) the **rod meta-puzzle**: ten magic rods, most disguised
as mundane objects, revealed by waving them while wearing a Merlyn's Hat (the daisy
chain / yellow daisy) and named in the Octagon's gilded coffin; and (5) the
**master game** — a final self-contained druid-era vignette entered by socketing
nine rods around the Infinity Symbol.

Verification notes that recur below: the harness's `--seed 1` fixes interpreter-level
`Math.random`, but two late scenes (Austin's wander, the sceptre word-spin) depend on
that stream in a way snapshots do NOT carry — any edit upstream of those markers must
be re-verified with a **full** `--seed 1` replay, never a snapshot probe.

## ⚠ RANDOMIZED / TIMING-SENSITIVE BETWEEN PLAYS

Hints must teach the method, never our seed-1 literals:

1. **Austin's wander** ([austin-alexandria]) — the cat's patrol schedule is random
   per play. The trunk's 364 waits are seed-1 empirical timing. Hint the method:
   follow/find Austin, lure or wait for him in Over the East Wing, push him toward
   the Souvenirs Room.
2. **Sceptre socket words** ([sceptre-socket-turn]) — each bare `turn sceptre` spins
   to a random word; our 8/14/4 turn counts are seed-1 artifacts. Hint: keep turning
   until the required word (si / huth / thu, read from the coffin inscription +
   dog-eared letter) comes up.
3. **Rod of Returning landings** ([maze-foundations]) — where it drops you can vary;
   the trunk assumes the Attic.

## [attic-start] Wake in the attic, drop the attic key down a crack

Tutorial-scale scene-setting: the attic key is deliberately lost down a floorboard
crack early (the game forces it). It is recovered much later via the robot mouse
([mouse-hole]) — a classic Curses long-range setup/payoff pair.

## [radio-gloves] Airing cupboard, radio to Jemima's lair, wait for gloves

The wireless radio in the airing cupboard tunes to Aunt Jemima downstairs; the old
gardeners' gloves arrive if you wait. The gloves matter twice later: handling hot or
electric things, most memorably closing the sparking Octagon coffin.

## [torch-battery] East annexe — new battery for the torch, take the rucksack

The electric torch is the game's light source; the fresh battery future-proofs it.
The canvas rucksack is the carry-all — Curses has a strict hands-full limit and the
parser auto-stows ("putting X into the rucksack to make room"), which several later
puzzles trip over (see [nine-rod-sockets]).

## [painting-mask] Cupboard: painting of Mad Isaac, gas mask

The painting of Mad Isaac is later hung on the White Hallway hook (lagach anchor +
sceptre access); the WWII gas mask is required for the fume-filled north cellar
passage ([ghastly-door]).

## [dumbwaiter-basement] Dumbwaiter down to the basement, wrench, chicken bone

First contact with the dumbwaiter transport system (see [wheel-quirk] for its full
mechanics). The wishbone bribes the roof ghost ([ghost-key]); the wrench fixes the
library-storage pipe ([library-storage]).

## [mouse-hole] Robot mouse maze puzzle — recover the attic key

The clockwork mouse is steered by spoken commands (`mouse, w`, then `hole, w` …)
through the wall cavity to fetch the attic key dropped at the start. Pure
maze-by-proxy: the mouse relays what it finds; the fixed direction list in the trunk
is the maze solution.

## [ghastly-door] Gas mask, unlock north basement door (10-pt door for later)

The brass key unlocks the north basement door behind the fumes (gas mask required).
Opening it now is pure setup — the door is the coal-bunker/Octagon access used for
the rest of the game and is worth points on its own.

## [teachest-dream] History book, sleep, the mascot dream, escape

Sleeping after reading sets up the first dream vignette. The History of the Meldrews
is the game's lore engine: nearly every major puzzle (Anton's chess sacrifices,
Merlyn, Roger's photograph) is clued by looking up names in it. The hint rule for the
whole game: *any new proper name → look it up in the history.*

## [chocolates-daisy] Dictionary/scarf, parcel, calendar, chocolates for Jemima

Feeding Aunt Jemima the chocolates gets her weaving the daisy chain — the present-day
**Merlyn's Hat** that reveals disguised rods. This is the quiet start of the game's
central meta-puzzle.

## [darkroom] Postcard, flash + red battery, photograph, Roger lookup

The darkroom photograph names Roger; the history lookup on Roger clues the
demon/lighthouse thread. The photographer's flash + nasty red battery are the Kraken
weapon components ([frieze-kraken]).

## [ghost-key] Roof, key guarded by a ghost, wishbone bribe

The ghost on the roof wants the wishbone (chicken bone) in trade for the key. Fair
trade-with-the-supernatural pattern; no trick beyond having brought the bone up.

## [priests-hole] Fireplace squeeze, priest's hole, hatch down to cellar

Entering the fireplace requires dropping (nearly) everything first — a pure
inventory-gate. The priest's hole hatch is another one-way route into the cellars.

## [wheel-quirk] The dumbwaiter wheel — turn off then on, back to attic loop

The dumbwaiter is the house's vertical spine and its mechanics are the single most
re-used (and most confusing) transport in the game. Empirically verified rules:
- The **wheel** (present at Storage Room/attic and at Cellars/bottom) hoists the
  EMPTY dumbwaiter toward the wheel you turn: at Cellars, `turn wheel` = "hoisted
  into view" (summons it down); at Storage Room with the car already there it hoists
  it away out of sight (don't).
- **Riding**: `enter dumbwaiter`, then each `pull rope` climbs exactly ONE stop UP
  (Cellars → Dark Shaft → Storage Room). There is no ride-down command — descending
  is done by entering at the attic with the wheel freshly turned (the car sinks under
  your weight to the bottom), or by walking/hatch routes.
- The **Dark Shaft** middle stop is the only access to Dark Passage → sandstone
  passage → the Octagon.

## [medicine-bottle] Old Furniture room medicine bottle

Carried unopened for a long time; the garden roller crushes it later to free the red
antidote tablet ([medicine-bottle-crack]) — swallowed pre-emptively before the museum
capture ([museum-capture]).

## [library-storage] Observatory glass ball, library storage pipe/books

Fixing the pipe with the wrench and cleaning the glass ball are point/gear pickups;
the room's real role is the **book of Twenties poetry**: reading it dreams you to
Belle Epoque Paris (Unreal City). Crucial quirk: the poetry book *never travels* —
it always stays behind in the present, so every Paris trip starts from this room
(or wherever you last left the book).

## [sosostris-tarot] Madame Sosostris consultation, discarded Tarot cards, Bohemia mural

First Paris trip. Madame Sosostris the clairvoyante reads cards; the discarded Tarot
cards you collect afterwards drive the slide-projector vignettes (each card = a
destination). "Say even" answers her question. The Bohemia mural is a lagach anchor.

## [boat-to-garden] Silk handkerchief lures the boat, ride it back to the Garden Stream

The glass-roofed Seine tourist boat (the *Phlebas* — Eliot joke) is the Paris↔home
ferry. Wave the silk handkerchief to lure it, board, and `say time` to cross times.
Used three times in the trunk, including the very last trip home.

## [maze-roller] Garden roller through the hedge maze; get the miniature

The garden roller flattens a path through the hedge maze — you drive THROUGH the
maze rather than solve it. The miniature painting is a treasure/lore item.

## [medicine-bottle-crack] Roller over the plaster bust; crack the bottle for the tablet

Two crush-jobs with the same tool: the bust reveals the well; the medicine bottle
yields the red tablet (antidote, swallowed before the museum trap).

## [wine-cellars-shortcut] Wine Cellars hatch down; dumbwaiter wheel back up

The barrel-hatch under the tub at Beside the Wall is a **one-way** garden→Wine
Cellars drop (the barrel-shaft is too steep to climb back). Pairs with the
dumbwaiter for the return. This one-wayness matters again in the endgame
([rod-of-infinity] return leg).

## [slide-ace-cups] Slide projector + Ace of Cups: model ship, storm, wake in the attic

The slide projector + a Tarot card = a projected vignette you physically enter. Ace
of Cups → the model ship voyage; the vignette ends by design (storm) and returns you
to the attic. Pattern for all card slides: the card chooses the world.

## [alison-dream] Fool card, Roman cross, Alison's writing room, the melancholy dream

Alison's writing-room dream supplies lore and the mirror scene used by the optional
Evans-conscience bit (excluded from trunk). The Fool card and Roman cross gate it.

## [daisy-chain] Aunt Jemima's daisy chain (Merlyn's Hat) — required for disguised rods

The finished daisy chain is THE key meta-item: worn, it reveals any disguised rod
when you **wave** the disguise. It is not ready immediately after "say yellow" — you
must wait at the lair. Its master-game counterpart is the yellow daisy
([master-game-druids]).

## [gold-key-clover] Break the window, gold key on the balcony, four-leaf clover

The gold key (under the window sill, balcony side) opens the box in the starting
attic room — revealed only by *closing* the attic door — containing the four-leaf
clover: a disguised rod (Rod of Luck, fittingly).

## [octagon-rods] Sandstone passage opens; the Octagon: name three rods (stick, spar, clover)

The Octagon's gilded model coffin **names** featureless mahogany rods: put a rod in,
close the lid (gloves! it spits sparks), open — the rod is named. The dog-eared old
letter (from breaking the charcoal-sketch frame) is the decoder for the coffin
inscription. First batch: sooty stick, timber spar, four-leaf clover.

## [sceptre-hamburg] Sceptre from the umbrella stand; Hamburg map to the Museum of Arcana

The sceptre hides in the White Hallway umbrella stand (hang Mad Isaac's painting
first). The Hamburg map is a lagach-free transport to the museum — where the next
trap is deliberately sprung.

## [museum-capture] Trip the alarm, get drugged/jailed, eat the antidote, escape with Rod of Returning

An intentional capture: Doktor Stein drugs you, but the red tablet (swallowed in
advance) is the antidote, letting you escape the cell WITH the museum's Rod of
Returning — the first fully-revealed rod and the game's teleport-home tool
(`strike` then `point ... at me`).

## [maze-foundations] Bean pole from the maze-building past; weed-killer FIRST

In the past where the hedge maze is being planted, the bean pole is the disguised
Rod of Stalking. Hard ordering rule: squeeze the weed-killer bottle on the seedbed
BEFORE taking the pole, or the Folly collapses on you (death). Clued by the
inaccessible spot seen when viewing the maze from the Family Tree.

## [marble-rose-lagach] France again, roller to the marble rose, name the last three rods

Second Paris dream + roller trip collect the marble rose (the knight's gift, much
later) and complete another coffin-naming batch, opening the bronze mural passage
(strike Rod of Bronze, point at the bronze mural).

## [contraption-panel] Gravestone, Universe Maintenance Room, HENRI BLACK POST panel

The letter-panel contraption is order-dependent: the bronze-wall trick must be done
first or the panel is unsolvable. The three words (HENRI/BLACK/POST) are assembled
from clues found around the network.

## [temple-of-zeus] Maiden card → Alexandria: thorns, luck, Homer's questions, amber gem

The Maiden slide leads to ancient Alexandria/Zeus's temple: burn the thorn wall,
use the Rod of Luck to slip past Zeus, answer Homer's three literary questions, push
the god-statues into place, and take the **amber gem** — the Necropolis key
([necropolis-amber-gem]).

## [priestess-oracle] Rod of Husbandry clears the goats; the priestess's dig riddle

The Rod of Husbandry (shepherd's crook) herds the goats away. The priestess's verse
riddle encodes the croquet-lawn dig coordinates ("eight paces west and a pace north"
— authored verse, not randomized). Payoff lands far away in the present
([croquet-dig-squirrel]).

## [bomb-defusal] Castle card: the Ruined Castle Cafe bomb, wire colour order

Defuse by pulling wires in the priestess's colour order (blue/green/black/red) —
a cross-vignette clue link. The bomb's timer is salvaged for the Kraken flash rig.

## [frieze-kraken] Star card: flash + timer in the Lighthouse device kills the Kraken — and you

The mirrored lighthouse device armed with the photographer's flash + bomb timer
summons and blinds/kills the Kraken. **You die in the blast — intentionally.** You
resurrect at the Family Tree stripped of inventory and must lagach back to the
Lighthouse to reclaim everything. One of the very few designed deaths in IF that is
required for a full-score run.

## [austin-alexandria] Push Austin through the charcoal-sketch wall

Austin (Mad Isaac's immortal cat) must be startled through the projected
charcoal-sketch wall: get him into the Souvenirs Room and JUMP. The wait-for-Austin
timing is play-specific (see RANDOMIZED, above). Hint the method: find/follow the
cat, be patient, push him room-to-room toward the sketch.

## [necropolis-cloak] Bird-whistle cloak, Dionysus procession, anoint with oil

The cloak of many colours (fetched by following the bird whistle's guidance) is
Alexandria's social passport: colourful side = welcomed by the Dionysus procession,
grey (inside-out) side = admitted to grim places ([sosostris-oak-timber]). Anointing
with oil joins the rite.

## [callimachus-scrolls] Swap the poets' scrolls to spark a librarian brawl

At the Library of Alexandria, swapping the epic and short poems between the alpha
and kappa courier tubes sets Callimachus and Apollonius (real rival poets) brawling
(+7). The smooth stone and rusty key wash up at the port afterwards; the stone is
the palace-maze compass ([parade-into-palace]).

## [spindle-hairband-rods] Name spindle + hairband — Rod of Ice and Rod of Sacrifice

The last two disguised rods of the main game: Alexandria's spindle and Andromeda's
hairband, waved then coffin-named. Both are load-bearing in the finale (Ice cools
the High Rods; Sacrifice wins the orb chess game).

## [hollow-nuts-mosaic] Green branch scares the bird; nuts; Mosaic room wooden ball

Item-chain staging for the squirrel puzzle: wave the green branch to flush the bird
off its nest, take the nuts. The mosaic is another lagach anchor.

## [croquet-dig-squirrel] Dig at the priestess's coordinates; squirrel + sparrows

The 2000-year-delayed payoff: pace 8 west + 1 north from the croquet peg, dig with
the bladed implement → strongbox → astrolabe (gothic key opens it). Then: hit the
croquet ball into the hedge to spook a squirrel into opening a crack, feed it the
nuts to clear the summer house, and blow the bird whistle to quiet the sparrows
guarding the gold watch.

## [necropolis-amber-gem] Amber gem in the tombstone socket opens the funerary chamber

The lagach network lands one step from the Necropolis; the amber gem (from Zeus's
temple) socketed into the tombstone opens the modern-day chamber below — the
gateway to the sphinx/Undertaking sequence.

## [sphinx-time-loop] Sleep-forward through centuries; STAND before each west step

Time-lapse puzzle: sleeping on the couch four times fast-forwards past eras
(Napoleonic officers included); each subsequent westward step walks you era by era
to the modern "Height of Fashion" where twisting the sphinx's nose opens the way.
Mechanical gotchas (verification-relevant): the exact z/look interleaving in the
trunk is load-bearing against full replay (a confirmed snapshot-vs-full-replay
divergence), and you must STAND before each west step after the first — the couch
traps you.

## [sceptre-socket-turn] Quite an Undertaking: si / huth / thu

The sceptre goes into three sockets in turn; each must be spun (`turn sceptre`,
random word per spin) until the correct Egyptian word shows: **si, huth, thu** —
decoded from the coffin inscription + dog-eared letter. The sceptre must be re-taken
before each socket. Success springs the coffin; entering it and closing the lid
twice sends your spirit up to the Sarcophagus in the old parish-church crypt. (Turn
counts in the trunk are seed-1 artifacts — see RANDOMIZED.)

## [sosostris-oak-timber] Grey cloak into Sosostris's Consulting Room; oak on the table

Wearing the cloak inside-out (grey) admits you through the defaced door. Putting the
green oak timber on her table completes a two-thousand-year setup: it seasons into
the sceptre's shaft, paying off with a silver keepsake — later shown to the knight.

## [parade-into-palace] Cloak etiquette + purple sash + papyrus maze

Three social/navigation gates in a row: colourful cloak to be waved through the
procession NE; cloak fully OFF before meeting the palace guards (wearing it there is
fatal); purple sash to walk the twisty maze. The maze solution is the papyrus
fragment read BACKWARDS with the smooth stone as compass: NE, E, S, then say
"anoppe" to be led to the Palace Balustrade.

## [spire-to-hand] Astrolabe on the mounting: Alexandria → present-day church spire

Mounting the astrolabe and looking through the eyepiece teleports across two
millennia to the church spire above the village. The loose adamantine hand comes
along — first of the knight's three parts.

## [knight-assembly] Hand/skull/heart, TIGHTEN each, Rod of Fire animates; point+step to lead

Assembling the headless knight statue: each part must be PUT then explicitly
TIGHTENED (put alone leaves it loose and the animation fails). Strike + point the
Rod of Fire to animate him. Leading him is a repeated pair: `point <direction>` then
walk that direction yourself — he only moves on your own subsequent step, and one
pair is not enough. The marble rose and silver keepsake win his service; he hauls
open the Moonstone.

## [high-rod-of-love] Choose ONE High Rod; Ice to cool it; take TWICE

The knight's descent reveals the three High Rods (Life / Love / Death). The chosen
rod must be cooled first (hold + strike Rod of Ice, point at it). The first `take`
prints only a one-time balance warning and does NOT take it; the second take
actually works — and irrevocably tumbles the other two away. Decide before touching
anything. The trunk takes **Love**.

## [orb-chess-sacrifice] Anton's flair for sacrifices: point the Rod of Sacrifice AT WHITE

Cleaning the golden orb pulls you inside an 8×8 crystal lattice — a chess game, per
the history-book chain Helene → Anton ("a flair for sacrifices"). Wait until the
rotating flavor text establishes you're identified with White (the attacking side),
then point the Rod of Sacrifice **at white**. Pointing at the board or at black is
death by checkmate — the parser resolves those nouns to the same object, but only
"white" triggers White's own sacrifice combination. The orb comes out golden and
charged: it is the power source for the lemniscus.

## [nine-rod-sockets] Infinity Symbol cave: nine rods in nine sockets

Route home: village footpath south from Stone Cross, southwest along the drive, up
through the East Annexe to the attic, dumbwaiter down, wrought-iron key on the
ironbound west cellar door, NW into the Infinity Symbol cave. Nine sockets take nine
rods (Bronze, Fire, Ice, Husbandry, Luck, Returning, Stalking, Sacrifice, High Rod
of Love). Parser trap: each rod must be explicitly HELD before `put ... in socket` —
the hands-full auto-stow otherwise silently swallows the next rod and the put
no-ops. The first rod seated opens the small spherical opening (the orb's socket).

## [rod-of-infinity] The tenth rod is the Eight of Wands

The Eight of Wands Tarot card is the last disguised rod. `wave wands` (NOT "wave
eight of wands" — the parser treats that as multiple objects and refuses) while
wearing the daisy chain melts it into a featureless mahogany rod; the Octagon coffin
names it the **Rod of Infinity**. You keep this one out of the sockets. Return leg
goes overland (Dark Passage north to Garden Stream, east, down the one-way
barrel-hatch) since rope-pulls only go up.

## [lemniscus-launch] Orb in the opening, strike Infinity, point at the lemniscus

Orb seated + all nine rods socketed + strike the Rod of Infinity + point it at the
lemniscus = the marble disc spins up and launches the **master game**. You arrive in
druid-era Britain empty-handed (everything is heaped back at the cave for later).

## [master-game-druids] Daisy, horn, sandals, torch-in-well, Hypocaust eavesdrop

The master game compresses the whole game's grammar into one vignette: the yellow
daisy (swing the rope to reach it; this era's Merlyn's Hat), the summoning horn, the
leather sandals (wear them — hot-coals insurance), and the flaming torch dropped
into the well BEFORE descending (you can't gauge the depth otherwise). From the
Hypocaust under the villa: BLOW the horn to summon the druid council, WAVE it (=
Rod of Language), point it at yourself to understand Celtic, and wait out the full
council scene — the game's big reveal: the druids created the family curse (the
seek-the-desired-object compulsion) to preserve their power through time.

## [master-game-tent] Saxon spy, tent pole, hot coals, blue stone, Rod of Returning

Deliberately surrender (west, up). In the Rough Tent, wait until the Saxon spy is
hurled in and nearly snaps the centre pole — that's the cue that the pole is now
takeable (taking it collapses the tent and you crawl out unwatched). East over the
hot coals (sandals!), take the blue stone at the dolmen, wave the tent pole (= Rod
of Returning), point it at yourself → teleported home to the Infinity Symbol.

## [paris-map] Blue stone = fifty-franc note; SAY CARTE

The finish of the sixty-generation quest. Reclaim the rucksack and the still-lit
torch (do NOT `open torch` — that's the battery compartment and it kills the light;
dark cellars are fatal). Dumbwaiter to the attic, poetry book from Library Storage,
read it → Unreal City. At Chatelet-les-Halles, wave the blue stone — it melts into a
fifty-franc note — pay the surly map man, and `say carte`: he hands over **a tourist
map of Paris**, the useless object every Meldrew was doomed to seek. The Phlebas +
`say time` sails you home (landing, neatly, at the Infinity Symbol).

## [ending-attic] Down through the trapdoor where the game began

Dumbwaiter up to the attic one last time and DOWN through the trapdoor: the curse is
broken and the game ends — *** You have won ***, 541/550, master Druid. (In the
closing joke you leave the map on the kitchen table anyway.) The 9 missing points
are the deliberately-excluded Evans mascot theft/conscience detour and minor
optionals.
