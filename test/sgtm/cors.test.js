// test/sgtm/cors.test.js — who may read the Client's responses (F-160, F-189)
// and who may write a consent (F-238).
//
// F-189: /aGTM.js used to echo ANY Origin with Allow-Credentials, so every site
// could fetch() the personalised body. F-160: the consent POST from a sibling
// subdomain (rp.example.com serving www.example.com) needs exactly that header,
// for the allowed origins only. F-238: CORS does not stop a foreign page from
// SENDING the POST (no-cors + text/plain), so the write path checks
// Sec-Fetch-Site itself.
import { describe, test, expect } from 'bun:test';
import { runClient } from './client-harness.js';

const BASE = { gtm: [{ gtm_id: 'GTM-TEST', gtm_consent: true }], cookie_mode: 'always' };
const ACAO = 'Access-Control-Allow-Origin';
const ACAC = 'Access-Control-Allow-Credentials';

function js(data, headers, extra) {
  return runClient({ data: { ...BASE, ...data }, headers, ...(extra || {}) });
}
function post(data, headers, extra) {
  return runClient({
    data: { ...BASE, ...data }, headers, path: '/aGTMconsent', method: 'POST',
    reqBody: JSON.stringify({ e: { uid: 'C$1$t$abc', sid: 's1', consent: { hasResponse: true, services: ',a,' } } }),
    ...(extra || {})
  });
}

describe('/aGTM.js: allow-list instead of echo (F-189)', () => {
  test('foreign https origin: no CORS header, but Vary: Origin', () => {
    const r = js({ cookie_domain: 'example.com' }, { origin: 'https://evil.test', host: 'rp.example.com' });
    expect(r.throws).toBeNull();
    expect(r.status).toBe(200);
    expect(r.headers[ACAO]).toBeUndefined();
    expect(r.headers[ACAC]).toBeUndefined();
    expect(r.headers.Vary).toBe('Origin');
  });

  test('(a) subdomain of the cookie domain is allowed, echoed exactly', () => {
    const r = js({ cookie_domain: '.example.com' }, { origin: 'https://www.example.com', host: 'rp.example.com' });
    expect(r.headers[ACAO]).toBe('https://www.example.com');
    expect(r.headers[ACAC]).toBe('true');
  });

  test('(b) the cookie domain itself is allowed', () => {
    const r = js({ cookie_domain: 'example.com' }, { origin: 'https://example.com' });
    expect(r.headers[ACAO]).toBe('https://example.com');
  });

  test('suffix trick: notexample.com is not a subdomain of example.com', () => {
    const r = js({ cookie_domain: 'example.com' }, { origin: 'https://notexample.com' });
    expect(r.headers[ACAO]).toBeUndefined();
  });

  test('(d) http:// origin is refused', () => {
    const r = js({ cookie_domain: 'example.com' }, { origin: 'http://www.example.com' });
    expect(r.headers[ACAO]).toBeUndefined();
  });

  test('origin "null" (sandboxed frame, file:) is refused', () => {
    const r = js({ cookie_domain: 'auto' }, { origin: 'null', host: 'rp.example.com' });
    expect(r.headers[ACAO]).toBeUndefined();
  });

  test('a port on the origin does not defeat the host match', () => {
    const r = js({ cookie_domain: 'example.com' }, { origin: 'https://www.example.com:8443' });
    expect(r.headers[ACAO]).toBe('https://www.example.com:8443');
  });

  test('(f) cors_origins: a host on another domain, scheme/path written along are ignored', () => {
    const r = js({ cookie_domain: 'example.com', cors_origins: ' https://Shop.Example.net/ , other.test' },
      { origin: 'https://shop.example.net' });
    expect(r.headers[ACAO]).toBe('https://shop.example.net');
  });

  test('cors_origins lists exact hosts, not their subdomains', () => {
    const r = js({ cors_origins: 'example.net' }, { origin: 'https://x.example.net' });
    expect(r.headers[ACAO]).toBeUndefined();
  });

  test('no Origin header (plain <script src>): no CORS header, response served', () => {
    const r = js({}, {});
    expect(r.headers[ACAO]).toBeUndefined();
    expect(r.body).toContain('aGTM.f.config(');
  });
});

