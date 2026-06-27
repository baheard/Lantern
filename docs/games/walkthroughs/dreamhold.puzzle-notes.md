# The Dreamhold — puzzle-logic notes

Andrew Plotkin, 2004. Release 5 / Serial 041231. Standard (tutorial) mode. Max score **7 + 7**
(seven masks = seven main goals; seven optional "discoveries"). 438-turn walkthrough.

Source walkthrough: IF Archive standard-mode transcript (`dreamhold.txt`, header has source URLs).
Verified command list: `dreamhold.cmds.txt` (slug-anchored front-to-back; this file's `[slug]`
headings pair to it 1:1).

## ⚠ RANDOMIZED BETWEEN PLAYS

**Nothing is randomized.** The Dreamhold has **no `@random` gates** — no power words, no safe
combos, no shuffled layouts. The walkthrough is fully deterministic and replays bit-exact with the
harness default seed. There is therefore **no seeded test-artifact value to keep out of hints**;
every command in `dreamhold.cmds.txt` is a real player action. (Stated explicitly so the hint
author doesn't have to infer it from absence.)

## Shape of the game

A **memory palace**, not a linear story. You wake amnesiac in a wizard's "dreamhold" (a high
house that is itself a thought in the wizard's dream) and explore freely. The seven paper
masks are the spine: each one, raised to your face, replays a memory of the wizard's life —
and the score readout ("1 of 7") quietly tells a first-timer that there are seven to collect.
The **goal is not stated**; the amnesia premise means the player genuinely doesn't know what
they're working toward at first.

The map is one connected space with several regions reached from a central hub (the **Crowded
Study**). Geography is unique per region — no rooms are reused across "acts" — so hint sections
scope by **location only**. The status bar's right-aligned context is just the *score* ("3 of 7,
+1"), which can't name an act, confirming location-only is right.

**The two enabling consumables drive half the puzzles** (see [shed-glove], [mountain-gold]):
- **White (frost) berries** — Cool Bower. Intense cold. Freeze water/steam.
- **Orange (fire) berries** — Warm Bower. Intense heat. Ignite things.
- Both must be picked with the **glove** ([shed-glove]) — bare-handed picking is refused
  ("ow!… frost", stated in-game). The glove is also the mural's "gauntlet" (regalia, see [regalia-mural]).

**COLOR is the game's organizing principle** (relevant to the art pipeline): the seven masks form
a deliberate spectrum — **white, gold, brown, black, blue, green, red** — and the spaces that hold
them are correspondingly vivid: sunlit mountain gardens, a glowing star-dome, a luminous orrery of
colored globes, a magma-warmed pit, a frozen black river. The tone is **wondrous and colorful**,
not gothic-dark, despite the amnesia framing.

---

## The seven masks + their puzzles

### [cell-study] Cell + Crowded Study — white mask (1/7)
Wake in the bare stone **Cell** (smooth white floor — remember it; it's the portal site at the
very end, see [draw-portal]). East into the **Crowded Study**, the hub. The **white mask** lies
beside the desk — trivial, just take and don it (memory: the wizard as a child). The **trunk**
holds the **copper key** that unlocks the study's interior doors. Examine the **book** and **turn
page** — the book is the game's running guidance and updates as you progress.

### [shed-glove] Dim Shed — the frost/fire glove
The **glove** is the gating tool for both berry types. **Picking berries bare-handed is refused**
in-game ("ow!"). Pick up and wear the glove before visiting either bower. (Later it doubles as the
**leather gauntlet** of the regalia — see [regalia-mural].)

### [mountain-gold] Mountain garden — gold mask (2/7), both berries
Climb up through the mountain garden. **Cool Bower** → **white (frost) berries**; **Warm Bower** →
**orange (fire) berries** (glove required, [shed-glove]). At the **Marble Balcony** the gold mask
is balanced on a **statue's face**. **Climbing the statue fails**; the solution is to **push** it
over so the mask flutters down (memory: a clubfoot infant). Stock up on multiple berries here —
they're consumed across [shadow-bridge-day], [harp-river-green], [pit-bracelet], and [alt-ending].

### [mosaic-apple] Mosaic Room cage — red herring / the undo lesson
*Not a mask.* The cage holds an **apple**; **opening the cage ages the apple to a husk instantly**.
The apple is **useless** — its only purpose is to teach the player `undo` (the Voice prompts it).
**Don't chase it.** Good fake-question fodder.

### [atelier-brown] Atelier telescope — brown mask (3/7) + the string
The **telescope transports you into the world depicted by the painting currently on the easel.**
- Mountain landscape (starts on the easel) → **Mountain Pool** → **brown mask** (memory: war-map).
  Return by going **S** (the world "smears" back).
- **Desert** painting → **Red Desert** (a credit-letter — flavor only).
- Blank **palette** on the easel → **Sea of White**, where the knotted **string** spells PORTRAIT
  (optional discovery).
- No painting → empty void. **Swap what's displayed to change destination** — that's the mechanic.

### [subterrane-dagger] Subterrane — the dagger (optional discovery + regalia)
North from the Natural Passage into pitch **Darkness**. Repeatedly **`go away from light`** (counter-
intuitive — you walk *away* from the visible glow) to reach the **Subterrane World**, where you take
the **dagger**. **`enter rent`** teleports you straight back to the Sitting Room. The dagger is one
of the seven regalia ([regalia-mural]).

### [domes-stars] Lighting the Dark Dome → Starry Dome + Cloak of Night
Take the glowing **sphere** from the Sitting Room fireplace (gloved; it dims to grey out of the
fire). In the **Dark Dome** center: **open the metal pyramid**, drop the sphere into the **wire
basket** inside, **close the pyramid**. The dome cycles through colored images and finally fills
with **stars** = the **Starry Dome** (constellation-lore room). In its south, the **"Cloak of
Night"** constellation hangs low enough to **take** → the black night-cloak (optional discovery +
regalia). The Starry Dome is also the route down to the orrery and up to the catwalk.

