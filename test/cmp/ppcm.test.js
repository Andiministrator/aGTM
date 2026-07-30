// test/cmp/ppcm.test.js — consent_check for the PP Consent Manager (PixelPoint).
//
// The stub below is NOT a convenience fake: hasConsentCategory/hasConsentService
// are a faithful port of the CMP's own reader (pp-consent-manager, filesVersion
// 1.5.4, read on 2026-07-30 — source and findings recorded in
// knowledge/sources-visited.md), including the three rules the adapter delegates:
//   - the cookie value is "<consentVersion>,<epoch-seconds>"; a first field that
//     does not match the site's current consentVersion voids the decision,
//   - a second field of 0 means "not granted",
//   - a service cookie that is MISSING is false, while a service cookie that is
//     merely version-stale falls back to the "media" category.
// A stub that just answered "cookie present -> true" would make these tests
// tautological: they would pass for a presence-only adapter too.
import { describe, test, expect, beforeEach } from 'bun:test';
import { resetAGTM } from '../helpers.js';
import { loadCMP, runConsentCheck } from './harness.js';

const TS = '1785231132'; // real timestamp field shape, as seen in the browser

function makePPCM(consentVersion, prefix) {
  return {
    _cookiePrefix: prefix === undefined ? 'ppcm-consent-' : prefix,
    _config: { consentVersion: consentVersion === undefined ? 1 : consentVersion },
    _isStringNotEmpty: function (s) { return typeof s === 'string' && s.length > 0; },
    _getCookie: function (n) {
      const wanted = n + '=';
      const parts = decodeURIComponent(globalThis.document.cookie).split(';');
      for (let i = 0; i < parts.length; i++) {
        let o = parts[i];
        while (o.charAt(0) === ' ') o = o.substring(1);
        if (o.indexOf(wanted) === 0) return o.substring(wanted.length, o.length);
      }
      return undefined;
    },
    hasConsentCategory: function (n) {
      const e = this._getCookie(this._cookiePrefix + 'category-' + n);
      if (!this._isStringNotEmpty(e)) return false;
      const t = e.split(',');
      return !(t.length <= 1 || t[0] !== this._config.consentVersion.toString()) && !!parseInt(t[1]);
    },
    hasConsentService: function (n, ignoreFallback) {
      const t = this._getCookie(this._cookiePrefix + 'service-' + n);
      if (!this._isStringNotEmpty(t)) return false;
      const r = t.split(',');
      return r.length > 1 && r[0] === this._config.consentVersion.toString()
        ? !!parseInt(r[1])
        : (!ignoreFallback && this.hasConsentCategory('media'));
    }
  };
}

function setCookies(pairs) { globalThis.document.cookie = pairs.join('; '); }

beforeEach(() => {
  resetAGTM();
  loadCMP('ppcm');
  globalThis.document.cookie = '';
});

