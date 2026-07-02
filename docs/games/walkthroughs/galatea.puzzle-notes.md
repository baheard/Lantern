# Galatea — Puzzle/Mechanic Notes

Build: Release 3 / Serial 040208 (matches `docs/games/galatea.zblorb`).
Trunk verified: `docs/games/walkthroughs/galatea.cmds.txt` → ending **#64, "Patience"**
(`node tools/play.cjs galatea --strict --file docs/games/walkthroughs/galatea.cmds.txt` → exit=0).

## ⚠ RANDOMIZED BETWEEN PLAYS

**Nothing in this game is RNG-gated.** Galatea has no `@random` puzzles, no combination
locks, no per-run-shuffled content. However, her responses are **stateful and
history-sensitive** in a way that can *feel* random to a first-time player and that a
hint author must not confuse with true randomization:

- Every reply depends on accumulated conversation state (see `[conversation-state]`
  below) — Mood, Sympathy, Tension, Segue distance, and a large set of per-topic
  "already discussed" flags. The **same command typed twice** can produce two
  different responses depending on what's already been said and what mood she's in.
- This means a walkthrough's exact wording is only reproducible if the *entire*
  preceding command sequence matches. Our `.cmds.txt` is verified bit-for-bit against
  our build for its own sequence — do not assume any single line works in isolation.
- The debug commands `TOPICLISTX` (dumps every topic + verb combination the game
  recognizes) and `VISORX` (adds live Mood/Sympathy/Tension/Segue readouts to the
  status line) are author-provided instrumentation, confirmed present in our build.
  They are invaluable for hint-writing/probing but must never be taught to players as
  "the" solution — they're developer cheats, not diegetic tools.
- Hints for this game must **teach the conversational method** (patience, topic
  chaining, watching her mood cues in the prose) and must **never assert a single
  "correct" command sequence** as the way to reach a given ending, because dozens of
  documented routes reach the same ending from different conversational entry points.

## Core mechanic: `[conversation-state]`

Galatea is not a puzzle game in the traditional sense — it is a **finite-state
conversation engine** wrapped in Inform 6 topic-response tables. There is no map, no
inventory, no traditional verb puzzles. The entire game is one room (The Gallery's
End) and one NPC (the statue Galatea), driven by:

- **ASK ABOUT / TELL ABOUT** (`a <topic>` / `t <topic>`) — the primary conversational
  verbs. Topics chain: an answer often surfaces a *new* topic name (a person, place,
  or concept) that becomes askable, so exploring the topic graph organically is the
  "puzzle."
- **TOUCH / KISS / HUG / TURN / STARE AT / LOOK AT** — physical interaction verbs
  that raise or lower **Tension** and can themselves branch the ending.
