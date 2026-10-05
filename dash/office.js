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
 * ~6fps and only while the office is on screen and the tab is visible.
 * Reads app.js globals: REGISTRY, DETAIL_DATA, COST_BY_DAY, openDetail, taskTitle.
 */
(() => {
  'use strict';
  const W = 390;                    // logical width; the canvas is scaled to the container
  const PX = 2;                     // sprite pixel size (16×20 grid → 32×40)

  // ── who sits where ──────────────────────────────────────────────────────────
  const FLOORS = [
    { key: 'exec',  no: '7F', name: '社長室', wall: '#ece4d6', sign: '#8a6b3a', carpet: ['#cbb89a', '#c4b090'], deco: 'exec',
      ids: ['orchestrator', 'advisor', 'visionary', 'efficiency-audit', 'channel-audit'] },
    { key: 'intel', no: '6F', name: '情報部', wall: '#e3e9f2', sign: '#3b6fb6', carpet: ['#c3c9d6', '#bac1cf'], deco: 'intel',
      ids: ['scout-agent', 'news-agent', 'mail-agent', 'log-monitor-agent', 'financial-agent', 'location-agent', 'chat-agent', 'summary-agent', 'choice-interpreter'] },
    { key: 'lib',   no: '5F', name: '書庫', wall: '#e4f1e8', sign: '#2e7d5b', carpet: ['#c9d8cd', '#c0d0c4'], deco: 'lib',
      ids: ['context-agent', 'knowledge-agent', 'lint-agent', 'db-audit-agent'] },
    { key: 'dev',   no: '4F', name: '開発部', wall: '#e6e8ee', sign: '#e0702c', carpet: ['#b9bfcc', '#b1b8c6'], deco: 'dev',
      ids: ['dev-agent', 'review-agent', 'jp-censor-agent', 'system-audit-agent', 'design-critic'] },
    { key: 'plan',  no: '3F', name: '企画室', wall: '#f1e9f7', sign: '#7c4dbd', carpet: ['#d3cbe0', '#cbc2da'], deco: 'plan',
      ids: ['article-ideas', 'article-angle', 'topic-scout', 'note-study', 'craft-study', 'category-prompt', 'reader-questions'] },
    { key: 'write', no: '2F', name: '執筆室', wall: '#f4ede4', sign: '#9a5b2e', carpet: ['#d6cbbb', '#cec2b1'], deco: 'write',
      ids: ['article-writer', 'drafting-agent', 'structure-agent', 'editorial-agent', 'reflection-writer', 'answer-researcher', 'slide-agent'] },
    { key: 'art',   no: '1F', name: '美術室', wall: '#f7ecee', sign: '#c2185b', carpet: ['#dccbd0', '#d4c1c7'], deco: 'art',
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
    const s = base.replace('{e}', e);
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
    if (pose === 'mug') { r(11, 12, 3, 3, '#ffffff'); p(14, 13, '#ffffff'); p(12, 11, 'rgba(255,255,255,.5)'); }
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
    if (prop && PROP[prop] && pose !== 'mug') PROP[prop]();
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


  // ── the floor: few shared desks, a break corner, things to walk to ─────────
  // Operator, 2026-10-05: one desk per agent made a boring office. Desks are shared (2–4, as many
  // as are working), and everyone not working moves about — coffee, sofa, window, a chat.
  const FH = 270, WALL = 54;
  const DESKS = [{ x: 18, y: 104 }, { x: 108, y: 104 }, { x: 18, y: 196 }, { x: 108, y: 196 }];
  const SPOTS = {                     // feet positions, relative to the floor's top
    coffee: [{ x: 326, y: 104 }], water: [{ x: 358, y: 106 }], window: [{ x: 110, y: 74 }, { x: 172, y: 74 }],
    sofa: [{ x: 252, y: 214 }, { x: 288, y: 214 }, { x: 324, y: 214 }], plant: [{ x: 360, y: 246 }],
    table: [{ x: 228, y: 146 }, { x: 292, y: 146 }, { x: 260, y: 166 }], dept: [{ x: 238, y: 78 }],
  };
  const ACT = ['coffee', 'water', 'window', 'sofa', 'sofa', 'plant', 'table', 'dept', 'chat', 'chat', 'wander', 'wander'];
  const SOLO = {
    coffee: ['コーヒーおいしい{e}', 'もう一杯いく{e}'], water: ['水分補給{e}'], sofa: ['ひと休み{e}', 'ふかふか{e}'],
    window: () => isNight() ? ['夜景きれい{e}', '星が見える{e}'] : ['いい天気{e}', '外は暑そう{e}'], plant: ['水やり{e}', '大きくなった{e}'],
    table: ['資料まとめる{e}', '会議の準備{e}'], wander: ['ちょっと散歩{e}', 'のびー{e}'],
    dept: { exec: ['今月の数字を見る{e}'], intel: ['ニュースを見張る{e}'], lib: ['本を並べ直す{e}'], dev: ['サーバー元気{e}'], plan: ['付箋を貼る{e}'], write: ['構成を考える{e}'], art: ['色を選ぶ{e}'] },
  };
  const PAIRS = [['コーヒー飲む{e}？', 'いただく{e}！'], ['今日の記事どう{e}？', 'いい感じ{e}'], ['週末なにする{e}？', '寝る{e}'],
    ['あの件どうなった{e}？', 'もう少し{e}'], ['お昼なに食べた{e}？', 'カレー{e}'], ['最近忙しい{e}？', 'ぼちぼち{e}']];

  let layout = null;                         // { floors:[{...,y}], height }
  const ents = new Map();                    // id → entity (survives data refreshes)
  function buildLayout() {
    let y = 0;
    const floors = people().map((f) => { const o = { ...f, y }; y += FH + 6; return o; });
    for (const f of floors) {
      const working = f.ids.filter((id) => stateOf(id) === 'work');
      f.desks = DESKS.slice(0, Math.min(4, Math.max(2, working.length)));
      if (f.key === 'exec') f.desks = [{ x: 140, y: 112, big: true }];
      let di = 0;
      f.ids.forEach((id, i) => {
        const st = stateOf(id);
        let e = ents.get(id);
        if (!e || e.floor !== f.key) {
          const p = randomPoint(f, null);
          e = { id, floor: f.key, x: p.x, y: p.y, tx: p.x, ty: p.y, mode: 'stay', act: 'wander', until: 0, face: 1, said: '' };
          ents.set(id, e);
        }
        e.f = f; e.st = st;
        if (st === 'work' || (f.key === 'exec' && id === 'orchestrator' && st !== 'error' && st !== 'idle')) {
          const d = f.desks[Math.min(di++, f.desks.length - 1)];
          e.desk = d; e.mode = 'sit';
        } else if (st === 'error') {
          e.desk = null; e.mode = 'lie';
          const n = f.ids.filter((x) => stateOf(x) === 'error').indexOf(id);
          e.x = 214 + n * 50; e.y = 250; e.tx = e.x; e.ty = e.y;
        } else {
          e.desk = null; if (e.mode === 'sit' || e.mode === 'lie') { e.mode = 'stay'; e.until = 0; }
        }
      });
    }
    return { floors, height: y };
  }
  // Anywhere on the open floor: not on a desk, not on the sofa, and not where someone already stands.
  const onFurniture = (f, x, y) => (f.desks || []).some((d) => x > d.x - 6 && x < d.x + (d.big ? 116 : 84) && y > d.y - 4 && y < d.y + 34)
    || (x > 226 && x < 348 && y > 206 && y < 242) || (x > 170 && x < 210 && y > 200);
  const taken = (x, y, self) => [...ents.values()].some((o) => o !== self && o.f && Math.hypot(o.tx - x, o.ty - y) < 22);
  function randomPoint(f, self) {
    for (let k = 0; k < 30; k++) {
      const x = 24 + Math.random() * 330, y = 92 + Math.random() * 156;
      if (!onFurniture(f, x, y) && !taken(x, y, self)) return { x, y };
    }
    return { x: 40 + Math.random() * 300, y: 240 };
  }

  // ── behaviour ───────────────────────────────────────────────────────────────
  const free = (e) => e.mode !== 'sit' && e.mode !== 'lie';
  function choose(e, now) {
    const f = e.f; let act = ACT[Math.floor(Math.random() * ACT.length)];
    if (act === 'chat') {
      const mate = [...ents.values()].find((o) => o !== e && o.f === f && free(o) && o.mode === 'stay' && !o.partner);
      if (mate) {
        e.partner = mate; mate.partner = e;
        const mx = Math.min(330, Math.max(40, mate.x)), my = Math.min(246, Math.max(96, mate.y));
        mate.tx = mx; mate.ty = my; mate.mode = 'walk'; mate.act = 'chat';
        e.tx = mx + (mx > 200 ? -26 : 26); e.ty = my; e.mode = 'walk'; e.act = 'chat';
        return;
      }
      act = 'wander';
    }
    const pool = (SPOTS[act] || []).filter((q) => !taken(q.x, q.y, e));
    const p = pool.length ? pool[Math.floor(Math.random() * pool.length)] : randomPoint(f, e);
    e.act = pool.length ? act : 'wander'; e.tx = p.x; e.ty = p.y; e.mode = 'walk';
  }
  function arrive(e, now) {
    e.mode = 'stay'; e.until = now + 5000 + Math.random() * 7000;
    const kind = (CAST[e.id] || ['human'])[0];
    if (e.act === 'chat' && e.partner && e.partner.mode === 'stay' && e.partner.act === 'chat') {
      const pair = PAIRS[Math.floor(Math.random() * PAIRS.length)];
      e.face = e.partner.x > e.x ? 1 : -1; e.partner.face = -e.face;
      speak(e, say(kind, pair[0]), now);
      const pk = (CAST[e.partner.id] || ['human'])[0];
      const other = e.partner; setTimeout(() => speak(other, say(pk, pair[1]), performance.now()), 1600);
      e.partner.until = e.until;
      return;
    }
    if (Math.random() < .35) {
      let pool = e.act === 'dept' ? SOLO.dept[e.f.key] : SOLO[e.act];
      if (typeof pool === 'function') pool = pool();
      if (pool) speak(e, say(kind, pool[Math.floor(Math.random() * pool.length)]), now);
    }
  }
  function step(now) {
    for (const e of ents.values()) {
      if (!e.f) continue;
      if (e.mode === 'walk') {
        const dx = e.tx - e.x, dy = e.ty - e.y, dist = Math.hypot(dx, dy);
        if (dist < 2.5) { e.x = e.tx; e.y = e.ty; arrive(e, now); }
        else { e.x += dx / dist * 2.5; e.y += dy / dist * 2.5; if (Math.abs(dx) > 1) e.face = dx > 0 ? 1 : -1; }
      } else if (e.mode === 'stay' && now > e.until) {
        if (e.partner) { const p = e.partner; e.partner = null; if (p.partner === e) p.partner = null; }
        choose(e, now);
      }
    }
  }

  // ── speech ──────────────────────────────────────────────────────────────────
  const bubbles = new Map();                 // id → { text, kind, until }
  function speak(e, text, now, kind = 'talk') { bubbles.set(e.id, { text, kind, until: now + 3800 }); }
  function workTalk(now, visible) {
    const sitters = visible.filter((e) => (e.mode === 'sit' || e.mode === 'lie') && !bubbles.has(e.id));
    if (!sitters.length || bubbles.size >= 3) return;
    const e = sitters[Math.floor(Math.random() * sitters.length)];
    const kind = (CAST[e.id] || ['human'])[0];
    const d = DETAIL_DATA[e.id] || {};
    const title = d.task && typeof taskTitle === 'function' ? short(taskTitle(d.task)) : 'お仕事';
    if (e.mode === 'lie') return speak(e, say(kind, ['ぐるぐる{e}…', 'もうだめ{e}…', '助けて{e}…'][Math.floor(Math.random() * 3)]), now, 'error');
    if (e.id === 'financial-agent') {
      const cost = (COST_BY_DAY || {})[new Date().toISOString().slice(0, 10)] || 0;
      return speak(e, say(kind, `今日は$${cost.toFixed(2)}{e}`), now);
    }
    speak(e, say(kind, ['{t}、作業中{e}', 'あと少し{e}', '集中してる{e}'][Math.floor(Math.random() * 3)].replace('{t}', title)), now);
  }

  // ── painting ────────────────────────────────────────────────────────────────
  let tick = 0;
  function paintRoom(f, t) {
    const night = isNight(), y = f.y;
    R(0, y, W, WALL, f.wall); R(0, y, W, 4, '#9aa3b5'); R(0, y + WALL - 6, W, 6, '#aeb5c3');
    for (const lx of [40, 160, 280]) R(lx, y + 4, 70, 3, night ? '#fff3c4' : '#fffbe6');
    R(8, y + 12, 64, 16, f.sign); TXT(`${f.no} ${f.name}`, 40, y + 20, '#fff', 9, 800);
    blinds(84, y + 12, night, t); blinds(146, y + 12, night, t);
    const dx = 206, dy = y + 6;
    if (f.deco === 'intel') { R(dx, dy + 4, 64, 32, '#3a4150'); R(dx + 2, dy + 6, 60, 28, '#16202e'); for (let k = 0; k < 4; k++) R(dx + 6, dy + 10 + k * 6, 20 + ((k * 13 + t) % 30), 2, k % 2 ? '#4be37a' : '#5ab0ff'); }
    else if (f.deco === 'lib') { shelf(dx, dy, 44); shelf(dx + 48, dy, 44); }
    else if (f.deco === 'dev') { rack(dx, dy, t); rack(dx + 26, dy, t + 1); rack(dx + 52, dy, t + 2); }
    else if (f.deco === 'plan') { R(dx, dy + 2, 70, 34, '#c9a77c'); for (let k = 0; k < 9; k++) R(dx + 4 + (k % 5) * 13, dy + 6 + Math.floor(k / 5) * 14, 10, 10, ['#ffe066', '#ff9cc2', '#8fd3ff', '#b5f5a0'][k % 4]); }
    else if (f.deco === 'write') whiteboard(dx, dy + 4, 70, ['#2b3140', '#2b3140', '#e57373']);
    else if (f.deco === 'art') { R(dx + 4, dy + 2, 30, 36, '#8a5a36'); R(dx + 7, dy + 5, 24, 18, '#fbfbf8'); R(dx + 10, dy + 8, 8, 8, '#5ab0ff'); R(dx + 20, dy + 12, 8, 8, '#f2c94c'); R(dx + 42, dy + 6, 26, 26, '#c9a06a'); R(dx + 45, dy + 9, 20, 20, '#9fd8ff'); }
    else if (f.deco === 'exec') { shelf(dx, dy, 44); R(dx + 50, dy + 4, 40, 26, '#c9a06a'); R(dx + 54, dy + 8, 32, 18, '#fff7c9'); }
    clock(300, y + 14); calendar(320, y + 12);
    R(358, y + 10, 24, 36, '#8b6b4a'); R(360, y + 12, 20, 34, '#a5825b'); TXT('EV', 370, y + 26, '#fff', 7, 800);
    carpet(0, y + WALL, W, FH - WALL, f.carpet);
    if (f.key === 'exec') { R(70, y + WALL + 10, 250, FH - WALL - 24, '#b5463c'); R(74, y + WALL + 14, 242, FH - WALL - 32, '#c8584c'); }
    // break corner: coffee, water, sofa, plant, a round table
    R(314, y + 60, 22, 30, '#55606f'); R(318, y + 64, 14, 6, '#2b3140'); R(320, y + 65, 4, 2, '#ff6b6b'); R(320, y + 76, 8, 7, '#fff');
    if (t % 6 < 3) R(323, y + 70, 2, 5, 'rgba(255,255,255,.6)');
    water(346, y + 58);
    R(236, y + 214, 104, 10, '#c0705a'); R(236, y + 224, 104, 14, '#d9876f'); R(232, y + 218, 6, 20, '#b0604c'); R(338, y + 218, 6, 20, '#b0604c');
    g.fillStyle = '#a9825a'; g.beginPath(); g.ellipse(260, y + 152, 26, 12, 0, 0, Math.PI * 2); g.fill(); R(258, y + 158, 4, 10, '#7d5c3b');
    R(252, y + 146, 5, 6, '#e85d5d'); R(264, y + 148, 10, 6, '#ffffff');
    plant(364, y + 222); plant(196, y + 58);
    if (f.key !== 'exec') cabinet(184, y + 214);
    // desks (a sitter is drawn between chair and desk top)
    for (const d of f.desks) {
      const dw = d.big ? 110 : 78;
      R(d.x + 22, y + d.y - 22, 28, 22, d.big ? '#5b3a2a' : '#4a5875');
      const sitter = [...ents.values()].find((e) => e.desk === d && e.f === f);
      if (sitter) {
        const typing = sitter.st === 'work' && t % 2 === 0;
        g.drawImage(sprite(sitter.id, typing ? 'type' : 'sit'), d.x + 20, y + d.y - 30 + (typing ? 1 : 0), 32, 40);
      }
      R(d.x, y + d.y, dw, 22, d.big ? '#8a5a36' : '#d5d9e2'); R(d.x, y + d.y + 22, dw, 4, d.big ? '#6b4428' : '#aeb5c3');
      const on = sitter && sitter.st === 'work';
      R(d.x + dw - 30, y + d.y - 8, 26, 16, '#3a4150'); R(d.x + dw - 28, y + d.y - 6, 22, 12, on ? (t % 4 < 2 ? '#5ab0ff' : '#6cc0ff') : '#4a5363');
      if (on) for (let k = 0; k < 3; k++) R(d.x + dw - 26, y + d.y - 4 + k * 3, 6 + ((t + k * 5) % 12), 1, 'rgba(255,255,255,.75)');
      R(d.x + 8, y + d.y + 8, 18, 5, '#f0f2f6'); R(d.x + 32, y + d.y + 6, 5, 6, '#e85d5d');
      if (sitter) nameTag(sitter, d.x + 36, y + d.y + 38);
    }
  }
  function nameTag(e, cx, cy) {
    const name = REGISTRY.find((r) => r.id === e.id)?.name || e.id;
    g.font = '700 8px "Noto Sans JP",sans-serif'; const tw = g.measureText(name).width;
    R(cx - tw / 2 - 3, cy - 6, tw + 6, 11, e.st === 'error' ? '#ffe1e1' : 'rgba(255,255,255,.85)');
    TXT(name, cx, cy, e.st === 'error' ? '#e23b3b' : '#2b3140', 8, 700);
  }
  function paintWalker(e, t) {
    const y0 = e.f.y;
    g.fillStyle = 'rgba(0,0,0,.16)'; g.beginPath(); g.ellipse(e.x, y0 + e.y, 11, 4, 0, 0, Math.PI * 2); g.fill();
    if (e.mode === 'lie') {
      // knocked out on the floor: lying sideways, ×× eyes, stars going round
      g.save(); g.translate(e.x, y0 + e.y - 8); g.rotate(-Math.PI / 2);
      g.drawImage(sprite(e.id, 'ko'), -16, -20, 32, 40); g.restore();
      for (let k = 0; k < 3; k++) { const a = t / 3 + k * 2.1; R(e.x - 22 + Math.cos(a) * 9, y0 + e.y - 22 + Math.sin(a) * 3, 3, 3, '#ffd400'); }
      nameTag(e, e.x, y0 + e.y + 10);
      return;
    }
    const pose = e.mode === 'walk' ? (t % 2 ? 'walk1' : 'walk2') : e.act === 'coffee' ? 'mug' : ((t + e.x | 0) % 31 === 0 ? 'blink' : 'stand');
    const bob = e.mode === 'walk' ? (t % 2) : 0;
    g.save();
    if (e.face < 0) { g.translate(e.x * 2, 0); g.scale(-1, 1); }
    g.drawImage(sprite(e.id, pose), e.x - 16, y0 + e.y - 40 - bob, 32, 40);
    g.restore();
    nameTag(e, e.x, y0 + e.y + 8);
  }
  function paintBubbles(now) {
    for (const [id, b] of bubbles) {
      if (b.until < now) { bubbles.delete(id); continue; }
      const e = ents.get(id); if (!e?.f) continue;
      let cx, cy;
      if (e.mode === 'sit' && e.desk) { cx = e.desk.x + 36; cy = e.f.y + e.desk.y - 32; }
      else if (e.mode === 'lie') { cx = e.x; cy = e.f.y + e.y - 22; }
      else { cx = e.x; cy = e.f.y + e.y - 42; }
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
      paintRoom(f, tick);
      [...ents.values()].filter((e) => e.f === f && e.mode !== 'sit').sort((a, b) => a.y - b.y).forEach((e) => paintWalker(e, tick));
    }
    paintBubbles(now);
  }
  function loop() {
    cancelAnimationFrame(raf);
    const frame = (ts) => {
      if (!root || root.offsetParent === null || !visibleBox || document.hidden) { raf = 0; return; }
      if (ts - last > 110) {           // ~9fps: smooth enough for pixel walking, light on the battery
        last = ts; tick++;
        step(ts);
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
