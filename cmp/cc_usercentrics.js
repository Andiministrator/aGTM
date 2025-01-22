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
 * @type: Usercentrics
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
  // Check Usercentrics object and status and get Vendor (Service) Infos
  if (typeof UC_UI != 'object' || typeof UC_UI.getServicesBaseInfo != 'function') return false;
  var ci = UC_UI.getServicesBaseInfo(); if (typeof ci != 'object') return false;
  if (ci.length == 0) { /* aGTM.d.consent.feedback = 'No Services configured in Usercentrics'; aGTM.d.consent.hasResponse = true; */ return false; }
  // Get Purposes and Services
  var purposes = typeof aGTM.c.purposes=='string' ? aGTM.c.purposes : '';
  //purposeIDs = [];
  var purposeCtr = 0;
  var services = aGTM.c.services ? aGTM.c.services.split(',') : [];
  var serviceIDs = [];
  var serviceCtr = 0;
  var serviceEssCtr = 0;
  for (var i=0; i<ci.length; i++) {
    if (typeof ci[i].consent!='object') return false;
    if (typeof ci[i].id!='string') continue;
    var sc = ci[i].consent;
    if (typeof sc.history!='object') return false;
    if (typeof sc.status!='boolean' || sc.history.length==0) return false;
    if (sc.history.length==1 && typeof sc.history[0].action=='string' && sc.history[0].action=='onInitialPageLoad' && !sc.status) return false;
    aGTM.d.consent.nonEU = aGTM.d.consent.nonEU || false;
    if (sc.history.length>0) {
      for (var h=0; h<sc.history.length; h++) {
        if (typeof sc.history[h].action=='string' && typeof sc.history[h].status=='boolean' && sc.history[h].action=='onNonEURegion' && sc.history[h].status) aGTM.d.consent.nonEU = true;
      }
    }
    serviceCtr++;
    if (aGTM.d.consent.nonEU || (typeof ci[i].isEssential=='boolean' && ci[i].isEssential)) serviceEssCtr++;
    if (sc.status) {
      services.push( typeof ci[i].name=='string' ? ci[i].name.replace(',', '') : ci[i].id );
      serviceIDs.push( ci[i].id );
      var p = typeof ci[i].categorySlug=='string' ? ci[i].categorySlug.replace(',', '') : 'Unknown Purpose '+(purposeCtr+1).toString();
      if (purposes.indexOf(','+p+',')<0) {
        purposeCtr++;
        if (!purposes) purposes=',';
        purposes = purposes + p + ',';
      }
    }
  }
  // Add data to object
  aGTM.d.consent.purposes = purposes;
  if (services.length>0) aGTM.d.consent.services = ',' + services.join(',') + ',';
  if (serviceIDs.length>0) aGTM.d.consent.serviceIDs = ',' + serviceIDs.join(',') + ',';
  // Build feedback
  var feedback = 'Consent available';
  if (services.length<=serviceEssCtr) { feedback = 'Consent declined'; }
  else if (services.length==serviceCtr) { feedback = 'Consent full accepted'; }
  else if (serviceCtr>services.length) { feedback = 'Consent partially accepted'; }
  aGTM.d.consent.feedback = feedback;
  // Get Consent ID
  if (typeof UC_UI.getControllerId=='function') aGTM.d.consent.consent_id = UC_UI.getControllerId();
  // Set Response, run Callback and Return
  aGTM.d.consent.hasResponse = true;
  if (typeof aGTM.f.log=='function') aGTM.f.log('m2', JSON.parse(JSON.stringify(aGTM.d.consent)));
  return true;
};

//[aGTMlib.js Consentcheck]EOF