// test/sgtm/tpl-cookie-mock.test.js — a ___TESTS___ scenario must not mock
// getCookieValues with one non-empty answer for EVERY cookie name.
//
// Why this exists: the Client reads several cookies by name — the user id, the
// legacy ids and `aGTMoptout`. A mock that ignores the name answers all of them,
// so the visitor in that scenario has also "objected". After the opt-out guard
// on the consent POST (9d2125f, 2026-10-27) the scenario "POST consent route
// falls back to cookie uid when payload omits it" got 204 instead of 200. Nothing
// local saw it: `bun test` never runs ___TESTS___, only GTM's Tests tab does
// (found there by Andi on 2026-10-29, F-270).
//
// The rule: the mock function either returns an empty list, or it USES its first
// parameter (the cookie name) in its body. A parameter that is declared but never
// read is still name-blind. Checked on the mock's own text — function or arrow
// form, either quote style — not on one exact spelling. Tracked templates only —
// copies under tmp/ are snapshots.
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';

const ROOT = join(import.meta.dir, '..', '..');

const templates = execFileSync('git', ['ls-files', '-z', '*.tpl'], { cwd: ROOT, encoding: 'utf8' })
  .split('\0').filter(Boolean);

// Text from `open` (an opening bracket) to its matching closing bracket.
function balanced(s, i, open, close) {
  let depth = 0;
  for (let k = i; k < s.length; k++) {
    if (s[k] === open) depth++;
    else if (s[k] === close && --depth === 0) return s.slice(i + 1, k);
  }
  return null;
}

// Every getCookieValues mock as {param, body}; body null when it cannot be read.
function cookieMocks(text) {
  const i = text.indexOf('___TESTS___');
  if (i < 0) return [];
  const tests = text.slice(i);
  const out = [];
  const re = /mock\(\s*['"]getCookieValues['"]\s*,\s*/g;
  let m;
  while ((m = re.exec(tests)) !== null) {
    const rest = tests.slice(re.lastIndex);
    const fn = /^function\s*\w*\s*\(([^)]*)\)\s*/.exec(rest);
    const arrow = /^(?:\(([^)]*)\)|(\w+))\s*=>\s*/.exec(rest);
    const head = fn || arrow;
    if (!head) { out.push({ param: '', body: null, at: rest.slice(0, 60) }); continue; }
    const params = fn ? fn[1] : (arrow[1] !== undefined ? arrow[1] : arrow[2]);
    const after = rest.slice(head[0].length);
    const body = after[0] === '{' ? balanced(after, 0, '{', '}') : (balanced('(' + after, 0, '(', ')') || '');
    out.push({ param: (params || '').split(',')[0].trim(), body, at: rest.slice(0, 60).split('\n')[0] });
  }
  return out;
}

function nameBlindMocks(text) {
  return cookieMocks(text).filter((x) => {
    if (x.body === null) return true;
    if (/^\s*(return\s*)?\[\s*\]\s*;?\s*$/.test(x.body)) return false;
    return !x.param || !new RegExp('\\b' + x.param + '\\b').test(x.body);
  }).map((x) => x.at);
}

describe('___TESTS___ cookie mocks look at the cookie name', () => {
  const T = (code) => '___TESTS___\n    ' + code;
  const blind = {
    'no parameter': "mock('getCookieValues', function() { return ['C.1$x$1.2']; });",
    'unused parameter': "mock('getCookieValues', function(name) { return ['C.1$x$1.2']; });",
    'double quotes': 'mock("getCookieValues", function() { return [\'C.1$x\']; });',
    'named function': "mock('getCookieValues', function gcv() { return ['C.1$x']; });",
    'variable instead of literal': "mock('getCookieValues', function() { return u; });",
    'arrow, expression body': "mock('getCookieValues', () => ['C.1$x']);",
    'arrow, unused parameter': "mock('getCookieValues', (n) => { return ['C.1$x']; });",
    'line break in body': "mock('getCookieValues', function() {\n      return ['C.1$x'];\n    });"
  };
  const fine = {
    'empty list': "mock('getCookieValues', function() { return []; });",
    'by name': "mock('getCookieValues', function(name) { return name === 'aGTMoptout' ? [] : ['C.1$x']; });",
    'arrow by name': "mock('getCookieValues', (n) => n === '_tpf' ? ['C.1$x'] : []);"
  };
  for (const [k, code] of Object.entries(blind)) {
    test('catches: ' + k, () => { expect(nameBlindMocks(T(code)).length).toBe(1); });
  }
  for (const [k, code] of Object.entries(fine)) {
    test('accepts: ' + k, () => { expect(nameBlindMocks(T(code))).toEqual([]); });
  }

  for (const f of templates) {
    test(f, () => {
      expect(nameBlindMocks(readFileSync(join(ROOT, f), 'utf8'))).toEqual([]);
    });
  }
});
