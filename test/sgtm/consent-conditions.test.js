// test/sgtm/consent-conditions.test.js — how the "Consent Check Conditions"
// table becomes the library's gtmPurposes/gtmServices/gtmVendors config.
//
// Why this exists (F-173): the builder used a plain assignment per row, so two
// rows of the same type overwrote each other — the LAST one won, silently,
// while the GTM UI kept showing both. An operator who required two services got
// a gate weaker than the one on their screen, and the error direction was
// fail-open. The table invites exactly that mistake ("Add Consent Check" is a
// per-row button), which is why the fix is a code fix and not only an isUnique
// flag in the UI: the Type column takes a VARIABLE, so two rows can still
// resolve to the same type at request time without the UI ever seeing it.
//
// These run the REAL Client source through the shared harness. Asserting on the
// served config is the only honest level here — the point of the finding was
// that the source LOOKED right.
import { describe, test, expect } from 'bun:test';
import { runClient, injectedConfig } from './client-harness.js';

const BASE = { gtm: [{ gtm_id: 'GTM-TEST', gtm_consent: true }], cookie_mode: 'always' };

/** The served config, or null when no response body was produced. */
function cfgFor(consent) {
  const r = runClient({ data: { ...BASE, consent: consent } });
  expect(r.throws).toBeNull();
  return injectedConfig(r.body);
}

describe('consent condition table → config', () => {
  test('a single row lands unchanged', () => {
    const c = cfgFor([{ consent_type: 'gtmServices', consent_value: 'ga4' }]);
    expect(c.gtmServices).toBe('ga4');
  });

  test('two rows of DIFFERENT types stay independent', () => {
    const c = cfgFor([
      { consent_type: 'gtmServices', consent_value: 'ga4' },
      { consent_type: 'gtmPurposes', consent_value: 'statistics' }
    ]);
    expect(c.gtmServices).toBe('ga4');
    expect(c.gtmPurposes).toBe('statistics');
  });

  // The finding itself. Before the fix this was 'meta' — the first requirement
  // vanished without a trace, and the visitor only had to consent to one of the
  // two services the operator had entered.
  test('two rows of the SAME type are ANDed, not overwritten', () => {
    const c = cfgFor([
      { consent_type: 'gtmServices', consent_value: 'ga4' },
      { consent_type: 'gtmServices', consent_value: 'meta' }
    ]);
    expect(c.gtmServices).toBe('ga4,meta');
  });

  test('three rows of the same type keep their order', () => {
    const c = cfgFor([
      { consent_type: 'gtmVendors', consent_value: 'v1' },
      { consent_type: 'gtmVendors', consent_value: 'v2' },
      { consent_type: 'gtmVendors', consent_value: 'v3' }
    ]);
    expect(c.gtmVendors).toBe('v1,v2,v3');
  });

  // A comma-joined value is only useful if it is the form the library splits on.
  // aGTM.f.chelp() splits the requirement on "," and trims each token, so this
  // is the same string an operator would have typed into a single row.
  // The Client's output is fed to the REAL library helper (test/setup.js has
  // aGTM in scope), so this is the whole chain, not a restatement of the format.
  test('the joined value is the single-row form, so chelp() ANDs it', () => {
    const c = cfgFor([
      { consent_type: 'gtmServices', consent_value: 'ga4' },
      { consent_type: 'gtmServices', consent_value: 'meta' }
    ]);
    expect(aGTM.f.chelp(c.gtmServices, ',ga4,meta,')).toBe(true);
    expect(aGTM.f.chelp(c.gtmServices, ',ga4,')).toBe(false);
    expect(aGTM.f.chelp(c.gtmServices, ',meta,')).toBe(false);
  });

  // The reason empty cells are dropped rather than appended: a bare comma makes
  // chelp() require an empty token, and no consent string contains one — the
  // gate would close for a visitor who granted everything.
  test('an appended empty value would close the gate for everybody', () => {
    expect(aGTM.f.chelp('ga4,', ',ga4,meta,')).toBe(false);
  });
});

describe('consent condition table — unusable cells', () => {
  // An empty value must not append a bare comma. chelp() would then require an
  // EMPTY token, which no consent string can contain — the gate would close for
  // everybody, including a visitor who granted everything.
  test('an empty value is dropped, not appended as an empty requirement', () => {
    const c = cfgFor([
      { consent_type: 'gtmServices', consent_value: 'ga4' },
      { consent_type: 'gtmServices', consent_value: '' }
    ]);
    expect(c.gtmServices).toBe('ga4');
  });

  test('a row with only a type does not create a condition at all', () => {
    const c = cfgFor([{ consent_type: 'gtmServices', consent_value: '' }]);
    expect(c.gtmServices).toBeUndefined();
  });

  test('a dropped row is reported at warn — a silent one is what F-173 was', () => {
    const r = runClient({
      data: { ...BASE, consent: [{ consent_type: 'gtmServices', consent_value: '' }] }
    });
    expect(r.logs.some((l) => l.indexOf('Consent condition without a usable value') >= 0)).toBe(true);
  });

  test('a row without a type is ignored (no key, no crash)', () => {
    const r = runClient({
      data: { ...BASE, consent: [{ consent_type: '', consent_value: 'ga4' }] }
    });
    expect(r.throws).toBeNull();
    const c = injectedConfig(r.body);
    expect(c['']).toBeUndefined();
    expect(c.gtmServices).toBeUndefined();
  });

  // Both columns accept a variable, so a non-string can reach the builder. It
  // must never be handed to the library: aGTM.f.chelp() calls .split() on the
  // requirement, and a type error there takes down run_cc() for every visitor.
  test('a non-string value never reaches the config', () => {
    const c = cfgFor([{ consent_type: 'gtmServices', consent_value: 42 }]);
    expect(c.gtmServices).toBeUndefined();
  });

  test('a non-string type never becomes a config key', () => {
    const r = runClient({
      data: { ...BASE, consent: [{ consent_type: true, consent_value: 'ga4' }] }
    });
    expect(r.throws).toBeNull();
    const c = injectedConfig(r.body);
    expect(c.true).toBeUndefined();
  });
});

// The ck table shares the builder, so it shares the fix. `ck` itself is legacy
// (the library never emits the parameter — OE-2), but the rows still land in
// the served config and must not lie about what they require.
describe('ck consent table → config', () => {
  test('rows of the same ck type are joined too', () => {
    const r = runClient({
      data: {
        ...BASE,
        ck_consent: [
          { ck_consent_type: 'ckServices', ck_consent_value: 'a' },
          { ck_consent_type: 'ckServices', ck_consent_value: 'b' }
        ]
      }
    });
    expect(r.throws).toBeNull();
    expect(injectedConfig(r.body).ckServices).toBe('a,b');
  });
});
