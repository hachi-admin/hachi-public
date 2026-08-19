/**
 * Render smoke test.
 *
 * eslint's no-undef catches a name that resolves to nothing. It does not catch a function that
 * throws on a shape the data actually takes — a null where a string was assumed, an empty array
 * reaching a `[0]`. Both failure modes have now reached production on this dashboard, and both
 * shared one cause: the code was read, not run.
 *
 * This extracts the render functions from app.js and executes them against stub data, including
 * the empty and failed cases that are hardest to reach by clicking around. It asserts the output
 * is a string that does not leak `undefined`, `NaN`, or `[object Object]` — the visible symptoms
 * of a render bug, which are otherwise only noticed on a phone.
 *
 * app.js is a browser script with no exports, so functions are extracted by brace-matching and
 * evaluated in a sandbox holding the globals they touch. That is deliberately crude: it needs no
 * build step and no DOM library, so it stays runnable in CI forever.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'dash/app.js'), 'utf8');

const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store = {};
const el = () => ({ set innerHTML(v) { store.last = v; }, get innerHTML() { return store.last; },
  classList:{add(){},remove(){},toggle(){}}, querySelectorAll:()=>[], style:{} });

const sandbox = {
  esc, document:{ getElementById: () => el(), querySelectorAll: () => [], querySelector: () => null },
  window:{}, console, relTime:(d)=>'3分前', fmtDate:(d)=>'08-19', _catDate:(d)=>'08-19',
  _wikiSelectMode:false, _wikiSelected:new Set(),
  PROJECT_LANG:'JP', _I18N:{ JP:{ 'empty-factchecks':'なし','empty-sources':'なし','empty-blocked':'なし' } },
  CATEGORIES:[{id:'c1',name:'AI活用'}], CAT_ARTICLES:[], SOURCES:[], COSTS:{}, REGISTRY:[],
  setTimeout, clearTimeout, URL, Math, Date, JSON, Object, Array, String, Number, Boolean, Map, Set, RegExp, isNaN, parseInt, parseFloat,
};

// Pull out just the functions under test plus their module-level dependencies.
const need = ['TASK_TYPE_LABELS','ROUTINE_TYPES','isRoutine','SRC_CHIP','srcChip','hostOf'];
const fns  = ['_taskSummary','_routineGrid','_renderFactChecks','_buildSourceRows','_buildArticleRows','_wikiCard'];

let code = '';
let missing = 0;
for (const n of need) {
  const m = src.match(new RegExp(`^const ${n} = [\\s\\S]*?;$`, 'm'));
  if (m) code += m[0] + '\n';
}
for (const n of fns) {
  const i = src.indexOf(`function ${n}(`);
  // A renamed or deleted function must fail the build, not silently drop out of the test.
  if (i < 0) { console.log(`\u2717 ${n}: not found in app.js`); missing++; continue; }
  // Brace-match to the end of the function.
  let d = 0, j = src.indexOf('{', i);
  const start = i;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) { code += src.slice(start, k + 1) + '\n'; break; } }
  }
}
code += `\nreturn { ${fns.join(', ')} };`;

const make = new Function(...Object.keys(sandbox), code);
const api = make(...Object.values(sandbox));

const T = (over={}) => ({ id:'t1', type:'cost_report', status:'completed', goal:'日次コスト集計', updatedAt:new Date().toISOString(), ...over });

let fail = 0;
const run = (name, fn) => { try { const out = fn(); if (/undefined|\[object Object\]|NaN/.test(String(out))) { console.log(`✗ ${name}: leaked -> ${String(out).match(/.{0,80}(undefined|NaN|\[object Object\]).{0,40}/)?.[0]}`); fail++; } else console.log(`✓ ${name}`); } catch (e) { console.log(`✗ ${name}: ${e.message}`); fail++; } };

run('_taskSummary all clear',  () => api._taskSummary([], [T(), T()]));
run('_taskSummary failures',   () => api._taskSummary([T({status:'failed', type:'content'})], [T()]));
run('_taskSummary running',    () => api._taskSummary([T({status:'running'})], []));
run('_routineGrid empty',      () => api._routineGrid([]));
run('_routineGrid mixed',      () => api._routineGrid([T(), T({type:'log_monitor'}), T({type:'note_stats'}), T({type:'weird_unlabelled'})]));
run('_renderFactChecks none',  () => { sandbox.window._factChecks = []; return api._renderFactChecks(), store.last; });
run('_renderFactChecks clean', () => { sandbox.window._factChecks = [{id:'2026-08-18',newsDate:'2026-08-18',counts:{verified:7},verdicts:[{verdict:'verified'}]}]; return api._renderFactChecks(), store.last; });
run('_renderFactChecks bad',   () => { sandbox.window._factChecks = [{id:'2026-08-19',newsDate:'2026-08-19',counts:{unsupported:2,verified:5},verdicts:[{verdict:'unsupported',headline:'AIが人間を超えた',reason:'出典に該当記述なし'},{verdict:'verified'}]}]; return api._renderFactChecks(), store.last; });
run('_buildSourceRows',        () => api._buildSourceRows([{id:'s1',name:'ITmedia AI+',type:'rss',domain:'news',url:'https://www.itmedia.co.jp/news/rss.xml',enabled:true},{id:'s2',name:'停止中ソース',type:'url',domain:'web',url:'not a url',enabled:false}]));
run('_buildSourceRows empty',  () => api._buildSourceRows([]));
run('_buildArticleRows empty', () => api._buildArticleRows());
run('_wikiCard full',          () => api._wikiCard({ slug:'ai-agents', title:'AIエージェントの設計', category:'技術', summary:'エージェントの責務分割について。', concepts:['責務分割','権限'], updatedAt:new Date().toISOString() }));
// Older pages predate the summary field; the card must degrade rather than render a blank block.
run('_wikiCard no summary',    () => api._wikiCard({ slug:'old', title:'古いページ' }));


if (missing) console.log(`\n${missing} function(s) missing from app.js — update scripts/smoke-render.js`);
console.log(fail || missing ? `\nFAILED (${fail} render, ${missing} missing)` : '\nall render checks passed');
process.exit(fail || missing ? 1 : 0);
