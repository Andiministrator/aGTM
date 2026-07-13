// test/evlstn_passive_throttle.test.js
// Regression tests for the CWV-oriented evLstn options (F-34 a):
//   aGTM.f.passiveSupported() — cached feature detection
//   aGTM.f.throttle()         — leading+trailing throttle
//   aGTM.f.evLstn(el, ev, fct, { passive, throttle }) — opt-in wiring
// Rationale: passive listeners never block scrolling (better INP / no scroll
// jank) and throttling bounds how often the scroll/resize handler forces a
// reflow. Both must be OPT-IN so message/load/error listeners stay untouched.

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { resetAGTM } from './helpers.js';

// A minimal element that records every addEventListener call.
function recorder() {
  return {
    calls: [],
    addEventListener: function (type, fn, opts) {
      this.calls.push({ type: type, fn: fn, opts: opts });
    },
    removeEventListener: function () {}
  };
}

describe('aGTM.f.throttle', () => {
  beforeEach(() => resetAGTM());

  it('returns the original function unchanged for a non-positive wait', () => {
    const fn = function () {};
    expect(globalThis.aGTM.f.throttle(fn, 0)).toBe(fn);
    expect(globalThis.aGTM.f.throttle(fn, -5)).toBe(fn);
  });

  it('fires on the leading edge and suppresses an immediate second call', () => {
    let n = 0;
    const t = globalThis.aGTM.f.throttle(function () { n++; }, 1000);
    t(); // leading edge → runs now
    t(); // within the window → suppressed (scheduled for trailing edge)
    expect(n).toBe(1);
  });

  it('runs the trailing call after the window elapses', async () => {
    let n = 0;
    const t = globalThis.aGTM.f.throttle(function () { n++; }, 30);
    t(); // leading
    t(); // schedules trailing
    expect(n).toBe(1);
    await new Promise((r) => setTimeout(r, 60));
    expect(n).toBe(2); // trailing fired
  });

  it('trailing call uses the LATEST args, not the ones that scheduled it', async () => {
    // Discriminates the F1 fix: without capturing the latest args on every call,
    // the trailing invocation would fire with 'b' (the call that set the timer)
    // instead of 'c' (the most recent event within the window).
    const seen = [];
    const t = globalThis.aGTM.f.throttle(function (v) { seen.push(v); }, 30);
    t('a'); // leading → fires now with 'a'
    t('b'); // schedules trailing
    t('c'); // within window → must update the pending trailing args to 'c'
    expect(seen).toEqual(['a']);
    await new Promise((r) => setTimeout(r, 60));
    expect(seen).toEqual(['a', 'c']);
  });
});

describe('aGTM.f.passiveSupported', () => {
  let origAdd, origRemove;

  beforeEach(() => {
    resetAGTM();
    origAdd = globalThis.addEventListener;
    origRemove = globalThis.removeEventListener;
  });

  afterEach(() => {
    globalThis.addEventListener = origAdd;
    globalThis.removeEventListener = origRemove;
  });

  it('reports true when addEventListener reads the passive option', () => {
    // Simulate a supporting browser: it touches opts.passive → getter fires.
    globalThis.addEventListener = function (type, fn, opts) { if (opts) void opts.passive; };
    globalThis.removeEventListener = function () {};
    expect(globalThis.aGTM.f.passiveSupported()).toBe(true);
    // Cached: a later non-touching impl must not flip the answer.
    globalThis.addEventListener = function () {};
    expect(globalThis.aGTM.f.passiveSupported()).toBe(true);
  });

  it('reports false when addEventListener ignores the options object', () => {
    globalThis.addEventListener = function () {};       // never reads opts.passive
    globalThis.removeEventListener = function () {};
    expect(globalThis.aGTM.f.passiveSupported()).toBe(false);
  });
});

describe('aGTM.f.evLstn — passive/throttle opts', () => {
  beforeEach(() => resetAGTM());

  it('registers a plain listener (no opts object) by default', () => {
    const el = recorder();
    globalThis.aGTM.f.evLstn(el, 'scroll', function () {});
    expect(el.calls.length).toBe(1);
    expect(el.calls[0].opts).toBeUndefined();
  });

  it('passes { passive: true } only when support is detected', () => {
    globalThis.aGTM.d.passive_supported = true; // pin detection
    const el = recorder();
    globalThis.aGTM.f.evLstn(el, 'scroll', function () {}, { passive: true });
    expect(el.calls[0].opts).toEqual({ passive: true });
  });

  it('falls back to a plain listener when passive is unsupported', () => {
    globalThis.aGTM.d.passive_supported = false; // pin detection
    const el = recorder();
    globalThis.aGTM.f.evLstn(el, 'scroll', function () {}, { passive: true });
    expect(el.calls[0].opts).toBeUndefined();
  });

  it('wraps the handler in a throttle (registered fn differs, throttling works)', () => {
    const el = recorder();
    let n = 0;
    const fct = function () { n++; };
    globalThis.aGTM.f.evLstn(el, 'scroll', fct, { throttle: 1000 });
    const registered = el.calls[0].fn;
    expect(registered).not.toBe(fct);     // it is the throttled wrapper
    registered();                          // leading edge
    registered();                          // suppressed within window
    expect(n).toBe(1);
  });

  it('does NOT apply opts to a message listener (iframe path stays intact)', () => {
    // The message branch must ignore passive/throttle so the iFrame handshake
    // wiring is unchanged. It also passes exactly two args (data, origin).
    globalThis.aGTM.d.passive_supported = true;
    const el = recorder();
    globalThis.aGTM.f.evLstn(el, 'message', function () {}, { passive: true, throttle: 500 });
    expect(el.calls.length).toBe(1);
    expect(el.calls[0].type).toBe('message');
    expect(el.calls[0].opts).toBeUndefined();
  });
});
