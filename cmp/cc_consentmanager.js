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
 * @type: Consentmanager
 * @version 1.2
 * @lastupdate 23.04.2024 by Andi Petzoldt <andi@petzoldt.net>
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
  aGTM.d.consent.req_ctr = aGTM.d.consent.req_ctr || 0;
  aGTM.d.consent.blocked = typeof aGTM.d.consent.blocked=='boolean' ? aGTM.d.consent.blocked : false;
  if (action=='init' && aGTM.d.consent.hasResponse) return true;
  // Check ConsentManager object and status and get Vendor (Service) Infos
  if (typeof __cmp != 'function') {
    if (aGTM.d.consent.blocked && aGTM.d.consent.hasResponse) return true;
    if (aGTM.d.consent.req_ctr++ == 10) {
      fetch('https://cdn.consentmanager.net/delivery/1x1.gif') // https://cdn.consentmanager.net/delivery/xyz.js
        .catch(function(e) { aGTM.d.consent.blocked = true; aGTM.d.consent.feedback = 'CMP is blocked'; aGTM.d.consent.hasResponse = true; });
    }
    return aGTM.d.consent.blocked;
  }
  var c = __cmp('getCMPData'); if (typeof c!='object') return false;
  if (typeof c.consentExists!='boolean' || !c.consentExists) return false;
  if (typeof c.userChoiceExists!='boolean' || !c.userChoiceExists) return false;
  if (typeof c.purposeConsents!='object' || typeof c.purposesList!='object' || typeof c.purposeLI!='object') return false;
  if (typeof c.vendorConsents!='object' || typeof c.vendorsList!='object' || typeof c.vendorLI!='object') return false;
  // Get Consent Info from CM internal object
  //if (typeof cmpmngr == 'object' && typeof cmpmngr.vendors == 'object') { var cmObjVendors = cmpmngr.vendors; } else { var cmObjVendors = []; }
  // Set counter for approved and declined consent
  var apCtr = 0;
  var dcCtr = 0;
  var allCtr = 0;
  // Get Purposes
  var purposes = [];
  var purposeIDs = [];
  for (var i=0; i<c.purposesList.length; i++) {
    allCtr++;
    if (c.purposeConsents[c.purposesList[i].id] || c.purposeLI[c.purposesList[i].id]) {
      purposeIDs.push(c.purposesList[i].id);
      purposes.push(c.purposesList[i].name);
    } else { dcCtr++; }
    if (c.purposeConsents[c.purposesList[i].id]) { apCtr++; }
  }
  // Get Vendors
  var vendors = [];
  var vendorIDs = [];
  for (var i=0; i<c.vendorsList.length; i++) {
    allCtr++;
    if (c.vendorConsents[c.vendorsList[i].id] || c.vendorLI[c.vendorsList[i].id]) {
      vendorIDs.push(c.vendorsList[i].id);
      vendors.push(c.vendorsList[i].name);
    } else { dcCtr++; }
    if (c.vendorConsents[c.vendorsList[i].id]) { apCtr++; }
  }
  // Set Purposes and Vendors to object
  aGTM.d.consent.purposes = ',' + purposes.join(',') + ',';
  aGTM.d.consent.purposeIDs = ',' + purposeIDs.join(',') + ',';
  aGTM.d.consent.vendors = ',' + vendors.join(',') + ',';
  aGTM.d.consent.vendorIDs = ',' + vendorIDs.join(',') + ',';
  // Build feedback
  var feedback = 'Consent available';
  if (allCtr == apCtr) { feedback = 'Consent full accepted'; }
  else if (allCtr && !apCtr) { feedback = 'Consent declined'; }
  else if (allCtr && apCtr<allCtr) { feedback = 'Consent partially accepted'; }
  aGTM.d.consent.feedback = feedback;
  // Get Consent ID
  if (typeof c.consentstring=='string') aGTM.d.consent.consent_id = c.consentstring;
  // Set Response
  aGTM.d.consent.hasResponse = true;
  // Callback and Return
  if (typeof aGTM.f.log=='function') aGTM.f.log('m2', JSON.parse(JSON.stringify(aGTM.d.consent)));
  return true;
};

/**
 * Function to set an Event Listener for consent check
 * @property {function} aGTM.f.consent_event_listener
 * Usage: aGTM.f.consent_event_listener();
 */
//if (typeof aGTM.f.consent_event_listener!='function') aGTM.f.consent_event_listener = function () {
//  var consent = aGTM.f.consent_fct();
//}

//[aGTMlib.js Consentcheck]EOF