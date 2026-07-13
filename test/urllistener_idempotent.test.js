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

  it('registers the polling timer only once across repeated calls', () => {
    // With interval > 0 and fallback = false, urlListener also registers a polling
    // timer via aGTM.f.timer (alongside the Proxy). Timer names get a unique suffix,
    // so there is NO name dedup — without the idempotency guard a second call would
    // add a second, never-stopped interval. This asserts the real leak is closed.
    // (A naive "fires exactly one event" check would NOT discriminate: the shared
    // aGTM.d.last_url dedup masks the duplicate fire even when the guard is absent.)
    globalThis.aGTM.f.urlListener('vPageview', 50, false);
    globalThis.aGTM.f.urlListener('vPageview', 50, false); // must be a no-op
    const timerKeys = Object.keys(globalThis.aGTM.d.timer).filter(function (k) {
      return k.indexOf('urlListener_') === 0;
    });
    try {
      expect(timerKeys.length).toBe(1);
    } finally {
      // Stop the interval so it does not leak into other tests.
      timerKeys.forEach(function (k) { globalThis.aGTM.f.stoptimer(k); });
    }
  });
});
