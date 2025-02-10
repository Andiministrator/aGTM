//[aGTMlib.js Consentcheck]BOF

// Initialitialize the objects
window.aGTM = window.aGTM || {};
aGTM.d = aGTM.d || { config: false, init: false, fired: false };
aGTM.f = aGTM.f || {};
aGTM.l = aGTM.l || [];
aGTM.n = aGTM.n || {};

/**
 * Function to check, whether a (Consent) Cookie exists and if there is Consent
 * @usage use it together with aGTMlib and see the documentation there
 * @type: Simple Cookie Regex Check
 * @version 1.0
 * @lastupdate 22.01.2025 by Andi Petzoldt <andi@petzoldt.net>
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
  // Check whether user has already interacted with cookie banner
  var c = 'co'; c = c + 'ok'; c = c + 'ie';
  var cn = "Consent"; // Cookie Name
  var cv = /..+/; // Cookie Value for Consent
  var re = new RegExp(cn + "=([^;]+)");
  try {var d=document;var v=re.exec(d[c]);} catch (e) {}
  if (typeof v=='undefined') {var v='';} else {v=(v!=null) ? v[1] : ''; if(typeof v!='string')v=v.toString();} if (!v) return false;
  // Decode cookie content and check the value
  var consent = typeof v==='string' && v.length > 0 && cv.test(v);
  aGTM.d.consent.purposes = consent ? ',all,' : '';
  aGTM.d.consent.services = consent ? ',all,' : '';
  aGTM.d.consent.vendors  = consent ? ',all,' : '';
  // Set Response
  aGTM.d.consent.feedback = consent ? 'Consent accepted' : 'Consent declined';
  aGTM.d.consent.hasResponse = true;
  // Callback and Return
  if (typeof aGTM.f.log=='function') aGTM.f.log('m2', JSON.parse(JSON.stringify(aGTM.d.consent)));
  return true;
};

//[aGTMlib.js Consentcheck]EOF
