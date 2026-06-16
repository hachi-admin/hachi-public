/* ═══════════════════════════════════════════════════════════
   vocab/flashcards.js — SM-2 spaced-repetition flashcard engine
   Depends on: vocab.js (data) + ../shared/ui.js (theme/esc/shuffle)
   ═══════════════════════════════════════════════════════════ */

const VOCAB    = (window.VOCAB || []).slice();
const WIKI_BASE = window.VOCAB_WIKI_BASE || '';
const CATS     = [...new Set(VOCAB.map(v => v.cat))];
const DAY      = 864e5, NEW_PER_SESSION = 20, MIN_EASE = 1.3;
const SRS_KEY  = 'sb-srs-v1', DECK_KEY = 'sb-fc-deck', DIR_KEY = 'sb-fc-dir';

const srs = (() => { try { return JSON.parse(localStorage.getItem(SRS_KEY) || '{}'); } catch { return {}; } })();
const saveSrs = () => localStorage.setItem(SRS_KEY, JSON.stringify(srs));
let activeDeck = localStorage.getItem(DECK_KEY) || 'all';
let dir = localStorage.getItem(DIR_KEY) || 'fwd';
let queue = [], current = null, flipped = false, reviewed = 0;

function deckCards() { return activeDeck === 'all' ? VOCAB : VOCAB.filter(v => v.cat === activeDeck); }

/* ── SM-2 ─────────────────────────────────────────────── */
function blankState() { return { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: 0 }; }

function schedule(s, grade) {
  s = { ...s }; const r = s.reps;
  if (grade === 'again')     { s.ease = Math.max(MIN_EASE, s.ease - 0.2);  s.reps = 0; s.lapses++; s.interval = 0; }
  else if (grade === 'hard') { s.ease = Math.max(MIN_EASE, s.ease - 0.15); s.interval = r === 0 ? 1 : Math.max(1, Math.round(s.interval * 1.2)); s.reps = r + 1; }
  else if (grade === 'good') { s.interval = r === 0 ? 1 : (r === 1 ? 3 : Math.round(s.interval * s.ease)); s.reps = r + 1; }
  else                       { s.ease = s.ease + 0.15; s.interval = r === 0 ? 2 : (r === 1 ? 4 : Math.round(s.interval * s.ease * 1.3)); s.reps = r + 1; }
  s.due = grade === 'again' ? Date.now() : Date.now() + s.interval * DAY;
  return s;
}
function ivLabel(s, grade) {
  if (grade === 'again') return '<1m';
  const d = schedule(s, grade).interval;
  if (d < 1) return '<1d'; if (d < 30) return d + 'd';
  const mo = d / 30; return (mo < 10 ? mo.toFixed(1) : Math.round(mo)) + 'mo';
}

/* ── Queue ────────────────────────────────────────────── */
function buildQueue() {
  const now = Date.now(), cards = deckCards(), due = [], fresh = [];
  for (const v of cards) {
    const s = srs[v.term];
    if (!s || (!s.reps && !s.due)) fresh.push(v); else if (s.due <= now) due.push(v);
  }
  due.sort((a, b) => srs[a.term].due - srs[b.term].due);
  queue = [...due, ...shuffle(fresh).slice(0, NEW_PER_SESSION)];
  reviewed = 0;
}
function counts() {
  const now = Date.now(), cards = deckCards(); let nw = 0, due = 0;
  for (const v of cards) { const s = srs[v.term]; if (!s || (!s.reps && !s.due)) nw++; else if (s.due <= now) due++; }
  return { nw, due, total: cards.length };
}

