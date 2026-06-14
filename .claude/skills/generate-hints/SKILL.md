---
name: generate-hints
description: Generate a UHS-style hint JSON file for an IFTalk game. Triggered when the user says "generate hints for <game>", "create hints for <game>", or "add hints to <game>".
---

# generate-hints skill

Produces a `docs/games/hints/<gameName>.json` file for a game in the IFTalk library following the static UHS/InvisiClues-style schema (schema version 1).

## Overview

Hint files are static JSON, **not AI-generated at runtime**. This skill is run once per game by a developer (or Claude) to author the hint data from walkthrough sources. Players then browse hints progressively in the app's Hints panel.

---

## Hint Philosophy (read before drafting)

Distilled from study of real Invisiclues booklets (Zork I, Trinity, Spellbreaker, The Witness, Stationfall), UHS files and authoring guidance, and IF hint-design literature (Emily Short, intfiction.org, The Digital Antiquarian). The core problem: **the question list is itself a spoiler surface.** A browsing player learns what puzzles exist, what objects matter, and how much game remains. Every rule below defends against that, or makes the hint ladder respect the player's actual knowledge state.

### The stance (read this first — it generates every rule below)

Writing hints fights a model's strongest instinct: **be clear, complete, and unambiguous.** That instinct is right almost everywhere else and wrong here, because being maximally clear *collapses the player's uncertainty straight onto the answer* — which is the one thing a hint must not do. If you write hints the way you'd explain anything else, you will produce walkthroughs. Every rule in this document is a consequence of resisting that pull; hold the stance and you rarely need to consult the rules.

**The stance: a hint changes the player's *option space*, never their *answer*.** A good hint does one of exactly two things:
- **Widens** — opens a space the player hadn't considered ("not every gap is crossed on foot" → now they think about *crossing*, not *walking*).
- **Narrows** — rules out a wrong approach ("you can't fight a shadow") so the player stops wasting the space they're in.

Neither names the move. After reading a non-final hint the player should have **more ideas worth trying, or fewer dead ends** — never *the action*. If they can act with no thought left, you answered instead of hinted.

**Clarity is not the enemy — misaimed clarity is.** You do not communicate lightly by being vague; you do it by being *precise about the right layer*:

| Be perfectly clear about… | Stay silent about… |
|---|---|
| the **wrong theory to drop** ("you can't win this fight") | the **right one**, until the rung that earns it |
| the **property** that matters ("it's on wheels", "shadows can't survive light") | the **command** (`PUSH PIANO`, `TAKE PHOTOGRAPH`) |
| the **area** to attend to ("look up", "it's the floor, not the mannequins") | the **exact object/exit** |
| the **category** of solution — *only when it's a real space, not a one-item synonym* | the **instance** ("the glue", "the camera") |

**The category trap.** Naming a solution-category feels safe but usually isn't: "something sticky" has essentially one member — the glue — so it *is* the answer in disguise. It hands over both *what to do* (immobilize them) and *what with* (a sticky thing). When a category collapses to a single obvious item, drop down a layer and nudge at the **problem** rather than the **solution-shape**: not "something sticky underfoot would root them" but "it's the floor between you and them that you can change." Let the player re-derive that sticky is the way. The safe layers — wrong-theory, property, area — almost never collapse like this; reach for them first, and treat solution-category as a last resort.

So: spend all your clarity on the *framing* and reserve vagueness strictly for the *instance and the move*. "Not every gap is crossed on foot." is vivid, confident, and gives away nothing — it widens the space without touching the answer. *That* is the whole craft.

### Tiers at a glance

Each tier of a hint entry has a *different job* and answers to a different subset of the rules. A hint that's wrong is usually doing another tier's job. Read this as the map; the numbered rules are the detail.

| Tier | Its one job | Must not | Governing rules |
|---|---|---|---|
| **The question** | Let a stuck player recognize their problem by its *visible symptom* | Name a hidden thing, presume possession/progress, or manufacture a goal | 1–4 |
| **Rung 1** (first hint) | Make the player *think*, not act — confirm the puzzle, rule out a wrong theory, or ask a genuinely opening question | Point at the solution object; act as a soft instruction | 5, 12a |
| **Middle rungs** | Advance exactly *one* increment — point attention, then name the mechanism | Add filler, leading questions, cross-references, or skip ahead | 7–12b |
| **Final rung** (answer) | Resolve completely — literal, exact commands | Be vague or partial; this is the *only* tier that hands over moves | 6 |

