// test/sgtm/tpl-cookie-mock.test.js — a ___TESTS___ scenario must not mock
// getCookieValues with one non-empty answer for EVERY cookie name.
//
// Why this exists: the Client reads several cookies by name — the user id, the
// legacy ids and `aGTMoptout`. A mock that ignores the name answers all of them,
// so the visitor in that scenario has also "objected". After the opt-out guard
// on the consent POST (9d2125f, 2026-10-27) the scenario "POST consent route
// falls back to cookie uid when payload omits it" got 204 instead of 200. Nothing
// local saw it: `bun test` never runs ___TESTS___, only GTM's Tests tab does
// (found there by Andi on 2026-10-29).
//
// The rule: a getCookieValues mock either returns an empty list or takes the
// name parameter. Tracked templates only — copies under tmp/ are snapshots.
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';

const ROOT = join(import.meta.dir, '..', '..');

const templates = execFileSync('git', ['ls-files', '-z', '*.tpl'], { cwd: ROOT, encoding: 'utf8' })
  .split('\0').filter(Boolean);

function nameBlindMocks(text) {
  const i = text.indexOf('___TESTS___');
  if (i < 0) return [];
  const tests = text.slice(i);
  const out = [];
  const re = /mock\('getCookieValues',\s*function\s*\(\s*\)\s*\{\s*return\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(tests)) !== null) {
    if (m[1].trim() !== '') out.push(tests.slice(m.index, m.index + 90).split('\n')[0]);
  }
  return out;
}

describe('___TESTS___ cookie mocks look at the cookie name', () => {
  test('the rule catches the case it was written for (control)', () => {
    const bad = "___TESTS___\n    mock('getCookieValues', function() { return ['C.1$x$1.2']; });";
    const good = "___TESTS___\n    mock('getCookieValues', function(name) { return name === 'aGTMoptout' ? [] : ['C.1$x$1.2']; });\n    mock('getCookieValues', function() { return []; });";
    expect(nameBlindMocks(bad).length).toBe(1);
    expect(nameBlindMocks(good)).toEqual([]);
  });

  for (const f of templates) {
    test(f, () => {
      expect(nameBlindMocks(readFileSync(join(ROOT, f), 'utf8'))).toEqual([]);
    });
  }
});
