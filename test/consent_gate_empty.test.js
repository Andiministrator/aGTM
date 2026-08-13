// F-167 — an empty consent condition table must not grant consent.
//
// `chelp(need, given)` answers "nothing required → satisfied", so the chain
//   chelp(gtmPurposes) && chelp(gtmServices) && chelp(gtmVendors)
// was `true` whenever all three were empty ⇒ gtmConsent = true ⇒ GTM loaded
// even for a visitor who clicked "deny all". That was not an edge case: the
// sGTM Client ships its "Consent Check Conditions" table EMPTY, so it was the
// delivered default.
//
// Since v1.5 an empty requirement is fail-closed, and an integrator who
// deliberately wants no gate says so via `allowEmptyConsentConditions`.
//
// Mutation-checked, with the two mutations that matter measured separately —
// one number for "the tests fail" would have hidden that they fail for
// different reasons:
//   * `noConditions = false` (the fix reverted, i.e. the pre-v1.5 state):
//     3 tests fail — both gtmConsent expectations and the log-once test.
//   * `if (noConditions)` without the opt-out check (the switch ignored):
//     1 test fails — "allowEmptyConsentConditions:true restores …".
// "does NOT weaken a configured requirement" is green under both on purpose:
// it guards a third mistake — hoisting the opt-out ahead of the whole chain,
// which would turn it into a global "load GTM anyway" switch.
// The remaining tests guard against collateral damage and are green in every
// state by design.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resetAGTM } from './helpers.js';

