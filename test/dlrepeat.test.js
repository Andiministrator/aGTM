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
});
