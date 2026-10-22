// test/jserrors_switch.test.js — the jsErrors switch (F-190).
// Error capture was the one data collection of the library that ran without
// any configuration. Default stays on; false installs no listener at all.
import { test, expect, beforeEach, afterEach } from 'bun:test';
import { resetAGTM } from './helpers.js';

var calls;
var orig;
beforeEach(() => {
  resetAGTM();
  globalThis.dataLayer = [];
  calls = 0;
  orig = aGTM.f.jserrors;
  aGTM.f.jserrors = function () { calls++; };
});
afterEach(() => { aGTM.f.jserrors = orig; });

const initWith = (cfg) => { for (var k in cfg) aGTM.c[k] = cfg[k]; aGTM.f.init(); };

test('default: on', () => {
  initWith({ cmp: 'none' });
  expect(aGTM.c.jsErrors).toBe(true);
  expect(calls).toBe(1);
});

test('jsErrors: false installs no error listener', () => {
  initWith({ cmp: 'none', jsErrors: false });
  expect(aGTM.c.jsErrors).toBe(false);
  expect(calls).toBe(0);
});

test('a non-boolean does not switch it off', () => {
  initWith({ cmp: 'none', jsErrors: 'false' });
  expect(aGTM.c.jsErrors).toBe(true);
  expect(calls).toBe(1);
});
