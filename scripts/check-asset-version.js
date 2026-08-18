/**
 * check-asset-version.js — refuse a dashboard change that ships without a new asset version.
 *
 * GitHub Pages serves these files with `max-age=600`, and index.html, app.js and dashboard.css
 * expire independently. That means a reader can hold new HTML against old JavaScript for up to
 * ten minutes — and, if a tab has been open, considerably longer. The symptom is a change that is
 * demonstrably live on the server and invisible in the browser, which is exactly what happened.
 *
 * The version query is what breaks that: a new `?v=` is a different URL, so the browser cannot
 * serve the old file. It only works if it is actually bumped, which is what this checks.
 *
 * Usage: node scripts/check-asset-version.js <base-ref>
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const base = process.argv[2] || 'origin/main';
const sh = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();

let changed = [];
try {
  changed = sh(`git diff --name-only ${base}...HEAD`).split('\n').filter(Boolean);
} catch (err) {
  // Passing because the diff could not be computed is the same as not having the check at all,
  // and it would look green. Say so and fail.
  console.error(`✖ check-asset-version: could not diff against ${base} — ${err.message}`);
  console.error('  Does the workflow check out with fetch-depth: 0?');
  process.exit(1);
}

const ASSETS = ['dash/app.js', 'dash/dashboard.css', 'shared/neu.css', 'shared/ui.js'];
const touched = changed.filter((f) => ASSETS.includes(f));
if (!touched.length) {
  console.log('check-asset-version: no cached assets changed');
  process.exit(0);
}

const versionOf = (src) => {
  const versions = [...src.matchAll(/(?:app\.js|dashboard\.css|neu\.css|ui\.js)\?v=(\d+)/g)].map((m) => Number(m[1]));
  return versions.length ? Math.max(...versions) : 0;
};

const now = versionOf(readFileSync('dash/index.html', 'utf8'));
let before = 0;
try { before = versionOf(sh(`git show ${base}:dash/index.html`)); } catch { /* new file */ }

if (now <= before) {
  console.error(
    `\n✖ ${touched.join(', ')} changed but the asset version in dash/index.html is still ?v=${now}.\n` +
    `  Readers will keep the cached copy for up to 10 minutes, or longer with a tab open.\n` +
    `  Bump every ?v= in dash/index.html to ${before + 1}.\n`);
  process.exit(1);
}
console.log(`check-asset-version: ${touched.length} asset(s) changed, version ${before} → ${now}`);
