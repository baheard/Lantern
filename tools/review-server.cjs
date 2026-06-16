#!/usr/bin/env node
/*
 * Lantern location-art review SERVER (multi-game).
 *
 * Three-pane reviewer:
 *   NAV rail  →  ITEM list (+ topic notes)  →  DETAIL (+ item notes + actions).
 *
 * The rail lists every GAME that has art (a docs/games/images/<game>/prompts.json),
 * then two global topics: Placeholders and Artist.
 *   - <game>:       locations → candidate images in _review/, 3 sections
 *                   (in-game / style / full prompt), Promote/Reject/Regenerate.
 *   - Placeholders: glyphs in docs/assets/glyphs/ — pick the app-wide placeholder.
 *   - Artist:       personas in docs/games/images/_artists/artists.json — example
 *                   renders + style signature + "Use for <current game>".
 *
 * Notes (per topic and per item) persist in docs/games/images/_review-notes.json.
 *
 *   node tools/review-server.cjs [defaultGame] [--port 3009] [--no-open]
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const defaultGameArg = args.find((a) => !a.startsWith('--'));
const portIdx = args.indexOf('--port');
const port = parseInt((args.find((a) => a.startsWith('--port=')) || '').split('=')[1]
  || (portIdx !== -1 ? args[portIdx + 1] : null) || '3009', 10);

const IMAGES_ROOT = path.join(REPO, 'docs/games/images');
const notesPath = path.join(IMAGES_ROOT, '_review-notes.json');
const glyphsDir = path.join(REPO, 'docs/assets/glyphs');
const glyphSelPath = path.join(glyphsDir, 'selected.json');
const artistsDir = path.join(IMAGES_ROOT, '_artists');
const artistsPath = path.join(artistsDir, 'artists.json');

const readJSON = (p, fallback) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback);

// Games = image dirs (not "_artists" etc.) that have a prompts.json.
function listGames() {
  if (!fs.existsSync(IMAGES_ROOT)) return [];
  return fs.readdirSync(IMAGES_ROOT).filter((n) => {
    const p = path.join(IMAGES_ROOT, n);
    return !n.startsWith('_') && fs.existsSync(path.join(p, 'prompts.json'));
  }).sort();
}
function gamePaths(slug) {
  const dir = path.join(IMAGES_ROOT, slug);
  return { dir, review: path.join(dir, '_review'), pack: path.join(dir, 'prompts.json'),
    manifest: path.join(dir, 'manifest.json'), selArtist: path.join(dir, 'selected-artist.json') };
}

function candidatesFor(g, slug) {
  if (!fs.existsSync(g.review)) return [];
  return fs.readdirSync(g.review)
    .filter((f) => /\.png$/i.test(f) && (f === `${slug}.png` || f.startsWith(`${slug}-`))).sort();
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
// The Artist signature for a game = its selected artist's style text (read-only in UI).
function artistSignatureFor(slug) {
  const selId = (readJSON(gamePaths(slug).selArtist, {}) || {}).id;
  const arts = (readJSON(artistsPath, { artists: [] }).artists) || [];
  const a = arts.find((x) => x.id === selId) || arts[0];
  return a ? { id: a.id, name: a.name, style: a.style || '' } : { id: null, name: '(no artist)', style: '' };
}

function locationsFor(gameSlug) {
  const g = gamePaths(gameSlug);
  const pack = readJSON(g.pack, { rooms: [] });
  const images = (readJSON(g.manifest, { images: {} }).images) || {};
  const style = gameStyle(gameSlug);
  return pack.rooms.map((r) => {
    const at = (r.prompt || '').indexOf(' Scene:');
    // Scene default = the visual-core scene the pack already scraped (text after "Scene:").
    const sceneDefault = at >= 0 ? r.prompt.slice(at + ' Scene:'.length).trim() : (r.description || '');
    const candidates = candidatesFor(g, r.slug);
    const candidatePrompts = {};   // sidecar: the exact prompt that made each image
    for (const f of candidates) {
      const tp = path.join(g.review, f.replace(/\.png$/i, '.txt'));
      if (fs.existsSync(tp)) candidatePrompts[f] = fs.readFileSync(tp, 'utf8');
    }
    return {
      slug: r.slug, name: r.name, description: r.description || '', exits: r.exits || [],
      committed: images[r.name] || null, candidates, candidatePrompts,
      sceneDefault, sceneOverride: style.scenes[r.slug] || '',
    };
  });
}
function nextRegenName(g, slug) {
  let max = 0;
  for (const f of candidatesFor(g, slug)) {
    const m = f.match(new RegExp(`^${slug}-r(\\d+)\\.png$`));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${slug}-r${max + 1}.png`;
}
function promote(gameSlug, slug, candidate) {
  const g = gamePaths(gameSlug);
  const src = path.join(g.review, candidate);
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
  const r = gamePaths(gameSlug).review;
  // Delete the candidate image AND its prompt sidecar (no orphan .txt left behind).
  for (const f of [candidate, candidate.replace(/\.png$/i, '.txt')]) {
    const p = path.join(r, f);
    if (fs.existsSync(p)) fs.rmSync(p);
  }
}
function regen(gameSlug, slug, prompt) {
  return new Promise((resolve, _reject) => {
    const g = gamePaths(gameSlug);
    fs.mkdirSync(g.review, { recursive: true });
    const outName = nextRegenName(g, slug);
    const out = path.join(g.review, outName);
    execFile('node', [path.join('tools', 'gen-room-images.cjs'), '--aspect', '3:4', '--prompt', prompt, '--out', out],
      { cwd: REPO, maxBuffer: 1 << 22 }, (err, stdout, stderr) => {
        if (err || !fs.existsSync(out)) return _reject(new Error((stderr || stdout || err.message).slice(0, 500)));
        resolve({ file: outName });
      });
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
function selectArtist(gameSlug, id) {
  const d = readJSON(artistsPath, { artists: [] });
  if (!(d.artists || []).some((a) => a.id === id)) throw new Error('artist not found');
  fs.writeFileSync(gamePaths(gameSlug).selArtist, JSON.stringify({ id }, null, 2) + '\n');
  return { selected: id };
}
function saveNote(key, text) {
  const n = readJSON(notesPath, {});
  if (text && text.trim()) n[key] = text; else delete n[key];
  fs.writeFileSync(notesPath, JSON.stringify(n, null, 2));
  return { ok: true };
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
    if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(PAGE); return; }
    if (u.pathname === '/api/state') {
      const games = listGames();
      const def = games.includes(defaultGameArg) ? defaultGameArg : games[0] || null;
      return sendJSON(res, 200, { games, defaultGame: def, notes: readJSON(notesPath, {}) });
    }
    if (u.pathname === '/api/game') {
      const s = q.get('slug');
      return sendJSON(res, 200, { slug: s, aesthetic: gameStyle(s).aesthetic, artist: artistSignatureFor(s), locations: locationsFor(s) });
    }
    if (u.pathname === '/api/glyphs') return sendJSON(res, 200, listGlyphs());
    if (u.pathname === '/api/artists') return sendJSON(res, 200, listArtists(q.get('game')));
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
      if (u.pathname === '/api/style') return wrap(() => saveStyle(body.game, body.aesthetic));
      if (u.pathname === '/api/scene') return wrap(() => saveScene(body.game, body.slug, body.tail));
      if (u.pathname === '/api/note') return wrap(() => saveNote(body.key, body.text));
      if (u.pathname === '/api/regen') {
        try { const r = await regen(body.game, body.slug, body.prompt); return sendJSON(res, 200, { ok: true, ...r }); }
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
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;font:14px/1.45 system-ui,sans-serif;background:#0d0b12;color:#e8e4ee;display:flex;height:100vh}
  #rail{flex:0 0 150px;border-right:1px solid #2a2536;padding:12px 8px;display:flex;flex-direction:column;gap:4px;overflow-y:auto}
  #rail .brand{font-size:12px;color:#8a8398;text-transform:uppercase;letter-spacing:.08em;margin:2px 6px 8px}
  #rail .sep{height:1px;background:#2a2536;margin:8px 4px}
  .topic{padding:9px 12px;border-radius:8px;cursor:pointer;font-weight:600;text-transform:capitalize}
  .topic:hover{background:#1a1722}
  .topic.active{background:#2a2440;color:#c4a35a;box-shadow:inset 3px 0 0 #c4a35a}
  #items{flex:0 0 246px;border-right:1px solid #2a2536;display:flex;flex-direction:column}
  #itemhead{padding:12px 12px 6px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#8a8398}
  #itemlist{flex:1;overflow-y:auto;padding:0 8px}
  .item{padding:8px 10px;border-radius:8px;cursor:pointer;display:flex;justify-content:space-between;gap:8px}
  .item:hover{background:#1a1722}
  .item.active{background:#2a2440;box-shadow:inset 3px 0 0 #c4a35a;color:#fff}
  .item .dot{font-size:11px;color:#6a6478}
  .item .dot.has{color:#9be8b0}
  #topicnotes{border-top:1px solid #2a2536;padding:10px}
  #topicnotes label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#8a8398}
  #detail{flex:1;overflow-y:auto;padding:20px 26px}
  #detail h1{font-family:Georgia,serif;font-size:24px;margin:0 0 4px}
  .sub{color:#8a8398;font-size:12px;margin-bottom:16px}
  .cands{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:8px}
  .cand{width:190px;border:2px solid transparent;border-radius:10px;overflow:hidden;cursor:pointer;position:relative;
    background:#15121d;background-image:linear-gradient(45deg,#23202e 25%,transparent 25%,transparent 75%,#23202e 75%),linear-gradient(45deg,#23202e 25%,transparent 25%,transparent 75%,#23202e 75%);background-size:16px 16px;background-position:0 0,8px 8px}
  .cand.sel{border-color:#c4a35a;box-shadow:0 0 0 2px #c4a35a,0 0 16px rgba(196,163,90,.55)}
  .cand.sel .cap{background:#3a3015;color:#fff}
  .cand.sel::after{content:'✓ selected';position:absolute;top:6px;left:6px;background:#c4a35a;color:#0d0b12;font-size:10px;font-weight:700;padding:2px 6px;border-radius:5px}
  .cand img{width:100%;display:block;aspect-ratio:3/4;object-fit:cover}
  .cand .cap{padding:5px 8px;font-size:12px;display:flex;justify-content:space-between;align-items:center;background:#15121d}
  .cand .badge{font-size:10px;color:#0d0b12;background:#9be8b0;border-radius:4px;padding:1px 5px}
  .glyphbox{aspect-ratio:3/4;display:flex;align-items:center;justify-content:center;background:#0b0a0f;color:#c4a35a}
  .glyphbox svg{width:55%;height:55%;opacity:.8}
  .none{color:#6a6478;font-style:italic;padding:24px 0}
  .btns{margin:14px 0 22px;display:flex;gap:10px;flex-wrap:wrap}
  button{font:inherit;padding:8px 14px;border-radius:8px;border:1px solid #3a3450;background:#1f1b2c;color:#e8e4ee;cursor:pointer}
  button:hover{background:#2a2440}
  button.primary{background:#7a5;border-color:#9be8b0;color:#0d0b12;font-weight:600}
  button.danger{border-color:#a55}
  button:disabled{opacity:.4;cursor:default}
  .sec{margin:14px 0}
  .sec label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#8a8398;margin-bottom:4px}
  .sec label.ro{color:#6a6478}                       /* read-only fields: muted */
  .sec label.ed{color:#c4a35a}                       /* editable fields: gold, stand out */
  .sec .val{background:#15121d;border:1px dashed #2a2536;border-radius:8px;padding:10px 12px;white-space:pre-wrap;color:#b8b2c6}
  textarea.edit{border:1px solid #5a4a2a;background:#1c1830;box-shadow:inset 0 0 0 9999px rgba(196,163,90,.04)}
  textarea.edit:focus{outline:none;border-color:#c4a35a;box-shadow:0 0 0 2px rgba(196,163,90,.35)}
  textarea{width:100%;background:#15121d;border:1px solid #2a2536;border-radius:8px;color:#e8e4ee;padding:10px 12px;font:13px/1.4 ui-monospace,monospace;resize:vertical}
  #topicnotes textarea{min-height:90px}
  .sec textarea{min-height:80px}
  .promptbox{min-height:120px}
  #lb{position:fixed;inset:0;z-index:9999;background:rgba(6,5,9,.88);display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity .12s}
  #lb.show{opacity:1}
  #lb img{max-width:92vw;max-height:92vh;border-radius:10px;box-shadow:0 16px 60px rgba(0,0,0,.7)}
  #status{position:fixed;bottom:14px;right:18px;background:#2a2440;padding:8px 14px;border-radius:8px;opacity:0;transition:opacity .2s}
  #status.show{opacity:1}
</style></head><body>
<div id="rail"></div>
<div id="items"><div id="itemhead"></div><div id="itemlist"></div>
  <div id="topicnotes"><label class="ed">Topic notes</label><textarea class="edit" id="tnotes" placeholder="Notes about this whole topic…"></textarea></div></div>
<div id="detail"><p class="none">Loading…</p></div>
<div id="lb"><img alt=""></div>
<div id="status"></div>
<script>
let STATE=null, ARTISTS=null, GLYPHS=null, GAMES={}, GAMEINFO={}, topic=null, curGame=null, curItem=null, sel=null, ver=0;
const postJSON=(url,body)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
async function loadGame(slug){const gi=await (await fetch('/api/game?slug='+encodeURIComponent(slug))).json();GAMES[slug]=gi.locations;GAMEINFO[slug]={aesthetic:gi.aesthetic,artist:gi.artist};return gi;}
const $=s=>document.querySelector(s);
const esc=s=>(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function toast(m){const s=$('#status');s.textContent=m;s.classList.add('show');clearTimeout(s._t);s._t=setTimeout(()=>s.classList.remove('show'),2200);}
const noteVal=k=>(STATE&&STATE.notes&&STATE.notes[k])||'';
async function saveNote(key,text){await fetch('/api/note',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,text})});if(STATE){STATE.notes=STATE.notes||{};STATE.notes[key]=text;}}
const isGame=t=>t&&t.indexOf('g:')===0;
const gameOf=t=>isGame(t)?t.slice(2):null;

const NAVKEY='artreview_nav';
function saveNav(){try{localStorage.setItem(NAVKEY,JSON.stringify({topic,item:curItem}));}catch(e){}}
async function loadAll(){
  STATE=await (await fetch('/api/state')).json();
  GLYPHS=await (await fetch('/api/glyphs')).json();
  buildRail();
  let nav={}; try{nav=JSON.parse(localStorage.getItem(NAVKEY)||'{}');}catch(e){}
  let t=nav.topic;
  const valid=t==='placeholders'||t==='artist'||(isGame(t)&&STATE.games.indexOf(gameOf(t))>=0);
  if(!valid) t=STATE.defaultGame?'g:'+STATE.defaultGame:(STATE.games[0]?'g:'+STATE.games[0]:'placeholders');
  selectTopic(t, nav.item);
}
function buildRail(){
  const games=STATE.games.map(g=>'<div class="topic" data-t="g:'+g+'">'+esc(g)+'</div>').join('');
  $('#rail').innerHTML='<div class="brand">Art Review</div>'+games+'<div class="sep"></div>'+
    '<div class="topic" data-t="placeholders">Placeholders</div><div class="topic" data-t="artist">Artist</div>';
  document.querySelectorAll('.topic').forEach(d=>d.onclick=()=>selectTopic(d.dataset.t));
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
    $('#itemhead').textContent='Artists';
  } else { $('#itemhead').textContent='Glyphs'; }
  const nk='topic:'+t; const tn=$('#tnotes'); tn.value=noteVal(nk); tn.onblur=()=>saveNote(nk,tn.value);
  renderItems();
  const list=items();
  const target=(wantItem&&list.some(x=>x.id===wantItem))?wantItem:(list[0]&&list[0].id);
  if(target) openItem(target); else { $('#detail').innerHTML='<p class="none">Nothing here yet.</p>'; saveNav(); }
}
function items(){
  if(isGame(topic)) return (GAMES[curGame]||[]).map(l=>({id:l.slug,name:l.name,mark:l.committed?'●':(l.candidates.length?'○':'·'),has:!!l.committed,count:l.candidates.length}));
  if(topic==='placeholders') return (GLYPHS.glyphs||[]).map(g=>({id:g.id,name:g.id,mark:g.id===GLYPHS.selected?'●':'·',has:g.id===GLYPHS.selected}));
  return (ARTISTS.artists||[]).map(a=>({id:a.id,name:a.name,mark:a.id===ARTISTS.selected?'●':'·',has:a.id===ARTISTS.selected}));
}
function renderItems(){
  $('#itemlist').innerHTML=items().map(it=>'<div class="item'+(it.id===curItem?' active':'')+'" data-id="'+it.id+'"><span>'+esc(it.name)+'</span>'+
    '<span class="dot '+(it.has?'has':'')+'">'+it.mark+(it.count?' '+it.count:'')+'</span></div>').join('')||'<p class="none" style="padding:12px">none</p>';
  document.querySelectorAll('.item').forEach(d=>d.onclick=()=>openItem(d.dataset.id));
}
function openItem(id){ curItem=id; renderItems(); saveNav();
  if(isGame(topic)) return detailLocation((GAMES[curGame]||[]).find(l=>l.slug===id));
  if(topic==='placeholders') return detailGlyph((GLYPHS.glyphs||[]).find(g=>g.id===id));
  return detailArtist((ARTISTS.artists||[]).find(a=>a.id===id));
}
function noteSection(key){return '<div class="sec"><label class="ed">Notes / feedback</label><textarea class="edit" id="inote" placeholder="What you think — usually means: regen. (Claude reads these to tune the artist.)">'+esc(noteVal(key))+'</textarea></div>';}
function wireNote(key){const n=$('#inote');if(n)n.onblur=()=>saveNote(key,n.value);}

let curLoc=null;
function detailLocation(l){
  if(!l){$('#detail').innerHTML='<p class="none">No location.</p>';return;}
  curLoc=l;
  if(!sel||l.candidates.indexOf(sel)<0) sel=l.committed||l.candidates[0]||null;
  const gi=GAMEINFO[curGame]||{artist:{},aesthetic:''};
  const art=(gi.artist&&gi.artist.name)||'(none)';
  const cands=l.candidates.map(f=>{const isC=l.committed===f;
    return '<div class="cand'+(f===sel?' sel':'')+'" data-f="'+f+'"><img src="/img/review?game='+curGame+'&f='+encodeURIComponent(f)+'&v='+ver+'" onerror="this.src=\\'/img/committed?game='+curGame+'&f='+encodeURIComponent(f)+'&v='+ver+'\\'">'+
      '<div class="cap"><span>'+f+'</span>'+(isC?'<span class="badge">in game</span>':'')+'</div></div>';}).join('');
  const scene=l.sceneOverride||l.sceneDefault||'(none)';
  // All read-only except Notes. You comment; Claude updates artist/style from the notes.
  $('#detail').innerHTML='<h1>'+esc(l.name)+'</h1><div class="sub">'+(l.exits.length?l.exits.join('  ·  '):'no recorded exits')+'</div>'+
    '<div class="cands">'+(cands||'<span class="none">No candidates yet — Regenerate to create one.</span>')+'</div>'+
    '<div class="btns"><button class="primary" id="bProm" '+(sel?'':'disabled')+'>Promote → in game</button>'+
      '<button class="danger" id="bRej" '+(sel?'':'disabled')+'>Delete selected</button><button id="bRegen">Regenerate ▸</button></div>'+
    '<div class="sec"><label class="ro">Artist — '+esc(art)+' · constant across all games</label><div class="val">'+esc(gi.artist&&gi.artist.style||'(no artist selected)')+'</div></div>'+
    '<div class="sec"><label class="ro">Style — constant across '+esc(curGame)+'</label><div class="val">'+esc(gi.aesthetic||'(not set)')+'</div></div>'+
    '<div class="sec"><label class="ro">In-game description</label><div class="val">'+esc(l.description||'(none)')+'</div></div>'+
    '<div class="sec"><label class="ro">Scene · this location</label><div class="val">'+esc(scene)+'</div></div>'+
    '<div class="sec"><label class="ro">Composed prompt → what Regenerate sends</label><div class="val" id="composed"></div></div>'+
    '<div class="sec"><label class="ro">Actual prompt used for the selected image</label><div class="val" id="actual">(none)</div>'+
      '<button id="bRegenActual" style="margin-top:8px">Regenerate from this exact prompt ▸</button></div>'+
    noteSection('game:'+curGame+':'+l.slug);
  document.querySelectorAll('#detail .cand').forEach(c=>c.onclick=()=>selectCand(c.dataset.f));
  $('#bProm').onclick=()=>act('/api/promote',{game:curGame,slug:l.slug,candidate:sel},'Promoted '+sel);
  $('#bRej').onclick=()=>act('/api/reject',{game:curGame,candidate:sel},'Deleted '+sel);
  $('#bRegen').onclick=()=>doRegen(l, composedPrompt());
  $('#bRegenActual').onclick=()=>{const cp=(l.candidatePrompts||{})[sel]; if(cp)doRegen(l,cp); else toast('No recorded prompt for this image');};
  wireNote('game:'+curGame+':'+l.slug);
  updateComposed(); updateSelUI();
}
// Composed entirely from the stored layers (no editable fields) — Artist + Style + Scene.
function composedPrompt(){
  const gi=GAMEINFO[curGame]||{}; const l=curLoc||{};
  const art=(gi.artist&&gi.artist.style)||'';
  const aes=gi.aesthetic||'';
  const sc=l.sceneOverride||l.sceneDefault||'';
  return [art, aes?('Aesthetic: '+aes):'', sc?('Scene: '+sc):''].filter(Boolean).join(' ');
}
function updateComposed(){ const c=$('#composed'); if(c) c.textContent=composedPrompt(); }
async function doRegen(l,prompt){
  const b=$('#bRegen'),ab=$('#bRegenActual');
  if(b){b.disabled=true;b.textContent='Generating…';} if(ab)ab.disabled=true;
  try{const r=await (await fetch('/api/regen',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({game:curGame,slug:l.slug,prompt})})).json();
    if(r.ok){toast('New: '+r.file);ver++;await loadGame(curGame);sel=r.file;curItem=l.slug;detailLocation((GAMES[curGame]||[]).find(x=>x.slug===l.slug));}else toast('Error: '+r.error);}
  catch(e){toast('Error: '+e.message);}
  if(b){b.disabled=false;b.textContent='Regenerate ▸';} if(ab)ab.disabled=false;
}
function selectCand(f){ sel=f; hideLB(); updateSelUI(); }
function updateSelUI(){
  const l=curLoc; if(!l) return;
  document.querySelectorAll('#detail .cand').forEach(c=>c.classList.toggle('sel',c.dataset.f===sel));
  const cp=(l.candidatePrompts||{})[sel];
  const av=$('#actual'); if(av) av.textContent=cp||'(no recorded prompt for this image)';
  const ab=$('#bRegenActual'); if(ab) ab.disabled=!cp;
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
function detailArtist(a){
  if(!a){$('#detail').innerHTML='<p class="none">No artist.</p>';return;}
  const isSel=a.id===ARTISTS.selected, gname=curGame||'(no game)';
  const ex=(a.examples||[]).map(e=>'<div class="cand" style="cursor:default"><img src="/img/artist?f='+encodeURIComponent(e.file)+'"><div class="cap"><span>'+esc(e.label)+'</span></div></div>').join('');
  $('#detail').innerHTML='<h1>'+esc(a.name)+(isSel?' <span class="badge" style="font-size:12px;padding:2px 6px">'+esc(gname)+' artist</span>':'')+'</h1>'+
    '<div class="sub">'+esc(a.summary||'')+'</div><div class="cands">'+(ex||'<span class="none">No examples.</span>')+'</div>'+
    '<div class="btns"><button class="primary" id="bUse" '+(isSel?'disabled':'')+'>'+(isSel?'Selected for '+esc(gname):'Use for '+esc(gname))+'</button></div>'+
    '<div class="sec"><label>Style signature</label><div class="val">'+esc(a.style||'')+'</div></div>'+noteSection('artist:'+a.id);
  $('#bUse').onclick=()=>{if(!curGame)return toast('Pick a game first');act('/api/select-artist',{game:curGame,id:a.id},a.name+' → '+curGame);};
  wireNote('artist:'+a.id);
}
async function refreshState(){STATE=await (await fetch('/api/state')).json();}
async function act(url,body,msg){const r=await (await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
  if(r.ok){toast(msg);ver++;
    if(url.indexOf('glyph')>=0)GLYPHS=await (await fetch('/api/glyphs')).json();
    if(url.indexOf('artist')>=0)ARTISTS=await (await fetch('/api/artists?game='+encodeURIComponent(curGame||''))).json();
    if(isGame(topic))await loadGame(curGame);
    renderItems();openItem(curItem);
  }else toast('Error: '+(r.error||'failed'));}
// Linger over a detail image → full-screen preview. A hover-INTENT delay keeps a
// quick click free to select (the overlay no longer pops up and swallows the view);
// any click hides the preview immediately.
const lb=$('#lb'), lbimg=lb.querySelector('img'); let lbTimer=null;
function hideLB(){clearTimeout(lbTimer);lb.classList.remove('show');}
$('#detail').addEventListener('mouseover',e=>{const im=e.target.closest('.cand img');if(!im||!im.src)return;clearTimeout(lbTimer);lbTimer=setTimeout(()=>{lbimg.src=im.src;lb.classList.add('show');},350);});
$('#detail').addEventListener('mouseout',e=>{if(e.target.closest('.cand img'))hideLB();});
$('#detail').addEventListener('click',hideLB);
// Arrow keys cycle the selected candidate (game topic). Left/Up = prev, Right/Down = next.
// Ignored while typing in a notes/prompt field.
document.addEventListener('keydown',e=>{
  if(!isGame(topic))return;
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].indexOf(e.key)<0)return;
  if(/^(TEXTAREA|INPUT)$/.test((document.activeElement||{}).tagName||''))return;
  const l=(GAMES[curGame]||[]).find(x=>x.slug===curItem);
  if(!l||!l.candidates.length)return;
  e.preventDefault();
  const step=(e.key==='ArrowRight'||e.key==='ArrowDown')?1:-1;
  let i=l.candidates.indexOf(sel);if(i<0)i=0;
  i=(i+step+l.candidates.length)%l.candidates.length;
  selectCand(l.candidates[i]);
});
loadAll();
</script></body></html>`;
