// test/sgtm/tpl-test-names.test.js — GTM refuses to import a template whose
// ___TESTS___ block has a scenario name containing a double quote.
//
// Why this exists: it cost a round trip. A hand-written scenario name —
//   a stored boolean true is the former "yes" and still means env
// — made the whole template fail to import with
//   Test name '...' is invalid. The name contains invalid character: '"'
// Nothing local caught it: the block is YAML inside a .tpl, the scenarios run
// only in GTM's own editor, and the name is not code, so neither `bun test` nor
// the sandbox lint ever looks at it. The failure surfaces at the one moment that
// is expensive — importing into a live container.
//
// Scope of the rule: the double quote is the ONE character proven to be
// rejected. In the same import, earlier scenarios whose names carried ' and ?
// and & validated fine (GTM stops at the first offender, and it named a later
// one), and _ and / occur in tracked templates that import today. So this guards
// exactly what is evidenced and does not invent a stricter charset — an
// over-broad rule here would just be noise on names nobody can import-test.
//
// It covers untracked templates too (see allTemplates below) — the file that
// caused this was one of them.
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';

const ROOT = join(import.meta.dir, '..', '..');

/**
 * Every .tpl in the working tree — tracked AND untracked.
 *
 * Untracked ones matter most: the import that cost the round trip was a client
 * kept under tmp/ (gitignored), i.e. exactly the file `git ls-files` cannot see.
 * A guard that misses the place the defect happened is decoration.
 */
function allTemplates() {
  const tracked = execFileSync('git', ['ls-files', '-z', '*.tpl'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0').filter(Boolean);
  // --others WITHOUT --exclude-standard: gitignored files are the point here.
  const untracked = execFileSync(
    'git', ['ls-files', '-z', '--others', '*.tpl'], { cwd: ROOT, encoding: 'utf8' }
  ).split('\0').filter(Boolean);
  return [...new Set([...tracked, ...untracked])].sort();
}

/** The scenario names of a template's ___TESTS___ block ([] when it has none). */
function scenarioNames(file) {
  const src = readFileSync(join(ROOT, file), 'utf8');
  const block = src.match(/___TESTS___\n([\s\S]*?)\n\n\n___/);
  if (!block) return [];
  return [...block[1].matchAll(/^- name: (.+)$/gm)].map((m) => m[1]);
}

describe('GTM template test-scenario names are importable', () => {
  const templates = allTemplates();

  test('there are templates to check at all', () => {
    // Guards the guard: a broken glob would make every assertion below vacuous.
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.flatMap(scenarioNames).length).toBeGreaterThan(0);
  });

  for (const file of templates) {
    const names = scenarioNames(file);
    if (!names.length) continue;

    test(`${file}: no scenario name contains a double quote`, () => {
      const offenders = names.filter((n) => n.includes('"'));
      expect(offenders).toEqual([]);
    });

    test(`${file}: scenario names are unique and non-empty`, () => {
      // A duplicate or blank name is the other way a Tests tab stops being
      // readable — cheap to check while we are already parsing the block.
      expect(names.filter((n) => !n.trim())).toEqual([]);
      expect([...new Set(names)].length).toBe(names.length);
    });
  }
});