/* ── Render ───────────────────────────────────────────── */
function renderDecks() {
  const all = [['all', 'All', VOCAB.length]].concat(CATS.map(c => [c, c, VOCAB.filter(v => v.cat === c).length]));
  document.getElementById('deckPanel').innerHTML = all.map(([id, label, n]) =>
    `<button type="button" class="ndrop-opt${id === activeDeck ? ' sel' : ''}" data-val="${esc(id)}"><span>${esc(label)}</span><span class="c">${n}</span></button>`
  ).join('');
  document.getElementById('deckLabel').textContent = activeDeck === 'all' ? 'All' : activeDeck;
}
function renderStats() {
  const c = counts();
  document.getElementById('stats').innerHTML = `
    <div class="stat new"><div class="v">${c.nw}</div><div class="l">New</div></div>
    <div class="stat due"><div class="v">${c.due}</div><div class="l">Due</div></div>
    <div class="stat done"><div class="v">${reviewed}</div><div class="l">Reviewed</div></div>`;
}
function setDeck(d) { activeDeck = d; localStorage.setItem(DECK_KEY, d); renderDecks(); start(); }
function toggleDrop(e) { e.stopPropagation(); document.getElementById('deckDrop').classList.toggle('open'); }

document.getElementById('deckPanel').addEventListener('click', e => {
  const b = e.target.closest('.ndrop-opt'); if (!b) return;
  document.getElementById('deckDrop').classList.remove('open'); setDeck(b.dataset.val);
});
document.addEventListener('click', () => document.getElementById('deckDrop').classList.remove('open'));

function toggleDir() {
  dir = dir === 'fwd' ? 'rev' : 'fwd';
  localStorage.setItem(DIR_KEY, dir);
  document.getElementById('dirBtn').textContent = dir === 'fwd' ? '🔁 Term → Definition' : '🔁 Definition → Term';
  start();
}

function start() { buildQueue(); renderStats(); next(); }
function next() { flipped = false; current = queue[0] || null; if (!current) { renderDone(); return; } renderCard(); }

function renderCard() {
  const v = current, s = srs[v.term] || blankState();
  const front = dir === 'fwd'
    ? `<div class="tag">${esc(v.cat)}</div><div class="term">${esc(v.term)}</div>${v.full ? `<div class="full">${esc(v.full)}</div>` : ''}`
    : `<div class="tag">${esc(v.cat)}</div><div class="def">${v.def}</div>`;
  const back = dir === 'fwd'
    ? `<div class="tag">${esc(v.cat)}</div><div class="def">${v.def}</div>${wlink(v)}`
    : `<div class="tag">${esc(v.cat)}</div><div class="term">${esc(v.term)}</div>${v.full ? `<div class="full">${esc(v.full)}</div>` : ''}${wlink(v)}`;
  document.getElementById('stage').innerHTML = `
    <div class="scene"><div class="fcard" id="fcard" onclick="flip()">
      <div class="face front">${front}<div class="flip-hint">tap or press Space to flip</div></div>
      <div class="face back">${back}</div>
    </div></div>
    <div id="controls"><div class="reveal-row"><button class="reveal neu-btn" onclick="flip()">Show answer</button></div></div>`;
}
function wlink(v) {
  return v.wiki
    ? `<a class="wlink" href="${WIKI_BASE}${v.wiki.replace(/ /g, '%20')}" target="_blank" rel="noopener" onclick="event.stopPropagation()">📂 ${esc(v.wiki.split('/').pop().replace('.md', ''))}</a>`
    : '';
}
function flip() {
  if (flipped) return; flipped = true;
  document.getElementById('fcard').classList.add('flipped');
  const s = srs[current.term] || blankState();
  document.getElementById('controls').innerHTML = `<div class="grades">
    ${[['again', 'Again'], ['hard', 'Hard'], ['good', 'Good'], ['easy', 'Easy']].map(([g, lbl], i) =>
      `<button class="grade ${g}" onclick="rate('${g}')"><span class="g">${lbl}</span><span class="iv">${ivLabel(s, g)}</span><span class="kbd">${i + 1}</span></button>`
    ).join('')}
  </div>`;
}
function rate(grade) {
  if (!flipped || !current) return;
  const v = current, s = srs[v.term] || blankState();
  srs[v.term] = schedule(s, grade); saveSrs();
  queue.shift();
  if (grade === 'again') queue.splice(Math.min(3, queue.length), 0, v);
  reviewed++; renderStats(); next();
}
function renderDone() {
  const c = counts();
  document.getElementById('stage').innerHTML = `
    <div class="done">
      <div class="em">${reviewed ? '🎉' : '✨'}</div>
      <h3>${reviewed ? `Reviewed ${reviewed} card${reviewed === 1 ? '' : 's'}` : 'Nothing due here'}</h3>
      <p>${c.due + c.nw > 0
        ? `Still ${c.nw} new / ${c.due} due in this deck.`
        : 'No cards due in this deck right now — spaced repetition will bring them back when it\'s time.'}</p>
      <div class="row">
        ${c.due + c.nw > 0 ? '<button class="tool accent neu-btn" onclick="start()">Keep going →</button>' : ''}
        <button class="tool" onclick="resetDeck()">↺ Reset this deck</button>
        <a class="tool" href="index.html" style="display:inline-flex;align-items:center">📚 Dictionary</a>
      </div>
    </div>`;
}
function resetDeck() {
  if (!confirm('Reset spaced-repetition progress for this deck?')) return;
  for (const v of deckCards()) delete srs[v.term];
  saveSrs(); renderStats(); start();
}

