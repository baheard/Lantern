---
name: generate-hints
description: Generate or review a UHS-style hint JSON file for a Lantern game. Triggered when the user says "generate hints for <game>", "create hints for <game>", "add hints to <game>", or "review <game>" / "review hints for <game>".
---

# generate-hints skill

Produces a `docs/games/hints/<gameName>.json` file for a game in the Lantern library following the static UHS/InvisiClues-style schema (schema version 1).

## Overview

Hint files are static JSON, **not AI-generated at runtime**. This skill is run once per game by a developer (or Claude) to author the hint data from walkthrough sources. Players then browse hints progressively in the app's Hints panel.

## Two modes

This skill has two entry points, selected by the leading argument:

- **Generate** (default) — `generate hints for <game>` / `add hints to <game>`. Author a new hint file (or fully regenerate one) from walkthrough sources. Run Steps 1–5 below.
- **Review** — `review <game>` / `review hints for <game>`. Audit an *existing* `docs/games/hints/<game>.json` against the Hint Philosophy, auto-fix clear violations, and surface judgement-call flags for the user. **Run the Review Mode section below instead of Steps 1–5.**

---

## Review Mode

Triggered by `review <game>` (the leading word is `review`). The goal: read every question and every hint rung in the existing file, hold each against the Hint Philosophy, **silently correct unambiguous violations**, and **stop to ask the user** about anything that's a judgement call.

**Prerequisites — load the same feedstock you'd draft from.** A review without the puzzle logic in hand degrades into surface grammar-checking. Before auditing:
1. Read `docs/games/hints/<game>.json` (the file under review).
2. Read `docs/games/walkthroughs/<game>.notes.md` (the *why* behind each puzzle — needed to judge whether a hint leaks the move, manufactures a goal, or invents refusal behavior). If it's missing on a non-trivial game, that's itself a finding — note it and proceed with reduced confidence.
3. Keep `docs/games/walkthroughs/<game>.cmds.txt` handy — when a review hinges on a mechanic you can't settle from the notes (a claimed requirement/refusal, an item-effect, a `DROP`), **probe it with `tools/play.cjs` per Step 3.5** rather than guessing. Reviews are exactly where rule-11/rule-7 fabrications get caught, so probe load-bearing claims instead of waving them through.

### The traffic-light triage

Classify every issue you find into one of three buckets and act accordingly:

- **🟢 Green — clear violation, unambiguous fix.** The rule is bright-line and the correction doesn't change the puzzle's meaning, only its wording. Fix it directly, no need to ask. Examples: a cross-reference to another entry (rule 10 — "see the gas question"); inventory housekeeping in an answer that the notes/probe confirm isn't a gate (rule 7); a meta/out-of-frame parenthetical (rule 15); a trailing leading question or "you'll need it later" tail that the rung above/below already covers (rule 14); a parser command (`OPEN CHEST`) appearing above the answer rung (rule 6); a missing/empty `locations` array (Step 2); a section title naming a discovery rather than a place (rule 20).
- **🟡 Yellow — likely violation, but the fix is a judgement call.** You can see the problem but correcting it risks changing meaning, dropping a rung, or depends on game state you haven't verified. Draft a proposed fix but **bring it to the user**. Examples: a question anchored to a hidden discovery vs. a visible symptom (rule 1) where the reframe also wants a ladder merge (rule 2); a category-trap hint (the stance) where the better layer is debatable; an over-crafted trivial puzzle (rule 19) vs. an intentionally padded fake (rules 16–18); a ladder that may under-resolve (rule 6) but might be intentionally terse.
- **🔴 Red — serious problem needing your call.** Spoiler leaks, a puzzle that can't be hinted gently (rule 23), a claimed refusal/requirement you couldn't verify, a question that leaks a sibling puzzle's payoff (rule 2 merge cases), or anything where you're unsure the existing hint is even *correct* about the game. Never silently "fix" these — surface them.

When in doubt between green and yellow, treat it as yellow. The cost of an unwanted auto-edit is higher than the cost of one extra question.

### Procedure

