// test/backport_1_4_x.test.js — the 1.4.x consent-gate backport (F-49, F-167)
// end to end through run_cc, with a CCM19-shaped decision: CCM19 reports a
// fully denied category as a bare "" (see 204295e). These are the acceptance
// cases for the 1.4.4 Client: GTM must not load after "deny all", whatever
// the condition table holds.
import { describe, test, expect, beforeEach } from 'bun:test';
import { resetAGTM } from './helpers.js';

beforeEach(() => resetAGTM());

function decide(cfg, decision) {
  aGTM.f.config(cfg);
  aGTM.f.consent_check = function () {
    aGTM.d.consent.purposes = decision.purposes;
    aGTM.d.consent.services = decision.services;
    aGTM.d.consent.vendors = decision.vendors;
    aGTM.d.consent.hasResponse = true;
    return true;
  };
  aGTM.f.run_cc('init');
  return aGTM.d.consent.gtmConsent;
}

const DENY_ALL = { purposes: '', services: '', vendors: '' };
const ACCEPT_ALL = { purposes: ',technical,statistics,marketing,', services: ',Google Tag Manager,Google Analytics,', vendors: '' };

describe('1.4.x backport — CCM19-shaped decisions', () => {
  test('F-49: configured service + "deny all" (empty string) → GTM stays out', () => {
    expect(decide({ gtmServices: 'Google Tag Manager' }, DENY_ALL)).toBe(false);
  });

  test('F-49: configured service + "accept all" → GTM loads (no collateral damage)', () => {
    expect(decide({ gtmServices: 'Google Tag Manager' }, ACCEPT_ALL)).toBe(true);
  });

  test('F-167: empty condition table + "deny all" → GTM stays out', () => {
    expect(decide({}, DENY_ALL)).toBe(false);
  });

  test('F-167: empty condition table + "accept all" → still out, the table is a blank', () => {
    expect(decide({}, ACCEPT_ALL)).toBe(false);
  });

  test('F-167 opt-out: allowEmptyConsentConditions restores the 1.4.3 behaviour, default is off', () => {
    expect(aGTM.c.allowEmptyConsentConditions).toBeFalsy();
    expect(decide({ allowEmptyConsentConditions: true }, DENY_ALL)).toBe(true);
  });

  test('the ck signal follows the same rule: ckServices + "deny all" → no cookie grant', () => {
    aGTM.f.config({ ckServices: 'TP User ID Cookie' });
    aGTM.d.consent = { purposes: '', services: '', vendors: '' };
    expect(aGTM.f.chelp(aGTM.c.ckServices, aGTM.d.consent.services)).toBe(false);
  });
});
