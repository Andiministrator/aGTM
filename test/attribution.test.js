// test/attribution.test.js — HYBRID attribution merge per integration-guide.md §7.
// Covers parseUrlParams, resolveAttribution per-field rules, the config-end
// loop populating aGTM.d.attribution, and the standalone (no-preset) path.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resetAGTM, MockXHR } from './helpers.js';

// Helper to swap location.search and document.referrer between tests.
function setUrl(search, referrer) {
  globalThis.location.search   = search   || '';
  globalThis.document.referrer = referrer || '';
}

describe('aGTM.f.parseUrlParams', () => {
  beforeEach(() => { MockXHR.install(); resetAGTM(); });
  afterEach(()  => { MockXHR.reset(); setUrl('', ''); });

  test('returns {} for empty input', () => {
    expect(aGTM.f.parseUrlParams('')).toEqual({});
    expect(aGTM.f.parseUrlParams(null)).toEqual({});
    expect(aGTM.f.parseUrlParams(undefined)).toEqual({});
  });

  test('returns {} when input does not start with "?"', () => {
    expect(aGTM.f.parseUrlParams('utm_source=google')).toEqual({});
  });

  test('parses single param', () => {
    expect(aGTM.f.parseUrlParams('?utm_source=google'))
      .toEqual({ utm_source: 'google' });
  });

  test('parses multiple params', () => {
    expect(aGTM.f.parseUrlParams('?utm_source=google&utm_medium=cpc&utm_campaign=summer'))
      .toEqual({ utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'summer' });
  });

  test('decodes percent-encoded values', () => {
    expect(aGTM.f.parseUrlParams('?utm_campaign=summer%20sale'))
      .toEqual({ utm_campaign: 'summer sale' });
  });

  test('decodes "+" as space (form encoding)', () => {
    expect(aGTM.f.parseUrlParams('?utm_campaign=summer+sale'))
      .toEqual({ utm_campaign: 'summer sale' });
  });

  test('handles param without value', () => {
    expect(aGTM.f.parseUrlParams('?flag&foo=bar'))
      .toEqual({ flag: '', foo: 'bar' });
  });

  test('survives malformed percent-encoding without throwing', () => {
    var out = aGTM.f.parseUrlParams('?broken=%E0%A4&ok=yes');
    expect(out.ok).toBe('yes');
    // broken value falls through with raw form rather than crashing
    expect('broken' in out).toBe(true);
  });
});

describe('aGTM.f.resolveAttribution — URL wins for browser-derivable fields', () => {
  beforeEach(() => { MockXHR.install(); resetAGTM(); });
  afterEach(()  => { MockXHR.reset(); setUrl('', ''); });

  test('utm_source from URL wins over API sou', () => {
    setUrl('?utm_source=google', '');
    aGTM.d.session = { attribution: { last_touch: { sou: 'newsletter' } } };
    var r = aGTM.f.resolveAttribution('last_touch');
    expect(r.sou).toBe('google');
  });

  test('falls back to API when URL is empty', () => {
    setUrl('', '');
    aGTM.d.session = { attribution: { last_touch: { sou: 'newsletter', cam: 'may_digest' } } };
    var r = aGTM.f.resolveAttribution('last_touch');
    expect(r.sou).toBe('newsletter');
    expect(r.cam).toBe('may_digest');
  });

  test('returns "" for missing field in both URL and API', () => {
    setUrl('', '');
    aGTM.d.session = { attribution: { last_touch: {} } };
    var r = aGTM.f.resolveAttribution('last_touch');
    expect(r.sou).toBe('');
    expect(r.cam).toBe('');
    expect(r.med).toBe('');
  });

  test('all four UTMs from URL win', () => {
    setUrl('?utm_source=google&utm_medium=cpc&utm_campaign=sale&utm_id=12345', '');
    aGTM.d.session = { attribution: { last_touch: {
      sou: 'old', cam: 'old', med: 'old', camid: 'old'
    } } };
    var r = aGTM.f.resolveAttribution('last_touch');
    expect(r.sou).toBe('google');
    expect(r.cam).toBe('sale');
    expect(r.med).toBe('cpc');
    expect(r.camid).toBe('12345');
  });

  test('mixed: URL provides one field, API fills in others (true HYBRID)', () => {
    // URL has only utm_source. API has cam + med + afs + lcs.
    // Asserts URL win AND multiple API fallbacks in the same call —
    // catches a regression like "URL fields wipe the whole API result".
    setUrl('?utm_source=urlsource', '');
    aGTM.d.session = { attribution: { last_touch: {
      sou: 'apisource', cam: 'apicam', med: 'apimed',
      afs: 'webgains_42', lcs: 'https://api.lcs/'
    } } };
    var r = aGTM.f.resolveAttribution('last_touch');
    expect(r.sou).toBe('urlsource');     // URL won
    expect(r.cam).toBe('apicam');        // API filled
    expect(r.med).toBe('apimed');        // API filled
    expect(r.afs).toBe('webgains_42');   // API-only
    expect(r.lcs).toBe('https://api.lcs/'); // API-only
  });

  test('repeated UTM in URL: last value wins (form-encoding default)', () => {
    setUrl('?utm_source=first&utm_source=second', '');
    var r = aGTM.f.resolveAttribution('last_touch');
    expect(r.sou).toBe('second');
  });
});

