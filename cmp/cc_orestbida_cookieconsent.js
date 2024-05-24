//[aGTMlib.js Consentcheck]BOF

/*
 * Find more info to Orestbida Cookie Consent here:
 * https://cookieconsent.orestbida.com/
 *   or
 * https://github.com/orestbida/cookieconsent
 */

// Initialitialize the objects
window.aGTM = window.aGTM || {};
aGTM.d = aGTM.d || { config: false, init: false, fired: false };
aGTM.f = aGTM.f || {};
aGTM.l = aGTM.l || [];

/**
 * Function to check, whether the user consent info/choice exists and for what purposes and vendors
 * @usage use it together with aGTMlib and see the documentation there
 * @type: Orestbida Cookie Consent
 * @version 1.1
 * @lastupdate 14.05.2024 by Hartmut Clas <hartmut@tracking-garden.com>
 * @author Hartmut Clas <hartmut@tracking-garden.com>
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
  // Check Purposes
  var purposes = aGTM.c.purposes ? aGTM.c.purposes.split(',') : [];
  var necessaryAccepted = false;
  // Check CMP object and getconsent function
  if (typeof cc!='object' || typeof cc.getUserPreferences!='function') return false;
  // Get consent object
  var ccObj = cc.getUserPreferences();
  var accept_type = ccObj.accept_type;
  var accepted_categories =  ccObj.accepted_categories;
  var rejected_categories = ccObj.rejected_categories;
  if (typeof accept_type!='string' || typeof accepted_categories!='object' || typeof rejected_categories!='object') return false;
  // Check array length
  var accepted_categories_length = accepted_categories.length;
  var rejected_categories_length = rejected_categories.length;
  var all_categories_length = accepted_categories_length + rejected_categories_length;
  // Get accepted categories
  for (var i=0; i<accepted_categories_length; i++) {
    if (typeof accepted_categories[i]!='string') continue;
    purposes.push(accepted_categories[i]);
  }
  // Transfer to aGTM
  aGTM.d.consent.purposes = purposes.length > 0 ? ',' + purposes.join(',') + ',' : '';
  // Get Feedback
  var feedback = 'Consent available';
  if (all_categories_length==0) { feedback = 'No purposes available'; }
  else if (accepted_categories_length<all_categories_length) { feedback = 'Consent (partially) declined'; }
  else if (accept_type=='all') { feedback = 'Consent full accepted'; }
  aGTM.d.consent.feedback = feedback;
  // Get back to aGTM
  aGTM.d.consent.hasResponse = true;
  if (typeof aGTM.f.log === 'function') aGTM.f.log('m2', JSON.parse(JSON.stringify(aGTM.d.consent)));
  return true;
};

//[aGTMlib.js Consentcheck]EOF