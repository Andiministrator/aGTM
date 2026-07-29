// test/run_cc.test.js — tests for blocked flag behaviour in aGTM.f.run_cc()
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resetAGTM } from './helpers.js';

describe('aGTM.f.run_cc() — blocked flag on update', () => {
  // `aGTM.f` is shared across the whole `bun test` process — a consent_check
  // stub left behind breaks any later file whose config() carries a session
  // preset (the preset gate calls call_cc() synchronously). Same class as the
  // leak that made a fresh clone red; latent here, closed anyway.
  afterEach(() => { delete aGTM.f.consent_check; });
  beforeEach(() => {
    resetAGTM();
    aGTM.d.config = true;
    aGTM.d.init   = true; // prevent inject() calls from run_cc("update")
    aGTM.c.gdl = 'dataLayer';
    aGTM.c.gtmPurposes = '';
    aGTM.c.gtmServices = '';
    aGTM.c.gtmVendors  = '';
    globalThis.dataLayer = [];

    // Minimal consent_check stub: marks hasResponse=true, sets empty consent strings
    aGTM.f.consent_check = function() {
      aGTM.d.consent = aGTM.d.consent || {};
      aGTM.d.consent.hasResponse = true;
      aGTM.d.consent.purposes   = aGTM.d.consent.purposes   || '';
      aGTM.d.consent.services   = aGTM.d.consent.services   || '';
      aGTM.d.consent.vendors    = aGTM.d.consent.vendors    || '';
      return true;
    };
  });

  test('deletes blocked on action="update"', () => {
    aGTM.d.consent = { hasResponse: true, blocked: true, gtmConsent: true,
                        purposes: '', services: '', vendors: '' };
    aGTM.f.run_cc('update');
    expect(aGTM.d.consent.blocked).toBeUndefined();
  });

  test('preserves blocked on action="init"', () => {
    aGTM.d.consent = { hasResponse: false, blocked: true,
                        purposes: '', services: '', vendors: '' };
    aGTM.f.run_cc('init');
    expect(aGTM.d.consent.blocked).toBe(true);
  });

  test('gtmConsent=false after update when user declines (services do not match)', () => {
    aGTM.c.gtmServices = 'Google Tag Manager'; // requires specific consent
    aGTM.d.consent = { hasResponse: true, blocked: true, gtmConsent: true,
                        purposes: '', services: ',aGTMconsent,', vendors: '' };
    // Override the stub so consent_check explicitly populates services with a
    // non-matching value (realistic CMP behavior after a user decline).
    aGTM.f.consent_check = function() {
      aGTM.d.consent.hasResponse = true;
      aGTM.d.consent.purposes = '';
      aGTM.d.consent.services = ',some-other-service,';
      aGTM.d.consent.vendors  = '';
      return true;
    };
    aGTM.f.run_cc('update');
    // blocked deleted → no service match → gtmConsent=false
    expect(aGTM.d.consent.blocked).toBeUndefined();
    expect(aGTM.d.consent.gtmConsent).toBe(false);
  });

  test('gtmConsent=true after update when user accepts (all required consents given)', () => {
    aGTM.c.gtmServices = ''; // no requirement
    aGTM.d.consent = { hasResponse: false, blocked: false,
                        purposes: '', services: '', vendors: '' };
    aGTM.f.run_cc('update');
    expect(aGTM.d.consent.gtmConsent).toBe(true);
  });

  test('gtmConsent=true on init when blocked=true and services do not match (auto-denial survives init re-check)', () => {
    aGTM.c.gtmServices = 'Google Tag Manager';
    aGTM.d.consent = { hasResponse: false, blocked: true,
                        purposes: '', services: ',aGTMconsent,', vendors: '' };
    aGTM.f.run_cc('init');
    // blocked NOT deleted on init → gtmConsent = blocked = true
    expect(aGTM.d.consent.blocked).toBe(true);
    expect(aGTM.d.consent.gtmConsent).toBe(true);
  });
});