The shape of a good ladder: **visible symptom → think → look → mechanism → exact commands.** Each step reveals at most one thing the step above didn't.

### Question wording

1. **Anchor questions to the visible symptom, never the hidden answer.** The player searches by what they can see. If the puzzle is *discovering* something exists (a hidden room, a breakable wall, a fourth pearl), the question must not name it. Real Invisiclues: "How do I get into the dungeons?" — not "Where is the trapdoor under the rug?" Bad: "How do I get into the sealed-up ticket booth?" Good: "Is there more to find in the Manager's Office?" — with the booth's existence as a mid-ladder reveal.
2. **Don't presume possession or progress in the question.** "I have three pearls — where's the green one?" leaks that pearls are collectible, that there are four, and one is green. Anchor to a single observable instead: "What's this strange eye-like pearl for?" State-scoping belongs in section order and in-ladder gates, not question text. **Worked example (the corpse, Theatre):** Bad — "I found a corpse under the carpet. Ew. Now what?" This both presumes progress ("I found") *and* names a discovery — and it sat directly below the question whose whole payoff was uncovering that corpse ("MOVE CARPET ROLLS… something unpleasant is revealed underneath"), so a browser read the answer to the puzzle above before earning it. Fix: don't give the discovery its own question at all — fold it into the discovering puzzle's ladder as a mid-rung reveal ("don't hurry past what they were lying on top of" → "search what's underneath" → answer). When a "now what do I do with X?" question would name something a sibling puzzle is supposed to reveal, the answer is almost always *merge*, not *reword*.
3. **Use the established wording taxonomy** — each form signals a puzzle type:
   - `How do I [goal]?` — only when the obstacle is already visible to the player. **Premise test:** if the question's own first hint has to *correct* its premise (e.g. the question asks "how do I reach the chandelier?" and hint 1 says "you don't reach it — you bring it to you"), the goal wasn't really visible — the question manufactured it and leaks that the object is a puzzle. Demote to `Is X significant?`.
   - `What do I do with X? / What is X for?` — object in hand, purpose unknown. This is also the red-herring slot (see below).
   - `Is X useful / significant?` — ambiguous objects; the answer is allowed to be "no".
   - `Where can I find X?` — only for objects the player *knows* they need (game told them).
   - First-person distress: `"A thug with a knife is blocking the street!"` — deaths, timers, fail-states; players search by symptom.
   - `What do I do about X?` — recurring hazards.
4. **Quote the game's own words** when naming mysterious things ("What's this cube I found?" works because the game itself calls it a featureless cube).

### Hint ladder craft

5. **3–5 levels: confirm/redirect → point attention → mechanism → exact commands.** A good level-1 hint does one of: confirms the puzzle is real, names a relevant property ("It's a vampire bat"), rules out the likely wrong theory ("Fighting isn't always the answer"), asks a genuinely *opening* question, or quotes the game's own failure text.
   **The Socratic test.** Question-form hints preserve player agency and belong at early levels — but *only when the question opens up the player's thinking*: it reframes the problem or challenges an assumption ("Have you checked all sides?", "You're sure fighting is the only option?"). A question that *presupposes the answer's framing and points the player straight at it* is not Socratic — it's the next step softened into a question, i.e. leading. The test for any question hint: **does it widen the search space, or hand over the move dressed as inquiry?** "Where might you have seen a pattern worth capturing?" fails — it has already decided the answer involves a pattern-bearing place and is just nudging the player at it. Reframe to open thinking, or cut it (see rule 12a). Contrast a rung-1 hint that passes: "Not every gap is crossed on foot." — it confirms the puzzle, rules out the wrong approach (walking), and widens the search space, all without naming the solution.
