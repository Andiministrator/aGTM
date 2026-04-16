// test/session_status.test.js — tests for aGTM.d.session_status
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resetAGTM, MockXHR } from './helpers.js';

describe('aGTM.d.session_status', () => {
  beforeEach(() => {
    MockXHR.install();
  });

  afterEach(() => {
    MockXHR.reset();
  });

  test('is "inactive" when user_id is missing', () => {
    resetAGTM({ session_url: 'http://example.com/session' });
    aGTM.f.session_fetch();
    expect(aGTM.d.session_status).toBe('inactive');
  });

  test('is "inactive" when session_url is missing', () => {
    resetAGTM({ user_id: 'u-1' });
    aGTM.f.session_fetch();
    expect(aGTM.d.session_status).toBe('inactive');
  });

  test('is "ok" after a valid response with sid', () => {
    resetAGTM({ user_id: 'u-1', session_url: 'http://example.com/session' });
    aGTM.f.session_fetch();
    MockXHR.last.respond(200, { sid: 's-123' });
    expect(aGTM.d.session_status).toBe('ok');
  });

  test('is "invalid" when response has no sid', () => {
    resetAGTM({ user_id: 'u-1', session_url: 'http://example.com/session' });
    aGTM.f.session_fetch();
    MockXHR.last.respond(200, { uid: 'u-1' }); // missing sid
    expect(aGTM.d.session_status).toBe('invalid');
  });

  test('is "error" when server returns non-2xx (callback receives null)', () => {
    resetAGTM({ user_id: 'u-1', session_url: 'http://example.com/session' });
    aGTM.f.session_fetch();
    MockXHR.last.respond(500, 'Internal Server Error');
    expect(aGTM.d.session_status).toBe('error');
  });

  test('is "timeout" after session_timeout elapses', async () => {
    resetAGTM({ user_id: 'u-1', session_url: 'http://example.com/session', session_timeout: 50 });
    aGTM.f.session_fetch();
    expect(aGTM.d.session_status).toBe('');  // not yet
    await new Promise(r => setTimeout(r, 80));
    expect(aGTM.d.session_status).toBe('timeout');
  });

  test('is empty string on init (before session_fetch runs)', () => {
    resetAGTM();
    expect(aGTM.d.session_status).toBe('');
  });
});
