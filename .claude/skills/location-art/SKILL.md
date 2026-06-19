---
name: location-art
description: Generate, review, and refine per-location art for a Lantern game (the three-layer Artist/Aesthetic/Scene pipeline). Triggered when the user says "location art", "/location-art [game]", "generate art for <game>", "regenerate <room>", "review art notes for <game>", or "craft a scene prompt". With no game named, ask what to do.
---

# location-art skill

Owns the **whole location-art pipeline** for a Lantern game: mine prompts → craft scene
text → generate images → review → route review notes back into the layers → promote.

The *why* (design rationale, hard-won lessons) lives in the tome:
`.tome/art-direction-model.md` and `.tome/location-art-system.md`. **Read
`art-direction-model.md` before crafting or editing any scene/aesthetic/artist text.**
This skill is the *how*.

## The three layers (the core model)

Every image's prompt is composed from three independent layers:

```
composed = Artist.style  +  "Aesthetic: " + game.aesthetic  +  "Scene: " + scene
```

| Layer | Scope | File |
|---|---|---|
| **Artist** | GLOBAL (every game) — medium/technique only | `docs/games/images/_artists/artists.json`, picked per game via `<game>/selected-artist.json` (house artist: **Aldous Quill**, id `ink`) |
| **Aesthetic** | per game — palette/mood/light/era | `docs/games/images/<game>/style.json` → `aesthetic` |
| **Scene** | per room — literal contents only | `<game>/style.json` → `scenes[slug]` override, else the scraped scene in `<game>/prompts.json` |

`gen-room-images.cjs` and `review-server.cjs` both compose from these same files, so the
batch generator and the reviewer's Regenerate button always send the identical prompt.

## No game named → ask what to do

If invoked bare (`/location-art` with no game / no clear action), DON'T guess. List the
games under `docs/games/images/` (dirs not starting with `_`) and ask **which game** and
**which action**:

1. **Generate / regenerate** images (new room art or re-roll existing)
2. **Review notes** — read reviewer feedback and route it to the right layer
3. **Craft / edit a scene** (write or fix a `scenes[slug]` override)
4. **Open the reviewer** (just launch the review UI)
5. **Promote** approved images into the game

## Action: Generate / regenerate

1. If `<game>/prompts.json` doesn't exist yet, build the pack from the verified walkthrough:
   `node tools/gen-room-prompts.cjs <game>` (needs `docs/games/walkthroughs/<game>.cmds.txt`
   — run the `trace-walkthrough` skill first if missing). The pack emits **scene-only**
   prompts; style is NOT baked in.
2. Generate into the `_review/` staging folder (composes the three layers live):
   - all rooms: `node tools/gen-room-images.cjs <game>`
   - one room: `node tools/gen-room-images.cjs <game> --only <slug>`
   - re-roll (keeps prior take as `<slug>.prev.png` for A/B): add `--regen`
   - nudge a single render without editing the scene: `--steer "..."` (one-off only —
     if a fix should stick, put it in the Scene/Aesthetic/Artist layer instead)
   - needs `GEMINI_API_KEY` in `.env` (gitignored). Flat ~$0.039/image.
3. Each image gets a sidecar `<slug>.txt` with the EXACT composed prompt used.

## Action: Review notes (this is where "review notes" lands)

