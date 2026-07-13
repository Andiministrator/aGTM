// test/urllistener_idempotent.test.js
// Regression test for aGTM.f.urlListener idempotency (F-36 b).
// urlListener may be called more than once (gtm_load + Pageview tag, or a
// multi-trigger SPA setup). A second call must be a no-op — otherwise
// history.pushState gets wrapped in a fresh Proxy each time (nesting → duplicate
// vPageview events) and extra listeners/timers accumulate.

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { resetAGTM } from './helpers.js';

describe('aGTM.f.urlListener — idempotency guard', () => {
  let origPush, origReplace;

  beforeEach(() => {
    resetAGTM();
    origPush = globalThis.history.pushState;
    origReplace = globalThis.history.replaceState;
  });

  afterEach(() => {
    globalThis.history.pushState = origPush;
    globalThis.history.replaceState = origReplace;
  });

  it('marks itself active on first call', () => {
    expect(globalThis.aGTM.d.urlListener_active).toBeFalsy();
    globalThis.aGTM.f.urlListener('vPageview', 0, false);
    expect(globalThis.aGTM.d.urlListener_active).toBe(true);
  });

  it('does not re-wrap history.pushState on a second call', () => {
    globalThis.aGTM.f.urlListener('vPageview', 0, false);
    const wrapped1 = globalThis.history.pushState;
    globalThis.aGTM.f.urlListener('vPageview', 0, false);
    const wrapped2 = globalThis.history.pushState;
    expect(wrapped2).toBe(wrapped1);
  });

  it('fires exactly one event for a single navigation', () => {
    let fires = 0;
    const origFire = globalThis.aGTM.f.fire;
    globalThis.aGTM.f.fire = function (ev) { if (ev && ev.event === 'vPageview') fires++; };
    try {
      globalThis.aGTM.f.urlListener('vPageview', 0, false);
      globalThis.aGTM.f.urlListener('vPageview', 0, false); // no-op
      globalThis.location.href = 'http://localhost/next';
      globalThis.history.pushState({}, '', '/next');
      expect(fires).toBe(1);
    } finally {
      globalThis.aGTM.f.fire = origFire;
      globalThis.location.href = 'http://localhost/test';
    }
  });
});
