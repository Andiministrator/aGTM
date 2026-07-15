// test/helpers_round2.test.js — round-2 unit tests for pure/simple aGTM helpers
// (follows test/consent_serialize.test.js + regex_helpers.test.js). Covers the
// helpers that had no direct coverage: strclean, an, vOb, getVal, propset,
// isIFrame. Test-only, no runtime change. Each assertion is written to fail if
// the helper's core behaviour regresses (no tautologies).
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resetAGTM } from './helpers.js';

beforeEach(() => resetAGTM());

// ── aGTM.f.strclean ─────────────────────────────────────────────────────────
describe('aGTM.f.strclean()', () => {
  test('strips characters outside the [A-Za-z0-9_-] + German-umlaut allowlist', () => {
    expect(aGTM.f.strclean('any "dirty"; string')).toBe('anydirtystring');
    expect(aGTM.f.strclean('a.b/c(d)')).toBe('abcd');
  });

  test('keeps letters, digits, underscore, hyphen and umlauts/ß', () => {
    expect(aGTM.f.strclean('Über_Straße-9')).toBe('Über_Straße-9');
  });

  test('returns "" for undefined and null (no throw)', () => {
    expect(aGTM.f.strclean(undefined)).toBe('');
    expect(aGTM.f.strclean(null)).toBe('');
  });

  test('coerces non-string primitives via toString before cleaning', () => {
    expect(aGTM.f.strclean(123)).toBe('123');
    expect(aGTM.f.strclean(true)).toBe('true');
  });
});

// ── aGTM.f.an (assign-or-default via hasOwnProperty) ─────────────────────────
describe('aGTM.f.an()', () => {
  test('copies an existing property from source', () => {
    var t = {};
    aGTM.f.an(t, 'x', { x: 'val' }, 'DEF');
    expect(t.x).toBe('val');
  });

  test('uses the default when the property is absent', () => {
    var t = {};
    aGTM.f.an(t, 'x', {}, 'DEF');
    expect(t.x).toBe('DEF');
  });

  test('copies a falsy own value (0/false/"") rather than defaulting — hasOwnProperty, not ||', () => {
    // This is the discriminating case: a naive `source[p] || default` would
    // return the default here; hasOwnProperty keeps the real falsy value.
    var t = {};
    aGTM.f.an(t, 'a', { a: 0 }, 99);
    aGTM.f.an(t, 'b', { b: '' }, 'DEF');
    aGTM.f.an(t, 'c', { c: false }, true);
    expect(t.a).toBe(0);
    expect(t.b).toBe('');
    expect(t.c).toBe(false);
  });
});

// ── aGTM.f.vOb (valid, JSON-serializable object) ─────────────────────────────
describe('aGTM.f.vOb()', () => {
  test('true for a plain object and an array (both are non-null objects)', () => {
    expect(aGTM.f.vOb({})).toBe(true);
    expect(aGTM.f.vOb({ a: 1 })).toBe(true);
    expect(aGTM.f.vOb([])).toBe(true);
  });

  test('false for null, undefined and non-objects', () => {
    expect(aGTM.f.vOb(null)).toBe(false);
    expect(aGTM.f.vOb(undefined)).toBe(false);
    expect(aGTM.f.vOb('str')).toBe(false);
    expect(aGTM.f.vOb(42)).toBe(false);
  });

  test('false for a circular object (JSON.stringify throws → caught)', () => {
    var o = {};
    o.self = o;
    expect(aGTM.f.vOb(o)).toBe(false);
  });
});

// ── aGTM.f.getVal (window/document/location/... accessor) ────────────────────
describe('aGTM.f.getVal()', () => {
  test("reads location attributes with the 'l' selector", () => {
    expect(aGTM.f.getVal('l', 'href')).toBe('http://localhost/test');
  });

  test('returns undefined for an unknown object selector (default branch)', () => {
    expect(aGTM.f.getVal('z', 'href')).toBeUndefined();
  });

  test('returns undefined when object or attribute is empty / non-string (vSt guard)', () => {
    // The discriminating sub-case is the non-string attribute: without the vSt
    // guard, getVal('l', 123) would throw on 123.match(...) below. The empty
    // '' cases document the guard contract but return undefined either way.
    expect(aGTM.f.getVal('l', 123)).toBeUndefined(); // no guard → 123.match throws
    expect(aGTM.f.getVal('', 'href')).toBeUndefined();
    expect(aGTM.f.getVal('l', '')).toBeUndefined();
  });

  test('returns undefined for an attribute with no letters (match guard)', () => {
    // Documents the /[a-z]/i letter requirement; location['123'] is undefined
    // anyway, so this pins the contract rather than a value difference.
    expect(aGTM.f.getVal('l', '123')).toBeUndefined();
  });

  test("consent selector 'c' returns null when google_tag_data is absent", () => {
    expect(aGTM.f.getVal('c', 'ics')).toBeNull();
  });
});

// ── aGTM.f.propset (set property only if currently falsy, swallow errors) ─────
describe('aGTM.f.propset()', () => {
  test('sets the default on a fresh property', () => {
    var o = {};
    aGTM.f.propset(o, 'x', 'DEF');
    expect(o.x).toBe('DEF');
  });

  test('keeps an existing truthy value', () => {
    var o = { x: 'keep' };
    aGTM.f.propset(o, 'x', 'DEF');
    expect(o.x).toBe('keep');
  });

  test('overwrites an existing falsy value (obj[prop] || default)', () => {
    var o = { x: 0 };
    aGTM.f.propset(o, 'x', 'DEF');
    expect(o.x).toBe('DEF');
  });

  test('swallows errors when the target is not writable (null target → no throw)', () => {
    expect(() => aGTM.f.propset(null, 'x', 'DEF')).not.toThrow();
  });
});

// ── aGTM.f.isIFrame ──────────────────────────────────────────────────────────
describe('aGTM.f.isIFrame()', () => {
  test('false when window.self === window.top (default test env)', () => {
    expect(aGTM.f.isIFrame()).toBe(false);
  });

  test('true when window.top differs from window.self (simulated frame)', () => {
    var savedTop = globalThis.top;
    try {
      globalThis.top = { name: 'other' }; // window.top !== window.self
      expect(aGTM.f.isIFrame()).toBe(true);
    } finally {
      globalThis.top = savedTop;
    }
  });
});
