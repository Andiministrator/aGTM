// F-278 — the IP fallback is announced, not removed.
//
// Without an IP variable the Client takes getRemoteAddress(), which reads
// Forwarded / X-Forwarded-For: a visitor can send those, so the fingerprint
// uid (and the session data served for it) can be derived by someone else.
// Removing the fallback would leave a setup without an IP variable with no IP
// in the fingerprint at all, so it stays — with a debug line, and nothing
// that tells an outsider about it (no response header).

import { describe, test, expect } from 'bun:test';
import { runClient } from './client-harness.js';

const BASE = { gtm: [{ gtm_id: 'GTM-TEST', gtm_consent: true }], debug: true };
const MSG = 'Client IP from getRemoteAddress()';

function hits(r) { return r.logs.filter((l) => l.indexOf(MSG) > -1); }
function headerNames(r) { return Object.keys(r.headers || {}).map((h) => h.toLowerCase()); }

describe('F-278 — where the client IP comes from', () => {
  test('no IP variable: the fallback is used and logged in debug mode', () => {
    const r = runClient({ data: { ...BASE } });
    expect(r.throws).toBeNull();
    expect(hits(r).length).toBe(1);
  });

  test('IP variable set: no fallback, no log line', () => {
    const r = runClient({ data: { ...BASE, client_ip: '198.51.100.9' } });
    expect(r.throws).toBeNull();
    expect(hits(r)).toEqual([]);
  });

  test('without debug: silent (no per-request warn in production logs)', () => {
    const r = runClient({ data: { ...BASE, debug: false } });
    expect(r.throws).toBeNull();
    expect(hits(r)).toEqual([]);
    expect(r.logs.filter((l) => l.indexOf('getRemoteAddress') > -1)).toEqual([]);
  });

  test('never announced to the requester in a response header', () => {
    const r = runClient({ data: { ...BASE } });
    expect(headerNames(r).filter((h) => h.indexOf('ip') > -1 && h.indexOf('agtm') > -1)).toEqual([]);
  });
});
