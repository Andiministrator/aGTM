// test/sgtm/client-harness.js — runs the REAL sGTM Client source against
// stubbed GTM server APIs. Shared by every test that needs to observe what a
// serve path actually DOES, not just what the source text looks like.
//
// Why this exists as its own genre: the other Client tests are either
// structural (grep the source) or extract one pure function. Neither can catch
// an ordering bug, and one was hiding in plain sight — `buildAndSend` was
// declared at the end of the file while every SYNCHRONOUS path reached it
// first. A `const` function expression referenced before its declaration is a
// temporal-dead-zone error, so /aGTM.js died for any config without a Session
// API. It survived because the async path (Session API configured, as at the
// live customer) masked it, and because finding F-44 had recorded the forward
// reference as "deliberate" rather than as a defect.
//
// Why it is a shared module rather than a copy per test file: the stubs below
// are not scaffolding, they are a written-down contract. Two copies drift, and
// a drifted harness reports green for code that would die in the sandbox —
// the same failure class as the embedded CMP codes in F-52.
//
// The stubs mirror three server-sandbox CONTRACTS that Node gets wrong:
// JSON.parse returns undefined instead of throwing, sendHttpGet resolves for
// any completed response (including 4xx/5xx), and returnResponse() makes later
// writes moot. A throw here means a dead response there.
//
// What this does NOT cover: the sandbox's LANGUAGE restrictions. Node happily
// runs try/catch, parseInt, Array.isArray and `'k' in obj`, all of which the
// sandbox rejects — a QA round mutated each of them in and watched the suite
// stay green. Those are linted separately in sandbox-lint.test.js. Do not read
// a green run here as "this would work in GTM".
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = readFileSync(
  join(import.meta.dir, '..', '..', 'sgtmClient/src/aGTM-sGTM-Client-jsSourceCode.js'), 'utf8'
);

/**
 * Execute the Client source once.
 * @param opts.data        the template field values (GTM's `data` object)
 * @param opts.path        request path (default '/aGTM.js')
 * @param opts.method      request method (default 'GET')
 * @param opts.reqBody     request body (for the /aGTMconsent POST handler)
 * @param opts.query       request query parameters
 * @param opts.http        (url, body) => {statusCode, body} | null to reject
 * @param opts.cookies     what getCookieValues(name) returns. Two forms:
 *                      - array of strings: returned for EVERY name asked for.
 *                        The original form, kept because most tests only ever
 *                        deal with one cookie and do not care about the name.
 *                      - array of {name, value}: filtered by the requested
 *                        name. Needed as soon as the Client reads more than one
 *                        name — e.g. the legacy user-id cookies it still reads
 *                        after the _TPU -> _tpf default correction. With the flat form
 *                        such a lookup can never miss, so the fallback chain
 *                        would look correct in a test and be untested.
 * @param opts.clientIP    remote address
 * @returns {{status, body, headers, claimed, returned, logs, cookies, throws}}
 *          `cookies` records every setCookie() call as {name, val, maxAge} in
 *          order. Recorded rather than stubbed away because the one thing the
 *          Client writes into the visitor's browser was, until F-153, the one
 *          thing no test could see.
 */
export function runClient(opts = {}) {
  const state = { status: 200, body: '', headers: {}, claimed: false, returned: false, logs: [], cookies: [] };
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
    sendHttpRequest: (url, o, body) => thenable(() => httpFn(url, body)),
    getRequestHeader: (h) => (opts.headers || {})[h] || '',
    getRemoteAddress: () => (opts.clientIP === undefined ? '203.0.113.7' : opts.clientIP),
    getCookieValues: (name) => {
      const list = opts.cookies || [];
      if (list.length > 0 && typeof list[0] === 'object' && list[0] !== null) {
        return list.filter((c) => c.name === name).map((c) => c.value);
      }
      // Flat form: the values belong to the USER-ID cookie, i.e. the name the
      // config asks for (or the default). Returning them for every name asked
      // was the original behaviour and it lied — once the Client started
      // reading legacy names too, every flat-form test suddenly had a legacy
      // cookie it never declared, and the Client dutifully retired it.
      const uidName = (opts.data && opts.data.cookie_name) || '_tpf';
      return name === uidName ? list : [];
    },
    setCookie: (name, val, o) => { state.cookies.push({ name: name, val: val, maxAge: o && o['max-age'] }); },
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
    // The sandbox's Object API is a require(), not the language built-in — the
    // Client uses it to enumerate the request's query parameters.
    Object: { keys: Object.keys, values: Object.values, entries: Object.entries, freeze: Object.freeze },
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

/** Cookie writes only — a delete is max-age 0 and is not a write. */
export function cookiesWritten(r) {
  return r.cookies.filter((c) => c.maxAge !== 0);
}

/** Cookie deletes only. */
export function cookiesDeleted(r) {
  return r.cookies.filter((c) => c.maxAge === 0);
}
