// test/session_preset.test.js — tests for cfg.session preset gate (Phase 2 scope).
// Phase 3 will extend with consent-payload validation + consent_hash seeding tests.
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

  test('accepts cfg.session that carries only a consent object (no sid)', () => {
    resetAGTM({
      session: { consent: { hasResponse: true, services: ',svc1,' } }
    });
    expect(aGTM.d.session_status).toBe('preset');
    expect(aGTM.d.session.consent.services).toBe(',svc1,');
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
