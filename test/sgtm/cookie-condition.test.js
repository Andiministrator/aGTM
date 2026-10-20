// test/sgtm/cookie-condition.test.js — an EMPTY consent requirement grants
// nothing (F-165).
//
// Before: with Consent Service/Purpose/Vendor all empty — the delivered default,
// and the fields were not even visible under cookie_mode=always —
// hasRequiredConsent() answered true for every consent signal. Most CMPs still
// report the essential categories after "deny all", so the Client minted a
// one-year user-ID cookie after a REJECTION. Measured live on 2026-10-20 with
// CCM19: "only technically necessary" reports six services (the string below).
//
// Now: an empty requirement grants nothing, unless the tenant ticks
// `cookie_without_condition` on purpose. A missing requirement is a
// configuration gap, never evidence of a withdrawal — so it must not delete
// cookies that already exist either.
import { describe, test, expect } from 'bun:test';
import { runClient, cookiesWritten, cookiesDeleted } from './client-harness.js';

const GTM = [{ gtm_id: 'GTM-TEST', gtm_consent: true }];
const SESSION = { session_api_url: 'https://api.example/tp/session', tenant_id: 't' };
const F_COOKIE = 'F$1$t$sha_123.20260803';
const C_COOKIE = 'C.1$t$999999999999.1785230523000';
const C_EXPECTED = 'C.1$t$123456789012.1785230523000';
// The real CCM19 answer after "Einstellungen → only technically necessary → Save".
const ESSENTIAL_ONLY = ',Google Tag Manager,Shop-A,FAST Tracking,Cookie Consent Manager CCM19,Cloudflare,Brevo (ehemals Sendinblue),';
const WITH_ANALYTICS = ESSENTIAL_ONLY + 'Google Analytics,';

const written = (r) => cookiesWritten(r).map((c) => c.val);
const warns = (r) => r.logs.filter((l) => l.indexOf('warn') === 0);

/** POST /aGTMconsent from a visitor who still has only the fingerprint. */
const post = (data, services, opts) => runClient({
  data: { gtm: GTM, cookie_name: 'aGTMuid', tenant_id: 't', ...data },
  path: '/aGTMconsent',
  method: 'POST',
  reqBody: JSON.stringify({ uid: F_COOKIE, sid: 's1', consent: { hasResponse: true, services: services } }),
  ...opts
});

describe('empty requirement: no cookie after "deny all" (the live case)', () => {
  for (const mode of ['always', 'consent']) {
    test(`cookie_mode=${mode}, essential-only answer, local mint path → no cookie`, () => {
      const r = post({ cookie_mode: mode }, ESSENTIAL_ONLY);
      expect(r.throws).toBeNull();
      expect(written(r)).toEqual([]);
      expect(JSON.parse(r.body).uid).toBe(F_COOKIE);
    });

    test(`cookie_mode=${mode}, essential-only answer, promote path → no promote, no cookie`, () => {
      const calls = [];
      const r = post({ cookie_mode: mode, ...SESSION }, ESSENTIAL_ONLY, {
        http: (url) => { calls.push(url); return { statusCode: 200, body: '{"ok":true}' }; }
      });
      expect(r.throws).toBeNull();
      expect(written(r)).toEqual([]);
      expect(calls.some((u) => u.indexOf('/promote') > -1)).toBe(false);
    });
  }

  test('even a FULL accept creates no cookie while nothing is required', () => {
    // Without a requirement the Client cannot tell "accept all" from "deny all":
    // both are just a non-empty services string. Refusing both is the only
    // consistent answer; the tenant fixes it with one field.
    const r = post({ cookie_mode: 'always' }, WITH_ANALYTICS);
    expect(written(r)).toEqual([]);
  });

  test('the refusal is visible as a response header — not silent', () => {
    const r = post({ cookie_mode: 'always' }, ESSENTIAL_ONLY);
    expect(r.headers['x-agtm-uid-cookie']).toBe('no-consent-requirement');
  });

  test('no warn line at all — at this traffic a per-page-view line is too much', () => {
    // A visitor without a C.* gets no consent preset, so the library re-POSTs the
    // same decision on every page view; a once-per-instance flag would need
    // templateDataStorage, which is deliberately not used.
    const r = post({ cookie_mode: 'always' }, ESSENTIAL_ONLY);
    expect(r.logs.filter((l) => l.indexOf('no consent requirement') > -1)).toEqual([]);
  });

  test('with debug on, the log names the checkbox exactly and no uid', () => {
    const r = post({ cookie_mode: 'always', debug: true }, ESSENTIAL_ONLY);
    const d = r.logs.filter((l) => l.indexOf('no consent requirement configured') > -1);
    expect(d.length).toBe(1);
    expect(d[0].indexOf('debug')).toBe(0);
    expect(d[0]).toContain('"Create the user ID cookie without a consent requirement"');
    expect(d[0]).not.toContain(F_COOKIE);
  });

  test('no header under cookie_mode=never — there is no cookie to miss', () => {
    const r = post({ cookie_mode: 'never' }, ESSENTIAL_ONLY);
    expect(r.headers['x-agtm-uid-cookie']).toBeUndefined();
  });

  test('no header for a visitor who already has a stable id', () => {
    const r = runClient({
      data: { gtm: GTM, cookie_name: 'aGTMuid', cookie_mode: 'always', tenant_id: 't' },
      path: '/aGTMconsent',
      method: 'POST',
      reqBody: JSON.stringify({ uid: C_COOKIE, sid: 's1', consent: { hasResponse: true, services: ESSENTIAL_ONLY } })
    });
    expect(r.headers['x-agtm-uid-cookie']).toBeUndefined();
  });
});

