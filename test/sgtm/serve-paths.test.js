// test/sgtm/serve-paths.test.js — runs the REAL sGTM Client source against
// stubbed GTM server APIs and asserts that each serve path produces a response.
//
// Why this exists as its own genre: every other Client test in this repo is
// either structural (grep the source) or extracts one pure function. Neither
// can catch an ordering bug, and one was hiding in plain sight — `buildAndSend`
// was declared at the end of the file while every SYNCHRONOUS path reached it
// first. A `const` function expression referenced before its declaration is a
// temporal-dead-zone error, so /aGTM.js died for any config without a Session
// API. It survived because the async path (Session API configured, as at the
// live customer) masked it, and because finding F-44 had recorded the forward
// reference as "deliberate" rather than as a defect.
//
// The stubs mirror three server-sandbox CONTRACTS that Node gets wrong:
// JSON.parse returns undefined instead of throwing, sendHttpGet resolves for
// any completed response (including 4xx/5xx), and returnResponse() makes later
// writes moot. A throw here means a dead response there.
//
// What this file does NOT cover: the sandbox's LANGUAGE restrictions. Node
// happily runs try/catch, parseInt, Array.isArray and `'k' in obj`, all of which
// the sandbox rejects — a QA round mutated each of them in and watched the suite
// stay green. Those are linted separately in sandbox-lint.test.js. Do not read
// a green run here as "this would work in GTM".
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = readFileSync(
  join(import.meta.dir, '..', '..', 'sgtmClient/src/aGTM-sGTM-Client-jsSourceCode.js'), 'utf8'
);

/**
 * Execute the Client source once.
 * @param opts.data        the template field values (GTM's `data` object)
 * @param opts.path        request path (default '/aGTM.js')
 * @param opts.query       request query parameters
 * @param opts.http        (url) => {statusCode, body} | null to reject
 * @param opts.clientIP    remote address
 * @returns {{status, body, claimed, logs, throws}}
 */
function runClient(opts = {}) {
  const state = { status: 200, body: '', headers: {}, claimed: false, returned: false, logs: [] };
  const data = opts.data || {};
  const query = opts.query || { id: 'GTM-TEST' };
  const httpFn = opts.http || (() => ({ statusCode: 200, body: '{}' }));

  // Deferred callbacks, drained after the synchronous run — the sandbox's
  // promises resolve on a later tick, and the ordering is what we test.
  const pending = [];
  const thenable = (producer) => ({
    then: function (onOk, onErr) {
      pending.push(() => {
        const r = producer();
        if (r === null) { if (onErr) onErr(new Error('network')); }
        else if (onOk) onOk(r);
      });
      return this;
    }
  });

  const api = {
    claimRequest: () => { state.claimed = true; },
    // After returnResponse() the response is on the wire — later writes are
    // moot. Modelling that matters: the sandbox does not stop execution there,
    // so without it a blocked request would still "receive" the library body
    // that a later code path writes.
    setResponseStatus: (s) => { if (!state.returned) state.status = s; },
    setResponseHeader: (k, v) => { if (!state.returned) state.headers[k] = v; },
    setResponseBody: (b) => { if (!state.returned) state.body = b; },
    returnResponse: () => { state.returned = true; },
    getRequestPath: () => (opts.path === undefined ? '/aGTM.js' : opts.path),
    getRequestMethod: () => opts.method || 'GET',
    getRequestQueryParameters: () => query,
    getRequestBody: () => opts.reqBody || '',
    sendHttpGet: (url) => thenable(() => httpFn(url)),
    sendHttpRequest: (url) => thenable(() => httpFn(url)),
    getRequestHeader: (h) => (opts.headers || {})[h] || '',
    getRemoteAddress: () => (opts.clientIP === undefined ? '203.0.113.7' : opts.clientIP),
    getCookieValues: () => opts.cookies || [],
    setCookie: () => {},
    fromBase64: (s) => Buffer.from(s, 'base64').toString('utf8'),
    toBase64: (s) => Buffer.from(s, 'utf8').toString('base64'),
    sha256Sync: (s) => 'sha_' + String(s).length,
    generateRandom: (min, max) => min,
    getTimestampMillis: () => 1785230523000,
    makeInteger: (v) => parseInt(v, 10) || 0,
    makeNumber: (v) => Number(v) || 0,
    makeString: (v) => String(v),
    logToConsole: (...a) => { state.logs.push(a.join(' ')); },
    // Sandbox contract: undefined instead of throwing.
    JSON: { parse: (s) => { try { return JSON.parse(s); } catch (e) { return undefined; } }, stringify: JSON.stringify },
    Math: Math,
    encodeUriComponent: encodeURIComponent,
    decodeUriComponent: decodeURIComponent
  };

  const requireStub = (name) => {
    if (!(name in api)) throw new Error('unstubbed require(): ' + name);
    return api[name];
  };

  const names = ['require', 'data', 'JSON', 'Math', 'encodeUriComponent', 'decodeUriComponent'];
  const values = [requireStub, data, api.JSON, Math, encodeURIComponent, decodeURIComponent];

  try {
    // The source is a top-level script that may `return` early — wrap it.
    new Function(...names, '(function(){\n' + SRC + '\n})();')(...values);
    let guard = 0;
    while (pending.length && guard++ < 50) pending.shift()();
  } catch (e) {
    return { ...state, throws: e };
  }
  return { ...state, throws: null };
}

const BASE = { gtm: [{ gtm_id: 'GTM-TEST', gtm_consent: true }], cookie_mode: 'always' };

/** The JSON argument of the injected aGTM.f.config(...) call. */
function configArg(body) {
  const i = body.indexOf('aGTM.f.config(');
  if (i < 0) return '';
  return body.slice(i);
}

