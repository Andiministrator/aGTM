// test/fire_consent.test.js — tests for fire() consent gating and event routing
import { describe, test, expect, beforeEach } from 'bun:test';
import { resetAGTM, MockXHR } from './helpers.js';

describe('aGTM.f.fire() — consent gating', () => {
  beforeEach(() => {
    MockXHR.install();
    resetAGTM();
    aGTM.f.config({ gdl: 'dataLayer' });
    aGTM.d.init = true;
    globalThis.dataLayer = [];
  });

  // ── Queuing before consent ─────────────────────────────────────────────────

  test('queues event in aGTM.d.f when no consent', () => {
    aGTM.d.consent = { hasResponse: false, gtmConsent: false };
    aGTM.f.fire({ event: 'purchase' });
    expect(aGTM.d.f.length).toBe(1);
    expect(aGTM.d.f[0].event).toBe('purchase');
    expect(globalThis.dataLayer.length).toBe(0);
  });

  test('queues event when hasResponse=true but gtmConsent=false', () => {
    aGTM.d.consent = { hasResponse: true, gtmConsent: false };
    aGTM.f.fire({ event: 'addToCart' });
    expect(aGTM.d.f.length).toBe(1);
    expect(globalThis.dataLayer.length).toBe(0);
  });

  test('queued event has aGTMts removed (deduplication guard stripped)', () => {
    aGTM.d.consent = { hasResponse: false, gtmConsent: false };
    aGTM.f.fire({ event: 'test' });
    expect(aGTM.d.f[0].aGTMts).toBeUndefined();
  });

  // ── Immediate dispatch with consent ───────────────────────────────────────

  test('dispatches event to dataLayer when gtmConsent=true', () => {
    aGTM.d.consent = { hasResponse: true, gtmConsent: true };
    aGTM.f.fire({ event: 'pageview' });
    expect(globalThis.dataLayer.length).toBe(1);
    expect(globalThis.dataLayer[0].event).toBe('pageview');
    expect(aGTM.d.f.length).toBe(0);
  });

  // ── _noConsent bypass ──────────────────────────────────────────────────────

  test('_noConsent=true bypasses consent gate and dispatches immediately', () => {
    aGTM.d.consent = { hasResponse: false, gtmConsent: false };
    aGTM.f.fire({ event: 'form_error', _noConsent: true });
    expect(globalThis.dataLayer.length).toBe(1);
    expect(aGTM.d.f.length).toBe(0);
  });

  test('_noConsent is preserved on the dispatched dataLayer event', () => {
    aGTM.d.consent = { hasResponse: false, gtmConsent: false };
    aGTM.f.fire({ event: 'legal_notice', _noConsent: true });
    expect(globalThis.dataLayer[0]._noConsent).toBe(true);
  });

  // ── aGTM* event bypass ────────────────────────────────────────────────────

  test('events starting with "aGTM" bypass consent gate', () => {
    aGTM.d.consent = { hasResponse: false, gtmConsent: false };
    aGTM.f.fire({ event: 'aGTM_ready' });
    expect(globalThis.dataLayer.length).toBe(1);
    expect(aGTM.d.f.length).toBe(0);
  });

  // ── Deduplication guards ──────────────────────────────────────────────────

  test('skips event that already has aGTMts set (already processed)', () => {
    aGTM.d.consent = { hasResponse: true, gtmConsent: true };
    aGTM.f.fire({ event: 'test', aGTMts: Date.now() });
    expect(globalThis.dataLayer.length).toBe(0);
  });

  test('skips GTM-internal ping events (non-null eventModel)', () => {
    aGTM.d.consent = { hasResponse: true, gtmConsent: true };
    aGTM.f.fire({ event: 'gtm.js', eventModel: { some: 'data' } });
    expect(globalThis.dataLayer.length).toBe(0);
  });

  // ── aGTMparams ────────────────────────────────────────────────────────────

  test('sets aGTMparams as deep copy of event on dispatched events', () => {
    aGTM.d.consent = { hasResponse: true, gtmConsent: true };
    aGTM.f.fire({ event: 'checkout', step: 2 });
    const pushed = globalThis.dataLayer[0];
    expect(pushed.aGTMparams).toBeDefined();
    expect(pushed.aGTMparams.event).toBe('checkout');
    expect(pushed.aGTMparams.step).toBe(2);
  });

  // ── fire_callback ─────────────────────────────────────────────────────────

  test('calls fire_callback after dispatch', () => {
    aGTM.d.consent = { hasResponse: true, gtmConsent: true };
    let called = false;
    aGTM.f.fire_callback = function() { called = true; };
    aGTM.f.fire({ event: 'test' });
    expect(called).toBe(true);
    delete aGTM.f.fire_callback;
  });
});
