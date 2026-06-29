# Dreamhold — location framing

> **MOLD-authored, regenerable cache. NEVER hand-edit.** Records the molding *judgments* (vantage,
> occlusion, exit handling, state, shared-volume geometry) that the `style.json` scene prose is
> distilled FROM. Reproducible: re-running the mold over the same inputs reproduces this file.
>
> **Inputs reasoned over:** `room-facts.json` (mechanical facts — scene, exits, exitFacts, lookFacts,
> landmarks, unprobed, recoveredFrom/anchorRoom/stateDelta) · `_review-notes.json` (empty — no human
> feedback yet) · `.tome/art-direction-model.md`.
>
> **Litmus:** a *derivable* fact belongs in the dossier (fix the engine, not here); a *non-derivable
> judgment* belongs here. Framing holds the **decision + why**; the scene holds the **imperative the
> model renders**. No compass words survive into the scenes (factor 10b) — facings are reasoned here
> and converted to image-relative position there.

---

## Cross-cutting

### Register
- **Cast artist:** NOT yet selected — audition pending (`audition.json`: picture-book / plein-air /
  illustration-plate / lantern-slide, on rooms mountain-garden, dark-dome-center,
  curtained-room-on-the-chair, sitting-room). Mold is artist-independent: scenes carry NO
  medium/palette/contrast/tonal words. Whatever wins, the tonal register is the artist's job.
- **Global condition / mood:** the aesthetic states it ONCE — "luminous wonder, serene and dreamlike;
  sunlit mountain gardens and verdant marble terraces; glowing magical chambers above the vast hush of
  caverns far below." So do NOT re-tag rooms with mood adjectives. Dreamhold is a *living, tended*
  wizard's house — there is no "abandoned/dusty" global condition to chase. Where a room's own source
  says it is dim, moldering, dark, or cracked (the curving plaster halls; the dark dome; the ruined
  harp), that physical fact stays — it is light/material, not mood.
- **Light is source-grounded only (factor 9).** Dreamhold lights itself in strange ways the source
  names explicitly — keep exactly those and invent none: tiny flickering candles (curving halls),
  cherry-red glowing spheres / insubstantial flame (sitting-room hearth), "diffuse colorless"
  dome-light, featureless luminescent white ceiling (cistern), worms of light on the ceiling (lab),
  daylight through the mountain windows, blinding light around the harp-chamber door, phosphorescent
  water. Never add a glow/colour-cast the prose did not establish.
- **Recurring takeable: the masks — DROP every loose one (factor 2).** Collectible masks lie around
  the house (white papier-mâché by the study desk, brown paper at the mountain pool, green on the
  river scree, red in the cistern trough, black on the night ledges, blue on the orrery globe). All
  are pocketable → omitted from establishing shots; the player reads the room text. The **gold mask
  balanced on the Marble Balcony statue's brow is the EXCEPTION** — it is the statue-landmark's
  signature detail (`landmarks.statue`) and load-bearing to that room's image, so it KEEPS.
