# Bronze — Puzzle-Logic Notes

Companion to `bronze.txt` (raw walkthrough) and `bronze.cmds.txt` (`--strict`-clean,
seed 1). These notes capture the *method* and the *why* behind the commands — the feedstock
for hint authoring. Source: Emily Short's official Bronze walkthrough + ClubFloyd transcript
(Release 11 / Serial 060503), cross-checked against a full headless replay
(`node tools/play.cjs bronze --strict --status --seed 1 --file …`). Every mechanic below was
*observed in the replay transcript* unless flagged "(branch — from walkthrough, not in trunk)".

## Premise / framing

You are the milkmaid heroine of a Beauty-and-the-Beast retelling, returning to the Beast's
castle after a seven-day visit home. The castle is a single connected map (no acts/days) —
**phase scoping is N/A**: the status-bar right region prints only compass/clock junk
(`U NE`, `NW N NE`), never act/day context. So hint sections are **location-only**.

Opening prompt: *"Have you played interactive fiction before?"* — `YES` = normal play, `NO`
= **novice mode** (extra inline guidance). The walkthrough answers `YES`. Not a puzzle, but
worth a flat note so a player isn't surprised by the question.

`HELP` lists the game's special verbs. Two QoL systems players must understand or they'll
suffer:

- **`GO TO <place>` auto-walks** to any room you've already visited (prints the route). After
  the early exploration this is how you traverse the castle. A player navigating compass-only
  the whole game is doing it the hard way.
