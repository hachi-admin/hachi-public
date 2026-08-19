/**
 * One rule that matters here: no-undef.
 *
 * `CHANNELS` was referenced in the channel tree and does not exist in that scope. It threw a
 * ReferenceError, which took down the whole guild fetch, and the page reported "Error fetching
 * guilds: Can't find variable: CHANNELS" — on a phone, in production, after the change had been
 * verified by rendering it in a harness where that code path never ran.
 *
 * hachi-core has had this rule since it caught four of the same class in one pass. The dashboard
 * did not, which is the only reason this one shipped. `node --check` cannot see it: an undefined
 * identifier is a scope question, not a syntax one, and it throws only when the line executes.
 *
 * The dashboard's scripts are classic (non-module) and share one global scope, so they are linted
 * together rather than per-file — a name defined in ui.js and used in app.js is legitimate.
 */
export default [
  {
    files: ['dash/*.js', 'shared/*.js', 'quiz/*.js', 'vocab/*.js', 'scripts/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: {
        window: 'readonly', document: 'readonly', console: 'readonly', localStorage: 'readonly',
        fetch: 'readonly', location: 'readonly', history: 'readonly', navigator: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
        requestAnimationFrame: 'readonly', performance: 'readonly', matchMedia: 'readonly',
        URL: 'readonly', URLSearchParams: 'readonly', Blob: 'readonly', FormData: 'readonly',
        Response: 'readonly', Request: 'readonly', Headers: 'readonly', AbortSignal: 'readonly',
        atob: 'readonly', btoa: 'readonly', crypto: 'readonly', Image: 'readonly',
        MutationObserver: 'readonly', IntersectionObserver: 'readonly', CustomEvent: 'readonly',
        getComputedStyle: 'readonly', alert: 'readonly', confirm: 'readonly', prompt: 'readonly',
        mermaid: 'readonly', Chart: 'readonly', process: 'readonly', CSS: 'readonly',
        // Defined in shared/ui.js, which every page loads before its own script.
        esc: 'readonly', toggleTheme: 'readonly', shuffle: 'readonly',
      },
    },
    linterOptions: { reportUnusedDisableDirectives: true },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
    },
  },
  {
    // scripts/ are ESM and run under node
    files: ['scripts/*.js'],
    languageOptions: { sourceType: 'module', globals: { process: 'readonly', console: 'readonly' } },
  },
];
