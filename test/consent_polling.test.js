// test/consent_polling.test.js — Phase 3 follow-up: adaptive CMP polling +
// run_cc('update') hardening (snapshot/restore on consent_check fail,
// sendnaus + callback gating on actual hash change).
//
// Together these make CMPs that emit their update event directly via
// dataLayer.push() (CCM19, Cookiebot, Usercentrics, …) work without an
// explicit aGTM.f.fire() — the consent_poll catches the change on its tick
// and pushes the diff to consent_store_url.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resetAGTM, MockXHR } from './helpers.js';

const setupRunCc = () => {
  aGTM.d.config = true;
  aGTM.d.init = true; // suppress inject() side-effects
  aGTM.d.consent = aGTM.d.consent || {};
  aGTM.c.gdl = 'dataLayer';
  aGTM.c.gtmPurposes = '';
  aGTM.c.gtmServices = '';
  aGTM.c.gtmVendors = '';
  globalThis.dataLayer = [];
};

describe('aGTM.f.start_consent_poll — activation', () => {
  beforeEach(() => { MockXHR.install(); });
  afterEach(() => {
    MockXHR.reset();
    if (typeof aGTM !== 'undefined' && aGTM.d && aGTM.d.timer && aGTM.d.timer.consent_poll) {
      clearInterval(aGTM.d.timer.consent_poll);
      delete aGTM.d.timer.consent_poll;
    }
  });

  test('starts poll timer when consent_store_url AND consent_poll_ms > 0', () => {
    resetAGTM({ consent_store_url: 'https://store.example.com/consent', consent_poll_ms: 1000 });
    aGTM.f.start_consent_poll();
    expect(aGTM.d.timer.consent_poll).toBeDefined();
  });

  test('does NOT start poll when consent_store_url is empty', () => {
    resetAGTM({ consent_store_url: '', consent_poll_ms: 1000 });
    aGTM.f.start_consent_poll();
    expect(aGTM.d.timer.consent_poll).toBeUndefined();
  });

  test('does NOT start poll when consent_poll_ms is 0', () => {
    resetAGTM({ consent_store_url: 'https://store.example.com/consent', consent_poll_ms: 0 });
    aGTM.f.start_consent_poll();
    expect(aGTM.d.timer.consent_poll).toBeUndefined();
  });

  test('does NOT start poll when consent_poll_ms is negative', () => {
    resetAGTM({ consent_store_url: 'https://store.example.com/consent', consent_poll_ms: -1 });
    aGTM.f.start_consent_poll();
    expect(aGTM.d.timer.consent_poll).toBeUndefined();
  });

  test('idempotent — second call does not stack timers', () => {
    resetAGTM({ consent_store_url: 'https://store.example.com/consent', consent_poll_ms: 1000 });
    aGTM.f.start_consent_poll();
    const firstTimer = aGTM.d.timer.consent_poll;
    aGTM.f.start_consent_poll();
    expect(aGTM.d.timer.consent_poll).toBe(firstTimer);
  });

  test('default consent_poll_ms is 2000 when not set in cfg', () => {
    resetAGTM({ consent_store_url: 'https://store.example.com/consent' });
    expect(aGTM.c.consent_poll_ms).toBe(2000);
  });
});

