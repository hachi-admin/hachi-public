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

/* A DOM a test can actually control.
 *
 * Most render functions here take their data as arguments and return a string. Some read and write
 * the document instead — _syncHpSummaries reads the hero-preset form fields and writes each
 * section's summary — and those are exactly the ones whose output nobody sees until it is wrong on
 * a phone. Installing a field map lets them be exercised the same way as the rest. */
let _dom = null;
let _formHost = { innerHTML: '' };
let _lineHost = { innerHTML: '' };
let _hitHost = { innerHTML: '' };
const domForHits = () => { _dom = { 'hp-preview-hits': _hitHost, 'hp-sample-tabs': _hitHost }; };
const domFor = (spec) => { _dom = { 'hp-style-spec': { value: spec }, 'hp-style-form': _formHost }; };
const domForLines = (lines) => { _dom = { 'hp-example-lines': { value: lines }, 'hp-line-form': _lineHost }; };
const useDom = (fields) => { _dom = {}; for (const [k, v] of Object.entries(fields)) _dom[k] = { value: v }; };
const domText = (id) => _dom?.[id]?.textContent;

const sandbox = {
  esc, document:{
    getElementById: (id) => {
      if (!_dom) return el();
      if (!(id in _dom)) _dom[id] = { set textContent(v) { this._t = v; }, get textContent() { return this._t; } };
      return _dom[id];
    },
    querySelectorAll: () => [], querySelector: () => null,
  },
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
  _hpRemoveKey:()=>{}, _hpSetKey:()=>{}, _hpAddKey:()=>{}, _hpVocab:null,
  _hpSetLine:()=>{}, _hpOpenLineRow:()=>{}, _hpAddLine:()=>{}, _hpRemoveLine:()=>{}, _hpMoveLine:()=>{}, _hpOpenLine:null,
  _hpTapRegion:()=>{}, _hpRegions:null, _hpSetGlow:()=>{}, _hpSetSample:()=>{}, _hpSampleIdx:1,
  /* Mutable editor state. These are `let` bindings in app.js, so the const extractor cannot take
     them; supplied here as parameters, which is also what lets a check pick the variant or the
     selected run it wants to exercise. */
  _hpRunSel:null, _hpVariant:'standard', _hpVariants:{ short:[], standard:[], long:[] },
  _hpSetGlowSpec:()=>{}, _hpClearGround:()=>{}, _hpSetPath:()=>{}, _hpRemovePath:()=>{},
  _hpAddObjField:()=>{}, _hpAddArrayItem:()=>{}, _hpAddStop:()=>{}, _hpSwitchVariant:()=>{},
  _hpApplyRunPalette:()=>{}, _hpTapRunChar:()=>{}, _hpSetStrokeColor:()=>{}, _hpSetStrokeEm:()=>{},
  _hpShowAddHint:()=>{}, showToast:()=>{},
  setTimeout, clearTimeout, URL, Math, Date, JSON, Object, Array, String, Number, Boolean, Map, Set, RegExp, isNaN, parseInt, parseFloat,
};

// Pull out just the functions under test plus their module-level dependencies.
/* A name the tested functions read has to be listed, or it throws `X is not defined` rather than
   evaluating to undefined — so the check fails for a reason unrelated to what it guards. That is
   how this suite went quietly red: the editor grew helpers, these lists did not, and thirteen
   checks reported a missing name instead of the behaviour they were written to catch. */
const need = ['TASK_TYPE_LABELS','ROUTINE_TYPES','isRoutine','SRC_CHIP','srcChip','hostOf','TAG_VOCAB',
  '_hpNum','_hpIsStopList',
  'HP_CORE_KEYS','HP_GROUND_KEYS','HP_QUICK_KEYS','HP_DEAD_WITH_LINES','HP_VARIANT_LABEL',
  'HP_ROLE_LABELS','HP_SPLIT_LABELS','HP_SPLIT_SWATCH','HP_LINE_BLANK_ENUMS',
  'HP_VARIANT_KEYS','HP_VARIANT_LABELS'];