describe('aGTM.f.resolveAttribution — click-ID detection', () => {
  beforeEach(() => { MockXHR.install(); resetAGTM(); });
  afterEach(()  => { MockXHR.reset(); setUrl('', ''); });

  test('detects gclid → cli/clp/cls', () => {
    setUrl('?gclid=Cj0KCQabc', '');
    var r = aGTM.f.resolveAttribution('last_touch');
    expect(r.cli).toBe('Cj0KCQabc');
    expect(r.clp).toBe('gclid');
    expect(r.cls).toBe('Google Ads');
  });

  test('detects fbclid', () => {
    setUrl('?fbclid=IwAR2x', '');
    var r = aGTM.f.resolveAttribution('last_touch');
    expect(r.cli).toBe('IwAR2x');
    expect(r.clp).toBe('fbclid');
    expect(r.cls).toBe('Meta');
  });

  test('detects msclkid', () => {
    setUrl('?msclkid=abc123', '');
    var r = aGTM.f.resolveAttribution('last_touch');
    expect(r.clp).toBe('msclkid');
    expect(r.cls).toBe('Microsoft Ads');
  });

  test('detects ttclid', () => {
    setUrl('?ttclid=xyz', '');
    var r = aGTM.f.resolveAttribution('last_touch');
    expect(r.clp).toBe('ttclid');
    expect(r.cls).toBe('TikTok Ads');
  });

  test('gbraid → Google Ads', () => {
    setUrl('?gbraid=abc', '');
    var r = aGTM.f.resolveAttribution('last_touch');
    expect(r.clp).toBe('gbraid');
    expect(r.cls).toBe('Google Ads');
  });

  test('two click-IDs in URL: gclid wins (deterministic ordered scan)', () => {
    setUrl('?gclid=googleval&fbclid=metaval', '');
    var r = aGTM.f.resolveAttribution('last_touch');
    expect(r.cli).toBe('googleval');
    expect(r.clp).toBe('gclid');
    expect(r.cls).toBe('Google Ads');
  });

  test('URL click-ID wins over API click-ID', () => {
    setUrl('?gclid=fresh', '');
    aGTM.d.session = { attribution: { last_touch: {
      cli: 'stale', clp: 'fbclid', cls: 'Meta'
    } } };
    var r = aGTM.f.resolveAttribution('last_touch');
    expect(r.cli).toBe('fresh');
    expect(r.clp).toBe('gclid');
    expect(r.cls).toBe('Google Ads');
  });

  test('falls back to API click-ID when URL has none', () => {
    setUrl('', '');
    aGTM.d.session = { attribution: { last_touch: {
      cli: 'stored', clp: 'gclid', cls: 'Google Ads'
    } } };
    var r = aGTM.f.resolveAttribution('last_touch');
    expect(r.cli).toBe('stored');
    expect(r.clp).toBe('gclid');
    expect(r.cls).toBe('Google Ads');
  });

  test('cls only re-derived when URL clp is set; otherwise API cls used', () => {
    // URL has no click-ID, API has clp + cls — cls should come from API verbatim
    setUrl('?utm_source=foo', '');
    aGTM.d.session = { attribution: { last_touch: {
      cli: 'stored', clp: 'wbraid', cls: 'Google Ads'
    } } };
    var r = aGTM.f.resolveAttribution('last_touch');
    expect(r.cls).toBe('Google Ads');
  });
});

describe('aGTM.f.resolveAttribution — referrer (sre) and API-only fields', () => {
  beforeEach(() => { MockXHR.install(); resetAGTM(); });
  afterEach(()  => { MockXHR.reset(); setUrl('', ''); });

  test('document.referrer wins over API sre', () => {
    setUrl('', 'https://www.google.com/');
    aGTM.d.session = { attribution: { last_touch: { sre: 'https://old.example/' } } };
    var r = aGTM.f.resolveAttribution('last_touch');
    expect(r.sre).toBe('https://www.google.com/');
  });

  test('falls back to API sre when document.referrer is empty', () => {
    setUrl('', '');
    aGTM.d.session = { attribution: { last_touch: { sre: 'https://api.example/' } } };
    var r = aGTM.f.resolveAttribution('last_touch');
    expect(r.sre).toBe('https://api.example/');
  });

  test('afs/lcs/fss are API-only (URL never overrides)', () => {
    setUrl('?source=urlbased', 'https://www.google.com/');
    aGTM.d.session = { attribution: { last_touch: {
      afs: 'webgains_12345',
      lcs: 'https://l.facebook.com/',
      fss: 'organic'
    } } };
    var r = aGTM.f.resolveAttribution('last_touch');
    expect(r.afs).toBe('webgains_12345');
    expect(r.lcs).toBe('https://l.facebook.com/');
    expect(r.fss).toBe('organic');
  });

  test('all 11 fields default to "" with no URL data and no API data', () => {
    setUrl('', '');
    var r = aGTM.f.resolveAttribution('last_touch');
    expect(r).toEqual({
      sou: '', cam: '', med: '', camid: '',
      cli: '', clp: '', cls: '',
      afs: '', sre: '', lcs: '', fss: ''
    });
  });

  test('returns "" for fields when method has no entry in API', () => {
    setUrl('', '');
    aGTM.d.session = { attribution: { last_touch: { sou: 'google' } } };
    // Asking for a method that wasn't fetched
    var r = aGTM.f.resolveAttribution('first_click');
    expect(r.sou).toBe('');
    expect(r.afs).toBe('');
  });
});

