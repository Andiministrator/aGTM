//[aGTMlib.js Consentcheck]BOF

// Initialitialize the objects
window.aGTM = window.aGTM || {};
aGTM.d = aGTM.d || { config: false, init: false, fired: false };
aGTM.f = aGTM.f || {};
aGTM.l = aGTM.l || [];

/**
 * Function to check, whether the user consent info/choice exists and for what purposes and vendors
 * @usage use it together with aGTMlib and see the documentation there
 * @type: Clickskeks
 * @version 1.0
 * @lastupdate 19.06.2024 by Andi Petzoldt <andi@petzoldt.net>
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
  aGTM.d.consent.req_ctr = aGTM.d.consent.req_ctr || 0;
  aGTM.d.consent.blocked = typeof aGTM.d.consent.blocked=='boolean' ? aGTM.d.consent.blocked : false;
  if (action=='init' && aGTM.d.consent.hasResponse) return true;

  // Check Clickskeks Object and get service object
  if (typeof Clickskeks!='object' || typeof Clickskeks.getCurrentAllowedConfig!='function') return false;
  var purposeObj = Clickskeks.getCurrentAllowedConfig();
  
  // Get Purposes
  var purposes = [];
  var purposeCtr = 0;
  for (var key in purposeObj) {
    if(purposeObj[key]) {
      purposes.push(key);
    }
    purposeCtr++;
  }
  if (!purposeCtr) return false;

  // Set Purposes from object
  aGTM.d.consent.purposes = ',' + purposes.join(',') + ',';
  // Build feedback
  var feedback = 'Consent available';
  if (purposeCtr==0) { feedback = 'Consent declined'; }
  else if (purposeCtr == purposes.length) feedback = 'Consent full accepted';
  else if (purposeCtr > purposes.length) feedback = 'Consent partially accepted';
  aGTM.d.consent.feedback = feedback;
  // Set Response
  aGTM.d.consent.hasResponse = true;
  // Callback and Return
  if (typeof aGTM.f.log=='function') aGTM.f.log('m2', JSON.parse(JSON.stringify(aGTM.d.consent)));
  return true;

};

/**
 * Function to set an Event Listener for consent check
 * @property {function} aGTM.f.consent_event_listener
 * Usage: aGTM.f.consent_event_listener();
 */
//if (typeof aGTM.f.consent_event_listener!='function') aGTM.f.consent_event_listener = function () {
//  var consent = aGTM.f.consent_fct();
//}

//[aGTMlib.js Consentcheck]EOF