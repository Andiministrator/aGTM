// test/dlrepeat.test.js — aGTM.f.dlrepeat (DL-Repeat / late-enrichment engine)

import { beforeEach, afterEach, describe, expect, test } from 'bun:test';
import { resetAGTM } from './helpers.js';

/**
 * Replace aGTM.f.fire with a capture. Repeated (business) events go into the
 * returned array; the aGTM_repeat_fallback error signal is kept on `.fallback`.
 */
function captureFires() {
  const fired = [];
  fired.fallback = null;
  globalThis.aGTM.f.fire = function (o) {
    if (o && o.event === 'aGTM_repeat_fallback') { fired.fallback = o; return; }
    fired.push(o);
  };
  return fired;
}

describe('aGTM.f.dlrepeat', () => {
  let origFire;
  beforeEach(() => { resetAGTM(); origFire = globalThis.aGTM.f.fire; });
  // Restore the real fire() and clear globals — bun shares globalThis across
  // test files, so leaving the capture stub in place would break other suites.
  afterEach(() => { globalThis.aGTM.f.fire = origFire; delete globalThis.dataLayer; });

  test('replays matching events from aGTM.d.dl when the gate is empty (ready now)', () => {
    globalThis.aGTM.d.dl = [
      { event: 'view_item', aGTMdl: true, aGTMts: 111, 'gtm.uniqueEventId': 5 },
      { event: 'purchase', aGTMdl: true, aGTMts: 222 },
      { event: 'gtm.js' }
    ];
    const fired = captureFires();
    globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true, agtmFired: false });
    expect(fired.length).toBe(2);                       // gtm.js skipped
    expect(fired[0].event).toBe('view_item');
    expect(fired[0].aGTMrepeated).toBe(true);
    expect(fired[0].aGTMts).toBeUndefined();            // F-09: stripped so fire()'s loop guard passes
    expect(fired[0]['gtm.uniqueEventId']).toBeUndefined();
    expect(fired[1].event).toBe('purchase');
    expect(globalThis.aGTM.d.dlrepeatDone).toBe(true);
    expect(fired.fallback).toBeNull();         // enriched replay -> no error event
  });

  test('waits (schedules a poll) until all gate events are present', () => {
    globalThis.aGTM.d.dl = [{ event: 'view_item', aGTMdl: true }];
    const fired = captureFires();
    let scheduled = false;
    const origSI = globalThis.setInterval;
    globalThis.setInterval = function () { scheduled = true; return 0; };
    try {
      globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true, gateEvents: 'user_data', timeoutMs: 1500 });
    } finally {
      globalThis.setInterval = origSI;
    }
    expect(fired.length).toBe(0);
    expect(scheduled).toBe(true);
    expect(globalThis.aGTM.d.dlrepeatDone).toBeFalsy();
  });

  test('replays from the live dataLayer once the gate event is present', () => {
    globalThis.aGTM.c.gdl = 'dataLayer';
    globalThis.dataLayer = [
      { event: 'view_item', aGTMdl: true },
      { event: 'user_data', aGTMdl: true }
    ];
    const fired = captureFires();
    globalThis.aGTM.f.dlrepeat({ source: 'live', gtmFired: true, gateEvents: 'user_data' });
    expect(fired.length).toBe(2);
  });

  test('whitelist limits which events are repeated', () => {
    globalThis.aGTM.d.dl = [
      { event: 'view_item', aGTMdl: true },
      { event: 'purchase', aGTMdl: true },
      { event: 'user_data', aGTMdl: true }
    ];
    const fired = captureFires();
    globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true, whitelist: 'view_item,purchase' });
    expect(fired.map((e) => e.event).sort()).toEqual(['purchase', 'view_item']);
  });

  test('blacklist excludes events (wildcard)', () => {
    globalThis.aGTM.d.dl = [
      { event: 'view_item', aGTMdl: true },
      { event: 'CCM19.consentStateChanged', aGTMdl: true }
    ];
    const fired = captureFires();
    globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true, blacklist: 'CCM19*' });
    expect(fired.map((e) => e.event)).toEqual(['view_item']);
  });

  test('runs at most once per page (dlrepeatDone guard)', () => {
    globalThis.aGTM.d.dl = [{ event: 'view_item', aGTMdl: true }];
    const fired = captureFires();
    globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true });
    expect(fired.length).toBe(1);
    globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true });
    expect(fired.length).toBe(1);                       // no second replay
  });

  test('send-type: agtmFired gates events without aGTMdl, gtmFired gates aGTMdl events', () => {
    globalThis.aGTM.d.dl = [
      { event: 'raw_push' },                 // no aGTMdl -> needs agtmFired
      { event: 'captured', aGTMdl: true }    // aGTMdl   -> needs gtmFired
    ];
    const fired = captureFires();
    globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true, agtmFired: false });
    expect(fired.map((e) => e.event)).toEqual(['captured']);
  });

  test('already-repeated events are never repeated again (loop protection)', () => {
    globalThis.aGTM.d.dl = [
      { event: 'view_item', aGTMdl: true },
      { event: 'view_item', aGTMdl: true, aGTMrepeated: true }
    ];
    const fired = captureFires();
    globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true });
    expect(fired.length).toBe(1);
  });

  test('does not start a second poll while already polling (re-entrancy guard)', () => {
    globalThis.aGTM.d.dl = [{ event: 'view_item', aGTMdl: true }];
    const fired = captureFires();
    let intervals = 0;
    const origSI = globalThis.setInterval;
    globalThis.setInterval = function () { intervals++; return 0; };
    try {
      const cfg = { source: 'dl', gtmFired: true, gateEvents: 'user_data', timeoutMs: 1500 };
      globalThis.aGTM.f.dlrepeat(cfg);
      globalThis.aGTM.f.dlrepeat(cfg);   // second call while polling must be a no-op
    } finally {
      globalThis.setInterval = origSI;
    }
    expect(intervals).toBe(1);
    expect(fired.length).toBe(0);
  });

  test('clearEcom resets ecommerce before the event when consent is present', () => {
    globalThis.aGTM.d.consent = { gtmConsent: true };
    globalThis.aGTM.d.dl = [{ event: 'purchase', aGTMdl: true, ecommerce: { value: 5 } }];
    const fired = captureFires();
    globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true, clearEcom: true });
    expect(fired.length).toBe(2);
    expect(fired[0].ecommerce).toBe(null);     // reset fired first
    expect(fired[1].event).toBe('purchase');
  });

  test('clearEcom does not reset when GTM consent is absent', () => {
    globalThis.aGTM.d.consent = { gtmConsent: false };
    globalThis.aGTM.d.dl = [{ event: 'purchase', aGTMdl: true, ecommerce: { value: 5 } }];
    const fired = captureFires();
    globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true, clearEcom: true });
    expect(fired.length).toBe(1);
    expect(fired[0].event).toBe('purchase');
  });

  test('enriched (gate-ready) replay fires NO aGTM_repeat_fallback even when enabled', () => {
    globalThis.aGTM.d.dl = [{ event: 'view_item', aGTMdl: true }];
    const fired = captureFires();
    globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true, gateEvents: 'view_item', fallbackEvent: true });
    expect(fired.length).toBe(1);
    expect(fired.fallback).toBeNull();         // gate satisfied -> no error event
  });

  test('timeout fallback fires aGTM_repeat_fallback (error signal) when enabled', () => {
    globalThis.aGTM.d.dl = [{ event: 'view_item', aGTMdl: true }];
    const fired = captureFires();
    let tick = null;
    const oSI = globalThis.setInterval;
    const oCI = globalThis.clearInterval;
    globalThis.setInterval = function (fn) { tick = fn; return 1; };
    globalThis.clearInterval = function () {};
    try {
      // gate 'user_data' never present; cap (timeoutMs) < pollMs so one tick trips it
      globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true, gateEvents: 'user_data', timeoutMs: 100, pollMs: 300, fallbackEvent: true });
      expect(fired.fallback).toBeNull();        // still waiting
      tick();                                   // waited 300 >= cap 100 -> fallback replay
    } finally {
      globalThis.setInterval = oSI;
      globalThis.clearInterval = oCI;
    }
    expect(fired.fallback).not.toBeNull();
    expect(fired.fallback.aGTMrepeatSource).toBe('dl');
    expect(fired.map(function (e) { return e.event; })).toContain('view_item'); // unenriched replay ran
  });

  test('timeout fallback names the missing gate(s) via aGTMrepeatMissing + aGTMrepeatWaited', () => {
    globalThis.aGTM.d.dl = [
      { event: 'user', id: '9760249f', aGTMdl: true }, // logged-in -> user_data required
      { event: 'view_item_list', aGTMdl: true },
      { event: 'aPageview' }
      // user_data never arrives
    ];
    const fired = captureFires();
    let tick = null;
    const oSI = globalThis.setInterval, oCI = globalThis.clearInterval;
    globalThis.setInterval = function (fn) { tick = fn; return 1; };
    globalThis.clearInterval = function () {};
    try {
      globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true, gateEvents: 'aPageview, user_data?if=user[id]', timeoutMs: 100, pollMs: 300, fallbackEvent: true });
      tick(); // cap tripped -> unenriched fallback
    } finally {
      globalThis.setInterval = oSI; globalThis.clearInterval = oCI;
    }
    expect(fired.fallback).not.toBeNull();
    expect(fired.fallback.aGTMrepeatMissing).toBe('user_data'); // the culprit is named
    expect(fired.fallback.aGTMrepeatWaited).toBe(100);          // the give-up threshold
  });

  test('timeout fallback: an absent discriminator reports the discriminator event in aGTMrepeatMissing', () => {
    globalThis.aGTM.d.dl = [
      { event: 'view_item_list', aGTMdl: true },
      { event: 'aPageview' }
      // no `user` event at all -> user_data?if=user[id] stays unresolved (-1)
    ];
    const fired = captureFires();
    let tick = null;
    const oSI = globalThis.setInterval, oCI = globalThis.clearInterval;
    globalThis.setInterval = function (fn) { tick = fn; return 1; };
    globalThis.clearInterval = function () {};
    try {
      globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true, gateEvents: 'aPageview, user_data?if=user[id]', timeoutMs: 100, pollMs: 300, fallbackEvent: true });
      tick();
    } finally { globalThis.setInterval = oSI; globalThis.clearInterval = oCI; }
    expect(fired.fallback).not.toBeNull();
    expect(fired.fallback.aGTMrepeatMissing).toBe('user'); // the discriminator that never arrived
  });

  test('timeout fallback: multiple missing gates are comma-joined in aGTMrepeatMissing', () => {
    globalThis.aGTM.d.dl = [
      { event: 'view_item_list', aGTMdl: true },
      { event: 'aPageview' }
    ];
    const fired = captureFires();
    let tick = null;
    const oSI = globalThis.setInterval, oCI = globalThis.clearInterval;
    globalThis.setInterval = function (fn) { tick = fn; return 1; };
    globalThis.clearInterval = function () {};
    try {
      globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true, gateEvents: 'aPageview, foo, bar', timeoutMs: 100, pollMs: 300, fallbackEvent: true });
      tick();
    } finally { globalThis.setInterval = oSI; globalThis.clearInterval = oCI; }
    expect(fired.fallback).not.toBeNull();
    expect(fired.fallback.aGTMrepeatMissing).toBe('foo,bar'); // both unconditional missing gates
  });

  test('timeout fallback with NOTHING to replay (fired===0) fires NO aGTM_repeat_fallback', () => {
    // Nothing qualifies (empty source) -> no replay ran -> no missed enrichment
    // to report. The error signal must stay silent (fc-moto noise fix): a guest /
    // non-conversion page where the gate event never arrives is the normal case.
    globalThis.aGTM.d.dl = [];
    const fired = captureFires();
    let tick = null;
    const oSI = globalThis.setInterval;
    const oCI = globalThis.clearInterval;
    globalThis.setInterval = function (fn) { tick = fn; return 1; };
    globalThis.clearInterval = function () {};
    try {
      globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true, gateEvents: 'user_data', timeoutMs: 100, pollMs: 300, fallbackEvent: true });
      tick();                                   // waited 300 >= cap 100 -> fallback path, but fired===0
    } finally {
      globalThis.setInterval = oSI;
      globalThis.clearInterval = oCI;
    }
    expect(fired.length).toBe(0);              // nothing replayed
    expect(fired.fallback).toBeNull();         // and therefore NO error signal
  });

  // --- Conditional gate: "G?if=E[A]" / "G?if=E[A:V]" (v1.5) ------------------

  test('conditional gate: guest (user.id empty) does NOT require user_data -> gate-ready replay, no fallback', () => {
    // fc-moto guest case: user_data never arrives, but it is only required when
    // user.id is non-empty. Guest -> user_data dropped from the gate -> the
    // replay runs in order right away, and it is NOT a timeout fallback.
    globalThis.aGTM.d.dl = [
      { event: 'user', id: null, aGTMdl: true },
      { event: 'view_item_list', aGTMdl: true },
      { event: 'aPageview' }
    ];
    const fired = captureFires();
    globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true, gateEvents: 'aPageview, user_data?if=user[id]', timeoutMs: 1500, fallbackEvent: true });
    expect(fired.map((e) => e.event)).toContain('view_item_list'); // ordered replay ran
    expect(fired.fallback).toBeNull();                              // NOT a fallback
  });

  test('conditional gate: logged-in (user.id set) + user_data present -> enriched, no fallback', () => {
    globalThis.aGTM.d.dl = [
      { event: 'user', id: '9760249f', aGTMdl: true },
      { event: 'view_item_list', aGTMdl: true },
      { event: 'aPageview' },
      { event: 'user_data', email: 'a@b.de' }
    ];
    const fired = captureFires();
    globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true, gateEvents: 'aPageview, user_data?if=user[id]', timeoutMs: 1500, fallbackEvent: true });
    expect(fired.map((e) => e.event)).toContain('view_item_list');
    expect(fired.fallback).toBeNull();
  });

  test('conditional gate: logged-in but user_data missing -> real timeout fallback DOES fire', () => {
    globalThis.aGTM.d.dl = [
      { event: 'user', id: '9760249f', aGTMdl: true },
      { event: 'view_item_list', aGTMdl: true },
      { event: 'aPageview' }
    ];
    const fired = captureFires();
    let tick = null;
    const oSI = globalThis.setInterval, oCI = globalThis.clearInterval;
    globalThis.setInterval = function (fn) { tick = fn; return 1; };
    globalThis.clearInterval = function () {};
    try {
      globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true, gateEvents: 'aPageview, user_data?if=user[id]', timeoutMs: 100, pollMs: 300, fallbackEvent: true });
      expect(fired.fallback).toBeNull();  // still waiting (user_data required)
      tick();                             // cap tripped -> unenriched fallback
    } finally {
      globalThis.setInterval = oSI; globalThis.clearInterval = oCI;
    }
    expect(fired.fallback).not.toBeNull(); // control event fires on the genuine miss
  });

  test('conditional gate: value match E[A:V] - predicate false -> gate not required', () => {
    globalThis.aGTM.d.dl = [
      { event: 'user', type: 'basic', aGTMdl: true },
      { event: 'purchase', aGTMdl: true },
      { event: 'aPageview' }
    ];
    const fired = captureFires();
    globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true, gateEvents: 'aPageview, user_data?if=user[type:premium]', timeoutMs: 1500, fallbackEvent: true });
    expect(fired.map((e) => e.event)).toContain('purchase'); // basic != premium -> user_data not required
    expect(fired.fallback).toBeNull();
  });

  test('conditional gate: value match E[A:V] - predicate true -> gate required (waits, no immediate replay)', () => {
    globalThis.aGTM.d.dl = [
      { event: 'user', type: 'premium', aGTMdl: true },
      { event: 'purchase', aGTMdl: true },
      { event: 'aPageview' }
    ];
    const fired = captureFires();
    const oSI = globalThis.setInterval;
    globalThis.setInterval = function () { return 1; }; // arm poll, never tick
    try {
      globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true, gateEvents: 'aPageview, user_data?if=user[type:premium]', timeoutMs: 1500, fallbackEvent: true });
    } finally { globalThis.setInterval = oSI; }
    expect(fired.length).toBe(0);        // premium -> user_data required, not present yet -> no replay
    expect(fired.fallback).toBeNull();
  });

  test('unconditional gate stays backward-compatible (no ?if= -> always required)', () => {
    globalThis.aGTM.d.dl = [
      { event: 'view_item', aGTMdl: true },
      { event: 'aPageview' }
    ];
    const fired = captureFires();
    const oSI = globalThis.setInterval;
    globalThis.setInterval = function () { return 1; }; // arm poll, never tick
    try {
      globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true, gateEvents: 'aPageview, user_data', timeoutMs: 1500, fallbackEvent: true });
    } finally { globalThis.setInterval = oSI; }
    expect(fired.length).toBe(0);        // user_data unconditionally required, absent -> waits
    expect(fired.fallback).toBeNull();
  });

  test('conditional gate P1: discriminator absent at gate-check -> WAITS, then enriches when it arrives (no silent unenriched replay)', () => {
    // Logged-in visitor whose `user` event has not arrived yet: predicate is
    // unresolved -> the gate must wait, not replay unenriched immediately.
    globalThis.aGTM.d.dl = [
      { event: 'view_item_list', aGTMdl: true },
      { event: 'aPageview' }
      // no `user`, no `user_data` yet
    ];
    const fired = captureFires();
    let tick = null;
    const oSI = globalThis.setInterval, oCI = globalThis.clearInterval;
    globalThis.setInterval = function (fn) { tick = fn; return 1; };
    globalThis.clearInterval = function () {};
    try {
      globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true, gateEvents: 'aPageview, user_data?if=user[id]', timeoutMs: 5000, pollMs: 300, fallbackEvent: true });
      expect(fired.length).toBe(0);        // did NOT replay immediately (discriminator unresolved)
      expect(fired.fallback).toBeNull();
      globalThis.aGTM.d.dl.push({ event: 'user', id: 'abc' });      // late logged-in signal
      globalThis.aGTM.d.dl.push({ event: 'user_data', email: 'x@y.z' });
      tick();                              // poll re-checks -> gate ready -> enriched replay
    } finally {
      globalThis.setInterval = oSI; globalThis.clearInterval = oCI;
    }
    expect(fired.map((e) => e.event)).toContain('view_item_list'); // enriched replay ran
    expect(fired.fallback).toBeNull();                             // and it is NOT a fallback
  });

  test('conditional gate: empty-string id counts as empty -> not required -> immediate replay', () => {
    globalThis.aGTM.d.dl = [
      { event: 'user', id: '', aGTMdl: true },
      { event: 'purchase', aGTMdl: true },
      { event: 'aPageview' }
    ];
    const fired = captureFires();
    globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true, gateEvents: 'aPageview, user_data?if=user[id]', timeoutMs: 1500, fallbackEvent: true });
    expect(fired.map((e) => e.event)).toContain('purchase');
    expect(fired.fallback).toBeNull();
  });

  test('conditional gate: user present but id attribute missing -> treated as empty -> not required', () => {
    globalThis.aGTM.d.dl = [
      { event: 'user', aGTMdl: true },   // no id key at all
      { event: 'purchase', aGTMdl: true },
      { event: 'aPageview' }
    ];
    const fired = captureFires();
    globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true, gateEvents: 'aPageview, user_data?if=user[id]', timeoutMs: 1500, fallbackEvent: true });
    expect(fired.map((e) => e.event)).toContain('purchase');
    expect(fired.fallback).toBeNull();
  });

  test('conditional gate: id:0 / id:false are real values (non-empty) -> required -> waits', () => {
    globalThis.aGTM.d.dl = [
      { event: 'user', id: 0, aGTMdl: true },
      { event: 'purchase', aGTMdl: true },
      { event: 'aPageview' }
    ];
    const fired = captureFires();
    const oSI = globalThis.setInterval;
    globalThis.setInterval = function () { return 1; };
    try {
      globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true, gateEvents: 'aPageview, user_data?if=user[id]', timeoutMs: 1500, fallbackEvent: true });
    } finally { globalThis.setInterval = oSI; }
    expect(fired.length).toBe(0);   // 0 is a real value -> user_data required -> waits
    expect(fired.fallback).toBeNull();
  });

  test('conditional gate: malformed predicate (no "]") fails safe to unconditional -> waits, not skipped', () => {
    globalThis.aGTM.d.dl = [
      { event: 'user', id: null, aGTMdl: true },
      { event: 'purchase', aGTMdl: true },
      { event: 'aPageview' }
    ];
    const fired = captureFires();
    const oSI = globalThis.setInterval;
    globalThis.setInterval = function () { return 1; };
    try {
      // "user[" is malformed -> user_data stays unconditionally required -> waits (does NOT silently drop the gate)
      globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true, gateEvents: 'aPageview, user_data?if=user[', timeoutMs: 1500, fallbackEvent: true });
    } finally { globalThis.setInterval = oSI; }
    expect(fired.length).toBe(0);
    expect(fired.fallback).toBeNull();
  });

  test('conditional gate: value may contain a colon - E[A:http://x] matches on first colon only', () => {
    globalThis.aGTM.d.dl = [
      { event: 'user', ref: 'http://x', aGTMdl: true },
      { event: 'purchase', aGTMdl: true },
      { event: 'aPageview' }
    ];
    const fired = captureFires();
    const oSI = globalThis.setInterval;
    globalThis.setInterval = function () { return 1; };
    try {
      globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true, gateEvents: 'aPageview, user_data?if=user[ref:http://x]', timeoutMs: 1500, fallbackEvent: true });
    } finally { globalThis.setInterval = oSI; }
    expect(fired.length).toBe(0);   // ref === 'http://x' -> user_data required -> waits
    expect(fired.fallback).toBeNull();
  });

  test('conditional gate: presence-only ?if=E - E present -> G required -> waits', () => {
    globalThis.aGTM.d.dl = [
      { event: 'order_complete' },
      { event: 'purchase', aGTMdl: true },
      { event: 'aPageview' }
    ];
    const fired = captureFires();
    const oSI = globalThis.setInterval;
    globalThis.setInterval = function () { return 1; };
    try {
      globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true, gateEvents: 'aPageview, user_data?if=order_complete', timeoutMs: 1500, fallbackEvent: true });
    } finally { globalThis.setInterval = oSI; }
    expect(fired.length).toBe(0);   // order_complete present -> user_data required -> waits
    expect(fired.fallback).toBeNull();
  });

  test('conditional gate: presence-only ?if=E - E absent -> tri-state waits (NOT an immediate skip)', () => {
    globalThis.aGTM.d.dl = [
      { event: 'purchase', aGTMdl: true },
      { event: 'aPageview' }
      // no order_complete
    ];
    const fired = captureFires();
    const oSI = globalThis.setInterval;
    globalThis.setInterval = function () { return 1; };
    try {
      globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true, gateEvents: 'aPageview, user_data?if=order_complete', timeoutMs: 1500, fallbackEvent: true });
    } finally { globalThis.setInterval = oSI; }
    expect(fired.length).toBe(0);   // absent E -> -1 -> waits, does not replay early
    expect(fired.fallback).toBeNull();
  });

  test('conditional gate: trailing junk after "]" fails safe to unconditional -> waits', () => {
    globalThis.aGTM.d.dl = [
      { event: 'user', id: null, aGTMdl: true },
      { event: 'purchase', aGTMdl: true },
      { event: 'aPageview' }
    ];
    const fired = captureFires();
    const oSI = globalThis.setInterval;
    globalThis.setInterval = function () { return 1; };
    try {
      // "user[id]x" is malformed -> user_data stays unconditionally required -> waits (not silently skipped)
      globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true, gateEvents: 'aPageview, user_data?if=user[id]x', timeoutMs: 1500, fallbackEvent: true });
    } finally { globalThis.setInterval = oSI; }
    expect(fired.length).toBe(0);
    expect(fired.fallback).toBeNull();
  });

  test('conditional gate: empty gate name before ?if= is skipped (token ignored)', () => {
    globalThis.aGTM.d.dl = [
      { event: 'purchase', aGTMdl: true },
      { event: 'aPageview' }
    ];
    const fired = captureFires();
    // "?if=user[id]" has no gate name -> that token is skipped; only aPageview remains -> ready now
    globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true, gateEvents: 'aPageview, ?if=user[id]', timeoutMs: 1500, fallbackEvent: true });
    expect(fired.map((e) => e.event)).toContain('purchase');
    expect(fired.fallback).toBeNull();
  });

  test('conditional gate: an unresolved (-1) gate blocks replay even when other gates are satisfied', () => {
    globalThis.aGTM.d.dl = [
      { event: 'user', id: '', aGTMdl: true },   // guest -> user_data?if=user[id] resolves to skip (0)
      { event: 'purchase', aGTMdl: true },
      { event: 'aPageview' }
      // order_complete absent -> receipt?if=order_complete is unresolved (-1)
    ];
    const fired = captureFires();
    const oSI = globalThis.setInterval;
    globalThis.setInterval = function () { return 1; };
    try {
      globalThis.aGTM.f.dlrepeat({ source: 'dl', gtmFired: true, gateEvents: 'aPageview, user_data?if=user[id], receipt?if=order_complete', timeoutMs: 1500, fallbackEvent: true });
    } finally { globalThis.setInterval = oSI; }
    expect(fired.length).toBe(0);   // one -1 gate holds the whole replay despite a 0-skip on another
    expect(fired.fallback).toBeNull();
  });
});
