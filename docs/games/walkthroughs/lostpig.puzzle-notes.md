# Lost Pig — Puzzle Notes

Game: *Lost Pig (And Place Under Ground)* by Admiral Jota
Build: `docs/games/lostpig.z8`, Z-machine v8, Release 2 / Serial 080406
Command list: `docs/games/walkthroughs/lostpig.cmds.txt` (replays `--strict` clean, exit=0,
finishes with **6 out of 7 points** — the trunk ending)

## ⚠ RANDOMIZED BETWEEN PLAYS

**Nothing is randomized.** Lost Pig has no RNG-gated puzzle content (no combination locks,
no shuffled maze, no per-play power word). Every command in `lostpig.cmds.txt` is a fixed,
deterministic solution — safe to reference literally in hints without leaking a "your value
will differ" caveat. The only variance across playthroughs is *optional* conversation/flavor
text (the game rewards exploring ASK/TELL topics with extra responses), which doesn't gate
progress.

## Overview / core mechanic

Grunk (a good-natured, none-too-bright orc) falls into an underground gnome's lair while
chasing an escaped pig. The whole game is built around **NPC conversation and object
trading with a single gnome NPC**, plus a short chain of fetch/craft puzzles that unlock
each other. There is no combat, no death from puzzles, and very few ways to softlock —
the design intentionally telegraphs next steps via bracketed `[Grunk can try ...]` hints
after most conversation topics. The final point (7th) is an optional/joke hint-menu point,
not part of the required trunk — see `[scoring-ceiling]` note below.

## [intro-outside] Getting into the hole