describe('cc_ppcm consent_check', () => {
  test('returns false when PPConsentManager is absent (fail closed)', () => {
    setCookies(['ppcm-consent-category-essentials=1,' + TS]);
    expect(aGTM.f.consent_check('update')).toBe(false);
    expect(aGTM.d.consent.hasResponse).toBeFalsy();
  });

  test('returns false when the CMP object lacks the API functions', () => {
    setCookies(['ppcm-consent-category-essentials=1,' + TS]);
    const r = runConsentCheck('PPConsentManager', { _cookiePrefix: 'ppcm-consent-' }, 'update');
    expect(r.ok).toBe(false);
  });

  test('returns false for an invalid action', () => {
    expect(aGTM.f.consent_check('bogus')).toBe(false);
  });

  test('short-circuits on init when a response is already present', () => {
    aGTM.d.consent = { hasResponse: true };
    expect(aGTM.f.consent_check('init')).toBe(true);
  });

  test('first visit: CMP ready, no cookies -> no response yet', () => {
    const r = runConsentCheck('PPConsentManager', makePPCM(1), 'init');
    expect(r.ok).toBe(false);
    expect(r.consent.hasResponse).toBeFalsy();
  });

  test('accept all: every granted category lands in purposes, comma-wrapped', () => {
    setCookies([
      'ppcm-consent-category-essentials=1,' + TS,
      'ppcm-consent-category-media=1,' + TS,
      'ppcm-consent-category-statistics=1,' + TS
    ]);
    const r = runConsentCheck('PPConsentManager', makePPCM(1), 'init');
    expect(r.ok).toBe(true);
    expect(r.consent.purposes).toBe(',essentials,media,statistics,');
    expect(r.consent.services).toBe('');
    expect(r.consent.hasResponse).toBe(true);
    expect(r.consent.feedback).toBe('Consent given by user');
  });

  test('decline all: essentials only is still a decision, but no tracking purpose', () => {
    setCookies(['ppcm-consent-category-essentials=1,' + TS]);
    const r = runConsentCheck('PPConsentManager', makePPCM(1), 'update');
    expect(r.ok).toBe(true);
    expect(r.consent.purposes).toBe(',essentials,');
  });

  test('the essentials category name is not hardcoded (singular spelling works)', () => {
    setCookies(['ppcm-consent-category-essential=1,' + TS]);
    const r = runConsentCheck('PPConsentManager', makePPCM(1), 'update');
    expect(r.ok).toBe(true);
    expect(r.consent.purposes).toBe(',essential,');
  });

  test('a bumped consentVersion voids stored cookies -> no response (fail closed)', () => {
    setCookies([
      'ppcm-consent-category-essentials=1,' + TS,
      'ppcm-consent-category-statistics=1,' + TS
    ]);
    const r = runConsentCheck('PPConsentManager', makePPCM(2), 'update'); // site now at v2
    expect(r.ok).toBe(false);
    expect(r.consent.hasResponse).toBeFalsy();
    // Nothing is written on the false path — run_cc() has already cleared the
    // CMP-managed fields and restores its snapshot when the check returns false.
    expect(r.consent.purposes).toBeFalsy();
  });

  test('a second field of 0 is a denial, not a grant', () => {
    setCookies([
      'ppcm-consent-category-essentials=1,' + TS,
      'ppcm-consent-category-statistics=1,0'
    ]);
    const r = runConsentCheck('PPConsentManager', makePPCM(1), 'update');
    expect(r.ok).toBe(true);
    expect(r.consent.purposes).toBe(',essentials,');
  });

  test('a decline that grants nothing is still a decision (version field matches)', () => {
    // No always-on cookie at all, one explicitly denied category. The per-item
    // verdict is false everywhere, so only the version field can show that the
    // visitor answered — otherwise this is indistinguishable from "no banner yet".
    setCookies(['ppcm-consent-category-statistics=1,0']);
    const r = runConsentCheck('PPConsentManager', makePPCM(1), 'update');
    expect(r.ok).toBe(true);
    expect(r.consent.hasResponse).toBe(true);
    expect(r.consent.purposes).toBe('');
    expect(r.consent.services).toBe('');
    expect(r.consent.feedback).toBe('Consent declined');
  });

  test('a value without the version/timestamp shape is ignored', () => {
    setCookies(['ppcm-consent-category-statistics=yes']);
    const r = runConsentCheck('PPConsentManager', makePPCM(1), 'update');
    expect(r.ok).toBe(false);
    expect(r.consent.purposes).toBeFalsy();
  });

  test('granted services land in services, categories stay in purposes', () => {
    setCookies([
      'ppcm-consent-category-essentials=1,' + TS,
      'ppcm-consent-service-youtube=1,' + TS
    ]);
    const r = runConsentCheck('PPConsentManager', makePPCM(1), 'update');
    expect(r.ok).toBe(true);
    expect(r.consent.purposes).toBe(',essentials,');
    expect(r.consent.services).toBe(',youtube,');
  });

  test("mirrors the CMP's media fallback for a version-stale service cookie", () => {
    setCookies([
      'ppcm-consent-category-essentials=1,' + TS,
      'ppcm-consent-category-media=1,' + TS,
      'ppcm-consent-service-vimeo=0,' + TS // stale version -> CMP falls back to media
    ]);
    const r = runConsentCheck('PPConsentManager', makePPCM(1), 'update');
    expect(r.ok).toBe(true);
    expect(r.consent.services).toBe(',vimeo,');
  });

  test('a service cookie alone (content blocker confirmed) counts as a decision', () => {
    setCookies(['ppcm-consent-service-googlemaps=1,' + TS]);
    const r = runConsentCheck('PPConsentManager', makePPCM(1), 'update');
    expect(r.ok).toBe(true);
    expect(r.consent.purposes).toBe('');
    expect(r.consent.services).toBe(',googlemaps,');
  });

  test('a renamed cookie prefix is honoured, unrelated cookies are ignored', () => {
    setCookies([
      'session=abc',
      'other-consent-category-statistics=1,' + TS,
      'pp2-consent-category-statistics=1,' + TS
    ]);
    const r = runConsentCheck('PPConsentManager', makePPCM(1, 'pp2-consent-'), 'update');
    expect(r.ok).toBe(true);
    expect(r.consent.purposes).toBe(',statistics,');
  });

  test('an empty cookie prefix is a legitimate prefix, not a missing one', () => {
    setCookies(['category-statistics=1,' + TS]);
    const r = runConsentCheck('PPConsentManager', makePPCM(1, ''), 'update');
    expect(r.ok).toBe(true);
    expect(r.consent.purposes).toBe(',statistics,');
  });

  test('the prefix must match at the START of the cookie name', () => {
    // A cookie that merely CONTAINS the prefix must not be mistaken for one of
    // ours — the name would be cut in the wrong place and queried under a
    // nonsense key.
    setCookies(['x-ppcm-consent-category-statistics=1,' + TS]);
    const r = runConsentCheck('PPConsentManager', makePPCM(1), 'update');
    expect(r.ok).toBe(false);
    expect(r.consent.purposes).toBeFalsy();
  });

  test('cookie values carrying the content_blocker_confirmed flag still count', () => {
    setCookies(['ppcm-consent-service-youtube=1,' + TS + ',content_blocker_confirmed']);
    const r = runConsentCheck('PPConsentManager', makePPCM(1), 'update');
    expect(r.ok).toBe(true);
    expect(r.consent.services).toBe(',youtube,');
  });

  test('a "=" inside the cookie value does not corrupt the name', () => {
    setCookies([
      'ppcm-consent-category-statistics=1,' + TS,
      'unrelated=a=b'
    ]);
    const r = runConsentCheck('PPConsentManager', makePPCM(1), 'update');
    expect(r.ok).toBe(true);
    expect(r.consent.purposes).toBe(',statistics,');
  });

  test('survives a document without a readable cookie property', () => {
    const prev = globalThis.document;
    globalThis.document = { get cookie() { throw new Error('blocked'); } };
    try {
      const r = runConsentCheck('PPConsentManager', makePPCM(1), 'update');
      expect(r.ok).toBe(false);
    } finally { globalThis.document = prev; }
  });

  test('an undefined cookie property does not become a phantom cookie name', () => {
    const prev = globalThis.document;
    globalThis.document = { cookie: undefined };
    try {
      const r = runConsentCheck('PPConsentManager', makePPCM(1), 'update');
      expect(r.ok).toBe(false);
      expect(aGTM.d.consent.purposes).toBeFalsy();
    } finally { globalThis.document = prev; }
  });

  test('an exception from the CMP API yields no verdict instead of taking aGTM down', () => {
    // The CMP's reader dereferences its own _config; a half-initialised CMP
    // throws. run_cc() only restores its snapshot on a false RETURN, and
    // aGTM.f.fire() does not guard the call at all — so an escaping exception
    // would wipe the consent state and swallow the event that triggered it.
    setCookies(['ppcm-consent-category-statistics=1,' + TS]);
    const broken = makePPCM(1);
    broken.hasConsentCategory = function () { throw new TypeError('_config is undefined'); };
    let ok;
    expect(() => { ok = runConsentCheck('PPConsentManager', broken, 'update').ok; }).not.toThrow();
    expect(ok).toBe(false);
    expect(aGTM.d.consent.hasResponse).toBeFalsy();
  });

  describe('canonical output (the object is hashed by aGTM)', () => {
    test('the same consent state produces the same string regardless of cookie order', () => {
      setCookies([
        'ppcm-consent-category-statistics=1,' + TS,
        'ppcm-consent-category-media=1,' + TS
      ]);
      const a = runConsentCheck('PPConsentManager', makePPCM(1), 'update').consent.purposes;
      resetAGTM(); loadCMP('ppcm');
      setCookies([
        'ppcm-consent-category-media=1,' + TS,
        'ppcm-consent-category-statistics=1,' + TS
      ]);
      const b = runConsentCheck('PPConsentManager', makePPCM(1), 'update').consent.purposes;
      expect(a).toBe(b);
      expect(a).toBe(',media,statistics,');
    });

    test('a duplicated cookie name is not duplicated in the consent string', () => {
      // Classic cause: the same cookie set on .domain.tld and on www.domain.tld.
      setCookies([
        'ppcm-consent-category-statistics=1,' + TS,
        'ppcm-consent-category-statistics=1,' + TS
      ]);
      const r = runConsentCheck('PPConsentManager', makePPCM(1), 'update');
      expect(r.consent.purposes).toBe(',statistics,');
    });
  });

  describe('name hygiene (any script that can write a cookie can invent a name)', () => {
    test('names outside a plain slug charset are skipped', () => {
      // The comma case is the load-bearing one: a comma inside a name would break
      // the delimiter of the comma-wrapped consent string (F-51). Here the charset
      // guard rejects the name outright, which is why the adapter carries no
      // separate /,/g strip — loosening this charset without restoring that strip
      // makes this test fail, which is the point.
      setCookies([
        'ppcm-consent-category-statistics=1,' + TS,
        'ppcm-consent-category-st,a,ts=1,' + TS,
        'ppcm-consent-category-<script>=1,' + TS,
        'ppcm-consent-category-a"b=1,' + TS
      ]);
      const r = runConsentCheck('PPConsentManager', makePPCM(1), 'update');
      expect(r.consent.purposes).toBe(',statistics,');
      const inner = r.consent.purposes.replace(/^,|,$/g, '');
      expect(inner.indexOf(',')).toBe(-1);
    });

    test('a name of exactly the length limit is kept, one over it is not', () => {
      const ok = 'a'.repeat(64);
      const tooLong = 'b'.repeat(65);
      setCookies([
        'ppcm-consent-category-' + ok + '=1,' + TS,
        'ppcm-consent-category-' + tooLong + '=1,' + TS
      ]);
      const r = runConsentCheck('PPConsentManager', makePPCM(1), 'update');
      expect(r.consent.purposes).toBe(',' + ok + ',');
    });

    test('the number of collected entries is bounded', () => {
      const many = [];
      for (let i = 0; i < 80; i++) many.push('ppcm-consent-category-c' + i + '=1,' + TS);
      setCookies(many);
      const r = runConsentCheck('PPConsentManager', makePPCM(1), 'update');
      const count = r.consent.purposes.split(',').filter(Boolean).length;
      expect(count).toBeLessThanOrEqual(50);
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('withdrawal (a revoke deletes every cookie)', () => {
    test('once a decision was seen, missing cookies mean withdrawn, not unanswered', () => {
      setCookies([
        'ppcm-consent-category-essentials=1,' + TS,
        'ppcm-consent-category-statistics=1,' + TS
      ]);
      const first = runConsentCheck('PPConsentManager', makePPCM(1), 'init');
      expect(first.ok).toBe(true);
      expect(first.consent.purposes).toBe(',essentials,statistics,');

      globalThis.document.cookie = ''; // revokeConsentAll() deletes them
      const second = runConsentCheck('PPConsentManager', makePPCM(1), 'update');
      expect(second.ok).toBe(true);            // a verdict, NOT "not ready"
      expect(second.consent.hasResponse).toBe(true);
      expect(second.consent.purposes).toBe(''); // nothing granted any more
      expect(second.consent.feedback).toBe('Consent declined');
    });

    test('on a fresh page load, missing cookies still mean no consent', () => {
      // The memory is per page load on purpose: without cookies there is no
      // stored decision, and keeping GTM out is the whole point.
      const r = runConsentCheck('PPConsentManager', makePPCM(1), 'init');
      expect(r.ok).toBe(false);
      expect(r.consent.hasResponse).toBeFalsy();
    });
  });

  test('the cookie scan is logged once per page, not once per poll tick', () => {
    // Without the log line, "visitor has not answered" and "the CMP renamed its
    // cookie prefix" are indistinguishable. With one per tick it would flood
    // aGTM.l (the init poll runs every 500 ms and has no cap).
    runConsentCheck('PPConsentManager', makePPCM(1), 'init');
    runConsentCheck('PPConsentManager', makePPCM(1), 'update');
    runConsentCheck('PPConsentManager', makePPCM(1), 'update');
    const scans = aGTM.l.filter(e => e.id === 'm_ppcm_scan');
    expect(scans.length).toBe(1);
    expect(scans[0].obj.prefix).toBe('ppcm-consent-');
  });
});

// ── Integration through the real run_cc(), which is where the consequences are ──
describe('cc_ppcm through aGTM.f.run_cc', () => {
  beforeEach(() => {
    resetAGTM();
    loadCMP('ppcm');
    globalThis.document.cookie = '';
    // objinit() alone leaves the config empty — run_cc() refuses to run without
    // aGTM.d.config, and needs to know where to push and what the gate requires.
    aGTM.d.config = true;
    aGTM.c.gdl = 'dataLayer';
    aGTM.c.gtmPurposes = 'statistics';
    globalThis.dataLayer = [];
  });

  test('grants GTM on consent and withdraws it again on revoke', () => {
    setCookies([
      'ppcm-consent-category-essentials=1,' + TS,
      'ppcm-consent-category-statistics=1,' + TS
    ]);
    globalThis.PPConsentManager = makePPCM(1);
    try {
      expect(aGTM.f.run_cc('init')).toBe(true);
      expect(aGTM.d.consent.gtmConsent).toBe(true);

      globalThis.document.cookie = ''; // user revokes everything
      expect(aGTM.f.run_cc('update')).toBe(true);
      // The decisive assertion: the withdrawal is not restored away.
      expect(aGTM.d.consent.gtmConsent).toBe(false);
      expect(aGTM.d.consent.purposes).toBe('');
      const events = globalThis[aGTM.c.gdl].filter(e => e && e.event === 'aGTM_consent_update');
      expect(events.length).toBe(1);
    } finally { delete globalThis.PPConsentManager; }
  });

  test('an undecided visitor keeps GTM out and leaves no update event', () => {
    globalThis.PPConsentManager = makePPCM(1);
    try {
      expect(aGTM.f.run_cc('init')).toBe(false);
      expect(aGTM.d.consent.gtmConsent).toBeFalsy();
      expect(globalThis[aGTM.c.gdl].length).toBe(0);
    } finally { delete globalThis.PPConsentManager; }
  });
});
