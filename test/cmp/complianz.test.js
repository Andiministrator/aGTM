// test/cmp/complianz.test.js — consent_check for Complianz (WordPress plugin "complianz-gdpr").
//
// The fixtures reproduce the plugin's banner script (cookiebanner/js/complianz.js,
// v7.5.5): everything hangs off cookies with the prefix "cmplz_" —
// cmplz_has_consent(category) reads cmplz_<category>, cmplz_accepted_categories()
// filters the four fixed categories through it, cmplz_get_banner_status() reads
// cmplz_banner-status. The UI flows below replay the plugin's own ORDER of cookie
// writes and events, because the adapter's listener depends on it:
//   accept button:  category cookies → banner status (event) → cmplz_fire_categories
//   deny button:    banner status (event) → category cookies → cmplz_fire_categories
//   manage consent: banner status "show" (event)
//
// Written for three defects found in review:
// - the first draft gated on cmplz_has_consent() WITHOUT a category, which reads
//   the cookie "cmplz_undefined" and is false for every visitor under opt-in;
// - v1.0's listener branched on aGTM.d.init: after a deny GTM is not loaded, so a
//   later accept on the same page went through call_cc → run_cc('init'), hit the
//   hasResponse short-circuit and never loaded GTM;
// - one decision fires two events, which ran the check twice (double consent-store
//   POST, and the deny button's first event read the cookies before they changed).
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resetAGTM } from '../helpers.js';
import { loadCMP } from './harness.js';

const CATS = ['functional', 'preferences', 'statistics', 'marketing'];
const GLOBALS = ['complianz', 'cmplz_get_banner_status', 'cmplz_has_consent',
  'cmplz_accepted_categories', 'cmplz_get_all_service_consents', 'wp_consent_type'];
let jar, listeners, origAdd, origXsend, posts;

// resolved: false simulates GeoIP before the region request has answered —
// complianz.consenttype still holds the inline default, wp_consent_type is unset.
function installComplianz(consenttype, resolved) {
  globalThis.complianz = { consenttype: consenttype || 'optin', categories: { statistics: 'Statistics', marketing: 'Marketing' } };
  if (resolved !== false) globalThis.wp_consent_type = complianz.consenttype;
  globalThis.cmplz_get_banner_status = () => jar['banner-status'] || '';
  globalThis.cmplz_has_consent = (category) => {
    if (category === 'functional') return true;
    const v = jar[category] || '';
    if ((complianz.consenttype === 'optout' || complianz.consenttype === 'other') && v === '') return true;
    return v === 'allow';
  };
  globalThis.cmplz_accepted_categories = () => CATS.filter(c => cmplz_has_consent(c));
  globalThis.cmplz_get_all_service_consents = () => { try { return JSON.parse(jar.consented_services); } catch (e) { return {}; } };
}
function fire(name) { (listeners[name] || []).forEach(fn => fn({ type: name })); }
function setCats(values) { CATS.forEach(c => { if (c !== 'functional') jar[c] = values[c] || 'deny'; }); }
function setStatus(s) { jar['banner-status'] = s; fire('cmplz_banner_status'); }
function acceptButton(values) { setCats(values); setStatus('dismissed'); fire('cmplz_fire_categories'); }
function denyButton() { setStatus('dismissed'); setCats({}); fire('cmplz_fire_categories'); }
function manageConsent() { setStatus('show'); }
const tick = () => new Promise(r => setTimeout(r, 5));

function libSetup(extra) {
  aGTM.d.config = true; aGTM.c.gdl = 'dataLayer'; aGTM.c.gtmPurposes = 'marketing';
  Object.assign(aGTM.c, extra || {});
  globalThis.dataLayer = [];
}

