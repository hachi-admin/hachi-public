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
  CAT_META:{ heroTemplates:[{id:'dark_flat',label:'黒地・白抜き'},{id:'colour_block',label:'色地・白文字'}] },
  _guildsData:[], _selectedGuildId:null,
  PROJECT_LANG:'JP', _I18N:{ JP:{ 'empty-factchecks':'なし','empty-sources':'なし','empty-blocked':'なし' } },
  CATEGORIES:[{id:'c1',name:'AI活用'}], CAT_ARTICLES:[], SOURCES:[], REGISTRY:[],
  COSTS:{ 'article-writer':{ tokensUsed:120000, calls:14, estimatedCost:0.42 } },
  _setText:(id,v)=>{ store[id] = v; },
  INTENSITY_MODE:'balanced', FORCE_FLASH:false, ACTIVE_PROVIDER:'gemini',
  _loadConnections:async()=>{},
  setTimeout, clearTimeout, URL, Math, Date, JSON, Object, Array, String, Number, Boolean, Map, Set, RegExp, isNaN, parseInt, parseFloat,
};

// Pull out just the functions under test plus their module-level dependencies.
const need = ['TASK_TYPE_LABELS','ROUTINE_TYPES','isRoutine','SRC_CHIP','srcChip','hostOf','TAG_VOCAB'];
const fns  = ['_taskSummary','_routineGrid','_renderFactChecks','_buildSourceRows','_buildArticleRows','_wikiCard','_renderUsageKpis','_fmtBytes','_renderSettingsOverview','_tagSuggestions','_tagVocabFor','_markdownToHtml','_inline','_visualSection'];

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
// Remediation states. A corrected day must drop out of the needs-attention list; an escalated or
// failed one must stay and say why it is still there.
run('_renderFactChecks corrected', () => { sandbox.window._factChecks = [{id:'d1',newsDate:'2026-08-19',counts:{unsupported:1,verified:9},remediation:{action:'corrected',corrected:1},verdicts:[{verdict:'unsupported',headline:'A',reason:'r'}]}]; api._renderFactChecks(); const out = String(store.last); if (!/対応が必要な指摘はありません/.test(out)) throw new Error('corrected day still shown as actionable'); return out; });
run('_renderFactChecks escalated', () => { sandbox.window._factChecks = [{id:'d2',newsDate:'2026-08-18',counts:{unsupported:3},remediation:{action:'approval_requested',approvalId:'a1'},verdicts:[{verdict:'unsupported',headline:'B',reason:'r'}]}]; api._renderFactChecks(); const out = String(store.last); if (!/承認待ち/.test(out)) throw new Error('escalated day does not say it is waiting on approval'); return out; });
run('_renderFactChecks remfailed', () => { sandbox.window._factChecks = [{id:'d3',newsDate:'2026-08-17',counts:{unsupported:1},remediation:{action:'failed',detail:'github 403'},verdicts:[{verdict:'unsupported',headline:'C',reason:'r'}]}]; api._renderFactChecks(); const out = String(store.last); if (!/自動訂正に失敗/.test(out)) throw new Error('failed remediation not surfaced'); return out; });
run('_buildSourceRows',        () => api._buildSourceRows([{id:'s1',name:'ITmedia AI+',type:'rss',domain:'news',url:'https://www.itmedia.co.jp/news/rss.xml',enabled:true},{id:'s2',name:'停止中ソース',type:'url',domain:'web',url:'not a url',enabled:false}]));
run('_buildSourceRows empty',  () => api._buildSourceRows([]));
run('_buildArticleRows empty', () => api._buildArticleRows());
run('_wikiCard full',          () => api._wikiCard({ slug:'ai-agents', title:'AIエージェントの設計', category:'技術', summary:'エージェントの責務分割について。', concepts:['責務分割','権限'], updatedAt:new Date().toISOString() }));
// Older pages predate the summary field; the card must degrade rather than render a blank block.
run('_wikiCard no summary',    () => api._wikiCard({ slug:'old', title:'古いページ' }));

// _renderUsageKpis writes through _setText/DOM rather than returning markup, so the assertion is
// that it does not throw. The never-measured path is the one that ships broken: storageUsage is
// null until the daily cost report has run even once.
run('_renderUsageKpis unmeasured', () => { sandbox.window._storageUsage = null; api._renderUsageKpis(); return 'ok'; });
run('_renderUsageKpis measured',   () => {
  sandbox.window._storageUsage = { ok:true, bytes:3.8e9, count:1240, measuredAt:new Date().toISOString(),
    byPrefix:[{name:'heroes',bytes:3e9,count:900},{name:'diagrams',bytes:8e8,count:340}] };
  api._renderUsageKpis(); return 'ok';
});
run('_renderUsageKpis failed',     () => { sandbox.window._storageUsage = { ok:false, reason:'no bucket' }; api._renderUsageKpis(); return 'ok'; });
run('_fmtBytes scales',            () => [0, 512, 4096, 5.2e6, 3.8e9].map(api._fmtBytes).join(' '));
// _renderSettingsOverview reads module globals and writes through the DOM; it also kicks off
// _loadConnections, which is stubbed here since the assertion is about the synchronous summary.
run('_renderSettingsOverview',     () => { api._renderSettingsOverview(); return String(store['settings-summary'] ?? store.last ?? 'ok'); });

