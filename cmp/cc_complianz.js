//[aGTMlib.js Consentcheck]BOF

/*
 * Find more info to Complianz (WordPress plugin "complianz-gdpr") here:
 * https://complianz.io/
 *   or
 * https://github.com/Really-Simple-Plugins/complianz-gdpr
 * Written against the banner script cookiebanner/js/complianz.js of v7.5.5.
 */

// Initialitialize the objects
window.aGTM = window.aGTM || {};
aGTM.d = aGTM.d || { config: false, init: false, fired: false };
aGTM.f = aGTM.f || {};
aGTM.l = aGTM.l || [];
aGTM.n = aGTM.n || {};

/**
 * Function to check, whether the user consent info/choice exists and for what purposes and vendors
 * @usage use it together with aGTMlib and see the documentation there
 * @type: Complianz
 * @version 1.0
 * @lastupdate 25.09.2026 by Andi Petzoldt <andi@petzoldt.net>
 * @author Andi Petzoldt <andi@petzoldt.net>
 * @property {function} aGTM.f.consent_check
 * @param {string} action - the action, what the function should do. can be "init" (for the first consent check) or "update" (for updating existing consent info)
 * @returns {boolean} - true, if consent is available, false if not
 * Usage: aGTM.f.consent_check('init');
 *
 * Two questions, answered separately:
 * 1. WAS a decision made? Complianz has no API for this. cmplz_has_consent() needs a category
 *    ('marketing', 'statistics', ...) - called without one it reads the cookie "cmplz_undefined"
 *    and is always false under opt-in. The decision marker is the banner status: Complianz writes
 *    the cookie "cmplz_banner-status" = "dismissed" on every answer (accept, deny, save, close).
 *    Under opt-out / "other" consent types no answer is required (Complianz itself treats a
 *    missing cookie as consent there), so the check does not wait for one.
 * 2. WHAT is allowed? cmplz_accepted_categories() - "functional" is always included.
 * Complianz reports changes only as DOM events on document (not via dataLayer), so the first call
 * registers a listener that re-runs the check on every decision.
 */
aGTM.f.consent_check = function (action) {
  if (typeof action!='string' || (action!='init'&&action!='update')) { if (typeof aGTM.f.log=='function') aGTM.f.log('e10', {action:action}); return false; }
  // Check whether response was already given
  aGTM.d.consent = aGTM.d.consent || {};
  if (action=='init' && aGTM.d.consent.hasResponse) return true;
  // Check Complianz instance
  if (typeof complianz!='object' || !complianz || typeof cmplz_get_banner_status!='function' || typeof cmplz_accepted_categories!='function') return false;
  // Register the decision listener once
  if (!aGTM.d.cmplzListener && typeof document!='undefined' && typeof document.addEventListener=='function') {
    aGTM.d.cmplzListener = true;
    var onDecision = function () {
      if (!aGTM.d.init) { if (typeof aGTM.f.call_cc=='function') aGTM.f.call_cc(); }
      else if (typeof aGTM.f.run_cc=='function') aGTM.f.run_cc('update');
    };
    document.addEventListener('cmplz_fire_categories', onDecision);
    document.addEventListener('cmplz_banner_status', onDecision);
  }
  // Question 1: was a decision made?
  var consentType = typeof complianz.consenttype=='string' ? complianz.consenttype : '';
  var noAnswerNeeded = consentType=='optout' || consentType=='other';
  if (cmplz_get_banner_status()!='dismissed' && !noAnswerNeeded) return false;
  // Question 2: which categories are allowed?
  var accepted = cmplz_accepted_categories();
  if (typeof accepted!='object' || !accepted || typeof accepted.length!='number') return false;
  var purposes = aGTM.c && aGTM.c.purposes ? aGTM.c.purposes.split(',') : [];
  var acceptedCtr = 0;
  for (var i=0; i<accepted.length; i++) {
    if (typeof accepted[i]!='string' || accepted[i]=='') continue;
    purposes.push(accepted[i]);
    if (accepted[i]!='functional') acceptedCtr++;
  }
  aGTM.d.consent.purposes = purposes.length>0 ? ','+purposes.join(',')+',' : '';
  // Services with an explicit consent (only set when Complianz runs per-service consent)
  var services = [];
  if (typeof cmplz_get_all_service_consents=='function') {
    var sc = cmplz_get_all_service_consents();
    if (typeof sc=='object' && sc) { for (var s in sc) { if (sc.hasOwnProperty(s) && sc[s]===true) services.push(s); } }
  }
  aGTM.d.consent.services = services.length>0 ? ','+services.join(',')+',' : '';
  // Build Feedback - measured against the categories this site actually offers (functional excluded)
  var offeredCtr = 0;
  if (typeof complianz.categories=='object' && complianz.categories) { for (var c in complianz.categories) { if (complianz.categories.hasOwnProperty(c) && c!='functional') offeredCtr++; } }
  var feedback = 'Consent available';
  if (noAnswerNeeded && cmplz_get_banner_status()!='dismissed') { feedback = 'No answer required ('+consentType+')'; }
  else if (acceptedCtr==0) { feedback = 'Consent declined'; }
  else if (offeredCtr>0 && acceptedCtr>=offeredCtr) { feedback = 'Consent accepted'; }
  else if (offeredCtr>0) { feedback = 'Consent partially accepted'; }
  aGTM.d.consent.feedback = feedback;
  // Set Response, run Callback and Return
  aGTM.d.consent.hasResponse = true;
  if (typeof aGTM.f.log=='function') aGTM.f.log('m2', JSON.parse(JSON.stringify(aGTM.d.consent)));
  return true;
};

//[aGTMlib.js Consentcheck]EOF
