// test/cmp/comma_strip.test.js — F-51 sibling: CMPs must strip commas from
// human-readable service/purpose names before joining them into the
// comma-delimited, comma-wrapped consent string. A name containing a comma
// would otherwise split into phantom entries in chelp/consent_serialize →
// consent mismatch. Covers the two global-based CMPs fixed in this pass
// (Usercentrics v3, JTL EU Cookie); Matomo (localStorage/sessionStorage) and
// Shopware 5 (cookie) use the same /,/g pattern and are additionally guarded by
// the template drift test. Each test feeds a comma-bearing name and asserts it
// is stripped — discriminating (fails against the pre-fix code).
import { describe, test, expect, beforeEach } from 'bun:test';
import { resetAGTM } from '../helpers.js';
import { loadCMP, runConsentCheck } from './harness.js';

describe('cc_usercentrics3 strips commas from service names (F-51 class)', () => {
  beforeEach(() => { resetAGTM(); loadCMP('usercentrics3'); });

  test('a service name with commas lands comma-free in the consent string', () => {
    var uc = {
      cmpController: {
        consent: { required: false },
        dps: {
          categories: { marketing: { state: 'ALL_ACCEPTED' } },
          services: {
            s1: { consent: { given: true }, name: 'Meta Platforms, Inc.' },
          },
        },
      },
    };
    var r = runConsentCheck('__ucCmp', uc, 'update');
    expect(r.ok).toBe(true);
    // ',Meta Platforms Inc.,' — the embedded comma must be gone, else the
    // value would split into ',Meta Platforms, Inc.,' (two phantom services).
    expect(r.consent.services).toBe(',Meta Platforms Inc.,');
  });

  test('a subservice name with commas is stripped too', () => {
    var uc = {
      cmpController: {
        consent: { required: false },
        dps: {
          categories: {},
          services: {
            s1: {
              consent: { given: true }, name: 'Parent',
              subservices: { sub1: { consent: { given: true }, name: 'Sub, Two' } },
            },
          },
        },
      },
    };
    var r = runConsentCheck('__ucCmp', uc, 'update');
    expect(r.ok).toBe(true);
    expect(r.consent.services).toBe(',Parent,Sub Two,');
  });
});

describe('cc_jtl_eu_cookie strips commas from names (F-51 class)', () => {
  beforeEach(() => { resetAGTM(); loadCMP('jtl_eu_cookie'); });

  test('comma-bearing purpose and service names are stripped', () => {
    // cc_jtl_eu_cookie gates on the presence of the eu_cookie_store cookie.
    var prevCookie = document.cookie;
    document.cookie = 'eu_cookie_store=1';
    try {
      var euCookie = {
        categories: [{ id: 'c1', consent: true, name: { de: 'Statistik, Analyse' } }],
        services: [{ id: 's1', consent: true, name: { de: 'Google Ireland, Ltd.' } }],
      };
      var r = runConsentCheck('EuCookie', euCookie, 'update');
      expect(r.ok).toBe(true);
      expect(r.consent.purposes).toBe(',Statistik Analyse,');
      expect(r.consent.services).toBe(',Google Ireland Ltd.,');
      // IDs are comma-free by nature and unaffected.
      expect(r.consent.serviceIDs).toBe(',s1,');
    } finally {
      document.cookie = prevCookie;
    }
  });
});
