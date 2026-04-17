// test/consent_events.test.js — tests for consent_events config parsing and fire() trigger
import { describe, test, expect, beforeEach } from 'bun:test';
import { resetAGTM } from './helpers.js';

describe('consent_events — config parser', () => {
  beforeEach(() => {
    resetAGTM();
  });

  test('simple event name is stored as-is', () => {
    aGTM.f.config({ consent_events: 'cmpUpdate' });
    expect(aGTM.c.consent_events).toBe('cmpUpdate');
    expect(aGTM.c.consent_event_attr).toEqual({});
  });

  test('multiple event names are stored comma-separated', () => {
    aGTM.f.config({ consent_events: 'cmpEvent,cmpUpdate' });
    expect(aGTM.c.consent_events).toBe('cmpEvent,cmpUpdate');
  });

  test('bracket notation with key:value is parsed into consent_event_attr', () => {
    aGTM.f.config({ consent_events: 'cmpEvent[userChoiceType:useraction]' });
    expect(aGTM.c.consent_events).toBe('cmpEvent');
    expect(aGTM.c.consent_event_attr['cmpEvent']).toEqual({ userChoiceType: 'useraction' });
  });

  test('bracket notation with key only (presence check) stores empty string value', () => {
    aGTM.f.config({ consent_events: 'cmpEvent[userChoiceType]' });
    expect(aGTM.c.consent_events).toBe('cmpEvent');
    expect(aGTM.c.consent_event_attr['cmpEvent']).toEqual({ userChoiceType: '' });
  });

  test('mixed bracket and plain events are both handled', () => {
    aGTM.f.config({ consent_events: 'cmpEvent[userChoiceType:useraction],cmpUpdate' });
    expect(aGTM.c.consent_events).toBe('cmpEvent,cmpUpdate');
    expect(aGTM.c.consent_event_attr['cmpEvent']).toEqual({ userChoiceType: 'useraction' });
    expect(aGTM.c.consent_event_attr['cmpUpdate']).toBeUndefined();
  });

  test('empty consent_events string leaves attr empty', () => {
    aGTM.f.config({ consent_events: '' });
    expect(aGTM.c.consent_events).toBe('');
    expect(aGTM.c.consent_event_attr).toEqual({});
  });
});

describe('consent_events — fire() trigger', () => {
  beforeEach(() => {
    resetAGTM();
    aGTM.f.config({ gdl: 'dataLayer', consent_events: 'cmpUpdate,cmpEvent[userChoiceType:useraction]' });
    aGTM.d.init = true;
    aGTM.d.consent = { hasResponse: true, gtmConsent: true };
    globalThis.dataLayer = [];
  });

  test('first event in list triggers run_cc (indexOf fix)', () => {
    var called = false;
    var orig = aGTM.f.run_cc;
    aGTM.f.run_cc = function(a) { if (a === 'update') called = true; orig(a); };
    aGTM.f.fire({ event: 'cmpUpdate' });
    expect(called).toBe(true);
    aGTM.f.run_cc = orig;
  });

  test('second event in list also triggers run_cc', () => {
    var called = false;
    var orig = aGTM.f.run_cc;
    aGTM.f.run_cc = function(a) { if (a === 'update') called = true; orig(a); };
    aGTM.f.fire({ event: 'cmpEvent', userChoiceType: 'useraction' });
    expect(called).toBe(true);
    aGTM.f.run_cc = orig;
  });

  test('bracket event does not trigger if attribute value does not match', () => {
    var called = false;
    var orig = aGTM.f.run_cc;
    aGTM.f.run_cc = function(a) { if (a === 'update') called = true; orig(a); };
    aGTM.f.fire({ event: 'cmpEvent', userChoiceType: 'other' });
    expect(called).toBe(false);
    aGTM.f.run_cc = orig;
  });

  test('unlisted event does not trigger run_cc', () => {
    var called = false;
    var orig = aGTM.f.run_cc;
    aGTM.f.run_cc = function(a) { if (a === 'update') called = true; orig(a); };
    aGTM.f.fire({ event: 'pageview' });
    expect(called).toBe(false);
    aGTM.f.run_cc = orig;
  });
});
