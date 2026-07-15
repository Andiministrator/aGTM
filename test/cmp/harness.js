// test/cmp/harness.js — shared harness for testing the CMP consent_check
// implementations in cmp/cc_<name>.js.
//
// Each CMP file is standalone JS that (re)defines aGTM.f.consent_check and reads
// a CMP-specific browser global (Cookiebot, UC_UI, __cmp, …), writing its result
// into aGTM.d.consent. The harness eval's the source into global scope (the same
// indirect-eval trick test/setup.js uses for aGTM.js), so the CMP's consent_check
// overwrites the global one. Call loadCMP(name) in beforeEach AFTER resetAGTM()
// so the fresh aGTM.d/c are in place first.
import { readFileSync } from 'fs';

export function loadCMP(name) {
  const src = readFileSync('./cmp/cc_' + name + '.js', 'utf8');
  // eslint-disable-next-line no-eval
  (0, eval)(src); // executes in global scope → overwrites globalThis.aGTM.f.consent_check
}

// Convenience: run a full consent_check for a given global fixture and return
// the resulting aGTM.d.consent. `globalName`/`globalValue` install the CMP's
// expected browser global for the duration of the call.
export function runConsentCheck(globalName, globalValue, action) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, globalName);
  const prev = globalThis[globalName];
  globalThis[globalName] = globalValue;
  try {
    const ok = globalThis.aGTM.f.consent_check(action || 'update');
    return { ok: ok, consent: globalThis.aGTM.d.consent };
  } finally {
    if (had) globalThis[globalName] = prev; else delete globalThis[globalName];
  }
}