describe("aGTM.f.run_cc('update') — snapshot/restore guard", () => {
  beforeEach(() => { MockXHR.install(); });
  afterEach(() => {
    MockXHR.reset();
    delete aGTM.f.consent_check;
    delete aGTM.f.consent_callback;
  });

  test('restores aGTM.d.consent when consent_check returns false (preset stays intact)', () => {
    resetAGTM({
      session: { sid: 's-1', consent: { hasResponse: true, services: ',svc-preset,', feedback: 'preset' } }
    });
    setupRunCc();
    // Ensure preset survived config()
    expect(aGTM.d.consent.services).toBe(',svc-preset,');
    aGTM.f.consent_check = function () { return false; }; // CMP not ready
    aGTM.f.run_cc('update');
    // Preset must be restored 1:1
    expect(aGTM.d.consent.services).toBe(',svc-preset,');
    expect(aGTM.d.consent.hasResponse).toBe(true);
    expect(aGTM.d.consent.feedback).toBe('preset');
  });

  test('does NOT restore on init action (no snapshot needed; init is one-shot)', () => {
    resetAGTM({});
    setupRunCc();
    // Pre-set consent so we can detect any inadvertent restore
    aGTM.d.consent = { hasResponse: false, services: '', purposes: '', vendors: '' };
    aGTM.f.consent_check = function () { return false; };
    aGTM.f.run_cc('init');
    // No restore happens on init — state stays as the consent_check left it
    // (here unchanged since check failed). What matters: no JS error, no
    // accidental snapshot logic running on init.
    expect(aGTM.d.consent.hasResponse).toBe(false);
  });
});

describe("aGTM.f.run_cc('update') — sendnaus + callback gating on hash change", () => {
  beforeEach(() => { MockXHR.install(); });
  afterEach(() => {
    MockXHR.reset();
    delete aGTM.f.consent_check;
    delete aGTM.f.consent_callback;
  });

  test('sendnaus aGTM_consent_update fires only when hash changes (poll-safe)', () => {
    resetAGTM({});
    setupRunCc();
    aGTM.f.consent_check = function () {
      aGTM.d.consent.hasResponse = true;
      aGTM.d.consent.services = ',svc1,';
      return true;
    };
    aGTM.f.run_cc('update');
    aGTM.f.run_cc('update');
    aGTM.f.run_cc('update');
    const updates = globalThis.dataLayer.filter(
      (e) => e && e.event === 'aGTM_consent_update'
    );
    // First call has hashChanged=true (old hash was ""), subsequent calls
    // have the same hash → no further pushes.
    expect(updates.length).toBe(1);
  });

  test('consent_callback fires on init regardless of hash', () => {
    resetAGTM({});
    setupRunCc();
    let calls = 0;
    aGTM.f.consent_callback = function () { calls++; };
    aGTM.f.consent_check = function () {
      aGTM.d.consent.hasResponse = true;
      aGTM.d.consent.services = ',svc1,';
      return true;
    };
    aGTM.f.run_cc('init');
    expect(calls).toBe(1);
  });

  test('consent_callback gated on hashChanged for update (poll-safe)', () => {
    resetAGTM({});
    setupRunCc();
    let calls = 0;
    aGTM.f.consent_callback = function () { calls++; };
    aGTM.f.consent_check = function () {
      aGTM.d.consent.hasResponse = true;
      aGTM.d.consent.services = ',svc1,';
      return true;
    };
    aGTM.f.run_cc('update');
    aGTM.f.run_cc('update');
    aGTM.f.run_cc('update');
    expect(calls).toBe(1); // only first one had a real change
  });

  test('sendnaus + callback fire again when consent actually changes between updates', () => {
    resetAGTM({});
    setupRunCc();
    let services = ',svc1,';
    let calls = 0;
    aGTM.f.consent_callback = function () { calls++; };
    aGTM.f.consent_check = function () {
      aGTM.d.consent.hasResponse = true;
      aGTM.d.consent.services = services;
      return true;
    };
    aGTM.f.run_cc('update');                          // change 1: "" → ,svc1,
    services = ',svc1,svc2,';
    aGTM.f.run_cc('update');                          // change 2: ,svc1, → ,svc1,svc2,
    aGTM.f.run_cc('update');                          // no change
    services = ',svc1,';
    aGTM.f.run_cc('update');                          // change 3: ,svc1,svc2, → ,svc1,
    expect(calls).toBe(3);
    const updates = globalThis.dataLayer.filter(
      (e) => e && e.event === 'aGTM_consent_update'
    );
    expect(updates.length).toBe(3);
  });
});
