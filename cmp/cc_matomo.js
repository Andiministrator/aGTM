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
 * @type: Matomo Consent Banner
 * @version 1.0
 * @lastupdate 19.08.2024 by Andi Petzoldt <andi@petzoldt.net>
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
  // Check local storage and session storage objects
  if (typeof localStorage != 'object' || !localStorage) return false;
  if (typeof sessionStorage != 'object' || !sessionStorage) return false;
  // Get Local Storage Consent Object
  var ls_json = localStorage.getItem('consent');
  if (typeof ls_json!='string' || !ls_json) return false;
  var services_obj = JSON.parse(ls_json);
  if (typeof services_obj!='object' || !services_obj || !services_obj.created || !services_obj.services) return false;
  // Get Session Storage Consent Object
  var ss_json = sessionStorage.getItem('consent-cache');
  if (typeof ss_json!='string' || !ss_json) return false;
  var purposes_obj = JSON.parse(ss_json);
  if (typeof purposes_obj!='object' || !purposes_obj || !purposes_obj.categories) return false;
  // Get Purposes
  var purposes = [];
  var purposes_count = 0;
  var purposes_ids = [];
  var purposes_essential = [];
  for (var i=0; i<purposes_obj.categories.length; i++) {
    var purpose = purposes_obj.categories[i];
    if (typeof purpose!='object' || !purpose || !purpose.name || !purpose.id) continue;
    purposes_count++;
    if (purpose.required) purposes_essential.push(purpose.name);
    if (purpose.checked || purpose.required) {
      purposes.push(purpose.name);
      purposes_ids.push(purpose.id);
    }
  }
  // Get Services
  var services = [];
  var services_count = 0;
  var services_ids = [];
  for (var i=0; i<services_obj.services.length; i++) {
    var service = services_obj.services[i];
    if (typeof service!='object' || !service || !service.name || !service.id) continue;
    services_count++;
    if (service.hasConsent) {
      services.push(service.name);
      services_ids.push(service.id);
    }
  }
  // Sort Purpose Array and stringify it
  if (purposes.length>0) {
    purposes.sort();
    purposes_ids.sort();
    purposes_essential.sort();
  }
  aGTM.d.consent.purposes = ',' + purposes.join(',') + ',';
  aGTM.d.consent.purposes_ids = ',' + purposes_ids.join(',') + ',';
  aGTM.d.consent.purposes_essential = ',' + purposes_essential.join(',') + ',';
  // Sort Service Array and stringify it
  if (services.length>0) {
    services.sort();
    services_ids.sort();
  }
  aGTM.d.consent.services = ',' + services.join(',') + ',';
  aGTM.d.consent.services_ids = ',' + services_ids.join(',') + ',';
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