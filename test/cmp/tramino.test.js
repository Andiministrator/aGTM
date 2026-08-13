// test/cmp/tramino.test.js — the Tramino consent_check.
//
// Why this exists: the success path set `hasResponse = true` and then fell off
// the end of the function, returning `undefined`. run_cc() sees falsy, logs m8
// and never calls inject(). On the 'init' path that healed itself on the next
// 500 ms tick through the hasResponse short-circuit, so it only ever looked like
// a small delay — but on 'update' under 1.5 the B2 reset clears hasResponse
// first, the short-circuit no longer applies, and every consent change was
// swallowed without a trace. Found by the critic round on the OneTrust fix.
import { describe, test, expect, beforeEach } from 'bun:test';
import { resetAGTM } from '../helpers.js';
import { loadCMP } from './harness.js';

/** Tramino keeps its decision in localStorage under `consentPermission`. */
function withStorage(value, fn) {
  const prev = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => (k === 'consentPermission' ? value : null) };
  try { return fn(); } finally { globalThis.localStorage = prev; }
}

beforeEach(() => {
  resetAGTM();
  loadCMP('tramino');
});

describe('Tramino consent_check', () => {
  // THE BUG: this returned undefined, so run_cc treated a granted consent as
  // "no answer yet" and GTM was never injected on the update path.
  test('granted consent returns true, not undefined', () => {
    const ok = withStorage('true', () => globalThis.aGTM.f.consent_check('update'));
    expect(ok).toBe(true);
    expect(globalThis.aGTM.d.consent.hasResponse).toBe(true);
    expect(globalThis.aGTM.d.consent.purposes).toBe(',Consent,');
    expect(globalThis.aGTM.d.consent.feedback).toBe('Consent accepted');
  });

  test('no decision stored → false, and nothing is claimed', () => {
    const ok = withStorage(null, () => globalThis.aGTM.f.consent_check('update'));
    expect(ok).toBe(false);
    expect(globalThis.aGTM.d.consent.hasResponse).toBeFalsy();
  });

  test('a value other than "true" is not a granted consent', () => {
    expect(withStorage('false', () => globalThis.aGTM.f.consent_check('update'))).toBe(false);
    expect(withStorage('', () => globalThis.aGTM.f.consent_check('update'))).toBe(false);
  });

  test('an invalid action is rejected', () => {
    expect(globalThis.aGTM.f.consent_check('nonsense')).toBe(false);
  });

  test("the 'init' short-circuit is intact", () => {
    globalThis.aGTM.d.consent = { hasResponse: true };
    expect(globalThis.aGTM.f.consent_check('init')).toBe(true);
  });
});
