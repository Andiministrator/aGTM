// F-175 — an empty container object must not kill init().
//
// `initGTM` used to carry a `if (!count) { … aGTM.c.gtm[containerId] … }`
// fallback whose `containerId` was the loop variable of a loop that never ran.
// It threw a TypeError for every config whose `aGTM.c.gtm` had no own
// enumerable keys, which aborted `init()` completely.
//
// These tests assert the CRASH is gone, deliberately not the dataLayer output:
// the emitted events are identical before and after the fix (none), so an
// event-based assertion would pass without testing anything.
//
// Reachability note — the trigger is `aGTM.c.gtm`, not the argument of
// `config()`: `config()` creates `aGTM.c.gtm` lazily inside its loop, so
// `config({gtm:{}})` leaves it undefined and the guard catches it. The
// documented loader snippet (README.md, "aGTM.c=c;") assigns the integrator's
// object directly, which is how an empty one reaches `initGTM`.

import { test, expect, beforeEach, afterEach } from 'bun:test';
import { resetAGTM } from './helpers.js';

beforeEach(() => {
  // The fake document.cookie is shared across test files, and init() aborts —
  // wiping everything but aGTM.f — when it finds an aGTMoptout cookie left
  // behind by a sibling file (test/cookie.test.js). Clear it, otherwise these
  // tests pass alone and fail in the suite.
  document.cookie = '';
  resetAGTM();
  globalThis.dataLayer = [];
});

afterEach(() => {
  delete aGTM.f.consent_check;
});

// Mirrors the documented loader: the integrator's object becomes aGTM.c, and
// init() then passes that very object to config() (cfg === aGTM.c).
function loaderInit(cfg) {
  for (var k in cfg) aGTM.c[k] = cfg[k];
  aGTM.f.init();
}

test('initGTM() does not throw when aGTM.c.gtm is an empty object', () => {
  aGTM.d.config = true;
  aGTM.c.gtm = {};
  aGTM.c.gdl = 'dataLayer';
  expect(() => aGTM.f.initGTM(false)).not.toThrow();
  expect(() => aGTM.f.initGTM(true)).not.toThrow();
});

test('init() survives the documented loader pattern with an empty gtm object', () => {
  expect(() => loaderInit({ cmp: 'none', gtm: {} })).not.toThrow();
  expect(aGTM.d.init).toBe(true);
});

test('init() survives a stray empty array in gtm (plausible typo)', () => {
  expect(() => loaderInit({ cmp: 'none', gtm: [] })).not.toThrow();
  expect(aGTM.d.init).toBe(true);
});

test('init() survives an empty gtm object on the CMP path (initGTM(true) prelude)', () => {
  aGTM.f.load_cc = function () {};
  expect(() => loaderInit({ cmp: 'cookiebot', gtm: {} })).not.toThrow();
});

test('init() survives a gtm object without own enumerable keys', () => {
  expect(() => loaderInit({ cmp: 'none', gtm: Object.create(null) })).not.toThrow();
  expect(aGTM.d.init).toBe(true);
});

test('an empty gtm object behaves exactly like a missing gtm key', () => {
  loaderInit({ cmp: 'none', gtm: {} });
  var withEmpty = { init: aGTM.d.init, events: dataLayer.map(function (e) { return e && e.event; }) };

  resetAGTM();
  globalThis.dataLayer = [];
  loaderInit({ cmp: 'none' });
  var withMissing = { init: aGTM.d.init, events: dataLayer.map(function (e) { return e && e.event; }) };

  expect(withEmpty).toEqual(withMissing);
});

test('the follow-up work of init() still runs when no container is configured', () => {
  var calls = { dp: 0, js: 0 };
  var origDP = aGTM.f.chkDPready;
  var origJS = aGTM.f.jserrors;
  aGTM.f.chkDPready = function () { calls.dp++; };
  aGTM.f.jserrors = function () { calls.js++; };
  try {
    loaderInit({ cmp: 'none', gtm: {} });
  } finally {
    aGTM.f.chkDPready = origDP;
    aGTM.f.jserrors = origJS;
  }
  // jserrors() sits after the previously throwing block in init().
  expect(calls.js).toBe(1);
});

test('a configured container is still injected (no collateral damage)', () => {
  var loaded = [];
  var orig = aGTM.f.gtm_load;
  aGTM.f.gtm_load = function (w, d, i) { loaded.push(i); };
  try {
    loaderInit({ cmp: 'none', gtm: { 'GTM-XXXX': {} } });
  } finally {
    aGTM.f.gtm_load = orig;
  }
  expect(loaded).toEqual(['GTM-XXXX']);
  expect(aGTM.d.init).toBe(true);
});