1. Walk the file **section by section, question by question, rung by rung.** For each item, run the Hint Critique Loop's step 1 ("name the flaw precisely, map it to a rule"). Most items will be clean — say so briefly rather than inventing problems (rule 19 cuts both ways: don't over-review a fine hint).
   - **Dedicated answer-rung tail scan (do this for *every* final rung — it's the most-missed flaw).** After the parser commands, is there a trailing clause — typically after an em-dash or as a final sentence — that the player can't *act* on? Reassurance ("don't worry what it's for", "you'll need it later", "it matters much later", "what it's for comes later"), inventory housekeeping (a `DROP`/"you won't need X"), or a forward-leak about how much game remains? If yes, cut it (rule 14 tail / rule 7). Keep only commands plus actionable orientation (provenance, an object's in-world purpose — rule 6). This single check would have caught Wishbringer's `fest-gather`; run it mechanically, don't trust recall of rule 14.
2. **Probe to settle anything you can't decide from reading — review is exactly where probing earns its keep.** A review without the mechanics in hand degrades into grammar-checking. Whenever a verdict (keep / cut / reword) hinges on game behavior you're not certain of — a claimed requirement or refusal (rules 7, 11), what an item actually does, whether an answer is even *correct*, or a contradiction between the hint file and the notes — **don't guess and don't wave it through: branch a `tools/play.cjs` replay per Step 3.5** (snapshot-at the puzzle's `[slug]`, vary the tail) or re-replay `--strict` to confirm an answer still wins. This is cheap, headless, and deterministic, and it is the single highest-value move in a review: fabricated refusals and stale "open puzzle" claims surface here or nowhere. A probe result (the transcript line) is quotable evidence — cite it in the report. Probe load-bearing claims; don't exhaustively re-test obviously-correct steps.
3. **Apply all 🟢 green fixes directly to the JSON.** Preserve every `id` (the ID-stability note — changing an ID resets users' reveal state).
4. **Collect 🟡 yellow and 🔴 red flags** into a single report. For each: quote the offending text, name the rule, state why it's a flag not a clean fix, and give your proposed change (with probe evidence where you ran one). Group by section so the user can scan in play order.
5. **Present the report and ask** — use `AskUserQuestion` for the handful of highest-stakes calls, and list the rest in prose for batch approval. Don't apply yellow/red changes until the user rules.
6. **Close the philosophy loop (Critique Loop step 4):** if a flag reveals a rule that's missing, fuzzy, or mis-numbered, propose the philosophy edit too — a review is the best time to harden the rules, and the flagged hint becomes the canonical example.
7. After the user rules on the flags, apply the approved changes, re-validate JSON parses (Step 4's command), and do the version bump + integration (Step 5) only if the file actually changed.

**Do not regenerate from scratch in review mode.** The existing file carries published IDs and prior authoring judgement; review *edits* it surgically. Only fall back to generation if the file is absent or so far off-philosophy that a rewrite is genuinely warranted — and confirm that with the user first.

---

## Hint Philosophy (read before drafting)

Distilled from study of real Invisiclues booklets (Zork I, Trinity, Spellbreaker, The Witness, Stationfall), UHS files and authoring guidance, and IF hint-design literature (Emily Short, intfiction.org, The Digital Antiquarian). The core problem: **the question list is itself a spoiler surface.** A browsing player learns what puzzles exist, what objects matter, and how much game remains. Every rule below defends against that, or makes the hint ladder respect the player's actual knowledge state.

### The stance (read this first — it generates every rule below)

Writing hints fights a model's strongest instinct: **be clear, complete, and unambiguous.** That instinct is right almost everywhere else and wrong here, because being maximally clear *collapses the player's uncertainty straight onto the answer* — which is the one thing a hint must not do. If you write hints the way you'd explain anything else, you will produce walkthroughs. Every rule in this document is a consequence of resisting that pull; hold the stance and you rarely need to consult the rules.

**The stance: a hint changes the player's *option space*, never their *answer*.** A good hint does one of exactly two things:
- **Widens** — opens a space the player hadn't considered ("not every gap is crossed on foot" → now they think about *crossing*, not *walking*).
- **Narrows** — rules out a wrong approach ("you can't fight a shadow") so the player stops wasting the space they're in.

Neither names the move. After reading a non-final hint the player should have **more ideas worth trying, or fewer dead ends** — never *the action*. If they can act with no thought left, you answered instead of hinted.

**The one test that catches both failure modes.** Every hint fails in one of two directions — it **gives away too much** (collapses the player onto the move) or it's **useless** (changes nothing in their head). Both are caught by a single question asked of every rung: *name the one belief this rung changes.*
- Can't name a belief it changes — or the rung above already changed it? The rung is **filler**. Cut it.
- Is the belief it installs the *answer's* belief ("I should pull the lining") rather than one step back ("the back of the cupboard isn't solid")? The rung **gives away too much**. Demote it a layer.

A good rung names exactly one belief, one step back from the move. The "fine balance" between too-much and useless is not a feel you have to eyeball — it is this: **one nameable belief per rung, no more (that's a spoiler) and no fewer (that's filler).** Before drafting any rung, say the belief out loud; if you can't, or it's the answer's, you already know what's wrong.

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
   - **Discovery layer vs execution layer — and the question-split.** A stuck player is blocked at one of two layers: they don't know *a thing exists or matters* (discovery), or they have the thing and don't know *what to do with it* (execution). A question for a discovery puzzle must therefore **not name the discovery** — making it must be the player's first rung, not the question's gift. **Worked example (Anchorhead's cupboard):** "The dining room cupboard seems to have something behind it. What's there?" hands over the whole discovery (that the cupboard hides something) before the player reveals a single hint, leaving only "pull the lining" — and the player has *no visible symptom* pointing at that cupboard at all; the real symptom is needing the library safe's combination. **The split test:** when a question presupposes a chain the player hasn't earned ("there *is* a cupboard puzzle" *and* "something's behind it"), split it back to the one symptom the player actually feels and let the rest become rungs — and if the thing has no symptom of its own because it only serves another puzzle, it gets no question at all (rule 2, *a prerequisite is not a puzzle*).
   - **Directing attention is not the puzzle — say it plainly; spend craft on the real step.** When the only obstacle is *thinking to look*, the early rung should bluntly point the player at the thing ("Take a closer look at the hooks.") rather than dress the act of looking up as a riddle. Finding the clue is the clue; the puzzle is what you *do* with it. Reserve Socratic framing and property-nudges (rule 5, rule 14) for that real step — here, "One of them is clean. Has it been used recently?" earns the craft; "examine the fittings on the walls" wastes it on the trivial act of looking. (Pairs with rule 19: match the hint's register to where the difficulty actually is.)
2. **Don't presume possession or progress in the question.** "I have three pearls — where's the green one?" leaks that pearls are collectible, that there are four, and one is green. Anchor to a single observable instead: "What's this strange eye-like pearl for?" State-scoping belongs in section order and in-ladder gates, not question text. **Worked example (the corpse, Theatre):** Bad — "I found a corpse under the carpet. Ew. Now what?" This both presumes progress ("I found") *and* names a discovery — and it sat directly below the question whose whole payoff was uncovering that corpse ("MOVE CARPET ROLLS… something unpleasant is revealed underneath"), so a browser read the answer to the puzzle above before earning it. Fix: don't give the discovery its own question at all — fold it into the discovering puzzle's ladder as a mid-rung reveal ("don't hurry past what they were lying on top of" → "search what's underneath" → answer). When a "now what do I do with X?" question would name something a sibling puzzle is supposed to reveal, the answer is almost always *merge*, not *reword*.
   - **A prerequisite is not a puzzle — give it no entry of its own.** The proactive form of the merge: before writing any question, ask *does the player feel this as a goal on its own, or does it only matter as a step toward another puzzle's goal?* A discovery or sub-step that exists only to serve another puzzle — the journal behind the cupboard exists only to open the safe — is a **rung in that puzzle's ladder, not a question.** The player never independently wants "how do I get behind the cupboard"; they want "how do I open the safe." So anchor the entry to the goal the player actually holds and fold the prerequisite in as a gated mid-rung (rule 9). **The tell:** two entries that point at each other (the cupboard's answer names the safe, the safe's hint names the cupboard) are one puzzle that's been split into two leaking halves — collapse them into the entry whose goal the player feels.
3. **Use the established wording taxonomy** — each form signals a puzzle type:
   - `How do I [goal]?` — only when the obstacle is already visible to the player. **Premise test:** if the question's own first hint has to *correct* its premise (e.g. the question asks "how do I reach the chandelier?" and hint 1 says "you don't reach it — you bring it to you"), the goal wasn't really visible — the question manufactured it and leaks that the object is a puzzle. Demote to `Is X significant?`.
   - `What do I do with X? / What is X for?` — object in hand, purpose unknown. This is also the red-herring slot (see below).
   - `Is X useful / significant?` — ambiguous objects; the answer is allowed to be "no".
   - `Where can I find X?` — only for objects the player *knows* they need (game told them).
   - First-person distress: `"A thug with a knife is blocking the street!"` — deaths, timers, fail-states; players search by symptom.
   - `What do I do about X?` — recurring hazards.
   - `What am I supposed to be doing here?` / `I'm not sure what I should be working toward — what now?` — **disorientation about purpose or direction**, not a single visible obstacle (see rule 24). Distinct from `How do I [goal]?`, which presumes the obstacle is already in view.
   - **Prefer the bare symptom; make the "?" earn its place.** The question is a *subject line* the player scans to recognize their problem — they're already in the panel seeking help, so a declarative symptom that flags the problem and stops is usually the strongest form: "The librarian won't help me." beats "The librarian won't help me. What do I need?" A generic interrogative tail (`Now what?`, `What do I need?`, `What do I do?`, `What's there?`) adds no recognition value *and* often pre-shapes the solution before the first rung — "what do I *need*?" pre-decides it's a missing item, "*where* is it?" pre-decides a location-find. That is leading (rule 5) and over-delivery (rule 14) at the question tier. Keep the question mark only where the interrogative itself carries information a statement can't: `Is X significant?` / `Is there more to it?` (it signals the answer may be "no"), or quoting the game's framing of a mystery object (`What's this cube I found?`, rule 4). First-person distress is naturally declarative already — leave it so.
4. **Quote the game's own words** when naming mysterious things ("What's this cube I found?" works because the game itself calls it a featureless cube).

### Hint ladder craft

5. **Typically 3–5 levels (fewer for a trivial puzzle — rule 19): confirm/redirect → point attention → mechanism → exact commands.** A good level-1 hint does one of: confirms the puzzle is real, names a relevant property ("It's a vampire bat"), rules out the likely wrong theory ("Fighting isn't always the answer"), asks a genuinely *opening* question, or quotes the game's own failure text.
   **The Socratic test.** Question-form hints preserve player agency and belong at early levels — but *only when the question opens up the player's thinking*: it reframes the problem or challenges an assumption ("Have you checked all sides?", "You're sure fighting is the only option?"). A question that *presupposes the answer's framing and points the player straight at it* is not Socratic — it's the next step softened into a question, i.e. leading. The test for any question hint: **does it widen the search space, or hand over the move dressed as inquiry?** "Where might you have seen a pattern worth capturing?" fails — it has already decided the answer involves a pattern-bearing place and is just nudging the player at it. Reframe to open thinking, or cut it (see rule 14). Contrast a rung-1 hint that passes: "Not every gap is crossed on foot." — it confirms the puzzle, rules out the wrong approach (walking), and widens the search space, all without naming the solution.
   **The counterintuitive-mechanism trap.** The puzzles where you most want to share the mechanism early — a shadow you can walk on, a machine you ride, an object that works backwards — are exactly the ones where rung 1's job matters most. The mechanism feels like a generous clue precisely because it's surprising, so the temptation is to front-load it. Resist: the more counterintuitive the solution, the more precious the player's discovery. Rung 1: rule out the obvious wrong approach ("you won't leap it"). Rung 2 at earliest: name the unexpected medium ("a shadow, with a strong enough light behind it, can bear weight in this house"). Bad rung 1 — "You won't leap it — but you can build a bridge out of something unexpected: a shadow. And a shadow needs a strong light, and something to cast it." Good rung 1 — "You won't leap it, and climbing is no better. But a bridge of some kind might be possible — just not a conventional one."
6. **The final hint is non-negotiable: complete, literal, exact commands.** A ladder that never fully resolves is the cardinal failure. The sum of all final hints should constitute a minimal walkthrough of every progress gate. **Conversely, *only* the final hint uses literal parser commands.** Every rung above it directs the mind in prose — "open the chest", "look in the coal bin", "follow the crow" — never a capitalised command like `OPEN CHEST`. A parser command appearing above the answer rung is a solution that has leaked up the ladder: demote it to a nudge. Middle rungs name an action in plain language at most; they never spell the keystrokes.
   - **The answer rung may — and usually should — name in-world places, objects, and provenance:** "UNLOCK DOOR WITH SHINY KEY (from the Boiler Room)", "Go down to the lobby and PUT LENS IN SPOTLIGHT." That is *orientation*, the opposite of a spoiler at this tier, and it's exactly where the player wants it. It is **not** a cross-reference: rule 10 bans pointers to other hint *entries*, not mentions of the game world. Don't strip provenance out of an answer for fear of rule 10 — name the room, the item, and where it came from freely.
7. **Answers contain only progress-advancing commands — never inventory housekeeping.** Don't tell the player to `DROP` something "afterwards", `DROP` a now-useless item, or otherwise tidy their inventory. Lantern games almost never require dropping things (there's no weight/inventory limit in play), so a drop instruction reads as a required step when it isn't — and rule 11 forbids implying requirements you haven't verified. **A walkthrough listing a `DROP` does not make it load-bearing.** Walkthroughs record a successful sequence, not a set of requirements, and authors drop things out of pure habit — verified: Theatre's walkthrough lists `DROP CAMERA` and `DROP KEY`, neither of which the game requires. So "the walkthrough says to drop it" is *not* the test. Include a drop **only** when it's genuinely a progress gate (e.g. a ceremony that fails unless you're empty-handed) *and* you've confirmed the requirement — from walkthrough text that states the requirement itself, or by probing (Step 3.5). Default: cut every drop, and cut any "you can drop X / you won't need X anymore" reassurance with it.
8. **Never assert game state the player may not have.** No "you're carrying something made for catching light" — the player may not have the lens. Use conditionals ("Have you found anything made for catching light? If not, explore the attic first") or gates (below).
9. **Gate prerequisites inside the ladder, Invisiclues-style:** an explicit early hint reading "Don't go on unless you've explored the attic" or "You can't solve this yet — you'll know when the time comes." A player lacking the prerequisite stops there unspoiled.
10. **Don't cross-reference other questions or sections.** This bans pointers to other hint *entries* ("see 'A shadow creature keeps driving me back'") — **not** mentions of in-world places or objects, which are fine at any tier and expected in the answer (rule 6). Naming another entry treats the file as hypertext, goes stale the moment a title changes, and clutters the hint; the panel is browsable by location, so a player finds related puzzles by exploring — exactly as they explore the game. When a puzzle depends on another being solved first, state that prerequisite *in-world* as a gate (rule 9) — "lower the chandelier first", "you'll need something that flashes" — never as a pointer to the entry that covers it. The gate both protects against spoilers and tells the player what to pursue. (And a hint must still never spoil a different puzzle's solution.)
   - **The master-mechanic-overview trap (teach the pattern abstractly).** When a game has a master mechanic, you'll often write one *overview* question for it ("How am I meant to use all these bells?"). The instinct is to teach the pattern by example — but the obvious examples *are* the solutions to sibling puzzles, so the overview hands them over to anyone who opens it. **Worked example (Bronze's bell system):** hint 3 read "figure out whose instrument it is, then ring it in the matching room. *The cook's bell feeds you in the kitchen; the lamplighter's bell brings light to a darkened room.*" — those two instances are exactly the `dying-beast` and `need-light` answers. Fix: teach the loop with zero real instances — "read its stamp, LOOK UP the trade, and ring it in the room where that servant once worked — never anywhere else." The pattern transfers; the puzzles stay unsolved. Reserve each concrete bell→room→effect mapping for the answer rung of the puzzle that owns it.
11. **Don't invent failure behavior.** Walkthrough steps are usually requirements — treat them as needed and present them confidently. But a walkthrough records the successful sequence, not what happens when you skip a step. So never *describe the game's refusal* ("it won't budge until...", "the door stays locked unless...") unless the walkthrough states it or you observed it in-game — that's where fabrication creeps in (verified example: Theatre's piano pushes fine without ever being played, though the walkthrough plays it first). Safe phrasings that don't depend on unverified mechanics: "You'll need to...", "Do X first", "Don't leave without doing X." If a hint's pedagogy *hinges* on the refusal behavior, verify it live or rewrite the hint.
12. **Order-independence (official UHS principle):** every ladder must make sense no matter what the reader has or hasn't read. Never assume they saw an earlier section.
13. **Tone discipline:** jokes live at level 1 and at the end of fake/red-herring ladders; the middle of a real ladder is always played straight.
14. **One increment per rung, then stop — say less.** Each rung delivers exactly one new thing and ends. Four ways writers over-deliver, all to be cut:
   - **Trailing leading question.** "…it must carry a pattern first. Where might you have seen a pattern worth capturing?" The concept statement *is* the hint; the tacked-on question just spoon-feeds the next move. Drop it. (This is narrower than rule 5's Socratic hints: a genuinely *opening* question is fine — "Have you checked all sides?" — but a question that presupposes the answer's framing and points at it is just leading dressed as inquiry.)
   - **The "— perhaps in X?" aside.** Bolting the next rung's reveal onto an early hint as a casual aside hands it over for free. If hint 2's job is "the lens must carry a pattern," it ends there; *where* the pattern lives is hint 3's job. **The rung-1 mechanism leak (worked example, Wishbringer `fest-poodle`, caught by a player 👎 "a little too obvious"):** rung 1 read "It's a *hungry* little thing, not a guard. You don't need to fight or flee it." Rung 1's only job here is to rule out the wrong theory (fight/flee) — but "hungry" smuggles in the *feed-it* mechanism that is hint 2's reveal ("Have you found anything edible?"). The player solves it on rung 1 and the ladder collapses. Fix: rung 1 rules out fight/flee and nothing more ("It's not a guard you have to beat — neither fighting it nor forcing your way past will get you anywhere."); the hunger/feeding cue waits for hint 2. The tell: an adjective or clause in rung 1 that *characterizes the solution* ("hungry", "fragile", "thirsty") rather than the obstacle is the next rung leaking up.
   - **Piled-on cross-refs and directions.** "The machinery is in the attic — you'll need a way up there first (see the piano question). From the attic's southern end, head north and look for a mechanism." Three rungs' worth in one. The hint is "The machinery is in the attic." — full stop. Exact directions belong in the answer; the prerequisite belongs in its own gate if it needs one at all.
   - **The "you'll need it later" reassurance tail.** "GET PEARL — keep it, it matters much later." / "…and wake with a star crystal. You will absolutely need it." / "What it's for comes later." / "Collect the UMBRELLA, the HORSESHOE, the GOLD COIN, and the BONE — don't worry about what each is for yet, just don't leave town without them." (the last is real — Wishbringer's `fest-gather` answer, caught by a player 👎; the whole clause after the commands carries nothing actionable and quietly signals "these pay off later"). Telling the player to take or do something *already implies it matters* — the reassurance carries nothing they can act on, and a string of "…later" tails quietly leaks how much game remains. This is the most common padding on the answer rung specifically (the place that's supposed to be tightest — just the commands). Cut it. **Distinguish from naming an object's purpose** — "the ticket is your admission to the show", "that shiny key unlocks a door deep underground" — which is orientation the player can act on, not padding; keep (or lightly trim) those.
   Point early hints at the concept or category, never the specific object/room. When a hint feels complete, look for the clause after the em-dash or the trailing sentence — that's usually the over-delivery; cut it.
   **The over-delivery test (every non-answer rung).** After drafting a rung, ask: *can the player read this and still have something to work out?* If no, it has answered instead of hinted — demote it a layer. The answer rung is the only one exempt; its job is to leave nothing.
   **When unsure, reveal less.** On every rung *except the answer*, if you genuinely can't decide whether it gives too much, give less. A player who needs more taps the next rung — that costs a tap. A player who got too much cannot un-read it — that costs the puzzle. Erring one increment too *shallow* is cheap and self-correcting; erring one too *deep* is silent and fatal. The library has no record of a hint being too gentle; the 👎 always lands on too-much-too-soon.
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
24. **Give the disoriented player a compass, not just puzzle help.** Players get stuck two ways, and only one is a puzzle. They either **know the goal but can't find the path** (Wishbringer Act I: "I must deliver this package — but where *is* the shop?", a ~15-move winding cliff climb) or **don't know the goal at all** (Anchorhead Day 2: wandering, unsure what the act even wants of them). Standard questions — anchored to a single visible obstacle (rule 1) — serve neither: there's no one obstacle, the player is lost about *direction*. So **every act/section where a player can plausibly be disoriented about purpose gets an orientation question** in the `What am I supposed to be doing here?` form (rule 3). Its ladder is scoped **strictly to the current act** — never a plot synopsis, which would leak how much game remains (rule 18):
   - **Rung 1 — reassure + reframe.** You're not missing an item, you're missing a direction; no puzzle is blocking you yet. Name the *kind* of thing this act is about ("you're a clerk; your whole job right now is a delivery").
   - **Middle rungs — narrow gradually.** Point at the objective and where to attend, leading the player there step by step (for a navigational stuck-point: direction first — "it's west, out of the village, up on the cliffs, not in town" — then the route shape — "follow the winding cliffside path up"). Each rung adds one increment (rule 14).
   - **Answer — state the immediate goal plainly, and give the route** when the pain is navigational. The answer rung may name rooms and exits freely (rule 6); end by orienting forward without specifics ("everything else flows from making this delivery"), never by enumerating later acts.
   This often *is* the game's opening question (an enriched "where does this go?" doubles as the Act I compass — don't add a redundant second entry), and recurs at each act boundary where geography or goal resets. An act whose objective is already obvious from its puzzles doesn't need one — add it only where a real player would wander.

---

## Hint Critique Loop (self-improvement)

This skill is meant to *improve as it's used*. When the user points at a specific hint they don't like — during generation or review — don't just patch that one line. Run it through this loop, because a single bad hint is usually evidence of a principle that's missing, fuzzy, or being misapplied.

For each flagged hint:

1. **Name the flaw precisely.** Quote the hint and say what's wrong in one sentence. Map it to a principle where one exists: too leading (rules 5, 14), filler / over-delivery (rule 14), presumes game state (rule 8), presumes possession/progress (rule 2), cross-references another entry (rule 10), meta/out-of-frame (rule 15), spoils another puzzle (rule 10), names a hidden thing in the question — including an `EXAMINE`-only detail (rule 1), invents refusal behavior (rule 11), inventory housekeeping in the answer (rule 7), over-crafted trivial puzzle / craft on the wrong rung (rules 19, 1), under-resolved answer (rule 6), no compass for an act where the player is lost about purpose/direction (rule 24). If it maps to no existing rule, that's the signal a rule is missing.
2. **Decide: reframe or cut.** A hint earns its place only if it advances exactly one rung. If the rung above and below already cover its job, cut it (and let the ladder be shorter — rule 18 only cares that lengths don't *leak importance*, not that every ladder is long). Otherwise reframe.
3. **Reframe respecting ladder position.** Re-derive what *this* rung is allowed to reveal — no more than one increment past the rung above, no spoiling the rung below or any other puzzle. Write the leanest line that does that job.
4. **Close the loop on the philosophy.** Ask explicitly: *does this teach us something the rules don't yet capture, or capture sharply enough?* If yes, propose the edit to the Hint Philosophy (new rule, sharpened wording, or a worked Bad→Good example) and apply it once the user agrees. The flagged hint becomes the canonical example in that rule. This is how the philosophy gets better instead of the same mistakes recurring per-game. **When you add or insert a rule, renumber sequentially (no lettered suffixes) and update every cross-reference — the tiers table, this flaw-map, and the Step 2/3.5/4 references all cite rules by number.**

The bar throughout: **gentle nudges, no filler, not too obvious.** A first hint should make the player *think*, not act; the answer rung is the only place that hands over moves.

---

## Step 1 — Get a verified walkthrough (delegate to `trace-walkthrough`)

Don't research or build the command list here — that's the `trace-walkthrough` skill's job, and its artifacts are reusable beyond hints. Check whether they already exist:

- `docs/games/walkthroughs/<gameName>.txt` — raw authoritative walkthrough (with source header)
- `docs/games/walkthroughs/<gameName>.cmds.txt` — a `--strict`-clean command list verified against our exact build
- `docs/games/walkthroughs/<gameName>.notes.md` **— REQUIRED for any non-trivial game**. `trace-walkthrough`'s **puzzle-logic analysis**: the game's core mechanic(s), the *why* behind non-obvious orderings, build-specific divergences, timing/patrol mechanics, red herrings, and per-run-random gates. **This is the primary feedstock for hint *content*** — it distils the method (not the commands) that your ladders must teach. You read this *first* when drafting (Step 2).

**Gate: do not proceed to Step 2 without the notes on a non-trivial game.** If `notes.md` is absent (or thin) and the game has more than a couple of real puzzles, **produce it before drafting** — either invoke `trace-walkthrough` to write it (per its Step 5), or write it yourself from one `--status` replay (that single pass also serves Step 3's location harvest — dump the transcript once and mine it). Drafting hints straight off the command list means inferring puzzle logic ad hoc, which is exactly what the notes exist to prevent. Only a genuinely trivial game (no real puzzles) is exempt. **A clean first-try `--strict` replay does NOT make a game trivial** — it only means the commands are right; the puzzles can still be deeply non-obvious (Bronze was the canonical miss: cmds replayed clean, no notes were written, and the game is one of the most mechanic-dense in the library).

If `<gameName>.cmds.txt` is missing (or doesn't pass `node tools/play.cjs <gameName> --strict --file docs/games/walkthroughs/<gameName>.cmds.txt`), **invoke the `trace-walkthrough` skill** for this game and let it produce all three files (`.txt`, `.cmds.txt`, and — for non-trivial games — `.notes.md`). It also confirms our release/serial matches the walkthrough's version and returns the source URLs + any residual unverified gates (e.g. randomized puzzles).

Carry forward from `trace-walkthrough`'s report into your `meta.sources` array — every source URL, each with a `"file"` key pointing to the local walkthrough copy:
```json
{
  "name": "Dorothy Millard walkthrough (CASA)",
  "url": "https://solutionarchive.com/file/id%2C8345/",
  "file": "docs/games/walkthroughs/theatre.txt"
}
```

From here on, treat `<gameName>.cmds.txt` as the trusted, build-verified command list — Step 3 consumes it rather than re-deriving commands.

---

## Step 2 — Draft Hint Sections

**Draft from `<gameName>.notes.md` first, the raw walkthrough second.** The notes already capture the *method* and the *why* (which is what a hint teaches); the raw `.txt`/`.cmds.txt` are command sequences (which a hint must not leak). For each puzzle the notes flag — a non-obvious ordering, a prerequisite the walkthrough omitted, a per-run-random gate, a build divergence — there's usually a hint ladder to write, and the notes tell you what the *real* obstacle is. (A randomized gate, e.g. Anchorhead's safe, becomes a "read the journal, dial that number" ladder — never the seeded value.)

Structure the JSON as one section per act or area of the game, in progression order.

**Section rules:**
- `id`: stable slug (kebab-case), never change once published — it keys persisted reveal state.
- `title`: human-readable act/area name (e.g. `"Act I — The Pager"`).
- `verified`: `true` only if every `locations` name was confirmed from the app's own journey log during a live playthrough (Step 3). All other sections: `verified: false`.
- `locations` (section-level): **always populate this**, even for `verified: false` sections. Extract the room names the player visits **while working on this section's puzzles** — *not* every room they traverse. A room the player only passes through on the way somewhere else (no puzzle there for this section) should be listed under the section whose puzzle actually happens there, not this one. This matters most for games with **recurring geography** (see `phase`/milestones below): the tighter each section's `locations`, the less a later act's section gets un-blurred early by a shared room. Title-case the walkthrough's parenthetical room descriptions (e.g. `"(music room)"` → `"Music Room"`). A wrong name simply won't match and shows no pin — that is no worse than omitting it. An absent array guarantees the pin never works for that section.
- `phase` (section-level, **optional**): a scoping string matched (case-insensitive substring) against the game's current **status-bar context** — the right-aligned region the location parser discards (e.g. `"day two"`, `"Chapter 3"`). A section badges only if its location matches **and** the current phase contains this string. **Omit it for almost every game** — location-only is the default and is correct for linear games and any game with unique geography per act (e.g. Theatre shipped entirely phase-less). Add `phase` *only* when a game **reuses the same rooms across acts/days** and the status bar **names the act** (the canonical case: Anchorhead's 5 days over one town map → `"day two"`). Harvest the exact string from a harness replay: `node tools/play.cjs <game> --status` prints `[@ Room  |  phase: <context>]` per turn — copy the discriminating part (`day two`, not `day two, evening`, so it also matches the evening sub-phase). If the game prints nothing in the right-aligned region (`phase:` is blank), **or the context is a clock/compass (junk that can't name an act)**, this dimension isn't available — use milestones (below) or fall back to location-only. Questions inherit their section's `phase`; a question may set its own to override.
- `afterMilestone` / `untilMilestone` (section-level, **optional**): act-window scoping for games that **reuse rooms across acts but whose status bar can't name the act** (e.g. a clock — Wishbringer's `Time: 6:01 PM`). Where `phase` reads the *volatile* status bar, milestones track *act progress*: a milestone fires as the player crosses an act boundary and the current act index is remembered (persisted per-game, and saved/restored with each save slot, so loading any slot restores the right act). A section declares the window it's live in — `afterMilestone: "X"` (active once act X reached), `untilMilestone: "Y"` (active only before act Y), or both for `[X, Y)`. Omitting both = always-active (the default; Theatre/Anchorhead are untouched).
  - **Declare the ordered milestone list** at the file root. Order is the progression; **index 0 is the first/start act**. Each entry has an `id` and one or more *triggers*:
    ```json
    "milestones": [
      { "id": "festeron",  "start": true, "textMatch": "Festeron", "enterLocations": ["Post Office"] },
      { "id": "witchville", "textMatch": "Witchville", "enterLocations": ["Fog", "Underground"] },
      { "id": "tower",  "enterLocations": ["Vestibule", "Torture Chamber"] },
      { "id": "endgame", "textMatch": "hellhound", "enterLocations": ["Circulation Desk", "Museum"] }
    ]
    ```
  - **Triggers fire any-of** — a milestone fires when the current room is one of its `enterLocations` **or** the current turn's output text contains its `textMatch` signature:
    - `enterLocations` — **act-exclusive room names** (must appear in only one act). Harvest from the Step 3 `--status` replay (Wishbringer: `Fog`/`Underground` are Witchville-only; `Vestibule`/`Torture Chamber` Tower-only; `Circulation Desk`/`Museum` endgame-only). List several so the latch is robust to which the player hits first.
    - `textMatch` — a **prose signature** the player actually reads. This is the robust trigger: it recovers the discriminator the status-bar location parser *discards* (room prose says "the **Witchville** Cemetery"; the status bar says only "Outside Cemetery"). It also fires regardless of path and even when an act transition happens *in place* (no new room). A `textMatch` need **not** be act-exclusive — a recurring word like "Witchville" only raises the floor (forward-only latch), so a later act mentioning it can't pull the player back. Confirm the signature is absent from *earlier* acts (grep the transcript) so it doesn't fire too soon.
  - **The `start: true` milestone is the reset anchor.** When *its* trigger fires the act is forced back to index 0 — this is how an in-game `RESTART` self-heals with no VM event to hook: returning to the start act (its room, or its prose like "Festeron") resets. Anchor it to an **act-exclusive** start signal (Wishbringer: `Post Office`, entered turn ~1; and the prose "Festeron", which only appears pre-transformation). The boot room itself is a poor anchor if it recurs across acts (Wishbringer boots at `Hilltop`, which recurs) — prefer the first act-exclusive room/prose instead; a 1–2 turn cosmetic badge lag after RESTART is acceptable (badges never reveal hint text).
  - **Then scope each section**: the start act's sections get `untilMilestone: "<next>"`; each later act gets `afterMilestone: "<its boundary>"` (plus `untilMilestone` if a still-later act reuses its rooms). A boundary milestone (e.g. `endgame`) whose first puzzle sits in a *shared* room should carry a `textMatch` that fires there (Wishbringer's hellhound is at the shared `Outside Cottage` — `textMatch: "hellhound"` fires before the act-exclusive library rooms are entered). This is what lets one shared room (Wishbringer's `Outside Cottage`) badge the *Festeron poodle* section before `witchville` and the *endgame hellhound* section after `tower`.
  - **Known limitation (document, don't fight):** the latch is sticky and per-game, so if a player `RESTART`s and replays act 1, the pin still reflects the furthest act reached. Because badges never reveal hint text (every rung is a manual tap), the worst case is a misplaced pin during a replay — never a spoiler. A different game loads clean (separate localStorage key).

**Question rules:**
- `id`: stable slug. Preserve existing IDs on regeneration.
- `q`: phrased per the Hint Philosophy wording rules — anchored to the visible symptom, presuming no possession/progress, using the established wording taxonomy.
- `locations` (question-level): add this whenever a question is specific to one or two rooms within its section. Trace the walkthrough to identify exactly where the player would be when they'd need that hint, and use only those rooms. **This now GATES the question, not just pins it** — a question with `locations` stays locked (spoiler-safe placeholder, no title shown) until the player has visited a matching room, then latches unlocked. Three authoring consequences:
  - **Spoiler-y titles are fine *if* location-gated.** A title that leaks a beat ("I'm locked in the study and Michael has vanished!") is acceptable precisely because it stays hidden until the player reaches that room. Lean into this rather than blanding the title.
  - **"How do I get into/past X" questions must list the APPROACH room** — the place the player stands while *blocked*, not the room beyond the obstacle. E.g. the church-entry question lists `Churchyard` (outside), not just the interior. Gating such a question only to the room past the obstacle is an un-winnable catch-22 (can't enter without the hint, can't see the hint until you've entered). This is a 🟢 green-fix violation in review.
  - **Cross-cutting / meta questions must stay location-LESS** so they're always available once their section opens. Anything the player needs preemptively or game-wide — survival mechanics ("my light keeps going out in dark passages"), score/meta ("can I get a perfect score?") — must omit `locations`; gating them to one room would hide them exactly when needed. These belong in a location-less "General Questions" section.
- `hints`: typically 3–5 strings (fewer for a trivial puzzle — rule 19), escalating from think → look → exact commands.
  - First hint: make the player *think*, not act — rule out a wrong theory, name a relevant property, or ask a genuinely opening question. Precise about the framing, not vague (see the stance).
  - Middle hints: point attention, then name the mechanism — what to look for / where to go.
  - Last hint: exact commands (labeled "Answer" in the UI). **Always the last entry.** May freely name in-world places and provenance (rule 6).
- **Spoiler discipline**: a hint must never name objects, rooms, or characters the player cannot have encountered yet at that puzzle's point in the game. Gate prerequisites in-world inside the ladder. **No cross-references** to other hint entries (rule 10) — state prerequisites as in-world gates, not pointers. See Hint Philosophy.

---

## Step 3 — Verify Locations by Playing

This step is what distinguishes `verified: true` from `verified: false` sections. Do not skip it for the opening section.

### Primary method — harvest from the verified command list (`tools/play.cjs`)

Step 1 (via `trace-walkthrough`) already produced a `--strict`-clean `docs/games/walkthroughs/<gameName>.cmds.txt`. Here you just **replay it for its location/phase output** — the harness derives location names with the app's own `getCurrentLocation()`, so they're byte-identical to what the auto-mapper records (no browser, no web-agent cost). (Design + gotchas: `.tome/headless-replay-harness.md`.)

**One pass, three jobs.** A single `--status` replay simultaneously (a) re-verifies `--strict`, (b) emits the per-turn locations you harvest here, and (c) gives you the full transcript to mine for puzzle mechanics if you're writing/checking `notes.md` (Step 1 gate). Dump it once to a file (`node tools/play.cjs <gameName> --status --seed 1 --file …cmds.txt > <tmp>`) and read all three out of that one artifact rather than replaying per concern. Delete the temp dump when done.

1. Replay the verified cmds and read the per-turn locations (and phase, if the game has one). **Use the same `--seed` the cmds file was verified with** (noted at the top of the `.cmds.txt`; default `--seed 1`) — otherwise a randomized gate (e.g. Anchorhead's safe) won't open and the replay wedges:
   ```bash
   node tools/play.cjs <gameName> --status --seed 1 --file docs/games/walkthroughs/<gameName>.cmds.txt
   ```
   Each turn prints `[@ <location>  |  phase: <context>]` — `<location>` is exactly what the auto-mapper's journey would contain. `--quiet` shows only the final turn; `--raw` keeps blank lines.
2. The authoritative room list for a section is the set of distinct `[@ …]` names observed while replaying that section's commands. Copy them **byte-for-byte** into `locations` (mind British spellings, "the"/lowercase, two-word forms). The cmds file is **slug-anchored** (`trace-walkthrough` Step 3): each `## [slug] label` marker bounds one puzzle and maps to the same `[slug]` heading in `<gameName>.notes.md`. Use those markers to know which turns belong to which puzzle, and reuse the slugs as a natural backbone for question grouping. Confirm the map is intact before drafting: `node tools/_check_walkthrough_map.cjs <gameName>` (every cmds slug must pair with a notes slug — a dead-end means the feedstock is incomplete).
3. If the game uses `phase` scoping (Step 2), read the `phase:` value at each section's turns and set the section's `phase` to the discriminating prefix (e.g. `day two`). Skip for games whose `phase:` is blank or junk (compass/clock).
4. Mark sections whose locations you confirmed from a clean replay `verified: true`. Only sections past a genuine residual gate `trace-walkthrough` flagged (something needing char input the static replay can't drive) stay `verified: false`. Randomized puzzles are **not** such a gate — the seed makes them replayable.

**State-suffixed rooms — list every state, not just the one the replay shows.** `getCurrentLocation()` *keeps* the transient suffixes the status bar carries — `; Night`, `(on the chair)`, `(on the settee)`, `(on the glass platform)`, `(in the earthenware tub)` — and section matching is **exact** (`currentLoc === loc.trim().toLowerCase()`). The *same* room routinely appears both with and without a suffix at different turns: a catwalk by day **and** as `Catwalk, South; Night`; a chair room standing **and** as `Curtained Room (on the chair)`. A puzzle's replay only captures whichever state(s) happened during *those* commands (e.g. the black-mask catwalk is always `; Night`), but a player revisiting in the other state won't badge unless you list it. So when a room can be entered in more than one state, add **both** the base name and each suffixed variant. Which suffixes survive the parser: a comma + **lowercase** word is stripped as status text (`Room, day one` → `Room`), but a comma + **Capitalised** word is kept (`Catwalk, South`, `Cell, Possibly`, `Curving Hall, South End`) — so compass/proper-noun suffixes stay and must be matched verbatim.

(If a command in the cmds file turns out to be wrong/incomplete while harvesting, that's build drift that slipped past Step 1 — fix it in `<gameName>.cmds.txt` and re-run `--strict` so the artifact stays trustworthy for the next consumer.)

**Harness caveats (don't be surprised):**
- Each typed command appears twice in output (Glk line-echo + the CLI's `> cmd` header). Harmless.
- In-game `SAVE`/`RESTORE` are stubbed off — probe mechanics with replay-with-a-different-tail (Step 3.5) instead.

### Fallback method — live browser (web-agent)

Use the real app only for things the harness can't observe: actual in-app **save-slot** behavior, UI/narration/highlighting, map rendering, or a game whose intro the harness can't get past. Then:
1. `npm start` (from `E:\Project\Lantern`), app at `http://localhost:3002`; load the game via the web-agent skill.
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

When the prefix is long and you'll probe several tails, snapshot it once and branch from the snapshot instead of re-replaying the whole prefix each time. Jump straight to the puzzle by its **slug anchor** — no hand-built prefix file: `node tools/play.cjs <game> --seed 1 --file docs/games/walkthroughs/<game>.cmds.txt --snapshot-at "## [slug]" --snapshot-out snap.json --quiet`, then `node tools/play.cjs <game> --seed 1 --snapshot-in snap.json -- "<tail>"` per variant (same `--seed` + game file). The `[slug]` is the one from the notes section you're working — `--snapshot-at` lands the VM right before that puzzle's commands. See `.tome/headless-replay-harness.md`.

### When the mechanic is an item's effect — probe every possession state, then audit for a missing entry

If the claim is about what an *item* does (not a skipped step), branch the tail across **all** the states a player could actually be in — **worn / carried-but-unworn / never-acquired** — not just have-it vs skip-it. Games respond differently to each, and the differences decide both the hint's wording and whether a hint is even *missing*. Worked example (Theatre's amulet, verified via three replays):
- **worn** → you pass the archway into the Witch's Lair;
- **carried, unworn** → "pushed gently backwards… the amulet gently glows" — the game points at the item;
- **never acquired** → "thrown roughly backwards, as if by magic" — *no pointer at all*.

Three lessons fell out: (1) the real mechanic was far narrower than the draft claimed — one specific gate, not "protection in the underground areas" (rule 11 — the invented reason was wrong on the specifics, not just unverified); (2) it must be *worn*, not merely carried; (3) the never-acquired player gets **no in-game clue**, so they're silently stranded.

That third case is a **design audit (rule 23)**: when a probe reveals a hard block, ask whether a *stuck* player has any entry to find. If the symptom has no question — especially when the game gives no pointer — add a first-person distress question for it (rule 3), and make its **answer supply the location the game withholds**. (Theatre gained an "An archway keeps pushing me back" question whose answer names the amulet's dressing-room locker.) The lesson generalizes: **the missing-item state is both the most likely to strand a player and the most likely to lack a hint — always probe it.**

### Fallback method — live save-slot probe (web-agent)

Use this only when the harness can't reach the state (e.g. a randomized-puzzle gate that needs an in-run value, or genuinely save-dependent behavior):
1. Play to just before the questionable step.
2. Save to the dedicated probe slot via the app's named-save meta-command: type `SAVE`, name the slot **`hint-runner`** (`lantern_customsave_<game>_hint-runner`). **Never use the quicksave slot** — it's the user's.
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
- [ ] Every section has a `locations` array (even `verified: false`), scoped to rooms where *this* section's puzzles happen — not every room traversed
- [ ] Question-level `locations` added wherever the question is room-specific (gates the question — keep cross-cutting/meta questions location-less; "how to enter X" questions must list the approach room, never only the room past the obstacle)
- [ ] `phase` set **only** for games whose status bar names the act (reused geography + named status context), harvested from a `--status` replay (most games omit it entirely)
- [ ] `milestones` + `afterMilestone`/`untilMilestone` set **only** for games that reuse rooms across acts but whose status bar can't name the act (clock/compass); first entry is the start act with `start: true`; triggers use act-exclusive `enterLocations` and/or a prose `textMatch` (verified absent from earlier acts)
- [ ] `meta.sources` lists all URLs used, each with a `"file"` key pointing to the local walkthrough copy
- [ ] `meta.generatedAt` is today's date (YYYY-MM-DD)
- [ ] `meta.appVersion` matches the version being bumped to

**Validate JSON parses:**
```powershell
cd "E:\Project\Lantern"
node -e "JSON.parse(require('fs').readFileSync('docs/games/hints/<gameName>.json','utf8')); console.log('ok')"
```

---

## Step 5 — Integrate

1. **No service-worker edit needed** — hints JSON is **not** pre-bundled; the `/games/` fetch handler in `docs/service-worker.js` caches it on demand (theatre.json isn't bundled either). The file just needs to exist at `docs/games/hints/<gameName>.json`.
2. Triple version bump (config.js, service-worker.js CACHE_VERSION, CLAUDE.md) — bumping CACHE_VERSION is what forces clients to re-fetch. (If a parallel session owns versioning, coordinate rather than bumping independently.)
3. Verify in-browser (after stale-SW guard per memory):
   - Load the game → ☰ → Hints → correct section badged 📍 for opening room.
   - Reveal hint 1 → hint 2 → answer; reload → reveals persist in `localStorage.lantern_hints_<gameName>`.
   - Reset confirms + clears.
   - **For milestone-scoped games:** walk across an act boundary (or trigger a `textMatch` event) and confirm the badge moves to the new act's section; revisit a shared room and confirm it badges the act you're actually in.

---

## ID stability note

Hint reveal state is keyed by `questionId` in localStorage. If you regenerate a hint file for an existing game, **preserve all existing `id` values**. Changing an ID silently resets that question's reveals for all users.