6. **The final hint is non-negotiable: complete, literal, exact commands.** A ladder that never fully resolves is the cardinal failure. The sum of all final hints should constitute a minimal walkthrough of every progress gate. **Conversely, *only* the final hint uses literal parser commands.** Every rung above it directs the mind in prose — "open the chest", "look in the coal bin", "follow the crow" — never a capitalised command like `OPEN CHEST`. A parser command appearing above the answer rung is a solution that has leaked up the ladder: demote it to a nudge. Middle rungs name an action in plain language at most; they never spell the keystrokes.
6a. **Answers contain only progress-advancing commands — never inventory housekeeping.** Don't tell the player to `DROP` something "afterwards", `DROP` a now-useless item, or otherwise tidy their inventory. IFTalk games almost never require dropping things (there's no weight/inventory limit in play), so a drop instruction is noise that reads as a required step when it isn't — and rule 10 forbids implying requirements you haven't verified. The **only** exception is when the game genuinely demands it (e.g. a ceremony that fails unless you're empty-handed) **and** the walkthrough states it; then it's a real progress gate and belongs in the answer. Default: if dropping isn't load-bearing, leave it out entirely. The same goes for any "you can drop X / you won't need X anymore" reassurance — cut it.
7. **Never assert game state the player may not have.** No "you're carrying something made for catching light" — the player may not have the lens. Use conditionals ("Have you found anything made for catching light? If not, explore the attic first") or gates (below).
8. **Gate prerequisites inside the ladder, Invisiclues-style:** an explicit early hint reading "Don't go on unless you've explored the attic" or "You can't solve this yet — you'll know when the time comes." A player lacking the prerequisite stops there unspoiled.
9. **Don't cross-reference other questions or sections.** Each ladder stands completely on its own and ends in its own full answer (rule 6); the panel is browsable by location, so a player finds related puzzles by exploring — exactly as they explore the game. Naming another entry ("see 'A shadow creature keeps driving me back'") treats the file as hypertext, goes stale the moment a title changes, and clutters the hint. When a puzzle depends on another being solved first, state that prerequisite *in-world* as a gate (rule 8) — "lower the chandelier first", "you'll need something that flashes" — never as a pointer to the entry that covers it. The gate both protects against spoilers and tells the player what to pursue. (And a hint must still never spoil a different puzzle's solution.)
10. **Don't invent failure behavior.** Walkthrough steps are usually requirements — treat them as needed and present them confidently. But a walkthrough records the successful sequence, not what happens when you skip a step. So never *describe the game's refusal* ("it won't budge until...", "the door stays locked unless...") unless the walkthrough states it or you observed it in-game — that's where fabrication creeps in (verified example: Theatre's piano pushes fine without ever being played, though the walkthrough plays it first). Safe phrasings that don't depend on unverified mechanics: "You'll need to...", "Do X first", "Don't leave without doing X." If a hint's pedagogy *hinges* on the refusal behavior, verify it live or rewrite the hint.
11. **Order-independence (official UHS principle):** every ladder must make sense no matter what the reader has or hasn't read. Never assume they saw an earlier section.
12. **Tone discipline:** jokes live at level 1 and at the end of fake/red-herring ladders; the middle of a real ladder is always played straight.
12a. **One increment per rung, then stop — say less.** Each rung delivers exactly one new thing and ends. Three ways writers over-deliver, all to be cut:
   - **Trailing leading question.** "…it must carry a pattern first. Where might you have seen a pattern worth capturing?" The concept statement *is* the hint; the tacked-on question just spoon-feeds the next move. Drop it. (This is narrower than rule 5's Socratic hints: a genuinely *opening* question is fine — "Have you checked all sides?" — but a question that presupposes the answer's framing and points at it is just leading dressed as inquiry.)
   - **The "— perhaps in X?" aside.** Bolting the next rung's reveal onto an early hint as a casual aside hands it over for free. If hint 2's job is "the lens must carry a pattern," it ends there; *where* the pattern lives is hint 3's job.
   - **Piled-on cross-refs and directions.** "The machinery is in the attic — you'll need a way up there first (see the piano question). From the attic's southern end, head north and look for a mechanism." Three rungs' worth in one. The hint is "The machinery is in the attic." — full stop. Exact directions belong in the answer; the prerequisite belongs in its own gate if it needs one at all.
   Point early hints at the concept or category, never the specific object/room. When a hint feels complete, look for the clause after the em-dash or the trailing sentence — that's usually the over-delivery; cut it.
