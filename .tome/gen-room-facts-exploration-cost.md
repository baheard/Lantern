---
title: gen-room-facts exploration cost — action-boundary seeding (default) + the probe-batch optimization
tags: [location-art, gen-room-facts, performance, bfs, seeding, headless, tooling, dreamhold]
created: 2026-06-26
updated: 2026-06-26
aliases: [room-facts slow, BFS cost, action-boundary seeds, full-seeds, probe-exits]
---

# Why the room-facts BFS is expensive, and what we changed

`exploreChronological()` in `tools/gen-room-facts.cjs` discovers/refreshes rooms by a
chronological BFS keyed on **`room@ts`** — *(room name, walkthrough turn index)*. The pair (not
just the room) is deliberate: a room's exits/prose change as puzzles fire, so the same physical
room is explored separately at each distinct `ts` it's reachable from (canonical case: the
theatre aisles in their mid-walkthrough chandelier-up window).

## The cost blowup

Two multiplicative factors:

1. **One seed per spine room** (`firstVisitIdx`, ~95 for Dreamhold) → ~95 distinct `ts` values.
2. **`room@ts` dedup only collapses within a `ts`**, so the reachable map gets re-walked up to
   ~95 times. Bounded only by `MAX_EXPLORATIONS = 4000`.

And the *unit of work is brutal*: `probeFromSnap()` spawns **12 separate `node play.cjs`
processes** (one per compass dir), plus one more spawn per traversal landing to build its
snapshot. Each spawn re-pays node boot + ESM import of `auto-mapper.js` + **eval of ~328 KB of
`zvm.js`+`glkapi.js`** + `do_autorestore`. Dreamhold's full per-room run: **2,939 room-states
explored ⇒ ~38,000 cold node launches** (~7+ min CPU). The algorithm isn't the bottleneck —
**process-spawn + repeated lib-recompile is.**

## Change 1 (DONE 2026-06-26): action-boundary seeding is now the DEFAULT

Seed the BFS only at the first room entered *after* each state-changing action (inspection AND
inventory verbs treated inert). Dreamhold: **26 seeds / 863 room-states vs 95 / 2,939** — ~3.4×
fewer. `--full-seeds` restores the old exhaustive per-room path.

**Coverage is identical except for rooms whose only pristine (pre-mutation) window is reached via
a verb the heuristic treats inert.** Validated on Dreamhold: **94/96 rooms byte-identical**; the 2
that differ are the pit pair — `Ledge in Pit` (gains the transient dropped-torch line) and
`Deep in Pit` (captured frozen/icy instead of warm/misty pristine). Same room *count*, same
coverage classes (82 ok / 6 Gap-A / 8 Gap-B / 0 needs-human / 0 thin). Such a miss is a `mold`
scene-override fix, **not** a coverage loss. NOTE: Dreamhold's *committed* `room-facts.json` was
left as the `--full-seeds` baseline (strictly more pristine on those 2 rooms); the default change
only affects future regens.

## Change 2 (DONE 2026-06-26): batch the 12-direction probe in one process

**Built and in use** — `probeFromSnap()` now makes ONE `play.cjs --probe-exits --dirs <a;b;…>`
spawn instead of 12. `play.cjs` restores the same base snapshot once per direction, each in its
**own fresh `vm` context** (lib sources precompiled to `vm.Script` once, line ~182, so the ~328 KB
re-runs but never re-parses), emits the 12 transcripts delimited by `@@PROBE-EXIT dir=<dir>`, and
`parseProbeResult` consumes each chunk exactly as before. The fresh-context-per-direction design
below is what shipped (the in-place-rewind alternative was correctly avoided). Net: 12 spawns → 1
per probe, recompile amortized. Pairs orthogonally with Change 1 — both are live by default now.

Original design rationale (as built): the dominant cost was the 12 node spawns per probe. The
**singleton constraint is real**:
`play.cjs` builds one VM realm per process; inside it **`Glk` is a module-global singleton**
(window list, streams, `gli_autorestore_glkstate`, `__GiDispa` disprock counters) and the
headless GlkOte `state` is a single accumulator. So you can't run two VMs in one context, and you
can't cheaply "rewind" after a probe — re-restoring into the *same live Glk* mid-process is the
fragile path (stale autorestore flags, ever-incrementing disprock, accumulated streams).

**Tractable design — `--probe-exits` mode, fresh context per direction:**
1. One node process. Read story bytes + parse snapshot JSON **once**.
2. **Precompile** the lib sources to `vm.Script` objects once (`new vm.Script(src)`) so the
   ~328 KB never re-parses.
3. Per direction: spin a **throwaway context**, run the precompiled Scripts into it (cheap, no
   re-parse), `do_autorestore` from the shared snapshot, send the one dir, read the landing room,
   discard. Each probe gets its **own** `Glk` → the singleton problem never arises.

Net: 12 spawns → 1, ~328 KB recompile amortized across 12 probes. Pairs orthogonally with the
seeding change — land/validate them separately. The in-place rewind approach is the one that's
genuinely hard (singletons); the precompiled-Script + fresh-context approach sidesteps it.