describe('the header only where a cookie could have been created', () => {
  test('no header for the auto-denial sentinel', () => {
    const r = post({ cookie_mode: 'always' }, ',aGTMconsent,');
    expect(r.headers['x-agtm-uid-cookie']).toBeUndefined();
  });
});

describe('a configured requirement decides as before', () => {
  test('requirement met → C.* minted', () => {
    const r = post({ cookie_mode: 'always', consent_service: 'Google Analytics' }, WITH_ANALYTICS);
    expect(written(r)).toEqual([C_EXPECTED]);
  });

  test('requirement not met (essential only) → no cookie, no missing-requirement header', () => {
    const r = post({ cookie_mode: 'always', consent_service: 'Google Analytics' }, ESSENTIAL_ONLY);
    expect(written(r)).toEqual([]);
    expect(r.headers['x-agtm-uid-cookie']).toBeUndefined();
  });

  for (const field of ['consent_purpose', 'consent_vendor']) {
    test(`${field} alone counts as a requirement`, () => {
      const key = field === 'consent_purpose' ? 'purposes' : 'vendors';
      const r = runClient({
        data: { gtm: GTM, cookie_name: 'aGTMuid', cookie_mode: 'always', tenant_id: 't', [field]: 'stats' },
        path: '/aGTMconsent',
        method: 'POST',
        reqBody: JSON.stringify({ uid: F_COOKIE, sid: 's1', consent: { hasResponse: true, [key]: ',stats,' } })
      });
      expect(written(r)).toEqual([C_EXPECTED]);
    });
  }
});

describe('the deliberate opt-out: cookie_without_condition', () => {
  test('ticked → any consent signal creates the cookie (the old behaviour, now a choice)', () => {
    const r = post({ cookie_mode: 'always', cookie_without_condition: true }, ESSENTIAL_ONLY);
    expect(written(r)).toEqual([C_EXPECTED]);
    expect(r.headers['x-agtm-uid-cookie']).toBeUndefined();
  });

  test('still needs an explicit signal — an empty payload creates nothing', () => {
    const r = post({ cookie_mode: 'always', cookie_without_condition: true }, '');
    expect(written(r)).toEqual([]);
  });

  test('cannot weaken a requirement that IS configured', () => {
    const r = post({ cookie_mode: 'always', cookie_without_condition: true, consent_service: 'Google Analytics' }, ESSENTIAL_ONLY);
    expect(written(r)).toEqual([]);
  });

  for (const v of ['true', 1, 'yes']) {
    test(`only the boolean true switches it on, not ${JSON.stringify(v)}`, () => {
      const r = post({ cookie_mode: 'always', cookie_without_condition: v }, ESSENTIAL_ONLY);
      expect(written(r)).toEqual([]);
    });
  }
});

describe('a missing requirement is not a withdrawal — existing cookies stay', () => {
  test('POST under consent mode with cookie_delete deletes nothing', () => {
    const r = runClient({
      data: { gtm: GTM, cookie_name: 'aGTMuid', cookie_mode: 'consent', cookie_delete: true, tenant_id: 't' },
      path: '/aGTMconsent',
      method: 'POST',
      reqBody: JSON.stringify({ uid: C_COOKIE, sid: 's1', consent: { hasResponse: true, services: ESSENTIAL_ONLY } })
    });
    expect(r.throws).toBeNull();
    expect(cookiesDeleted(r)).toEqual([]);
  });

  test('GET under consent mode with a recorded consent neither deletes nor warns about a withdrawal', () => {
    const r = runClient({
      data: { gtm: GTM, cookie_name: 'aGTMuid', cookie_mode: 'consent', cookie_delete: true, ...SESSION },
      cookies: [C_COOKIE],
      http: () => ({ statusCode: 200, body: JSON.stringify({ sessionId: 's1', counter: 2, consent: { hasResponse: true, services: ESSENTIAL_ONLY } }) })
    });
    expect(r.throws).toBeNull();
    expect(cookiesDeleted(r)).toEqual([]);
    expect(written(r)).toEqual([C_COOKIE]);
    expect(warns(r).filter((l) => l.indexOf('cookie deleted') > -1)).toEqual([]);
  });

  test('GET with an F.* cookie and a recorded consent does not lazy-promote', () => {
    const calls = [];
    const r = runClient({
      data: { gtm: GTM, cookie_name: 'aGTMuid', cookie_mode: 'always', ...SESSION },
      cookies: [F_COOKIE],
      http: (url) => { calls.push(url); return url.indexOf('/promote') > -1 ? { statusCode: 200, body: '{"ok":true}' } : { statusCode: 200, body: JSON.stringify({ sessionId: 's1', counter: 2, consent: { hasResponse: true, services: ESSENTIAL_ONLY } }) }; }
    });
    expect(r.throws).toBeNull();
    expect(calls.some((u) => u.indexOf('/promote') > -1)).toBe(false);
    expect(written(r)).toEqual([]);
  });
});
