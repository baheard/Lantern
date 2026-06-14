# The Dreamhold — puzzle-logic notes

Andrew Plotkin, 2004. Release 5 / Serial 041231. Standard (tutorial) mode. Max score **7 + 7**
(seven masks = seven main goals; seven optional "discoveries"). 438-turn walkthrough, no
`@random` gates — fully deterministic, replays clean with `--seed 1`.

Source walkthrough: IF Archive standard-mode transcript (`dreamhold.txt`). Verified command
list: `dreamhold.cmds.txt`.

## Shape of the game

A **memory palace**, not a linear story. You wake amnesiac in a wizard's "dreamhold" (a high
house that is itself a thought in the wizard's dream) and explore freely. The seven paper
masks are the spine: each one, raised to your face, replays a memory of the wizard's life —
and the score readout ("1 of 7") quietly tells a first-timer that there are seven to collect.
The **goal is not stated**; the amnesia premise means the player genuinely doesn't know what
they're working toward at first. (Rule 24 orientation question is essential here.)

The map is one connected space with several regions reached from a central hub (the **Crowded
Study**). Geography is unique per region — no rooms are reused across "acts" — so hint sections
scope by **location only** (no `phase`, no milestones). The status bar's right-aligned context
is just the *score* ("3 of 7, +1"), which can't name an act, confirming location-only is right.

The two enabling consumables drive half the puzzles:
- **White (frost) berries** — Cool Bower. Intense cold. Freeze water/steam.
- **Orange (fire) berries** — Warm Bower. Intense heat. Ignite things.
- Both must be picked with the **glove** (Dim Shed) — bare-handed picking is refused
  ("ow!… frost", stated in-game). The glove is also the mural's "gauntlet" (regalia, below).

## The seven masks (main goals)

1. **White** — Crowded Study, lying beside the desk. Trivial: just take it. (Memory: child.)
2. **Gold** — Marble Balcony (top of the mountain garden), balanced on a statue's face.
   Climbing the statue fails; **push** it over and the mask flutters down. (Memory: clubfoot infant.)
3. **Brown** — Mountain Pool, reached **through the telescope** in the Atelier. The telescope
   transports you to the world shown by the painting **on the easel**; the mountain landscape
   (which starts on the easel) → Mountain Pool. Return by going S (the world "smears" back).
   (Memory: war-map / red region.)
4. **Black** — a mountain Ledge across a ravine, reached by the **shadow bridge**: light the
   wood pile in the Translucent Dome with an orange berry → at night the copper "sail" casts a
   long shadow across the catwalk that you can **walk on**. With the sail in its start (north)
   position the shadow reaches north from Catwalk North → step N onto it → Ledge. (Memory: army routed.)
