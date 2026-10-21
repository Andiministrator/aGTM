// test/dl_hook_src.test.js — dataLayer.push hook detection names the script that set the hook (fct_hook_src)
import { describe, test, expect, beforeEach } from 'bun:test';
import { resetAGTM } from './helpers.js';

// Stand-in for GTM's own push: the detection recognises it by "sandbox" in its source text.
// Bound to the array like GTM's queue — aGTM calls the saved original without a receiver.
function makeGtmPush() {
  const dl = globalThis.dataLayer;
  return function () { var SANDBOXED_JS_SEMAPHORE = 0; return Array.prototype.push.apply(dl, arguments); };
}

// Stand-in for a third-party wrapper that calls the original first (the oaiq.min.js pattern)
function makeHook(orig, seen) {
  return function () { var r = orig.apply(this, arguments); seen.push(arguments[0]); return r; };
}

const CHROME_STACK = [
  'Error',
  '    at Object.set [as push] (https://sgtm.example.com/aGTM.js:1:2345)',
  '    at Xr (https://bzrcdn.openai.com/sdk/oaiq.min.js?v=1&pid=abc:1:34719)',
  '    at nn (https://bzrcdn.openai.com/sdk/oaiq.min.js:1:45496)',
].join('\n');

const FIREFOX_STACK = [
  'set@https://sgtm.example.com/aGTM.js:1:2345',
  'Xr@https://bzrcdn.openai.com/sdk/oaiq.min.js#frag:1:34719',
].join('\n');

describe('aGTM.f.stackSrc()', () => {
  test('Chrome stack: first foreign script, without line/column and query string', () => {
    expect(aGTM.f.stackSrc(CHROME_STACK)).toBe('https://bzrcdn.openai.com/sdk/oaiq.min.js');
  });

  test('Firefox stack: first foreign script, without fragment', () => {
    expect(aGTM.f.stackSrc(FIREFOX_STACK)).toBe('https://bzrcdn.openai.com/sdk/oaiq.min.js');
  });

  test('only own frames, no URL, or no stack at all → ""', () => {
    expect(aGTM.f.stackSrc('Error\n    at set (https://sgtm.example.com/aGTM.js:1:2)\n    at x (https://sgtm.example.com/aGTM.js:1:9)')).toBe('');
    expect(aGTM.f.stackSrc('Error\n    at set (<anonymous>:8:214)')).toBe('');
    expect(aGTM.f.stackSrc(undefined)).toBe('');
  });
});

