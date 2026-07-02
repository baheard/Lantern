# Hint-discouragement design (v1.5.738)

Added two per-game features to `hints-panel.js`/`hints-state.js` to nudge players away from over-relying on hints, without gating the reveal flow itself:

1. **One-time "ack" interstitial** — first time a game's Hints panel is opened, shows playful framing ("Hints are here if you get stuck... they work best a little at a time") with a single button that names the action ("Peek anyway"), not Yes/No. Persisted per-game via `hints_ack` key; never re-shown after. Cleared by `resetAllHintState` (full game reset) so it reappears on a fresh playthrough.
2. **Ambient "N hints used" counter** in the panel footer, summed from the existing per-question `revealed` counts (`getTotalRevealedCount`).

**Why this shape, not a confirm dialog or hint currency**: researched hint-economy patterns (InvisiClues/UHS progressive reveal, Wordle streak self-tracking, F2P currency-gated hints, generic "are you sure?" dialogs). Findings:
- Repeated confirm-on-every-click dialogs are documented (NN/g, UX Collective) to just train reflexive dismissal — so friction goes at the *first* decision only, not every reveal.
- Visible running counters (loss-aversion via self-tracking, à la Wordle streaks) are the one pattern with real behavioral backing, and they're ambient — no added friction to the actual "I'm stuck" moment.
- Currency/ad-gating (Candy Crush-style) is monetization dressed as friction, not a verified deterrent — wrong fit for Lantern anyway.
- The existing per-question progressive reveal (`revealNext()`) already matches the strongest-evidenced pattern (UHS/InvisiClues tiered disclosure) — left unchanged.

**Scoped per-game, not global**: a player who's an "I use hints" type in one game shouldn't have that framing skip in a different, harder game — the ack and counter both key off `getGameKey(..., gameName)`.
