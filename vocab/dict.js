/* ═══════════════════════════════════════════════════════════
   vocab/dict.js — Vocabulary dictionary + quiz mode
   Depends on: vocab.js (data) + ../shared/ui.js (theme/esc/shuffle)
   ═══════════════════════════════════════════════════════════ */

const VOCAB = (window.VOCAB || []).slice().sort((a, b) => a.term.localeCompare(b.term, 'en'));
const WIKI_BASE = window.VOCAB_WIKI_BASE || '';
const CATS = [...new Set(VOCAB.map(v => v.cat))];
let activeCat = 'all';

/* ── Category dropdown ────────────────────────────────── */
function buildChips() {
  const opts = [['all', 'All', VOCAB.length]].concat(CATS.map(c => [c, c, VOCAB.filter(v => v.cat === c).length]));
  document.getElementById('catPanel').innerHTML = opts.map(([id, label, n]) =>
    `<button type="button" class="ndrop-opt${id === activeCat ? ' sel' : ''}" data-val="${esc(id)}"><span>${esc(label)}</span><span class="c">${n}</span></button>`
  ).join('');
  document.getElementById('catLabel').textContent = activeCat === 'all' ? 'All' : activeCat;
}
function setCat(c) { activeCat = c; buildChips(); render(); }
function toggleDrop(e) { e.stopPropagation(); document.getElementById('catDrop').classList.toggle('open'); }

document.getElementById('catPanel').addEventListener('click', e => {
  const b = e.target.closest('.ndrop-opt'); if (!b) return;
  document.getElementById('catDrop').classList.remove('open'); setCat(b.dataset.val);
});
document.addEventListener('click', () => document.getElementById('catDrop').classList.remove('open'));