describe('cookie_domain "auto" (the delivered default): same eTLD+1 as the request host', () => {
  test('(e) sibling subdomain via Host', () => {
    const r = js({}, { origin: 'https://www.example.com', host: 'rp.example.com' });
    expect(r.headers[ACAO]).toBe('https://www.example.com');
  });

  test('X-Forwarded-Host wins over Host (reverse proxy in front of sGTM)', () => {
    const r = js({}, { origin: 'https://www.example.com', 'x-forwarded-host': 'rp.example.com', host: 'sgtm-internal.cluster.local' });
    expect(r.headers[ACAO]).toBe('https://www.example.com');
  });

  test('Forwarded host= wins over both', () => {
    const r = js({}, { origin: 'https://www.example.com', forwarded: 'for=1.2.3.4;host="rp.example.com";proto=https', 'x-forwarded-host': 'other.test', host: 'x.local' });
    expect(r.headers[ACAO]).toBe('https://www.example.com');
  });

  test('different registrable domain is refused', () => {
    const r = js({}, { origin: 'https://www.example.org', host: 'rp.example.com' });
    expect(r.headers[ACAO]).toBeUndefined();
  });

  test('public suffix: a.github.io does not vouch for b.github.io', () => {
    const r = js({}, { origin: 'https://attacker.github.io', host: 'victim.github.io' });
    expect(r.headers[ACAO]).toBeUndefined();
  });

  test('co.uk: shop.example.co.uk and rp.example.co.uk are siblings', () => {
    const r = js({}, { origin: 'https://shop.example.co.uk', host: 'rp.example.co.uk' });
    expect(r.headers[ACAO]).toBe('https://shop.example.co.uk');
  });

  test('public suffix list unavailable: fails closed for siblings', () => {
    const r = js({}, { origin: 'https://www.example.com', host: 'rp.example.com' }, { pslDown: true });
    expect(r.headers[ACAO]).toBeUndefined();
  });

  test('two hosts that are no domain (eTLD+1 "") do not count as equal', () => {
    const r = js({}, { origin: 'https://intranet', host: 'other-box' });
    expect(r.headers[ACAO]).toBeUndefined();
  });

  test('no request host at all: refused', () => {
    const r = js({}, { origin: 'https://www.example.com' });
    expect(r.headers[ACAO]).toBeUndefined();
  });
});

describe('/aGTMconsent: CORS on both answers (F-160)', () => {
  test('200 path carries the allowance for a sibling subdomain', () => {
    const r = post({}, { origin: 'https://www.example.com', host: 'rp.example.com', 'sec-fetch-site': 'same-site' });
    expect(r.throws).toBeNull();
    expect(r.status).toBe(200);
    expect(r.headers[ACAO]).toBe('https://www.example.com');
    expect(r.headers[ACAC]).toBe('true');
  });

  test('(g) 501 path (obfuscated body) carries it too, so the library can read the refusal', () => {
    const r = post({}, { origin: 'https://www.example.com', host: 'rp.example.com' }, { reqBody: '{"q":"xyz"}' });
    expect(r.status).toBe(501);
    expect(r.headers[ACAO]).toBe('https://www.example.com');
  });
});

describe('/aGTMconsent: cross-site write guard (F-238)', () => {
  test('cross-site from a foreign origin: 403, nothing written, no cookie set', () => {
    const calls = [];
    const r = post({ session_api_url: 'https://api.example/tp/session', tenant_id: 't' },
      { origin: 'https://evil.test', host: 'rp.example.com', 'sec-fetch-site': 'cross-site' },
      { http: (url) => { calls.push(url); return { statusCode: 200, body: '{}' }; }, cookies: ['C$1$t$abc'] });
    expect(r.throws).toBeNull();
    expect(r.status).toBe(403);
    expect(calls).toEqual([]);
    expect(r.cookies).toEqual([]);
    expect(r.headers[ACAO]).toBeUndefined();
  });

  test('cross-site from a cors_origins host is accepted', () => {
    const r = post({ cors_origins: 'shop.example.net' },
      { origin: 'https://shop.example.net', host: 'rp.example.com', 'sec-fetch-site': 'cross-site' });
    expect(r.status).toBe(200);
    expect(r.headers[ACAO]).toBe('https://shop.example.net');
  });

  test('same-origin (path proxy on the same host as the page) passes regardless of host headers', () => {
    const r = post({}, { origin: 'https://www.example.com', host: 'internal.local', 'sec-fetch-site': 'same-origin' });
    expect(r.status).toBe(200);
  });

  test('no Sec-Fetch-Site (older browser, server-to-server) passes', () => {
    const r = post({}, {});
    expect(r.status).toBe(200);
  });
});

