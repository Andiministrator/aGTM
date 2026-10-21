// F-156 — a visitor must not inherit a stranger's consent.
//
// Without a user-ID cookie the Client keys the session on a server-side
// fingerprint derived from IP, user agent, client hints and ASN/geo. That is
// NOT per-visitor: two people behind the same NAT on the same browser build
// derive the same key. The Client used to pass the consent stored under that
// key into cfg.session.consent, aGTM set preset_with_consent and injected GTM
// for someone who had never seen a CMP.
//
// The fix binds the stored-consent branch to a cookie-bound uid. An F.* cookie
// still counts: it sits in that one browser, and the lazy F→C promote needs the
// consent. The server-side auto-denial applies with or without a cookie (Andi,
// 2026-10-21): it can only ever deny (services ',aGTMconsent,'), and only a
// grant must not travel through a shared key. From 4ac262f until then it was
// withheld for cookieless visitors too, which put the banner back on every page.
//
// Scope, stated because the tests would otherwise look stronger than they are:
// this covers the READ path only. Consent is still persisted under the shared
// fingerprint key when no cookie exists (F-156 option B, deliberately open).
//
// What the tests pin: a cookieless visitor never receives the STORED consent
// (it may be a stranger's grant); a cookieless returning visitor receives the
// auto-denial instead. Mutation `uidIsBrowserBound = true` (the pre-fix state)
// turns the first test red: the stranger's grant would be handed over.

import { describe, test, expect } from 'bun:test';
import { runClient } from './client-harness.js';

const BASE = {
  gtm: [{ gtm_id: 'GTM-TEST', gtm_consent: true }],
  cookie_mode: 'always',
  session_api_url: 'https://api.example/tp/session',
  tenant_id: 't',
  cookie_name: '_tpf'
};

const STORED_CONSENT = {
  sessionId: 's1',
  counter: 3,
  consent: { hasResponse: true, services: ',Google Tag Manager,', purposes: ',statistics,', vendors: '' }
};

/**
 * The Client's OWN aGTM.f.config(...) call — the last one in the body.
 * lastIndexOf, not indexOf: the embedded library blob contains its own
 * `aGTM.f.config(aGTM.c)` plus the literal string "/aGTMconsent", so slicing
 * from the first hit drags the whole library into the haystack and makes
 * `not.toContain(...)` assertions pass or fail for the wrong reason.
 */
function cfg(r) {
  const i = r.body.lastIndexOf('aGTM.f.config(');
  return i < 0 ? '' : r.body.slice(i);
}

/**
 * The parsed config object the Client hands to the library. Parsed rather than
 * string-matched: "does the session carry a consent block" is a question about
 * structure, and a substring test answers a different one — "consent" alone
 * also occurs in consent_store_url, and the first attempt at this file passed
 * for that reason instead of the intended one.
 */
function configObj(r) {
  const c = cfg(r);
  const start = c.indexOf('({');
  if (start < 0) return null;
  let depth = 0;
  for (let i = start + 1; i < c.length; i++) {
    if (c[i] === '{') depth++;
    else if (c[i] === '}') {
      depth--;
      if (depth === 0) return JSON.parse(c.slice(start + 1, i + 1));
    }
  }
  return null;
}

/** The session object the Client passes through, or {}. */
function session(r) {
  const o = configObj(r);
  return (o && o.session) || {};
}

