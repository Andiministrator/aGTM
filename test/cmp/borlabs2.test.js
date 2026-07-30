// test/cmp/borlabs2.test.js — consent_check for Borlabs Cookie v2.
//
// Written for one specific defect: the function set hasResponse = true and then
// fell off the end, returning undefined. aGTM.f.run_cc() treats a falsy return as
// "no consent available", discards the result and (on 'update') restores its
// snapshot — so with cmp: "borlabs2" GTM never loaded, not even with full consent,
// and the 500 ms init poll ran forever. cc_borlabs3, added later, has the return.
// The first test below is red without it.
import { describe, test, expect, beforeEach } from 'bun:test';
import { resetAGTM } from '../helpers.js';
import { loadCMP } from './harness.js';

// Borlabs v2 shape: BorlabsCookie.getCookie() returns the stored decision, and
// borlabsCookieConfig.cookies is the configured catalogue. Both globals must be
// present — the adapter picks the v2 branch by BorlabsCookie.getCookie being a
// function.
function withBorlabs2(consents, fn) {
  const hadBC = 'BorlabsCookie' in globalThis, prevBC = globalThis.BorlabsCookie;
  const hadCfg = 'borlabsCookieConfig' in globalThis, prevCfg = globalThis.borlabsCookieConfig;
  globalThis.BorlabsCookie = { getCookie: function () { return { uid: 'u-123', consents: consents }; } };
  globalThis.borlabsCookieConfig = { cookies: { essential: ['borlabs-cookie'], statistics: ['ga'] } };
  try { return fn(); }
  finally {
    if (hadBC) globalThis.BorlabsCookie = prevBC; else delete globalThis.BorlabsCookie;
    if (hadCfg) globalThis.borlabsCookieConfig = prevCfg; else delete globalThis.borlabsCookieConfig;
  }
}

beforeEach(() => { resetAGTM(); loadCMP('borlabs2'); });

describe('cc_borlabs2 consent_check', () => {
  test('returns true once it has written a consent state', () => {
    const ok = withBorlabs2({ essential: ['borlabs-cookie'], statistics: ['ga'] },
      () => aGTM.f.consent_check('init'));
    expect(ok).toBe(true); // undefined here means run_cc discards everything below
    expect(aGTM.d.consent.hasResponse).toBe(true);
    expect(aGTM.d.consent.purposes).toBe(',essential,statistics,');
    expect(aGTM.d.consent.services).toBe(',borlabs-cookie,ga,');
    expect(aGTM.d.consent.consent_id).toBe('u-123');
  });

  test('logs the result like every other adapter, so the Inspector can show it', () => {
    withBorlabs2({ essential: ['borlabs-cookie'] }, () => aGTM.f.consent_check('init'));
    expect(aGTM.l.filter(e => e.id === 'm2').length).toBe(1);
  });

  test('the GTM gate actually opens with a matching requirement', () => {
    aGTM.d.config = true;
    aGTM.c.gdl = 'dataLayer';
    aGTM.c.gtmPurposes = 'statistics';
    globalThis.dataLayer = [];
    const ok = withBorlabs2({ essential: ['borlabs-cookie'], statistics: ['ga'] },
      () => aGTM.f.run_cc('init'));
    expect(ok).toBe(true);
    expect(aGTM.d.consent.gtmConsent).toBe(true);
  });

  test('returns false without the Borlabs globals', () => {
    expect(aGTM.f.consent_check('init')).toBe(false);
  });

  test('returns false for an invalid action', () => {
    expect(aGTM.f.consent_check('bogus')).toBe(false);
  });
});
