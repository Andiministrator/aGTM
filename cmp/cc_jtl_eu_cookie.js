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
 * @type: EU Cookie for JTL Shop Consent Check
 * @version 1.1
 * @lastupdate 16.07.2026 by Andi Petzoldt <andi@petzoldt.net>
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
  
  // Check EuCookie Object/Cookie and get Purposes and services
  if (typeof EuCookie!='object' || typeof EuCookie.categories!='object' || typeof EuCookie.categories.length!='number' || typeof EuCookie.services!='object' || typeof EuCookie.services.length!='number') return false;
  var match = new RegExp("(^|;\\s*)eu_cookie_store=([^;]*)").exec(document.cookie);
  if (!match) return false;
  //  get purposes
  var purposeIDs = [];
  var purposes = [];
  for (var i = 0; i < EuCookie.categories.length; i++) {
    var cat = EuCookie.categories[i];
    if (cat.consent === true) {
      purposeIDs.push(cat.id);
      // Strip commas from the name — the consent string is comma-delimited (F-51 class)
      var name = cat.name && (cat.name.de || cat.name.en);
      if (typeof name === 'string' && name) purposes.push(name.replace(/,/g, ''));
    }
  }
  // get services
  var serviceIDs = [];
  var services = [];
  for (var i = 0; i < EuCookie.services.length; i++) {
    var service = EuCookie.services[i];
    if (service.consent === true) {
      serviceIDs.push(service.id);
      var name = service.name && (service.name.de || service.name.en);
      if (typeof name === 'string' && name) services.push(name.replace(/,/g, ''));
    }
  }
  // Save result
  aGTM.d.consent.services = services.length ? ',' + services.join(',') + ',' : '';
  aGTM.d.consent.serviceIDs = serviceIDs.length ? ',' + serviceIDs.join(',') + ',' : '';
  aGTM.d.consent.purposes = purposes.length ? ',' + purposes.join(',') + ',' : '';
  aGTM.d.consent.purposeIDs = purposeIDs.length ? ',' + purposeIDs.join(',') + ',' : '';
  // Set Response
  aGTM.d.consent.feedback = services.length ? 'Consent accepted' : 'Consent declined';
  aGTM.d.consent.hasResponse = true;
  // Callback and Return
  if (typeof aGTM.f.log=='function') aGTM.f.log('m2', JSON.parse(JSON.stringify(aGTM.d.consent)));
  return true;
};

//[aGTMlib.js Consentcheck]EOF