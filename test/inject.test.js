// test/inject.test.js — tests for aGTM.f.inject() session_wait gate
import { describe, test, expect, beforeEach } from 'bun:test';
import { resetAGTM } from './helpers.js';

describe('aGTM.f.inject() — session_wait gate', () => {
  beforeEach(() => {
    resetAGTM();
    // Minimal state: config applied, consent not yet available
    aGTM.d.config = true;
    aGTM.c.gdl = 'dataLayer';
    aGTM.c.gtmPurposes = '';
    aGTM.c.gtmServices = '';
    aGTM.c.gtmVendors  = '';
    aGTM.c.iframeSupport = false;
    globalThis.dataLayer = [];
  });

  test('returns false when session_wait=true and session_ready=false', () => {
    aGTM.c.session_wait   = true;
    aGTM.d.session_ready  = false;
    aGTM.d.consent = { hasResponse: true };
    const result = aGTM.f.inject();
    expect(result).toBe(false);
    // Confirm it was the session gate, not the consent gate: no e13 in log
    const hasE13 = aGTM.l.some(e => e.id === 'e13');
    expect(hasE13).toBe(false);
  });

  test('passes session gate and reaches consent gate when session_wait=true and session_ready=true', () => {
    aGTM.c.session_wait   = true;
    aGTM.d.session_ready  = true;
    aGTM.d.consent = { hasResponse: false }; // consent not ready
    aGTM.f.inject();
    // Should have logged e13 (consent not ready), meaning session gate was passed
    const hasE13 = aGTM.l.some(e => e.id === 'e13');
    expect(hasE13).toBe(true);
  });

  test('passes session gate when session_wait=false regardless of session_ready', () => {
    aGTM.c.session_wait   = false;
    aGTM.d.session_ready  = false; // not ready, but wait=false
    aGTM.d.consent = { hasResponse: false };
    aGTM.f.inject();
    // e13 logged → session gate did not block
    const hasE13 = aGTM.l.some(e => e.id === 'e13');
    expect(hasE13).toBe(true);
  });

  test('passes session gate when feature inactive (session_ready=true from session_fetch no-op)', () => {
    // Feature inactive: no user_id or session_url → session_fetch sets session_ready=true
    aGTM.c.session_wait   = true;
    aGTM.d.session_ready  = true;  // as session_fetch() would set it
    aGTM.d.consent = { hasResponse: false };
    aGTM.f.inject();
    const hasE13 = aGTM.l.some(e => e.id === 'e13');
    expect(hasE13).toBe(true);
  });
});