// Tag suggestions must produce something for a channel with no tags anywhere on the server —
// the case the old copy-from-elsewhere version could not handle at all.
run('_tagSuggestions bare forum',  () => {
  const out = api._tagSuggestions({ id:'c1', name:'bug-reports', availableTags:[] }, ['log-monitor-agent'], ['log_monitor']);
  if (!out.length) throw new Error('no suggestions for an untagged forum');
  if (!out.some(t => t.name === '緊急')) throw new Error('triage vocabulary not matched for a bug channel');
  return out.map(t => t.name).join(' ');
});
run('_tagSuggestions excludes existing', () => {
  const out = api._tagSuggestions({ id:'c1', name:'bug-reports', availableTags:[{name:'緊急'}] }, [], ['log_monitor']);
  if (out.some(t => t.name === '緊急')) throw new Error('suggested a tag the channel already has');
  return out.map(t => t.name).join(' ');
});
// The docs renderer had no table or image support; documents using them rendered as literal
// pipes and stray "!". These assert the output actually contains the elements.
run('_markdownToHtml table',   () => {
  const out = api._markdownToHtml('# H\n\n| 種類 | 説明 |\n|---|---:|\n| A | 1 |\n| B | 2 |\n\nafter');
  if (!/<table class="md-table">/.test(out)) throw new Error('no table element');
  if (!/<th[^>]*>種類<\/th>/.test(out)) throw new Error('header cell missing');
  if (!/text-align:right/.test(out)) throw new Error('alignment from separator row ignored');
  if (/\|/.test(out.replace(/<[^>]+>/g, ''))) throw new Error('raw pipes leaked into the text');
  if (!/after/.test(out)) throw new Error('content after the table was swallowed');
  return 'ok';
});
run('_markdownToHtml no table', () => {
  // A lone pipe in prose must not be mistaken for a table.
  const out = api._markdownToHtml('a | b is not a table');
  if (/<table/.test(out)) throw new Error('false positive table');
  return 'ok';
});
run('_inline image',           () => {
  const out = api._inline('![hero](https://x/y.png)');
  if (!/<img src="https:\/\/x\/y.png" alt="hero"/.test(out)) throw new Error('image not rendered');
  if (/<a /.test(out)) throw new Error('image was turned into a link');
  return 'ok';
});
// The look section is new and reads CAT_META, which is empty until the meta endpoint answers —
// the state every dashboard shows for a moment on load.
const _section = (t, sum, body) => `<details><summary>${t}${sum}</summary>${body}</details>`;
run('_visualSection unset',    () => {
  const out = api._visualSection({ id: 'c1', visual: {} }, _section);
  if (!/自動/.test(out)) throw new Error('an unstyled magazine should read as 自動');
  return out.slice(0, 60);
});
run('_visualSection chosen',   () => {
  const out = api._visualSection({ id: 'c1', visual: { template: 'dark_flat', accent: '#8A2846' } }, _section);
  if (!/#8A2846/.test(out)) throw new Error('the chosen colour is missing');
  if (!/指定あり/.test(out)) throw new Error('a styled magazine should say so in the summary');
  return 'ok';
});
run('_visualSection full',     () => {
  // A magazine that has named itself should show that name in the collapsed summary — it is the
  // most identifying thing about it, and more useful there than the word 指定あり.
  const out = api._visualSection({ id: 'c1', visual: { template: 'dark_flat', accent: '#8A2846', align: 'left', eyebrow: 'AI夜間ラボ' } }, _section);
  if (!/AI夜間ラボ/.test(out)) throw new Error('the magazine name is missing');
  if (!/selected>左揃え/.test(out.replace(/"/g, ''))) throw new Error('the chosen alignment is not selected');
  return 'ok';
});
run('_visualSection no meta',  () => {
  // CAT_META arrives asynchronously; rendering before it must not throw.
  const saved = sandbox.CAT_META; sandbox.CAT_META = null;
  try { return api._visualSection({ id: 'c1', visual: {} }, _section).slice(0, 40); }
  finally { sandbox.CAT_META = saved; }
});
run('_inline link still works', () => {
  const out = api._inline('[t](https://x)');
  if (!/<a href="https:\/\/x"/.test(out)) throw new Error('link broken');
  return 'ok';
});
run('_tagVocabFor unknown channel', () => {
  const out = api._tagVocabFor({ name:'random-channel' }, [], []);
  if (!out.length) throw new Error('no fallback vocabulary');
  return out.map(t => t.name).join(' ');
});


if (missing) console.log(`\n${missing} function(s) missing from app.js — update scripts/smoke-render.js`);
console.log(fail || missing ? `\nFAILED (${fail} render, ${missing} missing)` : '\nall render checks passed');
process.exit(fail || missing ? 1 : 0);
