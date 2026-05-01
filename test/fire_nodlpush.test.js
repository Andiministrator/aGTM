// test/fire_nodlpush.test.js — tests for fire() _noDLPush flag
import { describe, test, expect, beforeEach } from 'bun:test';
import { resetAGTM, MockXHR } from './helpers.js';

describe('aGTM.f.fire() — _noDLPush flag', () => {
  beforeEach(() => {
    MockXHR.install();
    resetAGTM();
    aGTM.f.config({ gdl: 'dataLayer', transport_url: 'https://collect.example.com/ae' });
    aGTM.d.init = true;
    aGTM.d.consent = { hasResponse: true, gtmConsent: true };
    globalThis.dataLayer = [];
  });

  // ── GTM dataLayer push is suppressed ──────────────────────────────────────

  test('_noDLPush=true does not push to GTM dataLayer', () => {
    aGTM.f.fire({ event: 'page_view', _noDLPush: true });
    expect(globalThis.dataLayer.length).toBe(0);
  });

  test('_noDLPush=false (default) pushes to GTM dataLayer normally', () => {
    aGTM.f.fire({ event: 'page_view' });
    expect(globalThis.dataLayer.length).toBe(1);
    expect(globalThis.dataLayer[0].event).toBe('page_view');
  });

  // ── Internal aGTM log is always preserved ─────────────────────────────────

  test('_noDLPush=true still records event in aGTM.d.dl', () => {
    aGTM.f.fire({ event: 'purchase', _noDLPush: true });
    expect(aGTM.d.dl.length).toBe(1);
    expect(aGTM.d.dl[0].event).toBe('purchase');
  });

  test('_noDLPush=true still logs to aGTM.l (m7 entry)', () => {
    const before = aGTM.l.length;
    aGTM.f.fire({ event: 'purchase', _noDLPush: true });
    expect(aGTM.l.length).toBeGreaterThan(before);
    expect(aGTM.l[aGTM.l.length - 1].id).toBe('m7');
  });

  // ── Combined with _noConsent ───────────────────────────────────────────────

  test('_noDLPush + _noConsent: no DL push even without consent', () => {
    aGTM.d.consent = { hasResponse: false, gtmConsent: false };
    aGTM.f.fire({ event: 'pre_consent_event', _noConsent: true, _noDLPush: true });
    expect(globalThis.dataLayer.length).toBe(0);
    expect(aGTM.d.f.length).toBe(0);       // not queued either
    expect(aGTM.d.dl.length).toBe(1);       // but in internal log
  });

  test('_noConsent without _noDLPush still pushes to GTM dataLayer', () => {
    aGTM.d.consent = { hasResponse: false, gtmConsent: false };
    aGTM.f.fire({ event: 'legal_event', _noConsent: true });
    expect(globalThis.dataLayer.length).toBe(1);
  });

  // ── POST transport still fires ─────────────────────────────────────────────

  test('_noDLPush=true still sends POST when _post is set', () => {
    aGTM.f.fire({ event: 'purchase', _noDLPush: true, _post: true });
    expect(MockXHR.instances.length).toBe(1);
    expect(MockXHR.last.url).toBe('https://collect.example.com/ae');
    expect(globalThis.dataLayer.length).toBe(0);
  });

  // ── fire_callback still fires ─────────────────────────────────────────────

  test('_noDLPush=true still calls fire_callback', () => {
    let called = false;
    aGTM.f.fire_callback = function() { called = true; };
    aGTM.f.fire({ event: 'test', _noDLPush: true });
    expect(called).toBe(true);
    delete aGTM.f.fire_callback;
  });

  // ── _noDLPush is preserved in aGTM.d.dl entry ────────────────────────────

  test('_noDLPush flag is preserved in the aGTM.d.dl entry', () => {
    aGTM.f.fire({ event: 'test', _noDLPush: true });
    expect(aGTM.d.dl[0]._noDLPush).toBe(true);
  });

  // ── sendnaus_callback fires even with _noDLPush ───────────────────────────

  test('_noDLPush=true still calls sendnaus_callback', () => {
    let callbackArg = null;
    aGTM.f.sendnaus_callback = function(o) { callbackArg = o; };
    aGTM.f.fire({ event: 'test', _noDLPush: true });
    expect(callbackArg).not.toBeNull();
    expect(callbackArg.event).toBe('test');
    delete aGTM.f.sendnaus_callback;
  });

  test('sendnaus_callback is NOT called twice when _noDLPush=false', () => {
    let count = 0;
    aGTM.f.sendnaus_callback = function() { count++; };
    aGTM.f.fire({ event: 'test' });
    expect(count).toBe(1);
    delete aGTM.f.sendnaus_callback;
  });
});
