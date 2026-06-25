# Theatre — location framing

> **MOLD-authored, regenerable cache. NEVER hand-edit.** Records the molding *judgments* (vantage,
> occlusion, exit handling, state, shared-volume geometry) that the `style.json` scene prose is
> distilled FROM. Reproducible: re-running the mold over the same inputs reproduces this file.
>
> **Inputs reasoned over:** `room-facts.json` (mechanical facts — scene, exits, exitFacts, lookFacts,
> landmarks, unprobed) · `_review-notes.json` (the ONLY home for human feedback) · the verified
> walkthrough + hints · `.tome/art-direction-model.md`.
>
> **Litmus:** a *derivable* fact belongs in the dossier (fix the engine, not here); a *non-derivable
> judgment* belongs here. If an entry restates a `room-facts.json` fact, it is in the wrong file. If it
> reads like finished render-prose, it has drifted INTO the scene's job — framing holds the
> **decision + why**, the scene holds the **imperative the model renders**.

---

## Cross-cutting

### Register
- **Cast artist:** `comic-panel` (per `selected-artist.json`). Flat solid colour, bold ink outlines,
  printed-comic look — the medium's flatness is the ARTIST's, not a scene concern (don't write
  shading/lighting technique into scenes). Renders cleaner at OpenAI-low when the scene stays literal.
- **Global condition:** "faded, long shut up, a touch spooky" — stated ONCE by the aesthetic. Do
  NOT append per-room condition tails ("dusty", "bare", "cobwebbed") unless that room's *source*
  text uses the exact word (factor 12). Rooms whose source DOES say it (the attic "thick dust", the
  west balcony "thick layer of dust", the cloakroom "cobwebs") may keep it.
- **False `unprobed` hits — ignore, render no literal object:** the fixture-lexicon caught "sign"
  from wordplay in three rooms — pit-cupboards ("no *sign* of it"), street-balcony ("flashing
  *signs*" that are explicitly GONE), deep-in-the-mines ("*signs* of excavation"). None is a real
  sign. Do not render lettering/signage in any of them.
- **NPC/creature strip (factor 3):** the street thug (outside/roof), the pit creature (inside-pit),
  the goblin (deep-in-the-mines), the rats (rat-nest) are all mobile NPCs → omitted from every
  establishing shot.

### Volume: Auditorium — anchor `stage`
One single open hall seen ACROSS by every member; assemble once here, not per room.
- **Members:** `stage`, `eastern-theatre-aisle`, `western-theatre-aisle`, `eastern-balcony`,
  `western-balcony`. (Peeked into from above through floor-cracks by `attic-above-the-theatre`.)
- **Geometry:** vast cavernous hall. North end = a wide wooden **stage, raised well above** the
  auditorium floor (the `stage south → Orchestra Pit` exit is *down*, so the stage is elevated; a
  sunken **orchestra pit** sits in front of the stage lip, below floor level). Floor = a sea of
  decaying seats. **Two parallel aisles** run N–S (SE = `eastern-theatre-aisle`, SW its mirror
  `western-theatre-aisle`). **Balcony boxes** line the raised **east & west** side walls. A great
  crystal **chandelier** hangs high over the centre. **Rear double-doors** (the way out) are at the
  **south ends of the aisles**, NOT a central door behind the seats.
- **Shared landmarks across the volume:** the chandelier (named in the aisle & balcony *prose* — NOT
  the `landmarks` glossary, never examined), the balcony boxes, the stage. Pull into any member even
  when its own facts omit them.
- **Canonical state:** chandelier **RAISED**. ⚠ The walkthrough lowers it (attic winch ~turn 41)
  before it ever visits the aisles, so the dossier captured the aisles/west-balcony **chandelier-down
  (post-winch)**. First-look truth is raised — forced up by hand on each member. *No snapshot-replay
  can fix this on this walkthrough (tome 2026-06-24).*

### Volume: Lobby Atrium — anchor `theatre-lobby`
- **Members:** `theatre-lobby`, `staircase-landing`, `eastern-landing`, `southern-landing`,
  `western-landing`. **The three landings ARE the wraparound gallery** — each "circles around the
  upper level of the lobby allowing you to see down into it." (`secret-gallery` is NOT a member — it
  is a separate small hidden picture room off the staircase landing.)
