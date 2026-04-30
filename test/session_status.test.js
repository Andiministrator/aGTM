// test/session_status.test.js — tests for aGTM.d.session_status lifecycle
// Full lifecycle (Phase 2 + 3):
//   ""                       — no cfg.session / feature inactive
//   "preset"                 — cfg.session with sid only (or invalid consent)
//   "preset_with_consent"    — cfg.session.consent valid, hasResponse=true
//   "synced"                 — run_cc detected diff, consent-store POST 2xx
//   "confirmed"              — run_cc, no diff (server already had this state)
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

describe('aGTM.d.session_status — config() lifecycle', () => {
  beforeEach(() => {
    MockXHR.install();
  });

  afterEach(() => {
    MockXHR.reset();
  });

  test('is empty string when no cfg.session is supplied', () => {
    resetAGTM();
    expect(aGTM.d.session_status).toBe('');
  });

  test('is "preset" when cfg.session has a sid', () => {
    resetAGTM({ session: { sid: 's-123' } });
    expect(aGTM.d.session_status).toBe('preset');
  });

  test('is "preset" when cfg.session has uid+sid', () => {
    resetAGTM({ session: { sid: 's-123', uid: 'u-1' } });
    expect(aGTM.d.session_status).toBe('preset');
  });

  test('is "preset_with_consent" when cfg.session carries a valid consent object (sid optional)', () => {
    resetAGTM({ session: { consent: { hasResponse: true, services: ',svc1,' } } });
    expect(aGTM.d.session_status).toBe('preset_with_consent');
  });

  test('is "preset" when cfg.session has sid but consent is malformed (missing hasResponse)', () => {
    resetAGTM({ session: { sid: 's-1', consent: { services: ',svc1,' } } });
    expect(aGTM.d.session_status).toBe('preset');
  });

  test('stays empty when cfg.session is missing both sid and consent', () => {
    resetAGTM({ session: { uid: 'u-1' } }); // uid alone is no longer enough
    expect(aGTM.d.session_status).toBe('');
  });

  test('stays empty when cfg.session is not an object', () => {
    resetAGTM({ session: 'invalid' });
    expect(aGTM.d.session_status).toBe('');
  });
});

describe('aGTM.d.session_status — run_cc() lifecycle', () => {
  beforeEach(() => {
    MockXHR.install();
  });

  afterEach(() => {
    MockXHR.reset();
    delete aGTM.f.consent_check;
  });

  test('transitions to "synced" after run_cc detects diff and POST returns 2xx', () => {
    resetAGTM({
      consent_store_url: 'https://store.example.com/consent',
      session: { sid: 's-1', consent: { hasResponse: true, services: ',svc-old,' } }
    });
    setupRunCc();
    aGTM.f.consent_check = function () {
      aGTM.d.consent.hasResponse = true;
      aGTM.d.consent.services = ',svc-new,';
      return true;
    };
    aGTM.f.run_cc('update');
    const xhr = MockXHR.instances[MockXHR.instances.length - 1];
    expect(xhr).toBeDefined();
    xhr.respond(200, { ok: true });
    expect(aGTM.d.session_status).toBe('synced');
  });

  test('transitions to "confirmed" when run_cc finds no diff (preset matches CMP)', () => {
    resetAGTM({
      consent_store_url: 'https://store.example.com/consent',
      session: { sid: 's-1', consent: { hasResponse: true, services: ',svc1,' } }
    });
    setupRunCc();
    aGTM.f.consent_check = function () { return true; }; // init short-circuit
    aGTM.f.run_cc('init');
    expect(aGTM.d.session_status).toBe('confirmed');
  });

  test('stays at previous status if POST fails (5xx) — does NOT advance to "synced"', () => {
    resetAGTM({
      consent_store_url: 'https://store.example.com/consent',
      session: { sid: 's-1', consent: { hasResponse: true, services: ',svc-old,' } }
    });
    setupRunCc();
    aGTM.f.consent_check = function () {
      aGTM.d.consent.hasResponse = true;
      aGTM.d.consent.services = ',svc-new,';
      return true;
    };
    aGTM.f.run_cc('update');
    const xhr = MockXHR.instances[MockXHR.instances.length - 1];
    xhr.respond(500, 'err');
    expect(aGTM.d.session_status).not.toBe('synced');
  });
});
