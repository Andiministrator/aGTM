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
// consent. The server-side auto-denial is for a returning visitor with NOTHING
// on file, with or without a cookie (Andi, 2026-10-21). It must not replace a
// decision that is withheld only because the key is shared: for a "deny all"
// visitor it would load GTM where their own denial does not (QA + critic,
// 2026-10-21, P1), and for one who agreed it would mask the grant at init.
//
// Scope, stated because the tests would otherwise look stronger than they are:
// this covers the READ path only. Consent is still persisted under the shared
// fingerprint key when no cookie exists (F-156 option B, deliberately open).
//
// What the tests pin: a cookieless visitor never receives a STORED decision
// (it may be a stranger's) and then gets no preset at all; a cookieless
// returning visitor with nothing on file receives the auto-denial; the
// auto_deny_load_gtm switch reaches gtmConsent and blocked.

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
  test('no cookie (uid from fingerprint): a stored grant is NOT passed through, and no auto-denial replaces it', () => {
    const r = runClient({
      data: { ...BASE },
      cookies: [],
      http: () => ({ statusCode: 200, body: JSON.stringify(STORED_CONSENT) })
    });
    expect(r.throws).toBeNull();
    expect(r.returned).toBe(true);
    // The session itself still ships. The stranger's grant does not, and the
    // auto-denial does not stand in for it either: the CMP decides at init.
    expect(session(r).sid).toBe('s1');
    expect(session(r).consent).toBeUndefined();
  });

  test('no cookie, stored DENIAL: no preset - the auto-denial would load GTM for someone who clicked deny all', () => {
    const r = runClient({
      data: { ...BASE },
      cookies: [],
      http: () => ({ statusCode: 200, body: JSON.stringify({ sessionId: 's1', counter: 2, consent: { hasResponse: true, services: '', purposes: '', vendors: '' } }) })
    });
    expect(r.throws).toBeNull();
    expect(session(r).consent).toBeUndefined();
  });

  test('auto-denial: auto_deny_load_gtm reaches gtmConsent and blocked (default true, switch false)', () => {
    const run = (extra) => runClient({
      data: { ...BASE, ...extra },
      cookies: [],
      http: () => ({ statusCode: 200, body: JSON.stringify({ sessionId: 's1', counter: 5 }) })
    });
    const on = session(run({})).consent;
    expect(on.gtmConsent).toBe(true);
    expect(on.blocked).toBe(true);
    const off = session(run({ auto_deny_load_gtm: false })).consent;
    expect(off.gtmConsent).toBe(false);
    expect(off.blocked).toBe(false);
  });

  test('no cookie, returning visitor without stored consent: the auto-denial applies', () => {
    // Nothing on file: the auto-denial applies without a cookie as well (Andi,
    // 2026-10-21). It cannot grant: no tag that requires a CMP consent fires.
    const r = runClient({
      data: { ...BASE },
      cookies: [],
      // Returning visitor (counter > 0), no consent on file.
      http: () => ({ statusCode: 200, body: JSON.stringify({ sessionId: 's1', counter: 5 }) })
    });
    expect(r.throws).toBeNull();
    expect(session(r).consent.services).toBe(',aGTMconsent,');
  });

  // F-251: a preset is only acted on where the library can replace it with the
  // CMP's own answer. With the store off or consent_store_enc (POST -> 501)
  // nothing is written, so a record on file is stale and no poll updates it;
  // under useListener the library runs no consent poll at all.
  const C_COOKIE = ['C.1.t.abcdef123456.1700000000'];
  const RETURNING_NOTHING = () => ({ statusCode: 200, body: JSON.stringify({ sessionId: 's1', counter: 5 }) });
  const RETURNING_STORED = () => ({ statusCode: 200, body: JSON.stringify(STORED_CONSENT) });

  test('F-251: store off or consent_store_enc - no auto-denial, with or without a cookie', () => {
    for (const extra of [{ consent_store_enabled: false }, { consent_store_enc: true }]) {
      for (const cookies of [[], undefined, C_COOKIE]) {
        const r = runClient({ data: { ...BASE, ...extra }, cookies: cookies, http: RETURNING_NOTHING });
        expect(r.throws).toBeNull();
        expect(session(r).consent).toBeUndefined();
      }
    }
  });

  test('F-251: store off or consent_store_enc - a stored decision is not passed through either', () => {
    for (const extra of [{ consent_store_enabled: false }, { consent_store_enc: true }]) {
      const r = runClient({ data: { ...BASE, ...extra }, cookies: C_COOKIE, http: RETURNING_STORED });
      expect(r.throws).toBeNull();
      expect(session(r).consent).toBeUndefined();
    }
  });

  test('F-251: useListener - no auto-denial, but a stored decision is still passed through', () => {
    const none = runClient({ data: { ...BASE, useListener: true }, cookies: C_COOKIE, http: RETURNING_NOTHING });
    expect(none.throws).toBeNull();
    expect(session(none).consent).toBeUndefined();
    const stored = runClient({ data: { ...BASE, useListener: true }, cookies: C_COOKIE, http: RETURNING_STORED });
    expect(session(stored).consent.services).toBe(',Google Tag Manager,');
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
