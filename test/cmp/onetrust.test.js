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

/**
 * Installs the CMP globals and runs the check.
 *
 * `boxClosed`   what IsAlertBoxClosed() returns (any value, or a thrown Error).
 * `otShape`     how the OneTrust global looks:
 *                 'object'   plain object carrying the method (default)
 *                 'function' a FUNCTION carrying the method — a real CMP shape
 *                            (cc_secure_privacy has the precedent) and the one
 *                            a `typeof == 'object'` test would silently skip
 *                 'no-api'   object without the method → Optanon must take over
 *                 'null'     the global exists but is null
 *                 'absent'   no OneTrust global at all
 * `optanonApi`  also put IsAlertBoxClosed on Optanon.
 *
 * Every combination is spelled out rather than derived, so a test's name and the
 * state it actually creates cannot drift apart.
 */
function check(opts) {
  const o = opts || {};
  const data = domainData(o);
  const answer = () => { if (o.boxClosed instanceof Error) throw o.boxClosed; return o.boxClosed; };

  globalThis.Optanon = { GetDomainData: () => data };
  if (o.optanonApi) globalThis.Optanon.IsAlertBoxClosed = answer;

  delete globalThis.OneTrust;
  const shape = o.otShape || (o.boxClosed === undefined || o.optanonApi ? 'absent' : 'object');
  if (shape === 'object') globalThis.OneTrust = { IsAlertBoxClosed: answer };
  else if (shape === 'function') { const f = function () {}; f.IsAlertBoxClosed = answer; globalThis.OneTrust = f; }
  else if (shape === 'no-api') globalThis.OneTrust = { somethingElse: 1 };
  else if (shape === 'null') globalThis.OneTrust = null;

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

  test('after a real decision, that same category state maps to "declined"', () => {
    // This is the reason the guard is needed, spelled out: the category state
    // BEFORE any decision is byte-for-byte the state after "deny all" — only the
    // non-selectable category is on. So the category data alone can never tell
    // the two apart, and something outside it has to answer "has anyone decided".
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
  test('only Optanon exposes IsAlertBoxClosed → still waits before a decision', () => {
    expect(check({ boxClosed: false, optanonApi: true }).ok).toBe(false);
  });

  test('only Optanon exposes IsAlertBoxClosed → reports after a decision', () => {
    expect(check({ boxClosed: true, optanonApi: true }).ok).toBe(true);
  });

  // A OneTrust global that does NOT carry the method must not shadow Optanon's.
  test('OneTrust without the method falls through to Optanon', () => {
    expect(check({ otShape: 'no-api', optanonApi: true, boxClosed: false }).ok).toBe(false);
    expect(check({ otShape: 'no-api', optanonApi: true, boxClosed: true }).ok).toBe(true);
  });

  test('a null OneTrust global does not throw and does not shadow Optanon', () => {
    const r = check({ otShape: 'null', optanonApi: true, boxClosed: false });
    expect(r.ok).toBe(false);
  });
});

// The ways the guard could silently stop guarding. Each of these once passed the
// check while the banner was open — the QA round proved it by mutation.
describe('OneTrust: the guard cannot be bypassed by an unexpected shape', () => {
  // A CMP global may be a FUNCTION that also carries methods. A `typeof ==
  // 'object'` test skips it, and the adapter falls back to the legacy signals —
  // which is exactly the bug this fix exists to end (Interaction was 1).
  test('OneTrust as a function still guards', () => {
    expect(check({ otShape: 'function', boxClosed: false, interaction: 1 }).ok).toBe(false);
    expect(check({ otShape: 'function', boxClosed: true, interaction: 1 }).ok).toBe(true);
  });

  // Only a real boolean counts. A truthy non-boolean must NOT read as "decided",
  // or the adapter claims a decision that never happened.
  for (const bad of ['false', 'true', 1, 'yes', {}]) {
    test(`IsAlertBoxClosed() returning ${JSON.stringify(bad)} is not a decision`, () => {
      // No usable answer → legacy path. With no legacy signal either, it waits.
      const r = check({ boxClosed: bad, interaction: 0 });
      expect(r.ok).toBe(false);
      expect(r.consent.hasResponse).toBeFalsy();
    });
  }

  test('a falsy non-boolean is not a decision either', () => {
    expect(check({ boxClosed: 0, interaction: 0 }).ok).toBe(false);
    expect(check({ boxClosed: null, interaction: 0 }).ok).toBe(false);
  });

  // run_cc() does not catch, and it is called from aGTM.f.fire() — a throw here
  // would abort the event before its dataLayer push, losing the event itself.
  test('a throwing IsAlertBoxClosed does not escape consent_check', () => {
    let r;
    expect(() => { r = check({ boxClosed: new Error('boom'), interaction: 0 }); }).not.toThrow();
    expect(r.ok).toBe(false);
  });

  test('a throwing IsAlertBoxClosed falls back to the legacy signals, not to a claim', () => {
    // Legacy signal present → reports, as a setup without the API would.
    const r = check({ boxClosed: new Error('boom'), interaction: 0, interactionType: 'accept all' });
    expect(r.ok).toBe(true);
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
  /** Source with comments removed — see the note in the test below. */
  function code() {
    return require('fs').readFileSync('./cmp/cc_onetrust_cookiepro.js', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  }

  // This is a "no 1.5-only API surface" check, not proof of compatibility — it
  // reads the source, it does not run the adapter against a 1.4 library. What it
  // buys is that a future edit cannot reach for a 1.5-only helper unnoticed.
  //
  // Comments are stripped BEFORE matching. Without that, merely *naming*
  // aGTM.f.fire in a comment fails the test (it did), which pushes the next
  // author to mutilate an explanation rather than fix code — the opposite of
  // what a guard should incentivise.
  //
  // The behavioural half of the compatibility claim, verified by hand against
  // the 1.4 line and recorded here because no test captures it: the adapter now
  // returns false on the 'update' path. In 1.4.x, run_cc has neither the B2
  // field reset nor the snapshot/restore, so a false there simply logs m8 and
  // returns — nothing had been cleared that would need restoring. In 1.5.x the
  // snapshot is restored on false. Harmless in both.
  test('no 1.5-only aGTM API surface', () => {
    const used = (code().match(/aGTM\.[a-z]\.[a-zA-Z_]+/g) || []).filter((v, i, a) => a.indexOf(v) === i).sort();
    expect(used).toEqual(['aGTM.d.consent', 'aGTM.f.consent_check', 'aGTM.f.log']);
    // aGTM.f.log is optional in both lines — never called unguarded.
    const unguarded = code().split('\n').filter((l) =>
      l.indexOf('aGTM.f.log(') >= 0 && l.indexOf("typeof aGTM.f.log=='function'") < 0);
    expect(unguarded).toEqual([]);
  });

  // Every functional test above runs 'update'. The guard has to hold on 'init'
  // too — that is the path the very first check takes.
  test("the guard also holds on the 'init' path", () => {
    globalThis.Optanon = { GetDomainData: () => domainData({ interaction: 1 }), IsAlertBoxClosed: () => false };
    delete globalThis.OneTrust;
    expect(globalThis.aGTM.f.consent_check('init')).toBe(false);
    globalThis.Optanon.IsAlertBoxClosed = () => true;
    expect(globalThis.aGTM.f.consent_check('init')).toBe(true);
  });

  // ...but a hasResponse that is ALREADY set short-circuits before the guard.
  // Documented rather than "fixed": that short-circuit is load-bearing for the
  // sGTM Client's preset_with_consent path, where a stored earlier decision is
  // handed in deliberately. So the guard is authoritative on 'update', and on
  // 'init' only until something has set hasResponse.
  test("a preset hasResponse short-circuits 'init' before the guard runs", () => {
    globalThis.Optanon = { GetDomainData: () => domainData({}), IsAlertBoxClosed: () => false };
    globalThis.aGTM.d.consent = { hasResponse: true };
    expect(globalThis.aGTM.f.consent_check('init')).toBe(true);
  });

  test("the 'init' short-circuit is intact (load-bearing for preset_with_consent)", () => {
    globalThis.aGTM.d.consent = { hasResponse: true };
    expect(globalThis.aGTM.f.consent_check('init')).toBe(true);
  });

  test('an invalid action is rejected', () => {
    expect(globalThis.aGTM.f.consent_check('nonsense')).toBe(false);
    expect(globalThis.aGTM.f.consent_check()).toBe(false);
  });

  // Quick smoke check only. The AUTHORITATIVE ES5 guard is test/es5_syntax.test.js,
  // which parses every cmp/*.js with acorn --ecma5 and catches what this regex
  // cannot (class, spread, default parameters).
  test('ES5 smoke check — no let/const/arrow/template literal', () => {
    const src = require('fs').readFileSync('./cmp/cc_onetrust_cookiepro.js', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    expect(src).not.toMatch(/\b(let|const)\s/);
    expect(src).not.toMatch(/=>/);
    expect(src).not.toMatch(/`/);
  });
});
