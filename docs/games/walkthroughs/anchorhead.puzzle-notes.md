# Anchorhead — puzzle-logic notes

Companion to `anchorhead.txt` (raw Aeron Pax walkthrough) and `anchorhead.cmds.txt` (verified
command list). Build: **Release 5 / Serial 990206** (original 1998/99, NOT the 2018 edition).
Verified via `tools/play.cjs anchorhead --strict --seed 1` — **FULL run, Day 1 → Epilogue, wins
99/100.**

This file is the feedstock for `generate-hints`: it records the *method* and the *why*, so hint
ladders can teach without leaking commands or per-run-random values.

**Anchor map:** every `## [slug]` / `### [slug]` puzzle heading below mirrors a `## [slug]` marker
in `anchorhead.cmds.txt`. Validate the pairing with `node tools/_check_walkthrough_map.cjs
anchorhead`. To probe a puzzle, snapshot the VM right before it:
`node tools/play.cjs anchorhead --seed 1 --file …/anchorhead.cmds.txt --snapshot-at "## [slug]"
--snapshot-out /tmp/s.json --quiet`, then replay a tail with `--snapshot-in /tmp/s.json`.
Sections without a `[slug]` are cross-cutting (no single command span).

---

## ⚠ RANDOMIZED BETWEEN PLAYS (hint-critical — read first)

Three gates use `@random` and differ for every real player. The `--seed 1` values baked into
`.cmds.txt` are **test-determinism artifacts only** — hints must teach the *method*, never these
numbers.

- **Safe combination** — read from the **torn journal** (`pull lining` → `read journal`). Seed 1 =
  `1-32-59`; open with `turn the dial to <x>` ×3. See `[d2-journal]` / `[d2-safe]`.
- **Flute attunement** — two of the flute's seven holes resonate; seed 1 = **holes 2 & 7**. See
  `[d3-flute]` (discovery) and `[ln-finale]` (use).
- **Mirror measurement** — match a mirror to the blueprint's variable number; seed 1 variable
  `0.0197` → **mirror 2**. See `[d3-mirror]`.

The wine-rack letters (`[d3-winerack]`) **look** random but are **fixed** (C,W,H,E,M) — they spell
the puzzle, not a seed value. Don't lump them with the three above.

## Interactive readers that are PROGRESS GATES (not lore — don't skip them)

Two `read` commands open **cyclic char-input readers** that wedge line-replay (`[no line-input
prompt]`); the `.cmds.txt` drives them with `@char return N` then `@char q`. They are **state
gates**, not flavor:

- **`read clippings`** (`[d2-supplies]`, cellar Storage) is the *only* place you learn the Verlac
  ancestor names **Mordecai / Elijah / Heinrich / Wilhelm** that the parser later gates the
  `[d2-records]` `look up <name> in record` puzzles on. Page all the way (`@char return 40`) then
  `@char q`; quitting at page 1 breaks later turns.
- **`read historical`** (`[d2-librarian]`, Library) — same reader pattern; +1 point.

## Intended failures that look like bugs (do NOT hint them as puzzles)

In the church archives (`[d2-records]`), some `look up <name> in record` legitimately return
*"That's not a name you're familiar with."* The walkthrough's own comment is *"you seem to be
uncovering a pattern here."* Trying names and seeing which land **is** the puzzle; partial failure
is the intended signal, not a missing prerequisite. `--strict` will not flag these (no-effect, not
a parser desync).

## Lantern divergence (cross-cutting — affects [d3-church], [d3-valve], [ln-gate])

Our build leaves the **lantern on the Vaulted-Tunnel floor** after the rope-shaft plunge (the
walkthrough assumes it's already in the coat pocket). You must `get lantern` there (`[d3-church]`
tail). From then on it lives in the **coat pocket**, so every "light lantern" needs `take lantern
from pocket` first — in the dark: `light match` (for light) → `take lantern from pocket` → `light
lantern`, beating the match burn-out. Recurs at the mill steam-valve tunnel (`[d3-valve]`) and the
sewer on the Last Night (`[ln-gate]`).

## Score ceiling: 99/100 (verified — do not promise 100 in hints)