beforeEach(() => {
  jar = {}; listeners = {}; posts = 0;
  origAdd = document.addEventListener;
  document.addEventListener = (n, fn) => { (listeners[n] = listeners[n] || []).push(fn); };
  origXsend = aGTM.f.xsend;
  aGTM.f.xsend = () => { posts++; return {}; }; // never answers — like a request still in flight
  resetAGTM();
  loadCMP('complianz');
});
afterEach(() => {
  document.addEventListener = origAdd;
  aGTM.f.xsend = origXsend;
  if (aGTM.d.timer) { if (aGTM.d.timer.consent_poll) clearInterval(aGTM.d.timer.consent_poll); if (aGTM.d.timer.consent) clearInterval(aGTM.d.timer.consent); }
  GLOBALS.forEach(k => delete globalThis[k]);
});

describe('the draft defect', () => {
  test('cmplz_has_consent() without a category is false even after "accept all"', () => {
    installComplianz();
    acceptButton({ preferences: 'allow', statistics: 'allow', marketing: 'allow' });
    expect(cmplz_has_consent()).toBe(false);
    expect(cmplz_has_consent('marketing')).toBe(true);
    expect(aGTM.f.consent_check('init')).toBe(true); // the adapter does not depend on it
  });
});

describe('cc_complianz consent_check', () => {
  test('returns false without Complianz, without throwing', () => {
    expect(aGTM.f.consent_check('init')).toBe(false);
  });

  test('banner still open, no decision yet: false (keep waiting)', () => {
    installComplianz();
    expect(aGTM.f.consent_check('init')).toBe(false);
    expect(aGTM.d.consent.hasResponse).toBeFalsy();
  });

  test('accept all', () => {
    installComplianz();
    jar.consented_services = JSON.stringify({ youtube: true, vimeo: false });
    acceptButton({ preferences: 'allow', statistics: 'allow', marketing: 'allow' });
    expect(aGTM.f.consent_check('init')).toBe(true);
    expect(aGTM.d.consent.purposes).toBe(',functional,preferences,statistics,marketing,');
    expect(aGTM.d.consent.services).toBe(',youtube,');
    expect(aGTM.d.consent.feedback).toBe('Consent accepted');
    expect(aGTM.l.filter(e => e.id === 'm2').length).toBe(1);
  });

  test('deny all: a decision exists, only functional is granted', () => {
    installComplianz();
    denyButton();
    expect(aGTM.f.consent_check('init')).toBe(true);
    expect(aGTM.d.consent.purposes).toBe(',functional,');
    expect(aGTM.d.consent.services).toBe('');
    expect(aGTM.d.consent.feedback).toBe('Consent declined');
  });

  test('opt-in: banner closed via X (no category cookies) reads as deny', () => {
    installComplianz();
    jar['banner-status'] = 'dismissed';
    expect(aGTM.f.consent_check('init')).toBe(true);
    expect(aGTM.d.consent.purposes).toBe(',functional,');
  });

  test('partially accepted', () => {
    installComplianz();
    acceptButton({ statistics: 'allow' });
    expect(aGTM.f.consent_check('init')).toBe(true);
    expect(aGTM.d.consent.purposes).toBe(',functional,statistics,');
    expect(aGTM.d.consent.feedback).toBe('Consent partially accepted');
  });

  test('opt-out region: no answer required, as Complianz itself treats a missing cookie as consent', () => {
    installComplianz('optout');
    expect(aGTM.f.consent_check('init')).toBe(true);
    expect(aGTM.d.consent.feedback).toBe('No answer required (optout)');
  });

  test('GeoIP not resolved yet: an inline "optout" default does NOT open the gate', () => {
    installComplianz('optout', false);
    expect(aGTM.f.consent_check('init')).toBe(false);
    // region answers: the visitor is in an opt-in region
    complianz.consenttype = 'optin'; globalThis.wp_consent_type = 'optin';
    expect(aGTM.f.consent_check('init')).toBe(false);
    expect(aGTM.d.consent.hasResponse).toBeFalsy();
  });

  test('a non-array from cmplz_accepted_categories is refused, not trusted', () => {
    installComplianz();
    jar['banner-status'] = 'dismissed';
    globalThis.cmplz_accepted_categories = () => 'marketing';
    expect(aGTM.f.consent_check('init')).toBe(false);
  });
});

