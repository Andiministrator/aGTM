// test/xfetch.test.js — tests for aGTM.f.xfetch()
import { describe, test, expect, beforeEach } from 'bun:test';
import { resetAGTM, MockXHR } from './helpers.js';

describe('aGTM.f.xfetch()', () => {
  beforeEach(() => {
    MockXHR.install();
    resetAGTM();
  });

  test('calls callback with parsed JSON on 2xx response', () => {
    let result;
    aGTM.f.xfetch('http://example.com/api', { foo: 'bar' }, false, 0, (r) => { result = r; });
    MockXHR.last.respond(200, { sid: 'abc', ret: false });
    expect(result).toEqual({ sid: 'abc', ret: false });
  });

  test('calls callback with null on non-2xx response', () => {
    let result = 'initial';
    aGTM.f.xfetch('http://example.com/api', {}, false, 0, (r) => { result = r; });
    MockXHR.last.respond(500, 'Internal Server Error');
    expect(result).toBeNull();
  });

  test('calls callback with null on 404', () => {
    let result = 'initial';
    aGTM.f.xfetch('http://example.com/api', {}, false, 0, (r) => { result = r; });
    MockXHR.last.respond(404, 'Not Found');
    expect(result).toBeNull();
  });

  test('calls callback with null on invalid JSON body', () => {
    let result = 'initial';
    aGTM.f.xfetch('http://example.com/api', {}, false, 0, (r) => { result = r; });
    const xhr = MockXHR.last;
    xhr.status = 200;
    xhr.responseText = 'not valid json {{{';
    xhr.readyState = 4;
    xhr.onreadystatechange();
    expect(result).toBeNull();
  });

  test('calls callback with null immediately when url is empty', () => {
    let result = 'initial';
    aGTM.f.xfetch('', {}, false, 0, (r) => { result = r; });
    expect(result).toBeNull();
    expect(MockXHR.instances.length).toBe(0); // no XHR created
  });

  test('sends plain body {"e": ...} when encrypt=false', () => {
    aGTM.f.xfetch('http://example.com/api', { event: 'test' }, false, 0, () => {});
    const body = JSON.parse(MockXHR.last._body);
    expect(body.e).toBeDefined();
    expect(body.e.event).toBe('test');
    expect(body.q).toBeUndefined();
  });

  test('sends encrypted body {"q": ...} when encrypt=true and salt>=1', () => {
    aGTM.f.xfetch('http://example.com/api', { event: 'test' }, true, 42, () => {});
    const body = JSON.parse(MockXHR.last._body);
    expect(body.q).toBeDefined();
    expect(typeof body.q).toBe('string');
    expect(body.e).toBeUndefined();
  });

  test('sends plain body when encrypt=true but salt<1', () => {
    aGTM.f.xfetch('http://example.com/api', { event: 'test' }, true, 0, () => {});
    const body = JSON.parse(MockXHR.last._body);
    expect(body.e).toBeDefined(); // no encryption without valid salt
  });

  test('sets Content-Type: application/json', () => {
    aGTM.f.xfetch('http://example.com/api', {}, false, 0, () => {});
    expect(MockXHR.last._headers['Content-Type']).toBe('application/json');
  });

  test('returns the XMLHttpRequest instance', () => {
    const xhr = aGTM.f.xfetch('http://example.com/api', {}, false, 0, () => {});
    expect(xhr).toBeInstanceOf(MockXHR);
    expect(xhr).toBe(MockXHR.last);
  });

  test('returns null when url is missing (no XHR created)', () => {
    const xhr = aGTM.f.xfetch('', {}, false, 0, () => {});
    expect(xhr).toBeNull();
  });
});