### [shadow-bridge-day] Translucent Dome — set up the shadow bridge (daytime)
Climb out onto the **catwalk** ringing the dome to learn its layout (N/E/S/W nodes). Back inside,
**put an orange berry in the wood pile** to build the bonfire. Lighting it triggers **nightfall** —
the catwalk's day/night variants are distinct nodes (the cmds comments mark them).

### [shadow-bridge-black] Night shadow walk — black mask (4/7)
At night the lit bonfire makes the copper **"sail"** cast a long shadow across the catwalk. **With
the sail in its start (north) position the shadow reaches north** from Catwalk North. **`examine
shadow` first** (required before the game lets you walk it), then step **N** onto the shadow → the
**Ledge** across the ravine → **black mask** (memory: an army routed). *Note the black mask is
**torn** — that tear is the endgame's final loose thread, see [regalia-mural].*

### [orrery-blue] The orrery — blue mask (5/7) + belt, gauze, rag
Below the Starry Dome, a vast spinning **orrery** of colored globes. The blue mask is caught on the
rings of the **tan globe**. **Ride the machine**: `wait` for the tan globe to swing low, **take it**
(you're carried up and the mask drops to the floor), then **ride/descend** (the long `wait` runs in
the cmds are the ride timing — not filler) and pick the mask off the floor below. The alcoves here
also yield the snakeskin **belt** (regalia), the **gauze** (needed at [cistern-red] to cover the
floor grate), and a **rag**. Memory: a ragged woman / crutch sign.

### [arboretum-key] Arboretum — the iron key
**Smell the golden flower** for a memory-vision (Dank Jungle). The **iron key** sits on the tub; it
opens the study's heavy **south door** to the laboratory ([laboratory-ink]).

### [harp-river-green] Harp Chamber + frozen river — green mask (6/7)
Take the **straw torch** from the Harp Chamber and **light it with an orange berry** — you need it
to see in the deep caverns. At the black **River**, **put a white (frost) berry in the river** to
freeze an **ice bridge**, then cross **W before it melts** → **green mask** (memory: surrender of the
crutch). (The burned **harp** itself is a red herring — the game muses it may mean nothing.)

### [pit-bracelet] The steam pit — bracelet (optional discovery + regalia)
From the River Crawl you slip down into a **pit warmed by rising steam**. **Drop a white berry down
the pit** to freeze/quiet the heat, then descend safely; the **bracelet** ("wristlet" regalia) is
wedged deep below.

