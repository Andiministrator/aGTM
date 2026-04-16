// test/setup.js — loaded before every test file via bunfig.toml [test].preload
// Sets up minimal browser globals and loads aGTM.js into the global scope.

import { readFileSync } from 'fs';

// ── Browser globals ────────────────────────────────────────────────────────

globalThis.window = globalThis;
globalThis.self   = globalThis;
globalThis.top    = globalThis;

globalThis.location = {
  href:     'http://localhost/test',
  hostname: 'localhost',
  search:   '',
  hash:     ''
};

globalThis.document = {
  referrer:  '',
  cookie:    '',
  readyState:'complete',
  title:     'Test Page',
  location:  globalThis.location,
  createElement: (tag) => ({
    tag, async: false, src: '', nonce: '', id: '', innerHTML: '',
    readyState: null, onreadystatechange: null, onload: null,
    setAttribute: function(k, v) { this[k] = v; },
    getAttribute: () => null,
    parentNode: { insertBefore: () => {} }
  }),
  head:  { appendChild: () => {} },
  body:  { appendChild: () => {}, scrollTop: 0 },
  getElementsByTagName: (tag) => {
    if (tag === 'script') return [{ parentNode: { insertBefore: () => {} } }];
    if (tag === 'html')   return [{ scrollTop: 0 }];
    return [];
  },
  querySelector:    () => null,
  querySelectorAll: () => [],
  getElementById:   () => null,
  addEventListener:    () => {},
  removeEventListener: () => {}
};

globalThis.navigator = {
  userAgent: 'Bun/test',
  appCodeName: 'Mozilla', appName: 'Netscape',
  appVersion: '5.0',      platform: 'Linux'
};

globalThis.screen      = { width: 1920, height: 1080 };
globalThis.performance = { now: () => Date.now() };
globalThis.history     = { pushState: () => {}, replaceState: () => {} };

// Default XMLHttpRequest stub (tests override this via MockXHR.install())
globalThis.XMLHttpRequest = class {
  open() {} setRequestHeader() {} send() {} abort() {}
};

// ── Load aGTM.js into global scope ────────────────────────────────────────
// Indirect eval executes in global scope so window.aGTM becomes globalThis.aGTM

const aGTMSource = readFileSync('./aGTM.js', 'utf8');
// eslint-disable-next-line no-eval
;(0, eval)(aGTMSource);