describe('aGTM.f.dlHookTrap() + sendnaus() — fct_hook_src', () => {
  let realStackSrc;

  beforeEach(() => {
    resetAGTM();
    aGTM.f.config({ gdl: 'dataLayer', dlOrgPush: 'log' });
    globalThis.dataLayer = [];
    realStackSrc = aGTM.f.stackSrc;
  });

  test('dlOrgPush empty: no trap, push stays a plain property', () => {
    aGTM.c.dlOrgPush = '';
    aGTM.f.sendnaus({ event: 'a' });
    expect(Object.getOwnPropertyDescriptor(globalThis.dataLayer, 'push')).toBeUndefined();
    expect(aGTM.d.dlHookTrap).toBeUndefined();
  });

  test('GTM sets its push through the trap: it works and becomes the baseline', () => {
    aGTM.f.sendnaus({ event: 'aGTM_ready' });
    const gtmPush = makeGtmPush();
    globalThis.dataLayer.push = gtmPush;
    expect(globalThis.dataLayer.push).toBe(gtmPush);
    aGTM.f.sendnaus({ event: 'b' });
    expect(aGTM.d.originalDLpush).toBe(gtmPush);
    expect(globalThis.dataLayer.map(e => e.event)).toEqual(['aGTM_ready', 'b']);
    expect(aGTM.d.dlHookLogged).toBeUndefined();
  });

  test('a foreign push before GTM\'s baseline is known passes through and keeps the trap armed', () => {
    aGTM.f.sendnaus({ event: 'aGTM_ready' });
    const early = function () { return Array.prototype.push.apply(globalThis.dataLayer, arguments); };
    globalThis.dataLayer.push = early;
    expect(globalThis.dataLayer.push).toBe(early);
    expect(Object.getOwnPropertyDescriptor(globalThis.dataLayer, 'push').get).toBeDefined();
    expect(aGTM.d.dlHookSrc).toBeUndefined();
  });

  test('a foreign hook is recorded with its script and reported in the exception', () => {
    try {
      aGTM.f.stackSrc = () => 'https://bzrcdn.openai.com/sdk/oaiq.min.js';
      aGTM.f.sendnaus({ event: 'aGTM_ready' });
      const gtmPush = makeGtmPush();
      globalThis.dataLayer.push = gtmPush;
      aGTM.f.sendnaus({ event: 'gtm.js' });
      const seen = [];
      globalThis.dataLayer.push = makeHook(gtmPush, seen);
      expect(aGTM.d.dlHookSrc).toBe('https://bzrcdn.openai.com/sdk/oaiq.min.js');
      aGTM.f.sendnaus({ event: 'aPAGEready' });
      const ex = globalThis.dataLayer.find(e => e.event === 'exception');
      expect(ex.fct_hook_src).toBe('https://bzrcdn.openai.com/sdk/oaiq.min.js');
      expect(ex.errmsg).toBe('Function dataLayer.push hooked - no longer from GTM');
      // "log" still pushes through the hook, so the third party keeps seeing the event
      expect(seen.map(e => e.event)).toEqual(['aPAGEready']);
    } finally {
      aGTM.f.stackSrc = realStackSrc;
    }
  });

  test('after the foreign hook the trap steps aside: push is a plain writable property', () => {
    aGTM.f.sendnaus({ event: 'aGTM_ready' });
    const gtmPush = makeGtmPush();
    globalThis.dataLayer.push = gtmPush;
    aGTM.f.sendnaus({ event: 'gtm.js' });
    const hook = makeHook(gtmPush, []);
    globalThis.dataLayer.push = hook;
    const d = Object.getOwnPropertyDescriptor(globalThis.dataLayer, 'push');
    expect(d.value).toBe(hook);
    expect(d.writable).toBe(true);
    expect(d.get).toBeUndefined();
  });

  test('a script restoring its saved descriptor gets GTM\'s push back (oaiq teardown)', () => {
    aGTM.f.sendnaus({ event: 'aGTM_ready' });
    const gtmPush = makeGtmPush();
    globalThis.dataLayer.push = gtmPush;
    aGTM.f.sendnaus({ event: 'gtm.js' });
    const saved = Object.getOwnPropertyDescriptor(globalThis.dataLayer, 'push');
    globalThis.dataLayer.push = makeHook(gtmPush, []);
    Object.defineProperty(globalThis.dataLayer, 'push', saved);
    expect(globalThis.dataLayer.push).toBe(gtmPush);
  });

  test('without a stack URL the field is present and empty', () => {
    try {
      aGTM.f.stackSrc = () => '';
      aGTM.f.sendnaus({ event: 'aGTM_ready' });
      const gtmPush = makeGtmPush();
      globalThis.dataLayer.push = gtmPush;
      aGTM.f.sendnaus({ event: 'gtm.js' });
      globalThis.dataLayer.push = makeHook(gtmPush, []);
      aGTM.f.sendnaus({ event: 'x' });
      const ex = globalThis.dataLayer.find(e => e.event === 'exception');
      expect(ex.fct_hook_src).toBe('');
    } finally {
      aGTM.f.stackSrc = realStackSrc;
    }
  });

  test('somebody else\'s accessor on push is left alone', () => {
    let cur = makeGtmPush();
    Object.defineProperty(globalThis.dataLayer, 'push', { configurable: true, get() { return cur; }, set(v) { cur = v; } });
    aGTM.f.sendnaus({ event: 'a' });
    expect(aGTM.d.dlHookTrap).toBeUndefined();
    expect(globalThis.dataLayer[0].event).toBe('a');
  });

  test('a replaced dataLayer array gets a new trap', () => {
    aGTM.f.sendnaus({ event: 'a' });
    const first = globalThis.dataLayer;
    globalThis.dataLayer = [];
    aGTM.f.sendnaus({ event: 'b' });
    expect(aGTM.d.dlHookTrap).toBe(globalThis.dataLayer);
    expect(aGTM.d.dlHookTrap).not.toBe(first);
  });

  test('restore mode puts GTM\'s push back after the trap stepped aside', () => {
    aGTM.c.dlOrgPush = 'restore';
    aGTM.f.sendnaus({ event: 'aGTM_ready' });
    const gtmPush = makeGtmPush();
    globalThis.dataLayer.push = gtmPush;
    aGTM.f.sendnaus({ event: 'gtm.js' });
    globalThis.dataLayer.push = makeHook(gtmPush, []);
    aGTM.f.sendnaus({ event: 'x' });
    expect(globalThis.dataLayer.push).toBe(gtmPush);
  });
});

