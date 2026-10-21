// test/sgtm/fingerprint-day.test.js — the day is part of the fingerprint HASH (#72).
//
// Before, the day only trailed the value (`….YYYYMMDD`) and the hash in front
// of it stayed identical across days — a stable, visible component, which is
// what CNIL's criterion 2 (a time-varying component) asks to avoid. The hashed
// string is invisible in the served uid (sha256Sync is stubbed), so the harness
// records its inputs and this file asserts on them.
import { describe, test, expect } from 'bun:test';
import { runClient } from './client-harness.js';

const GTM = [{ gtm_id: 'GTM-TEST', gtm_consent: true }];
const DATA = { gtm: GTM, session_api_url: 'https://api.example/tp/session', tenant_id: 't' };
const DAY1 = 1785230523000;            // 2026-07-28
const DAY2 = DAY1 + 86400000;          // 2026-07-29
const HEADERS = { 'user-agent': 'UA', 'accept-language': 'de' };

const run = (now) => {
  const urls = [];
  const r = runClient({ data: DATA, now, headers: HEADERS, http: (url) => { urls.push(url); return { statusCode: 200, body: '{}' }; } });
  return { r, urls, fp: r.hashed.filter((s) => s.indexOf('user-agent:') > -1) };
};

describe('fingerprint hash includes the day', () => {
  test('the hashed input carries the day stamp', () => {
    const { r, fp } = run(DAY1);
    expect(r.throws).toBeNull();
    expect(fp.length).toBeGreaterThan(0);
    expect(fp[0].indexOf('fp-day:20260728')).toBe(0);
  });

  test('same headers, next day: different hashed input, suffix still the day', () => {
    const a = run(DAY1), b = run(DAY2);
    expect(a.fp[0]).not.toBe(b.fp[0]);
    expect(a.fp[0].replace('20260728', '')).toBe(b.fp[0].replace('20260729', ''));
    expect(a.urls.some((u) => /\$t\$[A-Za-z0-9+/=]+\.20260728$/.test(u))).toBe(true);
    expect(b.urls.some((u) => /\$t\$[A-Za-z0-9+/=]+\.20260729$/.test(u))).toBe(true);
  });
});

describe('fingerprint stays equal to serverside_fingerprint v1.2', () => {
  // The same literal is pinned in the ___TESTS___ of serverside_fingerprint v1.2
  // (separate repo). Both sides pinned to one string: if either changes its keys,
  // values or order, its own test turns red - here on every bun test, on the other
  // side only when someone runs its GTM Tests tab. The pin covers keys and order,
  // not where the values come from (client_ip fallback, limiter, tenant).
  test('hashed string for the shared reference request', () => {
    const r = runClient({
      data: { ...DATA, sgtm_host: 'tm.example.com', client_ip: '203.0.113.9' },
      headers: { 'user-agent': 'UA', 'accept-language': 'de' },
      http: () => ({ statusCode: 200, body: '{}' })
    });
    expect(r.hashed).toContain('fp-day:20260728accept-language:declient-ip:203.0.113.9sgtm-host:tm.example.comuser-agent:UA');
  });
});

describe('the day is read once per fingerprint', () => {
  test('a read just before midnight: hash day and suffix day are the same', () => {
    // Every getTimestampMillis() call advances 1 ms, starting 1 ms before
    // 2026-07-29 00:00 UTC. Two separate reads in getFingerprint would put
    // day N into the hash and day N+1 into the suffix.
    let t = Date.UTC(2026, 6, 29) - 1;
    const urls = [];
    const r = runClient({ data: DATA, now: () => t++, headers: HEADERS, http: (url) => { urls.push(url); return { statusCode: 200, body: '{}' }; } });
    expect(r.throws).toBeNull();
    const fp = r.hashed.filter((s) => s.indexOf('user-agent:') > -1)[0];
    const hashDay = fp.slice('fp-day:'.length, 'fp-day:'.length + 8);
    const suffix = urls.map((u) => (u.match(/\.(\d{8})$/) || [])[1]).filter(Boolean)[0];
    expect(suffix).toBe(hashDay);
  });
});