**Insight:** `look for pig` then `listen` (in that order) is required before `ne` reveals
the correct exit — `listen` is what actually raises the direction and awards the first
point. Skipping straight to `ne` still works geographically (it's the only interesting
exit), but the walkthrough's order teaches the game's "listen for audio cues" convention
that recurs later (the vending-box "Grunk remember what happen next" auto-sequence, the
gnome's snoring in the closet).

## [hole-entrance] Torch goes out on the fall

**Insight:** the fall into the hole automatically extinguishes the torch (a scripted event,
not a debuggable "did I do something wrong" moment) — `take tube and torch` and `look inside
tube` / `blow in tube` (revealing it's a whistle) are safe exploratory actions here and don't
consume any resource. The whistle isn't usable yet; it's a "return later" item for
`[exit-maze]`.

## [catch-pig-first] The pig cannot be caught yet

**Insight:** `follow pig` / `catch it` are a deliberate **dead end** at this stage — the pig
always evades until Grunk has bait (bricks, from `[vending-box]`). This is a fairness signal
more than a puzzle: a player trying the "obvious" verb early gets a graceful non-punishing
failure message, not a stuck state. Good candidate for a low-tier hint reassuring the player
that catching the pig requires groundwork done elsewhere.

## [fountain-room] The fountain coin, statue hat, and the murals

**Insight:** this room is the game's **primary foreshadowing hub** — nearly everything
examined here pays off many rooms later. The coin in the fountain bowl seeds the entire
`[vending-box]` brick economy; the hat taken from the statue is reused at `[river-crossing]`
to carry water; the west mural (fire + water bucket) is the literal solution to
`[powder-fire]`; the east mural (pole + floating objects) foreshadows the pole becoming a
tool at `[river-crossing]`/`[get-paper]`; and the statue's pose (one hand pointing north,
one raised) previews both the direction unlocked and the torch placement in
`[statue-torch]`. A hint author revisiting any later puzzle should consider pointing back
to "re-examine what you saw in the Statue/Fountain rooms" rather than stating the object
interaction outright.

## [vending-box] The coin/lever/dent brick machine

**Insight (the game's signature "verb sandbox" puzzle):** put coin in slot → pull lever →
brick drops in basket; **hit box** (using the visible dent as the cue) → the coin falls back
out into the basket too. So one coin can be recycled indefinitely to mint unlimited bricks —
**the game automates the repeat for you** ("Grunk remember what happen next!") once you've
done the coin→lever→hit sequence once by hand, chaining `put coin in slot` straight into
`pull lever. hit box.` output on subsequent plays. Practical takeaway for hints: a player
only needs to *discover the loop once*; they don't need to be told to grind it, and 3-4
bricks (from `[exit-maze]`/`[catch-pig-final]`) is a comfortably retrievable amount, not a
farming grind.

## [gnome-intro] Waking and befriending the gnome

**Insight:** the gnome will not respond to Grunk until Grunk makes noise loud enough to wake
him — `shout` (not `listen`, not `x shadow`) is the actual wake trigger; the two examine/listen
actions before it are flavor/atmosphere (safe, don't fail `--strict`, but contribute nothing
mechanically). Once awake, the gnome's dialogue tree self-documents via bracketed suggestion
text after nearly every topic (`[Grunk can try TELL GNOME ABOUT ... ]`) — this is the
built-in hint mechanism the game is famous for; a good external hint for this section should
defer to that in-fiction guidance rather than duplicate it, and only intervene if the player
hasn't noticed the bracketed suggestions exist.

**Prerequisite chain inside this room (order matters for full flavor, not for `--strict`):**
`show torch to gnome` before `ask gnome about fire` gets a richer response, and `show brick
to gnome` before `ask gnome about mother` sets up the callback that pays off in
`[catch-pig-final]` (gnome explains bricks are pig-bait). Neither is a hard gate — the notes
call this out because a *terser* command list could drop them and still pass `--strict`,
but doing so would silently cut lore the hint author might want to reference.

## [shelf-room] Book and pole (climbing puzzle)

**Insight:** the room's top shelf is out of Grunk's reach on foot; **`drop chair` then
`stand on chair`** (the chair carried all the way from `[vending-box]`'s Table Room) is
required to reach the book. This is the game's one "carry a mundane object across rooms for
later use" puzzle — a player who left the chair behind has to backtrack, which is a natural
hint moment ("did you bring something to stand on?").

## [gnome-book] Trading the book for the missing page's context

**Insight:** giving the gnome the book (his own, missing a page) doesn't pay off immediately
— he can't act until the *page* itself is delivered later (`[gnome-paper]`). This is the
game's clearest **two-part fetch quest**: item handed over now, payoff several rooms and
puzzles later. A hint author should treat "give book to gnome" and "give paper to gnome" as
one combined quest-line, not two unrelated topics.

## [river-crossing] Fishing hook, water, and the hidden key

**Insight:** `take thing` / `touch thing with pole` at the river is really "attach the
fishing hook found at the bank to the pole," which then **surfaces a key** from the water —
easy to miss because the room text doesn't loudly announce that the pole becomes a tool here
(unlike the shelf-room chair, which is visually obvious). `fill hat with water` reuses the
hat taken from the statue back in `[fountain-room]` — a second payoff for an item picked up
much earlier, reinforcing the "carry everything, it'll matter later" design.

## [powder-fire] Unlock chest → pour water on powder → light torch

**Insight:** this is a direct payoff of the **west mural** examined back in `[fountain-room]`
("bucket pouring water onto fire... water for making fire go out" — read literally backwards:
water dropped on this specific *black powder* ignites it, rather than dousing it). The mural
is essentially an in-fiction hint image for this exact puzzle; a hint here should nudge the
player to recall or re-examine the statue-room murals rather than just stating the solution.
The torch, extinguished back in `[hole-entrance]`, gets relit here — solving the "we have no
light source" problem the player has been living with for the whole midgame.

## [get-paper] Burn the pole to make it sticky enough to grab the paper

**Insight:** `take paper with pole` fails silently ("nothing special happen") the first time
— the pole must be **burned with the (now-lit) torch first**, which chars/sootifies the tip
so paper sticks to it. This is a two-step "use tool, tool doesn't work, modify tool, retry"
puzzle and a classic point where players get stuck trying the right verb with the wrong
object state. Good candidate for a mid-tier hint: "the pole needs to be sticky, not just
long."

## [gnome-paper] Deliver the paper, then WAIT

**Insight:** after `give paper to gnome`, the game requires an explicit `wait` turn for the
gnome to actually repair his book (a short cutscene gated on player patience, not on a
puzzle action) — a player who walks away immediately after giving the paper might not
realize the follow-through happens automatically on `wait`. This is the last point-scoring
gnome-conversation beat before the endgame.

## [catch-pig-final] The bait-and-wait pig capture

**Insight:** this is the payoff of `[vending-box]` (bricks) and `[gnome-intro]`'s
`ask gnome about mother` foreshadowing. `show brick to pig` primes it, but the pig only
actually approaches and can be grabbed after **`drop all bricks` + several turns of
patient waiting** (4 `z`s in the verified trunk) while the pig works through the bricks —
attempting `take pig` too early (before it's absorbed in eating) still fails gracefully.
The exact wait count isn't a hard-coded gate as much as "wait until pig is distracted enough
to grab" — the game will tell you when it's ready via the pig's described behavior shifting
from wary to absorbed. Hints should describe the *state* to watch for ("wait until the pig
stops watching you and starts eating") rather than a literal turn count, in case internal
engine timing differs slightly.

## [statue-torch] The statue's hand mechanism

**Insight:** putting the (lit) torch in the statue's raised hand opens a previously
inaccessible north passage — the statue's pose ("one hand point north, at wall... other
hand up in air", examined all the way back in `[fountain-room]`) telegraphs both the
direction unlocked and where the torch goes. Another case of an early room description
being the actual puzzle hint.

## [trade-ball] Trading torch for the ball (light source swap)

**Insight:** Grunk must retrieve the torch again (`s. take torch`) after using it to open
the statue passage, then trade it to the gnome **in exchange for** the ball/whistle needed
for the final maze exit. This is a light-source hand-off: Grunk ends the game carrying the
gnome's glowing ball instead of the torch. Don't let a hint imply the torch is "used up" —
it's explicitly reclaimed and repurposed as a bargaining chip, not consumed.

## [exit-maze] Playing the whistle to summon the gnome through the maze

**Insight:** the maze beyond the windy cave is **not meant to be solved by mapping** — it's
a "make noise, gnome comes and guides you out" puzzle, tying back to the tube/whistle found
at the very start (`[hole-entrance]`). `drop pole` before playing the whistle isn't a hard
requirement revealed by `--strict` (the pole simply isn't needed anymore), but the published
walkthrough drops it here, suggesting inventory limits or tidiness rather than a puzzle gate.
Once the whistle is played, the gnome arrives and the rest of the exit (`follow gnome`
through a couple of rooms) is guided, not puzzle-gated.

## Why the trunk ends at 6/7 (scoring ceiling, see [exit-maze])

The verified trunk finishes with **"Grunk have 6 out of 7 that time"** and the closing menu
explicitly offers "look at MENU (with different silly thing Grunk can try doing and hint for
last point)" — i.e. the game itself tells the player the 7th point is an optional joke/
easter-egg action outside the mandatory quest line, discoverable via the in-game MENU/AMUSING
system rather than a hidden step. This is not a bug or a missed step in the walkthrough; the
6-point ending is Lost Pig's designed "won the game" trunk completion. Do not treat the
missing point as an unsolved puzzle in hints — flag it as bonus/optional content if it comes
up.

## Open items / residual gates

None. The entire trunk replays deterministically with no randomized values, no interactive
char-mode readers, and no timing-sensitive NPC patrols beyond the pig-waiting beat noted
above (which is player-paced, not clock-gated). No `OPEN PUZZLE` blocks.
