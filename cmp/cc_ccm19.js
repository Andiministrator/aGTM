//[aGTMlib.js Consentcheck]BOF

// Initialitialize the objects
window.aGTM = window.aGTM || {};
aGTM.d = aGTM.d || { config: false, init: false, fired: false };
aGTM.f = aGTM.f || {};
aGTM.l = aGTM.l || [];

/**
 * Function to check, whether the user consent info/choice exists and for what purposes and vendors
 * @usage use it together with aGTMlib and see the documentation there
 * @type: CCM 19
 * @version 1.1
 * @lastupdate 07.01.2024 by Andi Petzoldt <andi@petzoldt.net>
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
  // Check CCM19 instance
  if (typeof CCM!='object' || typeof CCM.consent!='boolean') return false;
  var ccm19 = CCM;
  if (typeof ccm19.acceptedEmbeddings!='object') return false;
  // Check whether user consent is available
  if (!ccm19.consent && ccm19.consentRequired) return false;
  // Get Services Consent data
  var services = [];
  var ccm19Services = ccm19 != null && typeof ccm19.acceptedEmbeddings == 'object' && ccm19.acceptedEmbeddings != null ? ccm19.acceptedEmbeddings : {};
  for(var k = 0; k < ccm19Services.length; k++){
    if (typeof ccm19Services[k].name != 'string' && ccm19Services[k].name != '') continue;
    services.push(ccm19Services[k].name.replace(',',''));
  }
  // Sort Service Array and stringify it
  if (services.length>0) {
    services.sort();
    aGTM.d.consent.services = ',' + services.join(',') + ',';
  }
  // Build feedback
  var feedback = 'Consent available';
  if (typeof ccm19.fullConsentGiven=='boolean' && ccm19.fullConsentGiven===true) { feedback = 'Consent full accepted'; }
  else { feedback = 'Consent (partially or full) declined'; }
  aGTM.d.consent.feedback = feedback;
  // Get Consent ID
  if (typeof ccm19.ucid=='string') aGTM.d.consent.consent_id = ccm19.ucid;
  // Set Response, Callback and Return
  aGTM.d.consent.hasResponse = true;
  if (typeof aGTM.f.log=='function') aGTM.f.log('m2', JSON.parse(JSON.stringify(aGTM.d.consent)));
  return true;
};

//[aGTMlib.js Consentcheck]EOF
