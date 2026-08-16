/* ═══════════════════════════════════════════════════════════
   shared/ui.js — hachi-public shared utilities
   Theme toggle · HTML escape · array shuffle
   Loaded on every page (quiz, vocab, dashboard) before page-specific scripts.
   ═══════════════════════════════════════════════════════════ */

/* ── Theme ─────────────────────────────────────────────── */
const root = document.documentElement;
const themeBtn = document.getElementById('theme-btn');

// Pages that give the toggle a real icon (an <i class="ni">) own their own mark — writing
// textContent here would silently wipe it out, which is exactly what happened to the dashboard's
// theme button. Only pages still using a text glyph get one written for them.
function _paintThemeBtn(t) {
  if (!themeBtn || themeBtn.querySelector('.ni')) return;
  themeBtn.textContent = t === 'dark' ? '☀️' : '🌙';
}

(function initTheme() {
  const t = localStorage.getItem('nogem-theme') || 'light';
  root.setAttribute('data-theme', t);
  _paintThemeBtn(t);
})();

function toggleTheme() {
  const t = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', t);
  _paintThemeBtn(t);
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
