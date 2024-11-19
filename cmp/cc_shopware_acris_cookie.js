//[aGTMlib.js Consentcheck]BOF

// Initialitialize the objects
window.aGTM = window.aGTM || {};
aGTM.d = aGTM.d || { config: false, init: false, fired: false };
aGTM.f = aGTM.f || {};
aGTM.l = aGTM.l || [];

/**
 * Function to check, whether the user consent info/choice exists and for what purposes and vendors
 * @usage use it together with aGTMlib and see the documentation there
 * @type: Shopware Acris Cookie
 * @version 1.0
 * @lastupdate 19.06.2024 by Andi Petzoldt <andi@petzoldt.net>
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

  // Check CMP banner interaction
  var re = new RegExp("acris_cookie_acc=([^;]+)");
  try { var doc = document; banner_interaction = re.exec(doc.cookie); } catch (e) {}
  if (typeof banner_interaction == 'undefined') { var banner_interaction = ''; } else { banner_interaction = (banner_interaction != null) ? unescape(banner_interaction[1]) : ''; }
  if (!banner_interaction) return false;
  // Check CMP services
  var re = new RegExp("acris_cookie_first_activated=([^;]+)");
  try { var doc = document; ck_info = re.exec(doc.cookie); } catch (e) {}
  if (typeof ck_info == 'undefined') { var ck_info = ''; } else { ck_info = (ck_info != null) ? decodeURI(ck_info[1]) : ''; }
  if (!ck_info) return false;

  // Get Services
  var services = [];
  var serviceIDs = ck_info.split('|').filter(Boolean);
  if (!serviceIDs.length) return false;
  // Map Services
  var mapping = {
    '11': 'Google Analytics',
    '14': 'Google Adsense',
    '15': 'Google Ads Conversion Tracking',
    '18': 'Awin Affiliate Marketing',
    '49': 'Facebook Pixel',
    '230': 'Criteo Retargeting',
    '287': 'Emarsys',
    '446': 'Bing Ads'
  };
  for (var i=0; i<serviceIDs.length; i++) {
    services.push( mapping[serviceIDs[i]] ? mapping[serviceIDs[i]] : serviceIDs[i] );
  }

  // Set Services from object
  aGTM.d.consent.services = ',' + services.join(',') + ',';
  aGTM.d.consent.serviceIDs = ',' + serviceIDs.join(',') + ',';
  // Build feedback
  aGTM.d.consent.feedback = 'Consent available';
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