- **Geometry:** double-height entrance hall, **wider & taller than deep**, open central void rising
  two storeys. **One** continuous balustraded gallery rings all four walls (the landings), open over
  the floor. **One upper storey only, no higher tiers.** An **imperial / double-return staircase** on
  the far (north) wall: central flight → a deep **mid-landing** → **splits** east & west → both
  flights land on the gallery. A set of **double doors on the north of the gallery** leads to the
  auditorium.
- **Shared landmark:** the full-length **gentleman portrait** — *owned* by `staircase-landing` (it
  examined it; in the `landmarks` glossary), *seen from* `theatre-lobby` below. On the mid-landing
  wall beneath the split.
- **Vantage convention:** the split-staircase is the hard case — text-to-image collapses the
  three-way "up off both sides + down in front" into one central ascending flight. Lead the
  staircase-landing scene with the SPLIT as subject; a frontal "looking up at the landing" vantage
  belongs to the lobby's view, not the landing's own. ⚠ Still an open `_review-notes` canary —
  likely needs an img2img anchor, not more prose.

### Volume: Sewer — anchor `metal-platform`
- **Members:** `metal-platform`, `centre-of-sewer`, `western-end-of-sewer`, `eastern-end-of-sewer`.
  The platform "grants a clear view of the entire sewer"; the trench-ends are stations of one long
  brick trench. (`rat-nest` is a separate small side-tunnel off the east end — its own vantage.)
- **Geometry:** one long brick **sewage drainage trench** running E–W, wet/grimy. **West end** =
  terminates at a large iron **sluice gate** with a drain dropping below. **East end** = dead-ends at
  a cluster of small impassable **pipe mouths**. **Centre** = the trench mid-point, with the **metal
  platform fixed high on the north wall** above it, a long rusty **lever** hanging from the ceiling.
- **Render note:** consistent brick trench across all four; the platform view looks DOWN the length
  of the trench (the establishing shot of the volume); the three trench stations are eye-level along
  it. Anchor = the platform's overlook.

