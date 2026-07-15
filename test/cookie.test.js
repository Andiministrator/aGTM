// test/cookie.test.js — tests for aGTM.f.gc() / aGTM.f.sc() (get/set cookie)
// The test env's document.cookie is a plain string (no cookie jar), so each
// sc() overwrites the whole value — fine for single-cookie round-trips. The
// multi-cookie read test sets document.cookie directly to exercise gc()'s
// [^;]+ boundary parsing.
import { describe, test, expect, beforeEach } from 'bun:test';
import { resetAGTM } from './helpers.js';

describe('aGTM.f.gc() / aGTM.f.sc()', () => {
  beforeEach(() => {
    resetAGTM();           // restores aGTM.n.ck = 'cookie'
    document.cookie = '';   // clean slate (plain string in the test env)
  });

  test('sc() then gc() round-trips a value', () => {
    aGTM.f.sc('foo', 'bar');
    expect(aGTM.f.gc('foo')).toBe('bar');
  });

  test('gc() returns null for a missing cookie', () => {
    expect(aGTM.f.gc('does_not_exist')).toBeNull();
  });

  test('gc() reads a value out of a multi-cookie string (stops at the ";" right boundary)', () => {
    // exercises only the [^;]+ RIGHT boundary; the fixture has no name-suffix
    // collision, so it does not (and cannot) prove left name-boundary safety
    document.cookie = 'a=1; b=2; c=3';
    expect(aGTM.f.gc('b')).toBe('2');
  });

  test('gc() is left-anchored — a suffix-collision cookie name does NOT win (F-45)', () => {
    // Reading 'b' must not match the 'b=' inside 'ab='. Before the F-45 fix the
    // unanchored regex returned '9'; the left anchor now yields the real 'b=2'.
    document.cookie = 'ab=9; b=2';
    expect(aGTM.f.gc('b')).toBe('2');
  });

  test('gc() escapes regex metacharacters in the name (F-45)', () => {
    // Before the fix the name went unescaped into new RegExp(): '.' matched any
    // char (so gc('a.b') wrongly hit 'axb='), and a name like 'a(b' made the
    // RegExp constructor THROW an uncaught SyntaxError (built before the try).
    document.cookie = 'axb=9; a.b=2';
    expect(aGTM.f.gc('a.b')).toBe('2');
    document.cookie = 'a(b=1';
    expect(aGTM.f.gc('a(b')).toBe('1'); // must not throw
  });

  test('gc() returns null for empty / non-string names (guards the escape step)', () => {
    // The new n.replace() would throw on undefined/null without this guard, so
    // the guard protects the added escape line (not an old-vs-new value diff).
    document.cookie = 'a=1; b=2';
    expect(aGTM.f.gc('')).toBeNull();
    expect(aGTM.f.gc(undefined)).toBeNull();
    expect(aGTM.f.gc(null)).toBeNull();
  });

  test('gc() URI-decodes the stored value', () => {
    document.cookie = 'x=a%20b%2Bc';
    expect(aGTM.f.gc('x')).toBe('a b+c');
  });

  test('sc() writes Secure + SameSite=Lax + path attributes', () => {
    aGTM.f.sc('foo', 'bar');
    expect(document.cookie).toContain('Secure');
    expect(document.cookie).toContain('SameSite=Lax');
    expect(document.cookie).toContain('path=/');
  });

  test('sc() gc() only returns the value, not the trailing attributes', () => {
    aGTM.f.sc('token', 'abc123');
    expect(aGTM.f.gc('token')).toBe('abc123');
  });

  test('sc() is a no-op for an empty name', () => {
    document.cookie = '';
    aGTM.f.sc('', 'value');
    expect(document.cookie).toBe('');
  });

  test('sc() is a no-op for an empty value', () => {
    document.cookie = '';
    aGTM.f.sc('name', '');
    expect(document.cookie).toBe('');
  });

  test('sc() is a no-op for a non-string name', () => {
    document.cookie = '';
    aGTM.f.sc(5, 'value');
    expect(document.cookie).toBe('');
  });

  test('sc() encodes a value with separators so gc() round-trips it (F-45/F-47 write side)', () => {
    // Before the fix the raw ";"/"="  went straight into the cookie string:
    // 'k=a;b=c; Secure…' — gc()'s [^;]+ stops at the first ";" and returns 'a'.
    // Encoding on write + decode on read now round-trips the full value.
    document.cookie = '';
    aGTM.f.sc('k', 'a;b=c');
    expect(document.cookie).toContain('k=a%3Bb%3Dc');
    expect(aGTM.f.gc('k')).toBe('a;b=c');
  });

  test('sc() is a no-op for a name containing "=" (would corrupt the cookie)', () => {
    document.cookie = '';
    aGTM.f.sc('a=b', 'v');
    expect(document.cookie).toBe('');
  });

  test('sc() is a no-op for a name containing ";" or whitespace', () => {
    document.cookie = '';
    aGTM.f.sc('a;b', 'v');
    expect(document.cookie).toBe('');
    aGTM.f.sc('a b', 'v');
    expect(document.cookie).toBe('');
  });

  test('sc() still round-trips a plain literal value unchanged (no regression)', () => {
    document.cookie = '';
    aGTM.f.sc('aGTMoptout', '1');
    expect(document.cookie).toContain('aGTMoptout=1;');
    expect(aGTM.f.gc('aGTMoptout')).toBe('1');
  });
});
