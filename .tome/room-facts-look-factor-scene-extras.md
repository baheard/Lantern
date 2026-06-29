# `look` as a describing factor + `sceneExtras` (review modal)

## What
A room image's scene is built from the first-visit room description **plus** the examine/look
reveals the walkthrough already typed in that room (`mergeExamines`). Two changes extended this:

1. **Bare `look`/`l` is now a folded-in factor**, alongside `examine X` and `look up/down/...`.
2. Each room now carries **`sceneExtras: [{cmd, text}]`** — exactly the examine/look detail that
   got folded in *beyond* the first-visit description. The review UI shows a 🔍 N badge on the
   In-game-prose label; clicking it opens a modal listing each reveal attributed to its command.
   (`gen-room-facts.cjs` emits it; `review-server.cjs` `locationsFor` passes it through;
   client `openExtras()` renders the modal.)

## Non-obvious gotchas

- **The look-factor only fires on commands the walkthrough actually typed.** It does NOT actively
  probe. If a sub-state needs a `look` (e.g. a seated vantage), you ADD `look` to the walkthrough
  cmds file at that point — the engine then captures it. This is how Curtained Room's seated node
  got a real seated-vantage description: walkthrough was `sit on chair` → `examine mirror`; adding
  a `look` between them gave the node "Directly in front of you is a tall mirror" (chair gone,
  because you're in it). That `look` *became the node's `description`*, upgrading it from
  `recoveredFrom: examines` to description-sourced.

- **A bare `look` REPRINTS the room heading**, and the heading glues to the first body sentence
  ("Curtained Room (on the chair) The walls...") so it dodges the sentence-level dedup against the
  base description and leaks the heading into the scene. Fix: strip a leading `<L.name>` from the
  bare-look response at capture. After stripping, the body dedups cleanly — so when a look merely
  re-states the description (no state change) it contributes ZERO extras, which is correct. Only a
  look that reveals genuinely NEW prose (post-state-change) survives dedup and shows as an extra.

- **`mergeExamines` now returns `{scene, extras}`** (was a bare string). Only two callers
  (description path / Gap-A examines path); both destructure. Gap-B deferred (relight) rooms don't
  populate `sceneExtras` — they're prose-less variants with no examine/look of their own.

See [[room-facts-posture-vantage-anchor.md]] for the posture sub-state recovery that created the
seated node in the first place.
