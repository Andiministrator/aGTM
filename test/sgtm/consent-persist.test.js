// test/sgtm/consent-persist.test.js — what the /aGTMconsent handler makes of a
// refused Session API write (F-236).
//
// Measured in production (7 days, all tenants): ~2.8 % of the consent writes
// were answered 404 "no active session" — the session window had run out
// between page load and decision. The Client logged nothing outside debug and
// answered the browser 200 regardless, so the library's own retry never ran.
// Now: a 404 opens a session (GET) and writes exactly once more; any status
// that is still not 2xx is logged at warn and passed on to the browser.
import { describe, test, expect } from 'bun:test';
import { runClient } from './client-harness.js';

const API = 'https://api.example.com/tp/session';
const UID = 'C.1.t.123.456';

// http(url, body) answers from a script keyed by call order; every call is
// recorded so the sequence itself can be asserted.
const scripted = (answers) => {
  const calls = [];
  const fn = (url, body) => {
    calls.push({ url, write: body !== undefined });
    const a = answers[calls.length - 1];
    return a === undefined ? { statusCode: 200, body: '{}' } : a;
  };
  return { fn, calls };
};

const consentPost = (http) => runClient({
  data: { gtm: [{ gtm_id: 'GTM-TEST', gtm_consent: true }], cookie_name: 'aGTMuid', cookie_mode: 'consent', tenant_id: 't', session_api_url: API },
  path: '/aGTMconsent',
  method: 'POST',
  reqBody: JSON.stringify({ uid: UID, sid: 's1', consent: { hasResponse: true, services: ',analytics,' } }),
  http
});

const warns = (r) => r.logs.filter((l) => l.startsWith('warn'));

describe('/aGTMconsent — Session API write result (F-236)', () => {
  test('2xx: one write, 200 to the browser, no warn', () => {
    const s = scripted([{ statusCode: 200, body: '{}' }]);
    const r = consentPost(s.fn);
    expect(r.throws).toBeNull();
    expect(s.calls.map((c) => c.url)).toEqual([API + '/t/' + UID + '/consent']);
    expect(r.status).toBe(200);
    expect(warns(r)).toEqual([]);
  });

  test('404: opens the session, writes once more, and succeeds', () => {
    const s = scripted([{ statusCode: 404, body: 'no active session' }, { statusCode: 200, body: '{"sessionId":"s2","counter":0}' }, { statusCode: 200, body: '{}' }]);
    const r = consentPost(s.fn);
    expect(r.throws).toBeNull();
    expect(s.calls).toEqual([
      { url: API + '/t/' + UID + '/consent', write: true },
      { url: API + '/t/' + UID, write: false },
      { url: API + '/t/' + UID + '/consent', write: true }
    ]);
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body).ok).toBe(true);
    expect(warns(r)).toEqual([]);
  });

  test('404 twice: exactly one retry, 404 reaches the browser, warn logged', () => {
    const s = scripted([{ statusCode: 404, body: '' }, { statusCode: 200, body: '{}' }, { statusCode: 404, body: '' }]);
    const r = consentPost(s.fn);
    expect(s.calls.length).toBe(3);
    expect(r.status).toBe(404);
    expect(warns(r).length).toBe(1);
    expect(warns(r)[0]).toContain('rewrite');
    expect(JSON.parse(r.body).ok).toBe(false);
  });

  test('404 and the session cannot be opened: no rewrite, status passed on', () => {
    const s = scripted([{ statusCode: 404, body: '' }, { statusCode: 503, body: '' }]);
    const r = consentPost(s.fn);
    expect(s.calls.length).toBe(2);
    expect(r.status).toBe(503);
    expect(warns(r)[0]).toContain('session_open');
  });

  test('non-404 failure: no session detour, status passed on, warn logged', () => {
    const s = scripted([{ statusCode: 500, body: '' }]);
    const r = consentPost(s.fn);
    expect(s.calls.length).toBe(1);
    expect(r.status).toBe(500);
    expect(warns(r)[0]).toContain('write');
  });

  test('transport error: 502 to the browser', () => {
    const r = consentPost(() => null);
    expect(r.throws).toBeNull();
    expect(r.status).toBe(502);
  });

  test('the warn line does not carry the uid', () => {
    const s = scripted([{ statusCode: 500, body: '' }]);
    const r = consentPost(s.fn);
    expect(warns(r)[0]).not.toContain(UID);
  });

  test('the uid is still echoed on a failure, the version header still set', () => {
    const s = scripted([{ statusCode: 500, body: '' }]);
    const r = consentPost(s.fn);
    expect(JSON.parse(r.body).uid).toBe(UID);
    expect(r.headers['x-agtm-version']).toBeTruthy();
  });

  test('transport error on the session read: 502, no rewrite', () => {
    const calls = [];
    const r = consentPost((url, body) => {
      calls.push(url);
      if (calls.length === 1) return { statusCode: 404, body: '' };
      return null; // the GET fails at transport level
    });
    expect(r.throws).toBeNull();
    expect(calls.length).toBe(2);
    expect(r.status).toBe(502);
  });

  test('a fingerprint uid is never healed: its 404 goes to the browser without a session read', () => {
    // F.* is a server-side fingerprint shared by everyone behind the same NAT
    // and browser build. Reopening a session under it would write a consent
    // into the shared record F-156 is about.
    const s = scripted([{ statusCode: 404, body: '' }]);
    const r = runClient({
      data: { gtm: [{ gtm_id: 'GTM-TEST', gtm_consent: true }], cookie_name: 'aGTMuid', cookie_mode: 'consent', tenant_id: 't', session_api_url: API },
      path: '/aGTMconsent',
      method: 'POST',
      // No explicit services signal -> no promote; the legacy write runs under the F.* uid.
      reqBody: JSON.stringify({ uid: 'F$1$t$sha_123.20260929', sid: 's1', consent: { hasResponse: true } }),
      http: s.fn
    });
    expect(r.throws).toBeNull();
    expect(s.calls.map((c) => c.url)).toEqual([API + '/t/F$1$t$sha_123.20260929/consent']);
    expect(r.status).toBe(404);
    expect(warns(r).length).toBe(1);
  });
});
