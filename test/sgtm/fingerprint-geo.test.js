// F-279 — the fingerprint's geo part reads the gateway's X-Geo-* first.
//
// The four geo fields used to come from x-geoip-* only. In the TG cluster
// those never arrive from the infrastructure — the gateway sets X-Geo-* and
// overwrites a value the visitor sends, while x-geoip-* passes through
// untouched, i.e. only a visitor could set it (measured 2026-11-05). Now each
// field takes X-Geo-* first and x-geoip-* as a fallback, under the OLD key
// names, so the uid is unchanged wherever only x-geoip-* arrives.
// serverside_fingerprint v1.3 (tracking) does the same; the reference string
// below is shared with it.
import { describe, test, expect } from 'bun:test';
import { runClient } from './client-harness.js';

const DATA = { gtm: [{ gtm_id: 'GTM-TEST', gtm_consent: true }], session_api_url: 'https://api.example/tp/session', tenant_id: 't', sgtm_host: 'tm.example.com', client_ip: '203.0.113.9' };
const BASEH = { 'user-agent': 'UA', 'accept-language': 'de' };
const PREFIX = 'fp-day:20260728accept-language:declient-ip:203.0.113.9sgtm-host:tm.example.comuser-agent:UA';

function fp(headers) {
  const r = runClient({ data: DATA, headers: { ...BASEH, ...headers }, http: () => ({ statusCode: 200, body: '{}' }) });
  expect(r.throws).toBeNull();
  return r.hashed.filter((s) => s.indexOf('user-agent:') > -1)[0];
}

describe('F-279 — geo part of the fingerprint', () => {
  test('only x-geoip-* (other platforms): unchanged string, uid stays the same', () => {
    expect(fp({ 'x-geoip-asn': '3320', 'x-geoip-country': 'Germany', 'x-geoip-country-code': 'DE', 'x-geoip-org': 'DTAG' }))
      .toBe(PREFIX + 'x-geoip-asn:3320x-geoip-country:Germanyx-geoip-country-code:DEx-geoip-org:DTAG');
  });

  test('only X-Geo-* (TG cluster): mapped onto the old keys', () => {
    expect(fp({ 'x-geo-asn': '21413', 'x-geo-asn-org': 'Example Net', 'x-geo-country': 'DE', 'x-geo-city': 'Plauen', 'x-geo-region': 'SN' }))
      .toBe(PREFIX + 'x-geoip-asn:21413x-geoip-country-code:DEx-geoip-org:Example Net');
  });

  test('a visitor-sent x-geoip-* does not override the gateway value', () => {
    expect(fp({ 'x-geo-asn': '21413', 'x-geo-country': 'DE', 'x-geo-asn-org': 'Example Net', 'x-geoip-asn': '64496', 'x-geoip-country-code': 'ZZ', 'x-geoip-org': 'Fake' }))
      .toBe(PREFIX + 'x-geoip-asn:21413x-geoip-country-code:DEx-geoip-org:Example Net');
  });

  test('shared reference string with serverside_fingerprint v1.3', () => {
    expect(fp({ 'x-geo-asn': '21413', 'x-geo-asn-org': 'Example Net', 'x-geo-country': 'DE', 'x-geoip-country': 'Germany' }))
      .toBe(PREFIX + 'x-geoip-asn:21413x-geoip-country:Germanyx-geoip-country-code:DEx-geoip-org:Example Net');
  });
});
