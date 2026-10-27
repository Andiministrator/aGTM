// Opt-out = the visitor's objection (Art. 21(1) GDPR): 13-month cookie with the time of the
// objection as value, written for the registrable domain, renewed on every visit, and checked
// before a consent preset can load GTM (F-252, F-259).
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resetAGTM, MockXHR } from './helpers.js';

// A small cookie jar that behaves like a browser where it matters here: one cookie per
// (name, domain), a domain attribute is kept only for a parent of the host that is not a public
// suffix, max-age=0 deletes.
const SUFFIXES = ['de', 'com', 'uk', 'co.uk'];
function installJar(host) {
  const jar = [];
  const writes = [];
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get() { return jar.map(c => c.name + '=' + c.value).join('; '); },
    set(str) {
      writes.push(str);
      const parts = str.split(';').map(p => p.trim());
      const [name, value] = parts[0].split('=');
      let domain = '', maxAge = null;
      parts.slice(1).forEach(p => {
        const [k, v] = p.split('=');
        if (k.toLowerCase() === 'domain') domain = v.replace(/^\./, '');
        if (k.toLowerCase() === 'max-age') maxAge = Number(v);
      });
      if (domain && (SUFFIXES.includes(domain) || (host !== domain && !host.endsWith('.' + domain)))) return;
      const i = jar.findIndex(c => c.name === name && c.domain === domain);
      if (i >= 0) jar.splice(i, 1);
      if (maxAge === 0) return;
      jar.push({ name, value, domain, maxAge });
    }
  });
  location.hostname = host;
  return { jar, writes };
}

function visit(host, query) {
  location.href = 'https://' + host + '/page' + (query || '');
  location.hostname = host;
}

const saved = { href: location.href, hostname: location.hostname };

describe('aGTM.f.optout() — objection cookie', () => {
  afterEach(() => {
    delete document.cookie;
    document.cookie = '';
    location.href = saved.href;
    location.hostname = saved.hostname;
    resetAGTM();
  });

  test('?aGTMoptout=1 stores the day of the objection for the registrable domain, 13 months', () => {
    resetAGTM();
    const { jar } = installJar('www.kunde.de');
    visit('www.kunde.de', '?aGTMoptout=1');
    const day = Math.floor(Date.now() / 864e5) * 864e5;
    expect(aGTM.f.optout()).toBe(true);
    expect(jar).toHaveLength(1);
    expect(jar[0].domain).toBe('kunde.de');
    expect(jar[0].maxAge).toBe(34128000);
    // the day (UTC midnight), not the millisecond: no per-visitor identifier
    expect(Number(jar[0].value)).toBe(day);
    expect(jar[0].value).toMatch(/^\d{13}$/);
  });

  test('a multi-label public suffix (co.uk) is skipped: the cookie lands on shop.co.uk', () => {
    resetAGTM();
    const { jar } = installJar('www.shop.co.uk');
    visit('www.shop.co.uk', '?aGTMoptout=1');
    aGTM.f.optout();
    expect(jar.map(c => c.domain)).toEqual(['shop.co.uk']);
  });

  test('a later visit renews the cookie and keeps the time of the objection', () => {
    resetAGTM();
    const { jar, writes } = installJar('www.shop.co.uk');
    jar.push({ name: 'aGTMoptout', value: '1700000000000', domain: 'shop.co.uk', maxAge: 5 });
    visit('www.shop.co.uk', '');
    writes.length = 0;
    expect(aGTM.f.optout()).toBe(true);
    expect(jar).toEqual([{ name: 'aGTMoptout', value: '1700000000000', domain: 'shop.co.uk', maxAge: 34128000 }]);
    expect(writes.some(w => /max-age=34128000; domain=shop\.co\.uk/.test(w))).toBe(true);
  });

  test('a host-only cookie from before v1.5 ("1") is replaced by one domain cookie with a time', () => {
    resetAGTM();
    const { jar } = installJar('www.kunde.de');
    jar.push({ name: 'aGTMoptout', value: '1', domain: '', maxAge: null });
    visit('www.kunde.de', '');
    expect(aGTM.f.optout()).toBe(true);
    expect(jar).toHaveLength(1);
    expect(jar[0].domain).toBe('kunde.de');
    expect(jar[0].value).toMatch(/^\d{13}$/);
  });

  test('?aGTMoptout=0 withdraws the objection: every copy is deleted, aGTM keeps running', () => {
    resetAGTM();
    const { jar } = installJar('www.kunde.de');
    jar.push({ name: 'aGTMoptout', value: '1', domain: '', maxAge: null });
    jar.push({ name: 'aGTMoptout', value: '1700000000000', domain: 'kunde.de', maxAge: 5 });
    aGTM.c.gdl = 'dataLayer';
    visit('www.kunde.de', '?aGTMoptout=0');
    expect(aGTM.f.optout()).toBe(false);
    expect(jar).toHaveLength(0);
    expect(aGTM.c.gdl).toBe('dataLayer');
  });

  test('localhost has no parent domain: host-only cookie', () => {
    resetAGTM();
    const { jar } = installJar('localhost');
    visit('localhost', '?aGTMoptout=1');
    aGTM.f.optout();
    expect(jar).toHaveLength(1);
    expect(jar[0].domain).toBe('');
  });

  test('no parameter, no cookie: nothing is written', () => {
    resetAGTM();
    const { writes } = installJar('www.kunde.de');
    visit('www.kunde.de', '');
    expect(aGTM.f.optout()).toBe(false);
    expect(writes).toHaveLength(0);
  });
});

