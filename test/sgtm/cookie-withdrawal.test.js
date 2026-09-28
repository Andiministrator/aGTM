// F-154 — a withdrawal on record must reach the cookie on the GET path too.
//
// Under cookie_mode='consent' the Client used to treat the cookie's mere
// presence as the consent (`cookieAllowed = !!existingCookie`). The delete
// branch next to it required "cookie present AND not allowed" — a
// contradiction, so it never fired, and the cookie was refreshed on each
// request. Only the /aGTMconsent POST writes a decision into the record and
// deletes itself; the GET path covers what it cannot — cookie_delete switched
// on later, a changed requirement, a lost Set-Cookie, another writer.
//
// The fix deletes on POSITIVE evidence only: an authoritative Session API
// answer carrying a real CMP decision that does not grant the required
// consent. The second half of this file is the other side of that rule — no
// record, an outage, an auto-denial block or no configured requirement must
// leave a real visitor's id alone. Deleting on ignorance was the reason the
// branch was not revived together with F-153.

import { describe, test, expect } from 'bun:test';
import { runClient, cookiesDeleted, cookiesWritten } from './client-harness.js';

const C_COOKIE = 'C.1.t.abcdef123456.1700000000';

const BASE = {
  gtm: [{ gtm_id: 'GTM-TEST', gtm_consent: true }],
  cookie_mode: 'consent',
  consent_service: 'analytics',
  cookie_delete: true,
  session_api_url: 'https://api.example/tp/session',
  tenant_id: 't',
  cookie_name: '_tpf'
};

function sessionAnswer(consent, extra) {
  return () => ({ statusCode: 200, body: JSON.stringify({ sessionId: 's1', counter: 3, consent: consent, ...(extra || {}) }) });
}

const REVOKED = { hasResponse: true, services: ',essential,', purposes: '', vendors: '' };
const GRANTED = { hasResponse: true, services: ',essential,analytics,', purposes: '', vendors: '' };

function deletedNames(r) { return cookiesDeleted(r).map(function (c) { return c.name; }); }

describe('F-154 — withdrawal on record deletes the cookie on the GET path', () => {
  test('revoked consent on record: cookie deleted under every name it is read from', () => {
    const r = runClient({ data: { ...BASE }, cookies: [C_COOKIE], http: sessionAnswer(REVOKED) });
    expect(r.throws).toBeNull();
    expect(r.returned).toBe(true);
    expect(deletedNames(r)).toContain('_tpf');
    expect(deletedNames(r)).toContain('_TPU');
    // …and not refreshed in the same response.
    expect(cookiesWritten(r)).toEqual([]);
  });

  test('revoked, cookie_delete off: not deleted, but not refreshed either', () => {
    const r = runClient({ data: { ...BASE, cookie_delete: false }, cookies: [C_COOKIE], http: sessionAnswer(REVOKED) });
    expect(r.throws).toBeNull();
    expect(cookiesDeleted(r)).toEqual([]);
    expect(cookiesWritten(r)).toEqual([]);
  });

  test('granted consent on record: cookie kept and refreshed (the normal returning visitor)', () => {
    const r = runClient({ data: { ...BASE }, cookies: [C_COOKIE], http: sessionAnswer(GRANTED) });
    expect(r.throws).toBeNull();
    expect(cookiesDeleted(r)).toEqual([]);
    expect(cookiesWritten(r).map(function (c) { return c.val; })).toEqual([C_COOKIE]);
  });
});

