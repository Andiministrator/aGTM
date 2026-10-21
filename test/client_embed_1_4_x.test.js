// test/client_embed_1_4_x.test.js — what the 1.4.x sGTM Client actually serves.
//
// 1. Drift guard: this line has no build.sh, so nothing else checks that the
//    base64 blob embedded in the Client is the library built from aGTM.js.
// 2. Acceptance (F-49/F-167, CCM19): the embedded library plus the embedded
//    CCM19 consent_check run in their own context, the way the Client
//    concatenates them (agtm + cmp + config + init). After "deny all" no
//    gtm.js script tag may be inserted.
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import vm from 'vm';

const TPL = readFileSync('./sgtmClient/template.tpl', 'utf8');
const SRC = readFileSync('./sgtmClient/src/aGTM-sGTM-Client-jsSourceCode.js', 'utf8');
const MIN = readFileSync('./aGTM.min.js', 'utf8');

function blobOf(text) {
  const m = text.match(/const agtm = fromBase64\('([^']*)'\)/);
  if (!m) throw new Error('no embedded library blob found');
  return Buffer.from(m[1], 'base64').toString('utf8');
}

function cmpCode(displayValue) {
  const start = TPL.indexOf('___TEMPLATE_PARAMETERS___') + '___TEMPLATE_PARAMETERS___'.length;
  const end = TPL.indexOf('___SANDBOXED_JS_FOR_SERVER___');
  const params = JSON.parse(TPL.slice(start, end));
  let found = null;
  (function walk(list) {
    for (const p of list) {
      if (p.name === 'cmp') found = p;
      if (p.subParams) walk(p.subParams);
    }
  })(params);
  const item = found.selectItems.find((i) => i.displayValue === displayValue);
  if (!item) throw new Error('CMP option not found: ' + displayValue);
  return item.value;
}

// Runs the served script in a fresh context; returns the inserted script URLs.
function serve(cfg, ccm) {
  const inserted = [];
  const tag = () => ({
    setAttribute(k, v) { this[k] = v; },
    getAttribute() { return null; }
  });
  const firstScript = { parentNode: { insertBefore(el) { inserted.push(el.src || '[inline]'); } } };
  const doc = {
    cookie: '', referrer: '', readyState: 'complete', title: 't',
    createElement: tag,
    head: { appendChild(el) { inserted.push(el.src || '[inline]'); } },
    body: { appendChild() {} },
    getElementsByTagName: (n) => (n === 'script' ? [firstScript] : [{}]),
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
    addEventListener() {}, removeEventListener() {}
  };
  const loc = { href: 'https://www.example.org/', hostname: 'www.example.org', search: '', hash: '', pathname: '/', protocol: 'https:' };
  const win = {
    document: doc, location: loc, navigator: { userAgent: 'test' },
    screen: { width: 1, height: 1 }, history: { pushState() {}, replaceState() {} },
    performance: { now: () => Date.now() },
    addEventListener() {}, removeEventListener() {},
    setInterval() { return 1; }, clearInterval() {}, setTimeout() { return 1; }, clearTimeout() {},
    JSON, Date, Math, Object, Array, String, Number, Boolean, RegExp, Error, encodeURIComponent, decodeURIComponent, URL,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    CCM: ccm
  };
  doc.location = loc;
  win.window = win; win.self = win; win.top = win;
  const ctx = vm.createContext(win);
  const code = blobOf(TPL) + cmpCode('CCM19') + 'aGTM.f.config(' + JSON.stringify(cfg) + ');aGTM.f.init();';
  vm.runInContext(code, ctx);
  // consent_listener polls via setInterval (stubbed); one manual tick is the
  // first poll the browser would run.
  vm.runInContext('aGTM.f.call_cc && aGTM.f.call_cc();', ctx);
  return { gtm: inserted.filter((u) => /gtm\.js/.test(u)), aGTM: ctx.aGTM };
}

