
/**
 * Generates a Stape.io server container URL and returns an object containing the configuration.
 * This function checks if the browser is Safari version 16.4 or higher and retrieves a User ID from various sources,
 * such as cookies, local storage, JavaScript variables, or CSS selectors.
 *
 * @version 1.0
 * @lastupdate 08.11.2024 by Andi Petzoldt <andi@petzoldt.net>
 * @repository https://github.com/Andiministrator/aGTM/
 * @author Andi Petzoldt <andi@petzoldt.net>
 * @documentation see README-aGTM-StapeIO.md or https://github.com/Andiministrator/aGTM/ext/stapeio/README-aGTM-StapeIO.md
 *
 * @param {Object} cfg - Configuration object containing the following properties:
 * @param {string} cfg.cid - GTM Container ID without the "GTM-" prefix.
 * @param {string} [cfg.dl='dataLayer'] - Name of the dataLayer object.
 * @param {string} [cfg.ep=''] - Endpoint URL for Stape.io.
 * @param {string} [cfg.cdn=''] - Subdomain for Stape CDN, if enabled.
 * @param {string} [cfg.sid=''] - Identifier for the custom loader.
 * @param {string} [cfg.usc='stapeUserId'] - Source for the User ID used by the Cookie Keeper.
 * @param {string} [cfg.dlv=''] - Query parameter (&l=) used to specify the dataLayer name.
 * @param {string} [cfg.kid=''] - Value for the CookieKeeper ID.
 *
 * @returns {Object} - The generated configuration object containing:
 * @property {string} gtm_id - The GTM Container ID.
 * @property {boolean} st_uid - Whether the User ID source is 'stapeUserId'.
 * @property {string} ck_src - The User ID source.
 * @property {string} ck_uid - The CookieKeeper ID.
 * @property {string} ck_param - Encoded User ID parameter for the URL.
 * @property {string} dl_name - The name of the dataLayer.
 * @property {string} dl_param - The dataLayer query parameter.
 * @property {string} jsfile - The JavaScript file to load.
 * @property {string} urlpre - The prefix for the URL (either CDN or endpoint).
 * @property {string} url - The complete Stape.io URL.
 */

var agtm_stapeio_cfg = (function( cfg ) {
  "use strict";

  // Initiate Vars
  var dl  = cfg.dl || 'dataLayer',     // DataLayer Name
      cid = cfg.cid,                   // GTM Container-ID (without GTM-)
      ep  = cfg.ep  || '',             // Endpoint URL
      cdn = cfg.cdn || '',             // contains subdomain when Stape CDN is enabled
      sid = cfg.sid || '',             // Custom Loader Identifiery
      usc = cfg.usc || 'stapeUserId',  // User ID Source for Cookie Keeper
      dlv = cfg.dlv || '',             // variable storing query parameter (&l=) with dataLayer name
      kid = cfg.kid || '',             // value of CookieKeeper ID
      obj = {};                        // Empty configuration object for return

  // Some Help Functions
  function getCookie(e) {
    if (!document.cookie) return null;
    for (var t = e, r = 0, n = document.cookie.split(";"); r < n.length; r++) {
      var o = n[r].split("=");
      if (o[0].trim() === t) return o[1];
    }
  }
  function getLocalStorage(e) {
    return localStorage.getItem(e);
  }
  function getWindowVar(e) {
    return window[e];
  }
  function getCssAttr(e,t) {
    e=document.querySelector(e);
    return t ? e==null ? void 0 : e.getAttribute(t)
             : e==null ? void 0 : e.textContent;
  }

  try {
    // Check, whether Safari Version is >= 16.4
    obj.saf = false;
    var nua = navigator.userAgent;
    if (typeof nua=='string' && nua) {
      var testsaf = new RegExp("Version/([0-9._]+)(.*Mobile)?.*Safari.*").exec(nua);
      if (testsaf && testsaf[1] && parseFloat(testsaf[1]) >= 16.4 && usc) obj.saf = true;
    }
    // Check, whether User-ID-Source is 'stapeUserId'
    obj.st_uid = usc === 'stapeUserId';
    // Get User-ID from configured source
    var uid = obj.saf && !obj.st_uid
              ? function(source, keys, fallback) {
                  var sources = {cookie: getCookie, localStorage: getLocalStorage, jsVariable: getWindowVar, cssSelector: getCssAttr};
                  keys = keys || "";
                  keys = Array.isArray(keys) ? keys : [keys];
                  if (source && sources[source]) {
                    for (var method = sources[source], i = 0; i < keys.length; i++) {
                      var key = keys[i];
                      var value = fallback ? method(key, fallback) : method(key);
                      if (value) return value;
                    }
                  } else {
                    console.warn("Invalid UserID source for CookieKeeper", source);
                  }
                }(usc, dlv, kid)
              : null;
    // Check whether Safari and User-ID are available
    obj.saf = obj.saf && (!!uid || obj.st_uid);
  } catch (error) { console.error(error); }

  // Build Return Object
  obj.gtm_id = cid;
  obj.id_param = 'st';
  obj.ck_src = usc;
  obj.ck_uid = kid;
  obj.ck_param = uid ? "&bi=" + encodeURIComponent(uid) : "";
  obj.dl_name = dl;
  obj.dl_param = "dataLayer" === dl ? "" : "&l=" + dl;
  obj.jsfile = obj.saf ? "kp" + sid : sid;
  obj.urlpre = !obj.saf && cdn ? cdn : ep;
  obj.url = obj.urlpre + "/" + obj.jsfile + ".js" // attach the following for the complete URL: "?st=" + cid + obj.dl_param + obj.ck_param;

  // Return URL
  return obj;

})({
  // Stape IO Config Start
   cid: 'PNDZXPFF' // GTM Container-ID (without GTM-)
  ,dl:  'dataLayer' // DataLayer Name
  ,ep:  'https://dt.jansen-versand.de' // Endpoint
  ,cdn: '' // Subdomain (with https://) when Stape CDN is enabled
  ,sid: 'vhmjybfb' // Identifier for the custom loader (optional)
  ,usc: 'stapeUserId' // User ID Source for Cookie Keeper
  ,dlv: '' // variable storing query parameter (&l=) with dataLayer name
  ,kid: '' // value of CookieKeeper ID
  // Stape IO Config End
});

// EOF