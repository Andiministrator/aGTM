// test/cmp/cc_consentmanager.test.js — consent_check for the Consentmanager CMP.
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resetAGTM } from '../helpers.js';
import { loadCMP, runConsentCheck } from './harness.js';

const cmpData = (over) => Object.assign({
  consentExists: true,
  userChoiceExists: true,
  purposesList: [{ id: 's1', name: 'Statistics, extended' }, { id: 's2', name: 'Marketing' }],
  purposeConsents: { s1: true },
  purposeLI: {},
  vendorsList: [{ id: 'v1', name: 'Google, Inc.' }],
  vendorConsents: { v1: true },
  vendorLI: {},
  consentstring: 'CS1'
}, over || {});
const cmpFn = (data) => function (cmd) { return cmd === 'getCMPData' ? data : undefined; };

beforeEach(() => { resetAGTM(); loadCMP('consentmanager'); });

describe('cc_consentmanager consent_check', () => {
  test('returns false for an invalid action', () => {
    expect(aGTM.f.consent_check('bogus')).toBe(false);
  });

  test('returns false while the user has made no choice', () => {
    const r = runConsentCheck('__cmp', cmpFn(cmpData({ userChoiceExists: false })), 'init');
    expect(r.ok).toBe(false);
  });

  test('maps purposes and vendors, commas stripped from names', () => {
    const r = runConsentCheck('__cmp', cmpFn(cmpData()), 'update');
    expect(r.ok).toBe(true);
    expect(r.consent.purposes).toBe(',Statistics extended,');
    expect(r.consent.vendors).toBe(',Google Inc.,');
    expect(r.consent.consent_id).toBe('CS1');
    expect(r.consent.hasResponse).toBe(true);
  });
});

// F-164: a blocked or missing CMP is not a decision. The adapter used to fire
// a fetch to cdn.consentmanager.net on the 11th miss and, when it failed,
// report hasResponse with blocked=true — which loaded GTM.
describe('cc_consentmanager — a blocked CMP never yields a decision (F-164)', () => {
  let fetchCalls;
  let origFetch;
  beforeEach(() => {
    fetchCalls = 0;
    origFetch = globalThis.fetch;
    globalThis.fetch = function () { fetchCalls++; return Promise.reject(new Error('blocked')); };
  });
  afterEach(() => { globalThis.fetch = origFetch; });

  test('many misses: always false, no third-party request, no blocked flag', async () => {
    for (let i = 0; i < 30; i++) expect(aGTM.f.consent_check('init')).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchCalls).toBe(0);
    expect(aGTM.f.consent_check('init')).toBe(false);
    expect(aGTM.d.consent.hasResponse).not.toBe(true);
    expect(aGTM.d.consent.blocked).toBeUndefined();
    expect(aGTM.d.consent.req_ctr).toBeUndefined();
  });
});