### Shared-look: Long Corridor (NOT an open volume — keep stations consistent)
`north-end-of-long-corridor`, `centre-of-long-corridor`, `south-end-of-long-corridor` are three
stretches of ONE long dark wood-panelled corridor with worn floorboards. Each is a local view down
its own stretch (you don't see end-to-end) — but render the **same panelling, proportions and
boards** in all three so they read as one corridor.

---

## Rooms

### Front of house / Lobby Atrium

#### theatre-lobby — member: Lobby Atrium
- **Vantage:** from the **main entrance (south wall, behind camera, out of frame)** looking N across
  the floor toward the imperial staircase.
- **Multi-level:** render the whole atrium from the volume; make the split + scale **vivid**, not
  asserted (the connection only sold once VAST/cavernous led the prose).
- **Exits — cap (doors multiply):** ground = exactly **two** small private panelled doors flanking
  the stair (`northwest → Manager's Office`, `northeast → Cloakroom`) + "no other ground-floor
  doors"; gallery = **one** set of double doors (`up`-ward toward the auditorium); `south` = the
  entrance, behind camera, screened.
- **`unprobed: poster`:** render indistinct, bold pictorial playbills **pasted flat** (not framed
  fine-art, not lettered).
- **Surface:** plain worn marble-flagged floor, muted — NOT a bold mosaic.

#### outside-the-theatre
- **Vantage:** from the **kerb across the street looking at the theatre's shabby frontage**.
- **State / light:** twilight (`look up` = smog hides the sunset) — a misty dusk; mist hangs low over
  litter-strewn, cracked pavement; boarded-up slum buildings. Strip the street thug (NPC).
- **Exit:** `north → Theatre Lobby` = the theatre's entrance doors, the focal frontage.

#### managers-office
- **Vantage:** from the **southeast doorway** looking across the cluttered office.
- **Exits:** `southeast`/`north` = the two named doorways; `south → Sealed Up Ticket Booth` = the
  **plastered-over** south wall (no opening — screen); `down → Basement` = the open **trapdoor** in
  the floor, ladder-top protruding. Screen the SE entrance (behind camera).
- A plain room otherwise.

#### sealed-up-ticket-booth
- **Vantage:** inside the small sealed booth looking toward the boarded window.
- **`unprobed: window`** = boarded over, only **thin blades of faint light** leak through cracks
  (the room's only light). KEEP the **human skeleton** (a persistent corpse/fixture, collapsed in a
  corner). Cramped. (Source says "smells of rotten meat" — strip, not visual.)

#### cloakroom
- **Vantage:** looking along the wall of empty coat hooks draped with cobwebs.
- **Exits:** `southwest → lobby` (the prose's way back — show as the opening out). ⚠ The exit graph's
  `down → Secret Stairway` is a **puzzle-revealed** hidden stair (found via the hooks) — screen it;
  not part of the canonical establishing view.
- Source says "cobwebs" → allowed.

#### staircase-landing — member: Lobby Atrium
- **Vantage (hard call):** camera **ON the mid-landing looking north** at the portrait wall. The
  **two ascending flights (the split, off-frame left/west & right/east) are the SUBJECT.**
- **Screen the descent:** the flight back down to the lobby (`down → south`) is behind & below — show
  at most the topmost steps at the bottom edge, or none. Do NOT pull the camera to the foot of the
  stairs (collapses the split into one central ascending flight — the lobby's view).
- **Exit form:** "the only ways out are the stairs themselves — no doorways, arches or dark openings
  cut into the walls" (this Scene line does the job the dropped App THRESHOLDS rule used to). The
  `east → Eastern Landing` and `north → Secret Gallery` are the gallery continuation + the small
  hidden door — keep the gallery reading continuous, the secret door minimal.
- **Shared landmark:** owns the gentleman portrait (its detail feeds the glossary for the lobby).
- **State / known gap:** ⚠ split/descent geometry still renders as a single central flight under
  text-to-image — open `_review-notes` canary; likely needs an img2img anchor.

#### secret-gallery — (NOT the atrium gallery)
- **Vantage:** inside the cramped, dimly-lit hidden room, rows of old framed pictures crowding every
  wall, a small door out (`south → Staircase Landing`). Cramped, dim (source: "dimly-lit"). The
  pictures are indistinct framed canvases (no invented imagery).

#### eastern-landing — member: Lobby Atrium
- **Vantage:** on the gallery **looking along the balustrade**, open over the lobby void below
  (`look down` = the lobby below).
- **Exits:** the landing continues `west → Staircase Landing` and `south → Southern Landing` (the
  gallery ring); `north → Eastern Theatre Aisle` = a set of **double doors** toward the auditorium;
  `east → Eastern Stairway` = a doorway to the side stair. Keep the gallery reading as one continuous
  balcony; show the void + rail.

#### southern-landing — member: Lobby Atrium
- **Vantage:** the **south end of the gallery, above the main doors**, looking out over the void
  (`look down` = lobby below).
- **Feature:** heavy **closed curtains** hang against the south wall (a fixture). Gallery continues
  `northeast` (the graph only logs NE; the prose also says NW — it's the ring). Open over the lobby.

#### western-landing — member: Lobby Atrium  *(was NO-SCENE → distill)*
- **Mirror of `eastern-landing`** (gallery continues `south` & `east` toward the stairs down; double
  doors `north` to the auditorium). Same vantage: on the gallery looking along the balustrade, open
  over the lobby void. Distil a scene flipped E↔W from the eastern landing.

### Auditorium + backstage

#### stage — member: Auditorium
- **Vantage:** at the **back of the stage looking south** over the auditorium; backstage behind the
  camera (north), out of frame.
- **Occlusion (key call):** stage is raised → the orchestra pit (`south`, *down*) is hidden behind
  the front lip from this raised vantage → **OMIT it.** Overhead (`look up`) = endless rows of stage
  lighting & girders, far above.
- **Exits:** `north → Back Stage` = screen (behind camera); `southeast`/`southwest` → the two aisles,
  shown receding through the seats; `south → Orchestra Pit` = occluded, omit.
- **Shared volume:** pull rear double-doors (aisle ends), balcony boxes, chandelier.
- **State:** chandelier RAISED. **Surfaces (per zone):** stage = wooden boards; aisles = carpet.

#### back-stage
- **Vantage:** inside the cluttered fly/backstage maze looking through the ropes, supports and hanging
  curtains; rolls of painted **canvas scenery backdrops** stacked about.
- **Exit:** `south → Stage` = the **boarded-over** stage doors (no view through). `look up` = doors
  high above where a landing was pulled down (connects to `up-the-ropes`) — show the height/voids
  above, no reachable landing. Enclosed, cluttered.

#### up-the-ropes
- **Vantage:** **high in the fly space ~5 m above the stage**, clinging amid dangling rigging ropes;
  across a narrow gap a **row of doors set in the west wall** (one hangs ajar) that once opened onto a
  gone landing.
- **Exits:** `west → Dressing Room` (through the ajar door), `down → Back Stage` (the drop). The
  subject is the rope tangle + the west-wall doors across the gap, not the auditorium.

#### dressing-room
- **Vantage:** inside a stripped former dressing room — **scuff marks on the floor are the ONLY
  trace of vanished furniture.** A door leads `east` (back to the ropes).
- ⚠ **Fix:** the committed scene invented "a single old metal locker" — **unsourced, drop it**
  (App: invent no furniture). The room is empty but for the scuff marks. Empty.

#### orchestra-pit — member: Auditorium
- **It is a THEATRE orchestra pit, NOT a cave.** The source gives no material; the conservative
  default is **theatre fabric — a plain wooden floor and plain plastered/panelled low walls**, like
  the rest of the front-of-house. **Never stone** (that's the *underground* `above-the-pit`/
  `inside-pit`, a different "pit" entirely — do not bleed the cavern material onto this one).
- **Source LOOK text** (ground truth, harness-verified): *"This depression would have been too small
  for anything but the most basic of orchestras. Looking about you can see why this is called a pit.
  You can go back **up** to the stage, or **east** to some walk-in storage cupboards."* So: it's a
  small **empty depression** (a walled sunken hole — "you can see why this is called a pit"), the
  stage is **up**, the cupboards are **east**. NO furniture is described.
- **Geometry — a SUNKEN PIT with LOW walls; the THEATRE opens up above the rim.** This is the key
  call we kept getting wrong. The pit is a **small, narrow sunken depression** set into the front of a
  **big, open theatre**. Its own walls are **LOW** — only as high as the pit is deep (a low
  parapet/rail at about chest-to-shoulder height as you stand down in it), bounding the pit on the
  **left, right, and behind** (where it meets the house floor). **Above those low pit walls the space
  OPENS UP** — the wide, tall theatre is visible over the rim: the broad stage rising ahead, the dim
  auditorium opening out behind and to the sides. **Ahead (north)** there is no low wall — the **wide,
  tall stage front rises directly up** out of the pit (stage lip above eye-level, broad curtain, fly
  tower far overhead). **Failure modes to avoid:** (1) full-height room walls on the sides → reads as
  "a small room with a stage", not a pit; (2) a wide-open pit with distant walls → loses the sunken
  feeling; (3) a hole-in-the-floor seen from outside. The pit FLOOR is a **narrow** strip of bare
  wood; the THEATRE around/above is **wide**. ("Too small for the most basic of orchestras" = the pit
  is small and shallow — NOT that the theatre is small.)
- **Vantage — STAND DOWN IN THE PIT (first-person, on the pit floor), looking up and out.** The player
  is sunk *down inside* the depression, below house level. Close around the viewer: the **low pit
  walls/rail** (left, right, behind) at chest/shoulder height. Over those low walls, the **open theatre
  rises and recedes**: ahead, the wide stage front looms up and the tattered curtain hangs above
  eye-level; over the side and rear rims, the dim auditorium opens out. Narrow underfoot, open above —
  that contrast is what makes it read as a PIT you're standing in, not a closed room. Do **NOT** frame
  it from the auditorium looking down at a well (the player is *in* it), and do **NOT** box it in with
  tall walls.
- **Overhead (`look up`):** "Far above you, you can see endless rows of lighting and girders." This is
  the **FLY TOWER over the STAGE**, not the pit's own ceiling — the identical look-up text appears ONLY
  in `stage` and `orchestra-pit` (the two rooms at the front under the proscenium), while the
  auditorium rooms report a "finely-sculptured plaster ceiling" instead. So the rigging belongs to the
  stage's tall fly space, shared with the pit. Render it **FAR above and distant** — small, high in
  frame, receding up into a tall dark fly tower glimpsed past/above the stage lip — NOT a close grid
  pressing down on the pit. It's a secondary look-up detail behind the stage lip, not the forward
  subject. (Cross-checking the look-up text across sibling rooms is what pins it to the stage volume.)
- **Exits — cap & place (only TWO):** `north → Stage` = the raised stage lip + curtain behind/above,
  low steps up to it; **the stage itself carries NO doors** (the curtain/backdrop only). `east → Pit
  Cupboards` = a **plain closed wooden door low in the pit's SIDE wall, at pit-floor level** — NOT up
  at stage level, and show NO contents through it (the model hallucinated bookshelves from
  "cupboards" and floated the door up onto the stage; it's a shut side door at the bottom). **No
  other doors or openings anywhere.** **Place it on the RIGHT-hand wall, not "east":** facing north
  (stage ahead) east is to the right; compass words don't steer the model, "right-hand wall" does.
- **Scale & furnishing — EMPTY.** Cramped/small ("too small for anything but the most basic of
  orchestras"), and the source describes **no furniture at all** in this derelict theatre. Render it
  **empty** — bare wooden floor, no music stands. Two earlier passes invented stands from the word
  "orchestra" ("crowding the space" → a forest of mismatched stands); the prose never names one.
  The *shape* (a shallow walled trough below the stage lip) carries the "orchestra pit" identity, not
  props. If anything, at most a single abandoned stand — but empty is the faithful default.

#### pit-cupboards — (soft-dark room)
- **Vantage:** just inside the dark, empty walk-in cupboards. **Soft-dark** (source describes it:
  "very dark… shadowy gloom… empty") — paint it as gloom with barely-visible bare shelving, NOT pure
  black; the status line still names the room.
- **Exits:** `west → Orchestra Pit`, `east → Dark Place` = a **gap broken in the east wall**.
  **`unprobed: sign` is a FALSE hit** ("no *sign* of it") — render no sign. Cramped.

#### under-the-stage
- **Vantage:** a **cramped low crawlspace beneath the stage**, must stoop; thin blades of light filter
  down through the cracks between the boards overhead (the only light); debris fallen through.
- **Exit:** `southeast → Dark Place` = a low passage. Low, cramped.

#### eastern-theatre-aisle — member: Auditorium
- **Vantage:** on the auditorium floor **looking north up the aisle** toward the raised stage.
- **Scale (factor 11):** a broad sweep of MANY seats far across the hall — NOT a narrow strip.
- **Occlusion contrast w/ stage:** from down here the **pit IS visible** — a recessed trench between
  the stage lip and the front rows. (`look up` = balcony boxes + sculptured plaster ceiling.)
- **Exits:** `north → Stage` ahead; `south → Eastern Landing` (double doors) = screen, behind camera.
- **State:** chandelier RAISED (dossier captured it lowered — overridden; post-winch capture).

#### western-theatre-aisle — member: Auditorium  *(was NO-SCENE → distill)*
- **Mirror of `eastern-theatre-aisle`** (aisle to the *east*, stage north, double doors south). Same
  vantage / scale / pit-visible / chandelier-RAISED. Distil flipped E↔W.

#### eastern-stairway
- **Vantage:** **looking up the rise** of a finely-carpeted (now worn) stairway; it descends to a
  wooden door (toward the landing) and climbs `up → Eastern Balcony`. Enclosed — its own stairwell,
  NOT an auditorium view.

#### eastern-balcony — member: Auditorium
- **Vantage:** in the box **looking down & west** across the void.
- **Shared volume:** the matching west boxes are visible far across the void; the **chandelier** hangs
  over the void (pulled from the volume — this room never names it); stage + seats below (`look down`).
  `look up` = sculptured plaster ceiling.
- **Exit:** `down → south` (the only way out) = a gap at the floor edge, NOT a doorway.
- **State:** chandelier RAISED.

#### western-balcony — member: Auditorium
- **Vantage:** facing **west** (entry-facing heuristic: player traveled west from the eastern
  auditorium area → camera faces west). The west wall — bricked-up doorway + ragged crawl-hole —
  fills the frame. The auditorium void and chandelier are behind the camera; sculptured ceiling
  overhead. Entry side (east, the open balcony rail) is behind the viewpoint, out of frame.
- **State (key call):** dossier caught the chandelier **lowered + swinging** = post-puzzle + transient
  → force canonical **RAISED**, strip the motion. *Provenance: dossier state contaminated.*
  (Chandelier is behind camera in canonical state anyway — not in frame.)
- **Exits:** `northwest → Back Wall` = the ragged **crawl-hole** knocked through the wooden wall beside
  the **bricked-up doorway**. Both are on the west wall, in frame — distinctive, show them.
- **Condition:** "dusty" allowed — source says "thick layer of dust". `look up` = sculptured ceiling.

### Mid warren — corridors / offices

#### cramped-hallway
- **Vantage:** **looking north** along a narrow service hallway pinched tight by stacked boxes of junk.
- **Exits:** doorway `south → Manager's Office`, doorway `west → Tight Stairway`, hallway continues
  `north`. Cramped.

#### tight-stairway — (thin)
- **Vantage:** **looking up the turn** of a narrow winding service stairway; climbs `west`, descends
  `east`. Cramped, enclosed. (Sparse source — keep minimal, don't invent.)

#### centre-of-long-corridor — shared-look: Long Corridor
- **Vantage:** looking along a long dark wood-panelled corridor (N–S); a narrow staircase descends
  `east`, a closed door `west`. Worn floorboards. Match the corridor look across all three stations.

#### south-end-of-long-corridor — shared-look: Long Corridor
- **Vantage:** the **south end looking north** up the panelled corridor; a doorway `south`, another
  `west`. Same panelling/boards as the other corridor stations.

#### north-end-of-long-corridor — shared-look: Long Corridor
- **Vantage:** the **north end looking south** down the panelled corridor; a doorway `north`, another
  `west`. Same panelling/boards.

#### narrow-hallway
- **Vantage:** **looking north** down a hallway where stacked boxes have collapsed into a heap of junk;
  a pile of fallen **carpet rolls** blocks the way north; the way back is south. Choked with debris.

#### end-of-hallway
- **Vantage:** **looking north** at the end of a box-lined hallway; `north` = the theatre's **back
  exit** (toward the courtyard), hallway continues `south`, an office door `west`. Stacked boxes.

#### old-hallway — (discovered, post-puzzle, near the lair)  *(was NO-SCENE → distill)*
- **Vantage:** **looking northeast** down a sinister, murky, dim hallway running SW→NE. Strip the
  chanting (sound) and the "rising fear" (player emotion). Oppressive, dim, bare. (Discovered at turn
  238 deep in the occult warren — eyeball if it renders too literal.)

#### music-room
- **Vantage:** from the **east doorway** looking in: battered violin cases and tangled coils of
  instrument strings litter the floor; an upright **piano pushed against one wall**. Disused.

#### prop-room
- **Vantage:** from the **north doorway** looking in: shelves crammed with assorted junk line the
  walls; a closed **trapdoor in the ceiling** overhead (`up → Southern End of the Attic`). Cluttered.

#### costume-room
- **Vantage:** inside a crowded wardrobe room, racks upon racks of old costumes spanning every era
  (Imperial Rome → WWI). **Three costumed display MANNEQUINS** stand among them (pirate, etc.) — keep
  them, but they must read as **dressed dummies, not people** (App no-people: mannequins are props).
  Exit `east`.

#### sick-bay
- **Vantage:** a small former sick bay; `unprobed: poster` → walls covered with **indistinct** old
  medical instructional posters (no legible content). Period infirmary fittings only where sourced;
  doorway `south`. Don't invent equipment the source doesn't name.

#### guest-star-room
- **Vantage:** a small but **opulent** guest suite, furnishings markedly finer than the rest of the
  ruin: a fine carved **four-poster bed**, a **fireplace** in the west wall (`unprobed: fireplace` →
  a plain period hearth, unlit), `unprobed: poster` → indistinct. Door `east`. Faded richness.

#### sealed-off-office
- **Vantage:** a stripped former office, furniture gone but for a small **fireplace in the west wall**
  whose **sooty flue is an open shaft** continuing both `up → Guest Star Room` and `down → Boiler
  Room` (the flue IS the up/down exit form). A boarded-over door (east). Bare.

#### boiler-room
- **Vantage:** a cramped room dominated by a huge old iron **boiler**, pipes snaking out through the
  walls; a **shaft rises** from it as the only way up (the flue); a large dirty **coal bin** against
  one wall. No other exit. Cramped, sooty.

### Attic + roof

#### southern-end-of-the-attic
- **Vantage:** the **cramped southern end of a dusty attic** (source: "thick dust" → allowed); rough
  wooden studs & crossbeams obstruct the low space; the attic continues `north`; an open **trapdoor in
  the floor** leads `down → Prop Room`. Low, cobwebbed (sourced).

#### attic-above-the-theatre
- **Vantage:** a dusty attic space directly **over the auditorium**: bare crossbeams, a thinly
  plastered floor whose **cracks glow faintly with light rising from the auditorium far below** (a
  peek into the Auditorium volume from above). Continues `south`.
- **`unprobed: chandelier` / state:** the **chandelier winch** is mounted here (`north`). Canonical =
  **pre-winch** (chandelier still raised below). Render the winch mechanism as a fixture; don't depict
  the chandelier down.

#### attic-observatory
- **Vantage:** a bizarre attic observatory — instead of a dome, the roof is a single **strangely
  patterned window** (`look up`; `unprobed: window` → render it strange/patterned but not literal
  imagery); the exposed **wall-beams set at impossible, unnatural angles**, an unsettling maze-like
  wrongness. Exit `south`. (Occult set-piece — the wrong geometry is the point; source-grounded.)

#### theatre-roof
- **Vantage:** **high on the steeply sloping rooftop** beside a large brick **chimney**; city
  rooftops stretch away under a deepening **dusk** sky (`look up` = almost sunset, faint stars). Roof
  falls away dangerously on all sides; a safe route leads `down → Guest Star Room`. Strip the street
  thug (`look down`, NPC).

#### street-balcony
- **Vantage:** an **old stone balcony high above a side street** in the abandoned quarter; the view
  below = boarded-up shop fronts and derelict buildings (`look down`). Tall **windows lead back inside
  east**. `unprobed: sign` = FALSE hit (the "flashing signs" are explicitly GONE) — no signage.
  `unprobed: window` = the tall windows back in. Dusk/smog above.

### Library + occult upper

#### secret-library
- **Vantage:** inside a hidden library — **rows upon rows of tall bookcases** packed with old books;
  aisles lead `south`, a small recess `north`. To the `east` a **collapsed bookcase leaves a ragged
  hole** broken through the wall (to the wall-hollow). Musty.

#### reading-recess
- **Vantage:** a small alcove reading nook — a single small **reading table & wooden chair** remain;
  the library continues `south`. **Drop the two loose pages** on the desk (takeable). Small, quiet.

#### southern-end-of-the-library
- **Vantage:** the south end of the library, bookcases **draped & webbed with strange glistening pale
  strands** (a fixture — occult webbing; source-grounded, keep). A cold damp breeze enters through a
  **broken French window in the west wall** (`west → Street Balcony`); aisle `north`.

#### back-wall — shared-look: wall-hollow
- **Vantage:** the cramped, filthy **interior of a hollow within the dividing wall** between the
  theatre and the building beside it; bare dirt-caked timber & brick press close; almost no light.
  Continues `south → Wall with Large Hole`. Confined, near-dark (soft-dark — faint, not pure black).

#### wall-with-large-hole — shared-look: wall-hollow
- **Vantage:** the same narrow dividing-wall hollow, continuing north; a **large ragged hole broken
  through to the `west`**, opening into the neighbouring building. Dirty, confined. Match `back-wall`.

#### alley-courtyard
- **Vantage:** a small **enclosed courtyard at the centre of a city block**, hemmed in on all sides by
  tall blank buildings (no escape). Large disused **stage doors in the south wall**; a small back
  entrance (`southwest → End of Hallway`). The theatre's exterior rear. Dusk, consistent with outside.

### Below — tunnels / mines / sewer / lair

#### basement
- **Vantage:** a cellar **lit only by grey daylight** seeping through small **street-level windows set
  high on one wall** (`unprobed: window` = these high windows, the only light). Stacked wooden boxes &
  a couple of barrels; an open **trapdoor in the ceiling** (`up → Manager's Office`); the **electrical
  panel + switch** on the wall (the power switch — a fixture). Dim.

#### dark-place — (soft-dark room)
- **Vantage:** a **near-pitch-dark** underground space; only the faint suggestion of rough passages
  `west` & `northwest` can be made out. Soft-dark (source: "barely make out passages") → near-total
  darkness with the faintest passage hints, NOT pure black; status line still names it.

#### secret-stairway
- **Vantage:** a narrow secret stairway climbing up & descending `down → Underground Passage`,
  **feebly lit by a few bare electric bulbs** set into the ceiling (the light source). `look down` =
  stairs descend into darkness. Confined.

#### underground-passage
- **Vantage:** a dank underground passage of old **weeping brick**, climbing away to the west, running
  `east → Above the Pit` to a **heavy locked iron door**. Damp, cold.

#### above-the-pit
- **Vantage:** looking across a huge cavern-like chamber at the large **sunken pit** in the centre
  (like a drained swimming pool).
- **Exit form (climb-not-stairs, from exitFacts):** the pit is entered by **climbing DOWN into it —
  no stairs** ("rough walls make an easy climb", from `inside-pit`); a passage runs off east down
  inside it. A passage leads `west` to an **open iron door**. Vast, rough stone.

#### inside-pit
- **Vantage:** at the **bottom of the pit** looking up/around; rough walls make an **easy climb back
  up & out** (no ladder/stair); a gloomy tunnel leads `east → Tunnel Junction`.
- **Strip:** the trapped transparent creature & its attack are transient (NPC) → dropped. Bare rough
  stone.

#### tunnel-junction
- **Vantage:** a junction of rough-hewn tunnels; one runs `west` back toward the pit, others branch
  away (`southwest → Mine Shaft`, `southeast → Western End of Sewer`). Cramped, rough rock.

#### mine-shaft
- **Vantage:** a rough mine-shaft chamber **lit feebly by a single bare electric light**; crude rock
  walls; tunnels lead off in all directions (`down → Deep in the Mines`, `northeast → Tunnel
  Junction`). Raw stone.

#### deep-in-the-mines
- **Vantage:** a cavern deep in the workings, widened out, signs of major past excavation; a large
  iron **cage** dominates the space (a fixture — keep). Strip the **goblin** (NPC in the cage).
  `unprobed: sign` = FALSE hit ("*signs* of excavation") — no signage. Rough rock.

#### western-end-of-sewer — member: Sewer
- **Vantage:** the **west end** of the brick trench, running away east into the dark; terminates at a
  large iron **sluice gate** with a drain dropping below; a passage `northwest` back beneath the
  theatre. Wet brick. Consistent with the Sewer volume.

#### centre-of-sewer — member: Sewer
- **Vantage:** the **middle** of the trench (E–W); above to the north, the **metal platform** is fixed
  against the wall. Wet brick. Consistent trench.

#### eastern-end-of-sewer — member: Sewer
- **Vantage:** the **east end**, where the trench dead-ends at a cluster of small impassable **pipe
  mouths**; trench runs back west, a tunnel leads `southeast → Rat Nest`. Wet, grimy brick.

#### metal-platform — member: Sewer (anchor)
- **Vantage:** on the **raised metal platform fixed high on the wall, looking DOWN the length of the
  whole trench** to the south (the establishing view of the volume); a long rusty **lever** hangs from
  the ceiling within reach (a fixture). Grimy ironwork.

#### rat-nest
- **Vantage:** a small tunnel (NW–SE) its floor thick with rotting sewage & droppings; ends at an
  **unusual stone archway to the southeast** (`southeast → Witch's Lair`), beyond which is only
  darkness (the threshold to the lair — keep the archway, screen the dark beyond). Strip the rats
  (NPC). Filthy.

#### witchs-lair — (occult set-piece)
- **Vantage:** inside a **small circular red-brick chamber, domed like an igloo**; centre = an old
  iron **cauldron** filled with dark bubbling liquid (unlit — no invented glow, factor 9); curved
  walls lined with **shelves of vials & strange knick-knacks**.
- **Shared landmark / KEEP:** the four-eyed **statue** with its **jewelled dagger** (from the
  `landmarks` glossary — examined here; the dagger is firmly-attached until the ceremony, a fixture at
  first view). ⚠ **Drape the figure** (the source never says nude) — photoreal-nudity moderation
  gotcha (less acute under `pulp-press`, but keep it draped). Source-grounded facts only; the lurid
  charge is the artist's.
