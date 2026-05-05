// test/consent_store_uid_promote.test.js — browser-side F→C uid handoff.
// When the sGTM Client's /aGTMconsent handler returns a new `uid` in the
// response body (because it just promoted a fingerprint user via api4sgtm
// /promote), the library must adopt that uid into aGTM.d.session.uid so
// the next consent diff POST and any downstream consumers see the new value.
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resetAGTM, MockXHR } from './helpers.js';

const consentXHRs = () =>
  MockXHR.instances.filter((x) => x.url === 'https://store.example.com/consent');

const setupRunCc = () => {
  aGTM.d.config = true;
  aGTM.d.init = true;
  aGTM.d.consent = aGTM.d.consent || {};
  aGTM.c.gdl = 'dataLayer';
  aGTM.c.gtmPurposes = '';
  aGTM.c.gtmServices = '';
  aGTM.c.gtmVendors = '';
  globalThis.dataLayer = [];
};

describe('aGTM.f.run_cc() — F→C uid handoff via consent-store response', () => {
  beforeEach(() => { MockXHR.install(); });
  afterEach(() => {
    MockXHR.reset();
    delete aGTM.f.consent_check;
  });

  test('response with new uid → aGTM.d.session.uid is updated', () => {
    resetAGTM({
      consent_store_url: 'https://store.example.com/consent',
      session: { sid: 's-1', uid: 'F$1$tenant$abc.20260505', consent: { hasResponse: true, services: ',svc-old,' } }
    });
    setupRunCc();
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
    posts[0].respond(200, { ok: true, uid: 'C$1$tenant$987654321012.1714900000000' });
    expect(aGTM.d.session.uid).toBe('C$1$tenant$987654321012.1714900000000');
  });

  test('response with identical uid → no change', () => {
    resetAGTM({
      consent_store_url: 'https://store.example.com/consent',
      session: { sid: 's-1', uid: 'C$1$tenant$existing', consent: { hasResponse: true, services: ',svc-old,' } }
    });
    setupRunCc();
    aGTM.f.consent_check = function() {
      aGTM.d.consent.hasResponse = true;
      aGTM.d.consent.services = ',svc-new,';
      aGTM.d.consent.purposes = '';
      aGTM.d.consent.vendors = '';
      return true;
    };
    aGTM.f.run_cc('update');
    consentXHRs()[0].respond(200, { ok: true, uid: 'C$1$tenant$existing' });
    expect(aGTM.d.session.uid).toBe('C$1$tenant$existing');
  });

  test('response without uid field → no change, no error', () => {
    resetAGTM({
      consent_store_url: 'https://store.example.com/consent',
      session: { sid: 's-1', uid: 'F$1$tenant$abc.20260505', consent: { hasResponse: true, services: ',svc-old,' } }
    });
    setupRunCc();
    aGTM.f.consent_check = function() {
      aGTM.d.consent.hasResponse = true;
      aGTM.d.consent.services = ',svc-new,';
      aGTM.d.consent.purposes = '';
      aGTM.d.consent.vendors = '';
      return true;
    };
    aGTM.f.run_cc('update');
    // legacy server / promote-disabled sGTM Client returns just {ok:true}
    consentXHRs()[0].respond(200, { ok: true });
    expect(aGTM.d.session.uid).toBe('F$1$tenant$abc.20260505');
  });

  test('response with empty body → no change, no error', () => {
    resetAGTM({
      consent_store_url: 'https://store.example.com/consent',
      session: { sid: 's-1', uid: 'F$1$tenant$abc.20260505', consent: { hasResponse: true, services: ',svc-old,' } }
    });
    setupRunCc();
    aGTM.f.consent_check = function() {
      aGTM.d.consent.hasResponse = true;
      aGTM.d.consent.services = ',svc-new,';
      aGTM.d.consent.purposes = '';
      aGTM.d.consent.vendors = '';
      return true;
    };
    aGTM.f.run_cc('update');
    consentXHRs()[0].respond(200, '');
    expect(aGTM.d.session.uid).toBe('F$1$tenant$abc.20260505');
  });

  test('non-2xx response → uid update path not entered (only 2xx triggers promotion adoption)', () => {
    resetAGTM({
      consent_store_url: 'https://store.example.com/consent',
      session: { sid: 's-1', uid: 'F$1$tenant$abc.20260505', consent: { hasResponse: true, services: ',svc-old,' } }
    });
    setupRunCc();
    aGTM.f.consent_check = function() {
      aGTM.d.consent.hasResponse = true;
      aGTM.d.consent.services = ',svc-new,';
      aGTM.d.consent.purposes = '';
      aGTM.d.consent.vendors = '';
      return true;
    };
    aGTM.f.run_cc('update');
    consentXHRs()[0].respond(500, { ok: false, uid: 'C$1$shouldNotApply' });
    expect(aGTM.d.session.uid).toBe('F$1$tenant$abc.20260505');
  });

  test('response with non-string uid → no change (defensive type guard)', () => {
    resetAGTM({
      consent_store_url: 'https://store.example.com/consent',
      session: { sid: 's-1', uid: 'F$1$tenant$abc.20260505', consent: { hasResponse: true, services: ',svc-old,' } }
    });
    setupRunCc();
    aGTM.f.consent_check = function() {
      aGTM.d.consent.hasResponse = true;
      aGTM.d.consent.services = ',svc-new,';
      aGTM.d.consent.purposes = '';
      aGTM.d.consent.vendors = '';
      return true;
    };
    aGTM.f.run_cc('update');
    consentXHRs()[0].respond(200, { ok: true, uid: 12345 });
    expect(aGTM.d.session.uid).toBe('F$1$tenant$abc.20260505');
  });
});
