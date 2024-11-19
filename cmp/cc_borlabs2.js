//[aGTMlib.js Consentcheck]BOF

// Initialitialize the objects
window.aGTM = window.aGTM || {};
aGTM.d = aGTM.d || { config: false, init: false, fired: false };
aGTM.f = aGTM.f || {};
aGTM.l = aGTM.l || [];

/**
 * Function to check, whether the user consent info/choice exists and for what purposes and vendors
 * @usage use it together with aGTMlib and see the documentation there
 * @type: Borlabs Cookie
 * @version 1.2
 * @lastupdate 04.03.2024 by Hartmut Clas <hartmut@tracking-garden.com> and Andi Petzoldt <andi@tracking-garden.com>
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
  // Check Borlabs instances
  if (typeof BorlabsCookie=='object' && typeof BorlabsCookie.getCookie=='function') { // Borlabs Cookie 2
    if (typeof borlabsCookieConfig!='object' || typeof borlabsCookieConfig.cookies!='object') return false;
    var consent_configured = borlabsCookieConfig.cookies;
    if (typeof BorlabsCookie!='object' || typeof BorlabsCookie.getCookie!='function') return false;
    var tmp = BorlabsCookie.getCookie();
  } else { // Borlabs Cookie 3
    if (typeof borlabsCookieConfig!='object' || typeof borlabsCookieConfig.services!='object') return false;
    var consent_configured = borlabsCookieConfig.services;
    if (typeof BorlabsCookie != 'object') return false; if (typeof BorlabsCookie.Cookie._pluginCookie != 'object') return false;
    var tmp = BorlabsCookie.Cookie._pluginCookie;
    if (typeof tmp.expires!='string' || !tmp.expires) return false;
  }
  if (typeof tmp!='object' || typeof tmp.consents!='object') return false;
  var consent_user = tmp.consents;
  // Get Consent ID
  if (typeof tmp.uid=='string') aGTM.d.consent.consent_id = tmp.uid;
  // Set vars
  var purposes = [];
  var purposes_cfg = [];
  var purposes_ess = 0;
  var services = [];
  var services_cfg = [];
  var services_ess = 0;
  // Get configured Purposes and Services
  for (var c in consent_configured) {
    if (typeof c!='string') continue;
    purposes_cfg.push(c);
    for (var i=0; i<c.length; i++) {
      if (typeof c[i]=='string' && c[i]) services_cfg.push(c[i]);
      //console.log(c[i]);
    }
  }
  // Get user-consented Purposes and Services
  for (var c in consent_user) {
    if (typeof c!='string') continue;
    purposes.push(c);
    if (c=='essential') purposes_ess++;
    var a = consent_user[c];
    for (var i=0; i<a.length; i++) {
      if (typeof a[i]=='string' && a[i]) services.push(a[i]);
      if (c=='essential') services_ess++;
    }
  }
  // Add purposes and services to object
  if (purposes.length>0) aGTM.d.consent.purposes = ',' + purposes.join(',') + ',';
  if (services.length>0) aGTM.d.consent.services = ',' + services.join(',') + ',';
  // Set Response
  var feedback = 'No Services';
  if (services.length>0 && services.length==services_cfg.length) { feedback = 'Consent full accepted'; }
  else if (services.length>0 && services.length==services_ess) { feedback = 'Consent declined'; }
  else if (services.length>0 && services.length<services_cfg.length) { feedback = 'Consent partially accepted'; }
  else if (services.length>0) { feedback = 'Consent given by user'; }
  aGTM.d.consent.feedback = feedback;
  // Set response, run callback and return
  aGTM.d.consent.hasResponse = true;
};

//[aGTMlib.js Consentcheck]EOF