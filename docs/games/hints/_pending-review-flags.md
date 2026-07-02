# Pending hint-review flags — 2026-07-01 all-games review pass

Green fixes from this pass are already applied in each `<game>.json` (shipped as v1.5.745).
Everything below is 🟡/🔴 awaiting a user ruling — **not applied**. Apply per the generate-hints
skill's Review Mode (preserve IDs; re-validate JSON; version bump after edits).

## 🔴 Red flags — ALL RESOLVED 2026-07-02 (v1.5.746)

All 7 reds ruled by user and applied, with wording tightened per the philosophy's
"favor cutting" mantra (single-sentence gate rungs, no rationale tails — not the
longer proposals below): lostpig 2 deletions; trinity gate rung; anchorhead
winerack rewrite (spyhole-symptom question, family-initials rungs, no genealogy
rationale); wishbringer 3 gate rungs + puzzle-notes [crisp] death-scene
correction; theatre goblin rung 3 → zero-instance gate. Original proposals kept
below for the record.

### lostpig
- `statue-pose` — answer fully spoils the late `statue-hand-torch` puzzle ("come back and try PUT TORCH IN HAND") and anchors to an EXAMINE-only pose. Proposed: **delete** (later entry keeps the callback).
- `under-the-bed` — fabricated loot, probe-disproven: `look under bed` → "There nothing at all under bed."; `open trunk` → "That all locked up."; `take ball` → gnome refuses. Ball only comes via the torch trade. Proposed: **delete**.

### trinity
- Coverage gap: one-way seventh-door (Alpha) crossing has no "take everything" gate — endgame unwinnable without walkie-talkie (+ lantern, crumbs). Proposed: gate rung in `styx-oarsman`: "This crossing doesn't come back — before you turn the ring to the seventh symbol, sweep up everything you've stashed around the garden that still works (a light, anything that talks or feeds)."

### anchorhead
- `d2-winerack` — built on fabricated mechanic ("the letters spell something"). Probe: letters are EXAMINE-only ancestor initials (C/W/H/E/M = Croseus, Wilhelm, Heinrich, Eustacia, Mordecai), working order tracks vintages oldest→newest; real visible symptom is watching Michael open the wall via the spyhole. Proposed rewrite: Q "I watched Michael open a hidden passage in the wine cellar. How do I open it myself?" → recently-handled bottles → raised letters = family initials → oldest-to-youngest → existing (verified) command answer. NOTE: ordering rationale (vintages=genealogy) is inference, not notes-stated.

### wishbringer (3 softlocks/deaths — ALL PROBE-CONFIRMED 2026-07-01)
- `eg-case`: **softlock confirmed.** Switch skipped → breaking the powered case = instant arrest/death ("blare of an electric security alarm… Looks like the story's over"); Tower is NOT re-enterable (`say fratto` → "Nothing exciting happens.", drawbridge stays closed); library door locks behind you ("the lock is on the outside"). Proposed gate rung (in `tw-switch` or `tw-drawbridge`): "Before you leave the tower laboratory for good, make sure you've dealt with the control panel — the drawbridge closes behind you and the magic word won't lower it a second time, and the library's display case is protected by an alarm while it still has power."
- `tw-fuzzy`: **softlock confirmed.** Without glasses, Fuzziness blocks every exit incl. back down ("It's too fuzzy in that direction." / "You can't. Everything is too blurred!"); theater is unreachable a second time (ticket surrendered, "You don't have any money.", Boot Patrol on the streets, tower not re-enterable). Proposed rung: "Pick up the 3-D glasses while you're inside the theater — you only get one ticket, and the blurry room at the top of the tower has no way out for anyone who can't see."
- `tw-crisp`: **death confirmed (not lingering unwinnable state).** No note → Crisp pockets the Stone, strips you, chute death ~6 turns after capture ("The floor falls away beneath your feet… Looks like the story's over.", turn 147). Only warning is Miss Voss offering the note twice. Proposed rung: "Accept the note Miss Voss offers you in Festeron and keep it — the man it's addressed to strips prisoners of everything they carry, and only that note makes him leave before he's finished with you." (Also: notes' `[crisp]` section describes the no-note branch as unwinnable — it's actually a death scene; notes could be corrected.)

### theatre
- `underground-goblin` rung 3 enumerates all four pearls' hiding places (spoils 4 sibling puzzles) — but it's the only recovery path for a missing-pearl player. Proposed: replace with gate + zero-instance pattern: "If you don't have all four colours yet, don't press on — every one of them is the prize behind one of the theatre's puzzles, so revisit anything that drove you off or wouldn't open." (Alternative: sanction a rule-22-style exception and keep the list.)

## 🟡 Yellow flags

### bronze
1. `forest-window` — earnest "it's scenery, nothing more" deflation (rule 16). Proposed: delete.
2. `phantom-guard` rung 4 — three increments (reach / padlock / key in Scrying Room). Proposed: split into two rungs.
3. `untranslatable-writing` answer — "(ring the lamplighter's silver bell there)" hands over `need-light`'s solution. Proposed: "(bring its flame back first)".
4. `lucrezia-notes` answer — "These clue the shoes, the tambourine, the gong, and how to reach Yvette" forward-leaks endgame. Proposed: end at LOOK UP commands + "GET NOTES so you can consult them anywhere."

### 905
1. `anywhere-unlooked` — corpse discovery has no visible symptom; notes design it as one ladder under `phone-is-yelling`. Proposed: merge + delete id (resets reveal state) — or keep (dead-end form is endorsed).
2. `how-do-i-feel` — question names the move (X ME) and it's optional color. Proposed: delete.
3. `get-inside-building` rung 1 — "You're carrying more than one piece of identification" asserts state (probe: reachable without wallet). Proposed conditional: "Only one piece of identification means anything to this door — if your wallet isn't on you, it's still on the bedroom end table."
4. `whats-this-game-about` rung 2 — three increments incl. "look under things" (one step from LOOK UNDER BED). Proposed trim: "Try not rushing — investigate instead of obeying, and don't take the fastest way out of town."

