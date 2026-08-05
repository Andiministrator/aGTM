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
  test('noConsent and gtmURL are carried through for each container', () => {
    const r = runClient({
      data: {
        ...BASE,
        gtm: [
          { gtm_id: 'GTM-AAA', gtm_consent: false },
          { gtm_id: 'GTM-BBB', gtm_consent: true, gtm_url: 'https://sgtm.example/gtm.js' }
        ]
      },
      query: {}
    });
    const g = containers(r.body);
    expect(g['GTM-AAA'].noConsent).toBe(true);
    expect(g['GTM-BBB'].noConsent).toBeUndefined();
    expect(g['GTM-BBB'].gtmURL).toBe('https://sgtm.example/gtm.js');
  });
});

// The "URL Parameters" column (`gtm_use`) — what ends up appended to the
// container URL. This block replaces an assertion that read `gtm_env` off the
// container row and expected it back on `env`: a column by that name exists
// NOWHERE in the template, so the test described a field that could not be
// configured and passed no matter what the Client did with the real one. Same
// blindness as the single-container fixture two describes above.
const ENVQ = { id: 'GTM-AAA', gtm_auth: 'ABC123xyz', gtm_preview: 'env-1', gtm_cookies_win: 'x' };

/** The single container's options for one row/query combination. */
function envRow(row, query = ENVQ, base = {}) {
  const r = runClient({
    data: { cookie_mode: 'always', gtm: [{ gtm_id: 'GTM-AAA', gtm_consent: true, ...row }], ...base },
    query
  });
  expect(r.throws).toBeNull();
  return { opts: containers(r.body)['GTM-AAA'], logs: r.logs.join(' ') };
}

describe('URL Parameters column: the fixed options', () => {
  test('"env" appends exactly the three GTM environment parameters', () => {
    expect(envRow({ gtm_use: 'env' }).opts.env).toBe('&gtm_auth=ABC123xyz&gtm_preview=env-1&gtm_cookies_win=x');
  });

  test('"env" without any of them in the URL sets no env key at all', () => {
    // Not an empty string: the library appends `o.env` verbatim, so an absent
    // key and an empty value differ only by luck.
    expect(envRow({ gtm_use: 'env' }, { id: 'GTM-AAA' }).opts.env).toBeUndefined();
  });

  test('"all" forwards every parameter except aGTM\'s own id and c', () => {
    const q = { id: 'GTM-AAA', c: 'eyJ1IjoiIn0=', gtm_auth: 'ABC', foo: 'bar' };
    expect(envRow({ gtm_use: 'all' }, q).opts.env).toBe('&gtm_auth=ABC&foo=bar');
  });

  test('"all" encodes values, so a parameter cannot inject more parameters', () => {
    expect(envRow({ gtm_use: 'all' }, { id: 'GTM-AAA', x: 'a&b=c d' }).opts.env).toBe('&x=a%26b%3Dc%20d');
  });

  test('"custom" takes the column value and ignores the request', () => {
    expect(envRow({ gtm_use: 'custom', gtm_param: 'gtm_auth=FIXED' }).opts.env).toBe('&gtm_auth=FIXED');
  });

  test('"custom" normalises a leading ? or & to exactly one &', () => {
    expect(envRow({ gtm_use: 'custom', gtm_param: '?a=1' }).opts.env).toBe('&a=1');
    expect(envRow({ gtm_use: 'custom', gtm_param: '&a=1' }).opts.env).toBe('&a=1');
  });

  test('"no" appends nothing even when the URL carries env parameters', () => {
    expect(envRow({ gtm_use: 'no' }).opts.env).toBeUndefined();
  });

  test('an unset column appends nothing', () => {
    expect(envRow({}).opts.env).toBeUndefined();
  });
});

