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
import { readFileSync } from 'fs';
import { join } from 'path';

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

  // The join is silent in the config but not in the log. For a configuration
  // written before v1.5 it CHANGES the requirement (last row → all rows), so
  // "why did GTM stop loading after the update" has to be answerable from the
  // container log, not from a changelog.
  test('a duplicate type is reported at warn, naming the type and the result', () => {
    const r = runClient({
      data: {
        ...BASE,
        consent: [
          { consent_type: 'gtmServices', consent_value: 'ga4' },
          { consent_type: 'gtmServices', consent_value: 'meta' }
        ]
      }
    });
    const line = r.logs.find((l) => l.indexOf('listed more than once') >= 0);
    expect(line).toBeDefined();
    expect(line).toContain('gtmServices');
    expect(line).toContain('ga4,meta');
  });

  test('a single row of each type produces no duplicate warning', () => {
    const r = runClient({
      data: {
        ...BASE,
        consent: [
          { consent_type: 'gtmServices', consent_value: 'ga4' },
          { consent_type: 'gtmPurposes', consent_value: 'statistics' }
        ]
      }
    });
    expect(r.logs.some((l) => l.indexOf('listed more than once') >= 0)).toBe(false);
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

describe('consent condition table — rows that carry no requirement', () => {
  // Every one of these used to be, or would have become, a SILENT drop. None of
  // them may reach the browser, and none of them may be silent — a row that
  // vanishes without a trace is precisely what F-173 was.

  test('an empty value adds nothing and is reported', () => {
    const r = runClient({
      data: { ...BASE, consent: [
        { consent_type: 'gtmServices', consent_value: 'ga4' },
        { consent_type: 'gtmServices', consent_value: '' }
      ] }
    });
    expect(injectedConfig(r.body).gtmServices).toBe('ga4');
    expect(r.logs.some((l) => l.indexOf('adds nothing') >= 0)).toBe(true);
  });

  test('a row with only a type does not create a condition at all', () => {
    const c = cfgFor([{ consent_type: 'gtmServices', consent_value: '' }]);
    expect(c.gtmServices).toBeUndefined();
  });

  // THE REGRESSION THE JOIN WOULD HAVE CAUSED (critic P1). A trailing comma is
  // the likeliest typo in a column whose own help text says "comma-separated".
  // Raw concatenation turned 'ga4,' + 'meta' into 'ga4,,meta', and chelp() then
  // requires an EMPTY token — it searches for ",," in the granted string, which
  // no consent string contains. The gate would have been shut for 100% of
  // visitors on a site where the very same configuration worked before.
  test('a trailing comma in a cell does not produce an unsatisfiable requirement', () => {
    const c = cfgFor([
      { consent_type: 'gtmServices', consent_value: 'ga4,' },
      { consent_type: 'gtmServices', consent_value: 'meta' }
    ]);
    expect(c.gtmServices).toBe('ga4,meta');
    expect(aGTM.f.chelp(c.gtmServices, ',ga4,meta,')).toBe(true);
  });

  test('the unnormalised form really would have closed the gate', () => {
    // Guards the reasoning above, not the code: if chelp ever started tolerating
    // an empty token, the normalisation would silently lose its purpose.
    expect(aGTM.f.chelp('ga4,,meta', ',ga4,meta,')).toBe(false);
  });

  test('a blank-only cell is not a requirement nobody can meet', () => {
    const r = runClient({
      data: { ...BASE, consent: [{ consent_type: 'gtmServices', consent_value: '   ' }] }
    });
    const c = injectedConfig(r.body);
    expect(c.gtmServices).toBeUndefined();
    expect(r.logs.some((l) => l.indexOf('adds nothing') >= 0)).toBe(true);
    // What it would have been: a requirement chelp() can never satisfy.
    expect(aGTM.f.chelp('   ', ',ga4,meta,')).toBe(false);
  });

  test('surrounding whitespace is normalised away', () => {
    const c = cfgFor([
      { consent_type: 'gtmServices', consent_value: ' ga4 , meta ' },
      { consent_type: 'gtmServices', consent_value: ' ads' }
    ]);
    expect(c.gtmServices).toBe('ga4,meta,ads');
  });

  // A duplicate row repeating the SAME value is the likeliest real duplicate.
  // It changes nothing, so it must not trigger the "STRICTER than before"
  // migration warning — that would send an operator hunting for a behaviour
  // change that never happened.
  test('a duplicate row with an identical value is not reported as a tightening', () => {
    const r = runClient({
      data: { ...BASE, consent: [
        { consent_type: 'gtmServices', consent_value: 'ga4' },
        { consent_type: 'gtmServices', consent_value: 'ga4' }
      ] }
    });
    expect(injectedConfig(r.body).gtmServices).toBe('ga4');
    expect(r.logs.some((l) => l.indexOf('listed more than once') >= 0)).toBe(false);
    expect(r.logs.some((l) => l.indexOf('adds nothing') >= 0)).toBe(true);
  });

  // Both columns accept a variable, so a non-string can reach the builder. It
  // must never be handed to the library: aGTM.f.chelp() calls .split() on the
  // requirement, and a type error there takes down run_cc() for every visitor.
  test('a non-string value never reaches the config, and says so', () => {
    const r = runClient({
      data: { ...BASE, consent: [{ consent_type: 'gtmServices', consent_value: 42 }] }
    });
    expect(injectedConfig(r.body).gtmServices).toBeUndefined();
    expect(r.logs.some((l) => l.indexOf('is not a string') >= 0)).toBe(true);
  });
});

// The Type column is a SELECT, but it carries `macrosInSelect` — the value is
// whatever a GTM variable resolved to at request time, and the row writes
// straight into the config object the browser receives.
describe('consent condition table — the type is whitelisted, not just checked for shape', () => {
  test('a type outside the six known keys is refused and reported', () => {
    const r = runClient({
      data: { ...BASE, consent: [{ consent_type: 'gtmService', consent_value: 'ga4' }] }
    });
    const c = injectedConfig(r.body);
    expect(c.gtmService).toBeUndefined();
    expect(r.logs.some((l) => l.indexOf('is not one of') >= 0)).toBe(true);
  });

  // The one that matters: this key switches the whole F-167 fail-closed gate
  // back OFF, and the checkbox that owns it only overwrites the value when it
  // is ticked — so a non-empty string written here survives in exactly the
  // default configuration.
  test('a type resolving to allowEmptyConsentConditions cannot disable the gate', () => {
    const c = cfgFor([{ consent_type: 'allowEmptyConsentConditions', consent_value: 'ga4' }]);
    expect(c.allowEmptyConsentConditions).toBeUndefined();
  });

  test('a type resolving to an existing config key cannot corrupt it', () => {
    const c = cfgFor([{ consent_type: 'gtm', consent_value: 'ga4' }]);
    expect(typeof c.gtm).toBe('object');
    expect(c.gtm['GTM-TEST']).toBeDefined();
  });

  test('a type resolving to cmp cannot switch the consent check off', () => {
    const c = cfgFor([{ consent_type: 'cmp', consent_value: 'none' }]);
    expect(c.cmp).not.toBe('none');
  });

  // === 1, not truthiness — inherited Object.prototype members must not pass
  // (the F-01 lesson, same as the bot-check enums).
  //
  // Asserted with hasOwnProperty, not `c[magic] === undefined`: the config we
  // read back is a plain object, so `c.constructor` resolves to the INHERITED
  // Object constructor and the naive assertion fails even when the Client
  // behaved perfectly. The first draft of this test fell for exactly the trap
  // it exists to guard — which is the point: the question is whether the key
  // was WRITTEN, not what reading it returns.
  test('inherited prototype names are not valid types', () => {
    for (const magic of ['constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
      const c = cfgFor([{ consent_type: magic, consent_value: 'ga4' }]);
      expect(Object.prototype.hasOwnProperty.call(c, magic)).toBe(false);
    }
  });

  test('an empty or non-string type is refused and reported', () => {
    for (const bad of ['', true, 42, null]) {
      const r = runClient({
        data: { ...BASE, consent: [{ consent_type: bad, consent_value: 'ga4' }] }
      });
      expect(r.throws).toBeNull();
      expect(r.logs.some((l) => l.indexOf('is not one of') >= 0)).toBe(true);
    }
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

// The UI half of the fix. It has no runtime effect, so nothing else in the
// suite would notice it disappearing — and a template re-export from the GTM UI
// is exactly the kind of round-trip that drops a flag. Same genre of guard as
// the embedded-CMP sync and the cmpdetect signature table.
describe('template: the Type columns refuse a duplicate row', () => {
  const TPL = readFileSync(join(import.meta.dir, '..', '..', 'sgtmClient/template.tpl'), 'utf8');
  const PARAMS = JSON.parse(
    TPL.slice(TPL.indexOf('___TEMPLATE_PARAMETERS___') + '___TEMPLATE_PARAMETERS___'.length,
              TPL.indexOf('___SANDBOXED_JS_FOR_SERVER___'))
  );

  /** Finds a PARAM_TABLE by name anywhere in the (nested) parameter tree. */
  function findTable(nodes, name) {
    for (const n of nodes) {
      if (n.type === 'PARAM_TABLE' && n.name === name) return n;
      if (n.subParams) {
        const hit = findTable(n.subParams, name);
        if (hit) return hit;
      }
    }
    return null;
  }

  for (const name of ['consent', 'ck_consent']) {
    test(`${name}: the type column is isUnique`, () => {
      const table = findTable(PARAMS, name);
      expect(table).not.toBeNull();
      // Column order matters: the type is the first column, the value the second.
      // A value column marked unique would forbid requiring the same service
      // under two different types.
      expect(table.paramTableColumns[0].param.name).toContain('type');
      expect(table.paramTableColumns[0].isUnique).toBe(true);
      expect(table.paramTableColumns[1].isUnique).toBe(false);
    });
  }
});

// Same defect class as F-173, one table further up, and the direction is again
// fail-open: the surviving row may be the one WITHOUT a consent check.
describe('container table: a duplicate container id is reported', () => {
  test('two rows with the same id produce a warning', () => {
    const r = runClient({
      data: {
        gtm: [
          { gtm_id: 'GTM-TEST', gtm_consent: true, gtm_url: 'https://own.example/gtm.js' },
          { gtm_id: 'GTM-TEST', gtm_consent: false }
        ],
        cookie_mode: 'always'
      }
    });
    expect(r.throws).toBeNull();
    expect(r.logs.some((l) => l.indexOf('GTM container listed more than once') >= 0)).toBe(true);
  });

  test('a single container produces no such warning', () => {
    const r = runClient({ data: { ...BASE } });
    expect(r.logs.some((l) => l.indexOf('GTM container listed more than once') >= 0)).toBe(false);
  });
});
