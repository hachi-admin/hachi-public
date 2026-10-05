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
    { key: 'exec',  no: '8F', name: '社長室', wall: '#ece4d6', sign: '#8a6b3a', carpet: ['#cbb89a', '#c4b090'], deco: 'exec',
      ids: ['orchestrator', 'advisor', 'visionary', 'efficiency-audit', 'channel-audit'] },
    { key: 'intel', no: '7F', name: '情報部', wall: '#e3e9f2', sign: '#3b6fb6', carpet: ['#c3c9d6', '#bac1cf'], deco: 'intel',
      ids: ['scout-agent', 'news-agent', 'mail-agent', 'log-monitor-agent', 'financial-agent', 'location-agent', 'chat-agent', 'summary-agent', 'choice-interpreter'] },
    { key: 'lib',   no: '6F', name: '書庫', wall: '#e4f1e8', sign: '#2e7d5b', carpet: ['#c9d8cd', '#c0d0c4'], deco: 'lib',
      ids: ['context-agent', 'knowledge-agent', 'lint-agent', 'db-audit-agent'] },
    { key: 'dev',   no: '5F', name: '開発部', wall: '#e6e8ee', sign: '#e0702c', carpet: ['#b9bfcc', '#b1b8c6'], deco: 'dev',
      ids: ['dev-agent', 'review-agent', 'jp-censor-agent', 'system-audit-agent', 'design-critic'] },
    { key: 'plan',  no: '4F', name: '企画室', wall: '#f1e9f7', sign: '#7c4dbd', carpet: ['#d3cbe0', '#cbc2da'], deco: 'plan',
      ids: ['article-ideas', 'article-angle', 'topic-scout', 'note-study', 'craft-study', 'category-prompt', 'reader-questions'] },
    { key: 'write', no: '3F', name: '執筆室', wall: '#f4ede4', sign: '#9a5b2e', carpet: ['#d6cbbb', '#cec2b1'], deco: 'write',
      ids: ['article-writer', 'drafting-agent', 'structure-agent', 'editorial-agent', 'reflection-writer', 'answer-researcher', 'slide-agent'] },
    { key: 'art',   no: '2F', name: '美術室', wall: '#f7ecee', sign: '#c2185b', carpet: ['#dccbd0', '#d4c1c7'], deco: 'art',
      ids: ['hero-style', 'category-recipe', 'recipe-vision', 'image-scout', 'image-curator', 'design-agent', 'product-pick'] },
    { key: 'cafe',  no: '1F', name: 'カフェ', wall: '#f3e6c9', sign: '#8a6b3a', carpet: ['#d9c49e', '#d0ba92'], deco: 'cafe', ids: [] },
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
      p(6, 6, eye); p(9, 6, eye);
      if (['pigeon', 'bird', 'chick', 'owl'].includes(kind)) r(7, 8, 2, 1, '#f28c28');
      else if (kind !== 'elephant' && kind !== 'beaver') { p(7, 8, shade(C, .55)); p(8, 8, shade(C, .55)); }
      // shirt (bees wear their stripes)
      r(4, 11, 8, 6, kind === 'bee' ? '#f7c948' : shirt); r(4, 11, 8, 1, kind === 'bee' ? shirt : shade(shirt, .8));
      if (kind === 'bee') { r(4, 13, 8, 1, '#3a2f2a'); r(4, 15, 8, 1, '#3a2f2a'); }
      r(3, 12, 1, 4, C); r(12, 12, 1, 4, C);
      r(5, 17, 2, 2, kind === 'human' ? '#3a4150' : shade(C, .7)); r(9, 17, 2, 2, kind === 'human' ? '#3a4150' : shade(C, .7));
    }
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
    if (prop && PROP[prop]) PROP[prop]();
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

  // ── layout ──────────────────────────────────────────────────────────────────
  const WALL = 54, ROW = 104, PAD = 18;
  let layout = null;   // { floors:[{...,y,h,seats:[{id,x,y}]}], height }
  function buildLayout() {
    const fs = people();
    const idle = REGISTRY.map((r) => r.id).filter((id) => stateOf(id) === 'idle');
    let y = 0;
    const floors = fs.map((f) => {
      const n = f.key === 'cafe' ? Math.min(idle.length, 12) : f.ids.length;
      const rows = f.key === 'cafe' ? Math.max(1, Math.ceil(n / 4)) : Math.max(1, Math.ceil(n / 3));
      const h = WALL + PAD + rows * (f.key === 'cafe' ? 62 : ROW) + (f.key === 'cafe' ? 70 : 20);
      const seats = (f.key === 'cafe' ? idle.slice(0, 12) : f.ids).map((id, i) => f.key === 'cafe'
        ? { id, x: 30 + (i % 4) * 82, y: y + WALL + PAD + 14 + Math.floor(i / 4) * 62 }
        : { id, x: 26 + (i % 3) * 112, y: y + WALL + PAD + 30 + Math.floor(i / 3) * ROW });
      const out = { ...f, y, h, seats, idleMore: f.key === 'cafe' ? Math.max(0, idle.length - 12) : 0 };
      y += h + 6;
      return out;
    });
    return { floors, height: y };
  }

  // ── painting ────────────────────────────────────────────────────────────────
  const bubbles = new Map();     // id → { text, kind, until }
  let tick = 0;
  function paintFloor(f, t) {
    const night = isNight();
    const y = f.y;
    // wall
    R(0, y, W, WALL, f.wall); R(0, y, W, 4, '#9aa3b5'); R(0, y + WALL - 6, W, 6, '#aeb5c3');
    for (const lx of [40, 160, 280]) { R(lx, y + 4, 70, 3, night ? '#fff3c4' : '#fffbe6'); }
    R(8, y + 12, 64, 16, f.sign); TXT(`${f.no} ${f.name}`, 40, y + 20, '#fff', 9, 800);
    blinds(84, y + 12, night, t); blinds(146, y + 12, night, t);
    if (f.deco === 'intel') { R(210, y + 10, 64, 32, '#3a4150'); R(212, y + 12, 60, 28, '#16202e'); for (let k = 0; k < 4; k++) R(216, y + 16 + k * 6, 20 + ((k * 13 + t) % 30), 2, k % 2 ? '#4be37a' : '#5ab0ff'); }
    else if (f.deco === 'lib') { shelf(210, y + 6, 44); shelf(258, y + 6, 44); }
    else if (f.deco === 'dev') { rack(210, y + 6, t); rack(236, y + 6, t + 1); rack(262, y + 6, t + 2); }
    else if (f.deco === 'plan') { R(210, y + 8, 70, 34, '#c9a77c'); for (let k = 0; k < 9; k++) R(214 + (k % 5) * 13, y + 12 + Math.floor(k / 5) * 14, 10, 10, ['#ffe066', '#ff9cc2', '#8fd3ff', '#b5f5a0'][k % 4]); }
    else if (f.deco === 'write') whiteboard(210, y + 10, 70, ['#2b3140', '#2b3140', '#e57373']);
    else if (f.deco === 'art') { R(214, y + 8, 30, 36, '#8a5a36'); R(217, y + 11, 24, 18, '#fbfbf8'); R(220, y + 14, 8, 8, '#5ab0ff'); R(230, y + 18, 8, 8, '#f2c94c'); R(252, y + 12, 26, 26, '#c9a06a'); R(255, y + 15, 20, 20, '#9fd8ff'); }
    else if (f.deco === 'exec') { shelf(210, y + 6, 44); R(260, y + 10, 40, 26, '#c9a06a'); R(264, y + 14, 32, 18, '#fff7c9'); }
    else if (f.deco === 'cafe') { R(210, y + 14, 90, 30, '#6b4a33'); R(214, y + 18, 20, 14, '#3a2f2a'); R(238, y + 18, 20, 14, '#3a2f2a'); TXT('MENU', 288, y + 29, '#fff3c4', 7, 800); }
    clock(310, y + 14); calendar(332, y + 12);
    R(358, y + 10, 24, 36, '#8b6b4a'); R(360, y + 12, 20, 34, '#a5825b'); TXT('EV', 370, y + 26, '#fff', 7, 800);
    // floor
    carpet(0, y + WALL, W, f.h - WALL, f.carpet);
    if (f.key === 'exec') { R(60, y + WALL + 8, 270, f.h - WALL - 16, '#b5463c'); R(64, y + WALL + 12, 262, f.h - WALL - 24, '#c8584c'); }
    if (f.key === 'cafe') { for (let k = 0; k < 3; k++) { const tx = 40 + k * 120; R(tx, y + f.h - 46, 50, 20, '#8a5a36'); R(tx + 4, y + f.h - 26, 4, 10, '#6b4428'); R(tx + 42, y + f.h - 26, 4, 10, '#6b4428'); R(tx + 18, y + f.h - 50, 6, 6, '#fff'); if ((t + k) % 6 < 3) R(tx + 20, y + f.h - 58, 2, 6, 'rgba(255,255,255,.6)'); } }
    if (f.key !== 'cafe' && f.key !== 'exec') { cabinet(4, y + WALL + 8); plant(370, y + f.h - 40); }
    if (f.key === 'intel') copier(350, y + WALL + 8);
    if (f.key === 'exec') { water(8, y + WALL + 10); plant(368, y + f.h - 40); }
    // seats
    for (const s of f.seats) paintSeat(f, s, t);
    if (f.idleMore) TXT(`ほか ${f.idleMore} 人`, W - 40, y + f.h - 12, '#6b7280', 9, 700);
  }
  function paintSeat(f, s, t) {
    const st = stateOf(s.id);
    const reg = REGISTRY.find((r) => r.id === s.id);
    const name = reg?.name || s.id;
    const [kind] = CAST[s.id] || ['human'];
    if (f.key === 'cafe') {            // standing around the café
      const bob = (t + s.x) % 8 < 4 ? 0 : 1;
      g.drawImage(sprite(s.id, (t + s.x) % 23 === 0 ? 'blink' : 'stand'), s.x, s.y + bob, 32, 40);
      TXT(name, s.x + 16, s.y + 48, '#4b5563', 8, 700);
      return;
    }
    const x = s.x, y = s.y;
    // desk with partition behind it, chair, monitor
    R(x - 6, y - 30, 100, 4, '#9fb2cc');                         // partition
    R(x + 12, y - 22, 26, 22, '#4a5875');                        // chair back
    if (st !== 'idle') {
      const typing = st === 'work' && (t % 2 === 0);
      g.drawImage(sprite(s.id, typing ? 'type' : (t + x) % 29 === 0 ? 'blink' : 'sit'), x + 9, y - 28 + (typing ? 1 : 0), 32, 40);
    } else {
      R(x + 14, y - 14, 22, 10, '#f1e3c4'); TXT('カフェ', x + 25, y - 9, '#8a6b3a', 7, 700);
    }
    R(x - 4, y + 4, 96, 22, '#d5d9e2'); R(x - 4, y + 26, 96, 4, '#aeb5c3');             // desk top + edge
    const screen = st === 'error' ? '#ff6b6b' : st === 'work' ? ((t % 4 < 2) ? '#5ab0ff' : '#6cc0ff') : st === 'done' ? '#7fd8a8' : '#4a5363';
    R(x + 52, y - 6, 26, 16, '#3a4150'); R(x + 54, y - 4, 22, 12, screen); R(x + 63, y + 10, 4, 3, '#3a4150');
    if (st === 'work') for (let k = 0; k < 3; k++) R(x + 56, y - 2 + k * 3, 6 + ((t + k * 5) % 12), 1, 'rgba(255,255,255,.75)');
    R(x + 4, y + 12, 18, 5, '#f0f2f6'); R(x + 26, y + 10, 5, 6, '#e85d5d');               // keyboard, mug
    if (kind !== 'robot' && (s.x + s.y) % 3 === 0) R(x + 80, y + 8, 6, 8, '#52b866');       // a little desk plant
    // name tag with state stripe
    const col = { work: '#2f80ed', done: '#1f9d55', error: '#e23b3b', idle: '#9aa3b5' }[st];
    g.font = '700 8px "Noto Sans JP",sans-serif'; const tw = g.measureText(name).width;
    R(x + 44 - tw / 2 - 4, y + 34, tw + 8, 12, 'rgba(255,255,255,.9)'); R(x + 44 - tw / 2 - 4, y + 45, tw + 8, 2, col);
    TXT(name, x + 44, y + 40, '#2b3140', 8, 700);
    // status mark
    if (!bubbles.has(s.id)) {
      if (st === 'error') mark(x + 24, y - 32, '！', '#ffe1e1', '#e23b3b');
      else if (st === 'done') mark(x + 24, y - 32, '✓', '#ddf7e7', '#1f9d55');
      else if (st === 'work') mark(x + 24, y - 32, '…', '#ffffff', '#2b3140');
    }
  }
  function mark(x, y, s, bg, fg) { R(x - 8, y - 12, 16, 13, '#2b3140'); R(x - 7, y - 11, 14, 11, bg); R(x - 2, y + 1, 4, 2, '#2b3140'); TXT(s, x, y - 5, fg, 9, 800); }
  function paintBubbles() {
    const now = performance.now();
    for (const [id, b] of bubbles) {
      if (b.until < now) { bubbles.delete(id); continue; }
      const all = layout.floors.flatMap((f) => f.seats.map((s) => ({ ...s, cafe: f.key === 'cafe' })));
      const seat = all.find((s) => s.id === id && s.cafe === (stateOf(id) === 'idle')) || all.find((s) => s.id === id);
      if (!seat) continue;
      const cx = seat.cafe ? seat.x + 16 : seat.x + 24, cy = seat.cafe ? seat.y - 4 : seat.y - 32;
      g.font = '700 9px "Noto Sans JP",sans-serif'; const w = g.measureText(b.text).width + 12;
      const bx = Math.min(Math.max(cx, w / 2 + 4), W - w / 2 - 4);
      const [bg, fg] = { error: ['#ffe1e1', '#e23b3b'], done: ['#ddf7e7', '#1f9d55'] }[b.kind] || ['#ffffff', '#2b3140'];
      R(bx - w / 2, cy - 15, w, 15, '#2b3140'); R(bx - w / 2 + 1, cy - 14, w - 2, 13, bg); R(cx - 2, cy, 4, 3, '#2b3140');
      TXT(b.text, bx, cy - 7, fg, 9, 700);
    }
  }
  // Who speaks next: someone in view, at most two bubbles at once, never the same line twice in a row.
  let lastLine = '';
  function nextBubble(visible) {
    // An idle agent is in the café, so its empty desk does not speak.
    visible = visible.filter((s) => !(s.desk && stateOf(s.id) === 'idle'));
    if (bubbles.size >= 2 || !visible.length) return;
    const s = visible[Math.floor(Math.random() * visible.length)];
    if (bubbles.has(s.id)) return;
    const [kind] = CAST[s.id] || ['human'];
    let st = stateOf(s.id);
    const night = isNight() && jstHour() < 6;
    const d = DETAIL_DATA[s.id] || {};
    let base;
    if (s.id === 'financial-agent' && st !== 'error') {
      const cost = (typeof COST_BY_DAY === 'object' && COST_BY_DAY) ? (COST_BY_DAY[new Date().toISOString().slice(0, 10)] || 0) : 0;
      base = cost > 1 ? `今日は$${cost.toFixed(2)}、使いすぎ{e}…` : `今日は$${cost.toFixed(2)}、セーフだ{e}`;
    } else if (s.id === 'orchestrator' && st !== 'error') {
      base = '次の仕事を配った{e}！';
    } else {
      const pool = st === 'idle' && night ? LINES.night : LINES[st];
      base = pool[Math.floor(Math.random() * pool.length)];
    }
    const title = d.task && typeof taskTitle === 'function' ? short(taskTitle(d.task)) : '';
    let text = say(kind, base.replace('{t}', title || 'お仕事'));
    if (text === lastLine) return;
    lastLine = text;
    bubbles.set(s.id, { text, kind: st === 'error' ? 'error' : st === 'done' ? 'done' : 'talk', until: performance.now() + 4000 });
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
      `<span class="oc work">作業中 ${n.work}</span><span class="oc done">完了 ${n.done}</span><span class="oc error">要対応 ${n.error}</span><span class="oc idle">待機 ${n.idle}</span>`;
    root.querySelector('.office-time').textContent = new Date().toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });
    const chips = root.querySelector('.office-chips');
    chips.innerHTML = layout.floors.map((f, i) => {
      const bad = f.seats.some((s) => stateOf(s.id) === 'error');
      return `<button type="button" data-i="${i}" class="office-chip${bad ? ' bad' : ''}">${f.name}</button>`;
    }).join('');
    chips.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => goFloor(+b.dataset.i)));
    // Open where something is happening: a failure first, else someone working, else the top.
    const err = layout.floors.findIndex((f) => f.seats.some((s) => stateOf(s.id) === 'error'));
    const work = layout.floors.findIndex((f) => f.seats.some((s) => stateOf(s.id) === 'work'));
    if (pendingFloor == null && !render.done) pendingFloor = err >= 0 ? err : work >= 0 ? work : 0;
    render.done = true;
    requestAnimationFrame(() => {
      if (pendingFloor != null && box.clientHeight) { goFloor(pendingFloor, false); pendingFloor = null; }
      draw(); loop();
    });
  }
  function goFloor(i, smooth = true) {
    const f = layout.floors[i]; if (!f) return;
    const k = box.clientWidth / W;
    box.scrollTo({ top: f.y * k, behavior: smooth ? 'smooth' : 'instant' });
  }
  function syncChips() {
    if (!layout) return;
    const k = box.clientWidth / W, top = box.scrollTop / k + 40;
    const i = layout.floors.findIndex((f) => top >= f.y && top < f.y + f.h + 6);
    root.querySelectorAll('.office-chip').forEach((b) => b.classList.toggle('on', +b.dataset.i === i));
  }
  function visibleFloors() {
    const k = box.clientWidth / W, top = box.scrollTop / k, bottom = top + box.clientHeight / k;
    return layout.floors.filter((f) => f.y + f.h > top && f.y < bottom);
  }
  function draw() {
    if (!layout) return;
    g.clearRect(0, 0, W, layout.height);
    const vis = visibleFloors();
    for (const f of layout.floors) if (vis.includes(f)) paintFloor(f, tick);
    paintBubbles();
  }
  function loop() {
    cancelAnimationFrame(raf);
    const step = (ts) => {
      const onPage = root && root.offsetParent !== null;
      if (!onPage || !visibleBox || document.hidden) { raf = 0; return; }
      if (ts - last > 160) {           // ~6fps is plenty for pixel art and kind to the battery
        last = ts; tick++;
        if (tick % 12 === 0) nextBubble(visibleFloors().flatMap((f) => f.seats.map((s) => ({ ...s, desk: f.key !== 'cafe' }))));
        draw(); syncChips();
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  function onTap(e) {
    const rect = cv.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (W / rect.width), y = (e.clientY - rect.top) * (W / rect.width);
    for (const f of layout.floors) for (const s of f.seats) {
      const hit = f.key === 'cafe' ? (x >= s.x && x <= s.x + 32 && y >= s.y && y <= s.y + 48)
        : (x >= s.x - 4 && x <= s.x + 92 && y >= s.y - 32 && y <= s.y + 48);
      if (hit) {
        const [kind] = CAST[s.id] || ['human'];
        bubbles.set(s.id, { text: say(kind, 'はい、なんでしょう{e}？'), kind: 'talk', until: performance.now() + 1500 });
        draw();
        if (typeof openDetail === 'function') setTimeout(() => openDetail(s.id), 250);
        return;
      }
    }
  }
  window.HachiOffice = { render };
})();
