// Rasterize the app icons + favicon PNG from inline SVGs using sharp.
// Run: node tools/gen-icons.cjs
const sharp = require('sharp');
const path = require('path');

const DOCS = path.join(__dirname, '..', 'docs');

// Lantern (lantern-a), amber-on-black rounded square, for the big PWA app icons.
// Amber #fbbf24 matches the app's --color-game-system accent. The lantern body is
// visually bottom-heavy, so the group is nudged up (translate y 8 -> 2) to optically
// centre it rather than sit a touch low. See issue #164.
const lanternSquare = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
  <rect width="160" height="160" rx="28" fill="#000"/>
  <g transform="translate(20,2)" fill="none" stroke="#fbbf24" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M45 32 Q60 14 75 32" />
    <path d="M42 46 L50 33 L70 33 L78 46 Z" />
    <path d="M53 46 L67 46 L65 54 L55 54 Z" />
    <path d="M51 56 C41 72 41 104 51 118 L69 118 C79 104 79 72 69 56 Z" />
    <path d="M46 118 L74 118 L78 132 L42 132 Z" />
    <path d="M60 80 C56 88 56 96 60 100 C64 96 64 88 60 80 Z" />
  </g>
</svg>`;

// Glow concept (concept 6) — the chosen favicon. Used for favicon.png (the PNG fallback for favicon.svg).
const glowSquare = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#1c1813"/>
  <circle cx="32" cy="34" r="20" fill="#3a2c12"/>
  <path d="M27 14 h10 v3 h-10 z" fill="#ffd28a"/>
  <path d="M25 20 h14 l3 18 a10 10 0 0 1 -20 0 z" fill="#ffd28a"/>
  <path d="M23 40 h18 v4 h-18 z" fill="#ffd28a"/>
</svg>`;

const appIconSizes = [72, 96, 128, 144, 152, 192, 512];

(async () => {
  for (const size of appIconSizes) {
    const out = path.join(DOCS, 'icons', `icon-${size}.png`);
    await sharp(Buffer.from(lanternSquare)).resize(size, size).png().toFile(out);
    console.log('wrote', path.relative(DOCS, out), `(${size}x${size})`);
  }
  // favicon.png = glow, matching favicon.svg (the chosen tab favicon)
  const fav = path.join(DOCS, 'favicon.png');
  await sharp(Buffer.from(glowSquare)).resize(48, 48).png().toFile(fav);
  console.log('wrote', path.relative(DOCS, fav), '(48x48)');
})();
