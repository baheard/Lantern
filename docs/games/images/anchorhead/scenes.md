# Anchorhead — Scene prompts (worksheet)

A file of per-room **Scene** prompts to feed the generator. Only the `SCENE:` line of
each block is authoritative — `EXITS:`/`PROSE:` are reference, ignored by the importer.

Rules followed (see `.tome/art-direction-model.md`): literal contents only; geometry stated
explicitly; interior/exterior tagged (the Aesthetic applies rain to exteriors, dimness to
interiors); transient/randomized flavor and people stripped (no-people unless the scene
pivots on them); positive phrasing for guardrails (describe what IS there, don't name the
forbidden object). Palette/mood = Aesthetic layer; medium = Artist layer — kept OUT here.

Import finished scenes into `style.json` → `scenes[]`:
`node tools/scenes-import.cjs anchorhead`

---

## outside-the-real-estate-office — Outside the Real Estate Office
EXITS: west → Narrow Street; southeast → Alley; east → Office (prose; auto-mapper says NW)
PROSE: A grim little dead-end cul-de-sac in the old quarter; ancient, shadowy, leaning buildings; the real estate office closes the east end; the lane winds back west toward town center; a narrow, garbage-choked alley opens to the southeast.
SCENE: An exterior dead-end cul-de-sac in the old quarter of a cramped seaside town, damp cobblestones underfoot, ancient shadowy leaning buildings crowding in on all sides. At the east end of the lane stands a small real-estate agent's office, a modest storefront with a door and a window closing off that end. The cobbled lane curves away to the west back toward the town center. At the southeast corner a narrow, garbage-choked alley mouth opens between two buildings. The only ways out are that alley mouth and the lane curving west.

## alley — Alley
EXITS: west → Outside the Real Estate Office
PROSE: Narrow gap between two crumbling brick buildings; half-blocked with rotting boxes and overstuffed garbage cans; dead-ends at a tall wooden fence; a narrow transom window high on the NORTH wall (climb the cans to reach the file-room window).
SCENE: A narrow alley between two tall, crumbling brick buildings that lean oppressively close together overhead, almost shutting out the sky. The passage is half-blocked with rotting cardboard boxes and a couple of overstuffed metal garbage cans, and dead-ends at a tall barrier of weathered vertical wooden planks — a continuous, flat, featureless wall of close-set boards spanning the full width of the alley. The brick side walls are solid and unbroken. At least one of the garbage cans has its top on. Garbage cans are all on the right side of the alley, but the boxes are all over on both sides. On the NORTH (left) wall, a single narrow horizontal transom-style window set roughly one storey up — above head height but low enough to reach by climbing the garbage cans, NOT at the very top of the brickwork. The only opening anywhere in the scene is that single high transom window on the north wall.