describe('foreign <script src> embed gets no personal data (F-189 via XSSI, F-239)', () => {
  // A classic script request carries no Origin and needs no CORS: the served
  // script runs in the embedding window, which then reads aGTM.d directly.
  const API = 'https://api.example/tp/session';
  const sess = () => ({ statusCode: 200, body: JSON.stringify({ sessionId: 'SID-SECRET', counter: 3 }) });
  const embed = (headers, data, calls) => runClient({
    data: { ...BASE, session_api_url: API, tenant_id: 't', sources_enabled: true, sources_api_url: 'https://api.example/tp/sources', ...(data || {}) },
    headers: { host: 'rp.example.com', ...headers },
    cookies: ['C$1$t$victim'],
    http: (url) => { if (calls) calls.push(url); return url.indexOf('/sources') >= 0 ? { statusCode: 200, body: '{"ok":true}' } : sess(); }
  });

  test('cross-site from a foreign page: library served, no session, no API call, no cookie, no consent store', () => {
    const calls = [];
    const r = embed({ 'sec-fetch-site': 'cross-site', referer: 'https://evil.test/page' }, {}, calls);
    expect(r.throws).toBeNull();
    expect(r.status).toBe(200);
    expect(r.body).toContain('aGTM.f.config(');
    expect(r.body).not.toContain('SID-SECRET');
    expect(r.body).not.toContain('victim');
    expect(r.body).not.toContain('/aGTMconsent');
    expect(calls).toEqual([]);
    expect(r.cookies).toEqual([]);
    // ...and says so, to whoever integrates the page
    expect(r.headers['x-agtm-preset']).toBe('withheld-cross-site');
    expect(r.body).toContain('[aGTM] Served WITHOUT session data');
  });

  test('cross-site without any Referer (no-referrer policy): treated as foreign', () => {
    const r = embed({ 'sec-fetch-site': 'cross-site' });
    expect(r.body).not.toContain('SID-SECRET');
  });

  test('cross-site from a page listed in cors_origins: full session', () => {
    const r = embed({ 'sec-fetch-site': 'cross-site', referer: 'https://shop.example.net/' }, { cors_origins: 'shop.example.net' });
    expect(r.body).toContain('SID-SECRET');
  });

  test('listed page without Referer, script loaded with crossorigin (sends Origin): full session', () => {
    const r = embed({ 'sec-fetch-site': 'cross-site', origin: 'https://shop.example.net' }, { cors_origins: 'shop.example.net' });
    expect(r.body).toContain('SID-SECRET');
  });

  test('a foreign Referer URL is never logged in full', () => {
    const r = embed({ 'sec-fetch-site': 'cross-site', referer: 'https://evil.test/kasse?email=max%40example.org' }, { debug: true });
    expect(r.logs.join('\n')).not.toContain('email');
  });

  test('same-site (www. embedding rp.): full session, consent store wired', () => {
    const r = embed({ 'sec-fetch-site': 'same-site', referer: 'https://www.example.com/' });
    expect(r.body).toContain('SID-SECRET');
    expect(r.headers['x-agtm-preset']).toBeUndefined();
    expect(r.body).not.toContain('Served WITHOUT session data');
    expect(r.body).toContain('/aGTMconsent');
  });

  test('no Sec-Fetch-Site (older browser): full session', () => {
    const r = embed({ referer: 'https://evil.test/' });
    expect(r.body).toContain('SID-SECRET');
  });

  test('bot verdict is not exposed to a foreign embed', () => {
    const r = runClient({
      data: { ...BASE, botCheckEnabled: true, botCheck: 'https://filter.example/tp/filter/t', botCheckMode: 'mark' },
      headers: { 'sec-fetch-site': 'cross-site', referer: 'https://evil.test/' },
      http: () => ({ statusCode: 200, body: '{"isBot":false,"score":10,"band":"clean"}' })
    });
    expect(r.status).toBe(200);
    expect(r.body).not.toContain('"band":"clean"');
  });
});

