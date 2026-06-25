#!/usr/bin/env node
/*
 * Lantern location-art promote step.
 *
 * Moves APPROVED images out of the _review/ staging folder into the committed
 * per-game image folder, and updates manifest.json — the source of truth the app
 * reads to decide which locations have art. Rejected images are deleted from staging;
 * "regen" images are simply left in _review/ (the next gen run overwrites them).
 *
 *   node tools/promote-room-images.cjs anchorhead alley foyer cellar      # approve+promote
 *   node tools/promote-room-images.cjs anchorhead --reject foo bar        # drop from staging
 *
 * The manifest maps locationName -> image filename (only approved rooms appear), so the
 * app can look up an image by the exact node.name the auto-mapper records — no slug logic
 * needed at runtime.
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const a = { approve: [], reject: [] };
  let mode = 'approve';
  for (const t of argv) {
    if (t === '--reject') { mode = 'reject'; continue; }
    if (t === '--approve') { mode = 'approve'; continue; }
    if (!a.game) { a.game = t; continue; }
    a[mode].push(t);
  }
  return a;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.game) { console.error('Usage: node tools/promote-room-images.cjs <game> <slug...> [--reject <slug...>]'); process.exit(2); }
  const gameDir = path.join(REPO, 'docs/games/images', args.game);
  const reviewDir = path.join(gameDir, '_review');
  const packPath = path.join(gameDir, 'room-facts.json');
  const manifestPath = path.join(gameDir, 'manifest.json');

  const pack = fs.existsSync(packPath) ? JSON.parse(fs.readFileSync(packPath, 'utf8')) : { rooms: [] };
  const nameBySlug = new Map(pack.rooms.map((r) => [r.slug, r.name]));

  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    : { game: args.game, images: {} };
  manifest.images = manifest.images || {};

  let promoted = 0, rejected = 0;
  for (const slug of args.approve) {
    const src = path.join(reviewDir, `${slug}.png`);
    if (!fs.existsSync(src)) { console.error(`  ! ${slug}: no _review image, skipping`); continue; }
    const dest = path.join(gameDir, `${slug}.png`);
    fs.copyFileSync(src, dest);
    // KEEP the staging source: committed is a *copy*, and the reviewer flags the in-game
    // image by byte-matching a candidate still present in _review (see review-server
    // candidatesFor + committedSource). Deleting it here left the promoted image with no
    // selectable tile and no "★ in game" pill. (Next --regen rolls it to <slug>.prev.png.)
    const name = nameBySlug.get(slug) || slug;
    manifest.images[name] = `${slug}.png`;
    console.log(`  ✓ promoted ${slug}  →  "${name}"`);
    promoted++;
  }
  for (const slug of args.reject) {
    const src = path.join(reviewDir, `${slug}.png`);
    if (fs.existsSync(src)) { fs.rmSync(src); console.log(`  ✗ rejected ${slug} (removed from staging)`); rejected++; }
    // also clear any stale committed image + manifest entry
    const name = nameBySlug.get(slug) || slug;
    if (manifest.images[name]) { delete manifest.images[name]; }
    const committed = path.join(gameDir, `${slug}.png`);
    if (fs.existsSync(committed)) fs.rmSync(committed);
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const total = pack.rooms.length || Object.keys(manifest.images).length;
  console.log(`\nManifest: ${Object.keys(manifest.images).length}/${total} locations have art.  (${promoted} promoted, ${rejected} rejected)`);
  console.log(`Refresh the tracker: node tools/gen-room-review.cjs ${args.game}`);
}

main();
