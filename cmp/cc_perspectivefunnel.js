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
 * @type: Perspective Funnel Consent Banner
 * @version 1.0
 * @lastupdate 27.02.2025 by Andi Petzoldt <andi@petzoldt.net>
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
  // Check local storage object
  if (typeof localStorage != 'object' || !localStorage) return false;
  // Get Perspective Campaign ID
  if (typeof perspectiveData != 'object' || !perspectiveData || typeof perspectiveData.campaignId != 'string') return false;
  var campaignId = perspectiveData.campaignId;
  // Get Local Storage Consent Object
  var ls_json = localStorage.getItem('perspective.tracking-preferences.'+campaignId);
  if (typeof ls_json!='string' || !ls_json) return false;
  var services_obj = JSON.parse(ls_json);
  // Get Services
  var services = [];
  var services_count = 0;
  for (var key in services_obj) {
    services_count++;
    if (services_obj[key] === true) {
      services.push(key);
    }
  }
  // Sort Service Array and stringify it
  if (services.length>0) {
    services.sort();
  }
  aGTM.d.consent.services = ',' + services.join(',') + ',Google Analytics,LinkedIn Insight Tag,Meta Pixel,';
  // Set Response
  aGTM.d.consent.feedback = 'Consent given by user';
  if (services.length>0 && services.length==services_count) {
    aGTM.d.consent.feedback = 'Consent full accepted';
  } else if (services.length>0 && services.length<services_count) {
    aGTM.d.consent.feedback = 'Consent partially accepted';
  } else if (services.length==0 && services_count>0) {
    aGTM.d.consent.feedback = 'Consent declined';
  }
  // Set response, run callback and return
  aGTM.d.consent.hasResponse = true;
};

//[aGTMlib.js Consentcheck]EOF
