// test/consent_store.test.js — Phase 3: consent diff/store mechanism
// Verifies that aGTM.f.run_cc() POSTs the consent block to consent_store_url
// only when the serialized consent has changed since the last successful POST,
// and that the hash is updated only after a 2xx response.
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resetAGTM, MockXHR } from './helpers.js';

const consentXHRs = () =>
  MockXHR.instances.filter((x) => x.url === 'https://store.example.com/consent');

const setupRunCc = () => {
  aGTM.d.config = true;
  aGTM.d.init = true; // prevent inject() side-effects
  aGTM.d.consent = aGTM.d.consent || {};
  aGTM.c.gdl = 'dataLayer';
  aGTM.c.gtmPurposes = '';
  aGTM.c.gtmServices = '';
  aGTM.c.gtmVendors = '';
  globalThis.dataLayer = [];
};

describe('aGTM.f.run_cc() — consent diff/store', () => {
  beforeEach(() => {
    MockXHR.install();
  });

  afterEach(() => {
    MockXHR.reset();
    delete aGTM.f.consent_check;
  });

  test('no POST when consent_store_url is empty (feature inactive)', () => {
    resetAGTM();
    setupRunCc();
    aGTM.f.consent_check = function() {
      aGTM.d.consent.hasResponse = true;
      aGTM.d.consent.services = ',svc1,';
      aGTM.d.consent.purposes = '';
      aGTM.d.consent.vendors = '';
      return true;
    };
    aGTM.f.run_cc('update');
    expect(MockXHR.instances.length).toBe(0);
  });

  test('CMP response differs from preset → exactly one POST, session_status === "synced" on 2xx', () => {
    resetAGTM({
      consent_store_url: 'https://store.example.com/consent',
      session: { sid: 's-1', uid: 'u-1', consent: { hasResponse: true, services: ',svc-old,' } }
    });
    setupRunCc();
    // CMP returns different services
    aGTM.f.consent_check = function() {
      aGTM.d.consent.hasResponse = true;
      aGTM.d.consent.services = ',svc-new,';
      aGTM.d.consent.purposes = '';
      aGTM.d.consent.vendors = '';
      return true;
    };
    aGTM.f.run_cc('update');
    const posts = consentXHRs();
    expect(posts.length).toBe(1);
    posts[0].respond(200, { ok: true });
    expect(aGTM.d.session_status).toBe('synced');
    // Payload should include uid, sid, and the consent block (without gtmConsent/blocked)
    const body = JSON.parse(posts[0]._body);
    const inner = body.e || body;
    expect(inner.uid).toBe('u-1');
    expect(inner.sid).toBe('s-1');
    expect(inner.consent.services).toBe(',svc-new,');
    expect(inner.consent.gtmConsent).toBeUndefined();
    expect(inner.consent.blocked).toBeUndefined();
  });

  test('identical CMP response after preset → no POST, session_status === "confirmed"', () => {
    resetAGTM({
      consent_store_url: 'https://store.example.com/consent',
      session: { sid: 's-1', uid: 'u-1', consent: { hasResponse: true, services: ',svc1,' } }
    });
    setupRunCc();
    // CMP returns the EXACT same consent as preset
    aGTM.f.consent_check = function() {
      aGTM.d.consent.hasResponse = true;
      aGTM.d.consent.services = ',svc1,';
      aGTM.d.consent.purposes = '';
      aGTM.d.consent.vendors = '';
      return true;
    };
    aGTM.f.run_cc('update');
    expect(consentXHRs().length).toBe(0);
    expect(aGTM.d.session_status).toBe('confirmed');
  });

  test('multiple run_cc("update") with identical data → only first POST fires (hash dedup)', () => {
    resetAGTM({ consent_store_url: 'https://store.example.com/consent' });
    setupRunCc();
    aGTM.f.consent_check = function() {
      aGTM.d.consent.hasResponse = true;
      aGTM.d.consent.services = ',svc1,';
      aGTM.d.consent.purposes = '';
      aGTM.d.consent.vendors = '';
      return true;
    };
    aGTM.f.run_cc('update');
    consentXHRs()[0].respond(200, { ok: true });
    aGTM.f.run_cc('update');
    aGTM.f.run_cc('update');
    expect(consentXHRs().length).toBe(1);
  });

  test('per-service revocation (services list shrinks) → new POST fires', () => {
    resetAGTM({ consent_store_url: 'https://store.example.com/consent' });
    setupRunCc();
    let services = ',svc1,svc2,';
    aGTM.f.consent_check = function() {
      aGTM.d.consent.hasResponse = true;
      aGTM.d.consent.services = services;
      aGTM.d.consent.purposes = '';
      aGTM.d.consent.vendors = '';
      return true;
    };
    aGTM.f.run_cc('update');
    consentXHRs()[0].respond(200, { ok: true });
    expect(consentXHRs().length).toBe(1);
    // User revokes svc2
    services = ',svc1,';
    aGTM.f.run_cc('update');
    expect(consentXHRs().length).toBe(2);
  });

  test('consent_id change with same services → POST fires (blacklist hash includes consent_id)', () => {
    resetAGTM({ consent_store_url: 'https://store.example.com/consent' });
    setupRunCc();
    let cid = 'cid-1';
    aGTM.f.consent_check = function() {
      aGTM.d.consent.hasResponse = true;
      aGTM.d.consent.services = ',svc1,';
      aGTM.d.consent.purposes = '';
      aGTM.d.consent.vendors = '';
      aGTM.d.consent.consent_id = cid;
      return true;
    };
    aGTM.f.run_cc('update');
    consentXHRs()[0].respond(200, { ok: true });
    cid = 'cid-2';
    aGTM.f.run_cc('update');
    // consent_id is in the blacklist-hash → diff detected → second POST
    expect(consentXHRs().length).toBe(2);
  });

  test('gtmConsent change alone (services unchanged) → does NOT POST (excluded from hash)', () => {
    resetAGTM({ consent_store_url: 'https://store.example.com/consent' });
    setupRunCc();
    aGTM.f.consent_check = function() {
      aGTM.d.consent.hasResponse = true;
      aGTM.d.consent.services = ',svc1,';
      aGTM.d.consent.purposes = '';
      aGTM.d.consent.vendors = '';
      return true;
    };
    aGTM.f.run_cc('update');
    consentXHRs()[0].respond(200, { ok: true });
    // Mutate gtmConsent only
    aGTM.d.consent.gtmConsent = !aGTM.d.consent.gtmConsent;
    aGTM.f.run_cc('update');
    // gtmConsent is excluded from hash → no diff → no second POST
    expect(consentXHRs().length).toBe(1);
  });

  test('POST failure (5xx) → consent_hash stays unchanged, next run_cc retries', () => {
    resetAGTM({ consent_store_url: 'https://store.example.com/consent' });
    setupRunCc();
    aGTM.f.consent_check = function() {
      aGTM.d.consent.hasResponse = true;
      aGTM.d.consent.services = ',svc1,';
      aGTM.d.consent.purposes = '';
      aGTM.d.consent.vendors = '';
      return true;
    };
    aGTM.f.run_cc('update');
    expect(consentXHRs().length).toBe(1);
    // Server returns 500 → hash should NOT be updated
    consentXHRs()[0].respond(500, 'Internal Server Error');
    expect(aGTM.d.consent_hash).toBe('');
    expect(aGTM.d.session_status).not.toBe('synced');
    // Next run_cc with same data → diff still detected (hash unchanged) → retry POST
    aGTM.f.run_cc('update');
    expect(consentXHRs().length).toBe(2);
  });

  test('POST is skipped on init when no diff exists (preset hash matches CMP)', () => {
    // Preset consent matches what consent_check returns on init
    resetAGTM({
      consent_store_url: 'https://store.example.com/consent',
      session: { sid: 's-1', uid: 'u-1', consent: { hasResponse: true, services: ',svc1,' } }
    });
    setupRunCc();
    aGTM.f.consent_check = function() { return true; }; // init short-circuits because hasResponse=true
    aGTM.f.run_cc('init');
    expect(consentXHRs().length).toBe(0);
    expect(aGTM.d.session_status).toBe('confirmed');
  });

  test('hash uses xsend envelope: body is {e: <payload>} with consent block intact', () => {
    resetAGTM({ consent_store_url: 'https://store.example.com/consent' });
    setupRunCc();
    aGTM.f.consent_check = function() {
      aGTM.d.consent.hasResponse = true;
      aGTM.d.consent.services = ',svc1,';
      aGTM.d.consent.purposes = ',p1,';
      aGTM.d.consent.vendors = ',v1,';
      aGTM.d.consent.feedback = 'CMP accepted';
      return true;
    };
    aGTM.f.run_cc('update');
    const body = JSON.parse(consentXHRs()[0]._body);
    expect(body.e).toBeDefined();
    expect(body.e.consent.hasResponse).toBe(true);
    expect(body.e.consent.services).toBe(',svc1,');
    expect(body.e.consent.purposes).toBe(',p1,');
    expect(body.e.consent.vendors).toBe(',v1,');
    expect(body.e.consent.feedback).toBe('CMP accepted');
  });
});
