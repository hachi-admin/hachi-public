# Vocabulary — Claude Code Instructions

The vocabulary app lives in its **own directory** (`vocab/`), separate from the quiz (`../quiz/`).
**The only file you usually edit is `vocab.js`.**

---

## Architecture

```
vocab/
├── index.html      ← Dictionary: search + category filter + 🎯 MCQ "Quiz me" mode.
├── flashcards.html ← Anki-style spaced-repetition (SM-2) flashcards.
├── vocab.js        ← ALL vocabulary content (window.VOCAB). This is what you edit.
└── CLAUDE.md       ← This file.
```

Both pages read `window.VOCAB` from `vocab.js` and render dynamically — adding an entry makes it
appear everywhere (dictionary, MCQ quiz, and the flashcard decks) automatically. The theme toggle
shares `localStorage['quiz-theme']` with the quiz app.

---

## Data model (`vocab.js`)

```js
window.VOCAB = [
  {
    term: 'Capital Markets',   // headword (required)
    full: '資本市場',           // optional: expansion / translation / acronym spelled out
    cat:  'Finance · Risk & Regulation',  // category — groups the dictionary + becomes a flashcard "deck"
    def:  'Markets where <strong>long-term</strong> securities are issued and traded…',  // HTML: <strong>/<em> ok
    wiki: 'wiki/concepts/Capital Markets.md',  // optional path into the obsidian repo (clickable 📂 source)
  },
  // …
];
// Optional: window.VOCAB_WIKI_BASE = 'https://github.com/<owner>/obsidian/blob/main/';
```

Rules:
- `cat` drives the dictionary groups, the MCQ-quiz category filter, **and** the flashcard decks — keep
  categories consistent (reuse existing strings) so decks stay clean.
- `def` may use `<strong>`/`<em>` only. Keep it 1–3 sentences — it must read well on a flashcard back.
- `wiki` — **only** set it to a page that actually exists in the obsidian repo, else omit it.
- Sort is automatic (alphabetical); just append.

---

## Flashcards (`flashcards.html`) — how it works

Anki-inspired **spaced repetition** using a simplified **SM-2** algorithm. No backend — all review
state is in `localStorage['sb-srs-v1']` per `term`.

- **Decks** = categories (`cat`). The user picks a deck (or "All").
- **Queue** = cards *due* today + up to 20 *new* cards. Front shows the term; tap/Space flips to the
  definition; the user self-rates **Again / Hard / Good / Easy** (keys 1–4), which sets the next
  interval (shown on each button). Direction is toggleable (Term→Definition or Definition→Term).
- **You don't normally touch this file** — it's data-driven by `vocab.js`. Only edit it for new
  flashcard features (e.g. typing-answer mode, audio).

When adding vocabulary, you only edit `vocab.js`; the flashcards pick it up automatically.

---

## Processing capture requests

The user captures terms on the **📥 Requests** page (`../quiz/requests.html`) → exports
`../quiz/_requests.json`. When asked to *process requests*, handle the `kind: 'vocab'` items:
research each `term` (use its `note` to fix the intended sense — acronym / double-meaning / domain),
then append a `{ term, full?, cat, def, wiki? }` entry here. Full workflow: see
[`../quiz/CLAUDE.md`](../quiz/CLAUDE.md) → "Learning Requests".

---

## Deployment

Live at **`https://lucasmasunoacn.github.io/second-brain/vocab/`** (dictionary) and
`…/vocab/flashcards.html`. Push to `main` → GitHub Pages redeploys (~60s).
