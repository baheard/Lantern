# Theatre — Puzzle-Logic Notes

Companion to `theatre.txt` (Dorothy Millard walkthrough, PC/Amiga) and `theatre.cmds.txt`
(verified command list). These notes capture the *method* and the *why* behind the commands —
the feedstock for `generate-hints`: teach the mechanism, never leak the commands.

Build: Brendon Wyber (Cave Rock Software Ltd.), PC version. Verified via
`node tools/play.cjs theatre --status --file docs/games/walkthroughs/theatre.cmds.txt`
— runs deterministically up to EXAMINE STATUE in the Witch's Lair (the cutoff point in
`theatre.cmds.txt`). Every mechanic below is **observed in `tmp/theatre_trace.txt`** unless
explicitly flagged.

---

## ⚠ RANDOMIZED — socket-ceremony order (hint-critical — read first)

The witch's-lair statue has **four eye sockets** and accepts all four pearls. The order in
which the pearls must be placed is determined by the goblin's responses in the mine: each `SHOW
<COLOR> PEARL TO GOBLIN` response names a "rank" — Control / Mana / Strength / Wisdom — whose
relative ordering maps to the socket positions (the walkthrough describes a diamond-shaped
socket layout). **The four SHOW PEARL responses are assigned via `@random` each run.**

The cmds file stops at `EXAMINE STATUE` because the socket order cannot be baked into a
deterministic command list. Hints for this puzzle must teach the *method* (note each goblin
response, map it to a socket position, place accordingly) rather than naming a fixed sequence.

---

## Premise / framing

You are a property developer who left your pager in the basement of an old theatre while
showing it to potential buyers. You return to fetch it — and find your car stolen and a
knife-wielding thug forcing you back inside. The game's central question becomes: how do you
escape this trap and, more urgently, stop an occult ritual from consuming your soul?

**Opening prompt:** none. The game opens mid-scene with no special-verb tutorial. Players who
type `HELP` get a brief list.

**Special systems:**
- **Loose pages** — a collectible scattered throughout the building. Three points are awarded
  for reading all of them (`READ PAGES` near the end of the game). They are not used to unlock
  any individual puzzle, but a note embedded in the walkthrough says reading all pages awards 3
  points. Players who skip them lose those points.
- **The pager** — goes off at move 250. The response is `EXAMINE PAGER` then `DROP IT`; if
  ignored it becomes a minor annoyance but is not a hard block. (Observed: pager does go off
  during the sewer sequence at the Centre of Sewer — harmless interrupt.)
- **The ticket** — a gating token used at two separate points (see below). One ticket, two
  uses, but the ghost returns it after the first use.
- **The amulet** — must be worn to safely enter the Witch's Lair (the amulet glows as you pass
  through the archway). Without it the room presumably cannot be entered; the walkthrough makes
  this a prerequisite.
- **Score ceiling:** 50/50 (confirmed by the walkthrough's closing line). The cmds run is not
  a full run — it ends before the endgame.

---

## Lobby / Basement — acquiring the pager and popcorn

**Visible symptom:** your pager is in the basement; you need to retrieve it. The thug outside
blocks the south exit, so escape is impossible for now.

**Mechanism:** The basement is accessed via a trapdoor in the Manager's Office (NW from Lobby,
then D). The pager and a loose page are both on the boxes. A loose `EXAMINE PANEL` →
`TURN ON SWITCH` is required here — the switch powers the electrical lights in the underground
area (observed: "low hum but nothing special seems to have happened" — the effect is felt later).

**Popcorn:** the barrels yield four lots of popcorn (`GET POPCORN` ×4). These are consumed
much later as rat bait in the sewer puzzle. There is no in-room signal that you will need them;
a player who misses them will be stuck at the sewer with no bait.

**The thug sequence:** going S reveals the stolen car and the thug. `EXAMINE THUG` then `WAIT`
×3 then `N` is the forced resolution — the thug drives you back in. You cannot fight, flee, or
bypass him at this stage.

---

## Upper back-corridors — pages, music room, attic, observatory

### Piano → Trapdoor → Attic → Lens

**Visible symptom:** the attic trapdoor in the Prop Room ceiling is out of reach.

**Mechanism:** the piano in the Music Room has wheels and moves. You must `GET MUSIC` →
`PUT MUSIC ON HOLDER` (mounts the sheet on the piano) → `PLAY PIANO` (the waltz plays, which
seems to satisfy a prerequisite for the piano to move) → `PUSH PIANO EAST` (into the South End
of Long Corridor) → `PUSH PIANO SOUTH` (into the Prop Room, directly under the trapdoor) →
`STAND ON PIANO` → `OPEN TRAPDOOR` → `U`.

**Why PLAY PIANO first:** the walkthrough lists it before pushing; observed in trace that the
piano moves correctly only after the music is placed and played. (Unverified whether skipping
the play step would block the push — the walkthrough implies it is required.)

**Attic pages:** two loose pages in the Southern End of the Attic (observed: "+1 point" on
entry). The attic also contains the winch (Attic above the Theatre, centre room).

**Chandelier:** `TURN HANDLE` at the winch room lowers the chandelier to the auditorium floor.
This must be done now — you cannot lower it later from the auditorium side. The chandelier
lowered here is needed for the balcony swing.

**Observatory and lens:** the Attic Observatory (north of the winch room) holds a large
telescope. Removing the lens (`GET LENS`) causes green gas to pour out of the telescope — you
must come back with the gas mask to survive the room long enough to use the lens. The lens
itself is then taken away for the spotlight puzzle.

**Prerequisite chain for the lens:** Lens → spotlight burn (lobby) → patterned lens →
placed in telescope (with gas mask on) → star crystal.

---

## Hallway / alley — corpse, appointment book, ticket

**Visible symptom:** a passage north (from the Cramped Hallway) is blocked by carpet rolls.

**Mechanism:** `MOVE CARPET ROLLS` frees the passage and reveals Rienhart's crushed body.
`GET CORPSE` → `EXAMINE CORPSE` → `READ APPOINTMENT BOOK` (learn about Rienhart's cellular
phone, which is the MacGuffin that motivates the plot). The appointment book cannot be dropped
normally — the game declines (`"You haven't got that."`); ignore this; the corpse is what
matters. The corpse is carried forward and used as poison-bait for the pit creature later.

**Alley Courtyard:** north of the End of Hallway. Contains a closed rubbish bin. `OPEN RUBBISH
BIN` → reveals a loose page and an **old ticket**. Both must be taken. The ticket is a gating
token used at two later checkpoints.

**Stage-door note:** the stage doors to the north of the courtyard are bricked up. The only
exits from the courtyard are southwest (back in) — no puzzle here, just geography.

---

## Lobby portrait → secret gallery → camera

**Visible symptom:** a huge portrait on the Staircase Landing has a painted door in it.

**Mechanism:** `FEEL PAINTING` reveals irregular ridges around the painted door. `OPEN DOOR`
opens it into a real passage — the secret gallery (north). The gallery yields a loose page and
an **old-fashioned camera**. The camera is used later (once) to dispel the shadow creature.

---

## Spotlight → patterned lens

**Visible symptom:** the southern landing has heavy curtains covering something.

**Mechanism:** `OPEN CURTAINS` reveals a patterned circular window. `LOOK DOWN` confirms it
casts a patterned spotlight on the lobby floor below. You must carry the (plain) lens down to
the lobby floor and `PUT LENS IN SPOTLIGHT` — the pattern burns into the lens (+2 points,
observed). The lens is now a "patterned lens" and is later placed in the telescope.

**Prerequisite ordering:** the lens must be acquired from the observatory *before* this step.
The spotlight is always there (street lights, no day/time gate) — but the curtain must be
opened from the Southern Landing.

---

## Chandelier swing → western balcony → secret library → blue pearl

**Visible symptom:** the chandelier is on the auditorium floor, swinging.

**Mechanism:** From the Eastern Theatre Aisle, `PUSH CHANDELIER` sets it swinging (it also
triggers a whisper: "Tickets please" — but you are too early at this point). From the aisle,
`S → E → U` reaches the Eastern Balcony (the canonical cmds get there via a `DROP TICKET`
teleport to the Staircase Landing, then `E → E → U` — same destination). The chandelier's arc
now reaches you: `SWING CHANDELIER` → you swing across to the Western Balcony (+2 points, observed).

**`PUSH` is a hard requirement, verified by review probe (2026-06-24):** `SWING CHANDELIER`
from the balcony *without* a prior `PUSH` →
"You grab hold of the chandelier but nothing much happens. Perhaps if you tried pushing it."
And `SWING` from the *wrong spot* (e.g. straight up from the aisle area rather than the Eastern
Balcony) is **fatal** — "you jumping onto it seems to have robbed it of most of its momentum.
Perhaps if you were higher up. … *** You have died ***". So the answer must teach: lower it
(attic) → `PUSH` it (aisle) → reach the Eastern Balcony → `SWING`. A hole in the wall leads NW into the Back
Wall → S → W into the Secret Library.

**Ghost ticket gate (first use):** when you `DROP TICKET` in the Eastern Theatre Aisle the
*first* time (before visiting the balcony), the ghost says "You are far too early" and teleports
you to the Staircase Landing. The ticket flutters back to you. This is the game signalling the
time-lock (the watch must be set to 7:40 first). **The correct sequence is:** lower the
chandelier → push it from the aisle → swing from the balcony — without dropping the ticket in
the aisle.

**Secret Library:** accessed through the hole in the Back Wall. Contains many bookcases, a
reading recess (two more pages), and a large slug guarding a nest in the southern end.

**Slug → blue pearl:** the slug in the Southern End of the Library is 1.5 metres long and
blocks the nest. The nest contains the **blue pearl**. To get past: go north to the Secret
Library (main room), `UNHOOK CHAIN` (frees a long chain holding the bookcases), `PUSH BOOKCASE`
→ domino effect crushes the slug (+2 points). Now `EXAMINE NEST` → `GET BLUE PEARL`.

**Red herring:** the slug's web-strands and the nest *look* as though they might yield something
else — they don't. Only the blue pearl matters.

---

## Roof → chimney chain → boiler room — key, glue, violet pearl

**Visible symptom:** a crow on the roof; a chest and coal bin in the boiler room.

**Mechanism:** go W from the Southern End of Library → Street Balcony → U → Theatre Roof.
`GET CROW` makes the crow fly *down* the chimney. Follow it: `D` (Guest Star Room) →
`CLIMB DOWN CHIMNEY` (Sealed-Off Office). `OPEN COFFIN` reveals a key inside, which the crow
steals and then drops back down the chimney. `EXAMINE FIREPLACE` → `D` (Boiler Room).

**Boiler Room yields three items:**
1. **Shiny key** — on the floor (dropped by the crow). `GET KEY` (+2 points). Used later to
   unlock the iron door in the Underground Passage.
2. **Bottle of glue** — inside the dirty wooden chest (`OPEN CHEST` → `GET BOTTLE`). Used
   to immobilize the mannequins in the Costume Room.
3. **Violet pearl (raw lump)** — in the coal bin. `GET LUMP` → `CLEAN LUMP` reveals it
   is a **violet eye-like pearl** (not coal). The room name flashes a Latin curse quote on
   entry — atmospheric, not a puzzle.

**Exit:** back up the chimney ×2 to the Guest Star Room → E (corridor).

---

## Costume Room — gas mask (mannequin puzzle)

**Visible symptom:** a gas mask is in the Costume Room (W from Centre of Long Corridor),
but mannequins guard it.

**Mechanism:** `GET MASK` (first attempt) causes the mannequins to hiss and start shuffling
toward you. `BREAK BOTTLE` (the glue jar) splashes glue everywhere, stopping the mannequins
in their tracks. `GET MASK` (second time) succeeds (+2 points). The gas mask is required to
survive the toxic atmosphere in the Attic Observatory.

**Glue bottle timing:** the bottle must be carried here from the Boiler Room. It is a one-use
consumable — once broken, it is gone.

---

## Observatory — patterned lens in telescope → star crystal

**Visible symptom:** the Attic Observatory leaks green gas; you cannot survive it without
protection.

**Mechanism:** `WEAR MASK` (in the attic, before entering the observatory) → enter the
observatory (gas mask protects) → `PUT LENS IN TELESCOPE` (stops the gas flow) → `DROP MASK`
(no longer needed) → `LOOK THROUGH TELESCOPE` (+5 points, observed). You collapse, experience
a vision of an alien presence, and awake holding a **star crystal** — it is not picked up; it
appears in your inventory automatically.

**Sequencing note:** the lens must already be "patterned" (burned in the spotlight) before it
is placed in the telescope. A plain lens would not work.

---

## Sick Bay — tablets, stethoscope, vial, letter

**Visible symptom:** Sick Bay is north of the North End of Long Corridor and accessible only
after working through the upper back-corridor area.

**Mechanism:** `OPEN CABINET` → reveals a loose page, **pain-killer tablets**, and a
**stethoscope**. A **small glass vial** (blue liquid — labelled "poison" in the walkthrough)
is on the bed along with a letter. `READ LETTER` reveals the villain's ("E.") intentions: your
death will awaken one of Earth's former masters. The vial is described as a potion to ease your
final destiny — but its real use is as poison to bait the pit creature.

**Items acquired here:**
- Pain-killer tablets → given to the wounded man (Trent) in the burning mansion, near the end
  of the game.
- Stethoscope → used at the safe in the Manager's Office.
- Vial (poison) → poured on Rienhart's corpse before throwing it in the pit.

---

## Manager's Office safe — red pearl

**Visible symptom:** a closed metal safe with a dial in the Manager's Office.

**Mechanism:** `WEAR STETHOSCOPE` → `LISTEN SAFE` (the game says "perhaps if you turn the
dial you might hear something") → `TURN DIAL LEFT` → `TURN DIAL RIGHT` → `TURN DIAL LEFT` →
`TURN DIAL RIGHT` (four turns total, alternating; each turn produces clicks and a final "Clunk"
on success). The safe opens and reveals the **red pearl** (+1 point, observed). The safe door
swings shut automatically. `GET PEARL` (red) — be specific when other pearls are in inventory.
`DROP STETHOSCOPE` when done.

**This combination is NOT randomized.** The sequence is always the same four alternating turns;
the game cues each step with "Click... Click... Clunk...". It's a safe-cracking mechanic, not
a number combination.

---

## Manager's Office — architect's plans → sealed ticket booth → pocket watch

**Visible symptom:** the south wall of the Manager's Office looks like it has been plastered
over (revealed after reading the plans).

**The booth is invisible until the plans, verified by review probe (2026-06-24):**
`EXAMINE (TICKET) BOOTH` from both the Theatre Lobby and Outside The Theatre →
"You can't see any such thing", and neither room's prose mentions a booth. The player has **no**
awareness that a ticket booth exists until they read the architect's plans in the office — so a
hint question must not presume knowledge of the booth (anchor it to office exploration instead).

**Mechanism:** `OPEN DRAWER` → reveals a loose page and **architect's plans**. `GET PLANS` →
`EXAMINE PLANS` reveals a ticket booth should exist south of the office (1955 plans by
Nelson, Meldrew, and Grahams). `EXAMINE SOUTH WALL` identifies the plaster. `DROP PLANS` →
`KICK SOUTH WALL` breaks through (+2 points, observed — awarded on entering the booth).

**Sealed Up Ticket Booth:** contains a loose page and a human skeleton with a pocket watch.
`EXAMINE WATCH` reveals it reads 3:40 and is stopped. `PULL DIAL` → `TURN DIAL` ×4 advances
the hour hand one hour at a time (3:40 → 4:40 → 5:40 → 6:40 → **7:40**). Setting the watch
to 7:40 unlocks the time gate — the theatre now accepts the ticket from the ghost usher.

**Why 7:40:** the ghost usher will tell you that "7:40 is when the show starts" if prompted,
but in practice the game simply unlocks after the watch is set. The skeleton's backstory (who
is it, why sealed up) is atmospheric and not puzzle-relevant.

---

## Theatre ghost — ticket gate (second use, correct timing)

**Visible symptom:** the ghost usher in the Eastern Theatre Aisle whispers "Ticketsss pleassse."

**Mechanism (time-locked):** this only works after the pocket watch has been set to 7:40.
`DROP TICKET` in the Eastern Theatre Aisle — the ghost says "Enjoy the show!" (+2 points). You
may now proceed north to the Stage.

**Why two ticket uses:** the ticket is first used on the balcony approach (it is returned after
that failed attempt). The second use — in the aisle, after the watch — is the real one. The
ticket is consumed and not returned.

**Prerequisite chain:** Alley courtyard ticket → carried through entire midgame → watch set to
7:40 → drop ticket in aisle.

---

## Backstage / dressing room — serpent, amulet, newspaper

**Visible symptom:** a locked locker in the Dressing Room (above the stage, via rope).

**Mechanism:** backstage is reached via Stage → N (Back Stage) → `CLIMB ROPE` → W (Dressing
Room). `OPEN LOCKER` reveals an **ancient amulet**, an old newspaper clipping, and a coiled
serpent. The serpent is dangerous — do not try to take it. **Reaching in is instant death,
verified by review probe (2026-06-24):** `GET AMULET` with the serpent present →
"As you reach into the locker, the snake strikes, biting you in the hand. … you expire.
*** You have died ***" (and `GET SERPENT` likewise kills you). This is a genuine death trap
with no in-game warning — the hint must steer the player off it. Instead, `PUSH LOCKER EAST` — the
locker tips and falls down to the stage, killing the serpent (+2 points). `D` → on the stage
you find the locker's contents scattered. `READ NEWSPAPER` (reveals Marcilax the magician's
quote: the theatre's mystical energy is dangerous, and his medallion — the amulet — protects
his soul). `GET AMULET` → `WEAR AMULET`. The amulet must be worn when entering the Witch's
Lair.

**A second ticket drop:** `DROP TICKET` in Back Stage is done in the cmds file (at line 201)
to discard the used ticket from inventory.

---

## Shadow creature → camera flash → green pearl

**Visible symptom:** a shadow blocks eastward passage through the Pit Cupboards.

**Mechanism:** `EXAMINE SHADOW` (identifies it as "an intangible shadowy presence") →
`TAKE PHOTOGRAPH` — the camera flash causes the shadow to scream and vanish (+2 points). The
camera is single-use; `DROP CAMERA` after.

**Green pearl:** beyond the shadow (E → Dark Place → NW → Under the Stage). `GET PAGE`
(loose page there) → `EXAMINE ITEMS` → "some coins, a pencil, bits of paper and a strange
green eye-like pearl!" → `GET GREEN PEARL`.

---

## Cloakroom → secret stairway → underground passage — shiny key gate

**Visible symptom:** the Cloakroom (NE of Lobby) has hooks; one is cleaner than the others.

**Mechanism:** `EXAMINE HOOKS` reveals the clean one. `PULL CLEAN HOOK` opens a secret
passage down (+1 point, observed). Two flights down: Underground Passage → iron door east.
`UNLOCK DOOR WITH SHINY KEY` → `OPEN DOOR` → `DROP KEY` (no longer needed). The shiny key
is single-use.

---

## Pit — poison + corpse, sluice gate, beast

**Visible symptom:** a growling beast in the pit; you cannot safely descend without neutralizing it.

**Mechanism:** `POUR LIQUID ON BODY` (pour the vial of poison onto Rienhart's corpse) →
`THROW BODY IN PIT` (+3 points, observed: the beast consumes it and is pacified). You can
now safely `D` into the pit and head E to the Tunnel Junction.

**Prerequisite chain:** corpse (carried from Narrow Hallway) + vial (from Sick Bay) →
combined here.

---

## Goblin — learning pearl identities (RANDOM socket order)

**Visible symptom:** a caged goblin-like creature in the Deep in the Mines; he speaks
intelligently.

**Mechanism:** `EXAMINE CREATURE` (backstory: he tried to help a colleague and was punished
by "her"). Then `SHOW <COLOR> PEARL TO GOBLIN` for each of the four pearls. He identifies
each one as an "Eye of Power" with a rank:
- Violet = Eye of **Control** ("stands above the other eyes")
- Blue = Eye of **Mana** ("forms the foundation of all the other eyes")
- Red = Eye of **Strength** ("right hand of all the other eyes")
- Green = Eye of **Wisdom** ("stands beside Strength to help balance the other eyes")

**These identities are RANDOMIZED per run** (probe 2026-07-01: `--xorshift 1` → violet =
"Eye of Strength… right hand"; `--xorshift 7` → violet = "Eye of Wisdom… stands beside
Strength". The earlier "fixed — confirmed in transcript" claim here was wrong; the
top-of-file RANDOMIZED banner is the correct account.) The *socket
positions* they map to in the statue are what varies by run. The player must note each
pearl's "rank" from the goblin and match it to the diamond-shaped socket layout on the statue.

---

## Sewer — popcorn trail → rats → lever

**Visible symptom:** the passage to the Witch's Lair (SE from Rat Nest) is blocked by an
aggressive swarm of rats.

**Mechanism:** lay a popcorn trail east to west: `DROP POPCORN` at the Western End of Sewer,
Centre of Sewer, Eastern End of Sewer, and Rat Nest (four portions, one per room). The rats
consume the Rat Nest popcorn and begin following the trail westward. Go to the Metal Platform
(N from Centre of Sewer). `EXAMINE LEVER` (confirms it operates the sluice gate). `WAIT` until
the rats move to the western end. Then `PULL LEVER` — the sluice gate opens, flushes the sewer,
and drowns the rats (+score, not observed in the cmds-cutoff portion but described in walkthrough).

**Prerequisite:** the basement electrical switch must be turned on earlier — the walkthrough's
note says it powers the underground electric lights; without power the underground area may be
dark. (Observed in trace: the switch was turned on in the Basement at game start; the
underground was lit throughout.)

**Popcorn quantity:** exactly four portions are needed (one per sewer room in the trail). Four
is exactly how many you can collect from the barrels. Do not use or drop them anywhere else.

---

## Witch's Lair — amulet gate, statue, dagger

**Visible symptom:** an archway leads SE from the Rat Nest into a circular room. The amulet
glows as you pass through (observed in trace).

**Mechanism:** enter while wearing the amulet (+3 points, observed). Inside: a loose page and
a bronze statue with four eye sockets in a diamond pattern, holding a jewelled dagger. `GET
PAGE` → `EXAMINE STATUE` describes the socket layout.

**Pearl ceremony (RANDOM — see top of file):** `PUT <COLOR> PEARL IN <POSITION> SOCKET` for
all four pearls, using the ranking learned from the goblin to determine which socket is which.
Once all four are placed correctly, `GET DAGGER` — the dagger is now accessible. `DROP AMULET`
after leaving (it is not needed further).

---

## Endgame (from walkthrough — beyond cmds.txt cutoff)

These steps are verified from `theatre.txt` only, not the transcript.

**Return to goblin → earth crystal:** go back to the goblin (NW × several → SW → D). The
dagger now yields an **earth crystal** (`GET EARTH CRYSTAL FROM DAGGER`). Show both crystals
to the goblin (`SHOW EARTH CRYSTAL TO TRENT` / `SHOW STAR CRYSTAL TO TRENT`) — at this point
the goblin reveals himself to be Trent, a transformed colleague. `PUT STAR CRYSTAL IN DAGGER`.
`READ PAGES` (all of them, for 3 bonus points). `ASK TRENT ABOUT ELIZABETH` — he says she
might hear you. Drop everything except dagger and tablets. Go NE × several → NE → `YES` to
confirm entry to the ceremony room → Elizabeth takes the dagger (with the wrong crystal —
she is fooled) and vanishes, releasing you. You awake outside a burning mansion.

**Mansion endgame (unconfirmed — walkthrough only):**
- `N` → Smoky Hall: a wounded man (revealed to be Trent in human form). `GIVE TABLETS TO MAN`
  (pain-killers ease his suffering; he tells you to destroy an evil female presence below).
- `GET DAGGER` → `GET STAR` → `D` (wine cellar) → `THROW STAR AT YOUNG WOMAN` (the star
  crystal shatters, destroying Elizabeth) → you awake back in the theatre lobby.
- `NW` → `D` → `U` (Manager's Office — Reinhart's ghost gets his phone back, hands you your
  pager) → `SE` → `S` → `ENTER CAR`. Win (50/50).

---

## Item → consumer map

| Item | Found | How | Consumed by |
|---|---|---|---|
| Pager | Basement | `GET PAGER` (on box) | No puzzle use — carried as inventory (goes off at move 250; examine then drop) |
| Popcorn ×4 | Basement | `GET POPCORN` ×4 (from barrels) | Rat-bait trail in the sewer (one portion per room: W end, Centre, E end, Rat Nest) |
| Shiny key (dropped by crow) | Boiler Room | `GET KEY` (floor, after crow drops it) | Unlock iron door in Underground Passage |
| Bottle of glue | Boiler Room | `OPEN CHEST` → `GET BOTTLE` | Break it to immobilize mannequins in Costume Room |
| Violet pearl | Boiler Room | `GET LUMP` → `CLEAN LUMP` (from coal bin) | Placed in statue socket in Witch's Lair (order determined by goblin) |
| Lens (plain) | Attic Observatory | `GET LENS` (from telescope) | `PUT LENS IN SPOTLIGHT` (lobby) → becomes patterned lens |
| Patterned lens | Theatre Lobby spotlight | `GET LENS` after spotlight burn | `PUT LENS IN TELESCOPE` in Attic Observatory (seals gas; enables star-crystal vision) |
| Old ticket | Alley Courtyard (rubbish bin) | `OPEN BIN` → `GET TICKET FROM BIN` | `DROP TICKET` in Eastern Theatre Aisle (after watch set to 7:40) — grants access to Stage |
| Camera | Secret Gallery | `GET CAMERA` | `TAKE PHOTOGRAPH` in Pit Cupboards to dispel shadow creature |
| Blue pearl | Secret Library (slug's nest) | `GET BLUE PEARL` after slug is crushed | Placed in statue socket in Witch's Lair |
| Corpse (Rienhart) | Narrow Hallway | `GET CORPSE` (under carpet rolls) | Poisoned with vial, then `THROW BODY IN PIT` to feed/pacify the pit beast |
| Gas mask | Costume Room | `GET MASK` (after glue immobilizes mannequins) | Worn in Attic Observatory to survive green gas |
| Star crystal | Attic Observatory (auto-acquired) | Appears in inventory after `LOOK THROUGH TELESCOPE` | Shown to Trent in mines endgame; put in dagger; thrown at Elizabeth in mansion |
| Tablets (pain-killers) | Sick Bay (medical cabinet) | `GET TABLETS` | `GIVE TABLETS TO MAN` (Trent, wounded in burning mansion) — endgame only |
| Stethoscope | Sick Bay (medical cabinet) | `GET STETHOSCOPE` | Worn at Manager's Office safe to crack the combination |
| Vial (poison) | Sick Bay (bed) | `GET VIAL` | `POUR LIQUID ON BODY` → poisoned corpse thrown in pit |
| Red pearl | Manager's Office (safe) | Safe-cracking with stethoscope (4 alternating turns) | Placed in statue socket in Witch's Lair |
| Amulet | Dressing Room (locker) | `OPEN LOCKER` → push locker → `GET AMULET` | `WEAR AMULET` to enter Witch's Lair through archway |
| Green pearl | Under the Stage | `EXAMINE ITEMS` → `GET GREEN PEARL` | Placed in statue socket in Witch's Lair |
| Dagger | Witch's Lair (statue) | `GET DAGGER` after pearl ceremony | Holds crystals; Elizabeth takes it (with wrong crystal = your deception); also yields earth crystal |
| Earth crystal | Dagger (Witch's Lair) | `GET EARTH CRYSTAL FROM DAGGER` (back at goblin) | `SHOW EARTH CRYSTAL TO TRENT` (lore/endgame) |
| Appointment book | Rienhart's corpse | `EXAMINE CORPSE` / `READ APPOINTMENT BOOK` | No pickup; reading it gives the cellular-phone plot hook |
| Loose pages (×many) | Scattered throughout | Various `GET PAGE` commands | `READ PAGES` near end-game for 3 bonus points |

---

## Red herrings / non-items

- **Appointment book:** you cannot drop or carry it (the game says "You haven't got that." when
  you try to drop it). It is part of the corpse, not a separate inventory item. Reading it is
  sufficient.
- **Coins, pencil, bits of paper** (Under the Stage): `EXAMINE ITEMS` lists these alongside the
  green pearl. They cannot be taken and serve no purpose.
- **Crow:** flying it into the chimney is the trigger that gets the key to the Boiler Room.
  The crow itself is not a usable inventory item.
- **Skeleton in the ticket booth:** atmospheric. `EXAMINE RAGS` and `EXAMINE WATCH` are the
  only useful interactions; the skeleton itself yields nothing.
- **Music sheet:** placed on the piano to enable `PLAY PIANO`, but after the piano has been
  moved it stays on the piano (not a carried item for later puzzles).
- **Coffin:** open it to trigger the crow key-theft; the coffin itself has no further use.
- **Architect's plans:** read to learn about the ticket booth; the plans can be dropped
  immediately after.
- **Vial description ("a potion to ease your final destiny"):** the letter frames it as a
  suicide draught. It is actually poison used to bait the pit beast — the letter's framing is
  intentional misdirection.
- **Rubbish bin (Alley Courtyard):** once emptied, contains nothing further. The page and
  ticket are the only yields.
- **Newspaper clipping (backstage):** read it for lore (the amulet's protective function) but
  it cannot be used in a puzzle directly.

---

## Build notes / divergences

- **`DROP APPOINTMENT BOOK`** — the cmds file includes this command; the game responds
  "You haven't got that." This is a no-op echo of the walkthrough text. The command is harmless
  and does not desync `--strict` mode.
- **`GET PEARL` (red, after safe)** — the cmds file uses `GET PEARL` without specifying the
  color, but by this point the player already has the violet and blue pearls, so the game asks
  for disambiguation. The cmds file includes this as a bare `get pearl`; in the actual headless
  run the game asks "Which do you mean?" — the command list continues without answering and the
  red pearl is acquired implicitly on the next unambiguous step. **Unverified in transcript:**
  the transcript shows disambiguation prompt but then `DROP STETHOSCOPE` follows; the red pearl
  is confirmed in inventory later (observed in the lobby drop-all at `drop all except pager`
  which lists "strange red eye-like pearl: Dropped."). The cmds file may silently resolve this
  — does not cause a `--strict` desync.
- **`EXAMINE STAIRCASE` / `LOOK UP`** — the raw walkthrough opens with `EXAMINE STAIRCASE` and
  `LOOK UP`; these are omitted from the cmds file (flavor only, no effect).
- **`EXAMINE PIANO` / `EXAMINE MUSIC`** — the raw walkthrough has these before `PUT MUSIC ON
  HOLDER`; omitted from cmds file. The music and piano work without examining them.
- **`EXAMINE TELESCOPE`** — listed in the raw walkthrough before `GET LENS`; omitted from cmds
  file. The lens can be taken without examining first.
- **`EXAMINE RUBBISH BIN`** — listed in the raw walkthrough before `OPEN RUBBISH BIN`; omitted
  from cmds file. Opening works without examining.
- **Ticket-booth watch:** the walkthrough says `TURN DIAL` until it reads "7:40". The watch
  advances one hour per turn and starts at 3:40, so exactly four turns are needed. This is
  deterministic; there is no randomness.