12b. **Hints speak to the player in-world, not about the hint file.** No meta-navigation ("see the gas question"), and no fail-state-presuming parentheticals ("(If the gas drove you out before you could look around, see the gas question first.)") — both break frame and treat the file as hypertext. A prerequisite is stated in the world as a gate (rules 8–9), not as a reference to another entry.

### Red herrings and fakes

13. **Red herrings get real questions in the same forms as real puzzles**, answered fully and finally with zero residue: "What is the timber for?" → "It makes the room more interesting and the adventurer more confused." If a red herring is an active trap (using it breaks a later puzzle), say so explicitly: "The shears are a trap. There is another way."
14. **Consider 2–4 fake questions per game**, scattered through normal sections. Their canonical purpose (per Invisiclues author Mike Dornbrook): make the question list unreliable as a spoiler map. Play the early hints straight, land the joke at the end, and have at least one close with the lesson: "do not use the presence or absence of a question as an indication of what is important."
15. **Don't let ladder length leak importance.** Pad trivial/fake ladders ("This space intentionally left blank") or keep all ladders in a similar range, so a 6-hint question doesn't scream "big puzzle here."
15a. **Don't over-craft a trivial puzzle — trite is correct.** The flip side of rule 15: a clever reframe or evocative nudge on a non-puzzle leaks importance just as length does, because the player reads effort into the ladder and hunts for a trick that isn't there. A locked door that needs a key the game hands you elsewhere is not a puzzle; its hints should be flat and obvious — "It's a locked door. You'll need a key." / "If you haven't come across the right key yet, keep an eye out for it." / answer — not "Force won't help and there's no hidden catch…". Match the hint's register to the puzzle's actual difficulty: save the craft (property-nudges, wrong-theory framing, widening questions) for puzzles that earn it.

### Structure

16. **Sections by location/act in play order** — geography does most of the state-scoping for free. A player only browses sections for places they've reached. **Section titles name visible regions, never discoveries or contents**: "The West Wing", not "The Attic & Chandelier"; a title is a place the player has stood, not a thing they'll find. An object-centric catch-all section ("Stuff and Things"-style, holding "What good is X?" questions) and a "General Questions" section are permitted exceptions. If the game is navigated by something other than place (e.g. a mystery driven by characters and times), section by that dimension instead.
17. **Hints should exist from the moment a puzzle is first encounterable** — err on the side of too early rather than too late.
18. **Optional content (bonus points, easter eggs) is segregated and labeled** so completionists can find it and others aren't spoiled. A post-completion "For Your Amusement" section ("expose only after finishing") is the classic home for fun experiments and dev trivia. Scoring/perfect-score questions are "last resort" content by convention: their deep hints may name hidden places freely — a completionist asking that question wants the full list — but the early levels should still escalate normally.
19. **Writing hints is a design audit:** if a puzzle can't be hinted gently, note it — that's information about the game, and the hint file may be the only fair warning a player gets.

---

## Hint Critique Loop (self-improvement)

This skill is meant to *improve as it's used*. When the user points at a specific hint they don't like — during generation or review — don't just patch that one line. Run it through this loop, because a single bad hint is usually evidence of a principle that's missing, fuzzy, or being misapplied.

For each flagged hint:

