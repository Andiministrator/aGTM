//[aGTMlib.js Consentcheck]BOF

// Initialitialize the objects
window.aGTM = window.aGTM || {};
aGTM.d = aGTM.d || { config: false, init: false, fired: false };
aGTM.f = aGTM.f || {};
aGTM.l = aGTM.l || [];

/**
 * Function to check, whether the user consent info/choice exists and for what purposes and vendors
 * @usage use it together with aGTMlib and see the documentation there
 * @type: Magento CC Cookie
 * @version 1.0
 * @lastupdate 12.02.2024 by Andi Petzoldt <andi@petzoldt.net>
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
  var re = new RegExp("cc_"+c+"=([^;]+)");
  try {var d=document;var v=re.exec(d[c]);} catch (e) {}
  if (typeof v=='undefined') {var v='';} else {v=(v!=null) ? v[1] : ''; if(typeof v!='string')v=v.toString();} if (!v) return o;
  // Decode cookie content and convert it to object
  try { var cco = JSON.parse(decodeURIComponent(v)); }
  catch (e) { console.log('Error by Consent Check: ' + e.message); return false; }
  // Check Javascript object and attributes
  if (typeof cco != 'object' || typeof cco.categories != 'object' || typeof cco.services != 'object') return false;
  // Get consented purposes and services
  var purposes = [];
  var services = [];
  var essentials = 0;
  for (var i=0; i<cco.categories.length; i++) {
    if (typeof cco.categories[i]!='string' || !cco.categories[i]) continue;
    purposes.push(cco.categories[i]);
  }
  for (k in cco.services) {
    if (typeof k!='string' || typeof cco.services[k]!='object') continue;
    var o = cco.services[k];
    for (var i=0; i<o.length; i++) {
      if (typeof o[i]!='string' || !o[i]) continue;
      services.push(o[i]);
      if (k=='necessary' || k=='essential') essentials++;
    }
  }
  // Build purpose string
  if (purposes.length>0) {
    purposes.sort();
    aGTM.d.consent.purposes = ',' + purposes.join(',') + ',';
  }
  // Build service string
  if (services.length>0) {
    services.sort();
    aGTM.d.consent.services = ',' + services.join(',') + ',';
  }
  // Set Response
  var feedback = 'No Services';
  if (services.length>0 && services.length==essentials) { feedback = 'Consent declined'; }
  else if (services.length>0 && services.length>essentials) { feedback = 'Consent accepted'; }
  aGTM.d.consent.feedback = feedback;
  // Set response, run callback and return
  aGTM.d.consent.hasResponse = true;
  // Callback and Return
  if (typeof aGTM.f.log=='function') aGTM.f.log('m2', JSON.parse(JSON.stringify(aGTM.d.consent)));
  return true;
};

//[aGTMlib.js Consentcheck]EOF