/* ── Highlight matches ────────────────────────────────── */
function hl(text, q) {
  if (!q) return text;
  return text.replace(new RegExp('(?![^<]*>)(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>');
}

/* ── Render ───────────────────────────────────────────── */
function render() {
  const q  = document.getElementById('search').value.trim();
  const ql = q.toLowerCase();
  let list = VOCAB.filter(v => activeCat === 'all' || v.cat === activeCat);
  if (ql) {
    list = list.filter(v =>
      v.term.toLowerCase().includes(ql) ||
      (v.full || '').toLowerCase().includes(ql) ||
      v.def.toLowerCase().includes(ql));
  }
  document.getElementById('count').textContent =
    `${list.length} term${list.length === 1 ? '' : 's'}${q ? ` matching "${q}"` : ''}${activeCat !== 'all' ? ` in ${activeCat}` : ''}`;
  updateQuizBtn();

  if (!list.length) {
    document.getElementById('results').innerHTML = `<div class="empty">No terms found. Try a different search or category.</div>`;
    return;
  }

  const groups = (activeCat === 'all' ? CATS : [activeCat])
    .map(cat => [cat, list.filter(v => v.cat === cat)])
    .filter(([, items]) => items.length);

  document.getElementById('results').innerHTML = groups.map(([cat, items]) => `
    <div class="group">
      <div class="group-h">${cat}</div>
      <div class="vlist">
        ${items.map(v => {
          const wikiLink = v.wiki
            ? `<a class="vwiki" href="${WIKI_BASE}${v.wiki.replace(/ /g, '%20')}" target="_blank">📂 ${v.wiki.split('/').pop().replace('.md', '')}</a>`
            : '';
          return `
          <div class="vcard">
            <div class="vtop">
              <span class="vterm">${hl(esc(v.term), q)}</span>
              ${v.full ? `<span class="vfull">${hl(esc(v.full), q)}</span>` : ''}
              <span class="vbadge">${v.cat}</span>
            </div>
            <div class="vdef">${hl(v.def, q)}</div>
            ${wikiLink}
          </div>`;
        }).join('')}
      </div>
    </div>`).join('');
}

/* ── Vocab quiz mode ──────────────────────────────────── */
let vqList = [], vqi = 0, vqScore = 0, vqAnswered = false;

function curFiltered() {
  const ql = document.getElementById('search').value.trim().toLowerCase();
  let list = VOCAB.filter(v => activeCat === 'all' || v.cat === activeCat);
  if (ql) list = list.filter(v =>
    v.term.toLowerCase().includes(ql) || (v.full || '').toLowerCase().includes(ql) || v.def.toLowerCase().includes(ql));
  return list;
}
function updateQuizBtn() {
  const n = curFiltered().length;
  const span = document.getElementById('quizN'); if (span) span.textContent = n;
  const btn  = document.getElementById('quizBtn');
  if (btn) { btn.disabled = n < 4; btn.title = n < 4 ? 'Need at least 4 terms in this filter' : ''; }
}

function startQuiz() {
  const pool = curFiltered();
  if (pool.length < 4) return;
  vqList = shuffle(pool).slice(0, Math.min(12, pool.length));
  vqi = 0; vqScore = 0;
  document.querySelector('.hero').style.display = 'none';
  document.querySelector('.controls').style.display = 'none';
  document.getElementById('results').style.display = 'none';
  document.getElementById('quiz').style.display = 'block';
  renderVQ();
}
function exitQuiz() {
  document.getElementById('quiz').style.display = 'none';
  document.querySelector('.hero').style.display = '';
  document.querySelector('.controls').style.display = '';
  document.getElementById('results').style.display = '';
}
function renderVQ() {
  vqAnswered = false;
  const v = vqList[vqi];
  const sameCat = VOCAB.filter(x => x.cat === v.cat && x.term !== v.term);
  const pool = sameCat.length >= 3 ? sameCat : VOCAB.filter(x => x.term !== v.term);
  const opts = shuffle([v, ...shuffle(pool).slice(0, 3)]);
  const ans  = opts.indexOf(v);
  const wiki = v.wiki
    ? `<a class="vwiki" href="${WIKI_BASE}${v.wiki.replace(/ /g, '%20')}" target="_blank">📂 ${v.wiki.split('/').pop().replace('.md', '')}</a>` : '';
  document.getElementById('quiz').innerHTML = `
    <div class="vq-card">
      <div class="vq-bar">
        <span>Q ${vqi + 1} / ${vqList.length}</span>
        <div class="vq-prog"><div class="vq-pf" style="width:${vqi / vqList.length * 100}%"></div></div>
        <span style="color:var(--grn);font-weight:700">✓ ${vqScore}</span>
      </div>
      <div class="vq-term">${esc(v.term)}</div>
      ${v.full ? `<div class="vq-full">${esc(v.full)}</div>` : ''}
      <div class="vq-q">Which definition matches this term?</div>
      <div class="vq-opts">
        ${opts.map((o, i) => `<button class="vq-opt" id="vo${i}" onclick="pickVQ(${i},${ans})">${o.def}</button>`).join('')}
      </div>
      <div id="vqSrc"></div>
      <div class="vq-foot">
        <button class="vq-btn neu-btn sec" onclick="exitQuiz()">✕ Exit</button>
        <div id="vqNext"></div>
      </div>
    </div>`;
  document.getElementById('vqSrc').dataset.wiki = wiki;
}
function pickVQ(i, ans) {
  if (vqAnswered) return; vqAnswered = true;
  document.querySelectorAll('.vq-opt').forEach(b => b.disabled = true);
  if (i === ans) { vqScore++; document.getElementById('vo' + i).classList.add('correct'); }
  else { document.getElementById('vo' + i).classList.add('wrong'); document.getElementById('vo' + ans).classList.add('correct'); }
  const src = document.getElementById('vqSrc');
  if (src.dataset.wiki) src.innerHTML = `<div style="margin-top:12px">${src.dataset.wiki}</div>`;
  const last = vqi === vqList.length - 1;
  document.getElementById('vqNext').innerHTML = `<button class="vq-btn neu-btn" onclick="nextVQ()">${last ? 'See score 🏆' : 'Next →'}</button>`;
}
function nextVQ() { vqi++; if (vqi >= vqList.length) endQuiz(); else renderVQ(); }
function endQuiz() {
  const p    = Math.round(vqScore / vqList.length * 100);
  const face = p >= 80 ? '🏆' : p >= 50 ? '👍' : '📚';
  const msg  = p >= 80 ? 'Great recall!' : p >= 50 ? 'Solid — review the misses.' : 'Keep studying these terms.';
  document.getElementById('quiz').innerHTML = `
    <div class="vq-card" style="text-align:center">
      <div style="font-size:2.2rem;margin-bottom:6px">${face}</div>
      <div style="font-size:1.35rem;font-weight:800;margin-bottom:4px">${vqScore} / ${vqList.length} — ${p}%</div>
      <div style="color:var(--m);font-size:.85rem;margin-bottom:20px">${msg}</div>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="vq-btn neu-btn" onclick="startQuiz()">🔁 Retry</button>
        <button class="vq-btn neu-btn sec" onclick="exitQuiz()">📚 Back to dictionary</button>
      </div>
    </div>`;
}

/* ── Init ─────────────────────────────────────────────── */
buildChips();
render();
updateQuizBtn();