describe('allow-list hardening (critic K6/K7)', () => {
  test('an Origin carrying two values is refused, not echoed', () => {
    const r = js({ cookie_domain: 'example.com' }, { origin: 'https://www.example.com, https://evil.test' });
    expect(r.headers[ACAO]).toBeUndefined();
  });

  test('an Origin with a path or userinfo is refused', () => {
    expect(js({ cookie_domain: 'example.com' }, { origin: 'https://www.example.com/' }).headers[ACAO]).toBeUndefined();
    expect(js({ cookie_domain: 'example.com' }, { origin: 'https://evil.test@www.example.com' }).headers[ACAO]).toBeUndefined();
  });

  test('a comma inside the authority is refused (would otherwise read as .example.com)', () => {
    expect(js({ cookie_domain: 'example.com' }, { origin: 'https://evil.test,www.example.com' }).headers[ACAO]).toBeUndefined();
    const r = runClient({ data: { ...BASE, cookie_domain: 'example.com', session_api_url: 'https://api.example/tp/session', tenant_id: 't' },
      headers: { 'sec-fetch-site': 'cross-site', referer: 'https://evil.test,www.example.com/' }, cookies: ['C$1$t$victim'],
      http: () => ({ statusCode: 200, body: JSON.stringify({ sessionId: 'SID-SECRET' }) }) });
    expect(r.body).not.toContain('SID-SECRET');
  });

  test('a space inside the authority is refused', () => {
    expect(js({ cookie_domain: 'example.com' }, { origin: 'https://evil.test www.example.com' }).headers[ACAO]).toBeUndefined();
  });

  test('public-suffix cookie domain stays closed when the suffix list is down', () => {
    expect(js({ cookie_domain: 'de' }, { origin: 'https://evil.de' }, { pslDown: true }).headers[ACAO]).toBeUndefined();
    expect(js({ cookie_domain: 'co.uk' }, { origin: 'https://evil.co.uk' }, { pslDown: true }).headers[ACAO]).toBeUndefined();
  });

  test('cors_origins pasted as a list with tabs and newlines', () => {
    expect(js({ cors_origins: 'a.example.net,\tb.example.net\nc.example.net\r\n' }, { origin: 'https://b.example.net' }).headers[ACAO]).toBe('https://b.example.net');
    expect(js({ cors_origins: 'a.example.net\nc.example.net' }, { origin: 'https://c.example.net' }).headers[ACAO]).toBe('https://c.example.net');
  });

  test('a cookie domain that is a public suffix vouches for nobody', () => {
    expect(js({ cookie_domain: 'de' }, { origin: 'https://evil.de' }).headers[ACAO]).toBeUndefined();
    expect(js({ cookie_domain: '.co.uk' }, { origin: 'https://evil.co.uk' }).headers[ACAO]).toBeUndefined();
  });

  test('cross-site POST without Origin is refused (form/no-cors from a page that strips it)', () => {
    const r = post({}, { host: 'rp.example.com', 'sec-fetch-site': 'cross-site' });
    expect(r.status).toBe(403);
  });

  test('header value case does not matter for the guard', () => {
    const r = post({}, { origin: 'https://evil.test', host: 'rp.example.com', 'Sec-Fetch-Site': 'Cross-Site' });
    expect(r.status).toBe(403);
    expect(r.headers.Vary).toBe('Origin');
    expect(r.headers['Cache-Control']).toBe('no-store');
  });
});

