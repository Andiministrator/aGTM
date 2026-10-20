// test/xsend.test.js — tests for aGTM.f.xsend()
import { describe, test, expect, beforeEach } from 'bun:test';
import { resetAGTM, MockXHR } from './helpers.js';

describe('aGTM.f.xsend()', () => {
  beforeEach(() => {
    MockXHR.install();
    resetAGTM();
  });

  test('sends a POST request to the given url', () => {
    aGTM.f.xsend('http://example.com/collect', { event: 'test' }, false, 0);
    expect(MockXHR.last.method).toBe('POST');
    expect(MockXHR.last.url).toBe('http://example.com/collect');
  });

  test('sends plain body {"e": ...} when encrypt=false', () => {
    aGTM.f.xsend('http://example.com/collect', { event: 'purchase' }, false, 0);
    const body = JSON.parse(MockXHR.last._body);
    expect(body.e.event).toBe('purchase');
    expect(body.q).toBeUndefined();
  });

  test('sends encrypted body {"q": ...} when encrypt=true and salt>=1', () => {
    aGTM.f.xsend('http://example.com/collect', { event: 'purchase' }, true, 7);
    const body = JSON.parse(MockXHR.last._body);
    expect(body.q).toBeDefined();
    expect(typeof body.q).toBe('string');
    expect(body.e).toBeUndefined();
  });

  test('does nothing (no XHR) when url is empty', () => {
    aGTM.f.xsend('', { event: 'test' }, false, 0);
    expect(MockXHR.instances.length).toBe(0);
  });

  test('returns the XHR instance', () => {
    const xhr = aGTM.f.xsend('http://example.com/collect', {}, false, 0);
    expect(xhr).toBeInstanceOf(MockXHR);
    expect(xhr).toBe(MockXHR.last);
  });

  test('returns null when url is missing', () => {
    const xhr = aGTM.f.xsend('', {}, false, 0);
    expect(xhr).toBeUndefined(); // early return without explicit null
  });

  test('sets Content-Type: application/json', () => {
    aGTM.f.xsend('http://example.com/collect', {}, false, 0);
    expect(MockXHR.last._headers['Content-Type']).toBe('application/json');
  });

  // F-160: credentials and text/plain belong to the consent store alone. Every
  // other caller (_post transport, aEvents tag) sends to an endpoint of the
  // integrator's choosing, which must not start receiving the visitor's cookies.
  test('default: no credentials', () => {
    aGTM.f.xsend('http://example.com/collect', {}, false, 0);
    expect(MockXHR.last.withCredentials).not.toBe(true);
  });

  test('cred=true: credentials on, text/plain (CORS simple request, no preflight)', () => {
    aGTM.f.xsend('https://rp.example.com/aGTMconsent', { a: 1 }, false, 0, true);
    expect(MockXHR.last.withCredentials).toBe(true);
    expect(MockXHR.last._headers['Content-Type']).toBe('text/plain;charset=UTF-8');
    expect(JSON.parse(MockXHR.last._body)).toEqual({ e: { a: 1 } });
  });

  test('only a literal true switches the mode', () => {
    aGTM.f.xsend('http://example.com/collect', {}, false, 0, 'yes');
    expect(MockXHR.last.withCredentials).not.toBe(true);
    expect(MockXHR.last._headers['Content-Type']).toBe('application/json');
  });

  test('fire-and-forget: does not set onreadystatechange', () => {
    aGTM.f.xsend('http://example.com/collect', {}, false, 0);
    expect(MockXHR.last.onreadystatechange).toBeNull();
  });
});
