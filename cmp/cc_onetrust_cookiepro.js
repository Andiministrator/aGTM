//[aGTMlib.js Consentcheck]BOF

// Initialitialize the objects
window.aGTM = window.aGTM || {};
aGTM.d = aGTM.d || { config: false, init: false, fired: false };
aGTM.f = aGTM.f || {};
aGTM.l = aGTM.l || [];
aGTM.n = aGTM.n || {};

/**
 * Function to check, whether the user consent info/choice exists and for what purposes and vendors
 * @usage use it together with aGTMlib and see the documentation there
 * @type: OneTrust CookiePro
 * @version 1.2
 * @lastupdate 13.08.2026 by Andi Petzoldt <andi@petzoldt.net>
 * @compatibility aGTM 1.4.x and 1.5.x — this file touches only aGTM.d.consent and the
 *   (typeof-guarded) aGTM.f.log, both of which exist unchanged in either line.
 * @author Andi Petzoldt <andi@petzoldt.net>
 * @property {function} aGTM.f.consent_check
 * @param {string} action - the action, what the function should do. can be "init" (for the first consent check) or "update" (for updating existing consent info)
 * @returns {boolean} - true, if consent is available, false if not
 * Usage: aGTM.f.consent_check('init');
 */
aGTM.f.consent_check = function (action) {

  if (typeof action!='string' || (action!='init'&&action!='update')) { if (typeof aGTM.f.log=='function') aGTM.f.log('e10', {action:action}); return false; }

  // Check whether response was already given
  aGTM.d.consent = aGTM.d.consent || {};
  if (action=='init' && aGTM.d.consent.hasResponse) return true;

  // Check CookiePro object and whether consent was given
  if (typeof Optanon!='object' || typeof Optanon.GetDomainData!='function') return false;
  var obj = Optanon.GetDomainData();
  if (typeof obj.ConsentIntegrationData!='object' || typeof obj.ConsentIntegrationData.consentPayload!='object' || typeof obj.ConsentIntegrationData.consentPayload.customPayload!='object' || typeof obj.ConsentIntegrationData.consentPayload.purposes!='object' || typeof obj.ConsentModel!='object' || typeof obj.ConsentModel.Name!='string') return false;
  var cData = obj.ConsentIntegrationData.consentPayload;
  if (typeof cData.customPayload.Interaction!='number') return false;
  if (typeof cData.dsDataElements!='object' || typeof cData.dsDataElements.Country!='string') return false;
  aGTM.d.consent.interactions = cData.customPayload.Interaction;

  // Has the visitor actually decided yet?
  //
  // This has to be answered before anything below runs, because everything below
  // reports the CURRENT category state — and before a decision that state is
  // "only the non-selectable categories", which is indistinguishable from a
  // deliberate "deny all". Reporting hasResponse for it makes aGTM believe a
  // decision exists and load GTM against a banner nobody has answered
  // (measured live, 2026-08-13: banner open, OptanonAlertBoxClosed unset, GTM
  // injected and a GA4 page_view sent with gcs=G100).
  //
  // `IsAlertBoxClosed()` is OneTrust's own answer to exactly this question and is
  // treated as AUTHORITATIVE in both directions on the 'update' path: false means
  // "still waiting", and the adapter returns false so aGTM keeps polling. On
  // 'init' it only decides until something has set hasResponse — the short-circuit
  // at the top of this function still wins, which is deliberate (the sGTM Client's
  // preset_with_consent path hands in a stored earlier decision on purpose).
  //
  // WHAT IT ACTUALLY MEANS, read out of the shipped SDK rather than assumed:
  // `isAlertBoxClosedAndValid = alertBoxCloseDate() !== null && !reconsentRequired()`,
  // and `alertBoxCloseDate()` is the cookie `OptanonAlertBoxClosed`. So this is
  // "has an answer been recorded", not "is the banner on screen". The cookie is
  // written when the visitor closes the banner or preference centre, in soft
  // opt-in mode, or via the SDK's own SetAlertBoxClosed(). See the note on the
  // no-banner case in cmp/README-cmp.md.
  //
  // Read from OneTrust, else from Optanon. On every SDK build checked (5.11.0,
  // 6.36.0, 202608.1.0) those two are the SAME object — `window.OneTrust =
  // window.Optanon = …` — and both methods are created in one object literal, so
  // an installation that has GetDomainData (checked above) has this one too. The
  // second lookup and the legacy fallback below are therefore insurance against
  // unknown or older builds, NOT a known CookiePro trait: do not read them as
  // "some setups keep the old behaviour", because on those builds the fallback
  // is unreachable.
  //
  // Three details, each of which would otherwise let the original bug back in:
  //  - `typeof != 'undefined'`, NOT `== 'object'`. A CMP global may be a FUNCTION
  //    that also carries methods (cmp/cc_secure_privacy.js has that precedent), and
  //    an `== 'object'` test would silently skip the guard and fall through to the
  //    legacy path — i.e. exactly the state this fix exists to end.
  //  - Only a REAL boolean counts. `!!` would turn any truthy non-boolean (`1`, a
  //    non-empty string) into "decided" — asymmetrically fail-open, because it is
  //    the `true` direction that makes the adapter claim a decision.
  //  - The call is wrapped: a throwing CMP method must not escape consent_check().
  //    run_cc() does not catch, and it is called from aGTM.f.fire(), so a throw
  //    here would abort the event before its dataLayer push — losing the event,
  //    not just the consent check. Same treatment as the CMP call in cmp/cc_ppcm.js.
  var boxClosed = null; // null = no usable answer here → legacy path below
  var otObj = null;
  if (typeof OneTrust!='undefined' && OneTrust && typeof OneTrust.IsAlertBoxClosed=='function') otObj = OneTrust;
  else if (typeof Optanon.IsAlertBoxClosed=='function') otObj = Optanon;
  if (otObj) {
    var boxRaw = null;
    try { boxRaw = otObj.IsAlertBoxClosed(); } catch(e) { boxRaw = null; }
    if (boxRaw===true || boxRaw===false) boxClosed = boxRaw;
  }

  var interaction = false;
  if (boxClosed===true) {
    interaction = true;
  } else if (boxClosed===false) {
    // The visitor has not answered. Nothing below may run.
    return false;
  } else {
    // Legacy path, unchanged. NOTE that `customPayload.Interaction` is NOT a count
    // of user interactions: it was 1 on a live site whose banner had never been
    // answered. It stays here only because it is the sole signal some setups have,
    // and removing it would break them; it is no longer trusted where a better one
    // exists. If GTM loads too early on a deployment that lands in this branch,
    // check `OneTrust.IsAlertBoxClosed()` in the console — if that is a function,
    // this branch should not have been reached.
    if (typeof cData.dsDataElements.InteractionType=='string' && cData.dsDataElements.InteractionType) interaction = true;
    if (obj.ConsentModel.Name=='opt-in' && typeof cData.customPayload.Interaction=='number' && cData.customPayload.Interaction>0) interaction = true;
  }
  if (!interaction) return false;

  // Set Consent Model and Consent ID
  aGTM.d.consent.consent_model = obj.ConsentModel.Name;
  if (typeof obj.cctId=='string') aGTM.d.consent.consent_id = obj.cctId;
  if (typeof cData.dsDataElements=='object' && typeof cData.dsDataElements.InteractionType=='string') aGTM.d.consent.interaction_type = cData.dsDataElements.InteractionType;
  if (typeof cData.dsDataElements=='object' && typeof cData.dsDataElements.Country=='string') aGTM.d.consent.country = cData.dsDataElements.Country;

  // Init
  var cats = {};
  var cats_count = 0;
  var cats_essential = {};
  var cats_essential_count = 0;
  var cats_total = 0;

  // Get Purposes/Categories
  var purposes = {};
  for (var i=0; i<cData.purposes.length; i++) { purposes[cData.purposes[i].Id] = cData.purposes[i].TransactionType; }
  for (var i=0; i<obj.Groups.length; i++) {
    if (typeof purposes[obj.Groups[i].PurposeId]=='string') {
      if (purposes[obj.Groups[i].PurposeId]=='NO_CHOICE') {
        cats_essential[obj.Groups[i].OptanonGroupId] = obj.Groups[i].GroupName.replace(/[^\w\d _-]+/g, '');
        cats_essential_count++;
      }
      if (purposes[obj.Groups[i].PurposeId]=='NO_CHOICE' || purposes[obj.Groups[i].PurposeId]=='CONFIRMED') {
        cats[obj.Groups[i].OptanonGroupId] = obj.Groups[i].GroupName.replace(/[^\w\d _-]+/g, '');
        cats_count++;
      }
      cats_total++;
    }
  }

  // Set categories
  var purpose_ids = [];
  var purpose_names = [];
  for (k in cats) {
    purpose_ids.push(k);
    purpose_names.push(cats[k]);
  }
  aGTM.d.consent.purposeIDs = ',' + purpose_ids.join(',') + ',';
  aGTM.d.consent.purposes = ',' + purpose_names.join(',') + ',';

  // Build Feedback
  if (aGTM.d.consent.interaction_type) { aGTM.d.consent.feedback = aGTM.d.consent.interaction_type; }
  else if (cats_total==cats_essential_count) { aGTM.d.consent.feedback = 'No OptIn Categories available'; }
  else if (cats_count==cats_total) { aGTM.d.consent.feedback = 'Consent full accepted'; }
  else if (cats_count==cats_essential_count) { aGTM.d.consent.feedback = 'Consent declined'; }
  else if (cats_count<cats_total) { aGTM.d.consent.feedback = 'Consent partially accepted'; }
  else { aGTM.d.consent.feedback = 'Consent given'; }

  // Set Response
  aGTM.d.consent.hasResponse = true;
  // Callback and Return
  if (typeof aGTM.f.log=='function') aGTM.f.log('m2', JSON.parse(JSON.stringify(aGTM.d.consent)));
  return true;
};

//[aGTMlib.js Consentcheck]EOF
