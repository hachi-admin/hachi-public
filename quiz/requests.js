/* ═══════════════════════════════════════════════════════════
   quiz/requests.js — Learning request forms (vocab + quiz)
   Depends on: ../shared/ui.js (theme/esc)
   ═══════════════════════════════════════════════════════════ */

function uid() { return Math.random().toString(36).slice(2, 9); }
function dl(name, content, type) {
  const b = new Blob([content], { type });
  const u = URL.createObjectURL(b);
  const a = document.createElement('a'); a.href = u; a.download = name; a.click();
  URL.revokeObjectURL(u);
}
function toast(e, msg) {
  const b = e && e.target && e.target.closest('button');
  if (b) { const t = b.textContent; b.textContent = msg; setTimeout(() => b.textContent = t, 1300); }
}

/* ── Vocabulary free-text ─────────────────────────────── */
const VKEY = 'sb-vocab', vbox = document.getElementById('vocabBox');
vbox.value = localStorage.getItem(VKEY) || '';
function vlines() { return vbox.value.split('\n').map(s => s.trim()).filter(Boolean); }
function saveVocab() {
  localStorage.setItem(VKEY, vbox.value);
  const n = vlines().length;
  document.getElementById('vocabCount').textContent = `${n} entr${n === 1 ? 'y' : 'ies'}`;
}
async function copyVocab(e) { try { await navigator.clipboard.writeText(vbox.value); toast(e, '✓ Copied'); } catch { alert(vbox.value); } }
function downloadVocab() { dl('_vocab.txt', vbox.value, 'text/plain'); }

/* ── Quiz requests ────────────────────────────────────── */
const QKEY = 'sb-quiz'; let selectedSources = [];
const qload = () => { try { return JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch { return []; } };
const qsave = a => localStorage.setItem(QKEY, JSON.stringify(a));

function addQuiz() {
  const topic = document.getElementById('q-topic').value.trim();
  if (!topic) { document.getElementById('q-topic').focus(); return; }
  const a = qload();
  a.push({ id: uid(), topic, sources: selectedSources.slice(), note: document.getElementById('q-note').value.trim(), ts: new Date().toISOString() });
  qsave(a);
  document.getElementById('q-topic').value = '';
  document.getElementById('q-note').value = '';
  selectedSources = []; renderChips();
  document.getElementById('q-topic').focus(); renderQuiz();
}
function qdel(id) { qsave(qload().filter(x => x.id !== id)); renderQuiz(); }
function qclear() { if (confirm('Clear all quiz requests?')) { qsave([]); renderQuiz(); } }

function renderQuiz() {
  const a = qload(), el = document.getElementById('quizSaved');
  if (!a.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="saved-h"><h3 style="font-size:.82rem">Saved (${a.length})</h3>
    <button class="tool" onclick="qcopy(event)">📋 Copy</button><button class="tool" onclick="qdownload()">⬇ Download</button><button class="tool" onclick="qclear()">🗑</button></div>` +
    a.slice().reverse().map(r => {
      const bits = [r.note ? esc(r.note) : '', r.sources.length ? `${r.sources.length} source${r.sources.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
      return `<div class="req"><span class="badge quiz">quiz</span><div class="body"><div class="ttl">${esc(r.topic)}</div>${bits ? `<div class="meta">${bits}</div>` : ''}</div><button class="del" onclick="qdel('${r.id}')" title="Delete">✕</button></div>`;
    }).join('');
}
function quizMd() {
  const a = qload();
  return `# Quiz requests (${a.length})\n` +
    a.map(r => `- **${r.topic}**` + (r.note ? ` — ${r.note}` : '') + (r.sources.length ? `\n  - sources: ${r.sources.join(', ')}` : '')).join('\n') +
    '\n\nBuild into quiz/topics.js per quiz/CLAUDE.md.\n';
}
async function qcopy(e) { try { await navigator.clipboard.writeText(quizMd()); toast(e, '✓ Copied'); } catch { alert(quizMd()); } }
function qdownload() { dl('_quiz-requests.json', JSON.stringify(qload(), null, 2), 'application/json'); }

/* ── Obsidian wiki search ─────────────────────────────── */
let obFiles = [];
const _K2 = 'sb2026xw';
function _dec2(h) {
  return (h.match(/.{2}/g)||[]).map((x,i)=>String.fromCharCode(parseInt(x,16)^_K2.charCodeAt(i%_K2.length))).join('');
}
function loadObsidian() {
  obFiles = (window.OB_TREE || []).map(_dec2).filter(Boolean);
}
function onSrcSearch() {
  const q = document.getElementById('srcSearch').value.trim().toLowerCase();
  const box = document.getElementById('srcResults');
  if (!obFiles || !q) { box.classList.remove('show'); return; }
  const m = obFiles.filter(p => p.toLowerCase().includes(q)).slice(0, 12);
  box.innerHTML = m.length
    ? m.map(p => `<div class="src-res-item" data-path="${esc(p)}">${esc(p.replace(/^wiki\//, ''))}</div>`).join('')
    : '<div class="src-res-item" style="cursor:default;color:var(--m2)">No wiki pages match</div>';
  box.classList.add('show');
}
function addSrc(p) {
  if (p && !selectedSources.includes(p)) selectedSources.push(p);
  renderChips();
  document.getElementById('srcSearch').value = '';
  document.getElementById('srcResults').classList.remove('show');
}
function rmSrc(p) { selectedSources = selectedSources.filter(x => x !== p); renderChips(); }
function renderChips() {
  document.getElementById('srcChips').innerHTML = selectedSources.map(p =>
    `<span class="src-chip">${esc(p.split('/').pop().replace(/\.md$/, ''))}<button data-rm="${esc(p)}" title="Remove">✕</button></span>`
  ).join('');
}

document.getElementById('srcResults').addEventListener('click', e => {
  const it = e.target.closest('.src-res-item'); if (it && it.dataset.path) addSrc(it.dataset.path);
});
document.getElementById('srcChips').addEventListener('click', e => {
  const b = e.target.closest('button[data-rm]'); if (b) rmSrc(b.getAttribute('data-rm'));
});
document.getElementById('srcSearch').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    let v = e.target.value.trim();
    if (v) { if (!/^wiki\//.test(v)) v = 'wiki/' + v; addSrc(v); }
  }
});
document.addEventListener('click', e => {
  if (!e.target.closest('.srcpick')) document.getElementById('srcResults').classList.remove('show');
});

/* ── Init ─────────────────────────────────────────────── */
saveVocab(); renderChips(); renderQuiz(); loadObsidian();