describe('F-156 — consent preset requires a cookie-bound uid', () => {
  test('no cookie (uid from fingerprint): the stored grant is NOT passed through, the auto-denial applies', () => {
    const r = runClient({
      data: { ...BASE },
      cookies: [],
      http: () => ({ statusCode: 200, body: JSON.stringify(STORED_CONSENT) })
    });
    expect(r.throws).toBeNull();
    expect(r.returned).toBe(true);
    // The session itself still ships. The stranger's grant does not: the
    // returning visitor (counter 3) gets the Client's own denial instead.
    expect(session(r).sid).toBe('s1');
    expect(session(r).consent.services).toBe(',aGTMconsent,');
    expect(session(r).consent.feedback).toBe('Consent denied by aGTM');
  });

  test('no cookie, returning visitor without stored consent: the auto-denial applies', () => {
    // A denial is the one thing a shared fingerprint may pass on (Andi,
    // 2026-10-21): only what is gated on aGTMconsent fires.
    const r = runClient({
      data: { ...BASE },
      cookies: [],
      // Returning visitor (counter > 0), no consent on file.
      http: () => ({ statusCode: 200, body: JSON.stringify({ sessionId: 's1', counter: 5 }) })
    });
    expect(r.throws).toBeNull();
    expect(session(r).consent.services).toBe(',aGTMconsent,');
  });

  test('no cookie, first visit (counter 0): no preset at all', () => {
    const r = runClient({
      data: { ...BASE },
      cookies: [],
      http: () => ({ statusCode: 200, body: JSON.stringify({ sessionId: 's1', counter: 0 }) })
    });
    expect(r.throws).toBeNull();
    expect(session(r).consent).toBeUndefined();
  });

  test('C.* cookie: stored consent IS passed through (the normal returning visitor)', () => {
    const r = runClient({
      data: { ...BASE },
      cookies: ['C.1.t.abcdef123456.1700000000'],
      http: () => ({ statusCode: 200, body: JSON.stringify(STORED_CONSENT) })
    });
    expect(r.throws).toBeNull();
    expect(session(r).consent).toBeDefined();
    expect(session(r).consent.hasResponse).toBe(true);
    expect(session(r).consent.services).toBe(',Google Tag Manager,');
  });

  test('F.* cookie: consent still passed through — it is per-browser and the promote needs it', () => {
    // An F.* value in the COOKIE is not the shared case: it lives in exactly
    // one browser. Excluding it would strand those visitors on F.* forever,
    // because shouldLazyPromote depends on the consent being read.
    const r = runClient({
      data: { ...BASE },
      cookies: ['F.1.t.deadbeef.20260813'],
      http: () => ({ statusCode: 200, body: JSON.stringify(STORED_CONSENT) })
    });
    expect(r.throws).toBeNull();
    expect(session(r).consent).toBeDefined();
    expect(session(r).consent.services).toBe(',Google Tag Manager,');
  });

  test('C.* cookie + returning visitor without stored consent: auto-denial still applies', () => {
    const r = runClient({
      data: { ...BASE },
      cookies: ['C.1.t.abcdef123456.1700000000'],
      http: () => ({ statusCode: 200, body: JSON.stringify({ sessionId: 's1', counter: 5 }) })
    });
    expect(r.throws).toBeNull();
    expect(session(r).consent).toBeDefined();
    expect(session(r).consent.feedback).toBe('Consent denied by aGTM');
  });

  test('the empty-conditions opt-out is wired through to the library', () => {
    // One line in the Client (`if (data.allow_empty_consent_conditions) …`) is
    // the entire escape hatch for a breaking change at live customers. It had
    // no test at all: the library side is covered in consent_gate_empty, the
    // wiring was not.
    const on = runClient({
      data: { ...BASE, allow_empty_consent_conditions: true },
      cookies: ['C.1.t.abcdef123456.1700000000'],
      http: () => ({ statusCode: 200, body: JSON.stringify(STORED_CONSENT) })
    });
    expect(configObj(on).allowEmptyConsentConditions).toBe(true);

    const off = runClient({
      data: { ...BASE },
      cookies: ['C.1.t.abcdef123456.1700000000'],
      http: () => ({ statusCode: 200, body: JSON.stringify(STORED_CONSENT) })
    });
    // Absent, not `false` — a container that never saw the field must keep the
    // library's own safe default rather than have it overwritten.
    expect(configObj(off).allowEmptyConsentConditions).toBeUndefined();
  });

  test('every path still produces a response (no branch left dangling)', () => {
    [[], ['C.1.t.abcdef123456.1700000000'], ['F.1.t.deadbeef.20260813']].forEach((cookies) => {
      const r = runClient({
        data: { ...BASE },
        cookies,
        http: () => ({ statusCode: 200, body: JSON.stringify(STORED_CONSENT) })
      });
      expect(r.throws).toBeNull();
      expect(r.returned).toBe(true);
    });
  });
});
