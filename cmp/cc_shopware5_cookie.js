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
 * @type: Shopware 5 Cookie Banner Consent Check
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
  // get cookiePreferences cookie
  var match = new RegExp("(^|;\\s*)cookiePreferences=([^;]*)").exec(document.cookie);
  if (!match) return false;
  var raw = decodeURIComponent(match[2]);
  var parsed;
  try {
    parsed = JSON.parse(raw);
  } catch(e) {
    if (typeof aGTM.f.log=='function') aGTM.f.log('e11', {error:"invalid JSON"});
    return false;
  }
  var services = [];
  var purposes = [];
  if (parsed && parsed.groups) {
    for (var groupName in parsed.groups) {
      if (!parsed.groups.hasOwnProperty(groupName)) continue;
      var group = parsed.groups[groupName];
      // Group active?
      if (group && group.active === true) {
        purposes.push(group.name);
        // Check Cookies
        if (group.cookies) {
          for (var cookieName in group.cookies) {
            if (!group.cookies.hasOwnProperty(cookieName)) continue;
            var cookieObj = group.cookies[cookieName];
            if (cookieObj && cookieObj.active === true && typeof cookieObj.name === "string") {
              services.push(cookieObj.name);
            }
          }
        }
      }
    }
  }
  // Save result
  aGTM.d.consent.services = services.length ? ',' + services.join(',') + ',' : '';
  aGTM.d.consent.purposes = purposes.length ? ',' + purposes.join(',') + ',' : '';
  // Set Response
  aGTM.d.consent.feedback = services.length ? 'Consent accepted' : 'Consent declined';
  aGTM.d.consent.hasResponse = true;
  // Callback and Return
  if (typeof aGTM.f.log=='function') aGTM.f.log('m2', JSON.parse(JSON.stringify(aGTM.d.consent)));
  return true;
};

//[aGTMlib.js Consentcheck]EOF
