---
name: generate-blockout
description: Author 3D blockout scene-defs for a Lantern game's shared-space VOLUMES (rooms that see across one geometry from many vantages) so adjacent rooms agree geometrically. Builds docs/games/images/<game>/_blockout/<volume>.scene.json from the volume's framing, then hands off clay-capture+restyle to the browser renderer and runs a web-agent self-review. Triggered when the user says "generate blockout for <game>", "/generate-blockout <game>", "blockout the <volume> in <game>", "build blockouts for <game>", or "make a blockout scene for <volume>".
---

# generate-blockout skill

Builds the **3D blockout** for a game's shared-space *volumes* — the principled fix for
"make adjacent rooms that look across ONE space agree geometrically" (the stage from the aisle
and the stage from the balcony are literally the same stage). Read
`.tome/blockout-3d-continuity.md` first — it is the design doc this skill executes; everything
below assumes its vocabulary (clay render → img2img restyle, the compass-is-the-enemy rule, the
baked gotchas).

**What this skill DOES (deterministic, repeatable):** detect a game's volumes, and author
`docs/games/images/<game>/_blockout/<volume>.scene.json` — the geometry (roled blocks) plus one
camera per member derived from its **Vantage** line, with the baked gotchas applied up front.

**What it does NOT do alone:** render the clay views. There is **no headless three.js renderer**
— the clay frame is captured from the browser renderer's WebGL canvas (`captureClay()` →
`/api/blockout-gen`). So this skill **hands off** the capture+restyle to the renderer (you click
through), then drives a **web-agent self-review** pass over the resulting shots. (If a true
headless renderer is ever built — the tome's standing "node batch driver" TODO — steps 3–4
collapse into one CLI command.)

```
location-framing.md  →  [generate-blockout]            →  renderer (clay+restyle)  →  promote → in game
 (### Volume: blocks)     <volume>.scene.json + cameras     human clicks Generate      blockout shot
```

---

## Step 0 — Prerequisites

- The game must have `docs/games/images/<game>/location-framing.md` (produced by `/frame`). The
  `### Volume:` blocks in it ARE the work-list — no new judgment needed.
- Per-member scene prose (`style.json` scenes[slug], from `/scene`) is what tells the model WHAT
  each blockout mass *is* — the blockout carries SHAPE, the prose carries IDENTITY (see Step 3).
  Blockout works without it but the restyle is much weaker; if scenes are missing, say so.
- The review-server / artview must be runnable on :3009 for Steps 3–4 (the `/artview` skill).

## Step 1 — Detect volumes (the work-list)