Reviewer feedback is saved (via the review UI's Notes box) to
`docs/games/images/_review-notes.json`, keyed `game:<game>:<slug>`.

1. Read that file; consider only **unresolved** notes (see flagging below).
2. **Cluster before you route — look for recurring issues FIRST.** Before touching any single
   note, scan the whole unresolved set for the *same complaint recurring across multiple rooms*
   ("too dark", "faces look melty", "text/letters in the image", "washed-out palette"). A
   problem that shows up in one room is a Scene fix; the **same** problem across ≥3 rooms is a
   signal it belongs one layer UP — the **Aesthetic** (this game) or the **Artist** (all games).
   - For each cluster, **draft a lightly-worded suggestion** for the higher layer and present
     it for approval — never auto-apply. Phrase it as a proposal tied to the evidence, e.g.
     *"3 rooms note over-dark renders (alley, office, file-room) — consider adding `evenly lit,
     no deep shadows` to the **Game aesthetic**?"* or, for a cross-game rendering artifact,
     *"recurring 'text in image' — consider `no text, no lettering, no signage` on the
     **Artist** signature (affects every game)."*
   - **Artist edits are global** (every game using that artist). Treat them as the highest bar:
     suggest, show the exact before/after, and apply ONLY on explicit approval. Heed the
     marginal-framing warning below before ever proposing one.
   - A cluster handled at the Aesthetic/Artist layer **resolves the member notes** with
     `appliedTo: "aesthetic"` / `"artist"` — don't then also write per-room Scene edits for them.
3. **Route each remaining (non-clustered) note to the layer that owns the problem** — the key judgment:
   - **framing / medium / edges / rendering** (black frame, border, "looks like pixels",
     paper margins) → **Artist** (`_artists/artists.json`) — fixes ALL games at once. BUT
     beware *marginal* framing nitpicks (e.g. "border a touch too wide"): the model can't
     reliably dial edge/margin *feel* via prose — small nudges swing wildly and trade away
     the ragged quality. If a render is already good, the right resolution is usually
     **won't-fix / keep the good render**, NOT a global-artist edit. See `.tome/art-direction-model.md`.
   - **palette / mood / weather-intensity / light / era** → **Aesthetic** (`style.json`).
   - **wrong/invented geometry, objects, sightlines, too much/little of a thing** →
     **Scene** override (`style.json` → `scenes[slug]`).
4. **Draft, don't silently apply.** For every routed note, present the concrete change as a
   **before → after diff** of the target field (the current `scenes[slug]` / `aesthetic` /
   artist `style` text vs. your proposed text) and get approval before writing. Scene-level
   drafts can be batch-approved; Aesthetic and Artist drafts are confirmed one at a time.
5. **For any positioning / sizing / quantity note, verify against the actual game before
   editing — don't eyeball it from the picture.** Read the in-game prose (`prompts.json` →
   `description`), the walkthrough (`docs/games/walkthroughs/<game>.cmds.txt`), and adjacent
   rooms to establish where a feature really is, how big it is, and what puzzle depends on it.
   (E.g. the Anchorhead alley window: the prose says "high up… transom-style," and the puzzle
   is climbing the garbage cans to reach it — so it must read small, on the north wall, and
   reachable, not a big window at ground level.) Encode the *verified* fact and its puzzle
   rationale in the Scene override; a note like "window too high" is a symptom, the game is
   the source of truth for the fix.
6. **Apply approved edits, then offer to regenerate** the affected room(s) so the user can
   eyeball them (or paste the composed prompt into a free generator).
7. **Flag the note resolved (don't delete it).** Once a note has been acted on, mark it so
   future reviews skip it but the history survives. An entry may be a plain string (=open)
   OR an object `{ "note": "...", "status": "resolved", "appliedTo": "scene|aesthetic|artist",
   "resolved": "<YYYY-MM-DD>" }`. To resolve, convert the string to that object form with
   `status: "resolved"`. Reading code treats a missing/`"open"` status as still-open and
   `"resolved"` (or `"wontfix"`, for a note you consciously decided NOT to act on) as
   handled. Never silently delete a note — the user wants to see what was addressed and be
   able to re-open it. The reviewer UI shows a flag chip + a **Resolved checkbox** (check =
   resolved, uncheck = re-open) the user can toggle freely; **editing a flagged note's text in
   the UI re-opens it** (unchecks the box), so a note the user revisits comes back into the
   active set automatically.

## Action: Craft / edit a scene (the recipe)

**Claude constrains; nanobanana renders.** Nearly every reject so far was the model
*juicing on its own* — inventing a doorway, an archway, dramatic lightning, heaping on
trash. The Scene layer's job is the OPPOSITE of embellishment: pin down literal facts and
fence off hallucinations. The artistic juice comes from Aldous Quill + the Aesthetic.

When writing a `scenes[slug]` override:
1. **Read the in-game prose** (the reviewer shows it as "In-game description"; it's
   `prompts.json` → `description`). Pull only concrete visible facts: materials, layout,
   sightlines, the one or two objects that matter, the light source.
2. **State geometry explicitly** — which wall a feature is on, what the space dead-ends at,
   relative directions a puzzle/map depends on. Cross-check adjacent rooms (e.g. Anchorhead
   alley window = file-room window; same window, must be on the climbable wall).
3. **Constrain what the model tends to invent** — pin the literal facts and rule out the usual
   hallucinations (`"cobblestone NOT dirt"`, `"no archway"`). Phrase it however reads naturally.
   If something unwanted keeps recurring it's usually a contradiction in the Scene's own
   description (e.g. a "tall solid plank fence" that visually IS a door) — fix that. See
   `.tome/art-direction-model.md`.
4. **Strip transient / randomized flavor**: NPC movement ("Michael follows you"), dialogue,
   coughing, and randomized weather (Anchorhead's sheet-lightning line is randomized flavor,
   not permanent scene). Keep these OUT.
5. Keep it tight and literal — purple adjectives are the Aesthetic's job, not the Scene's.

## Action: Open the reviewer

Launch the review UI (server on port 3009; reuses a running instance):
`& "E:\Project\Lantern\tools\artview.ps1" <game>` (PowerShell tool). This is the same thing
the standalone `/artview` command does. Add `-Restart` to switch games. The reviewer lets
you A/B candidates, see the composed + actual prompt, leave notes, and Promote/Regenerate.

Build a static contact sheet instead: `node tools/gen-room-review.cjs <game>`.

## Action: Audition artists for a game

Use this to **pick (or develop) which artist a whole game should use** before committing
every room to one. In the reviewer's **Audition** rail topic (pick a game in the middle
pane): choose a user-selected SUBSET of artists and 3 scenes (auto-suggested as one
exterior + one dim interior + one signature room — all overridable), then "Generate all
missing" renders `subset × scenes` through the normal compose path (App ▸ Artist ▸ Aesthetic
▸ Scene) so the takes are production-faithful. Compare the grid side-by-side, then
**Make house artist** writes `<game>/selected-artist.json`.

- Config persists in `<game>/audition.json` (`{scenes:[≤3], artists:[]}`; empty ⇒ all
  artists / auto-suggested scenes). Renders land in `<game>/_audition/` named
  `<artistId>__<sceneSlug>__<tag>-rN.png` (+ `.txt` sidecar).
- Signatures stay GLOBAL — auditioning is for choosing/developing a roster, not forking an
  artist per game. Per-game difference belongs in the Aesthetic layer.
- Defaults to OpenAI-low (cheap); switch the genMode dropdown to Gemini/Nano-Pro for finals.
- Full design + endpoints: `.tome/artist-audition-design.md`.

## Action: Promote

Move approved images from `_review/` into the committed `<game>/` folder and update
`manifest.json` (keyed by exact `locationName`, the app's lookup key):
`node tools/promote-room-images.cjs <game> <slug> [<slug>...]`
Reject (drop from staging): `node tools/promote-room-images.cjs <game> --reject <slug>...`

## Notes
- These are dev-only tooling/data changes — do NOT bump the app version for them (a
  service-worker cache bump would force a pointless re-download for users).
- Snapshot/headless mechanics for verifying walkthroughs: see `tools/play.cjs` and
  `.tome/headless-replay-harness.md`.
