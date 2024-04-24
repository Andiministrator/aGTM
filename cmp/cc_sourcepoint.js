//[aGTMlib.js Consentcheck]BOF

// Initialitialize the objects
window.aGTM = window.aGTM || {};
aGTM.d = aGTM.d || { config: false, init: false, fired: false };
aGTM.f = aGTM.f || {};
aGTM.l = aGTM.l || [];

/**
 * Function to check, whether the user consent info/choice exists and for what purposes and vendors
 * @usage use it together with aGTMlib and see the documentation there
 * @type: Sourcepoint
 * @version 1.2
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
  // get TCF API object
  if (typeof __tcfapi!='function') return false;
  var success=false;
  var data=null;
  var tmp = __tcfapi('getCustomVendorConsents',2,function(d,s){success=s;data=d;});
  //var tmp = __tcfapi('getTCData',2,function(d,s){success=s;data=d;});
  if (typeof success!='boolean' || !success) return false;
  if (typeof data!='object' || !data) return false;
  if (typeof data.newUser!='boolean' || data.newUser) return false;
  if (typeof data.grants!='object' || !data.grants) return false;
  // Set vars
  var purposes = aGTM.c.purposes ? aGTM.c.purposes.split(',') : [];
  var purposeIDs = [];
  var purposeCtr = 0;
  var purposeMap = {
     '64480473796ea90689e58702':'Store and/or access information on a device'
    ,'64480473796ea90689e58722':'Use limited data to select advertising'
    ,'64480473796ea90689e58740':'Create profiles for personalised advertising'
    ,'64480473796ea90689e5875e':'Use profiles to select personalised advertising'
    ,'64480473796ea90689e5877c':'Create profiles to personalise content'
    ,'64480473796ea90689e58782':'Use profiles to select personalised content'
    ,'64480473796ea90689e58788':'Measure advertising performance'
    ,'64480473796ea90689e587a7':'Measure content performance'
    ,'64480473796ea90689e587ac':'Understand audiences through statistics or combinations of data from different sources'
    ,'64480473796ea90689e587ca':'Develop and improve services'
    ,'654b93ba18140306b70499b7':'Use limited data to select content'
    ,'64ff0f9f653e3805a8662e8c':'Functional'
    ,'64ff0f9f653e3805a8662e95':'Data Share'
    ,'64ff0f9f653e3805a8662e9b':'Social Media'
    ,'654b9434a5bdb40569d39098':'Data use for Identification'
    ,'64480473796ea90689e58722':'Use limited data to select advertising'
    ,'64480473796ea90689e58788':'Measure advertising performance'
    ,'64480473796ea90689e587a7':'Measure content performance'
    ,'64480473796ea90689e587ac':'Understand audiences through statistics or combinations of data from different sources'
    ,'64480473796ea90689e587ca':'Develop and improve services'
  }
  var vendors = aGTM.c.vendors ? aGTM.c.vendors.split(',') : [];
  var vendorIDs = [];
  var vendorCtr = 0;
  var vendorMap = {
     '5e7e1298b8e05c4854221be9':'Google Inc.'
    ,'5ee7add94c24944fdb5c5ac6':'Hotjar'
    ,'5e717c8e69966540e4554f05':'Instagram'
    ,'5e839a38b8e05c4e491e738e':'Pinterest Inc.'
    ,'64ad94508c172204ffdb22a4':'plista GmbH'
    ,'5e7ac3fae30e7d1bc1ebf5e8':'YouTube'
    ,'5e542b3a4cd8884eb41b5a72':'Google Analytics'
    ,'63657be8bcb5be04a169758e':'Google Maps'
    ,'5f0f1187b8e05c109c2b8464':'JW Player'
    ,'5e952f6107d9d20c88e7c975':'Google Tag Manager'
    ,'5e7ced57b8e05c5a7d171cda':'Adform A/S'
    ,'62d1372b293cdf1ca87a36f0':'CleverPush GmbH'
    ,'5e98e7f1b8e05c111d01b462':'Criteo SA'
    ,'5ed6aeb2b8e05c2bbe33f4fa':'EASYmedia GmbH'
    ,'5f1aada6b8e05c306c0597d7':'Google Advertising Products'
    ,'5f48d229b8e05c60a307ad97':'Kameleoon SAS'
    ,'5e7ced57b8e05c485246ccde':'Outbrain UK Ltd'
    ,'5ee15bc6b8e05c164c398ae3':'RTB House S.A.'
    ,'5f23e826b8e05c0c0d4fdb8f':'Sourcepoint Technologies Inc. (non-CMP)'
    ,'5e37fc3e56a5e6615502f9c4':'Taboola Europe Limited'
    ,'5efefe25b8e05c109c2b8324':'The Reach Group GmbH'
    ,'5e865b36b8e05c48537f60a7':'The UK Trade Desk Ltd'
    ,'5e716fc09a0b5040d575080f':'Facebook Inc.'
  };
  // Loop grants and get purposes and vendors
  for (k in data.grants) {
    var v = JSON.parse(JSON.stringify(data.grants[k]));
    vendorCtr++;
    var vg = true;
    if (typeof v.purposeGrants=='object') {
      for (p in v.purposeGrants) {
        var exists = false;
        for(var i=0;i<purposeIDs.length;i++){if(purposeIDs[i]===p)exists=true;}
        if (!exists) {
          purposeCtr++;
          if (typeof v.purposeGrants[p]=='boolean' && v.purposeGrants[p]) {
            purposeIDs.push(p);
            purposes.push(typeof purposeMap[p]=='string' ? purposeMap[p] : p);
          } else if (typeof v.purposeGrants[p]=='boolean' && !v.purposeGrants[p]) {
            vg = false;
          }
        }
      }
    }
    if (typeof v.vendorGrant=='boolean' && v.vendorGrant && vg) {
      vendorIDs.push(k);
      vendors.push(typeof vendorMap[k]=='string' ? vendorMap[k] : k);
    }
  }
  // cleanup services array (no comma in vendor string)
  var purposes_clean = purposes.map(function(item) { return item.replace(',', ''); });
  var vendors_clean = vendors.map(function(item) { return item.replace(',', ''); });
  // Put all data in data object
  aGTM.d.consent = aGTM.d.consent || {};
  aGTM.d.consent.purposes = ',' + purposes_clean.join(',') + ',';
  aGTM.d.consent.purposeIDs = ',' + purposeIDs.join(',') + ',';
  aGTM.d.consent.vendors = ',' + vendors_clean.join(',') + ',';
  aGTM.d.consent.vendorIDs = ',' + vendorIDs.join(',') + ',';
  // Build feedback
  aGTM.d.consent.feedback = 'Consent available';
  if (vendors.length<=vendorCtr && purposes.length<=purposeCtr) { aGTM.d.consent.feedback = 'Consent (partially) declined'; }
  else if (vendors.length==vendorCtr && purposes.length==purposeCtr) { aGTM.d.consent.feedback = 'Consent full accepted'; }
  // Set Response
  aGTM.d.consent.hasResponse = true;
  // Callback and Return
  if (typeof aGTM.f.log=='function') aGTM.f.log('m2', JSON.parse(JSON.stringify(aGTM.d.consent)));
  return true;
};

//[aGTMlib.js Consentcheck]EOF