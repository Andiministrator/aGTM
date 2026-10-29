// F-259: with the visitor's objection (aGTMoptout cookie, or ?aGTMoptout= on the
// page that loads the library) the Client makes none of its own calls - no Session
// API, no Sources API, no user-ID cookie - but still serves the library, which has
// to run to keep, renew or withdraw the objection.
import { describe, test, expect } from 'bun:test';
import { runClient, injectedConfig, cookiesWritten, cookiesDeleted } from './client-harness.js';

const API = 'https://api.example/tp/session';
const BASE = {
  gtm: [{ gtm_id: 'GTM-TEST', gtm_consent: true }], cookie_mode: 'always',
  session_api_url: API, tenant_id: 't', sources_enabled: true, sources_api_url: 'https://api.example/tp/sources'
};
const page = (u) => ({ id: 'GTM-TEST', c: Buffer.from(JSON.stringify({ u, r: '' })).toString('base64') });
const run = ({ cookies, url, noUid }, calls) => runClient({
  data: BASE,
  query: page(url || 'https://www.kunde.de/seite'),
  headers: { host: 'sgtm.kunde.de', 'sec-fetch-site': 'same-site', referer: 'https://www.kunde.de/seite' },
  cookies: (noUid ? [] : [{ name: '_tpf', value: 'C$1$t$known' }]).concat(cookies || []),
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
    expect(cookiesWritten(r)).toEqual([]);
  });

  // F-263 (Andi 2026-10-28): the objection also removes an identity set before it.
  test('a user-ID cookie set before the objection is deleted, even with cookie_delete off', () => {
    const calls = [];
    const r = run({ cookies: [{ name: 'aGTMoptout', value: '1761571200000' }] }, calls);
    expect(BASE.cookie_delete).toBeUndefined();
    expect(cookiesDeleted(r).map((c) => c.name)).toContain('_tpf');
  });

  test('the delete carries the attributes every write uses (else the browser ignores it)', () => {
    const r = run({ cookies: [{ name: 'aGTMoptout', value: '1761571200000' }] }, []);
    const del = r.cookieOpts.filter((o) => o.name === '_tpf');
    expect(del.length).toBe(1);
    // domain included: it is the attribute a browser-side delete fails on.
    expect(del[0]).toMatchObject({ domain: 'auto', path: '/', sameSite: 'none', secure: true, httpOnly: true, 'max-age': 0 });
  });

  test('only a legacy _TPU cookie: deleted too', () => {
    const r = run({ noUid: true, cookies: [{ name: '_TPU', value: 'C$1$t$old' }, { name: 'aGTMoptout', value: '1761571200000' }] }, []);
    expect(cookiesWritten(r)).toEqual([]);
    expect(cookiesDeleted(r).map((c) => c.name)).toContain('_TPU');
  });

  test('no user-ID cookie: no delete header on every request (control)', () => {
    const calls = [];
    const r = run({ noUid: true, cookies: [{ name: 'aGTMoptout', value: '1761571200000' }] }, calls);
    expect(r.cookies).toEqual([]);
  });

  test('?aGTMoptout=1 on the page counts before the library has written the cookie', () => {
    const calls = [];
    const r = run({ url: 'https://www.kunde.de/datenschutz?aGTMoptout=1#x' }, calls);
    expect(calls).toEqual([]);
    expect(r.body).not.toContain('SID-SECRET');
    expect(cookiesWritten(r)).toEqual([]);
    expect(cookiesDeleted(r).map((c) => c.name)).toContain('_tpf');
  });

  test('?aGTMoptout=0 on the page withdraws it on this very request, despite the cookie', () => {
    const calls = [];
    const r = run({ url: 'https://www.kunde.de/?aGTMoptout=0', cookies: [{ name: 'aGTMoptout', value: '1761571200000' }] }, calls);
    expect(calls.some((u) => u.indexOf(API) === 0)).toBe(true);
    expect(r.body).toContain('SID-SECRET');
    expect(cookiesDeleted(r).map((c) => c.name)).not.toContain('_tpf');
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

// The Client must read ?aGTMoptout exactly like aGTM.f.urlParam (first
// occurrence after ?, & or # anywhere in the URL, URL-decoded, empty = absent):
// otherwise library and Client disagree on the very request that declares or
// withdraws the objection.
describe('?aGTMoptout is read like aGTM.f.urlParam', () => {
  const cases = [
    ['https://www.kunde.de/#/datenschutz?aGTMoptout=1', true],
    ['https://www.kunde.de/?a=1#&aGTMoptout=1', true],
    ['https://www.kunde.de/?aGTMoptout=1&aGTMoptout=0', true],
    ['https://www.kunde.de/?aGTMoptout=0&aGTMoptout=1', false],
    ['https://www.kunde.de/?aGTMoptout=%30', false],
    ['https://www.kunde.de/?aGTMoptout=', false],
    ['https://www.kunde.de/aGTMoptout=1', false],
    ['https://www.kunde.de/?xaGTMoptout=1', false]
  ];
  for (const [url, objected] of cases) {
    test(url + ' -> ' + (objected ? 'objection' : 'none'), () => {
      const v = aGTM.f.urlParam('aGTMoptout', url);
      expect(!!v && v !== '0').toBe(objected);
      const calls = [];
      run({ url }, calls);
      expect(calls.length === 0).toBe(objected);
    });
  }
});

describe('the Client never undoes the objection itself', () => {
  test('debug field set: the library gets no debug flag for a visitor who objected', () => {
    const r = runClient({
      data: { ...BASE, debug: true },
      query: page('https://www.kunde.de/'),
      headers: { host: 'sgtm.kunde.de', 'sec-fetch-site': 'same-site' },
      cookies: [{ name: 'aGTMoptout', value: '1761523200000' }],
      http: () => ({ statusCode: 200, body: '{}' })
    });
    expect(injectedConfig(r.body).debug).toBeUndefined();
  });

  test('debug field set, no objection: debug still reaches the library (control)', () => {
    const r = runClient({
      data: { ...BASE, debug: true },
      query: page('https://www.kunde.de/'),
      headers: { host: 'sgtm.kunde.de', 'sec-fetch-site': 'same-site' },
      http: () => ({ statusCode: 200, body: '{}' })
    });
    expect(injectedConfig(r.body).debug).toBe(true);
  });

  test('consent POST from a tab loaded before the objection: 204, nothing stored, no cookie', () => {
    const calls = [];
    const r = runClient({
      data: { ...BASE, consent_store_enabled: true },
      path: '/aGTMconsent', method: 'POST',
      headers: { host: 'sgtm.kunde.de', 'sec-fetch-site': 'same-site', origin: 'https://www.kunde.de' },
      cookies: [{ name: 'aGTMoptout', value: '1761523200000' }],
      reqBody: JSON.stringify({ e: { uid: 'C$1$t$abc', sid: 's1', consent: { hasResponse: true, services: ',a,' } } }),
      http: (url) => { calls.push(url); return { statusCode: 200, body: '{}' }; }
    });
    expect(r.status).toBe(204);
    expect(calls).toEqual([]);
    expect(r.cookies).toEqual([]);
  });
});
