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
