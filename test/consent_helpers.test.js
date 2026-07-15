// test/consent_helpers.test.js — unit tests for the consent-gate helpers
// aGTM.f.chelp and aGTM.f.evalCons. chelp is the core gate used by run_cc to
// decide gtmConsent (GTM loads only if every configured gtmPurposes/gtmServices/
// gtmVendors requirement is granted). F-49: chelp previously failed OPEN when a
// requirement was set but the granted category was empty ("") — GTM loaded
// without the required consent. These tests pin the fail-closed behaviour and
// keep it symmetric with evalCons.
import { describe, test, expect, beforeEach } from 'bun:test';
import { resetAGTM } from './helpers.js';

beforeEach(() => resetAGTM());

// ── aGTM.f.chelp (single required-vs-granted comparison) ─────────────────────
describe('aGTM.f.chelp()', () => {
  test('no requirement (empty need) → true regardless of granted', () => {
    expect(aGTM.f.chelp('', '')).toBe(true);
    expect(aGTM.f.chelp('', ',Google Analytics,')).toBe(true);
  });

  test('all required entries granted → true', () => {
    expect(aGTM.f.chelp('Google Analytics', ',Google Analytics,')).toBe(true);
    expect(aGTM.f.chelp('Google Analytics, Google Remarketing',
      ',Google Analytics,Google Remarketing,')).toBe(true);
  });

  test('a required entry missing from granted → false', () => {
    expect(aGTM.f.chelp('Google Analytics, Google Remarketing',
      ',Google Analytics,')).toBe(false);
  });

  test('FAIL-CLOSED: requirement set but nothing granted ("") → false (F-49)', () => {
    // The discriminating case. Before the fix `if (need && given)` skipped the
    // whole check when given was "", returning true → GTM loaded without the
    // required consent. Now a set requirement against an empty grant fails.
    expect(aGTM.f.chelp('Google Analytics', '')).toBe(false);
    expect(aGTM.f.chelp('Google Tag Manager', '')).toBe(false);
  });

  test('comma-wrapped empty ("," / ",,") also fails a set requirement', () => {
    // This case already failed closed before the fix; kept as a guard.
    expect(aGTM.f.chelp('Google Analytics', ',')).toBe(false);
    expect(aGTM.f.chelp('Google Analytics', ',,')).toBe(false);
  });

  test('comma boundaries prevent a substring false-grant', () => {
    // "GA" must not match inside ",GAX,". The leading/trailing commas fence it.
    expect(aGTM.f.chelp('GA', ',GAX,')).toBe(false);
    expect(aGTM.f.chelp('GA', ',GA,')).toBe(true);
  });

  test('trims whitespace around comma-separated required entries', () => {
    expect(aGTM.f.chelp('  Google Analytics ,  Google Remarketing ',
      ',Google Analytics,Google Remarketing,')).toBe(true);
  });
});

// ── aGTM.f.evalCons (per-type object evaluation, consent-mode) ────────────────
describe('aGTM.f.evalCons()', () => {
  var granted = {
    purposes: ',analytics,ads,',
    services: ',Google Analytics,',
    vendors:  ',Google Inc,'
  };

  test('empty required arrays → true (nothing to satisfy)', () => {
    expect(aGTM.f.evalCons(
      { purposes: [], services: [], vendors: [] }, granted)).toBe(true);
  });

  test('all required present → true', () => {
    expect(aGTM.f.evalCons(
      { purposes: ['analytics'], services: ['Google Analytics'], vendors: [] },
      granted)).toBe(true);
  });

  test('a required entry missing → false', () => {
    expect(aGTM.f.evalCons(
      { purposes: ['analytics', 'personalization'], services: [], vendors: [] },
      granted)).toBe(false);
  });

  test('FAIL-CLOSED: requirement set but granted category empty → false', () => {
    // Symmetric with chelp's F-49 behaviour: a non-empty required list against
    // an empty granted string is never satisfied.
    expect(aGTM.f.evalCons(
      { purposes: ['analytics'], services: [], vendors: [] },
      { purposes: '', services: '', vendors: '' })).toBe(false);
  });
});
