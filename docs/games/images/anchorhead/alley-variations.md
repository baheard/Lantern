# Alley — pixel-art redo (4 variations)

Old-school pixel-art, portrait 3:4. Source room text (Anchorhead `Alley`):
> This narrow aperture between two buildings is nearly blocked with piles of rotting
> cardboard boxes and overstuffed garbage cans. Ugly, half-crumbling brick walls to
> either side totter oppressively over you. The alley ends here at a tall, wooden
> fence. High up on the wall of the northern building there is a narrow,
> transom-style window.

Generate each into `_review/` then compare in the review tool
(`node tools/gen-room-review.cjs anchorhead`) and promote the winner to `alley.png`.

---

## V1 — Classic VGA 320×200, 16-colour, straight-on

```
node tools/gen-room-images.cjs --aspect 3:4 --out docs/games/images/anchorhead/_review/alley-v1.png --prompt "Old-school pixel art, low-resolution retro adventure-game scene, early-1990s VGA point-and-click look (about 320x200, 16-colour palette), chunky visible pixels, hand-dithered shading. Gothic horror, muted slate-grey and sickly-green palette, deep shadow, weak gaslight, Lovecraftian gloom, no people, no text or UI. Portrait, taller than wide, 3:4. Scene: a narrow alley between two buildings viewed straight on down its length; piles of rotting cardboard boxes and overstuffed garbage cans nearly block the way; ugly half-crumbling brick walls totter oppressively on either side; the alley ends at a tall wooden fence; high on the northern wall a narrow transom-style window glows faintly."
```

## V2 — Lower-res, big chunky pixels, moonlight from the transom

```
node tools/gen-room-images.cjs --aspect 3:4 --out docs/games/images/anchorhead/_review/alley-v2.png --prompt "Old-school pixel art, VERY low resolution with large chunky pixels (about 160px wide), heavy ordered dithering, high contrast, early-90s DOS adventure look, limited palette. Gothic horror, cold slate-grey and sickly-green, deep black shadow. A single shaft of pale moonlight falls from a narrow transom-style window high on the brick wall; the rest of the alley sinks into darkness. No people, no text or UI. Portrait, taller than wide, 3:4. Scene: a claustrophobic alley nearly blocked with rotting cardboard boxes and overstuffed garbage cans, crumbling brick walls leaning in on both sides, ending at a tall wooden fence."
```

## V3 — Sierra/LucasArts 256-colour, warm gaslight, slight angle

```
node tools/gen-room-images.cjs --aspect 3:4 --out docs/games/images/anchorhead/_review/alley-v3.png --prompt "Old-school pixel art in the 256-colour VGA Sierra / LucasArts SCUMM adventure-game style, soft dithered gradients, visible pixels, painterly retro look. Gothic horror mood, warm sodium gaslight glow against cold blue-grey shadow, damp and grimy. No people, no text or UI. Portrait, taller than wide, 3:4. Scene: a three-quarter angle looking down a narrow alley toward a tall wooden fence at the dead end; piles of rotting cardboard boxes and overstuffed garbage cans; half-crumbling brick walls towering oppressively on either side; a narrow transom-style window high on the northern wall."
```

## V4 — Minimal near-monochrome palette, foggy, oppressive walls

```
node tools/gen-room-images.cjs --aspect 3:4 --out docs/games/images/anchorhead/_review/alley-v4.png --prompt "Old-school pixel art, extremely limited 8-colour palette, near-monochrome green-grey, heavy dithering, chunky pixels, early-90s adventure-game look. Foggy, damp, oppressive Lovecraftian dread, no people, no text or UI. Portrait, taller than wide, 3:4. Scene: towering half-crumbling brick walls leaning inward over a cramped alley choked with rotting cardboard boxes and overstuffed garbage cans; the alley dead-ends at a tall wooden fence; a faint narrow transom-style window high on the wall; emphasis on scale and claustrophobia."
```
