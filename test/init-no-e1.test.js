// test/init-no-e1.test.js — F-285: config() then init() must not log e1.
//
// init() used to call config() unconditionally. On the documented order
// (config() first, then init() - which is also what the sGTM Client serves),
// that second call hit the "already configured" guard and logged the error e1
// on every page view, burying a real double config() call of the page.
import { describe, test, expect, beforeEach } from 'bun:test';
import { resetAGTM } from './helpers.js';

const ids = () => aGTM.l.map((e) => e.id);

describe('init() after config() (F-285)', () => {
  beforeEach(() => {
    resetAGTM();
    globalThis.dataLayer = [];
  });

  test('config() then init() logs no e1', () => {
    aGTM.f.config({ gtm: { 'GTM-TEST': {} }, cmp: 'none', gdl: 'dataLayer' });
    aGTM.f.init();
    expect(aGTM.d.config).toBe(true);
    expect(ids()).not.toContain('e1');
  });

  test('init() alone still configures', () => {
    aGTM.c.gdl = 'dataLayer';
    aGTM.f.init();
    expect(aGTM.d.config).toBe(true);
    expect(ids()).toContain('m1');
  });

  test('a real second config() of the page still logs e1', () => {
    aGTM.f.config({ gtm: { 'GTM-TEST': {} }, cmp: 'none', gdl: 'dataLayer' });
    aGTM.f.config({ gtm: { 'GTM-TEST': {} }, cmp: 'none', gdl: 'dataLayer' });
    expect(ids()).toContain('e1');
  });
});

describe('nonce default from the loading script (F-286)', () => {
  beforeEach(() => { resetAGTM(); globalThis.dataLayer = []; });

  test('without a configured nonce, the nonce of the loading script is used', () => {
    aGTM.d.nonce = 'n-from-script';
    aGTM.f.config({ gtm: { 'GTM-TEST': {} }, cmp: 'none', gdl: 'dataLayer' });
    expect(aGTM.c.nonce).toBe('n-from-script');
  });

  test('an explicit empty nonce falls back too', () => {
    aGTM.d.nonce = 'n-from-script';
    aGTM.f.config({ gtm: { 'GTM-TEST': {} }, cmp: 'none', gdl: 'dataLayer', nonce: '' });
    expect(aGTM.c.nonce).toBe('n-from-script');
  });

  test('a configured nonce wins', () => {
    aGTM.d.nonce = 'n-from-script';
    aGTM.f.config({ gtm: { 'GTM-TEST': {} }, cmp: 'none', gdl: 'dataLayer', nonce: 'fixed' });
    expect(aGTM.c.nonce).toBe('fixed');
  });

  test('no nonce anywhere stays empty', () => {
    aGTM.f.config({ gtm: { 'GTM-TEST': {} }, cmp: 'none', gdl: 'dataLayer' });
    expect(aGTM.c.nonce).toBe('');
  });

});
