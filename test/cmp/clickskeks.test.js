// test/cmp/clickskeks.test.js — the Clickskeks consent_check.
//
// Why this exists (F-199): the feedback cascade tested `purposeCtr == 0` after
// `if (!purposeCtr) return false`, so "Consent declined" was dead code and a
// visitor who granted nothing was reported as "Consent partially accepted".
// Only the feedback string changes; which purposes count is untouched.
import { describe, test, expect, beforeEach } from 'bun:test';
import { resetAGTM } from '../helpers.js';
import { loadCMP, runConsentCheck } from './harness.js';

const cks = (cfg) => ({ getCurrentAllowedConfig: () => cfg });

beforeEach(() => {
  resetAGTM();
  loadCMP('clickskeks');
});

describe('Clickskeks consent_check', () => {
  test('everything granted → "Consent full accepted"', () => {
    const r = runConsentCheck('Clickskeks', cks({ essential: true, statistics: true }));
    expect(r.ok).toBe(true);
    expect(r.consent.purposes).toBe(',essential,statistics,');
    expect(r.consent.feedback).toBe('Consent full accepted');
  });

  test('part granted → "Consent partially accepted"', () => {
    const r = runConsentCheck('Clickskeks', cks({ essential: true, statistics: false }));
    expect(r.consent.purposes).toBe(',essential,');
    expect(r.consent.feedback).toBe('Consent partially accepted');
  });

  test('nothing granted → "Consent declined" (was: partially accepted)', () => {
    const r = runConsentCheck('Clickskeks', cks({ essential: false, statistics: false }));
    expect(r.ok).toBe(true);
    expect(r.consent.hasResponse).toBe(true);
    expect(r.consent.feedback).toBe('Consent declined');
  });

  test('no configured purposes → no decision', () => {
    const r = runConsentCheck('Clickskeks', cks({}));
    expect(r.ok).toBe(false);
  });
});
