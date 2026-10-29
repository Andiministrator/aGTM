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
// One acorn run per file on purpose: acorn stops at the first error, so a
// single run over all files would hide every failure after the first. Each
// run goes through bunx, which is slow under load, so the tests carry an
// explicit time limit instead of bun's 5 s default (F-268: a loaded machine
// hit the default and reported ten files with empty messages).
//
// Deliberately NOT covered here: the sGTM Client. It runs in GTM's *server*
// sandbox, a different dialect that uses const/let/for-of on purpose —
// test/sgtm/sandbox-lint.test.js checks it against its own rules.

import { test, expect } from 'bun:test';
import { readdirSync } from 'fs';

const LIMIT_MS = 120000;

function parseAsEs5(file, source) {
  // `source` given: parsed from stdin, so the probe needs no file anywhere.
  const args = source === undefined ? ['bunx', 'acorn', '--ecma5', '--silent', file] : ['bunx', 'acorn', '--ecma5', '--silent'];
  const r = Bun.spawnSync(args, { stdin: source === undefined ? 'ignore' : Buffer.from(source), stderr: 'pipe', stdout: 'pipe' });
  const err = new TextDecoder().decode(r.stderr).trim();
  return { ok: r.exitCode === 0, err: err || '(exit ' + r.exitCode + ', no message - acorn missing or killed?)' };
}

test('the check would actually catch an ES6 construct', () => {
  // Runs first and on a known-bad file: without it, "everything parses" could
  // just as well mean "the parser never ran" — a green suite proving nothing.
  // A failing exit code alone would also come from a missing acorn, so the
  // probe asks for acorn's own syntax message ("The keyword 'const' is
  // reserved"). Fed through stdin: nothing is written to disk.
  const r = parseAsEs5(null, 'const x = () => 1;');
  expect(r.ok).toBe(false);
  expect(r.err).toMatch(/reserved|Unexpected token/);
}, LIMIT_MS);

test('aGTM.js parses as ES5', () => {
  // Decided by the exit code, with the message as the diff: an empty stderr
  // on a failed run must not pass.
  const r = parseAsEs5('aGTM.js');
  expect(r.ok ? '' : r.err).toBe('');
  expect(r.ok).toBe(true);
}, LIMIT_MS);

test('every CMP adapter parses as ES5', () => {
  const failures = readdirSync('cmp')
    .filter((f) => f.endsWith('.js'))
    .map((f) => ({ f: f, r: parseAsEs5('cmp/' + f) }))
    .filter((x) => !x.r.ok)
    .map((x) => x.f + ': ' + x.r.err);
  expect(failures).toEqual([]);
}, LIMIT_MS);
