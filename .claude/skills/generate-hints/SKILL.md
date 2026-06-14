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
| **Rung 1** (first hint) | Make the player *think*, not act — confirm the puzzle, rule out a wrong theory, or ask a genuinely opening question | Point at the solution object; act as a soft instruction | 5, 14 |
| **Middle rungs** | Advance exactly *one* increment — point attention, then name the mechanism | Add filler, leading questions, cross-references, or skip ahead | 8–15 |
| **Final rung** (answer) | Resolve completely — literal, exact commands | Be vague or partial; this is the *only* tier that hands over moves | 6, 7 |

The shape of a good ladder: **visible symptom → think → look → mechanism → exact commands.** Each step reveals at most one thing the step above didn't.

### Question wording

1. **Anchor questions to the visible symptom, never the hidden answer.** The player searches by what they can see. If the puzzle is *discovering* something exists (a hidden room, a breakable wall, a fourth pearl), the question must not name it. Real Invisiclues: "How do I get into the dungeons?" — not "Where is the trapdoor under the rug?" Bad: "How do I get into the sealed-up ticket booth?" Good: "Is there more to find in the Manager's Office?" — with the booth's existence as a mid-ladder reveal.
   - **The `EXAMINE` test for "visible."** A detail the game only surfaces on `EXAMINE` (not in the default room description) is a *hidden discovery*, not a visible symptom — even though it feels visible to you, because the walkthrough names it. The walkthrough is not the player's screen. Test: *would the player see this without first deciding to examine the right thing?* If not, it belongs as a mid-ladder reveal, never in the question. **Worked example (the clean hook, Theatre):** the cleaner hook is only revealed by `EXAMINE HOOKS`; *noticing* it is the puzzle's first half. Bad question — "One hook in the Cloakroom is cleaner than the others. What's that about?" hands over that discovery and leaves only "pull it." Fix: anchor to the player-facing symptom — "The Cloakroom looks like a dead end. Is there anything to it?" — and let the clean hook surface in hint 2.
   - **Directing attention is not the puzzle — say it plainly; spend craft on the real step.** When the only obstacle is *thinking to look*, the early rung should bluntly point the player at the thing ("Take a closer look at the hooks.") rather than dress the act of looking up as a riddle. Finding the clue is the clue; the puzzle is what you *do* with it. Reserve Socratic framing and property-nudges (rule 5, rule 14) for that real step — here, "One of them is clean. Has it been used recently?" earns the craft; "examine the fittings on the walls" wastes it on the trivial act of looking. (Pairs with rule 19: match the hint's register to where the difficulty actually is.)
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

5. **Typically 3–5 levels (fewer for a trivial puzzle — rule 19): confirm/redirect → point attention → mechanism → exact commands.** A good level-1 hint does one of: confirms the puzzle is real, names a relevant property ("It's a vampire bat"), rules out the likely wrong theory ("Fighting isn't always the answer"), asks a genuinely *opening* question, or quotes the game's own failure text.
   **The Socratic test.** Question-form hints preserve player agency and belong at early levels — but *only when the question opens up the player's thinking*: it reframes the problem or challenges an assumption ("Have you checked all sides?", "You're sure fighting is the only option?"). A question that *presupposes the answer's framing and points the player straight at it* is not Socratic — it's the next step softened into a question, i.e. leading. The test for any question hint: **does it widen the search space, or hand over the move dressed as inquiry?** "Where might you have seen a pattern worth capturing?" fails — it has already decided the answer involves a pattern-bearing place and is just nudging the player at it. Reframe to open thinking, or cut it (see rule 14). Contrast a rung-1 hint that passes: "Not every gap is crossed on foot." — it confirms the puzzle, rules out the wrong approach (walking), and widens the search space, all without naming the solution.
6. **The final hint is non-negotiable: complete, literal, exact commands.** A ladder that never fully resolves is the cardinal failure. The sum of all final hints should constitute a minimal walkthrough of every progress gate. **Conversely, *only* the final hint uses literal parser commands.** Every rung above it directs the mind in prose — "open the chest", "look in the coal bin", "follow the crow" — never a capitalised command like `OPEN CHEST`. A parser command appearing above the answer rung is a solution that has leaked up the ladder: demote it to a nudge. Middle rungs name an action in plain language at most; they never spell the keystrokes.
   - **The answer rung may — and usually should — name in-world places, objects, and provenance:** "UNLOCK DOOR WITH SHINY KEY (from the Boiler Room)", "Go down to the lobby and PUT LENS IN SPOTLIGHT." That is *orientation*, the opposite of a spoiler at this tier, and it's exactly where the player wants it. It is **not** a cross-reference: rule 10 bans pointers to other hint *entries*, not mentions of the game world. Don't strip provenance out of an answer for fear of rule 10 — name the room, the item, and where it came from freely.
7. **Answers contain only progress-advancing commands — never inventory housekeeping.** Don't tell the player to `DROP` something "afterwards", `DROP` a now-useless item, or otherwise tidy their inventory. IFTalk games almost never require dropping things (there's no weight/inventory limit in play), so a drop instruction reads as a required step when it isn't — and rule 11 forbids implying requirements you haven't verified. **A walkthrough listing a `DROP` does not make it load-bearing.** Walkthroughs record a successful sequence, not a set of requirements, and authors drop things out of pure habit — verified: Theatre's walkthrough lists `DROP CAMERA` and `DROP KEY`, neither of which the game requires. So "the walkthrough says to drop it" is *not* the test. Include a drop **only** when it's genuinely a progress gate (e.g. a ceremony that fails unless you're empty-handed) *and* you've confirmed the requirement — from walkthrough text that states the requirement itself, or by probing (Step 3.5). Default: cut every drop, and cut any "you can drop X / you won't need X anymore" reassurance with it.
8. **Never assert game state the player may not have.** No "you're carrying something made for catching light" — the player may not have the lens. Use conditionals ("Have you found anything made for catching light? If not, explore the attic first") or gates (below).
9. **Gate prerequisites inside the ladder, Invisiclues-style:** an explicit early hint reading "Don't go on unless you've explored the attic" or "You can't solve this yet — you'll know when the time comes." A player lacking the prerequisite stops there unspoiled.
10. **Don't cross-reference other questions or sections.** This bans pointers to other hint *entries* ("see 'A shadow creature keeps driving me back'") — **not** mentions of in-world places or objects, which are fine at any tier and expected in the answer (rule 6). Naming another entry treats the file as hypertext, goes stale the moment a title changes, and clutters the hint; the panel is browsable by location, so a player finds related puzzles by exploring — exactly as they explore the game. When a puzzle depends on another being solved first, state that prerequisite *in-world* as a gate (rule 9) — "lower the chandelier first", "you'll need something that flashes" — never as a pointer to the entry that covers it. The gate both protects against spoilers and tells the player what to pursue. (And a hint must still never spoil a different puzzle's solution.)
11. **Don't invent failure behavior.** Walkthrough steps are usually requirements — treat them as needed and present them confidently. But a walkthrough records the successful sequence, not what happens when you skip a step. So never *describe the game's refusal* ("it won't budge until...", "the door stays locked unless...") unless the walkthrough states it or you observed it in-game — that's where fabrication creeps in (verified example: Theatre's piano pushes fine without ever being played, though the walkthrough plays it first). Safe phrasings that don't depend on unverified mechanics: "You'll need to...", "Do X first", "Don't leave without doing X." If a hint's pedagogy *hinges* on the refusal behavior, verify it live or rewrite the hint.
12. **Order-independence (official UHS principle):** every ladder must make sense no matter what the reader has or hasn't read. Never assume they saw an earlier section.
13. **Tone discipline:** jokes live at level 1 and at the end of fake/red-herring ladders; the middle of a real ladder is always played straight.
14. **One increment per rung, then stop — say less.** Each rung delivers exactly one new thing and ends. Four ways writers over-deliver, all to be cut:
   - **Trailing leading question.** "…it must carry a pattern first. Where might you have seen a pattern worth capturing?" The concept statement *is* the hint; the tacked-on question just spoon-feeds the next move. Drop it. (This is narrower than rule 5's Socratic hints: a genuinely *opening* question is fine — "Have you checked all sides?" — but a question that presupposes the answer's framing and points at it is just leading dressed as inquiry.)
   - **The "— perhaps in X?" aside.** Bolting the next rung's reveal onto an early hint as a casual aside hands it over for free. If hint 2's job is "the lens must carry a pattern," it ends there; *where* the pattern lives is hint 3's job.
   - **Piled-on cross-refs and directions.** "The machinery is in the attic — you'll need a way up there first (see the piano question). From the attic's southern end, head north and look for a mechanism." Three rungs' worth in one. The hint is "The machinery is in the attic." — full stop. Exact directions belong in the answer; the prerequisite belongs in its own gate if it needs one at all.
   - **The "you'll need it later" reassurance tail.** "GET PEARL — keep it, it matters much later." / "…and wake with a star crystal. You will absolutely need it." / "What it's for comes later." Telling the player to take or do something *already implies it matters* — the reassurance carries nothing they can act on, and a string of "…later" tails quietly leaks how much game remains. This is the most common padding on the answer rung specifically (the place that's supposed to be tightest — just the commands). Cut it. **Distinguish from naming an object's purpose** — "the ticket is your admission to the show", "that shiny key unlocks a door deep underground" — which is orientation the player can act on, not padding; keep (or lightly trim) those.
   Point early hints at the concept or category, never the specific object/room. When a hint feels complete, look for the clause after the em-dash or the trailing sentence — that's usually the over-delivery; cut it.
15. **Hints speak to the player in-world, not about the hint file.** No meta-navigation ("see the gas question"), and no fail-state-presuming parentheticals ("(If the gas drove you out before you could look around, see the gas question first.)") — both break frame and treat the file as hypertext. A prerequisite is stated in the world as a gate (rules 9–10), not as a reference to another entry.

### Red herrings and fakes

16. **Red herrings get real questions in the same forms as real puzzles**, answered fully and finally with zero residue: "What is the timber for?" → "It makes the room more interesting and the adventurer more confused." If a red herring is an active trap (using it breaks a later puzzle), say so explicitly: "The shears are a trap. There is another way."
17. **Consider 2–4 fake questions per game**, scattered through normal sections. Their canonical purpose (per Invisiclues author Mike Dornbrook): make the question list unreliable as a spoiler map. Play the early hints straight, land the joke at the end, and have at least one close with the lesson: "do not use the presence or absence of a question as an indication of what is important."
18. **Don't let ladder length leak importance.** Pad trivial/fake ladders ("This space intentionally left blank") or keep all ladders in a similar range, so a 6-hint question doesn't scream "big puzzle here."
19. **Don't over-craft a trivial puzzle — trite is correct.** The flip side of rule 18: a clever reframe or evocative nudge on a non-puzzle leaks importance just as length does, because the player reads effort into the ladder and hunts for a trick that isn't there. A locked door that needs a key the game hands you elsewhere is not a puzzle; its hints should be flat and obvious — "It's a locked door. You'll need a key." / "If you haven't come across the right key yet, keep an eye out for it." / answer — not "Force won't help and there's no hidden catch…". Match the hint's register to the puzzle's actual difficulty: save the craft (property-nudges, wrong-theory framing, widening questions) for puzzles that earn it.

### Structure

20. **Sections by location/act in play order** — geography does most of the state-scoping for free. A player only browses sections for places they've reached. **Section titles name visible regions, never discoveries or contents**: "The West Wing", not "The Attic & Chandelier"; a title is a place the player has stood, not a thing they'll find. An object-centric catch-all section ("Stuff and Things"-style, holding "What good is X?" questions) and a "General Questions" section are permitted exceptions. If the game is navigated by something other than place (e.g. a mystery driven by characters and times), section by that dimension instead — and if the same *rooms* recur across those acts/days (so location alone can't tell the panel which act you're in), add a section-level `phase` (see Step 2 Section rules) so only the current act's section badges.
21. **Hints should exist from the moment a puzzle is first encounterable** — err on the side of too early rather than too late.
22. **Optional content (bonus points, easter eggs) is segregated and labeled** so completionists can find it and others aren't spoiled. A post-completion "For Your Amusement" section ("expose only after finishing") is the classic home for fun experiments and dev trivia. Scoring/perfect-score questions are "last resort" content by convention: their deep hints may name hidden places freely — a completionist asking that question wants the full list — but the early levels should still escalate normally.
23. **Writing hints is a design audit:** if a puzzle can't be hinted gently, note it — that's information about the game, and the hint file may be the only fair warning a player gets.

---

## Hint Critique Loop (self-improvement)

This skill is meant to *improve as it's used*. When the user points at a specific hint they don't like — during generation or review — don't just patch that one line. Run it through this loop, because a single bad hint is usually evidence of a principle that's missing, fuzzy, or being misapplied.

For each flagged hint:

1. **Name the flaw precisely.** Quote the hint and say what's wrong in one sentence. Map it to a principle where one exists: too leading (rules 5, 14), filler / over-delivery (rule 14), presumes game state (rule 8), presumes possession/progress (rule 2), cross-references another entry (rule 10), meta/out-of-frame (rule 15), spoils another puzzle (rule 10), names a hidden thing in the question — including an `EXAMINE`-only detail (rule 1), invents refusal behavior (rule 11), inventory housekeeping in the answer (rule 7), over-crafted trivial puzzle / craft on the wrong rung (rules 19, 1), under-resolved answer (rule 6). If it maps to no existing rule, that's the signal a rule is missing.
2. **Decide: reframe or cut.** A hint earns its place only if it advances exactly one rung. If the rung above and below already cover its job, cut it (and let the ladder be shorter — rule 18 only cares that lengths don't *leak importance*, not that every ladder is long). Otherwise reframe.
3. **Reframe respecting ladder position.** Re-derive what *this* rung is allowed to reveal — no more than one increment past the rung above, no spoiling the rung below or any other puzzle. Write the leanest line that does that job.
4. **Close the loop on the philosophy.** Ask explicitly: *does this teach us something the rules don't yet capture, or capture sharply enough?* If yes, propose the edit to the Hint Philosophy (new rule, sharpened wording, or a worked Bad→Good example) and apply it once the user agrees. The flagged hint becomes the canonical example in that rule. This is how the philosophy gets better instead of the same mistakes recurring per-game. **When you add or insert a rule, renumber sequentially (no lettered suffixes) and update every cross-reference — the tiers table, this flaw-map, and the Step 2/3.5/4 references all cite rules by number.**

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
- `phase` (section-level, **optional**): a scoping string matched (case-insensitive substring) against the game's current **status-bar context** — the right-aligned region the location parser discards (e.g. `"day two"`, `"Chapter 3"`). A section badges only if its location matches **and** the current phase contains this string. **Omit it for almost every game** — location-only is the default and is correct for linear games and any game with unique geography per act (e.g. Theatre shipped entirely phase-less). Add `phase` *only* when a game **reuses the same rooms across acts/days** and would otherwise badge the wrong act (the canonical case: Anchorhead's 5 days over one town map). Harvest the exact string from a harness replay: `node tools/play.cjs <game> --status` prints `[@ Room  |  phase: <context>]` per turn — copy the discriminating part (`day two`, not `day two, evening`, so it also matches the evening sub-phase). If the game prints nothing in the right-aligned region (`phase:` is blank), this dimension isn't available — fall back to location-only. Questions inherit their section's `phase`; a question may set its own to override.

**Question rules:**
- `id`: stable slug. Preserve existing IDs on regeneration.
- `q`: phrased per the Hint Philosophy wording rules — anchored to the visible symptom, presuming no possession/progress, using the established wording taxonomy.
- `locations` (question-level): add this whenever a question is specific to one or two rooms within its section. Trace the walkthrough to identify exactly where the player would be when they'd need that hint, and use only those rooms. Omit if the question is section-wide or the room is ambiguous.
- `hints`: typically 3–5 strings (fewer for a trivial puzzle — rule 19), escalating from think → look → exact commands.
  - First hint: make the player *think*, not act — rule out a wrong theory, name a relevant property, or ask a genuinely opening question. Precise about the framing, not vague (see the stance).
  - Middle hints: point attention, then name the mechanism — what to look for / where to go.
  - Last hint: exact commands (labeled "Answer" in the UI). **Always the last entry.** May freely name in-world places and provenance (rule 6).
- **Spoiler discipline**: a hint must never name objects, rooms, or characters the player cannot have encountered yet at that puzzle's point in the game. Gate prerequisites in-world inside the ladder. **No cross-references** to other hint entries (rule 10) — state prerequisites as in-world gates, not pointers. See Hint Philosophy.

---

## Step 3 — Verify Locations by Playing

This step is what distinguishes `verified: true` from `verified: false` sections. Do not skip it for the opening section.

### Primary method — the headless replay harness (`tools/play.cjs`)

Use the harness for location harvesting and walkthrough verification. It drives our **exact** ZVM stack headlessly and derives location names with the app's own `getCurrentLocation()`, so the names it prints are byte-identical to what the auto-mapper records — no browser, no web-agent cost. (Design + gotchas: `.tome/headless-replay-harness.md`.)

1. Put the walkthrough's command sequence (one command per line) in a temp file, e.g. `docs/games/walkthroughs/anchorhead.cmds.txt`. Translate the walkthrough's compressed notation into real parser commands ("Se." → `se`, "Push can against wall." → `push can against wall`).
2. Replay it and read the per-turn locations the app would record:
   ```bash
   node tools/play.cjs <gameName> --status --file <cmds>.txt
   ```
   Each turn prints a `[@ <location>]` line — that string is exactly what the auto-mapper's journey would contain. `--quiet` shows only the final turn; `--raw` keeps blank lines.
3. The authoritative room list for a section is the set of distinct `[@ …]` names observed while replaying that section's commands. Copy them **byte-for-byte** into `locations` (mind British spellings, "the"/lowercase, two-word forms — walkthrough labels routinely drift from the game's actual `location.name`).
4. **The harness is also your walkthrough-verification pass**: if a step produces an error, an unexpected room, or "[no line-input prompt]", the walkthrough is wrong/incomplete for our build — fix the command and re-run before trusting it. (This is how the Anchorhead `e`-vs-`Se` opening confusion was settled.)
5. Mark sections you replayed end-to-end `verified: true`. Sections not yet replayed keep `verified: false` and their walkthrough-derived guesses.

