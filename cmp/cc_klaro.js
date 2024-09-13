//[aGTMlib.js Consentcheck]BOF

// Initialitialize the objects
window.aGTM = window.aGTM || {};
aGTM.d = aGTM.d || { config: false, init: false, fired: false };
aGTM.f = aGTM.f || {};
aGTM.l = aGTM.l || [];

/**
 * Function to check, whether the user consent info/choice exists and for what purposes and vendors
 * @usage use it together with aGTMlib and see the documentation there
 * @type: Klaro
 * @version 1.1
 * @lastupdate 07.01.2024 by Andi Petzoldt <andi@petzoldt.net>
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
  // Check and get Klaro object
  if (typeof klaro!='object' || typeof klaro.getManager!='function') return false;
  var kl = klaro.getManager();
  // Check, whether consent info is available
  if (typeof kl.confirmed!='boolean' || !kl.confirmed) return false;
  // Check and get purpose and service names and dependencies
  if (typeof kl.config!='object' || typeof kl.config.services!='object') return false;
  var s_p = {};
  var tmp = kl.config.services;
  for (var i=0; i<tmp.length; i++) {
    if (typeof tmp[i].name!='string') continue;
    var p_tmp = [];
    var serv = tmp[i].name;
    if (typeof tmp[i].purposes=='object' && typeof tmp[i].purposes.length=='number' && tmp[i].purposes.length>0) {
      p_tmp = tmp[i].purposes;
      for (var j=0;j<p_tmp.length;j++) {
        var purp = p_tmp[j];
        //console.log('Service '+serv+' | Purpose '+purp, tmp[i].purposes);
        if (typeof s_p[purp]=='object') { s_p[purp].push(serv); } else { s_p[purp] = [serv]; }
      }
    }
  }
  // Check consents object
  if (typeof kl.consents!='object' || !kl.consents) return false;
  // Check purposes consent
  var purposes = aGTM.c.purposes ? aGTM.c.purposes.split(',') : [];
  var purposeCtr = 0;
  for (var p in s_p) {
    purposeCtr++;
    var cons = true;
    for (var i=0; i<s_p[p].length; i++) {
      var s = s_p[p];
      if (typeof kl.consents[s]=='boolean' && !kl.consents[s]) cons = false;
    }
    if (cons) purposes.push(p);
  }
  // Check services consent
  var services = aGTM.c.services ? aGTM.c.services.split(',') : [];
  var serviceCtr = 0;
  for (var s in kl.consents) {
    serviceCtr++;
    if (typeof kl.consents[s]=='boolean' && kl.consents[s]) services.push(s);
  }
  // Add purposes to object
  aGTM.d.consent.purposes = purposes.length>0 ? ','+purposes.join(',')+',' : '';
  // Add purposes to object
  aGTM.d.consent.services = services.length>0 ? ','+services.join(',')+',' : '';
  // Build Feedback
  var feedback = 'Consent available';
  if (serviceCtr==0) { feedback = 'No services available'; }
  else if (services.length==0 && serviceCtr>0) { feedback = 'Consent declined'; }
  else if (services.length==serviceCtr) { feedback = 'Consent full accepted'; }
  else if (services.length>0 && services.length<serviceCtr) { feedback = 'Consent partially accepted'; }
  aGTM.d.consent.feedback = feedback;
  // Get Consent ID
  //if (typeof kl.consentID=='string') aGTM.d.consent.consent_id = cb.consentID;
  // Set Response, run Callback and Return
  aGTM.d.consent.hasResponse = true;
  if (typeof aGTM.f.log=='function') aGTM.f.log('m2', JSON.parse(JSON.stringify(aGTM.d.consent)));
  return true;
};

//[aGTMlib.js Consentcheck]EOF