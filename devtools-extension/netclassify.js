/**
 * aGTM Inspector — network classification (pure logic).
 *
 * Extracted so it can be unit-tested in Node (test/devtools/netclassify.test.js)
 * AND loaded as a browser global by panel.html. No DOM / chrome APIs here.
 */
(function (root) {
  "use strict";

  function hostOf(u) { try { return new URL(u).host; } catch (e) { return ""; } }

  /**
   * Learn the sGTM/Client scope (host + dirname prefixes) from the /aGTM* requests
   * seen on the wire plus consent_store_url / transport_url from the live config.
   * Returns { "host": { "/prefix/": true, ... }, ... }.
   */
  function sgtmScope(entries, cfg) {
    var scope = {};
    function add(u) {
      if (!u) return;
      try {
        var x = new URL(u);
        var dir = x.pathname.replace(/[^\/]*$/, ""); // dirname incl. trailing slash
        if (!scope[x.host]) scope[x.host] = {};
        scope[x.host][dir] = true;
      } catch (e) { /* ignore */ }
    }
    (entries || []).forEach(function (e) { if (e && /\/aGTM(\.js|consent|sources)(\?|$)/.test(e.url)) add(e.url); });
    if (cfg) { add(cfg.consent_store_url); add(cfg.transport_url); }
    return scope;
  }

  /**
   * True if `url` belongs to the sGTM scope. A host that DIFFERS from the inspected
   * page's host is treated as a dedicated sGTM domain (e.g. sgtm.example.com, incl.
   * root-hosted) → any path counts. A host EQUAL to the page host (reverse-proxy /
   * first-party) requires a non-root shared path prefix, so ordinary first-party
   * traffic isn't swept in. Unknown pageHost falls back to the prefix rule (safe).
   */
  function inSgtmScope(url, scope, pageHost) {
    try {
      var x = new URL(url);
      var byHost = scope[x.host];
      if (!byHost) return false;
      if (pageHost && x.host !== pageHost) return true; // dedicated sGTM host → any path
      for (var pre in byHost) {
        if (!Object.prototype.hasOwnProperty.call(byHost, pre)) continue;
        if (pre && pre !== "/" && x.pathname.indexOf(pre) === 0) return true;
      }
      return false;
    } catch (e) { return false; }
  }

  function classify(url, scope, pageHost) {
    if (/\/aGTMconsent(\b|\/|\?|$)/.test(url)) return { key: "consent-store", cls: "acc" };
    if (/\/aGTMsources(\b|\/|\?|$)/.test(url)) return { key: "sources", cls: "acc" };
    if (/\/aGTM\.js(\?|$)/.test(url)) return { key: "aGTM.js", cls: "acc" };
    if (/\/tp\/sources(\b|\/|\?|$)/.test(url)) return { key: "sources-api", cls: "acc" };
    if (/googletagmanager\.com\/gtm\.js|\/gtm\.js(\?|$)/.test(url)) return { key: "gtm.js", cls: "ok" };
    if (/googletagmanager\.com\/gtag\/js|\/gtag\/js(\?|$)/.test(url)) return { key: "gtag.js", cls: "ok" };
    if (/google-analytics\.com|\/g\/collect|\/mp\/collect|\/collect(\?|$)/.test(url)) return { key: "ga-collect", cls: "warn" };
    // Within the learned sGTM scope, sub-classify: the aEvents endpoint (…/ae), the sGTM
    // first-party service-worker bootstrap (/_/service_worker/…, reverse-proxied by the
    // customer), and everything else as generic sGTM traffic.
    if (inSgtmScope(url, scope, pageHost)) {
      if (/\/_\/service_worker\//.test(url)) return { key: "sGTM SW", cls: "ok" };
      if (/\/ae(vents)?(\?|$)/.test(url)) return { key: "aEvents", cls: "acc" };
      return { key: "sGTM", cls: "acc" };
    }
    return null;
  }

  var api = { hostOf: hostOf, sgtmScope: sgtmScope, inSgtmScope: inSgtmScope, classify: classify };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.aGTMInspectorNet = api;
})(typeof window !== "undefined" ? window : this);
