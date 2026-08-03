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

  test('a promote refused for good (404 = no active session) does not keep the cookie forever', () => {
    // The counterpart to the retry rule below. api4sgtm answers 404 when the
    // session is gone and 409 when the target uid already has one; neither
    // changes by asking again. Treating those as "retry later" would park the
    // fingerprint in the browser indefinitely — the very state this cleanup
    // exists to end.
    const r = runClient({
      data: { gtm: GTM, cookie_name: 'aGTMuid', cookie_mode: 'consent', ...SESSION },
      cookies: [F_COOKIE],
      http: http({ sessionId: 's1', counter: 5, consent: CONSENT_OK }, { statusCode: 404, body: 'no session' })
    });
    expect(r.throws).toBeNull();
    expect(written(r)).toEqual([]);
    expect(cookiesDeleted(r).length).toBe(1);
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

describe('an unavailable Session API is not evidence of anything', () => {
  // The cleanup acts on the ABSENCE of a stored consent. An API that did not
  // answer has not told us the consent is absent — it has told us nothing. The
  // first version of this fix deleted the cookie anyway, i.e. it discarded
  // identities tenant-wide during exactly the outage it claimed to protect
  // against, and unrecoverably: afterwards the visitor re-derives TODAY's
  // fingerprint, so a consent stored under yesterday's is orphaned.
  const outage = (http) => runClient({
    data: { gtm: GTM, cookie_name: 'aGTMuid', cookie_mode: 'consent', ...SESSION },
    cookies: [F_COOKIE],
    http
  });

  test('a transport error leaves the F.* cookie untouched', () => {
    const r = outage(() => null);
    expect(r.throws).toBeNull();
    expect(r.cookies).toEqual([]);
  });

  test('a 500 leaves the F.* cookie untouched', () => {
    const r = outage(() => ({ statusCode: 500, body: 'boom' }));
    expect(r.throws).toBeNull();
    expect(r.cookies).toEqual([]);
  });

  test('a 200 with an empty body IS an answer and licenses the cleanup', () => {
    // "No record for this visitor" is a verdict, unlike an outage.
    const r = outage(() => ({ statusCode: 200, body: '' }));
    expect(r.throws).toBeNull();
    expect(cookiesDeleted(r).length).toBe(1);
  });
});

describe('cookie_mode=never sends no Set-Cookie header at all', () => {
  // In this mode the Client has never written a cookie, so it has nothing of
  // its own to clean up — and a delete header would break the mode's promise
  // just as a write would.
  const never = (cookies) => runClient({
    data: { gtm: GTM, cookie_name: 'aGTMuid', cookie_mode: 'never', ...SESSION },
    cookies,
    http: http({ sessionId: 's1', counter: 5 })
  });

  test('an F.* cookie is left alone', () => {
    expect(never([F_COOKIE]).cookies).toEqual([]);
  });

  test('a C.* cookie is left alone', () => {
    expect(never(['C.1$t$999999999999.1700000000000']).cookies).toEqual([]);
  });
});

describe('the fingerprint is recognised even after the limiter changed', () => {
  test('an old F$-cookie is still detected when fip_limiter is now a dot', () => {
    // The prefix is built from fip_limiter, which the tenant may change at any
    // time — the field invites it ("e.g. $ or ."). A prefix-only check would
    // stop recognising every previously written value and refresh it for
    // another year, reinstating the original bug by way of a config edit.
    const r = runClient({
      data: { gtm: GTM, cookie_name: 'aGTMuid', cookie_mode: 'consent', fip_limiter: '.', ...SESSION },
      cookies: ['F$1$t$sha_123.20260803'],
      http: http({ sessionId: 's1', counter: 5 })
    });
    expect(r.throws).toBeNull();
    expect(written(r)).toEqual([]);
    expect(cookiesDeleted(r).length).toBe(1);
  });
});

describe('the served library must not be stored by a shared cache', () => {
  test('/aGTM.js answers with Cache-Control: private, no-store', () => {
    // The body inlines cfg.session — uid, sid and, for a returning visitor,
    // their recorded consent — while the URL is identical for every visitor.
    // A CDN or corporate proxy that stores it serves one person's session and
    // consent decision to the next. Until the fingerprint guard landed, almost
    // every response carried a Set-Cookie, which most caches read as "do not
    // store"; removing those writes made this response MORE cacheable, so the
    // guarantee now has to be stated instead of inherited.
    const r = runClient({ data: { gtm: GTM, cookie_name: 'aGTMuid', ...SESSION }, http: http({ sessionId: 's1', counter: 1 }) });
    expect(r.throws).toBeNull();
    expect(r.headers['Cache-Control']).toBe('private, no-store');
  });
});

describe('cookie lifetime', () => {
  test('a non-positive lifetime yields a session cookie, not a delete header', () => {
    // `max-age: 0` IS the delete instruction. The old code emitted it for any
    // non-positive lifetime, so a mistyped field turned every write into a
    // deletion while the code read as if it were writing. The consent handler
    // always got this right; only the GET path did not.
    const c = 'C.1$t$999999999999.1700000000000';
    const r = runClient({
      data: { gtm: GTM, cookie_name: 'aGTMuid', cookie_mode: 'consent', cookie_lifetime: '-1', ...SESSION },
      cookies: [c],
      http: http({ sessionId: 's1', counter: 5, consent: CONSENT_OK })
    });
    expect(r.throws).toBeNull();
    expect(r.cookies.length).toBe(1);
    expect(r.cookies[0].val).toBe(c);
    expect(r.cookies[0].maxAge).toBeUndefined();
  });
});

describe('POST /aGTMconsent never writes a fingerprint either', () => {
  const consentPost = (data, opts) => runClient({
    // tenant_id without session_api_url: the tenant is part of the minted uid,
    // but the local mint is precisely the case where no Session API exists.
    data: { gtm: GTM, cookie_name: 'aGTMuid', cookie_mode: 'consent', consent_service: 'analytics', tenant_id: 't', ...data },
    path: '/aGTMconsent',
    method: 'POST',
    reqBody: JSON.stringify({ uid: F_COOKIE, sid: 's1', consent: { services: ',analytics,' } }),
    ...opts
  });

  test('granted consent without a Session API mints a C.* locally', () => {
    // The second write site, which the original report did not cover. finalUid
    // is still the fingerprint whenever no promote ran. Refusing to write it is
    // only half the answer: both C.* producers hang off the Session API, so a
    // tenant running the Client without api4sgtm would never get a user-ID
    // cookie again — cookie_mode and cookie_lifetime would become dead options.
    // With no session pointer to migrate there is nothing to promote, so the
    // Client mints the stable ID itself, exactly as the pre-1.5 template did.
    const r = consentPost({});
    expect(r.throws).toBeNull();
    expect(written(r)).toEqual([C_EXPECTED]);
  });

  test('the echoed uid matches the minted cookie, so the browser does not drift', () => {
    const r = consentPost({});
    expect(JSON.parse(r.body).uid).toBe(C_EXPECTED);
  });

  test('no local mint under cookie_mode=never', () => {
    const r = consentPost({ cookie_mode: 'never' });
    expect(r.throws).toBeNull();
    expect(r.cookies).toEqual([]);
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
