// test/cmp/onetrust.test.js — the OneTrust / CookiePro consent_check.
//
// Why this exists (F-195): the adapter opened its interaction gate on
// `customPayload.Interaction > 0`. Measured live on 2026-08-13, that value was 1
// on a page whose banner had never been answered — `OneTrust.IsAlertBoxClosed()`
// was false, `OptanonAlertBoxClosed` was unset, the banner was visible. The
// adapter therefore reported hasResponse:true for a visitor who had decided
// nothing, aGTM injected GTM, and a GA4 page_view went out with gcs=G100.
//
// The fixtures below are the real object shape from that measurement, so the
// regression test is the live case rather than an invented one.
import { describe, test, expect, beforeEach } from 'bun:test';
import { resetAGTM } from '../helpers.js';
import { loadCMP } from './harness.js';

/** GetDomainData() as measured live. `granted` lists the categories currently on. */
function domainData(opts) {
  const o = opts || {};
  const PID_ESSENTIAL = '42120F35-3660-4BAA-9158-F001AC7ED5A2';
  const PID_PERF = '1A3DE39C-BBCE-47F1-8F80-3B80873EF198';
  const PID_TARGET = '72FC8DBC-4545-420F-BD4E-584946102CAF';
  const granted = o.granted || ['C0001'];
  // NO_CHOICE = non-selectable (always on), CONFIRMED = the visitor agreed,
  // OPT_OUT = offered but not agreed to.
  const tt = (id, pid) => ({
    Id: pid,
    TransactionType: id === 'C0001' ? 'NO_CHOICE' : (granted.indexOf(id) >= 0 ? 'CONFIRMED' : 'OPT_OUT')
  });
  return {
    ConsentModel: { Name: o.consentModel || 'opt-in' },
    Groups: [
      { OptanonGroupId: 'C0001', GroupName: 'Strictly Necessary Cookies', PurposeId: PID_ESSENTIAL },
      { OptanonGroupId: 'C0002', GroupName: 'Performance Cookies', PurposeId: PID_PERF },
      { OptanonGroupId: 'C0004', GroupName: 'Targeting Cookies', PurposeId: PID_TARGET }
    ],
    ConsentIntegrationData: {
      consentPayload: {
        customPayload: { Interaction: o.interaction === undefined ? 1 : o.interaction },
        dsDataElements: { Country: 'DE', InteractionType: o.interactionType || '' },
        purposes: [tt('C0001', PID_ESSENTIAL), tt('C0002', PID_PERF), tt('C0004', PID_TARGET)]
      }
    }
  };
}

/** Installs the CMP globals and runs the check. `boxClosed`: true/false/undefined. */
function check(opts) {
  const o = opts || {};
  const data = domainData(o);
  globalThis.Optanon = { GetDomainData: () => data };
  if (o.optanonHasApi) globalThis.Optanon.IsAlertBoxClosed = () => o.boxClosed;
  if (o.boxClosed === undefined || o.optanonHasApi) delete globalThis.OneTrust;
  else globalThis.OneTrust = { IsAlertBoxClosed: () => o.boxClosed };
  const ok = globalThis.aGTM.f.consent_check('update');
  return { ok: ok, consent: globalThis.aGTM.d.consent };
}

beforeEach(() => {
  resetAGTM();
  loadCMP('onetrust_cookiepro');
  delete globalThis.OneTrust;
  delete globalThis.Optanon;
});

