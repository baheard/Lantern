---
title: impasto-spotty-clause
tags: [location-art, art-direction, artist, dreamhold, gotcha]
created: 2026-06-28
aliases: [spotty impasto, every boundary clause, Impasto Oil vs Tonal Oil, plein-air spotty]
---

# The "every boundary" clause drives the spotty/granular impasto look

Builds on [[art-direction-model]] and [[artist-audition-design]].

## Finding
The old `plein-air` ("Impasto Oil") artist `style` ended with the sentence
**"Raised paint ridges catch light at every boundary."** That one clause is what made
dense scenes (foliage, floral carpets, rockfaces) render as an all-over granular *fleck* —
the model scatters a bright highlight onto every edge, so the whole mid-ground breaks into
thousands of individually-lit specks. It reads as busy/spotty/noisy.

Validated 2026-06-28 by minimal single-clause auditions through the real compose path
(mountain-garden + sitting-room, OpenAI low): vanilla (clause in) vs clause-removed.
Removal kills the fleck while keeping full scene fidelity AND the thick alla-prima
character — knife strokes stay loud in skies/paths, nothing in the scene is lost.
Softening it ("...along the major forms") only half-helps and skews darker/cooler.

Effect is room-dependent: a clear unambiguous win on dense exteriors (foliage stops
fizzing); on cozy interiors removal also mutes/dims the mood a notch (the floral carpet
calms but loses some warmth).

## Outcome: two artists, not one tweaked
- **`plein-air` / "Impasto Oil"** — kept the chunky knife-work, just **dropped the
  "every boundary" clause** (the de-spotted r47 look).
- **`tonal-oil` / "Tonal Oil"** — NEW artist for a genuinely different medium (audition
  r48): *economy of brushwork, lost-and-found edges, atmospheric perspective, impasto
  reserved for sunlit accents only, value-mass palette.* Soft/airy/restrained — the
  opposite axis from Impasto's mark-forward texture. Named for Tonalism (value+atmosphere)
  vs Impasto (paint handling) so the labels teach what you'll get.

## Gotchas surfaced doing this
- **`gen-room-images.cjs --sbx` does NOT load `style.json`.** `--loc <slug>` only records
  metadata; the scene field stays empty unless you pass `--scene "<text>"` explicitly. An
  empty scene = the model invents a random room (we got a staircase and a scholar instead
  of mountain gardens). The batch `--sandbox` path DOES pull per-room scene overrides; the
  ad-hoc `--sbx` path does not.
- Stored artist `style` is just the medium; the tool appends the shared `ARTIST_LEAD`
  ("This medium is the PRIMARY instruction for STYLE…") at compose time — don't paste that
  suffix into `artists.json`.
- Heavy medium rewrites (MEASURED economy, WASH, grouped-strokes) all traded spottiness for
  fidelity/mood loss when applied as a whole-string swap. The minimal single-clause edit is
  what isolated the real driver.
