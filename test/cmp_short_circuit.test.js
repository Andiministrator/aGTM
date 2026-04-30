// test/cmp_short_circuit.test.js — CI guard for the load-bearing CMP
// short-circuit pattern (SESSION-REDESIGN.md §5).
//
// Every cmp/cc_<name>.js must begin its consent_check function with a check
// equivalent to:
//   if (action == 'init' && aGTM.d.consent.hasResponse) return true;
//
// Reason: when cfg.session.consent pre-populates aGTM.d.consent.hasResponse,
// the first consent_check('init') call must short-circuit so GTM injects
// without touching the actual CMP. This is the v1.5 "preset_with_consent"
// fast-path — the entire performance win of the redesign rides on it.
//
// Without this guard, a new CMP integration could quietly break preset
// consent handling and the regression would only surface in production.

import { describe, test, expect } from 'bun:test';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const CMP_DIR = join(import.meta.dir, '..', 'cmp');

// Match patterns like:
//   if (action=='init' && aGTM.d.consent.hasResponse) return true;
//   if (action == "init" && aGTM.d.consent.hasResponse) return true
//   if ('init'==action && ...) return true;     ← reversed comparison ok
const SHORT_CIRCUIT_RE =
  /if\s*\(\s*(?:action\s*==\s*['"]init['"]|['"]init['"]\s*==\s*action)\s*&&\s*aGTM\.d\.consent\.hasResponse\s*\)\s*return\s+true/;

describe('cmp/cc_*.js — preset short-circuit guard', () => {
  const sources = readdirSync(CMP_DIR).filter((f) => f.endsWith('.js') && !f.endsWith('.min.js'));

  test('cmp/ directory contains source files (sanity)', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  for (const file of sources) {
    test(`${file} short-circuits when action='init' && aGTM.d.consent.hasResponse`, () => {
      const body = readFileSync(join(CMP_DIR, file), 'utf8');
      expect(SHORT_CIRCUIT_RE.test(body)).toBe(true);
    });
  }
});
