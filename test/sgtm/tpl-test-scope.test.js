// test/sgtm/tpl-test-scope.test.js — GTM refuses to import a template whose
// ___TESTS___ scenario redeclares a top-level name of the `setup` block.
//
// Why this exists: GTM runs `setup` and each scenario's `code` in ONE scope, so
// a scenario's `let body = '';` next to setup's `let body = '';` is a
// redeclaration. The import of the sGTM Client into a live container failed with
//   Variable "body" already exists. Offending token "body" at (NA, 4).
// Nothing local caught it, for the same reason as tpl-test-names.test.js: the
// scenarios run only in GTM's editor, so neither `bun test` nor the sandbox lint
// ever parses them. The setup declaration came in with d18ff95 (2026-08-05); the
// three scenarios had declared their own `body` since b406bff.
//
// Scope of the rule: top-level `const`/`let` only (setup at 2 spaces, scenario
// code at 4 spaces of YAML indentation). A name declared inside a nested
// function is a different scope and legal — flagging it would be noise.
// Covers untracked templates too: the file that is imported lives in tmp/.
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';

const ROOT = join(import.meta.dir, '..', '..');

function allTemplates() {
  const tracked = execFileSync('git', ['ls-files', '-z', '*.tpl'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0').filter(Boolean);
  // --others WITHOUT --exclude-standard: gitignored files are the point here.
  const untracked = execFileSync(
    'git', ['ls-files', '-z', '--others', '*.tpl'], { cwd: ROOT, encoding: 'utf8' }
  ).split('\0').filter(Boolean);
  return [...new Set([...tracked, ...untracked])].sort();
}

/** Top-level const/let names in lines indented by exactly `indent` spaces. */
function topLevelNames(lines, indent) {
  const re = new RegExp('^ {' + indent + '}(?:const|let)\\s+([A-Za-z_$][\\w$]*)');
  return lines.map((l) => (l.match(re) || [])[1]).filter(Boolean);
}

/** { setup: [names], scenarios: [{name, decls}] } for a template, or null. */
function testScopes(file) {
  const src = readFileSync(join(ROOT, file), 'utf8');
  const block = src.match(/___TESTS___\n([\s\S]*?)\n\n\n___/);
  if (!block) return null;
  const text = block[1];
  const setupAt = text.search(/^setup: \|-?\n/m);
  const setup = setupAt < 0 ? [] : topLevelNames(text.slice(setupAt).split('\n').slice(1), 2);
  const scenarioText = setupAt < 0 ? text : text.slice(0, setupAt);
  const scenarios = scenarioText.split(/^- name: /m).slice(1).map((chunk) => {
    const lines = chunk.split('\n');
    return { name: lines[0], decls: topLevelNames(lines.slice(1), 4) };
  });
  return { setup, scenarios };
}

describe('GTM template test scenarios do not redeclare setup names', () => {
  const templates = allTemplates();

  test('the parser sees setup declarations at all', () => {
    // Guards the guard: the sGTM Client's setup declares JSON, body, baseData, …
    const s = testScopes('sgtmClient/template.tpl');
    expect(s).not.toBeNull();
    expect(s.setup).toContain('baseData');
    expect(s.scenarios.length).toBeGreaterThan(0);
    expect(s.scenarios.some((x) => x.decls.includes('mockData'))).toBe(true);
  });

  for (const file of templates) {
    test(file, () => {
      const s = testScopes(file);
      if (!s) return;
      const clashes = [];
      for (const sc of s.scenarios) {
        for (const d of sc.decls) if (s.setup.includes(d)) clashes.push(sc.name + ' → ' + d);
        const seen = new Set();
        for (const d of sc.decls) {
          if (seen.has(d)) clashes.push(sc.name + ' → ' + d + ' (twice)');
          seen.add(d);
        }
      }
      expect(clashes).toEqual([]);
    });
  }
});
