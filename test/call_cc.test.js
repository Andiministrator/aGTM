// test/call_cc.test.js — tests for aGTM.f.call_cc()
import { describe, test, expect, beforeEach } from 'bun:test';
import { resetAGTM } from './helpers.js';

describe('aGTM.f.call_cc()', () => {
  beforeEach(() => {
    resetAGTM();
    delete aGTM.f.consent_check; // ensure no stub bleeds in from other test files
    aGTM.d.config = true;
    aGTM.c.gdl = 'dataLayer';
    aGTM.c.gtmPurposes = '';
    aGTM.c.gtmServices = '';
    aGTM.c.gtmVendors  = '';
    globalThis.dataLayer = [];
  });

  test('returns false when run_cc returns false (consent not yet available)', () => {
    // consent_check not defined → run_cc logs e14 and returns false
    const result = aGTM.f.call_cc();
    expect(result).toBe(false);
  });

  test('calls inject() when consent becomes available and not yet initialized', () => {
    aGTM.f.consent_check = function() {
      aGTM.d.consent = aGTM.d.consent || {};
      aGTM.d.consent.hasResponse = true;
      aGTM.d.consent.purposes = '';
      aGTM.d.consent.services = '';
      aGTM.d.consent.vendors  = '';
      return true;
    };
    let injectCalled = false;
    const origInject = aGTM.f.inject;
    aGTM.f.inject = function() { injectCalled = true; return true; };
    aGTM.f.call_cc();
    aGTM.f.inject = origInject;
    expect(injectCalled).toBe(true);
  });

  test('clears the consent timer when consent is available', () => {
    aGTM.f.consent_check = function() {
      aGTM.d.consent = { hasResponse: true, purposes: '', services: '', vendors: '' };
      return true;
    };
    // Simulate an active consent timer
    aGTM.d.timer.consent = setInterval(function() {}, 10000);
    const timerId = aGTM.d.timer.consent;
    aGTM.d.init = true; // prevent inject() from running
    aGTM.f.call_cc();
    expect(aGTM.d.timer.consent).toBeUndefined();
  });

  test('returns true and skips inject() when already initialized', () => {
    aGTM.f.consent_check = function() {
      aGTM.d.consent = { hasResponse: true, purposes: '', services: '', vendors: '' };
      return true;
    };
    aGTM.d.init = true;
    let injectCalled = false;
    const origInject = aGTM.f.inject;
    aGTM.f.inject = function() { injectCalled = true; return true; };
    const result = aGTM.f.call_cc();
    aGTM.f.inject = origInject;
    expect(result).toBe(true);
    expect(injectCalled).toBe(false);
  });
});
