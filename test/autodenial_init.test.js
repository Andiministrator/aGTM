// test/autodenial_init.test.js — the sGTM Client's auto-denial preset asks the
// CMP first (F-249, card #115). The preset (services ",aGTMconsent,", blocked)
// stands in for a returning visitor with NO decision. A decision the CMP holds
// wins at init; only when the CMP gives none within 5 init attempts (the sync
// one in config(), the listener's, then the 500 ms init poll) does it stand.
import { test, expect, beforeEach, afterEach } from 'bun:test';
import { resetAGTM, MockXHR } from './helpers.js';

const STORE = 'https://store.example.com/consent';
const DENIAL = { hasResponse: true, feedback: 'Consent denied by aGTM', services: ',aGTMconsent,', purposes: '', vendors: '', gtmConsent: true, blocked: true };
let loads;
let origLoad;

beforeEach(() => {
  MockXHR.install();
  globalThis.dataLayer = [];
  loads = [];
  origLoad = aGTM.f.gtm_load;
  aGTM.f.gtm_load = function (w, d, i) { loads.push(i); };
});
afterEach(() => {
  aGTM.f.gtm_load = origLoad;
  MockXHR.reset();
  delete aGTM.f.consent_check;
});

// A CMP that holds `services` (or no decision when null), with the init
// short-circuit every adapter has.
const cmp = (services) => function (action) {
  if (action == 'init' && aGTM.d.consent.hasResponse) return true;
  if (services === null) return false;
  aGTM.d.consent.hasResponse = true;
  aGTM.d.consent.services = services;
  return true;
};
const start = (services) => {
  aGTM.f.consent_check = cmp(services);
  resetAGTM({
    consent_store_url: STORE,
    gtmServices: 'svcA',
    gtm: { 'GTM-MAIN': {} },
    session: { uid: 'F$1$t$abc.20261022', sid: 's-1', consent: Object.assign({}, DENIAL) }
  });
};

test('CMP holds a grant: it wins at init, GTM loads with it, the decision is stored', () => {
  start(',svcA,');
  expect(aGTM.d.consent.services).toBe(',svcA,');
  expect(aGTM.d.consent.blocked).toBeUndefined();
  expect(aGTM.d.consent.gtmConsent).toBe(true);
  expect(loads).toEqual(['GTM-MAIN']);
  const posts = MockXHR.instances.filter((x) => x.url === STORE);
  expect(posts.length).toBe(1);
  const body = JSON.parse(posts[0]._body);
  expect((body.e || body).consent.services).toBe(',svcA,');
});

test('CMP holds a denial: the auto-denial does not load GTM for this visitor', () => {
  start(',other,');
  expect(aGTM.d.consent.services).toBe(',other,');
  expect(aGTM.d.consent.gtmConsent).toBe(false);
  expect(loads).toEqual([]);
});

test('CMP without a decision: the auto-denial stands after 5 init attempts', () => {
  start(null);
  // attempt 1 was the sync call in config()
  for (let i = 2; i <= 4; i++) {
    expect(aGTM.f.call_cc()).toBe(false);
    expect(loads).toEqual([]);
  }
  expect(aGTM.f.call_cc()).toBe(true); // attempt 5
  expect(aGTM.d.consent.services).toBe(',aGTMconsent,');
  expect(aGTM.d.consent.blocked).toBe(true);
  expect(aGTM.d.consent.gtmConsent).toBe(true);
  expect(loads).toEqual(['GTM-MAIN']);
});

test('a real stored decision (no sentinel) keeps the init short-circuit', () => {
  aGTM.f.consent_check = cmp(',other,');
  resetAGTM({
    consent_store_url: STORE,
    gtmServices: 'svcA',
    gtm: { 'GTM-MAIN': {} },
    session: { uid: 'C.1.t.1.2', sid: 's-1', consent: { hasResponse: true, services: ',svcA,', purposes: '', vendors: '' } }
  });
  expect(aGTM.d.consent.services).toBe(',svcA,');
  expect(loads).toEqual(['GTM-MAIN']);
});