describe('F-252 — the objection wins over a consent preset of the sGTM Client', () => {
  let loads, orig;
  beforeEach(() => {
    globalThis.dataLayer = [];
    loads = [];
    orig = aGTM.f.gtm_load;
    aGTM.f.gtm_load = function () { loads.push([].slice.call(arguments)); };
    aGTM.f.consent_check = function (a) { return a == 'init' && !!aGTM.d.consent.hasResponse; };
  });
  afterEach(() => {
    aGTM.f.gtm_load = orig;
    delete aGTM.f.consent_check;
    delete document.cookie;
    document.cookie = '';
    location.href = saved.href;
    location.hostname = saved.hostname;
    resetAGTM();
  });

  const cfg = () => ({
    gtm: { 'GTM-OPT': {} },
    gtmServices: 'svcA',
    session: { uid: 'C.x', sid: 's', consent: { hasResponse: true, services: ',svcA,' } }
  });

  test('config() with preset, then init() — the Client order: GTM is not loaded', () => {
    resetAGTM();
    const { jar } = installJar('www.kunde.de');
    jar.push({ name: 'aGTMoptout', value: '1700000000000', domain: 'kunde.de', maxAge: 5 });
    visit('www.kunde.de', '');
    aGTM.f.config(cfg());
    expect(aGTM.d.config).toBe(false);
    aGTM.f.init();
    expect(loads).toHaveLength(0);
    expect(aGTM.d.init).not.toBe(true);
  });

  test('Client order: optout_callback runs once, the cookie is written once', () => {
    resetAGTM();
    const { jar, writes } = installJar('www.kunde.de');
    jar.push({ name: 'aGTMoptout', value: '1700000000000', domain: 'kunde.de', maxAge: 5 });
    visit('www.kunde.de', '');
    let calls = 0;
    aGTM.f.optout_callback = () => { calls++; };
    try {
      aGTM.f.config(cfg());
      const n = writes.length;
      aGTM.f.init();
      expect(calls).toBe(1);
      expect(writes.length).toBe(n);
    } finally {
      delete aGTM.f.optout_callback;
    }
  });

  test('without the cookie the same preset still loads GTM (the fast path is intact)', () => {
    resetAGTM();
    installJar('www.kunde.de');
    visit('www.kunde.de', '');
    aGTM.f.config(cfg());
    expect(loads.length).toBeGreaterThan(0);
  });

  test('debug ignores the cookie, as before', () => {
    resetAGTM();
    const { jar } = installJar('www.kunde.de');
    jar.push({ name: 'aGTMoptout', value: '1700000000000', domain: 'kunde.de', maxAge: 5 });
    visit('www.kunde.de', '');
    aGTM.f.config(Object.assign(cfg(), { debug: true }));
    expect(loads.length).toBeGreaterThan(0);
  });
});

describe('nothing runs and nothing is sent while the objection stands', () => {
  let loads, origLoad, origSI, timers;
  beforeEach(() => {
    resetAGTM();
    globalThis.dataLayer = [];
    loads = [];
    origLoad = aGTM.f.gtm_load;
    aGTM.f.gtm_load = function () { loads.push([].slice.call(arguments)); };
    timers = 0;
    origSI = globalThis.setInterval;
    globalThis.setInterval = function () { timers++; return 0; };
    MockXHR.install();
  });
  afterEach(() => {
    aGTM.f.gtm_load = origLoad;
    globalThis.setInterval = origSI;
    delete document.cookie;
    document.cookie = '';
    location.href = saved.href;
    location.hostname = saved.hostname;
    resetAGTM();
  });

  test('init() alone: no noConsent container, no consent poll (the init() guard)', () => {
    const { jar } = installJar('www.kunde.de');
    jar.push({ name: 'aGTMoptout', value: '1700000000000', domain: 'kunde.de', maxAge: 5 });
    visit('www.kunde.de', '');
    aGTM.c = { gtm: { 'GTM-NC': { noConsent: true }, 'GTM-A': {} }, gtmServices: 'x' };
    aGTM.f.init();
    expect(aGTM.d.optout).toBe(true);
    expect(loads).toHaveLength(0);
    expect(timers).toBe(0);
  });

  test('fire() with _noConsent and _post sends nothing and does not throw', () => {
    const { jar } = installJar('www.kunde.de');
    jar.push({ name: 'aGTMoptout', value: '1700000000000', domain: 'kunde.de', maxAge: 5 });
    visit('www.kunde.de', '');
    aGTM.f.config({ gtm: { 'GTM-A': {} }, gtmServices: 'x', transport_url: 'https://collect.example/t' });
    aGTM.f.fire({ event: 'lead', _noConsent: true, _post: { url: 'https://collect.example/li' } });
    aGTM.f.fire({ event: 'aGTM_custom' });
    aGTM.f.xsend('https://collect.example/direct', { a: 1 });
    expect(MockXHR.instances.length).toBe(0);
    expect(globalThis.dataLayer).toHaveLength(0);
  });
});
