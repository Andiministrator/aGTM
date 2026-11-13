// test/cmp/success-return.test.js — every consent_check ends its success path with `return true`.
//
// Why this exists: run_cc() treats any falsy return as "no answer yet". On 'update' the B2 reset
// clears hasResponse first, so an adapter that sets hasResponse = true and then falls off the end of
// the function (returning undefined) has every consent change restored away — including a withdrawal.
// With a Client preset that carried a stored grant, the withdrawal then never reached the consent
// store either. F-200 fixed this for Tramino only; five more adapters had the same ending (F-287).
import { describe, test, expect, beforeEach } from 'bun:test';
import { readdirSync, readFileSync } from 'fs';
import { resetAGTM } from '../helpers.js';
import { loadCMP } from './harness.js';

const files = readdirSync('./cmp').filter((f) => /^cc_.*\.js$/.test(f) && !/\.min\.js$/.test(f));

/** The statements of aGTM.f.consent_check, without comments and blank lines. */
function lastStatement(src) {
  const start = src.search(/^aGTM\.f\.consent_check\s*=\s*function/m);
  if (start < 0) return null;
  const end = src.indexOf('\n};', start);
  const body = src.slice(start, end).replace(/\r/g, '').split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').trim())
    .filter((l) => l !== '');
  return body[body.length - 1];
}

describe('structure: success path returns true', () => {
  test('there are adapter files to check', () => {
    expect(files.length).toBeGreaterThan(20);
  });
  for (const f of files) {
    test(f + ' ends consent_check with return true', () => {
      expect(lastStatement(readFileSync('./cmp/' + f, 'utf8'))).toBe('return true;');
    });
  }
});

describe('JTL Consent: a withdrawal on update is not swallowed', () => {
  function withConsent(settings, fn) {
    const prev = globalThis.localStorage;
    globalThis.localStorage = { getItem: (k) => (k === 'consent' ? JSON.stringify({ settings: settings }) : null) };
    try { return fn(); } finally { globalThis.localStorage = prev; }
  }

  beforeEach(() => {
    resetAGTM();
    loadCMP('jtl_consent');
  });

  test('update with a decision returns true', () => {
    const ok = withConsent({ essential: true, google_tag_manager: false },
      () => globalThis.aGTM.f.consent_check('update'));
    expect(ok).toBe(true);
    expect(globalThis.aGTM.d.consent.services).toBe(',essential,');
    expect(globalThis.aGTM.d.consent.hasResponse).toBe(true);
  });

  test('no stored decision → false', () => {
    const prev = globalThis.localStorage;
    globalThis.localStorage = { getItem: () => null };
    try { expect(globalThis.aGTM.f.consent_check('update')).toBe(false); }
    finally { globalThis.localStorage = prev; }
  });
});