// Critic round 2026-10-22: the real 500 ms ticks must ask the CMP too, an
// update in the window must not use up the init budget, the standing
// auto-denial is never POSTed, and nothing passes fire()'s gate while waiting.
test('CMP decides on a 500 ms init tick (attempt 3): its decision wins', () => {
  let decided = false;
  aGTM.f.consent_check = function (action) {
    if (action == 'init' && aGTM.d.consent.hasResponse) return true;
    if (!decided) return false;
    aGTM.d.consent.hasResponse = true;
    aGTM.d.consent.services = ',other,';
    return true;
  };
  resetAGTM({
    consent_store_url: STORE,
    gtmServices: 'svcA',
    gtm: { 'GTM-MAIN': {} },
    session: { uid: 'F$1$t$abc.20261022', sid: 's-1', consent: Object.assign({}, DENIAL) }
  });
  const timers = [];
  const origSet = globalThis.setInterval;
  const origClear = globalThis.clearInterval;
  globalThis.setInterval = function (fn, ms) { timers.push({ fn: fn, ms: ms }); return timers.length; };
  globalThis.clearInterval = function () {};
  try {
    aGTM.f.consent_listener();           // attempt 2
    const tick = timers.find((t) => t.ms === 500);
    expect(tick).toBeDefined();
    decided = true;
    tick.fn();                           // attempt 3: the CMP answers (denial)
  } finally {
    globalThis.setInterval = origSet;
    globalThis.clearInterval = origClear;
  }
  expect(aGTM.d.consent.services).toBe(',other,');
  expect(aGTM.d.consent.gtmConsent).toBe(false);
  expect(loads).toEqual([]);
});

test('an update in the waiting window does not use up the init attempts', () => {
  start(null);
  aGTM.f.run_cc('update');
  aGTM.f.run_cc('update');
  aGTM.f.run_cc('update');
  aGTM.f.run_cc('update');
  expect(aGTM.d.adWait).toBe(1);        // only config()'s sync attempt
  expect(aGTM.f.call_cc()).toBe(false);  // attempt 2 still waits
  expect(loads).toEqual([]);
});

test('waiting window: no consent counts, events and _post queue; the standing auto-denial is never POSTed', () => {
  start(null);
  aGTM.f.fire({ event: 'purchase', _post: { url: 'https://post.example.com/x' } });
  expect(globalThis.dataLayer.some((e) => e && e.event === 'purchase')).toBe(false);
  expect(aGTM.d.f.some((e) => e && e.event === 'purchase')).toBe(true);
  expect(MockXHR.instances.filter((x) => x.url === 'https://post.example.com/x').length).toBe(0);
  for (let i = 2; i <= 5; i++) aGTM.f.call_cc();
  expect(aGTM.d.consent.services).toBe(',aGTMconsent,');
  expect(aGTM.d.f.some((e) => e && e.event === 'purchase')).toBe(true); // replayed via hastyEvents
  expect(MockXHR.instances.filter((x) => x.url === STORE).length).toBe(0);
});

// QA 2026-10-22: the "no consent while waiting" rule must apply only to the
// sentinel. If it ever applied to every failing check, a single update-poll
// tick at which the CMP is briefly unavailable would shut the gate on a
// granted page - and inject() never runs again, so events would be lost.
test('a failing update poll on a granted page keeps the gate open', () => {
  let ready = true;
  aGTM.f.consent_check = function (action) {
    if (action == 'init' && aGTM.d.consent.hasResponse) return true;
    if (!ready) return false;
    aGTM.d.consent.hasResponse = true; aGTM.d.consent.services = ',svcA,'; return true;
  };
  resetAGTM({ consent_store_url: STORE, gtmServices: 'svcA', gtm: { 'GTM-MAIN': {} },
    session: { uid: 'C.1.t.1.2', sid: 's-1', consent: { hasResponse: true, services: ',svcA,', purposes: '', vendors: '' } } });
  expect(loads).toEqual(['GTM-MAIN']);
  ready = false;
  aGTM.f.run_cc('update');               // CMP briefly unavailable
  expect(aGTM.d.consent.gtmConsent).toBe(true);
  aGTM.f.fire({ event: 'purchase' });
  expect(globalThis.dataLayer.some((e) => e && e.event === 'purchase')).toBe(true);
});

// F-254: an adapter that throws must not abort config() (the Client's snippet
// calls init() right after it) and must not leave the B2 reset behind.
test('a throwing consent_check counts as no decision: config() survives, the preset is restored', () => {
  aGTM.f.consent_check = function () { throw new TypeError('ci[i] is null'); };
  expect(() => resetAGTM({
    consent_store_url: STORE,
    gtmServices: 'svcA',
    gtm: { 'GTM-MAIN': {} },
    session: { uid: 'F$1$t$abc.20261022', sid: 's-1', consent: Object.assign({}, DENIAL) }
  })).not.toThrow();
  expect(aGTM.d.consent.services).toBe(',aGTMconsent,');
  expect(aGTM.d.consent.hasResponse).toBe(true);
  expect(aGTM.d.consent.gtmConsent).toBe(false);   // waiting: nothing passes fire()
  expect(aGTM.d.adWait).toBe(1);
  expect(aGTM.l.some((x) => x.id === 'e_consent_check' && x.obj.msg === 'ci[i] is null')).toBe(true);
  for (let i = 2; i <= 4; i++) expect(aGTM.f.call_cc()).toBe(false);
  expect(aGTM.f.call_cc()).toBe(true);             // attempt 5: the auto-denial stands
  expect(loads).toEqual(['GTM-MAIN']);
});