describe('F-154 — the less obvious shapes of a withdrawal', () => {
  test('withdrawal recorded under purposes only', () => {
    const data = { ...BASE, consent_purpose: 'statistics' };
    delete data.consent_service;
    const r = runClient({
      data: data, cookies: [C_COOKIE],
      http: sessionAnswer({ hasResponse: true, services: '', purposes: ',necessary,', vendors: '' })
    });
    expect(r.throws).toBeNull();
    expect(deletedNames(r)).toContain('_tpf');
  });

  test('id only under the legacy name: deleted there, not carried over to the new name', () => {
    const r = runClient({
      data: { ...BASE }, cookies: [{ name: '_TPU', value: C_COOKIE }],
      http: sessionAnswer(REVOKED)
    });
    expect(r.throws).toBeNull();
    expect(deletedNames(r)).toContain('_TPU');
    expect(cookiesWritten(r)).toEqual([]);
  });

  test('a delete is logged as warn with requirement and recorded strings, without the uid', () => {
    const r = runClient({ data: { ...BASE }, cookies: [C_COOKIE], http: sessionAnswer(REVOKED) });
    const line = r.logs.find(function (l) { return l.indexOf('warn') === 0 && l.indexOf('User ID cookie deleted') >= 0; });
    expect(line).toBeDefined();
    expect(line).toContain('analytics');
    expect(line).toContain(',essential,');
    expect(line).not.toContain(C_COOKIE);
  });

  test('no warn when nothing is deleted (checkbox off)', () => {
    const r = runClient({ data: { ...BASE, cookie_delete: false }, cookies: [C_COOKIE], http: sessionAnswer(REVOKED) });
    expect(r.logs.some(function (l) { return l.indexOf('User ID cookie deleted') >= 0; })).toBe(false);
  });
});

describe('F-154 — no evidence, no delete', () => {
  test('no consent on record (and not a returning session): cookie kept', () => {
    const r = runClient({
      data: { ...BASE }, cookies: [C_COOKIE],
      http: () => ({ statusCode: 200, body: JSON.stringify({ sessionId: 's1', counter: 0 }) })
    });
    expect(r.throws).toBeNull();
    expect(cookiesDeleted(r)).toEqual([]);
  });

  test('auto-denial block (returning visitor, no consent on file): cookie kept', () => {
    // The auto-denial is the Client's own placeholder, not the visitor's
    // decision — it must not be read as a withdrawal.
    const r = runClient({
      data: { ...BASE }, cookies: [C_COOKIE],
      http: () => ({ statusCode: 200, body: JSON.stringify({ sessionId: 's1', counter: 5 }) })
    });
    expect(r.throws).toBeNull();
    expect(cookiesDeleted(r)).toEqual([]);
  });

  test('Session API outage (5xx): cookie kept', () => {
    const r = runClient({ data: { ...BASE }, cookies: [C_COOKIE], http: () => ({ statusCode: 503, body: '' }) });
    expect(r.throws).toBeNull();
    expect(cookiesDeleted(r)).toEqual([]);
  });

  test('Session API unreachable: cookie kept', () => {
    const r = runClient({ data: { ...BASE }, cookies: [C_COOKIE], http: () => null });
    expect(r.throws).toBeNull();
    expect(cookiesDeleted(r)).toEqual([]);
  });

  test('decision without any explicit signal: cookie kept', () => {
    const r = runClient({
      data: { ...BASE }, cookies: [C_COOKIE],
      http: sessionAnswer({ hasResponse: true, services: '', purposes: '', vendors: '' })
    });
    expect(r.throws).toBeNull();
    expect(cookiesDeleted(r)).toEqual([]);
  });

  test('no consent requirement configured: never a withdrawal', () => {
    const data = { ...BASE };
    delete data.consent_service;
    const r = runClient({ data: data, cookies: [C_COOKIE], http: sessionAnswer(REVOKED) });
    expect(r.throws).toBeNull();
    expect(cookiesDeleted(r)).toEqual([]);
  });

  test('cookie_mode=always: a withdrawal does not touch the cookie (mode promise)', () => {
    const r = runClient({ data: { ...BASE, cookie_mode: 'always' }, cookies: [C_COOKIE], http: sessionAnswer(REVOKED) });
    expect(r.throws).toBeNull();
    expect(cookiesDeleted(r)).toEqual([]);
  });

  test('cookie_mode=never: no Set-Cookie of any kind', () => {
    const r = runClient({ data: { ...BASE, cookie_mode: 'never' }, cookies: [C_COOKIE], http: sessionAnswer(REVOKED) });
    expect(r.throws).toBeNull();
    expect(r.cookies).toEqual([]);
  });
});
