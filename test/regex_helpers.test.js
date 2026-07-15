// test/regex_helpers.test.js — tests for the regex helpers that every GTM
// template relies on (and that the template ___TESTS___ only mock):
//   aGTM.f.rTest   — case-insensitive boolean match, vSt-guarded
//   aGTM.f.rMatch  — raw String.match, case-sensitive, NO guard
//   aGTM.f.rReplace— global+case-insensitive replace, vSt-guarded
//   aGTM.f.vSt     — non-empty-string validator (underpins rTest/rReplace)
import { describe, test, expect } from 'bun:test';

describe('aGTM.f.vSt()', () => {
  test('non-empty string is valid', () => {
    expect(aGTM.f.vSt('hello')).toBe(true);
  });

  test('empty string is invalid', () => {
    expect(aGTM.f.vSt('')).toBe(false);
  });

  test('array of non-empty strings is valid', () => {
    expect(aGTM.f.vSt(['a', 'b', 'c'])).toBe(true);
  });

  test('array with one empty string is invalid', () => {
    expect(aGTM.f.vSt(['a', '', 'c'])).toBe(false);
  });

  test('array with a non-string element is invalid', () => {
    expect(aGTM.f.vSt(['a', 5])).toBe(false);
    expect(aGTM.f.vSt(['a', null])).toBe(false);
  });

  test('non-string, non-array input is invalid', () => {
    expect(aGTM.f.vSt(5)).toBe(false);
    expect(aGTM.f.vSt(null)).toBe(false);
    expect(aGTM.f.vSt({})).toBe(false);
  });

  test('empty array is invalid', () => {
    expect(aGTM.f.vSt([])).toBe(false);
  });
});

describe('aGTM.f.rTest()', () => {
  test('matches a pattern in a string', () => {
    expect(aGTM.f.rTest('cmpUpdateEvent', 'cmp.*Event')).toBe(true);
  });

  test('is case-insensitive', () => {
    expect(aGTM.f.rTest('HELLO', 'hello')).toBe(true);
  });

  test('returns false when the pattern does not match', () => {
    expect(aGTM.f.rTest('abc', 'xyz')).toBe(false);
  });

  test('vSt-guarded: empty string or empty pattern returns false', () => {
    // note: an empty pattern would match anything, but the vSt guard blocks it
    expect(aGTM.f.rTest('', 'a')).toBe(false);
    expect(aGTM.f.rTest('a', '')).toBe(false);
  });

  test('non-string arguments return false without throwing', () => {
    expect(aGTM.f.rTest('a', 5)).toBe(false);
    expect(aGTM.f.rTest(null, 'a')).toBe(false);
  });
});

describe('aGTM.f.rMatch()', () => {
  test('returns the match array on a hit', () => {
    const m = aGTM.f.rMatch('Hello World', 'World');
    expect(m).not.toBeNull();
    expect(m[0]).toBe('World');
  });

  test('returns null on no match', () => {
    expect(aGTM.f.rMatch('Hello World', 'xyz')).toBeNull();
  });

  test('is case-sensitive (unlike rTest — no "i" flag)', () => {
    expect(aGTM.f.rMatch('Hello', 'hello')).toBeNull();
  });

  test('exposes capture groups', () => {
    const m = aGTM.f.rMatch('a=1', '(\\w)=(\\d)');
    expect(m[1]).toBe('a');
    expect(m[2]).toBe('1');
  });
});

describe('aGTM.f.rReplace()', () => {
  test('replaces a matched substring', () => {
    expect(aGTM.f.rReplace('Hello World', 'World', 'Andi')).toBe('Hello Andi');
  });

  test('replaces ALL occurrences (global flag)', () => {
    expect(aGTM.f.rReplace('a-a-a', '-', '_')).toBe('a_a_a');
  });

  test('is case-insensitive', () => {
    expect(aGTM.f.rReplace('FOO', 'foo', 'bar')).toBe('bar');
  });

  test('expands a wildcard pattern like the DL-Repeat whitelist does (F-05)', () => {
    // real use: turn a "*view*" glob into a regex fragment via \\* → .*
    expect(aGTM.f.rReplace('*view*', '\\*', '.*')).toBe('.*view.*');
  });

  test('vSt-guarded: empty pattern returns the text unchanged', () => {
    expect(aGTM.f.rReplace('abc', '', 'x')).toBe('abc');
  });

  test('vSt-guarded: empty replacement returns the text unchanged', () => {
    // consequence of the guard: rReplace cannot be used to delete a substring
    expect(aGTM.f.rReplace('abc', 'b', '')).toBe('abc');
  });
});
