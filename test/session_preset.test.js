// test/session_preset.test.js — tests for cfg.session preset gate.
// Phase 3 adds consent-payload validation + consent_hash seeding.
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resetAGTM, MockXHR } from './helpers.js';

describe('cfg.session preset gate', () => {
  beforeEach(() => {
    MockXHR.install();
  });

  afterEach(() => {
    MockXHR.reset();
  });

  test('pre-populates aGTM.d.session and sets session_status="preset" when sid is present', () => {
    resetAGTM({
      session: { sid: 's-preset-1', uid: 'u-42', ga4sid: '17163412742' }
    });
    expect(aGTM.d.session.sid).toBe('s-preset-1');
    expect(aGTM.d.session.uid).toBe('u-42');
    expect(aGTM.d.session.ga4sid).toBe('17163412742');
    expect(aGTM.d.session_status).toBe('preset');
  });

  test('accepts cfg.session with sid only (no uid required)', () => {
    resetAGTM({ session: { sid: 'abc123' } });
    expect(aGTM.d.session.sid).toBe('abc123');
    expect(aGTM.d.session_status).toBe('preset');
  });

  test('accepts cfg.session that carries only a valid consent object (no sid)', () => {
    resetAGTM({
      session: { consent: { hasResponse: true, services: ',svc1,' } }
    });
    expect(aGTM.d.session_status).toBe('preset_with_consent');
    expect(aGTM.d.session.consent.services).toBe(',svc1,');
    // Phase 3: consent is also seeded into aGTM.d.consent and hash is computed
    expect(aGTM.d.consent.services).toBe(',svc1,');
    expect(aGTM.d.consent.hasResponse).toBe(true);
    expect(aGTM.d.consent_hash).not.toBe('');
  });

  test('ignores cfg.session when neither sid nor consent is present', () => {
    resetAGTM({ session: { uid: 'u-1' } }); // uid alone is no longer enough
    expect(aGTM.d.session_status).toBe('');
    // session stays at default (empty object from objinit)
    expect(aGTM.d.session.uid).toBeUndefined();
  });

  test('ignores cfg.session when it is not an object', () => {
    resetAGTM({ session: 'invalid' });
    expect(aGTM.d.session_status).toBe('');
  });

  test('deep-copies cfg.session so later mutation of the source does not leak', () => {
    var src = { sid: 's-1', extra: { nested: 'value' } };
    resetAGTM({ session: src });
    src.extra.nested = 'mutated';
    expect(aGTM.d.session.extra.nested).toBe('value');
  });
});

// Phase 3: malformed consent payload validation
describe('cfg.session.consent — malformed input', () => {
  beforeEach(() => {
    MockXHR.install();
  });

  afterEach(() => {
    MockXHR.reset();
  });

  test('cfg.session.consent = null → falls back to plain "preset" status, no consent seeded', () => {
    resetAGTM({ session: { sid: 's-1', consent: null } });
    expect(aGTM.d.session_status).toBe('preset');
    expect(aGTM.d.consent.hasResponse).toBe(false);
    expect(aGTM.d.consent_hash).toBe('');
  });

  test('cfg.session.consent = {} (no hasResponse) → ignored', () => {
    resetAGTM({ session: { sid: 's-1', consent: {} } });
    expect(aGTM.d.session_status).toBe('preset');
    expect(aGTM.d.consent.hasResponse).toBe(false);
    expect(aGTM.d.consent_hash).toBe('');
  });

  test('cfg.session.consent = "string" → ignored', () => {
    resetAGTM({ session: { sid: 's-1', consent: 'yes' } });
    expect(aGTM.d.session_status).toBe('preset');
    expect(aGTM.d.consent_hash).toBe('');
  });

  test('cfg.session.consent has hasResponse but no services field → ignored', () => {
    resetAGTM({ session: { sid: 's-1', consent: { hasResponse: true } } });
    expect(aGTM.d.session_status).toBe('preset');
    expect(aGTM.d.consent_hash).toBe('');
  });

  test('cfg.session.consent has hasResponse=false (string services present) → ignored', () => {
    resetAGTM({ session: { sid: 's-1', consent: { hasResponse: false, services: ',svc,' } } });
    expect(aGTM.d.session_status).toBe('preset');
    expect(aGTM.d.consent_hash).toBe('');
  });
});

// Phase 3: synchronous call_cc trigger (B1 fix)
describe('config() — synchronous call_cc trigger when preset consent is usable', () => {
  beforeEach(() => {
    MockXHR.install();
  });

  afterEach(() => {
    MockXHR.reset();
    delete aGTM.f.consent_check;
  });

  test('calls run_cc/call_cc synchronously when preset consent has hasResponse=true AND consent_check is defined', () => {
    // Pre-define consent_check so call_cc can succeed
    globalThis.aGTM = globalThis.aGTM || {f: {}};
    aGTM.f = aGTM.f || {};
    aGTM.f.consent_check = function() { return true; };
    let injected = false;
    const origInject = aGTM.f.inject;
    aGTM.f.inject = function() { injected = true; return true; };
    resetAGTM({
      session: { sid: 's-1', consent: { hasResponse: true, services: ',svc,' } },
      gtm: {},
      cmp: 'none'
    });
    aGTM.f.inject = origInject;
    // Synchronous call_cc → run_cc('init') → consent_check returns true →
    // chelp passes (no required services configured) → gtmConsent=true →
    // call_cc → inject() called immediately (no 500 ms wait).
    expect(injected).toBe(true);
    expect(aGTM.d.consent.gtmConsent).toBe(true);
  });

  test('does NOT call inject when consent_check is undefined (graceful no-op)', () => {
    // No consent_check defined
    let injected = false;
    const origInject = aGTM.f && aGTM.f.inject;
    if (aGTM.f) aGTM.f.inject = function() { injected = true; return true; };
    resetAGTM({
      session: { sid: 's-1', consent: { hasResponse: true, services: ',svc,' } }
    });
    if (aGTM.f && origInject) aGTM.f.inject = origInject;
    expect(injected).toBe(false);
  });

  test('preset consent with gtmConsent:false (server-side denial) → GTM does NOT load, CMP can still update later', () => {
    // Server-side auto-denial: gtmServices is configured (required), preset
    // services do NOT match → chelp falls through to blocked=false → gtmConsent
    // stays false → inject() runs but does NOT load GTM (aGTM.d.init stays
    // false). A later CMP update can still flip it via run_cc('update').
    globalThis.aGTM = globalThis.aGTM || { f: {} };
    aGTM.f = aGTM.f || {};
    aGTM.f.consent_check = function () { return true; };
    resetAGTM({
      gtmServices: 'Google Tag Manager',
      session: {
        sid: 's-1',
        consent: {
          hasResponse: true,
          services: ',aGTMconsent,',
          gtmConsent: false,
          blocked: false
        }
      }
    });
    // chelp fails (gtmServices='Google Tag Manager' not in services), fallback
    // to blocked=false → gtmConsent=false → inject() does not run initGTM →
    // aGTM.d.init stays false.
    expect(aGTM.d.consent.gtmConsent).toBe(false);
    expect(aGTM.d.init).toBe(false);
  });
});
