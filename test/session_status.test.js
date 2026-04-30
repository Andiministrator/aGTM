// test/session_status.test.js — tests for aGTM.d.session_status lifecycle
// New lifecycle (Phase 2): "" → "preset" after config() when cfg.session is supplied.
// "preset_with_consent", "synced", "confirmed" land in Phase 3 (consent diff/store).
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resetAGTM, MockXHR } from './helpers.js';

describe('aGTM.d.session_status', () => {
  beforeEach(() => {
    MockXHR.install();
  });

  afterEach(() => {
    MockXHR.reset();
  });

  test('is empty string when no cfg.session is supplied', () => {
    resetAGTM();
    expect(aGTM.d.session_status).toBe('');
  });

  test('is "preset" when cfg.session has a sid', () => {
    resetAGTM({ session: { sid: 's-123' } });
    expect(aGTM.d.session_status).toBe('preset');
  });

  test('is "preset" when cfg.session has uid+sid', () => {
    resetAGTM({ session: { sid: 's-123', uid: 'u-1' } });
    expect(aGTM.d.session_status).toBe('preset');
  });

  test('is "preset_with_consent" when cfg.session carries a valid consent object (sid optional)', () => {
    resetAGTM({ session: { consent: { hasResponse: true, services: ',svc1,' } } });
    expect(aGTM.d.session_status).toBe('preset_with_consent');
  });

  test('is "preset" when cfg.session has sid but consent is malformed (missing hasResponse)', () => {
    resetAGTM({ session: { sid: 's-1', consent: { services: ',svc1,' } } });
    expect(aGTM.d.session_status).toBe('preset');
  });

  test('stays empty when cfg.session is missing both sid and consent', () => {
    resetAGTM({ session: { uid: 'u-1' } }); // uid alone is no longer enough
    expect(aGTM.d.session_status).toBe('');
  });

  test('stays empty when cfg.session is not an object', () => {
    resetAGTM({ session: 'invalid' });
    expect(aGTM.d.session_status).toBe('');
  });
});