/* Keyboard: space/enter flips; 1-4 grades */
document.addEventListener('keydown', e => {
  if (!current) return;
  if ((e.key === ' ' || e.key === 'Enter') && !flipped) { e.preventDefault(); flip(); return; }
  if (flipped) { const map = { '1': 'again', '2': 'hard', '3': 'good', '4': 'easy' }; if (map[e.key]) { e.preventDefault(); rate(map[e.key]); } }
});

/* ── Sync (optional — requires ?api= and GitHub login) ── */
const _VQPARAMS = new URLSearchParams(window.location.search);
const _VAPI = (_VQPARAMS.get('api') || localStorage.getItem('nogem-api') || '').replace(/\/$/, '');
if (_VAPI) localStorage.setItem('nogem-api', _VAPI);

(function _captureVocabToken() {
  const t = _VQPARAMS.get('quiz_token');
  if (!t) return;
  localStorage.setItem('quiz-jwt', t);
  const url = new URL(window.location.href);
  url.searchParams.delete('quiz_token');
  history.replaceState(null, '', url.toString());
})();

function _vocabJwt()  { return localStorage.getItem('quiz-jwt') || ''; }
function _vocabUser() {
  const jwt = _vocabJwt();
  if (!jwt) return null;
  try { return JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return null; }
}

function _renderVocabUser() {
  const btn = document.getElementById('vocab-user-btn');
  if (!btn) return;
  const u = _vocabUser();
  if (u) {
    btn.innerHTML = (u.avatar ? `<img src="${u.avatar}&s=20" style="width:18px;height:18px;border-radius:50%;vertical-align:middle;margin-right:4px">` : '') + esc(u.name || u.sub);
    btn.title = `Signed in as @${u.sub} — click to sign out`;
    btn.onclick = () => { localStorage.removeItem('quiz-jwt'); _renderVocabUser(); };
  } else {
    btn.innerHTML = '↑ Sync';
    btn.title = _VAPI ? 'Sign in with GitHub to sync progress' : 'Add ?api=<backend-url> to enable sync';
    btn.onclick = _VAPI
      ? () => { window.location.href = `${_VAPI}/auth/quiz-login?return=${encodeURIComponent(window.location.href)}`; }
      : () => alert('Add ?api=<your-cloud-run-url> to the URL to enable sync.');
  }
}

async function _vocabSyncLoad() {
  if (!_VAPI || !_vocabJwt()) return;
  try {
    const r = await fetch(`${_VAPI}/api/quiz/progress`, { headers: { Authorization: `Bearer ${_vocabJwt()}` } });
    if (!r.ok) return;
    const { srs: remSrs = {} } = await r.json();
    if (Object.keys(remSrs).length) { Object.assign(srs, remSrs); saveSrs(); renderStats(); }
  } catch {}
}

/* ── Init ─────────────────────────────────────────────── */
_renderVocabUser();
_vocabSyncLoad();
document.getElementById('dirBtn').textContent = dir === 'fwd' ? '🔁 Term → Definition' : '🔁 Definition → Term';
if (!VOCAB.length) {
  document.getElementById('stage').innerHTML = '<div class="done"><div class="em">📭</div><h3>No vocabulary yet</h3><p>Add terms via the Requests page, then process them into vocab.js.</p></div>';
} else {
  renderDecks(); start();
}
