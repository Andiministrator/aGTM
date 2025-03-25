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
 * @type: Secure Privacy
 * @version 1.0
 * @lastupdate 25.03.2025 by Andi Petzoldt <andi@petzoldt.net>
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
  // Check Secure Privacy Object, Consent Array and Check Function
  if (typeof sp != 'function' || typeof sp.allGivenConsents != 'object' || !sp.allGivenConsents || typeof sp.checkConsent != 'function') return false;
  // Init vars
  var purposes = [];
  var purposesIDs = [];
  var purposes_count = 0;
  var services = [];
  var servicesIDs = [];
  var services_count = 0;
  // Get Consent Data
  for (var i = 0; i < sp.allGivenConsents.length; i++) {
    var p = sp.allGivenConsents[i];
    if (typeof p!='object' || !p || typeof p.ComplianceTypeID=='undefined' || typeof p.ComplianceType!='string') continue;
    purposes_count++;
    if (p.ConsentGiven) {
      purposes.push(p.ComplianceType);
      purposesIDs.push(String(p.ComplianceTypeID));
    }
    if (typeof p.PluginPreferences!='string') continue;
    try {
      var serv_obj = JSON.parse(p.PluginPreferences);
    } catch (e) {
      var serv_obj = [];
    }
    if (typeof serv_obj!='object' || typeof serv_obj.length!='number' || !serv_obj) continue;
    for (var j = 0; j < serv_obj.length; j++) {
      var s = serv_obj[j];
      if (typeof s!='object' || !s || typeof p.ComplianceTypeID=='undefined' || typeof s.ComplianceType!='string') continue;
      services_count++;
      if (sp.checkConsent(s.ComplianceType)) {
        services.push(s.ComplianceType);
        servicesIDs.push(String(s.ComplianceTypeID));
      }
    }
  }
  // Set Consent to aGTM
  aGTM.d.consent.purposes = ',' + purposes.join(',') + ',';
  aGTM.d.consent.purposesIDs = ',' + purposesIDs.join(',') + ',';
  aGTM.d.consent.services = ',' + services.join(',') + ',';
  aGTM.d.consent.servicesIDs = ',' + servicesIDs.join(',') + ',';
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
