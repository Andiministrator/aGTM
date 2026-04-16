// test/enc.test.js — tests for aGTM.f.enc()
import { describe, test, expect } from 'bun:test';

describe('aGTM.f.enc()', () => {
  test('returns a non-empty string', () => {
    const result = aGTM.f.enc('hello world', 1);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('output contains only URL-safe characters [A-Za-z0-9-_~]', () => {
    const result = aGTM.f.enc('Hello World! Special: @#$%', 42);
    expect(/^[A-Za-z0-9\-_~]+$/.test(result)).toBe(true);
  });

  test('different salts produce different output for the same input', () => {
    const r1 = aGTM.f.enc('test', 1);
    const r2 = aGTM.f.enc('test', 2);
    expect(r1).not.toBe(r2);
  });

  test('same input and salt always produce the same output (deterministic)', () => {
    expect(aGTM.f.enc('deterministic', 7)).toBe(aGTM.f.enc('deterministic', 7));
  });

  test('encodes unicode / multi-byte characters without error', () => {
    const result = aGTM.f.enc('äöüß — emoji: 🚀', 3);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('encodes empty string without error', () => {
    const result = aGTM.f.enc('', 1);
    expect(typeof result).toBe('string');
  });

  test('salt modulo behaviour: salt % 63 + 1 is the effective shift', () => {
    // salt=64 should produce same shift as salt=1 (64 % 63 + 1 = 2, 1 % 63 + 1 = 2)
    expect(aGTM.f.enc('shift-test', 64)).toBe(aGTM.f.enc('shift-test', 1));
  });

  test('padding marker ~ appears only for inputs requiring base64 padding', () => {
    // strings of length 1 mod 3 produce 2 padding chars → 2 ~ chars
    // strings of length 2 mod 3 produce 1 padding char  → 1 ~ char
    // strings of length 0 mod 3 produce no padding      → no ~ char
    const nopad  = aGTM.f.enc('abc', 5);   // 3 bytes → no padding
    const onepad = aGTM.f.enc('ab', 5);    // 2 bytes → 1 padding
    const twopad = aGTM.f.enc('a', 5);     // 1 byte  → 2 padding
    expect((nopad.match(/~/g)  || []).length).toBe(0);
    expect((onepad.match(/~/g) || []).length).toBe(1);
    expect((twopad.match(/~/g) || []).length).toBe(2);
  });
});