const fns  = ['_taskSummary','_routineGrid','_renderFactChecks','_buildSourceRows','_buildArticleRows','_wikiCard','_renderUsageKpis','_fmtBytes','_renderSettingsOverview','_tagSuggestions','_tagVocabFor','_markdownToHtml','_inline','_visualSection','_syncHpSummaries','_hpSpec','_hpControl','_renderStyleForm','_hpLines','_hpLineControl','_renderLineForm','_renderPreviewHits','_renderSampleTabs',
  // Helpers the editor renderers call, listed for the same reason as the consts above.
  '_hpTypeOf','_hpStrokesCoreCtl','_hpGlowCoreCtl','_hpGroundNotice','_hpPathAttr','_hpUnionCtl','_hpVariantMatches',
  '_hpObjectFields','_hpObjectAddRow','_hpArrayCtl','_hpStopListCtl',
  '_hpRunEditor','_hpRunFlatText','_hpRunExistingRange'];

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

/* The hero preset editor's collapsed sections.
 *
 * The point of collapsing them is that the panel still answers "how is this configured" without
 * being expanded, so a summary that goes blank or says `undefined` defeats the whole change. The
 * malformed-JSON cases matter most: that warning is the one thing worth knowing before pressing
 * save, and it is produced by a catch block no amount of clicking around reliably reaches.
 */