1. **Name the flaw precisely.** Quote the hint and say what's wrong in one sentence. Map it to a principle where one exists: too leading (rules 5, 12a), filler / over-delivery (rule 12a), presumes game state (rule 7), presumes possession/progress (rule 2), cross-references (rule 9), meta/out-of-frame (rule 12b), spoils another puzzle (rule 9), names a hidden thing in the question (rule 1), invents refusal behavior (rule 10). If it maps to no existing rule, that's the signal a rule is missing.
2. **Decide: reframe or cut.** A hint earns its place only if it advances exactly one rung. If the rung above and below already cover its job, cut it (and let the ladder be shorter — rule 15 only cares that lengths don't *leak importance*, not that every ladder is long). Otherwise reframe.
3. **Reframe respecting ladder position.** Re-derive what *this* rung is allowed to reveal — no more than one increment past the rung above, no spoiling the rung below or any other puzzle. Write the leanest line that does that job.
4. **Close the loop on the philosophy.** Ask explicitly: *does this teach us something the rules don't yet capture, or capture sharply enough?* If yes, propose the edit to the Hint Philosophy (new rule, sharpened wording, or a worked Bad→Good example) and apply it once the user agrees. The flagged hint becomes the canonical example in that rule. This is how the philosophy gets better instead of the same mistakes recurring per-game.

The bar throughout: **gentle nudges, no filler, not too obvious.** A first hint should make the player *think*, not act; the answer rung is the only place that hands over moves.

---

## Step 1 — Research & Save Walkthrough

Find the walkthrough text from authoritative sources:

1. **CASA** (solutionarchive.com) — primary source; search for the game by title and author. Note the file ID and URL.
2. **IFDB** (ifdb.org) — find the game page for secondary details, author, and year.
3. **uhs-hints.com** — check if a UHS file exists for the game (great for escalating hint structure).
4. **ClubFloyd transcripts** (if available) — real play sessions showing room names exactly as the game displays them.

**Save the walkthrough text** to `docs/games/walkthroughs/<gameName>.txt`. Copy the full raw text from the source page — don't summarise. Add a header block with the source URL and attribution. This file stays in the repo as a permanent reference; it is never served to the browser.

Record all source URLs for the `meta.sources` array, and add a `"file"` key pointing to the local path:
```json
{
  "name": "Dorothy Millard walkthrough (CASA)",
  "url": "https://solutionarchive.com/file/id%2C8345/",
  "file": "docs/games/walkthroughs/theatre.txt"
}
```

---

## Step 2 — Draft Hint Sections

Structure the JSON as one section per act or area of the game, in progression order.

**Section rules:**
- `id`: stable slug (kebab-case), never change once published — it keys persisted reveal state.
- `title`: human-readable act/area name (e.g. `"Act I — The Pager"`).
- `verified`: `true` only if every `locations` name was confirmed from the app's own journey log during a live playthrough (Step 3). All other sections: `verified: false`.
- `locations` (section-level): **always populate this**, even for `verified: false` sections. Read through the walkthrough and extract every room name the player visits while working on puzzles in this section. Title-case the walkthrough's parenthetical room descriptions (e.g. `"(music room)"` → `"Music Room"`). A wrong name simply won't match and shows no pin — that is no worse than omitting it. An absent array guarantees the pin never works for that section.

**Question rules:**
- `id`: stable slug. Preserve existing IDs on regeneration.
- `q`: phrased per the Hint Philosophy wording rules — anchored to the visible symptom, presuming no possession/progress, using the established wording taxonomy.
- `locations` (question-level): add this whenever a question is specific to one or two rooms within its section. Trace the walkthrough to identify exactly where the player would be when they'd need that hint, and use only those rooms. Omit if the question is section-wide or the room is ambiguous.
- `hints`: 3–6 strings, escalating from nudge → strategy → exact commands.
  - First hints: vague nudges toward thinking about the puzzle.
  - Middle hints: what to look for / where to go.
  - Last hint: exact commands (labeled "Answer" in the UI). **Always the last entry.**
- **Spoiler discipline**: a hint must never name objects, rooms, or characters the player cannot have encountered yet at that puzzle's point in the game. Gate prerequisites inside the ladder and cross-reference by topic, never by solution — see Hint Philosophy.

---

## Step 3 — Verify Locations by Playing

This step is what distinguishes `verified: true` from `verified: false` sections. Do not skip it for the opening section.

1. Start the dev server: `npm start` (from `E:\Project\IFTalk`), app at `http://localhost:3002`.
2. Use the web-agent skill to load the game in-browser and play through the opening.
3. After each room change, capture observed room names:
   ```js
   // Run in browser console or via web-agent execute_console:
   window.getMapData().journey.map(j => j.locationName)
   ```
   **Important**: capture this **before** opening the in-app map. Opening the map calls `clearJourney()` (auto-mapper.js ~line 312) and wipes the journey buffer.
4. The primary location source (survives journey clears) is:
   ```js
   window.getLastLocationName()
   ```
5. Only names actually observed go into `locations` arrays for `verified: true` sections. Copy them byte-for-byte; replace the walkthrough-derived guesses with the confirmed names.
6. Mark confirmed sections `verified: true`. Sections not yet played through keep `verified: false` and their walkthrough-derived locations.

---

## Step 3.5 — Probe questionable mechanics (the "hint-runner" method)

Rule 10 forbids inventing refusal behavior. When a draft hint *wants* to claim a requirement or refusal ("you can't push it until...", "the usher won't let you in without..."), and the walkthrough doesn't state it, test it live rather than guessing:

1. Play (or continue the Step 3 session) to the moment just **before** the questionable step.
2. Save to the dedicated probe slot using the app's named-save meta-command: type `SAVE` and name the slot **`hint-runner`** (stored as `iftalk_customsave_<game>_hint-runner`). **Never use the quicksave slot** — it belongs to the user.
3. Try the skip-path: attempt the later action *without* the walkthrough's intermediate step. Record exactly what the game says.
4. Type `RESTORE` and reload `hint-runner`, then try the next variant. Repeat as needed.
5. Update the hint with what you observed: a real refusal (quote or paraphrase the game's actual response — now it's verified and quotable per rule 5), or no refusal (drop the false requirement, per the piano example).
6. When done probing, delete the `hint-runner` slot (Manage Saves modal, or remove the localStorage key) so it doesn't linger in the user's save list.

Interpretation guide: a probe **disproves** a requirement cleanly (action succeeded without the step). A refusal only proves *something* is missing — not necessarily the step you skipped — so phrase verified refusals by what the game said, not by your inferred cause.

Only probe claims that are load-bearing for a hint's pedagogy. Don't exhaustively test every walkthrough step — most are requirements and the safe phrasings from rule 10 cover them.

---

## Step 4 — Write and Validate

Write the file to `docs/games/hints/<gameName>.json` where `<gameName>` is the game filename minus extension, lowercased (matches `game-loader.js:36` normalisation).

**Schema checklist before saving:**
- [ ] `"schema": 1` at root
- [ ] `"game"` matches normalised game filename
- [ ] All `id` fields are stable kebab-case slugs
- [ ] Last hint in each `hints` array is the full answer (exact commands)
- [ ] No hint reveals a later puzzle's solution or names objects the player can't have seen yet
- [ ] No question names hidden things or presumes possession/progress (Hint Philosophy rules 1–2)
- [ ] No hint asserts unverifiable game state; prerequisites gated in-ladder (rules 7–8)
- [ ] **No cross-references** to other questions or sections — prerequisites are stated in-world as gates, not pointers (rules 8–9). Search the file for "see '" / "see the" / "see that" and remove any that name another entry.
- [ ] Every section has a `locations` array (even `verified: false` — extracted from walkthrough)
- [ ] Question-level `locations` added wherever the question is room-specific
- [ ] `meta.sources` lists all URLs used, each with a `"file"` key pointing to the local walkthrough copy
- [ ] `meta.generatedAt` is today's date (YYYY-MM-DD)
- [ ] `meta.appVersion` matches the version being bumped to

**Validate JSON parses:**
```powershell
cd "E:\Project\IFTalk"
node -e "JSON.parse(require('fs').readFileSync('docs/games/hints/<gameName>.json','utf8')); console.log('ok')"
```

---

## Step 5 — Integrate

1. Add `'./games/hints/<gameName>.json'` to `BUNDLED_GAMES` in `docs/service-worker.js`.
2. Triple version bump (config.js, service-worker.js CACHE_VERSION, CLAUDE.md).
3. Verify in-browser (after stale-SW guard per memory):
   - Load the game → ☰ → Hints → correct section badged 📍 for opening room.
   - Reveal hint 1 → hint 2 → answer; reload → reveals persist in `localStorage.iftalk_hints_<gameName>`.
   - Reset confirms + clears.

---

## ID stability note

Hint reveal state is keyed by `questionId` in localStorage. If you regenerate a hint file for an existing game, **preserve all existing `id` values**. Changing an ID silently resets that question's reveals for all users.

