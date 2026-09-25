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
 * @version 1.1
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
 *    the cookie "cmplz_banner-status" = "dismissed" on every banner answer (accept, deny, save,
 *    close). Under the consent types "optout" / "other" no answer is required - Complianz itself
 *    treats a missing category cookie as consent there - so the check does not wait for one.
 *    The consent type is only trusted once Complianz has resolved it: with GeoIP it is fetched
 *    asynchronously and merged in conditionally_show_banner(), which also sets
 *    window.wp_consent_type. Until that global exists the check returns false (keeps waiting),
 *    so a server-side default of "optout" can never open the gate for an opt-in visitor.
 * 2. WHAT is allowed? cmplz_accepted_categories() - "functional" is always included.
 * Complianz reports changes only as DOM events on document (not via dataLayer). The listener is
 * registered as soon as Complianz is present (also on the preset short-circuit), bundles the two
 * events of one decision into a single run on the final state, and branches on whether a decision
 * was already recorded (hasResponse), not on whether GTM is loaded: after a "deny" GTM is not
 * loaded, and a later "accept" on the same page must still run the update path.
 */
aGTM.f.consent_check = function (action) {
  if (typeof action!='string' || (action!='init'&&action!='update')) { if (typeof aGTM.f.log=='function') aGTM.f.log('e10', {action:action}); return false; }
  aGTM.d.consent = aGTM.d.consent || {};
  // Check Complianz instance
  var cmplzReady = typeof complianz=='object' && !!complianz && typeof cmplz_get_banner_status=='function' && typeof cmplz_accepted_categories=='function';
  // Register the decision listener once (before the preset short-circuit, so a preset visitor is covered too)
  if (cmplzReady && !aGTM.d.cmplzListener && typeof document!='undefined' && typeof document.addEventListener=='function' && typeof setTimeout=='function') {
    aGTM.d.cmplzListener = true;
    var onDecision = function () {
      // One decision fires two events, and the deny button sets the banner status before the
      // category cookies - so run once, after the current task, on the final state.
      if (aGTM.d.cmplzPending) return;
      aGTM.d.cmplzPending = true;
      setTimeout(function () {
        aGTM.d.cmplzPending = false;
        if (aGTM.d.consent && aGTM.d.consent.hasResponse) { if (typeof aGTM.f.run_cc=='function') aGTM.f.run_cc('update'); }
        else if (typeof aGTM.f.call_cc=='function' && aGTM.f.call_cc() && typeof aGTM.f.start_consent_poll=='function') aGTM.f.start_consent_poll();
      }, 0);
    };
    document.addEventListener('cmplz_fire_categories', onDecision);
    document.addEventListener('cmplz_banner_status', onDecision);
  }
  // Check whether response was already given
  if (action=='init' && aGTM.d.consent.hasResponse) return true;
  if (!cmplzReady) return false;
  // Consent type not resolved yet (GeoIP request pending): keep waiting
  if (typeof window.wp_consent_type!='string') return false;
  // Question 1: was a decision made?
  var consentType = typeof complianz.consenttype=='string' ? complianz.consenttype : '';
  var noAnswerNeeded = consentType=='optout' || consentType=='other';
  var dismissed = cmplz_get_banner_status()=='dismissed';
  if (!dismissed && !noAnswerNeeded) return false;
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
  if (noAnswerNeeded && !dismissed) { feedback = 'No answer required ('+consentType+')'; }
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
