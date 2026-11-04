// Card #134 — two Client changes around the user-ID cookie.
//
// 1. The served config carries the cookie requirement as `uidc`, so the
//    library can tell the gtm.js request whether it is granted (aGTM.f.uidc).
// 2. F-277: under cookie_mode 'consent' with a requirement configured, an
//    existing cookie is refreshed only on a consent ON RECORD that grants it.
//    It used to be refreshed whenever no withdrawal was recorded, so a missing
//    signal counted as consent. Ignorance now neither refreshes nor deletes.
//    With no requirement configured nothing changes (F-165, see
//    cookie-condition.test.js).

import { describe, test, expect } from 'bun:test';
import { runClient, injectedConfig, cookiesDeleted, cookiesWritten } from './client-harness.js';
import { resetAGTM } from '../helpers.js';

/** The gtm.js src the library builds for one container (stub as in test/gtm_load_env.test.js). */
function gtmSrc(opts) {
  const inserted = [];
  const anchor = { parentNode: { insertBefore: (node) => { inserted.push(node); return node; } } };
  const realGet = document.getElementsByTagName;
  document.getElementsByTagName = (tag) => (tag === 'script' ? [anchor] : realGet(tag));
  window.dataLayer = [];
  aGTM.c.gdl = 'dataLayer';
  aGTM.d.config = true;
  try { aGTM.f.gtm_load(window, document, 'GTM-TEST', 'id', 'dataLayer', opts); } finally { document.getElementsByTagName = realGet; }
  return inserted.length ? inserted[inserted.length - 1].src : '';
}

const C_COOKIE = 'C.1.t.abcdef123456.1700000000';
const GTM = [{ gtm_id: 'GTM-TEST', gtm_consent: true }];
const SESSION = { session_api_url: 'https://api.example/tp/session', tenant_id: 't' };
const BASE = { gtm: GTM, cookie_name: '_tpf', cookie_mode: 'consent', consent_service: 'UserID', cookie_delete: true, ...SESSION };

function answer(body, status) {
  return () => ({ statusCode: status || 200, body: JSON.stringify(body) });
}

describe('#134 — the served config carries the cookie requirement', () => {
  test('requirement configured: uidc mirrors the three fields', () => {
    const r = runClient({ data: { ...BASE, consent_purpose: 'statistics' }, http: answer({ sessionId: 's1', counter: 0 }) });
    expect(r.throws).toBeNull();
    expect(injectedConfig(r.body).uidc).toEqual({ service: 'UserID', purpose: 'statistics', vendor: '', any: false });
  });

  test('no requirement configured: no uidc, the receiver keeps its fail-closed default', () => {
    const data = { ...BASE };
    delete data.consent_service;
    const r = runClient({ data: data, http: answer({ sessionId: 's1', counter: 0 }) });
    expect(r.throws).toBeNull();
    expect(injectedConfig(r.body).uidc).toBeUndefined();
  });

  test('no requirement but cookie_without_condition: uidc with any:true', () => {
    const data = { ...BASE, cookie_without_condition: true };
    delete data.consent_service;
    const r = runClient({ data: data, http: answer({ sessionId: 's1', counter: 0 }) });
    expect(injectedConfig(r.body).uidc).toEqual({ service: '', purpose: '', vendor: '', any: true });
  });

  test('also under cookie_mode always — it reports the consent, not the cookie rule', () => {
    const r = runClient({ data: { ...BASE, cookie_mode: 'always' }, http: answer({ sessionId: 's1', counter: 0 }) });
    expect(injectedConfig(r.body).uidc.service).toBe('UserID');
  });

  test('not under cookie_mode never — leftover field values must not say "granted"', () => {
    const r = runClient({ data: { ...BASE, cookie_mode: 'never' }, http: answer({ sessionId: 's1', counter: 0 }) });
    expect(r.throws).toBeNull();
    expect(injectedConfig(r.body).uidc).toBeUndefined();
  });

  test('end to end: the served uidc, fed to the library, puts the right bit on gtm.js', () => {
    const r = runClient({ data: { ...BASE, gtm: [{ gtm_id: 'GTM-TEST', gtm_consent: true, gtm_url: 'https://s.example/gtm.js' }] }, http: answer({ sessionId: 's1', counter: 0 }) });
    const served = injectedConfig(r.body);
    resetAGTM();
    aGTM.f.config({ gtm: served.gtm, uidc: served.uidc });
    aGTM.d.consent = { hasResponse: true, services: ',UserID,' };
    expect(gtmSrc(served.gtm['GTM-TEST'])).toMatch(/&uidc=1$/);
    aGTM.d.consent = { hasResponse: true, services: ',Google Analytics,' };
    expect(gtmSrc(served.gtm['GTM-TEST'])).toMatch(/&uidc=0$/);
  });
});

describe('F-277 — refresh only on a recorded grant', () => {
  test('recorded grant: refreshed', () => {
    const r = runClient({ data: { ...BASE }, cookies: [C_COOKIE], http: answer({ sessionId: 's1', counter: 3, consent: { hasResponse: true, services: ',UserID,' } }) });
    expect(r.throws).toBeNull();
    expect(cookiesWritten(r).map((c) => c.val)).toEqual([C_COOKIE]);
  });

  test('no consent on record (returning visitor → auto-denial preset): neither refreshed nor deleted', () => {
    const r = runClient({ data: { ...BASE }, cookies: [C_COOKIE], http: answer({ sessionId: 's1', counter: 3 }) });
    expect(r.throws).toBeNull();
    // The path this test is about: the Client delivers its auto-denial block.
    // Before F-277 the cookie was refreshed right here.
    expect(injectedConfig(r.body).session.consent.services).toBe(',aGTMconsent,');
    expect(cookiesWritten(r)).toEqual([]);
    expect(cookiesDeleted(r)).toEqual([]);
  });

  test('Session API outage: neither refreshed nor deleted', () => {
    const r = runClient({ data: { ...BASE }, cookies: [C_COOKIE], http: answer({ error: 'down' }, 503) });
    expect(r.throws).toBeNull();
    expect(cookiesWritten(r)).toEqual([]);
    expect(cookiesDeleted(r)).toEqual([]);
  });

  test('recorded answer without a decision (hasResponse false): not refreshed', () => {
    const r = runClient({ data: { ...BASE }, cookies: [C_COOKIE], http: answer({ sessionId: 's1', counter: 3, consent: { hasResponse: false, services: ',UserID,' } }) });
    expect(r.throws).toBeNull();
    expect(cookiesWritten(r)).toEqual([]);
    expect(cookiesDeleted(r)).toEqual([]);
  });

  test('cookie_mode always: still refreshed without any signal (unchanged default)', () => {
    const r = runClient({ data: { ...BASE, cookie_mode: 'always' }, cookies: [C_COOKIE], http: answer({ sessionId: 's1', counter: 3 }) });
    expect(r.throws).toBeNull();
    expect(cookiesWritten(r).map((c) => c.val)).toEqual([C_COOKIE]);
  });
});
