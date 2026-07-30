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
 * @type: PP Consent Manager (PixelPoint)
 * @version 1.0
 * @lastupdate 30.07.2026 by Andi Petzoldt <andi@petzoldt.net>
 * @author Andi Petzoldt <andi@petzoldt.net>
 * @property {function} aGTM.f.consent_check
 * @param {string} action - the action, what the function should do. can be "init" (for the first consent check) or "update" (for updating existing consent info)
 * @returns {boolean} - true, if consent is available, false if not
 * Usage: aGTM.f.consent_check('init');
 *
 * How this CMP stores a decision (verified against pp-consent-manager 1.5.4):
 * - One cookie per granted category: <prefix>category-<name>, e.g.
 *   "ppcm-consent-category-statistics". Services (content blockers) use
 *   <prefix>service-<name>. Declining does not write a cookie, and a revoke
 *   deletes it - so in practice a cookie exists only for a granted item.
 * - The cookie VALUE is "<consentVersion>,<epoch-seconds>", e.g. "1,1785231132".
 *   The CMP only honours a cookie whose first field matches the site's current
 *   consentVersion, and treats a second field of 0 as "not granted". So the mere
 *   presence of the cookie is NOT the same as consent: after the site bumps
 *   consentVersion every stored decision is void and the banner re-appears.
 *   Therefore the verdict per item is delegated to the CMP's own public API
 *   (hasConsentCategory / hasConsentService) - one place for the rule, no second
 *   copy of it here that could drift or fail open.
 * - hasConsentService() intentionally keeps the CMP's own fallback (a service
 *   without its own valid cookie counts as granted when the "media" category is
 *   granted). Mirroring the CMP is the point: aGTM reports the CMP's verdict.
 * - Decision signal: any category/service cookie the API confirms. Every banner
 *   interaction writes at least the always-on essentials category, so this also
 *   covers a full "decline" (essentials only -> hasResponse, but no tracking
 *   purpose). NOTE: the essentials category name comes from the site's banner
 *   template, not from the CMP core (seen as both "essential" and "essentials"),
 *   which is why no category name is hardcoded here.
 * - No CMP object (yet) means no verdict, so the check returns false and aGTM
 *   keeps polling. Fail closed by design - GTM must not load on a guess.
 */
aGTM.f.consent_check = function (action) {
  if (typeof action!='string' || (action!='init'&&action!='update')) { if (typeof aGTM.f.log=='function') aGTM.f.log('e10', {action:action}); return false; }
  // Check whether response was already given
  aGTM.d.consent = aGTM.d.consent || {};
  if (action=='init' && aGTM.d.consent.hasResponse) return true;
  // Check the CMP instance. Both API functions are required - they are the only
  // source of the verdict, so a partially initialised CMP must not be evaluated.
  var ppcm = (typeof window.PPConsentManager=='object' && window.PPConsentManager) ? window.PPConsentManager : null;
  if (!ppcm || typeof ppcm.hasConsentCategory!='function' || typeof ppcm.hasConsentService!='function') return false;
  // Cookie name prefix - taken from the CMP when it exposes it, so a renamed
  // prefix does not silently produce "no consent"; hardcoded default otherwise.
  var prefix = (typeof ppcm._cookiePrefix=='string' && ppcm._cookiePrefix) ? ppcm._cookiePrefix : 'ppcm-consent-';
  var catPrefix = prefix + 'category-';
  var svcPrefix = prefix + 'service-';
  // Read the cookie names. The category/service names are not known upfront (the
  // CMP exposes no list), so they are discovered from the cookie names and then
  // handed back to the CMP for the verdict.
  var c = 'co'; c = c + 'ok'; c = c + 'ie';
  var all = [];
  try { var d = document; all = String(d[c]).split(';'); } catch (e) { return false; }
  var purposes = [];
  var services = [];
  for (var i=0; i<all.length; i++) {
    var name = all[i].split('=')[0].replace(/^\s+|\s+$/g, ''); // trim spaces
    if (!name) continue;
    if (name.indexOf(catPrefix)===0) {
      var cat = name.substring(catPrefix.length);
      if (cat && ppcm.hasConsentCategory(cat)) purposes.push(cat.replace(/,/g, ''));
    } else if (name.indexOf(svcPrefix)===0) {
      var svc = name.substring(svcPrefix.length);
      if (svc && ppcm.hasConsentService(svc)) services.push(svc.replace(/,/g, ''));
    }
  }
  // Nothing the CMP confirms means: banner not answered yet, or the site bumped
  // consentVersion and every stored decision is void. Both are "no response".
  if (purposes.length===0 && services.length===0) return false;
  // Save result
  aGTM.d.consent.purposes = purposes.length>0 ? ',' + purposes.join(',') + ',' : '';
  aGTM.d.consent.services = services.length>0 ? ',' + services.join(',') + ',' : '';
  // Feedback: only the always-on essentials category and no service means the
  // user declined everything optional. Informational only - it never gates GTM.
  aGTM.d.consent.feedback = (purposes.length>1 || services.length>0) ? 'Consent (partially or full) accepted' : 'Consent declined';
  // Set Response
  aGTM.d.consent.hasResponse = true;
  // Callback and Return
  if (typeof aGTM.f.log=='function') aGTM.f.log('m2', JSON.parse(JSON.stringify(aGTM.d.consent)));
  return true;
};

//[aGTMlib.js Consentcheck]EOF
