// test/cmp/complianz.test.js — consent_check for Complianz (WordPress plugin "complianz-gdpr").
//
// The fixtures reproduce the semantics of the plugin's banner script
// (cookiebanner/js/complianz.js, v7.5.5): everything hangs off cookies with the
// prefix "cmplz_" — cmplz_has_consent(category) reads cmplz_<category>,
// cmplz_accepted_categories() filters the four fixed categories through it, and
// cmplz_get_banner_status() reads cmplz_banner-status.
//
// Written for one specific defect in the first draft: it gated on
// cmplz_has_consent() WITHOUT a category. That reads the cookie
// "cmplz_undefined", which never exists, so under opt-in the gate was false
// for every visitor, even after "accept all", and GTM never loaded.
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resetAGTM } from '../helpers.js';
import { loadCMP } from './harness.js';

const CATS = ['functional', 'preferences', 'statistics', 'marketing'];
const GLOBALS = ['complianz', 'cmplz_get_banner_status', 'cmplz_has_consent',
  'cmplz_accepted_categories', 'cmplz_get_all_service_consents'];
let jar, listeners, origAdd;

function installComplianz(consenttype) {
  globalThis.complianz = { consenttype: consenttype || 'optin', categories: { statistics: 'Statistics', marketing: 'Marketing' } };
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
// Same order as cmplz_accept_all / deny_all / save-preferences: category
// cookies first, then the banner status, then the events.
function decide(values) {
  CATS.forEach(c => { if (c !== 'functional') jar[c] = values[c] || 'deny'; });
  jar['banner-status'] = 'dismissed';
  fire('cmplz_banner_status'); fire('cmplz_fire_categories');
}
function fire(name) { (listeners[name] || []).forEach(fn => fn({ type: name })); }

beforeEach(() => {
  jar = {}; listeners = {};
  origAdd = document.addEventListener;
  document.addEventListener = (n, fn) => { (listeners[n] = listeners[n] || []).push(fn); };
  resetAGTM();
  loadCMP('complianz');
});
afterEach(() => {
  document.addEventListener = origAdd;
  GLOBALS.forEach(k => delete globalThis[k]);
});

describe('the draft defect', () => {
  test('cmplz_has_consent() without a category is false even after "accept all"', () => {
    installComplianz();
    decide({ preferences: 'allow', statistics: 'allow', marketing: 'allow' });
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
    decide({ preferences: 'allow', statistics: 'allow', marketing: 'allow' });
    expect(aGTM.f.consent_check('init')).toBe(true);
    expect(aGTM.d.consent.purposes).toBe(',functional,preferences,statistics,marketing,');
    expect(aGTM.d.consent.services).toBe(',youtube,');
    expect(aGTM.d.consent.feedback).toBe('Consent accepted');
    expect(aGTM.l.filter(e => e.id === 'm2').length).toBe(1);
  });

  test('deny all: a decision exists, only functional is granted', () => {
    installComplianz();
    decide({});
    expect(aGTM.f.consent_check('init')).toBe(true);
    expect(aGTM.d.consent.purposes).toBe(',functional,');
    expect(aGTM.d.consent.services).toBe('');
    expect(aGTM.d.consent.feedback).toBe('Consent declined');
  });

  test('banner closed via X (no category cookies): treated like deny', () => {
    installComplianz();
    jar['banner-status'] = 'dismissed';
    expect(aGTM.f.consent_check('init')).toBe(true);
    expect(aGTM.d.consent.purposes).toBe(',functional,');
  });

  test('partially accepted', () => {
    installComplianz();
    decide({ statistics: 'allow' });
    expect(aGTM.f.consent_check('init')).toBe(true);
    expect(aGTM.d.consent.purposes).toBe(',functional,statistics,');
    expect(aGTM.d.consent.feedback).toBe('Consent partially accepted');
  });

  test('opt-out region: no answer required, as Complianz itself treats a missing cookie as consent', () => {
    installComplianz('optout');
    expect(aGTM.f.consent_check('init')).toBe(true);
    expect(aGTM.d.consent.feedback).toBe('No answer required (optout)');
  });

  test('a non-array from cmplz_accepted_categories is refused, not trusted', () => {
    installComplianz();
    jar['banner-status'] = 'dismissed';
    globalThis.cmplz_accepted_categories = () => 'marketing';
    expect(aGTM.f.consent_check('init')).toBe(false);
  });
});

describe('cc_complianz through the library', () => {
  test('GTM gate: deny keeps it closed, a later accept opens it', () => {
    aGTM.d.config = true; aGTM.c.gdl = 'dataLayer'; aGTM.c.gtmPurposes = 'marketing';
    globalThis.dataLayer = [];
    installComplianz();
    decide({ statistics: 'allow' });
    expect(aGTM.f.run_cc('init')).toBe(true);
    expect(aGTM.d.consent.gtmConsent).toBe(false);
    decide({ statistics: 'allow', marketing: 'allow' });
    aGTM.f.run_cc('update');
    expect(aGTM.d.consent.gtmConsent).toBe(true);
  });

  test('listener: a decision BEFORE init calls call_cc, after init run_cc("update")', () => {
    installComplianz();
    const calls = [], oc = aGTM.f.call_cc, orun = aGTM.f.run_cc;
    aGTM.f.call_cc = () => { calls.push('call_cc'); return true; };
    aGTM.f.run_cc = (a) => { calls.push('run_cc:' + a); return true; };
    try {
      aGTM.f.consent_check('init'); // registers the listener
      decide({ marketing: 'allow' }); // fires two events
      expect(calls).toEqual(['call_cc', 'call_cc']);
      aGTM.d.init = true; calls.length = 0;
      decide({});
      expect(calls).toEqual(['run_cc:update', 'run_cc:update']);
    } finally { aGTM.f.call_cc = oc; aGTM.f.run_cc = orun; }
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
