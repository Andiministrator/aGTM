//[aGTMlib.js Consentcheck]BOF

// Initialitialize the objects
window.aGTM = window.aGTM || {};
aGTM.d = aGTM.d || { config: false, init: false, fired: false };
aGTM.f = aGTM.f || {};
aGTM.l = aGTM.l || [];

/**
 * Function to check, whether the user consent info/choice exists and for what purposes and vendors
 * @usage use it together with aGTMlib and see the documentation there
 * @type: Usercentrics3
 * @version 1.0
 * @lastupdate 07.08.2024 by Andi Petzoldt <andi@petzoldt.net>
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
  // Check Usercentrics object
  if (typeof __ucCmp != 'object' || typeof __ucCmp.cmpController != 'object' || typeof __ucCmp.cmpController.dps != 'object' || typeof __ucCmp.cmpController.dps.categories != 'object' || typeof __ucCmp.cmpController.dps.services != 'object') return false;
  // Get Purposes
  var cats = __ucCmp.cmpController.dps.categories;
  var purposes = [];
  var purpose_counter = 0;
  for (var category in cats) {
    if (cats.hasOwnProperty(category) && purposes.indexOf(category) === -1) {
      purpose_counter++;
      var state = cats[category].state;
      if (state === "ALL_ACCEPTED" || state === "SOME_ACCEPTED") purposes.push(category);
    }
  }
  // Get Services
  var servs = __ucCmp.cmpController.dps.services;
  var services = [];
  var service_ids = [];
  var service_counter = 0;
  var service_essential_counter = 0;
  for (var serviceId in servs) {
    if (servs.hasOwnProperty(serviceId)) {
      service_counter++;
      var service = servs[serviceId];
      if (service.essential && service_ids.indexOf(serviceId) === -1) service_essential_counter++;
      if (service.consent && service.consent.given) {
        if (services.indexOf(service.name) === -1) services.push(service.name);
        if (service_ids.indexOf(serviceId) === -1) service_ids.push(serviceId);
      }
      if (service.subservices) {
        for (var subserviceId in service.subservices) {
          if (service.subservices.hasOwnProperty(subserviceId)) {
            service_counter++;
            var subservice = service.subservices[subserviceId];
            if (subservice.essential && service_ids.indexOf(subserviceId) === -1) service_essential_counter++;
            if (subservice.consent && subservice.consent.given) {
              services.push(subservice.name);
              service_ids.push(subserviceId);
            }
          }
        }
      }
    }
  }
  // Add data to object
  if (purposes.length>0) aGTM.d.consent.purposes = ',' + purposes.join(',') + ',';
  if (services.length>0) aGTM.d.consent.services = ',' + services.join(',') + ',';
  if (service_ids.length>0) aGTM.d.consent.serviceIDs = ',' + service_ids.join(',') + ',';
  // Build feedback
  var feedback = 'Consent available';
  if (services.length>0 && services.length==service_counter) { feedback = 'Consent full accepted'; }
  else if (services.length>0 && services.length>service_essential_counter) { feedback = 'Consent partially accepted'; }
  else if (services.length>0 && services.length==service_essential_counter) { feedback = 'Consent declined'; }
  else if (services.length==0) { feedback = 'No Consent configured'; }
  aGTM.d.consent.feedback = feedback;
  // Get Consent ID
  aGTM.d.consent.consent_id = '';
  if (typeof __ucCmp.cmpController.consent=='object' && typeof __ucCmp.cmpController.consent.controllerId=='string') aGTM.d.consent.consent_id = __ucCmp.cmpController.consent.controllerId;
  // Store info in window object
  var obj = JSON.parse(JSON.stringify(aGTM.d.consent));
  obj.purposes = purposes;
  obj.purpose_counter = purpose_counter;
  obj.services = services;
  obj.service_ids = service_ids;
  obj.service_counter = service_counter;
  obj.service_essential_counter = service_essential_counter;
  obj.feedback = feedback;
  obj.consent_id = aGTM.d.consent.consent_id;
  window.usercentrics_aData = obj;
  // Set Response, run Callback and Return
  aGTM.d.consent.hasResponse = true;
  if (typeof aGTM.f.log=='function') aGTM.f.log('m2', JSON.parse(JSON.stringify(aGTM.d.consent)));
  return true;
};

//[aGTMlib.js Consentcheck]EOF