## file-room — File Room
EXITS: up → Office (prose: doorway west; window high on SOUTH wall = alley's north window)
PROSE: Dim, murky records room; filing cabinets line the walls; a doorway to the west; a window high on the south wall lets in faint light. Same window the alley climb reaches.
SCENE: A dim, murky interior records room. Tall metal filing cabinets line the walls. A single plain doorway leads out of the west wall. High up on the south wall, a narrow horizontal transom-style window set roughly one storey up lets in a faint, weak light; it is the room's only window. Bare wooden floor, the remaining walls solid and unbroken.

## office — Office
EXITS: (prose: front door west, file room east)
PROSE: Deserted office; pallid gray light through drawn blinds; papers scattered on a desk; telephone and answering machine on a desk corner; a half-finished cold cup of coffee; front door west, file room east.
SCENE: A small, deserted interior office. Pallid gray daylight trickles in through the drawn slat blinds of a window. A wooden desk dominates the room, its top strewn with scattered papers; on one corner sit a telephone and an answering machine, and a half-finished cup of coffee gone cold. A plain door leads out of the west wall and a doorway opens in the east wall. Quiet and empty.

## narrow-street — Narrow Street
EXITS: west/north → Junction; east/southwest → Whateley Bridge; south → Twisting Lane
PROSE: Curving cobblestone lane so narrow the rooftops nearly touch overhead; a short flight of steps north leads down to a basement pub; (sheet-lightning line is randomized flavor — stripped).
SCENE: A cramped, gently curving cobblestone street in an old seaside town, so narrow the steep jagged rooftops on either side nearly meet overhead. Damp cobblestones underfoot — NOT a dirt road. A short, low flight of stone steps off to one side descends to a basement pub doorway. Overcast and rainy. No archway, no grand staircase, no dramatic lightning — just a tight, wet, gloomy lane between leaning buildings.

## junction — Junction
EXITS: west → University Court; south/southeast → Narrow Street
PROSE: A street junction hemmed by gloomy buildings; a gap north opens onto a country lane over a grassy heath; the main street continues east; the university's rooftops are visible NW beyond a steep rise.
SCENE: An exterior street junction in the old town, hemmed by a crowded press of gloomy, leaning buildings, damp cobblestones underfoot. To the north a gap between the buildings opens onto a country lane running out across an open grassy heath. The main cobbled street continues east. To the northwest, beyond a steep rise, the vaulted rooftops and spires of a university are just visible over the buildings.

## university-court — University Court
EXITS: northwest → Library; east → Junction (prose: library lies west)
PROSE: A cobbled university courtyard enclosed by high, ivy-covered walls; several old collegiate buildings surround it; the library entrance lies to the west. (History paragraph + Michael stripped.)
SCENE: An exterior cobbled university courtyard enclosed by high, ivy-covered stone walls. Several old collegiate stone buildings with tall windows surround the court. On the west side stands the entrance to the library, a doored stone façade. Worn paving stones underfoot, quiet and isolated.

## library — Library
EXITS: west → Circulation Desk; south → University Court; north → Study
PROSE: A dim library with a high vaulted ceiling lost in shadow; small green-shaded desk lamps cast warm pools of light; reading desks; a small alcove to the north houses the circulation counter; exit east. (Husband at desk stripped.)
SCENE: A dim interior library with a high vaulted ceiling lost in shadow. Rows of wooden reading desks, each with a small green-shaded brass desk lamp casting a warm pool of light across the dark room. Tall bookshelves recede into gloom. A doorway exits to the east, and a small alcove to the north houses a wooden circulation counter.

## whateley-bridge — Whateley Bridge
EXITS: south → Town Square; north → Narrow Street
PROSE: An ancient stone bridge of crumbling, moss-eaten flagstones spanning the dark, torpid Miskaton River; low stone parapets flank both sides; wide enough for two cars. (Michael stripped.)
SCENE: An exterior view of an ancient, crumbling stone bridge of moss-eaten flagstones spanning a dark, sluggish, torpid river. Low stone parapets flank both sides of the roadway, which is about wide enough for two cars to pass. Bits of gravel and mortar crumble from its edges. The leaning rooftops of the town rise on the far bank.

## town-square — Town Square
EXITS: south → Riverwalk; north → Whateley Bridge (prose: courthouse south, alley SW, avenues E/W)
PROSE: A wide open square of uneven pavestones, bordered by leaning steep-roofed buildings; a municipal courthouse at the south end; a dark narrow alley mouth to the SW; avenues west and east; the bridge north; in the CENTER a strange featureless stone obelisk rising from a circular bed of unhealthy weed-choked grass, no plaque. (Michael stripped.)
SCENE: An exterior open town square of wide, uneven pavestones beneath the open sky, bordered on all sides by leaning, steep-roofed buildings. At the south end stands a municipal courthouse; immediately southwest of it the dark, narrow mouth of an alley opens between buildings. Cobbled avenues lead out to the west and east, and to the north the roadway runs onto an old stone bridge. In the center of the square, rising from a circular bed of unhealthy, weed-choked grass, stands a strange, plain stone obelisk — a featureless monument with no plaque or marker.