5. **Blue** — the Orrery (a vast spinning orrery machine below the Starry Dome). The blue mask
   is caught on the rings of the tan globe. **Ride the machine**: wait for the tan globe to
   swing low, grab it (you're carried up; the mask drops to the floor), then ride/descend back
   down and pick the mask off the floor. (Memory: ragged woman / crutch sign.)
6. **Green** — Far Shore of the black River (deep caverns). **Freeze the river** with a white
   berry to form an ice bridge, then cross W before it melts. (Memory: surrender of the crutch.)
7. **Red** — Cistern Catwalk (the cistern puzzle, below). (Memory: bloody cloth / limping boy.)

## Sub-puzzles / mechanisms

- **Telescope (Atelier).** World visited = painting on the easel. Mountain → Mountain Pool
  (brown mask); Desert → Red Desert (a credit-letter, flavor); blank **palette** → Sea of
  White (the knotted **string** spelling PORTRAIT — optional discovery). No painting → Metal
  Culvert / Platform in the Void (empty). Swap what's displayed to change destination.
- **Apple in the cage (Mosaic Room).** *Red herring + undo lesson.* Opening the cage ages the
  apple to a husk in an instant; the apple is useless. The Voice teaches `undo` here. Don't
  chase it.
- **Lighting the Dark Dome → Starry Dome.** Take a glowing **sphere** from the Sitting Room
  fireplace (gloved; it dims to grey when removed). In the Dark Dome center, **open the metal
  pyramid**, drop the sphere into the wire basket inside, **close the pyramid**. The dome
  fills with cycling images (gold/red/tan/green/blue) and finally **stars** = the Starry Dome
  (constellation-lore room).
- **Cloak of Night (Starry Dome, south).** The "Cloak of Night" constellation hangs low
  enough to **take** — yields the black night-cloak (optional discovery + regalia).
- **Berries as tools.** Orange → ignite the **wood pile** (Translucent Dome bonfire) and the
  **straw torch** (from Harp Chamber). White → **freeze the river**, **freeze the steaming pit**
  (so you can climb down safely to the bracelet), and (optional) turn the bonfire to **cold
  blue flame** for the "Unearthly" alternate ending.
- **The torch.** Straw bundle in the Harp Chamber → light with an orange berry → needed to see
  in the deep caverns (Vaulting Cavern and below).
- **The pit (bracelet).** From the River Crawl you slip down into a pit warmed by rising steam.
  Drop a white berry down the pit to freeze/quiet the heat, then descend safely; the
  **bracelet** is wedged deep (optional discovery + regalia "wristlet").
- **The Cistern.** Largest puzzle. (a) `pull lever` then step down and `wait` — the black
  "liquid" floor drains, lowering you to the bottom. (b) `turn wheel` — moves the black column
  so a brass grate is exposed; a ladder appears. (c) On the catwalk (a glass trough ringing the
  room), the trough leaks through **cracked holes**: plug the small/medium/large holes with the
  two **gum blobs** and the curved **glass slab** (each sized to its hole), and rotate the
  brass **spout** so the black liquid pours into the trough. (d) Cover the floor **grate** with
  the **gauze** (from the Orrery's North Alcove) so liquid can't drain. (e) `push lever` and
  `wait` — the black tide refills and **rises**, carrying you to the ceiling, where floor and
  roof meet and you pass through to the **Grey Chamber** (the **buckler** — optional discovery
  + regalia "shield"). The **red mask** is in the catwalk trough along the way.
- **The Subterrane / dagger (optional).** N from the Natural Passage into pitch **Darkness**;
  repeatedly **`go away from light`** to reach the Subterrane World, where you take the
  **dagger** (optional discovery + regalia). `enter rent` teleports you back to the Sitting Room.
- **The Arboretum flower.** Smelling the golden flower gives a memory-vision (Dank Jungle); the
  **iron key** sits on the tub — it opens the study's heavy south door (to the laboratory).

## Endgame

1. **The mirror (Curtained Room, SE of Sitting Room).** `sit on chair`, examine the mirror:
   your reflected face is a featureless blur. **Put each of the seven masks on the mirror** in
   turn — each delivers a line of restored self-knowledge. After the seventh the memories begin
   knitting together — but the **seventh (black) mask is torn**, so one fragment is still missing.
2. **The missing shred.** Standing up, a fragment of the black face is still gone. The torn
   **black shred** appears on the **study desk**; take it, return to the chair, `put shred on
   mirror` → memory completes (and reveals the wizard's true, chilling nature).
3. **The laboratory.** Completing the mirror lets you open the study's south door (`unlock door
   with iron key`) and break the **privacy spell** in the Iron Corridor (`break spell`). In the
   **Laboratory**, mix the portal **ink**: put a lump of **resin** in the flask, **pour the blue
   dust** in, put the flask in the apparatus loop, **pull chain twice** (resin→gel→ink). The
   **mural** shows the wizard's **regalia** — cloak, snakeskin belt, leather gauntlet (glove),
   small shield (buckler), wristlet (bracelet), black dagger, knotted string. The game flags
   "not properly arrayed" until you wear/carry them, then "in satisfaction." (This is the game's
   own in-world guidance — not an invented gate; treat the mural as the clue, and note that the
   regalia shapes which ending you reach rather than hard-blocking the portal.)
4. **Drawing the portal.** The book now names the diagram as the culminating step. Go down to
   the **Cell** (the starting room, with its smooth white floor — the "well-insulated space"
   from the margin note), `dip pen in ink`, `draw diagram`, `enter diagram`. → ending.

### Alternate endings (segregate as optional / "for your amusement")
- **The shadow path west / stars ending.** Move the copper sail (push it round the track) so
  the shadow falls **west**, turn the bonfire to **cold blue flame** (white berry in fire), and
  walk the west shadow path to its end → the ringed moon / "stars welcoming you home" ending.
- The **draw-diagram portal** has variant outcomes by regalia. These are replay-and-explore
  content, not required to "finish."

## Red herrings / flavor (good fake-question fodder, rules 16–18)
- The **apple** (cage) — useless, an undo lesson.
- The **harp** (Harp Chamber) — burned ruin; the game itself muses it might mean nothing.
- The **black marble pedestal** (Curving Hall at Pedestal) — bare, never used.
- The **credit-letter** (Red Desert) and **dynasty chart** (Cistern) — atmospheric reading,
  no mechanical use.
