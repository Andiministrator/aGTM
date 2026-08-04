// test/sgtm/container-select.test.js — which GTM containers end up in the served
// config, and what the `gtm_id_match` checkbox actually does.
//
// Why this exists: the v1.5 single-session refactor (9d302d7) rewrote the config
// builder and filtered the container table unconditionally on the ?id= query
// parameter, dropping the `gtm_id_match` flag it is supposed to depend on. Two
// things broke at once — the checkbox became a field with no effect (its own help
// text promises "If not checked, all of the following GTM Containers will be
// fired"), and a request WITHOUT ?id= produced an empty container list, so the
// library loaded and never injected GTM. No test noticed, because every existing
// fixture passes a single container whose id matches the harness default query.
import { describe, test, expect } from 'bun:test';
import { runClient } from './client-harness.js';

const TWO = [
  { gtm_id: 'GTM-AAA', gtm_consent: true },
  { gtm_id: 'GTM-BBB', gtm_consent: true }
];
const BASE = { gtm: TWO, cookie_mode: 'always' };

/**
 * The config object literal the Client injects. It is wrapped in an IIFE that
 * derives consent_store_url, so the literal is the first `{"` after the call —
 * matched by counting braces rather than by a regex, which would trip over the
 * nested objects of the container table.
 */
function injectedConfig(body) {
  const call = body.lastIndexOf('aGTM.f.config(');
  if (call < 0) return null;
  const start = body.indexOf('{"', call);
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return JSON.parse(body.slice(start, i + 1));
  }
  return null;
}

/** The `gtm` object of the injected config. */
function containers(body) {
  const cfg = injectedConfig(body);
  return cfg ? cfg.gtm : null;
}

describe('gtm_id_match off (the default)', () => {
  test('every configured container is served, whatever ?id= says', () => {
    const r = runClient({ data: { ...BASE }, query: { id: 'GTM-AAA' } });
    expect(r.throws).toBeNull();
    const g = containers(r.body);
    expect(Object.keys(g).sort()).toEqual(['GTM-AAA', 'GTM-BBB']);
  });

  test('a request without ?id= still gets containers — not an empty list', () => {
    // The regression: an empty `gtm` object means aGTM has nothing to inject.
    const r = runClient({ data: { ...BASE }, query: {} });
    expect(r.throws).toBeNull();
    const g = containers(r.body);
    expect(Object.keys(g).sort()).toEqual(['GTM-AAA', 'GTM-BBB']);
  });
});

describe('gtm_id_match on', () => {
  test('only the requested container is served', () => {
    const r = runClient({ data: { ...BASE, gtm_id_match: true }, query: { id: 'GTM-AAA' } });
    expect(r.throws).toBeNull();
    expect(Object.keys(containers(r.body))).toEqual(['GTM-AAA']);
  });

  test('without ?id= nothing matches — and the Client says so', () => {
    // Deliberately kept as the v1.4 semantics: filtering on an absent id yields
    // nothing. That is a configuration mistake, so it warns instead of silently
    // serving a library that can never inject.
    const r = runClient({ data: { ...BASE, gtm_id_match: true }, query: {} });
    expect(r.throws).toBeNull();
    expect(containers(r.body)).toEqual({});
    expect(r.logs.join(' ')).toContain('no ?id=');
  });
});

describe('per-container options survive the selection', () => {
  test('noConsent, env and gtmURL are carried through for each container', () => {
    const r = runClient({
      data: {
        ...BASE,
        gtm: [
          { gtm_id: 'GTM-AAA', gtm_consent: false },
          { gtm_id: 'GTM-BBB', gtm_consent: true, gtm_env: '&gtm_auth=x', gtm_url: 'https://sgtm.example/gtm.js' }
        ]
      },
      query: {}
    });
    const g = containers(r.body);
    expect(g['GTM-AAA'].noConsent).toBe(true);
    expect(g['GTM-BBB'].noConsent).toBeUndefined();
    expect(g['GTM-BBB'].env).toBe('&gtm_auth=x');
    expect(g['GTM-BBB'].gtmURL).toBe('https://sgtm.example/gtm.js');
  });
});

describe('the ?id= validation gate is unchanged', () => {
  test('an id that is not configured at all is still refused', () => {
    const r = runClient({ data: { ...BASE }, query: { id: 'GTM-NOPE' } });
    expect(r.returned).toBe(false);
    expect(r.logs.join(' ')).toContain('No matching GTM ID');
  });
});
