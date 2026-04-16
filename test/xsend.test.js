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

  test('fire-and-forget: does not set onreadystatechange', () => {
    aGTM.f.xsend('http://example.com/collect', {}, false, 0);
    expect(MockXHR.last.onreadystatechange).toBeNull();
  });
});