const DENY_ALL = { consentRequired: true, consent: true, fullConsentGiven: false, acceptedEmbeddings: [] };
const ACCEPT_ALL = {
  consentRequired: true, consent: true, fullConsentGiven: true,
  acceptedEmbeddings: [{ id: 'e1', name: 'CCM19 Cookie Consent' }, { id: 'e2', name: 'Google Tag Manager' }]
};
const GTM = { 'GTM-TEST1': {} };

describe('1.4.x Client — embedded library is the built one', () => {
  test('template blob == client source blob == aGTM.min.js == aGTM.base64', () => {
    expect(blobOf(TPL)).toBe(MIN);
    expect(blobOf(SRC)).toBe(MIN);
    expect(Buffer.from(readFileSync('./aGTM.base64', 'utf8').trim(), 'base64').toString('utf8')).toBe(MIN);
  });

  test('the Client version and the embedded library version are the released pair', () => {
    expect(TPL).toContain('const aGTMversion = "1.4.5";');
    expect(SRC).toContain('const aGTMversion = "1.4.5";');
    expect(MIN).toContain('"version","1.4.3"');
  });
});

describe('1.4.x Client — CCM19 acceptance (F-49/F-167)', () => {
  test('condition configured + "deny all" → no gtm.js', () => {
    const r = serve({ gtm: GTM, gtmServices: 'Google Tag Manager' }, DENY_ALL);
    expect(r.aGTM.d.consent.hasResponse).toBe(true);
    expect(r.gtm).toEqual([]);
  });

  test('condition configured + "accept all" → gtm.js loads', () => {
    const r = serve({ gtm: GTM, gtmServices: 'Google Tag Manager' }, ACCEPT_ALL);
    expect(r.gtm.length).toBe(1);
    expect(r.gtm[0]).toContain('id=GTM-TEST1');
  });

  test('empty condition table + "deny all" → no gtm.js', () => {
    expect(serve({ gtm: GTM }, DENY_ALL).gtm).toEqual([]);
  });

  test('empty condition table + "accept all" → still no gtm.js (the table is a blank)', () => {
    const r = serve({ gtm: GTM }, ACCEPT_ALL);
    expect(r.gtm).toEqual([]);
    expect(r.aGTM.l.some((e) => e.id === 'm_consent_no_conditions')).toBe(true);
  });
});

describe('1.4.x Client — bot check never swallows the response (F-244)', () => {
  const block = (t) => t.slice(t.indexOf('var boturl = data.botCheck;'), t.indexOf('// EOF'));

  test('both failure paths of sendHttpGet serve the library', () => {
    const b = block(SRC);
    expect(b).toMatch(/const botCheckFailed = function\(error\) \{[^}]*sendCode\(200,jsCode\);/);
    expect(b).toContain('}, botCheckFailed);');
    expect(b).toMatch(/if \(!queryPermission\('send_http', boturl\)\) \{\s*botCheckFailed\(/);
  });

  test('no try/catch anywhere in the server block - the sandbox refuses to parse it', () => {
    expect(SRC).not.toMatch(/\btry\s*\{/);
    expect(SRC).not.toMatch(/\bcatch\s*\(/);
  });

  test('template server block == client source (sync invariant)', () => {
    const start = TPL.indexOf('___SANDBOXED_JS_FOR_SERVER___') + '___SANDBOXED_JS_FOR_SERVER___'.length;
    const end = TPL.indexOf('___SERVER_PERMISSIONS___');
    expect(TPL.slice(start, end).trim()).toBe(SRC.trim());
  });

  test('send_http lists exactly the one placeholder host', () => {
    const perms = JSON.parse(TPL.slice(TPL.indexOf('___SERVER_PERMISSIONS___') + 25, TPL.indexOf('___TESTS___')));
    const http = perms.find((p) => p.instance.key.publicId === 'send_http').instance.param;
    const urls = http.find((p) => p.key === 'urls').value.listItem.map((i) => i.string);
    expect(urls).toEqual(['https://tgapi.example.com/']);
  });
});
