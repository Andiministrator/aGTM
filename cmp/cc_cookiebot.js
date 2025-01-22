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
 * @type: CookieBot
 * @version 1.2
 * @lastupdate 24.03.2024 by Andi Petzoldt <andi@petzoldt.net>
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
  // Check Cookiebot instance
  if (typeof Cookiebot!='object') return false;
  var cb = Cookiebot;
  if (typeof cb.hasResponse!='boolean' || typeof cb.consent!='object') return false;
  if (!cb.hasResponse) return false;
  // Get Purposes and Services
  var purposes = aGTM.c.purposes ? aGTM.c.purposes.split(',') : [];
  var purposeCtr = 0;
  var purposeEssCtr = 0;
  // Check consent purposes
  for(k in cb.consent){
    if (k=='stamp' || k=='method' || typeof cb.consent[k]!='boolean') continue;
    purposeEssCtr++;
    if (cb.consent[k]) {
      purposeCtr++;
      purposes.push(k);
    }
  }
  // Add purposes to object
  aGTM.d.consent.purposes = purposes.length>0 ? ','+purposes.join(',')+',' : '';
  // Build Feedback
  var feedback = 'Consent available';
  if (purposeEssCtr==0) { feedback = 'No purposes available'; }
  else if (purposeCtr<purposeEssCtr) { feedback = 'Consent (partially or full) declined'; }
  else if (purposeCtr>=purposeEssCtr) { feedback = 'Consent accepted'; }
  aGTM.d.consent.feedback = feedback;
  // Get Consent ID
  if (typeof cb.consentID=='string') aGTM.d.consent.consent_id = cb.consentID;
  // Set Response, run Callback and Return
  aGTM.d.consent.hasResponse = true;
  if (typeof aGTM.f.log=='function') aGTM.f.log('m2', JSON.parse(JSON.stringify(aGTM.d.consent)));
  return true;
};

//[aGTMlib.js Consentcheck]EOF