describe('aGTM.f.config — populates aGTM.d.attribution from cfg.session.attribution', () => {
  beforeEach(() => { MockXHR.install(); setUrl('', ''); });
  afterEach(()  => { MockXHR.reset(); setUrl('', ''); });

  test('single method: aGTM.d.attribution.last_touch is resolved from preset', () => {
    setUrl('?utm_source=urlsource', '');
    resetAGTM({
      session: {
        sid: 's-1',
        attribution: {
          last_touch: { sou: 'apisource', cam: 'apicam', afs: 'webgains' }
        }
      }
    });
    expect(aGTM.d.attribution.last_touch).toBeDefined();
    expect(aGTM.d.attribution.last_touch.sou).toBe('urlsource'); // URL wins
    expect(aGTM.d.attribution.last_touch.cam).toBe('apicam');    // API fallback
    expect(aGTM.d.attribution.last_touch.afs).toBe('webgains');  // API-only
  });

  test('multi-method: each method resolved independently with shared URL data', () => {
    setUrl('?utm_source=google&gclid=abc', '');
    resetAGTM({
      session: {
        sid: 's-1',
        attribution: {
          last_touch: { sou: 'newsletter', afs: 'webgains' },
          last_non_direct_click: { sou: 'organic', fss: 'google' }
        }
      }
    });
    expect(aGTM.d.attribution.last_touch.sou).toBe('google');
    expect(aGTM.d.attribution.last_touch.afs).toBe('webgains');
    expect(aGTM.d.attribution.last_non_direct_click.sou).toBe('google');
    expect(aGTM.d.attribution.last_non_direct_click.fss).toBe('google');
    // gclid from URL applied to BOTH methods
    expect(aGTM.d.attribution.last_touch.cli).toBe('abc');
    expect(aGTM.d.attribution.last_non_direct_click.cli).toBe('abc');
    expect(aGTM.d.attribution.last_touch.clp).toBe('gclid');
  });

  test('empty preset attribution {}: aGTM.d.attribution stays {}', () => {
    setUrl('?utm_source=google', '');
    resetAGTM({
      session: { sid: 's-1', attribution: {} }
    });
    expect(aGTM.d.attribution).toEqual({});
  });

  test('no preset session at all: aGTM.d.attribution stays {} (legacy / standalone)', () => {
    setUrl('?utm_source=google', '');
    resetAGTM({}); // no session
    expect(aGTM.d.session_status).toBe('');
    expect(aGTM.d.attribution).toEqual({});
  });

  test('preset with sid only (no attribution field): aGTM.d.attribution stays {}', () => {
    resetAGTM({ session: { sid: 's-1' } });
    expect(aGTM.d.attribution).toEqual({});
  });

  test('preset with attribution but session.attribution = null: no crash, stays {}', () => {
    // attribution is intentionally null — guarded by typeof check
    resetAGTM({ session: { sid: 's-1', attribution: null } });
    expect(aGTM.d.attribution).toEqual({});
  });

  test('attribution-only preset (no sid, no consent) is accepted and resolved', () => {
    // The session-acceptance gate must accept an attribution-only payload —
    // otherwise sGTM Client responses that carry attribution but no usable
    // session block would be silently dropped.
    setUrl('?utm_source=google', '');
    resetAGTM({
      session: { attribution: { last_touch: { afs: 'webgains_99' } } }
    });
    expect(aGTM.d.session.attribution).toBeDefined();
    expect(aGTM.d.attribution.last_touch).toBeDefined();
    expect(aGTM.d.attribution.last_touch.sou).toBe('google');     // URL
    expect(aGTM.d.attribution.last_touch.afs).toBe('webgains_99'); // API
  });

  test('method name "constructor" does not crash and produces URL-only result', () => {
    // Defensive guard: apiKeyed['constructor'] returns Function from prototype.
    // typeof check on apiAttrib falls back to {} so resolution proceeds.
    setUrl('?utm_source=google', '');
    aGTM.d.session = { attribution: {} };
    var r = aGTM.f.resolveAttribution('constructor');
    expect(r.sou).toBe('google');
    expect(r.afs).toBe('');
  });
});
