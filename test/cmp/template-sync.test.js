// test/cmp/template-sync.test.js — F-52 drift guard.
//
// The sGTM Client template (sgtmClient/template.tpl) embeds one minified
// consent_check function per CMP as its "Used CMP (Consent Tool)" SELECT option
// value. That is the production copy the Client injects inline into /aGTM.js for
// Client users. build.sh regenerates these from cmp/*.min.js via
// scripts/update-sgtm-template.js. This test asserts the two are in lockstep, so
// a future CMP fix that lands in cmp/*.js but is not re-synced (a repeat of the
// F-51 → F-52 drift) fails CI instead of silently shipping stale code to Client
// users. It shares CMP_MAP / extraction with the writer via cmp-sync-lib.js, so
// the mapping itself cannot drift between writer and guard.
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import {
  CMP_MAP, embeddedValueForFile, parseTemplateCmpItems,
} from '../../scripts/cmp-sync-lib.js';

const template = readFileSync('sgtmClient/template.tpl', 'utf8');
const items = parseTemplateCmpItems(template);
// displayValue → JSON-decoded embedded value (escapes already resolved).
const embedded = {};
(items || []).forEach((it) => { embedded[it.displayValue] = it.value; });

describe('F-52 embedded CMP consent_check ↔ cmp/*.min.js sync', () => {
  test('the template exposes a cmp SELECT with options', () => {
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
  });

  test('every embedded CMP option has a CMP_MAP entry (no unmapped drift)', () => {
    const unmapped = items.map((it) => it.displayValue).filter((dv) => !(dv in CMP_MAP));
    expect(unmapped).toEqual([]);
  });

  test('every CMP_MAP entry is present in the template', () => {
    const missing = Object.keys(CMP_MAP).filter((dv) => !(dv in embedded));
    expect(missing).toEqual([]);
  });

  // One assertion per CMP so a drift names the exact offending CMP.
  Object.keys(CMP_MAP).forEach((dv) => {
    test('embedded value matches cmp/' + CMP_MAP[dv] + '.min.js — ' + dv, () => {
      const fromMin = embeddedValueForFile(CMP_MAP[dv]);
      expect(fromMin).not.toBeNull();
      // Both are the actual JS string (template value JSON-decoded, min.js
      // prefix-stripped). Byte equality ⇒ no drift.
      expect(embedded[dv]).toBe(fromMin);
    });
  });
});
