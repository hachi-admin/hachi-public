/* ── Hachi オフィス ─────────────────────────────────────────────────────────────
 * The agent roster as a pixel-art office building, on top of 運用 › エージェント.
 *
 * Why a picture: the roster answers "is anything happening / broken" and a grid of 44 identical
 * cards answered it badly. Here an agent's state is where it is and what it does — typing at its
 * desk (running), a ✓ beside it (finished recently), a red ！ (failed), an empty chair with a
 * カフェ sign while it waits in the 1F café (idle).
 *
 * The cast is mixed on purpose, one species per department, so a character says which
 * department it belongs to before you read its name (operator's choice, 2026-10-05):
 *   経営 = bees (Hachi is 蜂), 情報 = animals, 書庫 = forest animals, 開発 = robots, 制作 = people.
 * Each speaks with its species' ending (〜ブン, 〜コン, ピピッ…デス).
 *
 * Everything is drawn here, from the dashboard's own data — no assets, no server work. The
 * dashboard refreshes every few minutes, so motion is staging, not a live feed. The loop runs at
 * ~9fps and only while the office is on screen and the tab is visible.
 * Reads app.js globals: REGISTRY, DETAIL_DATA, COST_BY_DAY, openDetail, taskTitle.
 */
(() => {
  'use strict';
  const W = 390;                    // logical width; the canvas is scaled to the container
  const PX = 2;                     // sprite pixel size (16×20 grid → 32×40)

  // ── who sits where ──────────────────────────────────────────────────────────
  const FLOORS = [
    { key: 'exec',  no: '7F', name: '社長室', wall: '#ece4d6', sign: '#8a6b3a', carpet: ['#cbb89a', '#c4b090'],
      ids: ['orchestrator', 'advisor', 'visionary', 'efficiency-audit', 'channel-audit'] },
    { key: 'intel', no: '6F', name: '情報部', wall: '#e3e9f2', sign: '#3b6fb6', carpet: ['#c3c9d6', '#bac1cf'],
      ids: ['scout-agent', 'news-agent', 'mail-agent', 'log-monitor-agent', 'financial-agent', 'location-agent', 'chat-agent', 'summary-agent', 'choice-interpreter'] },
    { key: 'lib',   no: '5F', name: '書庫', wall: '#e4f1e8', sign: '#2e7d5b', carpet: ['#c9d8cd', '#c0d0c4'],
      ids: ['context-agent', 'knowledge-agent', 'lint-agent', 'db-audit-agent'] },
    { key: 'dev',   no: '4F', name: '開発部', wall: '#e6e8ee', sign: '#e0702c', carpet: ['#b9bfcc', '#b1b8c6'],
      ids: ['dev-agent', 'review-agent', 'jp-censor-agent', 'system-audit-agent', 'design-critic'] },
    { key: 'plan',  no: '3F', name: '企画室', wall: '#f1e9f7', sign: '#7c4dbd', carpet: ['#d3cbe0', '#cbc2da'],
      ids: ['article-ideas', 'article-angle', 'topic-scout', 'note-study', 'craft-study', 'category-prompt', 'reader-questions'] },
    { key: 'write', no: '2F', name: '執筆室', wall: '#f4ede4', sign: '#9a5b2e', carpet: ['#d6cbbb', '#cec2b1'],
      ids: ['article-writer', 'drafting-agent', 'structure-agent', 'editorial-agent', 'reflection-writer', 'answer-researcher', 'slide-agent'] },
    { key: 'art',   no: '1F', name: '美術室', wall: '#f7ecee', sign: '#c2185b', carpet: ['#dccbd0', '#d4c1c7'],
      ids: ['hero-style', 'category-recipe', 'recipe-vision', 'image-scout', 'image-curator', 'design-agent', 'product-pick'] },
  ];
  // Species and the one thing each holds — chosen from what the agent actually does.
  const CAST = {
    'orchestrator': ['bee', 'crown'], 'advisor': ['bee', 'glasses'], 'visionary': ['bee', 'bulb'],
    'efficiency-audit': ['bee', 'calc'], 'channel-audit': ['bee', 'map'],
    'scout-agent': ['fox', 'bino'], 'news-agent': ['chick', 'paper'], 'mail-agent': ['pigeon', 'letter'],
    'log-monitor-agent': ['dog', 'headset'], 'financial-agent': ['tanuki', 'calc'], 'location-agent': ['bird', 'map'],
    'chat-agent': ['shiba', 'headset'], 'summary-agent': ['kitten', 'pen'], 'choice-interpreter': ['rabbit', null],
    'context-agent': ['squirrel', 'book'], 'knowledge-agent': ['elephant', 'book'], 'lint-agent': ['owl', 'lens'], 'db-audit-agent': ['beaver', 'clip'],
    'dev-agent': ['robot', 'headset'], 'review-agent': ['robot', 'redpen'], 'jp-censor-agent': ['robot', 'book'],
    'system-audit-agent': ['robot', 'helmet'], 'design-critic': ['robot', 'glasses'],
    'article-ideas': ['human', 'bulb'], 'article-angle': ['human', 'camera'], 'topic-scout': ['human', 'bino'],
    'note-study': ['human', 'chart'], 'craft-study': ['human', 'lens'], 'category-prompt': ['human', 'clip'], 'reader-questions': ['human', 'q'],
    'article-writer': ['human', 'pen'], 'drafting-agent': ['human', 'pen'], 'structure-agent': ['human', 'notes'],
    'editorial-agent': ['human', 'redpen'], 'reflection-writer': ['human', 'book'], 'answer-researcher': ['human', 'paper'], 'slide-agent': ['human', 'chart'],
    'hero-style': ['human', 'brush'], 'category-recipe': ['human', 'palette'], 'recipe-vision': ['human', 'camera'],
    'image-scout': ['human', 'camera'], 'image-curator': ['human', 'frame'], 'design-agent': ['human', 'brush'], 'product-pick': ['human', 'bag'],
  };
  const FLOOR_OF_CATEGORY = { Intelligence: 'intel', Knowledge: 'lib', Development: 'dev', Content: 'write', Operations: 'exec' };
  const SHIRT = { exec: '#e0a000', intel: '#5b8fd6', lib: '#3fae7a', dev: '#e0702c', plan: '#8e63c9', write: '#b5703a', art: '#d0567f' };

  // ── speech: one ending per species ──────────────────────────────────────────
  const ENDING = { bee: 'ブン', fox: 'コン', pigeon: 'ポッポ', dog: 'ワン', shiba: 'ワン', chick: 'ピヨ', tanuki: 'ポン', bird: 'チュン',
    kitten: 'ニャ', rabbit: 'ピョン', owl: 'ホー', squirrel: 'リス', elephant: 'パオ', beaver: 'ビバ', robot: 'デス', human: '' };
  const say = (sp, base) => {
    const e = ENDING[sp] ?? '';
    // A robot's デス replaces the です rather than following it (no 「方針ですデス」).
    const s = (sp === 'robot' ? base.replace('です{e}', '{e}') : base).replace('{e}', e);
    return sp === 'robot' ? `ピピッ、${s}` : s;
  };
  const short = (s, n = 13) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; };
  const LINES = {
    work: ['{t}、作業中{e}', 'あと少し{e}', '集中してる{e}'],
    done: ['{t}、終わった{e}！', 'ひと仕事終えた{e}', '提出した{e}'],
    error: ['うまくいかない{e}…', '止まっちゃった{e}…', '誰か見て{e}！'],
    idle: ['お茶にしよう{e}', '今日は静かだ{e}ね', 'ひと休み{e}', 'おやつある{e}？'],
    night: ['おやすみ{e}…zzz', 'zzz…'],
  };

  // ── data ────────────────────────────────────────────────────────────────────
  const jstHour = () => Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo', hour: 'numeric', hour12: false })) % 24;
  const isNight = () => { const h = jstHour(); return h >= 18 || h < 6; };
  function stateOf(id) {
    const d = DETAIL_DATA[id] || {};
    if (d.status === 'running') return 'work';
    if (d.status === 'failed') return 'error';
    if (d.status === 'done') return 'done';
    return 'idle';
  }
  function people() {
    const placed = new Set(FLOORS.flatMap((f) => f.ids));
    const extra = REGISTRY.filter((r) => !placed.has(r.id));
    return FLOORS.map((f) => {
      const ids = [...f.ids, ...extra.filter((r) => FLOOR_OF_CATEGORY[r.category] === f.key).map((r) => r.id)]
        .filter((id) => REGISTRY.some((r) => r.id === id));
      return { ...f, ids };
    });
  }

  // ── sprites (16×20 pixel grids, cached as canvases) ────────────────────────
  const OUT = '#2b2b3a';
  const shade = (c, f) => { const n = parseInt(c.slice(1), 16); const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * f)))); return '#' + ch.map((v) => v.toString(16).padStart(2, '0')).join(''); };
  const HAIR = ['#3b2a20', '#d9a066', '#1f1f2b', '#8a4b2a', '#e8d36b', '#6b4a8a', '#c0504d', '#2f5d8a'];
  const SKIN = ['#f6d2b5', '#e8b48f', '#c98e66', '#f1c7a3', '#e0a986'];
  const BODY = { fox: '#e07a3f', chick: '#f6d55c', pigeon: '#b8c1d1', dog: '#d9a066', tanuki: '#9a7b5b', bird: '#7fb3d5', shiba: '#e8a15a',
    kitten: '#c9c9d1', rabbit: '#f2f2f2', squirrel: '#b5764a', elephant: '#a9b1bf', owl: '#e9e4d8', beaver: '#8d5a3b', bee: '#f7c948', robot: '#c9d1de' };
  const spriteCache = new Map();
  function sprite(id, pose) {
    const k = id + pose; if (spriteCache.has(k)) return spriteCache.get(k);
    const [kind, prop] = CAST[id] || ['human', null];
    const floor = people().find((f) => f.ids.includes(id))?.key || 'write';
    const g = Array.from({ length: 20 }, () => Array(16).fill(null));
    const p = (x, y, c) => { if (x >= 0 && x < 16 && y >= 0 && y < 20) g[y][x] = c; };
    const r = (x, y, w, h, c) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) p(xx, yy, c); };
    const seed = [...id].reduce((a, ch) => a + ch.charCodeAt(0), 0);
    const shirt = SHIRT[floor] || '#5b8fd6';
    const C = kind === 'human' ? SKIN[seed % SKIN.length] : BODY[kind];
    // body first, head on top
    if (kind === 'bee') { r(1, 8, 3, 4, '#e6f4ff'); r(12, 8, 3, 4, '#e6f4ff'); }
    if (kind === 'robot') {
      p(8, 0, shirt); r(8, 1, 1, 2, '#8e99ad'); r(3, 3, 10, 8, C); r(3, 10, 10, 1, '#8e99ad'); r(4, 4, 8, 5, '#22303f');
      const eye = pose === 'blink' ? '#22303f' : '#7fffd4'; p(6, 6, eye); p(9, 6, eye); r(7, 8, 2, 1, '#7fffd4');
      r(5, 12, 6, 5, shirt); r(6, 13, 4, 2, shade(shirt, 1.25)); r(3, 12, 2, 1, '#8e99ad'); r(11, 12, 2, 1, '#8e99ad'); r(5, 17, 2, 2, '#8e99ad'); r(9, 17, 2, 2, '#8e99ad');
    } else {
      r(3, 3, 10, 8, C);
      if (kind === 'human') {
        const hair = HAIR[seed % HAIR.length];
        r(3, 1, 10, 3, hair); r(2, 3, 1, 5, hair); r(13, 3, 1, 5, hair);
        if (seed % 3 === 0) r(3, 4, 3, 2, hair);           // bangs
        if (seed % 4 === 1) { r(2, 8, 1, 4, hair); r(13, 8, 1, 4, hair); }  // long hair
        p(5, 8, shade(C, .9)); p(10, 8, shade(C, .9));
      }
      if (['fox', 'shiba', 'kitten', 'squirrel'].includes(kind)) { p(3, 2, C); p(4, 1, C); p(12, 2, C); p(11, 1, C); p(4, 2, '#f7b6b6'); p(11, 2, '#f7b6b6'); }
      if (kind === 'tanuki') { r(3, 1, 3, 3, C); r(10, 1, 3, 3, C); r(4, 5, 3, 2, '#4a3a2c'); r(9, 5, 3, 2, '#4a3a2c'); }
      if (kind === 'dog') { r(2, 4, 2, 5, shade(C, .7)); r(12, 4, 2, 5, shade(C, .7)); }
      if (kind === 'rabbit') { r(5, 0, 2, 4, C); r(9, 0, 2, 4, C); p(6, 1, '#f7b6b6'); p(10, 1, '#f7b6b6'); }
      if (kind === 'chick') { p(8, 2, '#f2a65a'); p(7, 1, '#f2a65a'); }
      if (kind === 'owl') { p(4, 2, '#8a7f6a'); p(11, 2, '#8a7f6a'); r(5, 5, 2, 2, '#f7c948'); r(9, 5, 2, 2, '#f7c948'); }
      if (kind === 'elephant') { r(1, 4, 2, 6, shade(C, .9)); r(13, 4, 2, 6, shade(C, .9)); r(7, 8, 2, 4, shade(C, .85)); }
      if (kind === 'beaver') { r(7, 9, 2, 2, '#fff'); }
      if (kind === 'bee') { p(5, 1, '#3a2f2a'); p(6, 2, '#3a2f2a'); p(10, 1, '#3a2f2a'); p(9, 2, '#3a2f2a'); }
      if (['fox', 'shiba', 'squirrel'].includes(kind)) r(6, 8, 4, 3, '#fff6ea');
      const eye = pose === 'blink' ? shade(C, .7) : '#111';
      if (pose === 'ko') for (const ex of [6, 9]) { p(ex - 1, 5, '#111'); p(ex + 1, 5, '#111'); p(ex, 6, '#111'); p(ex - 1, 7, '#111'); p(ex + 1, 7, '#111'); }
      else if (pose === 'tired' || pose === 'tiredReach') { r(5, 6, 2, 1, '#111'); r(9, 6, 2, 1, '#111'); p(5, 7, shade(C, .75)); p(10, 7, shade(C, .75)); }
      else { p(6, 6, eye); p(9, 6, eye); }
      if (['pigeon', 'bird', 'chick', 'owl'].includes(kind)) r(7, 8, 2, 1, '#f28c28');
      else if (kind !== 'elephant' && kind !== 'beaver') { p(7, 8, shade(C, .55)); p(8, 8, shade(C, .55)); }
      // shirt (bees wear their stripes)
      r(4, 11, 8, 6, kind === 'bee' ? '#f7c948' : shirt); r(4, 11, 8, 1, kind === 'bee' ? shirt : shade(shirt, .8));
      if (kind === 'bee') { r(4, 13, 8, 1, '#3a2f2a'); r(4, 15, 8, 1, '#3a2f2a'); }
      r(3, 12, 1, 4, C); r(12, 12, 1, 4, C);
      r(5, 17, 2, 2, kind === 'human' ? '#3a4150' : shade(C, .7)); r(9, 17, 2, 2, kind === 'human' ? '#3a4150' : shade(C, .7));
    }
    // walking: legs alternate
    if (pose === 'walk1' || pose === 'walk2') {
      const leg = kind === 'human' || kind === 'robot' ? (kind === 'robot' ? '#8e99ad' : '#3a4150') : shade(C, .7);
      r(4, 17, 8, 3, null);
      if (pose === 'walk1') { r(4, 17, 2, 2, leg); r(9, 17, 2, 3, leg); } else { r(5, 17, 2, 3, leg); r(10, 17, 2, 2, leg); }
    }
    if (pose === 'reach' || pose === 'tiredReach') {           // arm out, working a machine
      if (kind === 'robot') r(11, 12, 5, 1, '#8e99ad');
      else { r(12, 13, 1, 3, null); r(12, 12, 4, 1, C); }
    }
    if (kind === 'robot' && (pose === 'tired' || pose === 'tiredReach')) { p(6, 6, '#3d6b62'); p(9, 6, '#3d6b62'); }
    // the prop that says what they do (typing pose shifts the hand)
    const hy = pose === 'type' ? 14 : 13;
    const PROP = {
      crown: () => { r(5, 1, 6, 2, '#ffcf33'); p(5, 0, '#ffcf33'); p(8, 0, '#ffcf33'); p(10, 0, '#ffcf33'); p(7, 1, '#e53935'); },
      glasses: () => { r(5, 6, 2, 1, OUT); r(9, 6, 2, 1, OUT); r(7, 6, 2, 1, OUT); },
      helmet: () => { r(3, 2, 10, 2, '#f2c94c'); r(7, 1, 2, 1, '#f2c94c'); },
      headset: () => { r(2, 5, 1, 4, '#2f3644'); r(13, 5, 1, 4, '#2f3644'); r(3, 2, 10, 1, '#2f3644'); p(12, 9, '#2f3644'); },
      bulb: () => { r(13, 0, 3, 3, '#fff27a'); p(14, 3, '#9aa3b5'); },
      bino: () => { r(10, hy - 2, 2, 2, '#333'); r(13, hy - 2, 2, 2, '#333'); p(10, hy - 2, '#9fd8ff'); p(13, hy - 2, '#9fd8ff'); },
      paper: () => { r(11, hy - 2, 4, 5, '#f5f0e1'); r(12, hy - 1, 2, 1, '#888'); r(12, hy + 1, 2, 1, '#888'); },
      letter: () => { r(11, hy - 1, 4, 3, '#ffffff'); p(12, hy, '#e57373'); },
      calc: () => { r(11, hy - 2, 3, 4, '#e8ecf3'); p(12, hy - 1, '#2b3140'); p(12, hy + 1, '#2b3140'); },
      map: () => { r(10, hy - 2, 5, 4, '#f5e6b8'); p(12, hy - 1, '#e53935'); },
      pen: () => { r(12, hy - 4, 1, 5, '#f2c94c'); p(12, hy - 5, '#e07a5f'); },
      redpen: () => { r(12, hy - 4, 1, 5, '#e53935'); },
      book: () => { r(10, hy - 1, 5, 4, '#2f80ed'); r(11, hy, 3, 2, '#f5f0e1'); },
      lens: () => { r(11, hy - 3, 3, 3, '#9fd8ff'); p(12, hy - 2, '#fff'); p(14, hy, '#7a5f40'); p(15, hy + 1, '#7a5f40'); },
      clip: () => { r(11, hy - 2, 4, 5, '#c9a06a'); r(12, hy - 1, 2, 3, '#ffffff'); },
      chart: () => { r(10, hy - 2, 5, 4, '#ffffff'); p(11, hy, '#4be37a'); p(12, hy - 1, '#4be37a'); p(13, hy - 1, '#4be37a'); },
      notes: () => { r(10, hy - 2, 2, 2, '#ffe066'); r(12, hy - 1, 2, 2, '#ff9cc2'); r(14, hy - 2, 2, 2, '#8fd3ff'); },
      camera: () => { r(10, hy - 2, 5, 3, '#2b3140'); p(12, hy - 1, '#9fd8ff'); },
      q: () => { r(11, hy - 2, 4, 4, '#ffffff'); p(13, hy - 1, '#2f80ed'); p(13, hy + 1, '#2f80ed'); },
      brush: () => { r(12, hy - 4, 1, 4, '#8a5a36'); r(12, hy - 5, 1, 1, '#e53935'); },
      palette: () => { r(10, hy - 1, 5, 3, '#e9c89a'); p(11, hy, '#e53935'); p(13, hy, '#2f80ed'); },
      frame: () => { r(10, hy - 2, 5, 4, '#c9a06a'); r(11, hy - 1, 3, 2, '#9fd8ff'); },
      bag: () => { r(10, hy - 1, 5, 4, '#e57373'); p(11, hy - 2, '#e57373'); p(13, hy - 2, '#e57373'); },
    };
    if (prop && PROP[prop] && pose !== 'reach' && pose !== 'tiredReach') PROP[prop]();
    // outline
    const o = g.map((row) => row.slice());
    for (let y = 0; y < 20; y++) for (let x = 0; x < 16; x++)
      if (!g[y][x] && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy]?.[x + dx] && g[y + dy][x + dx] !== OUT)) o[y][x] = OUT;
    const c = document.createElement('canvas'); c.width = 16; c.height = 20;
    const cx = c.getContext('2d');
    o.forEach((row, y) => row.forEach((col, x) => { if (col) { cx.fillStyle = col; cx.fillRect(x, y, 1, 1); } }));
    spriteCache.set(k, c);
    return c;
  }

  // ── drawing helpers ─────────────────────────────────────────────────────────
  let g = null;
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const TXT = (s, x, y, c = '#2b3140', sz = 9, wgt = 700, align = 'center') => {
    g.fillStyle = c; g.font = `${wgt} ${sz}px "Noto Sans JP",sans-serif`; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(s, x, y);
  };
  const plant = (x, y) => { R(x + 3, y + 14, 10, 9, '#a0643c'); R(x + 2, y + 12, 12, 3, '#7c4a2a'); R(x, y + 2, 16, 11, '#3f9b52'); R(x + 3, y - 3, 10, 8, '#52b866'); R(x + 6, y - 6, 4, 5, '#6fd081'); };
  const clock = (x, y) => { R(x, y, 14, 14, '#2b3140'); R(x + 2, y + 2, 10, 10, '#fff'); const h = jstHour() % 12; R(x + 6, y + 4, 2, 4, '#2b3140'); R(x + 7, y + 7, 3, 1, h < 6 ? '#e53935' : '#2b3140'); };
  const calendar = (x, y) => { R(x, y, 18, 22, '#fff'); R(x, y, 18, 5, '#e53935'); for (let k = 0; k < 12; k++) R(x + 2 + (k % 4) * 4, y + 8 + Math.floor(k / 4) * 4, 2, 2, '#9aa3b5'); };
  const whiteboard = (x, y, w, lines) => { R(x, y, w, 30, '#9aa3b5'); R(x + 2, y + 2, w - 4, 24, '#fbfbf8'); lines.forEach((c, i) => R(x + 6, y + 6 + i * 6, 14 + (i * 11) % 22, 2, c)); };
  const cabinet = (x, y) => { R(x, y, 22, 38, '#9aa3b5'); for (let k = 0; k < 3; k++) { R(x + 2, y + 2 + k * 12, 18, 10, '#b8bfcc'); R(x + 8, y + 6 + k * 12, 6, 2, '#7d8597'); } };
  const copier = (x, y) => { R(x, y, 30, 26, '#d9dde6'); R(x, y, 30, 6, '#aeb5c3'); R(x + 4, y + 8, 22, 6, '#2b3140'); R(x + 6, y + 9, 6, 2, '#4be37a'); R(x + 6, y - 4, 18, 5, '#fff'); };
  const water = (x, y) => { R(x + 4, y, 12, 12, '#9fd8ff'); R(x, y + 12, 20, 22, '#eef1f6'); R(x + 5, y + 16, 4, 3, '#e53935'); R(x + 11, y + 16, 4, 3, '#5ab0ff'); };
  const shelf = (x, y, h = 34) => { R(x, y, 44, h, '#7a5f40'); const rows = Math.floor((h - 4) / 10); for (let r = 0; r < rows; r++) for (let b = 0; b < 7; b++) R(x + 3 + b * 6, y + 3 + r * 10, 5, 8, ['#e57373', '#64b5f6', '#81c784', '#ffd54f', '#ba68c8'][(b + r + x) % 5]); };
  const rack = (x, y, t) => { R(x, y, 22, 40, '#2f3644'); for (let b = 0; b < 6; b++) { R(x + 3, y + 3 + b * 6, 16, 4, '#3d4656'); R(x + 4, y + 4 + b * 6, 2, 2, (b + t) % 3 ? '#4be37a' : '#5ab0ff'); } };
  const blinds = (x, y, night, t) => {
    R(x, y, 54, 30, '#8e96a8'); R(x + 2, y + 2, 50, 26, night ? '#1e2b4a' : '#bfe6ff');
    [[4, 14], [14, 20], [24, 10], [34, 18], [44, 12]].forEach(([bx, bh], i) => {
      R(x + 2 + bx, y + 28 - bh, 7, bh, night ? '#2e3d5e' : '#9fb7cc');
      if (night) for (let j = 0; j < bh / 5 - 1; j++) if ((i + j + Math.floor(t / 20)) % 4) R(x + 4 + bx, y + 31 - bh + j * 5, 1, 1, '#ffe48a');
    });
    for (let j = y + 3; j < y + 28; j += 4) R(x + 2, j, 50, 1, 'rgba(215,220,230,.85)');
  };
  const carpet = (x, y, w, h, [a, b]) => { for (let yy = y; yy < y + h; yy += 14) for (let xx = x; xx < x + w; xx += 14) R(xx, yy, Math.min(14, x + w - xx), Math.min(14, y + h - yy), ((xx - x) / 14 + (yy - y) / 14) % 2 ? a : b); };


  // ── rooms: every floor is its own place ─────────────────────────────────────
  // Operator, 2026-10-06: "同じ部屋の構成は作りたくない" — each floor is a different room built around
  // what its department does, with its own furniture and its own errands, on one shared engine:
  //   7F 社長室: executive suite (espresso, mini-bar, aquarium, globe, leather sofas)
  //   6F 情報部: newsroom (TV wall, press, pigeonholes, phone bank, map table)
  //   5F 書庫:   library (stacks, reading tables, tea, armchairs — no meetings, it is quiet)
  //   4F 開発部: server lab (standing desks, ping-pong, robot charging dock, energy-drink fridge, 3D printer)
  //   3F 企画室: idea studio (sticky wall, projector, beanbags, snacks, arcade)
  //   2F 執筆室: writers' study (booths, fireplace armchairs, typewriter, manuscript tray, pour-over)
  //   1F 美術室: atelier (easels, photo studio, plotter, sink, drafting tables)
  const FH = 330, WALL = 54;
  // drawing kit for rooms
  const wood = (x, y, w, h, a = '#c8a47c', b = '#bd9870') => { for (let yy = y; yy < y + h; yy += 7) { const off = ((yy - y) / 7 % 2) * 14; for (let xx = x - off; xx < x + w; xx += 28) { const x0 = Math.max(x, xx); R(x0, yy, Math.min(28, x + w - x0), 7, ((xx + yy) / 7 | 0) % 3 ? a : b); R(x0, yy + 6, Math.min(28, x + w - x0), 1, 'rgba(0,0,0,.07)'); } } };
  const rug = (x, y, w, h, a, b) => { R(x, y, w, h, b); R(x + 3, y + 3, w - 6, h - 6, a); R(x + 6, y + 6, w - 12, 1, b); R(x + 6, y + h - 7, w - 12, 1, b); };
  const sofa = (x, y, w, c = '#d9876f') => { R(x, y, w, 10, shade(c, .85)); R(x, y + 10, w, 14, c); R(x - 4, y + 4, 6, 20, shade(c, .75)); R(x + w - 2, y + 4, 6, 20, shade(c, .75)); };
  const armchair = (x, y, c) => { R(x, y, 28, 10, shade(c, .85)); R(x, y + 10, 28, 12, c); R(x - 3, y + 4, 5, 18, shade(c, .7)); R(x + 26, y + 4, 5, 18, shade(c, .7)); };
  const table = (x, y, w, h, c = '#8a5a36') => { R(x, y, w, h, c); R(x, y + h, w, 3, shade(c, .75)); };
  const roundTable = (cx, cy, rx, ry, c = '#c49a6c') => { g.fillStyle = shade(c, .8); g.beginPath(); g.ellipse(cx, cy + 3, rx + 2, ry + 2, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = c; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill(); };
  const chairDot = (x, y, c = '#4a5875') => R(x - 7, y - 6, 14, 9, c);
  const lamp = (x, y, on) => { R(x, y + 6, 2, 8, '#55606f'); R(x - 4, y, 10, 6, '#3f9b52'); if (on) R(x - 2, y + 6, 6, 2, 'rgba(255,240,170,.8)'); };
  const fridge = (x, y, c = '#e8ecf3', lit) => { R(x, y, 26, 44, c); R(x, y + 16, 26, 1, shade(c, .8)); R(x + 20, y + 4, 2, 8, '#9aa3b5'); R(x + 20, y + 20, 2, 10, '#9aa3b5'); if (lit) R(x + 3, y + 3, 20, 10, 'rgba(160,220,255,.5)'); };
  const tv = (x, y, w, h, t, k) => { R(x, y, w, h, '#2b3140'); R(x + 2, y + 2, w - 4, h - 4, ['#2f80ed', '#e53935', '#43a047', '#fb8c00'][(k + (t >> 3)) % 4]); R(x + 4, y + h - 6, w - 8, 2, 'rgba(255,255,255,.6)'); };
  const books = (x, y, w, h) => { R(x, y, w, h, '#6b4a33'); const rows = Math.floor((h - 4) / 10); for (let r = 0; r < rows; r++) for (let b = 0; b * 5 < w - 6; b++) R(x + 3 + b * 5, y + 3 + r * 10, 4, 8, ['#c0504d', '#4f81bd', '#9bbb59', '#f2c94c', '#8064a2', '#4bacc6'][(b * 7 + r * 3 + x) % 6]); };
  const beanbag = (x, y, c) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, 16, 11, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = shade(c, 1.15); g.beginPath(); g.ellipse(x - 4, y - 4, 7, 4, 0, 0, Math.PI * 2); g.fill(); };
  const easel = (x, y, prog, hue) => { R(x + 4, y, 2, 40, '#8a5a36'); R(x + 18, y, 2, 40, '#8a5a36'); R(x, y + 4, 24, 20, '#fbfbf8'); for (let k = 0; k < Math.floor(prog * 6); k++) R(x + 2 + (k % 3) * 7, y + 6 + Math.floor(k / 3) * 8, 6, 7, hue[k % hue.length]); R(x - 2, y + 24, 28, 2, '#8a5a36'); };
  const pinned = (x, y, w, h) => { R(x, y, w, h, '#c9a77c'); for (let k = 0; k < 8; k++) { const px = x + 4 + (k % 4) * ((w - 8) / 4), py = y + 4 + Math.floor(k / 4) * ((h - 8) / 2); R(px, py, (w - 16) / 4, (h - 12) / 2, ['#9fd8ff', '#ffd6a5', '#cdeac0', '#f7c6d9', '#e2d4f0', '#fff3b0'][k % 6]); R(px + 3, py - 1, 2, 2, '#e53935'); } };
  const stickyWall = (x, y, w, h, t) => { R(x, y, w, h, '#efe7d4'); for (let k = 0; k < 28; k++) R(x + 3 + (k % 10) * ((w - 6) / 10), y + 3 + Math.floor(k / 10) * 11, 7, 8, ['#ffe066', '#ff9cc2', '#8fd3ff', '#b5f5a0', '#ffb36b'][(k * 3) % 5]); };

  // Everything a room defines. Spots are feet positions relative to the floor's top.
  const ROOMS = {
    exec: {
      floor: (y) => { wood(0, y + WALL, W, FH - WALL, '#b98c60', '#ae8256'); rug(70, y + 70, 220, 180, '#a33b33', '#7d2a24'); },
      wall: (y, t, night) => { blinds(84, y + 12, night, t); blinds(146, y + 12, night, t);
        R(208, y + 10, 28, 34, '#c9a06a'); R(211, y + 13, 22, 28, '#6b8fb5'); R(216, y + 30, 12, 8, '#f2c94c');            // portrait
        books(244, y + 6, 48, 42); R(298, y + 10, 44, 34, '#5b3a2a'); for (let k = 0; k < 3; k++) R(304 + k * 13, y + 18, 8, 10, '#ffcf33'); },   // trophies
      desks: [{ x: 120, y: 112, style: 'exec' }, { x: 14, y: 200, style: 'wood' }],
      spots: { coffee: [{ x: 46, y: 104 }], vend: [{ x: 102, y: 104 }], sofa: [{ x: 36, y: 300, sit: 1 }, { x: 72, y: 300, sit: 1 }, { x: 108, y: 300, sit: 1 }],
        meet: [{ x: 188, y: 252, sit: 1 }, { x: 250, y: 252, sit: 1, face: -1 }], present: [{ x: 220, y: 214 }],
        fish: [{ x: 320, y: 312 }, { x: 352, y: 312 }], globe: [{ x: 318, y: 200, face: -1 }], window: [{ x: 110, y: 76 }, { x: 170, y: 76 }], plant: [{ x: 360, y: 150, face: 1 }] },
      block: [[114, 84, 152, 56], [8, 176, 92, 40], [10, 58, 74, 34], [88, 56, 30, 40], [12, 266, 132, 40], [184, 246, 72, 26], [284, 254, 96, 44], [292, 166, 26, 30]],
      furniture: (y, t, now, busy) => {
        R(10, y + 60, 72, 26, '#5b3a2a'); R(10, y + 86, 72, 4, '#3f2719'); R(28, y + 62, 18, 18, '#2b3140'); R(32, y + 66, 10, 4, busy('coffee') ? '#4be37a' : '#ff6b6b'); R(35, y + 72, 4, 4, '#fff');   // espresso sideboard
        if (busy('coffee')) R(36, y + 70, 1, 3, '#6b3a1a'); R(56, y + 66, 6, 7, '#fff'); R(66, y + 66, 6, 7, '#fff');
        fridge(88, y + 56, '#3a2f2a', busy('vend')); R(92, y + 62, 18, 2, '#c9a06a');                                 // mini-bar
        sofa(16, y + 270, 128, '#6b3a2a'); table(46, y + 304, 60, 10, '#3f2719');
        roundTable(220, y + 260, 30, 12, '#8a5a36'); chairDot(188, y + 258, '#5b3a2a'); chairDot(250, y + 258, '#5b3a2a');
        R(286, y + 256, 92, 42, '#2b3140'); R(289, y + 259, 86, 34, '#3a8fd0');                                            // aquarium
        for (let k = 0; k < 3; k++) { const fx2 = 292 + ((t * (k + 1) * 3 + k * 40) % 76); R(fx2, y + 266 + k * 9, 6, 4, ['#ff8a3d', '#ffd400', '#ff5d8f'][k]); }
        R(290, y + 289, 84, 4, '#e9d7b7'); R(300, y + 280, 2, 9, '#43a047'); R(360, y + 278, 2, 11, '#43a047');
        R(300, y + 168, 2, 24, '#8a5a36'); g.fillStyle = '#3a8fd0'; g.beginPath(); g.arc(301, y + 168, 10, 0, Math.PI * 2); g.fill(); R(296, y + 164, 6, 4, '#43a047'); R(300, y + 170, 5, 3, '#43a047');   // globe
        plant(364, y + 120);
      },
      words: { coffee: ['エスプレッソ{e}', 'いい豆だ{e}'], vend: ['冷えてる{e}', 'ミニバーから一本{e}'] },
    },
    intel: {
      floor: (y) => carpet(0, y + WALL, W, FH - WALL, ['#c3c9d6', '#bac1cf']),
      wall: (y, t) => { for (let k = 0; k < 6; k++) tv(84 + (k % 3) * 46, y + 6 + Math.floor(k / 3) * 22, 44, 20, t, k);
        R(226, y + 10, 76, 30, '#16202e'); for (let k = 0; k < 4; k++) R(230, y + 14 + k * 6, 20 + ((k * 13 + t) % 40), 2, k % 2 ? '#4be37a' : '#5ab0ff');
        R(84, y + 48, 260, 6, '#c62828'); TXT('速報　トレンド　マーケット　受信箱', 84 + 130 - ((t * 4) % 260) + 260, y + 51, '#fff', 6, 800); },
      desks: [{ x: 14, y: 112, style: 'news' }, { x: 98, y: 112, style: 'news' }, { x: 182, y: 112, style: 'news' }, { x: 14, y: 196, style: 'news' }],
      spots: { coffee: [{ x: 40, y: 310 }], phone: [{ x: 120, y: 232 }, { x: 156, y: 232 }], globe: [{ x: 112, y: 312 }], mail: [{ x: 196, y: 312 }],
        print: [{ x: 290, y: 314 }], tv: [{ x: 150, y: 74 }, { x: 196, y: 74 }], meet: [{ x: 276, y: 146, sit: 1 }, { x: 330, y: 146, sit: 1, face: -1 }, { x: 276, y: 178, sit: 1 }, { x: 330, y: 178, sit: 1, face: -1 }],
        present: [{ x: 300, y: 104 }], plant: [{ x: 360, y: 236, face: 1 }] },
      block: [[8, 88, 260, 52], [8, 172, 92, 40], [96, 196, 82, 24], [16, 258, 48, 36], [76, 258, 76, 40], [164, 254, 52, 46], [230, 254, 116, 48], [270, 150, 66, 26]],
      furniture: (y, t, now, busy) => {
        table(100, y + 198, 76, 16, '#aeb5c3'); for (let k = 0; k < 3; k++) { R(106 + k * 24, y + 200, 12, 8, '#2b3140'); R(110 + k * 24, y + 198, 4, 2, '#e53935'); }   // phone bank
        R(18, y + 266, 40, 26, '#9aa3b5'); R(24, y + 258, 14, 10, '#3a2f2a'); R(26, y + 262, 10, 6, '#6b3a1a'); R(44, y + 262, 8, 6, '#fff');                                    // coffee cart
        table(78, y + 266, 72, 30, '#6d8f6a'); R(82, y + 270, 64, 22, '#b9d6a8'); for (let k = 0; k < 5; k++) R(88 + k * 12, y + 274 + (k % 2) * 8, 6, 5, '#7da36b'); R(118, y + 278, 3, 3, '#e53935');   // map table
        R(166, y + 256, 48, 44, '#8a6b4a'); for (let k = 0; k < 12; k++) { R(169 + (k % 4) * 11, y + 259 + Math.floor(k / 4) * 13, 9, 11, '#5b3a2a'); if ((k + (t >> 4)) % 3) R(171 + (k % 4) * 11, y + 263 + Math.floor(k / 4) * 13, 6, 4, '#fff'); }   // pigeonholes
        R(232, y + 258, 112, 40, '#4a5363'); R(232, y + 258, 112, 6, '#2b3140'); for (let k = 0; k < 4; k++) { g.fillStyle = '#7d8597'; g.beginPath(); g.arc(250 + k * 26, y + 280, 9, 0, Math.PI * 2); g.fill(); R(248 + k * 26 + (busy('print') ? (t % 3) - 1 : 0), y + 272, 4, 4, '#2b3140'); }   // printing press
        roundTable(303, y + 162, 32, 12, '#d5d9e2'); for (const c of [[276, 166], [330, 166], [276, 186], [330, 186]]) chairDot(c[0], y + c[1]);
        plant(364, y + 206);
      },
      words: { print: ['号外だ{e}！', '刷り上がった{e}'], mail: ['手紙を仕分け{e}', 'お便り届いた{e}'], coffee: ['コーヒー注ぐ{e}', '眠気覚まし{e}'] },
    },
    lib: {
      floor: (y) => { wood(0, y + WALL, W, FH - WALL, '#8c6a4f', '#836148'); rug(110, y + 126, 190, 110, '#3f6e5a', '#2e5444'); },
      wall: (y) => { books(84, y + 4, 100, 46); books(190, y + 4, 100, 46); R(296, y + 14, 50, 20, '#2e5444'); TXT('お静かに', 321, y + 24, '#e8f3ec', 7, 800);
        R(178, y + 4, 2, 50, '#7a5f40'); R(186, y + 4, 2, 50, '#7a5f40'); for (let k = 0; k < 5; k++) R(178, y + 10 + k * 9, 10, 2, '#7a5f40'); },   // ladder
      desks: [{ x: 124, y: 150, style: 'reading' }, { x: 212, y: 150, style: 'reading' }],
      spots: { read: [{ x: 76, y: 130, face: -1 }, { x: 76, y: 214, face: -1 }], dept: [{ x: 332, y: 140 }], coffee: [{ x: 334, y: 300 }],
        sofa: [{ x: 128, y: 300, sit: 1 }, { x: 200, y: 300, sit: 1 }], print: [{ x: 262, y: 308 }],
        meet: [{ x: 160, y: 206, sit: 1 }, { x: 248, y: 206, sit: 1 }], plant: [{ x: 360, y: 200, face: 1 }] },
      block: [[12, 84, 52, 160], [118, 124, 182, 60], [300, 92, 64, 34], [300, 246, 72, 34], [108, 266, 52, 36], [180, 266, 52, 36], [240, 258, 44, 34]],
      furniture: (y, t, now, busy) => {
        books(12, y + 86, 22, 156); books(40, y + 86, 22, 156);                                                         // freestanding stacks
        R(300, y + 94, 62, 30, '#6b4a33'); for (let k = 0; k < 8; k++) { R(303 + (k % 4) * 15, y + 97 + Math.floor(k / 4) * 13, 13, 11, '#8a6b4a'); R(308 + (k % 4) * 15, y + 102 + Math.floor(k / 4) * 13, 4, 2, '#e9d7b7'); }   // card catalogue
        table(302, y + 256, 66, 18, '#6b4a33'); R(312, y + 246, 12, 12, '#c0504d'); R(314, y + 244, 8, 3, '#3a2f2a'); if (busy('coffee')) R(318, y + 238 - (t % 4), 2, 5, 'rgba(255,255,255,.7)'); R(334, y + 250, 6, 6, '#fff'); R(344, y + 250, 6, 6, '#fff');   // tea
        armchair(114, y + 270, '#3f6e5a'); armchair(186, y + 270, '#3f6e5a'); lamp(166, y + 262, true);
        R(242, y + 262, 40, 28, '#d9dde6'); R(242, y + 262, 40, 6, '#aeb5c3'); R(248, y + 270, 18, 4, '#2b3140');                   // photocopier
        plant(364, y + 170);
      },
      words: { coffee: ['紅茶淹れる{e}', 'いい香り{e}'], print: ['資料をコピー{e}'], dept: ['目録を調べる{e}', 'カードはここ{e}'] },
      quiet: true,
    },
    dev: {
      floor: (y) => { R(0, y + WALL, W, FH - WALL, '#a9aeb8'); for (let k = 0; k < 6; k++) R(0, y + WALL + 40 + k * 44, W, 1, '#9aa0ab'); R(0, y + 240, W, 4, '#2f3644'); R(140, y + 240, 4, 90, '#2f3644'); },   // concrete + cable trays
      wall: (y, t) => { for (let k = 0; k < 6; k++) rack(84 + k * 26, y + 6, t + k); whiteboard(250, y + 6, 96, ['#2f80ed', '#e57373', '#2b3140']); R(258, y + 20, 18, 10, '#2f80ed'); R(280, y + 22, 22, 2, '#2b3140'); R(306, y + 16, 18, 14, '#e57373'); },
      desks: [{ x: 14, y: 112, style: 'standing' }, { x: 100, y: 112, style: 'standing' }, { x: 186, y: 112, style: 'standing' }, { x: 14, y: 196, style: 'standing' }],
      spots: { dept: [{ x: 150, y: 76 }, { x: 212, y: 76 }], pingpong: [{ x: 196, y: 214, face: 1 }, { x: 300, y: 214, face: -1 }], charge: [{ x: 166, y: 312, sit: 1 }, { x: 196, y: 312, sit: 1 }],
        sofa: [{ x: 40, y: 312, sit: 1 }, { x: 84, y: 312, sit: 1 }], vend: [{ x: 344, y: 312 }], print: [{ x: 256, y: 312 }],
        meet: [{ x: 290, y: 130 }, { x: 330, y: 130 }, { x: 310, y: 160 }], present: [{ x: 298, y: 96 }] },
      block: [[8, 88, 262, 52], [8, 172, 92, 40], [206, 196, 100, 40], [146, 270, 74, 30], [20, 280, 90, 30], [332, 250, 34, 48], [236, 262, 44, 34]],
      furniture: (y, t, now, busy) => {
        R(210, y + 200, 92, 34, '#2e7d5b'); R(212, y + 202, 88, 30, '#3fae7a'); R(255, y + 196, 2, 40, '#fff'); R(210, y + 216, 92, 1, '#fff');   // ping-pong table
        R(150, y + 276, 66, 22, '#2f3644'); R(154, y + 280, 58, 6, '#3d4656'); for (let k = 0; k < 2; k++) R(160 + k * 30, y + 288, 10, 6, busy('charge') ? (t % 2 ? '#4be37a' : '#2e7d5b') : '#4a5363');   // charging dock
        beanbag(42, y + 304, '#ff8a3d'); beanbag(86, y + 306, '#5ab0ff');
        fridge(334, y + 252, '#1b2433', busy('vend')); for (let k = 0; k < 6; k++) R(338 + (k % 3) * 7, y + 258 + Math.floor(k / 3) * 12, 5, 9, ['#4be37a', '#ffd400', '#e53935'][k % 3]);   // energy drinks
        R(238, y + 266, 40, 30, '#d9dde6'); R(242, y + 270, 32, 18, 'rgba(160,220,255,.4)'); R(250 + (busy('print') ? (t % 8) : 0), y + 278, 10, 2, '#e53935'); R(252, y + 284, 6, 4 + (busy('print') ? (t % 6) : 0), '#ffd400');   // 3D printer
      },
      words: { vend: ['エナドリ補給{e}', 'カフェインだ{e}'], print: ['3Dプリント中{e}', '試作品できた{e}'], dept: ['サーバー元気{e}', 'ラックを点検{e}'] },
    },
    plan: {
      floor: (y) => { carpet(0, y + WALL, W, FH - WALL, ['#d3cbe0', '#cbc2da']); g.fillStyle = '#e8b6c9'; g.beginPath(); g.ellipse(70, y + 292, 70, 30, 0, 0, Math.PI * 2); g.fill(); },
      wall: (y, t) => { stickyWall(84, y + 6, 166, 44, t); R(256, y + 6, 90, 42, '#2b3140'); R(258, y + 8, 86, 38, '#fbfbf8'); R(264, y + 14, 30, 20, '#ffd6a5'); R(298, y + 16, 40, 3, '#9aa3b5'); R(298, y + 24, 30, 3, '#9aa3b5'); },
      desks: [{ x: 14, y: 124, style: 'grey' }, { x: 100, y: 124, style: 'grey' }],
      spots: { sticky: [{ x: 120, y: 76 }, { x: 200, y: 76 }], present: [{ x: 300, y: 100 }],
        meet: [{ x: 250, y: 178, sit: 1 }, { x: 350, y: 178, sit: 1, face: -1 }, { x: 270, y: 210, sit: 1 }, { x: 330, y: 210, sit: 1, face: -1 }],
        sofa: [{ x: 36, y: 300, sit: 1 }, { x: 76, y: 312, sit: 1 }, { x: 116, y: 300, sit: 1 }], vend: [{ x: 204, y: 304 }], game: [{ x: 346, y: 312 }],
        print: [{ x: 160, y: 236 }], window: [], plant: [{ x: 214, y: 140 }] },
      block: [[8, 100, 180, 52], [256, 172, 92, 36], [16, 278, 120, 44], [186, 254, 40, 40], [332, 244, 40, 56], [140, 196, 40, 28]],
      furniture: (y, t, now, busy) => {
        roundTable(300, y + 194, 48, 16, '#f2c94c'); for (let k = 0; k < 6; k++) R(266 + k * 12, y + 188 + (k % 2) * 6, 8, 6, ['#fff', '#ffe066', '#8fd3ff'][k % 3]);
        for (const c of [[250, 196], [350, 196], [270, 222], [330, 222]]) chairDot(c[0], y + c[1], '#7c4dbd');
        beanbag(36, y + 292, '#ff6b9a'); beanbag(76, y + 304, '#ffd400'); beanbag(116, y + 292, '#5ab0ff');
        table(186, y + 268, 40, 20, '#c9a06a'); R(194, y + 256, 12, 14, 'rgba(255,255,255,.7)'); for (let k = 0; k < 4; k++) R(196 + (k % 2) * 4, y + 260 + Math.floor(k / 2) * 4, 3, 3, ['#e53935', '#ffd400', '#43a047', '#2f80ed'][k]);   // candy jar
        R(334, y + 246, 34, 52, '#7c4dbd'); R(338, y + 250, 26, 20, '#16202e'); R(342 + (t % 10), y + 258, 4, 4, busy('game') ? '#ffd400' : '#4be37a'); R(340, y + 274, 22, 6, '#2b3140'); R(344, y + 276, 4, 2, '#e53935');   // arcade
        R(144, y + 204, 34, 18, '#d9dde6'); R(148, y + 208, 16, 3, '#2b3140');                                                // printer
        plant(214, y + 110); plant(364, y + 120);
      },
      words: { vend: ['お菓子つまむ{e}', 'チョコ発見{e}'] },
    },
    write: {
      floor: (y) => { wood(0, y + WALL, W, FH - WALL, '#c9a77c', '#bf9c70'); rug(170, y + 100, 120, 70, '#9a5b2e', '#7a4520'); },
      wall: (y, t, night) => { books(84, y + 4, 80, 46);
        R(176, y + 8, 80, 44, '#8a6b4a'); R(186, y + 20, 60, 32, '#2b2b3a'); for (let k = 0; k < 4; k++) R(196 + k * 12, y + 40 - ((t + k * 3) % 6), 6, 8, ['#ff8a3d', '#ffd400', '#ff5d3d', '#ffb347'][k]);   // fireplace
        blinds(266, y + 12, night, t); R(322, y + 14, 22, 28, '#c9a06a'); R(325, y + 17, 16, 22, '#f5f0e1'); },
      desks: [{ x: 14, y: 112, style: 'booth' }, { x: 100, y: 112, style: 'booth' }, { x: 14, y: 198, style: 'booth' }],
      spots: { sofa: [{ x: 196, y: 140, sit: 1 }, { x: 250, y: 140, sit: 1 }], type: [{ x: 330, y: 150 }], mail: [{ x: 134, y: 300 }],
        coffee: [{ x: 326, y: 300 }], print: [{ x: 222, y: 306 }], meet: [{ x: 268, y: 222, sit: 1 }, { x: 320, y: 222, sit: 1, face: -1 }], plant: [{ x: 360, y: 236, face: 1 }] },
      block: [[8, 88, 180, 52], [8, 174, 92, 42], [180, 110, 90, 40], [298, 104, 76, 34], [114, 262, 44, 30], [298, 252, 76, 30], [200, 262, 44, 32], [262, 204, 64, 22]],
      furniture: (y, t, now, busy) => {
        armchair(182, y + 118, '#7a4520'); armchair(236, y + 118, '#7a4520');
        table(300, y + 108, 72, 24, '#6b4a33'); R(320, y + 104, 28, 14, '#2b3140'); R(322, y + 100, 24, 6, '#fbfbf8'); for (let k = 0; k < 6; k++) R(322 + k * 4, y + 114, 2, 2, '#9aa3b5'); if (busy('type')) R(322, y + 98 - (t % 3), 24, 2, '#fbfbf8');   // typewriter
        R(116, y + 266, 40, 22, '#8a6b4a'); R(118, y + 262, 36, 6, '#c9a06a'); for (let k = 0; k < 3; k++) R(122, y + 258 - k * 3, 28, 3, '#fbfbf8'); TXT('提出', 136, y + 280, '#fff', 7, 800);   // manuscript tray
        table(300, y + 256, 72, 20, '#6b4a33'); R(310, y + 244, 14, 12, '#e9e4d8'); R(312, y + 240, 10, 4, '#8a6b4a'); R(328, y + 248, 8, 8, '#2b3140'); if (busy('coffee')) R(316, y + 254, 1, 4, '#6b3a1a');   // pour-over
        R(202, y + 266, 40, 26, '#d9dde6'); R(202, y + 266, 40, 6, '#aeb5c3'); for (let k = 0; k < 3; k++) R(206, y + 262 - k * 2, 30, 2, '#fff');
        roundTable(294, y + 226, 30, 10, '#a9825a'); R(284, y + 222, 12, 6, '#fff'); R(300, y + 224, 10, 5, '#fff');
        plant(364, y + 206); lamp(30, y + 262, true);
      },
      words: { mail: ['原稿提出{e}', '締め切り守った{e}'], coffee: ['ハンドドリップ{e}', '丁寧に淹れる{e}'], sofa: ['暖炉あったかい{e}', 'ぬくぬく{e}'] },
    },
    art: {
      floor: (y) => { wood(0, y + WALL, W, FH - WALL, '#ddd0bd', '#d4c6b1'); for (let k = 0; k < 14; k++) R((k * 97) % 370 + 10, y + 70 + (k * 53) % 240, 4 + k % 3, 3, ['#e53935', '#2f80ed', '#f2c94c', '#43a047'][k % 4]); },   // paint splatters
      wall: (y, t, night) => { pinned(84, y + 6, 118, 42); R(208, y + 6, 96, 40, '#8e96a8'); R(210, y + 8, 92, 36, night ? '#2a3a66' : '#d7f0ff'); R(254, y + 8, 2, 36, '#8e96a8'); R(210, y + 24, 92, 2, '#8e96a8');
        R(310, y + 8, 36, 40, '#8a6b4a'); for (let k = 0; k < 9; k++) R(313 + (k % 3) * 11, y + 11 + Math.floor(k / 3) * 12, 8, 10, ['#e53935', '#2f80ed', '#f2c94c', '#43a047', '#8e24aa', '#fb8c00'][k % 6]); },
      desks: [{ x: 14, y: 112, style: 'drafting' }, { x: 100, y: 112, style: 'drafting' }],
      spots: { paint: [{ x: 218, y: 152 }, { x: 270, y: 152 }, { x: 322, y: 152 }], photo: [{ x: 88, y: 304, face: -1 }], print: [{ x: 176, y: 306 }],
        dept: [{ x: 272, y: 300 }], vend: [{ x: 346, y: 312 }], window: [{ x: 232, y: 76 }, { x: 280, y: 76 }], plant: [{ x: 196, y: 210 }] },
      block: [[8, 88, 180, 52], [200, 96, 156, 50], [12, 240, 60, 60], [128, 262, 96, 30], [250, 258, 46, 32], [334, 252, 34, 48]],
      furniture: (y, t, now, busy) => {
        for (let k = 0; k < 3; k++) easel(206 + k * 52, y + 100, ((now / 9000) + k * .3) % 1, [['#e53935', '#f2c94c'], ['#2f80ed', '#43a047'], ['#8e24aa', '#ffb36b']][k]);
        R(14, y + 244, 52, 40, '#7d8597'); R(16, y + 246, 48, 36, '#cfe6f5'); R(16, y + 282, 48, 8, '#e9e4d8');                           // backdrop
        R(66, y + 246, 4, 44, '#2b3140'); R(60, y + 240, 16, 12, busy('photo') && t % 3 === 0 ? '#ffffff' : '#e8ecf3'); if (busy('photo') && t % 3 === 0) { g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(0, y + WALL, W, FH - WALL); }
        R(130, y + 266, 92, 22, '#d9dde6'); R(130, y + 266, 92, 6, '#aeb5c3'); R(140, y + 274, 72, 2, '#2b3140'); if (busy('print')) R(140, y + 286, 72, 4 + (t % 8), '#f7c6d9');   // plotter
        R(252, y + 262, 42, 24, '#e8ecf3'); R(258, y + 266, 30, 12, '#9fd8ff'); R(270, y + 256, 4, 8, '#9aa3b5'); R(262, y + 268, 4, 8, '#8a5a36'); R(276, y + 268, 4, 8, '#8a5a36');   // sink + brushes
        fridge(336, y + 254, '#f2f2f2', busy('vend')); R(340, y + 258, 18, 8, '#ffb36b');
        plant(196, y + 180);
      },
      words: { print: ['大判で刷る{e}', 'ポスターできた{e}'], dept: ['筆を洗う{e}', 'パレット片づけ{e}'], vend: ['ジュース飲む{e}'] },
    },
  };
  const roomOf = (f) => ROOMS[f.key] || ROOMS.plan;
  const EV = { x: 366, y: 84 };              // the lift, the same corner on every floor
  const spotsOf = (f, act) => act === 'ev' ? [EV] : (roomOf(f).spots[act] || []);
  // How long a machine takes, what it hands over, and what it says.
  const USE = {
    coffee: { ms: 3200, item: 'mug', then: ['bar', 'sofa', 'pc', 'window'], line: ['コーヒー淹れる{e}', 'いい香り{e}'] },
    vend:   { ms: 1500, item: 'can', then: ['sofa', 'wander', 'chat'], line: ['ガコン！', 'どれにしよう{e}'] },
    print:  { ms: 2600, item: 'paper', then: ['meet', 'pc', 'deliver'], line: ['印刷する{e}', '刷り上がった{e}！'] },
    mail:   { ms: 1400, item: null, then: ['wander', 'coffee'], line: ['メール送った{e}', 'お便り出す{e}'] },
    phone:  { ms: 5000, item: null, then: ['wander'], line: ['もしもし{e}', 'はい、承知した{e}'] },
    pc:     { ms: 7000, item: null, then: ['coffee', 'wander', 'chat'], line: ['調べもの{e}', 'ネットサーフィン{e}'] },
    // room-only errands
    fish:     { ms: 6000, look: 1, then: ['sofa', 'wander'], line: ['金魚かわいい{e}', '癒やされる{e}'] },
    globe:    { ms: 3000, look: 1, then: ['wander', 'meet'], line: ['次はどこの市場{e}', 'くるくる{e}'] },
    tv:       { ms: 5000, look: 1, then: ['pc', 'phone', 'wander'], line: ['速報だ{e}', 'このニュース気になる{e}'] },
    read:     { ms: 8000, look: 1, item: 'book', then: ['sofa', 'pc', 'wander'], line: ['この本いい{e}', '調べもの{e}'] },
    sticky:   { ms: 2600, then: ['meet', 'wander', 'chat'], line: ['アイデア貼る{e}', 'これも案{e}！'] },
    game:     { ms: 6000, then: ['vend', 'sofa', 'wander'], line: ['ハイスコア{e}！', 'あと一回{e}'] },
    paint:    { ms: 9000, then: ['dept', 'wander', 'vend'], line: ['いい色出た{e}', 'もう少し塗る{e}'] },
    photo:    { ms: 3600, then: ['print', 'pc', 'wander'], line: ['はい、チーズ{e}', 'いい写真撮れた{e}'] },
    charge:   { ms: 9000, then: ['pc', 'wander', 'pingpong'], line: ['充電中{e}', 'バッテリー回復{e}'] },
    type:     { ms: 6000, item: 'paper', then: ['mail', 'sofa', 'coffee'], line: ['カタカタ{e}', '一章書けた{e}'] },
    pingpong: { ms: 9000, then: ['vend', 'sofa', 'wander'], line: ['いくよ{e}！', 'スマッシュ{e}！'] },
  };
  const BASE = { coffee: 4, vend: 2, print: 2, mail: 1, phone: 1, pc: 3, sofa: 3, window: 2, plant: 1, dept: 2, chat: 4, wander: 2, visit: 2,
    fish: 3, globe: 2, tv: 3, read: 4, sticky: 3, game: 2, paint: 4, photo: 3, charge: 0, type: 3, pingpong: 3 };
  const ANYWHERE = ['chat', 'wander', 'visit', 'pc', 'home'];
  const FAV = {
    'orchestrator': { visit: 22, chat: 6 },                                  // the boss walks the building
    'mail-agent': { mail: 12 }, 'chat-agent': { phone: 10 }, 'news-agent': { print: 8 }, 'article-writer': { print: 6, pc: 4 },
    'drafting-agent': { print: 5 }, 'article-ideas': { print: 4, visit: 4 }, 'financial-agent': { vend: 4, pc: 4 }, 'scout-agent': { window: 6, pc: 4 },
    'location-agent': { window: 6 }, 'visionary': { window: 8 }, 'lint-agent': { dept: 6 }, 'context-agent': { dept: 6, visit: 3 },
    'system-audit-agent': { dept: 6, visit: 5 }, 'dev-agent': { pc: 6, coffee: 6 }, 'review-agent': { visit: 5 }, 'slide-agent': { print: 5 },
    'product-pick': { vend: 4 }, 'advisor': { visit: 6 }, 'design-critic': { visit: 6 }, 'article-angle': { visit: 3 },
    'efficiency-audit': { globe: 4 }, 'log-monitor-agent': { tv: 8 }, 'knowledge-agent': { read: 8 }, 'reflection-writer': { type: 6 },
    'article-ideas': { sticky: 8 }, 'hero-style': { paint: 8 }, 'design-agent': { paint: 6 }, 'image-scout': { photo: 8 }, 'recipe-vision': { photo: 5 },
  };
  // Where a visit tends to go: who works with whom.
  const VISIT = { exec: ['intel', 'dev', 'plan', 'write', 'art', 'lib'], intel: ['exec', 'plan', 'lib'], lib: ['write', 'plan', 'intel'],
    dev: ['exec', 'intel', 'lib', 'plan', 'write', 'art'], plan: ['write', 'art', 'intel'], write: ['plan', 'art', 'lib'], art: ['write', 'plan'] };
  const SOLO = {
    sofa: ['ふかふか{e}', 'ひと休み{e}'], plant: ['水やり{e}', '大きくなった{e}'], wander: ['ちょっと散歩{e}', 'のびー{e}'],
    bar: ['ほっと一息{e}', 'おいしい{e}'], meet: ['資料置いとく{e}'],
    window: () => isNight() ? ['夜景きれい{e}', '星が見える{e}'] : ['いい天気{e}', '外は暑そう{e}'],
    dept: { exec: ['今月の数字を見る{e}'], intel: ['ニュースを見張る{e}'], lib: ['本を並べ直す{e}'], dev: ['サーバー元気{e}'], plan: ['付箋を貼る{e}'], write: ['構成を考える{e}'], art: ['色を選ぶ{e}'] },
  };
  const PAIRS = [['コーヒー飲む{e}？', 'いただく{e}！'], ['今日の記事どう{e}？', 'いい感じ{e}'], ['週末なにする{e}？', '寝る{e}'],
    ['あの件どうなった{e}？', 'もう少し{e}'], ['お昼なに食べた{e}？', 'カレー{e}'], ['最近忙しい{e}？', 'ぼちぼち{e}']];
  const BOSS = [['進捗どう{e}？', '順調{e}！'], ['困ってることない{e}？', '大丈夫{e}'], ['次の仕事お願い{e}', '任せて{e}！'], ['いい感じ{e}！', 'ありがとう{e}']];
  const MEETING = { open: ['今週の方針です{e}', '進捗を共有する{e}', '何か意見ある{e}？'], react: ['いいと思う{e}', '賛成{e}', 'なるほど{e}', '質問ある{e}'] };
  const TIRED = { 1: ['疲れてきた{e}', 'ちょっと休みたい{e}'], 2: ['限界{e}…', 'もう無理{e}…', '目がしょぼしょぼ{e}'] };

  // Fatigue from real numbers: the share of its token budget used, and how many tasks it ran today.
  function fatigueOf(id) {
    const d = DETAIL_DATA[id] || {};
    const pct = (d.tokensUsed || 0) / (d.tokenLimit || 1e12);
    const today = new Date().toISOString().slice(0, 10);
    const n = TASK_STATS?.byDay?.[today]?.agentCounts?.[id] || 0;
    return pct > 0.7 || n >= 8 ? 2 : pct > 0.4 || n >= 4 ? 1 : 0;
  }

  let layout = null;                         // { floors:[{...,y}], height }
  const ents = new Map();                    // id → entity (survives data refreshes)
  const fx = [];                             // short effects: paper, envelope, can, lift doors
  const floorBy = (key) => layout?.floors.find((f) => f.key === key);
  function buildLayout() {
    let y = 0;
    const floors = people().map((f) => { const o = { ...f, y, meeting: null, busy: {} }; y += FH + 6; return o; });
    const keep = layout;
    layout = { floors, height: y };          // floorBy() needs it while seating
    for (const f of floors) {
      f.desks = roomOf(f).desks.map((d) => ({ ...d, big: d.style === 'exec' }));
      let di = 0;
      f.ids.forEach((id) => {
        const st = stateOf(id);
        let e = ents.get(id);
        if (!e || e.home !== f.key) {
          const p = randomPoint(f, null);
          e = { id, home: f.key, x: p.x, y: p.y, tx: p.x, ty: p.y, mode: 'stay', act: 'wander', until: 0, face: 1, alpha: 1 };
          ents.set(id, e);
        }
        if (!e.visiting) e.f = f; else e.f = floorBy(e.f.key) || f;
        e.st = st; e.tired = fatigueOf(id);
        const atDesk = st === 'work' || (id === 'orchestrator' && st === 'running');
        if (atDesk) {
          if (e.visiting) { e.visiting = false; e.f = f; e.alpha = 1; }
          e.desk = f.desks[Math.min(di++, f.desks.length - 1)]; e.mode = 'sit'; e.item = null;
        } else if (st === 'error') {
          if (e.visiting) { e.visiting = false; e.f = f; e.alpha = 1; }
          const n = f.ids.filter((x) => stateOf(x) === 'error').indexOf(id);
          const p = liePoint(f, n); e.desk = null; e.mode = 'lie'; e.x = e.tx = p.x; e.y = e.ty = p.y; e.item = null;
        } else if (e.mode === 'sit' && !e.browsing || e.mode === 'lie') { e.desk = null; e.mode = 'stay'; e.until = 0; }
      });
    }
    return layout;
  }
  // Anywhere on the open floor: not on furniture, and not where someone already stands.
  const onFurniture = (f, x, y) => (f.desks || []).some((d) => x > d.x - 6 && x < d.x + (d.big ? 146 : 86) && y > d.y - 4 && y < d.y + 34)
    || roomOf(f).block.some(([bx, by, bw, bh]) => x > bx - 8 && x < bx + bw + 8 && y > by - 2 && y < by + bh + 12);
  const taken = (x, y, self, f) => [...ents.values()].some((o) => o !== self && o.f === (f || self?.f) && Math.hypot(o.tx - x, o.ty - y) < 20);
  function randomPoint(f, self) {
    for (let k = 0; k < 40; k++) {
      const x = 22 + Math.random() * 330, y = 96 + Math.random() * 220;
      if (!onFurniture(f, x, y) && !taken(x, y, self, f)) return { x, y };
    }
    return { x: 190 + Math.random() * 20, y: 240 };
  }
  // A clear patch of floor to collapse on — each room has its furniture somewhere else.
  function liePoint(f, n) {
    const pts = [];
    for (let y = 236; y > 90; y -= 18) for (let x = 170; x < 350; x += 46) if (!onFurniture(f, x, y) && !onFurniture(f, x - 16, y) && !onFurniture(f, x + 16, y)) pts.push({ x, y });
    return pts[n % Math.max(1, pts.length)] || { x: 190, y: 240 };
  }

  // ── behaviour ───────────────────────────────────────────────────────────────
  const free = (e) => e.mode !== 'sit' && e.mode !== 'lie' && e.mode !== 'use' && e.mode !== 'lift' && !e.meeting;
  const kindOf = (e) => (CAST[e.id] || ['human'])[0];
  const speed = (e) => e.id === 'orchestrator' ? 3.2 : [2.5, 1.8, 1.1][e.tired || 0];
  function pickErrand(e, from) {
    const w = { ...BASE, ...(FAV[e.id] || {}) };
    if (kindOf(e) === 'robot') w.charge = e.tired ? 14 : 4;   // robots recharge instead of resting
    const room = roomOf(e.f);
    for (const k of Object.keys(w)) if (!ANYWHERE.includes(k) && !room.spots[k]?.length) w[k] = 0;
    if (from) for (const k of Object.keys(w)) if (!from.includes(k)) w[k] = 0;
    if (jstHour() < 6 && w.sofa) w.sofa += 8;
    if (e.tired === 1) { if (w.coffee) w.coffee += 4; if (w.sofa) w.sofa += 4; }
    if (e.tired === 2) { if (w.coffee) w.coffee += 8; if (w.sofa) w.sofa += 12; w.visit = 0; w.pingpong = 0; }
    if (e.visiting) { w.visit = 0; w.home = 6; }
    const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
    let r = Math.random() * total;
    for (const [k, v] of Object.entries(w)) { r -= v; if (r <= 0) return k; }
    return 'wander';
  }
  function goTo(e, act, p) { e.act = act; e.tx = p.x; e.ty = p.y; e.seat = !!p.sit; e.spotFace = p.face || 0; e.mode = 'walk'; }
  function choose(e, now, from) {
    let act = pickErrand(e, from);
    if (act === 'home' || (e.visiting && now > e.visitUntil)) act = 'lift', e.dest = e.home;
    if (act === 'visit' || act === 'deliver') {
      const opts = VISIT[e.f.key] || [];
      const dest = opts[Math.floor(Math.random() * opts.length)];
      if (dest && floorBy(dest)) { e.errand = act; e.dest = dest; act = 'lift'; }
      else act = 'wander';
    }
    if (act === 'lift') return goTo(e, 'lift', EV);
    if (act === 'pingpong') {
      const [a, b] = spotsOf(e.f, 'pingpong');
      const mate = [...ents.values()].find((o) => o !== e && o.f === e.f && free(o) && o.mode === 'stay' && !o.partner && !o.seat && o.tired < 2);
      if (mate && !((e.f.busy.pingpong || 0) > now)) {
        e.partner = mate; mate.partner = e; e.f.busy.pingpong = now + 20000;
        goTo(e, 'pingpong', a); goTo(mate, 'pingpong', b);
        return;
      }
      act = 'wander';
    }
    if (act === 'chat') {
      const mate = [...ents.values()].find((o) => o !== e && o.f === e.f && free(o) && o.mode === 'stay' && !o.partner && !o.seat);
      if (mate) {
        const side = [mate.x > 190 ? -26 : 26, mate.x > 190 ? 26 : -26].find((dx) => !onFurniture(e.f, mate.x + dx, mate.y) && mate.x + dx > 16 && mate.x + dx < 374);
        if (side != null) {
          e.partner = mate; mate.partner = e;
          goTo(mate, 'chat', { x: mate.x, y: mate.y });
          goTo(e, 'chat', { x: mate.x + side, y: mate.y });
          return;
        }
      }
      act = 'wander';
    }
    if (act === 'pc') {
      const d = e.f.desks.find((dd) => !dd.big && ![...ents.values()].some((o) => o.desk === dd));
      if (d) { e.pcDesk = d; return goTo(e, 'pc', { x: d.x + 38, y: d.y - 2 }); }
      act = 'wander';
    }
    if (act === 'mail') e.item = 'letter';
    if (act === 'meet') return goTo(e, 'meet', (spotsOf(e.f, 'meet').filter((q) => !taken(q.x, q.y, e)))[0] || randomPoint(e.f, e));
    const pool = spotsOf(e.f, act).filter((q) => !taken(q.x, q.y, e));
    if (pool.length) goTo(e, act, pool[Math.floor(Math.random() * pool.length)]);
    else goTo(e, 'wander', randomPoint(e.f, e));
  }
  function line(e, pool, now, kind) { if (pool?.length) speak(e, say(kindOf(e), pool[Math.floor(Math.random() * pool.length)]), now, kind); }
  function arrive(e, now) {
    e.mode = 'stay'; e.until = now + 5000 + Math.random() * 7000;
    if (e.spotFace) e.face = e.spotFace;
    // the lift: doors open, they vanish, and step out on another floor
    if (e.act === 'lift') {
      e.mode = 'lift'; e.liftAt = now; fx.push({ f: e.f, kind: 'door', t0: now, dur: 1400 });
      return;
    }
    if (e.act === 'chat' && e.partner && e.partner.mode === 'stay' && e.partner.act === 'chat') {
      const boss = e.id === 'orchestrator' || e.partner.id === 'orchestrator';
      const lead = e.id === 'orchestrator' ? e : e.partner.id === 'orchestrator' ? e.partner : e;
      const other = lead === e ? e.partner : e;
      const pair = (boss ? BOSS : PAIRS)[Math.floor(Math.random() * (boss ? BOSS.length : PAIRS.length))];
      e.face = e.partner.x > e.x ? 1 : -1; e.partner.face = -e.face;
      speak(lead, say(kindOf(lead), pair[0]), now);
      setTimeout(() => speak(other, say(kindOf(other), pair[1]), performance.now()), 1600);
      e.partner.until = e.until;
      return;
    }
    if (e.act === 'pc' && e.pcDesk) { e.mode = 'sit'; e.desk = e.pcDesk; e.browsing = true; e.useUntil = now + USE.pc.ms; e.until = e.useUntil; if (Math.random() < .5) line(e, USE.pc.line, now); return; }
    const use = USE[e.act];
    if (use) {
      e.mode = 'use'; e.useUntil = now + use.ms * (e.tired === 2 ? 1.6 : 1);
      e.f.busy[e.act] = Math.max(e.f.busy[e.act] || 0, e.useUntil);
      const at = { x: e.x + (e.face || 1) * 14, y: e.y };
      if (e.act === 'print') fx.push({ f: e.f, kind: 'paper', t0: now + 600, dur: use.ms - 600, ...at });
      if (e.act === 'vend') fx.push({ f: e.f, kind: 'can', t0: now + use.ms - 500, dur: 900, ...at });
      if (e.act === 'mail') { e.item = null; fx.push({ f: e.f, kind: 'envelope', t0: now + 300, dur: 1600, ...at }); }
      if (e.act === 'pingpong' && e.partner) e.f.busy.pingpong = e.useUntil;
      if (Math.random() < (use.look ? .5 : 1)) line(e, roomOf(e.f).words?.[e.act] || use.line, now);
      return;
    }
    if (e.act === 'meet' && e.item === 'paper') { e.item = null; line(e, SOLO.meet, now); return; }
    if (Math.random() < .3) {
      let pool = roomOf(e.f).words?.[e.act] || (e.act === 'dept' ? SOLO.dept[e.f.key] : SOLO[e.act]);
      if (typeof pool === 'function') pool = pool();
      line(e, pool, now);
    }
  }
  function finishUse(e, now) {
    const use = USE[e.act];
    e.mode = 'stay'; e.until = 0;
    if (e.act === 'pingpong' && e.partner) { const p = e.partner; e.partner = null; if (p.partner === e) p.partner = null; }
    if (use?.item) e.item = use.item;
    if (e.act === 'print' && e.item === 'paper' && Math.random() < .4) { e.errand = 'deliver'; choose(e, now, ['deliver']); return; }
    choose(e, now, use?.then);
  }
  // Out of the lift on the destination floor (or home again).
  function exitLift(e, now) {
    const dest = floorBy(e.dest) || e.f;
    const goingHome = e.dest === e.home;
    e.f = dest; e.x = e.tx = EV.x; e.y = e.ty = EV.y; e.alpha = 1;
    fx.push({ f: dest, kind: 'door', t0: now, dur: 1200 });
    e.visiting = !goingHome; e.visitUntil = now + 16000 + Math.random() * 14000; e.mode = 'stay'; e.until = 0;
    if (goingHome) { line(e, ['ただいま{e}'], now); choose(e, now, ['coffee', 'sofa', 'pc', 'wander']); return; }
    if (e.id === 'orchestrator') line(e, ['みんな、調子どう{e}？', '見回りに来た{e}'], now);
    else if (e.errand === 'deliver' && e.item === 'paper') line(e, ['資料持ってきた{e}'], now);
    else line(e, ['おじゃまします{e}'], now);
    // first thing on arrival: talk to someone (the boss), hand over a paper, or have a coffee
    const pick = e.id === 'orchestrator' ? ['chat'] : e.item === 'paper' ? ['chat', 'meet'] : ['chat', 'coffee', 'wander'];
    setTimeout(() => { if (e.mode === 'stay') { if (e.item === 'paper' && Math.random() < .7) e.item = null; choose(e, performance.now(), pick); } }, 1400);
  }
  function maybeMeeting(f, now) {
    if (f.meeting) {
      if (now > f.meeting.until) { f.meeting.who.forEach((e) => { e.meeting = false; e.until = 0; }); f.meeting = null; }
      else if (Math.random() < .08) {
        const [lead, ...rest] = f.meeting.who;
        const someone = Math.random() < .5 ? lead : rest[Math.floor(Math.random() * rest.length)];
        if (someone && someone.mode === 'stay') line(someone, someone === lead ? MEETING.open : MEETING.react, now);
      }
      return;
    }
    const meet = spotsOf(f, 'meet'), present = spotsOf(f, 'present');
    if (Math.random() > .012 || !meet.length) return;
    const cand = [...ents.values()].filter((e) => e.f === f && free(e) && !e.partner && e.tired < 2);
    if (cand.length < 3) return;
    const lead = present.length ? 1 : 0;
    const who = cand.sort((a, b) => (b.id === 'orchestrator') - (a.id === 'orchestrator') || Math.random() - .5).slice(0, Math.min(lead + meet.length, cand.length));
    f.meeting = { who, until: now + 22000 };
    who.forEach((e, i) => { e.meeting = true; if (lead && i === 0) goTo(e, 'present', present[0]); else goTo(e, 'meet', meet[(i - lead) % meet.length]); });
  }
  function step(now) {
    for (const e of ents.values()) {
      if (!e.f) continue;
      if (e.mode === 'walk') {
        const dx = e.tx - e.x, dy = e.ty - e.y, dist = Math.hypot(dx, dy), v = speed(e);
        if (dist < v) { e.x = e.tx; e.y = e.ty; arrive(e, now); }
        else { e.x += dx / dist * v; e.y += dy / dist * v; if (Math.abs(dx) > 1) e.face = dx > 0 ? 1 : -1; }
      } else if (e.mode === 'use' && now > e.useUntil) finishUse(e, now);
      else if (e.mode === 'sit' && e.browsing && now > e.useUntil) { e.browsing = false; e.desk = null; e.mode = 'stay'; e.y += 4; finishUse(Object.assign(e, { act: 'pc' }), now); }
      else if (e.mode === 'lift') {
        const k = (now - e.liftAt) / 700; e.alpha = Math.max(0, 1 - k);
        if (now - e.liftAt > 1600) exitLift(e, now);
      } else if (e.mode === 'stay' && now > e.until && !e.meeting) {
        if (e.partner) { const p = e.partner; e.partner = null; if (p.partner === e) p.partner = null; }
        choose(e, now);
      }
    }
    for (let i = fx.length - 1; i >= 0; i--) if (now > fx[i].t0 + fx[i].dur) fx.splice(i, 1);
  }

  // ── speech ──────────────────────────────────────────────────────────────────
  const bubbles = new Map();                 // id → { text, kind, until }
  function speak(e, text, now, kind = 'talk') { bubbles.set(e.id, { text, kind, until: now + 3800 }); }
  function workTalk(now, visible) {
    const cands = visible.filter((e) => (e.mode === 'sit' || e.mode === 'lie' || e.tired) && !bubbles.has(e.id));
    if (!cands.length || bubbles.size >= 3) return;
    const e = cands[Math.floor(Math.random() * cands.length)];
    const d = DETAIL_DATA[e.id] || {};
    const title = d.task && typeof taskTitle === 'function' ? short(taskTitle(d.task)) : 'お仕事';
    if (e.mode === 'lie') return line(e, ['ぐるぐる{e}…', 'もうだめ{e}…', '助けて{e}…'], now, 'error');
    if (e.tired && Math.random() < .6) return line(e, TIRED[e.tired], now);
    if (e.browsing) return;
    if (e.id === 'financial-agent') {
      const cost = (COST_BY_DAY || {})[new Date().toISOString().slice(0, 10)] || 0;
      return speak(e, say(kindOf(e), `今日は$${cost.toFixed(2)}{e}`), now);
    }
    if (e.mode === 'sit') line(e, ['{t}、作業中{e}', 'あと少し{e}', '集中してる{e}'].map((s) => s.replace('{t}', title)), now);
  }

  // ── painting ────────────────────────────────────────────────────────────────
  let tick = 0;
  // Desk styles: each room furnishes its work places differently.
  const DESK = {
    exec: { top: '#8a5a36', edge: '#6b4428', chair: '#5b3a2a', w: 140 }, wood: { top: '#a9825a', edge: '#8a6440', chair: '#5b3a2a' },
    news: { top: '#d5d9e2', edge: '#aeb5c3', chair: '#2f5d8a' }, reading: { top: '#7a5a3c', edge: '#5b4029', chair: '#3f6e5a', book: 1 },
    standing: { top: '#e8ecf3', edge: '#9aa3b5', chair: '#3d4656', screens: 2 }, grey: { top: '#d5d9e2', edge: '#aeb5c3', chair: '#7c4dbd' },
    booth: { top: '#c9a77c', edge: '#a9825a', chair: '#7a4520', walls: 1, laptop: 1 }, drafting: { top: '#f5f0e1', edge: '#c9a06a', chair: '#d0567f', sketch: 1 },
  };
  function paintRoom(f, t, now) {
    const night = isNight(), y = f.y, room = roomOf(f);
    const busy = (k) => (f.busy[k] || 0) > now;
    // wall: shared frame (lights, sign, lift); everything between is the room's own
    R(0, y, W, WALL, f.wall); R(0, y, W, 4, '#9aa3b5'); R(0, y + WALL - 6, W, 6, '#aeb5c3');
    for (const lx of [40, 160, 280]) R(lx, y + 4, 70, 3, night ? '#fff3c4' : '#fffbe6');
    R(8, y + 12, 64, 16, f.sign); TXT(`${f.no} ${f.name}`, 40, y + 20, '#fff', 9, 800);
    room.floor(y);
    room.wall(y, t, night);
    const door = fx.find((p) => p.f === f && p.kind === 'door' && now < p.t0 + p.dur);
    const open = door ? Math.sin(Math.min(1, (now - door.t0) / door.dur) * Math.PI) * 9 : 0;
    R(354, y + 8, 30, 40, '#7d8597'); R(356, y + 12, 26, 36, '#2b3140');
    R(356, y + 12, 13 - open, 36, '#b8bfcc'); R(369 + open, y + 12, 13 - open, 36, '#b8bfcc');
    R(363, y + 2, 12, 6, '#2b3140'); TXT(door ? '▲' : f.no, 369, y + 5, door ? '#ffd400' : '#9fe0ff', 6, 800);
    room.furniture(y, t, now, busy);
    // ping-pong: the ball crosses the net while both players are at the table
    if (busy('pingpong')) { const [a, b] = spotsOf(f, 'pingpong'); const players = [...ents.values()].filter((e) => e.f === f && e.act === 'pingpong' && e.mode === 'use'); if (players.length === 2) { const k = Math.abs(((t % 12) / 6) - 1); R(a.x + 14 + (b.x - a.x - 28) * k, y + a.y - 22 - Math.sin(k * Math.PI) * 10, 3, 3, '#fff'); } }
    // desks: a sitter (working, or someone browsing) is drawn between chair and desk top
    for (const d of f.desks) {
      const st = DESK[d.style] || DESK.grey, dw = st.w || 80;
      if (st.walls) { R(d.x - 6, y + d.y - 34, 4, 60, '#8e6b4a'); R(d.x + dw + 2, y + d.y - 34, 4, 60, '#8e6b4a'); R(d.x - 6, y + d.y - 34, dw + 12, 3, '#8e6b4a'); }
      R(d.x + 24, y + d.y - 22, 28, 22, st.chair);
      const sitter = [...ents.values()].find((e) => e.desk === d && e.f === f && e.mode === 'sit');
      if (sitter) {
        const typing = (sitter.st === 'work' || sitter.browsing) && t % 2 === 0 && sitter.tired < 2;
        const nod = sitter.tired === 2 && (t % 16) < 5 ? 3 : 0;          // dozing off at the desk
        g.globalAlpha = sitter.alpha ?? 1;
        g.drawImage(sprite(sitter.id, sitter.tired === 2 ? 'tired' : typing ? 'type' : 'sit'), d.x + 22, y + d.y - 30 + (typing ? 1 : 0) + nod, 32, 40);
        g.globalAlpha = 1;
        if (sitter.tired) sweat(d.x + 50, y + d.y - 26, t);
      }
      R(d.x, y + d.y, dw, 22, st.top); R(d.x, y + d.y + 22, dw, 4, st.edge);
      const on = sitter && (sitter.st === 'work' || sitter.browsing);
      const sx = d.x + dw - 30, sy = y + d.y - 8;
      if (st.book) { R(sx, sy + 6, 24, 10, '#fbfbf8'); R(sx + 11, sy + 6, 2, 10, '#c9a06a'); if (on) for (let k = 0; k < 3; k++) R(sx + 2, sy + 8 + k * 3, 8, 1, '#9aa3b5'); lamp(d.x + 8, y + d.y - 8, on || night); }
      else if (st.sketch) { R(sx - 4, sy - 4, 30, 20, '#ffffff'); R(sx - 4, sy - 4, 30, 2, '#c9a06a'); if (on) for (let k = 0; k < 3; k++) R(sx + (k * 7 + t) % 20, sy + 2 + k * 4, 6, 3, ['#e53935', '#2f80ed', '#f2c94c'][k]); R(d.x + 8, y + d.y + 6, 3, 10, '#8a5a36'); }
      else {
        const screens = st.laptop ? [[sx + 4, sy + 4, 18, 12]] : st.screens ? [[sx - 26, sy - 4, 24, 16], [sx, sy - 4, 26, 16]] : [[sx, sy, 26, 16]];
        for (const [mx, my, mw, mh] of screens) {
          R(mx, my, mw, mh, '#3a4150');
          if (sitter?.browsing) { R(mx + 2, my + 2, mw - 4, mh - 4, '#ffffff'); R(mx + 2, my + 2, mw - 4, 3, '#e57373'); R(mx + 4, my + 7 + (t % 4), mw - 10, 1, '#9aa3b5'); }
          else { R(mx + 2, my + 2, mw - 4, mh - 4, on ? (st.screens ? '#16202e' : t % 4 < 2 ? '#5ab0ff' : '#6cc0ff') : '#4a5363'); if (on) for (let k = 0; k < 3; k++) R(mx + 4, my + 4 + k * 3, 4 + ((t + k * 5) % (mw - 8)), 1, st.screens ? '#4be37a' : 'rgba(255,255,255,.75)'); }
        }
        R(d.x + 8, y + d.y + 8, 18, 5, '#f0f2f6');
        if (d.style === 'news') for (let k = 0; k < 3; k++) R(d.x + 4, y + d.y + 2 - k * 2, 16, 2, '#fbfbf8');
      }
      R(d.x + 34, y + d.y + 6, 5, 6, '#e85d5d');
      if (d.big) { R(d.x + 60, y + d.y + 4, 14, 10, '#fff'); R(d.x + 82, y + d.y + 6, 10, 8, '#ffcf33'); }
      if (sitter) nameTag(sitter, d.x + 38, y + d.y + 36);
    }
    if (f.meeting) { const m = spotsOf(f, 'meet'); TXT('会議中', m.reduce((a, q) => a + q.x, 0) / m.length, y + Math.max(...m.map((q) => q.y)) + 20, '#8a5a36', 8, 800); }
  }
  function sweat(x, y, t) { const k = t % 8; if (k < 6) { R(x, y + k, 2, 3, '#7fc8ff'); R(x + 1, y + k - 1, 1, 1, '#bfe6ff'); } }
  function paintFx(f, now) {
    for (const p of fx) {
      if (p.f !== f || now < p.t0) continue;
      const k = Math.max(0, Math.min(1, (now - p.t0) / p.dur)), y = f.y;
      if (p.kind === 'paper') { R(p.x - 9, y + p.y - 30 - 10 * k, 16, 4 + 8 * k, '#ffffff'); R(p.x - 6, y + p.y - 27 - 10 * k, 9, 1, '#9aa3b5'); }
      if (p.kind === 'envelope') { g.globalAlpha = 1 - k; R(p.x - 6 + k * 30, y + p.y - 24 - 30 * k, 12, 8, '#fff'); R(p.x - 6 + k * 30, y + p.y - 24 - 30 * k, 12, 2, '#e57373'); g.globalAlpha = 1; }
      if (p.kind === 'can') R(p.x - 3, y + p.y - 14 + Math.min(4, k * 8), 6, 8, ['#e53935', '#43a047', '#fdd835'][Math.floor(p.t0) % 3]);
    }
  }
  function nameTag(e, cx, cy) {
    const name = REGISTRY.find((r) => r.id === e.id)?.name || e.id;
    g.font = '700 8px "Noto Sans JP",sans-serif'; const tw = g.measureText(name).width;
    R(cx - tw / 2 - 3, cy - 6, tw + 6, 11, e.st === 'error' ? '#ffe1e1' : e.visiting ? '#fff3c4' : 'rgba(255,255,255,.85)');
    TXT(name, cx, cy, e.st === 'error' ? '#e23b3b' : '#2b3140', 8, 700);
  }
  const ITEM = {
    mug: (x, y) => { R(x, y, 4, 4, '#ffffff'); R(x + 4, y + 1, 1, 2, '#ffffff'); R(x + 1, y, 2, 1, '#6b3a1a'); },
    can: (x, y) => R(x, y - 1, 3, 5, '#e53935'),
    paper: (x, y) => { R(x - 1, y - 3, 6, 7, '#ffffff'); R(x, y - 1, 4, 1, '#9aa3b5'); },
    book: (x, y) => { R(x - 1, y - 2, 6, 7, '#4f81bd'); R(x, y - 1, 1, 5, '#fff'); },
    letter: (x, y) => { R(x - 1, y, 6, 4, '#ffffff'); R(x - 1, y, 6, 1, '#e57373'); },
  };
  function paintWalker(e, t, now) {
    const y0 = e.f.y;
    g.globalAlpha = e.alpha ?? 1;
    g.fillStyle = 'rgba(0,0,0,.16)'; g.beginPath(); g.ellipse(e.x, y0 + e.y, 11, 4, 0, 0, Math.PI * 2); g.fill();
    if (e.mode === 'lie') {
      g.save(); g.translate(e.x, y0 + e.y - 8); g.rotate(-Math.PI / 2);
      g.drawImage(sprite(e.id, 'ko'), -16, -20, 32, 40); g.restore();
      for (let k = 0; k < 3; k++) { const a = t / 3 + k * 2.1; R(e.x - 22 + Math.cos(a) * 9, y0 + e.y - 22 + Math.sin(a) * 3, 3, 3, '#ffd400'); }
      nameTag(e, e.x, y0 + e.y + 10); g.globalAlpha = 1;
      return;
    }
    const seated = (e.mode === 'stay' || e.mode === 'use') && e.seat;
    const using = e.mode === 'use' && !USE[e.act]?.look && !seated;
    const tiredPose = e.tired === 2;
    const pose = e.mode === 'walk' ? (t % 2 ? 'walk1' : 'walk2')
      : using ? (tiredPose ? 'tiredReach' : 'reach')
      : tiredPose ? 'tired' : ((t + (e.x | 0)) % 31 === 0 ? 'blink' : 'stand');
    const bob = e.mode === 'walk' ? (t % 2) : using && t % 4 < 2 ? 1 : 0;
    const slump = tiredPose && e.mode !== 'walk' ? 2 : 0;
    g.save();
    if (e.face < 0) { g.translate(e.x * 2, 0); g.scale(-1, 1); }
    if (seated) g.drawImage(sprite(e.id, pose), 0, 0, 16, 15, e.x - 16, y0 + e.y - 34 + slump, 32, 30);
    else g.drawImage(sprite(e.id, pose), e.x - 16, y0 + e.y - 40 - bob + slump, 32, 40);
    if (e.item && ITEM[e.item] && !using) ITEM[e.item](e.x + 9, y0 + e.y - 16 + (seated ? 4 : 0));
    g.restore();
    if (e.tired) sweat(e.x + 10 * (e.face || 1), y0 + e.y - 40, t);
    if (e.mode === 'use' && e.act === 'charge') { R(e.x - 2, y0 + e.y - 44, 4, 6, t % 2 ? '#4be37a' : '#ffd400'); }
    if (seated && e.act === 'sofa' && (jstHour() < 6 || e.tired === 2)) TXT('z', e.x + 12, y0 + e.y - 38 - (t % 6), '#7a8396', 9, 800);
    nameTag(e, e.x, y0 + e.y + 8);
    g.globalAlpha = 1;
  }
  function paintBubbles(now, vis) {
    for (const [id, b] of bubbles) {
      if (b.until < now) { bubbles.delete(id); continue; }
      const e = ents.get(id); if (!e?.f || !vis.includes(e.f) || e.mode === 'lift') continue;
      let cx, cy;
      if (e.mode === 'sit' && e.desk) { cx = e.desk.x + 38; cy = e.f.y + e.desk.y - 32; }
      else if (e.mode === 'lie') { cx = e.x; cy = e.f.y + e.y - 22; }
      else { cx = e.x; cy = e.f.y + e.y - (e.seat && (e.mode === 'stay' || e.mode === 'use') ? 36 : 42); }
      g.font = '700 9px "Noto Sans JP",sans-serif'; const w = g.measureText(b.text).width + 12;
      const bx = Math.min(Math.max(cx, w / 2 + 4), W - w / 2 - 4);
      const [bg, fg] = b.kind === 'error' ? ['#ffe1e1', '#e23b3b'] : ['#ffffff', '#2b3140'];
      R(bx - w / 2, cy - 15, w, 15, '#2b3140'); R(bx - w / 2 + 1, cy - 14, w - 2, 13, bg); R(cx - 2, cy, 4, 3, '#2b3140');
      TXT(b.text, bx, cy - 7, fg, 9, 700);
    }
  }

  // ── mount, loop, input ──────────────────────────────────────────────────────
  let root, box, cv, raf = 0, last = 0, visibleBox = true, pendingFloor = null;
  function mount() {
    const page = document.getElementById('page-overview');
    if (!page || document.getElementById('hachi-office')) return;
    root = document.createElement('section');
    root.id = 'hachi-office'; root.className = 'office';
    root.innerHTML = `<div class="office-hud"><b>株式会社ハチ</b><span class="office-time"></span><span class="office-counts"></span></div>
      <div class="office-chips" role="tablist" aria-label="階"></div>
      <div class="office-box"><canvas aria-label="エージェントのオフィス。タップするとそのエージェントの詳細を開きます"></canvas></div>`;
    page.insertBefore(root, page.firstChild);
    box = root.querySelector('.office-box'); cv = root.querySelector('canvas');
    cv.addEventListener('click', onTap);
    box.addEventListener('scroll', () => syncChips(), { passive: true });
    // The data usually lands while another page is showing, when the box cannot scroll — so the
    // jump to the interesting floor waits until the office is actually on screen.
    new IntersectionObserver(([e]) => {
      visibleBox = e.isIntersecting;
      if (!visibleBox) return;
      if (pendingFloor != null) { goFloor(pendingFloor, false); pendingFloor = null; }
      loop();
    }, { threshold: 0.05 }).observe(box);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) loop(); });
  }
  function render() {
    if (typeof REGISTRY === 'undefined' || !REGISTRY.length) return;
    mount(); if (!root) return;
    layout = buildLayout();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = layout.height * dpr;
    cv.style.width = '100%'; cv.style.aspectRatio = `${W} / ${layout.height}`;
    g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = false;
    const n = { work: 0, done: 0, error: 0, idle: 0 }; REGISTRY.forEach((r) => n[stateOf(r.id)]++);
    root.querySelector('.office-counts').innerHTML =
      `<span class="oc work">作業中 ${n.work}</span><span class="oc error">要対応 ${n.error}</span><span class="oc idle">休憩中 ${n.idle + n.done}</span>`;
    root.querySelector('.office-time').textContent = new Date().toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });
    const chips = root.querySelector('.office-chips');
    chips.innerHTML = layout.floors.map((f, i) => {
      const bad = f.ids.some((id) => stateOf(id) === 'error');
      return `<button type="button" data-i="${i}" class="office-chip${bad ? ' bad' : ''}">${f.name}</button>`;
    }).join('');
    chips.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => goFloor(+b.dataset.i)));
    const err = layout.floors.findIndex((f) => f.ids.some((id) => stateOf(id) === 'error'));
    const work = layout.floors.findIndex((f) => f.ids.some((id) => stateOf(id) === 'work'));
    if (pendingFloor == null && !render.done) pendingFloor = err >= 0 ? err : work >= 0 ? work : 0;
    render.done = true;
    requestAnimationFrame(() => {
      if (pendingFloor != null && box.clientHeight) { goFloor(pendingFloor, false); pendingFloor = null; }
      draw(performance.now()); loop();
    });
  }
  function goFloor(i, smooth = true) {
    const f = layout.floors[i]; if (!f) return;
    box.scrollTo({ top: f.y * (box.clientWidth / W), behavior: smooth ? 'smooth' : 'instant' });
  }
  function syncChips() {
    if (!layout) return;
    const top = box.scrollTop / (box.clientWidth / W) + 40;
    const i = layout.floors.findIndex((f) => top >= f.y && top < f.y + FH + 6);
    root.querySelectorAll('.office-chip').forEach((b) => b.classList.toggle('on', +b.dataset.i === i));
  }
  function visibleFloors() {
    const k = box.clientWidth / W, top = box.scrollTop / k, bottom = top + box.clientHeight / k;
    return layout.floors.filter((f) => f.y + FH > top && f.y < bottom);
  }
  function draw(now) {
    if (!layout) return;
    const vis = visibleFloors();
    for (const f of vis) {
      g.clearRect(0, f.y, W, FH + 6);
      paintRoom(f, tick, now);
      paintFx(f, now);
      [...ents.values()].filter((e) => e.f === f && e.mode !== 'sit').sort((a, b) => a.y - b.y).forEach((e) => paintWalker(e, tick, now));
    }
    paintBubbles(now, vis);
  }
  function loop() {
    cancelAnimationFrame(raf);
    const frame = (ts) => {
      if (!root || root.offsetParent === null || !visibleBox || document.hidden) { raf = 0; return; }
      if (ts - last > 110) {           // ~9fps: smooth enough for pixel walking, light on the battery
        last = ts; tick++;
        step(ts);
        for (const f of visibleFloors()) maybeMeeting(f, ts);
        if (tick % 25 === 0) { const vis = visibleFloors(); workTalk(ts, [...ents.values()].filter((e) => vis.includes(e.f))); }
        draw(ts); if (tick % 5 === 0) syncChips();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }
  function onTap(ev) {
    const rect = cv.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * (W / rect.width), y = (ev.clientY - rect.top) * (W / rect.width);
    let best = null, bd = 1e9;
    for (const e of ents.values()) {
      if (!e.f) continue;
      if (e.mode === 'lift') continue;
      const cx = e.mode === 'sit' && e.desk ? e.desk.x + 36 : e.x;
      const cy = e.mode === 'sit' && e.desk ? e.f.y + e.desk.y - 10 : e.f.y + e.y - (e.mode === 'lie' ? 8 : 20);
      const dd = Math.hypot(cx - x, cy - y);
      if (dd < 30 && dd < bd) { bd = dd; best = e; }
    }
    if (!best) return;
    speak(best, say((CAST[best.id] || ['human'])[0], best.mode === 'lie' ? 'う、うう…{e}' : 'はい、なんでしょう{e}？'), performance.now());
    draw(performance.now());
    if (typeof openDetail === 'function') setTimeout(() => openDetail(best.id), 300);
  }
  window.HachiOffice = { render };
})();
