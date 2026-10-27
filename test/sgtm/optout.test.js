// F-259: with the visitor's objection (aGTMoptout cookie, or ?aGTMoptout= on the
// page that loads the library) the Client makes none of its own calls - no Session
// API, no Sources API, no user-ID cookie - but still serves the library, which has
// to run to keep, renew or withdraw the objection.
import { describe, test, expect } from 'bun:test';
import { runClient } from './client-harness.js';

const API = 'https://api.example/tp/session';
const BASE = {
  gtm: [{ gtm_id: 'GTM-TEST', gtm_consent: true }], cookie_mode: 'always',
  session_api_url: API, tenant_id: 't', sources_enabled: true, sources_api_url: 'https://api.example/tp/sources'
};
const page = (u) => ({ id: 'GTM-TEST', c: Buffer.from(JSON.stringify({ u, r: '' })).toString('base64') });
const run = ({ cookies, url }, calls) => runClient({
  data: BASE,
  query: page(url || 'https://www.kunde.de/seite'),
  headers: { host: 'sgtm.kunde.de', 'sec-fetch-site': 'same-site', referer: 'https://www.kunde.de/seite' },
  cookies: [{ name: '_tpf', value: 'C$1$t$known' }].concat(cookies || []),
  http: (url) => { calls.push(url); return url.indexOf('/sources') >= 0 ? { statusCode: 200, body: '{"ok":true}' } : { statusCode: 200, body: JSON.stringify({ sessionId: 'SID-SECRET', counter: 3 }) }; }
});

describe('opt-out stops the Client\'s own calls (F-259)', () => {
  test('objection cookie: library served, no Session/Sources API call, no cookie, no session data', () => {
    const calls = [];
    const r = run({ cookies: [{ name: 'aGTMoptout', value: '1761571200000' }] }, calls);
    expect(r.throws).toBeNull();
    expect(r.status).toBe(200);
    expect(r.body).toContain('aGTM.f.config(');
    expect(r.body).not.toContain('SID-SECRET');
    expect(calls).toEqual([]);
    expect(r.cookies).toEqual([]);
  });

  test('?aGTMoptout=1 on the page counts before the library has written the cookie', () => {
    const calls = [];
    const r = run({ url: 'https://www.kunde.de/datenschutz?aGTMoptout=1#x' }, calls);
    expect(calls).toEqual([]);
    expect(r.body).not.toContain('SID-SECRET');
  });

  test('?aGTMoptout=0 on the page withdraws it on this very request, despite the cookie', () => {
    const calls = [];
    const r = run({ url: 'https://www.kunde.de/?aGTMoptout=0', cookies: [{ name: 'aGTMoptout', value: '1761571200000' }] }, calls);
    expect(calls.some((u) => u.indexOf(API) === 0)).toBe(true);
    expect(r.body).toContain('SID-SECRET');
  });

  test('cookie value "0" is no objection (left over from older versions)', () => {
    const calls = [];
    const r = run({ cookies: [{ name: 'aGTMoptout', value: '0' }] }, calls);
    expect(r.body).toContain('SID-SECRET');
  });

  test('without any opt-out the Session API is called as before (control)', () => {
    const calls = [];
    const r = run({}, calls);
    expect(calls.length).toBeGreaterThan(0);
    expect(r.body).toContain('SID-SECRET');
  });
});
