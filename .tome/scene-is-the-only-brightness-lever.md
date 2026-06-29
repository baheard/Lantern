---
title: The scene's light clause is the only per-room brightness lever
keywords: brightness, dim, dark, scene, ARTIST_LEAD, aesthetic, dome, relight-anchor, light clause, layer-split
created: 2026-06-29
---

# Per-room brightness lives ONLY in the scene's light clause

**Problem that surfaced:** after brightening Dreamhold's interiors (trim ARTIST_LEAD +
aesthetic "chambers warm and softly lit"), `dark-dome-center` — which must be DIM (it's
the img2img relight anchor for the starry/lit dome variants) — rendered flooded silvery-bright.

**Why "dark" didn't translate.** The word "dark" was only in the *slug*
(`dark-dome-center`); the model never sees the slug. The composed prompt's Artist, Aesthetic,
and App layers are **byte-identical** between the warm sitting-room and the dome (dump them
with `core.composeForRoom(game,slug)` to see). So the ONLY thing that can differentiate
"warm parlour" from "dark dome" is the **SCENE's light sentence**. The dome's said only
*"dim under a diffuse colourless light that washes the far lower reaches"* — three bright
pulls beat one weak "dim":
1. ARTIST_LEAD: *"lit by any source it names … never a murky gloom"* — the scene NAMED a
   light ("diffuse colourless light") → model lit it; "never a murky gloom" forbade the dark look.
2. Aesthetic: *"chambers warm and softly lit, only deepest sealed vaults and caverns dim"* —
   a "vast round space / immense dome" doesn't obviously match "vaults and caverns" → bright default.
3. The scene's own words *light / washes* read as illumination.

**Fix (faithful, not a hack).** Reword the scene so **darkness is the dominant condition**
and the light shrinks to a faint rim — which is what the game's `look up` lookFact already
says (*"a dim blank expanse. Only its edges are washed by a faint colorless light"*):
> "...immense dome arching high overhead, **lost in near-total darkness; the only light is a
> faint colourless glow seeping along the distant lower rim, leaving the centre and the whole
> curve above in deep shadow.**"
This trips ARTIST_LEAD's *"genuinely dark where it calls for dark"* branch. Result: genuinely
dark dome, faint rim glow, pyramid in shadow — a proper dark relight base. Impasto intact.

**Rule.** To make a room read darker/brighter than its neighbours, edit ITS scene light clause —
NOT the global ARTIST_LEAD or aesthetic (those move every room and would re-dim chambers you
just fixed). State the dominant light condition as a *condition* ("lost in near-total darkness"),
not by naming a faint source ("dim under a diffuse light") — naming a source tells the model to
light the space. Keep it literal to the game's own light facts (lookFacts/room prose).

## Engine fix (designed, not yet built): classify light, don't keyword-bucket it

Don't hand-edit each scene. Teach the pipeline three light classes and route each correctly:
- **dark** — state darkness as the dominant *condition*; demote any faint light to a
  subordinate clause. Scene leads with the darkness.
- **source-lit** — name the source + where it falls.
- **unspecified** — emit ZERO light language; the Artist (ARTIST_LEAD's "otherwise soft,
  even and clearly readable") fills the silence. ARTIST_LEAD is the right home for the
  *unspecified* default and NOTHING else — every attempt to make it also handle dark/bright
  moved all rooms at once (caused both everything-murky AND the flooded-dome).

Where (TWO pieces — `/frame` stays OUT of it): `gen-room-facts` parses the stated light into
a `lightClass` signal (like `defaultFacing`/`enteredBy`); `/scene` distills per the class +
lints violations (like the compass-word lint). **No `/frame` light verdict** — lighting is a
LITERAL FACT (what the source states), not a judgment like vantage/occlusion, so there's
nothing to decide. Framing must NOT guess a source when none is stated; an unstated light is
`unspecified` → the scene stays SILENT → the Artist fills it. (A `/frame` that invented a
source would be exactly the "never invent mood lighting" failure factor 9 forbids.)

**The classifier is precedence-based, NOT keyword-bucket** (the key refinement): a light noun
(`light`/`glow`) does NOT mean source-lit if it's qualified. **"dim" is an attenuator, not a
light type** — it says *less light here*, a negation. Rule:

> A light noun is **source-lit ONLY if unqualified**. Any **attenuator** (`dim`, `faint`,
> `weak`, `feeble`, `failing`, `dying`, `barely`, `scarcely`, `low`) or **scope-limiter**
> (`only`, `just`, `a little`, "washes only the …") on it ⇒ **dark**, and the scene must
> phrase the attenuation as the dominant CONDITION, never as a modifier on the light.

Structural tell that broke the dome: a light noun as the clause HEAD with the darkness word
demoted to a modifier (`dim under a [light]`). Flip it — darkness is the head, light is the
subordinate clause (`dark, only a faint glow at the rim`). `/scene` lint should flag a `dark`
room whose scene puts a light noun as the main clause, and an `unspecified` room that invented
light words.

Related: [[art-direction-model]] (the four-layer split; medium/palette = Artist, world/mood =
Aesthetic, literal facts = Scene), and the "fix the engine, not individual prompts" feedback —
note this IS a per-room scene edit, justified because the differentiator is intrinsically
per-room (the global layers can't tell two rooms apart).