describe('OneTrust: a decision must exist before anything is reported', () => {
  // THE LIVE CASE. Interaction is 1, the banner has never been answered.
  test('banner still open → no response, even though Interaction is 1', () => {
    const r = check({ boxClosed: false, interaction: 1, granted: ['C0001'] });
    expect(r.ok).toBe(false);
    expect(r.consent.hasResponse).toBeFalsy();
  });

  test('the same state without the guard would have reported "declined" as a decision', () => {
    // Documents WHY false is correct: the category state before a decision is
    // identical to the state after "deny all" — only the non-selectable one is on.
    const r = check({ boxClosed: true, interaction: 1, granted: ['C0001'] });
    expect(r.ok).toBe(true);
    expect(r.consent.feedback).toBe('Consent declined');
    expect(r.consent.purposes).toBe(',Strictly Necessary Cookies,');
  });

  test('IsAlertBoxClosed is authoritative over Interaction (false wins)', () => {
    const r = check({ boxClosed: false, interaction: 99, interactionType: 'accept all' });
    expect(r.ok).toBe(false);
  });

  test('decision made → the adapter reports and maps the categories', () => {
    const r = check({ boxClosed: true, granted: ['C0001', 'C0002'] });
    expect(r.ok).toBe(true);
    expect(r.consent.hasResponse).toBe(true);
    expect(r.consent.purposes).toBe(',Strictly Necessary Cookies,Performance Cookies,');
    expect(r.consent.feedback).toBe('Consent partially accepted');
  });

  test('accept all', () => {
    const r = check({ boxClosed: true, granted: ['C0001', 'C0002', 'C0004'] });
    expect(r.ok).toBe(true);
    expect(r.consent.feedback).toBe('Consent full accepted');
  });

  // The API lives on OneTrust for some deployments and on Optanon for others.
  // CookiePro does not always publish the `OneTrust` global at all.
  test('the guard also works when only Optanon exposes IsAlertBoxClosed', () => {
    expect(check({ boxClosed: false, optanonHasApi: true }).ok).toBe(false);
    expect(check({ boxClosed: true, optanonHasApi: true }).ok).toBe(true);
  });
});

describe('OneTrust: setups without IsAlertBoxClosed keep their old behaviour', () => {
  // No regression: where the API does not exist, the legacy signals still decide.
  // Trading one silent failure for another (GTM never loading) would be worse.
  test('no API, Interaction > 0 → reports as before', () => {
    const r = check({ boxClosed: undefined, interaction: 1 });
    expect(r.ok).toBe(true);
    expect(r.consent.hasResponse).toBe(true);
  });

  test('no API, InteractionType set → reports as before', () => {
    const r = check({ boxClosed: undefined, interaction: 0, interactionType: 'accept all' });
    expect(r.ok).toBe(true);
    expect(r.consent.feedback).toBe('accept all');
  });

  test('no API, no signal at all → still waits', () => {
    const r = check({ boxClosed: undefined, interaction: 0 });
    expect(r.ok).toBe(false);
  });
});

describe('OneTrust: contract with aGTM 1.4.x and 1.5.x', () => {
  // The adapter must not depend on anything that only one of the two lines has.
  test('touches only aGTM.d.consent and the typeof-guarded aGTM.f.log', () => {
    const src = require('fs').readFileSync('./cmp/cc_onetrust_cookiepro.js', 'utf8');
    const used = (src.match(/aGTM\.[a-z]\.[a-zA-Z_]+/g) || []).filter((v, i, a) => a.indexOf(v) === i).sort();
    expect(used).toEqual(['aGTM.d.consent', 'aGTM.f.consent_check', 'aGTM.f.log']);
    // aGTM.f.log is optional in both lines — never called unguarded.
    const unguarded = src.split('\n').filter((l) =>
      l.indexOf('aGTM.f.log(') >= 0 && l.indexOf("typeof aGTM.f.log=='function'") < 0);
    expect(unguarded).toEqual([]);
  });

  test("the 'init' short-circuit is intact (load-bearing for preset_with_consent)", () => {
    globalThis.aGTM.d.consent = { hasResponse: true };
    expect(globalThis.aGTM.f.consent_check('init')).toBe(true);
  });

  test('an invalid action is rejected', () => {
    expect(globalThis.aGTM.f.consent_check('nonsense')).toBe(false);
    expect(globalThis.aGTM.f.consent_check()).toBe(false);
  });

  test('ES5 only — no let/const/arrow/template literal in the shipped source', () => {
    const src = require('fs').readFileSync('./cmp/cc_onetrust_cookiepro.js', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    expect(src).not.toMatch(/\b(let|const)\s/);
    expect(src).not.toMatch(/=>/);
    expect(src).not.toMatch(/`/);
  });
});