**Harness caveats (don't be surprised):**
- **Randomized puzzles differ every run** (`@random` is clock-seeded): Anchorhead's safe combo, flute attunement, mirror measurement. Read the in-run clue; never hardcode. Puzzles whose solution depends on a per-run value can't be fully replayed past the gate — those sections stay `verified: false`.
- Each typed command appears twice in output (Glk line-echo + the CLI's `> cmd` header). Harmless.
- In-game `SAVE`/`RESTORE` are stubbed off — use replay-with-a-different-tail (Step 3.5) instead.

### Fallback method — live browser (web-agent)

Use the real app only for things the harness can't observe: actual in-app **save-slot** behavior, UI/narration/highlighting, map rendering, or a game whose intro the harness can't get past. Then:
1. `npm start` (from `E:\Project\IFTalk`), app at `http://localhost:3002`; load the game via the web-agent skill.
2. Location source that survives journey clears: `import('/js/features/auto-mapper.js').then(m => m.getLastLocationName())` (note: `window.getLastLocationName` does **not** exist — it's module-scoped). Capture **before** opening the in-app map, which calls `clearJourney()`.

---

## Step 3.5 — Probe questionable mechanics (the "hint-runner" method)

Rule 11 forbids inventing refusal behavior; rule 7 forbids implying an unverified requirement (e.g. a `DROP`). When a draft hint *wants* to claim a requirement or refusal ("you can't push it until...", "the usher won't let you in without...", "drop everything first"), and the walkthrough doesn't state the requirement itself, test it live rather than guessing.

### Primary method — branch the replay tail (`tools/play.cjs`)

Because replay starts from a fresh VM every time, probing a requirement is just running two command lists that share a prefix and differ in the tail — no save/restore needed (which also sidesteps the bootstrap-restore bug class entirely):

1. Take the verified prefix that reaches the moment just **before** the questionable step.
2. **With-skip run:** append the later action *without* the walkthrough's intermediate step:
   ```bash
   node tools/play.cjs <gameName> --quiet -- <prefix...> "<later action>"
   ```
3. **Control run:** append the intermediate step then the later action. Compare the two final turns.
4. Update the hint with what you observed: if the with-skip run succeeded, the requirement is false — drop it (per the piano example). If it was refused, quote/paraphrase the game's actual response (now verified and quotable per rule 5).

A probe **disproves** a requirement cleanly (the action succeeded without the step). A refusal only proves *something* is missing — not necessarily the step you skipped — so phrase verified refusals by what the game *said*, not by your inferred cause. Only probe claims that are load-bearing for a hint's pedagogy.

### Fallback method — live save-slot probe (web-agent)

Use this only when the harness can't reach the state (e.g. a randomized-puzzle gate that needs an in-run value, or genuinely save-dependent behavior):
1. Play to just before the questionable step.
2. Save to the dedicated probe slot via the app's named-save meta-command: type `SAVE`, name the slot **`hint-runner`** (`iftalk_customsave_<game>_hint-runner`). **Never use the quicksave slot** — it's the user's.
3. Try the skip-path; record what the game says. `RESTORE` `hint-runner`, try the next variant.
4. When done, delete the `hint-runner` slot (Manage Saves modal, or remove the localStorage key) so it doesn't linger in the user's save list.

Only probe claims that are load-bearing for a hint's pedagogy. Don't exhaustively test every walkthrough step — most are requirements and the safe phrasings from rule 11 cover them.

---

## Step 4 — Write and Validate

Write the file to `docs/games/hints/<gameName>.json` where `<gameName>` is the game filename minus extension, lowercased (matches `game-loader.js:36` normalisation).

**Schema checklist before saving:**
- [ ] `"schema": 1` at root
- [ ] `"game"` matches normalised game filename
- [ ] All `id` fields are stable kebab-case slugs
- [ ] Last hint in each `hints` array is the full answer (exact commands)
- [ ] No answer contains inventory housekeeping (`DROP` "afterwards" etc.) unless a verified progress gate (rule 7)
- [ ] No hint reveals a later puzzle's solution or names objects the player can't have seen yet
- [ ] No question names hidden things or presumes possession/progress, including `EXAMINE`-only details (Hint Philosophy rules 1–2)
- [ ] No hint asserts unverifiable game state; prerequisites gated in-ladder (rules 8–9)
- [ ] **No cross-references** to other hint entries — prerequisites are stated in-world as gates, not pointers (rules 9–10). Search the file for "see '" / "see the" / "see that" and remove any that name another entry. (Naming in-world places/provenance in answers is fine — rule 6.)
- [ ] Every section has a `locations` array (even `verified: false` — extracted from walkthrough)
- [ ] Question-level `locations` added wherever the question is room-specific
- [ ] `phase` set **only** for games that reuse geography across acts/days, and harvested from a `--status` replay (most games omit it entirely)
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
