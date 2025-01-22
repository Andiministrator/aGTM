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
 * @type: OneTrust CookiePro
 * @version 1.0
 * @lastupdate 13.03.2024 by Andi Petzoldt <andi@petzoldt.net>
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

  // Check CookiePro object and whether consent was given
  if (typeof Optanon!='object' || typeof Optanon.GetDomainData!='function') return false;
  var obj = Optanon.GetDomainData();
  if (typeof obj.ConsentIntegrationData!='object' || typeof obj.ConsentIntegrationData.consentPayload!='object' || typeof obj.ConsentIntegrationData.consentPayload.customPayload!='object' || typeof obj.ConsentIntegrationData.consentPayload.purposes!='object' || typeof obj.ConsentModel!='object' || typeof obj.ConsentModel.Name!='string') return false;
  var cData = obj.ConsentIntegrationData.consentPayload;
  if (typeof cData.customPayload.Interaction!='number') return false;
  aGTM.d.consent.interactions = cData.customPayload.Interaction;
  //if (obj.ConsentModel.Name=='opt-in' && (typeof cData.customPayload.Interaction!='number' || cData.customPayload.Interaction==0)) return false;
  if (typeof cData.dsDataElements!='object' || typeof cData.dsDataElements.Country!='string') return false;

  // Set Consent Model and Consent ID
  aGTM.d.consent.consent_model = obj.ConsentModel.Name;
  if (typeof obj.cctId=='string') aGTM.d.consent.consent_id = obj.cctId;
  if (typeof cData.dsDataElements=='object' && typeof cData.dsDataElements.InteractionType=='string') aGTM.d.consent.interaction_type = cData.dsDataElements.InteractionType;
  if (typeof cData.dsDataElements=='object' && typeof cData.dsDataElements.Country=='string') aGTM.d.consent.country = cData.dsDataElements.Country;

  // Init
  var cats = {};
  var cats_count = 0;
  var cats_essential = {};
  var cats_essential_count = 0;
  var cats_total = 0;

  // Get Purposes/Categories
  var purposes = {};
  for (var i=0; i<cData.purposes.length; i++) { purposes[cData.purposes[i].Id] = cData.purposes[i].TransactionType; }
  for (var i=0; i<obj.Groups.length; i++) {
    if (typeof purposes[obj.Groups[i].PurposeId]=='string') {
      if (purposes[obj.Groups[i].PurposeId]=='NO_CHOICE') {
        cats_essential[obj.Groups[i].OptanonGroupId] = obj.Groups[i].GroupName.replace(/[^\w\d _-]+/g, '');
        cats_essential_count++;
      }
      if (purposes[obj.Groups[i].PurposeId]=='NO_CHOICE' || purposes[obj.Groups[i].PurposeId]=='CONFIRMED') {
        cats[obj.Groups[i].OptanonGroupId] = obj.Groups[i].GroupName.replace(/[^\w\d _-]+/g, '');
        cats_count++;
      }
      cats_total++;
    }
  }

  // Set categories
  var purpose_ids = [];
  var purpose_names = [];
  for (k in cats) {
    purpose_ids.push(k);
    purpose_names.push(cats[k]);
  }
  aGTM.d.consent.purposeIDs = ',' + purpose_ids.join(',') + ',';
  aGTM.d.consent.purposes = ',' + purpose_names.join(',') + ',';

  // Build Feedback
  if (aGTM.d.consent.interaction_type) { aGTM.d.consent.feedback = trConfig.cmp.interaction_type; }
  else if (cats_total==cats_essential_count) { aGTM.d.consent.feedback = 'No OptIn Categories available'; }
  else if (cats_count==cats_total) { aGTM.d.consent.feedback = 'Consent full accepted'; }
  else if (cats_count==cats_essential_count) { aGTM.d.consent.feedback = 'Consent declined'; }
  else if (cats_count<cats_total) { aGTM.d.consent.feedback = 'Consent partially accepted'; }
  else { aGTM.d.consent.feedback = 'Consent given'; }

  // Set Response
  aGTM.d.consent.hasResponse = true;
  // Callback and Return
  if (typeof aGTM.f.log=='function') aGTM.f.log('m2', JSON.parse(JSON.stringify(aGTM.d.consent)));
  return true;
};

//[aGTMlib.js Consentcheck]EOF