// test/cmp/cookiebot.test.js — consent_check for the Cookiebot CMP.
import { describe, test, expect, beforeEach } from 'bun:test';
import { resetAGTM } from '../helpers.js';
import { loadCMP, runConsentCheck } from './harness.js';

beforeEach(() => { resetAGTM(); loadCMP('cookiebot'); });

describe('cc_cookiebot consent_check', () => {
  test('returns false when Cookiebot is absent', () => {
    expect(aGTM.f.consent_check('update')).toBe(false);
  });

  test('returns false for an invalid action', () => {
    expect(aGTM.f.consent_check('bogus')).toBe(false);
  });

  test('returns false while hasResponse is false', () => {
    var r = runConsentCheck('Cookiebot',
      { hasResponse: false, consent: { marketing: true } }, 'update');
    expect(r.ok).toBe(false);
  });

  test('collects granted purposes into a comma-wrapped string', () => {
    var r = runConsentCheck('Cookiebot',
      { hasResponse: true, consent: { preferences: true, statistics: false, marketing: true } },
      'update');
    expect(r.ok).toBe(true);
    expect(r.consent.purposes).toBe(',preferences,marketing,');
    expect(r.consent.hasResponse).toBe(true);
  });

  test('emits a bare "" when nothing is granted (the F-49-relevant shape)', () => {
    var r = runConsentCheck('Cookiebot',
      { hasResponse: true, consent: { preferences: false, statistics: false } }, 'update');
    expect(r.ok).toBe(true);
    expect(r.consent.purposes).toBe('');
  });
});
