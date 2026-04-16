// test/session_fetch.test.js — tests for aGTM.f.session_fetch()
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resetAGTM, MockXHR } from './helpers.js';

describe('aGTM.f.session_fetch()', () => {
  beforeEach(() => {
    MockXHR.install();
  });

  afterEach(() => {
    MockXHR.reset();
  });

  // ── Feature activation ────────────────────────────────────────────────────

  test('sets session_ready=true immediately when user_id is missing', () => {
    resetAGTM({ session_url: 'http://example.com/session' });
    aGTM.f.session_fetch();
    expect(aGTM.d.session_ready).toBe(true);
    expect(MockXHR.instances.length).toBe(0);
  });

  test('sets session_ready=true immediately when session_url is missing', () => {
    resetAGTM({ user_id: 'u-123' });
    aGTM.f.session_fetch();
    expect(aGTM.d.session_ready).toBe(true);
    expect(MockXHR.instances.length).toBe(0);
  });

  test('sets session_ready=true immediately when both configs are missing', () => {
    resetAGTM();
    aGTM.f.session_fetch();
    expect(aGTM.d.session_ready).toBe(true);
  });

  // ── Valid response ────────────────────────────────────────────────────────

  test('stores full response in aGTM.d.session', () => {
    resetAGTM({ user_id: 'u-123', session_url: 'http://example.com/session' });
    aGTM.f.session_fetch();
    MockXHR.last.respond(200, { sid: 's-abc', uid: 'u-123', ret: false, cst: true, vct: 3 });
    expect(aGTM.d.session.sid).toBe('s-abc');
    expect(aGTM.d.session.uid).toBe('u-123');
    expect(aGTM.d.session.vct).toBe(3);
  });

  test('sets session_ready=true after valid response', () => {
    resetAGTM({ user_id: 'u-123', session_url: 'http://example.com/session' });
    aGTM.f.session_fetch();
    MockXHR.last.respond(200, { sid: 's-abc' });
    expect(aGTM.d.session_ready).toBe(true);
  });

  test('sets session_ready=true but leaves session empty when sid is missing', () => {
    resetAGTM({ user_id: 'u-123', session_url: 'http://example.com/session' });
    aGTM.f.session_fetch();
    MockXHR.last.respond(200, { uid: 'u-123' }); // no sid
    expect(aGTM.d.session_ready).toBe(true);
    expect(aGTM.d.session.sid).toBeUndefined();
  });

  test('sets session_ready=true when server returns non-2xx', () => {
    resetAGTM({ user_id: 'u-123', session_url: 'http://example.com/session' });
    aGTM.f.session_fetch();
    MockXHR.last.respond(500, 'error');
    expect(aGTM.d.session_ready).toBe(true);
    expect(aGTM.d.session.sid).toBeUndefined();
  });

  // ── Auto-denial ───────────────────────────────────────────────────────────

  test('applies auto-denial when ret=true and cst=false (session_gtm_on_deny=true default)', () => {
    resetAGTM({ user_id: 'u-123', session_url: 'http://example.com/session' });
    aGTM.f.session_fetch();
    MockXHR.last.respond(200, { sid: 's1', ret: true, cst: false });
    expect(aGTM.d.consent.hasResponse).toBe(true);
    expect(aGTM.d.consent.feedback).toBe('Consent denied by aGTM');
    expect(aGTM.d.consent.services).toBe(',aGTMconsent,');
    expect(aGTM.d.consent.gtmConsent).toBe(true);  // session_gtm_on_deny defaults to true
    expect(aGTM.d.consent.blocked).toBe(true);
  });

  test('auto-denial sets gtmConsent=false when session_gtm_on_deny=false', () => {
    resetAGTM({ user_id: 'u-123', session_url: 'http://example.com/session', session_gtm_on_deny: false });
    aGTM.f.session_fetch();
    MockXHR.last.respond(200, { sid: 's1', ret: true, cst: false });
    expect(aGTM.d.consent.gtmConsent).toBe(false);
    expect(aGTM.d.consent.blocked).toBe(false);
  });

  test('does NOT apply auto-denial when hasResponse is already true', () => {
    resetAGTM({ user_id: 'u-123', session_url: 'http://example.com/session' });
    aGTM.d.consent.hasResponse = true;
    aGTM.d.consent.feedback = 'real CMP decision';
    aGTM.f.session_fetch();
    MockXHR.last.respond(200, { sid: 's1', ret: true, cst: false });
    expect(aGTM.d.consent.feedback).toBe('real CMP decision'); // not overwritten
  });

  test('does NOT apply auto-denial when ret=false', () => {
    resetAGTM({ user_id: 'u-123', session_url: 'http://example.com/session' });
    aGTM.f.session_fetch();
    MockXHR.last.respond(200, { sid: 's1', ret: false, cst: false });
    expect(aGTM.d.consent.hasResponse).toBeFalsy();
  });

  test('does NOT apply auto-denial when cst=true', () => {
    resetAGTM({ user_id: 'u-123', session_url: 'http://example.com/session' });
    aGTM.f.session_fetch();
    MockXHR.last.respond(200, { sid: 's1', ret: true, cst: true });
    expect(aGTM.d.consent.hasResponse).toBeFalsy();
  });

  // ── Timeout ───────────────────────────────────────────────────────────────

  test('sets session_ready=true and aborts XHR after timeout', async () => {
    resetAGTM({ user_id: 'u-123', session_url: 'http://example.com/session', session_timeout: 50 });
    aGTM.f.session_fetch();
    expect(aGTM.d.session_ready).toBe(false); // not yet
    await new Promise(r => setTimeout(r, 80));
    expect(aGTM.d.session_ready).toBe(true);
    expect(MockXHR.last._aborted).toBe(true);
    expect(Object.keys(aGTM.d.session).length).toBe(0); // no data stored
  });

  test('ignores late XHR response that arrives after timeout', async () => {
    resetAGTM({ user_id: 'u-123', session_url: 'http://example.com/session', session_timeout: 50 });
    aGTM.f.session_fetch();
    const xhr = MockXHR.last;
    await new Promise(r => setTimeout(r, 80)); // let timeout fire
    xhr.respond(200, { sid: 'too-late' });      // arrives after timeout
    expect(aGTM.d.session.sid).toBeUndefined(); // must not be stored
  });

  // ── Request content ───────────────────────────────────────────────────────

  test('sends user_id, url and ref in request payload (unencrypted)', () => {
    resetAGTM({ user_id: 'u-42', session_url: 'http://example.com/session', session_salt: 0 });
    globalThis.document.referrer = 'http://google.com/';
    aGTM.f.session_fetch();
    const body = JSON.parse(MockXHR.last._body);
    expect(body.e.user_id).toBe('u-42');
    expect(body.e.url).toBe('http://localhost/test');
    expect(body.e.ref).toBe('http://google.com/');
    globalThis.document.referrer = '';
  });

  test('sends encrypted payload when session_salt>=1', () => {
    resetAGTM({ user_id: 'u-42', session_url: 'http://example.com/session', session_salt: 7 });
    aGTM.f.session_fetch();
    const body = JSON.parse(MockXHR.last._body);
    expect(body.q).toBeDefined();   // encrypted
    expect(body.e).toBeUndefined();
  });
});