### [cistern-red] The Cistern — red mask (7/7) + buckler
The largest puzzle. Sequence:
1. **`pull lever`**, step down, `wait` — the black "liquid" floor **drains**, lowering you to the bottom.
2. **`turn wheel`** — moves the black column to expose a brass grate; a ladder appears.
3. On the **catwalk** (a glass trough ringing the room) the trough leaks through three **cracked
   holes**: plug small/medium/large with the two **gum blobs** and the curved **glass slab** (each
   sized to its hole), and **turn the spout** so black liquid pours into the trough.
4. **Cover the floor grate with the gauze** ([orrery-blue]) so liquid can't drain away.
5. **`push lever`** and `wait` — the black tide **refills and rises**, carrying you up to the
   ceiling where floor and roof meet → through to the **Grey Chamber** (the **buckler** = "shield"
   regalia). The **red mask** is in the catwalk trough along the way (memory: a limping boy / bloody cloth).

The **dynasty chart** read here is atmosphere only — no mechanical use.

---

## Endgame

### [mirror] The mirror — restore the memory
In the **Curtained Room** (SE of Sitting Room): `sit on chair`, examine the mirror — your reflected
face is a featureless blur. **Put each of the seven masks on the mirror** in turn; each delivers a
line of restored self-knowledge. After the seventh the memories knit together — **but the black
mask is torn**, so one fragment is still missing (resolved in [regalia-mural]).

### [laboratory-ink] Laboratory — open up + mix the portal ink
Completing the mirror lets you **`unlock door with iron key`** (study south door, [arboretum-key])
and **`break spell`** (the privacy spell in the Iron Corridor). In the **Laboratory**, mix the
portal **ink**: **put resin in flask**, **pour the blue dust in**, put the flask in the apparatus
**loop**, **pull chain twice** (resin → gel → ink). Read the **mural** — it depicts the wizard's
full **regalia** (cued for [regalia-mural]).

### [regalia-mural] Complete the mirror + don the regalia
1. **The missing shred.** Standing from the chair, the torn black-mask fragment is still absent. The
   **black shred** appears on the **study desk**; take it, return to the chair, **`put shred on
   mirror`** → the memory completes (and reveals the wizard's true, chilling nature). *In the cmds
   list this is immediately followed by `undo` — `put shred on mirror` reaches an **ending screen**,
   and the trunk `undo`s back to continue to the true portal ending. (This is why the list must be
   verified with `--strict`, **not** `--stop-on-death`, which would halt at this peek.)*
2. **The regalia.** The mural names seven items to **wear/carry**: **cloak** ([domes-stars]),
   snakeskin **belt** ([orrery-blue]), leather **gauntlet** = the glove ([shed-glove]), small
   **shield** = buckler ([cistern-red]), **wristlet** = bracelet ([pit-bracelet]), black **dagger**
   ([subterrane-dagger]), knotted **string** ([atelier-brown]). The mural flags "not properly
   arrayed" until you're equipped, then "in satisfaction." This is the game's own in-world guidance —
   the regalia shapes **which** ending you reach rather than hard-blocking the portal.

### [alt-ending] Optional alternate "stars" ending (peeked, then undone)
For exploration only — the trunk **`undo`s back out**. **Rotate the copper sail** (push the copper
triangle round its track) so the shadow falls **west**, turn the bonfire to **cold blue flame**
(**put a white berry in the fire**), and walk the **west** shadow path to its end → the ringed
moon / "stars welcoming you home" ending. Segregate as optional / "for your amusement" — not
required to finish.

### [draw-portal] Draw the portal — the true ending
The book now names the diagram as the culminating step. Go down to the **Cell** ([cell-study]) —
its smooth white floor is the "well-insulated space" from the margin note. **`dip pen in ink`**
(the ink from [laboratory-ink]), **`draw diagram`**, **`enter diagram`** → the true ending (Andrew
Plotkin credits screen). The draw-diagram portal has variant outcomes by regalia — replay-and-explore
content, not separate required goals.

---

## Red herrings / flavor (fake-question fodder)
- The **apple** ([mosaic-apple]) — useless; an undo lesson.
- The **harp** ([harp-river-green]) — burned ruin; the game itself muses it might mean nothing.
- The **black marble pedestal** (Curving Hall) — bare, never used.
- The **credit-letter** (Red Desert, [atelier-brown]) and **dynasty chart** ([cistern-red]) —
  atmospheric reading, no mechanical use.