describe('final-round hardening (QA/critic, session 2026-10-20)', () => {
  const API = 'https://api.example/tp/session';
  const foreign = (data, extra) => runClient({
    data: { ...BASE, session_api_url: API, tenant_id: 't', ...(data || {}) },
    headers: { host: 'rp.example.com', 'sec-fetch-site': 'cross-site', referer: 'https://evil.test/' },
    ...(extra || {})
  });

  test('the withheld-preset notice is wrapped and the body still parses', () => {
    const r = foreign();
    expect(r.body).toContain('try{if(typeof console');
    expect(() => new Function(r.body)).not.toThrow();
  });

  test('a foreign embed is still bot-checked: block mode blocks, a forged cross-site header is no way around it', () => {
    const calls = [];
    const r = foreign({ botCheckEnabled: true, botCheck: 'https://filter.example/tp/filter/t', botCheckMode: 'block' },
      { http: (url) => { calls.push(url); return { statusCode: 403, body: '{"isBot":true}' }; } });
    expect(calls.filter((u) => u.indexOf('filter.example') >= 0).length).toBe(1);
    expect(r.status).toBe(403);
  });

  test('a foreign embed in mark mode is served, but never sees the verdict', () => {
    const r = foreign({ botCheckEnabled: true, botCheck: 'https://filter.example/tp/filter/t', botCheckMode: 'mark' },
      { http: () => ({ statusCode: 403, body: '{"isBot":true,"band":"bot"}' }) });
    expect(r.status).toBe(200);
    expect(r.body).not.toContain('"isBot"');
  });

  test('cors_origins entries that can never match are reported once per /aGTM.js request', () => {
    const r = js({ cors_origins: '*.example.net, .example.org, ok.example.com' }, {});
    const w = r.logs.filter((l) => l.indexOf('Additional CORS Origins') >= 0);
    expect(w.length).toBe(1);
    expect(w[0]).toContain('*.example.net');
    expect(w[0]).toContain('.example.org');
    expect(w[0]).not.toContain('ok.example.com');
  });

  test('a dotless host (localhost) is valid and not reported; a Unicode name is', () => {
    const r = js({ cors_origins: 'localhost, bücher.example' }, { origin: 'https://localhost' });
    expect(r.headers[ACAO]).toBe('https://localhost');
    const w = r.logs.filter((l) => l.indexOf('Additional CORS Origins') >= 0);
    expect(w.length).toBe(1);
    expect(w[0]).toContain('bücher.example');
    expect(w[0]).not.toContain('localhost');
  });

  test('carriage return and no-break space inside a cors_origins entry are dropped', () => {
    expect(js({ cors_origins: 'a.example.net,b.exam\rple.net' }, { origin: 'https://b.example.net' }).headers[ACAO]).toBe('https://b.example.net');
    expect(js({ cors_origins: 'a.example.net, c.example.net' }, { origin: 'https://c.example.net' }).headers[ACAO]).toBe('https://c.example.net');
  });

  test('an IPv6 literal origin is refused', () => {
    expect(js({ cookie_domain: 'example.com' }, { origin: 'https://[::1]' }).headers[ACAO]).toBeUndefined();
  });

  test('host comparison is case-insensitive (explicit cookie domain)', () => {
    const r = runClient({ data: { ...BASE, cookie_domain: 'example.com', session_api_url: API, tenant_id: 't' },
      headers: { 'sec-fetch-site': 'cross-site', referer: 'https://WWW.EXAMPLE.COM/' },
      http: () => ({ statusCode: 200, body: JSON.stringify({ sessionId: 'SID-SECRET' }) }) });
    expect(r.body).toContain('SID-SECRET');
  });

  test('explicit cookie domain with the suffix list down: only the domain itself is allowed (fail closed)', () => {
    expect(js({ cookie_domain: 'example.com' }, { origin: 'https://example.com' }, { pslDown: true }).headers[ACAO]).toBe('https://example.com');
    expect(js({ cookie_domain: 'example.com' }, { origin: 'https://www.example.com' }, { pslDown: true }).headers[ACAO]).toBeUndefined();
  });
});
