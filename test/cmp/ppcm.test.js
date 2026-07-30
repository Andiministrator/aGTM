// test/cmp/ppcm.test.js — consent_check for the PP Consent Manager (PixelPoint).
//
// The stub below is NOT a convenience fake: hasConsentCategory/hasConsentService
// are a faithful port of pp-consent-manager 1.5.4 (verified against the live
// script at [redacted-host]/lib/pp-consent-manager.js on
// 2026-07-30), including the two rules the adapter delegates to the CMP:
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
    _cookiePrefix: prefix || 'ppcm-consent-',
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
    expect(r.consent.feedback).toBe('Consent (partially or full) accepted');
  });

  test('decline all: essentials only is still a decision, but no tracking purpose', () => {
    setCookies(['ppcm-consent-category-essentials=1,' + TS]);
    const r = runConsentCheck('PPConsentManager', makePPCM(1), 'update');
    expect(r.ok).toBe(true);
    expect(r.consent.purposes).toBe(',essentials,');
    expect(r.consent.feedback).toBe('Consent declined');
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
    expect(r.consent.feedback).toBe('Consent (partially or full) accepted');
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

  test('cookie values carrying the content_blocker_confirmed flag still count', () => {
    setCookies(['ppcm-consent-service-youtube=1,' + TS + ',content_blocker_confirmed']);
    const r = runConsentCheck('PPConsentManager', makePPCM(1), 'update');
    expect(r.ok).toBe(true);
    expect(r.consent.services).toBe(',youtube,');
  });
});
