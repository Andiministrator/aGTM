// test/urlparam.test.js — tests for aGTM.f.urlParam() (read a query parameter)
// F-47 (sibling of gc's F-45): the parameter name was placed into new RegExp()
// unescaped, so a name with regex metacharacters could match the wrong
// parameter or crash the RegExp constructor. These tests pin the hardened
// behaviour; each metachar case fails against the pre-fix code (wrong value or
// an uncaught SyntaxError).
import { describe, test, expect, beforeEach } from 'bun:test';
import { resetAGTM } from './helpers.js';

describe('aGTM.f.urlParam()', () => {
  beforeEach(() => {
    resetAGTM();
  });

  test('reads a plain parameter value', () => {
    expect(aGTM.f.urlParam('foo', 'https://x/?foo=bar')).toBe('bar');
  });

  test('returns null for a missing parameter', () => {
    expect(aGTM.f.urlParam('foo', 'https://x/?baz=1')).toBeNull();
  });

  test('decodes the value and turns "+" into a space', () => {
    expect(aGTM.f.urlParam('q', 'https://x/?q=a+b%2Bc')).toBe('a b+c');
  });

  test('escapes "." in the name — must not match a different param (F-47)', () => {
    // Unescaped, "a.b" lets "." match any char, so "[?&]a.b=" wrongly hits
    // "?axb=9" and returns "9". The escaped name matches the real "&a.b=2".
    expect(aGTM.f.urlParam('a.b', 'https://x/?axb=9&a.b=2')).toBe('2');
  });

  test('escapes "(" in the name — must not throw a SyntaxError (F-47)', () => {
    // Before the fix, "a(b" produced an unbalanced group in new RegExp() and
    // threw before any try/catch. The escaped name matches "?a(b=1".
    expect(aGTM.f.urlParam('a(b', 'https://x/?a(b=1')).toBe('1');
  });

  test('returns null for empty / non-string names (guards the escape step)', () => {
    // Discriminating for undefined/null: the added name.replace() would throw
    // on them without the guard. The '' case returns null either way (no match)
    // and documents the empty-name contract.
    expect(aGTM.f.urlParam('', 'https://x/?foo=1')).toBeNull();
    expect(aGTM.f.urlParam(undefined, 'https://x/?foo=1')).toBeNull();
    expect(aGTM.f.urlParam(null, 'https://x/?foo=1')).toBeNull();
  });

  test('matches a valueless parameter as null (flag form, no "=")', () => {
    // The "(=([^&#]*)|&|#|$)" branch matches "&foo&"/end without a value group;
    // results[2] is undefined so the function returns null (documented shape).
    expect(aGTM.f.urlParam('foo', 'https://x/?foo&bar=2')).toBeNull();
  });
});
