// Stape IO GTM integration code

/**
 * This is the Stape IO Original Code to inject the GTM Container.
 * The Script was minified, thats why we modified it for a better understanding.
 * Version 1.0
 * Last Update: 08.11.2024 by <andi@tracking-garden.com>
*/

!function() {
  "use strict";

  // Some Help Functions
  function getCookie(e) {
    for(var t=e,r=0,n=document.cookie.split(";"); r<n.length; r++) {
      var o=n[r].split("=");
      if (o[0].trim()===t) return o[1];
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

  // Initiate Vars
  var w   = window, // window object
      d   = document, // document object
      s   = 'script', // Tag Type "script"
      dl  = 'dataLayer', // DataLayer Name
      cid = 'PNDZXPFF', // GTM Container-ID (without GTM-)
      ep  = 'https://dt.jansen-versand.de', // Endpoint
      cdn = '', // contains subdomain when Stape CDN is enabled
      sid = 'vhmjybfb', // Custom Loader Identifiery
      usc = 'stapeUserId', // User ID Source for Cookie Keeper
      dlv = '', // variable storing query parameter (&l=) with dataLayer name
      kid = '', // value of CookieKeeper ID
      saf = false; // Safari 16.4+ && v? true : false

  try {
    // Check, whether Safari Version is >= 16.4
    var saf = false;
    var nua = navigator.userAgent;
    if (typeof nua=='string' && nua) {
      var testsaf = new RegExp("Version/([0-9._]+)(.*Mobile)?.*Safari.*").exec(nua);
      if (testsaf && testsaf.length>1 && typeof testsaf[1]=='string' && 16.4 <= parseFloat(testsaf[1]) && !!usc) saf = true;
    }
    // Check, whether User-ID-Source is 'stapeUserId'
    var stuid = usc === 'stapeUserId';
    // Get User-ID from configured source
    var uid = saf && !stuid
              ? function(source, keys, fallback) {
                  void 0 === keys && (keys = "");
                  var sources = {cookie: getCookie, localStorage: getLocalStorage, jsVariable: getWindowVar, cssSelector: getCssAttr};
                  var keys = Array.isArray(keys) ? keys : [keys];
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
              : undefined;
    // Check whether Safari and User-ID are available
    saf = saf && (!!uid || stuid);
  } catch (error) { console.error(error); }

  // Initiate DataLayer and send gtm.js-Event
  var dlel = (w[dl] = w[dl] || [],
             w[dl].push({"gtm.start": (new Date).getTime(), event: "gtm.js"}),
             d.getElementsByTagName(s)[0]),
      dlp = "dataLayer" === dl ? "" : "&l=" + dl,
      ckp = uid ? "&bi=" + encodeURIComponent(uid) : "",
      el = d.createElement(s),
      jsfile = saf ? "kp" + sid : sid,
      urlpre = !saf && cdn ? cdn : ep;

  // Create new Script-Element and add it to the DOM
  el.async = true;
  el.src = urlpre + "/" + jsfile + ".js?st=" + cid + dlp + ckp;
  if (dlel.parentNode != null) dlel.parentNode.insertBefore(el, dlel);

}();

// EOF