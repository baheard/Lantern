/*
 * Lantern location-art review — CORE logic layer.
 *
 * Everything the review server DOES (data access, prompt composition, image generation,
 * notes, titles, blockouts, audition, sandbox) lives here as plain functions. review-server.cjs
 * is now just the HTTP transport + process plumbing that requires this module and wires routes.
 * Split out of review-server.cjs (2026-06-29) to de-bloat a 1200-line single file.
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
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
// Artist medium leads the composed prompt and governs STYLE (linework/palette/finish) so the
// chosen medium actually renders instead of collapsing into the aesthetic's tone — but the SCENE,
// not the artist, sets the brightness/value-key, so source-grounded dim scenes stay genuinely dark
// instead of being washed bright to satisfy the medium's contrast/cheer. Aesthetics describe WORLD
// content (with at most an exterior/interior light *tendency*); per-scene light is the authority.
// Must match the same constant in gen-room-images.cjs and the client composedPrompt() so all three agree.
const ARTIST_LEAD = 'Render entirely in this medium; let it govern linework, palette and finish. Light each space by what the scene names: genuinely dark where it calls for dark, lit by any source it names, otherwise soft, even and clearly readable — never a murky gloom or an invented dramatic spotlight.';

function candidatesFor(g, slug) {
  if (!fs.existsSync(g.review)) return [];
  // A LONGER sibling slug that shares this slug as a prefix (e.g. `sitting-room` vs
  // `sitting-room-on-the-settee`) would otherwise be scooped up by the `${slug}-` match below —
  // every such file belongs to the more-specific room, not this one. Exclude them so a sub-state's
  // images don't bleed into the base room's candidate strip.
  const allSlugs = ((readJSON(g.pack, { rooms: [] }).rooms) || []).map((r) => r.slug);
  const longerSiblings = allSlugs.filter((s) => s !== slug && s.startsWith(`${slug}-`));
  const claimedBySibling = (f) => longerSiblings.some((s) => f === `${s}.png` || f === `${s}.prev.png` || f.startsWith(`${s}-`));
  // Include the committed name, the --regen prior take (<slug>.prev.png), and dashed variants.
  return fs.readdirSync(g.review)
    .filter((f) => /\.png$/i.test(f) && (f === `${slug}.png` || f === `${slug}.prev.png` || f.startsWith(`${slug}-`)) && !claimedBySibling(f))
    .sort();
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
  // Locations nav + audition dropdowns list rooms ALPHABETICALLY (by display name), not game
  // order — game order is hard to scan when you don't already know the map.
  const orderedRooms = pack.rooms.slice().sort((a, b) => (a.name || a.slug || '').localeCompare(b.name || b.slug || ''));
  return orderedRooms.map((r) => {
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
      sceneExtras: r.sceneExtras || [],   // examine/look detail beyond the first-visit description
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
  // Title slots record differently than rooms: a game title → manifest.title (read by the
  // home game-card eye); an app-level hero → _app/app.json `heroes` map. Everything else is a
  // room image keyed by room NAME in manifest.images.
  const hero = TITLE_HEROES.find((h) => h.game === gameSlug && h.slug === slug);
  if (hero) {
    const d = readJSON(appPromptPath, {}); d.heroes = d.heroes || {};
    d.heroes[hero.heroKey] = destFile;
    fs.writeFileSync(appPromptPath, JSON.stringify(d, null, 2));
    return { name: hero.name, file: destFile };
  }
  if (slug === 'title') {
    const manifest = readJSON(g.manifest, { game: gameSlug, images: {} });
    manifest.title = destFile;
    fs.writeFileSync(g.manifest, JSON.stringify(manifest, null, 2));
    return { name: 'Title', file: destFile };
  }
  const name = ((readJSON(g.pack, { rooms: [] }).rooms.find((r) => r.slug === slug)) || {}).name || slug;
  const manifest = readJSON(g.manifest, { game: gameSlug, images: {} });
  manifest.images = manifest.images || {};
  manifest.images[name] = destFile;
  fs.writeFileSync(g.manifest, JSON.stringify(manifest, null, 2));
  return { name, file: destFile };
}
// Promote a blockout shot (a _gen/<volume>/<file>.png) to the committed game image for its
// member room. Mirrors promote(): copies to <slug>.png in the game image dir + updates the
// manifest by room NAME. The blockout `view` IS the member's location slug.
function promoteBlockout({ game, volume, view, file }) {
  const g = gamePaths(game);
  const src = path.join(blockoutGenDir(game, volume), path.basename(file || ''));
  if (!view) throw new Error('no view');
  if (!fs.existsSync(src)) throw new Error('shot not found');
  const destFile = `${view}.png`;
  fs.copyFileSync(src, path.join(g.dir, destFile));
  const name = ((readJSON(g.pack, { rooms: [] }).rooms.find((r) => r.slug === view)) || {}).name || view;
  const manifest = readJSON(g.manifest, { game, images: {} });
  manifest.images = manifest.images || {};
  manifest.images[name] = destFile;
  fs.writeFileSync(g.manifest, JSON.stringify(manifest, null, 2));
  return { name, file: destFile };
}
// ---------------------------------------------------------------------------
// Title images — a top-level "Title Images" rail topic. One title per game (the
// game's hero/cover, used by the home game-card eye via manifest.title), plus two
// app-level heroes (App Hero = welcome banner, landscape; Mobile Hero = PWA splash,
// portrait) that live under _app/. Slots reuse the location detail/generate/promote
// machinery: a game title is game=<game> slug=`title`; a hero is game=`_app`
// slug=`app-hero` / `mobile-hero`. The dir owner (real game or _app) is passed as the
// `game` so candidate/img/regen paths resolve through the normal gamePaths() routes.
const TITLE_HEROES = [
  { id: 'app-hero', name: 'App Hero', game: '_app', slug: 'app-hero', aspect: '16:9', heroKey: 'app' },
  { id: 'mobile-hero', name: 'Mobile Hero', game: '_app', slug: 'mobile-hero', aspect: '9:16', heroKey: 'mobile' },
];
// Resolve a title-slot id to {id, name, game, slug, aspect, heroKey?}. A plain game
// slug means that game's `title`; the two fixed ids mean the app-level heroes.
function titleSlot(id) {
  const hero = TITLE_HEROES.find((h) => h.id === id);
  if (hero) return hero;
  return { id, name: id, game: id, slug: 'title', aspect: '3:4' };
}
// The artist chosen for a title slot. A per-slot override (app.json titleArtists[id]) wins;
// otherwise a game title falls back to that game's house artist, and an app-level hero falls
// back to the first artist on the roster. Returns {id,name,style}. This is independent of the
// game's selected-artist.json so a cover can use a different artist than the rooms.
function titleArtistFor(id) {
  const slot = titleSlot(id);
  const arts = (readJSON(artistsPath, { artists: [] }).artists) || [];
  const overrideId = ((readJSON(appPromptPath, {}).titleArtists) || {})[id];
  let a = overrideId && arts.find((x) => x.id === overrideId);
  if (!a) {
    if (slot.heroKey) a = arts[0];                       // app heroes have no house artist
    else { const sig = artistSignatureFor(slot.game); a = arts.find((x) => x.id === sig.id) || arts[0]; }
  }
  return a ? { id: a.id, name: a.name, style: a.style || '' } : { id: null, name: '(no artist)', style: '' };
}
// Persist a title slot's artist override into _app/app.json under titleArtists[id].
function saveTitleArtist(id, artistId) {
  const arts = (readJSON(artistsPath, { artists: [] }).artists) || [];
  if (!arts.some((x) => x.id === artistId)) throw new Error('artist not found');
  fs.mkdirSync(appDir, { recursive: true });
  const d = readJSON(appPromptPath, {});
  d.titleArtists = d.titleArtists || {};
  d.titleArtists[id] = artistId;
  fs.writeFileSync(appPromptPath, JSON.stringify(d, null, 2));
  return { id, artistId };
}
// The committed (in-game) file for a slot. A game title is a POINTER to a location
// (manifest.titleLocation = a location name) — resolve it to that location's current
// committed image so re-rendering the room updates the cover automatically. Falls back
// to the legacy frozen manifest.title for games set before this redesign. Hero → app.json.
function titleCommitted(slot) {
  const g = gamePaths(slot.game);
  if (slot.heroKey) return ((readJSON(appPromptPath, {}).heroes) || {})[slot.heroKey] || null;
  const m = readJSON(g.manifest, { images: {} });
  if (m.titleLocation && m.images && m.images[m.titleLocation]) return m.images[m.titleLocation];
  return m.title || null;
}
// The location NAME currently designated as a game's cover (or null). UI display only.
function titleLocationName(game) {
  return (readJSON(gamePaths(game).manifest, {}).titleLocation) || null;
}
// Build the location-shaped object the client's detailLocation() consumes, for a title slot.
function titleLocationObj(id) {
  const slot = titleSlot(id);
  const g = gamePaths(slot.game);
  const artists = (readJSON(artistsPath, { artists: [] }).artists) || [];
  const artName = (aid) => { const a = artists.find((x) => x.id === aid); return a ? a.name : aid; };
  const selId = (readJSON(g.selArtist, {}) || {}).id;
  const selArtistName = selId ? artName(selId) : '';
  const candidates = candidatesFor(g, slot.slug);
  const candPath = (f) => path.join(g.review, f);
  const candidatePrompts = {}, mtimes = {}, candMeta = {};
  for (const f of candidates) {
    const tp = candPath(f).replace(/\.png$/i, '.txt');
    if (fs.existsSync(tp)) candidatePrompts[f] = fs.readFileSync(tp, 'utf8');
    try { mtimes[f] = fs.statSync(candPath(f)).mtimeMs; } catch (e) { mtimes[f] = 0; }
    const meta = readJSON(candPath(f).replace(/\.png$/i, '.json'), null);
    let artistName = '', mtag = '';
    if (meta) { artistName = meta.artistName || (meta.artistId && artName(meta.artistId)) || ''; if (meta.provider) mtag = modelTag(meta.provider, meta.quality); }
    if (!artistName) artistName = selArtistName;
    candMeta[f] = { artistName, modelTag: mtag };
  }
  // committedSource: byte-compare the committed copy against the candidates (same as locationsFor).
  const committed = titleCommitted(slot);
  let committedSource = null;
  if (committed) {
    const cp = path.join(g.dir, committed);
    if (fs.existsSync(cp)) {
      const cb = fs.readFileSync(cp);
      committedSource = candidates.find((f) => { const fp = candPath(f); if (!fs.existsSync(fp)) return false; const fb = fs.readFileSync(fp); return fb.length === cb.length && fb.equals(cb); }) || null;
    }
  }
  const scenes = (readJSON(path.join(g.dir, 'style.json'), {}).scenes) || {};
  return {
    slug: slot.slug, name: slot.name, description: '', exits: [],
    committed, committedSource, candidates, candidatePrompts, auditions: {}, mtimes, candMeta,
    sceneDefault: '', sceneOverride: scenes[slot.slug] || '', sceneExtras: [],
    titleLocation: slot.heroKey ? null : titleLocationName(slot.game),
  };
}
// Designate a game's title/cover by pointing at a LOCATION (not a frozen image). Records the
// location's name in manifest.titleLocation; the cover resolves to that location's current
// committed image at read time (titleCommitted / the app's getTitleImageUrl), so re-rendering
// the room updates the cover automatically. This is the "★ Set as title" path on a location page.
function setGameTitle(game, slug) {
  const g = gamePaths(game);
  const name = ((readJSON(g.pack, { rooms: [] }).rooms.find((r) => r.slug === slug)) || {}).name || slug;
  const manifest = readJSON(g.manifest, { game, images: {} });
  if (!manifest.images || !manifest.images[name]) throw new Error('location has no committed image: ' + name);
  manifest.titleLocation = name;
  delete manifest.title; // drop any legacy frozen-copy reference; the pointer supersedes it
  fs.writeFileSync(g.manifest, JSON.stringify(manifest, null, 2));
  return { titleLocation: name, file: manifest.images[name] };
}
// Unselect a title slot: a game title clears the titleLocation pointer (and any legacy
// manifest.title); an app hero clears app.json heroes[key].
function clearTitle(id) {
  const slot = titleSlot(id);
  if (slot.heroKey) {
    const d = readJSON(appPromptPath, {});
    if (d.heroes) { delete d.heroes[slot.heroKey]; fs.writeFileSync(appPromptPath, JSON.stringify(d, null, 2)); }
    return { ok: true };
  }
  const g = gamePaths(slot.game);
  const manifest = readJSON(g.manifest, { images: {} });
  delete manifest.titleLocation;
  delete manifest.title;
  fs.writeFileSync(g.manifest, JSON.stringify(manifest, null, 2));
  return { ok: true };
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
function regen(gameSlug, slug, prompt, provider, quality, model, ref, refMode, artistId, artistName, aspect) {
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
    const cliArgs = [path.join('tools', 'gen-room-images.cjs'), '--aspect', aspect || '3:4', '--prompt', prompt, '--out', out];
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
  const artists = (d.artists || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return { selected, artists };
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
    style.aesthetic ? ('Aesthetic: ' + cap(style.aesthetic)) : '', appPrompt() ? ('App: ' + appPrompt()) : ''].filter(Boolean).join(' ');
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
  const arts = ((readJSON(artistsPath, { artists: [] }).artists) || [])
    .slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
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
    allScenes: rooms.slice().sort((a, b) => (a.name || a.slug || '').localeCompare(b.name || b.slug || '')).map((r) => ({ slug: r.slug, name: r.name })),
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


module.exports = { REPO, IMAGES_ROOT, notesPath, glyphsDir, glyphSelPath, artistsDir, artistsPath, appDir, appPromptPath, readJSON, listGames, gamePaths, blockoutsFor, composeForRoom, sceneForRoom, blockoutGenDir, blockoutInfo, ROLE_LEGEND, blockoutGen, saveBlockoutCamera, saveBlockoutPart, deleteBlockoutGen, saveBlockoutNote, cap, ARTIST_LEAD, candidatesFor, appPrompt, saveAppPrompt, gameStyle, saveStyle, saveScene, saveDescription, artistSignatureFor, saveArtistStyle, saveArtistStyleById, locationsFor, modelTag, nextRegenName, promote, promoteBlockout, TITLE_HEROES, titleSlot, titleArtistFor, saveTitleArtist, titleCommitted, titleLocationName, titleLocationObj, setGameTitle, clearTitle, reject, LOG_RING, LOG_RING_MAX, logLine, JOBS, jobSeq, MAX_CONCURRENT_GENS, _genActive, _genQueue, scheduleGen, jobsList, regen, listGlyphs, selectGlyph, listArtists, createArtist, selectArtist, composedFor, classifyRoom, suggestScenes, listAuditionImages, scanTaggedImages, auditionState, saveAuditionCfg, toggleFinalist, auditionGen, composeInline, sbxRev, sandboxState, sandboxReject, sandboxAdopt, sandboxGen, noteText, noteStatus, saveNote, setNoteStatus };