run('_syncHpSummaries on a real preset', () => {
  useDom({ 'hp-id':'vivid-badge', 'hp-template-id':'photo_scrim',
    'hp-style-spec': JSON.stringify({ face:'kaku', strokes:[], glows:[], band:{} }),
    'hp-example-lines':'[{"text":"a"},{"text":"b"}]', 'hp-example-badge':'' });
  api._syncHpSummaries();
  const got = ['hp-sum-basic','hp-sum-style','hp-sum-example'].map(domText);
  if (got.some(v => !v || /undefined|NaN|\[object/.test(v))) throw new Error(`bad summary: ${got.join(' | ')}`);
  if (!got[0].includes('vivid-badge')) throw new Error('basic summary lost the id');
  return got.join(' | ');
});

run('_syncHpSummaries warns before save when the JSON will not parse', () => {
  useDom({ 'hp-id':'x', 'hp-template-id':'light_flat', 'hp-style-spec':'{face:',
    'hp-example-lines':'[oops', 'hp-example-badge':'' });
  api._syncHpSummaries();
  if (!/JSON/.test(domText('hp-sum-style'))) throw new Error('malformed styleSpec passed silently');
  if (!/JSON/.test(domText('hp-sum-example'))) throw new Error('malformed exampleLines passed silently');
  return `${domText('hp-sum-style')} / ${domText('hp-sum-example')}`;
});

run('_syncHpSummaries on a brand new preset', () => {
  useDom({ 'hp-id':'', 'hp-template-id':'light_flat', 'hp-style-spec':'', 'hp-example-lines':'', 'hp-example-badge':'' });
  api._syncHpSummaries();
  const got = ['hp-sum-basic','hp-sum-style','hp-sum-example'].map(domText);
  if (got.some(v => !v)) throw new Error(`an empty form must still say something: ${got.join(' | ')}`);
  return got.join(' | ');
});

/* The generated styleSpec controls.
 *
 * This form exists because the previous one was a JSON textarea, so the cases that matter are the
 * ones a textarea handled by doing nothing: a spec mid-edit and unparseable (the form must not
 * overwrite it), a key the renderer does not read (the `ink` bug, which should now be visible in
 * the editor rather than only in a published image), and values of the wrong type or out of range.
 * All of them are reachable in normal use and none of them are reachable by clicking around once.
 */
{
  const vocabPath = new URL('../../hachi-core/src/integrations/style-vocabulary.js', import.meta.url);
  let vocab = null;
  try {
    const m = await import(vocabPath.href);
    vocab = { schema: m.STYLE_SCHEMA, groups: m.STYLE_GROUPS, lineSchema: m.LINE_SCHEMA, metals: m.METAL_NAMES };
  } catch { /* hachi-core not checked out beside this repo — skip rather than fail CI on layout */ }

  /* A second instance with the vocabulary bound.
     `_hpVocab` reaches the extracted functions as a sandbox parameter, so assigning it on the
     returned object sets a property nothing reads — the functions close over the parameter. The
     key order has to match how `make` was built. */
  const api2 = vocab ? make(...Object.keys(sandbox).map((k) => (k === '_hpVocab' ? vocab : sandbox[k]))) : null;

  const formHtml = (spec) => {
    domFor(spec);
    api2._renderStyleForm();
    return _formHost.innerHTML || '';
  };

  if (!vocab) {
    console.log('- styleSpec form checks skipped (hachi-core not adjacent)');
  } else {
    run('styleSpec form renders a real preset', () => {
      const h = formHtml(JSON.stringify({ face:'kaku', scrimMax:0.44, textZone:'left', text:'#FFFFFF' }));
      const n = (h.match(/class="hp-ctl"/g) || []).length;
      if (n !== 4) throw new Error(`expected 4 controls, got ${n}`);
      if (/undefined|NaN|\[object Object\]/.test(h)) throw new Error('leaked a raw value into the markup');
      return `${n} controls`;
    });

    run('styleSpec form leaves an unparseable spec alone', () => {
      const h = formHtml('{face:');
      if (/class="hp-ctl"/.test(h)) throw new Error('built controls from a spec it could not read');
      if (!/JSON/.test(h)) throw new Error('said nothing about why the controls are missing');
      return 'refused, with a reason';
    });

    run('styleSpec form names a key the renderer will drop', () => {
      // The `ink` bug: a plausible name nothing reads, invisible until a published image was seen.
      const h = formHtml(JSON.stringify({ face:'sans', ink:'#FFEC00' }));
      /* Matched against the warning itself, not merely the letters "ink" anywhere in the markup.
         The first version of this check looked for /ink/ and passed even with the warning deleted,
         because the "add a key" picker lists `inkOverride`. */
      const warn = h.match(/読まないキー:[\s\S]*?<\/div>/);
      if (!warn) throw new Error('an unreadable key passed without comment');
      if (!/<code>[^<]*\bink\b[^<]*<\/code>/.test(warn[0])) throw new Error(`warning did not name the key: ${warn[0]}`);
      return 'flagged';
    });

    run('an unset colour reads as unset, not as a decision', () => {
      /* This check used to assert the opposite — that a null colour announced itself as null. That
         was right while `ground` was editable here, because `ground: null` is how a photo template
         says "show the photograph, do not paint over it". Ground has since left this editor with
         the rest of the background settings, and what the null vocabulary actually produced
         afterwards was every unset colour claiming 「この扱いをしない」: a choice nobody made.

         So the assertion is now that an unset colour is blank and silent, and a set one shows its
         value. Both directions matter — a blank field that still reported #FFFFFF would be the
         original lie with the wording removed. */
      const h = formHtml('{"face":"sans"}');
      if (/この扱いをしない|>null</.test(h)) throw new Error('an unset colour still talks about null');
      if (!/placeholder="未設定"/.test(h)) throw new Error('an unset colour did not read as unset');
      if (/class="form-input hp-mono" type="text" value="#/.test(h)) throw new Error('an unset colour showed a concrete value');

      const set = formHtml('{"text":"#8A2846"}');
      if (!/value="#8A2846"/.test(set)) throw new Error('a set colour lost its value');
      return 'ok';
    });

    run('the background is not this catalogue to set', () => {
      // Removing the controls is the point; leaving the values readable is the compromise. A preset
      // that still pins a ground has to say so and offer to drop it, or the setting becomes
      // invisible *and* still in force — the worst of both.
      const h = formHtml(JSON.stringify({ face:'sans', ground:'#101014', usesPhoto:true }));
      if (/_hpSetKey\('ground'/.test(h)) throw new Error('the background is still editable here');
      if (!/_hpClearGround/.test(h)) throw new Error('a preset pinning a background is not told so');
      return 'ok';
    });

    run('styleSpec form survives wrong types and out-of-range numbers', () => {
      for (const spec of ['{"face":123,"text":"red"}', '{"scrimMax":99}', '{"ground":null}', '{}']) {
        const h = formHtml(spec);
        if (/undefined|NaN|\[object Object\]/.test(h)) throw new Error(`leaked on ${spec}`);
      }
      return 'ok';
    });

    /* The per-line editor.
     *
     * The row is the tap target, so the row must carry the line's own text — a list of identical
     * 「行1 行2 行3」 would be no better than the JSON it replaced. And an authored line is user
     * data: it can be missing its text, hold a custom gradient object, or be mid-edit and
     * unparseable, none of which may produce a broken row or overwrite what is being typed.
     */
    const lineHtml = (lines, open = null) => {
      domForLines(lines);
      const a = vocab ? make(...Object.keys(sandbox).map((k) => (k === '_hpVocab' ? vocab : (k === '_hpOpenLine' ? open : sandbox[k])))) : null;
      a._renderLineForm();
      return _lineHost.innerHTML || '';
    };

    run('line rows name the line they restyle', () => {
      const h = lineHtml(JSON.stringify([{ text:'副業で', scale:0.5 }, { text:'月5万円', scale:1.6, metal:'gold' }]));
      const rows = (h.match(/class="hp-line-row/g) || []).length;
      if (rows !== 2) throw new Error(`expected 2 rows, got ${rows}`);
      // The whole point: you tap the words, not an index.
      if (!h.includes('月5万円')) throw new Error('a row did not carry its own text');
      if (/undefined|NaN|\[object Object\]/.test(h)) throw new Error('leaked a raw value');
      return `${rows} rows`;
    });

    run('opening a line gives it controls, and only it', () => {
      const h = lineHtml(JSON.stringify([{ text:'副業で' }, { text:'月5万円', metal:'gold' }]), 1);
      const ctls = (h.match(/class="hp-ctl"/g) || []).length;
      if (ctls < 5) throw new Error(`expected the line's controls, got ${ctls}`);
      if ((h.match(/hp-line-body/g) || []).length !== 1) throw new Error('more than one line opened at once');
      return `${ctls} controls`;
    });

    run('line editor survives lines a person actually produces', () => {
      for (const [label, v] of [['no text','[{"scale":1}]'], ['empty','[]'], ['unparseable','[oops'],
        ['not an array','{}'], ['custom gradient','[{"text":"x","metal":{"from":"#fff","to":"#000"}}]']]) {
        const h = lineHtml(v, 0);
        if (/undefined|NaN|\[object Object\]/.test(h)) throw new Error(`leaked on ${label}`);
      }
      return 'ok';
    });

    run('glow gets real controls, not a JSON field', () => {
      /* Glow is an object, so the generic branch would send it to the JSON — and it is the setting
         most worth reaching for per line, which is the whole reason the renderer gained per-line
         glow. An unlit line offers to light it; a lit one exposes colour, spread and strength. */
      const off = lineHtml(JSON.stringify([{ text:'月5万円', scale:1.5 }]), 0);
      if (!/この行を光らせる/.test(off)) throw new Error('an unlit line offered no way to light it');
      if (/下の JSON で編集/.test(off.split('発光')[1] ?? '')) throw new Error('glow fell through to the JSON');

      const on = lineHtml(JSON.stringify([{ text:'月5万円', scale:1.5, glow:{ color:'#FF3366', em:0.3, opacity:0.8 } }]), 0);
      if (!/value="#FF3366"/.test(on)) throw new Error('the glow colour did not reach its control');
      if ((on.match(/hp-glow-row/g) || []).length !== 2) throw new Error('expected spread and strength');
      if (!/発光をやめる/.test(on)) throw new Error('no way to turn it back off');
      return 'ok';
    });

    run('a malformed glow falls back rather than rendering nothing', () => {
      // `{color:'oops'}` is the shape a half-finished JSON edit leaves behind.
      const h = lineHtml(JSON.stringify([{ text:'x', glow:{ color:'oops' } }]), 0);
      if (!/value="#FF3366"/.test(h)) throw new Error('did not fall back to a usable colour');
      if (/undefined|NaN/.test(h)) throw new Error('leaked a raw value');
      return 'ok';
    });

    run('an unparseable lines array is reported, not rebuilt from a guess', () => {
      const h = lineHtml('[oops', 0);
      if (/class="hp-line-row/.test(h)) throw new Error('built rows from something it could not read');
      if (!/JSON/.test(h)) throw new Error('said nothing about why the rows are missing');
      return 'refused, with a reason';
    });
  }
}

/* Tapping the picture.
 *
 * The renderer reports where it drew each component; these place a target over each one. The boxes
 * arrive in the hero's own 1280×670 and are laid out in percentages, so an error in the conversion
 * puts every target somewhere plausible-looking and slightly wrong — which is exactly the kind of
 * fault that survives a glance and is caught by arithmetic.
 */
{
  const REG = { width: 1280, height: 670, regions: [
    { kind:'line', index:0, left:340, top:256, right:941, bottom:318 },
    { kind:'line', index:1, left:80,  top:347, right:1200, bottom:459 },
    { kind:'badge', index:0, left:1040, top:72, right:1208, bottom:171 },
  ] };
  const hitsHtml = (regions, open = null) => {
    domForHits();
    const a = make(...Object.keys(sandbox).map((k) => (k === '_hpRegions' ? regions : (k === '_hpOpenLine' ? open : sandbox[k]))));
    a._renderPreviewHits();
    return _hitHost.innerHTML || '';
  };

  run('a target per component, named for what it edits', () => {
    const h = hitsHtml(REG);
    const n = (h.match(/class="hp-hit/g) || []).length;
    if (n !== 3) throw new Error(`expected 3 targets, got ${n}`);
    for (const label of ['1行目', '2行目', 'バッジ']) {
      if (!h.includes(`>${label}<`)) throw new Error(`no target labelled ${label}`);
    }
    return `${n} targets`;
  });

  run('boxes convert to the right place on the picture', () => {
    const h = hitsHtml(REG);
    const got = [...h.matchAll(/left:([\d.]+)%;top:([\d.]+)%;width:([\d.]+)%;height:([\d.]+)%/g)]
      .map((m) => m.slice(1).map(Number));
    // 340/1280, 256/670, 601/1280, 62/670 — computed rather than eyeballed.
    const want = [[26.5625, 38.209, 46.953, 9.254], [6.25, 51.791, 87.5, 16.716], [81.25, 10.746, 13.125, 14.776]];
    got.forEach((g, i) => g.forEach((v, j) => {
      if (Math.abs(v - want[i][j]) > 0.05) throw new Error(`target ${i} coord ${j}: ${v}%, expected ${want[i][j]}%`);
    }));
    return 'all within 0.05%';
  });

  run('the open line is marked on the picture', () => {
    if (!/hp-hit on/.test(hitsHtml(REG, 1))) throw new Error('the selected component is not shown as selected');
    if (/hp-hit on/.test(hitsHtml(REG, null))) throw new Error('marked a component with nothing selected');
    return 'ok';
  });

  run('no regions draws nothing rather than a broken overlay', () => {
    for (const v of [null, undefined, {}, { width:1280, height:670, regions: [] }]) {
      const h = hitsHtml(v);
      if (h.trim()) throw new Error(`drew something for ${JSON.stringify(v)}`);
    }
    return 'ok';
  });

  /* The three authored lengths.
   *
   * These were once a fixed list of demo titles (HP_SAMPLE_TITLES); they are now three sets of
   * lines authored per preset, and the tab shows each one's character count. The count is the part
   * worth guarding: it is how an operator sees that 短い and 長い are still empty, which is exactly
   * the state seeded presets were shipped in and nobody could see. */
  run('sample tabs count each variant, including the empty ones', () => {
    domForHits();
    const variants = { short: [], standard: [{ text:'なぜ赤字でも' }, { text:'株価が上がるのか' }], long: [] };
    const a = make(...Object.keys(sandbox).map((k) =>
      (k === '_hpVariants' ? variants : (k === '_hpVariant' ? 'short' : sandbox[k]))));
    a._renderSampleTabs();
    const h = _hitHost.innerHTML || '';
    const n = (h.match(/class="hp-sample/g) || []).length;
    if (n !== 3) throw new Error(`expected 3 variants, got ${n}`);
    for (const label of ['短い', '標準', '長い']) {
      if (!h.includes(label)) throw new Error(`no tab for ${label}`);
    }
    if (!/標準<span>14字/.test(h)) throw new Error(`the authored variant did not report its length: ${h}`);
    if ((h.match(/<span>0字/g) || []).length !== 2) throw new Error('an empty variant did not say it is empty');
    if (/undefined|NaN/.test(h)) throw new Error('leaked a raw value');
    return 'ok';
  });
}

if (missing) console.log(`\n${missing} function(s) missing from app.js — update scripts/smoke-render.js`);
console.log(fail || missing ? `\nFAILED (${fail} render, ${missing} missing)` : '\nall render checks passed');
process.exit(fail || missing ? 1 : 0);
