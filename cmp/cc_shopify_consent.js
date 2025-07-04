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
 * @type: Shopify Consent Banner
 * @version 1.0
 * @lastupdate 19.06.2025 by Andi Petzoldt <andi@petzoldt.net>
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


  // Load Shopify Tracking API
  window.Shopify.loadFeatures([{name:'consent-tracking-api',version:'0.1'}],error=>{if(error){/*Rescue error*/}});
  // Check Consent Object
  if (typeof Shopify != 'object' || typeof Shopify.customerPrivacy != 'object' || typeof Shopify.customerPrivacy.currentVisitorConsent != 'function' || typeof Shopify.customerPrivacy.getTrackingConsent != 'function') return false;
  // Check Banner interaction
  var consent_info = Shopify.customerPrivacy.getTrackingConsent();
  if (typeof consent_info != 'string' || (consent_info != 'yes' && consent_info != 'no')) return false;
  // Get Consent Object
  var consent_obj = Shopify.customerPrivacy.currentVisitorConsent();
  if (!consent_obj.sale_of_data && typeof Shopify.customerPrivacy.saleOfDataAllowed=='function') consent_obj.sale_of_data = Shopify.customerPrivacy.saleOfDataAllowed() ? "yes" : "no";
  // Check whether Banner is active
  var consent_check = true;
  if (typeof Shopify.customerPrivacy.shouldShowBanner == 'function' && !Shopify.customerPrivacy.shouldShowBanner()) consent_check = false;
  // Get Purposes
  var purposes = [];
  var purposes_count = 0;
  for (var key in consent_obj) {
    purposes_count++;
    if (consent_obj[key] === 'yes' || !consent_check) {
      purposes.push(key);
    }
  }
  // Sort Purpose Array and stringify it
  if (purposes.length>0) {
    purposes.sort();
  }
  aGTM.d.consent.purposes = ',essential,' + purposes.join(',') + ',';
  // Get Consent ID
  if (typeof Shopify.customerPrivacy.consentId == 'function') aGTM.d.consent.consent_id = Shopify.customerPrivacy.consentId();
  // Get Region Setting
  if (typeof Shopify.customerPrivacy.getRegion == 'function') aGTM.d.consent.region = Shopify.customerPrivacy.getRegion();
  // Set Response
  aGTM.d.consent.feedback = 'Consent given by user';
  if (purposes.length>0 && purposes.length==purposes_count) {
    aGTM.d.consent.feedback = 'Consent full accepted';
  } else if (purposes.length>0 && purposes.length<purposes_count) {
    aGTM.d.consent.feedback = 'Consent partially accepted';
  } else if (purposes.length==0 && purposes_count>0) {
    aGTM.d.consent.feedback = 'Consent declined';
  }
  // Set response, run callback and return
  aGTM.d.consent.hasResponse = true;
};

//[aGTMlib.js Consentcheck]EOF
