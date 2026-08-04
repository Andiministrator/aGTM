// test/sgtm/version-header.test.js — the Client must tell a live container which
// version it is running.
//
// Why this exists: the v1.4.3pre Client sent `x-agtm-version` on every /aGTM.js
// response; the v1.5 single-session refactor dropped the call but kept the
// `const aGTMversion` declaration, leaving a constant nobody read. It surfaced
// on 2026-08-04, when reconstructing which build a tenant actually ran turned
// out to be impossible from the outside — the container serves the same URL for
// every version. The build script did not sync that constant either, so a bump
// would have moved the template's displayName while the header (once restored)
// kept reporting the previous release. Both halves are guarded here.
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runClient } from './client-harness.js';

const ROOT = join(import.meta.dir, '..', '..');
const BASE = { gtm: [{ gtm_id: 'GTM-TEST', gtm_consent: true }], cookie_mode: 'always' };
const botData = (extra) => ({
  ...BASE, botCheckEnabled: true, botCheck: 'https://filter.example/tp/filter/t', ...extra
});

/** The version the whole build is cut from. */
function libVersion() {
  return readFileSync(join(ROOT, 'VERSION'), 'utf8').trim();
}

describe('x-agtm-version response header', () => {
  test('the normal serve path sends it', () => {
    const r = runClient({ data: { ...BASE } });
    expect(r.throws).toBeNull();
    expect(r.status).toBe(200);
    expect(r.headers['x-agtm-version']).toBe(libVersion());
  });

  test('a blocked bot still learns which version blocked it', () => {
    const r = runClient({
      data: botData({ botCheckMode: 'block' }),
      http: () => ({ statusCode: 403, body: '{"isBot":true,"score":100,"band":"bot","primarySignal":"known_bot"}' })
    });
    expect(r.throws).toBeNull();
    expect(r.status).toBe(403);
    expect(r.headers['x-agtm-version']).toBe(libVersion());
  });

  test('the missing-client-IP block sends it too', () => {
    const r = runClient({ data: botData({ botCheckMode: 'block' }), clientIP: '' });
    expect(r.throws).toBeNull();
    expect(r.status).toBe(403);
    expect(r.headers['x-agtm-version']).toBe(libVersion());
  });
});

describe('the consent endpoint identifies itself too', () => {
  // A network capture of a consent problem often contains ONLY this exchange,
  // and the 501 body is literally a statement about what this version supports.
  const consentPost = (data, opts) => runClient({
    data: { gtm: [{ gtm_id: 'GTM-TEST', gtm_consent: true }], cookie_name: 'aGTMuid', cookie_mode: 'consent', tenant_id: 't', ...data },
    path: '/aGTMconsent',
    method: 'POST',
    reqBody: JSON.stringify({ uid: 'C.1.abc', sid: 's1', consent: { services: ',analytics,' } }),
    ...opts
  });

  test('the 200 carries the version', () => {
    const r = consentPost({});
    expect(r.returned).toBe(true);
    expect(r.headers['x-agtm-version']).toBe(libVersion());
  });

  test('the "not supported" 501 says which version does not support it', () => {
    const r = runClient({
      data: { gtm: [{ gtm_id: 'GTM-TEST', gtm_consent: true }], cookie_name: 'aGTMuid', tenant_id: 't' },
      path: '/aGTMconsent',
      method: 'POST',
      reqBody: JSON.stringify({ q: 'encrypted-payload' })
    });
    expect(r.status).toBe(501);
    expect(r.headers['x-agtm-version']).toBe(libVersion());
  });
});

describe('the served library declares its encoding', () => {
  test('Content-Type carries charset=utf-8', () => {
    // Without it a classic <script src> inherits the DOCUMENT's encoding, and the
    // body embeds JSON (page URL, inline CMP code) that may be non-ASCII.
    const r = runClient({ data: { ...BASE } });
    expect(r.headers['Content-Type']).toBe('text/javascript; charset=utf-8');
  });
});

describe('the version constant does not drift', () => {
  // Both files carry the constant, and ./build.sh rewrites it in both. A stale
  // value here means the header lies — the one failure mode that makes the
  // header worse than not having it.
  const files = [
    ['sgtmClient/template.tpl', 'template'],
    ['sgtmClient/src/aGTM-sGTM-Client-jsSourceCode.js', 'client source']
  ];

  for (const [path, label] of files) {
    test(`${label} declares the current version`, () => {
      const src = readFileSync(join(ROOT, path), 'utf8');
      const m = src.match(/const aGTMversion = "([\d.a-zA-Z-]+)";/);
      expect(m).not.toBeNull();
      expect(m[1]).toBe(libVersion());
    });
  }

  test('the constant is actually read, not just declared', () => {
    const src = readFileSync(join(ROOT, 'sgtmClient/template.tpl'), 'utf8');
    const uses = src.match(/setResponseHeader\('x-agtm-version', aGTMversion\)/g) || [];
    // At least the three /aGTM.js paths (200, bot 403, missing-IP 403); the two
    // /aGTMconsent paths carry it too. Deliberately a lower bound — pinning the
    // exact count would turn "someone added the header to another response" into
    // a red test that says nothing about the thing this guards: that the constant
    // is read at all.
    expect(uses.length).toBeGreaterThanOrEqual(3);
  });
});
