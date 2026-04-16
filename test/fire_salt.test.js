// test/fire_salt.test.js — tests for POST salt fallback chain in aGTM.f.fire()
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resetAGTM, MockXHR } from './helpers.js';

describe('aGTM.f.fire() — POST salt fallback chain', () => {
  let capturedSalt;
  let origEnc;

  beforeEach(() => {
    MockXHR.install();
    resetAGTM();
    capturedSalt = null;

    // Patch enc() to capture the salt argument
    origEnc = aGTM.f.enc;
    aGTM.f.enc = function(str, salt) { capturedSalt = salt; return origEnc(str, salt); };

    // Minimal state: config applied, consent gates open, GTM already init'd
    aGTM.f.config({ transport_url: 'http://example.com/collect' });
    aGTM.d.consent = { hasResponse: true, gtmConsent: true };
    aGTM.d.init    = true;
    globalThis.dataLayer = [];
  });

  afterEach(() => {
    // Restore original enc()
    aGTM.f.enc = origEnc;
  });

  test('uses _post.salt when set (highest priority)', () => {
    aGTM.c.transport_salt = 10;
    aGTM.c.session_salt   = 20;
    aGTM.f.fire({ event: 'test', _post: { enc: true, salt: 5 } });
    expect(capturedSalt).toBe(5);
  });

  test('uses transport_salt when _post has no salt', () => {
    aGTM.c.transport_salt = 10;
    aGTM.c.session_salt   = 20;
    aGTM.f.fire({ event: 'test', _post: { enc: true } });
    expect(capturedSalt).toBe(10);
  });

  test('uses session_salt as fallback when transport_salt is 0', () => {
    aGTM.c.transport_salt = 0;
    aGTM.c.session_salt   = 20;
    aGTM.f.fire({ event: 'test', _post: { enc: true } });
    expect(capturedSalt).toBe(20);
  });

  test('uses session_salt as fallback when transport_salt is not set', () => {
    aGTM.c.transport_salt = undefined;
    aGTM.c.session_salt   = 33;
    aGTM.f.fire({ event: 'test', _post: { enc: true } });
    expect(capturedSalt).toBe(33);
  });

  test('enc() is not called when encrypt=false (no salt captured)', () => {
    aGTM.c.session_salt = 99;
    aGTM.f.fire({ event: 'test', _post: { enc: false } });
    expect(capturedSalt).toBeNull(); // enc() never called
  });
});
