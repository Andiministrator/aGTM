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

  test('gc() has NO left name boundary — a suffix-collision cookie wins (KNOWN, F-45)', () => {
    // Characterization pin: gc() builds new RegExp(n + "=([^;]+)") with the name
    // neither escaped nor anchored, so reading 'b' matches the 'b=' inside 'ab=9'.
    // This documents the latent bug (F-45); when gc() is hardened (escape + anchor
    // the name) this expectation must flip to '2'.
    document.cookie = 'ab=9; b=2';
    expect(aGTM.f.gc('b')).toBe('9');
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
});
