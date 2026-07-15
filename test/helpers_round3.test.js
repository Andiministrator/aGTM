// test/helpers_round3.test.js — round-3 unit tests for further untested helpers:
// pageinfo (word/image counting), aGTM_event (event-object builder), timerfkt
// (timed-event computation), proxySupport, log, and the DOM-wrapper guards
// (getNodeAttr/newNode/delNode). Test-only. F-50: pageinfo counted every
// whitespace-only text node as one word — this pins the fixed behaviour.
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resetAGTM } from './helpers.js';

beforeEach(() => resetAGTM());

// ── aGTM.f.pageinfo (word / image counting) ──────────────────────────────────
describe('aGTM.f.pageinfo()', () => {
  var savedBody, savedGEBTN;
  beforeEach(() => { savedBody = document.body; savedGEBTN = document.getElementsByTagName; });
  afterEach(() => { document.body = savedBody; document.getElementsByTagName = savedGEBTN; });

  function txt(s) { return { nodeType: 3, textContent: s }; }
  function el(tag, kids) { return { nodeType: 1, tagName: tag, childNodes: kids || [] }; }

  test('counts only real words, ignoring whitespace-only text nodes (F-50)', () => {
    // <body>\n <p>hello world</p>\n <p>foo</p>\n</body> — 3 whitespace nodes
    // between tags. Before the fix each added 1 → 6; the real count is 3.
    document.body = el('BODY', [
      txt('\n  '),
      el('P', [txt('hello world')]),
      txt('\n  '),
      el('P', [txt('foo')]),
      txt('\n')
    ]);
    expect(aGTM.f.pageinfo({ countWords: true }).words).toBe(3);
  });

  test('skips script/style/noscript subtrees', () => {
    document.body = el('BODY', [
      el('SCRIPT', [txt('var a = 1 + 2 + 3;')]),
      el('P', [txt('one two')])
    ]);
    expect(aGTM.f.pageinfo({ countWords: true }).words).toBe(2);
  });

  test('countImages only counts images larger than 250×250', () => {
    document.getElementsByTagName = function (tag) {
      if (tag === 'img') return [
        { naturalWidth: 300, naturalHeight: 300 }, // counts
        { naturalWidth: 100, naturalHeight: 900 }, // too narrow
        { naturalWidth: 800, naturalHeight: 800 }  // counts
      ];
      return [];
    };
    expect(aGTM.f.pageinfo({ countImages: true }).images).toBe(2);
  });

  test('returns zero counts when no options are set', () => {
    expect(aGTM.f.pageinfo()).toEqual({ words: 0, images: 0 });
  });
});

// ── aGTM.f.aGTM_event (dataLayer event-object builder) ───────────────────────
describe('aGTM.f.aGTM_event()', () => {
  test('defaults the event name when none is given', () => {
    expect(aGTM.f.aGTM_event().event).toBe('aGTM_event');
    expect(aGTM.f.aGTM_event('').event).toBe('aGTM_event');
  });

  test('carries a numeric timestamp and a consent snapshot', () => {
    var o = aGTM.f.aGTM_event('my_event');
    expect(o.event).toBe('my_event');
    expect(typeof o.aGTMts).toBe('number');
    expect(typeof o.aGTMconsent).toBe('object');
  });

  test('aGTM_ready carries the aGTM meta block (version/is_iframe/hastyEvents/errors)', () => {
    var o = aGTM.f.aGTM_event('aGTM_ready');
    expect(o.aGTM).toBeDefined();
    expect(o.aGTM.version).toBe(aGTM.d.version);
    expect(o.aGTM.hastyEvents).toBe(aGTM.d.f);
  });

  test('a non-ready event has no aGTM meta block', () => {
    expect(aGTM.f.aGTM_event('other').aGTM).toBeUndefined();
  });
});

// ── aGTM.f.timerfkt (timed-event computation) ────────────────────────────────
describe('aGTM.f.timerfkt()', () => {
  var savedFire;
  beforeEach(() => { savedFire = aGTM.f.fire; });
  afterEach(() => { aGTM.f.fire = savedFire; });

  test('increments the count, computes seconds, and substitutes [s]', () => {
    var captured = null;
    aGTM.f.fire = function (ev) { captured = ev; };
    aGTM.f.timerfkt({ timer_ms: 1000, timer_ct: 2, event: 'timer[s]' });
    expect(captured.timer_ct).toBe(3);          // incremented
    expect(captured.timer_tm).toBe(3000);       // 1000 * 3
    expect(captured.timer_sc).toBe(3);          // 3000/1000
    expect(captured.event).toBe('timer3');      // [s] replaced
    expect(captured.eventModel).toBeNull();
  });

  test('defaults the event name to "timer" when none is given', () => {
    var captured = null;
    aGTM.f.fire = function (ev) { captured = ev; };
    aGTM.f.timerfkt({ timer_ms: 500, timer_ct: 0 });
    expect(captured.event).toBe('timer');
    expect(captured.timer_sc).toBe(0.5);
  });

  test('does not mutate the caller object (deep-copies first)', () => {
    aGTM.f.fire = function () {};
    var src = { timer_ms: 1000, timer_ct: 0, event: 'x' };
    aGTM.f.timerfkt(src);
    expect(src.timer_ct).toBe(0); // original untouched
  });
});

// ── aGTM.f.proxySupport ──────────────────────────────────────────────────────
describe('aGTM.f.proxySupport()', () => {
  test('returns a boolean (true where Proxy is fully usable)', () => {
    var r = aGTM.f.proxySupport();
    expect(typeof r).toBe('boolean');
    expect(r).toBe(true); // bun/V8 supports Proxy incl. the apply trap
  });
});

// ── aGTM.f.log ───────────────────────────────────────────────────────────────
describe('aGTM.f.log()', () => {
  test('pushes an entry with id, numeric timestamp and a cloned object', () => {
    var src = { a: 1 };
    aGTM.f.log('t1', src);
    var last = aGTM.l[aGTM.l.length - 1];
    expect(last.id).toBe('t1');
    expect(typeof last.timestamp).toBe('number');
    expect(last.obj).toEqual({ a: 1 });
    // clone: mutating the source must not change the logged entry
    src.a = 2;
    expect(last.obj.a).toBe(1);
  });
});

// ── DOM wrapper guards (getNodeAttr / newNode / delNode) ─────────────────────
describe('DOM wrapper guards', () => {
  test('getNodeAttr returns null when the selector matches nothing', () => {
    // test-env document.querySelector() returns null
    expect(aGTM.f.getNodeAttr('div#nope', 'href')).toBeNull();
  });

  test('newNode is a no-op (no throw) for invalid args', () => {
    expect(() => aGTM.f.newNode('', 'head', {})).not.toThrow();
    expect(() => aGTM.f.newNode('div', 'head', 'not-an-object')).not.toThrow();
  });

  test('delNode is a no-op (no throw) for an empty selector or a missing node', () => {
    expect(() => aGTM.f.delNode('')).not.toThrow();
    expect(() => aGTM.f.delNode('div#nope')).not.toThrow();
  });
});
