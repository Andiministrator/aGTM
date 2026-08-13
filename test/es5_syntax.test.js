// The ES5 rule is a hard constraint, not a style preference: aGTM.js and the
// CMP adapters can end up inside GTM's sandboxed JS, which is ES5-only. Until
// now it was enforced by review alone, and two ES2017 trailing commas in call
// argument lists had been sitting in aGTM.js since the iframe round — found by
// a QA pass, not by this suite.
//
// terser hides them: it parses ES2017+ and emits valid ES5 either way, so the
// built artefact looks fine while the source is not. Parsing the SOURCE with a
// parser pinned to ES5 is the only thing that answers the actual question.
//
// Run through `bunx`, not an import: this repo deliberately has no installed
// node_modules (build.sh: "No npm install needed"), and terser is used the same
// way. acorn is listed in devDependencies so the intent is recorded.
//
// Deliberately NOT covered here: the sGTM Client. It runs in GTM's *server*
// sandbox, a different dialect that uses const/let/for-of on purpose —
// test/sgtm/sandbox-lint.test.js checks it against its own rules.

import { test, expect } from 'bun:test';
import { readdirSync } from 'fs';

function parseAsEs5(file) {
  const r = Bun.spawnSync(['bunx', 'acorn', '--ecma5', file], { stderr: 'pipe', stdout: 'pipe' });
  return { ok: r.exitCode === 0, err: new TextDecoder().decode(r.stderr).trim() };
}

test('the check would actually catch an ES6 construct', () => {
  // Runs first and on a known-bad file: without it, "everything parses" could
  // just as well mean "the parser never ran" — a green suite proving nothing.
  // It also surfaces a missing/unreachable acorn as a real failure rather than
  // as silent success.
  const tmp = '/tmp/agtm-es5-probe.js';
  Bun.write(tmp, 'const x = () => 1;');
  expect(parseAsEs5(tmp).ok).toBe(false);
});

test('aGTM.js parses as ES5', () => {
  const r = parseAsEs5('aGTM.js');
  expect(r.ok ? '' : r.err).toBe('');
});

test('every CMP adapter parses as ES5', () => {
  const failures = readdirSync('cmp')
    .filter((f) => f.endsWith('.js'))
    .map((f) => ({ f: f, r: parseAsEs5('cmp/' + f) }))
    .filter((x) => !x.r.ok)
    .map((x) => x.f + ': ' + x.r.err);
  expect(failures).toEqual([]);
});