The full command list wins cleanly at **99/100** ("…unable to solve the entire mystery"). The
**walkthrough's own inline point tags also sum to 99** — its closing "100/100" claim is not
substantiated. The 100th point is undocumented: opening both lockets (the obvious "solve the
mystery" candidate) yields **no** point, and a second bath was empirically confirmed to add no net
point. Treated as a known, accepted gap.

---

## Day 1

### [d1-office] Break into the abandoned real-estate office

The front door (east, from Outside the Real Estate Office) is **locked**. The way in is the
**alley** (`se`): `push can against wall` → `climb can` → `up` (wriggle through a high **transom
window**) → `west` into the Office. The answering machine (`push play`) just says *"Verlac"* —
flavor/name reveal, not a puzzle. *Hint method:* "the front door's locked — look for another way
in, up high, from the alley."

### [d1-michael] Get the house keys, meet Michael, walk home

The agent's gone and the Verlac file is cleaned out; the house keys are **tucked in the empty
hanging folder** — `look up verlac` in the File Room cabinet finds them (+2). Michael is at the
University **Library**; `read book` (he's absorbed in a tome) triggers the conversation, then
`show keys to michael` (+2). His car then breaks down, which is *why* Day 1 ends with a long
overland walk to the house (no shortcut). *Hint method:* "the file on the property is empty, but
check what's left in the folder."

### [d1-bath] Settle in for the night (the +1 bath)

Lock up (`close door` / `lock door`), then upstairs `undress` → `drop all` → `west` to the
bathroom → `bathe` (+1) → back, `lie in bed` → `sleep`. The bath point is **once-only** — a second
bath on a later day prints "+1" but nets nothing (tested).

## Day 2

### [d2-journal] The torn journal → the safe combination (RANDOM)

Behind the Dining Room cupboard: `open cupboard` → `pull lining` → `read journal`. The journal
gives the **safe combination** (`@random`; seed 1 `1-32-59`). It's the source value for
`[d2-safe]`. *Hint method:* "the journal hides the combination — dial each number in turn."

### [d2-supplies] Flashlight, matches, broom, the clippings reader, cellar key

Kitchen/cellar prep: `get flashlight`, `get matches`, `get broom`. **`read clippings`** is a
progress gate (see the readers section) — page it fully (`@char return 40` / `@char q`) to learn
the ancestor names. `wipe web` + `get key` → the **cellar key** (+1) onto the keyring.

### [d2-album] Family portraits + album lookups

`look at paintings` / `look at scene`, `get album`, then `look up wilhelm/eustacia/croseus in
album`. Establishes the family faces/names that the records and lockets pay off — low-friction but
part of "solving the mystery" thread.

### [d2-safe] The hidden safe → puzzle box & flute

In the study, `look at bookshelf` reveals the **safe**. `examine safe`, dial the journal's three
numbers (`turn the dial to <x>` ×3, seed 1 `1/32/59`), `look in safe`, `get puzzle box and flute`.
Both items are hard gates: the puzzle box feeds the `[d2-amulet]` trade; the flute is the
`[ln-finale]` weapon.

### [d2-pages] Silver locket + the torn pages (learn "William")

`open jewelry box` → `get silver locket`. Then `push bed` → `look in hole` → `get pages` →
`read pages` (+2) — the pages teach the name **William**, which `[d2-skull]` needs at the coffin.

### [d2-skull] The crypt — William Verlac's coffin → skull

Family Plot via the Path Behind the House. `unlock crypt` → `down` → `look up william on
nameplate` → `open william's coffin` → `get skull`. The skull is later shown to the bum
(`[d2-amulet]`) and the creature thread.

### [d2-records] Courthouse records — look up the Verlac names

**Build divergence:** Death Records' back exit is **`ne`, not `nw`** (the published walkthrough's
`NW` → "You can't go that way"). You enter Death Records via `sw` from the basement; the room says
*"the exit lies northeast."* The `look up <name> in record` lookups gate on names learned from the
clippings (`[d2-supplies]`); some names intentionally fail (see Intended-failures section).

### [d2-librarian] The library card → historical-society book

`ring bell` → `show card to librarian` → `ask librarian for book` (+2). `open historical` →
`get slip of paper`/`read it`, then **`read historical`** (reader gate, `@char` driven; +1).

### [d2-amulet] Curio shop (puzzle box → amulet) and the bum on the wharf

The amulet chain: safe → **puzzle box** → trade at the **curio shop** (`ask proprietor about
amulet`, `give puzzle box to him`, +5) → **amulet**. Then on the wharf, `give flask to bum` (the
flask is under a table) + `ask bum about brother/anna/crypt` + `show skull to bum` are the social
steps that unlock his help → `give amulet to bum` (+5). Major Day-2 payoff; depends on `[d2-safe]`.

### [d2-laptop] Michael's laptop (0628) + the locked-room escape

Code **0628** (`type 0628 on laptop`, +2). The locked-room trick after Michael vanishes:
`push newspaper under door` → `put letter opener in keyhole` (the brass key drops onto the paper)
→ `get newspaper` → `get brass key` (+1) → onto the keyring.

### [d2-goldlocket] The attic gold locket

`search straw` → `get gold locket` (used on the creature in `[ln-amulet]`), grab the `towel`
(needed for the steam valve, `[d3-valve]`), then sleep into Day 3.

## Day 3

### [d3-name] Telescope + puzzle-box lens → learn IALDABAOLOTH (+5)

In the attic, `turn sphere`, then fit the puzzle-box disk and look: `put lens in telescope` →
`look in telescope` (+5). The disk *is* the puzzle box's contents — the same object the proprietor
coveted in `[d2-amulet]`. The Name unlocks the greenish-gold door (`[d3-winerack]` tail).

### [d3-winerack] Wine-rack letter passage → Great Stairs → Burial Mound (+2)

`search wine rack` first; the five bottles spell five **fixed** letters (C,W,H,E,M — *not*
randomized): `turn c / turn w / turn h / turn e / turn m` (+2). A passage opens north → Great
Stairs → rope bridge; at the bottom `say ialdabaoloth` swings the door, then `north` into the
Burial Mound.

### [d3-flute] Flute attunement — find the two resonant holes (RANDOM)

The flute has **seven** holes; two resonate "in harmony" with the right-hand column, the rest only
"grow momentarily stronger." **Procedure** (teach this, never the holes): `cover hole N` →
`play flute` → watch for *"The right-hand column's vibrations suddenly grow stronger, resonating in
harmony"* → `remove finger from flute`; repeat holes 1–7. **Remember the two harmonizing holes for
`[ln-finale]`.** Seed 1 = **holes 2 & 7.** Do **not** summon here — the game defers it.

### [d3-slaughter] Slaughterhouse — the teddy, hide from the monster (+2)

`get hook` (used to break the church padlock and hit the creature) and the drawing paper; down the
plywood cover, `search bones` → `get teddy` (for `[d3-door11]`). When the monster comes,
`hide under bones` → `wait` survives (+2).

### [d3-church] Break into the church, the tome, the rope shaft (+1, +2)

`break padlock with hook` (+1). The huge tome's y/n *"Will you read on?"* must be answered
**`no`**. Rope-shaft descent: `tie rope to railing` → `down` → `drop rope` (+2; you plunge into
water — `light flashlight` works here in our build, no fallback). **Lantern:** after the plunge it
sits on the Vaulted-Tunnel floor — `get lantern` here (see Lantern divergence).

### [d3-drawer] Oil the hatch, Claudia Benson's desk drawer (+2)

`put oil on hatch` (from the tin) frees a stuck hatch; `unlock drawer` → `open drawer` (+2) →
`get all from drawer` / `read letter` → the **bronze key** onto the keyring.

### [d3-door11] #11 Mill Town Road — teddy to Jeffrey's mother (+2)

The newspaper article (`[d2-records]`) names **#11 Mill Town Road** as Jeffrey Greer's abduction
site → `knock on door 11` → `give teddy to woman` (+2) → `look in overalls` → `get long steel key`
(+1; opens the thicket hatch into the mill).

### [d3-valve] Mill maintenance — shut the steam valve, the riser (+1, +2)

In the dark crawlway, light the pocketed lantern (`light match` → `take lantern from pocket` →
`light lantern`). `put towel on valve` → `turn wheel` (+1) stops the steam. Then `tie chain to me`
→ `pull lever` (+2) raises you to the lab.

### [d3-mirror] Blueprint variable → match the mirror (RANDOM), oil it

`read blueprint`: a fixed `0.0113` is **scratched out** and a per-run variable written below
(seed 1 `0.0197`). **Method:** `put mirror N in caliper` for each of the 4 mirrors and match the
readout to the variable (seed 1 → **mirror 2**). `rub oil on mirror 2` (the memo demands clean
mirrors) — this is the doctored mirror handed over in `[ln-mirror-swap]`.

## The Last Night + Epilogue

### [ln-cell] Escape the padded cell (+2)

`break door` ×2 → `get glass` → `put glass in crack` → `cut jacket with glass` (+2, frees you from
the strait-jacket). Grab the **torn square** (`look in tear` → `get torn square`, +2) and the
**needle** — the needle picks the boy's cuffs in `[ln-finale]`.

### [ln-gate] The madman — cell key for the gate

In the sewer, relight the lantern (lantern divergence). `give magazine to madman` makes him drop
the **cell key**, but **the cell key won't go on the keyring** in our build —
`unlock gate with cell key` directly (the walkthrough's "put it on keyring" then "unlock gate"
desyncs).

### [ln-amulet] Cultist disguise → recover the amulet; the creature (+2)

`wear robe` to pass as a cultist; `wait` ~5 turns until the amulet falls from the bum,
`put all in pocket` → `get amulet`. Then the creature: `give gold locket to creature` (from
`[d2-goldlocket]`) → `hit creature with hook` (+2).

### [ln-mirror-swap] The lighthouse device — hand Michael the doctored mirror

`get real mirror` from the device, then **`give mirror 2 to michael`** — the oiled/doctored mirror
from `[d3-mirror]` (a real player gives whichever mirror they doctored, not "mirror 2"). Michael
re-checks it with the caliper and is satisfied; the swap **is** the ritual sabotage.

### [ln-finale] Free Jeffrey, the obelisk, the flute finale

`wait` until the cultists flee, then `pick cuffs with needle` → `free boy` (+5). Escape to the
obelisk: `touch obelisk`, `show ring to michael` (+5), `show amulet to michael` (+5). Then **attune
the flute to the two holes remembered from `[d3-flute]`** (seed 1: `cover hole 2` / `cover hole 7`)
→ `play flute` (+15: banish Croseus +5, +10 for doing it in time to save Michael).

### [epilogue] One year later — the pregnancy test

`north` → `get test` → `look at little window`. The window is pink — the horror coda. Ends the
game at 99/100 (see score-ceiling note).
