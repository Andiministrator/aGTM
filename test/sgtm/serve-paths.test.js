// test/sgtm/serve-paths.test.js — asserts that each serve path of the sGTM
// Client produces a response, and that the bot check behaves as specified.
//
// The harness that runs the real Client source against stubbed GTM server APIs
// lives in ./client-harness.js — see there for why the stubs look the way they
// do and what they deliberately do NOT model.
import { describe, test, expect } from 'bun:test';
import { runClient } from './client-harness.js';

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
