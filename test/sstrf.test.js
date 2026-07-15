// test/sstrf.test.js — tests for aGTM.f.sStrf() (safe JSON.stringify)
// Used to deep-copy event objects in fire() and to guard against circular
// references that would make a plain JSON.stringify throw.
import { describe, test, expect } from 'bun:test';

describe('aGTM.f.sStrf()', () => {
  test('stringifies a plain object', () => {
    expect(aGTM.f.sStrf({ a: 1, b: 'x' })).toBe('{"a":1,"b":"x"}');
  });

  test('stringifies an array (arrays are objects)', () => {
    expect(aGTM.f.sStrf([1, 2, 3])).toBe('[1,2,3]');
  });

  test('non-object input returns the string "null"', () => {
    expect(aGTM.f.sStrf('hello')).toBe('null');
    expect(aGTM.f.sStrf(5)).toBe('null');
    expect(aGTM.f.sStrf(null)).toBe('null');
    expect(aGTM.f.sStrf(undefined)).toBe('null');
  });

  test('replaces circular references with "[Circular]" instead of throwing', () => {
    const o = { name: 'root' };
    o.self = o;
    const result = aGTM.f.sStrf(o);
    expect(result).toContain('[Circular]');
    // and it is valid JSON that round-trips
    const parsed = JSON.parse(result);
    expect(parsed.name).toBe('root');
    expect(parsed.self).toBe('[Circular]');
  });

  test('output can be JSON.parsed back into an equivalent object', () => {
    const src = { event: 'purchase', value: 12.5, nested: { id: 'x' } };
    const parsed = JSON.parse(aGTM.f.sStrf(src));
    expect(parsed).toEqual(src);
  });

  test('logs an e16 error entry for non-object input', () => {
    const before = aGTM.l.length;
    aGTM.f.sStrf('not-an-object');
    expect(aGTM.l.length).toBeGreaterThan(before);
    // pin the actual log id, not just that *something* was logged
    expect(aGTM.l[aGTM.l.length - 1].id).toBe('e16');
  });
});