describe('aGTM.f.stackSrc() — page addresses and odd URLs (Kritiker K-4)', () => {
  let realHref;
  beforeEach(() => { realHref = globalThis.location.href; globalThis.location.href = 'https://shop.example/konto/reset/ab12cd?x=1'; });
  const withFrame = f => 'Error\n    at set (https://sgtm.example.com/aGTM.js:1:2)\n    at ' + f;

  test('a hook from an inline script of the page reports "inline", never the page path', () => {
    try {
      expect(aGTM.f.stackSrc(withFrame('https://shop.example/konto/reset/ab12cd:55:3'))).toBe('inline');
    } finally { globalThis.location.href = realHref; }
  });

  test('blob: scripts report "blob", userinfo is stripped', () => {
    try {
      expect(aGTM.f.stackSrc(withFrame('blob:https://shop.example/0f8e-uuid:1:9'))).toBe('blob');
      expect(aGTM.f.stackSrc(withFrame('https://user:pw@cdn.example/a.js:3:4'))).toBe('https://cdn.example/a.js');
    } finally { globalThis.location.href = realHref; }
  });
});

describe('aGTM.f.dlHookTrap() — order, re-wraps and robustness (QA-6, K-5, K-13)', () => {
  let real;
  beforeEach(() => {
    resetAGTM();
    aGTM.f.config({ gdl: 'dataLayer', dlOrgPush: 'log' });
    globalThis.dataLayer = [];
    real = aGTM.f.stackSrc;
  });

  test('GTM re-wrap after the baseline passes through, records nothing, trap stays', () => {
    try {
      aGTM.f.stackSrc = () => 'https://www.googletagmanager.com/gtm.js';
      aGTM.f.sendnaus({ event: 'aGTM_ready' });
      globalThis.dataLayer.push = makeGtmPush();
      aGTM.f.sendnaus({ event: 'gtm.js' });
      globalThis.dataLayer.push = makeGtmPush();
      expect(aGTM.d.dlHookSrc).toBeUndefined();
      expect(Object.getOwnPropertyDescriptor(globalThis.dataLayer, 'push').get).toBeDefined();
    } finally { aGTM.f.stackSrc = real; }
  });

  test('the first setter wins after a descriptor restore and a second foreign set', () => {
    try {
      aGTM.f.sendnaus({ event: 'aGTM_ready' });
      const g = makeGtmPush();
      globalThis.dataLayer.push = g;
      aGTM.f.sendnaus({ event: 'gtm.js' });
      const saved = Object.getOwnPropertyDescriptor(globalThis.dataLayer, 'push');
      aGTM.f.stackSrc = () => 'https://a.example/first.js';
      globalThis.dataLayer.push = makeHook(g, []);
      Object.defineProperty(globalThis.dataLayer, 'push', saved);
      aGTM.f.stackSrc = () => 'https://b.example/second.js';
      globalThis.dataLayer.push = makeHook(g, []);
      expect(aGTM.d.dlHookSrc).toBe('https://a.example/first.js');
    } finally { aGTM.f.stackSrc = real; }
  });

  test('the setter hands a real stack string to stackSrc', () => {
    let got;
    try {
      aGTM.f.stackSrc = s => { got = s; return 'x'; };
      aGTM.f.sendnaus({ event: 'aGTM_ready' });
      const g = makeGtmPush();
      globalThis.dataLayer.push = g;
      aGTM.f.sendnaus({ event: 'gtm.js' });
      globalThis.dataLayer.push = makeHook(g, []);
      expect(typeof got).toBe('string');
      expect(got.length).toBeGreaterThan(0);
    } finally { aGTM.f.stackSrc = real; }
  });

  test('a hook right after GTM, before any further sendnaus, is still recorded and reported', () => {
    try {
      aGTM.f.stackSrc = () => 'https://bzrcdn.openai.com/sdk/oaiq.min.js';
      aGTM.f.sendnaus({ event: 'aGTM_ready' });
      const g = makeGtmPush();
      globalThis.dataLayer.push = g;
      globalThis.dataLayer.push = makeHook(g, []);
      expect(aGTM.d.dlHookSrc).toBe('https://bzrcdn.openai.com/sdk/oaiq.min.js');
      aGTM.f.sendnaus({ event: 'aPAGEready' });
      expect(globalThis.dataLayer.find(e => e.event === 'exception').fct_hook_src).toBe('https://bzrcdn.openai.com/sdk/oaiq.min.js');
    } finally { aGTM.f.stackSrc = real; }
  });

  test('a hook whose toString throws does not break the script that sets it', () => {
    aGTM.f.sendnaus({ event: 'aGTM_ready' });
    const g = makeGtmPush();
    globalThis.dataLayer.push = g;
    aGTM.f.sendnaus({ event: 'gtm.js' });
    const evil = function () { return g.apply(this, arguments); };
    evil.toString = () => { throw new Error('nope'); };
    expect(() => { globalThis.dataLayer.push = evil; }).not.toThrow();
    expect(globalThis.dataLayer.push).toBe(evil);
  });
});
