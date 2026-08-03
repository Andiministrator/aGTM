// test/sgtm/cookie-uid.test.js — what the sGTM Client is allowed to put into
// the visitor's user-ID cookie (F-153).
//
// The rule under test is a single sentence: an `F.*` fingerprint value must
// never be written into the cookie. The stable `C.*` is created at the moment
// consent is granted, via the promote path — that is the v1.3 semantics the
// v1.5 redesign meant to preserve and, per SESSION-REDESIGN §7b, "inadvertently
// dropped".
//
// Why it matters more than a format convention: the fingerprint is derived from
// IP + UA + client hints + ASN/geo, so it is NOT per-visitor. Two people behind
// the same NAT running the same browser produce the same value. Without a
// cookie that collision stays transient (the fingerprint carries a rolling
// YYYYMMDD); written into a cookie it freezes for cookie_lifetime — and the
// second visitor inherits the first one's identity AND their recorded consent.
//
// Why no test caught it for three findings' worth of review: the serve-path
// harness stubbed setCookie as a no-op. The one thing the Client writes into
// the browser was the one thing the suite could not see. The harness now
// records cookie writes; this file asserts on them.
import { describe, test, expect } from 'bun:test';
import { runClient, cookiesWritten, cookiesDeleted } from './client-harness.js';

const GTM = [{ gtm_id: 'GTM-TEST', gtm_consent: true }];
const SESSION = { session_api_url: 'https://api.example/tp/session', tenant_id: 't' };
const CONSENT_OK = { hasResponse: true, services: ',analytics,', purposes: '', vendors: '' };

const F_COOKIE = 'F$1$t$sha_123.20260803';
// generateRandom is stubbed to return its lower bound and getTimestampMillis is
// fixed, so the generated C.* is deterministic.
const C_EXPECTED = 'C.1$t$123456789012.1785230523000';

/** Every cookie value this run wrote (deletes excluded). */
const written = (r) => cookiesWritten(r).map((c) => c.val);

/** Session API answers with `body`; /promote answers with `promote`. */
const http = (body, promote) => (url) =>
  url.indexOf('/promote') > -1 ? promote : { statusCode: 200, body: JSON.stringify(body) };

describe('GET /aGTM.js never writes a fingerprint into the cookie', () => {
  test('default tag (cookie_mode=always, no Session API): no cookie at all before consent', () => {
    // The widest case, and the one the original report did not name: both
    // cookie_mode=always and fingerprint_allowed are DEFAULTS, so every
    // first-time visitor of a freshly created tag used to receive an F.*.
    const r = runClient({ data: { gtm: GTM, cookie_name: 'aGTMuid' } });
    expect(r.throws).toBeNull();
    expect(written(r)).toEqual([]);
  });

  test('cookie_mode=consent with consent inherited at session level: still no cookie', () => {
    // The reported case. The Session API returns a consent recorded under the
    // SAME fingerprint — possibly by a different person behind the same NAT.
    // Writing it would pin this visitor to that identity for a year.
    const r = runClient({
      data: { gtm: GTM, cookie_name: 'aGTMuid', cookie_mode: 'consent', ...SESSION },
      http: http({ sessionId: 's1', counter: 3, consent: CONSENT_OK })
    });
    expect(r.throws).toBeNull();
    expect(written(r)).toEqual([]);
  });

  test('cookie_mode=consent without consent: unchanged, nothing written', () => {
    const r = runClient({
      data: { gtm: GTM, cookie_name: 'aGTMuid', cookie_mode: 'consent', ...SESSION },
      http: http({ sessionId: 's1', counter: 0 })
    });
    expect(r.throws).toBeNull();
    expect(written(r)).toEqual([]);
  });

  test('an existing C.* cookie is still refreshed — the guard must not break the normal path', () => {
    const c = 'C.1$t$999999999999.1700000000000';
    const r = runClient({
      data: { gtm: GTM, cookie_name: 'aGTMuid', cookie_mode: 'consent', ...SESSION },
      cookies: [c],
      http: http({ sessionId: 's1', counter: 5, consent: CONSENT_OK })
    });
    expect(r.throws).toBeNull();
    expect(written(r)).toEqual([c]);
    expect(cookiesDeleted(r)).toEqual([]);
  });
});

