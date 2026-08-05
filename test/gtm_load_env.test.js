// test/gtm_load_env.test.js — o.env is appended to the gtm.js URL verbatim, so
// it has to start with "&". A value pasted without it used to produce
// "…&l=dataLayergtm_auth=abc": GTM loads, writes to a dataLayer nobody reads,
// and nothing errors. The sGTM Client guarantees the "&"; a standalone
// integrator (or a generated snippet) has no such guarantee.
import { describe, test, expect, beforeEach } from 'bun:test';
import { resetAGTM } from './helpers.js';

/**
 * The src of the script tag gtm_load inserted.
 *
 * The fake DOM in test/setup.js returns a FRESH stub on every
 * getElementsByTagName('script') call, so patching the object returned by an
 * earlier call records nothing — the tag is inserted into a different stub.
 * The whole lookup has to be replaced instead. (Same trap as the delegated
 * handlers the panel-smoke test used to miss.)
 */
function loadAndReadSrc(opts) {
  const inserted = [];
  const anchor = { parentNode: { insertBefore: (node) => { inserted.push(node); return node; } } };
  const realGet = document.getElementsByTagName;
  document.getElementsByTagName = (tag) => (tag === 'script' ? [anchor] : realGet(tag));
  // gtm_load pushes aGTM_ready/gtm.js through sendnaus first, so the dataLayer
  // has to exist — resetAGTM wipes the config, it does not create one.
  window.dataLayer = [];
  aGTM.c.gdl = 'dataLayer';
  aGTM.d.config = true;
  try {
    aGTM.f.gtm_load(window, document, 'XYZ123', 'id', 'dataLayer', opts);
  } finally {
    document.getElementsByTagName = realGet;
  }
  // Recorded, not asserted here: an assertion inside the DOM stub would be
  // swallowed by the library's own try/catch.
  return inserted.length ? inserted[inserted.length - 1].src : '';
}

describe('gtm_load: the environment string cannot swallow &l=', () => {
  beforeEach(() => { resetAGTM(); });

  test('a value without the leading & gets one', () => {
    const src = loadAndReadSrc({ env: 'gtm_auth=abc&gtm_preview=env-1' });
    expect(src).toContain('&l=dataLayer&gtm_auth=abc');
    expect(src).not.toContain('dataLayergtm_auth');
  });

  test('a value with the leading & keeps exactly one', () => {
    const src = loadAndReadSrc({ env: '&gtm_auth=abc' });
    expect(src).toContain('&l=dataLayer&gtm_auth=abc');
    expect(src).not.toContain('&&');
  });

  test('no env at all changes nothing', () => {
    expect(loadAndReadSrc({})).toContain('&l=dataLayer');
  });
});
