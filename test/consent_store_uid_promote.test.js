// test/consent_store_uid_promote.test.js — browser-side F→C uid handoff.
// When the sGTM Client's /aGTMconsent handler returns a new `uid` in the
// response body (because it just promoted a fingerprint user via api4sgtm
// /promote), the library must adopt that uid into aGTM.d.session.uid so
// the next consent diff POST and any downstream consumers see the new value.
//
// Adoption rule: only adopt when `resp.uid` starts with `C.` (the api4sgtm
// canonical C-prefix). This prevents a race condition where a second consent
// POST whose `finalUid` falls back to F.* (e.g. promote 404 because the
// session was already migrated by the first POST) could overwrite the
// already-adopted C.* uid.
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

const fireUpdateAndPost = () => {
  aGTM.f.consent_check = function() {
    aGTM.d.consent.hasResponse = true;
    aGTM.d.consent.services = ',svc-new,';
    aGTM.d.consent.purposes = '';
    aGTM.d.consent.vendors = '';
    return true;
  };
  aGTM.f.run_cc('update');
};

describe('aGTM.f.run_cc() — F→C uid handoff via consent-store response', () => {
  beforeEach(() => { MockXHR.install(); });
  afterEach(() => {
    MockXHR.reset();
    delete aGTM.f.consent_check;
  });

  test('response with new C.* uid → aGTM.d.session.uid is updated', () => {
    resetAGTM({
      consent_store_url: 'https://store.example.com/consent',
      session: { sid: 's-1', uid: 'F$1$tenant$abc.20260505', consent: { hasResponse: true, services: ',svc-old,' } }
    });
    setupRunCc();
    fireUpdateAndPost();
    const posts = consentXHRs();
    expect(posts.length).toBe(1);
    posts[0].respond(200, { ok: true, uid: 'C.1.tenant.987654321012.1714900000000' });
    expect(aGTM.d.session.uid).toBe('C.1.tenant.987654321012.1714900000000');
  });

  test('response with identical C.* uid → no change', () => {
    resetAGTM({
      consent_store_url: 'https://store.example.com/consent',
      session: { sid: 's-1', uid: 'C.1.tenant.111.222', consent: { hasResponse: true, services: ',svc-old,' } }
    });
    setupRunCc();
    fireUpdateAndPost();
    consentXHRs()[0].respond(200, { ok: true, uid: 'C.1.tenant.111.222' });
    expect(aGTM.d.session.uid).toBe('C.1.tenant.111.222');
  });

  test('response without uid field → no change, no error', () => {
    resetAGTM({
      consent_store_url: 'https://store.example.com/consent',
      session: { sid: 's-1', uid: 'F$1$tenant$abc.20260505', consent: { hasResponse: true, services: ',svc-old,' } }
    });
    setupRunCc();
    fireUpdateAndPost();
    // legacy server / promote-disabled sGTM Client returns just {ok:true}
    consentXHRs()[0].respond(200, { ok: true });
    expect(aGTM.d.session.uid).toBe('F$1$tenant$abc.20260505');
  });

  test('response with empty body → no change, no error, no log noise', () => {
    resetAGTM({
      consent_store_url: 'https://store.example.com/consent',
      session: { sid: 's-1', uid: 'F$1$tenant$abc.20260505', consent: { hasResponse: true, services: ',svc-old,' } }
    });
    setupRunCc();
    fireUpdateAndPost();
    const logBefore = aGTM.l.length;
    consentXHRs()[0].respond(200, '');
    expect(aGTM.d.session.uid).toBe('F$1$tenant$abc.20260505');
    // No m_uid_promoted, no e_consent_store_parse — only the m_consent_store_synced log.
    const newLogs = aGTM.l.slice(logBefore).map(l => l.id);
    expect(newLogs).not.toContain('e_consent_store_parse');
  });

  test('non-2xx response → uid update path not entered', () => {
    resetAGTM({
      consent_store_url: 'https://store.example.com/consent',
      session: { sid: 's-1', uid: 'F$1$tenant$abc.20260505', consent: { hasResponse: true, services: ',svc-old,' } }
    });
    setupRunCc();
    fireUpdateAndPost();
    consentXHRs()[0].respond(500, { ok: false, uid: 'C.1.shouldNotApply.999.888' });
    expect(aGTM.d.session.uid).toBe('F$1$tenant$abc.20260505');
  });

  test('response with non-string uid → no change (defensive type guard)', () => {
    resetAGTM({
      consent_store_url: 'https://store.example.com/consent',
      session: { sid: 's-1', uid: 'F$1$tenant$abc.20260505', consent: { hasResponse: true, services: ',svc-old,' } }
    });
    setupRunCc();
    fireUpdateAndPost();
    consentXHRs()[0].respond(200, { ok: true, uid: 12345 });
    expect(aGTM.d.session.uid).toBe('F$1$tenant$abc.20260505');
  });

  test('response with F.* uid → not adopted (race-safety: never downgrade from C.*)', () => {
    // Scenario: two concurrent consent POSTs from the same browser. The first
    // one promotes successfully (uid=C.*), the browser adopts it. The second
    // one's promote fails (404 — already migrated) and the server falls back
    // to echoing `finalUid=cpUid` which is the F.* from the cookie at the
    // time the second POST was sent. Without the C.-prefix gate, this F.*
    // echo would overwrite the C.* — breaking subsequent persistence.
    resetAGTM({
      consent_store_url: 'https://store.example.com/consent',
      session: { sid: 's-1', uid: 'C.1.tenant.111.222', consent: { hasResponse: true, services: ',svc-old,' } }
    });
    setupRunCc();
    fireUpdateAndPost();
    consentXHRs()[0].respond(200, { ok: true, uid: 'F$1$tenant$abc.20260505' });
    expect(aGTM.d.session.uid).toBe('C.1.tenant.111.222');
  });

  test('response uid that does not start with C. → not adopted (defensive)', () => {
    // Any non-C-prefix uid is treated as a non-promote echo and ignored.
    resetAGTM({
      consent_store_url: 'https://store.example.com/consent',
      session: { sid: 's-1', uid: 'F$1$tenant$abc.20260505', consent: { hasResponse: true, services: ',svc-old,' } }
    });
    setupRunCc();
    fireUpdateAndPost();
    consentXHRs()[0].respond(200, { ok: true, uid: 'X.1.weird.value' });
    expect(aGTM.d.session.uid).toBe('F$1$tenant$abc.20260505');
  });

  test('promoted uid format from generateCookieUid: C.1.{tenant}.{rand}.{ms}', () => {
    // Verifies the C-prefix contract: a literal "C." (no fipLimiter) must
    // start the new_user_id, per api4sgtm/team-spec.md §"Promote / Migrate
    // session" ("new_user_id must start with C.").
    resetAGTM({
      consent_store_url: 'https://store.example.com/consent',
      session: { sid: 's-1', uid: 'F$1$tenant$abc.20260505', consent: { hasResponse: true, services: ',svc-old,' } }
    });
    setupRunCc();
    fireUpdateAndPost();
    // Mirror the exact format the server generates server-side
    const newUid = 'C.1.cl_planai.123456789012.1714900000000';
    consentXHRs()[0].respond(200, { ok: true, uid: newUid });
    expect(aGTM.d.session.uid).toBe(newUid);
    expect(aGTM.d.session.uid.indexOf('C.')).toBe(0);
  });
});