describe('F-167 — empty consent conditions are fail-closed', () => {
  afterEach(() => { delete aGTM.f.consent_check; });

  beforeEach(() => {
    // A stray aGTMoptout cookie from a sibling file makes init() wipe
    // everything but aGTM.f — same trap as in initgtm_empty_container.test.js.
    document.cookie = '';
    resetAGTM();
    aGTM.d.config = true;
    aGTM.d.init   = true; // keep run_cc('update') from calling inject()
    aGTM.c.gdl = 'dataLayer';
    aGTM.c.gtmPurposes = '';
    aGTM.c.gtmServices = '';
    aGTM.c.gtmVendors  = '';
    globalThis.dataLayer = [];

    // CMP reports a decision. What it granted is set per test.
    aGTM.f.consent_check = function () {
      aGTM.d.consent = aGTM.d.consent || {};
      aGTM.d.consent.hasResponse = true;
      aGTM.d.consent.purposes = aGTM.d.consent.purposes || '';
      aGTM.d.consent.services = aGTM.d.consent.services || '';
      aGTM.d.consent.vendors  = aGTM.d.consent.vendors  || '';
      return true;
    };
  });

  // [M]
  test('no condition configured + visitor denied everything → gtmConsent=false', () => {
    aGTM.d.consent = { hasResponse: false, purposes: '', services: '', vendors: '' };
    aGTM.f.run_cc('update');
    expect(aGTM.d.consent.gtmConsent).toBe(false);
  });

  // [M] The dangerous half: even FULL consent must not open a gate that was
  // never configured — otherwise "deny all" and "accept all" differ only by
  // what the CMP happens to report, not by what the operator required.
  test('no condition configured + visitor accepted everything → still gtmConsent=false', () => {
    aGTM.d.consent = { hasResponse: false, purposes: '', services: '', vendors: '' };
    aGTM.f.consent_check = function () {
      aGTM.d.consent.hasResponse = true;
      aGTM.d.consent.purposes = ',statistics,marketing,';
      aGTM.d.consent.services = ',Google Tag Manager,';
      aGTM.d.consent.vendors  = ',Google Inc,';
      return true;
    };
    aGTM.f.run_cc('update');
    expect(aGTM.d.consent.gtmConsent).toBe(false);
  });

  // [M]
  test('allowEmptyConsentConditions:true restores the old behaviour', () => {
    aGTM.c.allowEmptyConsentConditions = true;
    aGTM.d.consent = { hasResponse: false, purposes: '', services: '', vendors: '' };
    aGTM.f.run_cc('update');
    expect(aGTM.d.consent.gtmConsent).toBe(true);
  });

  // [M] The opt-out must be exactly that — an opt-out for the EMPTY case. It
  // must never soften a requirement the operator did configure, otherwise it
  // would silently become a global "load GTM anyway" switch.
  test('allowEmptyConsentConditions does NOT weaken a configured requirement', () => {
    aGTM.c.allowEmptyConsentConditions = true;
    aGTM.c.gtmServices = 'Google Tag Manager';
    aGTM.d.consent = { hasResponse: false, purposes: '', services: '', vendors: '' };
    aGTM.f.run_cc('update');
    expect(aGTM.d.consent.gtmConsent).toBe(false);
  });

  test('a configured requirement that IS met still grants (no collateral damage)', () => {
    aGTM.c.gtmServices = 'Google Tag Manager';
    aGTM.d.consent = { hasResponse: false, purposes: '', services: '', vendors: '' };
    aGTM.f.consent_check = function () {
      aGTM.d.consent.hasResponse = true;
      aGTM.d.consent.services = ',Google Tag Manager,';
      return true;
    };
    aGTM.f.run_cc('update');
    expect(aGTM.d.consent.gtmConsent).toBe(true);
  });

  test('a configured requirement that is NOT met still denies (F-49 unchanged)', () => {
    aGTM.c.gtmServices = 'Google Tag Manager';
    aGTM.d.consent = { hasResponse: false, purposes: '', services: '', vendors: '' };
    aGTM.f.consent_check = function () {
      aGTM.d.consent.hasResponse = true;
      aGTM.d.consent.services = ',some-other-service,';
      return true;
    };
    aGTM.f.run_cc('update');
    expect(aGTM.d.consent.gtmConsent).toBe(false);
  });

  test('only ONE log entry, however often run_cc runs (the consent poll)', () => {
    aGTM.d.consent = { hasResponse: false, purposes: '', services: '', vendors: '' };
    aGTM.f.run_cc('update');
    aGTM.f.run_cc('update');
    aGTM.f.run_cc('update');
    var hits = aGTM.l.filter(function (e) { return e.id === 'm_consent_no_conditions'; });
    expect(hits.length).toBe(1);
  });

  test('a single condition of ANY of the three types is enough to leave the empty case', () => {
    ['gtmPurposes', 'gtmServices', 'gtmVendors'].forEach(function (key) {
      resetAGTM();
      aGTM.d.config = true;
      aGTM.d.init = true;
      aGTM.c.gdl = 'dataLayer';
      aGTM.c.gtmPurposes = ''; aGTM.c.gtmServices = ''; aGTM.c.gtmVendors = '';
      aGTM.c[key] = 'required-thing';
      aGTM.d.consent = { hasResponse: false, purposes: '', services: '', vendors: '' };
      aGTM.f.consent_check = function () {
        aGTM.d.consent.hasResponse = true;
        aGTM.d.consent.purposes = ',required-thing,';
        aGTM.d.consent.services = ',required-thing,';
        aGTM.d.consent.vendors  = ',required-thing,';
        return true;
      };
      aGTM.f.run_cc('update');
      expect(aGTM.d.consent.gtmConsent).toBe(true);
    });
  });

  // cmp:'none' and the iframe mode set gtmConsent directly and never pass
  // through run_cc's chelp chain. They are explicit choices by the integrator,
  // whereas an empty table is a blank — the gate must not catch them.
  test("cmp:'none' still injects (it never goes through the chelp chain)", () => {
    document.cookie = '';
    resetAGTM();
    var loaded = [];
    var orig = aGTM.f.gtm_load;
    aGTM.f.gtm_load = function (w, d, i) { loaded.push(i); };
    try {
      aGTM.f.config({ cmp: 'none', gtm: { 'GTM-XXXX': {} } });
      aGTM.f.init();
    } finally {
      aGTM.f.gtm_load = orig;
    }
    expect(aGTM.d.consent.gtmConsent).toBe(true);
    expect(loaded).toEqual(['GTM-XXXX']);
  });
});