describe('URL Parameters column: repeated parameters', () => {
  test('a repeated parameter is reproduced in full, in order', () => {
    // It arrives as an array. Dropping it would silently lose an env setting;
    // taking "the first" would invent a rule the caller never agreed to.
    const q = { id: 'GTM-AAA', dup: ['1', '2'], ok: '1' };
    expect(envRow({ gtm_use: 'all' }, q).opts.env).toBe('&dup=1&dup=2&ok=1');
  });

  test('non-string members are skipped without losing the rest', () => {
    const q = { id: 'GTM-AAA', d: ['a', null, 42, 'b'] };
    expect(envRow({ gtm_use: 'all' }, q).opts.env).toBe('&d=a&d=b');
  });

  test('repetition is capped, and the cap bounds the loop rather than the output', () => {
    const many = [];
    for (let i = 0; i < 40; i++) many.push('v' + i);
    const r = envRow({ gtm_use: 'all' }, { id: 'GTM-AAA', r: many });
    expect((r.opts.env.match(/&r=/g) || []).length).toBe(10);
    expect(r.logs).toContain('repeated more than');
  });

  test('the total length is budgeted, and never cut inside a parameter', () => {
    const flood = { id: 'GTM-AAA' };
    for (let i = 0; i < 60; i++) flood['p' + i] = 'x'.repeat(40);
    const r = envRow({ gtm_use: 'all' }, flood);
    expect(r.opts.env.length).toBeLessThanOrEqual(1000);
    expect(r.opts.env).toMatch(/^(&[^&=]+=[^&]*)+$/);
    expect(r.logs).toContain('exceed');
  });
});

describe('URL Parameters column: the value may come from a variable', () => {
  test('a resolved value that is none of the options falls back to Custom', () => {
    const r = envRow({ gtm_use: 'whatever-a-variable-returned', gtm_param: 'gtm_auth=FROMVAR' });
    expect(r.opts.env).toBe('&gtm_auth=FROMVAR');
  });

  test('...and that fallback is logged, so a broken variable is visible', () => {
    // A renamed or failing variable would otherwise change which GTM
    // environment a container loads without leaving a trace anywhere.
    expect(envRow({ gtm_use: 'whatever', gtm_param: 'a=1' }).logs).toContain('Unknown value');
  });

  test('an EMPTY resolved value means "not configured", not "custom"', () => {
    // The distinction that matters: '' / undefined / null / false is what an
    // untouched row looks like. Treating it as custom would append parameters
    // to rows nobody configured.
    const param = 'gtm_auth=MUST_NOT_APPEAR';
    for (const empty of ['', undefined, null, false]) {
      const r = envRow({ gtm_use: empty, gtm_param: param });
      expect(r.opts.env).toBeUndefined();
      expect(r.logs).not.toContain('Unknown value');
    }
  });

  test('a stored boolean true is the former "yes" and still means env', () => {
    expect(envRow({ gtm_use: true }).opts.env).toBe('&gtm_auth=ABC123xyz&gtm_preview=env-1&gtm_cookies_win=x');
  });

  test('a non-string Custom value cannot break the response', () => {
    const r = envRow({ gtm_use: 'custom', gtm_param: { nope: true } });
    expect(r.opts.env).toBeUndefined();
  });

  test('each row decides for itself', () => {
    const r = runClient({
      data: {
        cookie_mode: 'always',
        gtm: [
          { gtm_id: 'GTM-AAA', gtm_consent: true, gtm_use: 'env' },
          { gtm_id: 'GTM-BBB', gtm_consent: true, gtm_use: 'custom', gtm_param: 'a=1' },
          { gtm_id: 'GTM-CCC', gtm_consent: true, gtm_use: 'no' }
        ]
      },
      query: ENVQ
    });
    const g = containers(r.body);
    expect(g['GTM-AAA'].env).toBe('&gtm_auth=ABC123xyz&gtm_preview=env-1&gtm_cookies_win=x');
    expect(g['GTM-BBB'].env).toBe('&a=1');
    expect(g['GTM-CCC'].env).toBeUndefined();
  });
});

describe('the ?id= validation gate is unchanged', () => {
  test('an id that is not configured at all is still refused', () => {
    const r = runClient({ data: { ...BASE }, query: { id: 'GTM-NOPE' } });
    expect(r.returned).toBe(false);
    expect(r.logs.join(' ')).toContain('No matching GTM ID');
  });
});
