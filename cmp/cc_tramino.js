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
  if (typeof action != "string" || (action != "init" && action != "update")) {
    if (typeof aGTM.f.log == "function") aGTM.f.log("e10", { action: action });
    return false;
  }
  // Check whether response was already given
  aGTM.d.consent = aGTM.d.consent || {};
  if (action == "init" && aGTM.d.consent.hasResponse) return true;
  // Get Local Storage Consent Object
  if (typeof localStorage != "object" || !localStorage) return false;
  var ls_consent = localStorage.getItem("consentPermission");
  if (typeof ls_consent != "string" || !ls_consent) return false;
  if (ls_consent != "true") return false;
  // Get Purposes
  var purposes = [];
  if (ls_consent == "true") purposes.push("Consent");
  aGTM.d.consent.purposes = "," + purposes.join(",") + ",";
  // Set Response
  aGTM.d.consent.feedback = "Consent accepted";
  // Set response, run callback and return
  aGTM.d.consent.hasResponse = true;
};

//[aGTMlib.js Consentcheck]EOF