test('a throwing consent_check on the update poll restores the granted state', () => {
  let boom = false;
  aGTM.f.consent_check = function (action) {
    if (boom) throw new Error('CMP gone');
    if (action == 'init' && aGTM.d.consent.hasResponse) return true;
    aGTM.d.consent.hasResponse = true; aGTM.d.consent.services = ',svcA,'; return true;
  };
  resetAGTM({ consent_store_url: STORE, gtmServices: 'svcA', gtm: { 'GTM-MAIN': {} },
    session: { uid: 'C.1.t.1.2', sid: 's-1', consent: { hasResponse: true, services: ',svcA,', purposes: '', vendors: '' } } });
  boom = true;
  expect(aGTM.f.run_cc('update')).toBe(false);
  expect(aGTM.d.consent.services).toBe(',svcA,');
  expect(aGTM.d.consent.hasResponse).toBe(true);
  expect(aGTM.d.consent.gtmConsent).toBe(true);
});

// F-255: before the adapter exists, the auto-denial preset must hold the gate
// shut as well — and the 5-attempt window only starts once there is a CMP.
test('no consent_check yet: the auto-denial preset lets nothing through and spends no attempt', () => {
  delete aGTM.f.consent_check;
  resetAGTM({
    consent_store_url: STORE,
    gtmServices: 'svcA',
    gtm: { 'GTM-MAIN': {} },
    session: { uid: 'F$1$t$abc.20261022', sid: 's-1', consent: Object.assign({}, DENIAL) }
  });
  expect(aGTM.d.consent.gtmConsent).toBe(false);
  expect(aGTM.d.adWait).toBe(0);
  aGTM.f.fire({ event: 'purchase', _post: { url: 'https://post.example.com/x' } });
  expect(globalThis.dataLayer.some((e) => e && e.event === 'purchase')).toBe(false);
  expect(aGTM.d.f.some((e) => e && e.event === 'purchase')).toBe(true);
  expect(MockXHR.instances.filter((x) => x.url === 'https://post.example.com/x').length).toBe(0);
  // the adapter arrives late and holds a grant: it wins
  aGTM.f.consent_check = cmp(',svcA,');
  expect(aGTM.f.call_cc()).toBe(true);
  expect(aGTM.d.consent.services).toBe(',svcA,');
  expect(loads).toEqual(['GTM-MAIN']);
});

test('no consent_check and no sentinel: a stored decision is left as it is', () => {
  delete aGTM.f.consent_check;
  resetAGTM({ consent_store_url: STORE, gtmServices: 'svcA', gtm: { 'GTM-MAIN': {} },
    session: { uid: 'C.1.t.1.2', sid: 's-1', consent: { hasResponse: true, services: ',svcA,', purposes: '', vendors: '', gtmConsent: true } } });
  expect(aGTM.d.consent.gtmConsent).toBe(true);
});

// Critic round 2026-10-22 (K2): on 'init' without the sentinel there is no
// reset snapshot. An adapter that writes hasResponse and THEN throws must not
// leave that half-written state behind - the next init would take the
// short-circuit and report a decision nobody made.
test('a throw after a partial write on a plain init leaves no decision behind', () => {
  aGTM.f.consent_check = function () {
    aGTM.d.consent.hasResponse = true;
    aGTM.d.consent.services = ',svcA,';
    throw new Error('late failure');
  };
  resetAGTM({ gtmServices: 'svcA', gtm: { 'GTM-MAIN': {} } });
  expect(aGTM.f.run_cc('init')).toBe(false);
  expect(aGTM.d.consent.hasResponse).toBe(false);
  expect(aGTM.d.consent.services).toBe('');
  expect(aGTM.f.call_cc()).toBe(false);
  expect(loads).toEqual([]);
});

// K8: a persistently throwing adapter on the update poll is logged once per
// page, not once per tick.
test('e_consent_check is logged once per page', () => {
  let n = 0;
  aGTM.f.consent_check = function (action) {
    if (n++ > 0) throw new Error('CMP gone');
    if (action == 'init' && aGTM.d.consent.hasResponse) return true;
    aGTM.d.consent.hasResponse = true; aGTM.d.consent.services = ',svcA,'; return true;
  };
  resetAGTM({ gtmServices: 'svcA', gtm: { 'GTM-MAIN': {} } });
  aGTM.f.run_cc('init');
  for (let i = 0; i < 5; i++) aGTM.f.run_cc('update');
  expect(aGTM.l.filter((x) => x.id === 'e_consent_check').length).toBe(1);
  expect(aGTM.d.consent.services).toBe(',svcA,');
});