Scan `location-framing.md` for `### Volume:` headers. Each becomes a candidate blockout. Also
flag mold "needs an img2img anchor" canaries as candidates. **Skip** volumes whose framing says
they are NOT one geometry (e.g. Dreamhold's "…, Possibly" dream-echo sequence — "not one
geometric volume"). Present the list; if the user named a specific volume, do just that one.

Volume slug = a kebab-case name (e.g. `outer-catwalk`, `orrery`); the file is
`<volume>.scene.json` and `blockoutsFor()` auto-discovers it. **Member slugs MUST equal real
location slugs** (the `members[]` bind to `style.json`/locations for prose, and a promoted shot
copies to `<member-slug>.png`). Verify each member against the game's location slugs.

## Step 2 — Author the geometry

Read the volume's **Geometry** paragraph and each member's **Vantage** line. Build
`parts[]` — roled blocks — maximally from the framing. The frame is **`+X east, +Z south,
+Y up` (north = −Z)**. Model:

- **Major masses** as roled blocks (the dome, the machine, the stage, walls/floor/ceiling).
- **Every placement-critical named feature** as its OWN roled block (a round opening, a ladder,
  a bricked doorway, steps, a ledge). Compass-only prose features get LOST once the model is told
  to ignore compass — so if a feature's position matters, it must exist in the blockout.

**Part vocabulary** (see `renderer.html`): `box [w,h,d]`, `sphere <r>`, `cyl {r,len,axis,half}`,
`grid {x:[x0,x1,dx], z:[z0,z1,dz], rakePerRow} + of[]` (repeats sub-parts — seating/balconies).
Each part: `at [x,y,z]`, a `role` (drives colour + the model's legend), optional `color`,
`rot [degX,degY,degZ]`, `detail` (human inspect text — NOT sent to the model), and `shell: true`
for walls/ceilings (auto-hide when the camera leaves the volume → "dollhouse" look-in from
outside, walls intact from inside).

**Roles** map to colours AND to the legend phrase the model receives. Existing roles: `stage,
seat, wall, ceiling, balcony, pit, door, curtain, chandelier, rail, brick, hole, floor` and the
generic-Dreamhold set `dome, rock, valley, machine, ladder, steps, opening`. **If a volume needs
a new kind of mass, add the role to BOTH `ROLE_COLORS` (renderer.html) and `ROLE_LEGEND`
(tools/artview/lib/core.cjs) — they must stay in sync** — rather than leaning on a one-off
`color`. A role with no legend entry renders as a coloured blob the model can't name.

**Apply the baked gotchas up front** (from the tome):
- **Fill the frame** — a big featureless foreground or bare pit makes the model hallucinate
  (it invented a brick crypt under the theatre seats). Add real geometry; for a sunken pit, cut
  the floor *around* a hole (floor pieces), never a pit-box under a solid slab.
- **Round hard edges** where the prose says soft — cube seats restyled as stone blocks; use
  cylinders/rounded masses for upholstery, foliage, etc.
- **Head-on framing** — a grazing/edge-on vantage gives the model nothing to anchor and it
  freelances. Each camera must actually FRAME its subject.
- **No compass in cameras** — `blockoutGen` deliberately does not send compass facing. The image
  is the sole spatial authority. Don't add orientation prose; it causes mirror flips.

## Step 2b — Set one camera per member from its Vantage

`cameras: { <member-slug>: { pos:[x,y,z], look:[x,y,z], fov } }`. Read each member's **Vantage**
line and place the camera where the player stands, aimed at what the line says is the subject,
with named foreground features actually in frame. Camera framing is the part that needs a
**render→look→adjust loop** (the theatre took 3–4 iterations) — author a sensible first pass; the
renderer's **"✓ Update vantage"** button lets you (or the human) refine each camera live and save
it back. Optionally seed `notes[<slug>]` with a one-line vantage reminder; it is appended to that
view's render as an ADJUSTMENTS line.

Write the file to `docs/games/images/<game>/_blockout/<volume>.scene.json` with `$schema`,
`game`, `volume`, `title`, `source` (the framing header), `frame`, `background` (keep the neutral
`#9a9a9a` clay grey so edit-mode tonality stays grey for the artist to colour), `fog`, `parts`,
`cameras`, `members`, `notes`. Mirror `theatre/_blockout/auditorium.scene.json`.

## Step 3 — Render handoff (browser)

Clay capture is browser-only. Start artview (`/artview`), open **Blockout 3D → <game> →
<volume>**, and for each member: select its vantage button, eyeball the framing (refine with
**Update vantage** if needed), pick a model (OpenAI·low ~$0.006 is the cheap iterate; the
viewport aspect tracks the model), and click **✨ Generate**. The server renders the clay, runs
it through `gen-room-images.cjs --ref <clay> --ref-mode guide`, prepends the role-colour legend +
the member's scene prose, and stores the shot under `_blockout/_gen/<volume>/`. Tell the user the
exact button path; you cannot capture the canvas for them.

(Note: if the game's cast artist is not yet selected — Dreamhold's is pending — the restyle has no
artist layer and reads flat. The geometry-transfer is still what you're validating; flag it.)

## Step 4 — Self-review (web-agent)

Once shots exist, drive the browser with the **`/webagent`** tools to vision-check each shot
against the framing facts. For each member, load
`http://localhost:3009/img/blockout?game=<game>&volume=<volume>&f=<file>` (or screenshot the
renderer result panel) and verify:
- **Named features present and on the correct side** (the opening, ladder, ledge, machine globe).
- **No hallucinations** — the crypt-under-seats class (featureless region invented something).
- **No blocky artifacts** from hard edges; **continuity** — does the shared mass (dome, machine,
  stage) read as the SAME object across every member's shot?
- **Grazing/flat vantages** that the model clearly freelanced.

Auto-fixable findings → nudge a block / add fill geometry / tweak the camera or the `notes`
ADJUSTMENTS line, then re-shoot. Otherwise flag for human review. Report a short accuracy table.

## Step 5 — Hand to user / promote

Present the shots + accuracy report. The human gates: in the renderer, the **★ Promote → in
game** button copies a chosen `_gen/<volume>/<file>.png` to the committed `<member-slug>.png` and
updates the manifest — exactly like render-rooms does for normal rooms. A blockout member's
`view` IS its location slug, so promotion fills that room's in-game art.

`/studio` orchestrates this as an optional phase for volumes needing continuity; standalone rooms
go through `/render-rooms` instead.

## Notes

- **When NOT to blockout:** most rooms. Players see one room at a time; text-layer consistency
  (`/scene`) is enough. Reserve blockouts for volumes where multi-vantage continuity is actually
  visible/complained about. Authoring geometry per volume is the real ongoing cost.
- **Lighting/sky states are NOT separate blockouts.** Day/night/unearthly (catwalk) or
  dark/lit/starry (dome) share one geometry; the state is a restyle prompt delta on the same
  clay. One scene.json, the compass-station cameras; render each member once per state via the
  scene prose / ADJUSTMENTS, not by duplicating geometry.
- Bit-exact / round-trip concerns and the full rationale live in `.tome/blockout-3d-continuity.md`.