- **WAIT (`z`)** — not a no-op here. Silence is a legitimate conversational move
  Galatea reacts to (see `[patient-silence]`), and several endings (notably
  Patience, #64) depend on the player *not* pushing the conversation and letting her
  fill silences herself.
- **THINK ABOUT** — an internal-reflection verb that can surface additional
  associative topics without saying anything to Galatea.
- Hidden numeric state: **Mood** (e.g. neutral/reflective/sad/hostile), **Sympathy**
  (accumulates from certain topic/response combinations; several endings require a
  minimum threshold — e.g. Hug requires Sympathy > 35), **Tension** (rises from
  physical intimacy escalation — touch → kiss gates), and **Segue distance** (how
  recently the conversation moved between emotionally distant topics). These are
  exposed only via the debug `VISORX` command, never diegetically.

There are **~70 documented endings** (see `galatea.txt` for the full catalogue as
compiled from Emily Short's own cheat sheet + IFWiki + fan documentation). The author
has stated explicitly and repeatedly that she does not want players optimizing toward
a specific ending — the game is meant to reward curious, organic conversation, and
"getting an ending" is a side effect of how the player actually engaged, not a puzzle
to be solved. **This is the single most important framing fact for hint-writing**:
a hint here should never say "do X to get the good ending" in the way a traditional
adventure-game hint would; it should coach conversational technique (follow up on
what she says, don't press wounds too hard, be willing to just listen).

## [opening-inspection] Getting oriented

`x her` / `a her` / `x placard` are the natural first moves any player tries. The
placard is the game's only piece of "environment" text and is important groundwork:
it names the artist (Pygmalion of Cyprus), states he's dead by suicide, and
establishes Galatea's material (Thasos marble) — this unlocks the `a artist` topic
immediately and several later branches (e.g. `a marble`, `a carving`) reference the
placard's wording. **Skipping the placard doesn't block anything**, but every
documented ending route in the compiled walkthrough reads it first, so it's the de
facto opening move.

## [artist-backstory] The central emotional thread

Nearly every one of the ~70 endings routes through some version of Pygmalion's
backstory: his reclusiveness (`a artist`, `a him`), the "strangeness" after her
waking (`a strangeness`), and his eventual suicide (`t suicide`). This is the
emotional throughline of the *entire* game — Galatea's arc is grief and
identity-formation in the shadow of her dead, ambivalent creator. Any conversational
branch you follow will eventually intersect this thread because it is the only
"plot" the game has; the endings differ mainly in **how the protagonist responds to
her grief** (with patience, with cruelty, with detachment, with over-identification),
not in *which facts* get uncovered.

**Build note:** `t suicide` produces a distinctly *withheld* reaction here ("I don't
know what I am supposed to do now...") rather than a breakdown — this is the
"patient" branch. Compare to ending #37 ("Delusions"), where confronting her about
her marble nature after establishing the suicide topic can push her to self-terminate
instead. The *same fact* (the suicide), reached via a *harder* line of questioning
(`think about exhibit` / `galatea, look at galatea` challenging her humanity), yields
a much darker outcome. **The conversational tone, not the topic list, is what
branches the ending** — this is the key insight for a hint author: never hint "ask
about X," hint "listen without pushing" vs. "keep challenging her."

## [patient-silence] The mechanic that produces the Patience ending

This is the one genuinely non-obvious mechanical insight in the whole trunk: **typing
`z` (wait) repeatedly, after having drawn her partway into personal topics, is
itself the input that produces the "Patience" ending.** A player who keeps typing
new ASK/TELL commands to "keep the conversation going" will likely never see this
ending — the game explicitly rewards *not* talking:

> "Your patient silence seems to act as a kind of catalyst: when Galatea realizes
> that you aren't going to interrupt, she talks and talks..."

Mechanically: after enough rapport has been built via the artist-backstory thread
(sympathy/mood conditions satisfied), consecutive `z` turns let Galatea's own
internal monologue-generation take over and she volunteers text without further
player prompting, eventually crossing into the ending. In our verified trunk this
takes only two `z`s at the end (after a preceding solo `z` earlier in the sequence)
— but the *general* mechanic (silence as a valid, sometimes-optimal move) generalizes
to several other quieter endings in the catalogue (e.g. #56-58, the "Crete" tears
branches, and #65 "Upset").

**Hintable insight (bolded for the hint author):** **If you want the warmer,
listening-focused endings, try just waiting instead of always asking another
question — Galatea fills silence with her own thoughts once she trusts you're
listening.**

## Branching endings — what this trunk does NOT cover

The trunk stops at ending #64 ("Patience"). The full catalogue of documented endings
(see `galatea.txt`, ~70 entries sourced from Emily Short's own cheat page, IFWiki, and
fan compilations) includes wildly different tones reachable from the *same* opening
state, gated by different conversational choices:

- **Violence/dark branches**: #36 (she kills you), #37 (she kills herself), #19
  (you almost kill her and flee in shame), #65 (raising your own trauma badly).
- **Romantic/intimate branches**: #23 (Kiss), #17 (Hug — many routes, Sympathy > 35
  gate), #39 (Exchange of Glances kiss).
- **Divine-intervention branches**: #42 (prays to Zeus, becomes human, is sick),
  #43/44 (prays to Aphrodite, goddess appears), #45-47 (Aphrodite kills her instead),
  #49/50 (Dionysus takes her and/or the protagonist).
- **Meta/fourth-wall branches**: #52 ("Wizard of Oz" — she's a remote-operated
  avatar), #68/69 (speaking the debug reset word "eudoxia" — requires out-of-game
  knowledge, explicitly framed by the game itself as a player exploit), #70 (speaking
  a classic IF magic word like `xyzzy` reveals the *protagonist* is also an avatar in
  a nested frame story).
- **Quiet/neutral departures**: #8-13, #24-27 — various "you leave, mildly affected"
  endings with only descriptive differences.

> **OPEN PUZZLE**: Only a subset of the 70 endings had concrete verified command
> sequences in the compiled source walkthrough (many are marked `???` even in the
> aggregator's own document — the author has said the state space is intentionally
> too complex to fully reverse-engineer). Do not treat `galatea.txt`'s "[commands not
> reconstructed]" endings as achievable via any known input — they're catalogued from
> secondary descriptions only, not verified against our build.

## Score / completion ceiling

Galatea has no score system and no "win" state distinct from any other — reaching
ANY of the ~70 endings ends the game via `*** The End ***` and offers
RESTART/RESTORE/QUIT. There is no partial-completion signal to track; a single
ending is a complete playthrough.
