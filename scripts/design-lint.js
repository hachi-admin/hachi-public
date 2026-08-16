#!/usr/bin/env node
/**
 * design-lint.js — executable form of the hachi design system.
 *
 * Every rule here came from a fault that shipped and had to be caught by eye. That is the point:
 * these are mechanical properties, so they should never reach a human reviewer again. Anything
 * genuinely subjective — whether a card carries too much, whether a page earns its place — is not
 * in here; that is the design agent's job (see hachi-core: design_audit).
 *
 * Usage:
 *   node scripts/design-lint.js            # report, exit 1 on error
 *   node scripts/design-lint.js --warn     # report, always exit 0
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const WARN_ONLY = process.argv.includes('--warn');

const findings = [];
const report = (level, file, line, rule, msg) => findings.push({ level, file, line, rule, msg });

// The linter states the rules it enforces, so it would otherwise flag itself.
const p0 = (dir, name) => name === 'design-lint.js';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules' || name === 'Attachments') continue;
    if (p0(dir, name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (['.css', '.js', '.html'].includes(extname(name))) out.push(p);
  }
  return out;
}
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

// ─── 1. One light source, expressed as a pair ────────────────────────────────
// A dark shadow with no light counterpart has no light source: the surface appears to dissolve
// rather than to be lit, which is what reads as a fade.
function shadowPairing(file, text) {
  const re = /box-shadow:\s*([^;}]+)[;}]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const v = m[1].trim();
    if (/var\(--sh/.test(v) || v === 'none' || /inset/.test(v)) continue;
    const layers = v.split(/,(?![^(]*\))/).length;
    if (layers < 2) {
      report('error', file, lineOf(text, m.index), 'shadow-pair',
        `single-direction shadow — needs a light counterpart or a --sh* token: ${v.slice(0, 60)}`);
    }
  }
}

// ─── 2. Soft-UI depth range ──────────────────────────────────────────────────
// Offsets past 8px or blur past 20px stop reading as a lit surface and start reading as a drop
// shadow on a floating rectangle.
function shadowDepth(file, text) {
  const re = /(--sh[a-z-]*)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    for (const s of m[2].matchAll(/(-?\d+)px\s+(-?\d+)px\s+(\d+)px/g)) {
      const [, x, y, blur] = s.map(Number);
      if (Math.abs(x) > 8 || Math.abs(y) > 8) {
        report('error', file, lineOf(text, m.index), 'shadow-depth',
          `${m[1]} offset ${Math.max(Math.abs(x), Math.abs(y))}px exceeds 8px`);
      }
      if (blur > 20) {
        report('error', file, lineOf(text, m.index), 'shadow-depth', `${m[1]} blur ${blur}px exceeds 20px`);
      }
    }
  }
}

// ─── 3. No coloured edges on surfaces ────────────────────────────────────────
// A solid colour border has a hard boundary and no light source, so it flattens the surface it is
// attached to. Status belongs in a pip, not an edge. Hairline dividers (1px) are exempt.
function colouredEdges(file, text) {
  const re = /border(-top|-left|-right|-bottom)?:\s*([2-9]|\d\d)px\s+solid\s+([^;}]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (/transparent/.test(m[3])) continue;
    report('error', file, lineOf(text, m.index), 'no-colour-edge',
      `${m[0].trim().slice(0, 50)} — use a status pip or a recessed well instead`);
  }
}

// ─── 4. Softness floor ───────────────────────────────────────────────────────
// Sharp corners break the soft illusion. Applies to surfaces; hairlines and dots are exempt via
// the size heuristic below.
const RADIUS_EXEMPT = /(50%|999px|99px)/;
// A "surface" is something the light model applies to: it has a shadow and enough size for that
// shadow to read. Inline marks — sparklines, pills, code spans, 18px buttons — are not surfaces,
// and rounding them to 12px would just make them look like lozenges.
function isSurface(block) {
  if (!/box-shadow/.test(block)) return false;              // no shadow, no depth to break
  const fs = block.match(/font-size:\s*(\d+(?:\.\d+)?)px/);
  if (fs && Number(fs[1]) <= 10) return false;              // caption-scale mark
  for (const dim of block.matchAll(/(?:width|height):\s*(\d+)px/g)) {
    if (Number(dim[1]) <= 28) return false;                 // chip-scale object
  }
  return true;
}
function radiusFloor(file, text) {
  const rule = /([^{}]+)\{([^}]*)\}/g;
  let m;
  while ((m = rule.exec(text)) !== null) {
    const [, selector, block] = m;
    const r = block.match(/border-radius:\s*(\d+)px/);
    if (!r) continue;
    const px = Number(r[1]);
    if (px === 0 || px >= 12 || RADIUS_EXEMPT.test(block)) continue;
    if (!isSurface(block)) continue;
    report(px >= 8 ? 'warn' : 'error', file, lineOf(text, m.index), 'radius-floor',
      `${selector.trim().split('\n').pop().slice(0, 40)} has ${px}px radius, below the 12px softness floor`);
  }
}

// ─── 5. Shadows need room ────────────────────────────────────────────────────
// Blur is 14–20px, so neighbours closer than that have overlapping shadows and the group reads as
// one muddy region rather than separate moulded objects.
function gridBreathing(file, text) {
  const re = /\.([a-z0-9_-]*grid[a-z0-9_-]*)\s*\{([^}]*)\}/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const gap = m[2].match(/(?:^|[;{\s])gap:\s*(\d+)px/);
    if (gap && Number(gap[1]) < 16) {
      report('warn', file, lineOf(text, m.index), 'grid-gap',
        `.${m[1]} gap ${gap[1]}px is under the 16px shadow clearance`);
    }
  }
}

// ─── 6. Monochrome surfaces ──────────────────────────────────────────────────
// A full-colour raster emoji sits *on* a neumorphic surface; the .ni marks are *part* of it. Emoji
// inside rendered button labels are the same clash.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
function noEmojiInControls(file, text) {
  if (!file.endsWith('.js') && !file.endsWith('.html')) return;
  const re = /<button[^>]*>([^<]{0,80})</g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (EMOJI.test(m[1])) {
      report('warn', file, lineOf(text, m.index), 'no-emoji-control',
        `emoji in a button label: ${m[1].trim().slice(0, 30)} — the button's shape is the affordance`);
    }
  }
}

// ─── 7. Focus must be visible ────────────────────────────────────────────────
// Soft UI carries state in shadow, which a keyboard user cannot see. Removing the outline without
// replacing it leaves them with nothing.
function focusVisible(files) {
  const css = files.filter((f) => f.endsWith('.css'));
  const all = css.map((f) => readFileSync(f, 'utf8')).join('\n');
  if (/outline:\s*none/.test(all) && !/:focus-visible/.test(all)) {
    report('error', css[0] ?? 'css', 0, 'focus-visible',
      'outline:none is used but no :focus-visible rule exists anywhere');
  }
}

// ─── 8. Scrims share the palette ─────────────────────────────────────────────
// Black is a foreign material here: it flattens everything behind it instead of dimming a surface
// that stays recognisable.
function scrimHue(file, text) {
  const re = /background:\s*rgba\(0,\s*0,\s*0,\s*\.?\d+\)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    report('error', file, lineOf(text, m.index), 'scrim-hue', 'black scrim — use var(--scrim)');
  }
}

// ─── 9. Japanese, not transliterated English ─────────────────────────────────
const KATAKANA_BANNED = {
  'インテリジェンス': '情報', 'ナレッジ': '知識', 'コンテンツ': '制作',
  'デベロップメント': '開発', 'セッティング': '設定', 'アナリティクス': '分析',
};
function katakana(file, text) {
  for (const [bad, good] of Object.entries(KATAKANA_BANNED)) {
    const i = text.indexOf(bad);
    if (i >= 0) {
      report('warn', file, lineOf(text, i), 'katakana',
        `「${bad}」is a transliteration where ordinary Japanese exists — prefer 「${good}」`);
    }
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────
const files = walk(ROOT);
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  const rel = relative(ROOT, f);
  if (f.endsWith('.css')) {
    shadowPairing(rel, text); shadowDepth(rel, text); colouredEdges(rel, text);
    radiusFloor(rel, text); gridBreathing(rel, text); scrimHue(rel, text);
  }
  noEmojiInControls(rel, text);
  katakana(rel, text);
}
focusVisible(files);

const errors = findings.filter((f) => f.level === 'error');
const warns = findings.filter((f) => f.level === 'warn');

if (!findings.length) {
  console.log('design-lint: clean');
  process.exit(0);
}
for (const group of [errors, warns]) {
  for (const f of group) {
    console.log(`${f.level === 'error' ? '✖' : '⚠'} ${f.file}:${f.line}  [${f.rule}]  ${f.msg}`);
  }
}
console.log(`\n${errors.length} error(s), ${warns.length} warning(s)`);
process.exit(errors.length && !WARN_ONLY ? 1 : 0);
