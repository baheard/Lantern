#!/usr/bin/env node
/*
 * Make the light "paper" margin of an ink-&-wash render TRANSPARENT, so the ragged
 * hand-drawn edge fades into nothing and the art melts into the app's dark background.
 *
 * Flood-fills inward from the border over connected LIGHT pixels (so only the paper
 * surround is removed — interior light areas like a moonlit sky are never touched,
 * because the dark painted vignette ring stops the fill). A luminance ramp across the
 * watercolor edge gives a soft feathered cutout instead of a hard key.
 *
 *   node tools/bg-to-alpha.cjs <in.png> [out.png] [--lo 150] [--hi 210] [--bg #0d0b12]
 *
 * Writes <out> (RGBA, transparent margin) and <out>.onbg.png (composited on --bg for
 * eyeballing how it sits on the dark UI). Defaults out = <in> with "-alpha" suffix.
 */
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const a = process.argv.slice(2);
const inPath = a.find((x) => !x.startsWith('--'));
const outPath = a.filter((x) => !x.startsWith('--'))[1] || inPath.replace(/\.png$/i, '-alpha.png');
const opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const lo = parseInt(opt('lo', '150'), 10);   // below this = solid art (opaque)
const hi = parseInt(opt('hi', '212'), 10);   // above this = paper (fully transparent)
const bg = opt('bg', '#0d0b12');
if (!inPath) { console.error('usage: node tools/bg-to-alpha.cjs <in.png> [out.png] [--lo N --hi N --bg #hex]'); process.exit(2); }

const png = PNG.sync.read(fs.readFileSync(inPath));
const { width: w, height: h, data: d } = png;
const N = w * h;
const lumAt = (i) => (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
const region = new Uint8Array(N);            // 1 = connected-to-border light background
const stack = [];
const push = (x, y) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = y * w + x; if (!region[i] && lumAt(i) >= lo) { region[i] = 1; stack.push(i); } };
for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
while (stack.length) { const i = stack.pop(); const x = i % w, y = (i / w) | 0; push(x - 1, y); push(x + 1, y); push(x, y - 1); push(x, y + 1); }

let cleared = 0;
for (let i = 0; i < N; i++) {
  if (!region[i]) continue;
  const L = lumAt(i);
  const alpha = L >= hi ? 0 : L <= lo ? 255 : Math.round(255 * (hi - L) / (hi - lo));
  d[i * 4 + 3] = alpha;
  if (alpha < 255) cleared++;
}
fs.writeFileSync(outPath, PNG.sync.write(png));

// Preview composited over the app background so we can see how it blends.
const br = parseInt(bg.slice(1, 3), 16), bgG = parseInt(bg.slice(3, 5), 16), bb = parseInt(bg.slice(5, 7), 16);
const prev = new PNG({ width: w, height: h });
for (let i = 0; i < N; i++) {
  const al = d[i * 4 + 3] / 255;
  prev.data[i * 4] = Math.round(d[i * 4] * al + br * (1 - al));
  prev.data[i * 4 + 1] = Math.round(d[i * 4 + 1] * al + bgG * (1 - al));
  prev.data[i * 4 + 2] = Math.round(d[i * 4 + 2] * al + bb * (1 - al));
  prev.data[i * 4 + 3] = 255;
}
const prevPath = outPath.replace(/\.png$/i, '.onbg.png');
fs.writeFileSync(prevPath, PNG.sync.write(prev));
console.log(`${path.basename(outPath)}  (${cleared} px feathered/cleared)  + preview ${path.basename(prevPath)}`);
