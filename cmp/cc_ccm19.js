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
 * @type: CCM19
 * @version 1.2
 * @lastupdate 01.02.2026 by Andi Petzoldt <andi@petzoldt.net>
 * @author Hartmut Clas <hartmut@tracking-garden.com>
 * @property {function} aGTM.f.consent_check
 * @param {string} action - the action, what the function should do. can be "init" (for the first consent check) or "update" (for updating existing consent info)
 * @returns {boolean} - true, if consent is available, false if not
 * Usage: aGTM.f.consent_check('init');
 */
aGTM.f.consent_check = function (action) {
  if (action !== 'init' && action !== 'update') { if (typeof aGTM.f.log=='function') aGTM.f.log('e10', {action:action}); return false; }
  // Check whether response was already given
  aGTM.d.consent = aGTM.d.consent || {};
  if (action=='init' && aGTM.d.consent.hasResponse) return true;
  // Initiate variables
  var ccm19 = (window.CCM && typeof window.CCM === 'object') ? window.CCM : {};
  var services = [];
  var services_ids = [];
  var cmp_error = false;
  var feedback = '';
  // Check CCM19 instance
  if (ccm19.unavailable===true && typeof ccm19.error=='string') {
    cmp_error = true;
    feedback = 'Consent error: ' + ccm19.error;
  }
  if (!cmp_error && ((ccm19.consentRequired===true && ccm19.consent!==true) || typeof ccm19.acceptedEmbeddings!='object')) {
    return false;
  }
  if (ccm19.acceptedEmbeddings && typeof ccm19.acceptedEmbeddings.length=='number') {
    // Get Services Consent data
    for(var k = 0; k < ccm19.acceptedEmbeddings.length; k++){
      var emb = ccm19.acceptedEmbeddings[k] || null;
      if (!emb || typeof emb.id!=='string' || typeof emb.name!=='string') continue;
      services.push(emb.name.replace(/,/g, ''));
      services_ids.push(emb.id.replace(/,/g, ''));
    }
  }
  // Sort Service Array and stringify it
  if (services.length>0) aGTM.d.consent.services = ',' + services.join(',') + ',';
  if (services_ids.length>0) aGTM.d.consent.serviceIDs = ',' + services_ids.join(',') + ',';
  // Build feedback
  if (!cmp_error && ccm19.fullConsentGiven===true) { feedback = 'Consent full accepted'; }
  else if (!cmp_error) { feedback = 'Consent (partially or full) declined'; }
  aGTM.d.consent.feedback = feedback;
  // Get Consent ID
  if (typeof ccm19.ucid=='string') aGTM.d.consent.consent_id = ccm19.ucid;
  // Set Response, Callback and Return
  aGTM.d.consent.hasResponse = true;
  if (typeof aGTM.f.log=='function') aGTM.f.log('m2', JSON.parse(JSON.stringify(aGTM.d.consent)));
  return true;
};

//[aGTMlib.js Consentcheck]EOF