- **`LOOK UP <topic> IN <book>`** is the game's lore/clue engine. Four reference objects:
  the **contract book** (Law Library — souls' contracts; this is also the book you must later
  destroy), the **records** (Records Room — castle history, incl. *Yvette*), **Lucrezia's
  notes** (her sealed study — the deepest clues: shoes, scrying, ivory/elephant), and the
  **storybook**/**LIE library** material in the servant-freeing branch. Most hard puzzles are
  *clued by a lookup*, so "have you read X about Y?" is a recurring legitimate nudge.

## The two telepathy/perception items (acquire-early enablers)

- **Helmet** (Scarlet Tower windowsill). `WEAR HELMET` → "sharpened hearing". Lets you
  *hear the chimes* that summon the phantom guards (and later hear/`LISTEN` for buried
  servants). It's the sentry's helmet; the writing on it is untranslated until the Translation
  Room is lit. Take it off (`TAKE OFF HELMET`) when the magnified breathing is in the way.
- **Cloven shoes** (locked in the Treasure Room iron cage). Once worn they give a **telepathic
  link to the Beast** — his thoughts intrude as you move ("The Beast's thoughts intrude on
  yours, courtesy of the enchanted shoes…"), which is both flavour and a steady source of
  directional hints. **But the shoes are too big to wear until resized** — see "Shoes" below.

## The phantom-guard chimes (opens the State Rooms)

**Symptom the player sees:** moving N from the Central Courtyard (toward the State Rooms) — and
N from the Great Dining Hall — is blocked by a *phantom guard* who appears with a sound of
chimes, then disperses when you back up. With the helmet on you can `LISTEN` and tell the
chimes come from elsewhere.

**Mechanism:** the chimes hang in the **Rose Garden** (down from the Cloister Walk). They are
out of reach and *locked to their chain*. Solution chain:
1. You need height — **stand on the stool** (the stool comes from the Guest Bedroom area; carry
   it). `JUMP` is the wrong-theory red herring the game explicitly rebuffs ("you don't attain
   much height").
2. They're padlocked — **unlock with the small key** (hangs in the Scrying Room; also opens the
   small door to the Treasure Room).
3. `GET CHIMES` while standing → "you take the chimes down, silencing them … they fade and
   vanish." Guards gone; State Rooms open.

Hint-worthy because the obstacle (a guard) and the cause (chimes elsewhere) are spatially
separated, and two prerequisites (stool + key) gate the fix.

## The dying Beast → feed him (gets the iron key)

**Symptom:** once the State Rooms open, the Beast is found collapsed and near death in the
**Upper Bulb** (top of the giant hourglass/silo, via Law Library → Lower Bulb → up). *He may
appear in a different room — the walkthrough notes he shows up after roughly half the rooms are
explored.* `WAKE`/`KISS` do nothing; `X BEAST` says he must be **fed** before he'll revive.

**Mechanism — the bell system's first instance:** the **gold dinner bell** summons the ghost
chefs, **but only works rung in the Enormous Kitchen** (rung elsewhere: "it only works in the
Kitchen itself"). After ringing, a **feast appears in the Great Dining Hall** — go get it,
then `FEED BEAST`. He revives, explains the goal (destroy the contract book in Lucrezia's
sealed basement room, free the enslaved souls), and **hands you the iron key** + tells you
you'll need the shoes.

## The bell system (the game's master mechanic)

The Bellroom (off the Private Parlor) holds many instruments. **Each instrument is stamped with
a servant's trade and invokes that servant's power, usually only in the right place.** This is
*the* recurring mechanism — once a player groks "match the instrument to the servant to the
room", most of the late game is legible. Observed mappings:

| Instrument | Servant / sign | Effect | Where |
|---|---|---|---|
| Gold dinner bell | chefs | summons a feast | rung in the Enormous Kitchen |
| Silver bell | lamplighter | relights candles / illuminates | rung in the dark Translation Room |
| Leather tambourine | shoemaker | resizes the cloven shoes | struck in the Empty Bedroom (where the shoemaker worked) |
| Cow bell | Yvette (milkmaid) | scrying / contact Yvette | Scrying Room / the Mirrors (Crystal Bedroom) — *branch* |
| Worked bronze gong | elephant djinn | destruction / vengeance | struck at the Elzibad painting, then the Beast — *branch* |
| Glass bell | librarian | activates the LIE library lectern | the book-stand, to destroy the contract book — *branch* |

The Beast warns you **not to ring bells whose purpose is unknown** — ringing the gong blind
just fails ("nothing happens"). So the intended loop is: identify a bell's owner (its stamp +
a `LOOK UP` lookup), then ring it in the matching room. Good hint fodder: nudge toward "what is
this bell *for*, and who would answer it?" rather than naming the room.

## Lighting the dark / the Translation Room candle

The underground (below the Rose Garden, and the maze room) is **dark** — you need a light. The
**Translation Room** (W of the Lower Bulb) has gone dark; ring the **silver bell** (lamplighter)
there and it blazes up, leaving a **candle** you can carry. The lit Translation Room also
*translates* otherwise-unreadable scripts (the helmet's writing, etc.). So the candle is both
your portable light and tied to the lamplighter bell — don't hint "find a candle"; hint at the
lamplighter's bell and the dark room that needs relighting.

## Shoes: resize, then wear (telepathy unlocked)

The cloven shoes (from the iron cage) are "made for something with cloven hoofs" — too large
to wear. Clue trail: **Lucrezia's image in her study** shows a gnome shoemaker resizing her
shoes, and she holds a **leather tambourine**; `LOOK UP SHOES IN THE NOTES` confirms the shoes'
power (mastery over the territory of the dead + a memory/connection link). **Fix:** carry the
tambourine to the **Empty Bedroom** (where the shoemaker worked — "here your father stayed")
and `HIT TAMBOURINE` → a wind resizes the shoes. Now `WEAR SHOES` → telepathic link to the
Beast switches on. The shoes are also the *credential* for entering the crypt/dead-spaces.

## The sinister door / steward summons (raking-light inscription + a 5-minute timer)

Underground past the Rooted Room is a **Tight Passage** with a **sinister door**, a **pull
cord**, and an **inscription** you can't read in the dark. Two-part puzzle:

1. **Read the inscription:** the lettering is low on the wall and the candle held normally
   doesn't reveal it. **Drop the stool, put the candle ON the stool** → "harsh raking
   illumination … at knee height" makes the inscription legible. (Pure light-angle puzzle; the
   candle in hand isn't enough.) It reads: *pull the cord, then wait in the room directly above
   to speak with Lucrezia's steward — within five minutes, or he departs.*
2. **Summon the steward:** `PULL CORD` (a deep bell tolls above), then go **up to the Rose
   Garden → Parliamentary Chambers** (the room above) and `WAIT`. The steward's presence speaks
   Medici-Credenza Italian and a sealed door opens below — **Lucrezia's Study**. **Timing
   matters** (the inscription states the 5-minute window). The replay needed a couple of cord
   pulls + waits; a player who dawdles must re-pull.

Lucrezia sealed her own rooms against all her descendants — the Beast literally cannot enter,
which is why *you* (not a descendant) must do this.

## The crypt (ivory key, girdle, gong/harness)

Below the Law Library is a multi-room **crypt** (Father's Regret, Central Crypt, Debtor's
Paradise, Apprentice's Workshop, Virgin's End, Guard Tower, etc.), entered via the **ivory
door** (top of the hourglass, SW from Upper Bulb) and/or the decaying ladders. Key finds:

- **Ivory key** — in the drawers (`OPEN DRAWERS`) of Father's Regret. (Note the **harness** in
  the crypt is *immovable*, "like the gargoyle" — a deliberate red-herring "treasure" you can't
  take; the gong is the takeable elephant-djinn item, found in the Bellroom.)
- **Yvette's girdle** (branch — see below) — also in the crypt; needed to cure the Beast.
- The crypt floors "sound strange" — atmosphere, and a `LISTEN`/`JUMP` interaction with buried
  servants in the servant-freeing branch.

## Yvette & the curse (the backstory that gates the ending)

`LOOK UP YVETTE IN THE RECORDS`: the king abducted brides under contract; he stole **Yvette**,
a milkmaid descended from **Lucrezia the Enchantress**, who carried a **magical girdle**. Yvette
cursed him into a Beast — liftable only when *someone who is **not** under magical contract
loves him*, **and wields the power of that same girdle**. This is the spine of the cure ending:
you (uncontracted) + Yvette's girdle + a kiss. The **cow bell** is Yvette's instrument (the
woodcut shows her with it) — ring it in the Scrying Room / Mirrors to contact her (branch).

## Endgame — the choice point (branches; mostly from the walkthrough, past the cmds trunk)

`bronze.cmds.txt` ends at the **choice point**: after `GO TO ELZIBAD` + `RING GONG` (which
primes the elephant djinn at the assassination painting — "here is how tyrants are ended").
From there the walkthrough forks. These are *branch* mechanics (verified only as far as the
trunk; the rest is from Emily Short's walkthrough):

- **Branch 1 — Cure the Beast (the "good"/romance ending).** Contact Yvette (`RING THE COW
  BELL` in the Scrying Room, then at the Mirrors), retrieve and `WEAR` the **girdle** from the
  crypt, then `KISS THE BEAST`. (Kissing without the girdle/setup does nothing — observed
  early: an unprepared `KISS BEAST` "he does not stir".)
- **Branch 2 — Vengeance.** `RING GONG` at the Beast → the djinn destroys him.
- **Sub-branch (either ending) — Free the servants first.** A long optional sequence: gather
  the buried servants' tokens (helmet + `LISTEN`/`JUMP`/`OPEN STONE` in the crypt and below),
  fetch the **inkpot** (Black Gallery), **fill it** (Press Room), put the **contract book** on
  the **LIE library stand**, and `RING THE GLASS BELL` (librarian) to rewrite/destroy the
  contracts — freeing the enslaved souls. This is the thematic payoff (the Beast's original
  plan) but is **optional** to reaching an ending.

So the *required* spine to an ending is much shorter than the full walkthrough, which front-loads
exploration and lore and then does the optional servant-liberation. For hints, treat
servant-freeing and the Yvette/girdle cure as **late/optional** sections, and don't let a player
browsing them think they're mandatory to "win".

## Red herrings / things that look like puzzles but aren't

- **The gargoyle** (Ground Floor Helical Staircase) — immovable, "harmless"; explicitly *can't*
  be taken. The game even mocks the attempt. Flat "no" answer.
- **The immovable harness** in the crypt — same gargoyle-class non-takeable.
- **`JUMP` at the chimes** — rebuffed; the real solution is the stool.
- **Sceptre / puzzle piece** from the cage — the puzzle piece completes the jigsaw (a lore
  reveal: devil + king, "TIME IS ON MY SIDE / BUT NOT FOR LONG"); the sceptre is largely flavour.

## Hint-section shape (suggested)

Geography-driven, play-order. Candidate sections (all location-only, no `phase`): Entrance &
Galleries (orientation, helmet, GO-TO/LOOK-UP systems) · Treasure Room & Scrying Room (cage,
small key) · Rose Garden & Cloister (chimes/guards) · State Rooms & the Bulbs (dying Beast, gold
bell/feast) · The Bellroom (the bell system itself) · Translation Room (silver bell/candle) ·
Bedrooms (shoes + tambourine) · Underground & Sinister Door (candle-on-stool, steward timer) ·
Lucrezia's Study & Crypt (notes, ivory key, girdle) · Endings (gong vengeance vs. Yvette/girdle
cure; + optional servant-freeing, segregated/labelled).
