// test/consent_serialize.test.js — tests for aGTM.f.consent_serialize()
// Load-bearing: this stable serialization drives the consent-hash change
// detection that gates the consent-store POST and the aGTM_consent_update
// event. See CLAUDE.md §"Consent diff/store" and finding chain around F-31.
import { describe, test, expect } from 'bun:test';

describe('aGTM.f.consent_serialize()', () => {
  test('non-object input returns empty string', () => {
    expect(aGTM.f.consent_serialize(null)).toBe('');
    expect(aGTM.f.consent_serialize(undefined)).toBe('');
    expect(aGTM.f.consent_serialize('services=a')).toBe('');
    expect(aGTM.f.consent_serialize(42)).toBe('');
  });

  test('serializes a simple consent object with sorted keys', () => {
    // keys must come out sorted so insertion order cannot create phantom diffs
    expect(aGTM.f.consent_serialize({ services: 'analytics', purposes: 'ad' }))
      .toBe('purposes=ad|services=analytics');
  });

  test('output is independent of key insertion order', () => {
    const a = aGTM.f.consent_serialize({ b: '2', a: '1', c: '3' });
    const b = aGTM.f.consent_serialize({ c: '3', a: '1', b: '2' });
    expect(a).toBe(b);
    expect(a).toBe('a=1|b=2|c=3');
  });

  test('blacklists client-derived fields gtmConsent and blocked', () => {
    // these are decision outputs, not consent state — must not be in the hash
    expect(aGTM.f.consent_serialize({
      gtmConsent: true, blocked: true, services: 'analytics'
    })).toBe('services=analytics');
  });

  test('two states differing ONLY in gtmConsent serialize identically', () => {
    // the whole point: gtmConsent flipping must not look like a consent change
    const granted = aGTM.f.consent_serialize({ gtmConsent: true,  services: 'a', hasResponse: true });
    const denied  = aGTM.f.consent_serialize({ gtmConsent: false, services: 'a', hasResponse: true });
    expect(granted).toBe(denied);
  });

  test('two states differing in a real field serialize differently', () => {
    const s1 = aGTM.f.consent_serialize({ services: 'analytics', hasResponse: true });
    const s2 = aGTM.f.consent_serialize({ services: 'analytics,ads', hasResponse: true });
    expect(s1).not.toBe(s2);
  });

  test('skips empty-string, null and undefined values (semantically absent)', () => {
    // B2 update-reset clears fields to "" — those must not create phantom diffs
    expect(aGTM.f.consent_serialize({
      services: '', purposes: null, vendors: undefined, x: '1'
    })).toBe('x=1');
  });

  test('a field cleared to "" hashes the same as that field being absent', () => {
    const withEmpty = aGTM.f.consent_serialize({ services: 'a', purposes: '' });
    const without   = aGTM.f.consent_serialize({ services: 'a' });
    expect(withEmpty).toBe(without);
  });

  test('boolean and numeric values are stringified', () => {
    expect(aGTM.f.consent_serialize({ hasResponse: true, services: 'a' }))
      .toBe('hasResponse=true|services=a');
  });

  test('numeric 0 and boolean false are kept (not treated as absent)', () => {
    // 0 == null is false and 0 === "" is false → must survive
    expect(aGTM.f.consent_serialize({ count: 0, flag: false }))
      .toBe('count=0|flag=false');
  });

  test('object-valued fields are JSON.stringified', () => {
    expect(aGTM.f.consent_serialize({ meta: { a: 1 }, s: 'x' }))
      .toBe('meta={"a":1}|s=x');
  });

  test('empty object serializes to empty string', () => {
    expect(aGTM.f.consent_serialize({})).toBe('');
  });
});
