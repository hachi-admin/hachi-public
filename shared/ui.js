/* ═══════════════════════════════════════════════════════════
   shared/ui.js — hachi-public shared utilities
   Theme toggle · HTML escape · array shuffle
   Loaded on every page (quiz, vocab, dashboard) before page-specific scripts.
   ═══════════════════════════════════════════════════════════ */

/* ── Theme ─────────────────────────────────────────────── */
const root = document.documentElement;
const themeBtn = document.getElementById('theme-btn');

(function initTheme() {
  const stored = localStorage.getItem('nogem-theme');
  const t = stored || 'light';
  root.setAttribute('data-theme', t);
  if (themeBtn) themeBtn.textContent = t === 'dark' ? '☀️' : '🌙';
})();

function toggleTheme() {
  const t = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', t);
  if (themeBtn) themeBtn.textContent = t === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('nogem-theme', t);
  window.dispatchEvent(new CustomEvent('themechange', { detail: t }));
}

/* ── HTML escape ───────────────────────────────────────── */
function esc(s) {
  return String(s || '').replace(/[&<>"]/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])
  );
}

/* ── Array shuffle (Fisher-Yates) ──────────────────────── */
function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