describe('synchronous serve paths reach a response', () => {
  test('default config: no Session API, no bot check, no sources', () => {
    // The default of a freshly created tag. This is the exact configuration the
    // forward-reference bug killed.
    const r = runClient({ data: { ...BASE } });
    expect(r.throws).toBeNull();
    expect(r.returned).toBe(true);
    expect(r.body).toContain('aGTM.f.config(');
  });

  test('Session API configured but no resolvable user id (fingerprinting off, no cookie)', () => {
    const r = runClient({
      data: { ...BASE, session_api_url: 'https://api.example/tp/session', tenant_id: 't', fingerprint_allowed: false },
      cookies: []
    });
    expect(r.throws).toBeNull();
    expect(r.returned).toBe(true);
  });

  test('async path: Session API answers', () => {
    const r = runClient({
      data: { ...BASE, session_api_url: 'https://api.example/tp/session', tenant_id: 't' },
      http: () => ({ statusCode: 200, body: JSON.stringify({ sessionId: 's1', counter: 2, sessionCount: 9 }) })
    });
    expect(r.throws).toBeNull();
    expect(r.returned).toBe(true);
    expect(r.body).toContain('"sid":"s1"');
    expect(r.body).toContain('"sessionCount":9');
  });
});

describe('bot check end to end', () => {
  const botData = (extra) => ({
    ...BASE, botCheckEnabled: true, botCheck: 'https://filter.example/tp/filter/t', ...extra
  });

  test('block mode: a 403 + isBot:true body blocks (the F-127 regression)', () => {
    const r = runClient({
      data: botData({ botCheckMode: 'block' }),
      http: () => ({ statusCode: 403, body: '{"isBot":true,"score":100,"band":"bot","primarySignal":"known_bot"}' })
    });
    expect(r.throws).toBeNull();
    expect(r.status).toBe(403);
    expect(r.body).not.toContain('aGTM.f.config(');
  });

  test('mark mode: the same verdict is served and reported, not blocked', () => {
    const r = runClient({
      data: botData({ botCheckMode: 'mark' }),
      http: () => ({ statusCode: 403, body: '{"isBot":true,"score":100,"band":"bot","primarySignal":"known_bot"}' })
    });
    expect(r.throws).toBeNull();
    expect(r.status).toBe(200);
    expect(r.body).toContain('aGTM.f.config(');
    expect(r.body).toContain('"isBot":true');
    expect(r.body).toContain('"mode":"mark"');
  });

  test('mark mode does not block when the client IP is missing either', () => {
    // The branch that used to 403 unconditionally, contradicting the field's
    // own help text.
    const r = runClient({ data: botData({ botCheckMode: 'mark' }), clientIP: '' });
    expect(r.throws).toBeNull();
    expect(r.status).toBe(200);
    expect(r.body).toContain('aGTM.f.config(');
    expect(r.body).toContain('"band":"unknown"');
  });

  test('block mode still refuses a request without a client IP', () => {
    const r = runClient({ data: botData({ botCheckMode: 'block' }), clientIP: '' });
    expect(r.status).toBe(403);
  });

  test('a clean verdict is served and passed through', () => {
    const r = runClient({
      data: botData({}),
      http: () => ({ statusCode: 200, body: '{"isBot":false,"score":0,"band":"clean","signals":[],"primarySignal":null}' })
    });
    expect(r.throws).toBeNull();
    expect(r.status).toBe(200);
    expect(r.body).toContain('"isBot":false');
    expect(r.body).toContain('"band":"clean"');
  });

  test('a 5xx with a JSON error body is reported as an outage, not as clean', () => {
    const r = runClient({
      data: botData({}),
      http: () => ({ statusCode: 503, body: '{"error":"upstream down"}' })
    });
    expect(r.throws).toBeNull();
    expect(r.status).toBe(200);
    expect(r.body).toContain('"band":"unknown"');
  });

  test('a transport error is reported as an outage and never blocks', () => {
    const r = runClient({ data: botData({}), http: () => null });
    expect(r.throws).toBeNull();
    expect(r.status).toBe(200);
    expect(r.body).toContain('"band":"unknown"');
  });

  test('the passthrough can be switched off without switching off the filter', () => {
    const r = runClient({
      data: botData({ botCheckExpose: false }),
      http: () => ({ statusCode: 200, body: '{"isBot":false,"band":"clean"}' })
    });
    expect(r.throws).toBeNull();
    expect(r.status).toBe(200);
    expect(r.body).toContain('aGTM.f.config(');
    // Assert on the config payload, not the whole body — the embedded library
    // blob itself contains the string "bot" (objinit declares aGTM.d.bot).
    expect(configArg(r.body)).not.toContain('"bot"');
  });

  test('a hostile signals object cannot stall the response', () => {
    // Measure the DELTA against an identical run with a harmless body, not the
    // absolute time — most of runClient() is compiling ~100 KB of source, which
    // swamped the signal and let the missing bound pass unnoticed.
    const base = performance.now();
    runClient({ data: botData({}), http: () => ({ statusCode: 200, body: '{"isBot":false,"signals":[]}' }) });
    const baseline = performance.now() - base;

    const start = performance.now();
    const r = runClient({
      data: botData({}),
      http: () => ({ statusCode: 200, body: '{"isBot":false,"signals":{"length":50000000}}' })
    });
    const hostile = performance.now() - start;
    expect(r.throws).toBeNull();
    expect(r.status).toBe(200);
    // Without the `i < 50` bound this is ~100 ms of pure loop on top.
    expect(hostile - baseline).toBeLessThan(25);
  });
});