- **Strip the disembodied Voice / lore narration (factors 3, 12).** Three narration classes are
  chrome, not scene: (a) the tutorial "Voice" asides (narrow-hallway, darkness — already stripped in
  the dossier); (b) the constellation *myths* that the Starry Dome scenes were rebuilt from (Jernos,
  the Crutch, Parhu's Galley…) — pure lore, keep only the visual of stars on the dome; (c) the
  overheard "Someone is talking, though not to you:" speeches in every "…, Possibly" dream room — drop
  the speech AND that dangling lead-in line.
- **False/echo `unprobed` hits:** "mirror" fires in shore-of-river ("mirror-dark water" — no mirror,
  it is the river) and depths-of-pit (the examine returns the *painting* of a pool, not a mirror).
  "column" recurs across caverns/cistern = real stone/black columns, render them. "pillar" =
  the golden harp-chamber pillars / garden marble pillars, real.

### Volume: Dark Dome — anchor `dark-dome-center`
One single vast domed space, sliced into 5 compass stations and re-lit into 3 illumination STATES.
The spike (tome 2026-06-22) proved this volume must be **anchor + img2img relight**, not N
independent renders, or the dome proportions/floor/threshold drift and the central pyramid vanishes.
- **Members (stations):** `dark-dome-east`, `dark-dome-north`, `dark-dome-west`, `dark-dome-south`,
  `dark-dome-center`. **State-variants of the same dome:** `lit-dome-center` (the dome flooded with
  brilliant white light — anchored to dark-dome-center in the dossier), and the **Starry Dome**
  stations `starry-dome-center/east/south/west/north` (the same dome gone dark with constellations
  spangled across its inner surface).
- **Geometry:** an immense round room arching into one great dome overhead; a flat floor under
  "diffuse, barely-bright, colorless" light that washes only the lower edges. A bare **iron ladder**
  pierces the floor and the dome's skirt at the **north** edge (runs both up and down). An **open
  archway** at the **east** edge gives onto stairs descending (→ Curving Hall, South End). Dead centre
  on the floor stands a **low six-sided metal pyramid** (~a yard across, knee-high, hinged base +
  handle, faintly line-engraved sheen). **The pyramid sits CLOSED at first visit** — a small
  silver-wire spiral basket lives INSIDE it, visible only once it is pulled open (a puzzle action — it
  is what flares the dome into the Lit state). The dossier merged a post-open `examine basket` into
  Center's scene (factor 2/8 gated-detail miss); the basket belongs ONLY in `lit-dome-center`, never in
  the dark/starry first-view scenes. The pyramid is named only in Center's prose — pull it (closed)
  into every station view as the distant centre (the spike showed edge views drop it otherwise).
- **Vantage convention:** the player stands AT an edge looking ACROSS the dome to the far side; the
  dome is so wide that the far ladder/doorway read as small distant marks. Center looks down at the
  pyramid with the dome soaring above. Keep the round dome, the floor plane, and the two distant
  landmarks (ladder, doorway) consistent across all five.
- **States:** **Dark** (canonical first state — dim colorless half-light). **Lit** (sphere dropped in
  the basket → the whole dome floods with blinding white light; relight of the anchor). **Starry**
  (dome dark, its curved inner surface scattered with constellations of stars like a planetarium;
  floor still dimly sensed). Paint each station in its own state; the Dark state is the base anchor.
- **Note — Subterrane World** (`subterrane-world`) is this same domed cavern *sensed in pitch dark by
  non-visual "dark senses"*: behemoth stone columns in a perfect circle, a vast carved form high in
  the vault, a dagger balanced point-down at centre. Frame it as the dome's volume rendered in pure
  darkness (form without light), NOT as a lit room. Not a relight member (different render intent).

### Volume: Outer Catwalk — anchor `catwalk-south`
The railless iron catwalk that **circles the outside of the small pale Translucent Dome**, high on a
sunlit mountain shoulder. 4 compass stations × 3 sky-states, plus the Shadow-Path spur that only
exists in the dark states.
- **Members (day):** `catwalk-south`, `catwalk-west`, `catwalk-north`, `catwalk-east`.
  **Night state:** `catwalk-south-night`, `catwalk-west-night`, `catwalk-north-night`,
  `catwalk-east-night`, plus `shadow-path-west-of-dome-night`, `shadow-path-far-west-of-dome-night`,
  `ledge-night`. **Unearthly state:** `catwalk-*-unearthly`, `shadow-path-*-unearthly`.
- **Geometry:** a narrow railless walkway girdling the outside of the pale translucent dome, which sits
  on its own promontory high on the mountain. To the mountain side the cliff towers close but separated
  by a deep jagged ravine; to the open side the slope falls away to a vast green valley far below. A
  few iron steps climb the dome's flank to a round opening (ladder down inside) at the south station.
- **Sky-states (factor 8 — paint each in its own):** **Day** = unclouded blue sky, exuberant
  early-afternoon sun, valley bright green (canonical first state). **Night** = black star-thick sky,
  risen moon ringed by a halo; the dome glows from the fire lit inside it, and the copper sail's
  silhouette throws a long solid-black shadow off the catwalk into empty air. **Unearthly** = the sky a
  racing nightmare of scarlet/carmine/rust streams, no sun, the world lit only in harsh red; the dome
  a "red bauble."
- **Shadow Path (Night/Unearthly only):** the sail-shadow becomes a literal **solid black tongue of
  shadow bridging the ravine** — you walk out on it, away from the dome toward the mountain face; it
  narrows to a point ("far west"). It ends at a **ledge** on the cliff face (a torn black mask sits
  there — DROP, takeable). Render the shadow as a flat black ribbon hanging impossibly in air, the lit
  dome behind, the cliff ahead.
- **Vantage convention:** stand on the walkway, dome on the mountain side at your shoulder, the open
  drop and valley on the other side. Keep the same dome + valley + ravine across all stations; only the
  sky and the shadow-bridge change.

### Volume: Cistern — anchor `cistern-west`
One immense **elliptical** sealed chamber, seen across by every member. ASYMMETRIC (tome flagged it as
the hard img2img case — the features sit on specific walls; a true camera swing is wanted, which
edit-mode may resist). Frame each station with a grounded vantage; do not pretend it is a symmetric
dome.
- **Members:** floor level — `cistern-west` (entry, the full establishing view), `cistern-east`,
  `cistern-east-on-the-glass-platform`, `cistern-bottom`; the girdling **glass catwalk trough** —
  `cistern-catwalk-east/northeast/north/northwest/west/southwest/south/southeast`.
- **Geometry (the whole vertical stack, from cistern-bottom's enumeration):** floor = a flat *perfect
  black plane* of indeterminate stone/metal/glass that gives no reflection (it is the surface of a
  black "tide"/substance; the floor slopes down to its lowest point at the east wall, where a small
  black disk + an iron wheel sit). Walls = tightly-dressed granite blocks, bare. Ceiling = a flat
  *featureless luminescent-white ellipse* radiating a shadowless light, remote and high. Midway up the
  wall, a **glass catwalk runs as a shallow trough** all the way around (a yard wide, a foot deep). A
  **black column** rises along the **east** wall from floor to catwalk, beside a low **glass platform**
  that juts from the east wall an inch above the floor; cut handholds beside it form a ladder up to the
  trough. The only door is the heavy iron door at the **west** wall (→ Dead End).
- **The trough's condition varies by arc (render exactly, it's the puzzle's logic & all source-named):
  ** east — clear, a brass spout-pipe protrudes from the wall just past its end; northeast — a large
  curved glass slab leans wedged upright in it; **north arc** (north/northwest/west/southwest) — the
  glass is progressively cracked, spiderwebbed, holed (thumb-→fist-→egg-sized gaps); **south arc**
  (south/southeast) — the trough is FILLED FLUSH with the black substance (a flat black pathway), which
  rears up at the southeast wall against a gauze-filmed brass grate and spills over to feed the black
  column. Shared landmark across all: the white ceiling-glow, the black floor far below, the column.
- **Canonical state (factor 8):** first exploration = chamber as found. The black floor/tide is
  present from entry (cistern-west describes it). Render the cracks/leaning-slab as found; they are
  pre-existing, not player-made.

### Volume: the "…, Possibly" dream-echo sequence — no single anchor (distinct echo-rooms)
A late dream walk through **distorted echoes** of real Dreamhold rooms. Not one geometric volume, but
one strong shared register, authored once here:
- **Members:** `cell-possibly`, `white-hallway-possibly`, `gold-harp-chamber-possibly`,
  `red-curtained-room-possibly`, `brown-shed-possibly`, `green-bower-possibly`,
  `blue-mosaic-room-possibly`, `black-night-perhaps`.
- **Shared convention:** each echoes its real twin (the Cell; the white Curving Hall; the Harp Chamber
  now all-gold; the Curtained Room now red & its mirror-frame empty; the Dim Shed in brown plank; the
  Mountain Garden bower; the blue Mosaic Room; the open night sky) BUT the **floor is one continuous
  plane of fine swirling geometric diagram-marks, wall to wall**, and the room opens **eight ways at
  once** (gaps/arches/paths/stairways in every direction) instead of its twin's normal exits. Dreamlike
  multiplicity. The overheard speeches are stripped (Register). Frame each as its twin, re-skinned with
  the diagram floor + eight openings; keep the dream register (no people).

### Volume: Orrery — anchor `orrery`
- **Members:** `orrery`, `south-alcove`, `north-alcove`. A wide tall dim six-sided chamber dominated by
  a **vast brass-disk machine** (an orrery: a great stately brass disk on a tilted axis, lower edge
  inches off the floor and upper edge near the high roof, engraved with arcs, a fixed blue-glass globe
  at its centre, smaller wheels bearing glass globes pirouetting on its face, slow steady rotation).
  The two small curved **alcoves** open off the north and south sides and *see the machine spinning in
  the chamber*. Pull the machine into both alcove views as the thing glimpsed through the opening.
- **Exits:** south-alcove has an iron ladder up a shaft (→ Starry Dome North); north-alcove an archway
  to ascending stairs (→ Curving Hall West End). Render minimally (shaft mouth / stair archway).

---

## Rooms

### cell
- **Vantage:** inside the tiny raw-stone cell, facing the one narrow gap in the wall ahead; the cell is
  barely shoulder-wide. Smooth white floor underfoot is the one finished surface.
- **Persistence:** DROP the quill pen (held inventory item, not in the room).
- **Scale:** cramped — width of outstretched arms.

### narrow-hallway
- **Vantage:** in a short windowless hall; foot of a stair rising out of sight ahead on one side, the
  hall narrowing to a small gap-doorway behind/other end. Strip the tutorial Voice (already stripped).
- **Exits:** show the stair-foot rising off-frame and the narrow gap; both minimal, in dark stone.

### crowded-study
- **Vantage (10a, facing EAST = `defaultFacing`):** entry is from Narrow Hallway (`east ← Narrow
  Hallway`), so the camera stands just inside the west doorway looking east across the crammed study.
  The massive worn wooden desk is centre-ahead with the single immense book on its bare top; the tall
  glass-fronted cabinet stands directly beyond it, small closed brass trunk beside. Panelled walls
  jammed floor-to-rafter (books, papers, dried plants, preserved animals, instruments, candles); books
  stack on the floor. Heavy dark roof-beams overhead (lookFacts up).
- **Facing→frame (EAST ⇒ N=left, S=right, W=behind):** the heavy iron-strapped wooden door (`south →
  Iron Corridor`; thick iron lock, closed — exitFacts) → **on the right**. The other three exits are
  plain openings: parlour doorway (`north`) → left, Curtained-Room doorway (`east`) → ahead behind the
  cabinet, Narrow-Hallway entry (`west`) → behind the viewpoint.
- **Exits (10d — cap & place):** SHOW only the characterful iron-strapped door (right, closed); SCREEN
  the three plain gaps (lost in clutter / behind the viewpoint). No other doors studding the walls.
- **Persistence:** DROP the white papier-mâché mask by the desk (takeable, lookFacts down). KEEP
  desk/book/cabinet/trunk.

### sitting-room
- **Vantage (10a, facing NORTH = `defaultFacing`; AUDITION room):** entry is from Crowded Study
  (`north ← Crowded Study`), so the camera looks north toward the hearth, which the prose puts on "the
  far wall" — i.e. **ahead**. Two chairs and a cushioned settee stand before it, facing it, so they are
  seen from behind. The desert-landscape painting (`landmarks.painting`) hangs above the hearth.
  Flower-painted walls melting into a soft flower-petal carpet.
- **Facing→frame (NORTH ⇒ E=right, W=left, S=behind):** the panelled white door with the ornate copper
  knob (closed — exitFacts) → **on the right** (`east → Curving Hall`). The two open plain doorways
  (`southeast → Curtained Room`, `south → Crowded Study` = the entry) → **behind the viewpoint**.
- **Light:** the hearth holds NO fire — a silver-wire basket of glowing cherry-red glass spheres with
  insubstantial flame flickering above them (source-named; render exactly, no invented fire).
- **Exits (10d):** SHOW the white copper-knob door (right, closed); SCREEN the two open doorways behind.

### curving-hall
- **Vantage:** a high dim plaster corridor curving gently away out of sight; lit only by tiny flickering
  candles set high. Cracked, moldering plaster; crude vaulted plaster ceiling; worn uneven wooden-board
  floor. An open white door on one side, archways opening off it.
- **Exits (5):** do NOT enumerate all five as doorways. Show the curve receding, one open white door,
  one or two dim archways; let the rest be lost in the curve/shadow.

### curving-hall-south-end
- **Vantage:** the corridor dead-ends here at a blank plaster wall holding one large **window** through
  which sunlight pours, brightening the dim hall (`landmarks.window` — a flawless pane over a sheer
  cliff: sunlit mountainous world, verdant valley far below, threads of stream, mountains beyond
  mountains, no ground visible below the sill). Face the bright window; the dim candlelit corridor
  recedes behind.
- **Exits:** an archway (one side) and a plain white closed door (other) — minimal; the window is the
  subject.

### dim-shed
- **Vantage (10a, facing EAST = `defaultFacing`):** entry is through the lit archway from Curving Hall,
  South End (`east ← Curving Hall, South End`), so the camera stands just inside that archway looking
  east into the dim shed — bare hard-packed dirt floor (lookFacts down), rough unfinished plank walls,
  the interior fading into dimness ahead.
- **Facing→frame (EAST ⇒ N=left, S=right, W=behind):** the only light spills in from the **archway
  behind the viewpoint** (the entry, `west → Curving Hall, South End`); the narrow opening onto the
  steep stairway climbing up into darkness (`up → Landing`) → **on the left**.
- **Persistence:** DROP the single glove in the corner (takeable).

### landing
- **Vantage:** a cramped dark stair-landing where the stair reverses and continues up; close dark walls.
  Minimal, claustrophobic.

### mountain-path
- **Vantage:** at the foot of a low rocky cliff under a vast blue early-afternoon sky; mossy boulders
  hem both sides; a tidy path winds away ahead; behind, the path enters a crack in the cliff onto
  descending stairs. Exuberant sun.

### mountain-garden  (AUDITION room)
- **Vantage (10a — departs from entry-facing, with reason):** standing in the tiny mountainside
  pleasance-garden facing the **mountain** (north). Entry-facing would be *south* (the player arrives
  by climbing `up` from Mountain Path, which lies north — so travel-into-room heads south toward the
  balcony). We deliberately turn to face the mountain instead because **the white dome on its face is
  this room's signature, unique landmark** (it appears nowhere else from below), and the balcony+statue
  behind the camera **owns its own hero room** (`marble-balcony`) — facing south would only duplicate
  it. Foreground/mid: sculpted grassy slopes and hillocks, odd bits of statuary, small marble pillars
  along the knotted paths, perfectly trimmed lawn.
- **Shared landmark:** that white dome high on the mountain face is the Translucent Dome / Catwalk
  volume seen from below — **render it small and distant**, featureless pale (the bare noun renders
  HUGE without the scale anchor — verbatim test 2026-06-26 ballooned it into a giant sphere; the
  "small, distant" anchor is a sanctioned distillation add, factor 10e).
- **Exits / paths (10d + 10b facing-north map: E=right, W=left, ahead=background, behind=off-frame):**
  three of the four exits ARE the garden's paths — render them as paths, not doorways, each in its
  source form:
  - `north → Mountain Path`: the **tidy path between mossy boulders**, running away *ahead* toward the
    mountain (into the background).
  - `west → Warm Bower` / `east → Cool Bower`: the single **wider path** that crosses in front —
    *dropping down a grassy slope to the LEFT* (west) and *rising up to the RIGHT* (east). This left
    descending arm is the detail every paraphrased pass kept dropping; preserve it verbatim.
  - `south → Marble Balcony`: the marble steps + balcony + tall statue are **behind the camera —
    SCREEN them** (off-frame). Persistence: drop the statue here (it's the `marble-balcony` hero;
    `unprobed: statue` is therefore moot for this room).
- **Persistence:** `unprobed: pillar` = the small marble border-pillars marking the path edges —
  real, render them plainly as low marble border posts (no probe needed).

### cool-bower
- **Vantage:** a small promontory jutting from the mountain face; shrubs and raised flowerbeds; a path
  sloping down on one side; a sharp dropoff over a lush green valley on two open sides. Centre: a single
  dense dark squat bush, branches knotted then spraying delicate blue-green needles (white berries
  hidden within); a chill fog rolls out from under it across the ground and spills off the edge.

### warm-bower
- **Vantage:** a sun-hot garden corner tucked in a natural alcove, stone bluffs on three sides; the
  ground drops away to a lush valley far below on the open side; the path curves up around an
  outcropping. Centre: a single tall wild bush taller than a person, branches twisting then leaping
  upward spraying gold-veined glossy leaves (orange berries half-hidden in tangled black branches);
  grey wisps of woodsmoke (no flame, no ember-glow) curl from the coal-black stems and ribbon upward.

### marble-balcony  (shared landmark statue)
- **Vantage:** standing at the gently-curved white-marble balustrade looking out over the green vista —
  stony slopes crumbling into forest, valley floor, a bright stream-thread, a silver arc of lake, taller
  mountains standing like patient shadows in blue air. The twice-life-size **white marble statue**
  (`landmarks.statue`) towers at balcony centre, also looking out: abstract, genderless marble curves,
  weight forward, head turned and chin raised as if something in the valley caught its eye; an absurdly
  small flat **gold mask balanced on its brow** over where the eyes would be.
- **Persistence:** KEEP the gold mask (statue-landmark signature — the EXCEPTION to the mask-drop rule).

### mosaic-room
- **Vantage:** a small room whose walls AND ceiling are entirely tiny blue tiles forming a perfect blue
  mosaic sky (a few black/grey mosaic birds circle near the eastern horizon, rising up the walls and
  over the ceiling). One archway out. Centre: a delicate brass-wire cage on a curved stand holding a
  single ripe perfect apple (cage door closed — gated, KEEP as the signature display).

### atelier
- **Vantage:** a cramped boxy artist's studio, walls and floor paint-splattered in many colours,
  otherwise near-empty (no canvas stacks, no pigment bottles). A rough wooden easel at one end holds a
  painting — a bright mountain landscape; a tripod holds a small telescope at the other end; a
  pigment-daubed palette board sits in a corner. One exit.

### metal-culvert
- **Vantage:** standing in a dark curving culvert of polished metal gone antique with tarnish; one end
  closes in a circular glass barrier, the other opens out into light. STRIP the telescope-peering
  transition narration (chrome) — render only the culvert.

### mountain-pool
- **Vantage:** impossible knife-like rock spires tearing the sky in every direction; in a sheltered
  nook, a small mossy shadowed pool (tiny fish moving in it) below a rock-spring. Life flourishing in
  the nook.
- **Persistence:** DROP the brown paper mask on the shore (takeable).

### platform-in-the-void
- **Vantage:** a narrow wooden platform (hardly wider than a person is tall) suspended in a vast
  incomprehensible space that is neither dark nor light and cannot be focused upon; the plank stretches
  to either side. Render the unfocusable void as the subject.

### red-desert
- **Vantage:** a stark desert spread in every direction, harsh grit littered with dusty stones, the sun
  a red glare low on the horizon turning the world to scarlet, rust and shadow.
- **Persistence:** DROP the crumpled white wad/letter AND strip its read-aloud text (takeable + lore).

### sea-of-white
- **Vantage:** standing impossibly balanced atop a choppy heaving milk-white sea, white waves rolling
  to every horizon, no land anywhere.
- **Persistence:** DROP the tangle of string floating nearby (takeable).

### curving-hall-at-pedestal
- **Vantage:** the dim candlelit plaster corridor curving out of sight both ways; a short black-marble
  pedestal stands by the inner wall; archways lead off. Same plaster/vault/board-floor material as the
  rest of the curving hall.
- **Exits:** show the curve + one or two archways; the pedestal is the foreground subject.

### natural-passage
- **Vantage:** a narrow natural cave passage of creamy water-worn limestone laps and folds, winding;
  one archway behind glows with the only light, the passage ahead vanishing into cave-blackness. Frame
  the lit archway behind-to-one-side and the dark mouth ahead.

### darkness
- **Vantage:** near-total blackness — "infinitely far away and an inch from your groping hands." Render
  as almost pure dark with only the faintest groping suggestion of space. Strip the tutorial Voice.

### subterrane-world  (Dark Dome volume, dark-sense)
- **Vantage:** the great domed cavern perceived in utter darkness by non-visual senses — behemoth
  smooth stone columns standing in a perfect circle, a vast carved form high in the cross-vaulted roof,
  the rough-hewn floor. Render form-without-light: shapes emerging from blackness, no illumination.
- **Persistence:** DROP the dagger balanced point-down at the circle's centre (takeable target). Keep
  the columns + vaulted form.

### sitting-room-on-the-settee
- **Vantage (10a — occupied furniture is the vantage):** viewed *while seated on the settee* → **the
  settee is beneath the viewpoint, OMIT it from frame** (don't list it among the things facing the
  hearth — that draws an empty settee). Camera looks toward the hearth ahead (same NORTH axis as base
  `sitting-room`), a touch lower/closer than the standing base shot. The two chairs ahead, facing the
  hearth, DO appear (seen from behind/the side).
- **State (factor 8 — canonical PRISTINE, first-sit):** the desert-landscape painting
  (`landmarks.painting` — a stark rocky desert at dawn, harsh scarlets and rust) hangs above the
  hearth, and the white door is CLOSED. **Provenance:** this is the FIRST-sit state, recovered from the
  base-pristine snapshot (`recapturedFrom: base-pristine`) — NOT the post-dream `enter rent` return
  (empty hook / open door) the walkthrough incidentally lands in. Same flower walls / flower-petal
  carpet, two chairs ahead.
- **Light:** the hearth holds NO wood fire — a silver-wire basket of glowing cherry-red glass spheres
  with insubstantial flame flickering above them (source-named; render exactly, no invented fire).
  Matches base `sitting-room`.
- **Facing→frame (seated, facing the hearth ahead — NORTH axis ⇒ E=right, W=left, S=behind):** the
  panelled white-painted door with the ornate copper knob (CLOSED) → **on the right** (`east → Curving
  Hall`); the two plain doorways → **behind the viewpoint**, out of frame. (Matches base `sitting-room`
  so the two images agree.)
- **Exits (10d):** SHOW the closed white copper-knob door (right); SCREEN the two doorways behind.

### dark-dome-east  — member: Dark Dome
- **Vantage:** at the east edge, looking across the vast dim round dome to the west; the open archway
  (stairs down) just behind/beside on the near wall; the ladder a small distant mark at the far north
  edge; the central pyramid a low distant shape mid-floor. Diffuse colorless half-light washing only
  the lower edges.

### dark-dome-north  — member: Dark Dome
- **Vantage:** at the north edge by the **iron ladder** that pierces floor and dome-skirt (runs up and
  down through openings), looking across to the south; the distant doorway a small mark at the far east
  edge; pyramid low at centre. Ladder is the foreground feature here.

### dark-dome-west  — member: Dark Dome
- **Vantage:** at the west edge looking across to the east; ladder distant at far north edge, doorway
  barely visible all the way across at the east; pyramid at centre.

### dark-dome-south  — member: Dark Dome
- **Vantage:** at the south edge looking across to the north; doorway distant at the east edge, ladder
  barely visible across at the north; pyramid at centre.

### dark-dome-center  — member: Dark Dome (ANCHOR, AUDITION room)
- **Vantage:** dead centre of the floor, the immense dome arching overhead, looking down at the **low
  six-sided metal pyramid** (hinged base, handle, faint line-engraved sheen), sitting CLOSED — the
  basket inside is not visible at first visit (see volume note); distant doorway one way, distant
  ladder another, both small far marks at the dome's edges. This is the volume anchor — the cleanest whole-dome establishing shot; render the
  round dome + floor plane + central pyramid + two distant edge-landmarks consistently.

### starry-dome-center / -east / -south / -west / -north  — member: Dark Dome (Starry state)
- **State:** the SAME vast dome gone dark with its curved inner surface scattered with constellations
  of stars (planetarium-like). STRIP all constellation myths (lore) — render only stars on the dark
  dome. Floor still dimly sensed below.
- **Vantage per station:** same edge-looking-across convention as the Dark stations; the named
  constellations correspond to which way you face but are not individually renderable as myths — paint
  scattered star-groups across the dome. **north** additionally has the ladder (up → Translucent Dome,
  down → the Orrery's South Alcove) and is the station the player climbs through; **east** has the
  doorway (→ Curving Hall South End). Keep the dome geometry identical to the Dark anchor; only the
  lighting (dark + stars) changes.

### lit-dome-center  — member: Dark Dome (Lit state, anchor dark-dome-center)
- **State:** relight of the anchor — the pyramid has been **pulled OPEN**, revealing the silver-wire
  spiral basket within; the grey sphere dropped into it flares and the whole dome **floods with
  brilliant white light**. Same centre vantage, same pyramid (now open, basket visible+blazing), dome
  fully blindingly lit white. This is the ONLY dome view where the basket appears. img2img relight delta
  = "flooded with brilliant white light." Drop the action narration ("As you drop the grey sphere…").

### translucent-dome
- **Vantage (10a):** inside the small round dome (far smaller than the vast dark space below it), eye-
  level, looking across the grating floor toward the copper sail on the far curve. The dome's curving
  surface is translucent, glowing soft and bright with daylight filtering in from outside (nothing
  outside is visible — render it as a glowing white shell, no exterior view).
- **Compass→frame:** the **copper sail** rises along the **north** side → on the far curve **ahead**,
  in the background; the **ladder** runs up through a hole in the grating near the **south** side →
  **near the camera/foreground**, rising to a matching opening in the dome overhead. The low platform
  of firewood sits centre, between camera and sail.
- **Geometry (from base desc, keep nouns):** floor = a harsh metal **grating**. Centre platform piled
  high with split lengths of wood in an **immense semicircular heap**. The sail = a thin sheet of
  hammered copper, as wide at its base as outstretched arms, tapering and curving inward to hug the
  dome's inner surface, peak halfway up the dome, like a billowing sail; its base set in a **narrow
  circular track** that runs all the way around the dome a finger's width from its lower edge.
- **Exits:** `up → Catwalk South` and `down → Starry Dome North` are both the one **ladder** (up
  through the dome / down through the grating) — show the ladder, not doorways.

### catwalk-south  — member: Outer Catwalk (Day, ANCHOR)
- **Vantage:** on the railless iron walkway at the dome's south, the pale translucent dome at your
  shoulder on the mountain side, the open drop on the other; a few iron steps climb the dome's flank to
  a round opening (ladder down inside). Below: a small terraced garden of knotted spiralled paths, and
  far below that a bright green valley. Unclouded blue sky, exuberant afternoon sun. Volume anchor for
  the day state.

### catwalk-west / -north / -east  — member: Outer Catwalk (Day)
- **west:** at the dome's west edge, mountain peak towering on the mountain side, stone slopes falling
  to the green valley on the open side, blue sky, afternoon sun.
- **north:** the narrow walkway girdling the dome; the mountain rises massively close on one side but
  separated by a deep jagged ravine (the dome stands on its own promontory, several yards off the cliff
  face); a tiny ledge is just visible on the cliff face. DROP the black mask on that ledge (distant
  takeable target) — keep the ledge.
- **east:** dome's east edge, mountain towering on the mountain side, slopes to the valley on the open
  side, blue sky, sun.

### catwalk-*-night  — member: Outer Catwalk (Night)
- **State:** black star-thick sky, risen halo-ringed moon. The dome glows from a fire lit within;
  the copper sail's silhouette is visible through it, throwing a long solid-black shadow off the
  walkway into empty air. Otherwise same dome/ravine/valley geometry as day.
- **south-night / east-night:** the lit dome + dark valley + night sky (the dossier anchors these to
  the day siblings; relight to night). **west-night / north-night:** the dark sail-silhouette dominant,
  the long black shadow falling off the walkway; north-night's shadow reaches toward the mountain face
  and becomes the Shadow Path spur.

### shadow-path-west-of-dome-night / shadow-path-far-west-of-dome-night  — member: Outer Catwalk (Night)
- **Vantage:** standing OUT on a long flat **solid-black tongue of shadow** hanging impossibly in air,
  bridging the ravine: the fire-lit dome behind/to one side, the path running ahead toward the mountain;
  the mountain a black shape against star-fields on one side, the dim green valley falling away on the
  other. **far-west:** the path narrows to a vanishing point; the dome a small red-lit bauble behind.

### ledge-night  — member: Outer Catwalk (Night)
- **Vantage:** at the far end of the black shadow-bridge where it meets the cliff; the fire-lit dome
  behind across the ravine, a narrow ledge angling across the mountain face directly ahead. The
  shadow underfoot is heavier and darker than any shadow should be.
- **Persistence:** DROP the torn black mask on the ledge (takeable target); keep the ledge.

### catwalk-*-unearthly / shadow-path-*-unearthly  — member: Outer Catwalk (Unearthly)
- **State:** the sky a racing nightmare of scarlet/carmine/rust streams, NO sun, the world lit only in
  harsh red; the dome a "red bauble." Same geometry + same sail-silhouette/shadow-bridge as night, only
  the sky/light change. Render the red racing sky as the dominant note.

### south-alcove  — member: Orrery
- **Vantage:** a small curved alcove off the large chamber; a plain iron ladder rises up a shaft; the
  **vast brass machine** spins endlessly in the chamber glimpsed through the opening. Pull the machine
  in as the thing seen beyond.

### orrery  — member: Orrery (ANCHOR)
- **Vantage (10a):** standing on the six-sided chamber's floor, the **vast machine** filling the frame
  ahead — it "nearly fills the room", so the camera is pressed back against the entry wall looking into
  it. Eye-level; the great tilted brass disk dominates, its lower edge a few inches above the floor in
  the foreground, its upper edge climbing near the high roof in the background.
- **Geometry (from base desc):** the disk is a *great stately brass disk on a tilted axis* — engraved
  with intricate arcs and lines, slow steady rotation; a fixed **blue-glass globe** (brown-and-white
  pattern like a map of islands in a curved sea) at its centre, the disk revolving around it; smaller
  wheels pirouetting across its face bearing delicate glass globes. Keep these nouns verbatim.
- **Compass→frame:** alcoves open *north and south*; with the camera facing into the machine these read
  as small curved openings to **either side** (left and right). The vault above the machine is lost in
  shadow — render it dark, unresolved overhead.
- **Persistence:** DROP the blue mask fluttering on a globe (takeable). KEEP the machine/disk/globes.

### north-alcove  — member: Orrery
- **Vantage:** a small curved alcove off the chamber; an archway reveals a flight of ascending stairs;
  the vast brass machine spins in the chamber glimpsed the other way. DROP the pale gauzy rag at the
  alcove's edge (takeable).

### curving-hall-west-end
- **Vantage:** the curving plaster corridor dead-ends at a blank wall holding one **window** onto a
  *subterranean* prospect (`exitFacts window`): a broad flawless pane over a dark cavern deep
  underground — mammoth columns and flowstone cascades dimly picked out by the candlelight behind,
  farther reaches lost in dark, but a shining phosphorescent **waterfall** clearly visible plunging from
  a ledge into a pit beneath the sill. Face the window; candlelit corridor behind.
- **Exits:** an archway and a plain white door — minimal; the window is the subject.

### arboretum
- **Vantage:** a stark room, walls painted white and utterly undecorated, one archway out. Centre: an
  earthenware tub from which sprout a tangle of vines, broad fan-like leaves, and one enormous golden
  flower — luxuriant growth clashing with the bare room.
- **Persistence:** DROP the iron key balanced on the tub's edge (takeable). KEEP tub/vines/flower.

### dank-jungle-in-the-earthenware-tub
- **Vantage:** standing waist-deep in an empty earthenware tub in the midst of a trackless jungle —
  heavy entangled trunks and vines looming in every direction, sky wholly obscured by vegetation, only
  murky green light filtering down, golden flowers dotting the trees like bursts of sun. The tub rim is
  the only man-made note.

### harp-chamber
- **Vantage:** a circular chamber ringed by broad golden pillars; the deep-set walls between them
  painted variegated blue and sea-green, lit from a hidden source. Centre: the **ruined harp** standing
  in proud ruin — pillar and frame blackened and cracked as if burned, soundbox split, the few
  remaining strings curled knots of ash (though the room shows no other fire). One archway out; a closed
  door on the far side leaks **blinding light** around all its edges (simple latch, no keyhole).
- **Persistence:** DROP the straw bundle/torch on the floor (takeable). KEEP harp/pillars/glowing door.

### vaulting-cavern
- **Vantage:** a high arched natural cave deep in the earth, floor studded with stalagmites and stone
  columns, stalactites glittering with droplets above, a vein of dark ore streaking the pale vault.
  Passages lead off; at one edge a pit descends abruptly with wisps of steam rising from its depths.
  Lit by the torch you carry (source-named).
- **Exits:** show the steaming pit-mouth, a narrow passage and a broader one + a low crawl — as cave
  openings, not doors.

### shore-of-river
- **Vantage:** on the near shore of a silent black river — a sheet of mirror-dark water slipping past;
  a broad passage back behind; the far shore a narrow ledge of scree. Thin distant roar of a falls.
- **Persistence:** DROP the green mask on the far scree (takeable). ("mirror" unprobed = the
  mirror-dark *water*, not an object.)

### far-shore-of-river
- **Vantage:** the far side of the underground river; a narrow rubble shelf sloping to the water's
  frozen edge (ice still spanning the river, slowly wearing away in the current); a narrow crawl leads
  off at the top of the slope.
- **Persistence:** DROP the green mask in the scree (takeable).

### river-crawl
- **Vantage:** crouched in a narrow twisting crawlway, a faint rushing of the river somewhere above;
  the crawl slopes up one way and angles sharply down the other. Cramped.

### ledge-in-pit
- **Vantage:** balanced on a ledge against the wall of a twisty irregular pit; a narrow opening visible
  across and slightly above (unreachable); a climbable rough path up; the pit below nearly vertical,
  damp stone slick with condensation; a warm misting updraft rising.

### deep-in-pit
- **Vantage:** clinging to holds on a roughly vertical shaft wall, the pit narrowing below, smooth walls
  glistening with moisture; warm misting updraft. Precarious, cramped.

### depths-of-pit
- **Vantage:** wedged knees-to-back in a narrow shaft, one hand clutching the torch, the other an angle
  of rock; below, the shaft widens to an impossible drop ending in a bubbling underground pool jagged
  with rocks and shattered ice.
- **Persistence:** DROP the tarnished bracelet wedged in a wall hollow (takeable). ("pool" unprobed
  returns the *painting*-of-a-pool examine — ignore, render the real shaft/pool below.)

### confusing-passage
- **Vantage:** a stone passage where great columns and masses of stone rise floor-to-ceiling and the
  tunnel divides and rejoins around them in a confusing tangle of minor branches; twisted stalactite
  vault above.

### dead-end
- **Vantage:** a round water-worn rock alcove where the passage abruptly ends; the far wall is dressed
  granite (an intrusion in the natural cave) set with a heavy tightly-shut iron door (high sill, iron
  bar handle, no keyhole). Show the iron door as the focal feature.

### cistern-west  — member: Cistern (ANCHOR)
- **Vantage (10a):** at the **west** edge, the heavy iron door just swung shut **behind the viewpoint**
  (SCREEN it — out of frame), looking **east** out across the immense empty elliptical chamber. The
  player's only exit is that west door; the establishing view faces into the volume. Volume anchor —
  the full establishing view.
- **Compass→frame:** the **black column** rises along the **east** wall → on the **far wall ahead**,
  in the background. Floor and roof "both spread out eastward" → both planes recede away from the camera
  into the distance.
- **Geometry (from base desc, keep nouns):** floor = a flat, perfect plane of black stone "or metal or
  glass — you can't tell what it is", giving no reflection. Roof far above = an equally flat, perfect
  surface of featureless **luminescent white**, radiating shadowless light. Halfway between, a **glass
  catwalk** runs around the wall, girdling the room. Walls = granite blocks, tightly fitted and dressed,
  bare of window or ornament; "it feels like a vast cistern, not a place for human habitation."
- **False unprobed:** `window` = the prose explicitly says *bare of window* → render none; `column` =
  the real black east-wall column → render it.

### cistern-east  — member: Cistern
- **Vantage:** at the eastern side beside the low **glass platform** (three strides across, jutting from
  the granite wall an inch above the black floor); the black column rising along the wall just to its
  right; the glass catwalk high around the perimeter; a heavy iron lever rising from the platform by the
  wall. White ceiling-glow above, black floor below.

### cistern-east-on-the-glass-platform  — member: Cistern
- **Vantage:** standing ON the glass platform; cut handholds in the wall to one side form a ladder up
  and down; the iron lever rises by the wall; the column alongside; black floor below, white glow above.

### cistern-bottom  — member: Cistern
- **Vantage:** at the chamber's lowest point where the down-sloping black/granite floor meets the east
  wall: directly overhead the glass platform hangs, the catwalk circles far above that, the white
  ceiling-ellipse higher still. A small black disk sits at the floor's lowest angle by the wall (the
  column merges into its rim); a heavy iron wheel is set into the wall. The full vertical stack read
  upward.

### cistern-catwalk-east  — member: Cistern
- **Vantage:** standing IN the glass trough-catwalk (a curved shallow glass channel) on the east side,
  running away around the wall; just past its end a wall-ladder descends; a heavy brass **spout-pipe**
  protrudes from the wall between catwalk and ladder, its curved spout bending toward the ladder. White
  glow above, black floor far below through the clear glass.
- **Persistence:** DROP the red mask in the trough (takeable).

### cistern-catwalk-northeast  — member: Cistern
- **Vantage:** in the glass trough on the northeast arc; a large curved glass slab leans nearly upright,
  wedged in the trough. (Gum blobs already stripped.) KEEP the leaning slab (large, currently part of
  the scene).

### cistern-catwalk-north / -northwest / -west / -southwest  — member: Cistern (cracked arc)
- **Vantage:** in the glass trough; the glass is progressively **cracked, spiderwebbed and holed** — a
  thumb-sized hole (north) → fist-sized (northwest) → egg-sized (west) → thick parallel crack-waves
  ready to splinter (southwest). Render the cracks/holes exactly (puzzle-true, source-named); clear
  glass over the black floor far below, white glow above.

### cistern-catwalk-south  — member: Cistern (filled arc)
- **Vantage:** standing on the flat **black surface that fills the trough** here (a yard-wide black
  pathway, the substance brimming it); a black column descends from the catwalk on the far southeast
  side. (Strip the "note of laughter amid the voices" — transient audio chrome.)

### cistern-catwalk-southeast  — member: Cistern (filled arc, terminus)
- **Vantage:** where the black catwalk bends sharply out and ends at the southeast wall; a **brass
  grate** is set in the wall at the trough's end, its surface covered by a pale gauzy film/web; the black
  substance runs up to the grate but cannot pass, so it rears up and spills over the edges to join the
  black column underfoot. White glow above.
- **Persistence:** DROP the crumpled black wad (takeable) AND strip the dynasty-chart examine text
  (lore/lettering — App forbids lettering anyway). KEEP grate/column/black substance.

### grey-chamber
- **Vantage:** an elliptical space whose walls are featureless and whose floor and ceiling are
  indistinct, indistinguishable grey — an unrecognizable world, echoless silence. A small gap on one
  side opens back to familiar dark stone. Hanging between floor and roof: a gleaming triangular shield/
  buckler whose bright edges are the only sharp lines in the place. Render the shield sharp against an
  indistinct grey void.

### curtained-room
- **Vantage (10a, facing pinned):** travel-into-room = EAST (player enters from Crowded Study via
  `east → Curtained Room`), and east also faces the signature chair-and-mirror — so the camera stands
  just inside the west curtained opening looking east across the small, curtain-swathed chamber. The
  throne and mirror are ahead, centre; the chair faces the mirror (directly before it), so it is seen
  from behind / three-quarter. Subject: massive high-backed pale-wood chair (nearly a throne, rough
  joinery finished smooth) + tall oval **mirror** in a standing iron-bar frame (`landmarks.mirror`).
- **Compass→frame (facing EAST ⇒ N=left, S=right, W=behind):** lead-slab door (south) → **on the
  right** wall; the two curtained openings — west (the entry) and northwest — → **behind the
  viewpoint**, out of frame. (Earlier override went vague — "one wall / two others" — which passed the
  compass-BAN but skipped the translation; this pins it.)
- **Mirror — plain from this vantage (factor 1, examine mirror):** the mirror is "a plain oval mirror…
  you can't look directly into it from where you're standing" — the distorting-oil VISION only appears
  when SEATED (the `…-on-the-chair` sub-state). So from this standing establishing shot the mirror
  shows only a faint, plain reflection of the room — state it, so the seated vision can't leak into the
  base image (the seated reframe owns the vision exclusively).

### curtained-room-on-the-chair  — vantage sub-state of `curtained-room` (renders FREE)
- **Anchor:** facts mark this `anchorMode: vantage`, `anchorRoom: curtained-room`. The anchor records
  the SHARED room identity (same brocade/mirror/iron-bar geometry) but, per the Render-method bullet,
  this sub-state renders FREE (text2img), not as an img2img reframe of the base image.
- **Provenance (seated `look`):** the walkthrough now does `sit on chair` → `look` → `examine mirror`,
  so the node carries a real seated-vantage description — "Directly in front of you is a tall mirror in
  a standing frame" (chair gone, because you occupy it) — plus the `examine mirror` vision as a folded
  `sceneExtras` reveal. This corroborates the vantage below; it is no longer recovered-from-examines.
- **Vantage (10a — occupied furniture is the vantage):** the viewpoint is the SEAT of the high-backed
  pale-wood chair, looking straight ahead into the mirror. **The real chair is beneath/behind the
  camera — OMIT it from frame** (naming it as an object made the model render an empty chair — the
  reported defect). The only chair that appears is the one *reflected in the mirror*.
- **State:** the scene seen *while seated in the chair, staring into the mirror* — the pristine
  first-sit vision (pre-mask). Keep the source's words verbatim: in the mirror the curtains and the
  chair reflect perfectly, and **a figure sits IN the reflected chair** (placing it — without "sits in
  the reflected chair" the model floats the figure behind the throne), but its form is unclear, as if
  the mirror were touched with distorting oil, the blurring strongest about the upper body, the head a
  faceless blank; dim red/green/blue/black/brown/gold/white shadows flit around the reflected body.
  (A magical vision, not the player's body — no-people rule holds; the "reflection" is a faceless
  blurred form, not a person.)
- **Render method:** render FREE (text2img), NOT img2img off the base. A/B test (sandbox r18/r57 free
  vs r41/r55/r56 anchored): the vantage anchor dragged composition back to the wide-room base and
  imposed its palette, scattering this mirror-dominated reframe. So `anchorMode: vantage` renders free;
  only `relight` variants (Dome lit/dark) use the base img2img.

### iron-corridor
- **Vantage:** a windowless square tube of dark hammered iron stretching away ahead; a hanging sconce
  above trembles with yellow light; ahead the air is a privacy-spell **mirror** in which the lamp
  repeats again and again into seeming distance. Strip the "spell awaiting an explorer / smash with a
  thought" musing (internal monologue) — render the mirrored repeating-lamp corridor.

### iron-passage
- **Vantage:** a short connecting passage walled in hammered iron; a heavy iron-strapped wooden door on
  one end, a large chamber opening at the other; a single sconce overhead.

### laboratory  (mural landmark)
- **Vantage (10a):** inside the chamber of massive squared stone, looking across it. The only exit is
  the plain north-wall doorway → the player enters from the north, so travel-into-room faces **south**;
  the doorway is behind the camera. SCREEN it (out of frame behind the viewpoint) — the mural + the
  optical apparatus are the subject.
- **Compass→frame (facing south ⇒ E=left, W=right):** shelves line the **east** wall → on the **left**;
  the **mural** on the **west** wall → on the **right**. The granite worktable stands between them,
  centre-frame, with the optical apparatus on it.
- **Geometry (from base desc):** worktable = a single heavy granite slab several inches thick, resting
  on four irregular granite outcrops that rise through the floor to equal height; centre of the table
  the complex **apparatus of mirrors and lenses** (= the `unprobed: mirror` hit — render the mirrors,
  no probe). A small **drain** opens in the slate flagstones beneath the table. Ceiling crawling with
  tiny worms of colorless light (source-named — the room's only light).
- **Mural** (`landmarks.mural`): stylized angular cloaked figure striding toward a circled-orb sign,
  silver snakeskin belt, gauntlet holding an outstretched black dagger, small shield on one shoulder,
  dark bracer, against a red sky.
- **Persistence:** DROP the takeables on the table (empty flask, wooden basket, leaden jar, scrap of
  paper). KEEP the optical apparatus (centrepiece), shelves, mural, table, drain.

### cell-possibly  — member: Possibly dream-echo
- Cell echo: raw unfinished stone, but the smooth floor is one intricate web of swirling geometric
  marks wall-to-wall, and **eight narrow gaps pierce the walls (one each direction)** instead of the
  single gap. Low crowding stone ceiling. Cramped.

### white-hallway-possibly  — member: Possibly dream-echo
- White Curving-Hall echo: a high dim corridor of cracked moldering WHITE plaster, tiny flickering
  candles above, the swirling geometric-mark floor, the hall curving away in all eight directions.
  Strip the overheard speech + its lead-in.

### gold-harp-chamber-possibly  — member: Possibly dream-echo
- Harp-Chamber echo: broad GOLD pillars ringing the circular chamber, deep-set walls between them
  variegated yellow and amber lit from a hidden source, the geometric-mark floor, archways in all
  directions; centre an UNSTRUNG harp of gold. Strip speech.

### red-curtained-room-possibly  — member: Possibly dream-echo
- Curtained-Room echo: walls swathed in heavy RED brocade curtains, the geometric-diagram floor,
  openings in all eight directions; centre an EMPTY standing mirror-frame (no glass). Strip speech.

### brown-shed-possibly  — member: Possibly dream-echo
- Dim-Shed echo: a small shed, geometric-diagram floor but unfinished BROWN plank walls, narrow
  openings in every direction onto eight steep stairways climbing into darkness. Strip speech.

### green-bower-possibly  — member: Possibly dream-echo
- Mountain-Garden bower echo: shrubs and raised flowerbeds atop the plane of geometric markings, a lush
  green valley distant, eight paths running every direction. Strip speech.

### blue-mosaic-room-possibly  — member: Possibly dream-echo
- Mosaic-Room echo: walls and ceiling all tiny blue tiles (a perfect blue mosaic sky), the
  geometric-diagram floor, archways in all directions; centre a tiny brass bird on a curved stand.
  Strip speech.

### black-night-perhaps  — member: Possibly dream-echo
- Sky echo: surrounded by deep open night sky, stars in slow-eternal courses; the infinite geometric
  diagram remains as faint dark markings on the blackness below, too sparse to bisect the night. Strip
  speech. Render as standing in open star-strewn night over a faint diagram-floor.
