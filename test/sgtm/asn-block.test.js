// test/sgtm/asn-block.test.js — the Client's ASN block list (field asn_block).
//
// Runs the real Client source (client-harness.js). What has to hold:
// - a listed ASN gets 403 and no library, BEFORE the bot check is asked;
// - spelling does not matter ("AS150436", "as 150436", "150436");
// - a missing or garbled header blocks nobody, and a garbled list entry never
//   turns into a match on an empty header;
// - X-Geo-ASN (set by the gateway) wins over x-geoip-asn, as in the fingerprint.
import { describe, test, expect } from 'bun:test';
import { runClient } from './client-harness.js';

const BASE = {
  gtm: [{ gtm_id: 'GTM-TEST', gtm_consent: true, gtm_use: 'no', gtm_url: '' }],
  tenant_id: 'cl_test',
  cookie_mode: 'always'
};

function run(asnBlock, headers, extra) {
  const calls = [];
  const r = runClient({
    data: Object.assign({}, BASE, { asn_block: asnBlock }, extra || {}),
    headers: headers || {},
    http: (url) => { calls.push(url); return { statusCode: 200, body: '{"isBot":false}' }; }
  });
  return Object.assign(r, { calls: calls });
}

const served = (r) => r.status === 200 && r.body.indexOf('aGTM.f.config(') >= 0;

describe('ASN block list', () => {
  test('listed ASN: 403, no library, bot check never asked', () => {
    const r = run('AS150436', { 'X-Geo-ASN': '150436' }, { botCheckEnabled: true, botCheck: 'https://bots.example/api' });
    expect(r.throws).toBeNull();
    expect(r.status).toBe(403);
    expect(r.returned).toBe(true);
    expect(r.body).toBe('');
    expect(r.calls.length).toBe(0);
    expect(r.cookies.length).toBe(0);
  });

  test('spelling of list and header does not matter', () => {
    for (const [list, hdr] of [['150436', 'AS150436'], ['as 150436', '150436'], ['132203\nAS150436', 'as150436'], ['132203, AS150436', ' 150436 ']]) {
      expect(run(list, { 'x-geo-asn': hdr }).status).toBe(403);
    }
  });

  test('unlisted ASN is served', () => {
    expect(served(run('AS150436', { 'x-geo-asn': '15169' }))).toBe(true);
  });

  test('no header blocks nobody', () => {
    expect(served(run('AS150436', {}))).toBe(true);
  });

  test('garbled list entry never matches an empty or garbled header', () => {
    expect(served(run('ASxyz, AS', {}))).toBe(true);
    expect(served(run('ASxyz', { 'x-geo-asn': 'xyz' }))).toBe(true);
  });

  test('empty list: header is not even read for blocking', () => {
    expect(served(run('', { 'x-geo-asn': '150436' }))).toBe(true);
  });

  test('x-geoip-asn is the fallback, X-Geo-ASN wins', () => {
    expect(run('150436', { 'x-geoip-asn': '150436' }).status).toBe(403);
    expect(served(run('150436', { 'x-geo-asn': '15169', 'x-geoip-asn': '150436' }))).toBe(true);
  });

  test('blocks independent of the bot check mode', () => {
    const r = run('150436', { 'x-geo-asn': '150436' }, { botCheckEnabled: true, botCheck: 'https://bots.example/api', botCheckMode: 'mark' });
    expect(r.status).toBe(403);
    expect(r.calls.length).toBe(0);
  });

  test('debug log only', () => {
    expect(run('150436', { 'x-geo-asn': '150436' }).logs.some((l) => l.indexOf('ASN') >= 0)).toBe(false);
    expect(run('150436', { 'x-geo-asn': '150436' }, { debug: true }).logs.some((l) => l.indexOf('ASN on the block list') >= 0)).toBe(true);
  });
});
