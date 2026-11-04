// test/uidc.test.js — the gtm.js request tells its sGTM whether the user-ID
// cookie may be stored (`&uidc=1|0`, card #134). The GTM Client that serves
// gtm.js has no consent of its own on that request and cannot ask the aGTM
// Client, so the library carries the answer. Fail-closed throughout: the
// receiver reads a missing parameter as "not granted", and the library sends
// "0" for every case it cannot confirm.
import { describe, test, expect, beforeEach } from 'bun:test';
import { resetAGTM } from './helpers.js';

/** The src of the script tag gtm_load inserted (same stub as gtm_load_env.test.js). */
function loadAndReadSrc(opts) {
  const inserted = [];
  const anchor = { parentNode: { insertBefore: (node) => { inserted.push(node); return node; } } };
  const realGet = document.getElementsByTagName;
  document.getElementsByTagName = (tag) => (tag === 'script' ? [anchor] : realGet(tag));
  window.dataLayer = [];
  aGTM.c.gdl = 'dataLayer';
  aGTM.d.config = true;
  try {
    aGTM.f.gtm_load(window, document, 'XYZ123', 'id', 'dataLayer', opts);
  } finally {
    document.getElementsByTagName = realGet;
  }
  return inserted.length ? inserted[inserted.length - 1].src : '';
}

const OWN = { gtmURL: 'https://sgtm.example.com/gtm.js' };

describe('aGTM.f.uidc: the answer', () => {
  beforeEach(() => { resetAGTM(); });

  test('no requirement configured: empty, i.e. no parameter', () => {
    aGTM.d.consent = { hasResponse: true, services: ',UserID,' };
    expect(aGTM.f.uidc()).toBe('');
  });

  test('service granted: "1"', () => {
    aGTM.c.uidc = { service: 'UserID', purpose: '', vendor: '', any: false };
    aGTM.d.consent = { hasResponse: true, services: ',Google Analytics,UserID,', purposes: '', vendors: '' };
    expect(aGTM.f.uidc()).toBe('1');
  });

  test('service not granted: "0" (another service is not enough)', () => {
    aGTM.c.uidc = { service: 'UserID' };
    aGTM.d.consent = { hasResponse: true, services: ',Google Analytics,', purposes: '', vendors: '' };
    expect(aGTM.f.uidc()).toBe('0');
  });

  test('a substring of a granted service does not count', () => {
    aGTM.c.uidc = { service: 'UserID' };
    aGTM.d.consent = { hasResponse: true, services: ',UserID Plus,' };
    expect(aGTM.f.uidc()).toBe('0');
  });

  test('purpose or vendor alone is enough, as on the Client', () => {
    aGTM.c.uidc = { service: 'UserID', purpose: 'statistics', vendor: 'v1' };
    aGTM.d.consent = { hasResponse: true, services: '', purposes: ',statistics,', vendors: '' };
    expect(aGTM.f.uidc()).toBe('1');
    aGTM.d.consent = { hasResponse: true, services: '', purposes: '', vendors: ',v1,' };
    expect(aGTM.f.uidc()).toBe('1');
  });

  test('no decision yet: "0", even if the string would match', () => {
    aGTM.c.uidc = { service: 'UserID' };
    aGTM.d.consent = { hasResponse: false, services: ',UserID,' };
    expect(aGTM.f.uidc()).toBe('0');
  });

  test('the Client auto-denial block: "0"', () => {
    aGTM.c.uidc = { service: 'aGTMconsent' };
    aGTM.d.consent = { hasResponse: true, services: ',aGTMconsent,', blocked: false };
    expect(aGTM.f.uidc()).toBe('0');
  });

  test('no requirement but any:true grants on an explicit signal only', () => {
    aGTM.c.uidc = { service: '', purpose: '', vendor: '', any: true };
    aGTM.d.consent = { hasResponse: true, services: ',essential,', purposes: '', vendors: '' };
    expect(aGTM.f.uidc()).toBe('1');
    aGTM.d.consent = { hasResponse: true, services: '', purposes: '', vendors: '' };
    expect(aGTM.f.uidc()).toBe('0');
  });

  test('no requirement and any not literally true: "0"', () => {
    aGTM.c.uidc = { any: 'true' };
    aGTM.d.consent = { hasResponse: true, services: ',essential,' };
    expect(aGTM.f.uidc()).toBe('0');
  });

  test('literal match of one name, exactly like the Client (no trim, no list)', () => {
    // The Client's inConsentStr() looks for ",<field value>," as typed. A rule
    // that trimmed or split here would answer "1" where the Client never grants.
    aGTM.d.consent = { hasResponse: true, services: ',UserID,X,Other,' };
    for (const v of [' UserID', 'UserID ', ',UserID,', 'UserID,Other', 'UserID']) {
      aGTM.c.uidc = { service: v };
      expect(aGTM.f.uidc()).toBe('0');
    }
    aGTM.c.uidc = { service: 'Other' };
    expect(aGTM.f.uidc()).toBe('1');
  });

  test('a value that is not a string counts as empty and does not throw', () => {
    aGTM.d.consent = { hasResponse: true, services: ',UserID,' };
    for (const v of [['UserID'], true, 1, { a: 1 }]) {
      aGTM.c.uidc = { service: v };
      expect(() => aGTM.f.uidc()).not.toThrow();
      expect(aGTM.f.uidc()).toBe('0');
    }
  });

  test('missing consent strings do not throw', () => {
    aGTM.c.uidc = { service: 'UserID', purpose: 'p', vendor: 'v' };
    aGTM.d.consent = { hasResponse: true };
    expect(aGTM.f.uidc()).toBe('0');
  });

  test('config() takes the option over', () => {
    aGTM.f.config({ gtm: { 'GTM-X': {} }, uidc: { service: 'UserID' } });
    expect(aGTM.c.uidc).toEqual({ service: 'UserID' });
  });
});

describe('gtm_load: the parameter on the gtm.js URL', () => {
  beforeEach(() => { resetAGTM(); });

  test('own gtmURL with a requirement: appended', () => {
    aGTM.c.uidc = { service: 'UserID' };
    aGTM.d.consent = { hasResponse: true, services: ',UserID,' };
    expect(loadAndReadSrc(OWN)).toMatch(/&uidc=1$/);
    aGTM.d.consent = { hasResponse: true, services: ',other,' };
    expect(loadAndReadSrc(OWN)).toMatch(/&uidc=0$/);
  });

  test('after the env string, which keeps its place behind &l=', () => {
    aGTM.c.uidc = { service: 'UserID' };
    aGTM.d.consent = { hasResponse: true, services: ',UserID,' };
    const src = loadAndReadSrc({ gtmURL: OWN.gtmURL, env: '&gtm_auth=abc' });
    expect(src).toContain('&l=dataLayer&gtm_auth=abc&uidc=1');
  });

  test('Google\'s gtm.js (no gtmURL) never gets it', () => {
    aGTM.c.uidc = { service: 'UserID' };
    aGTM.d.consent = { hasResponse: true, services: ',UserID,' };
    expect(loadAndReadSrc({})).not.toContain('uidc');
  });

  test('no requirement configured: no parameter', () => {
    aGTM.d.consent = { hasResponse: true, services: ',UserID,' };
    expect(loadAndReadSrc(OWN)).not.toContain('uidc');
  });
});
