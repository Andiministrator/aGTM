// test/cmp/configurator-sync.test.js — drift guard for the configurator's CMP list.
//
// configurator/index.html (CMPData.cmps) offers one entry per CMP. The generator
// loads cmp/cc_<key>.min.js for it, and step 4 offers only the consent types in
// its consentTypes. Up to configurator 2.1.3 the list had drifted from cmp/:
// nine CMPs without any adapter, two under the wrong file name, and wrong
// consentTypes (a gtmServices condition for Cookiebot, whose adapter reports
// purposes only, can never be met — GTM never loads). This test pins both
// directions plus the consent types, so adding an adapter without a configurator
// entry, or changing what an adapter reports, fails `bun test`.
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'fs';

// Adapters the configurator deliberately does not list, with the reason.
const NOT_LISTED = {
  simple_cookie_regex_check: 'a template that has to be edited by hand — use Custom',
};
// Entries that have no adapter file on purpose.
const NO_FILE = ['custom', 'none'];

const html = readFileSync('configurator/index.html', 'utf8');
const block = html.slice(html.indexOf('const CMPData'), html.indexOf('getByGroup('));
const entries = {};
for (const m of block.matchAll(/^ {10}([a-z0-9_]+): \{([\s\S]*?)^ {10}\}/gm)) {
  const types = (m[2].match(/consentTypes: \[([^\]]*)\]/) || [, ''])[1];
  entries[m[1]] = types.split(',').map((t) => t.trim().replace(/'/g, '')).filter(Boolean).sort();
}

const adapters = readdirSync('cmp')
  .filter((f) => /^cc_.+\.js$/.test(f) && !f.endsWith('.min.js'))
  .map((f) => f.slice(3, -3));

// What an adapter writes into aGTM.d.consent.
const reported = (key) => {
  const src = readFileSync(`cmp/cc_${key}.js`, 'utf8');
  return ['services', 'purposes', 'vendors']
    .filter((t) => new RegExp(`aGTM\\.d\\.consent\\.${t}\\s*=(?!=)`).test(src));
};

describe('configurator CMP list ↔ cmp/ adapters', () => {
  test('the CMP list was found', () => {
    expect(Object.keys(entries).length).toBeGreaterThan(10);
  });

  test('every listed CMP has an adapter file', () => {
    const missing = Object.keys(entries)
      .filter((k) => !NO_FILE.includes(k))
      .filter((k) => !adapters.includes(k));
    expect(missing).toEqual([]);
  });

  test('every adapter is listed or excluded with a reason', () => {
    const unlisted = adapters.filter((k) => !(k in entries) && !(k in NOT_LISTED));
    expect(unlisted).toEqual([]);
  });

  for (const key of adapters.filter((k) => !(k in NOT_LISTED))) {
    test(`${key}: consentTypes match what the adapter reports`, () => {
      expect(entries[key]).toEqual(reported(key).sort());
    });
  }
});
