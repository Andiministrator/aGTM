// test/sgtm/js-errors-field.test.js — the Client's jsErrors checkbox (F-190).
// Opt-out semantics: only an explicit false reaches the library, so a container
// saved before the field existed keeps the library default (capture on).
import { test, expect } from 'bun:test';
import { runClient, injectedConfig } from './client-harness.js';

const BASE = { gtm: [{ gtm_id: 'GTM-TEST', gtm_consent: true }], cookie_mode: 'always' };

test('unticked: jsErrors false reaches the library', () => {
  const r = runClient({ data: { ...BASE, jsErrors: false } });
  expect(r.throws).toBeNull();
  expect(injectedConfig(r.body).jsErrors).toBe(false);
});

test('ticked or absent: nothing is written, the library default (on) applies', () => {
  for (const data of [{ ...BASE, jsErrors: true }, { ...BASE }]) {
    const r = runClient({ data });
    expect(injectedConfig(r.body).jsErrors).toBeUndefined();
  }
});