### galatea
1. `gallery-she-got-upset` — ladder never resolves to an Answer rung. Proposed: prefix final rung "Answer:" + "typing Z (wait) a turn or two lets her recover the thread herself." (Leaving as-is defensible.)
2. `gallery-what-do-i-do` — rung 3 vs answer largely duplicate. Lean keep.

### lostpig
1. `what-good-fountain` — room-inventory question form. Proposed: delete + fold coin/hat provenance into consumers.
2. `murals-meaning` rung 2 — "Water usually puts fire out — but is that really what this picture is showing?" pre-spoils the powder inversion. Proposed soften: "Grunk's own guess about the west picture may be too hasty."
3. `chair-use` — chair is a prerequisite, entry leaks the shelf puzzle. Proposed: delete + provenance in `top-shelf-out-of-reach` answer.
4. `what-to-say-gnome` rung 1 — hands over the bracketed-suggestions mechanism. Proposed: reveal brackets at rung 2.
5. `reach-into-crack` — presumes the paper was found; real symptom is the gnome's missing page. Proposed reframe: "The gnome's book is still missing its page — where could it be?"
6. `catch-pig-bricks` — presumes possession + bricks-are-bait discovery. Proposed: "The pig still bolts whenever Grunk gets close. How does Grunk ever catch it?"

### photopia
1. `general-whats-going-on` vs `general-cant-progress` — duplicated "everything is on rails" reveal. Proposed: move scripted-scenes content entirely into `general-cant-progress`.
2. `castle-escape` question — "I have the pickaxe and shovel now" presumes possession. Proposed: "How do I get out of this sunken castle?"
3. (docs) puzzle-notes castle claim — FIXED this pass (notes corrected).

### spiderandweb
1. `alley-interrogation-frame` vs `general-what-is-going-on` — near-identical frame explanations. Proposed: keep alley entry, slim General to pure act-compass.
2. Timer-redo coverage gap — annex redo (CONNECT TIMER TO SCAN / TURN GREEN TO 1 / TURN BLUE TO 1 / PUSH …) covered by no entry. Proposed: extend `annex-north-room-chair` answer or add new question.
3. `guards-blocking-return` rungs 1–2 — "use the dark" advantage vs notes' "cosmetic". Proposed: rewrite to running-fight framing (or probe).
4. `lab-logic-plate-purpose` — now duplicates the teleporter entry post-fix. Proposed: delete (drops a published id).

### trinity
1. `pro-purpose` — rung 2 + answer walk through sibling entries' payoffs (umbrella/pram). Proposed: de-instance rung 2; answer names stops without solutions.
2. `mesa-coconut` — question presumes the POINT verb discovered. Proposed reframe: "There's a coconut out on an islet I can't reach, and a dolphin circling nearby."
3. `nm-ruby-boot` rung 2 — asserts emerald-in-boot state. Proposed conditional "If one of your boots already holds a gem…".

### anchorhead
1. `d2-skull` rung 4 — gate spoils `d2-pages`' discovery (bed → hidden pages). Proposed: "…don't go on until torn pages elsewhere in the house have named the right ancestor."
2. `d2-laptop` answer — "WEAR IT again" possibly non-load-bearing (needs long-range probe) — cut after probe or keep as flavor.
3. `d2-goldlocket` — attic room-inventory question. Proposed reword to dead-end form: "The attic seems to be nothing but dust and loose straw. Is there more to it?" (recommended over delete).
4. `d3-name` — cut "(Reaching the observatory means turning the sphere…)" AND add a new Day-3 question covering the fireplace-sphere passage + spyholes (currently uncovered progress gate).
5. `ln-finale` rungs 1–2 — full plan overview + enumeration. Proposed gentler rungs (see agent report).
6. `d2-records` rung 2 — slight tension with `d2-records-names`; optional hedge "…or never will; not every failure is yours."

### wishbringer
1. `wv-squeeze-can` rung 1 — answers the question in one step. Proposed: "Not empty — battered things sometimes hold more than they show; don't toss it yet."
2. `mi-hat` — prerequisite-not-a-puzzle. Proposed: delete + fold into `lh-pelican` gate rung.
3. `ug-grue` rung 2 — darkness rationale is authored theory. Proposed neutral: "Something soft and heavy thrown over it would trap it harmlessly."
4. `ve-arcade` rung 1 — reveals Tower payoff at rung 1. Proposed: move reveal down-ladder.
5. `tw-switch` ↔ `eg-case` — mutual pointers (split-puzzle tell). Proposed minimal: strip `tw-switch` rung 2's "locked-away exhibit" specificity.

### dreamhold
1. `study-clutter` — room-inventory form. Proposed: "The study's doors are locked and the room is a wall of clutter — where do I even start?"
2. `atelier-other-worlds` — question leaks telescope-transport payoff; rung 1 double-delivers. Proposed: "Is there more to the atelier than the mountain painting?" + split rung 1.
3. `arboretum-iron-key` — room-scout entry for a zero-puzzle pickup. Proposed: delete + provenance in `lab-spell-door` answer.
4. `caverns-river` rung 1 — berry reveal rides on rung 1. Proposed 4-rung split.
5. `cistern-main` answer — still not walkthrough-grade (second `turn wheel`, unused `take wad`, plug→node mapping); needs a dedicated cistern probe session if wanted.
