// test/iframe_handshake.test.js
// Regression tests for the iFrame handshake origin hardening (F-33 d).
// The iFrame side must only adopt the return origin from a handshake that
// genuinely originates from window.top — a forged handshake (sibling frame /
// injected script) must never hijack aGTM.d.iframe.origin.

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { resetAGTM } from './helpers.js';

const HANDSHAKE = 'aGTM_Top2iFrame Handshake';

describe('aGTM.f.ifHSlisten — handshake origin verification', () => {
  let origRemove, origAdd, origPostMessage;

  beforeEach(() => {
    resetAGTM();
    // Pretend this window is an iFrame.
    globalThis.aGTM.d.is_iframe = true;
    globalThis.aGTM.d.f = [];
    // ifHSlisten calls window.removeEventListener on success — stub it.
    origRemove = globalThis.removeEventListener;
    origAdd = globalThis.addEventListener;
    origPostMessage = globalThis.postMessage;
    globalThis.removeEventListener = () => {};
    globalThis.addEventListener = () => {};
  });

  afterEach(() => {
    globalThis.removeEventListener = origRemove;
    globalThis.addEventListener = origAdd;
    globalThis.postMessage = origPostMessage;
  });

  it('adopts the origin when the handshake comes from window.top', () => {
    globalThis.aGTM.f.ifHSlisten({
      source: window.top,
      origin: 'https://parent.example',
      data: HANDSHAKE
    });
    expect(globalThis.aGTM.d.iframe.origin).toBe('https://parent.example');
  });

  it('ignores a forged handshake from a non-top source', () => {
    globalThis.aGTM.f.ifHSlisten({
      source: { fake: true }, // sibling frame / injected script
      origin: 'https://attacker.example',
      data: HANDSHAKE
    });
    expect(globalThis.aGTM.d.iframe.origin).toBe('');
  });

  it('ignores a message with a non-matching data payload', () => {
    globalThis.aGTM.f.ifHSlisten({
      source: window.top,
      origin: 'https://parent.example',
      data: 'something else'
    });
    expect(globalThis.aGTM.d.iframe.origin).toBe('');
  });

  it('does nothing when the page is not an iFrame', () => {
    globalThis.aGTM.d.is_iframe = false;
    globalThis.aGTM.f.ifHSlisten({
      source: window.top,
      origin: 'https://parent.example',
      data: HANDSHAKE
    });
    expect(globalThis.aGTM.d.iframe.origin).toBe('');
  });

  it('flushes the queued events to the verified top origin after handshake', () => {
    globalThis.aGTM.d.f = [{ event: 'test_event' }];
    let posted = null;
    globalThis.postMessage = (ev, target) => { posted = { ev: ev, target: target }; };
    globalThis.aGTM.f.ifHSlisten({
      source: window.top,
      origin: 'https://parent.example',
      data: HANDSHAKE
    });
    expect(posted).not.toBeNull();
    expect(posted.target).toBe('https://parent.example');
    expect(posted.ev.event).toBe('test_event');
    expect(globalThis.aGTM.d.f.length).toBe(0);
  });
});
