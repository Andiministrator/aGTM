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
 * @type: Shopware 6 Cookie Banner Consent Check
 * @version 1.0
 * @lastupdate 09.09.2025 by Andi Petzoldt <andi@petzoldt.net>
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
  var re = new RegExp("cookie-preference=([^;]+)");
  try {var d=document;var v=re.exec(d[c]);} catch (e) {return false;}
  if (typeof v=='undefined') {var v='';} else {v=(v!=null) ? v[1] : ''; if(typeof v!='string')v=v.toString();} if (!v || v!='1') return false;
  // Get all cookies ending with "-enabled" that are set to "1"
  var consent = [];
  var allCookies = document.cookie.split(";");
  for (var i=0; i<allCookies.length; i++) {
    var parts = allCookies[i].split("=");
    if (parts.length < 2) continue;
    var name = parts[0].replace(/^\s+|\s+$/g, ""); // trim spaces
    var value = parts[1] ? decodeURIComponent(parts[1]) : "";
    if (/-enabled$/.test(name) && value === "1") {
      consent.push(name);
    }
  }
  // Save result
  aGTM.d.consent.services = consent.length ? ',' + consent.join(',') + ',' : '';
  // Set Response
  aGTM.d.consent.feedback = consent.length ? 'Consent accepted' : 'Consent declined';
  aGTM.d.consent.hasResponse = true;
  // Callback and Return
  if (typeof aGTM.f.log=='function') aGTM.f.log('m2', JSON.parse(JSON.stringify(aGTM.d.consent)));
  return true;
};

//[aGTMlib.js Consentcheck]EOF