describe('cc_complianz through the library (real call_cc / run_cc / inject)', () => {
  test('accept via the banner: GTM is injected without waiting for the init poll', async () => {
    libSetup();
    installComplianz();
    expect(aGTM.f.call_cc()).toBe(false); // banner open — what the init poll sees
    acceptButton({ marketing: 'allow' });
    await tick();
    expect(aGTM.d.consent.gtmConsent).toBe(true);
    expect(aGTM.d.init).toBe(true);
  });

  test('deny, then accept on the same page: GTM loads (v1.0 regression)', async () => {
    libSetup();
    installComplianz();
    aGTM.f.call_cc();
    denyButton();
    await tick();
    expect(aGTM.d.consent.gtmConsent).toBe(false);
    expect(aGTM.d.init).toBeFalsy();
    manageConsent();
    await tick();
    expect(aGTM.d.consent.purposes).toBe(',functional,'); // "show" is no decision — state kept
    acceptButton({ marketing: 'allow' });
    await tick();
    expect(aGTM.d.consent.gtmConsent).toBe(true);
    expect(aGTM.d.init).toBe(true);
  });

  test('accept, then revoke via deny: the gate closes again', async () => {
    libSetup();
    installComplianz();
    aGTM.f.call_cc();
    acceptButton({ marketing: 'allow' });
    await tick();
    expect(aGTM.d.consent.gtmConsent).toBe(true);
    manageConsent(); await tick();
    denyButton(); await tick();
    expect(aGTM.d.consent.gtmConsent).toBe(false);
    expect(aGTM.d.consent.purposes).toBe(',functional,');
  });

  test('one decision (two events) runs once: one consent-store POST', async () => {
    libSetup({ consent_store_url: 'https://sgtm.example.com/aGTMconsent', consent_poll_ms: 0 });
    installComplianz();
    aGTM.f.call_cc();
    acceptButton({ marketing: 'allow' });
    await tick();
    expect(posts).toBe(1);
    manageConsent(); await tick();
    denyButton(); await tick();
    expect(posts).toBe(2);
  });

  test('deny button: the run sees the final cookies, not the state before the click', async () => {
    libSetup();
    installComplianz();
    aGTM.f.call_cc();
    acceptButton({ marketing: 'allow' }); await tick();
    const seen = [];
    const cc = aGTM.f.consent_check;
    aGTM.f.consent_check = (a) => { const r = cc(a); seen.push(aGTM.d.consent.purposes); return r; };
    try {
      manageConsent(); await tick();
      seen.length = 0;
      denyButton(); await tick();
      expect(seen).toEqual([',functional,']);
    } finally { aGTM.f.consent_check = cc; }
  });

  test('a first decision via the event starts the consent poll', async () => {
    libSetup({ consent_store_url: 'https://sgtm.example.com/aGTMconsent', consent_poll_ms: 2000 });
    installComplianz();
    aGTM.f.call_cc();
    acceptButton({ marketing: 'allow' });
    await tick();
    expect(aGTM.d.timer.consent_poll).toBeDefined();
  });

  test('preset visitor: the listener is registered on the init short-circuit', () => {
    installComplianz();
    aGTM.d.consent = { hasResponse: true, purposes: ',functional,', services: '' };
    expect(aGTM.f.consent_check('init')).toBe(true);
    expect(listeners.cmplz_fire_categories.length).toBe(1);
  });

  test('the listener is registered once, however often the check runs', () => {
    installComplianz();
    aGTM.f.consent_check('update'); aGTM.f.consent_check('update'); aGTM.f.consent_check('update');
    expect(listeners.cmplz_fire_categories.length).toBe(1);
    expect(listeners.cmplz_banner_status.length).toBe(1);
  });

  test('no listener while Complianz is absent (retried by the next call)', () => {
    aGTM.f.consent_check('init');
    expect(listeners.cmplz_fire_categories).toBeUndefined();
    expect(aGTM.d.cmplzListener).toBeFalsy();
  });
});
