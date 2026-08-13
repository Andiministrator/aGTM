// The user-id cookie default was corrected to `_tpf` in v1.5.
//
// `_TPU` had been the default since the v1.5 Session refactor, and it was never
// a chosen name: it was the EXAMPLE in the field help of the older, separate
// "user_id" server template, whose field had no default at all. The refactor
// promoted that example to a default — and nobody noticed, because every real
// installation had cookie_name set to `_tpf` by hand. Measured: no customer
// site carries a `_TPU` cookie. The default now matches what actually runs.
//
// The correction still has to be non-destructive. A default that only moves
// would orphan any cookie written under the old name: the visitor looks brand
// new, loses their stable C.* id and the consent recorded under it, and gets
// asked by the CMP again. So `_TPU` is still READ (never written), the value is
// carried over to the current name, and the old cookie is then retired.
//
// That fallback also keeps an earlier fix working: the cleanup that removes an
// F.* fingerprint wrongly written into the cookie searches under the CONFIGURED
// name, so without the legacy read it would never find those again.
//
// Mutation-checked (5 green unmutated):
//   * LEGACY_COOKIE_NAMES emptied     -> 2 fail
//   * the legacy cookie left in place -> 2 fail
// Note the harness had to be taught the cookie NAME for this: its
// getCookieValues stub returned the same list for every name, so a fallback
// chain could never miss and these tests would have been green without the
// feature.

import { describe, test, expect } from 'bun:test';
import { runClient } from './client-harness.js';

const BASE = {
  gtm: [{ gtm_id: 'GTM-TEST', gtm_consent: true }],
  cookie_mode: 'always',
  session_api_url: 'https://api.example/tp/session',
  tenant_id: 't'
  // cookie_name deliberately unset — this is about the DEFAULT.
};

const OK = () => ({ statusCode: 200, body: JSON.stringify({ sessionId: 's1', counter: 3 }) });

/** Set-Cookie headers the Client emitted, as [name, value] pairs. */
function cookieWrites(r) {
  return (r.cookies || []).map((c) => [c.name, c.val]);
}

function configObj(r) {
  const c = r.body.slice(r.body.lastIndexOf('aGTM.f.config('));
  const start = c.indexOf('({');
  if (start < 0) return null;
  let depth = 0;
  for (let i = start + 1; i < c.length; i++) {
    if (c[i] === '{') depth++;
    else if (c[i] === '}') { depth--; if (depth === 0) return JSON.parse(c.slice(start + 1, i + 1)); }
  }
  return null;
}

describe('user-id cookie default corrected to _tpf', () => {
  test('a fresh visitor with a C.* id gets the new name', () => {
    const r = runClient({ data: { ...BASE }, cookies: ['C.1.t.abcdef123456.1700000000'], http: OK });
    expect(r.throws).toBeNull();
    const names = cookieWrites(r).map((c) => c[0]);
    expect(names).toContain('_tpf');
    expect(names).not.toContain('_TPU');
  });

  test('a visitor still carrying _TPU keeps their id — it moves to the new name', () => {
    const r = runClient({
      data: { ...BASE },
      cookies: [{ name: '_TPU', value: 'C.1.t.abcdef123456.1700000000' }],
      http: OK
    });
    expect(r.throws).toBeNull();
    // The uid was found, so the session is keyed on it rather than on a
    // freshly minted one — this is what "nobody is logged out" means here.
    expect(configObj(r).session.uid).toBe('C.1.t.abcdef123456.1700000000');
    const writes = cookieWrites(r);
    expect(writes).toContainEqual(['_tpf', 'C.1.t.abcdef123456.1700000000']);
    // ...and the old one is retired rather than left behind as a duplicate.
    expect(writes).toContainEqual(['_TPU', '']);
  });


  test('an F.* left in a legacy cookie is still cleaned up (F-153 must not regress)', () => {
    // The whole point of keeping the legacy names readable: this cleanup runs
    // under CFG.cookieName, so after the rename it would never find these.
    const r = runClient({
      data: { ...BASE },
      cookies: [{ name: '_TPU', value: 'F.1.t.deadbeef.20260813' }],
      http: OK
    });
    expect(r.throws).toBeNull();
    expect(cookieWrites(r)).toContainEqual(['_TPU', '']);
  });

  test('an explicitly configured name still wins over the default', () => {
    const r = runClient({
      data: { ...BASE, cookie_name: '_own' },
      cookies: ['C.1.t.abcdef123456.1700000000'],
      http: OK
    });
    expect(r.throws).toBeNull();
    expect(cookieWrites(r).map((c) => c[0])).toContain('_own');
  });

  test('no legacy cookie present: nothing extra is written', () => {
    const r = runClient({ data: { ...BASE }, cookies: ['C.1.t.abcdef123456.1700000000'], http: OK });
    expect(cookieWrites(r).filter((c) => c[1] === '')).toEqual([]);
  });
});
