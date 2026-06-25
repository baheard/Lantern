#!/usr/bin/env node
/*
 * Lantern location-art review SERVER (multi-game).
 *
 * Three-pane reviewer:
 *   NAV rail  →  ITEM list (+ topic notes)  →  DETAIL (+ item notes + actions).
 *
 * The rail lists every GAME that has art (a docs/games/images/<game>/room-facts.json),
 * then two global topics: Placeholders and Artist.
 *   - <game>:       locations → candidate images in _review/, 3 sections
 *                   (in-game / style / full prompt), Promote/Reject/Regenerate.
 *   - Placeholders: glyphs in docs/assets/glyphs/ — pick the app-wide placeholder.
 *   - Artist:       personas in docs/games/images/_artists/artists.json — example
 *                   renders (big selected preview) + style signature.
 *
 * Notes (per topic and per item) persist in docs/games/images/_review-notes.json.
 *
 *   node tools/review-server.cjs [--port 3009] [--no-open]
 *
 * The server is game-agnostic: it serves ALL games and topics. The reviewer remembers
 * where you last navigated in localStorage, so there is no launch-time "focus game".
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const REPO = path.resolve(__dirname, '..');
// Unique per server process. The client polls it and reloads itself when it changes,
// so a -Restart reconnects the open reviewer WITHOUT artview.ps1 sending an F5 keystroke
// (SendKeys toggles NumLock as a side effect — the "numlock on" announcement on restart).
const BOOT_ID = String(Date.now());
const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const port = parseInt((args.find((a) => a.startsWith('--port=')) || '').split('=')[1]
  || (portIdx !== -1 ? args[portIdx + 1] : null) || '3009', 10);

const IMAGES_ROOT = path.join(REPO, 'docs/games/images');
const notesPath = path.join(IMAGES_ROOT, '_review-notes.json');
const glyphsDir = path.join(REPO, 'docs/assets/glyphs');
const glyphSelPath = path.join(glyphsDir, 'selected.json');
const artistsDir = path.join(IMAGES_ROOT, '_artists');
const artistsPath = path.join(artistsDir, 'artists.json');
// App prompt = the highest layer, ABOVE the artist: global, app-wide instructions that
// hold even when the artist is swapped game-to-game. Hierarchy: App ▸ Artist ▸ Game ▸ Scene.
const appDir = path.join(IMAGES_ROOT, '_app');
const appPromptPath = path.join(appDir, 'app.json');

const readJSON = (p, fallback) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback);

// Games = image dirs (not "_artists" etc.) that have a room-facts.json.
function listGames() {
  if (!fs.existsSync(IMAGES_ROOT)) return [];
  return fs.readdirSync(IMAGES_ROOT).filter((n) => {
    const p = path.join(IMAGES_ROOT, n);
    return !n.startsWith('_') && fs.existsSync(path.join(p, 'room-facts.json'));
  }).sort();
}
function gamePaths(slug) {
  const dir = path.join(IMAGES_ROOT, slug);
  return { dir, review: path.join(dir, '_review'), pack: path.join(dir, 'room-facts.json'),
    manifest: path.join(dir, 'manifest.json'), selArtist: path.join(dir, 'selected-artist.json'),
    audition: path.join(dir, '_audition'), auditionCfg: path.join(dir, 'audition.json'),
    sandbox: path.join(dir, '_sandbox'), blockout: path.join(dir, '_blockout') };
}
// Blockouts = per-game 3D volume models (scene-def JSON in <game>/_blockout/*.scene.json),
// one per multi-room "Volume" that needs geometric continuity. See .tome/blockout-3d-continuity.md.
function blockoutsFor(slug) {
  const g = gamePaths(slug);
  if (!fs.existsSync(g.blockout)) return [];
  return fs.readdirSync(g.blockout).filter((n) => /\.scene\.json$/i.test(n)).sort().map((f) => {
    const def = readJSON(path.join(g.blockout, f), {});
    return { volume: def.volume || f.replace(/\.scene\.json$/i, ''), title: def.title || def.volume || f,
      members: def.members || [], cameras: Object.keys(def.cameras || {}) };
  });
}
// Compose the SAME layered prompt the reviewer uses for a room (Artist ▸ Scene ▸ Aesthetic ▸ App),
// so blockout Generate "just works" off the room's existing layers — no manual selection.
// sceneOverride (from the renderer's editable Scene box) replaces the stored scene layer;
// artist / aesthetic / app are always wrapped around it.
function composeForRoom(game, slug, sceneOverride) {
  const art = ((artistSignatureFor(game) || {}).style) || '';
  const st = gameStyle(game) || {};
  const aes = st.aesthetic || '';
  const scenes = st.scenes || (readJSON(path.join(gamePaths(game).dir, 'style.json'), {}).scenes) || {};
  let sc = (typeof sceneOverride === 'string' && sceneOverride.trim()) ? sceneOverride.trim() : (scenes[slug] || '');
  if (!sc) { const loc = (locationsFor(game) || []).find((l) => l.slug === slug); sc = (loc && (loc.sceneOverride || loc.description)) || ''; }
  // Labelled, line-broken sections so the saved prompt is readable on the location page.
  return [art ? ('ARTIST: ' + art + ' ' + ARTIST_LEAD) : '', sc ? ('SCENE: ' + sc) : '', aes ? ('GAME: ' + cap(aes)) : '', appPrompt() ? ('APP: ' + appPrompt()) : ''].filter(Boolean).join('\n\n');
}
// The scene layer alone (what the renderer's Scene box shows/edits).
function sceneForRoom(game, slug) {
  const scenes = (readJSON(path.join(gamePaths(game).dir, 'style.json'), {}).scenes) || {};
  if (scenes[slug]) return scenes[slug];
  const loc = (locationsFor(game) || []).find((l) => l.slug === slug); return (loc && (loc.sceneOverride || loc.description)) || '';
}
// Render a blockout clay frame (posted as a PNG data-URL) through the chosen model in edit mode,
// and return the styled image inline. Synchronous-await so the renderer can show it immediately.
// Where a volume's kept gens + clay refs live: <game>/_blockout/_gen/<volume>/
function blockoutGenDir(game, volume) { return path.join(gamePaths(game).blockout, '_gen', path.basename(volume || '')); }
// Per-volume member info for the renderer's description panel: canon prose + scene override.
function blockoutInfo(game, volume) {
  const def = readJSON(path.join(gamePaths(game).blockout, path.basename(volume || '') + '.scene.json'), {});
  const locs = locationsFor(game) || [];
  const scenes = (readJSON(path.join(gamePaths(game).dir, 'style.json'), {}).scenes) || {};
  const notes = def.notes || {};
  return (def.members || []).map((slug) => { const l = locs.find((x) => x.slug === slug) || {};
    return { slug, name: l.name || slug, description: l.description || '', scene: scenes[slug] || l.sceneOverride || '', note: notes[slug] || '' }; });
}
// Colour legend phrases — MUST match ROLE_COLORS in renderer.html. Only roles present are listed.
const ROLE_LEGEND = {
  stage: 'the tan platform is the raised STAGE (its tall front face is the proscenium/stage front, facing the seats)',
  seat: 'the deep-red blocks are rows of upholstered theatre SEATS',
  balcony: 'the purple masses on the upper side walls are BALCONY BOXES',
  pit: 'the dark sunken recess in front of the stage is the ORCHESTRA PIT',
  curtain: 'the crimson panel above the stage is the CURTAIN',
  door: 'the olive panels are DOORS',
  chandelier: 'the pale-gold cluster hanging from the ceiling is the CHANDELIER',
  rail: 'the warm-brown rails are carved WOODEN balustrades/railings (timber, not fabric or upholstery)',
  brick: 'the brick-red panel set into a wall is a BRICKED-UP DOORWAY — an old doorway filled in with bricks',
  hole: 'the dark recess in a wall is a HOLE smashed through the wall, opening onto darkness beyond — render it with a rough, irregular, broken outline (crumbled masonry, jagged cracked edges, loose rubble at its lip); the block only marks its rough position and size, so do NOT reproduce its straight rectangular edges — a busted-through hole is never a clean rectangle',
  wall: 'the cool-grey planes are WALLS', ceiling: 'the pale-grey overhead plane is the CEILING', floor: 'the plain grey ground is the floor',
};
function blockoutGen({ game, volume, view, model, png, scene: sceneOverride, facing }) {
  return new Promise((resolve, reject) => {
    const dir = blockoutGenDir(game, volume);
    fs.mkdirSync(dir, { recursive: true });
    const b64in = String(png || '').replace(/^data:image\/\w+;base64,/, '');
    if (!b64in || !view) return reject(new Error('missing png/view'));
    const refPath = path.join(dir, path.basename(view) + '.clay.png');
    fs.writeFileSync(refPath, Buffer.from(b64in, 'base64'));
    const MAP = { 'openai-low': { provider: 'openai', quality: 'low' }, 'openai-medium': { provider: 'openai', quality: 'medium' },
      'gemini': { provider: 'gemini' }, 'gemini-pro': { provider: 'gemini', model: 'gemini-3-pro-image-preview' } };
    const m = MAP[model] || MAP['openai-low'];
    const isPro = !!m.model, tag = isPro ? 'gem-pro' : modelTag(m.provider, m.quality);
    let max = 0; for (const f of fs.readdirSync(dir)) { const mm = f.match(/-r(\d+)\.png$/i); if (mm && f.indexOf(view + '__') === 0) max = Math.max(max, +mm[1]); }
    const outName = `${view}__${tag}-r${max + 1}.png`;
    const out = path.join(dir, outName);
    const prov = m.provider === 'openai' ? `openai/${m.quality}` : (isPro ? 'gemini-pro' : 'gemini');
    // Append this vantage's saved note (if any) as an Adjustments line — the "notes feed the next render" loop.
    const def = readJSON(path.join(gamePaths(game).blockout, path.basename(volume || '') + '.scene.json'), {});
    const note = (def.notes || {})[view] || '';
    // Colour legend for the roles actually present in this volume's blockout.
    const roles = new Set(); (def.parts || []).forEach((p) => { if (p.role) roles.add(p.role); (p.of || []).forEach((s) => { if (s.role) roles.add(s.role); }); });
    const legendParts = [...roles].filter((r) => ROLE_LEGEND[r]).map((r) => ROLE_LEGEND[r]);
    const legend = legendParts.length ? ('Blockout colour legend — render each coloured region as what it denotes: ' + legendParts.join('; ') + '. ') : '';
    const blocks = [];
    // NOTE: we deliberately do NOT send the camera's compass facing — image models can't map
    // compass to a picture, and it fought the blockout (placing "west wall" on the wrong side).
    // The image is the sole spatial authority (enforced in the guide wrapper).
    if (legend) blocks.push(legend.trim());
    blocks.push(composeForRoom(game, view, sceneOverride));
    if (note.trim()) blocks.push('ADJUSTMENTS: ' + note.trim());
    const prompt = blocks.join('\n\n');
    const cliArgs = [path.join('tools', 'gen-room-images.cjs'), '--aspect', '3:4', '--prompt', prompt,
      '--out', out, '--ref', refPath, '--ref-mode', 'guide'];
    if (m.provider === 'openai') cliArgs.push('--provider', 'openai', '--quality', m.quality);
    else if (m.model) cliArgs.push('--model', m.model);
    const jobId = String(++jobSeq);
    JOBS.set(jobId, { game, slug: view, kind: 'blockout', mode: prov, file: outName, status: 'queued', startedAt: Date.now() });
    scheduleGen(() => new Promise((inner) => {
      const job = JOBS.get(jobId); if (job) job.status = 'running';
      logLine(`BLOCKOUT-GEN ${game}/${view} via ${prov} → ${outName}`);
      const t0 = Date.now();
      execFile('node', cliArgs, { cwd: REPO, maxBuffer: 1 << 22 }, (err, so, se) => {
        const dt = ((Date.now() - t0) / 1000).toFixed(1);
        const j2 = JOBS.get(jobId);
        if (err || !fs.existsSync(out)) {
          const msg = String(se || so || (err && err.message) || 'error').slice(0, 500);
          logLine(`BLOCKOUT-GEN FAIL ${game}/${view} (${dt}s): ${msg}`);
          if (j2) { j2.status = 'error'; j2.error = msg; j2.finishedAt = Date.now(); }
          reject(new Error(msg));
        } else {
          logLine(`BLOCKOUT-GEN OK ${game}/${view} (${dt}s) ${outName}`);
          if (j2) { j2.status = 'done'; j2.finishedAt = Date.now(); }
          resolve({ file: outName, view, model });
        }
        inner();
      });
    }));
  });
}
// Overwrite one camera (vantage) in a volume's scene-def from the live renderer's "Update vantage".
function saveBlockoutCamera({ game, volume, view, pos, look, fov }) {
  const f = path.join(gamePaths(game).blockout, path.basename(volume || '') + '.scene.json');
  if (!fs.existsSync(f)) throw new Error('no such blockout');
  if (!view) throw new Error('no view');
  const def = readJSON(f, {});
  def.cameras = def.cameras || {};
  def.cameras[view] = { pos, look, fov };
  fs.writeFileSync(f, JSON.stringify(def, null, 2) + '\n');
  return { view };
}
// Add / update / delete a single block (scene-def `part`), located by its unique `name`.
// Powers the renderer's click-to-edit + add-block editor. The blockout image is the spatial
// authority, so editing geometry here is exactly editing what the model will see.
function saveBlockoutPart({ game, volume, op, name, part }) {
  const f = path.join(gamePaths(game).blockout, path.basename(volume || '') + '.scene.json');
  if (!fs.existsSync(f)) throw new Error('no such blockout');
  const def = readJSON(f, {});
  def.parts = def.parts || [];
  if (op === 'add') {
    if (!part || !part.name) throw new Error('part needs a name');
    if (def.parts.some((p) => p.name === part.name)) throw new Error('name already exists: ' + part.name);
    def.parts.push(part);
  } else if (op === 'delete') {
    const i = def.parts.findIndex((p) => p.name === name);
    if (i < 0) throw new Error('no such part: ' + name);
    def.parts.splice(i, 1);
  } else { // update (replace the matched part wholesale)
    if (!part || !part.name) throw new Error('part needs a name');
    const i = def.parts.findIndex((p) => p.name === name);
    if (i < 0) throw new Error('no such part: ' + name);
    if (part.name !== name && def.parts.some((p) => p.name === part.name)) throw new Error('name already exists: ' + part.name);
    def.parts[i] = part;
  }
  fs.writeFileSync(f, JSON.stringify(def, null, 2) + '\n');
  return { op, name: (part && part.name) || name };
}
// Delete a generated shot: its .png, its sidecar .txt prompt, and its image-note key.
function deleteBlockoutGen({ game, volume, file }) {
  const dir = blockoutGenDir(game, volume), f = path.basename(file || '');
  if (!f || !/-r\d+\.png$/i.test(f)) throw new Error('bad file');
  const png = path.join(dir, f); if (!fs.existsSync(png)) throw new Error('no such shot');
  fs.unlinkSync(png);
  const txt = path.join(dir, f.replace(/\.png$/i, '.txt')); if (fs.existsSync(txt)) fs.unlinkSync(txt);
  const view = f.split('__')[0], key = `game:${game}:${view}:${f}`;
  const n = readJSON(notesPath, {}); if (n[key]) { delete n[key]; fs.writeFileSync(notesPath, JSON.stringify(n, null, 2)); }
  return { file: f };
}
// Per-vantage note (appended to the next render as an Adjustments line). Stored in the scene-def's `notes` map.
function saveBlockoutNote({ game, volume, view, text }) {
  const f = path.join(gamePaths(game).blockout, path.basename(volume || '') + '.scene.json');
  if (!fs.existsSync(f)) throw new Error('no such blockout');
  if (!view) throw new Error('no view');
  const def = readJSON(f, {});
  def.notes = def.notes || {};
  if (text && text.trim()) def.notes[view] = text; else delete def.notes[view];
  fs.writeFileSync(f, JSON.stringify(def, null, 2) + '\n');
  return { view };
}
// Capitalize first letter (mirrors the client's cap() so server-composed audition
// prompts match the reviewer's Composed prompt exactly).
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
// Artist medium leads the composed prompt and is told to govern lighting/finish, so the
// chosen medium actually renders instead of collapsing into the aesthetic's tone. Aesthetics
// describe WORLD content only; lighting/palette belongs to the artist. Must match the same
// constant in gen-room-images.cjs and the client composedPrompt() so all three agree.
const ARTIST_LEAD = 'This medium and its rendering are the PRIMARY instruction: render the entire image in this style, and let it govern the lighting, colour and finish over any atmospheric notes that follow.';

function candidatesFor(g, slug) {
  if (!fs.existsSync(g.review)) return [];
  // Include the committed name, the --regen prior take (<slug>.prev.png), and dashed variants.
  return fs.readdirSync(g.review)
    .filter((f) => /\.png$/i.test(f) && (f === `${slug}.png` || f === `${slug}.prev.png` || f.startsWith(`${slug}-`))).sort();
}
// App prompt (global, all games). Read/write _app/app.json.
function appPrompt() { return (readJSON(appPromptPath, {}) || {}).prompt || ''; }
function saveAppPrompt(text) {
  fs.mkdirSync(appDir, { recursive: true });
  const d = readJSON(appPromptPath, {}); d.prompt = text || '';
  fs.writeFileSync(appPromptPath, JSON.stringify(d, null, 2)); return { ok: true };
}
// Per-game style: the editable Aesthetic + per-room Scene overrides. <game>/style.json.
function gameStyle(slug) {
  const d = readJSON(path.join(IMAGES_ROOT, slug, 'style.json'), {});
  return { aesthetic: d.aesthetic || '', scenes: d.scenes || {} };
}
function saveStyle(slug, aesthetic) {
  const p = path.join(IMAGES_ROOT, slug, 'style.json');
  const d = readJSON(p, {}); d.aesthetic = aesthetic;
  fs.writeFileSync(p, JSON.stringify(d, null, 2)); return { ok: true };
}
function saveScene(slug, room, tail) {
  const p = path.join(IMAGES_ROOT, slug, 'style.json');
  const d = readJSON(p, {}); d.scenes = d.scenes || {};
  if (tail && tail.trim()) d.scenes[room] = tail; else delete d.scenes[room];
  fs.writeFileSync(p, JSON.stringify(d, null, 2)); return { ok: true };
}
// Edit the canonical in-game room prose. Persists back to the game's room-facts.json
// (rooms[].description) so it survives a server restart and feeds future composes.
function saveDescription(slug, room, text) {
  const p = gamePaths(slug).pack;
  const d = readJSON(p, { rooms: [] });
  const r = (d.rooms || []).find((x) => x.slug === room);
  if (!r) throw new Error('room not found');
  r.description = text || '';
  fs.writeFileSync(p, JSON.stringify(d, null, 2));
  return { ok: true };
}
// The Artist signature for a game = its selected artist's style text (read-only in UI).
function artistSignatureFor(slug) {
  const selId = (readJSON(gamePaths(slug).selArtist, {}) || {}).id;
  const arts = (readJSON(artistsPath, { artists: [] }).artists) || [];
  const a = arts.find((x) => x.id === selId) || arts[0];
  return a ? { id: a.id, name: a.name, style: a.style || '' } : { id: null, name: '(no artist)', style: '' };
}
// Edit the SELECTED artist's signature style text. Writes back to the shared
// artists.json (global — affects every game using this artist, by design).
function saveArtistStyle(gameSlug, style) {
  const selId = (readJSON(gamePaths(gameSlug).selArtist, {}) || {}).id;
  const d = readJSON(artistsPath, { artists: [] });
  const a = (d.artists || []).find((x) => x.id === selId) || (d.artists || [])[0];
  if (!a) throw new Error('no artist selected');
  a.style = style || '';
  fs.writeFileSync(artistsPath, JSON.stringify(d, null, 2));
  return { id: a.id };
}
// Edit a SPECIFIC artist's signature by id (used by the Audition grid, where any row's
// artist can be tuned — not just the game's currently-selected one). Global by design.
function saveArtistStyleById(id, style) {
  const d = readJSON(artistsPath, { artists: [] });
  const a = (d.artists || []).find((x) => x.id === id);
  if (!a) throw new Error('artist not found');
  a.style = style || '';
  fs.writeFileSync(artistsPath, JSON.stringify(d, null, 2));
  return { id: a.id };
}

function locationsFor(gameSlug) {
  const g = gamePaths(gameSlug);
  const pack = readJSON(g.pack, { rooms: [] });
  const images = (readJSON(g.manifest, { images: {} }).images) || {};
  const style = gameStyle(gameSlug);
  // Artist-name lookup so audition pieces can show WHO made them on the location page.
  const artists = (readJSON(artistsPath, { artists: [] }).artists) || [];
  const artName = (id) => { const a = artists.find((x) => x.id === id); return a ? a.name : id; };
  // All audition images for this game, parsed once: scene-slug → [{id, file, artist}].
  // Audition candidate ids carry an "aud:" prefix so the client/promote/reject can tell
  // them apart from native _review candidates (different dir + a tag chip).
  const audByScene = {};
  if (fs.existsSync(g.audition)) {
    for (const f of fs.readdirSync(g.audition).filter((n) => /\.png$/i.test(n)).sort()) {
      const m = f.match(/^(.+?)__(.+?)__/);   // <artist>__<scene>__<tag>-rN.png
      if (!m) continue;
      (audByScene[m[2]] = audByScene[m[2]] || []).push({ id: 'aud:' + f, file: f, artist: m[1] });
    }
  }
  // Resolve a candidate id (native or aud:) to its on-disk path.
  const candPath = (f) => (f.indexOf('aud:') === 0 ? path.join(g.audition, f.slice(4)) : path.join(g.review, f));
  return pack.rooms.map((r) => {
    const at = (r.prompt || '').indexOf(' Scene:');
    // Scene default = the visual-core scene the pack already scraped (text after "Scene:").
    const sceneDefault = at >= 0 ? r.prompt.slice(at + ' Scene:'.length).trim() : (r.description || '');
    const audPieces = audByScene[r.slug] || [];
    const candidates = candidatesFor(g, r.slug).concat(audPieces.map((p) => p.id));
    const auditions = {};   // id → {artist, artistName} for the aud: candidates (location-page tag)
    for (const p of audPieces) auditions[p.id] = { artist: p.artist, artistName: artName(p.artist) };
    const candidatePrompts = {};   // sidecar: the exact prompt that made each image
    const mtimes = {};             // candidate id → file mtime (ms) so the client can sort by date
    // Per-candidate provenance for the thumbnail chip: artist + model tag. Artist comes from the
    // .json sidecar (regen/batch write it), falling back to the game's selected artist for legacy
    // images; modelTag is only needed for untagged batch files (regen/audition carry it in the name).
    const candMeta = {};
    const selId = (readJSON(g.selArtist, {}) || {}).id;
    const selArtistName = selId ? artName(selId) : '';
    for (const f of candidates) {
      const tp = candPath(f).replace(/\.png$/i, '.txt');
      if (fs.existsSync(tp)) candidatePrompts[f] = fs.readFileSync(tp, 'utf8');
      try { mtimes[f] = fs.statSync(candPath(f)).mtimeMs; } catch (e) { mtimes[f] = 0; }
      let artistName = '', mtag = '';
      if (f.indexOf('aud:') === 0) {
        artistName = (auditions[f] && auditions[f].artistName) || selArtistName;
      } else {
        const meta = readJSON(candPath(f).replace(/\.png$/i, '.json'), null);
        if (meta) {
          artistName = meta.artistName || (meta.artistId && artName(meta.artistId)) || '';
          if (meta.provider) mtag = modelTag(meta.provider, meta.quality);
        }
        if (!artistName) artistName = selArtistName;
      }
      candMeta[f] = { artistName, modelTag: mtag };
    }
    // Which candidate is the in-game image? Committed is saved as `<slug>.png` (a copy), so
    // filenames never match — compare bytes instead so already-promoted images flag too.
    const committed = images[r.name] || null;
    let committedSource = null;
    if (committed) {
      const cp = path.join(g.dir, committed);
      if (fs.existsSync(cp)) {
        const cb = fs.readFileSync(cp);
        committedSource = candidates.find((f) => {
          const fp = candPath(f);
          if (!fs.existsSync(fp)) return false;
          const fb = fs.readFileSync(fp);
          return fb.length === cb.length && fb.equals(cb);
        }) || null;
      }
    }
    return {
      slug: r.slug, name: r.name, description: r.description || '', exits: r.exits || [],
      committed, committedSource, candidates, candidatePrompts, auditions, mtimes, candMeta,
      sceneDefault, sceneOverride: style.scenes[r.slug] || '',
    };
  });
}
// Short tag baked into the candidate filename so you can tell at a glance WHICH
// generator made each image: gem (Gemini), oai-low / oai-med / oai-high (OpenAI).
function modelTag(provider, quality) {
  if (provider === 'openai') return 'oai-' + ({ low: 'low', medium: 'med', high: 'high' }[quality] || 'low');
  return 'gem';
}
// Candidate name = <slug>-<tag>-r<N>.png. N is the next free index across ALL of this
// slug's candidates (tagged or legacy untagged), so numbers never collide between models.
function nextRegenName(g, slug, tag) {
  let max = 0;
  for (const f of candidatesFor(g, slug)) {
    const m = f.match(/-r(\d+)\.png$/i);   // trailing -rN, regardless of any model tag
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${slug}-${tag}-r${max + 1}.png`;
}
function promote(gameSlug, slug, candidate) {
  const g = gamePaths(gameSlug);
  // Audition pieces (aud:<file>) live in _audition/; native candidates in _review/.
  const src = candidate.indexOf('aud:') === 0
    ? path.join(g.audition, candidate.slice(4))
    : path.join(g.review, candidate);
  if (!fs.existsSync(src)) throw new Error('candidate not found');
  const destFile = `${slug}.png`;
  fs.copyFileSync(src, path.join(g.dir, destFile));
  const name = ((readJSON(g.pack, { rooms: [] }).rooms.find((r) => r.slug === slug)) || {}).name || slug;
  const manifest = readJSON(g.manifest, { game: gameSlug, images: {} });
  manifest.images = manifest.images || {};
  manifest.images[name] = destFile;
  fs.writeFileSync(g.manifest, JSON.stringify(manifest, null, 2));
  return { name, file: destFile };
}
function reject(gameSlug, candidate) {
  const g = gamePaths(gameSlug);
  // Audition pieces (aud:<file>) live in _audition/; native candidates in _review/.
  const isAud = candidate.indexOf('aud:') === 0;
  const dir = isAud ? g.audition : g.review;
  const name = isAud ? candidate.slice(4) : candidate;
  // Delete the candidate image AND its sidecars (prompt .txt + artist-tag .json — no orphans).
  for (const f of [name, name.replace(/\.png$/i, '.txt'), name.replace(/\.png$/i, '.json')]) {
    const p = path.join(dir, f);
    if (fs.existsSync(p)) fs.rmSync(p);
  }
}
// Timestamped server log line — goes to stdout, which artview.ps1 redirects to a
// file (tools/.artview-server.log) so a flashed-by gen can be reviewed after the fact.
// In-memory ring of recent log lines so the bottom-left "Logs" panel can review a gen that
// already flashed by (including FAILs, which the progress banner prunes 15s after finishing).
const LOG_RING = [];
const LOG_RING_MAX = 500;
function logLine(...parts) {
  const t = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const msg = parts.join(' ');
  console.log(`[${t}] ${msg}`);
  LOG_RING.push({ t, msg });
  if (LOG_RING.length > LOG_RING_MAX) LOG_RING.shift();
}
// In-flight generation registry — survives client navigation/reload because progress lives
// SERVER-side. The browser polls /api/jobs to render the progress banner and refresh on done.
const JOBS = new Map();
let jobSeq = 0;
// Concurrency limiter — prevents spawning dozens of child processes simultaneously.
const MAX_CONCURRENT_GENS = 2;
let _genActive = 0;
const _genQueue = [];
function scheduleGen(fn, label) {
  return new Promise((resolve, reject) => {
    const run = () => {
      _genActive++;
      if (label) logLine(`QUEUE  start  ${label}  active=${_genActive}  pending=${_genQueue.length}`);
      fn().then(resolve, reject).finally(() => {
        _genActive--;
        if (_genQueue.length) _genQueue.shift()();
      });
    };
    if (_genActive < MAX_CONCURRENT_GENS) run();
    else {
      if (label) logLine(`QUEUE  enqueue  ${label}  active=${_genActive}  pending=${_genQueue.length + 1}`);
      _genQueue.push(run);
    }
  });
}
function jobsList() {
  const now = Date.now();
  const out = [];
  for (const [id, j] of JOBS) {
    if (j.finishedAt && now - j.finishedAt > 15000) { JOBS.delete(id); continue; }  // prune stale
    out.push({ id, game: j.game, slug: j.slug, mode: j.mode, status: j.status, file: j.file,
      kind: j.kind || 'regen', artist: j.artist || null,
      error: j.error || null, elapsed: Math.round(((j.finishedAt || now) - j.startedAt) / 1000) });
  }
  return out;
}
function regen(gameSlug, slug, prompt, provider, quality, model, ref, refMode, artistId, artistName) {
  return new Promise((resolve, _reject) => {
    const g = gamePaths(gameSlug);
    fs.mkdirSync(g.review, { recursive: true });
    // Nano Banana Pro is still the gemini provider, just a pricier model → its own tag.
    const isPro = provider !== 'openai' && model === 'gemini-3-pro-image-preview';
    const tag = isPro ? 'gem-pro' : modelTag(provider, quality);
    const outName = nextRegenName(g, slug, tag);
    const out = path.join(g.review, outName);
    const prov = provider === 'openai' ? `openai/${quality || 'low'}` : (isPro ? 'gemini-pro' : 'gemini');
    // Register the job synchronously so the very next /api/jobs poll sees it (before this
    // request even responds — important, since the client fires regen and navigates away).
    const jobId = String(++jobSeq);
    JOBS.set(jobId, { game: gameSlug, slug, mode: prov, file: outName, status: 'queued', startedAt: Date.now() });
    const cliArgs = [path.join('tools', 'gen-room-images.cjs'), '--aspect', '3:4', '--prompt', prompt, '--out', out];
    if (provider === 'openai') {
      cliArgs.push('--provider', 'openai', '--quality', quality || 'low');
    } else if (model) {
      cliArgs.push('--model', model);
    }
    // Note-aware regen: feed the selected candidate back in. `ref` is a candidate filename in
    // this game's _review dir; refMode 'edit' = surgical img2img, 'style' = consistency chaining.
    let refNote = '';
    if (ref) {
      const refPath = path.join(g.review, path.basename(ref));
      if (fs.existsSync(refPath)) {
        const rm = refMode === 'edit' ? 'edit' : 'style';
        cliArgs.push('--ref', refPath, '--ref-mode', rm);
        refNote = `  [ref:${rm} ${path.basename(ref)}]`;
      }
    }
    scheduleGen(() => new Promise((innerResolve) => {
      const job = JOBS.get(jobId);
      if (job) job.status = 'running';
      logLine(`REGEN  ${gameSlug}/${slug}  via ${prov}${refNote}  → ${outName}`);
      const t0 = Date.now();
      execFile('node', cliArgs,
        { cwd: REPO, maxBuffer: 1 << 22 }, (err, stdout, stderr) => {
          const dt = ((Date.now() - t0) / 1000).toFixed(1);
          const job2 = JOBS.get(jobId);
          if (err || !fs.existsSync(out)) {
            const errBody = (stderr || stdout || (err && err.message) || 'unknown error');
            const msg = errBody.slice(0, 500);
            logLine(`REGEN  FAIL ${gameSlug}/${slug} (${dt}s): ${errBody.slice(0, 800)}`);
            if (job2) { job2.status = 'error'; job2.error = msg; job2.finishedAt = Date.now(); }
            _reject(new Error(msg));
          } else {
            // Artist tag — lets the Audition grid borrow this location image for (artist × scene).
            if (artistId) { try { fs.writeFileSync(out.replace(/\.png$/i, '.json'), JSON.stringify({ artistId, artistName: artistName || artistId, locSlug: slug }, null, 2)); } catch {} }
            logLine(`REGEN  OK   ${gameSlug}/${slug} (${dt}s) ${outName}`);
            if (job2) { job2.status = 'done'; job2.finishedAt = Date.now(); }
            resolve({ file: outName });
          }
          innerResolve();
        });
    }));
  });
}

function listGlyphs() {
  if (!fs.existsSync(glyphsDir)) return { selected: null, glyphs: [] };
  const selected = (readJSON(glyphSelPath, {}) || {}).id || null;
  const glyphs = fs.readdirSync(glyphsDir).filter((f) => /\.svg$/i.test(f)).sort()
    .map((f) => ({ id: f.replace(/\.svg$/i, ''), svg: fs.readFileSync(path.join(glyphsDir, f), 'utf8') }));
  return { selected, glyphs };
}
function selectGlyph(id) {
  if (!fs.existsSync(path.join(glyphsDir, `${id}.svg`))) throw new Error('glyph not found');
  fs.writeFileSync(glyphSelPath, JSON.stringify({ id }, null, 2) + '\n');
  return { selected: id };
}
function listArtists(gameSlug) {
  const d = readJSON(artistsPath, { artists: [] });
  const selected = gameSlug ? ((readJSON(gamePaths(gameSlug).selArtist, {}) || {}).id || null) : null;
  return { selected, artists: d.artists || [] };
}
// Create a new artist persona in the shared artists.json. id is slugified from the name
// (or supplied); name is required; summary/style optional. Returns the created artist.
function createArtist({ id, name, summary, goodFor, style }) {
  if (!name || !name.trim()) throw new Error('name required');
  const d = readJSON(artistsPath, { artists: [] });
  d.artists = d.artists || [];
  const slug = (id || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) throw new Error('could not derive an id from the name');
  if (d.artists.some((a) => a.id === slug)) throw new Error('an artist with id "' + slug + '" already exists');
  const artist = { id: slug, name: name.trim(), summary: (summary || '').trim(), goodFor: (goodFor || '').trim(), style: (style || '').trim(), examples: [] };
  d.artists.push(artist);
  fs.mkdirSync(artistsDir, { recursive: true });
  fs.writeFileSync(artistsPath, JSON.stringify(d, null, 2) + '\n');
  return artist;
}
function selectArtist(gameSlug, id) {
  const d = readJSON(artistsPath, { artists: [] });
  if (!(d.artists || []).some((a) => a.id === id)) throw new Error('artist not found');
  fs.writeFileSync(gamePaths(gameSlug).selArtist, JSON.stringify({ id }, null, 2) + '\n');
  return { selected: id };
}

// --- Audition: try N candidate artists against 4 representative scenes -------
// "Develop" an artist for a game by rendering a user-selected SUBSET of artists across
// the same 4 scenes (game's real Aesthetic + saved Scene prompts), compared side-by-side,
// then "Make house artist" commits one. Output lives in <game>/_audition/, named
// <artistId>__<sceneSlug>__<tag>-rN.png so a cell is one (artist × scene) and rN is its take.

// Compose the production-faithful prompt for one (scene × artist): App ▸ Artist ▸
// Aesthetic ▸ Scene. Mirrors the client composedPrompt() AND gen-room-images' compose,
// but lets us swap in an ARBITRARY artist (not the game's selected one).
function composedFor(slug, artistId, sceneSlug) {
  const arts = (readJSON(artistsPath, { artists: [] }).artists) || [];
  const a = arts.find((x) => x.id === artistId);
  const style = gameStyle(slug);
  const room = (readJSON(gamePaths(slug).pack, { rooms: [] }).rooms || []).find((r) => r.slug === sceneSlug) || {};
  const at = (room.prompt || '').indexOf('Scene:');
  const sceneDefault = at >= 0 ? room.prompt.slice(at + 'Scene:'.length).trim() : (room.description || '');
  const sc = (style.scenes[sceneSlug] && style.scenes[sceneSlug].trim()) || room.description || sceneDefault || '';
  // Artist LEADS + governs lighting (see ARTIST_LEAD). Order: Artist ▸ Scene ▸ Aesthetic ▸ App.
  return [a && a.style ? (a.style + ' ' + ARTIST_LEAD) : '', sc ? ('Scene: ' + sc) : '',
    style.aesthetic ? ('Aesthetic: ' + cap(style.aesthetic)) : '', appPrompt()].filter(Boolean).join(' ');
}
// Heuristic scene classifier so we can auto-suggest a stress-test trio: one exterior
// (weather/light), one dim interior (chiaroscuro/darks), one signature room. Best-effort
// only — the user overrides in the UI.
function classifyRoom(r) {
  const t = ((r.description || '') + ' ' + (r.name || '')).toLowerCase();
  if (/\b(exterior|outside|outdoor|street|alley|courtyard|garden|road|lane|bridge|square|hill|forest|yard|cliff|shore|beach|field|heath|grave|cemetery|path|woods|moor|dock|pier|rooftop)\b/.test(t)) return 'exterior';
  if (/\b(dim|dark|murky|shadow|gloom|cellar|basement|crypt|dungeon|cave|tomb|vault|attic|tunnel)\b/.test(t)) return 'dim-interior';
  return 'interior';
}
function suggestScenes(slug) {
  const rooms = (readJSON(gamePaths(slug).pack, { rooms: [] }).rooms) || [];
  if (!rooms.length) return [];
  const pick = [];
  const ext = rooms.find((r) => classifyRoom(r) === 'exterior');
  const dim = rooms.find((r) => classifyRoom(r) === 'dim-interior');
  if (ext) pick.push(ext.slug);
  if (dim) pick.push(dim.slug);
  // signature = the richest remaining room (longest description), as a proxy for "the money shot".
  const rest = rooms.filter((r) => !pick.includes(r.slug)).sort((a, b) => (b.description || '').length - (a.description || '').length);
  for (const r of rest) { if (pick.length >= 4) break; pick.push(r.slug); }
  return pick.slice(0, 4);
}
function listAuditionImages(slug) {
  const dir = gamePaths(slug).audition;
  const out = {};   // "artistId__sceneSlug" → [{file, prompt}] (sorted, latest last)
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).filter((n) => /\.png$/i.test(n)).sort()) {
    const m = f.match(/^(.+?)__(.+?)__/);   // <artist>__<scene>__<tag>-rN.png
    if (!m) continue;
    const key = m[1] + '__' + m[2];
    const tp = path.join(dir, f.replace(/\.png$/i, '.txt'));
    (out[key] = out[key] || []).push({ file: f, prompt: fs.existsSync(tp) ? fs.readFileSync(tp, 'utf8') : '' });
  }
  return out;
}
// Scan ALL artist-tagged images outside _audition (sandbox renders + tagged _review
// candidates) and group by "artistId__locSlug", keeping the LATEST by file mtime. Lets the
// audition grid borrow an image already made for that artist+location elsewhere. Untagged
// legacy images (no .json sidecar) are simply skipped — nothing to match them on.
function scanTaggedImages(slug) {
  const g = gamePaths(slug);
  const best = {};   // key → { file, source, prompt, mtime }
  const consider = (key, file, source, prompt, mtime) => {
    if (!best[key] || mtime > best[key].mtime) best[key] = { file, source, prompt, mtime };
  };
  const scan = (dir, source) => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir).filter((n) => /\.png$/i.test(n))) {
      const meta = readJSON(path.join(dir, f.replace(/\.png$/i, '.json')), null);
      if (!meta || !meta.artistId || !meta.locSlug) continue;
      let mtime = 0; try { mtime = fs.statSync(path.join(dir, f)).mtimeMs; } catch {}
      const tp = path.join(dir, f.replace(/\.png$/i, '.txt'));
      const prompt = fs.existsSync(tp) ? fs.readFileSync(tp, 'utf8') : (meta.prompt || '');
      consider(meta.artistId + '__' + meta.locSlug, f, source, prompt, mtime);
    }
  };
  scan(g.sandbox, 'sandbox');
  scan(g.review, 'review');
  return best;
}
function auditionState(slug) {
  const cfg = readJSON(gamePaths(slug).auditionCfg, {});
  const rooms = (readJSON(gamePaths(slug).pack, { rooms: [] }).rooms) || [];
  const roomName = (s) => { const r = rooms.find((x) => x.slug === s); return r ? r.name : s; };
  const scenes = (cfg.scenes && cfg.scenes.length ? cfg.scenes : suggestScenes(slug)).slice(0, 4);
  const arts = (readJSON(artistsPath, { artists: [] }).artists) || [];
  // Absent cfg.artists → default to all; an explicit [] (user clicked "Select none") → none.
  // Don't collapse empty-vs-absent with .length, or "Select none" reads back as "Select all".
  const selArtists = Array.isArray(cfg.artists) ? cfg.artists : arts.map((a) => a.id);
  // Finalists = the audition shortlist — a separate flag from the grid checkbox (cfg.artists).
  // Non-destructive: a culled artist stays in the grid, just unstarred. Empty by default.
  const finalists = cfg.finalists || [];
  const native = listAuditionImages(slug);
  // Borrowed = a tagged image made elsewhere for this artist+location, ONLY for cells with no
  // native audition image (native always wins). Keyed the same "artistId__sceneSlug" as native.
  const tagged = scanTaggedImages(slug);
  const borrowed = {};
  for (const key of Object.keys(tagged)) { if (!native[key]) borrowed[key] = tagged[key]; }
  return {
    slug,
    scenes: scenes.map((s) => ({ slug: s, name: roomName(s) })),
    allScenes: rooms.map((r) => ({ slug: r.slug, name: r.name })),
    artists: arts.map((a) => ({ id: a.id, name: a.name, summary: a.summary || '', goodFor: a.goodFor || '', style: a.style || '', selected: selArtists.includes(a.id), finalist: finalists.includes(a.id) })),
    houseArtist: (readJSON(gamePaths(slug).selArtist, {}) || {}).id || null,
    images: native,
    borrowed,
  };
}
function saveAuditionCfg(slug, scenes, artists) {
  const p = gamePaths(slug).auditionCfg;
  const d = readJSON(p, {});
  if (Array.isArray(scenes)) d.scenes = scenes.filter(Boolean).slice(0, 4);
  if (Array.isArray(artists)) d.artists = artists.filter(Boolean);
  fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n');
  return { ok: true };
}
// Toggle one artist's finalist (shortlist) flag. Independent of the grid checkbox — driven
// from the row's ☆/★ button and from the lightbox (F). Persists cfg.finalists in audition.json.
function toggleFinalist(slug, artistId, on) {
  const p = gamePaths(slug).auditionCfg;
  const d = readJSON(p, {});
  const set = new Set(d.finalists || []);
  if (on) set.add(artistId); else set.delete(artistId);
  d.finalists = [...set];
  fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n');
  return { ok: true, finalist: !!on, finalists: d.finalists };
}
// Generate one audition cell (scene × artist). Same execFile/JOBS plumbing as regen(),
// but composes the prompt server-side for the chosen artist and writes to _audition/.
function auditionGen(slug, sceneSlug, artistId, provider, quality, model) {
  return new Promise((resolve, _reject) => {
    const g = gamePaths(slug);
    fs.mkdirSync(g.audition, { recursive: true });
    const prompt = composedFor(slug, artistId, sceneSlug);
    const isPro = provider !== 'openai' && model === 'gemini-3-pro-image-preview';
    const tag = isPro ? 'gem-pro' : modelTag(provider, quality);
    const base = `${artistId}__${sceneSlug}`;
    let max = 0;
    for (const f of fs.readdirSync(g.audition)) {
      if (f.startsWith(base + '__')) { const m = f.match(/-r(\d+)\.png$/i); if (m) max = Math.max(max, parseInt(m[1], 10)); }
    }
    const outName = `${base}__${tag}-r${max + 1}.png`;
    const out = path.join(g.audition, outName);
    const prov = provider === 'openai' ? `openai/${quality || 'low'}` : (isPro ? 'gemini-pro' : 'gemini');
    const jobId = String(++jobSeq);
    JOBS.set(jobId, { game: slug, slug: sceneSlug, kind: 'audition', artist: artistId, mode: prov, file: outName, status: 'queued', startedAt: Date.now() });
    const cliArgs = [path.join('tools', 'gen-room-images.cjs'), '--aspect', '3:4', '--prompt', prompt, '--out', out];
    if (provider === 'openai') cliArgs.push('--provider', 'openai', '--quality', quality || 'low');
    else if (model) cliArgs.push('--model', model);
    // Fire-and-forget: respond immediately, process via the concurrency queue.
    // Client polls /api/jobs to track progress and refresh the grid on completion.
    // On HTTP 429 (rate limit), the slot is released and the job re-queued after a backoff.
    logLine(`AUDIT  REQ   ${slug}/${sceneSlug} × ${artistId}  via ${prov}  job=${jobId}`);
    const attemptAudit = (retryNum) => () => new Promise((innerResolve) => {
      const job = JOBS.get(jobId);
      if (job) job.status = 'running';
      const retryNote = retryNum ? ` (retry ${retryNum})` : '';
      logLine(`AUDIT  START ${slug}/${sceneSlug} × ${artistId}${retryNote}  → ${outName}`);
      const t0 = Date.now();
      execFile('node', cliArgs, { cwd: REPO, maxBuffer: 1 << 22 }, (err, stdout, stderr) => {
        const dt = ((Date.now() - t0) / 1000).toFixed(1);
        const job2 = JOBS.get(jobId);
        const errBody = (stderr || stdout || (err && err.message) || 'unknown error');
        if ((err || !fs.existsSync(out)) && /429|rate.?limit/i.test(errBody) && retryNum < 4) {
          const delayMs = (retryNum + 1) * 45000;
          logLine(`AUDIT  RLIMIT ${slug}/${sceneSlug} × ${artistId} (${dt}s) — retry ${retryNum + 1}/4 in ${delayMs / 1000}s`);
          if (job2) { job2.status = 'queued'; job2.startedAt = Date.now() + delayMs; }
          innerResolve(); // release slot now; re-enqueue after backoff
          setTimeout(() => scheduleGen(attemptAudit(retryNum + 1), `${artistId}×${sceneSlug} retry${retryNum + 1}`), delayMs);
        } else if (err || !fs.existsSync(out)) {
          const msg = errBody.slice(0, 500);
          logLine(`AUDIT  FAIL ${slug}/${sceneSlug} × ${artistId} (${dt}s): ${errBody.slice(0, 800)}`);
          if (job2) { job2.status = 'error'; job2.error = msg; job2.finishedAt = Date.now(); }
          innerResolve();
        } else {
          logLine(`AUDIT  OK   ${slug}/${sceneSlug} × ${artistId} (${dt}s) ${outName}`);
          if (job2) { job2.status = 'done'; job2.finishedAt = Date.now(); }
          innerResolve();
        }
      });
    });
    scheduleGen(attemptAudit(0), `${artistId}×${sceneSlug}`);
    resolve({ file: outName });
  });
}
// --- Sandbox: free-play prompt tweaking, no commit ---------------------------
// A scratch workbench where ALL four layers (App/Artist/Aesthetic/Scene) are editable and
// renders pile up in <game>/_sandbox/ WITHOUT touching artists.json or the location review.
// Each render carries a JSON sidecar holding the exact field values that produced it, so
// clicking a render in the UI repopulates every editable field. Commit (if wanted) is the
// existing createArtist / saveArtistStyleById path. Mirrors the audition gen plumbing.
function composeInline(f) {
  f = f || {};
  return [f.app || '', f.artist ? ('Artist: ' + f.artist) : '', f.aesthetic ? ('Aesthetic: ' + cap(f.aesthetic)) : '',
    f.scene ? ('Scene: ' + f.scene) : ''].filter(Boolean).join(' ');
}
const sbxRev = (f) => { const m = f.match(/^sbx-r(\d+)\.png$/i); return m ? parseInt(m[1], 10) : 0; };
function sandboxState(slug) {
  const dir = gamePaths(slug).sandbox;
  const images = [];
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).filter((n) => /^sbx-r\d+\.png$/i.test(n)).sort((a, b) => sbxRev(a) - sbxRev(b))) {
      const meta = readJSON(path.join(dir, f.replace(/\.png$/i, '.json')), {});
      const tp = path.join(dir, f.replace(/\.png$/i, '.txt'));
      images.push({ file: f, prompt: fs.existsSync(tp) ? fs.readFileSync(tp, 'utf8') : (meta.prompt || ''), ...meta });
    }
  }
  return { slug, images };
}
function sandboxReject(slug, file) {
  const dir = gamePaths(slug).sandbox;
  const base = path.basename(file);
  if (!/^sbx-r\d+\.png$/i.test(base)) throw new Error('bad sandbox file');
  for (const f of [base, base.replace(/\.png$/i, '.txt'), base.replace(/\.png$/i, '.json')]) {
    const p = path.join(dir, f);
    if (fs.existsSync(p)) fs.rmSync(p);
  }
  return {};
}
// Copy an existing image (a location candidate/committed, an audition piece, or another
// sandbox render) INTO _sandbox as a new sbx-rN, with a sidecar built from the current layer
// fields — so "Sandbox!" lands you on that picture, selected, ready to tweak. The .txt prompt
// is the source's own recorded prompt when present (its true provenance), else the composed.
function sandboxAdopt(slug, srcKind, srcFile, fields, meta) {
  const g = gamePaths(slug);
  fs.mkdirSync(g.sandbox, { recursive: true });
  const base = path.basename((srcFile || '').replace(/^aud:/, ''));
  if (!base) throw new Error('no source image');
  const cands = srcKind === 'audition' ? [path.join(g.audition, base)]
    : srcKind === 'sandbox' ? [path.join(g.sandbox, base)]
    : [path.join(g.review, base), path.join(g.dir, base)];   // review → committed fallback
  const srcPath = cands.find((p) => fs.existsSync(p));
  if (!srcPath) throw new Error('source image not found');
  let max = 0;
  for (const f of fs.readdirSync(g.sandbox)) { const m = f.match(/^sbx-r(\d+)\.png$/i); if (m) max = Math.max(max, parseInt(m[1], 10)); }
  const outName = `sbx-r${max + 1}.png`;
  const out = path.join(g.sandbox, outName);
  fs.copyFileSync(srcPath, out);
  const stp = srcPath.replace(/\.png$/i, '.txt');
  const prompt = fs.existsSync(stp) ? fs.readFileSync(stp, 'utf8') : composeInline(fields);
  fs.writeFileSync(out.replace(/\.png$/i, '.txt'), prompt);
  fs.writeFileSync(out.replace(/\.png$/i, '.json'), JSON.stringify({ ...(meta || {}), ...(fields || {}), prompt }, null, 2));
  return { file: outName };
}
function sandboxGen(slug, fields, meta, provider, quality, model) {
  return new Promise((resolve, _reject) => {
    const g = gamePaths(slug);
    fs.mkdirSync(g.sandbox, { recursive: true });
    const prompt = composeInline(fields);
    let max = 0;
    for (const f of fs.readdirSync(g.sandbox)) { const m = f.match(/^sbx-r(\d+)\.png$/i); if (m) max = Math.max(max, parseInt(m[1], 10)); }
    const outName = `sbx-r${max + 1}.png`;
    const out = path.join(g.sandbox, outName);
    const isPro = provider !== 'openai' && model === 'gemini-3-pro-image-preview';
    const prov = provider === 'openai' ? `openai/${quality || 'low'}` : (isPro ? 'gemini-pro' : 'gemini');
    const jobId = String(++jobSeq);
    JOBS.set(jobId, { game: slug, slug: outName, kind: 'sandbox', mode: prov, file: outName, status: 'queued', startedAt: Date.now() });
    const cliArgs = [path.join('tools', 'gen-room-images.cjs'), '--aspect', '3:4', '--prompt', prompt, '--out', out];
    if (provider === 'openai') cliArgs.push('--provider', 'openai', '--quality', quality || 'low');
    else if (model) cliArgs.push('--model', model);
    scheduleGen(() => new Promise((innerResolve) => {
      const job = JOBS.get(jobId);
      if (job) job.status = 'running';
      logLine(`SANDBOX ${slug}  via ${prov}  → ${outName}`);
      const t0 = Date.now();
      execFile('node', cliArgs, { cwd: REPO, maxBuffer: 1 << 22 }, (err, stdout, stderr) => {
        const dt = ((Date.now() - t0) / 1000).toFixed(1);
        const job2 = JOBS.get(jobId);
        if (err || !fs.existsSync(out)) {
          const errBody = (stderr || stdout || (err && err.message) || 'unknown error');
          const msg = errBody.slice(0, 500);
          logLine(`SANDBOX FAIL ${slug} (${dt}s): ${errBody.slice(0, 800)}`);
          if (job2) { job2.status = 'error'; job2.error = msg; job2.finishedAt = Date.now(); }
          _reject(new Error(msg));
        } else {
          // Structured sidecar — lets a click on this render restore EVERY editable field.
          try { fs.writeFileSync(out.replace(/\.png$/i, '.json'), JSON.stringify({ ...(meta || {}), ...(fields || {}), prompt }, null, 2)); } catch {}
          logLine(`SANDBOX OK   ${slug} (${dt}s) ${outName}`);
          if (job2) { job2.status = 'done'; job2.finishedAt = Date.now(); }
          resolve({ file: outName });
        }
        innerResolve();
      });
    }), `sandbox:${slug}`);
  });
}

// A note value is either a plain string (legacy / open) or an object
// {note, status:"open"|"resolved"|"wontfix", appliedTo?, resolved?}. The AI flags notes
// it has acted on (so they don't resurface); the reviewer greys them out. Retrieval never
// auto-flags — status is only set by an explicit decision (here or by a direct file edit).
const noteText = (v) => (v == null ? '' : (typeof v === 'string' ? v : (v.note || '')));
const noteStatus = (v) => (v && typeof v === 'object' && v.status) ? v.status : 'open';

function saveNote(key, text) {
  const n = readJSON(notesPath, {});
  if (!text || !text.trim()) { delete n[key]; fs.writeFileSync(notesPath, JSON.stringify(n, null, 2)); return { ok: true, note: null }; }
  const prev = n[key];
  if (prev && typeof prev === 'object') {
    // Editing the TEXT of a flagged note re-opens it (drops appliedTo/resolved); an
    // unchanged blur leaves the flag intact. The user touching a note un-resolves it.
    n[key] = (prev.note || '') !== text ? { note: text, status: 'open' } : prev;
  } else {
    n[key] = text;
  }
  fs.writeFileSync(notesPath, JSON.stringify(n, null, 2));
  return { ok: true, note: n[key] };
}
// Mark a note resolved / wontfix / reopen. resolved/wontfix stamp a timestamp (+ optional
// appliedTo); reopen collapses the note back to a plain string. Called by the UI and mirrors
// the shape the AI writes directly into _review-notes.json.
function setNoteStatus(key, status, appliedTo, stamp) {
  const n = readJSON(notesPath, {});
  const text = noteText(n[key]);
  if (!text) throw new Error('no note to flag');
  if (status === 'open') {
    n[key] = text;
  } else if (status === 'resolved' || status === 'wontfix') {
    const obj = { note: text, status };
    if (appliedTo) obj.appliedTo = appliedTo;
    obj.resolved = stamp || new Date().toISOString();
    n[key] = obj;
  } else {
    throw new Error('bad status');
  }
  fs.writeFileSync(notesPath, JSON.stringify(n, null, 2));
  return { ok: true, note: n[key] };
}

// --- HTTP -------------------------------------------------------------------
const sendJSON = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
function sendImg(res, file) {
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}
const readBody = (req) => new Promise((resolve) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
});

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${port}`);
  const q = u.searchParams;
  try {
    // no-store so F5 (and the BOOT_ID auto-reload) always refetch the live PAGE — otherwise the
    // --app window serves a cached copy and code changes don't show up on refresh.
    if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }); res.end(PAGE); return; }
    if (u.pathname === '/api/state') {
      const games = listGames();
      // No server-side focus game — the client restores its last spot from localStorage and
      // falls back to the first game only on a brand-new browser. defaultGame is always null.
      return sendJSON(res, 200, { games, defaultGame: null, notes: readJSON(notesPath, {}) });
    }
    if (u.pathname === '/api/game') {
      const s = q.get('slug');
      return sendJSON(res, 200, { slug: s, aesthetic: gameStyle(s).aesthetic, artist: artistSignatureFor(s), app: appPrompt(), locations: locationsFor(s), blockouts: blockoutsFor(s) });
    }
    // The generic 3D blockout renderer (served from disk so artview is self-contained on :3009).
    if (u.pathname === '/blockout') {
      const f = path.join(IMAGES_ROOT, '_blockout', 'renderer.html');
      if (!fs.existsSync(f)) { res.writeHead(404); res.end('no renderer'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(f)); return;
    }
    // All blockouts across all games (for the Blockout rail section, grouped by game).
    if (u.pathname === '/api/blockouts') {
      const all = [];
      for (const g of listGames()) for (const b of blockoutsFor(g)) all.push({ game: g, ...b });
      return sendJSON(res, 200, { blockouts: all });
    }
    // Per-member canon prose + scene + saved note (renderer's description panel).
    if (u.pathname === '/api/blockout-info') return sendJSON(res, 200, { rooms: blockoutInfo(q.get('game'), q.get('volume')) });
    // All kept gens for a volume (the gallery), newest first.
    if (u.pathname === '/api/blockout-gens') {
      const game = q.get('game') || '', dir = blockoutGenDir(game, q.get('volume') || ''); const out = [];
      const notes = readJSON(notesPath, {});   // image notes share the reviewer's _review-notes.json
      if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter((n) => /-r\d+\.png$/i.test(n))) {
        const view = f.split('__')[0], key = `game:${game}:${view}:${f}`;
        let prompt = ''; try { prompt = fs.readFileSync(path.join(dir, f.replace(/\.png$/i, '.txt')), 'utf8'); } catch (e) {}
        out.push({ file: f, view, mtime: fs.statSync(path.join(dir, f)).mtimeMs, key, note: noteText(notes[key]), status: noteStatus(notes[key]), prompt }); }
      out.sort((a, b) => b.mtime - a.mtime);
      return sendJSON(res, 200, { gens: out });
    }
    if (u.pathname === '/img/blockout') return sendImg(res, path.join(blockoutGenDir(q.get('game') || '', q.get('volume') || ''), path.basename(q.get('f') || '')));
    // Scene-def JSON for a game's volume (the renderer fetches this via ?src=).
    if (u.pathname === '/api/blockout') {
      const f = path.join(gamePaths(q.get('game') || '').blockout, path.basename(q.get('volume') || '') + '.scene.json');
      if (!fs.existsSync(f)) return sendJSON(res, 404, { error: 'no such blockout' });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(f)); return;
    }
    if (u.pathname === '/api/jobs') return sendJSON(res, 200, { jobs: jobsList(), boot: BOOT_ID });
    if (u.pathname === '/api/logs') return sendJSON(res, 200, { logs: LOG_RING, boot: BOOT_ID });
    if (u.pathname === '/api/glyphs') return sendJSON(res, 200, listGlyphs());
    if (u.pathname === '/api/artists') return sendJSON(res, 200, listArtists(q.get('game')));
    if (u.pathname === '/api/audition') return sendJSON(res, 200, auditionState(q.get('game')));
    if (u.pathname === '/api/sandbox') return sendJSON(res, 200, sandboxState(q.get('game')));
    if (u.pathname === '/img/audition') return sendImg(res, path.join(gamePaths(q.get('game') || '').audition, path.basename(q.get('f') || '')));
    if (u.pathname === '/img/sandbox') return sendImg(res, path.join(gamePaths(q.get('game') || '').sandbox, path.basename(q.get('f') || '')));
    if (u.pathname === '/img/review') return sendImg(res, path.join(gamePaths(q.get('game') || '').review, path.basename(q.get('f') || '')));
    if (u.pathname === '/img/committed') return sendImg(res, path.join(gamePaths(q.get('game') || '').dir, path.basename(q.get('f') || '')));
    if (u.pathname === '/img/artist') return sendImg(res, path.join(artistsDir, path.basename(q.get('f') || '')));

    if (req.method === 'POST') {
      const body = await readBody(req);
      const wrap = (fn) => { try { return sendJSON(res, 200, { ok: true, ...fn() }); } catch (e) { return sendJSON(res, 500, { ok: false, error: e.message }); } };
      if (u.pathname === '/api/promote') return wrap(() => promote(body.game, body.slug, body.candidate));
      if (u.pathname === '/api/reject') return wrap(() => { reject(body.game, body.candidate); return {}; });
      if (u.pathname === '/api/select-glyph') return wrap(() => selectGlyph(body.id));
      if (u.pathname === '/api/select-artist') return wrap(() => selectArtist(body.game, body.id));
      if (u.pathname === '/api/artist-create') return wrap(() => ({ artist: createArtist(body) }));
      if (u.pathname === '/api/app-prompt') return wrap(() => saveAppPrompt(body.prompt));
      if (u.pathname === '/api/style') return wrap(() => saveStyle(body.game, body.aesthetic));
      if (u.pathname === '/api/artist-style') return wrap(() => saveArtistStyle(body.game, body.style));
      if (u.pathname === '/api/artist-style-by-id') return wrap(() => saveArtistStyleById(body.id, body.style));
      if (u.pathname === '/api/blockout-camera') return wrap(() => saveBlockoutCamera(body));
      if (u.pathname === '/api/blockout-part') return wrap(() => saveBlockoutPart(body));
      if (u.pathname === '/api/blockout-gen-delete') return wrap(() => deleteBlockoutGen(body));
      if (u.pathname === '/api/blockout-note') return wrap(() => saveBlockoutNote(body));
      if (u.pathname === '/api/blockout-gen') {
        try { const r = await blockoutGen(body); return sendJSON(res, 200, { ok: true, ...r }); }
        catch (e) { return sendJSON(res, 500, { ok: false, error: e.message }); }
      }
      if (u.pathname === '/api/scene') return wrap(() => saveScene(body.game, body.slug, body.tail));
      if (u.pathname === '/api/description') return wrap(() => saveDescription(body.game, body.slug, body.text));
      if (u.pathname === '/api/note') return wrap(() => saveNote(body.key, body.text));
      if (u.pathname === '/api/note-status') return wrap(() => setNoteStatus(body.key, body.status, body.appliedTo));
      if (u.pathname === '/api/regen') {
        try { const r = await regen(body.game, body.slug, body.prompt, body.provider, body.quality, body.model, body.ref, body.refMode, body.artistId, body.artistName); return sendJSON(res, 200, { ok: true, ...r }); }
        catch (e) { return sendJSON(res, 500, { ok: false, error: e.message }); }
      }
      if (u.pathname === '/api/audition-config') return wrap(() => saveAuditionCfg(body.game, body.scenes, body.artists));
      if (u.pathname === '/api/audition-finalist') return wrap(() => toggleFinalist(body.game, body.artist, body.on));
      if (u.pathname === '/api/audition-gen') {
        try { const r = await auditionGen(body.game, body.scene, body.artist, body.provider, body.quality, body.model); return sendJSON(res, 200, { ok: true, ...r }); }
        catch (e) { return sendJSON(res, 500, { ok: false, error: e.message }); }
      }
      if (u.pathname === '/api/sandbox-reject') return wrap(() => sandboxReject(body.game, body.file));
      if (u.pathname === '/api/sandbox-adopt') return wrap(() => sandboxAdopt(body.game, body.srcKind, body.srcFile, body.fields, body.meta));
      if (u.pathname === '/api/sandbox-gen') {
        try { const r = await sandboxGen(body.game, body.fields, body.meta, body.provider, body.quality, body.model); return sendJSON(res, 200, { ok: true, ...r }); }
        catch (e) { return sendJSON(res, 500, { ok: false, error: e.message }); }
      }
    }
    res.writeHead(404); res.end();
  } catch (e) { sendJSON(res, 500, { ok: false, error: e.message }); }
});

const noOpen = args.includes('--no-open');
const url = `http://localhost:${port}`;
function openBrowser(target) {
  if (noOpen) return;
  const p = process.platform;
  const [cmd, cmdArgs] = p === 'win32' ? ['cmd', ['/c', 'start', '""', target]]
    : p === 'darwin' ? ['open', [target]] : ['xdg-open', [target]];
  try { require('child_process').spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true }).unref(); } catch {}
}
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') { console.log(`Review server already running on ${port} — opening the UI.`); openBrowser(url); process.exit(0); }
  console.error(e.message); process.exit(1);
});
server.listen(port, () => { console.log(`\nLocation-art review server (all games)\n  → ${url}\n`); openBrowser(url); });

// --- client page ------------------------------------------------------------
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Art Review</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;font:15px/1.5 system-ui,sans-serif;background:#0d0b12;color:#e8e4ee;display:flex;height:100vh}
  #rail{flex:0 0 150px;border-right:1px solid #2a2536;padding:12px 8px;display:flex;flex-direction:column;gap:4px;overflow-y:auto}
  #rail .brand{font-size:12px;color:#8a8398;text-transform:uppercase;letter-spacing:.08em;margin:2px 6px 8px}
  #rail .sep{height:1px;background:#2a2536;margin:8px 4px}
  /* Browser-style back/forward over (topic,item) navigation history. */
  #rail .navbtns{display:flex;gap:4px;margin:0 4px 8px}
  #rail .navbtns button{flex:1;font:inherit;font-size:11px;padding:4px 6px;border-radius:6px;border:1px solid #3a3450;background:#1f1b2c;color:#cbbf9a;cursor:pointer;white-space:nowrap}
  #rail .navbtns button:hover:not(:disabled){background:#2a2440;border-color:#c4a35a;color:#fff}
  #rail .navbtns button:disabled{opacity:.35;cursor:default}
  .topic{padding:9px 12px;border-radius:8px;cursor:pointer;font-weight:600;text-transform:capitalize}
  .topic:hover{background:#1a1722}
  .topic.active{background:#2a2440;color:#c4a35a;box-shadow:inset 3px 0 0 #c4a35a}
  #items{flex:0 0 246px;border-right:1px solid #2a2536;display:flex;flex-direction:column}
  #itemhead{padding:12px 12px 6px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#8a8398}
  #itemhead .newbtn{float:right;font:inherit;text-transform:none;letter-spacing:0;font-size:11px;padding:2px 8px;border-radius:6px;border:1px solid #3a3450;background:#1f1b2c;color:#c4a35a;cursor:pointer}
  #itemhead .newbtn:hover{background:#2a2440;border-color:#c4a35a;color:#fff}
  #itemfilter{margin:0 12px 6px;padding:6px 10px;font:inherit;font-size:13px;border-radius:6px;border:1px solid #3a3450;background:#16131f;color:#e8e3f0;outline:none}
  #itemfilter:focus{border-color:#c4a35a}
  #itemlist{flex:1;overflow-y:auto;padding:0 8px}
  .item{padding:8px 10px;border-radius:8px;cursor:pointer;display:flex;justify-content:space-between;gap:8px}
  .item:hover{background:#1a1722}
  .item.active{background:#2a2440;box-shadow:inset 3px 0 0 #c4a35a;color:#fff}
  .item .dot{font-size:11px;color:#6a6478}
  .item .dot.has{color:#9be8b0}
  #detail{flex:1;overflow:hidden;padding:0}
  #detail h1{font-family:Georgia,serif;font-size:24px;margin:0 0 4px}
  .sub{color:#b0a9c2;font-size:12px;margin-bottom:16px}
  /* Two-column location layout: fields/text left, big image preview right. */
  .loc-wrap{display:flex;height:100%;overflow:hidden}
  /* Content panel is the WIDEST; image panel is just wide enough for the (portrait) image. */
  .loc-left{flex:1;min-width:0;overflow-y:auto;padding:20px 26px;border-right:1px solid #2a2536}
  /* flex:0 0 auto → column shrinks to the (portrait) image, no dead width; max-width keeps
     the content panel the widest. The image fills the panel height. */
  .loc-right{flex:0 0 auto;max-width:46%;overflow:hidden;padding:14px;display:flex;align-items:center;justify-content:center;background:#0a0810}
  .cand{width:96px}
  .bigprev{height:100%;display:flex;align-items:center;justify-content:center;border-radius:12px;overflow:hidden}
  .bigprev img{height:100%;max-width:100%;width:auto;object-fit:contain;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.5);cursor:zoom-in}
  .bigprev.empty{color:#8c85a0;font-style:italic}
  .cands{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:8px}
  .candbar{display:flex;justify-content:flex-end;margin:2px 0 6px}
  .candbar label{font-size:12px;color:#9aa;display:flex;align-items:center;gap:6px}
  .candbar select{font-size:12px}
  .cand{width:190px;border:2px solid transparent;border-radius:10px;overflow:hidden;cursor:pointer;position:relative;
    background:#15121d;background-image:linear-gradient(45deg,#23202e 25%,transparent 25%,transparent 75%,#23202e 75%),linear-gradient(45deg,#23202e 25%,transparent 25%,transparent 75%,#23202e 75%);background-size:16px 16px;background-position:0 0,8px 8px}
  .cand.sel{border-color:#c4a35a;box-shadow:0 0 0 2px #c4a35a,0 0 16px rgba(196,163,90,.55)}
  .cand.sel .cap{background:#3a3015;color:#fff}
  .cand.sel::after{content:'✓ selected';position:absolute;top:6px;left:6px;background:#c4a35a;color:#0d0b12;font-size:10px;font-weight:700;padding:2px 6px;border-radius:5px}
  /* In-game = the committed image actually used by the game (distinct from "selected", which is the reviewer's in-app focus). Green corner pill, top-right, so it never collides with the gold "selected" pill. */
  .cand.committed::before{content:'★ in game';position:absolute;top:6px;right:6px;z-index:1;background:#9be8b0;color:#0d0b12;font-size:10px;font-weight:700;padding:2px 6px;border-radius:5px}
  .cand img{width:100%;display:block;aspect-ratio:3/4;object-fit:cover}
  .cand .cap{padding:5px 8px;font-size:12px;display:flex;justify-content:space-between;align-items:center;background:#15121d}
  .cand .badge{font-size:10px;color:#0d0b12;background:#9be8b0;border-radius:4px;padding:1px 5px}
  /* Model chip in the candidate caption — which generator made this image. */
  .mchip{display:inline-block;font-size:9px;font-weight:700;letter-spacing:.03em;padding:1px 5px;border-radius:4px;margin-right:6px;vertical-align:1px}
  .mchip.m-gem{background:#1d2a44;color:#8fb4ff}
  .mchip.m-oai{background:#0f2a28;color:#6fe0d6}
  .mchip.m-pro{background:#34234a;color:#d4a8ff}
  .mchip.m-aud{background:#2e2410;color:#e0b766}
  .mchip.m-art{background:#241a2e;color:#cdb4f0}
  .mchip.m-date{background:#1b1b1b;color:#9aa0a6}
  .cand .cap .meta{display:flex;flex-wrap:wrap;gap:3px;align-items:center}
  .cand .cap .meta .mchip{margin-right:0}
  /* Audition pieces bridged onto the location page — blue corner pill + dashed accent. */
  .cand.aud{border-color:#3a4f7a}
  .cand.aud::before{content:'audition';position:absolute;top:6px;right:6px;z-index:1;background:#4f7bd0;color:#0d0b12;font-size:10px;font-weight:700;padding:2px 6px;border-radius:5px}
  .cand.aud.committed::before{content:'★ in game'}
  .glyphbox{aspect-ratio:3/4;display:flex;align-items:center;justify-content:center;background:#0b0a0f;color:#c4a35a}
  .glyphbox svg{width:55%;height:55%;opacity:.8}
  .none{color:#8c85a0;font-style:italic;padding:24px 0}
  .btns{margin:14px 0 22px;display:flex;gap:10px;flex-wrap:wrap}
  button{font:inherit;padding:8px 14px;border-radius:8px;border:1px solid #3a3450;background:#1f1b2c;color:#e8e4ee;cursor:pointer}
  button:hover{background:#2a2440}
  button.primary{background:#7a5;border-color:#9be8b0;color:#0d0b12;font-weight:600}
  button.danger{border-color:#a55}
  button:disabled{opacity:.4;cursor:default}
  .genmode{font:inherit;padding:8px 10px;border-radius:8px;border:1px solid #3a3450;background:#1f1b2c;color:#e8e4ee;cursor:pointer;margin-left:auto}
  /* Regenerate mode toggle: [ Clean | +Notes | Edit img ] — how the selected image's note feeds the re-roll. */
  .segmode{display:inline-flex;border:1px solid #3a3450;border-radius:8px;overflow:hidden}
  .segmode button{border:none;border-radius:0;border-left:1px solid #3a3450;padding:8px 11px;background:#1f1b2c;color:#b6aecb}
  .segmode button:first-child{border-left:none}
  .segmode button.on{background:#2a2440;color:#c4a35a;font-weight:600}
  .segmode button:hover{background:#241f33}
  .sec{margin:14px 0}
  .sec label{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#8a8398;margin-bottom:5px}
  .sec label.ro{color:#c2bbd4}                       /* read-only field labels: brightened */
  .sec label.ed{color:#e0b766}                       /* editable fields: gold, stand out */
  .sec .val{background:#15121d;border:1px dashed #353047;border-radius:8px;padding:11px 13px;white-space:pre-wrap;
    color:#ddd8e8;font-family:system-ui,sans-serif;font-size:14px;line-height:1.5}
  /* A scope tag chip on each field label, color-coded by what the field controls. */
  .sec .tag{display:inline-block;font-size:9.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
    padding:1px 6px;border-radius:5px;margin-right:7px;vertical-align:1px}
  /* GLOBAL — constant across games / the game. Cool blue, locked-feeling. */
  .scope-global .tag{background:#1d2a44;color:#8fb4ff;border:1px solid #34507f}
  .scope-global .val{border-left:3px solid #4f7bd0}
  /* SCENE — applies only to this location. Purple. */
  .scope-scene .tag{background:#2c1f44;color:#c3a0ff;border:1px solid #4d3a7d}
  .scope-scene .val{border-left:3px solid #9a6cff}
  /* IN-GAME — canonical room prose (read-only reference), warm parchment tint. */
  .scope-ingame .tag{background:#3a2c16;color:#e9c98a;border:1px solid #6b5326}
  .scope-ingame .val{font-size:15px;color:#efe7d6;border-left:3px solid #c8a25a;background:#181410}
  /* In-game prose: neutral, squared-off mono container so the canonical room text reads like old-school game text. */
  .scope-ingame .val.ingame-prose{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,'Courier New',monospace;
    border-radius:0;border:1px solid #34323d;border-left:1px solid #34323d;background:#0b0b0d;color:#c7c5cf;font-size:13.5px;line-height:1.55}
  /* App layer (global, highest) — distinct rose accent. */
  .scope-app .tag{background:#3a1630;color:#ff9ad0;border:1px solid #7d3460}
  .scope-app .val{border-left:3px solid #d06ca0}
  /* DERIVED — the composed prompt, assembled from the layers. Neutral. */
  .scope-derived .tag{background:#23202e;color:#b6aecb;border:1px solid #3a3450}
  .scope-derived .val{border-left:3px solid #6a6478}
  /* PER-IMAGE — the actual prompt that made the selected image. Teal. */
  .scope-image .tag{background:#0f2a28;color:#6fe0d6;border:1px solid #2f6f6a}
  .scope-image .val{border:1px solid #2f6f6a;border-left:3px solid #5fc9c0;background:#0f1a1a;color:#cfeae7}
  /* EDITABLE — gold dot on the tag + gold-tinted textarea (see textarea.edit). */
  .scope-editable .tag{background:#3a3015;color:#e6c270;border:1px solid #6b5526}
  .sec textarea.scene-edit{font-family:system-ui,sans-serif;font-size:14px;line-height:1.5}
  textarea.edit{border:1px solid #5a4a2a;background:#1c1830;box-shadow:inset 0 0 0 9999px rgba(196,163,90,.04)}
  textarea.edit:focus{outline:none;border-color:#c4a35a;box-shadow:0 0 0 2px rgba(196,163,90,.35)}
  textarea{width:100%;background:#15121d;border:1px solid #2a2536;border-radius:8px;color:#e8e4ee;padding:11px 13px;font:14px/1.5 system-ui,sans-serif;resize:vertical}
  .sec textarea{min-height:80px}
  .promptbox{min-height:120px}
  /* Thumbnail magnifier — click to open full screen. */
  .cand .zoom{position:absolute;top:6px;right:6px;width:26px;height:26px;padding:0;border-radius:6px;font-size:13px;
    background:rgba(13,11,18,.78);border:1px solid #3a3450;line-height:1;display:flex;align-items:center;justify-content:center;opacity:.55}
  .cand:hover .zoom{opacity:1}
  .cand .zoom:hover{background:#2a2440;border-color:#c4a35a}
  #lb{position:fixed;inset:0;z-index:9999;background:rgba(6,5,9,.92);display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity .12s}
  #lb.show{opacity:1;pointer-events:auto;cursor:zoom-out}
  #lb img{max-width:88vw;max-height:92vh;border-radius:10px;box-shadow:0 16px 60px rgba(0,0,0,.7)}
  #lb .lbnav{position:absolute;top:0;bottom:0;width:90px;display:flex;align-items:center;justify-content:center;
    font-size:40px;color:#d8d2e6;cursor:pointer;user-select:none;background:none;border:none}
  #lb .lbnav:hover{color:#fff;background:rgba(255,255,255,.06)}
  #lb .lbprev{left:0}#lb .lbnext{right:0}
  #lb .lbcap{position:absolute;bottom:18px;left:50%;transform:translateX(-50%);background:#1a1722;color:#c2bbd4;
    padding:6px 14px;border-radius:8px;font-size:13px}
  /* Finalist toggle in the lightbox (audition mode only) — top-centre, mirrors the row button. */
  #lb .lbfin{position:absolute;top:18px;left:50%;transform:translateX(-50%);font-size:13px;padding:6px 14px;
    border-radius:8px;border:1px solid #3a3450;background:#1a1722;color:#cbbf9a;cursor:pointer}
  #lb .lbfin:hover{background:#2a2440;border-color:#c4a35a;color:#fff}
  #lb .lbfin.on{background:#c4a35a;border-color:#c4a35a;color:#0d0b12;font-weight:700}
  /* Per-image notes panel, right edge of the lightbox. Same notes store as the detail screen —
     shown for every zoomed image (location candidates, audition cells, artist examples). */
  #lb .lbnotes{position:absolute;top:0;right:0;height:100%;width:360px;box-sizing:border-box;cursor:default;
    background:#13111c;border-left:1px solid #2a2536;padding:52px 18px 18px;display:none;flex-direction:column;gap:8px;z-index:3}
  #lb.notes .lbnotes{display:flex}
  #lb.notes{padding-right:360px}
  #lb.notes .lbnext{right:360px}
  #lb .lbnotes label.ed{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#e0b766;margin-bottom:2px}
  #lb .lbnotefor{font-size:11.5px;color:#8a8398;word-break:break-word;line-height:1.4}
  #lb .lbnotes textarea.edit{flex:1;width:100%;box-sizing:border-box;min-height:120px;resize:none}
  /* Note flag chip + status actions. Resolved/wontfix grey the note so it reads as handled. */
  .noteflag:empty{display:none}
  .noteflag{font-size:10px;font-weight:700;letter-spacing:.04em;padding:1px 7px;border-radius:5px;margin-left:8px;vertical-align:1px}
  .noteflag.resolved{background:#13311f;color:#7fe0a0;border:1px solid #2f6f4a}
  .noteflag.wontfix{background:#3a1f1f;color:#e0908f;border:1px solid #7f3f3f}
  .noteacts{margin-top:8px}
  .noteacts:empty{display:none}
  .resolvebox{display:inline-flex;align-items:center;gap:7px;font-size:13px;color:#c2bbd4;cursor:pointer;user-select:none}
  .resolvebox input{width:16px;height:16px;cursor:pointer;accent-color:#7fe0a0}
  .resolvebox input:disabled{cursor:default;opacity:.4}
  textarea.edit.resolved{opacity:.55;border-style:dashed}
  #status{position:fixed;bottom:14px;right:18px;background:#2a2440;padding:8px 14px;border-radius:8px;opacity:0;transition:opacity .2s;pointer-events:none}
  /* Persistent generation banner — driven by server-side job state, so it survives navigation/reload. */
  #gens{position:fixed;bottom:56px;right:18px;display:none;flex-direction:column;gap:6px;z-index:50;max-width:340px}
  #gens.show{display:flex}
  #gens .genrow{background:#241c33;border:1px solid #4a3d6b;color:#dcd5f2;padding:7px 12px;border-radius:8px;font-size:12.5px;box-shadow:0 6px 20px rgba(0,0,0,.45)}
  #gens .genrow .spin{display:inline-block;animation:spin 1s linear infinite}
  /* Bottom-left generation-log button + slide-up panel */
  #logsBtn{position:fixed;bottom:14px;left:18px;z-index:60;background:#2a2440;border:1px solid #4a3d6b;color:#cfc7e6;padding:7px 13px;border-radius:8px;font-size:12.5px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.45)}
  #logsBtn:hover{filter:brightness(1.2)}
  #logsBtn .dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#7fe0a0;margin-right:6px;vertical-align:middle}
  #logsPanel{position:fixed;bottom:52px;left:18px;width:min(620px,calc(100vw - 36px));max-height:62vh;overflow:auto;display:none;flex-direction:column;background:#161227;border:1px solid #4a3d6b;border-radius:10px;z-index:60;box-shadow:0 10px 36px rgba(0,0,0,.55)}
  #logsPanel.show{display:flex}
  #logsPanel .logshead{position:sticky;top:0;display:flex;align-items:center;gap:8px;background:#221a36;border-bottom:1px solid #4a3d6b;padding:8px 12px;font-size:13px;color:#dcd5f2;font-weight:600}
  #logsPanel .logshead .ct{opacity:.55;font-weight:400}
  #logsPanel .logshead .logsx{margin-left:auto;background:none;border:none;color:#cfc7e6;font-size:15px;cursor:pointer}
  #logsPanel .ll{font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:1.45;color:#c4bcd8;padding:2px 12px;white-space:pre-wrap;word-break:break-word}
  #logsPanel .ll .lt{color:#7d7397;margin-right:8px}
  #logsPanel .ll.good{color:#9be8b4}
  #logsPanel .ll.bad{color:#f3a0a0;background:rgba(120,30,30,.18)}
  @keyframes spin{to{transform:rotate(360deg)}}
  #status.show{opacity:1}
  /* Inline "Edit" affordance on editable read-only fields (Artist / Game style). */
  .sec label .editbtn{float:right;margin-top:-2px;font:inherit;font-size:11px;text-transform:none;letter-spacing:0;
    padding:3px 9px;border-radius:6px;border:1px solid #3a3450;background:#1f1b2c;color:#cbbf9a;cursor:pointer}
  .sec label .editbtn:hover{background:#2a2440;border-color:#c4a35a;color:#fff}
  .editacts{display:flex;gap:8px;margin-top:8px}
  .editacts button{padding:6px 12px;font-size:13px}
  /* ---- Audition grid (artists × 3 scenes) ---- */
  .aud-wrap{padding:20px 26px;overflow-y:auto;height:100%}
  .aud-controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:10px 0 18px}
  .aud-scenes{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 16px}
  .aud-scenes .slot{display:flex;flex-direction:column;gap:3px}
  .aud-scenes .slot label{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#8a8398}
  .aud-scenes select,.aud select{font:inherit;padding:6px 8px;border-radius:7px;border:1px solid #3a3450;background:#1f1b2c;color:#e8e4ee}
  .aud-artists{display:flex;flex-wrap:wrap;gap:8px 16px;margin:6px 0 10px}
  .aud-artists label{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#cbbf9a;cursor:pointer}
  .aud-artists input{width:15px;height:15px;accent-color:#c4a35a}
  /* Toolbar above the grid: select all/none + finalists-only filter. */
  .aud-tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;margin:0 0 18px}
  .aud-tools .audtool{font-size:12px;padding:4px 11px;border-radius:6px;border:1px solid #3a3450;background:#1f1b2c;color:#cbbf9a;cursor:pointer}
  .aud-tools .audtool:hover{background:#2a2440;border-color:#c4a35a;color:#fff}
  .aud-tools .audfilter{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#cbbf9a;cursor:pointer;margin-left:auto}
  .aud-tools .audfilter input{width:15px;height:15px;accent-color:#c4a35a}
  .aud-tools .audfilter input:disabled+span,.aud-tools .audfilter:has(input:disabled){opacity:.5;cursor:default}
  /* Finalist (shortlist) affordances: row ☆/★ toggle + the star next to the name. */
  .aud-rowhead .finstar{color:#c4a35a}
  .finbtn{font-size:11px;padding:4px 9px;margin-top:6px;border-radius:6px;border:1px solid #3a3450;background:#1f1b2c;color:#cbbf9a;cursor:pointer}
  .finbtn:hover{background:#2a2440;border-color:#c4a35a;color:#fff}
  .finbtn.on{background:#c4a35a;border-color:#c4a35a;color:#0d0b12;font-weight:700}
  .aud-rowhead.finalist{box-shadow:inset 3px 0 0 #c4a35a}
  .aud-rowhead.finalist.house{box-shadow:inset 3px 0 0 #9be8b0,inset 6px 0 0 #c4a35a}
  table.aud-grid{border-collapse:collapse;width:100%}
  table.aud-grid th,table.aud-grid td{border:1px solid #2a2536;padding:8px;vertical-align:top}
  table.aud-grid th{font-size:12px;color:#b0a9c2;text-align:left;background:#15121d}
  table.aud-grid th.scenecol{text-align:center}
  /* Sticky scene-header row: stays visible as you scroll the grid in .aud-wrap. */
  table.aud-grid thead th{position:sticky;top:0;z-index:3;box-shadow:0 1px 0 #2a2536}
  .aud-rowhead{min-width:250px;max-width:300px}
  .aud-rowhead .aname{font-weight:600;color:#fff}
  .aud-rowhead .asum{font-size:11px;color:#8a8398;margin:3px 0 7px;line-height:1.4}
  .aud-rowhead.house{box-shadow:inset 3px 0 0 #9be8b0}
  .aud-rowhead .housebtn{font-size:11px;padding:4px 9px;margin-top:6px}
  /* Artist signature, inline-editable in the grid (✎ Edit, like the Scene/Artist fields). */
  .aud-style{font-size:11px;color:#cbc4d6;background:#15121d;border:1px dashed #353047;border-left:3px solid #4f7bd0;
    border-radius:6px;padding:7px 9px;margin:6px 0;max-height:110px;overflow-y:auto;white-space:pre-wrap;line-height:1.45}
  .aud-rowhead textarea.edit{font-size:11px;line-height:1.45;min-height:150px}
  .aud-rowhead .editbtn{font-size:11px;padding:3px 9px;border-radius:6px;border:1px solid #3a3450;background:#1f1b2c;color:#cbbf9a;cursor:pointer}
  .aud-rowhead .editbtn:hover{background:#2a2440;border-color:#c4a35a;color:#fff}
  .aud-cell{width:200px;text-align:center}
  .aud-cell .thumb{width:170px;aspect-ratio:3/4;object-fit:cover;border-radius:8px;cursor:zoom-in;display:block;margin:0 auto 6px;
    background:#15121d;background-image:linear-gradient(45deg,#23202e 25%,transparent 25%,transparent 75%,#23202e 75%),linear-gradient(45deg,#23202e 25%,transparent 25%,transparent 75%,#23202e 75%);background-size:16px 16px;background-position:0 0,8px 8px}
  .aud-cell .empty{width:170px;aspect-ratio:3/4;display:flex;align-items:center;justify-content:center;border-radius:8px;
    border:1px dashed #353047;color:#6f688a;font-size:12px;font-style:italic;margin:0 auto 6px}
  .aud-cell button{font-size:12px;padding:5px 10px}
  .aud-cell .goloc{font-size:11px;color:#8fb0e8;text-decoration:none;margin-right:10px;cursor:pointer;vertical-align:middle}
  .aud-cell .goloc:hover{color:#bcd2ff;text-decoration:underline}
  /* Borrowed image (a tagged render from sandbox/review shown in an empty audition cell). */
  .aud-cell .borrowwrap{position:relative;width:170px;margin:0 auto 6px}
  .aud-cell .borrow-badge{position:absolute;top:6px;left:6px;z-index:1;background:#7a5cc0;color:#fff;font-size:9px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:2px 6px;border-radius:5px}
  .aud-cell .thumb.borrowed{margin:0;opacity:.92;outline:1px dashed #7a5cc0;outline-offset:-1px}
  /* ---- Sandbox workbench (reuses .loc-wrap/.loc-left/.cands/.sec/.val/.bigprev) ---- */
  .sbx-controls{display:flex;flex-wrap:wrap;gap:12px;margin:8px 0 14px}
  .sbx-controls .sbxsel{display:flex;flex-direction:column;gap:3px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#8a8398}
  .sbx-controls select{font:inherit;text-transform:none;letter-spacing:0;padding:6px 8px;border-radius:7px;border:1px solid #3a3450;background:#1f1b2c;color:#e8e4ee;min-width:150px}
  .sbx-left textarea.edit{min-height:84px}
  #bSandbox,#bSbxNew,#bSbxOver{font-size:12px}
  /* ---- Mobile / thin portrait (phones, narrow windows) ---- */
  @media (max-width:820px){
    body{flex-direction:column;height:auto;min-height:100vh;font-size:16px}
    #rail{flex:0 0 auto;flex-direction:row;align-items:center;gap:6px;overflow-x:auto;overflow-y:hidden;
      border-right:none;border-bottom:1px solid #2a2536;padding:8px;white-space:nowrap;-webkit-overflow-scrolling:touch}
    #rail .brand{display:none}
    #rail .sep{display:none}
    .topic{flex:0 0 auto;padding:8px 14px}
    #items{flex:0 0 auto;max-height:34vh;border-right:none;border-bottom:1px solid #2a2536}
    #itemlist{padding:0 8px 8px}
    #detail{flex:1 1 auto;overflow:visible}
    .loc-wrap{flex-direction:column;height:auto;overflow:visible}
    .loc-left{flex:1 1 auto;border-right:none;padding:14px 16px;overflow-y:visible}
    /* Image first, as a COMPACT preview (not full portrait) — press & hold to view full size. */
    .loc-right{order:-1;flex:0 0 auto;max-width:100%;width:100%;padding:10px 10px 4px;background:#0a0810}
    .bigprev{height:auto}
    .bigprev img{height:auto;width:auto;max-width:72%;max-height:34vh}
    .loc-right::after{content:'press & hold image to view full size';display:block;width:100%;text-align:center;
      color:#6f688a;font-size:11px;font-style:italic;margin-top:6px}
    .btns{margin:12px 0 18px}
    .genmode{margin-left:0;flex:1 1 100%}     /* dropdown drops to its own full-width row */
    .cand{width:46%}                          /* two candidate thumbs per row */
    #detail h1{font-size:22px}
    #lb img{max-width:96vw}
    #lb .lbnav{width:64px;font-size:32px}
  }
  #modal{position:fixed;inset:0;z-index:10000;background:rgba(6,5,9,.92);display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity .12s}
  #modal.show{opacity:1;pointer-events:auto}
  #modal .mbox{background:#1a1722;border:1px solid #322c40;border-radius:12px;padding:20px 22px;width:min(440px,92vw);box-shadow:0 16px 60px rgba(0,0,0,.7);cursor:auto}
  #modal h3{margin:0 0 14px;color:#e8e2f4;font-size:16px}
  #modal .mfld{display:block;margin-bottom:12px}
  #modal .mfld span{display:block;color:#c2bbd4;font-size:12px;margin-bottom:4px}
  #modal input,#modal textarea{width:100%;box-sizing:border-box;background:#100d17;border:1px solid #322c40;color:#e8e2f4;border-radius:7px;padding:8px 10px;font:inherit;resize:vertical}
  #modal input:focus,#modal textarea:focus{outline:none;border-color:#6b5bd0}
  #modal .mbtns{display:flex;justify-content:flex-end;gap:8px;margin-top:6px}
  #modal .mbtns button{padding:7px 16px;border-radius:7px;border:1px solid #322c40;background:#251f31;color:#e8e2f4;cursor:pointer;font:inherit}
  #modal .mok{background:#6b5bd0;border-color:#6b5bd0}
  #modal .mbtns button:hover{filter:brightness(1.15)}
</style></head><body>
<div id="rail"></div>
<div id="items"><div id="itemhead"></div><input id="itemfilter" placeholder="Filter locations…" autocomplete="off" spellcheck="false" style="display:none"><div id="itemlist"></div></div>
<div id="detail"><p class="none">Loading…</p></div>
<div id="lb"><button class="lbnav lbprev" title="Previous">‹</button><img alt=""><button class="lbnav lbnext" title="Next">›</button><button class="lbfin" title="Toggle finalist (F)">☆ Finalist</button><div class="lbcap"></div>
  <div class="lbnotes" id="lbNotes"><label class="ed">Notes / feedback<span class="noteflag" id="lbNoteFlag"></span></label><div class="lbnotefor" id="lbNoteFor"></div><textarea class="edit" id="lbNote" placeholder="What you think of THIS image — Claude reads these to tune the artist. Saved to the same notes as the location screen."></textarea><div class="noteacts" id="lbNoteActs"></div></div></div>
<div id="modal"></div>
<div id="gens"></div>
<button id="logsBtn" title="Generation logs (this server)" onclick="toggleLogs()"><span class="dot"></span>Logs</button>
<div id="logsPanel"></div>
<div id="status"></div>
<script>
let STATE=null, ARTISTS=null, GLYPHS=null, GAMES={}, GAMEINFO={}, topic=null, curGame=null, curItem=null, sel=null, ver=0;
let BLOCKOUTS=null, pendingBlockoutView=null;   // Blockout rail section: all volumes (grouped by game) + pending room camera
let GENS=[];          // in-flight generations (from /api/jobs poll) — drives the progress banner
let _genSeen={};      // jobId → last-seen status, to fire a toast/refresh on the running→done edge
// Which generator Regenerate uses; persists across re-renders. Default = OpenAI low
// (cheap prototyping) per project preference; switch to Gemini/OpenAI-high for finals.
let genMode='openai-low';
// How Regenerate uses the selected image's note. clean = composed prompt only (today's
// behavior); notes = composed + the note appended as "Adjustments:" (cheap text re-roll,
// fresh composition); edit = surgical img2img — selected image as --ref, note as the edit
// instruction (preserves composition). Persists across re-renders.
let regenMode='clean';
const postJSON=(url,body)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
async function loadGame(slug){const gi=await (await fetch('/api/game?slug='+encodeURIComponent(slug))).json();GAMES[slug]=gi.locations;GAMEINFO[slug]={aesthetic:gi.aesthetic,artist:gi.artist,app:gi.app||'',blockouts:gi.blockouts||[]};return gi;}
const $=s=>document.querySelector(s);
const esc=s=>(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function toast(m){const s=$('#status');s.textContent=m;s.classList.add('show');clearTimeout(s._t);s._t=setTimeout(()=>s.classList.remove('show'),2200);}
// Inline modal — replaces window.prompt()/confirm(), which Chrome SUPPRESSES in the
// chromeless --app= window that artview.ps1 launches (that's why "+ New artist" looked
// dead). fields: [{key,label,type:'text'|'textarea',value,placeholder}]. Resolves to
// {key:value,...} on OK, or null on Cancel/Escape.
function askModal(title, fields, okLabel){
  return new Promise(resolve=>{
    const m=$('#modal');
    const rows=fields.map(f=>{
      const id='mf_'+f.key;
      const input=f.type==='textarea'
        ? '<textarea id="'+id+'" rows="4" placeholder="'+esc(f.placeholder||'')+'">'+esc(f.value||'')+'</textarea>'
        : '<input id="'+id+'" type="text" value="'+esc(f.value||'')+'" placeholder="'+esc(f.placeholder||'')+'">';
      return '<label class="mfld"><span>'+esc(f.label)+'</span>'+input+'</label>';
    }).join('');
    m.innerHTML='<div class="mbox"><h3>'+esc(title)+'</h3>'+rows+
      '<div class="mbtns"><button class="mcancel">Cancel</button><button class="mok">'+esc(okLabel||'Create')+'</button></div></div>';
    m.classList.add('show');
    const close=v=>{m.classList.remove('show');m.innerHTML='';document.removeEventListener('keydown',onkey,true);resolve(v);};
    const submit=()=>{const out={};for(const f of fields){const el=$('#mf_'+f.key);out[f.key]=el?el.value:'';}close(out);};
    const onkey=e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(null);}
      else if(e.key==='Enter'&&e.target.tagName!=='TEXTAREA'){e.preventDefault();e.stopPropagation();submit();}
    };
    document.addEventListener('keydown',onkey,true);
    m.querySelector('.mcancel').onclick=()=>close(null);
    m.querySelector('.mok').onclick=submit;
    m.querySelector('.mbox').onclick=e=>e.stopPropagation();
    m.onclick=()=>close(null);
    const first=m.querySelector('input,textarea'); if(first) first.focus();
  });
}
function fmtElapsed(s){const m=Math.floor(s/60),ss=s%60;return m?(m+':'+String(ss).padStart(2,'0')):(ss+'s');}
function renderGens(jobs){
  const box=$('#gens'); if(!box)return;
  const running=jobs.filter(j=>j.status==='running');
  const queued=jobs.filter(j=>j.status==='queued');
  if(!running.length&&!queued.length){box.classList.remove('show');box.innerHTML='';return;}
  box.classList.add('show');
  const qNote=queued.length?' <span style="opacity:.6">(+'+queued.length+' queued)</span>':'';
  box.innerHTML=running.map(j=>'<div class="genrow"><span class="spin">⟳</span> Generating <b>'+esc(j.slug)+'</b> · '+esc(j.mode)+' · '+fmtElapsed(j.elapsed)+(j.game!==curGame?(' · '+esc(j.game)):'')+qNote+'</div>').join('')+(running.length?'':'<div class="genrow"><span class="spin">⟳</span> '+queued.length+' image(s) queued…</div>');
}
// Bottom-left generation log — a per-server in-memory ring (survives nothing but the process,
// but catches FAILs that the progress banner prunes). Polls only while the panel is open.
let LOGS_OPEN=false, _logsT=null;
function toggleLogs(){
  LOGS_OPEN=!LOGS_OPEN;
  const p=$('#logsPanel'); if(p) p.classList.toggle('show',LOGS_OPEN);
  if(LOGS_OPEN){ refreshLogs(); _logsT=setInterval(refreshLogs,2000); }
  else { clearInterval(_logsT); _logsT=null; }
}
async function refreshLogs(){
  if(!LOGS_OPEN) return;
  let data; try{ data=await (await fetch('/api/logs')).json(); }catch(e){ return; }
  const p=$('#logsPanel'); if(!p||!LOGS_OPEN) return;
  const logs=data.logs||[];
  const atBottom = p.scrollHeight - p.scrollTop - p.clientHeight < 60;
  const rows = logs.length
    ? logs.map(l=>{ const cls=/\bFAIL\b|error/i.test(l.msg)?'bad':(/\bOK\b|\bdone\b/i.test(l.msg)?'good':'');
        return '<div class="ll '+cls+'"><span class="lt">'+esc((l.t||'').slice(11))+'</span>'+esc(l.msg)+'</div>'; }).join('')
    : '<div class="ll" style="opacity:.55;padding:10px 12px">No generation activity yet on this server.</div>';
  p.innerHTML='<div class="logshead">Generation log <span class="ct">'+logs.length+'</span>'
    +'<button class="logsx" title="Close" onclick="toggleLogs()">✕</button></div>'+rows;
  if(atBottom) p.scrollTop=p.scrollHeight;   // keep pinned to newest unless the user scrolled up
}
// Poll server-side job state — the single source of truth for generation progress. Because it
// lives on the server, the banner + completion refresh work across navigation AND full reloads.
let BOOT=null;   // server process id; if it changes, the server was restarted → reload to reconnect
async function pollGens(){
  let data; try{ data=await (await fetch('/api/jobs')).json(); }catch(e){ return; }
  if(data.boot){ if(BOOT===null) BOOT=data.boot; else if(data.boot!==BOOT){ location.reload(); return; } }
  let jobs=data.jobs||[];
  GENS=jobs; renderGens(jobs);
  jobs.forEach(j=>{
    const prev=_genSeen[j.id];
    if(prev==='running' && j.status==='done'){
      toast('✓ '+j.slug+' ready ('+j.file+')');
      if(j.kind==='audition'){
        if(topic==='audition' && curItem===j.game){ ver++; reloadAudition(); }
      } else if(j.kind==='sandbox'){
        if(topic==='sandbox' && curItem===j.game){ ver++; SBXW.sel=j.file; reloadSandbox(); }
      } else if(curGame===j.game){ ver++; loadGame(curGame).then(()=>{ if(isGame(topic)){ renderItems(); if(curItem===j.slug) openItem(curItem); } }); }
    } else if(prev==='running' && j.status==='error'){
      toast('✗ '+j.slug+' failed: '+(j.error||'see log'));
    }
  });
  const ns={}; jobs.forEach(j=>ns[j.id]=j.status); _genSeen=ns;
  // Keep the current location's Regenerate button in sync without a full re-render.
  const b=$('#bRegen');
  if(b&&curLoc){ const busy=jobs.some(j=>j.status==='running'&&j.game===curGame&&j.slug===curLoc.slug);
    b.disabled=busy; b.textContent=busy?'Generating…':'Generate ▸'; }
  const sb=$('#bSbxGen');
  if(sb){ const busy=jobs.some(j=>j.status==='running'&&j.kind==='sandbox'&&j.game===curGame);
    sb.disabled=busy; sb.textContent=busy?'Generating…':'Generate ▸'; }
}
// A note is a string (open) or {note,status,appliedTo?,resolved?}. Read text/status shape-safely.
const noteRaw=k=>(STATE&&STATE.notes&&STATE.notes[k]);
const noteVal=k=>{const v=noteRaw(k);return v==null?'':(typeof v==='string'?v:(v.note||''));};
const noteStatusOf=k=>{const v=noteRaw(k);return (v&&typeof v==='object'&&v.status)?v.status:'open';};
async function saveNote(key,text){const r=await (await postJSON('/api/note',{key,text})).json();if(STATE){STATE.notes=STATE.notes||{};if(r.note==null)delete STATE.notes[key];else STATE.notes[key]=r.note;}return r;}
async function setNoteStatus(key,status,appliedTo){const r=await (await postJSON('/api/note-status',{key,status,appliedTo})).json();if(r.ok&&STATE){STATE.notes=STATE.notes||{};STATE.notes[key]=r.note;}return r;}
const isGame=t=>t&&t.indexOf('g:')===0;
const gameOf=t=>isGame(t)?t.slice(2):null;

const NAVKEY='artreview_nav';
// Persisted navigation: last topic, the last-selected item PER topic (so switching topics
// and coming back restores where you were), and scroll positions keyed by topic|item
// (detail pane) and topic (item list) — so a reload doesn't dump you at the top.
let NAV={topic:null,byTopic:{},scroll:{},listScroll:{}};
try{const s=JSON.parse(localStorage.getItem(NAVKEY)||'{}');
  NAV={topic:s.topic||null,byTopic:s.byTopic||{},scroll:s.scroll||{},listScroll:s.listScroll||{}};}catch(e){}
function persistNav(){try{localStorage.setItem(NAVKEY,JSON.stringify(NAV));}catch(e){}}
let _navT=null;
function scheduleNavPersist(){clearTimeout(_navT);_navT=setTimeout(persistNav,300);}
function saveNav(){NAV.topic=topic; if(curItem!=null) NAV.byTopic[topic]=curItem; persistNav();}
// Browser-style back/forward over (topic,item) navigation. Every settled navigation funnels
// through openItem() (and the empty-topic branch of selectTopic), which calls pushHist().
// histGo() replays an entry with histNavigating set so the replay itself doesn't push.
let HIST=[], HISTI=-1, histNavigating=false;
function pushHist(){
  if(histNavigating) return;
  const top=HIST[HISTI];
  if(top && top.topic===topic && top.item===curItem) return;   // re-render / no-op move
  HIST=HIST.slice(0,HISTI+1);   // drop any forward branch
  HIST.push({topic,item:curItem}); HISTI=HIST.length-1;
  updateNavBtns();
}
function updateNavBtns(){
  const b=$('#navBack'), f=$('#navFwd');
  if(b) b.disabled=HISTI<=0;
  if(f) f.disabled=HISTI>=HIST.length-1;
}
async function histGo(d){
  const ni=HISTI+d; if(ni<0||ni>=HIST.length) return;
  HISTI=ni; const e=HIST[HISTI];
  histNavigating=true;
  try{
    if(e.topic!==topic) await selectTopic(e.topic, e.item==null?undefined:e.item);
    else if(e.item!=null && e.item!==curItem) await openItem(e.item);
  } finally { histNavigating=false; }
  updateNavBtns();
}
function scrollKey(){return topic+'|'+curItem;}
function detailScroller(){return document.querySelector('#detail .loc-left, #detail .aud-wrap, #detail .sbx-left');}
// Restore the remembered scroll for the current topic|item and keep it updated as you scroll.
// Called at the end of every detail render so it survives in-place re-renders (pollGens,
// edit cancel, act) as well as navigation.
function afterDetailRender(){
  const el=detailScroller(); if(!el) return;
  const k=scrollKey(), y=NAV.scroll[k];
  if(y!=null){ el.scrollTop=y; requestAnimationFrame(()=>{ if(el.isConnected) el.scrollTop=y; }); }
  el.onscroll=()=>{ NAV.scroll[k]=el.scrollTop; scheduleNavPersist(); };
}
async function loadAll(){
  STATE=await (await fetch('/api/state')).json();
  GLYPHS=await (await fetch('/api/glyphs')).json();
  buildRail();
  let t=NAV.topic;
  const valid=t==='placeholders'||t==='artist'||t==='audition'||t==='sandbox'||t==='blockout'||(isGame(t)&&STATE.games.indexOf(gameOf(t))>=0);
  if(!valid) t=STATE.games[0]?'g:'+STATE.games[0]:'placeholders';   // fresh browser only; NAV (localStorage) wins otherwise
  selectTopic(t);   // no explicit item → selectTopic restores NAV.byTopic[t]
  pollGens(); setInterval(pollGens, 2000);   // progress banner + cross-navigation completion refresh
}
// Backstop: capture live scroll positions right before a reload (the debounced onscroll
// handler usually has them already, but a fast reload could outrun the 300ms timer).
window.addEventListener('beforeunload',()=>{
  const el=detailScroller(); if(el) NAV.scroll[scrollKey()]=el.scrollTop;
  const il=$('#itemlist'); if(il) NAV.listScroll[topic]=il.scrollTop;
  persistNav();
});
function buildRail(){
  const games=STATE.games.map(g=>'<div class="topic" data-t="g:'+g+'">'+esc(g)+'</div>').join('');
  $('#rail').innerHTML='<div class="brand">Art Review</div>'+
    '<div class="navbtns"><button id="navBack" title="Back (Alt+←)">‹ Back</button><button id="navFwd" title="Forward (Alt+→)">Fwd ›</button></div>'+
    games+'<div class="sep"></div>'+
    '<div class="topic" data-t="blockout">Blockout 3D</div><div class="topic" data-t="audition">Audition</div><div class="topic" data-t="sandbox">Sandbox</div><div class="topic" data-t="placeholders">Placeholders</div><div class="topic" data-t="artist">Artist</div>';
  document.querySelectorAll('.topic').forEach(d=>d.onclick=()=>selectTopic(d.dataset.t));
  const bb=$('#navBack'); if(bb) bb.onclick=()=>histGo(-1);
  const ff=$('#navFwd'); if(ff) ff.onclick=()=>histGo(1);
  updateNavBtns();
}
async function selectTopic(t, wantItem){
  topic=t; curItem=null; sel=null;
  document.querySelectorAll('.topic').forEach(d=>d.classList.toggle('active',d.dataset.t===t));
  if(isGame(t)){
    curGame=gameOf(t);
    if(!GAMES[curGame]) await loadGame(curGame);
    $('#itemhead').textContent=curGame+' · locations';
  } else if(t==='artist'){
    ARTISTS=await (await fetch('/api/artists?game='+encodeURIComponent(curGame||''))).json();
    $('#itemhead').innerHTML='Artists <button id="bNewArt" class="newbtn" title="Create a new artist">+ New</button>';
    const nb=$('#bNewArt'); if(nb) nb.onclick=newArtist;
  } else if(t==='audition'){
    $('#itemhead').textContent='Audition · pick a game';
  } else if(t==='sandbox'){
    $('#itemhead').textContent='Sandbox · pick a game';
  } else if(t==='blockout'){
    BLOCKOUTS=((await (await fetch('/api/blockouts')).json()).blockouts)||[];
    $('#itemhead').textContent='Blockouts · by game';
  } else { $('#itemhead').textContent='Glyphs'; }
  // Location filter: only meaningful for the per-game location list. Reset on topic switch.
  itemFilter=''; const fi=$('#itemfilter');
  if(fi){ fi.style.display=isGame(t)?'block':'none'; fi.value='';
    fi.oninput=()=>{ itemFilter=fi.value; renderItems(); }; }
  renderItems();
  const list=items();
  // Prefer an explicit item, else the last-selected item remembered for THIS topic, else first.
  const remembered=(wantItem!=null)?wantItem:NAV.byTopic[t];
  const target=(remembered&&list.some(x=>x.id===remembered))?remembered:((list.find(x=>x.id)||{}).id);
  if(target) await openItem(target); else { $('#detail').innerHTML='<p class="none">Nothing here yet.</p>'; saveNav(); pushHist(); }
}
function items(){
  if(isGame(topic)) return (GAMES[curGame]||[]).map(l=>({id:l.slug,name:l.name,mark:l.committed?'●':(l.candidates.length?'○':'·'),has:!!l.committed,count:l.candidates.length}));
  if(topic==='placeholders') return (GLYPHS.glyphs||[]).map(g=>({id:g.id,name:g.id,mark:g.id===GLYPHS.selected?'●':'·',has:g.id===GLYPHS.selected}));
  // Audition / Sandbox are per-game → the item list is the games (pick one to work on).
  if(topic==='audition'||topic==='sandbox') return (STATE.games||[]).map(g=>({id:g,name:g,mark:'·',has:false}));
  // Blockout: every volume across all games, grouped by game with a header before each group.
  if(topic==='blockout'){ const out=[]; let lastG=null;
    (BLOCKOUTS||[]).forEach(b=>{ if(b.game!==lastG){ out.push({header:true,name:b.game}); lastG=b.game; }
      out.push({id:b.game+'::'+b.volume,name:b.title||b.volume,mark:'·',has:false}); });
    return out; }
  return (ARTISTS.artists||[]).map(a=>({id:a.id,name:a.name,mark:a.id===ARTISTS.selected?'●':'·',has:a.id===ARTISTS.selected}));
}
let itemFilter='';
function renderItems(){
  const il=$('#itemlist');
  const q=itemFilter.trim().toLowerCase();
  const list=q?items().filter(it=>it.header||(it.name||'').toLowerCase().includes(q)):items();
  il.innerHTML=list.map(it=>it.header
    ?'<div style="padding:10px 10px 2px;font-size:11px;color:#8a8398;text-transform:uppercase;letter-spacing:.06em">'+esc(it.name)+'</div>'
    :'<div class="item'+(it.id===curItem?' active':'')+'" data-id="'+it.id+'"><span>'+esc(it.name)+'</span>'+
    '<span class="dot '+(it.has?'has':'')+'">'+it.mark+(it.count?' '+it.count:'')+'</span></div>').join('')||'<p class="none" style="padding:12px">none</p>';
  document.querySelectorAll('.item').forEach(d=>d.onclick=()=>openItem(d.dataset.id));
  const ly=NAV.listScroll[topic]; if(ly!=null) il.scrollTop=ly;
  il.onscroll=()=>{ NAV.listScroll[topic]=il.scrollTop; scheduleNavPersist(); };
}
async function openItem(id){ curItem=id; renderItems(); saveNav();
  if(isGame(topic)) await detailLocation((GAMES[curGame]||[]).find(l=>l.slug===id));
  else if(topic==='placeholders') detailGlyph((GLYPHS.glyphs||[]).find(g=>g.id===id));
  else if(topic==='audition') await detailAudition(id);
  else if(topic==='sandbox') await detailSandbox(id);
  else if(topic==='blockout') detailBlockout(id);
  else detailArtist((ARTISTS.artists||[]).find(a=>a.id===id));
  pushHist();
}
// Embed the generic 3D renderer (served self-contained from /blockout) for the chosen volume.
// pendingBlockoutView (set when arriving via a location's 📦 button) opens at that room's camera.
function detailBlockout(id){
  const [game,volume]=String(id).split('::');
  const b=(BLOCKOUTS||[]).find(x=>x.game===game&&x.volume===volume)||{};
  const view=pendingBlockoutView; pendingBlockoutView=null;
  let src='/blockout?src='+encodeURIComponent('/api/blockout?game='+game+'&volume='+volume)+'&game='+encodeURIComponent(game)+'&volume='+encodeURIComponent(volume);
  if(view) src+='&view='+encodeURIComponent(view);
  $('#detail').innerHTML='<div class="loc-wrap" style="flex-direction:column;height:100%;gap:8px">'+
    '<div style="padding:4px 2px"><b>'+esc(b.title||volume)+'</b> <span style="color:#8a8398">· '+esc(game)+' · members: '+esc((b.members||[]).join(', '))+'</span></div>'+
    '<iframe src="'+src+'" style="flex:1;width:100%;border:1px solid #2a2536;border-radius:8px;min-height:72vh;background:#888"></iframe></div>';
}
function noteSection(key){return '<div class="sec"><label class="ed">Notes / feedback</label><textarea class="edit" id="inote" placeholder="What you think — usually means: regen. (Claude reads these to tune the artist.)">'+esc(noteVal(key))+'</textarea></div>';}
function wireNote(key){const n=$('#inote');if(n)n.onblur=()=>saveNote(key,n.value);}

let curLoc=null, curArtist=null, artSel=null, AUD=null, audLBList=[], audGrid=[], audFinalistsOnly=false;
// Candidate-strip sort (persists across re-renders). 'date' = newest first; 'model' groups by
// generator (cheap→pricey); 'name' = filename. Sorts l.candidates IN PLACE so the rendered strip
// AND the arrow-key nav (which reads l.candidates) stay in the same order.
let candSort='date';
const MODEL_RANK={'oai-low':0,'oai-med':1,'oai-high':2,'gem':3,'gem-pro':4,'':5};
function modelOf(f){const m=(f||'').match(/[-_](gem-pro|gem|oai-(?:low|med|high))-r\\d+\\.png$/i);return m?m[1].toLowerCase():'';}
function sortCands(l){
  const nm=f=>(f.indexOf('aud:')===0?f.slice(4):f).toLowerCase();
  const mt=f=>(l.mtimes&&l.mtimes[f])||0;
  const rk=f=>{const r=MODEL_RANK[modelOf(f)];return r==null?9:r;};
  l.candidates.sort((a,b)=>{
    if(candSort==='name') return nm(a).localeCompare(nm(b));
    if(candSort==='model') return (rk(a)-rk(b))||nm(a).localeCompare(nm(b));
    return (mt(b)-mt(a))||nm(a).localeCompare(nm(b));   // date: newest first
  });
}
function detailLocation(l){
  if(!l){$('#detail').innerHTML='<p class="none">No location.</p>';return;}
  curLoc=l;
  sortCands(l);
  if(!sel||l.candidates.indexOf(sel)<0) sel=l.committed||l.candidates[0]||null;
  const gi=GAMEINFO[curGame]||{artist:{},aesthetic:''};
  const art=(gi.artist&&gi.artist.name)||'(none)';
  // Is this location a member of a 3D blockout volume? If so, offer a link to view it.
  const bo=(gi.blockouts||[]).find(b=>(b.members||[]).indexOf(l.slug)>=0);
  const boBtn=bo?'<button id="bBlockout" title="View this room in the '+esc(bo.title)+' 3D blockout">📦 Blockout</button>':'';
  const cands=l.candidates.map(f=>{const isC=l.committedSource===f;
    const aud=(l.auditions||{})[f];
    const meta=(l.candMeta||{})[f]||{};
    const audChip=aud?'<span class="mchip m-aud" title="Audition piece">aud</span>':'';
    const aChip=meta.artistName?'<span class="mchip m-art" title="Artist">'+esc(meta.artistName)+'</span>':'';
    const mChip=mchipTag(meta.modelTag||modelOf(f));
    const dChip=dchip((l.mtimes||{})[f]);
    return '<div class="cand'+(f===sel?' sel':'')+(isC?' committed':'')+(aud?' aud':'')+'" data-f="'+esc(f)+'" title="'+esc(aud?f.slice(4):f)+'">'+candImg(f)+
      '<div class="cap"><span class="meta">'+audChip+aChip+mChip+dChip+'</span></div></div>';}).join('');
  // Scope-tagged field helper: tag chip + label + a read-only value box.
  const field=(scope,tag,label,val,cls)=>'<div class="sec scope-'+scope+'"><label class="ro"><span class="tag">'+tag+'</span>'+esc(label)+'</label>'+
    '<div class="val '+(cls||'')+'">'+esc(val)+'</div></div>';
  // LEFT column (widest): candidate strip, then read-only reference layers (In-game prose →
  // Artist → Style), then the ONLY editable prompt layer (Scene), Composed, Actual, Notes.
  const left='<h1>'+esc(l.name)+'</h1><div class="sub">'+(l.exits.length?l.exits.join('  ·  '):'no recorded exits')+'</div>'+
    '<div class="btns"><button class="primary" id="bProm" '+(sel?'':'disabled')+'>Promote → in game</button>'+
      '<button class="danger" id="bRej" '+(sel?'':'disabled')+'>Delete selected</button>'+
      '<select id="genMode" class="genmode" title="Which generator Generate uses">'+
        '<option value="openai-low">OpenAI · low — cheap proto (~$0.006)</option>'+
        '<option value="gemini">Gemini · finals (~$0.04)</option>'+
        '<option value="openai-medium">OpenAI · medium (~$0.05)</option>'+
        '<option value="gemini-pro">Nano Banana Pro (~$0.13)</option>'+
      '</select>'+
      '<span class="segmode" id="regenSeg" title="How the selected image\\'s note feeds Generate">'+
        '<button data-rm="clean" title="Composed prompt only — ignores the note">Clean</button>'+
        '<button data-rm="notes" title="Composed prompt + the note as an Adjustments line (cheap text re-roll)">+Notes</button>'+
        '<button data-rm="edit" title="Img2img: feed the selected image back in, note = edit instruction (preserves composition)">Edit img</button>'+
      '</span>'+
      '<button id="bRegen">Generate ▸</button>'+
      '<button id="bSandbox" title="Open the Sandbox pre-loaded with this location\\'s layers to play freely">⚗ Sandbox!</button>'+boBtn+'</div>'+
    '<div class="candbar">'+(l.candidates.length>1?'<label>Sort <select id="candSort">'+
        '<option value="date">date (newest)</option><option value="name">name</option>'+
        '<option value="model">model</option></select></label>':'')+'</div>'+
    '<div class="cands">'+(cands||'<span class="none">No candidates yet — Generate to create one.</span>')+'</div>'+
    // Actual prompt that made the selected image — TOP, right under the candidates.
    '<div class="sec scope-image"><label class="ro"><span class="tag">Per-image</span>Actual prompt used for the selected image</label><div class="val" id="actual">(none)</div></div>'+
    // Layers are shown in REVERSE hierarchy (closest-to-this-room first): In-game prose → Scene
    // → Game → Artist → App. The Composed prompt below re-orders them to App ▸ Artist ▸ Game ▸ Scene.
    // In-game prose — canonical room text; old-school mono container so it stands apart.
    field('ingame','In-game','In-game prose · canonical room text', l.description||'(none)','ingame-prose')+
    // Scene — editable; live-updates Composed. Sits right next to the In-game prose by design.
    '<div class="sec scope-scene scope-editable"><label class="ed"><span class="tag">Scene · editable</span>Scene · this location</label>'+
      '<textarea class="edit scene-edit" id="eScene" placeholder="'+esc(l.sceneDefault||'(scene)')+'">'+esc(l.sceneOverride||'')+'</textarea></div>'+
    // Game style (per-game) → Artist (global) → App (global, highest) — all EDITABLE via ✎ Edit.
    '<div class="sec scope-global" data-efield="aesthetic"><label class="ed"><span class="tag">Game · '+esc(curGame)+'</span>Style · this game'+
      '<button class="editbtn" data-edit="aesthetic">✎ Edit</button></label>'+
      '<div class="val" data-view="aesthetic">'+esc(gi.aesthetic?cap(gi.aesthetic):'(not set)')+'</div></div>'+
    '<div class="sec scope-global" data-efield="artist"><label class="ed"><span class="tag">Artist · '+esc(art)+'</span>Signature · all games'+
      '<button class="editbtn" data-edit="artist">✎ Edit</button></label>'+
      '<div class="val" data-view="artist">'+esc((gi.artist&&gi.artist.style)||'(no artist selected)')+'</div></div>'+
    '<div class="sec scope-app" data-efield="app"><label class="ed"><span class="tag">App · all games</span>App instructions · highest layer'+
      '<button class="editbtn" data-edit="app">✎ Edit</button></label>'+
      '<div class="val" data-view="app">'+esc(gi.app||'(not set)')+'</div></div>'+
    '<div class="sec scope-derived"><label class="ro"><span class="tag">Derived</span>Composed prompt → what Regenerate sends</label><div class="val" id="composed"></div></div>'+
    '<div class="sec scope-image"><label class="ed"><span class="tag">Selected image</span>Notes / feedback · <span id="noteFor">'+esc(sel||'no image')+'</span><span class="noteflag" id="noteFlag"></span></label>'+
      '<textarea class="edit" id="inote" placeholder="What you think of THIS image — usually means: regen. (Claude reads these to tune the artist.)"></textarea>'+
      '<div class="noteacts" id="noteActs"></div></div>';
  // RIGHT column: the selected image, alone, filling the height.
  const right='<div class="bigprev empty" id="bigprev"><span>no image selected</span></div>';
  $('#detail').innerHTML='<div class="loc-wrap"><div class="loc-left">'+left+'</div><div class="loc-right">'+right+'</div></div>';
  document.querySelectorAll('#detail .cand').forEach(c=>c.onclick=()=>selectCand(c.dataset.f));
  document.querySelectorAll('#detail .zoom').forEach(b=>b.onclick=(e)=>{e.stopPropagation();openLB(b.dataset.zoom);});
  $('#bProm').onclick=()=>act('/api/promote',{game:curGame,slug:l.slug,candidate:sel},'Promoted '+sel);
  $('#bRej').onclick=()=>rejectSelected();
  const gm=$('#genMode'); if(gm){ gm.value=genMode; gm.onchange=()=>{genMode=gm.value;}; }
  const cs=$('#candSort'); if(cs){ cs.value=candSort; cs.onchange=()=>{candSort=cs.value; detailLocation(curLoc);}; }
  const seg=$('#regenSeg');
  if(seg){ seg.querySelectorAll('button').forEach(b=>{
    b.classList.toggle('on',b.dataset.rm===regenMode);
    b.onclick=()=>{regenMode=b.dataset.rm;seg.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x.dataset.rm===regenMode));}; }); }
  document.querySelectorAll('#detail .editbtn').forEach(b=>b.onclick=()=>beginEdit(b.dataset.edit));
  $('#bRegen').onclick=()=>doRegen(l);
  if(bo){const bb=$('#bBlockout'); if(bb) bb.onclick=()=>{ pendingBlockoutView=l.slug; selectTopic('blockout', curGame+'::'+bo.volume); };}
  $('#bSandbox').onclick=()=>{
    const gi=GAMEINFO[curGame]||{artist:{},aesthetic:'',app:''};
    // Carry the currently selected picture in (if any): aud:-pieces come from _audition, the
    // rest are _review candidates / committed.
    const adopt=sel?{srcKind:(sel.indexOf('aud:')===0?'audition':'review'), srcFile:sel}:null;
    SANDBOX_PREFILL={game:curGame, app:gi.app||'', aesthetic:gi.aesthetic||'',
      artist:(gi.artist&&gi.artist.style)||'', artistId:(gi.artist&&gi.artist.id)||null,
      artistName:(gi.artist&&gi.artist.name)||'(custom)', locSlug:l.slug, locName:l.name, scene:sceneTextForLoc(l), adopt};
    selectTopic('sandbox', curGame);
  };
  // Scene: live-update Composed on every keystroke, persist on blur.
  const es=$('#eScene');
  const sceneOrig=l.sceneOverride||'';   // guard: only persist a REAL edit
  es.oninput=()=>{l.sceneOverride=es.value;updateComposed();};
  es.onblur=async()=>{
    if(es.value===sceneOrig) return;     // unchanged → never POST (prevents empty-blur DELETING an override)
    await postJSON('/api/scene',{game:curGame,slug:l.slug,tail:es.value});
    toast(es.value.trim()?'Scene saved':'Scene cleared');
  };
  updateComposed(); updateSelUI();
  afterDetailRender();
}
// ---- Edit Artist signature (global) / Game style (per-game) inline ----
// Swaps the read-only value box for a textarea + Save/Cancel. Save persists, updates
// GAMEINFO, and re-renders so the Composed prompt reflects the new layer immediately.
function beginEdit(kind){
  const gi=GAMEINFO[curGame]||{};
  const cur = kind==='artist' ? ((gi.artist&&gi.artist.style)||'') : kind==='app' ? (gi.app||'') : (gi.aesthetic||'');
  const sec=document.querySelector('#detail [data-efield="'+kind+'"]'); if(!sec) return;
  const view=sec.querySelector('[data-view="'+kind+'"]'); if(!view) return;
  const btn=sec.querySelector('.editbtn'); if(btn) btn.style.display='none';
  const ta=document.createElement('textarea'); ta.className='edit'; ta.value=cur; ta.style.minHeight='110px';
  const acts=document.createElement('div'); acts.className='editacts';
  const save=document.createElement('button'); save.className='primary'; save.textContent='Save';
  const cancel=document.createElement('button'); cancel.textContent='Cancel';
  acts.append(save,cancel);
  view.replaceWith(ta); ta.after(acts); ta.focus();
  save.onclick=()=>commitEdit(kind, ta.value);
  cancel.onclick=()=>detailLocation(curLoc);
}
async function commitEdit(kind, value){
  const ep = kind==='artist' ? '/api/artist-style' : kind==='app' ? '/api/app-prompt' : '/api/style';
  const payload = kind==='artist' ? {game:curGame, style:value} : kind==='app' ? {prompt:value} : {game:curGame, aesthetic:value};
  try{
    const r=await (await postJSON(ep, payload)).json();
    if(!r.ok){ toast('Error: '+(r.error||'save failed')); return; }
    if(kind==='app'){ // global — apply to every loaded game so Composed updates everywhere
      Object.keys(GAMEINFO).forEach(g=>{GAMEINFO[g]=GAMEINFO[g]||{};GAMEINFO[g].app=value;});
      toast('App prompt saved (all games)');
    } else {
      const gi=GAMEINFO[curGame]||(GAMEINFO[curGame]={artist:{},aesthetic:''});
      if(kind==='artist'){ gi.artist=gi.artist||{}; gi.artist.style=value; toast('Artist style saved (all games)'); }
      else { gi.aesthetic=value; toast('Game style saved'); }
    }
    detailLocation(curLoc);
  }catch(e){ toast('Error: '+e.message); }
}
// Per-image note key for a candidate file + its location slug. A borrowed audition piece
// (aud:<file>) gets a canonical, page-independent key by its audition filename, so a note on
// the location page and on the Audition page are literally the same note. Native candidates
// stay location-scoped (they never appear on the Audition page).
function imgNoteKey(file, slug){
  if(file && file.indexOf('aud:')===0) return 'aud:'+curGame+':'+file.slice(4);
  return 'game:'+curGame+':'+slug+(file?(':'+file):'');
}
// Per-image note key — feedback is tied to the SELECTED candidate, not the location.
function noteKeyFor(l){ return imgNoteKey(sel, l.slug); }
// Render the note's flag chip + status actions. A note must exist to be flagged; resolved/
// wontfix grey the textarea and offer Re-open; open offers Resolved / Won't fix.
function renderNoteStatus(k){
  const flag=$('#noteFlag'), acts=$('#noteActs'), ta=$('#inote'); if(!flag||!acts) return;
  const hasText=!!noteVal(k).trim(), st=noteStatusOf(k);
  const done=st==='resolved'||st==='wontfix';   // checkbox is binary; both read as "done"
  flag.className='noteflag'+(done?' resolved':'');
  flag.textContent=done?'✓ resolved':'';
  if(ta) ta.classList.toggle('resolved',done);
  // A single Resolved checkbox: check → status resolved, uncheck → re-open. The AI checks it
  // by writing status:"resolved"; the user can check/uncheck freely. Editing the note text
  // re-opens it (server-side), which unchecks the box on the next render.
  acts.innerHTML='<label class="resolvebox"><input type="checkbox" id="nResolved"'+(done?' checked':'')+(hasText?'':' disabled')+'>Resolved</label>';
  const cb=$('#nResolved');
  if(cb) cb.onchange=async()=>{await setNoteStatus(k,cb.checked?'resolved':'open');renderNoteStatus(k);};
}
// Composed from the live layers — Artist + Style + Scene. The Scene component is the
// per-location override if set, else the canonical in-game prose (so editing EITHER the
// Scene box or the In-game prose updates the Composed prompt in real time).
// Artist medium leads + governs lighting (keep in sync with ARTIST_LEAD in review-server.cjs
// server scope and gen-room-images.cjs).
const ARTIST_LEAD='This medium and its rendering are the PRIMARY instruction: render the entire image in this style, and let it govern the lighting, colour and finish over any atmospheric notes that follow.';
function composedPrompt(){
  const gi=GAMEINFO[curGame]||{}; const l=curLoc||{};
  const app=gi.app||'';
  const art=(gi.artist&&gi.artist.style)||'';
  const aes=gi.aesthetic||'';
  const sc=(l.sceneOverride&&l.sceneOverride.trim())||l.description||l.sceneDefault||'';
  // SENT order: Artist (leads, governs lighting) ▸ Scene ▸ Aesthetic ▸ App.
  return [art?(art+' '+ARTIST_LEAD):'', sc?('Scene: '+sc):'', aes?('Aesthetic: '+cap(aes)):'', app].filter(Boolean).join(' ');
}
const cap=s=>s?s.charAt(0).toUpperCase()+s.slice(1):s;
// DISPLAY ONLY: split a composed prompt into Artist / Aesthetic / Scene paragraphs at the
// layer markers (the .val boxes are white-space:pre-wrap, so a blank line shows between).
// What's SENT to the generator is unchanged — this only formats the on-screen text.
// NOTE: this lives inside the PAGE template literal, so a literal backslash-n must be written
// as a double backslash escape, or it becomes a real newline and breaks the client JS.
function breakPrompt(t){ return (t||'').replace(/\\s*(Artist:|Aesthetic:|Scene:)/g,'\\n\\n$1'); }
function updateComposed(){ const c=$('#composed'); if(c) c.textContent=breakPrompt(composedPrompt()); }
async function doRegen(l){
  // Build the prompt + (optional) image reference from the selected mode:
  //   clean = composed prompt only · notes = composed + "Adjustments:" note · edit = img2img.
  let prompt=composedPrompt(), ref=null, refMode=null;
  const note=(noteVal(noteKeyFor(l))||'').trim();
  if(regenMode==='notes'){
    if(!note){ toast('No note on the selected image — add feedback first, or use Clean.'); return; }
    prompt=composedPrompt()+'\\n\\nAdjustments: '+note;
  } else if(regenMode==='edit'){
    if(!sel){ toast('Select an image to edit first.'); return; }
    if(!note){ toast('No note on the selected image — add an edit instruction first.'); return; }
    prompt=note; ref=sel; refMode='edit';
    if(!confirm('Edit "'+sel+'" via img2img? A reference image bills at the high-fidelity input rate regardless of quality (cheap rate only holds ref-free). Proceed?')) return;
  }
  // Nano Banana Pro is ~3x the cost of finals — confirm before spending.
  if(genMode==='gemini-pro' && !confirm('Nano Banana Pro costs ~$0.13 per image (vs ~$0.04 Gemini finals / ~$0.006 OpenAI low). Generate one?')) return;
  const provider=genMode.startsWith('openai')?'openai':'gemini';
  const quality=genMode==='openai-medium'?'medium':'low';
  const model=genMode==='gemini-pro'?'gemini-3-pro-image-preview':null;
  const b=$('#bRegen'); if(b){b.disabled=true;b.textContent='Generating…';}
  // Fire-and-forget: the SERVER tracks the job and the poller below renders progress + refreshes
  // on completion — so it keeps working (and the new image still lands) even if you navigate away
  // or reload. We don't await the response for UI; we only surface a network/launch error.
  const gi=GAMEINFO[curGame]||{artist:{}};
  postJSON('/api/regen',{game:curGame,slug:l.slug,prompt,provider,quality,model,ref,refMode,
    artistId:(gi.artist&&gi.artist.id)||null, artistName:(gi.artist&&gi.artist.name)||null})
    .then(r=>r.json()).then(r=>{ if(r&&!r.ok&&r.error) toast('Error: '+r.error); })
    .catch(e=>toast('Error: '+e.message));
  toast('Generating '+l.slug+(regenMode!=='clean'?(' ['+regenMode+']'):'')+'… (tracked bottom-right — safe to navigate away)');
  setTimeout(pollGens,500);   // pick up the freshly-registered job fast
}
// Small colored chip naming the generator that made a candidate, parsed from the
// filename tag (<slug>-gem-rN / -oai-low-rN / …). Legacy untagged files show nothing.
// Build an <img> for a candidate id. Audition pieces (aud:<file>) come from /img/audition;
// native candidates from /img/review with a committed-copy fallback. attrs = extra attributes.
function candImg(f,attrs){
  attrs=attrs||'';
  if(f&&f.indexOf('aud:')===0){ const file=f.slice(4);
    return '<img '+attrs+' src="/img/audition?game='+curGame+'&f='+encodeURIComponent(file)+'&v='+ver+'">'; }
  return '<img '+attrs+' src="/img/review?game='+curGame+'&f='+encodeURIComponent(f)+'&v='+ver+'" '+
    'onerror="this.onerror=null;this.src=\\'/img/committed?game='+curGame+'&f='+encodeURIComponent(f)+'&v='+ver+'\\'">';
}
// URL only (no <img> wrapper) for a candidate id — used by the big preview + lightbox.
function candUrl(f){
  if(f&&f.indexOf('aud:')===0) return '/img/audition?game='+curGame+'&f='+encodeURIComponent(f.slice(4))+'&v='+ver;
  return '/img/review?game='+curGame+'&f='+encodeURIComponent(f)+'&v='+ver;
}
function mchipTag(tag){ if(!tag) return ''; const t=String(tag).toLowerCase();
  if(!/^(gem-pro|gem|oai-(?:low|med|high))$/.test(t)) return '';
  const label=t==='gem-pro'?'Nano Pro':(t==='gem'?'Gemini':('OpenAI '+t.slice(4)));
  const cls=t==='gem-pro'?'m-pro':(t==='gem'?'m-gem':'m-oai');
  return '<span class="mchip '+cls+'">'+label+'</span>';
}
function mchip(f){ return mchipTag(modelOf(f)); }   // modelOf() reads the tag from the filename
// Date chip from a file mtime (ms) — short, sortable. User chose mtime over a stored timestamp.
function dchip(ms){ if(!ms) return ''; const d=new Date(ms);
  const s=d.toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
  return '<span class="mchip m-date" title="Created (file mtime)">'+esc(s)+'</span>'; }
// Big-preview zoom: click (mouse) OR press-and-hold (touch) opens the full-size overlay.
// On touch we suppress the tap so a stray tap while scrolling doesn't open the overlay —
// you must hold (~380ms) to view full size, per the mobile design.
function bindZoom(im, key){
  im.onclick=(e)=>{ if(im._touched){ im._touched=false; e.preventDefault(); return; } openLB(key); };
  let timer=null;
  im.addEventListener('touchstart',()=>{ im._touched=true; clearTimeout(timer);
    timer=setTimeout(()=>{ openLB(key); }, 380); },{passive:true});
  const cancel=()=>clearTimeout(timer);
  im.addEventListener('touchend',cancel,{passive:true});
  im.addEventListener('touchmove',cancel,{passive:true});
  im.addEventListener('touchcancel',cancel,{passive:true});
}
function selectCand(f){ sel=f; hideLB(); updateSelUI(); }
function updateSelUI(){
  const l=curLoc; if(!l) return;
  document.querySelectorAll('#detail .cand').forEach(c=>c.classList.toggle('sel',c.dataset.f===sel));
  // Big preview: a <img> built fresh from the selected candidate (review → committed fallback).
  const box=$('#bigprev');
  if(box){
    if(sel){ box.classList.remove('empty');
      box.innerHTML=candImg(sel,'alt="'+esc(sel)+'"');
      const im=box.querySelector('img'); if(im) bindZoom(im, sel); }
    else { box.classList.add('empty'); box.innerHTML='<span>no image selected</span>'; }
  }
  const cp=(l.candidatePrompts||{})[sel];
  const av=$('#actual'); if(av) av.textContent=sel?(cp?breakPrompt(cp):'(no recorded prompt for this image)'):'(none)';
  const nf=$('#noteFor'); if(nf) nf.textContent=sel||'no image';
  // Per-image notes: reload the note for THIS image and rebind the blur handler.
  const note=$('#inote');
  if(note){ const k=noteKeyFor(l); note.value=noteVal(k);
    // Editing the text re-opens a flagged note (server unflags); reflect that in the chip.
    note.onblur=async()=>{await saveNote(k,note.value);renderNoteStatus(k);};
    renderNoteStatus(k); }
  const bp=$('#bProm'); if(bp) bp.disabled=!sel;
  const br=$('#bRej'); if(br) br.disabled=!sel;
}
function detailGlyph(g){
  if(!g){$('#detail').innerHTML='<p class="none">No glyph.</p>';return;}
  const isSel=g.id===GLYPHS.selected;
  $('#detail').innerHTML='<h1>'+esc(g.id)+'</h1><div class="sub">Placeholder shown when a game has art but the current room has none.</div>'+
    '<div class="cands"><div class="cand" style="width:190px;cursor:default"><div class="glyphbox">'+g.svg+'</div><div class="cap"><span>'+g.id+'</span>'+(isSel?'<span class="badge">in app</span>':'')+'</div></div></div>'+
    '<div class="btns"><button class="primary" id="bUse" '+(isSel?'disabled':'')+'>'+(isSel?'In use':'Use app-wide')+'</button></div>'+noteSection('glyph:'+g.id);
  $('#bUse').onclick=()=>act('/api/select-glyph',{id:g.id},'Using '+g.id);
  wireNote('glyph:'+g.id);
}
// Create a new artist from the Artist page: prompt for name, summary, and signature,
// POST to the server, then refresh the list and open the new persona.
async function newArtist(){
  const v=await askModal('New artist',[
    {key:'name',label:'Name',placeholder:'e.g. Wren Halloway'},
    {key:'summary',label:'One-line summary (optional)'},
    {key:'style',label:'Style signature — the prompt text that defines this artist (optional, editable later)',type:'textarea'},
  ],'Create');
  if(!v) return;
  if(!v.name.trim()){ toast('Name is required.'); return; }
  const {name,summary,style}=v;
  try{
    const r=await (await postJSON('/api/artist-create',{name,summary,style})).json();
    if(!r.ok){ toast('Error: '+(r.error||'create failed')); return; }
    ARTISTS=await (await fetch('/api/artists?game='+encodeURIComponent(curGame||''))).json();
    toast('Artist created: '+r.artist.name);
    renderItems(); openItem(r.artist.id);
  }catch(e){ toast('Error: '+e.message); }
}
function detailArtist(a){
  if(!a){$('#detail').innerHTML='<p class="none">No artist.</p>';return;}
  curArtist=a;
  const isSel=a.id===ARTISTS.selected, gname=curGame||'(no game)';
  const exs=a.examples||[];
  if(!artSel||!exs.some(e=>e.file===artSel)) artSel=exs[0]?exs[0].file:null;
  const cands=exs.map(e=>'<div class="cand'+(e.file===artSel?' sel':'')+'" data-f="'+esc(e.file)+'">'+
    '<img src="/img/artist?f='+encodeURIComponent(e.file)+'">'+
    '<button class="zoom" data-zoom="'+esc(e.file)+'" title="View full screen">🔍</button>'+
    '<div class="cap"><span>'+esc(e.label)+'</span></div></div>').join('');
  // LEFT: name, summary, example strip, style signature, notes. RIGHT: big selected example.
  const left='<h1>'+esc(a.name)+(isSel?' <span class="badge" style="font-size:12px;padding:2px 6px">'+esc(gname)+' artist</span>':'')+'</h1>'+
    '<div class="sub">'+esc(a.summary||'')+'</div>'+
    (a.goodFor?'<div style="font-size:12px;color:#888;margin:2px 0 8px"><em>Good for:</em> '+esc(a.goodFor)+'</div>':'')+
    '<div class="cands">'+(cands||'<span class="none">No examples.</span>')+'</div>'+
    '<div class="sec" data-eartfield="'+esc(a.id)+'"><label class="ro">Style signature <button class="editbtn" data-editartstyle="'+esc(a.id)+'">✎ Edit</button></label><div class="val" data-artstyle="'+esc(a.id)+'">'+esc(a.style||'')+'</div></div>'+noteSection('artist:'+a.id);
  const right='<div class="bigprev empty" id="bigprev"><span>no image selected</span></div>';
  $('#detail').innerHTML='<div class="loc-wrap"><div class="loc-left">'+left+'</div><div class="loc-right">'+right+'</div></div>';
  document.querySelectorAll('#detail .cand').forEach(c=>c.onclick=()=>{artSel=c.dataset.f;updateArtistSel();});
  document.querySelectorAll('#detail .zoom').forEach(b=>b.onclick=(e)=>{e.stopPropagation();openArtistLB(b.dataset.zoom);});
  const esb=$('#detail').querySelector('[data-editartstyle]'); if(esb) esb.onclick=()=>artistEditStyle(a.id);
  wireNote('artist:'+a.id);
  updateArtistSel();
  afterDetailRender();
}
function updateArtistSel(){
  document.querySelectorAll('#detail .cand').forEach(c=>c.classList.toggle('sel',c.dataset.f===artSel));
  const box=$('#bigprev'); if(!box) return;
  if(artSel){ box.classList.remove('empty');
    box.innerHTML='<img alt="" src="/img/artist?f='+encodeURIComponent(artSel)+'">';
    const im=box.querySelector('img'); if(im) im.onclick=()=>openArtistLB(artSel); }
  else { box.classList.add('empty'); box.innerHTML='<span>no image selected</span>'; }
}
// Inline-edit the displayed artist's Style signature on the Artist topic page (✎ Edit).
// Edits by id (any artist, not just the game's selected one), global save like the
// audition grid. Mirrors audEditArtist() but re-renders via detailArtist().
function artistEditStyle(id){
  const box=document.querySelector('#detail [data-artstyle="'+(window.CSS&&CSS.escape?CSS.escape(id):id)+'"]'); if(!box) return;
  const a=curArtist; if(!a||a.id!==id) return;
  const btn=document.querySelector('#detail [data-editartstyle]'); if(btn) btn.style.display='none';
  const ta=document.createElement('textarea'); ta.className='edit'; ta.value=a.style||''; ta.style.minHeight='160px';
  const acts=document.createElement('div'); acts.className='editacts';
  const save=document.createElement('button'); save.className='primary'; save.textContent='Save';
  const cancel=document.createElement('button'); cancel.textContent='Cancel';
  acts.append(save,cancel);
  box.replaceWith(ta); ta.after(acts); ta.focus();
  save.onclick=async()=>{
    const r=await (await postJSON('/api/artist-style-by-id',{id,style:ta.value})).json();
    if(!r.ok){ toast('Error: '+(r.error||'save failed')); return; }
    a.style=ta.value;
    if(ARTISTS&&ARTISTS.artists){const ent=ARTISTS.artists.find(x=>x.id===id);if(ent)ent.style=ta.value;}
    toast('Style saved (all games)'); detailArtist(a);
  };
  cancel.onclick=()=>detailArtist(a);
}
// ---- Audition: artists × 3 scenes for one game ----------------------------
const GENMODE_OPTS=
  '<option value="openai-low">OpenAI · low — cheap proto (~$0.006)</option>'+
  '<option value="gemini">Gemini · finals (~$0.04)</option>'+
  '<option value="openai-medium">OpenAI · medium (~$0.05)</option>'+
  '<option value="gemini-pro">Nano Banana Pro (~$0.13)</option>';
function genParams(){
  return {provider:genMode.startsWith('openai')?'openai':'gemini',
    quality:genMode==='openai-medium'?'medium':'low',
    model:genMode==='gemini-pro'?'gemini-3-pro-image-preview':null};
}
function audCellUrl(source,file){ const k=source==='sandbox'?'sandbox':'review'; return '/img/'+k+'?game='+curGame+'&f='+encodeURIComponent(file)+'&v='+ver; }
async function reloadAudition(){ AUD=await (await fetch('/api/audition?game='+encodeURIComponent(curGame))).json(); renderAudition(); }
async function detailAudition(slug){ curGame=slug; await reloadAudition(); }
// ---- Sandbox: free-play workbench (every layer editable, nothing committed) ----
let SBX=null, SBXW=null, SANDBOX_PREFILL=null;
function rosterStyle(id){ const a=(ARTISTS&&ARTISTS.artists||[]).find(x=>x.id===id); return a?(a.style||''):''; }
function rosterName(id){ const a=(ARTISTS&&ARTISTS.artists||[]).find(x=>x.id===id); return a?a.name:(id||'(custom)'); }
function sbxIsEdited(){ return !!SBXW.artistId && (SBXW.artist||'')!==rosterStyle(SBXW.artistId); }
function sceneTextForLoc(l){ return (l&&((l.sceneOverride&&l.sceneOverride.trim())||l.description||l.sceneDefault))||''; }
function defaultSBXW(game,gi){
  return {_game:game, app:gi.app||'', artist:(gi.artist&&gi.artist.style)||'', aesthetic:gi.aesthetic||'',
    scene:'', artistId:(gi.artist&&gi.artist.id)||null, artistName:(gi.artist&&gi.artist.name)||'(custom)',
    locSlug:'', locName:'', sel:null};
}
function composeSandbox(){ const w=SBXW; return [w.app||'', w.artist?('Artist: '+w.artist):'', w.aesthetic?('Aesthetic: '+cap(w.aesthetic)):'', w.scene?('Scene: '+w.scene):''].filter(Boolean).join(' '); }
function sbxUrl(f){ return '/img/sandbox?game='+curGame+'&f='+encodeURIComponent(f)+'&v='+ver; }
async function reloadSandbox(){ SBX=await (await fetch('/api/sandbox?game='+encodeURIComponent(curGame))).json(); renderSandbox(); }
async function detailSandbox(game){
  curGame=game;
  if(!GAMES[game]) await loadGame(game);
  ARTISTS=await (await fetch('/api/artists?game='+encodeURIComponent(game))).json();
  SBX=await (await fetch('/api/sandbox?game='+encodeURIComponent(game))).json();
  const gi=GAMEINFO[game]||{artist:{},aesthetic:'',app:''};
  if(!SBXW || SBXW._game!==game) SBXW=defaultSBXW(game,gi);
  // A pending "Sandbox!" prefill (from clicking an image elsewhere) wins, fresh from defaults.
  if(SANDBOX_PREFILL && SANDBOX_PREFILL.game===game){
    const p=SANDBOX_PREFILL; SANDBOX_PREFILL=null; SBXW=defaultSBXW(game,gi);
    if(p.app!=null) SBXW.app=p.app;
    if(p.aesthetic!=null) SBXW.aesthetic=p.aesthetic;
    if(p.artist!=null) SBXW.artist=p.artist;
    if(p.artistId!==undefined){ SBXW.artistId=p.artistId; SBXW.artistName=p.artistName||rosterName(p.artistId); }
    if(p.locSlug){ const l=(GAMES[game]||[]).find(x=>x.slug===p.locSlug); SBXW.locSlug=p.locSlug; SBXW.locName=(l&&l.name)||p.locName||''; if(p.scene==null) SBXW.scene=sceneTextForLoc(l); }
    if(p.scene!=null) SBXW.scene=p.scene;
    // Carry the source picture in: copy it into _sandbox with a sidecar from the resolved
    // layers, then select it. Fields are now fully resolved above, so the sidecar is faithful.
    if(p.adopt && p.adopt.srcFile){
      try{
        const r=await (await postJSON('/api/sandbox-adopt',{game, srcKind:p.adopt.srcKind, srcFile:p.adopt.srcFile,
          fields:{app:SBXW.app,artist:SBXW.artist,aesthetic:SBXW.aesthetic,scene:SBXW.scene},
          meta:{artistId:SBXW.artistId,artistName:SBXW.artistName,edited:sbxIsEdited(),locSlug:SBXW.locSlug,locName:SBXW.locName}})).json();
        if(r.ok){ SBX=await (await fetch('/api/sandbox?game='+encodeURIComponent(game))).json(); SBXW.sel=r.file; }
        else toast('Sandbox: '+(r.error||'could not copy image'));
      }catch(e){ toast('Sandbox: '+e.message); }
    }
  }
  renderSandbox();
}
function renderSandbox(){
  if(!SBXW){ $('#detail').innerHTML='<p class="none">No game.</p>'; return; }
  const game=curGame;
  const gameOpts=(STATE.games||[]).map(g=>'<option value="'+esc(g)+'"'+(g===game?' selected':'')+'>'+esc(g)+'</option>').join('');
  const locOpts='<option value="">— pick a location —</option>'+(GAMES[game]||[]).map(l=>'<option value="'+esc(l.slug)+'"'+(l.slug===SBXW.locSlug?' selected':'')+'>'+esc(l.name)+'</option>').join('');
  const artOpts='<option value="">— custom (unsaved) —</option>'+((ARTISTS&&ARTISTS.artists)||[]).map(a=>'<option value="'+esc(a.id)+'"'+(a.id===SBXW.artistId?' selected':'')+'>'+esc(a.name)+'</option>').join('');
  const cands=(SBX&&SBX.images||[]).map(im=>{
    const lbl=(im.artistName||'custom')+(im.edited?' · edited':'');
    const chip='<span class="mchip m-aud" title="'+esc(lbl+(im.locName?(' — '+im.locName):''))+'">'+esc(lbl)+'</span>';
    return '<div class="cand'+(im.file===SBXW.sel?' sel':'')+'" data-f="'+esc(im.file)+'"><img src="'+sbxUrl(im.file)+'">'+
      '<div class="cap"><span>'+chip+esc(im.file)+'</span></div></div>';
  }).join('');
  const overLbl=SBXW.artistId?('Overwrite '+SBXW.artistName):'Overwrite artist';
  const left='<h1>Sandbox · '+esc(game)+'</h1>'+
    '<div class="sub">Free-play — load a location &amp; artist, tweak any layer, Generate. Renders persist per game; nothing touches the roster until you commit.</div>'+
    '<div class="sbx-controls">'+
      '<label class="sbxsel">Game<select id="sbxGame">'+gameOpts+'</select></label>'+
      '<label class="sbxsel">Location<select id="sbxLoc">'+locOpts+'</select></label>'+
      '<label class="sbxsel">Artist<select id="sbxArtistSel">'+artOpts+'</select></label>'+
    '</div>'+
    '<div class="btns"><select id="genMode" class="genmode" title="Which generator Generate uses">'+GENMODE_OPTS+'</select>'+
      '<button id="bSbxNew" title="Copy the Artist text into a brand-new roster artist">＋ Save as new artist</button>'+
      '<button id="bSbxOver"'+(SBXW.artistId?'':' disabled')+' title="Write the Artist text back onto the selected artist (global)">'+esc(overLbl)+'</button>'+
      '<button class="danger" id="bSbxDel"'+(SBXW.sel?'':' disabled')+' title="Delete the selected sandbox render (Delete key)">Delete selected</button>'+
      '<button id="bSbxGen">Generate ▸</button></div>'+
    '<div class="cands">'+(cands||'<span class="none">No sandbox renders yet — Generate to create one.</span>')+'</div>'+
    '<div class="sec scope-image"><label class="ro"><span class="tag">Per-image</span>Actual prompt used for the selected render</label><div class="val" id="sbxActual">(none)</div></div>'+
    // Reverse-hierarchy order matching the location page (closest-to-room first, App last);
    // scope classes give each label the SAME colour as on the location page.
    sbxField('scene','Scene'+(SBXW.locName?(' · '+esc(SBXW.locName)):''),'Scene · this location','sbxScene',SBXW.scene)+
    sbxField('global','Game · '+esc(game),'Style · this game','sbxAesthetic',SBXW.aesthetic)+
    sbxField('global','Artist · '+esc(SBXW.artistName||'custom')+(sbxIsEdited()?' (edited)':''),'Signature · all games','sbxArtist',SBXW.artist)+
    sbxField('app','App · all games','App instructions · highest layer','sbxApp',SBXW.app)+
    '<div class="sec scope-derived"><label class="ro"><span class="tag">Derived</span>Composed prompt → what Generate sends</label><div class="val" id="sbxComposed"></div></div>';
  const right='<div class="bigprev empty" id="sbxBig"><span>no render selected</span></div>';
  $('#detail').innerHTML='<div class="loc-wrap"><div class="loc-left sbx-left">'+left+'</div><div class="loc-right">'+right+'</div></div>';
  $('#sbxGame').onchange=e=>openItem(e.target.value);
  $('#sbxLoc').onchange=e=>sbxPickLoc(e.target.value);
  $('#sbxArtistSel').onchange=e=>sbxPickArtist(e.target.value);
  const gm=$('#genMode'); if(gm){ gm.value=genMode; gm.onchange=()=>{genMode=gm.value;}; }
  document.querySelectorAll('#detail .cand').forEach(c=>c.onclick=()=>sbxSelect(c.dataset.f));
  $('#bSbxGen').onclick=sbxGen;
  $('#bSbxDel').onclick=()=>sbxReject();
  $('#bSbxNew').onclick=sbxSaveNew;
  $('#bSbxOver').onclick=sbxOverwrite;
  const map={sbxApp:'app',sbxArtist:'artist',sbxAesthetic:'aesthetic',sbxScene:'scene'};
  Object.keys(map).forEach(id=>{ const t=$('#'+id); if(t) t.oninput=()=>{ SBXW[map[id]]=t.value; sbxUpdateComposed(); }; });
  sbxUpdateComposed(); sbxUpdateSel();
  afterDetailRender();
}
function sbxField(scope,tag,label,id,val){
  return '<div class="sec scope-'+scope+'"><label class="ed"><span class="tag">'+tag+'</span>'+label+'</label>'+
    '<textarea class="edit" id="'+id+'">'+esc(val||'')+'</textarea></div>';
}
function sbxUpdateComposed(){ const c=$('#sbxComposed'); if(c) c.textContent=breakPrompt(composeSandbox()); }
function sbxUpdateSel(){
  const box=$('#sbxBig');
  if(box){ if(SBXW.sel){ box.classList.remove('empty'); box.innerHTML='<img alt="" src="'+sbxUrl(SBXW.sel)+'">'; }
    else { box.classList.add('empty'); box.innerHTML='<span>no render selected</span>'; } }
  const im=(SBX&&SBX.images||[]).find(x=>x.file===SBXW.sel);
  const av=$('#sbxActual'); if(av) av.textContent=im?(im.prompt?breakPrompt(im.prompt):'(no recorded prompt)'):'(none)';
}
async function sbxReject(file){
  const f=file||SBXW.sel; if(!f) return;
  if(!confirm('Delete this sandbox render?\\n\\n'+f)) return;
  await postJSON('/api/sandbox-reject',{game:curGame,file:f});
  if(SBXW.sel===f) SBXW.sel=null;
  await reloadSandbox();
  toast('Deleted '+f);
}
function sbxSelect(file){
  const im=(SBX&&SBX.images||[]).find(x=>x.file===file); if(!im) return;
  SBXW.sel=file;
  SBXW.app=im.app||''; SBXW.artist=im.artist||''; SBXW.aesthetic=im.aesthetic||''; SBXW.scene=im.scene||'';
  if(im.artistId!==undefined){ SBXW.artistId=im.artistId; SBXW.artistName=im.artistName||rosterName(im.artistId); }
  SBXW.locSlug=im.locSlug||''; SBXW.locName=im.locName||'';
  renderSandbox();
}
function sbxPickLoc(slug){
  const l=(GAMES[curGame]||[]).find(x=>x.slug===slug);
  SBXW.locSlug=slug||''; SBXW.locName=(l&&l.name)||''; SBXW.scene=sceneTextForLoc(l);
  renderSandbox();
}
function sbxPickArtist(id){
  if(!id){ SBXW.artistId=null; SBXW.artistName='(custom)'; renderSandbox(); return; }
  SBXW.artistId=id; SBXW.artistName=rosterName(id); SBXW.artist=rosterStyle(id);
  renderSandbox();
}
function sbxGen(){
  const fields={app:SBXW.app, artist:SBXW.artist, aesthetic:SBXW.aesthetic, scene:SBXW.scene};
  const meta={artistId:SBXW.artistId, artistName:SBXW.artistName, edited:sbxIsEdited(), locSlug:SBXW.locSlug, locName:SBXW.locName};
  if(genMode==='gemini-pro' && !confirm('Nano Banana Pro costs ~$0.13 per image. Generate one?')) return;
  const {provider,quality,model}=genParams();
  const b=$('#bSbxGen'); if(b){b.disabled=true;b.textContent='Generating…';}
  postJSON('/api/sandbox-gen',{game:curGame,fields,meta,provider,quality,model})
    .then(r=>r.json()).then(r=>{ if(r&&!r.ok&&r.error) toast('Error: '+r.error); })
    .catch(e=>toast('Error: '+e.message));
  toast('Generating sandbox render… (tracked bottom-right — safe to navigate away)');
  setTimeout(pollGens,500);
}
async function sbxSaveNew(){
  const suggested=(SBXW.artistName&&SBXW.artistName!=='(custom)')?SBXW.artistName+' variant':'';
  const v=await askModal('Save as new roster artist',[
    {key:'name',label:'Name (its id is slugified from this; available to every game)',value:suggested},
  ],'Save');
  if(!v||!v.name.trim()) return;
  const name=v.name;
  const r=await (await postJSON('/api/artist-create',{name,style:SBXW.artist})).json();
  if(!r.ok){ toast('Error: '+(r.error||'create failed')); return; }
  ARTISTS=await (await fetch('/api/artists?game='+encodeURIComponent(curGame))).json();
  SBXW.artistId=r.artist.id; SBXW.artistName=r.artist.name;
  toast('Created artist '+r.artist.name+' (all games)'); renderSandbox();
}
async function sbxOverwrite(){
  if(!SBXW.artistId){ toast('No artist selected — use Save as new artist.'); return; }
  if(!confirm('Overwrite "'+SBXW.artistName+'" signature globally? Affects every game using this artist.')) return;
  const r=await (await postJSON('/api/artist-style-by-id',{id:SBXW.artistId,style:SBXW.artist})).json();
  if(!r.ok){ toast('Error: '+(r.error||'save failed')); return; }
  if(ARTISTS&&ARTISTS.artists){const ent=ARTISTS.artists.find(x=>x.id===SBXW.artistId);if(ent)ent.style=SBXW.artist;}
  toast('Overwrote '+SBXW.artistName+' (all games)'); renderSandbox();
}
// Persist the current scene/artist selection, then reload (scene swaps change the columns).
async function audSaveCfg(){
  const scenes=[...document.querySelectorAll('[data-scene-slot]')].map(s=>s.value).filter(Boolean);
  const artists=[...document.querySelectorAll('[data-art]')].filter(c=>c.checked).map(c=>c.dataset.art);
  await postJSON('/api/audition-config',{game:curGame,scenes,artists});
  await reloadAudition();
}
// Bulk-check every artist into the grid, or clear them all (scenes untouched server-side).
async function audSelectAll(on){
  const artists=on?(AUD.artists||[]).map(a=>a.id):[];
  await postJSON('/api/audition-config',{game:curGame,artists});
  await reloadAudition();
}
// Star/unstar an artist as a finalist. Updates the local model, persists, and re-renders the
// grid (and the lightbox caption/button if it's open over this artist).
async function audToggleFinalist(id){
  const a=(AUD.artists||[]).find(x=>x.id===id); if(!a) return;
  const on=!a.finalist;
  const r=await (await postJSON('/api/audition-finalist',{game:curGame,artist:id,on})).json();
  if(!r.ok){ toast('Error: '+(r.error||'failed')); return; }
  a.finalist=on;
  renderAudition();
  if(lbOpen && lbMode==='aud') renderLB();
}
function renderAudition(){
  const A=AUD; if(!A){$('#detail').innerHTML='<p class="none">No game.</p>';return;}
  const finCount=A.artists.filter(a=>a.finalist).length;
  if(audFinalistsOnly && !finCount) audFinalistsOnly=false;   // nothing starred → don't blank the grid
  let selArts=A.artists.filter(a=>a.selected);
  if(audFinalistsOnly) selArts=selArts.filter(a=>a.finalist);
  const cols=A.scenes.filter(s=>s&&s.slug);
  const slots=[0,1,2,3].map(i=>{
    const cur=A.scenes[i]?A.scenes[i].slug:'';
    const opts=A.allScenes.map(s=>'<option value="'+esc(s.slug)+'"'+(s.slug===cur?' selected':'')+'>'+esc(s.name)+'</option>').join('');
    return '<div class="slot"><label>Scene '+(i+1)+'</label><select data-scene-slot="'+i+'"><option value="">— none —</option>'+opts+'</select></div>';
  }).join('');
  const checks=A.artists.map(a=>'<label><input type="checkbox" data-art="'+esc(a.id)+'"'+(a.selected?' checked':'')+'>'+esc(a.name)+(a.finalist?' <span class="finstar">★</span>':'')+'</label>').join('');
  const audTools='<div class="aud-tools">'+
    '<button class="audtool" id="audAll">Select all</button>'+
    '<button class="audtool" id="audNone">Select none</button>'+
    '<label class="audfilter"><input type="checkbox" id="audFinOnly"'+(audFinalistsOnly?' checked':'')+(finCount?'':' disabled')+'><span>Finalists only ('+finCount+')</span></label>'+
    '</div>';
  audLBList=[]; audGrid=[];   // audGrid[row=artist][col=scene] = native file | null (for 2D lightbox nav)
  const head='<tr><th class="aud-rowhead">Artist</th>'+cols.map(s=>'<th class="scenecol">'+esc(s.name)+'</th>').join('')+'</tr>';
  const rows=selArts.map(a=>{
    const house=a.id===A.houseArtist;
    const rh='<th class="aud-rowhead'+(house?' house':'')+(a.finalist?' finalist':'')+'"><div class="aname">'+esc(a.name)+(a.finalist?' <span class="finstar">★</span>':'')+'</div><div class="asum">'+esc(a.summary)+'</div>'+
      '<div class="aud-style" data-astyle="'+esc(a.id)+'">'+esc(a.style||'(no signature)')+'</div>'+
      '<button class="editbtn" data-editart="'+esc(a.id)+'">✎ Edit signature</button><br>'+
      '<button class="finbtn'+(a.finalist?' on':'')+'" data-fin="'+esc(a.id)+'" title="Toggle finalist (shortlist)">'+(a.finalist?'★ Finalist':'☆ Finalist')+'</button> '+
      '<button class="housebtn" data-aud-art="'+esc(a.id)+'">Audition ▸</button> '+
      (house?'<span class="badge">★ game artist</span>':'<button class="housebtn" data-house="'+esc(a.id)+'">Make game artist</button>')+'</th>';
    const gridRow=[];
    const cells=cols.map(s=>{
      const arr=A.images[a.id+'__'+s.slug]||[]; const f=arr.length?arr[arr.length-1].file:null;
      if(f) audLBList.push(f);
      gridRow.push(f||null);
      const bor=!f?((A.borrowed||{})[a.id+'__'+s.slug]||null):null;   // only when no native audition take
      let img;
      if(f){ img='<img class="thumb" data-zoomaud="'+esc(f)+'" src="/img/audition?game='+curGame+'&f='+encodeURIComponent(f)+'&v='+ver+'">'; }
      else if(bor){ const u=audCellUrl(bor.source,bor.file);
        img='<div class="borrowwrap"><span class="borrow-badge">'+esc(bor.source)+'</span>'+
          '<img class="thumb borrowed" data-zoomurl="'+esc(u)+'" data-zoomcap="'+esc(bor.source+' · '+bor.file)+'" src="'+u+'"></div>'; }
      else { img='<div class="empty">not generated</div>'; }
      const goloc='<a class="goloc" data-goloc="'+esc(s.slug)+'" title="Open this scene\\'s location review page">→ location</a>';
      const sbx='<a class="goloc" data-sbxart="'+esc(a.id)+'" data-sbxscene="'+esc(s.slug)+'" title="Play with this artist + scene in the Sandbox">⚗ sandbox</a>';
      return '<td class="aud-cell">'+img+goloc+sbx+'<button data-gen-art="'+esc(a.id)+'" data-gen-scene="'+esc(s.slug)+'">Generate</button></td>';
    }).join('');
    audGrid.push(gridRow);
    return '<tr>'+rh+cells+'</tr>';
  }).join('');
  const grid=(cols.length&&selArts.length)?'<table class="aud-grid"><thead>'+head+'</thead><tbody>'+rows+'</tbody></table>':'<p class="none">Pick at least one scene and one artist above.</p>';
  $('#detail').innerHTML='<div class="aud-wrap"><h1>Audition · '+esc(curGame)+'</h1>'+
    '<div class="sub">Render the selected artists against the same 4 scenes (this game\\'s Aesthetic + saved Scene prompts), compare, then make one the game artist. Click an artist\\'s <b>Audition ▸</b> to render that artist across all scenes at the selected model.</div>'+
    '<div class="aud-scenes">'+slots+'</div><div class="aud-artists">'+checks+'</div>'+audTools+
    '<div class="aud-controls"><select id="genMode" class="genmode" title="Which generator to use">'+GENMODE_OPTS+'</select>'+
      '<button class="primary" id="bGenAll">Generate all missing ▸</button></div>'+grid+'</div>';
  const gm=$('#genMode'); if(gm){ gm.value=genMode; gm.onchange=()=>genMode=gm.value; }
  document.querySelectorAll('[data-scene-slot]').forEach(s=>s.onchange=audSaveCfg);
  document.querySelectorAll('[data-art]').forEach(c=>c.onchange=audSaveCfg);
  const fo=$('#audFinOnly'); if(fo) fo.onchange=()=>{audFinalistsOnly=fo.checked; renderAudition();};
  const aa=$('#audAll'); if(aa) aa.onclick=()=>audSelectAll(true);
  const an=$('#audNone'); if(an) an.onclick=()=>audSelectAll(false);
  document.querySelectorAll('[data-fin]').forEach(b=>b.onclick=()=>audToggleFinalist(b.dataset.fin));
  document.querySelectorAll('[data-house]').forEach(b=>b.onclick=()=>audMakeHouse(b.dataset.house));
  document.querySelectorAll('[data-aud-art]').forEach(b=>b.onclick=()=>audArtistGen(b.dataset.audArt));
  document.querySelectorAll('[data-editart]').forEach(b=>b.onclick=()=>audEditArtist(b.dataset.editart));
  document.querySelectorAll('[data-gen-art]').forEach(b=>b.onclick=()=>audCellGen(b.dataset.genArt,b.dataset.genScene));
  document.querySelectorAll('[data-goloc]').forEach(b=>b.onclick=()=>selectTopic('g:'+curGame,b.dataset.goloc));
  document.querySelectorAll('[data-sbxart]').forEach(b=>b.onclick=()=>{
    const a=(AUD.artists||[]).find(x=>x.id===b.dataset.sbxart);
    const key=b.dataset.sbxart+'__'+b.dataset.sbxscene;
    const arr=(AUD.images||{})[key]||[]; const nf=arr.length?arr[arr.length-1].file:null;
    const bor=!nf?((AUD.borrowed||{})[key]||null):null;
    const adopt=nf?{srcKind:'audition',srcFile:nf}:(bor?{srcKind:bor.source,srcFile:bor.file}:null);
    SANDBOX_PREFILL={game:curGame, artistId:b.dataset.sbxart, artist:(a&&a.style)||'',
      artistName:(a&&a.name)||rosterName(b.dataset.sbxart), locSlug:b.dataset.sbxscene, adopt};
    selectTopic('sandbox', curGame);
  });
  document.querySelectorAll('[data-zoomaud]').forEach(im=>im.onclick=()=>openAudLB(im.dataset.zoomaud));
  document.querySelectorAll('[data-zoomurl]').forEach(im=>im.onclick=()=>openOneLB(im.dataset.zoomurl,im.dataset.zoomcap));
  $('#bGenAll').onclick=audGenAll;
  afterDetailRender();
}
// Inline-edit an artist's signature from its grid row (✎ Edit) — global save, like the
// location page's Artist field. Swaps the read-only style box for a textarea + Save/Cancel.
function audEditArtist(id){
  const box=document.querySelector('[data-astyle="'+(window.CSS&&CSS.escape?CSS.escape(id):id)+'"]'); if(!box) return;
  const a=AUD.artists.find(x=>x.id===id); if(!a) return;
  const th=box.closest('th'); const eb=th&&th.querySelector('[data-editart]'); if(eb) eb.style.display='none';
  const ta=document.createElement('textarea'); ta.className='edit'; ta.value=a.style||'';
  const acts=document.createElement('div'); acts.className='editacts';
  const save=document.createElement('button'); save.className='primary'; save.textContent='Save';
  const cancel=document.createElement('button'); cancel.textContent='Cancel';
  acts.append(save,cancel);
  box.replaceWith(ta); ta.after(acts); ta.focus();
  save.onclick=async()=>{
    const r=await (await postJSON('/api/artist-style-by-id',{id,style:ta.value})).json();
    if(!r.ok){ toast('Error: '+(r.error||'save failed')); return; }
    a.style=ta.value; toast('Signature saved (all games)'); renderAudition();
  };
  cancel.onclick=()=>renderAudition();
}
async function audMakeHouse(id){
  const r=await (await postJSON('/api/select-artist',{game:curGame,id})).json();
  if(r.ok){ AUD.houseArtist=id; toast('Game artist for '+curGame+' → '+id); renderAudition(); }
  else toast('Error: '+(r.error||'failed'));
}
function audCellGen(artist,scene){
  if(genMode==='gemini-pro' && !confirm('Nano Banana Pro costs ~$0.13 per image. Generate one?')) return;
  const {provider,quality,model}=genParams();
  postJSON('/api/audition-gen',{game:curGame,scene,artist,provider,quality,model})
    .then(r=>r.json()).then(r=>{ if(r&&!r.ok&&r.error) toast('Error: '+r.error); }).catch(e=>toast('Error: '+e.message));
  toast('Generating '+artist+' × '+scene+'… (tracked bottom-right)');
  setTimeout(pollGens,500);
}
// Audition one artist: render them across ALL selected scenes at the current model,
// in one click. Always generates a fresh take per scene (it's an audition, not a fill-gaps).
function audArtistGen(artist){
  const cols=AUD.scenes.filter(s=>s&&s.slug);
  if(!cols.length){ toast('Pick at least one scene first.'); return; }
  const name=(AUD.artists.find(a=>a.id===artist)||{}).name||artist;
  if(!confirm('Audition '+name+' across '+cols.length+' scene(s) via '+genMode+'?')) return;
  if(genMode==='gemini-pro' && !confirm('That is Nano Banana Pro at ~$0.13 each (~$'+(cols.length*0.13).toFixed(2)+' total). Proceed?')) return;
  const {provider,quality,model}=genParams();
  cols.forEach(s=>postJSON('/api/audition-gen',{game:curGame,scene:s.slug,artist,provider,quality,model}).then(r=>r.json()).then(r=>{if(r&&!r.ok&&r.error)toast('Error: '+r.error);}).catch(e=>toast('Error: '+e.message)));
  toast('Auditioning '+name+' across '+cols.length+' scene(s)… (tracked bottom-right)');
  setTimeout(pollGens,500);
}
function audGenAll(){
  const A=AUD; let sel=A.artists.filter(a=>a.selected); if(audFinalistsOnly) sel=sel.filter(a=>a.finalist); const cols=A.scenes.filter(s=>s&&s.slug);
  const missing=[];
  sel.forEach(a=>cols.forEach(s=>{ if(!(A.images[a.id+'__'+s.slug]||[]).length) missing.push([a.id,s.slug]); }));
  if(!missing.length){ toast('Nothing missing — every cell has an image.'); return; }
  if(!confirm('Generate '+missing.length+' missing image(s) via '+genMode+'?')) return;
  if(genMode==='gemini-pro' && !confirm('That is Nano Banana Pro at ~$0.13 each (~$'+(missing.length*0.13).toFixed(2)+' total). Proceed?')) return;
  const {provider,quality,model}=genParams();
  missing.forEach(([artist,scene])=>postJSON('/api/audition-gen',{game:curGame,scene,artist,provider,quality,model}).then(r=>r.json()).then(r=>{if(r&&!r.ok&&r.error)toast('Error: '+r.error);}).catch(e=>toast('Error: '+e.message)));
  toast('Generating '+missing.length+' image(s)… (tracked bottom-right)');
  setTimeout(pollGens,500);
}
function openAudLB(f){ lbMode='aud'; const i=audLBList.indexOf(f); lbIndex=i<0?0:i; renderLB(); lb.classList.add('show'); lbOpen=true; }
async function refreshState(){STATE=await (await fetch('/api/state')).json();}
async function act(url,body,msg){const r=await (await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
  if(r.ok){toast(msg);ver++;
    if(url.indexOf('glyph')>=0)GLYPHS=await (await fetch('/api/glyphs')).json();
    if(url.indexOf('artist')>=0)ARTISTS=await (await fetch('/api/artists?game='+encodeURIComponent(curGame||''))).json();
    if(isGame(topic))await loadGame(curGame);
    renderItems();openItem(curItem);
  }else toast('Error: '+(r.error||'failed'));}
// Full-screen lightbox. Open via a thumbnail's magnifier (or clicking the big preview);
// click anywhere / Esc to close; on-screen arrows + arrow keys step through candidates.
const lb=$('#lb'), lbimg=lb.querySelector('img'), lbcap=lb.querySelector('.lbcap'), lbfin=lb.querySelector('.lbfin');
let lbOpen=false, lbIndex=0, lbMode='loc';   // lbMode: 'loc' candidates | 'artist' examples
// The lightbox finalist button is shown only in audition mode (aud images carry an artist id
// in their filename: <artist>__<scene>__…). updateLBFin paints state; click + F key toggle it.
function audArtistOf(f){ return f?f.split('__')[0]:null; }
function updateLBFin(aid){
  if(!lbfin) return;
  if(!aid){ lbfin.style.display='none'; return; }
  const a=(AUD&&AUD.artists||[]).find(x=>x.id===aid); const fin=!!(a&&a.finalist);
  lbfin.style.display=''; lbfin.dataset.fin=aid;
  lbfin.classList.toggle('on',fin); lbfin.textContent=fin?'★ Finalist':'☆ Finalist';
}
if(lbfin) lbfin.onclick=e=>{ e.stopPropagation(); const aid=lbfin.dataset.fin; if(aid) audToggleFinalist(aid); };
// Per-image note key for the zoomed file. loc mode reuses the EXACT detail-screen per-image key
// (renderLB sets sel=f, so the lightbox note and the location screen note are one and the same).
// aud/artist images have no detail-screen view, so they get their own stable namespaced keys.
function lbNoteKey(f){
  if(!f) return null;
  if(lbMode==='loc') return imgNoteKey(f, curItem);   // borrowed aud:<file> → canonical aud: key (synced)
  if(lbMode==='aud') return 'aud:'+curGame+':'+f;     // f is the raw audition filename
  if(lbMode==='artist') return 'artist-ex:'+f;
  return null;   // 'one' (arbitrary-URL) views have no stable key → no notes
}
function renderLBNoteStatus(k){
  const flag=$('#lbNoteFlag'), acts=$('#lbNoteActs'), ta=$('#lbNote'); if(!flag||!acts) return;
  const hasText=!!noteVal(k).trim(), st=noteStatusOf(k), done=st==='resolved'||st==='wontfix';
  flag.className='noteflag'+(done?' resolved':''); flag.textContent=done?'✓ resolved':'';
  if(ta) ta.classList.toggle('resolved',done);
  acts.innerHTML='<label class="resolvebox"><input type="checkbox" id="lbNResolved"'+(done?' checked':'')+(hasText?'':' disabled')+'>Resolved</label>';
  const cb=$('#lbNResolved');
  if(cb) cb.onchange=async()=>{await setNoteStatus(k,cb.checked?'resolved':'open');renderLBNoteStatus(k);};
}
// Load/wire the notes panel for the zoomed file. Editing persists to the shared notes store;
// in loc mode it also mirrors back into the detail screen's note box so both stay in sync.
function loadLBNote(f){
  const ta=$('#lbNote'); if(!ta) return;
  const k=lbNoteKey(f);
  if(!k){ lb.classList.remove('notes'); return; }
  lb.classList.add('notes');
  const forEl=$('#lbNoteFor'); if(forEl) forEl.textContent=f||'';
  ta.value=noteVal(k);
  ta.onblur=async()=>{ await saveNote(k,ta.value); renderLBNoteStatus(k);
    if(lbMode==='loc'){ const di=$('#inote'); if(di){ di.value=ta.value; renderNoteStatus(k); } } };
  renderLBNoteStatus(k);
}
const lbList=()=>{
  if(lbMode==='artist') return (curArtist&&curArtist.examples||[]).map(e=>e.file);
  if(lbMode==='aud') return audLBList;
  const l=(GAMES[curGame]||[]).find(x=>x.slug===curItem);return l?l.candidates:[];
};
function renderLB(){
  if(lbfin) lbfin.style.display='none';   // only audition mode re-shows it
  if(lbMode==='one'){ lb.classList.remove('notes'); lbimg.onerror=null; lbimg.src=(lbOne&&lbOne.url)||''; lbcap.textContent=(lbOne&&lbOne.cap)||''; return; }
  const list=lbList();if(!list.length){hideLB();return;}
  if(lbIndex>=list.length) lbIndex=list.length-1; if(lbIndex<0) lbIndex=0;   // list can shrink (filter/cull)
  const f=list[lbIndex];
  if(lbMode==='artist'){
    lbimg.onerror=null; lbimg.src='/img/artist?f='+encodeURIComponent(f);
    lbcap.textContent=f+'  ('+(lbIndex+1)+'/'+list.length+')';
    artSel=f; updateArtistSel();
  } else if(lbMode==='aud'){
    lbimg.onerror=null; lbimg.src='/img/audition?game='+curGame+'&f='+encodeURIComponent(f)+'&v='+ver;
    const aid=audArtistOf(f); const a=(AUD&&AUD.artists||[]).find(x=>x.id===aid);
    const sslug=f.split('__')[1]; const sc=(AUD&&AUD.scenes||[]).find(x=>x&&x.slug===sslug);
    lbcap.textContent=((sc&&sc.name)||sslug||'')+' — '+((a&&a.name)||aid)+'  ('+(lbIndex+1)+'/'+list.length+')';
    updateLBFin(aid);
  } else {
    if(f&&f.indexOf('aud:')===0){ lbimg.onerror=null; lbimg.src=candUrl(f); }
    else { lbimg.src='/img/review?game='+curGame+'&f='+encodeURIComponent(f)+'&v='+ver;
      lbimg.onerror=function(){this.onerror=null;this.src='/img/committed?game='+curGame+'&f='+encodeURIComponent(f)+'&v='+ver;}; }
    lbcap.textContent=(f&&f.indexOf('aud:')===0?f.slice(4):f)+'  ('+(lbIndex+1)+'/'+list.length+')';
    sel=f; updateSelUI();   // keep the main view in sync with what's shown full screen
  }
  loadLBNote(f);
}
// Single arbitrary-URL lightbox (borrowed audition images live in sandbox/review dirs, not
// the audition list — so they get a one-off view with no prev/next stepping).
let lbOne=null;
function openOneLB(url,cap){lbMode='one';lbOne={url,cap};renderLB();lb.classList.add('show');lbOpen=true;}
function openLB(f){lbMode='loc';const list=lbList();let i=list.indexOf(f);lbIndex=i<0?0:i;renderLB();lb.classList.add('show');lbOpen=true;}
function openArtistLB(f){lbMode='artist';const list=lbList();let i=list.indexOf(f);lbIndex=i<0?0:i;renderLB();lb.classList.add('show');lbOpen=true;}
function hideLB(){lb.classList.remove('show');lbOpen=false;}
function lbStep(d){const list=lbList();if(!list.length)return;lbIndex=(lbIndex+d+list.length)%list.length;renderLB();}
// 2D step within the audition grid lightbox: Left/Right (dc=±1) move between scenes in the
// same artist row; Up/Down (dr=±1) move between artists in the same scene column. Empty/borrowed
// cells (no native take, so nothing to show full-screen) are skipped; wraps within the row/column.
function audLBMove(dr,dc){
  const cur=audLBList[lbIndex]; let r=-1,c=-1;
  for(let i=0;i<audGrid.length&&r<0;i++){const j=audGrid[i].indexOf(cur);if(j>=0){r=i;c=j;}}
  if(r<0){lbStep(dc||dr);return;}                                  // fallback: flat step
  const rows=audGrid.length, colN=audGrid[0]?audGrid[0].length:0;
  if(dc){ for(let k=1;k<=colN;k++){const cc=((c+dc*k)%colN+colN)%colN;const f=audGrid[r][cc];if(f){lbIndex=audLBList.indexOf(f);renderLB();return;}} }
  else  { for(let k=1;k<=rows;k++){const rr=((r+dr*k)%rows+rows)%rows;const f=audGrid[rr][c];if(f){lbIndex=audLBList.indexOf(f);renderLB();return;}} }
}
lb.querySelector('.lbprev').onclick=e=>{e.stopPropagation();lbStep(-1);};
lb.querySelector('.lbnext').onclick=e=>{e.stopPropagation();lbStep(1);};
lb.addEventListener('click',e=>{if(!e.target.closest('.lbnav')&&!e.target.closest('.lbnotes'))hideLB();});  // click anywhere else closes
// Delete the selected candidate (location detail view) — shared by the Delete button and the
// Delete/Backspace key. Audition pieces (aud:<file>) are labelled distinctly in the confirm.
function rejectSelected(){
  if(!sel) return;
  const label=sel.indexOf('aud:')===0?sel.slice(4)+' (audition piece)':sel;
  if(!confirm('Delete this image?\\n\\n'+label)) return;
  act('/api/reject',{game:curGame,candidate:sel},'Deleted '+label);
}
// Keyboard: in the lightbox, arrows navigate & Esc closes. Otherwise arrows cycle the
// selected candidate (ignored while typing in a notes/prompt field).
document.addEventListener('keydown',e=>{
  // Alt+←/→ = back/forward through navigation history (anywhere except while typing).
  if(e.altKey&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){
    if(/^(TEXTAREA|INPUT)$/.test((document.activeElement||{}).tagName||'')) return;
    e.preventDefault(); histGo(e.key==='ArrowLeft'?-1:1); return;
  }
  if(lbOpen){
    if(document.activeElement&&document.activeElement.id==='lbNote'){   // typing a note — don't navigate
      if(e.key==='Escape'){e.preventDefault();document.activeElement.blur();hideLB();}
      return;
    }
    if(e.key==='Escape'){e.preventDefault();hideLB();return;}
    if(lbMode==='aud'){   // grid nav: ←/→ change scene (same artist), ↑/↓ change artist (same scene)
      if(e.key==='f'||e.key==='F'){e.preventDefault();const aid=audArtistOf(audLBList[lbIndex]);if(aid)audToggleFinalist(aid);return;}
      if(e.key==='ArrowLeft'){e.preventDefault();audLBMove(0,-1);return;}
      if(e.key==='ArrowRight'){e.preventDefault();audLBMove(0,1);return;}
      if(e.key==='ArrowUp'){e.preventDefault();audLBMove(-1,0);return;}
      if(e.key==='ArrowDown'){e.preventDefault();audLBMove(1,0);return;}
      return;
    }
    if(e.key==='ArrowLeft'||e.key==='ArrowUp'){e.preventDefault();lbStep(-1);return;}
    if(e.key==='ArrowRight'||e.key==='ArrowDown'){e.preventDefault();lbStep(1);return;}
    return;
  }
  if(/^(TEXTAREA|INPUT)$/.test((document.activeElement||{}).tagName||''))return;
  if(topic==='sandbox'){
    if((e.key==='Delete'||e.key==='Backspace')&&SBXW&&SBXW.sel){ e.preventDefault(); sbxReject(); return; }
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].indexOf(e.key)>=0){
      const ims=(SBX&&SBX.images)||[]; if(!ims.length) return;
      e.preventDefault();
      const vert=(e.key==='ArrowUp'||e.key==='ArrowDown');
      // For up/down, jump a full row: count how many cards share the first row's top.
      const cells=Array.from(document.querySelectorAll('#detail .cand'));
      let cols=1;
      if(vert&&cells.length){ const top0=cells[0].offsetTop; cols=cells.filter(c=>c.offsetTop===top0).length||1; }
      const step=((e.key==='ArrowRight'||e.key==='ArrowDown')?1:-1)*(vert?cols:1);
      let i=ims.findIndex(x=>x.file===(SBXW&&SBXW.sel)); if(i<0)i=(step>0?-1:0);
      i=((i+step)%ims.length+ims.length)%ims.length;
      sbxSelect(ims[i].file);
    }
    return;
  }
  if(!isGame(topic))return;
  if((e.key==='Delete'||e.key==='Backspace')&&sel){ e.preventDefault(); rejectSelected(); return; }
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].indexOf(e.key)<0)return;
  const l=(GAMES[curGame]||[]).find(x=>x.slug===curItem);
  if(!l||!l.candidates.length)return;
  e.preventDefault();
  // Up/Down jump a full ROW of the wrapped candidate strip (count cards sharing the first row's
  // top), Left/Right step one — same row-aware nav as the Sandbox grid above. DOM order of
  // #detail .cand matches l.candidates order, so the col-count maps onto the array.
  const vert=(e.key==='ArrowUp'||e.key==='ArrowDown');
  const cells=Array.from(document.querySelectorAll('#detail .cands .cand'));
  let cols=1;
  if(vert&&cells.length){ const top0=cells[0].offsetTop; cols=cells.filter(c=>c.offsetTop===top0).length||1; }
  const step=((e.key==='ArrowRight'||e.key==='ArrowDown')?1:-1)*(vert?cols:1);
  let i=l.candidates.indexOf(sel);if(i<0)i=(step>0?-1:0);
  i=((i+step)%l.candidates.length+l.candidates.length)%l.candidates.length;
  selectCand(l.candidates[i]);
});
loadAll();
</script></body></html>`;
