// test/size-budget.test.js
// Size-budget guard for the built library (aGTM.min.js).
//
// aGTM's design goal is to stay lean and performant — explicitly NOT to grow into a
// heavy library like GTM's own. Bundle size drifts silently: a feature adds a few
// hundred bytes here and there and nobody notices until the file has doubled. This
// test makes the "keep it lean" rule ENFORCEABLE — it fails when aGTM.min.js exceeds a
// deliberate budget, so a real increase forces a conscious decision (bump the budget
// here, with a reason) instead of slipping through.
//
// When you legitimately grow the library, raise BUDGET_RAW/BUDGET_GZIP in the same
// commit — that edit is the paper trail. Shrinking it below the current size is welcome.

import { test, expect, describe } from "bun:test";
import { readFileSync } from "fs";
import { gzipSync } from "zlib";

// Deliberate ceilings. Current (2026-07-25): raw 35_932 B, gzip 10_815 B.
// Headroom is intentionally small (~1 KB raw) so a meaningful addition trips the guard.
const BUDGET_RAW = 37_000;
const BUDGET_GZIP = 11_300;

function sizes(path) {
  const buf = readFileSync(path);
  return { raw: buf.length, gzip: gzipSync(buf, { level: 9 }).length };
}

describe("size budget — aGTM.min.js stays lean", () => {
  const s = sizes("./aGTM.min.js");

  test(`raw ${s.raw} B is within budget ${BUDGET_RAW} B`, () => {
    expect(s.raw).toBeLessThanOrEqual(BUDGET_RAW);
  });

  test(`gzip ${s.gzip} B is within budget ${BUDGET_GZIP} B`, () => {
    expect(s.gzip).toBeLessThanOrEqual(BUDGET_GZIP);
  });

  // Guards the guard: if the file shrank well under budget, the budget should be tightened
  // so it keeps catching drift. Checks BOTH raw and gzip so a gzip-only drop can't hide.
  // (Measures the committed aGTM.min.js — run ./build.sh before trusting a local result.)
  test("budget is not left absurdly loose after a size drop", () => {
    expect(BUDGET_RAW - s.raw).toBeLessThanOrEqual(4_096);
    expect(BUDGET_GZIP - s.gzip).toBeLessThanOrEqual(2_048);
  });
});
