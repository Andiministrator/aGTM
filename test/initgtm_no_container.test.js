// F-177 — an aGTM instance without a GTM container must still run its own
// lifecycle.
//
// The lifecycle pushes (aGTM_ready incl. hastyEvents, aPageview, aGTM_consent)
// live inside `aGTM.f.gtm_load`, which `initGTM` only ever called per
// configured container. With no container, none of them fired: the dataLayer
// stayed empty, silently. The v1.2 changelog promised "load aGTM without
// loading a container"; the branch written for it never worked (that was
// F-175) and was removed, which is why this is its own change.
//
// Why anyone would want it: GTM may be loaded by someone else — another
// script, the CMS, a hand-placed snippet — while the page still needs aGTM's
// events. GTM replays the dataLayer array from the start, so it picks them up
// even when it loads later.
//
// No switch gates this. "No container configured" is already the integrator
// saying "aGTM does not load GTM here".
//
// Mutation-checked (numbers measured, see the bottom of this file).

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resetAGTM } from './helpers.js';

function events() {
  return dataLayer.map(function (e) { return e && e.event; });
}

describe('F-177 — lifecycle without a container', () => {
  afterEach(() => { delete aGTM.f.consent_check; });

  beforeEach(() => {
    // See initgtm_empty_container.test.js: a leftover aGTMoptout cookie from a
    // sibling file makes init() wipe everything but aGTM.f.
    document.cookie = '';
    resetAGTM();
    globalThis.dataLayer = [];
  });

  test('aGTM_ready is pushed even though no container is configured', () => {
    aGTM.f.config({ cmp: 'none', aPageview: true });
    aGTM.f.init();
    expect(events()).toContain('aGTM_ready');
  });

  test('aPageview fires without a container when configured', () => {
    aGTM.f.config({ cmp: 'none', aPageview: true });
    aGTM.f.init();
    expect(events()).toContain('aPageview');
  });

  // gtm.js announces a GTM load. Without a container aGTM performs none, and
  // an externally loaded GTM emits its own — a second one would be a duplicate
  // claiming a load that did not happen here.
  test('gtm.js is NOT pushed without a container', () => {
    aGTM.f.config({ cmp: 'none', aPageview: true });
    aGTM.f.init();
    expect(events()).not.toContain('gtm.js');
  });

  test('with a container, gtm.js IS pushed (the distinction is the container)', () => {
    aGTM.f.config({ cmp: 'none', aPageview: true, gtm: { 'GTM-XXXX': {} } });
    aGTM.f.init();
    expect(events()).toContain('gtm.js');
  });

  // The bookkeeping used to sit behind the `if (!i) return;`, so gtmLoaded
  // stayed empty forever without a container and every further call re-fired
  // the whole lifecycle block.
  test('the lifecycle fires exactly once, not per initGTM call', () => {
    aGTM.f.config({ cmp: 'none', aPageview: true });
    aGTM.f.init();
    aGTM.f.initGTM(false);
    aGTM.f.initGTM(false);
    var ready = events().filter(function (e) { return e === 'aGTM_ready'; });
    expect(ready.length).toBe(1);
  });

  test("gtmLoaded records the container-less run as 'no_gtm_id'", () => {
    aGTM.f.config({ cmp: 'none' });
    aGTM.f.init();
    expect(aGTM.d.gtmLoaded).toEqual(['no_gtm_id']);
  });

  // initGTM(true) is the pre-consent pass for noConsent containers. Announcing
  // readiness there would put aGTM_ready in front of the consent decision.
  test('initGTM(true) alone emits nothing (pre-consent pass)', () => {
    aGTM.d.config = true;
    aGTM.c.gdl = 'dataLayer';
    aGTM.f.initGTM(true);
    expect(events()).toEqual([]);
    // `|| []` because gtm_load is what creates the array — the point here is
    // that nothing was recorded, not which flavour of "empty" it is.
    expect(aGTM.d.gtmLoaded || []).toEqual([]);
  });

  test('a configured container is unaffected (no collateral damage)', () => {
    var loaded = [];
    var orig = aGTM.f.gtm_load;
    aGTM.f.gtm_load = function (w, d, i) { loaded.push(i); };
    try {
      aGTM.f.config({ cmp: 'none', gtm: { 'GTM-XXXX': {} } });
      aGTM.f.init();
    } finally {
      aGTM.f.gtm_load = orig;
    }
    // Exactly one call, for the configured container — the container-less
    // branch must not fire alongside it.
    expect(loaded).toEqual(['GTM-XXXX']);
  });

  test('an empty gtm object behaves like a missing gtm key here too', () => {
    aGTM.c.gtm = {};
    aGTM.f.config({ cmp: 'none', aPageview: true });
    aGTM.f.init();
    var withEmpty = events();

    document.cookie = '';
    resetAGTM();
    globalThis.dataLayer = [];
    aGTM.f.config({ cmp: 'none', aPageview: true });
    aGTM.f.init();
    expect(withEmpty).toEqual(events());
  });
});

// Mutation results, measured (9 tests green unmutated):
//   * container-less gtm_load call removed from initGTM  → 4 fail
//   * bookkeeping moved back behind `if (!i) return;`    → 2 fail, incl.
//     "the lifecycle fires exactly once" — exactly the defect that would have
//     made the naive fix wrong, so it earns its own case.
//   * `!noConsentGTM` guard dropped                      → 1 fail
//     ("initGTM(true) alone emits nothing").
// Each part of the change is therefore covered by at least one test that
// actually fails without it.