describe('legacy F.* cookies are cleaned up, but not at the cost of an identity', () => {
  test('F.* cookie without consent is deleted instead of refreshed for another year', () => {
    // The self-reinforcement: cookieAllowed is `!!existingCookie` in consent
    // mode, so once an F.* cookie exists it renews itself on every request
    // regardless of what the visitor decided.
    const r = runClient({
      data: { gtm: GTM, cookie_name: 'aGTMuid', cookie_mode: 'consent', ...SESSION },
      cookies: [F_COOKIE],
      http: http({ sessionId: 's1', counter: 5 })
    });
    expect(r.throws).toBeNull();
    expect(written(r)).toEqual([]);
    expect(cookiesDeleted(r).length).toBe(1);
  });

  test('F.* cookie with consent is promoted to C.*, and not deleted on the way', () => {
    const r = runClient({
      data: { gtm: GTM, cookie_name: 'aGTMuid', cookie_mode: 'consent', ...SESSION },
      cookies: [F_COOKIE],
      http: http({ sessionId: 's1', counter: 5, consent: CONSENT_OK }, { statusCode: 200, body: '{"ok":true}' })
    });
    expect(r.throws).toBeNull();
    expect(written(r)).toEqual([C_EXPECTED]);
    expect(cookiesDeleted(r)).toEqual([]);
  });

  test('a FAILED promote leaves the F.* cookie alone so the next request can retry', () => {
    // The one place where "clean up aggressively" would be wrong. api4sgtm is
    // a network dependency; a 5xx or timeout is transient. Deleting here would
    // turn an API outage into tenant-wide identity loss and contradicts the
    // documented fallback ("the F.* uid is preserved").
    const r = runClient({
      data: { gtm: GTM, cookie_name: 'aGTMuid', cookie_mode: 'consent', ...SESSION },
      cookies: [F_COOKIE],
      http: http({ sessionId: 's1', counter: 5, consent: CONSENT_OK }, { statusCode: 500, body: 'boom' })
    });
    expect(r.throws).toBeNull();
    expect(written(r)).toEqual([]);
    expect(cookiesDeleted(r)).toEqual([]);
  });
});

describe('POST /aGTMconsent never writes a fingerprint either', () => {
  const consentPost = (data, opts) => runClient({
    data: { gtm: GTM, cookie_name: 'aGTMuid', cookie_mode: 'consent', consent_service: 'analytics', ...data },
    path: '/aGTMconsent',
    method: 'POST',
    reqBody: JSON.stringify({ uid: F_COOKIE, sid: 's1', consent: { services: ',analytics,' } }),
    ...opts
  });

  test('granted consent without a Session API: no promote possible, so no cookie', () => {
    // The second write site, which the original report did not cover. finalUid
    // is still the fingerprint whenever no promote ran — here because no
    // Session API is configured at all.
    const r = consentPost({});
    expect(r.throws).toBeNull();
    expect(written(r)).toEqual([]);
  });

  test('granted consent with a working promote writes the C.*', () => {
    const r = consentPost(SESSION, { http: () => ({ statusCode: 200, body: '{"ok":true}' }) });
    expect(r.throws).toBeNull();
    expect(written(r)).toEqual([C_EXPECTED]);
  });

  test('granted consent whose promote fails writes no cookie rather than the F.*', () => {
    const r = consentPost(SESSION, { http: () => ({ statusCode: 500, body: 'boom' }) });
    expect(r.throws).toBeNull();
    expect(written(r)).toEqual([]);
  });

  test('withdrawn consent still deletes the cookie', () => {
    const r = runClient({
      data: { gtm: GTM, cookie_name: 'aGTMuid', cookie_mode: 'consent', consent_service: 'analytics', cookie_delete: true },
      path: '/aGTMconsent',
      method: 'POST',
      reqBody: JSON.stringify({ uid: F_COOKIE, sid: 's1', consent: { services: ',essential,' } })
    });
    expect(r.throws).toBeNull();
    expect(written(r)).toEqual([]);
    expect(cookiesDeleted(r).length).toBe(1);
  });
});
